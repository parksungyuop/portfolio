// 문자 오류율(CER). 공백·구두점·기호를 지운 뒤 레벤슈타인 거리 / 참조 길이.
// spike:stt 의 통과 기준(평균 ≤ 0.10)이 이 함수 하나에 걸려 있다 — 정의를 바꾸면 verification.md 의 과거 행과 비교가 깨진다.
const STRIP = /[\s\p{P}\p{S}]/gu

export function normalizeForCer(s: string): string {
  return s.normalize('NFC').replace(STRIP, '')
}

export function cer(reference: string, hypothesis: string): number {
  const r = [...normalizeForCer(reference)]
  const h = [...normalizeForCer(hypothesis)]
  if (r.length === 0) return h.length === 0 ? 0 : 1
  let prev: number[] = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur: number[] = [i]
    for (let j = 1; j <= h.length; j++) {
      const cost = r[i - 1] === h[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
    }
    prev = cur
  }
  return prev[h.length]! / r.length
}
