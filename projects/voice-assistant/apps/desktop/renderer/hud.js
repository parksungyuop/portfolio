// 렌더러: 상태·자막·계기 값을 받아 그리기만 한다. 네트워크 없음, 도구 없음, 표본 데이터 없음.
const $ = (id) => document.getElementById(id)
const STATE_KO = { IDLE: '', WAKE: '호출됨', LISTENING: '듣는 중...', THINKING: '답변 추론 중...', SPEAKING: '답변 중...', FOLLOWUP: '이어서 말씀하세요', LOCKED: '잠김' }
const STATE_EN = { IDLE: 'Standby', WAKE: 'Wake', LISTENING: 'Listening', THINKING: 'Thinking', SPEAKING: 'Speaking', FOLLOWUP: 'Follow-up', LOCKED: 'Locked' }
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const bars = $('bars')
for (let i = 0; i < 20; i++) bars.appendChild(document.createElement('i'))
const barEls = [...bars.children]
let npartial = 0
const fmt = (ms) => (ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : ms + ' ms')
const hhmmss = (d) => [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')

function tick() {
  const d = new Date()
  $('clock').textContent = hhmmss(d)
  $('date').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`
}
tick(); setInterval(tick, 1000)

window.jarvis.onState((p) => {
  document.body.dataset.state = p.state
  document.body.dataset.mode = p.mode || 'full'
  document.body.dataset.visible = p.visible ? '1' : '0'
  document.body.dataset.captions = p.captions ? '1' : '0'
  setAccent(p.accent)
  $('alwaysbtn').classList.toggle('on', !!p.alwaysListen)
  sphereName = p.displayName || 'JARVIS'
  if (p.state === 'IDLE' && p.visible) $('rstate').textContent = 'Standby'
  const ko = STATE_KO[p.state] ?? p.state
  $('name').textContent = $('cname').textContent = p.displayName || 'JARVIS'
  $('state').textContent = p.step || ko
  $('cstate').textContent = p.step || ko || '대기 중'
  $('rstate').textContent = STATE_EN[p.state] ?? p.state
  $('rsub').textContent = p.state === 'LISTENING' ? `침묵 ${((p.info?.silenceMs ?? 0) / 1000).toFixed(1)}초 뒤 전송` : p.state === 'FOLLOWUP' ? '호출 없이 이어 말하기' : ''
  $('partial').textContent = p.partial || ''
  $('cpartial').textContent = p.partial || p.lastFinal || ''
  if (p.partial) npartial++
  if (p.state === 'THINKING') npartial = 0
  $('npartial').textContent = String(npartial)
  $('caption').textContent = $('bcaption').textContent = p.caption || ''
  $('widget').textContent = p.widget || ''
  const i = p.info || {}
  $('mic').textContent = !i.micOk ? '—' : p.alwaysListen ? '항상 듣기 켜짐' : '호출 대기'
  $('mic').style.color = i.micOk ? 'var(--ok)' : 'var(--muted)'
  $('voice').textContent = i.voice || '—'
  $('thr').textContent = (i.wakeThreshold ?? 0.5).toFixed(2)
  $('lastwake').textContent = i.lastWakeAt ? hhmmss(new Date(i.lastWakeAt)) : '—'
  $('sttms').textContent = fmt(i.sttMs)
  $('bstat').textContent = i.brain || '—'
  $('brainms').textContent = fmt(i.brainMs)
  $('turns').textContent = String(i.turns ?? 0)
  $('sess').textContent = i.session ? `${i.session.slice(0, 4)}…${i.session.slice(-2)} · ${i.auth || ''}` : '—'
  $('tool').textContent = i.tool || '없음 (잡담)'
  $('ttsmodel').textContent = i.ttsModel || '—'
  $('ttsms').textContent = fmt(i.ttsMs)
  $('queue').textContent = String(i.queue ?? 0)
  $('fallback').textContent = i.fallback || 'Yuna 대기'
})

// 계기(자주): 마이크 레벨·호출어 점수
window.jarvis.onMeter((m) => {
  const db = m.rms > 0 ? Math.max(-60, 20 * Math.log10(m.rms)) : -60
  $('micdb').textContent = `${db.toFixed(0)} dB`
  $('micbar').style.width = `${((db + 60) / 60) * 100}%`
  $('wake').textContent = m.wake.toFixed(2)
  $('wakebar').style.width = `${Math.min(1, m.wake) * 100}%`
  // 말하는 동안은 큐·출력 파형 대용으로 입력 레벨을 막대에 흘린다
  const level = Math.min(1, m.rms * 12)
  barEls.forEach((b, k) => { const seed = (Math.sin(k * 1.7 + Date.now() / 90) + 1) / 2; b.style.height = `${8 + level * seed * 92}%` })
})

// ---- 메뉴 레일 · 화면
document.body.dataset.pane = 'ops'
const rail = $('rail')
rail.addEventListener('click', (e) => {
  const b = e.target.closest('.rb'); if (!b) return
  if (b.dataset.mute) { window.jarvis.micMute('sleep'); return }
  if (b.dataset.always) { window.jarvis.listenToggle(); return }
  if (b.dataset.assistant) { window.jarvis.assistantNext(); return }
  document.body.dataset.pane = b.dataset.pane
  rail.querySelectorAll('.rb[data-pane]').forEach((x) => x.classList.toggle('on', x === b))
})
// 마우스가 레일·화면 위에 있을 때만 창이 클릭을 받는다. 그 밖은 아래 앱으로 통과.
let over = false
document.addEventListener('mousemove', (e) => {
  const hit = !!e.target.closest('.rail, .pane, .cmd')
  if (hit !== over) { over = hit; window.jarvis.mouse(hit) }
})
$('cmd').addEventListener('keydown', (e) => { if (e.key !== 'Enter' || e.isComposing) return; const v = e.target.value.trim(); if (!v) return; e.target.value = ''; window.jarvis.say(v) })
document.addEventListener('mouseleave', () => { if (over) { over = false; window.jarvis.mouse(false) } })

// ---- 설정
const form = $('sform')
let lastSettings = null
function fillSettings(st) {
  if (!st) return
  lastSettings = st
  const f = form.elements
  if (document.activeElement && form.contains(document.activeElement)) return // 편집 중엔 덮어쓰지 않는다
  f.displayName.value = st.displayName || ''
  f.voiceId.value = st.voiceId || ''
  f.wakeThreshold.value = st.wakeThreshold ?? 0.45; $('thrv').textContent = Number(f.wakeThreshold.value).toFixed(2)
  f.endpointS.value = ((st.endpointSilenceMs ?? 1300) / 1000).toFixed(1)
  f.followUpS.value = Math.round((st.followUpMs ?? 25000) / 1000)
  f.hudHoldS.value = Math.round((st.hudHoldMs ?? 90000) / 1000)
  f.city.value = st.city || ''
  f.captions.checked = !!st.captions
  f.clap.checked = !!st.clap
  f.clapSensitivity.value = st.clapSensitivity ?? 0.5; $('clapv').textContent = Number(f.clapSensitivity.value).toFixed(2)
  $('keystate').textContent = st.hasElevenLabsKey ? '(저장됨)' : '(없음 → Yuna)'
  renderLinks(st)
}
form.clapSensitivity.addEventListener('input', () => { $('clapv').textContent = Number(form.clapSensitivity.value).toFixed(2) })
form.wakeThreshold.addEventListener('input', () => { $('thrv').textContent = Number(form.wakeThreshold.value).toFixed(2) })
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = form.elements
  const patch = { displayName: f.displayName.value, voiceId: f.voiceId.value, wakeThreshold: Number(f.wakeThreshold.value), endpointSilenceMs: Math.round(Number(f.endpointS.value) * 1000), followUpMs: Number(f.followUpS.value) * 1000, hudHoldMs: Number(f.hudHoldS.value) * 1000, city: f.city.value, captions: f.captions.checked, clap: f.clap.checked, clapSensitivity: Number(f.clapSensitivity.value) }
  const r = await window.jarvis.settingsUpdate(patch)
  let keyOk = true
  if (f.key.value.trim()) { keyOk = await window.jarvis.settingsSetKey(f.key.value.trim()); f.key.value = '' }
  $('savestate').textContent = !keyOk ? '오류: 목소리 열쇠를 저장하지 못했습니다' : r && r.ok ? '저장됨' : '오류: ' + (r && r.error)
  setTimeout(() => { $('savestate').textContent = '' }, 2500)
  document.activeElement && document.activeElement.blur()
  const st = await window.jarvis.settingsGet(); fillSettings(st)
})
$('calbtn').addEventListener('click', async () => { const ok = await window.jarvis.calSetup(); $('savestate').textContent = ok ? '권한 창을 열었습니다' : '달력 도구 없음' })

// ---- 연결
function renderLinks(st) {
  const items = [
    ['weather', '날씨·위치', '인터넷 날씨 서비스 · 위치는 인터넷 주소로 추정' + (st.city ? ' · 도시 고정: ' + st.city : ''), true],
    ['media', '영상·음악', st.mac ? '크롬 열기 · 유튜브 재생 · 음악 앱 재생' : '브라우저 열기 · 유튜브 재생', true],
    ['reminders', '알림', '타이머 · 알람 · 미리 알림', true],
    ['search', '웹 검색', 'DuckDuckGo 로 실시간 정보 검색', true],
    ...(st.mac ? [] : [['system', 'PC 제어', '음량 · 밝기 · 잠금 · 절전 (잠금·절전은 확인)', true]]),
    ...(st.mac ? [] : [['apps', '앱 실행', '설치된 앱 찾기 · 실행 (실행 전 확인)', true]]),
    ['comms', '연락', st.mac ? '연락처 찾기 · 전화 걸기 · 메일 확인·보내기' : '이 PC 에서는 지원 안 됨 (맥 전용)', !!st.mac],
    ['calendar', '달력', st.calendar ? '맥 캘린더 연결됨 (처음엔 아래 버튼으로 허용)' : '연결 안 됨', !!st.calendar],
    ['elevenlabs', '목소리', st.hasElevenLabsKey ? '자비스 목소리 (ElevenLabs)' : '기본 목소리 (열쇠 없음)', !!st.hasElevenLabsKey],
    ['brain', '두뇌', 'Claude 로 생각하고 대답', true],
  ]
  $('links').innerHTML = items.map(([k, nm, d, ok]) => `<li><span class="st ${ok ? 'ok' : ''}"></span><span class="nm">${nm}</span><span class="unit">${d}</span></li>`).join('')
}

// ---- 기록
function renderLog(h) {
  const el = $('loglist')
  el.innerHTML = (h || []).slice().reverse().map((x) => `<li><span class="unit">${hhmmss(new Date(x.at))}</span><span class="who ${x.who}">${x.who === 'boss' ? 'BOSS' : 'JARVIS'}</span><span>${x.text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</span></li>`).join('')
}
window.jarvis.onState((p) => { fillSettings(p.settings); renderLog(p.history) })
window.jarvis.settingsGet().then(fillSettings)

// ---- macOS 밖: 마이크와 스피커가 여기 있다 (맥은 Swift 헬퍼·afplay 가 맡는다). 음성은 메모리로만 오간다.
if (!navigator.userAgent.includes('Mac')) {
  const actx = new AudioContext({ sampleRate: 16000 }) // 마이크를 16kHz 로 받아 호출어·Whisper 에 그대로 넘긴다
  navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then((stream) => {
    const src = actx.createMediaStreamSource(stream)
    // ponytail: ScriptProcessor(폐기 예정)는 파일 하나로 끝나서 쓴다. 끊김이 들리면 AudioWorklet 으로 옮긴다.
    const proc = actx.createScriptProcessor(4096, 1, 1)
    proc.onaudioprocess = (e) => {
      const f = e.inputBuffer.getChannelData(0)
      const s = new Int16Array(f.length)
      for (let k = 0; k < f.length; k++) s[k] = Math.max(-1, Math.min(1, f[k])) * 32767
      window.jarvis.micPcm(s.buffer)
    }
    src.connect(proc); proc.connect(actx.destination) // 출력 버퍼는 비워 둔다(무음) — 연결해야 콜백이 돈다
    window.jarvis.micReady(true); window.jarvis.rlog('main mic 열림 state=' + actx.state)
  }).catch(() => window.jarvis.micReady(false))

  // 박수 검출용: 가공하지 않은 마이크를 따로 연다 (박수 설정이 켜진 뒤 한 번만)
  let rawOn = false
  window.jarvis.onState((p) => {
    if (rawOn || !p.settings || !p.settings.clap) return
    rawOn = true; window.jarvis.rlog('raw mic 요청')
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then((stream) => {
      const src = actx.createMediaStreamSource(stream)
      const proc = actx.createScriptProcessor(2048, 1, 1)
      proc.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0)
        const s = new Int16Array(f.length)
        for (let k = 0; k < f.length; k++) s[k] = Math.max(-1, Math.min(1, f[k])) * 32767
        window.jarvis.micRaw(s.buffer)
      }
      src.connect(proc); proc.connect(actx.destination); window.jarvis.rlog('raw mic 열림 state=' + actx.state)
    }).catch((e) => { rawOn = false; window.jarvis.rlog('raw mic 실패: ' + (e && e.name) + ' ' + (e && e.message)) })
  })

  // 컴퓨터에서 나는 소리의 크기(기준 신호). 내용은 보내지 않고 크기만 보낸다.
  navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 16, height: 16, frameRate: 1 } }).then((stream) => {
    stream.getVideoTracks().forEach((t) => t.stop())
    if (!stream.getAudioTracks().length) { window.jarvis.rlog('loopback 소리 트랙 없음'); return }
    const src = actx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    const proc = actx.createScriptProcessor(2048, 1, 1)
    proc.onaudioprocess = (e) => { const f = e.inputBuffer.getChannelData(0); let s = 0; for (let k = 0; k < f.length; k++) s += f[k] * f[k]; window.jarvis.micRef(Math.sqrt(s / f.length)) }
    src.connect(proc); proc.connect(actx.destination); window.jarvis.rlog('loopback 열림')
  }).catch((e) => window.jarvis.rlog('loopback 실패: ' + (e && e.name) + ' ' + (e && e.message)))

  const out = new AudioContext()
  let playing = null // { id, node }
  let stops = 0
  const done = (id) => { if (playing && playing.id === id) playing = null; window.jarvis.audioDone(id) }
  window.jarvis.onAudioPlay(async ({ id, mp3 }) => {
    const at = stops
    try {
      const buf = await out.decodeAudioData(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength))
      if (at !== stops) return // 디코딩 중에 stop 이 왔다
      const node = out.createBufferSource()
      node.buffer = buf; node.connect(out.destination)
      node.onended = () => done(id)
      playing = { id, node }
      node.start()
    } catch { done(id) }
  })
  window.jarvis.onAudioSay(({ id, text }) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-US'
    u.onend = u.onerror = () => done(id)
    speechSynthesis.speak(u)
  })
  window.jarvis.onAudioStop(() => {
    stops++
    speechSynthesis.cancel()
    if (playing) { playing.node.onended = null; try { playing.node.stop() } catch { /* 이미 끝남 */ } playing = null }
  })
}

// ---- 강조색: 비서별 accent(#rrggbb)가 있으면 --cyan 과 --acc-rgb 를 함께 덮어쓴다
let accentRgb = '255,138,31'
function setAccent(hex) {
  const root = document.documentElement.style
  if (!hex) { root.removeProperty('--cyan'); root.removeProperty('--acc-rgb'); accentRgb = '255,138,31'; return }
  accentRgb = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(',')
  root.setProperty('--cyan', hex); root.setProperty('--acc-rgb', accentRgb)
}

// ---- 파티클 구체 + 궤도 링. 전체 화면으로 보일 때만 그린다. 상태에 따라 속도·크기가 변한다.
let sphereName = 'JARVIS'
let level = 0 // 마이크 레벨(0~1), onMeter 가 갱신
window.jarvis.onMeter((m) => { level = Math.min(1, m.rms * 10) })
{
  const cv = $('sphere'), ctx = cv.getContext('2d')
  const N = 1600, pts = []
  for (let k = 0; k < N; k++) { // 피보나치 구면 + 약간의 두께
    const y = 1 - (k / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = k * 2.399963
    const d = 0.86 + Math.random() * 0.2
    pts.push([Math.cos(t) * r * d, y * d, Math.sin(t) * r * d])
  }
  const RINGS = [[1.28, 0.35, 0.5], [1.45, -0.5, -0.33], [1.62, 1.1, 0.22]] // 반지름, 기울기, 속도
  const SPEED = { IDLE: 0.12, WAKE: 0.5, LISTENING: 0.3, THINKING: 1.1, SPEAKING: 0.45, FOLLOWUP: 0.25, LOCKED: 0.04 }
  let ang = 0, last = 0, pulse = 0
  function frame(now) {
    requestAnimationFrame(frame)
    const b = document.body.dataset
    if (b.visible !== '1' || b.mode !== 'full') { last = now; return }
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    const W = cv.clientWidth * devicePixelRatio, H = cv.clientHeight * devicePixelRatio
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H }
    ang += dt * (SPEED[b.state] ?? 0.2)
    const target = b.state === 'SPEAKING' || b.state === 'LISTENING' || b.state === 'FOLLOWUP' ? level : 0
    pulse += (target - pulse) * 0.2
    const R0 = Math.min(W, H) * 0.27 * (1 + pulse * 0.18), cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R0 * 1.5)
    // 밝은 화면 위에서도 읽히게 어두운 받침을 먼저 깐다
    glow.addColorStop(0, 'rgba(10,5,2,.72)'); glow.addColorStop(0.6, 'rgba(10,5,2,.5)'); glow.addColorStop(1, 'rgba(10,5,2,0)')
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
    const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(0.35), stt = Math.sin(0.35)
    for (const p of pts) {
      const x = p[0] * ca + p[2] * sa, z0 = -p[0] * sa + p[2] * ca
      const y = p[1] * ct - z0 * stt, z = p[1] * stt + z0 * ct
      const s = 1 / (1.9 - z * 0.7) // 원근
      const size = Math.max(1.5, 3.6 * s * devicePixelRatio)
      ctx.fillStyle = 'rgba(' + accentRgb + ',' + Math.min(1, 0.3 + (z + 1) * 0.45).toFixed(2) + ')'
      ctx.fillRect(cx + x * R0 * s * 1.5 - size / 2, cy + y * R0 * s * 1.5 - size / 2, size, size)
    }
    for (const [rr, tilt, sp] of RINGS) { // 궤도 링과 그 위를 도는 점
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt)
      ctx.strokeStyle = 'rgba(' + accentRgb + ',.6)'; ctx.lineWidth = 1.6 * devicePixelRatio
      ctx.beginPath(); ctx.ellipse(0, 0, R0 * rr, R0 * rr * 0.32, 0, 0, Math.PI * 2); ctx.stroke()
      const t = now / 1000 * sp * 2
      ctx.fillStyle = 'rgba(' + accentRgb + ',1)'; ctx.shadowColor = 'rgb(' + accentRgb + ')'; ctx.shadowBlur = 12 * devicePixelRatio
      ctx.beginPath(); ctx.arc(Math.cos(t) * R0 * rr, Math.sin(t) * R0 * rr * 0.32, 3.5 * devicePixelRatio, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = 'rgba(255,243,230,.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = '300 ' + Math.round(R0 * 0.2) + 'px Pretendard, sans-serif'
    ctx.shadowColor = 'rgb(' + accentRgb + ')'; ctx.shadowBlur = 18 * devicePixelRatio
    ctx.fillText(sphereName.split('').join('\u2009'), cx, cy); ctx.shadowBlur = 0
  }
  requestAnimationFrame(frame)
}
