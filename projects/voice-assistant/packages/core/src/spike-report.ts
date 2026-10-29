// docs/verification.md 의 한 행. "동작 확인됨" 은 이 행이 있을 때만 믿는다.
export interface VerificationRow {
  command: string
  date: string
  osBuild: string
  metric: string
  value: string
  fixtureHash: string
  pass: boolean
}

export function formatVerificationRow(r: VerificationRow): string {
  return `| \`${r.command}\` | ${r.date} | ${r.osBuild} | ${r.metric} | ${r.value} | ${r.fixtureHash} | ${r.pass ? '통과' : '실패'} |`
}
