// spike:cal — che-ical-mcp 를 검증 설치하고, MCP stdio 로 도구 목록과 오늘 일정을 받는다.
// 달력 권한 창은 `CheICalMCP --setup` 이 띄운다 — 사용자가 직접 승인한다. 이 스크립트는 --setup 을 대신 누르지 않는다.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { appendVerification } from './lib/verification.js'
import { CHE_ICAL_SHA256, CHE_ICAL_VERSION, ensureCheIcal } from './lib/che-ical.js'

const { path: bin, installed, teamId } = await ensureCheIcal()
console.log(`${bin} · ${CHE_ICAL_VERSION} · ${installed ? '새로 설치' : '기존'} · TeamID ${teamId}`)

const client = new Client({ name: 'jarvis-spike-cal', version: '0.0.0' })
await client.connect(new StdioClientTransport({ command: bin, args: [], env: { PATH: process.env.PATH ?? '' } }))
const tools = await client.listTools()
const names = tools.tools.map((t) => t.name)
console.log(`도구 ${names.length}개:`, names.join(', '))

const listEvents = tools.tools.find((t) => t.name === 'list_events')
if (!listEvents) {
  console.error('list_events 도구가 없습니다. 도구 목록을 보고 스파이크를 맞추세요.')
  process.exit(2)
}
console.log('list_events 입력 스키마:', JSON.stringify(listEvents.inputSchema))

// 오늘 00:00 ~ 내일 00:00 (로컬). 인자 이름은 스키마에 따라 다를 수 있어 흔한 두 가지를 시도한다.
const start = new Date(); start.setHours(0, 0, 0, 0)
const end = new Date(start); end.setDate(end.getDate() + 1)
const attempts: Record<string, unknown>[] = [
  { start_date: start.toISOString(), end_date: end.toISOString() },
  { start: start.toISOString(), end: end.toISOString() },
]
let count = -1
let lastErr = ''
for (const args of attempts) {
  try {
    const r = await client.callTool({ name: 'list_events', arguments: args })
    const text = (r.content as { type: string; text?: string }[]).map((c) => c.text ?? '').join('\n')
    console.log(text.slice(0, 600))
    count = (text.match(/\n/g) ?? []).length
    break
  } catch (e) {
    lastErr = (e as Error).message
  }
}
await client.close()
const pass = count >= 0
if (!pass) console.error('list_events 실패:', lastErr, '\n→ 달력 권한이 없으면 먼저 실행:', `${bin} --setup`)
appendVerification({ command: 'pnpm spike:cal', metric: `도구 수 · 오늘 이벤트 응답 · 해시/서명(${CHE_ICAL_VERSION})`, value: `${names.length} · ${pass ? '수신' : '실패'} · ${CHE_ICAL_SHA256.slice(0, 12)}/${teamId}`, fixtureHash: '—', pass })
process.exit(pass ? 0 : 1)
