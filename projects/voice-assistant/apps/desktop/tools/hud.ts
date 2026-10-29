// HUD 도구(in-process, 무확인 §6.2): 두뇌가 "화면 작게/크게" 류를 이해했을 때 호출한다.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { text } from './util.js'

export function hudServer(setMode: (m: 'orb' | 'full') => void) {
  return createSdkMcpServer({
    name: 'hud', version: '0.1.0',
    instructions: '자비스 화면(HUD) 제어. 확인 없이 실행한다.',
    tools: [
      tool('hud_collapse', 'HUD 를 작은 오브+자막 패널로 접는다', {}, async () => { setMode('orb'); return text('화면을 접었습니다') }),
      tool('hud_expand', 'HUD 를 전체 화면 관제 모드로 펼친다', {}, async () => { setMode('full'); return text('전체 화면입니다') }),
    ],
  })
}
