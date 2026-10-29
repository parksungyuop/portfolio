// 자비스 목소리 후보와 설정. 커뮤니티 가이드 공통값: 안정성 높게(0.75~0.8), 유사도 높게(0.9), 스타일 0.
// 실제 배우 음성 복제는 하지 않는다 — 라이브러리 공유 음성(플랫폼이 허용한 것)과 Voice Design 결과만 쓴다.
export interface VoiceCandidate { id: string; name: string; source: 'library' | 'design'; note: string }

export const JARVIS_VOICE_SETTINGS = { stability: 0.78, similarity_boost: 0.9, style: 0, use_speaker_boost: true } as const

export const VOICE_CANDIDATES: readonly VoiceCandidate[] = [
  { id: 'V0B1EeDki8tyeaX5xSVO', name: 'JARVIS', source: 'design', note: '2026-09-05 Voice Design 음성 2. 중저음·절제·위트 프롬프트, 보스가 선택' },
  { id: 'wDsJlOXPqcvIUKdLXjDs', name: 'Jarvis', source: 'library', note: '영국식 단조 로봇 톤. 추가 요금 $0.20/1k 크레딧' },
  { id: 'xru6qZB94sJdkyqP12qN', name: 'James - English Butler', source: 'library', note: '집사 콘셉트, ko 포함 15개 언어 검증' },
  { id: '7p1Ofvcwsv7UBPoFNcpI', name: 'Julian - Deep, Rich and Mature', source: 'library', note: '깊고 성숙, 27개 언어' },
  { id: 'cso37AjcTkVqyjGkWbRz', name: 'Mark - Calm British Authority', source: 'library', note: '차분한 권위' },
  { id: 'sIivXWc5MTlPIP3kJXhg', name: 'Hayes M - Calm British AI Customer Care', source: 'library', note: 'AI 비서용 녹음' },
  { id: 'AeRdCCKzvd23BpJoofzx', name: 'Nathaniel - Engaging, British and Calm', source: 'library', note: '인기, 미스터리 톤' },
]

// 기본은 James(집사 콘셉트, 한국어 검증). 목록 첫 줄의 Voice Design 음성은 만든 계정에서만 쓸 수 있다.
export const DEFAULT_VOICE_ID = 'xru6qZB94sJdkyqP12qN'

export function findVoice(idOrName: string): VoiceCandidate | undefined {
  const q = idOrName.trim().toLowerCase()
  return VOICE_CANDIDATES.find((v) => v.id === idOrName || v.name.toLowerCase().startsWith(q))
}
