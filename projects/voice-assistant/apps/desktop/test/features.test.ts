import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ReminderStore } from '../tools/reminders.js'
import { parseDdg } from '../tools/search.js'
import { SYSTEM_WRITE_TOOLS } from '../tools/system.js'
import { pasteText } from '../voice/dictation.js'
import { WRITE_TOOLS } from '../brain/gate.js'

describe('ReminderStore', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'jarvis-rem-')), 'r.json')
  it('추가·목록·취소, 지난 시각 거부, 재시작 후 유지, due 는 한 번만', () => {
    let now = Date.parse('2026-09-24T09:00:00+09:00')
    const s = new ReminderStore(file, () => now)
    expect(typeof s.add('회의', '2026-09-24T08:00:00+09:00')).toBe('string')
    expect(typeof s.add('회의', 'nonsense')).toBe('string')
    const r = s.add('회의', '2026-09-24T09:10:00+09:00'); expect(typeof r).toBe('object')
    s.add('점심', '2026-09-24T12:00:00+09:00')
    expect(s.list().map((x) => x.text)).toEqual(['회의', '점심'])
    expect(new ReminderStore(file, () => now).list().length).toBe(2) // 재시작
    now = Date.parse('2026-09-24T09:10:30+09:00')
    expect(s.due().map((x) => x.text)).toEqual(['회의'])
    expect(s.due()).toEqual([])
    expect(s.cancel(999)).toBe(false)
    expect(s.list().length).toBe(1)
  })
})

describe('parseDdg', () => {
  it('제목·URL(uddg 풀기)·요약을 뽑고 http 가 아닌 링크는 버린다', () => {
    const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=x">Ex <b>ample</b></a><div class="result__snippet">요약 &amp; 설명</div>
      <a class="result__a" href="javascript:void(0)">bad</a><div class="result__snippet">x</div>
      <a class="result__a" href="https://b.com/">B</a><a class="result__snippet" href="#">B 요약</a>`
    expect(parseDdg(html)).toEqual([{ title: 'Ex ample', url: 'https://example.com/a', snippet: '요약 & 설명' }, { title: 'B', url: 'https://b.com/', snippet: 'B 요약' }])
  })
})

describe('system', () => { it('잠금·절전은 확인 게이트', () => { for (const t of SYSTEM_WRITE_TOOLS) expect(WRITE_TOOLS.has(t)).toBe(true) }) })

describe('pasteText', () => {
  it('클립보드에 넣고 Ctrl+V 뒤 원래 텍스트를 되돌린다', async () => {
    vi.useFakeTimers()
    let cb = '원래'; const clip = { readText: () => cb, writeText: (t: string) => { cb = t } }
    const seen: string[] = []
    await pasteText('받아쓴 글', clip, async () => { seen.push(cb) })
    expect(seen).toEqual(['받아쓴 글'])
    vi.advanceTimersByTime(300); expect(cb).toBe('원래')
    vi.useRealTimers()
  })
})

describe('pickApp', () => { it('같은 이름이면 설치형 앱이 크롬 웹앱보다 먼저', async () => { const { pickApp } = await import('../tools/apps.js'); expect(pickApp([{ Name: 'Spotify', AppID: 'Chrome._crx_x' }, { Name: 'Spotify', AppID: 'C:\a\Spotify.exe' }], '스포티파이') ?? pickApp([{ Name: 'Spotify', AppID: 'Chrome._crx_x' }, { Name: 'Spotify', AppID: 'C:\a\Spotify.exe' }], 'spotify')).toMatchObject({ AppID: 'C:\a\Spotify.exe' }) }) })

describe('describeStep', () => {
  it('도구 이름·입력을 진행 문구로', async () => {
    const { describeStep } = await import('../brain/gate.js')
    expect(describeStep('mcp__apps__app_open', { name: '카카오톡' })).toBe('카카오톡 실행 중...')
    expect(describeStep('mcp__apps__app_open')).toBe('앱 실행 중...')
    expect(describeStep('mcp__search__web_search', { query: '날씨' })).toBe('"날씨" 검색 중...')
    expect(describeStep('mcp__system__volume_set', { level: 30 })).toBe('음량 조절 중...')
    expect(describeStep('mcp__foo__bar')).toBe('bar 실행 중...')
  })
})
