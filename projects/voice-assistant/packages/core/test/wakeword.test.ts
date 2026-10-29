import { describe, expect, it } from 'vitest'
import { countDetections, frames80ms, WakeWordDetector, wavToFloat32, type SessionLike } from '../src/wakeword.js'

function wav16(samples: number[]): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2))
  return b
}

describe('wavToFloat32', () => {
  it('16k mono PCM16 을 float32 로', () => {
    const r = wavToFloat32(wav16([0, 16384, -16384]))
    expect(r.sampleRate).toBe(16000)
    expect(Array.from(r.samples)).toEqual([0, 0.5, -0.5])
  })
  it('RIFF 아니면 거부', () => {
    expect(() => wavToFloat32(Buffer.from('nope'))).toThrow(/RIFF/)
  })
})

it('80ms 프레임 = 1280 샘플', () => {
  expect(frames80ms(new Float32Array(2560 + 100)).length).toBe(2)
})

it('countDetections 는 연속 초과를 한 번으로 센다', () => {
  expect(countDetections([0, 0.6, 0.7, 0.2, 0.9, 0.9, 0])).toBe(2)
})

describe('WakeWordDetector (가짜 세션)', () => {
  // mel: 1280 샘플 → 8프레임×32, emb: 96, cls: 마지막 임베딩 평균을 점수로
  const mel: SessionLike = { inputNames: ['input'], outputNames: ['output'], run: async (f) => { const x = f['input'] as { dims: number[] }; if (x.dims[1] !== 1760) throw new Error('mel input must be 1760 (1280+480)'); return { output: { data: new Float32Array(8 * 32).fill(-20), dims: [1, 1, 8, 32] } } } }
  const emb: SessionLike = { inputNames: ['input_1'], outputNames: ['out'], run: async () => ({ out: { data: new Float32Array(96).fill(0.5), dims: [1, 1, 1, 96] } }) }
  const cls: SessionLike = { inputNames: ['x'], outputNames: ['y'], run: async (f) => { const t = f['x'] as { data: Float32Array }; return { y: { data: new Float32Array([t.data[0]!]), dims: [1, 1] } } } }
  const ort = { Tensor: class { constructor(public type: string, public data: Float32Array, public dims: number[]) {} } }
  it('임베딩 16개가 모이기 전엔 0, 모이면 점수', async () => {
    const d = new WakeWordDetector(ort, { mel, emb, cls })
    let score = 0
    // 76프레임 창 첫 임베딩까지 10프레임(80프레임), 이후 8프레임마다 1개 → 16개는 프레임 ≈ 10 + 15
    for (let i = 0; i < 26; i++) score = await d.pushPcm16k(new Float32Array(1280))
    expect(score).toBeCloseTo(0.5)
  })
  it('프레임 크기 검사', async () => {
    const d = new WakeWordDetector(ort, { mel, emb, cls })
    await expect(d.pushPcm16k(new Float32Array(100))).rejects.toThrow(/1280/)
  })
})
