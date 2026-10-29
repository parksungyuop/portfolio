// openWakeWord 모델 3개를 models/ 에 내려받고 SHA-256 을 models/SHA256SUMS 에 고정한다.
// 첫 실행이 기록하고, 이후 실행은 대조한다 — 어긋나면 실패한다 (F-23 과 같은 규율).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/'
const FILES = ['melspectrogram.onnx', 'embedding_model.onnx', 'hey_jarvis_v0.1.onnx'] as const
const DIR = 'models'
const SUMS = path.join(DIR, 'SHA256SUMS')

mkdirSync(DIR, { recursive: true })
const known = new Map<string, string>()
if (existsSync(SUMS)) for (const l of readFileSync(SUMS, 'utf8').trim().split('\n')) { const [h, f] = l.split(/\s+/); if (h && f) known.set(f, h) }

let changed = false
for (const f of FILES) {
  const dest = path.join(DIR, f)
  if (!existsSync(dest)) {
    const res = await fetch(BASE + f)
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`)
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  }
  const h = createHash('sha256').update(readFileSync(dest)).digest('hex')
  const k = known.get(f)
  if (k && k !== h) throw new Error(`${f}: SHA-256 불일치 (기록 ${k.slice(0, 12)} ≠ 실제 ${h.slice(0, 12)})`)
  if (!k) { known.set(f, h); changed = true }
  console.log(`${f}  ${h.slice(0, 12)}  ${k ? '대조 통과' : '기록'}`)
}
if (changed) writeFileSync(SUMS, [...known].map(([f, h]) => `${h}  ${f}`).join('\n') + '\n')
