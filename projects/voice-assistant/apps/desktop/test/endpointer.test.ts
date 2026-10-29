import { describe, expect, it } from 'vitest'
import { Endpointer } from '../voice/endpointer.js'

const chunk = (amp: number) => new Float32Array(4096).fill(amp) // 256ms @16kHz
const feed = (ep: Endpointer, amps: number[]) => amps.map((a) => ep.push(chunk(a)).utterance).find((u) => u) ?? null

describe('Endpointer', () => {
  it('말 뒤 침묵이 silenceMs 를 넘으면 발화를 돌려준다 (앞머리는 2조각만)', () => {
    const ep = new Endpointer({ vadRms: 0.015, silenceMs: 1000 })
    const u = feed(ep, [0, 0, 0, 0, 0.1, 0.1, 0.1, 0, 0, 0, 0])
    expect(u).not.toBeNull()
    expect(u!.length).toBe(4096 * (2 + 3 + 4))
  })
  it('침묵만 있으면 아무것도 내지 않는다', () => {
    expect(feed(new Endpointer({ vadRms: 0.015, silenceMs: 1000 }), Array(20).fill(0.001))).toBeNull()
  })
  it('짧은 딸깍 소리는 버린다', () => {
    expect(feed(new Endpointer({ vadRms: 0.015, silenceMs: 1000 }), [0, 0.5, 0, 0, 0, 0, 0, 0])).toBeNull()
  })
  it('28초를 넘으면 강제로 자른다', () => {
    expect(feed(new Endpointer({ vadRms: 0.015, silenceMs: 1000 }), Array(120).fill(0.1))).not.toBeNull()
  })
})

describe('Endpointer.flush', () => {
  it('말이 있으면 침묵을 기다리지 않고 내보내고, 없으면 null', () => {
    const ep = new Endpointer({ vadRms: 0.015, silenceMs: 60000 })
    for (const a of [0, 0.1, 0.1, 0.1]) expect(ep.push(chunk(a)).utterance).toBeNull()
    expect(ep.flush()?.length).toBe(4096 * 4)
    expect(ep.flush()).toBeNull()
  })
})
