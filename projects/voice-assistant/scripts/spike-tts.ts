// spike:tts — ElevenLabs WebSocket 스트리밍으로 첫 오디오까지 ms 를 재고, 키가 없으면 Yuna 폴백을 증명한다.
// 키는 env 로만 받는다: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID. 값은 어디에도 기록하지 않는다.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { DEFAULT_VOICE_ID, findVoice, JARVIS_VOICE_SETTINGS, normalizeForSpeech } from '@jarvis/core'
import { appendVerification } from './lib/verification.js'

const text = normalizeForSpeech('오후 3시부터 비 올 확률이 70%입니다, 보스. 챙기시는 게 좋겠습니다.')
const key = process.env.ELEVENLABS_API_KEY
// ELEVENLABS_VOICE_ID 는 ID 또는 후보 이름(jarvis, james …). 없으면 기본 후보.
const voice = findVoice(process.env.ELEVENLABS_VOICE_ID ?? '')?.id ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID

function say(t: string): Promise<number> {
  const t0 = Date.now()
  return new Promise((resolve) => spawn('say', ['-v', 'Yuna', t], { stdio: 'inherit' }).on('exit', () => resolve(Date.now() - t0)))
}

if (!key) {
  console.log('키 없음 → Yuna 폴백 경로')
  const ms = await say(text)
  appendVerification({ command: 'pnpm spike:tts (키 없음)', metric: 'Yuna 폴백 전체 ms', value: String(ms), fixtureHash: '—', pass: true })
  process.exit(0)
}

const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voice}/stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128`
const ws = new WebSocket(url, { headers: { 'xi-api-key': key } })
const chunks: Buffer[] = []
let t0 = 0
let tFirst = 0

ws.on('open', () => {
  ws.send(JSON.stringify({ text: ' ', voice_settings: JARVIS_VOICE_SETTINGS }))
  t0 = Date.now()
  ws.send(JSON.stringify({ text: text + ' ', flush: true }))
  ws.send(JSON.stringify({ text: '' }))
})
ws.on('message', (d) => {
  const m = JSON.parse(d.toString()) as { audio?: string; isFinal?: boolean; error?: string }
  if (m.error) console.error('elevenlabs:', m.error)
  if (m.audio) {
    if (!tFirst) tFirst = Date.now() - t0
    chunks.push(Buffer.from(m.audio, 'base64'))
  }
  if (m.isFinal) ws.close()
})
ws.on('close', () => {
  const out = path.join(tmpdir(), 'jarvis-spike-tts.mp3')
  writeFileSync(out, Buffer.concat(chunks))
  spawn('afplay', [out], { stdio: 'inherit' })
  const pass = tFirst > 0 && tFirst <= 800
  appendVerification({ command: 'pnpm spike:tts', metric: '첫 오디오 ms (WS Flash v2.5)', value: String(tFirst), fixtureHash: '—', pass })
  process.exit(pass ? 0 : 1)
})
ws.on('error', async (e) => {
  console.error('WS 오류 → Yuna 폴백:', e.message)
  const ms = await say(text)
  appendVerification({ command: 'pnpm spike:tts', metric: 'WS 오류 → Yuna 폴백 ms', value: String(ms), fixtureHash: '—', pass: false })
  process.exit(1)
})
