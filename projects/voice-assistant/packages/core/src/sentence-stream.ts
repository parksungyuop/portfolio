// 스트리밍 델타를 문장 단위로 내보낸다 (F-12). 델타가 쪼개져 들어와도 문장 경계는 splitSentences 와 같은 규칙.
import { splitSentences } from './sentences.js'

export class SentenceStream {
  private buf = ''
  /** 델타를 넣고, 완성된 문장들을 돌려준다. 마지막 미완성 조각은 남긴다. */
  push(delta: string): string[] {
    this.buf += delta
    const parts = splitSentences(this.buf)
    if (parts.length === 0) return []
    // 버퍼가 문장 종결 부호(+공백)로 끝나지 않으면 마지막 조각은 미완성이다
    const endsClosed = /[.!?]\s*$/.test(this.buf) && !/\d\.\s*$/.test(this.buf)
    const done = endsClosed ? parts : parts.slice(0, -1)
    const rest = endsClosed ? '' : parts[parts.length - 1]!
    this.buf = rest
    return done
  }
  /** 스트림 종료: 남은 조각을 내보낸다. */
  flush(): string[] {
    const r = this.buf.trim()
    this.buf = ''
    return r ? [r] : []
  }
}
