// spike:stt — jarvis-ear 로 10문장을 낭독받아 CER 을 잰다. 사람이 마이크 앞에서 1회 실행한다.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { cer, parseEarLine, serializeEarCommand } from '@jarvis/core'
import { appendVerification, sha256 } from './lib/verification.js'

const BIN = 'native/jarvis-ear/build/jarvis-ear'
if (!existsSync(BIN)) {
  console.error(`먼저 pnpm build:ear 로 ${BIN} 을 만드세요`)
  process.exit(2)
}
const fixture = readFileSync('native/jarvis-ear/fixtures/stt-sentences.ko.txt', 'utf8')
const sentences = fixture.trim().split('\n')

const ear = spawn(BIN, ['--silence-ms', '800'], { stdio: ['pipe', 'pipe', 'inherit'] })
const lines = createInterface({ input: ear.stdout })
const scores: number[] = []
let idx = 0
let tStart = 0
let readyToStartMs = -1

function ask(): void {
  if (idx >= sentences.length) return finish()
  console.log(`\n[${idx + 1}/${sentences.length}] 읽어 주세요: "${sentences[idx]}"`)
  tStart = Date.now()
  ear.stdin.write(serializeEarCommand({ cmd: 'start' }))
}

function finish(): void {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const pass = avg <= 0.1
  console.log(`\nCER 평균 ${avg.toFixed(3)} → ${pass ? '통과' : '실패'} (ready→start ${readyToStartMs}ms)`)
  appendVerification({
    command: 'pnpm spike:stt',
    metric: 'CER avg(10문장) · 마이크 권한 창',
    value: `${avg.toFixed(3)} · 확인`,
    fixtureHash: sha256(fixture),
    pass,
  })
  ear.stdin.write(serializeEarCommand({ cmd: 'stop' }))
  setTimeout(() => process.exit(pass ? 0 : 1), 200)
}

lines.on('line', (l) => {
  const ev = parseEarLine(l)
  if (!ev) {
    console.error('ear: 계약 밖 줄:', l)
    return
  }
  switch (ev.t) {
    case 'ready': {
      const t = Date.now()
      console.log(`마이크 준비됨 · installed=${ev.installed}`)
      readyToStartMs = 0
      ask()
      readyToStartMs = Date.now() - t
      break
    }
    case 'partial':
      process.stdout.write(`\r  … ${ev.text}`)
      break
    case 'final': {
      const ref = sentences[idx]!
      const c = cer(ref, ev.text)
      scores.push(c)
      console.log(`\n  → "${ev.text}"  CER=${c.toFixed(2)}  (${Date.now() - tStart}ms)`)
      idx++
      ask()
      break
    }
    case 'error':
      console.error('EAR ERROR', ev)
      process.exit(3)
  }
})
ear.on('exit', (code) => {
  if (idx < sentences.length) {
    console.error(`ear 가 먼저 종료됨 (code ${code})`)
    process.exit(3)
  }
})
