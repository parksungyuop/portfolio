// macOS 밖의 귀: HUD 렌더러가 마이크 PCM(16kHz s16)을 IPC 로 보내고, 여기서 발화를 잘라 로컬 Whisper 로 받아 적는다.
// Ear(Swift 헬퍼)와 같은 표면(spawnHelper/start/pause/shutdown, 'event')을 지킨다. 음성은 메모리에만 있고 디스크에 쓰지 않는다.
import { ipcMain } from 'electron'
import { EventEmitter } from 'node:events'
import type { EarEvent } from '@jarvis/core'
import { Endpointer } from './endpointer.js'

type Asr = (audio: Float32Array, opts?: object) => Promise<{ text: string }>
export interface WhisperEarOpts { model: string; cacheDir: string; vadRms: () => number; silenceMs: () => number; /** 지금 스피커로 자비스 소리가 나가고 있는가 (자기 목소리를 받아 적지 않는다) */ speaking: () => boolean; log: (s: string) => void }

export class WhisperEar extends EventEmitter {
  private listening = false
  private ep: Endpointer | null = null
  private asr: Promise<Asr> | null = null
  private lastSpeakingAt = 0
  constructor(private readonly o: WhisperEarOpts) { super() }

  spawnHelper(): void {
    ipcMain.on('mic:ready', (_e, ok: unknown) => this.fire(ok ? { t: 'ready', installed: true } : { t: 'error', code: 'MIC_DENIED' }))
    ipcMain.on('mic:pcm', (_e, d: unknown) => {
      if (d instanceof ArrayBuffer) this.onPcm(Buffer.from(d))
      else if (ArrayBuffer.isView(d)) this.onPcm(Buffer.from(d.buffer, d.byteOffset, d.byteLength))
    })
    this.asr = this.load()
    this.asr.then(() => this.o.log('whisper 준비'), (e) => this.o.log(`whisper 로드 실패: ${String((e as Error).message).slice(0, 200)}`))
  }

  /** 첫 실행은 모델을 cacheDir 에 한 번 내려받는다(고정 크기, 쌓이지 않는다). */
  private async load(): Promise<Asr> {
    // pipeline() 의 타입은 tsc 가 감당 못 할 만큼 큰 합집합이라 필요한 모양만 선언한다
    const tf = (await import('@huggingface/transformers')) as unknown as { env: { cacheDir: string }; pipeline: (task: string, model: string, opts?: object) => Promise<Asr> }
    tf.env.cacheDir = this.o.cacheDir
    return tf.pipeline('automatic-speech-recognition', this.o.model, { dtype: 'q8' })
  }

  private fire(ev: EarEvent): void { this.emit('event', ev) }

  private onPcm(b: Buffer): void {
    this.fire({ t: 'pcm', b64: b.toString('base64') })
    if (!this.listening || !this.ep) return
    if (this.o.speaking()) this.lastSpeakingAt = Date.now()
    if (Date.now() - this.lastSpeakingAt < 400) { this.ep.reset(); return }
    const f = new Float32Array(b.length >> 1)
    for (let i = 0; i < f.length; i++) f[i] = b.readInt16LE(i * 2) / 32768
    const { speech, utterance } = this.ep.push(f)
    if (speech) this.fire({ t: 'partial', text: '…' }) // Whisper 는 중간 결과가 없다 — 침묵 타이머만 다시 건다
    if (utterance) { this.listening = false; void this.transcribe(utterance) }
  }

  private async transcribe(audio: Float32Array): Promise<void> {
    const t0 = Date.now()
    try {
      const asr = await this.asr!
      const { text } = await asr(audio, { language: 'korean', task: 'transcribe' })
      this.fire({ t: 'final', text: text.trim(), ms: Date.now() - t0 })
    } catch (e) { this.fire({ t: 'error', code: 'ENGINE', detail: String((e as Error).message).slice(0, 200) }) }
  }

  /** hold = 누르고 말하기: 침묵으로 끊지 않고 flush() 를 기다린다 */
  start(hold = false): void { this.ep = new Endpointer({ vadRms: this.o.vadRms(), silenceMs: hold ? 60000 : this.o.silenceMs() }); this.listening = true }
  /** 지금까지 들은 말을 바로 받아 적게 한다. 말이 없었으면 false. */
  flush(): boolean {
    const u = this.listening && this.ep ? this.ep.flush() : null
    if (!u) return false
    this.listening = false; void this.transcribe(u); return true
  }
  pause(): void { this.listening = false }
  shutdown(): void { this.listening = false }
}
