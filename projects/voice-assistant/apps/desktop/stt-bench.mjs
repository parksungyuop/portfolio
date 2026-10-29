// Whisper 모델 속도·정확도 비교: node stt-bench.mjs <wav...>
// 앱과 같은 방식(transformers.js, CPU)으로 돌린다. 정답 문장과의 글자 오류율(CER)도 낸다.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { env, pipeline } from '@huggingface/transformers'

env.cacheDir = path.join(process.env.APPDATA ?? '.', 'Jarvis', 'models')
const TRUTH = 'JARVIS 온라인입니다, 홍길동 님. 오늘 서울은 맑고 최고 기온은 26도입니다. 무엇을 도와드리겠습니까?'
const MODELS = [
  ['onnx-community/whisper-small', 'q8'],
  ['onnx-community/whisper-large-v3-turbo', 'q8'],
  ['onnx-community/whisper-large-v3-turbo', 'q4'],
]

function wav16k(file) { // PCM16/float32 WAV → 16kHz mono Float32 (선형 보간)
  const b = readFileSync(file); let p = 12, fmt, rate, ch, bits, data
  while (p < b.length - 8) { const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4)
    if (id === 'fmt ') { fmt = b.readUInt16LE(p + 8); ch = b.readUInt16LE(p + 10); rate = b.readUInt32LE(p + 12); bits = b.readUInt16LE(p + 22) }
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + n); break }
    p += 8 + n + (n % 2) }
  const bytes = bits / 8, frames = Math.floor(data.length / bytes / ch), src = new Float32Array(frames)
  for (let i = 0; i < frames; i++) src[i] = fmt === 3 ? data.readFloatLE(i * bytes * ch) : data.readInt16LE(i * bytes * ch) / 32768
  const out = new Float32Array(Math.floor(frames * 16000 / rate))
  for (let i = 0; i < out.length; i++) { const x = i * rate / 16000, k = Math.floor(x), f = x - k; out[i] = src[k] * (1 - f) + (src[k + 1] ?? src[k]) * f }
  return out
}
const strip = (s) => [...s.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()]
function cer(ref, hyp) { const r = strip(ref), h = strip(hyp); let prev = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) { const cur = [i]; for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)); prev = cur }
  return prev[h.length] / r.length }

const files = process.argv.slice(2)
const clips = files.map((f) => ({ f: path.basename(f), a: wav16k(f) }))
for (const [model, dtype] of MODELS) {
  const t0 = Date.now()
  let asr
  try { asr = await pipeline('automatic-speech-recognition', model, { dtype }) } catch (e) { console.log(`\n## ${model} (${dtype}) 로드 실패: ${String(e.message).slice(0, 160)}`); continue }
  console.log(`\n## ${model} (${dtype}) — 로드 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await asr(clips[0].a.subarray(0, 16000), { language: 'korean', task: 'transcribe' }) // 워밍업
  let ms = 0, err = 0
  for (const c of clips) {
    const t = Date.now(); const { text } = await asr(c.a, { language: 'korean', task: 'transcribe' }); const d = Date.now() - t
    ms += d; err += cer(TRUTH, text)
    console.log(`${c.f} ${(c.a.length / 16000).toFixed(1)}s 음성 → ${d}ms · CER ${(cer(TRUTH, text) * 100).toFixed(0)}% · ${text.trim()}`)
  }
  console.log(`평균 ${Math.round(ms / clips.length)}ms · 평균 CER ${(err / clips.length * 100).toFixed(1)}%`)
  await asr.dispose?.()
}
