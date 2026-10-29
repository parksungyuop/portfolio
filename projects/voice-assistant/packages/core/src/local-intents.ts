// F-14: 로컬 의도는 정규화 뒤 완전일치만. 접두·포함 비교 금지.
export type LocalIntent = 'QUIT' | 'ALWAYS_ON' | 'ALWAYS_OFF' | 'STOP' | 'CONFIRM_WRITE' | 'QUIET' | 'SLEEP' | 'COLLAPSE' | 'EXPAND'

export const LOCAL_INTENTS: Readonly<Record<LocalIntent, readonly string[]>> = {
  ALWAYS_ON: ['항상 듣기', '항상 듣기 켜', '항상 듣기 켜줘', '항상 들어', '계속 들어', '계속 듣기'],
  ALWAYS_OFF: ['항상 듣기 꺼', '항상 듣기 꺼줘', '항상 듣기 해제', '항상 듣기 그만', '계속 듣기 꺼'],
  STOP: ['그만', '그만해', '멈춰', '스톱', '됐어', '취소'],
  CONFIRM_WRITE: ['실행확인', '실행 확인'],
  QUIET: ['조용히', '조용히 해', '조용히 해줘', '조용히 해 줘', '잠깐 꺼', '잠깐 꺼줘'],
  SLEEP: ['취침', '자러 가', '마이크 꺼', '마이크 꺼줘', '음성인식 꺼', '음성 인식 꺼', '음성인식 꺼줘', '듣지 마', '그만 들어'],
  QUIT: ['자비스 종료', '자비스 종료해', '자비스 종료해줘', '자비스 꺼', '자비스 꺼줘', '프로그램 종료', '프로그램 종료해', '프로그램 종료해줘', '종료', '종료해', '종료해줘'],
  COLLAPSE: ['화면작게', '화면 작게', '화면 줄여', '작은 화면', '화면 접어', '창 작게'],
  EXPAND: ['화면크게', '화면 크게', '전체화면', '전체 화면', '화면 펼쳐', '화면 키워', '창 크게'],
}

export function normalizeUtterance(s: string): string {
  return s.replace(/[\s.,!?。]/g, '').toLowerCase()
}

/** 되돌릴 수 있는 화면 의도는 짧은 문장(15자 이하) 안에 포함돼도 잡는다. STOP·CONFIRM_WRITE 는 완전일치만 (F-14). */
const CONTAINS_OK: ReadonlySet<LocalIntent> = new Set(['COLLAPSE', 'EXPAND'])

/** Whisper 가 조용한 구간·잡음에서 자주 지어내는 문구 */
const HALLUCINATIONS = ['시청해주셔서감사합니다', '구독과좋아요', '감사합니다', '다음영상에서만나요', 'mbc뉴스', '자막제공', '한글자막']
/** 대답할 가치가 없는 인식 결과: 한 글자 이하("아", "뱅!")이거나 환청 문구 */
export function isNoiseUtterance(utterance: string): boolean {
  const n = normalizeUtterance(utterance)
  return n.length < 2 || HALLUCINATIONS.some((h) => n === h || (n.startsWith(h) && n.length <= h.length + 4))
}

/** 두 글자열의 편집 거리 (자모 비교용) */
function lev(r: readonly string[], h: readonly string[]): number {
  let prev: number[] = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur: number[] = [i]
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[h.length]!
}
/** 한글을 자모로 풀어 비교한 오류율: "화긴"·"왕인"은 글자로는 "확인"과 전혀 다르지만 자모로는 가깝다 */
const jamoCer = (ref: string, hyp: string): number => lev([...ref.normalize('NFD')], [...hyp.normalize('NFD')]) / [...ref.normalize('NFD')].length

const DENY_WORDS = ['취소', '아니', '안돼', '안해', '하지마', '말고', '멈춰', '그만', '싫어', '됐어', '노노']
const YES_WORDS = ['네', '예', '응', '그래', '맞아', '좋아', '오케이', '진행', '진행해', '진행해줘', '실행', '실행해', '실행해줘', '해줘', '승인', '허가', '열어', '열어줘']
/** 확인 대기 중의 거절. 거절 말이 하나라도 들어 있으면 거절이 이긴다. */
export function isDenyUtterance(utterance: string): boolean {
  const n = normalizeUtterance(utterance)
  return DENY_WORDS.some((w) => n.includes(w))
}
/** 확인 대기 중의 승인. Whisper 가 "실행 확인"을 "실형 확인"·"실환 왕인"·"응답 화긴"처럼 받아 적으므로
 * (1) 흔한 승인 말 완전일치 (2) 전체가 "실행확인"과 자모 50% 이내 (3) 끝 두 글자가 "확인"과 자모 40% 이내 를 받아 준다. */
export function isConfirmUtterance(utterance: string): boolean {
  const n = normalizeUtterance(utterance)
  if (!n || n.length > 8 || isDenyUtterance(n)) return false
  if (YES_WORDS.includes(n)) return true
  return jamoCer('실행확인', n) <= 0.5 || (n.length >= 2 && jamoCer('확인', [...n].slice(-2).join('')) <= 0.4)
}

export function matchLocalIntent(utterance: string, enabled: readonly LocalIntent[] = ['STOP']): LocalIntent | null {
  const n = normalizeUtterance(utterance)
  for (const intent of enabled) {
    if (LOCAL_INTENTS[intent].some((p) => normalizeUtterance(p) === n)) return intent
  }
  if (n.length <= 15) {
    for (const intent of enabled) {
      if (CONTAINS_OK.has(intent) && LOCAL_INTENTS[intent].some((p) => n.includes(normalizeUtterance(p)))) return intent
    }
  }
  return null
}
