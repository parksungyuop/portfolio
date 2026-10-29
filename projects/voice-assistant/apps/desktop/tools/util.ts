import { execFile } from 'node:child_process'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] })
export const fail = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }], isError: true })
export const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')

/** 여러 줄 본문용: 줄바꿈을 AppleScript linefeed 로 잇는다 */
export const escLines = (s: string): string => s.split(/\r?\n/).map(esc).join('" & linefeed & "')

export function osascript(script: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message)); else resolve(stdout.trim())
    })
  })
}
export async function open(args: string[], timeoutMs = 8000): Promise<void> {
  // macOS 밖: 마지막 인자(URL)를 기본 앱으로 연다. electron 은 여기서만 불러 테스트(node)에서 이 모듈을 그대로 import 할 수 있게 한다.
  if (process.platform !== 'darwin') { const { shell } = await import('electron'); return shell.openExternal(args[args.length - 1]!) }
  return new Promise((resolve, reject) => execFile('open', args, { timeout: timeoutMs }, (err, _o, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve())))
}
export async function fetchJson<T>(url: string, ms = 6000): Promise<T> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': 'jarvis/0.1' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as T }
  finally { clearTimeout(t) }
}
