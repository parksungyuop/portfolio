// 단일 투명 HUD 창 (F-26, spike:hud 로 검증된 옵션 그대로). 렌더러는 상태·자막만 받는다.
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

export interface HudInfo { micOk?: boolean; mic?: string; voice?: string; wakeThreshold?: number; lastWakeAt?: number; sttMs?: number | undefined; brain?: string; brainMs?: number; turns?: number; session?: string | undefined; auth?: string; tool?: string | undefined; ttsModel?: string; ttsMs?: number | undefined; queue?: number; fallback?: string; silenceMs?: number }
export type HudPayload = { state: string; mode: 'orb' | 'full'; visible: boolean; captions: boolean; history: Array<{ at: number; who: 'boss' | 'jarvis'; text: string }>; settings: Record<string, unknown>; caption?: string; partial?: string; lastFinal?: string; widget?: string; step?: string; displayName: string; accent?: string | undefined; alwaysListen?: boolean; info: HudInfo }
export function pushMeter(win: BrowserWindow, m: { rms: number; wake: number }): void { if (!win.isDestroyed()) win.webContents.send('hud:meter', m) }

export function createHudWindow(): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, show: false, skipTaskbar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(import.meta.dirname, '..', 'preload.cjs') },
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.once('ready-to-show', () => win.showInactive())
  void win.loadFile(path.join(import.meta.dirname, '..', 'renderer', 'index.html'))
  return win
}

export function pushHud(win: BrowserWindow, p: HudPayload): void {
  if (!win.isDestroyed()) win.webContents.send('hud:state', p)
}
