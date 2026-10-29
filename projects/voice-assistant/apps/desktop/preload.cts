import { contextBridge, ipcRenderer } from 'electron'
// 노출 채널은 이것뿐이다 (§4 렌더러 격리). 테스트가 이 목록을 고정한다.
contextBridge.exposeInMainWorld('jarvis', {
  onState: (fn: (p: unknown) => void) => { ipcRenderer.on('hud:state', (_e, p) => fn(p)) },
  onMeter: (fn: (m: unknown) => void) => { ipcRenderer.on('hud:meter', (_e, m) => fn(m)) },
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSetKey: (v: string) => ipcRenderer.invoke('settings:setKey', v),
  settingsUpdate: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
  calSetup: () => ipcRenderer.invoke('cal:setup'),
  micMute: (kind: string) => ipcRenderer.invoke('mic:mute', kind),
  listenToggle: () => ipcRenderer.invoke('listen:toggle'),
  assistantNext: () => ipcRenderer.invoke('assistant:next'),
  say: (text: string) => ipcRenderer.invoke('text:say', text),
  mouse: (interactive: boolean) => ipcRenderer.send('hud:mouse', interactive),
  // macOS 밖: 마이크와 스피커가 렌더러에 있다
  micReady: (ok: boolean) => ipcRenderer.send('mic:ready', ok),
  micPcm: (pcm: ArrayBuffer) => ipcRenderer.send('mic:pcm', pcm),
  micRaw: (pcm: ArrayBuffer) => ipcRenderer.send('mic:raw', pcm),
  micRef: (rms: number) => ipcRenderer.send('mic:ref', rms),
  rlog: (s: string) => ipcRenderer.send('log:renderer', s),
  onAudioPlay: (fn: (p: unknown) => void) => { ipcRenderer.on('audio:play', (_e, p) => fn(p)) },
  onAudioSay: (fn: (p: unknown) => void) => { ipcRenderer.on('audio:say', (_e, p) => fn(p)) },
  onAudioStop: (fn: () => void) => { ipcRenderer.on('audio:stop', () => fn()) },
  audioDone: (id: number) => ipcRenderer.send('audio:done', id),
})
