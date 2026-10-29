// 호출어: 귀가 흘려보내는 16kHz PCM 을 1280샘플(80ms)로 묶어 openWakeWord 에 넣는다. 어느 상태에서든 돈다.
// 감지 뒤 2초는 다시 울리지 않는다(같은 발화 중복). 모델은 models/ (SHA256SUMS 로 고정).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { FRAME_SAMPLES, WakeWordDetector } from '@jarvis/core'

export class WakeListener {
  private det: WakeWordDetector | null = null
  private buf = new Float32Array(FRAME_SAMPLES)
  private fill = 0
  private lastFire = 0
  private busy = false
  private pending: Float32Array[] = []
  private peak = 0
  private lastReport = Date.now()
  /** 계기용: 최근 프레임 RMS 와 최근 점수 */
  rms = 0
  score = 0
  frames = 0
  constructor(private readonly modelsDir: string, public threshold: number, private readonly onWake: (score: number) => void, private readonly log: (s: string) => void) {}

  async load(): Promise<boolean> {
    const f = (n: string) => path.join(this.modelsDir, n)
    if (!['melspectrogram.onnx', 'embedding_model.onnx', 'hey_jarvis_v0.1.onnx'].every((n) => existsSync(f(n)))) { this.log('호출어 모델 없음 → ⌥Space 만'); return false }
    const ort = await import('onnxruntime-node')
    const [mel, emb, cls] = await Promise.all([f('melspectrogram.onnx'), f('embedding_model.onnx'), f('hey_jarvis_v0.1.onnx')].map((p) => ort.InferenceSession.create(p, { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: 'sequential', graphOptimizationLevel: 'all' })))
    this.det = new WakeWordDetector(ort as never, { mel, emb, cls } as never)
    this.log('호출어 감지 준비')
    return true
  }

  /** base64 s16 PCM(16kHz) 을 받는다. */
  feedB64(b64: string): void {
    if (!this.det) return
    const b = Buffer.from(b64, 'base64')
    const n = b.length >> 1
    let sq = 0
    for (let i = 0; i < n; i++) {
      const v = b.readInt16LE(i * 2) / 32768
      sq += v * v
      this.buf[this.fill++] = v
      if (this.fill === FRAME_SAMPLES) { this.pending.push(this.buf); this.buf = new Float32Array(FRAME_SAMPLES); this.fill = 0 }
    }
    if (n) this.rms = Math.sqrt(sq / n)
    void this.pump()
  }
  private async pump(): Promise<void> {
    if (this.busy || !this.det) return
    this.busy = true
    try {
      while (this.pending.length) {
        if (this.pending.length > 25) this.pending.splice(0, this.pending.length - 25) // 밀리면 오래된 프레임을 버린다 (2초)
        const s = await this.det.pushPcm16k(this.pending.shift()!)
        this.frames++
        this.score = s
        if (s > this.peak) this.peak = s
        if (process.env.JARVIS_WAKE_DEBUG && Date.now() - this.lastReport > 2000) { this.log(`wake peak ${this.peak.toExponential(2)} rms ${this.rms.toFixed(3)} frames ${this.frames}`); this.peak = 0; this.lastReport = Date.now() }
        if (s >= this.threshold && Date.now() - this.lastFire > 2000) { this.lastFire = Date.now(); this.det.reset(); this.onWake(s) }
      }
    } finally { this.busy = false }
  }
}
