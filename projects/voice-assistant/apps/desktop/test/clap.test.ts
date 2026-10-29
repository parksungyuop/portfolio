import { describe, expect, it } from 'vitest'
import { ClapDetector } from '../voice/clap.js'

const RATE = 16000
let seed = 1
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 2147483648 - 1 } // 결정적 백색 잡음
type Ev = { at: number; kind: 'clap' | 'thump' | 'long' | 'weak' | 'echo' }
/** 조용한 방(잡음 0.002) 위에 소리를 얹은 파형 */
function scene(seconds: number, evs: Ev[], noise = 0.002): Float32Array {
  const out = new Float32Array(Math.floor(seconds * RATE))
  for (let i = 0; i < out.length; i++) out[i] = rnd() * noise
  for (const ev of evs) {
    const start = Math.floor(ev.at * RATE)
    const len = Math.floor((ev.kind === 'long' ? 0.4 : ev.kind === 'echo' ? 0.6 : 0.06) * RATE)
    for (let i = 0; i < len && start + i < out.length; i++) {
      const t = i / RATE
      if (ev.kind === 'clap') out[start + i]! += rnd() * 0.5 * Math.exp(-t / 0.008) // 짧은 백색 잡음 버스트
      if (ev.kind === 'echo') out[start + i]! += rnd() * (0.15 * Math.exp(-t / 0.008) + 0.02 * Math.exp(-t / 0.2)) // 작은 박수 + 방 울림 꼬리
      if (ev.kind === 'weak') out[start + i]! += rnd() * 0.04 * Math.exp(-t / 0.008) // 작은 딸깍(-30dB 근처)
      if (ev.kind === 'thump') out[start + i]! += Math.sin(2 * Math.PI * 90 * t) * 0.6 * Math.exp(-t / 0.015) // 둔탁한 저음
      if (ev.kind === 'long') out[start + i]! += rnd() * 0.4 // 길게 이어지는 큰 소리
    }
  }
  return out
}
/** 앱처럼 4096 샘플씩 넣고, 호출이 몇 번 났는지 센다 */
function fires(pcm: Float32Array): number {
  const d = new ClapDetector(0.5); let n = 0
  for (let i = 0; i < pcm.length; i += 4096) if (d.push(pcm.subarray(i, i + 4096))) n++
  return n
}

describe('ClapDetector', () => {
  it('박수 두 번 → 호출 한 번', () => { expect(fires(scene(3, [{ at: 1, kind: 'clap' }, { at: 1.35, kind: 'clap' }]))).toBe(1) })
  it('아주 조용한 방에서 울림 꼬리가 남아도 두 번째 박수를 잡는다', () => { expect(fires(scene(3, [{ at: 1, kind: 'echo' }, { at: 1.35, kind: 'echo' }], 0.0003))).toBe(1) })
  it('무음 뒤에 음악이 이어져도 호출하지 않고, 그 위의 박수는 잡는다', () => {
    const pcm = scene(12, [{ at: 10, kind: 'clap' }, { at: 10.35, kind: 'clap' }])
    for (let i = 0; i < 3 * RATE; i++) pcm[i] = 0 // 음소거 구간
    for (let i = 3 * RATE; i < pcm.length; i++) pcm[i]! += rnd() * 0.03 * (1 + Math.sin(i / 1500)) // 출렁이는 음악
    expect(fires(pcm)).toBe(1)
  })
  it('한 번은 무시', () => { expect(fires(scene(3, [{ at: 1, kind: 'clap' }]))).toBe(0) })
  it('세 번 쳐도 마지막 두 번으로 호출', () => { expect(fires(scene(4, [{ at: 1, kind: 'clap' }, { at: 1.3, kind: 'clap' }, { at: 1.6, kind: 'clap' }]))).toBe(1) })
  it('박수 직전 작은 소리가 끼어도 호출', () => { expect(fires(scene(4, [{ at: 1, kind: 'weak' }, { at: 1.4, kind: 'clap' }, { at: 1.85, kind: 'clap' }]))).toBe(1) })
  it('연타 4회 이상(갈채·타자)은 무시', () => { expect(fires(scene(4, [1, 1.3, 1.6, 1.9, 2.2].map((at) => ({ at, kind: 'clap' as const }))))).toBe(0) })
  it('간격이 너무 길면 무시', () => { expect(fires(scene(5, [{ at: 1, kind: 'clap' }, { at: 2.2, kind: 'clap' }]))).toBe(0) })
  it('간격이 너무 짧으면(한 소리의 메아리) 무시', () => { expect(fires(scene(3, [{ at: 1, kind: 'clap' }, { at: 1.12, kind: 'clap' }]))).toBe(0) })
  it('길게 이어지는 큰 소리는 무시', () => { expect(fires(scene(3, [{ at: 1, kind: 'long' }, { at: 1.6, kind: 'long' }]))).toBe(0) })
  it('조용한 방에서는 아무 일도 없다', () => { expect(fires(scene(5, []))).toBe(0) })
  it('연달아 두 번 부르면 두 번 호출', () => { expect(fires(scene(6, [{ at: 1, kind: 'clap' }, { at: 1.35, kind: 'clap' }, { at: 3.5, kind: 'clap' }, { at: 3.85, kind: 'clap' }]))).toBe(2) })
})
