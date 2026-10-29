import { BrowserWindow } from 'electron'
import path from 'node:path'
let win: BrowserWindow | null = null
export function openSettings(): void {
  if (win && !win.isDestroyed()) { win.focus(); return }
  win = new BrowserWindow({ width: 460, height: 300, title: 'Jarvis 설정', resizable: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(import.meta.dirname, '..', 'preload.cjs') } })
  void win.loadFile(path.join(import.meta.dirname, 'settings.html'))
}
