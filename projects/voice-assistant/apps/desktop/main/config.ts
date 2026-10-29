// 설정·상태·로그. 설정이 깨지면 예외를 던지고 index 가 알림 뒤 exit(0) 한다 (F-27).
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { parseConfig, type JarvisConfig } from '@jarvis/core'
import { configPath, logPath, statePath, supportDir } from './paths.js'

export function loadConfig(): JarvisConfig {
  mkdirSync(supportDir(), { recursive: true })
  const p = configPath()
  if (!existsSync(p)) writeFileSync(p, '{}\n')
  return parseConfig(JSON.parse(readFileSync(p, 'utf8')))
}

export interface JarvisStateFile { sessionId?: string; lastReadyAt?: string; hudMode?: 'orb' | 'full'; assistantId?: string; /** 호출 없이 모든 말을 듣는다 (Windows) */ alwaysListen?: boolean }
export function loadState(): JarvisStateFile {
  try { return JSON.parse(readFileSync(statePath(), 'utf8')) as JarvisStateFile } catch { return {} }
}
export function saveState(s: JarvisStateFile): void { writeFileSync(statePath(), JSON.stringify(s, null, 2)) }

/** 로그에는 비밀이 들어갈 자리가 없다: 키는 어디서도 문자열로 만들지 않는다. */
let logDay = ''
export function log(line: string): void {
  // 로그는 하루치만 둔다: 날짜가 바뀌면(기동 시 포함) 어제 파일을 지운다
  const day = new Date().toDateString()
  if (day !== logDay) { logDay = day; try { if (statSync(logPath()).mtime.toDateString() !== day) rmSync(logPath()) } catch { /* 파일 없음 */ } }
  const s = `${new Date().toISOString()} ${line}\n`
  try { appendFileSync(logPath(), s) } catch { /* 로그 실패는 무시 */ }
  if (!process.env.JARVIS_QUIET) process.stdout.write(s)
}
