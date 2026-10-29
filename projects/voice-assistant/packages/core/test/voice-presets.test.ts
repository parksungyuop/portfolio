import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICE_ID, findVoice, JARVIS_VOICE_SETTINGS, VOICE_CANDIDATES } from '../src/voice-presets.js'

describe('voice presets', () => {
  it('자비스 설정은 안정성 높고 스타일 0', () => {
    expect(JARVIS_VOICE_SETTINGS.stability).toBeGreaterThanOrEqual(0.75)
    expect(JARVIS_VOICE_SETTINGS.style).toBe(0)
  })
  it('ID 는 20자 고유', () => {
    const ids = VOICE_CANDIDATES.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9]{20}$/))
  })
  it('이름 앞부분으로 찾는다', () => {
    expect(findVoice('james')?.id).toBe(DEFAULT_VOICE_ID)
    expect(findVoice('JARVIS')?.source).toBe('design')
    expect(findVoice('james')?.name).toMatch(/Butler/)
    expect(findVoice('없음')).toBeUndefined()
  })
})
