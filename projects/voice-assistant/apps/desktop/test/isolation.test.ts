import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('렌더러 격리 (명세 §4)', () => {
  it('preload 가 노출하는 채널 목록은 고정', () => {
    const src = read('../preload.cts')
    const channels = [...src.matchAll(/ipcRenderer\.(?:on|invoke|send)\('([^']+)'/g)].map((m) => m[1])
    expect(channels.sort()).toEqual(['assistant:next', 'audio:done', 'audio:play', 'audio:say', 'audio:stop', 'cal:setup', 'hud:meter', 'hud:mouse', 'hud:state', 'listen:toggle', 'log:renderer', 'mic:mute', 'mic:pcm', 'mic:raw', 'mic:ready', 'mic:ref', 'settings:get', 'settings:setKey', 'settings:update', 'text:say'])
  })
  it('HUD 창 옵션: sandbox·contextIsolation·nodeIntegration false·클릭 통과·항상 위', () => {
    const src = read('../main/hud-window.ts')
    expect(src).toMatch(/contextIsolation: true/)
    expect(src).toMatch(/sandbox: true/)
    expect(src).toMatch(/nodeIntegration: false/)
    expect(src).toMatch(/setIgnoreMouseEvents\(true/)
    expect(src).toMatch(/setAlwaysOnTop\(true, 'screen-saver'\)/)
  })
  it('HUD HTML 의 CSP 는 connect-src none 이고 외부 오리진 URL 이 없다', () => {
    const html = read('../renderer/index.html') + read('../renderer/hud.js') + read('../renderer/hud.css')
    expect(html).toMatch(/connect-src 'none'/)
    expect(html).not.toMatch(/https?:\/\//)
  })
  it('로그·설정 모듈은 비밀 키 문자열을 다루지 않는다', () => {
    expect(read('../main/config.ts')).not.toMatch(/ELEVENLABS_API_KEY|apiKey/)
  })
})

describe('도구 서버', () => {
  it('media.open_url 은 http/https 만', async () => {
    const src = read('../tools/media.ts')
    expect(src).toMatch(/protocol === 'http:' \|\| x.protocol === 'https:'/)
  })
  it('쓰기 도구 목록이 comms 선언과 게이트에서 같다', async () => {
    const { COMMS_WRITE_TOOLS } = await import('../tools/comms.js')
    const { WRITE_TOOLS } = await import('../brain/gate.js')
    for (const t of COMMS_WRITE_TOOLS) expect(WRITE_TOOLS.has(t)).toBe(true)
  })
})
