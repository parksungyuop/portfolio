// spike:sdk — 구독 인증(env 에 ANTHROPIC_API_KEY 없음)으로 Agent SDK 스트리밍 query 1회.
// 증명하는 것: 델타(stream_event) 수신, init 의 tools 에 mcp__ 아닌 도구가 없음, 첫 델타까지 ms.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { assertToolPolicy, isMcpTool } from '@jarvis/core'
import { appendVerification } from './lib/verification.js'

if (process.env.ANTHROPIC_API_KEY) {
  console.error('구독 경로 스파이크입니다. `env -u ANTHROPIC_API_KEY pnpm spike:sdk` 로 실행하세요.')
  process.exit(2)
}

const policy = { allowedTools: [] as string[], tools: [] as string[], permissionMode: 'default' as const, includePartialMessages: true, settingSources: [] as string[], strictMcpConfig: true, skills: [] as string[] }
assertToolPolicy(policy)

const t0 = Date.now()
let tFirstDelta = 0
let deltas = 0
let nonMcp: string[] = []
let text = ''
let resultSubtype = ''
let cost: unknown = undefined

for await (const msg of query({
  prompt: '한국어로 한 문장만: 자기소개를 아주 짧게 해 줘.',
  options: { ...policy, maxTurns: 1, model: 'claude-sonnet-5' },
})) {
  const m = msg as { type: string; subtype?: string; tools?: string[]; event?: { type: string; delta?: { type: string; text?: string } }; total_cost_usd?: number }
  if (m.type === 'system' && m.subtype === 'init' && Array.isArray(m.tools)) nonMcp = m.tools.filter((t) => !isMcpTool(t))
  if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') {
    if (!tFirstDelta) tFirstDelta = Date.now() - t0
    deltas++
    text += m.event.delta.text ?? ''
  }
  if (m.type === 'result') {
    resultSubtype = m.subtype ?? ''
    cost = m.total_cost_usd
  }
}

console.log({ tFirstDelta, deltas, nonMcp, resultSubtype, cost, text })
const pass = deltas > 0 && resultSubtype === 'success'
appendVerification({
  command: 'env -u ANTHROPIC_API_KEY pnpm spike:sdk',
  metric: '첫 델타 ms · 델타 수 · 비MCP 도구 · cost',
  value: `${tFirstDelta} · ${deltas} · ${nonMcp.length ? nonMcp.join(',') : '없음'} · ${String(cost)}`,
  fixtureHash: '—',
  pass,
})
process.exit(pass ? 0 : 1)
