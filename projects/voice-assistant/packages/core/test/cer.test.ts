import { describe, expect, it } from 'vitest'
import { cer } from '../src/cer.js'

describe('cer', () => {
  it('같은 문장은 0', () => {
    expect(cer('오늘 우산 챙겨야 해', '오늘 우산 챙겨야 해')).toBe(0)
  })
  it('공백·구두점은 무시한다', () => {
    expect(cer('오늘, 우산!', '오늘 우산')).toBe(0)
  })
  it('한 글자 치환은 1/길이', () => {
    expect(cer('배치점검', '배치검검')).toBeCloseTo(0.25)
  })
  it('빈 참조에 가설이 있으면 1', () => {
    expect(cer('', '가')).toBe(1)
  })
  it('둘 다 비면 0', () => {
    expect(cer('', '')).toBe(0)
  })
})
