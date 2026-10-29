import { describe, expect, it } from 'vitest'
import { brainErrorSpeech, classifyBrainError } from '../src/brain-errors.js'

describe('classifyBrainError', () => {
  it.each([
    [new Error('401 Unauthorized'), 'AUTH'],
    [new Error('Not logged in. Please run claude login'), 'AUTH'],
    [new Error('429 rate limit exceeded'), 'RATE_LIMIT'],
    [new Error('usage limit reached'), 'RATE_LIMIT'],
    [new Error('fetch failed ENOTFOUND api.anthropic.com'), 'NETWORK'],
    [Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }), 'TIMEOUT'],
    ['something odd', 'OTHER'],
  ])('%s → %s', (e, kind) => expect(classifyBrainError(e)).toBe(kind))
  it('발화 문구는 고정', () => {
    expect(brainErrorSpeech('RATE_LIMIT', '14:30')).toBe('Claude 사용 한도에 도달했습니다. 14:30에 다시 가능합니다.')
    expect(brainErrorSpeech('NETWORK')).toBe('지금 인터넷이 안 됩니다.')
  })
})
