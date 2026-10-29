import { expect, it } from 'vitest'
import { renderPersona } from '../src/persona.js'

it('활성 서버가 없으면 잡담만, 금지 항목은 항상', () => {
  const p = renderPersona({ displayName: 'JARVIS', activeServers: [] })
  expect(p).toContain('잡담만')
  expect(p).toContain('할 수 없다고 말한다')
  expect(renderPersona({ displayName: 'JARVIS', activeServers: ['weather'] })).toContain('weather')
  expect(renderPersona({ displayName: 'JARVIS', activeServers: [], honorific: '홍길동 님', honorificEn: 'President Hong' })).toContain('"홍길동 님"')
  expect(renderPersona({ displayName: 'JARVIS', activeServers: [] })).toContain('다나까체')
  expect(renderPersona({ displayName: 'FRIDAY', activeServers: [], extra: '경쾌하게' })).toContain('경쾌하게')
})
