// 발화 끝 찾기: 에너지(RMS) 기준. 말이 시작된 뒤 silenceMs 만큼 조용하면 한 발화로 잘라 돌려준다.
// ponytail: 고정 RMS 문턱 — 시끄러운 방에서 오검출되면 stt.vadRms 를 올리거나 Silero VAD 로 바꾼다.
export interface EndpointerOpts { vadRms: number; silenceMs: number; minSpeechMs?: number; maxMs?: number; sampleRate?: number }

export class Endpointer {
  private chunks: Float32Array[] = []
  private speechMs = 0
  private quietMs = 0
  private keptMs = 0
  constructor(private readonly o: EndpointerOpts) {}

  reset(): void { this.chunks = []; this.speechMs = 0; this.quietMs = 0; this.keptMs = 0 }

  /** 지금까지 모은 발화를 강제로 끝낸다(누르고 말하기에서 키를 뗐을 때). 말이 없었으면 null. */
  flush(): Float32Array | null {
    const ok = this.speechMs >= (this.o.minSpeechMs ?? 300)
    const out = ok ? new Float32Array(this.chunks.reduce((n, c) => n + c.length, 0)) : null
    if (out) { let at = 0; for (const c of this.chunks) { out.set(c, at); at += c.length } }
    this.reset()
    return out
  }

  push(chunk: Float32Array): { speech: boolean; utterance: Float32Array | null } {
    const ms = (chunk.length / (this.o.sampleRate ?? 16000)) * 1000
    let sq = 0
    for (const v of chunk) sq += v * v
    const speech = Math.sqrt(sq / (chunk.length || 1)) >= this.o.vadRms
    this.chunks.push(chunk); this.keptMs += ms
    if (speech) { this.speechMs += ms; this.quietMs = 0 } else this.quietMs += ms
    // 말 시작 전에는 앞머리 2조각만 남긴다 (첫 음절이 잘리지 않게)
    if (!this.speechMs) { while (this.chunks.length > 2) { this.keptMs -= (this.chunks.shift()!.length / (this.o.sampleRate ?? 16000)) * 1000 } return { speech, utterance: null } }
    const ended = this.quietMs >= this.o.silenceMs
    if (ended && this.speechMs < (this.o.minSpeechMs ?? 300)) { this.reset(); return { speech, utterance: null } } // 딸깍 소리
    if (!ended && this.keptMs < (this.o.maxMs ?? 28000)) return { speech, utterance: null } // Whisper 창은 30초
    const out = new Float32Array(this.chunks.reduce((n, c) => n + c.length, 0))
    let at = 0
    for (const c of this.chunks) { out.set(c, at); at += c.length }
    this.reset()
    return { speech, utterance: out }
  }
}
