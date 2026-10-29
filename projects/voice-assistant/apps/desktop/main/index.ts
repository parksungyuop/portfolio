// 자비스 main. 1a: ⌥Space → "Yes, boss" → 귀 → 두뇌 → 입 → 자막. 상태 기계가 유일한 진실이다.
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Notification, powerMonitor, session } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isConfirmUtterance, isDenyUtterance, isNoiseUtterance, matchLocalIntent, StateMachine, brainErrorSpeech, type EarEvent, type JarvisConfig, type TransitionRow } from '@jarvis/core'
import { Brain } from '../brain/session.js'
import { CALENDAR_DESTRUCTIVE, describeDetail, describeWrite, makeCanUseTool, describeStep } from '../brain/gate.js'
import { homedir } from 'node:os'
import { weatherServer } from '../tools/weather.js'
import { mediaServer } from '../tools/media.js'
import { commsServer } from '../tools/comms.js'
import { hudServer } from '../tools/hud.js'
import { appsServer } from '../tools/apps.js'
import { ReminderStore, remindersServer, fmtAt } from '../tools/reminders.js'
import { searchServer } from '../tools/search.js'
import { setSystemMute, systemServer } from '../tools/system.js'
import { pasteText, winCtrlV } from '../voice/dictation.js'
import { clipboard } from 'electron'
import { Ear } from '../voice/ear.js'
import { WhisperEar } from '../voice/whisper-ear.js'
import { HudPlayer } from '../voice/player.js'
import { LocalTts } from '../voice/local-tts.js'
import { PushToTalk } from '../voice/ptt.js'
import { ClapDetector } from '../voice/clap.js'
import { Mouth } from '../voice/mouth.js'
import { WakeListener } from '../voice/wake.js'
import { loadConfig, loadState, log, saveState } from './config.js'
import { configPath } from './paths.js'
import { parseConfig } from '@jarvis/core'
import { createHudWindow, pushHud, pushMeter, type HudInfo } from './hud-window.js'
import { getSecret, hasSecret, setSecret } from './secrets.js'
import { supportDir } from './paths.js'
import { openSettings } from '../windows/settings.js'

if (!app.requestSingleInstanceLock()) app.exit(0)
// 읽기 도구는 allowedTools 로 자동 허용하고 쓰기만 canUseTool 로 간다 — SDK 가 이를 경고하지만 의도한 설계다 (§6.1)
process.on('warning', (w) => { if ((w as { code?: string }).code !== 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED') console.warn(w) })

let cfg: JarvisConfig
try { cfg = loadConfig() } catch (e) {
  app.whenReady().then(() => { dialog.showErrorBox('Jarvis 설정 오류', String((e as Error).message)); app.exit(0) })
  throw e
}

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..') // dist/apps/desktop/main → repo root (개발 실행)
const rows = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'state-transitions.json'), 'utf8')) as TransitionRow[]
const sm = new StateMachine(rows)
const st = loadState()

let hud: BrowserWindow
let caption = ''
let partial = ''
let widget = ''
let step = '' // 이름 아래 진행 단계 문구
let hudMode: 'orb' | 'full' = st.hudMode ?? 'full'
let lastFinal = ''
const info: HudInfo = { micOk: false, mic: 'ON', voice: 'JARVIS · ElevenLabs', wakeThreshold: cfg.wake.threshold, ttsModel: cfg.tts.model, auth: cfg.brain.auth === 'subscription' ? '구독' : 'API 키', turns: 0, brain: 'WARM' }
let tFinal = 0
let tAsk = 0
let holdTimer: NodeJS.Timeout | null = null
/** "취침/조용히" = 지금 대화를 끝내고 화면을 닫는다. 호출어는 언제나 살아 있다 (보스 결정 2026-09-05). */
function goToSleep(): void {
  sm.send('stop_intent'); ear.pause(); mouth.stop(); brain.interrupt()
  hudVisible = false
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  log('sleep: 대화 종료·화면 닫힘')
  render()
}
const history: Array<{ at: number; who: 'boss' | 'jarvis'; text: string }> = []
function remember(who: 'boss' | 'jarvis', text: string): void { history.push({ at: Date.now(), who, text }); if (history.length > 30) history.shift() }
const MAC = process.platform === 'darwin'
let hudVisible = false
/** Windows: 다른 창으로 전환(Alt+Tab)하면 다음 호출까지 오브로 접어 둔다 */
let awayOrb = false
/** 오류를 로그에 읽을 수 있게: Error 는 message, SDK 결과 객체는 JSON ("[object Object]" 방지) */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 300)
  if (typeof e === 'object' && e !== null) { try { return JSON.stringify(e).slice(0, 600) } catch { /* 순환 참조 */ } }
  return String(e).slice(0, 300)
}
/** 고정 문구 속 "보스"를 설정한 호칭으로 바꾼다 */
const hon = (s: string): string => s.replaceAll('보스', cfg.hud.honorific)
/** 항상 듣기(Windows): 호출 없이 들리는 말을 모두 받는다. 음성은 PC 안(Whisper)에서만 처리되고, 받아 적은 문장만 두뇌로 간다. */
const alwaysOn = (): boolean => !MAC && st.alwaysListen === true
function setAlways(on: boolean): void {
  st.alwaysListen = on; saveState(st); log(`항상 듣기 ${on ? '켬' : '끔'}`)
  if (sm.state === 'IDLE') { if (on) ear.start(); else ear.pause() }
  render()
}
/** 지금 비서: 슬롯에서 비운 값은 자비스 것을 물려받는다 */
function assistant() {
  const a = cfg.assistants.find((x) => x.id === st.assistantId)
  return { id: a?.id ?? 'jarvis', displayName: a?.displayName ?? cfg.hud.displayName, persona: a?.persona, voiceId: a?.voiceId ?? cfg.tts.voiceId, accent: a?.accent, honorific: cfg.hud.honorific, honorificEn: cfg.hud.honorificEn }
}
let silenceTimer: NodeJS.Timeout | null = null
let followTimer: NodeJS.Timeout | null = null

// macOS 는 Swift 헬퍼·afplay/say, 그 밖(Windows)은 렌더러 마이크 + 로컬 Whisper, 렌더러 스피커
const ear = MAC
  ? new Ear(path.join(ROOT, 'native', 'jarvis-ear', 'build', 'jarvis-ear'), cfg.stt.endpointSilenceMs, log)
  : new WhisperEar({ model: cfg.stt.whisperModel, cacheDir: path.join(supportDir(), 'models'), vadRms: () => cfg.stt.vadRms, silenceMs: () => cfg.stt.endpointSilenceMs, speaking: () => player?.busy ?? false, log })
const player = MAC ? undefined : new HudPlayer(() => hud)
// macOS 는 기존 폴백(say)을 그대로 둔다 — afplay 경로에서 WAV 를 검증하지 못했다
const localTts = MAC ? undefined : new LocalTts({ cacheDir: path.join(supportDir(), 'models'), voice: () => cfg.tts.localVoice, speed: () => cfg.tts.localSpeed, log })
const mouth = new Mouth({ apiKey: () => getSecret('elevenlabsApiKey'), voiceId: () => assistant().voiceId, model: () => cfg.tts.model, maxSpeakChars: cfg.tts.maxSpeakChars, log, ...(player ? { player } : {}), ...(localTts ? { local: (t: string) => localTts.synth(t) } : {}) })
const wakeListener = new WakeListener(path.join(ROOT, 'models'), cfg.wake.threshold, (score) => { log(`호출어 감지 ${score.toFixed(2)}`); info.lastWakeAt = Date.now(); wake('wake') }, log)
const READ_TOOLS = [
  'mcp__weather__location_now', 'mcp__weather__weather_today', 'mcp__weather__weather_daily',
  'mcp__media__youtube_play', 'mcp__media__music_control', 'mcp__media__music_play',
  'mcp__comms__contacts_find', 'mcp__comms__mail_unread',
  'mcp__apps__app_list',
  'mcp__reminders__reminder_set', 'mcp__reminders__reminder_list', 'mcp__reminders__reminder_cancel',
  'mcp__search__web_search',
  'mcp__system__spotify_play', 'mcp__system__media_key', 'mcp__system__volume_get', 'mcp__system__volume_set', 'mcp__system__volume_mute', 'mcp__system__brightness_set',
  'mcp__hud__hud_collapse', 'mcp__hud__hud_expand',
  'mcp__calendar__list_calendars', 'mcp__calendar__list_events', 'mcp__calendar__list_events_quick', 'mcp__calendar__search_events', 'mcp__calendar__check_conflicts', 'mcp__calendar__list_reminders', 'mcp__calendar__search_reminders', 'mcp__calendar__list_reminder_tags', 'mcp__calendar__undo_history',
]
// Music 앱 제어는 AppleScript 라 macOS 밖에서는 두뇌에 보이지 않게 한다 (comms 서버는 아예 올리지 않는다)
const MAC_ONLY_TOOLS = MAC ? [] : ['mcp__media__music_control', 'mcp__media__music_play']
const CAL_BIN = path.join(homedir(), 'bin', 'CheICalMCP')
const reminders = new ReminderStore(path.join(supportDir(), 'reminders.json'))
let confirmResolver: ((ok: boolean) => void) | null = null
function askConfirm(toolName: string, input: Record<string, unknown>, signal: AbortSignal): Promise<boolean> {
  const q = describeWrite(toolName, input)
  const detail = describeDetail(toolName, input)
  caption = q + ' "확인" 또는 "취소"라고 말씀해 주십시오.' + (detail ? '\n' + detail : '')
  widget = '확인 대기 30초'; step = '확인 대기 중...'
  mouth.speak(q + ' 확인 또는 취소라고 말씀해 주십시오.')
  render()
  return new Promise<boolean>((resolve) => {
    const prev = mouth.onIdle
    const done = (ok: boolean) => { confirmResolver = null; clearTimeout(t); widget = ''; mouth.onIdle = prev; resolve(ok) }
    const t = setTimeout(() => done(false), 30000)
    confirmResolver = done
    signal.addEventListener('abort', () => done(false), { once: true })
    // 입이 끝나면 귀를 켠다 (done 이 먼저 와도 원래 핸들러로 돌아간다)
    mouth.onIdle = () => { mouth.onIdle = prev; if (confirmResolver) { ear.start(); armSilence(cfg.voice.listenSilenceMs, 'silence') } }
  })
}
const brain = new Brain(cfg, {
  onSentence: (s) => { if (tAsk) { info.brainMs = Date.now() - tAsk; tAsk = 0 }; info.brain = 'STREAMING'; caption = s; step = ''; sm.send('first_sentence'); mouth.speak(s); render() },
  onTurnDone: ({ sessionId, text }) => { log(`brain: ${text.slice(0, 200)}`); if (text.trim()) remember('jarvis', text.trim()); info.turns = (info.turns ?? 0) + 1; info.brain = 'READY'; info.tool = undefined; step = ''; if (sessionId) { st.sessionId = sessionId; saveState(st) }; if (sm.state === 'THINKING') { sm.send('brain_done_empty'); render() } },
  onError: (kind, e) => { log(`brain ${kind}: ${describeError(e)}`); const s = hon(brainErrorSpeech(kind)); caption = s; widget = kind; sm.send('brain_error'); mouth.speak(s); render() },
  onToolUse: (name, input) => { widget = `도구 ${name}`; info.tool = name; step = describeStep(name, input); render() },
  log,
}, st.sessionId ?? null, supportDir(), { identity: assistant, servers: { weather: weatherServer(() => cfg.weather), media: mediaServer, ...(MAC ? { comms: commsServer } : {}), ...(process.platform === 'win32' ? { apps: appsServer, system: systemServer } : {}), reminders: remindersServer(reminders), search: searchServer, hud: hudServer((m) => setHudMode(m)), ...(existsSync(CAL_BIN) ? { calendar: { type: 'stdio' as const, command: CAL_BIN, env: { PATH: '/usr/bin:/bin' } } } : {}) }, readTools: READ_TOOLS, disallowedTools: [...CALENDAR_DESTRUCTIVE, ...MAC_ONLY_TOOLS], canUseTool: makeCanUseTool({ askConfirm, log }) })

function render(): void {
  if (sm.state !== 'IDLE' && sm.state !== 'LOCKED') { hudVisible = true; if (holdTimer) { clearTimeout(holdTimer); holdTimer = null } }
  else if (hudVisible && !holdTimer && sm.state === 'IDLE') holdTimer = setTimeout(() => { hudVisible = false; holdTimer = null; render() }, cfg.voice.hudHoldMs)
  if (sm.state === 'LOCKED') hudVisible = false
  info.queue = mouth.queued
  info.fallback = localTts ? `로컬 ${cfg.tts.localVoice} ${mouth.usingFallback ? '사용 중' : '대기'}` : mouth.usingFallback ? 'Yuna 사용 중' : 'Yuna 대기'
  info.voice = mouth.usingFallback && localTts ? `Supertonic · ${cfg.tts.localVoice}` : 'ElevenLabs'
  info.ttsMs = mouth.lastFirstAudioMs ?? undefined
  info.session = brain.sessionId ?? undefined
  info.silenceMs = cfg.stt.endpointSilenceMs
  const mode = awayOrb ? 'orb' : hudMode
  // Windows: 전체 화면으로 뜰 때 포커스를 가져와야 Alt+Tab(blur)을 알아챌 수 있다
  if (!MAC && hudVisible && !wasVisible && mode === 'full' && hud && !hud.isDestroyed()) hud.focus()
  wasVisible = hudVisible
  pushHud(hud, { state: sm.state, mode, accent: assistant().accent, alwaysListen: alwaysOn(), visible: hudVisible, captions: cfg.hud.captions, history, settings: publicSettings(), caption, partial, lastFinal, widget, step, displayName: assistant().displayName, info })
}
let wasVisible = false
function setHudMode(m: 'orb' | 'full'): void { awayOrb = false; hudMode = m; st.hudMode = m; saveState(st); render() }

const YES_BOSS = path.join(supportDir(), 'assets', 'yes-boss.mp3')
async function ensureYesBoss(): Promise<void> {
  if (existsSync(YES_BOSS) || !hasSecret('elevenlabsApiKey')) return
  const clip = await mouth.synthesizeClip('Yes, boss.')
  if (!clip) { log('yes-boss 클립 생성 실패'); return }
  mkdirSync(path.dirname(YES_BOSS), { recursive: true })
  writeFileSync(YES_BOSS, clip)
  log('yes-boss 클립 생성')
}
function yesBoss(): Promise<void> {
  const clip = YES_BOSS
  if (player) return existsSync(clip) ? player.play(readFileSync(clip)) : player.say('Yes, boss')
  const p = existsSync(clip) ? spawn('afplay', [clip], { stdio: 'ignore' }) : spawn('say', ['-v', 'Samantha', 'Yes, boss'], { stdio: 'ignore' })
  return new Promise((r) => p.on('exit', () => r()))
}

function armSilence(ms: number, ev: 'silence'): void {
  clearSilence()
  silenceTimer = setTimeout(() => { if (sm.send(ev)) { ear.pause(); partial = ''; render() } }, ms)
}
function clearSilence(): void { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null } }

/** 프로그램을 끝낸다 (will-quit 이 귀·누르고 말하기 헬퍼·두뇌를 정리한다). 끝인사는 하지 않는다 — 바로 꺼지는 게 낫다. */
function quitJarvis(by: string): void { log(`종료 (${by})`); mouth.stop(); if (ducked) void setSystemMute(false).finally(() => app.quit()); else app.quit() }
/** 단축키·재실행으로 부르기: 어느 상태에서든 창을 띄우고 듣기 시작한다 (상태표에 hotkey 가 없는 상태를 메운다) */
function summon(): void {
  if (sm.state === 'LOCKED') return
  if (sm.state === 'THINKING') { if (confirmResolver) { awayOrb = false; render(); return }; brain.interrupt(); sm.send('stop_intent') }
  if (sm.state === 'LISTENING' || sm.state === 'WAKE') { awayOrb = false; hudVisible = true; render(); return }
  wake(sm.state === 'FOLLOWUP' ? 'wake' : 'hotkey')
}
function wake(ev: 'wake' | 'hotkey', hold = false): void {
  if (sm.state === 'SPEAKING' || sm.state === 'THINKING') { mouth.stop(); brain.interrupt() }
  if (!sm.send(ev)) return
  awayOrb = false
  caption = ''; partial = ''; widget = ''; step = ''
  render()
  // 클립이 끝난 뒤 ear start — 자기 목소리("Yes, bos")를 받아 적는 것을 막는다 (F-16 의 선행 버퍼는 D-J23)
  // 클립 재생 0.5초 뒤 귀를 켠다(체감 지연 절반). 클립 꼬리를 받아 적은 "Yes, boss" 류 최종문은 onFinal 이 버린다.
  if (cfg.voice.wakeAck) void yesBoss()
  setTimeout(() => {
    if (sm.state !== 'WAKE') return
    if (ear instanceof WhisperEar) ear.start(hold); else ear.start()
    sm.send('ear_started')
    armSilence(cfg.voice.listenSilenceMs, 'silence')
    render()
  }, cfg.voice.wakeAck ? 500 : 0)
}

/** 자기 클립("Yes, boss")을 받아 적은 짧은 최종문 */
function isSelfEcho(t: string): boolean { return /^[\s.,!?]*(yes|예스)?[\s.,!?]*(bo+s+|보스|버스)[\s.,!?]*$/i.test(t.trim()) }

function onFinal(text: string): void {
  clearSilence()
  partial = ''
  if (confirmResolver) {
    log(`stt confirm: ${text}`)
    const ok = isConfirmUtterance(text)
    if (ok || isDenyUtterance(text)) {
      if (text.trim()) remember('boss', text)
      ear.pause(); caption = ok ? '실행합니다.' : '취소했습니다.'; render()
      confirmResolver(ok)
      return
    }
    // 못 알아들었으면 취소하지 않고 다시 듣는다 (30초 제한은 그대로)
    caption = '잘 못 들었습니다. "확인" 또는 "취소"라고 말씀해 주십시오.'; render()
    ear.start(); armSilence(cfg.voice.listenSilenceMs, 'silence')
    return
  }
  if (isNoiseUtterance(text) || isSelfEcho(text)) { log(`stt 무시: ${text}`); ear.start(); armSilence(cfg.voice.listenSilenceMs, 'silence'); return }
  log(`stt final: ${text}`)
  remember('boss', text)
  lastFinal = text
  info.sttMs = tFinal ? Date.now() - tFinal : undefined
  const intent = matchLocalIntent(text.split(assistant().displayName).join('자비스'), ['QUIT', 'ALWAYS_ON', 'ALWAYS_OFF', 'STOP', 'COLLAPSE', 'EXPAND', 'QUIET', 'SLEEP'])
  if (intent === 'QUIT') { quitJarvis('말'); return }
  if (intent === 'ALWAYS_ON' || intent === 'ALWAYS_OFF') {
    sm.send('stop_intent'); ear.pause()
    setAlways(intent === 'ALWAYS_ON')
    caption = hon(intent === 'ALWAYS_ON' ? '항상 듣겠습니다, 보스.' : '이제 부르실 때만 듣겠습니다, 보스.'); mouth.speak(caption); render()
    return
  }
  if (intent === 'SLEEP' && st.alwaysListen) { st.alwaysListen = false; saveState(st); log('항상 듣기 끔(취침)') }
  if (intent === 'STOP') { sm.send('stop_intent'); ear.pause(); mouth.stop(); brain.interrupt(); caption = hon('네, 보스.'); render(); return }
  if (intent === 'QUIET' || intent === 'SLEEP') {
    goToSleep()
    caption = hon('네, 보스. 부르시면 다시 오겠습니다.')
    mouth.speak(caption)
    return
  }
  if (intent === 'COLLAPSE' || intent === 'EXPAND') {
    setHudMode(intent === 'COLLAPSE' ? 'orb' : 'full')
    caption = intent === 'COLLAPSE' ? '화면을 접었습니다.' : '전체 화면입니다.'
    sm.send('final'); sm.send('first_sentence'); ear.pause(); mouth.speak(caption); render()
    return
  }
  if (!sm.send('final')) return
  ear.pause()
  caption = ''
  render()
  tAsk = Date.now(); info.brain = 'THINKING'
  brain.ask(text)
}

mouth.onIdle = () => {
  if (sm.state !== 'SPEAKING') return
  if (brain.busy) return // 두뇌가 아직 문장을 더 낼 수 있다
  sm.send('speech_done')
  ear.start()
  render()
  if (followTimer) clearTimeout(followTimer)
  followTimer = setTimeout(() => { if (sm.state === 'FOLLOWUP' && sm.send('silence')) { ear.pause(); render() } }, cfg.voice.followUpMs)
}
mouth.onFirstAudio = (ms) => log(`tts 첫 오디오 ${ms}ms`)

ear.on('event', (ev: EarEvent) => {
  switch (ev.t) {
    case 'ready': log(`ear ready installed=${ev.installed}`); info.micOk = true; if (alwaysOn()) ear.start(); else ear.pause(); render(); break
    case 'partial': if (sm.state === 'LISTENING' || sm.state === 'FOLLOWUP' || (sm.state === 'THINKING' && confirmResolver)) { partial = ev.text; tFinal = Date.now(); clearSilence(); armSilence(cfg.voice.listenSilenceMs, 'silence'); render() } break
    case 'final':
      if (dictating) {
        dictating = false; widget = ''; ear.pause(); duck(false); render()
        if (ev.text.trim() && !isNoiseUtterance(ev.text)) { log(`받아쓰기: ${ev.text}`); ptt.mute(400); void pasteText(ev.text.trim(), { readText: () => clipboard.readText() as unknown as string, writeText: (t) => { clipboard.writeText(t) } }, winCtrlV).catch((e) => log(`붙여넣기 실패: ${String((e as Error).message).slice(0, 100)}`)) }
        if (alwaysOn()) ear.start()
        break
      }
      // 항상 듣기: 대기 중에 들린 말은 호출된 것처럼 처리한다 (잡음은 조용히 버리고 계속 듣는다)
      if (sm.state === 'IDLE' && alwaysOn()) {
        if (isNoiseUtterance(ev.text) || isSelfEcho(ev.text)) { ear.start(); break }
        if (pcAudio()) { log(`항상 듣기: 컴퓨터 소리 중이라 버림 (${ev.text.slice(0, 40)})`); ear.start(); break }
        awayOrb = false; sm.send('hotkey'); sm.send('ear_started'); onFinal(ev.text); break
      }
      if (sm.state === 'LISTENING' || sm.state === 'FOLLOWUP' || (sm.state === 'THINKING' && confirmResolver)) { if (followTimer) clearTimeout(followTimer); onFinal(ev.text) } break
    case 'pcm': if (sm.state !== 'LISTENING' && sm.state !== 'LOCKED') wakeListener.feedB64(ev.b64); break
    case 'error': log(`ear error ${ev.code} ${ev.detail ?? ''}`); widget = ev.code === 'MIC_DENIED' ? '마이크 권한 없음' : '음성 인식 불가'; render(); break
  }
})

sm.onChange((next, prev, ev) => {
  log(`state ${prev} --${ev}--> ${next}`)
  // 항상 듣기: 대기로 돌아오면 (같은 틱의 ear.pause() 뒤에) 다시 귀를 연다
  if (next === 'IDLE' && alwaysOn()) setTimeout(() => { if (sm.state === 'IDLE' && alwaysOn()) ear.start() }, 0)
})

// ---- 알림 울림: 시킨 알림은 "먼저 말하지 않기" 규칙의 예외다 (사용자가 직접 건 것)
function ringReminders(): void {
  if (sm.state === 'THINKING' || sm.state === 'SPEAKING' || sm.state === 'LOCKED' || confirmResolver) return
  const due = reminders.due()
  if (process.env.JARVIS_REM_DEBUG) log(`알림 틱 state=${sm.state} pending=${reminders.list().length} due=${due.length}`)
  for (const r of due) {
    log(`알림 울림 #${r.id} ${r.text}`)
    if (sm.state === 'LISTENING' || sm.state === 'FOLLOWUP') { ear.pause(); sm.send('stop_intent') }
    awayOrb = false; hudVisible = true
    caption = hon(`보스, ${fmtAt(r.at)} 알림입니다: ${r.text}`); widget = '알림'
    sm.send('hotkey'); sm.send('ear_started'); sm.send('final'); sm.send('first_sentence') // 상태표를 따라 SPEAKING 으로
    mouth.speak(caption); render()
    return // 한 번에 하나씩; 나머지는 다음 틱
  }
}

// ---- 받아쓰기 (Ctrl+Shift+J): 두뇌에 보내지 않고 커서 자리에 붙여 넣는다
let dictating = false
function dictDown(): void {
  if (!(ear instanceof WhisperEar) || dictating || (sm.state !== 'IDLE' && sm.state !== 'FOLLOWUP')) return
  dictating = true; if (followTimer) clearTimeout(followTimer); mouth.stop(); duck(true); ear.start(true)
  widget = '받아쓰기'; render()
}
function dictUp(): void {
  if (!dictating || !(ear instanceof WhisperEar)) return
  if (!ear.flush()) { dictating = false; widget = ''; duck(false); render() }
}

// ---- 누르고 말하기 (Ctrl+J, Windows)
function pttDown(): void {
  if (!(ear instanceof WhisperEar) || sm.state === 'LOCKED' || confirmResolver) return
  if (sm.state === 'THINKING') { brain.interrupt(); sm.send('stop_intent') }
  if (sm.state === 'FOLLOWUP') sm.send('wake') // → WAKE
  if (sm.state === 'WAKE' || sm.state === 'LISTENING') {
    if (followTimer) clearTimeout(followTimer)
    awayOrb = false; mouth.stop(); ear.start(true); sm.send('ear_started'); armSilence(cfg.voice.listenSilenceMs, 'silence'); render()
    return
  }
  wake('hotkey', true)
}
function pttUp(): void {
  if (!(ear instanceof WhisperEar) || sm.state !== 'LISTENING' || confirmResolver) return
  if (!ear.flush() && sm.send('silence')) { ear.pause(); partial = ''; render() }
}
// ---- 박수 두 번으로 부르기 (Windows). 렌더러가 가공하지 않은 마이크 신호(mic:raw)를 따로 보낸다 —
// 잡음 억제·자동 음량은 박수 같은 순간 소리를 뭉개기 때문이다.
// ---- 컴퓨터 소리 무시: 렌더러가 시스템 출력(루프백)의 크기를 보내 준다.
// 크기 비교로 조각을 거르는 방식은 실측에서 음악의 2~48%만 걸렀다(마이크 자동 음량 때문) → 확실한 두 가지만 한다:
//  ① 듣는 동안(LISTENING·FOLLOWUP·받아쓰기) 컴퓨터 소리를 잠시 끈다 ② 컴퓨터 소리가 나는 동안 항상 듣기는 쉰다(부르면 듣는다)
let pcAudioAt = 0
ipcMain.on('mic:ref', (_e, v: unknown) => { if (Number(v) > 0.002 && !ducked) pcAudioAt = Date.now() })
const pcAudio = (): boolean => cfg.voice.echoGuard && process.platform === 'win32' && Date.now() - pcAudioAt < 1500
let ducked = false
function duck(on: boolean): void {
  if (on === ducked || (on && !pcAudio())) return
  ducked = on; log(on ? '컴퓨터 소리 잠시 끔' : '컴퓨터 소리 다시 켬')
  void setSystemMute(on).catch((e) => log(`음소거 전환 실패: ${String((e as Error).message).slice(0, 100)}`))
}
sm.onChange((next) => duck(next === 'LISTENING' || next === 'FOLLOWUP'))
const clap = new ClapDetector(cfg.wake.clapSensitivity)
let rawFrames = 0
clap.debug = (s) => log(`clap ${s}`)
ipcMain.on('mic:raw', (_e, d: unknown) => {
  if (!cfg.wake.clap || !(d instanceof ArrayBuffer || ArrayBuffer.isView(d))) return
  if (++rawFrames === 1) log('clap 원본 마이크 수신 시작')
  const b = d instanceof ArrayBuffer ? Buffer.from(d) : Buffer.from(d.buffer, d.byteOffset, d.byteLength)
  const f = new Float32Array(b.length >> 1)
  if (player?.busy) return // 자비스가 소리 내는 동안은 넣지 않는다 (무음을 넣으면 잡음 바닥이 무너진다)
  for (let i = 0; i < f.length; i++) f[i] = b.readInt16LE(i * 2) / 32768
  if (clap.push(f) && sm.state !== 'LOCKED') { log('박수 두 번 감지'); info.lastWakeAt = Date.now(); wake('wake') }
})
const ptt = new PushToTalk(pttDown, pttUp, log, dictDown, dictUp)

function publicSettings() {
  return { hasElevenLabsKey: hasSecret('elevenlabsApiKey'), voiceId: cfg.tts.voiceId, displayName: cfg.hud.displayName, captions: cfg.hud.captions, wakeThreshold: cfg.wake.threshold, clap: cfg.wake.clap, clapSensitivity: cfg.wake.clapSensitivity, city: cfg.weather.city ?? '', hudHoldMs: cfg.voice.hudHoldMs, followUpMs: cfg.voice.followUpMs, endpointSilenceMs: cfg.stt.endpointSilenceMs, model: cfg.brain.model, calendar: existsSync(CAL_BIN), mac: MAC }
}
ipcMain.handle('settings:get', () => publicSettings())
// 설정 갱신: 허용 키만 받아 zod 로 검증한 뒤 config.json 에 쓴다. 잘못된 값은 거부하고 이전 값 유지.
ipcMain.handle('settings:update', (_e, patch: unknown) => {
  if (typeof patch !== 'object' || patch === null) return { ok: false, error: '객체가 아님' }
  const p = patch as Record<string, unknown>
  const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Record<string, Record<string, unknown>>
  const set = (k: string, sub: string, v: unknown) => { raw[k] = { ...(raw[k] ?? {}), [sub]: v } }
  if (typeof p.displayName === 'string') set('hud', 'displayName', p.displayName.trim())
  if (typeof p.captions === 'boolean') set('hud', 'captions', p.captions)
  if (typeof p.wakeThreshold === 'number') set('wake', 'threshold', p.wakeThreshold)
  if (typeof p.clap === 'boolean') set('wake', 'clap', p.clap)
  if (typeof p.clapSensitivity === 'number') set('wake', 'clapSensitivity', p.clapSensitivity)
  if (typeof p.city === 'string') set('weather', 'city', p.city.trim() || undefined)
  if (typeof p.hudHoldMs === 'number') set('voice', 'hudHoldMs', p.hudHoldMs)
  if (typeof p.followUpMs === 'number') set('voice', 'followUpMs', p.followUpMs)
  if (typeof p.endpointSilenceMs === 'number') set('stt', 'endpointSilenceMs', p.endpointSilenceMs)
  if (typeof p.voiceId === 'string') set('tts', 'voiceId', p.voiceId.trim())
  try {
    const next = parseConfig(raw)
    writeFileSync(configPath(), JSON.stringify(raw, null, 2) + '\n')
    Object.assign(cfg, next) // 같은 객체를 고쳐 두뇌·입·귀가 새 값을 바로 본다
    brain.close() // 이름이 바뀌면 다음 대화에서 인격을 다시 만든다
    wakeListener.threshold = cfg.wake.threshold
    clap.setSensitivity(cfg.wake.clapSensitivity)
    info.wakeThreshold = cfg.wake.threshold
    log('설정 갱신')
    render()
    return { ok: true, settings: publicSettings() }
  } catch (e) { return { ok: false, error: String((e as Error).message).slice(0, 200) } }
})
ipcMain.handle('cal:setup', () => { if (!existsSync(CAL_BIN)) return false; spawn(CAL_BIN, ['--setup'], { stdio: 'ignore', detached: true }).unref(); return true })
// 다음 비서로 넘긴다: [자비스, ...슬롯] 순환. 대화는 새로 시작한다.
ipcMain.handle('assistant:next', () => {
  const ids = ['jarvis', ...cfg.assistants.map((a) => a.id)]
  const next = ids[(ids.indexOf(assistant().id) + 1) % ids.length]!
  if (next === 'jarvis') delete st.assistantId; else st.assistantId = next
  delete st.sessionId
  saveState(st); mouth.stop(); brain.reset()
  log(`비서 전환: ${next}`)
  caption = hon(`${assistant().displayName} 입니다, 보스.`); render()
  return next
})
ipcMain.on('log:renderer', (_e, s: unknown) => { if (typeof s === 'string') log('hud: ' + s.slice(0, 200)) })
// 글로 들어온 명령: 말로 들은 것과 같은 길(의도 → 확인 → 두뇌)을 탄다
ipcMain.handle('text:say', (_e, raw: unknown) => {
  const text = String(raw ?? '').trim().slice(0, 500)
  if (!text || sm.state === 'LOCKED') return
  if (sm.state === 'SPEAKING' && !confirmResolver) { mouth.stop(); brain.interrupt(); sm.send('hotkey'); sm.send('ear_started') }
  else if (sm.state === 'THINKING' && !confirmResolver) { brain.interrupt(); sm.send('stop_intent') }
  if (sm.state === 'IDLE') { awayOrb = false; sm.send('hotkey'); sm.send('ear_started') }
  if (followTimer) clearTimeout(followTimer)
  log(`typed: ${text}`); onFinal(text)
})
ipcMain.handle('listen:toggle', () => { if (MAC) return false; setAlways(!alwaysOn()); return alwaysOn() })
ipcMain.handle('mic:mute', () => { goToSleep(); return true })
ipcMain.on('hud:mouse', (_e, interactive: unknown) => { if (hud && !hud.isDestroyed()) hud.setIgnoreMouseEvents(!interactive, { forward: true }) })
ipcMain.handle('settings:setKey', (_e, v: unknown) => {
  if (typeof v !== 'string') return false
  try { setSecret('elevenlabsApiKey', v.trim()); log('목소리 키 저장됨'); render(); return true }
  catch (e) { log(`목소리 키 저장 실패: ${String((e as Error).message).slice(0, 120)}`); return false }
})

app.whenReady().then(() => {
  // 렌더러가 시스템 출력(루프백)의 크기를 재도록 허락한다. 화면 영상은 렌더러가 받자마자 끈다.
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => { void desktopCapturer.getSources({ types: ['screen'] }).then((s) => cb(s[0] ? { video: s[0], audio: 'loopback' } : {})) })
  hud = createHudWindow()
  hud.webContents.on('did-finish-load', render)
  // 켜질 때 한 번만 인사한다. 그 뒤로는 보스가 말을 걸기 전까지 먼저 말하지 않는다.
  hud.webContents.once('did-finish-load', () => { if (cfg.voice.greet) mouth.speak(`${assistant().displayName} 대기중입니다.`) })
  if (!MAC) hud.on('blur', () => { if (hudVisible && !awayOrb) { awayOrb = true; render() } })
  ear.spawnHelper()
  void wakeListener.load()
  setInterval(() => { if (sm.state !== 'IDLE' && sm.state !== 'LOCKED') pushMeter(hud, { rms: wakeListener.rms, wake: wakeListener.score }) }, 120)
  // Windows 의 Alt+Space 는 창 시스템 메뉴라 Ctrl+Alt+Space 를 쓴다
  // 다른 프로그램이 먼저 잡고 있으면 다음 후보로 넘어간다
  const HOTKEY = (MAC ? ['Alt+Space'] : ['Control+Alt+Space', 'Control+Alt+J']).find((k) => globalShortcut.register(k, () => summon()))
  log(HOTKEY ? `단축키 ${HOTKEY}` : '단축키 등록 실패')
  globalShortcut.register('Alt+Shift+,', () => openSettings())
  const QUITKEY = ['Control+Alt+Q', 'Control+Alt+Shift+Q'].find((k) => globalShortcut.register(k, () => quitJarvis('단축키')))
  log(QUITKEY ? `종료 단축키 ${QUITKEY}` : '종료 단축키 등록 실패')
  powerMonitor.on('lock-screen', () => { sm.send('lock'); ear.pause(); mouth.stop(); render() })
  powerMonitor.on('unlock-screen', () => { sm.send('unlock'); render() })
  if (!hasSecret('elevenlabsApiKey')) new Notification({ title: cfg.hud.displayName, body: MAC ? 'ElevenLabs 키가 없어 Yuna 목소리로 말합니다. ⌥⇧, 로 설정을 여세요.' : `ElevenLabs 키가 없어 로컬 목소리(${cfg.tts.localVoice})로 말합니다.` }).show()
  if (process.env.JARVIS_OPEN_SETTINGS) openSettings()
  brain.warm()
  if (cfg.voice.pushToTalk) ptt.start()
  setInterval(ringReminders, 30000)
  if (!hasSecret('elevenlabsApiKey')) localTts?.warm()
  if (cfg.voice.wakeAck) void ensureYesBoss()
  log(`ready clap=${cfg.wake.clap} cfgPath=${configPath()}`)
})
// 자비스를 한 번 더 실행하면(바로가기·pnpm start) 새로 뜨는 대신 지금 창을 부른다
app.on('second-instance', () => summon())
app.on('will-quit', () => { globalShortcut.unregisterAll(); ptt.stop(); ear.shutdown(); brain.close() })
app.on('window-all-closed', () => { /* HUD 창이 닫혀도 앱은 산다 */ })
