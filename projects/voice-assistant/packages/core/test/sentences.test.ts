import { describe, expect, it } from 'vitest'
import { cutForSpeech, normalizeForSpeech, splitSentences } from '../src/sentences.js'

describe('splitSentences', () => {
  it('소수점에서 안 자른다', () => {
    expect(splitSentences('오늘 최고 27.6도, 최저 18.2도입니다. 우산 챙기세요.')).toEqual([
      '오늘 최고 27.6도, 최저 18.2도입니다.',
      '우산 챙기세요.',
    ])
  })
  it('물음표·느낌표', () => {
    expect(splitSentences('가실까요? 네!')).toEqual(['가실까요?', '네!'])
  })
  it('구두점 없는 꼬리도 한 문장', () => {
    expect(splitSentences('끝. 그리고 더')).toEqual(['끝.', '그리고 더'])
  })
})

describe('cutForSpeech', () => {
  it('240자 이내 마지막 문장 경계에서 자른다', () => {
    const s = '가나다라마. '.repeat(80).trim()
    const { speak, rest } = cutForSpeech(s)
    expect(speak.length).toBeLessThanOrEqual(240)
    expect(speak.endsWith('.')).toBe(true)
    expect(rest.length).toBeGreaterThan(0)
    expect(speak + ' ' + rest).toBe(s)
  })
  it('짧으면 그대로', () => {
    expect(cutForSpeech('짧다.')).toEqual({ speak: '짧다.', rest: '' })
  })
  it('경계 없는 긴 문장은 max 에서 자른다', () => {
    const s = '가'.repeat(300)
    expect(cutForSpeech(s).speak.length).toBe(240)
  })
})

describe('normalizeForSpeech', () => {
  it('분수·도·시각', () => {
    expect(normalizeForSpeech('58/93 · 27.6° · 18:00')).toBe('93편 중 58편 · 27.6도 · 오후 여섯 시')
  })
  it('분이 있는 시각', () => {
    expect(normalizeForSpeech('09:41')).toBe('오전 아홉 시 41분')
  })
  it('자정·정오', () => {
    expect(normalizeForSpeech('00:00 12:00')).toBe('오전 열두 시 오후 열두 시')
  })
})
