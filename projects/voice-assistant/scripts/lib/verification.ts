// 스파이크 결과를 docs/verification.md 에 한 줄로 남긴다. 스파이크는 이 파일을 통해서만 "확인됨" 을 주장한다.
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { formatVerificationRow, type VerificationRow } from '@jarvis/core'

export const osBuild = (): string => execSync('sw_vers -buildVersion').toString().trim()
export const today = (): string => new Date().toISOString().slice(0, 10)
export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex').slice(0, 12)

export function appendVerification(row: Omit<VerificationRow, 'date' | 'osBuild'>): void {
  const line = formatVerificationRow({ ...row, date: today(), osBuild: osBuild() })
  appendFileSync('docs/verification.md', line + '\n')
  console.log(line)
}
