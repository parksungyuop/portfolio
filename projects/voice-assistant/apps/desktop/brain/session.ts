// 두뇌: 스트리밍 입력 장수 query 하나(§6.1, F-13). 사용자 발화를 넣으면 델타를 문장으로 내보내고, "그만"이면 interrupt().
// 5분 유휴면 세션을 닫고 sessionId 를 남겨 다음 첫 대화에서 resume 한다.
import { query, type CanUseTool, type McpSdkServerConfigWithInstance, type McpStdioServerConfig, type Options, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { assertToolPolicy, classifyBrainError, renderPersona, SentenceStream, type BrainErrorKind, type JarvisConfig } from '@jarvis/core'

export interface BrainTools { /** 지금 비서의 이름과 추가 인격 */ identity: () => { displayName: string; persona?: string | undefined; honorific: string; honorificEn: string }; servers: Record<string, McpSdkServerConfigWithInstance | McpStdioServerConfig>; readTools: string[]; disallowedTools: string[]; canUseTool: CanUseTool }

export interface BrainCallbacks {
  onSentence: (s: string) => void
  onTurnDone: (info: { text: string; sessionId: string | null }) => void
  onError: (kind: BrainErrorKind, e: unknown) => void
  onToolUse: (name: string, input?: Record<string, unknown>) => void
  log: (s: string) => void
}

export class Brain {
  private q: Query | null = null
  private pushUser: ((m: SDKUserMessage) => void) | null = null
  private closeInput: (() => void) | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private turnTimer: NodeJS.Timeout | null = null
  private inTurn = false
  /** 진행 중인 턴을 우리가 끊었다 — 뒤따라오는 실패 결과(aborted_streaming)는 오류가 아니다 */
  private aborted = false
  sessionId: string | null = null

  constructor(private readonly cfg: JarvisConfig, private readonly cb: BrainCallbacks, private resumeId: string | null, private readonly cwd: string, private readonly tools: BrainTools) {}

  private open(): void {
    if (this.q) return
    const policy = { tools: [] as string[], allowedTools: this.tools.readTools, permissionMode: 'default' as const, includePartialMessages: true, settingSources: [] as ('user' | 'project' | 'local')[], strictMcpConfig: true, skills: [] as string[] }
    assertToolPolicy(policy)
    const queue: SDKUserMessage[] = []
    let wake: (() => void) | null = null
    let closed = false
    this.pushUser = (m) => { queue.push(m); wake?.() }
    this.closeInput = () => { closed = true; wake?.() }
    const self = this
    async function* input(): AsyncGenerator<SDKUserMessage> {
      while (!closed) {
        if (queue.length) { yield queue.shift()!; continue }
        await new Promise<void>((r) => { wake = r })
        wake = null
      }
      self.cb.log('brain 입력 스트림 종료')
    }
    const options: Options = {
      ...policy,
      model: this.cfg.brain.model,
      maxTurns: this.cfg.brain.maxTurns,
      mcpServers: this.tools.servers,
      disallowedTools: this.tools.disallowedTools,
      canUseTool: this.tools.canUseTool,
      cwd: this.cwd,
      systemPrompt: renderPersona({ displayName: this.tools.identity().displayName, extra: this.tools.identity().persona, honorific: this.tools.identity().honorific, honorificEn: this.tools.identity().honorificEn, activeServers: Object.keys(this.tools.servers) }),
      // 유휴로 닫혔다 다시 열릴 때도 방금 세션을 잇는다 (없으면 지난 실행의 세션)
      ...((this.sessionId ?? this.resumeId) ? { resume: (this.sessionId ?? this.resumeId)! } : {}),
    }
    this.q = query({ prompt: input(), options })
    void this.consume(this.q)
  }

  private async consume(q: Query): Promise<void> {
    const stream = new SentenceStream()
    let text = ''
    let apiErr = false
    try {
      for await (const msg of q as AsyncIterable<SDKMessage>) {
        if (msg.type === 'system' && msg.subtype === 'init') this.sessionId = msg.session_id
        if (msg.type === 'stream_event') {
          const ev = msg.event as { type: string; delta?: { type: string; text?: string }; content_block?: { type: string; name?: string } }
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
            text += ev.delta.text
            for (const s of stream.push(ev.delta.text)) this.cb.onSentence(s)
          }
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use' && ev.content_block.name) this.cb.onToolUse(ev.content_block.name)
        }
        if (msg.type === 'assistant') {
          for (const b of msg.message.content) if (b.type === 'tool_use') this.cb.onToolUse(b.name, b.input as Record<string, unknown>)
          // CLI 가 API 오류(인증 만료 등)를 assistant 텍스트로 돌려주고 result 는 success 로 온다 → 빈 답이 아니라 오류로
          const m = msg as { isApiErrorMessage?: boolean; error?: string }
          if (m.isApiErrorMessage || m.error || (msg.message as { model?: string }).model === '<synthetic>') { apiErr = true; const t = msg.message.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ').trim(); this.aborted = false; this.cb.onError(classifyBrainError(new Error(t)), t) }
        }
        if (msg.type === 'result') {
          for (const s of stream.flush()) this.cb.onSentence(s)
          this.endTurn()
          const wasAborted = this.aborted; this.aborted = false
          if (apiErr) { apiErr = false; this.cb.log('brain api 오류 턴 종료') }
          else if (msg.subtype === 'success') this.cb.onTurnDone({ text, sessionId: this.sessionId })
          else if (wasAborted) this.cb.log('brain 중단됨(의도한 중단)')
          else this.cb.onError(classifyBrainError(new Error(('errors' in msg && Array.isArray(msg.errors) ? msg.errors.join(' ') : msg.subtype))), msg)
          text = ''; apiErr = false
        }
      }
    } catch (e) {
      this.endTurn()
      if (this.aborted) { this.aborted = false; this.cb.log('brain 중단됨(의도한 중단)') } else this.cb.onError(classifyBrainError(e), e)
    } finally {
      if (this.q === q) { this.q = null; this.pushUser = null; this.closeInput = null }
    }
  }

  /** 기동 때 미리 열어 콜드스타트를 숨긴다 (D-J22). */
  warm(): void { this.open(); this.endTurn() }

  /** 사용자 발화 한 턴. `[지금 …]` 접두는 §4의 시각 문맥. */
  ask(utterance: string): void {
    this.open()
    this.inTurn = true
    this.clearIdle()
    const now = new Date()
    const stamp = `[지금 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`
    this.pushUser?.({ type: 'user', message: { role: 'user', content: `${stamp} ${utterance}` }, parent_tool_use_id: null })
    this.turnTimer = setTimeout(() => { this.cb.log('brain 타임아웃 → interrupt'); this.aborted = true; void this.q?.interrupt(); this.endTurn(); this.cb.onError('TIMEOUT', new Error('timeout')) }, this.cfg.brain.timeoutMs)
  }
  interrupt(): void { if (this.inTurn) this.aborted = true; void this.q?.interrupt(); this.endTurn() }
  private endTurn(): void {
    this.inTurn = false
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null }
    this.clearIdle()
    this.idleTimer = setTimeout(() => this.close(), this.cfg.brain.idleCloseMs)
  }
  private clearIdle(): void { if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null } }
  close(): void { if (this.inTurn) this.aborted = true; this.clearIdle(); this.closeInput?.(); this.q = null; this.pushUser = null; this.closeInput = null }
  /** 비서가 바뀌면 대화를 잇지 않고 새 세션으로 시작한다 */
  reset(): void { this.close(); this.sessionId = null; this.resumeId = null }
  get busy(): boolean { return this.inTurn }
}
