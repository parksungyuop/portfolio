// 받아쓰기 (Windows): Ctrl+Shift+J 를 누르고 말하고 떼면, 받아 적은 글을 지금 커서 자리에 붙여 넣는다.
// 두뇌에 보내지 않는다. 클립보드에 넣고 Ctrl+V 를 보낸 뒤 원래 클립보드(텍스트)를 되돌린다.
import { execFile } from 'node:child_process'

export interface Clip { readText(): string; writeText(t: string): void }

/** 붙여넣기: 클립보드 → Ctrl+V → 원래 텍스트 복원. 붙여넣기 뒤 사용자가 클립보드를 바꿨으면 건드리지 않는다. */
export async function pasteText(t: string, clip: Clip, sendCtrlV: () => Promise<void>, restoreDelayMs = 300): Promise<void> {
  const prev = clip.readText()
  clip.writeText(t)
  try { await sendCtrlV() } finally { setTimeout(() => { if (clip.readText() === t) clip.writeText(prev) }, restoreDelayMs) }
}
export function winCtrlV(): Promise<void> {
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'], { timeout: 5000, windowsHide: true }, (e) => (e ? reject(e) : resolve())))
}
