// 발화용 텍스트 처리 (명세 F-28).
// 자막은 원문, 음성은 여기서 나온 문자열이다. 세 함수는 전부 순수 함수이고 vitest 스냅샷이 결정한다.

const HOURS_KO = ['열두', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한'] as const

/** 문장 경계로 자른다. 숫자 사이의 점(27.6)은 경계가 아니다. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    buf += c
    const prev = text[i - 1] ?? ''
    const next = text[i + 1] ?? ''
    const decimalDot = c === '.' && /\d/.test(prev) && /\d/.test(next)
    const isEnd = /[.!?]/.test(c) && !decimalDot
    if (isEnd && (next === '' || /\s/.test(next))) {
      out.push(buf.trim())
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** 최대 길이 안의 마지막 문장 경계에서 자른다. 나머지는 자막에만 간다. */
export function cutForSpeech(text: string, max = 240): { speak: string; rest: string } {
  if (text.length <= max) return { speak: text, rest: '' }
  const parts = splitSentences(text)
  let speak = ''
  for (const p of parts) {
    const candidate = (speak + ' ' + p).trim()
    if (candidate.length > max) break
    speak = candidate
  }
  if (!speak) speak = parts[0]!.slice(0, max)
  const rest = text.slice(text.indexOf(speak) + speak.length).trim()
  return { speak, rest }
}

/** 화면용 표기를 귀로 듣기 좋은 표기로. 58/93 → 93편 중 58편, 27.6° → 27.6도, 18:00 → 오후 여섯 시 */
export function normalizeForSpeech(s: string): string {
  return s
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_m, a: string, b: string) => `${b}편 중 ${a}편`)
    .replace(/(\d+(?:\.\d+)?)\s*°/g, '$1도')
    .replace(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g, (_m, h: string, m: string) => {
      const hh = Number(h)
      const ap = hh < 12 ? '오전' : '오후'
      const hk = HOURS_KO[hh % 12]!
      const mm = Number(m)
      return mm === 0 ? `${ap} ${hk} 시` : `${ap} ${hk} 시 ${mm}분`
    })
}
