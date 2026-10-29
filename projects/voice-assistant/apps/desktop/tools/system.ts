// PC 제어 (Windows). 음량·밝기 = 되돌릴 수 있어 무확인. 잠금·절전 = 작업을 끊으므로 확인 게이트.
// 사용자 문자열은 셸에 절대 넣지 않는다: 숫자·불리언만 zod 로 받고, 스크립트는 고정 문자열이다.
import { execFile } from 'node:child_process'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { fail, text } from './util.js'

export const SYSTEM_WRITE_TOOLS = ['mcp__system__screen_lock', 'mcp__system__system_sleep'] as const

function ps(script: string, env: Record<string, string> = {}, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout, windowsHide: true, env: { ...process.env, ...env } }, (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout.trim()))))
}
// Core Audio 의 IAudioEndpointVolume 을 C# 으로 호출한다 (외부 모듈 없음)
const AUDIO = [
  "Add-Type -TypeDefinition @'",
  'using System; using System.Runtime.InteropServices;',
  '[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioEndpointVolume { int _3(); int _4(); int _5(); int _6(); int SetMasterVolumeLevelScalar(float l, Guid c); int _8(); int GetMasterVolumeLevelScalar(out float l); int _10(); int _11(); int _12(); int _13(); int SetMute(bool m, Guid c); int GetMute(out bool m); }',
  '[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice { int Activate(ref Guid id, int ctx, IntPtr p, out IAudioEndpointVolume v); }',
  '[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator { int _0(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }',
  '[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}',
  'public static class Vol { static IAudioEndpointVolume V() { IMMDevice d; ((IMMDeviceEnumerator)new MMDeviceEnumerator()).GetDefaultAudioEndpoint(0, 1, out d); var g = typeof(IAudioEndpointVolume).GUID; IAudioEndpointVolume v; d.Activate(ref g, 23, IntPtr.Zero, out v); return v; }',
  '  public static float Get() { float l; V().GetMasterVolumeLevelScalar(out l); return l; } public static void Set(float l) { V().SetMasterVolumeLevelScalar(l, Guid.Empty); }',
  '  public static bool GetMute() { bool m; V().GetMute(out m); return m; } public static void SetMute(bool m) { V().SetMute(m, Guid.Empty); } }',
  "'@",
  '',
].join('\n')

// Spotify 데스크톱: 빠른 검색(Ctrl+K)에 곡을 치고 Shift+Enter = 맨 위 결과 재생 (2026-09-30 실측).
// 검색어는 환경 변수로만 넘긴다(스크립트는 고정 문자열). 키는 Spotify 가 앞에 있을 때만 보낸다.
// ponytail: 화면 자동 조작이라 Spotify 단축키가 바뀌면 깨진다. 깨지면 Web API(PUT /me/player/play, OAuth 필요)로 바꾼다.
const SPOTIFY_PLAY = String.raw`
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Name W -Namespace JarvisSp -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);'
function Win { Get-Process Spotify -EA SilentlyContinue | ? { $_.MainWindowHandle -ne 0 } | select -First 1 }
function Fg { $id = 0; [JarvisSp.W]::GetWindowThreadProcessId([JarvisSp.W]::GetForegroundWindow(), [ref]$id) | Out-Null; (Get-Process -Id $id -EA SilentlyContinue).ProcessName -eq 'Spotify' }
function Key($k, $ms) { if (-not (Fg)) { throw 'Spotify 창이 앞에 있지 않습니다' }; [System.Windows.Forms.SendKeys]::SendWait($k); Start-Sleep -Milliseconds $ms }
$exe = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
if (-not (Win)) { if (-not (Test-Path $exe)) { throw 'Spotify 데스크톱 앱이 설치되어 있지 않습니다' }; Start-Process $exe; for ($i = 0; $i -lt 40 -and -not (Win); $i++) { Start-Sleep -Milliseconds 500 }; Start-Sleep 3 }
$p = Win; if (-not $p) { throw 'Spotify 창을 찾지 못했습니다' }
$before = $p.MainWindowTitle
[JarvisSp.W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; [JarvisSp.W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; Start-Sleep -Milliseconds 800
Key '{ESC}' 300; Key '^k' 800
Key ($env:JARVIS_Q -replace '([+^%~(){}\[\]])', '{$1}') 3000
Key '+{ENTER}' 3500
$t = (Win).MainWindowTitle
if ($t -like 'Spotify*') { throw '재생이 시작되지 않았습니다' }
$t
`

/** 시스템 음소거 켜기/끄기 (듣는 동안 컴퓨터 소리를 잠시 끌 때) */
export const setSystemMute = (m: boolean): Promise<string> => ps(AUDIO + `[Vol]::SetMute($${m})`)

export const systemServer = createSdkMcpServer({
  name: 'system', version: '0.1.0',
  instructions: 'PC 제어: 음량·음소거·화면 밝기(노트북 내장 화면만)·화면 잠금·절전. 잠금과 절전은 사용자 확인이 필요하다.',
  tools: [
    tool('volume_get', '현재 음량(0~100)과 음소거 여부', {}, async () => { try { return text(await ps(AUDIO + '"{0} mute={1}" -f [int]([Vol]::Get()*100), [Vol]::GetMute()')) } catch (e) { return fail(`음량 확인 실패: ${(e as Error).message}`) } }),
    tool('volume_set', '음량을 0~100 으로', { level: z.number().int().min(0).max(100) }, async ({ level }) => { try { await ps(AUDIO + `[Vol]::Set(${(level / 100).toFixed(2)}); [Vol]::SetMute($false)`); return text(`음량 ${level}`) } catch (e) { return fail(`음량 설정 실패: ${(e as Error).message}`) } }),
    tool('volume_mute', '음소거 켜기/끄기', { mute: z.boolean() }, async ({ mute }) => { try { await ps(AUDIO + `[Vol]::SetMute($${mute})`); return text(mute ? '음소거' : '음소거 해제') } catch (e) { return fail(`음소거 실패: ${(e as Error).message}`) } }),
    tool('spotify_play', 'Spotify 데스크톱 앱에서 곡을 검색해 맨 위 결과를 재생한다. query = 가수와 곡 이름', { query: z.string().min(1).max(80).regex(/^[^\p{Cc}]+$/u, '제어 문자는 쓸 수 없습니다') }, async ({ query }) => {
      try { return text(`재생 중: ${await ps(SPOTIFY_PLAY, { JARVIS_Q: query }, 40000)}`) } catch (e) { return fail(`Spotify 재생 실패: ${(e as Error).message.slice(0, 200)}`) }
    }),
    tool('media_key', '재생/일시정지·다음 곡·이전 곡 미디어 키를 누른다 (Spotify 등 지금 켜진 플레이어에 전달)', { action: z.enum(['play_pause', 'next', 'prev']) }, async ({ action }) => {
      const vk = { play_pause: 0xb3, next: 0xb0, prev: 0xb1 }[action]
      try { await ps(`Add-Type -Name MK -Namespace JarvisKey -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);'; [JarvisKey.MK]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); [JarvisKey.MK]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)`); return text({ play_pause: '재생/일시정지', next: '다음 곡', prev: '이전 곡' }[action]) }
      catch (e) { return fail(`미디어 키 실패: ${(e as Error).message}`) }
    }),
    tool('brightness_set', '화면 밝기 0~100 (노트북 내장 화면만)', { level: z.number().int().min(0).max(100) }, async ({ level }) => {
      try { await ps(`(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop) | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{Timeout=0; Brightness=${level}} | Out-Null }`); return text(`밝기 ${level}`) }
      catch (e) { return fail(`밝기 설정 실패(외장 모니터는 지원 안 됨): ${(e as Error).message}`) }
    }),
    tool('screen_lock', '화면을 잠근다. 확인 필요', { confirmation: z.string().optional() }, async () => { try { await ps('rundll32.exe user32.dll,LockWorkStation'); return text('화면을 잠갔습니다') } catch (e) { return fail(`잠금 실패: ${(e as Error).message}`) } }),
    tool('system_sleep', 'PC 를 절전 모드로. 확인 필요', { confirmation: z.string().optional() }, async () => { try { await ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) | Out-Null'); return text('절전 모드로 들어갑니다') } catch (e) { return fail(`절전 실패: ${(e as Error).message}`) } }),
  ],
})
