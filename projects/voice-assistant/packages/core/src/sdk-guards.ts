// Agent SDK 옵션 불변식 (명세 F-11 · F-12).
// "Auto-approved tools never reach canUseTool" — allowedTools 에 와일드카드가 하나라도 들어가면
// 쓰기 도구가 확인 게이트를 건너뛴다. 이 함수는 두뇌 래퍼가 기동 시 반드시 호출하고, 테스트가 그 사실을 고정한다.
export interface ToolPolicy {
  allowedTools: readonly string[]
  tools: readonly string[]
  permissionMode: string
  includePartialMessages: boolean
  /** 격리: 사용자의 ~/.claude 설정·커넥터·MCP·스킬을 두뇌가 물려받지 않는다 (실측: 격리 없이는 Gmail/Notion 커넥터가 그대로 보였다) */
  settingSources: readonly string[]
  strictMcpConfig: boolean
  skills: readonly string[]
}

export const isMcpTool = (name: string): boolean => name.startsWith('mcp__')

export function assertToolPolicy(o: ToolPolicy): void {
  if (o.allowedTools.some((t) => t.includes('*'))) throw new Error('allowedTools must not contain wildcard entries')
  if (o.allowedTools.some((t) => !isMcpTool(t))) throw new Error('allowedTools must name mcp__ tools only')
  if (o.tools.length !== 0) throw new Error('built-in tools must be empty (tools: [])')
  if (o.permissionMode !== 'default') throw new Error('permissionMode must be "default"')
  if (!o.includePartialMessages) throw new Error('includePartialMessages must be true for sentence-level tts')
  if (o.settingSources.length !== 0) throw new Error('settingSources must be [] (isolation from ~/.claude)')
  if (!o.strictMcpConfig) throw new Error('strictMcpConfig must be true (only our mcpServers)')
  if (o.skills.length !== 0) throw new Error('skills must be [] (no user skills)')
}
