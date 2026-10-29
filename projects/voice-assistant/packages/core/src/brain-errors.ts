// F-19: 두뇌 오류 3분류 + 고정 발화. 문자열 매칭은 여기 한 곳에만 있다.
export type BrainErrorKind = 'AUTH' | 'RATE_LIMIT' | 'NETWORK' | 'TIMEOUT' | 'OTHER'

export function classifyBrainError(e: unknown): BrainErrorKind {
  const s = (e instanceof Error ? `${e.name} ${e.message}` : String(e)).toLowerCase()
  if (/abort|timeout|timed out/.test(s)) return 'TIMEOUT'
  if (/401|403|unauthorized|authentication|not logged in|login|invalid api key|auth/.test(s)) return 'AUTH'
  if (/429|rate.?limit|usage limit|quota|limit reached|too many requests/.test(s)) return 'RATE_LIMIT'
  if (/enotfound|econnrefused|econnreset|network|fetch failed|offline|dns|socket/.test(s)) return 'NETWORK'
  return 'OTHER'
}

export function brainErrorSpeech(kind: BrainErrorKind, resetAt?: string): string {
  switch (kind) {
    case 'AUTH': return 'Claude 인증이 필요합니다, 보스.'
    case 'RATE_LIMIT': return resetAt ? `Claude 사용 한도에 도달했습니다. ${resetAt}에 다시 가능합니다.` : 'Claude 사용 한도에 도달했습니다.'
    case 'NETWORK': return '지금 인터넷이 안 됩니다.'
    case 'TIMEOUT': return '응답이 지연됩니다.'
    default: return '문제가 생겼습니다, 보스. 다시 말씀해 주십시오.'
  }
}
