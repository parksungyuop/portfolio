import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/config-schema.js'
import { DEFAULT_VOICE_ID } from '../src/voice-presets.js'

describe('parseConfig', () => {
  it('빈 설정은 기본값으로 채운다', () => {
    const c = parseConfig({})
    expect(c.brain.auth).toBe('subscription')
    expect(c.tts.voiceId).toBe(DEFAULT_VOICE_ID)
    expect(c.brain.timeoutMs).toBe(20000)
  })
  it('모르는 키는 거부', () => {
    expect(() => parseConfig({ brian: {} })).toThrow()
    expect(() => parseConfig({ brain: { modle: 'x' } })).toThrow()
  })
  it('voiceId 형식 검사', () => {
    expect(() => parseConfig({ tts: { voiceId: 'nope' } })).toThrow()
  })
})
