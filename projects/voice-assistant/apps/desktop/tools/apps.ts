// Windows 앱 실행 (시작 메뉴에 있는 앱만). 목록 = 읽기, 실행 = 쓰기 → 확인 게이트 §6.3.
// 사용자 입력은 PowerShell·셸에 절대 끼워 넣지 않는다: 목록은 고정 명령으로 받고, 실행은 그 목록에 있는 AppID 로만 한다.
import { execFile } from 'node:child_process'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { fail, text } from './util.js'

export interface StartApp { Name: string; AppID: string }
export const APPS_WRITE_TOOLS = ['mcp__apps__app_open'] as const

const norm = (s: string): string => s.toLowerCase().replace(/[\s._-]/g, '')
/** 이름으로 앱 하나를 고른다: 완전일치 > 앞부분 일치 > 포함. 없으면 null. */
export function pickApp(apps: readonly StartApp[], name: string): StartApp | null {
  const q = norm(name); if (!q) return null
  apps = [...apps].sort((a, b) => Number(a.AppID.startsWith('Chrome.')) - Number(b.AppID.startsWith('Chrome.'))) // 같은 이름이면 설치형 앱 먼저 (Spotify 데스크톱 vs 크롬 웹앱)
  return apps.find((a) => norm(a.Name) === q) ?? apps.find((a) => norm(a.Name).startsWith(q)) ?? apps.find((a) => norm(a.Name).includes(q)) ?? null
}

let cache: { at: number; apps: StartApp[] } | null = null
function listApps(): Promise<StartApp[]> {
  if (cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.apps)
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'], { timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) { reject(err); return }
      try {
        const j = JSON.parse(stdout) as StartApp | StartApp[]
        const apps = (Array.isArray(j) ? j : [j]).filter((a) => typeof a?.Name === 'string' && typeof a?.AppID === 'string')
        cache = { at: Date.now(), apps }
        resolve(apps)
      } catch (e) { reject(e as Error) }
    })
  })
}

export const appsServer = createSdkMcpServer({
  name: 'apps', version: '0.1.0',
  instructions: '이 PC 시작 메뉴에 있는 앱을 찾고 실행한다. 사용자가 한국어로 부른 앱(예: 인스타그램)은 app_list 로 실제 등록 이름(예: Instagram)을 먼저 찾은 뒤 app_open 에 그 이름을 넣는다. 실행은 사용자 확인이 필요하다.',
  tools: [
    tool('app_list', '설치된 앱 이름 목록. query 를 주면 이름에 그 글자가 들어간 앱만', { query: z.string().optional() }, async ({ query }) => {
      try {
        const apps = await listApps()
        const q = query ? norm(query) : ''
        const names = apps.map((a) => a.Name).filter((n) => !q || norm(n).includes(q)).sort()
        return text(names.length ? names.slice(0, 80).join('\n') : `일치하는 앱 없음: ${query ?? ''}`)
      } catch (e) { return fail(`앱 목록 실패: ${(e as Error).message}`) }
    }),
    tool('app_open', '앱을 실행한다 (app_list 에 나온 이름). 확인 필요', { name: z.string().min(1).max(80), confirmation: z.string().optional() }, async ({ name }) => {
      try {
        const app = pickApp(await listApps(), name)
        if (!app) return fail(`설치된 앱에서 찾지 못했습니다: ${name}. app_list 로 이름을 확인하세요.`)
        await new Promise<void>((resolve, reject) => execFile('explorer.exe', [`shell:AppsFolder\\${app.AppID}`], { timeout: 8000, windowsHide: true }, (err) => {
          // explorer.exe 는 성공해도 종료 코드 1 을 돌려준다 — 실행 자체가 안 된 경우(ENOENT 등)만 실패로 본다
          if (err && typeof (err as NodeJS.ErrnoException).code === 'string') reject(err); else resolve()
        }))
        return text(`실행했습니다: ${app.Name}`)
      } catch (e) { return fail(`앱 실행 실패: ${(e as Error).message}`) }
    }),
  ],
})
