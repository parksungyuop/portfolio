import { describe, expect, it } from 'vitest'
import { assertToolPolicy, isMcpTool } from '../src/sdk-guards.js'

const ok = { allowedTools: ['mcp__weather__weather_today'], tools: [], permissionMode: 'default', includePartialMessages: true, settingSources: [], strictMcpConfig: true, skills: [] }

describe('assertToolPolicy', () => {
  it('정상 통과', () => {
    expect(() => assertToolPolicy(ok)).not.toThrow()
  })
  it('와일드카드 거부', () => {
    expect(() => assertToolPolicy({ ...ok, allowedTools: ['mcp__weather__*'] })).toThrow(/wildcard/)
  })
  it('내장 도구 이름 거부', () => {
    expect(() => assertToolPolicy({ ...ok, allowedTools: ['Read'] })).toThrow(/mcp__/)
  })
  it('tools 는 비어야 한다', () => {
    expect(() => assertToolPolicy({ ...ok, tools: ['Bash'] })).toThrow(/tools/)
  })
  it('permissionMode 는 default', () => {
    expect(() => assertToolPolicy({ ...ok, permissionMode: 'bypassPermissions' })).toThrow(/default/)
  })
  it('partial 필수', () => {
    expect(() => assertToolPolicy({ ...ok, includePartialMessages: false })).toThrow(/includePartialMessages/)
  })
})

describe('격리', () => {
  it('settingSources 는 빈 배열', () => { expect(() => assertToolPolicy({ ...ok, settingSources: ['user'] })).toThrow(/settingSources/) })
  it('strictMcpConfig 필수', () => { expect(() => assertToolPolicy({ ...ok, strictMcpConfig: false })).toThrow(/strictMcpConfig/) })
  it('skills 없음', () => { expect(() => assertToolPolicy({ ...ok, skills: ['x'] })).toThrow(/skills/) })
})

it('isMcpTool', () => {
  expect(isMcpTool('mcp__x__y')).toBe(true)
  expect(isMcpTool('Bash')).toBe(false)
})
