// 로그인 시 자동 실행 + 죽으면 재시작 (명세 §8 LaunchAgent). setLoginItemSettings 대신 plist 를 직접 쓴다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron') as string
const ROOT = path.resolve(import.meta.dirname, '..')
const MAIN = path.join(ROOT, 'apps/desktop/dist/main/index.js')
const LABEL = 'dev.jarvis.assistant'
const PLIST = path.join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)
const SUPPORT = path.join(homedir(), 'Library/Application Support/Jarvis')
const uninstall = process.argv.includes('--uninstall')

if (!existsSync(MAIN)) { console.error('먼저 pnpm build 로 앱을 만드세요:', MAIN); process.exit(2) }
mkdirSync(path.dirname(PLIST), { recursive: true }); mkdirSync(SUPPORT, { recursive: true })
try { execFileSync('launchctl', ['bootout', `gui/${process.getuid!()}`, PLIST], { stdio: 'ignore' }) } catch { /* 없으면 무시 */ }
if (uninstall) { try { execFileSync('rm', ['-f', PLIST]) } catch {} ; console.log('LaunchAgent 제거:', PLIST); process.exit(0) }

// 비밀은 env 로 넘기지 않는다 (keychain 기반 secrets.bin 만). ANTHROPIC_API_KEY 도 없음 = 구독 경로.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${electron}</string><string>${MAIN}</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>EnvironmentVariables</key><dict><key>JARVIS_QUIET</key><string>1</string><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string></dict>
  <key>StandardOutPath</key><string>${SUPPORT}/launchd.out.log</string>
  <key>StandardErrorPath</key><string>${SUPPORT}/launchd.err.log</string>
</dict></plist>
`
writeFileSync(PLIST, xml)
execFileSync('launchctl', ['bootstrap', `gui/${process.getuid!()}`, PLIST], { stdio: 'inherit' })
console.log('LaunchAgent 설치·기동:', PLIST)
