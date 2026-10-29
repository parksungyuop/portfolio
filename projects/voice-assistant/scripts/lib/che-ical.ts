// che-ical-mcp 바이너리 획득·검증 (명세 F-23). 버전과 해시는 상수로 고정한다 — 어긋나면 설치하지 않는다.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

export const CHE_ICAL_VERSION = 'v1.16.1'
export const CHE_ICAL_ASSET_URL = `https://github.com/PsychQuant/che-ical-mcp/releases/download/${CHE_ICAL_VERSION}/CheICalMCP`
export const CHE_ICAL_SHA256 = '328c9a3290504e2ce5473a3815116c48c73f67e59852671affc6fa96061c408f'
/** 절대경로. 틸데는 spawn 에서 확장되지 않는다 (명세 F-23). */
export const CHE_ICAL_BIN = path.join(homedir(), 'bin', 'CheICalMCP')

export function sha256File(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

/** 다운로드 → 해시 대조 → codesign 검증 → ~/bin 배치. 이미 검증된 바이너리가 있으면 그대로 둔다. */
export async function ensureCheIcal(): Promise<{ path: string; installed: boolean; teamId: string }> {
  if (existsSync(CHE_ICAL_BIN) && sha256File(CHE_ICAL_BIN) === CHE_ICAL_SHA256) {
    return { path: CHE_ICAL_BIN, installed: false, teamId: codesignTeamId(CHE_ICAL_BIN) }
  }
  const tmp = path.join(tmpdir(), `CheICalMCP-${CHE_ICAL_VERSION}`)
  const res = await fetch(CHE_ICAL_ASSET_URL)
  if (!res.ok) throw new Error(`che-ical-mcp 다운로드 실패: HTTP ${res.status}`)
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
  const actual = sha256File(tmp)
  if (actual !== CHE_ICAL_SHA256) throw new Error(`che-ical-mcp SHA-256 불일치: 기대 ${CHE_ICAL_SHA256.slice(0, 12)} ≠ 실제 ${actual.slice(0, 12)}`)
  chmodSync(tmp, 0o755)
  execFileSync('codesign', ['--verify', '--deep', '--strict', tmp]) // 실패하면 throw
  const teamId = codesignTeamId(tmp)
  mkdirSync(path.dirname(CHE_ICAL_BIN), { recursive: true })
  copyFileSync(tmp, CHE_ICAL_BIN)
  chmodSync(CHE_ICAL_BIN, 0o755)
  return { path: CHE_ICAL_BIN, installed: true, teamId }
}

export function codesignTeamId(bin: string): string {
  const out = execFileSync('codesign', ['-dv', '--verbose=2', bin], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    + execFileSync('codesign', ['-dv', bin], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
  const m = /TeamIdentifier=(\S+)/.exec(out)
  return m?.[1] ?? '(none)'
}
