import { contextBridge, ipcRenderer } from 'electron'

// 렌더러에 노출하는 채널은 이것뿐이다 (명세 §4 렌더러 격리).
contextBridge.exposeInMainWorld('jarvis', {
  reportFps: (avg: number, frames: number) => ipcRenderer.send('fps', avg, frames),
})
