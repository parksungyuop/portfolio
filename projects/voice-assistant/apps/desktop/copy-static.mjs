// 정적 파일을 dist 로 복사한다 (cp/mkdir -p 대신 — Windows 에서도 돈다).
import { cpSync } from 'node:fs'
cpSync('spike-hud/index.html', 'dist/spike-hud/index.html')
for (const f of ['index.html', 'hud.css', 'hud.js']) cpSync(`renderer/${f}`, `dist/renderer/${f}`)
cpSync('renderer/fonts', 'dist/renderer/fonts', { recursive: true })
cpSync('windows/settings.html', 'dist/windows/settings.html')
