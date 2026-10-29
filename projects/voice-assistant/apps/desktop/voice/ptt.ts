// 누르고 말하기(Windows): Ctrl+J 를 누르고 있는 동안 듣고, 떼면 바로 보낸다.
// Electron globalShortcut 은 "뗌"을 알려 주지 않아서, 두 키(Ctrl·J)의 눌림 상태만 30ms 마다 확인하는 작은 PowerShell 헬퍼를 둔다.
// 다른 키는 보지 않고, 키 입력을 가로채지도 않는다 (그래서 Ctrl+J 는 앞에 있는 앱에도 그대로 전달된다).
import { spawn, type ChildProcess } from 'node:child_process'

const SCRIPT = `
Add-Type -Name K -Namespace JarvisPtt -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);'
$held = $false; $heldD = $false
while ($true) {
  $ctrl = ([JarvisPtt.K]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0
  $j = ([JarvisPtt.K]::GetAsyncKeyState(0x4A) -band 0x8000) -ne 0
  $alt = ([JarvisPtt.K]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0
  $shift = ([JarvisPtt.K]::GetAsyncKeyState(0x10) -band 0x8000) -ne 0
  $now = $ctrl -and $j -and (-not $alt) -and (-not $shift)
  $nowD = $ctrl -and $j -and (-not $alt) -and $shift
  if ($now -ne $held) { $held = $now; if ($now) { 'down' } else { 'up' }; [Console]::Out.Flush() }
  if ($nowD -ne $heldD) { $heldD = $nowD; if ($nowD) { 'ddown' } else { 'dup' }; [Console]::Out.Flush() }
  Start-Sleep -Milliseconds 30
}`

export class PushToTalk {
  private proc: ChildProcess | null = null
  private muteUntil = 0
  constructor(private readonly onDown: () => void, private readonly onUp: () => void, private readonly log: (s: string) => void, private readonly onDictDown: () => void = () => {}, private readonly onDictUp: () => void = () => {}) {}
  /** 우리가 보내는 Ctrl+V 를 누름으로 오해하지 않게 잠깐 판정을 멈춘다 */
  mute(ms: number): void { this.muteUntil = Date.now() + ms }
  start(): void {
    if (process.platform !== 'win32' || this.proc) return
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    this.proc = p
    p.stdout!.on('data', (d: Buffer) => { for (const l of d.toString().split(/\r?\n/)) { if (Date.now() < this.muteUntil) continue; if (l === 'down') this.onDown(); else if (l === 'up') this.onUp(); else if (l === 'ddown') this.onDictDown(); else if (l === 'dup') this.onDictUp() } })
    p.on('exit', () => { if (this.proc === p) { this.proc = null; this.log('누르고 말하기 헬퍼 종료') } })
    this.log('누르고 말하기 Ctrl+J · 받아쓰기 Ctrl+Shift+J 준비')
  }
  stop(): void { this.proc?.kill(); this.proc = null }
}
