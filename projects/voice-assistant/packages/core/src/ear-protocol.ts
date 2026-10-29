// jarvis-ear(Swift) ↔ main 사이의 JSON lines 계약. 명세 §5.
// 헬퍼가 무엇을 내보내든 여기서 걸러진다 — 모르는 타입은 조용히 버리지 않고 null 로 돌려 호출자가 로그하게 한다.
export type EarErrorCode = 'MIC_DENIED' | 'ASSET_MISSING' | 'LOCALE_UNSUPPORTED' | 'ENGINE'

export type EarEvent =
  | { t: 'ready'; installed: boolean }
  | { t: 'partial'; text: string }
  | { t: 'final'; text: string; ms: number }
  | { t: 'error'; code: EarErrorCode; detail?: string }
  | { t: 'pcm'; b64: string }

export type EarCommand = { cmd: 'start' } | { cmd: 'pause' } | { cmd: 'stop' }

const ERROR_CODES: readonly EarErrorCode[] = ['MIC_DENIED', 'ASSET_MISSING', 'LOCALE_UNSUPPORTED', 'ENGINE']

export function parseEarLine(line: string): EarEvent | null {
  let v: unknown
  try {
    v = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  switch (o.t) {
    case 'ready':
      return typeof o.installed === 'boolean' ? { t: 'ready', installed: o.installed } : null
    case 'partial':
      return typeof o.text === 'string' ? { t: 'partial', text: o.text } : null
    case 'final':
      return typeof o.text === 'string' && typeof o.ms === 'number' ? { t: 'final', text: o.text, ms: o.ms } : null
    case 'pcm':
      return typeof o.b64 === 'string' ? { t: 'pcm', b64: o.b64 } : null
    case 'error': {
      const code = ERROR_CODES.find((c) => c === o.code)
      if (!code) return null
      return typeof o.detail === 'string' ? { t: 'error', code, detail: o.detail } : { t: 'error', code }
    }
    default:
      return null
  }
}

export function serializeEarCommand(c: EarCommand): string {
  return JSON.stringify(c) + '\n'
}
