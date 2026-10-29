// 키 없이 쓰는 로컬 목소리: Supertonic 2 (한국어 지원, ONNX). ElevenLabs 키가 없거나 실패하면 Mouth 가 여기로 온다.
// 모델·음색 파일은 cacheDir 에 한 번만 받는다. 합성 결과(WAV)는 메모리로만 돌려준다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const REPO = 'onnx-community/Supertonic-TTS-2-ONNX'
type Tts = (text: string, opts: object) => Promise<{ toBlob(): Blob }>
export interface LocalTtsOpts { cacheDir: string; voice: () => string; speed: () => number; log: (s: string) => void }

export class LocalTts {
  private tts: Promise<Tts> | null = null
  private voices = new Map<string, Float32Array>()
  constructor(private readonly o: LocalTtsOpts) {}

  /** 기동 때 미리 불러 첫 대답 지연을 숨긴다 */
  warm(): void {
    this.tts ??= this.load()
    this.tts.then(() => this.o.log('로컬 목소리 준비'), (e) => { this.tts = null; this.o.log(`로컬 목소리 로드 실패: ${String((e as Error).message).slice(0, 200)}`) })
  }
  private async load(): Promise<Tts> {
    const tf = (await import('@huggingface/transformers')) as unknown as { env: { cacheDir: string }; pipeline: (task: string, model: string) => Promise<Tts> }
    tf.env.cacheDir = this.o.cacheDir
    return tf.pipeline('text-to-speech', REPO)
  }
  private async voice(name: string): Promise<Float32Array> {
    const hit = this.voices.get(name); if (hit) return hit
    const f = path.join(this.o.cacheDir, `supertonic-${name}.bin`)
    if (!existsSync(f)) {
      const r = await fetch(`https://huggingface.co/${REPO}/resolve/main/voices/${name}.bin`)
      if (!r.ok) throw new Error(`음색 ${name}: HTTP ${r.status}`)
      mkdirSync(this.o.cacheDir, { recursive: true })
      writeFileSync(f, Buffer.from(await r.arrayBuffer()))
    }
    const b = readFileSync(f)
    const v = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
    this.voices.set(name, v)
    return v
  }

  /** 한 문장 → WAV. 실패면 null (그러면 Mouth 가 OS 기본 음성으로 내려간다). */
  async synth(text: string): Promise<Buffer | null> {
    try {
      this.tts ??= this.load()
      const tts = await this.tts
      const clean = text.replace(/[<>]/g, ' ')
      const lang = /[가-힣]/.test(clean) ? 'ko' : 'en'
      const audio = await tts(`<${lang}>${clean}</${lang}>`, { speaker_embeddings: await this.voice(this.o.voice()), num_inference_steps: 5, speed: this.o.speed() })
      return Buffer.from(await audio.toBlob().arrayBuffer())
    } catch (e) { this.o.log(`로컬 목소리 실패: ${String((e as Error).message).slice(0, 200)}`); return null }
  }
}
