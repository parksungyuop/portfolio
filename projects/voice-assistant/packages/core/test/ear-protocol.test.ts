import { describe, expect, it } from 'vitest'
import { parseEarLine, serializeEarCommand } from '../src/ear-protocol.js'

describe('parseEarLine', () => {
  it('final', () => {
    expect(parseEarLine('{"t":"final","text":"오늘 뭐 있어","ms":812}')).toEqual({ t: 'final', text: '오늘 뭐 있어', ms: 812 })
  })
  it('partial', () => {
    expect(parseEarLine('{"t":"partial","text":"오늘"}')).toEqual({ t: 'partial', text: '오늘' })
  })
  it('ready', () => {
    expect(parseEarLine('{"t":"ready","installed":true}')).toEqual({ t: 'ready', installed: true })
  })
  it('error with detail', () => {
    expect(parseEarLine('{"t":"error","code":"MIC_DENIED","detail":"x"}')).toEqual({ t: 'error', code: 'MIC_DENIED', detail: 'x' })
  })
  it('모르는 타입은 null', () => {
    expect(parseEarLine('{"t":"nope"}')).toBeNull()
  })
  it('모르는 오류 코드는 null', () => {
    expect(parseEarLine('{"t":"error","code":"WHAT"}')).toBeNull()
  })
  it('깨진 JSON 은 null', () => {
    expect(parseEarLine('{')).toBeNull()
  })
})

it('serializeEarCommand 는 한 줄로 끝난다', () => {
  expect(serializeEarCommand({ cmd: 'start' })).toBe('{"cmd":"start"}\n')
})

it('pcm 줄을 받는다', () => {
  expect(parseEarLine('{"t":"pcm","b64":"AAA="}')).toEqual({ t: 'pcm', b64: 'AAA=' })
})
