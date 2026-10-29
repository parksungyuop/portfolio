// 귀: jarvis-ear 헬퍼를 IDLE 에서 미리 띄워 두고(F-16) start/pause/stop 만 보낸다. 죽으면 3초 뒤 다시 띄운다(F-27, 최대 5회/10분).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import { parseEarLine, serializeEarCommand, type EarCommand, type EarEvent } from '@jarvis/core'

export class Ear extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private restarts: number[] = []
  private stopped = false
  constructor(private readonly bin: string, private readonly silenceMs: number, private readonly log: (s: string) => void) { super() }

  spawnHelper(): void {
    if (this.stopped) return
    const p = spawn(this.bin, ['--silence-ms', String(this.silenceMs), '--pcm'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc = p
    createInterface({ input: p.stdout }).on('line', (l) => {
      const ev = parseEarLine(l)
      if (!ev) { this.log(`ear 계약 밖 줄: ${l.slice(0, 120)}`); return }
      this.emit('event', ev)
    })
    p.stderr.on('data', (d: Buffer) => this.log(`ear: ${d.toString().trim()}`))
    p.on('exit', (code) => {
      this.proc = null
      this.emit('exit', code)
      if (this.stopped) return
      const now = Date.now()
      this.restarts = this.restarts.filter((t) => now - t < 10 * 60 * 1000)
      if (this.restarts.length >= 5) { this.emit('event', { t: 'error', code: 'ENGINE', detail: '헬퍼가 반복 종료' } satisfies EarEvent); return }
      this.restarts.push(now)
      setTimeout(() => this.spawnHelper(), 3000)
    })
  }
  send(cmd: EarCommand): void { this.proc?.stdin.write(serializeEarCommand(cmd)) }
  start(): void { this.send({ cmd: 'start' }) }
  pause(): void { this.send({ cmd: 'pause' }) }
  shutdown(): void { this.stopped = true; this.send({ cmd: 'stop' }); setTimeout(() => this.proc?.kill(), 300) }
}
