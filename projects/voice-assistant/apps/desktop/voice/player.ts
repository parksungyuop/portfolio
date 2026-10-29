// macOS 밖의 스피커: afplay/say 대신 HUD 렌더러(Web Audio·speechSynthesis)에서 소리를 낸다. 파일을 만들지 않는다.
import { ipcMain, type BrowserWindow } from 'electron'

export interface Player { play(mp3: Buffer): Promise<void>; say(text: string): Promise<void>; stop(): void }

export class HudPlayer implements Player {
  private seq = 0
  private waiting = new Map<number, () => void>()
  constructor(private readonly win: () => BrowserWindow | undefined) {
    ipcMain.on('audio:done', (_e, id: unknown) => { if (typeof id === 'number') this.finish(id) })
  }
  get busy(): boolean { return this.waiting.size > 0 }
  private finish(id: number): void { const r = this.waiting.get(id); this.waiting.delete(id); r?.() }
  private send(channel: 'audio:play' | 'audio:say', payload: object): Promise<void> {
    const w = this.win()
    if (!w || w.isDestroyed()) return Promise.resolve()
    const id = ++this.seq
    return new Promise((resolve) => { this.waiting.set(id, resolve); w.webContents.send(channel, { id, ...payload }) })
  }
  play(mp3: Buffer): Promise<void> { return this.send('audio:play', { mp3 }) }
  say(text: string): Promise<void> { return this.send('audio:say', { text }) }
  stop(): void {
    const w = this.win()
    if (w && !w.isDestroyed()) w.webContents.send('audio:stop')
    for (const id of [...this.waiting.keys()]) this.finish(id)
  }
}
