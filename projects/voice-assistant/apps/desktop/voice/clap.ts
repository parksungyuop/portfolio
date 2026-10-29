// 박수 두 번 검출 (16kHz mono). 모델 없이 파형만 본다:
//  ① 주변 소음보다 갑자기 크고(그리고 절대 크기가 박수급이고) ② 150ms 안에 1/10 로 꺼지는 소리 = 박수 한 번
//  마지막 두 박수가 0.18~0.7초 간격이고 그 뒤 0.5초가 조용하면 = 호출. 2초 안에 4회 이상이면 갈채·타자로 보고 버린다.
// 실측(2026-09-23): 실제 박수 -13~-1dB, 키보드·잡음 -20~-26dB. 세 번 치거나 박수 직전 작은 소리가 끼어도 잡히게 "정확히 두 번" 규칙은 뺐다.
// ponytail: 규칙 기반이라 딱딱한 물건 두 번 두드리는 소리(책상 톡톡)도 통과한다. 오작동이 잦으면 sensitivity 를 내리거나 분류 모델(YAMNet)을 뒤에 붙인다.
const RATE = 16000
const FRAME = 80 // 5ms
const GAP_MIN = 0.18, GAP_MAX = 0.7, QUIET_AFTER = 0.5, DECAY_S = 0.15, REFRACTORY_S = 0.1, BURST_WINDOW = 2.0, BURST_MAX = 4

export class ClapDetector {
  private buf = new Float32Array(FRAME)
  private fill = 0
  private t = 0 // 지금까지 본 시간(초)
  private floor = 1e-6 // 주변 소음 에너지(느린 평균)
  private env = 0 // 최근 소리 크기(빠르게 꺼지는 포락선) — 울림 꼬리 위에서도 새 박수의 '솟음'을 본다
  private onset: { at: number; peak: number } | null = null // 꺼지는지 지켜보는 중인 소리
  private claps: number[] = [] // 인정된 박수 시각
  private lastOnsetAt = -1
  /** 진단용: 후보마다 한 줄 */
  debug: ((s: string) => void) | null = null
  /** sensitivity 0(둔감)~1(민감) */
  constructor(private sensitivity = 0.5) {}
  setSensitivity(s: number): void { this.sensitivity = Math.min(1, Math.max(0, s)) }

  /** PCM 을 넣는다. 박수 두 번이 확정된 순간 true. */
  push(pcm: Float32Array): boolean {
    let fired = false
    for (const x of pcm) {
      this.buf[this.fill++] = x
      if (this.fill === FRAME) { this.fill = 0; if (this.frame()) fired = true }
    }
    return fired
  }

  private frame(): boolean {
    let e = 0
    for (const x of this.buf) e += x * x
    e /= FRAME
    this.t += FRAME / RATE
    const s = this.sensitivity
    const k = 10 ** ((24 - 14 * s) / 10) // 주변 소음 대비 배수 (s=0.5 → 약 17dB)
    const loud = e > this.floor * k
    // 절대 크기 문턱은 마이크 입력 레벨에 따라 달라져 위험하다(2026-09-26: 같은 박수가 -28dB 로 들어옴). 잡음 대비 배수(k)가 주 판정이고 이건 바닥 안전장치일 뿐.
    const minPeak = 10 ** ((-34 - 12 * s) / 10) // s=0.5 → -40dB, s=1 → -46dB

    if (this.onset) {
      if (e > this.onset.peak) this.onset.peak = e
      const age = this.t - this.onset.at
      if (e < this.onset.peak * 0.1) {
        const db = (10 * Math.log10(this.onset.peak)).toFixed(0)
        if (this.onset.peak >= minPeak) { this.claps.push(this.onset.at); this.debug?.(`clap#${this.claps.length} t=${this.onset.at.toFixed(2)} peak=${db}dB floor=${(10 * Math.log10(this.floor)).toFixed(0)}dB decay=${(age * 1000).toFixed(0)}ms`) }
        else this.debug?.(`weak t=${this.onset.at.toFixed(2)} peak=${db}dB`)
        this.onset = null
      } else if (age > DECAY_S) { this.debug?.(`reject(long) t=${this.onset.at.toFixed(2)} peak=${(10 * Math.log10(this.onset.peak)).toFixed(0)}dB`); this.onset = null; this.claps = [] } // 길게 울린다 → 말소리·음악·문소리. 앞선 박수도 무효
    } else if (loud && e > this.env * 4 && this.t - this.lastOnsetAt > REFRACTORY_S) { // 직전보다 6dB 이상 솟았다
      this.onset = { at: this.t, peak: e }; this.lastOnsetAt = this.t
    }
    // 조용할 땐 바닥을 따라가고, 계속 시끄러우면(음악) 바닥을 천천히 올려 그 소리에 익숙해진다. 무음(음소거·자기 목소리 구간) 뒤에도 -70dB 밑으로는 안 내려간다
    if (!loud && !this.onset) this.floor = Math.max(1e-7, this.floor * 0.995 + e * 0.005)
    else if (loud) this.floor *= 1.003
    this.env = Math.max(e, this.env * 0.8)

    // 판정: 오래된 것은 버리고, 마지막 두 개만 본다
    this.claps = this.claps.filter((c) => this.t - c <= BURST_WINDOW)
    const c = this.claps
    if (c.length >= BURST_MAX) { this.debug?.('reject(burst)'); this.claps = []; return false }
    if (c.length >= 2) {
      const a = c[c.length - 2]!, b = c[c.length - 1]!
      const gap = b - a
      if (gap < GAP_MIN || gap > GAP_MAX) { if (gap > GAP_MAX) this.claps = [b]; return false }
      if (!this.onset && this.t - b >= QUIET_AFTER) { this.claps = []; return true }
    }
    return false
  }
}
