import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { StateMachine, type TransitionRow } from '../src/state-machine.js'

const rows = JSON.parse(readFileSync(new URL('../../../fixtures/state-transitions.json', import.meta.url), 'utf8')) as TransitionRow[]

describe('상태 기계 (fixtures/state-transitions.json)', () => {
  it.each(rows)('%s --%s--> %s', (from, ev, to) => {
    const m = new StateMachine(rows)
    // from 까지 도달시키는 대신 표를 직접 검증: 같은 표로 만든 기계에서 from 상태를 만든다
    ;(m as unknown as { current: string }).current = from
    expect(m.send(ev)).toBe(true)
    expect(m.state).toBe(to)
  })
  it('한 바퀴: IDLE→WAKE→LISTENING→THINKING→SPEAKING→FOLLOWUP→IDLE', () => {
    const m = new StateMachine(rows)
    for (const ev of ['hotkey', 'ear_started', 'final', 'first_sentence', 'speech_done', 'silence'] as const) expect(m.send(ev)).toBe(true)
    expect(m.state).toBe('IDLE')
  })
  it('표에 없는 이벤트는 무시하고 false', () => {
    const m = new StateMachine(rows)
    expect(m.send('speech_done')).toBe(false)
    expect(m.state).toBe('IDLE')
  })
  it('"그만"은 SPEAKING 에서 통하지 않는다 (§5: 끼어들기는 wake/hotkey 만)', () => {
    const m = new StateMachine(rows)
    ;(m as unknown as { current: string }).current = 'SPEAKING'
    expect(m.send('stop_intent')).toBe(false)
  })
  it('중복 행은 거부', () => {
    expect(() => new StateMachine([['IDLE', 'wake', 'WAKE'], ['IDLE', 'wake', 'LOCKED']])).toThrow(/중복/)
  })
})
