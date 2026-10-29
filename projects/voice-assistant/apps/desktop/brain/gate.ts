// 안전 게이트 1겹(§6.3 콜백). 기본은 deny: 읽기 도구는 allowedTools 로 자동 허용되어 여기 오지 않고, 여기서는 쓰기 목록만 HUD 확인 + "실행 확인" 완전일치 30초 안에 allow.
import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk'
import { isMcpTool } from '@jarvis/core'

export const WRITE_TOOLS = new Set<string>(['mcp__comms__phone_call', 'mcp__comms__mail_send', 'mcp__media__open_url', 'mcp__apps__app_open', 'mcp__system__screen_lock', 'mcp__system__system_sleep',
  'mcp__calendar__create_event', 'mcp__calendar__update_event', 'mcp__calendar__create_reminder', 'mcp__calendar__update_reminder', 'mcp__calendar__complete_reminder', 'mcp__calendar__move_events_batch', 'mcp__calendar__copy_event'])
/** F-22: 되돌리기 어려운 달력 도구는 두뇌에 보이지도 않는다 */
export const CALENDAR_DESTRUCTIVE = ['mcp__calendar__delete_event', 'mcp__calendar__delete_calendar', 'mcp__calendar__create_calendar', 'mcp__calendar__update_calendar', 'mcp__calendar__delete_reminder', 'mcp__calendar__delete_events_batch', 'mcp__calendar__delete_reminders_batch', 'mcp__calendar__create_events_batch', 'mcp__calendar__create_reminders_batch', 'mcp__calendar__cleanup_completed_reminders', 'mcp__calendar__undo', 'mcp__calendar__redo', 'mcp__calendar__find_duplicate_events']

export interface GateHooks {
  /** 확인을 요청한다. 사용자가 30초 안에 "실행 확인"을 말하면 true. */
  askConfirm: (toolName: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<boolean>
  log: (s: string) => void
}

export function makeCanUseTool(h: GateHooks): CanUseTool {
  return async (toolName, input, { signal }) => {
    if (!isMcpTool(toolName)) { h.log(`gate deny(non-mcp): ${toolName}`); return { behavior: 'deny', message: '내장 도구는 쓸 수 없습니다' } }
    // 목록에 없는 도구(외부 MCP 가 새로 추가한 것 포함)는 거부한다
    if (!WRITE_TOOLS.has(toolName)) { h.log(`gate deny(unlisted): ${toolName}`); return { behavior: 'deny', message: '허용 목록에 없는 도구입니다' } }
    const ok = await h.askConfirm(toolName, input, signal)
    h.log(`gate ${ok ? 'allow' : 'deny'}: ${toolName}`)
    return ok ? { behavior: 'allow', updatedInput: { ...input, confirmation: `hud:${Date.now()}` } } : { behavior: 'deny', message: '사용자가 실행을 확인하지 않았습니다. 취소합니다.' }
  }
}

/** 이름 아래 작은 글씨로 보이는 진행 단계: "카톡 실행 중..." */
export function describeStep(toolName: string, input: Record<string, unknown> = {}): string {
  const [srv = '', fn = ''] = toolName.replace(/^mcp__/, '').split('__')
  const s = (k: string) => (input[k] == null ? '' : String(input[k]))
  switch (srv) {
    case 'apps': return fn === 'app_open' ? `${s('name') || '앱'} 실행 중...` : '앱 목록 확인 중...'
    case 'search': return s('query') ? `"${s('query')}" 검색 중...` : '웹 검색 중...'
    case 'weather': return fn === 'location_now' ? '위치 확인 중...' : '날씨 확인 중...'
    case 'reminders': return fn === 'reminder_set' ? '알림 등록 중...' : fn === 'reminder_cancel' ? '알림 취소 중...' : '알림 확인 중...'
    case 'system': return fn === 'spotify_play' ? `${s('query') || '노래'} 재생 중...` : fn === 'media_key' ? '재생 제어 중...' : fn.startsWith('volume') ? '음량 조절 중...' : fn === 'brightness_set' ? '밝기 조절 중...' : fn === 'screen_lock' ? '화면 잠금 중...' : '절전 준비 중...'
    case 'media': return fn === 'open_url' ? '웹 페이지 여는 중...' : fn === 'youtube_play' ? '유튜브 검색 중...' : '음악 제어 중...'
    case 'calendar': return '달력 확인 중...'
    case 'comms': return fn === 'mail_send' ? '메일 보내는 중...' : '전화 거는 중...'
    case 'hud': return '화면 조정 중...'
    default: return `${fn || srv} 실행 중...`
  }
}

/** HUD 에만 보이는 상세(읽어 주지는 않는다): 메일 본문·전체 URL */
export function describeDetail(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'mcp__comms__mail_send') return String(input.body ?? '').slice(0, 300)
  if (toolName === 'mcp__media__open_url') return String(input.url ?? '').slice(0, 300)
  return ''
}

/** 확인 카드 문구: 도구·인자를 한 문장으로 */
export function describeWrite(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'mcp__comms__phone_call': return `${input.name ? String(input.name) + ' ' : ''}${String(input.number)} 로 전화를 걸겠습니까?`
    // 도구 결과(메일 제목·영상 제목 등)에 숨은 지시가 URL 로 정보를 빼내지 못하게, 여는 주소를 읽어 주고 확인받는다
    case 'mcp__media__open_url': { let host = String(input.url); try { host = new URL(host).host } catch { /* 그대로 읽는다 */ } return `${host} 을 열겠습니까?` }
    case 'mcp__system__screen_lock': return '화면을 잠그겠습니까?'
    case 'mcp__system__system_sleep': return 'PC 를 절전 모드로 하겠습니까?'
    case 'mcp__apps__app_open': return `${String(input.name)} 앱을 실행하겠습니까?`
    case 'mcp__comms__mail_send': return `${String(input.to)} 에게 "${String(input.subject)}" 메일을 보내겠습니까?`
    case 'mcp__calendar__create_event': return `"${String(input.title ?? '')}" 일정을 ${String(input.start_date ?? '')} 에 추가하겠습니까?`
    case 'mcp__calendar__update_event': return `일정을 수정하겠습니까?`
    case 'mcp__calendar__create_reminder': return `"${String(input.title ?? '')}" 미리 알림을 추가하겠습니까?`
    case 'mcp__calendar__complete_reminder': return `미리 알림을 완료 처리하겠습니까?`
    default: return `${toolName} 을 실행하겠습니까?`
  }
}
