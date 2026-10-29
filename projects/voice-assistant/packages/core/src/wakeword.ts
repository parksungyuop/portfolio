// openWakeWord 파이프라인을 onnxruntime 으로 돌린다 (명세 §5).
// 1280샘플(80ms) → melspectrogram.onnx → (x/10 + 2) → 76프레임 창(스트라이드 8)마다 embedding_model.onnx → 최근 16개 임베딩 → hey_jarvis.onnx 점수.
// onnxruntime 은 주입받는다: Node(onnxruntime-node) 와 렌더러(onnxruntime-web) 둘 다 같은 클래스를 쓴다.

export interface OrtLike {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown
}
export interface SessionLike {
  inputNames: readonly string[]
  outputNames: readonly string[]
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown; dims: readonly number[] }>>
}

export const FRAME_SAMPLES = 1280 // 80ms @ 16kHz
const MEL_WINDOW = 76
const MEL_STRIDE = 8
const EMB_WINDOW = 16

/** 16kHz mono PCM16 WAV → float32 [-1, 1]. 다른 포맷은 거부한다 (픽스처 규약). */
export function wavToFloat32(buf: Buffer): { sampleRate: number; samples: Float32Array } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file')
  let off = 12
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null
  let data: { off: number; len: number } | null = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const len = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) }
    if (id === 'data') { data = { off: off + 8, len }; break }
    off += 8 + len + (len % 2)
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk')
  if (fmt.bits !== 16 || fmt.channels !== 1) throw new Error('need 16-bit mono PCM')
  const n = Math.floor(data.len / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(data.off + i * 2) / 32768
  return { sampleRate: fmt.sampleRate, samples: out }
}

export function frames80ms(s: Float32Array): Float32Array[] {
  const r: Float32Array[] = []
  for (let i = 0; i + FRAME_SAMPLES <= s.length; i += FRAME_SAMPLES) r.push(s.subarray(i, i + FRAME_SAMPLES))
  return r
}

export class WakeWordDetector {
  private mel: number[][] = []
  private emb: number[][] = []
  /** 직전 조각의 꼬리 480샘플(30ms). openWakeWord 와 같이 1280+480 로 mel 을 계산해야 80ms 당 8프레임이 나온다 (1280 만으로는 5프레임 → 시간 압축). */
  private tail = new Float32Array(480)

  constructor(
    private readonly ort: OrtLike,
    private readonly m: { mel: SessionLike; emb: SessionLike; cls: SessionLike },
  ) {}

  reset(): void {
    this.mel = []
    this.emb = []
    this.tail = new Float32Array(480)
  }

  /** 80ms 프레임 하나를 넣고 현재 점수(0~1)를 돌려준다. 임베딩이 16개 모이기 전에는 0. */
  async pushPcm16k(frame: Float32Array): Promise<number> {
    if (frame.length !== FRAME_SAMPLES) throw new Error(`frame must be ${FRAME_SAMPLES} samples`)
    // openWakeWord 의 mel 모델은 int16 눈금(±32768)의 float 를 받는다. 입력은 [-1,1] 이므로 여기서 되돌린다.
    const scaled = new Float32Array(this.tail.length + frame.length)
    for (let i = 0; i < this.tail.length; i++) scaled[i] = this.tail[i]! * 32768
    for (let i = 0; i < frame.length; i++) scaled[this.tail.length + i] = frame[i]! * 32768
    this.tail = frame.slice(frame.length - 480)
    const melOut = await this.m.mel.run({ [this.m.mel.inputNames[0]!]: new this.ort.Tensor('float32', scaled, [1, scaled.length]) })
    const t = melOut[this.m.mel.outputNames[0]!]!
    const d = t.data as Float32Array
    const bins = t.dims[t.dims.length - 1]!
    const frames = d.length / bins
    // 마지막 8프레임(=80ms)만 쓴다
    for (let f = Math.max(0, frames - MEL_STRIDE); f < frames; f++) this.mel.push(Array.from(d.subarray(f * bins, (f + 1) * bins), (v) => v / 10 + 2))

    while (this.mel.length >= MEL_WINDOW) {
      const win = this.mel.slice(0, MEL_WINDOW)
      this.mel.splice(0, MEL_STRIDE)
      const e = await this.m.emb.run({ [this.m.emb.inputNames[0]!]: new this.ort.Tensor('float32', Float32Array.from(win.flat()), [1, MEL_WINDOW, 32, 1]) })
      this.emb.push(Array.from(e[this.m.emb.outputNames[0]!]!.data as Float32Array))
      if (this.emb.length > EMB_WINDOW) this.emb.shift()
    }
    if (this.emb.length < EMB_WINDOW) return 0
    const s = await this.m.cls.run({ [this.m.cls.inputNames[0]!]: new this.ort.Tensor('float32', Float32Array.from(this.emb.flat()), [1, EMB_WINDOW, 96]) })
    return (s[this.m.cls.outputNames[0]!]!.data as Float32Array)[0]!
  }
}

/** 점수 열에서 감지 횟수를 센다. 임계 초과가 연속되면 한 번으로 친다 (오탐 카운트 규약). */
export function countDetections(scores: readonly number[], threshold = 0.5): number {
  let n = 0
  let above = false
  for (const s of scores) {
    if (s >= threshold && !above) n++
    above = s >= threshold
  }
  return n
}
