import { expect, it } from 'vitest'
import { formatVerificationRow } from '../src/spike-report.js'

it('표 한 줄을 만든다', () => {
  expect(
    formatVerificationRow({ command: 'pnpm spike:stt', date: '2026-09-05', osBuild: '25G76', metric: 'CER avg', value: '0.06', fixtureHash: 'abc123', pass: true }),
  ).toBe('| `pnpm spike:stt` | 2026-09-05 | 25G76 | CER avg | 0.06 | abc123 | 통과 |')
})

it('실패는 실패라고 적는다', () => {
  expect(formatVerificationRow({ command: 'x', date: 'd', osBuild: 'b', metric: 'm', value: 'v', fixtureHash: '-', pass: false })).toContain('| 실패 |')
})
