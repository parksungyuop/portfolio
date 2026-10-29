import { describe, expect, it } from 'vitest'
import { describeWrite, makeCanUseTool, WRITE_TOOLS } from '../brain/gate.js'

const sig = new AbortController().signal
describe('canUseTool 게이트', () => {
  it('내장 도구는 거부', async () => {
    const g = makeCanUseTool({ askConfirm: async () => true, log: () => {} })
    expect((await g('Bash', {}, { signal: sig, suggestions: [] } as never)).behavior).toBe('deny')
  })
  it('목록에 없는 mcp 도구는 묻지도 않고 거부 (읽기는 allowedTools 가 먼저 허용한다)', async () => {
    let asked = 0
    const g = makeCanUseTool({ askConfirm: async () => { asked++; return true }, log: () => {} })
    expect((await g('mcp__calendar__brand_new_tool', {}, { signal: sig, suggestions: [] } as never)).behavior).toBe('deny')
    expect(asked).toBe(0)
  })
  it('URL 열기는 확인 대상이고 호스트를 읽어 준다', () => {
    expect(WRITE_TOOLS.has('mcp__media__open_url')).toBe(true)
    expect(describeWrite('mcp__media__open_url', { url: 'https://example.com/a?x=1' })).toBe('example.com 을 열겠습니까?')
  })
  it('쓰기 도구는 확인 결과를 따르고 confirmation 을 주입', async () => {
    const yes = makeCanUseTool({ askConfirm: async () => true, log: () => {} })
    const r = await yes('mcp__comms__phone_call', { number: '01012345678' }, { signal: sig, suggestions: [] } as never)
    expect(r.behavior).toBe('allow')
    expect((r as { updatedInput: Record<string, unknown> }).updatedInput.confirmation).toMatch(/^hud:/)
    const no = makeCanUseTool({ askConfirm: async () => false, log: () => {} })
    expect((await no('mcp__comms__mail_send', { to: 'a@b.c', subject: 's', body: 'b' }, { signal: sig, suggestions: [] } as never)).behavior).toBe('deny')
  })
  it('쓰기 목록에 전화·메일 발송·달력 쓰기가 있고 delete 는 없다', () => { expect(WRITE_TOOLS.has('mcp__comms__mail_send')).toBe(true); expect(WRITE_TOOLS.has('mcp__calendar__create_event')).toBe(true); expect([...WRITE_TOOLS].some((t) => /delete/.test(t))).toBe(false) })
  it('확인 문구', () => { expect(describeWrite('mcp__comms__phone_call', { number: '010', name: '엄마' })).toBe('엄마 010 로 전화를 걸겠습니까?') })
})
