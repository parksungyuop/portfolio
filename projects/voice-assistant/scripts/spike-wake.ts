// spike:wake — fixtures/wake/ 의 WAV 를 onnxruntime 에 흘려 감지율·오탐을 결정적으로 잰다 (사람 불필요).
// positive: hey-jarvis-*.wav (각 ≤3초, 16kHz mono PCM16). negative: negative-*.wav (호출어 없는 한국어 발화, 총 10분 목표).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ort from 'onnxruntime-node'
import { countDetections, frames80ms, WakeWordDetector, wavToFloat32 } from '@jarvis/core'
import { appendVerification } from './lib/verification.js'

const DIR = 'fixtures/wake'
if (!existsSync('models/hey_jarvis_v0.1.onnx')) { console.error('먼저 pnpm tsx scripts/fetch-models.ts'); process.exit(2) }
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.wav')) : []
const pos = files.filter((f) => f.startsWith('hey-jarvis-')).sort()
const neg = files.filter((f) => f.startsWith('negative-')).sort()
if (pos.length === 0) { console.error(`${DIR}/hey-jarvis-01.wav … 를 먼저 녹음하세요 (README 참조)`); process.exit(2) }

const load = (f: string) => ort.InferenceSession.create(path.join('models', f))
const sessions = { mel: await load('melspectrogram.onnx'), emb: await load('embedding_model.onnx'), cls: await load('hey_jarvis_v0.1.onnx') }
console.log('mel in/out', sessions.mel.inputNames, sessions.mel.outputNames)

async function scoresFor(file: string): Promise<number[]> {
  const { sampleRate, samples } = wavToFloat32(readFileSync(path.join(DIR, file)))
  if (sampleRate !== 16000) throw new Error(`${file}: 16kHz 필요 (실제 ${sampleRate})`)
  const det = new WakeWordDetector(ort as never, sessions as never)
  const out: number[] = []
  for (const fr of frames80ms(samples)) out.push(await det.pushPcm16k(fr))
  return out
}

let hits = 0
for (const f of pos) { const s = await scoresFor(f); const max = Math.max(...s); const hit = max >= 0.5; if (hit) hits++; console.log(`${f}  max=${max.toFixed(2)}  ${hit ? '감지' : '놓침'}`) }
let falsePositives = 0
let negSeconds = 0
for (const f of neg) { const { samples } = wavToFloat32(readFileSync(path.join(DIR, f))); negSeconds += samples.length / 16000; const s = await scoresFor(f); const c = countDetections(s); falsePositives += c; console.log(`${f}  ${(samples.length / 16000).toFixed(0)}s  오탐=${c}`) }

const fpPer10min = negSeconds > 0 ? (falsePositives / negSeconds) * 600 : NaN
const pass = hits >= Math.ceil(pos.length * 0.9) && (Number.isNaN(fpPer10min) || fpPer10min <= 1)
const fixtureHash = createHash('sha256').update(files.map((f) => f + readFileSync(path.join(DIR, f)).length).join('|')).digest('hex').slice(0, 12)
appendVerification({ command: 'pnpm spike:wake', metric: `감지/${pos.length} · 오탐/10분(${Math.round(negSeconds)}s 기준)`, value: `${hits} · ${Number.isNaN(fpPer10min) ? '미측정' : fpPer10min.toFixed(1)}`, fixtureHash, pass })
process.exit(pass ? 0 : 1)
