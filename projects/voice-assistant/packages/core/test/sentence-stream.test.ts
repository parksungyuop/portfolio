import { describe, expect, it } from 'vitest'
import { SentenceStream } from '../src/sentence-stream.js'

describe('SentenceStream', () => {
  it('쪼개진 델타에서 문장 경계마다 내보낸다', () => {
    const s = new SentenceStream()
    expect(s.push('좋은 아침')).toEqual([])
    expect(s.push('입니다, 보스. 오늘')).toEqual(['좋은 아침입니다, 보스.'])
    expect(s.push('은 27.')).toEqual([])
    expect(s.push('6도입니다. 우산은')).toEqual(['오늘은 27.6도입니다.'])
    expect(s.flush()).toEqual(['우산은'])
  })
  it('종결 부호로 끝나면 전부 내보낸다', () => {
    const s = new SentenceStream()
    expect(s.push('네. 알겠습니다!')).toEqual(['네.', '알겠습니다!'])
    expect(s.flush()).toEqual([])
  })
})
