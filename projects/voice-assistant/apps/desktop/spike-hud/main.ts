// spike:hud — 명세 F-26 의 단일 투명 창을 그대로 만들고, 렌더러가 60초 동안 잰 평균 fps 를 stdout 으로 내보낸다.
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'

const SECONDS = Number(process.env.JARVIS_HUD_SECONDS ?? '60')

app.whenReady().then(() => {
  const { bounds } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(import.meta.dirname, 'preload.cjs') },
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(import.meta.dirname, 'index.html'), { query: { seconds: String(SECONDS) } })
  ipcMain.on('fps', (_e, avg: number, frames: number) => {
    console.log(JSON.stringify({ fps: avg, frames, windows: BrowserWindow.getAllWindows().length }))
    app.exit(avg >= 58 ? 0 : 1)
  })
})
app.on('window-all-closed', () => app.quit())
