// spike:hud — 단일 투명 창에서 링 애니메이션 N초, 평균 fps ≥ 58 이면 통과.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { appendVerification } from './lib/verification.js'

const require = createRequire(import.meta.url)
const electron = require('electron') as string // electron 패키지는 바이너리 경로 문자열을 export 한다
const seconds = process.env.JARVIS_HUD_SECONDS ?? '60'

const build = spawnSync('pnpm', ['--filter', '@jarvis/desktop', 'build'], { stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)
const main = path.resolve('apps/desktop/dist/spike-hud/main.js')
if (!existsSync(main)) { console.error('빌드 산출물 없음:', main); process.exit(2) }

console.log(`전체 화면 투명 창을 ${seconds}초 띄웁니다 (클릭 통과, 작업에 방해 없음)…`)
const run = spawnSync(electron, [main], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, JARVIS_HUD_SECONDS: seconds } })
const line = run.stdout.toString().trim().split('\n').find((l) => l.startsWith('{'))
if (!line) { console.error('fps 보고 없음. exit', run.status); process.exit(2) }
const { fps, frames, windows } = JSON.parse(line) as { fps: number; frames: number; windows: number }
const pass = fps >= 58 && windows === 1
appendVerification({ command: 'pnpm spike:hud', metric: `평균 fps(${seconds}s) · 창 수`, value: `${fps.toFixed(1)} · ${windows}`, fixtureHash: '—', pass })
process.exit(pass ? 0 : 1)
