// 입: 문장 큐 → ElevenLabs(문장마다 WS 1회, mp3) → afplay. 키 없음·오류·오프라인이면 `say -v Yuna`(§5 폴백).
// 서킷: 연속 실패 3회면 5분 동안 Yuna 로만 말한다.
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import type { Player } from './player.js'
import { cutForSpeech, JARVIS_VOICE_SETTINGS, normalizeForSpeech } from '@jarvis/core'

export interface MouthOpts { apiKey: () => string | undefined; voiceId: () => string; model: () => string; maxSpeakChars: number; log: (s: string) => void; /** 키가 없거나 ElevenLabs 가 실패할 때 쓰는 로컬 합성기 (WAV) */ local?: (text: string) => Promise<Buffer | null>; /** 있으면 afplay/say 대신 여기로 소리를 낸다 (macOS 밖) */ player?: Player }

export class Mouth {
  private queue: string[] = []
  private playing = false
  private current: ReturnType<typeof spawn> | null = null
  private failures = 0
  private circuitOpenUntil = 0
  private seq = 0
  private gen = 0
  onIdle: (() => void) | null = null
  onFirstAudio: ((ms: number) => void) | null = null
  private tRequested = 0

  constructor(private readonly o: MouthOpts) {}

  /** 원문을 넣으면 정규화·컷 후 큐에 쌓고 재생을 시작한다. */
  speak(text: string): void {
    const { speak } = cutForSpeech(text, this.o.maxSpeakChars)
    if (!speak.trim()) return
    if (!this.tRequested) this.tRequested = Date.now()
    this.queue.push(normalizeForSpeech(speak))
    void this.drain()
  }
  /** 큐를 비우고 지금 재생 중인 것을 끊는다(끼어들기). */
  stop(): void { this.gen++; this.queue = []; this.current?.kill(); this.current = null; this.o.player?.stop() }
  get busy(): boolean { return this.playing || this.queue.length > 0 }
  get queued(): number { return this.queue.length }
  get usingFallback(): boolean { return !this.o.apiKey() || Date.now() < this.circuitOpenUntil }
  lastFirstAudioMs: number | null = null

  private async drain(): Promise<void> {
    if (this.playing) return
    this.playing = true
    // 파이프라인: 현재 문장을 재생하는 동안 다음 문장을 미리 합성한다
    let next: Promise<{ s: string; mp3: Buffer | null; gen: number }> | null = null
    const take = () => { const s = this.queue.shift()!; const gen = this.gen; return this.synthesize(s).then((mp3) => ({ s, mp3, gen })) }
    while (this.queue.length || next) {
      const cur = next ?? take()
      next = null
      const { s, mp3, gen } = await cur
      if (gen !== this.gen) continue // stop() 전에 합성해 둔 문장은 버린다
      if (this.queue.length) next = take()
      if (mp3) await this.playMp3(mp3)
      else if (this.o.player) await this.o.player.say(s)
      else await this.play('say', ['-v', 'Yuna', s])
    }
    this.playing = false
    this.tRequested = 0
    this.onIdle?.()
  }

  /** 단일 문장을 mp3 로 만든다(호출 응답 클립 생성용). 실패면 null. */
  synthesizeClip(text: string): Promise<Buffer | null> { return this.synthesize(text) }

  async playMp3(mp3: Buffer): Promise<void> {
    if (this.o.player) return this.o.player.play(mp3)
    const f = path.join(tmpdir(), `jarvis-say-${process.pid}-${this.seq++}.mp3`)
    writeFileSync(f, mp3)
    try { await this.play('afplay', [f]) } finally { rmSync(f, { force: true }) }
  }

  private play(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve) => {
      const p = spawn(bin, args, { stdio: 'ignore' })
      this.current = p
      p.on('exit', () => { if (this.current === p) this.current = null; resolve() })
    })
  }

  private async synthesize(text: string): Promise<Buffer | null> {
    const key = this.o.apiKey()
    if (!key || Date.now() < this.circuitOpenUntil) return this.o.local ? this.o.local(text) : null
    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.o.voiceId()}/stream-input?model_id=${this.o.model()}&output_format=mp3_44100_128`
    const t0 = Date.now()
    try {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const ws = new WebSocket(url, { headers: { 'xi-api-key': key } })
        const chunks: Buffer[] = []
        const timer = setTimeout(() => { ws.terminate(); reject(new Error('tts timeout')) }, 8000)
        ws.on('open', () => {
          ws.send(JSON.stringify({ text: ' ', voice_settings: JARVIS_VOICE_SETTINGS }))
          ws.send(JSON.stringify({ text: text + ' ', flush: true }))
          ws.send(JSON.stringify({ text: '' }))
        })
        ws.on('message', (d) => {
          let m: { audio?: string; isFinal?: boolean; error?: string }
          try { m = JSON.parse(d.toString()) as typeof m } catch { return }
          if (m.error) { clearTimeout(timer); ws.close(); reject(new Error(m.error)); return }
          if (m.audio) {
            if (!chunks.length) { this.lastFirstAudioMs = Date.now() - t0; this.onFirstAudio?.(this.lastFirstAudioMs); if (this.tRequested) { this.o.log(`tts 첫 문장까지 ${Date.now() - this.tRequested}ms`); this.tRequested = 0 } }
            chunks.push(Buffer.from(m.audio, 'base64'))
          }
          if (m.isFinal) { clearTimeout(timer); ws.close(); resolve(Buffer.concat(chunks)) }
        })
        ws.on('error', (e) => { clearTimeout(timer); reject(e) })
        ws.on('close', () => { clearTimeout(timer); if (chunks.length) resolve(Buffer.concat(chunks)); else reject(new Error('no audio')) })
      })
      this.failures = 0
      return buf
    } catch (e) {
      this.failures++
      this.o.log(`tts 실패(${this.failures}): ${(e as Error).message}`)
      if (this.failures >= 3) { this.circuitOpenUntil = Date.now() + 5 * 60 * 1000; this.o.log('tts 서킷 열림 5분 → 로컬 목소리') }
      return this.o.local ? this.o.local(text) : null
    }
  }
}
