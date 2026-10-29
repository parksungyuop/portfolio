// 타이머·알람·리마인더 (읽기·쓰기 모두 무확인 §6.2 — 되돌릴 수 있고 PC 밖으로 나가지 않는다).
// 저장은 reminders.json. 울림은 30초마다 시각 비교 — 절전에서 깨어나도 지난 알림을 놓치지 않는다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { fail, text } from './util.js'

export interface Reminder { id: number; text: string; at: string }

export class ReminderStore {
  private items: Reminder[] = []
  private seq = 0
  constructor(private readonly file: string, private readonly now: () => number = Date.now) {
    try { if (existsSync(file)) { this.items = JSON.parse(readFileSync(file, 'utf8')) as Reminder[]; this.seq = Math.max(0, ...this.items.map((r) => r.id)) } } catch { this.items = [] }
  }
  private save(): void { try { writeFileSync(this.file, JSON.stringify(this.items, null, 2)) } catch { /* 디스크 실패는 메모리로만 */ } }
  list(): Reminder[] { return [...this.items].sort((a, b) => a.at.localeCompare(b.at)) }
  add(txt: string, at: string): Reminder | string {
    const t = Date.parse(at)
    if (Number.isNaN(t)) return `시각을 읽을 수 없습니다: ${at}`
    if (t <= this.now()) return '이미 지난 시각입니다'
    const r = { id: ++this.seq, text: txt.trim(), at: new Date(t).toISOString() }
    this.items.push(r); this.save(); return r
  }
  cancel(id: number): boolean { const n = this.items.length; this.items = this.items.filter((r) => r.id !== id); if (n !== this.items.length) this.save(); return n !== this.items.length }
  /** 시각이 된 알림을 꺼내 삭제한다 (호출자가 울린다) */
  due(): Reminder[] { const now = this.now(); const d = this.items.filter((r) => Date.parse(r.at) <= now); if (d.length) { this.items = this.items.filter((r) => Date.parse(r.at) > now); this.save() } return d }
}

export const fmtAt = (iso: string): string => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export function remindersServer(store: ReminderStore) {
  return createSdkMcpServer({
    name: 'reminders', version: '0.1.0',
    instructions: '타이머·알람·미리 알림. "10분 뒤"·"내일 9시"는 메시지 앞의 [지금 …] 시각으로 계산해 at 에 ISO 8601(+09:00 포함)로 넣는다. 확인 없이 실행한다.',
    tools: [
      tool('reminder_set', '알림을 건다. at = ISO 8601 시각', { text: z.string().min(1).max(200), at: z.string() }, async ({ text: t, at }) => {
        const r = store.add(t, at); return typeof r === 'string' ? fail(r) : text(`알림 #${r.id}: ${fmtAt(r.at)} "${r.text}"`)
      }),
      tool('reminder_list', '걸려 있는 알림 목록', {}, async () => { const l = store.list(); return text(l.length ? l.map((r) => `#${r.id} ${fmtAt(r.at)} ${r.text}`).join('\n') : '걸린 알림 없음') }),
      tool('reminder_cancel', '알림 취소', { id: z.number().int() }, async ({ id }) => (store.cancel(id) ? text(`알림 #${id} 취소`) : fail(`알림 #${id} 없음`))),
    ],
  })
}
