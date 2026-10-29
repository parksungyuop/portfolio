// 명세 §5 상태 기계. 전이표는 fixtures/state-transitions.json 이 단일 출처이고 이 파일은 그것을 읽어 실행만 한다.
export type JarvisState = 'IDLE' | 'WAKE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'FOLLOWUP' | 'LOCKED'
export type JarvisEvent =
  | 'wake' | 'hotkey' | 'ear_started' | 'final' | 'silence' | 'stop_intent'
  | 'first_sentence' | 'brain_done_empty' | 'brain_error' | 'timeout' | 'speech_done'
  | 'lock' | 'unlock'

export type TransitionRow = readonly [JarvisState, JarvisEvent, JarvisState]

export class StateMachine {
  private readonly table = new Map<string, JarvisState>()
  private current: JarvisState = 'IDLE'
  private readonly listeners: Array<(next: JarvisState, prev: JarvisState, ev: JarvisEvent) => void> = []

  constructor(rows: readonly TransitionRow[]) {
    for (const [from, ev, to] of rows) {
      const k = `${from}:${ev}`
      if (this.table.has(k)) throw new Error(`전이표 중복: ${k}`)
      this.table.set(k, to)
    }
  }
  get state(): JarvisState { return this.current }
  onChange(fn: (next: JarvisState, prev: JarvisState, ev: JarvisEvent) => void): void { this.listeners.push(fn) }
  /** 표에 없는 [상태, 이벤트] 는 무시하고 false 를 돌려준다 — 예외를 던지지 않는다 (F-27: 크래시 루프 금지). */
  send(ev: JarvisEvent): boolean {
    const to = this.table.get(`${this.current}:${ev}`)
    if (!to) return false
    const prev = this.current
    this.current = to
    for (const l of this.listeners) l(to, prev, ev)
    return true
  }
}
