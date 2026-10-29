import { createClient } from '@supabase/supabase-js';
import './style.css';

// anon 키만 사용. 접근 제어는 Supabase RLS(오너 1인) + api.php 의 JWT 검증이 담당.
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const API_URL = import.meta.env.VITE_API_URL || '/ig/api';
const app = document.getElementById('app');

const state = { tab: 'contacts', settings: null, contacts: [], profiles: [], attention: [], attentionError: null,
  appointments: [], appointmentsError: null, apptPick: '',
  history: [], historyDone: false, search: '', shown: 50,
  calDate: '', calEvents: null, order: null, filter: 'all', health: null, loadedAt: 0, statusOpen: false };

// ── 도우미 ──────────────────────────────────────
// 사용자 데이터는 전부 textContent 로만 넣음 (innerHTML 금지 → XSS 차단)
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || (k in el && typeof v !== 'string')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
  return el;
}

let toastTimer;
function toast(msg, error = false) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast' + (error ? ' error' : ''), role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), error ? 5000 : 2500);
}

const fmt = (s) => s ? new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
function ago(s) {
  if (!s) return '대화 없음';
  const m = Math.round((Date.now() - new Date(s)) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}
const who = (x) => x.name || (x.username ? '@' + x.username : x.igsid);

/** Supabase 업데이트: RLS 에 막히면 0행이 돌아오므로 그것도 실패로 처리 */
async function update(table, match, patch) {
  let q = sb.from(table).update(patch);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data, error } = await q.select();
  if (error || !data?.length) throw new Error(error?.message || '권한 없음 (오너 계정인지 확인)');
  return data[0];
}

async function api(method, action, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${API_URL}?action=${action}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function guard(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}

function toggle(checked, label, onchange) {
  return h('label', { class: 'switch', title: label },
    h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked, e.target) }),
    h('span'));
}

// ── 데이터 ──────────────────────────────────────
async function loadAll() {
  const [s, c, p] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).maybeSingle(),
    loadContacts(),
    sb.from('tone_profiles').select('*').order('is_default', { ascending: false }).order('display_name'),
  ]);
  const err = s.error || p.error;
  if (err) throw new Error(err.message);
  if (!s.data) throw new Error('설정을 읽을 수 없음 — 오너 계정이 아니거나 RLS 설정을 확인하세요');
  state.settings = s.data;
  state.contacts = c;
  state.profiles = p.data;
  state.order = null;          // 상대 목록 순서는 새로 불러올 때만 다시 정함
  state.loadedAt = Date.now();
  await Promise.all([loadAttention(), loadAppointments(), loadHealth(), loadSummaries()]);
}

/** 요약은 암호화 저장 → 서버가 풀어서 줌 (실패해도 나머지 화면은 그대로) */
async function loadSummaries() {
  try {
    const m = await api('GET', 'summaries');
    for (const c of state.contacts) c.summary = m[c.igsid] ?? null;
  } catch { /* 요약 없이 표시 */ }
}

// AI 사용량 (설정 탭): Haiku 5.5 요금 기준 추정, $ / 100만 토큰. 캐시 읽기 10%, 캐시 만들기 5분 1.25배·1시간 2배
const PRICE = { input_tokens: 0.10, output_tokens: 0.50, cache_read: 0.01, cache_write_5m: 0.125, cache_write_1h: 0.20 };
const WON_PER_USD = 1400;
function usageLine() {
  const p = h('p', { class: 'muted' }, 'AI 사용량 불러오는 중…');
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 날짜
  sb.from('claude_usage').select('*').gte('day', today.slice(0, 8) + '01').then(({ data, error }) => {
    if (error) { p.textContent = 'AI 사용량: 불러오지 못함'; return; }
    const line = (rows) => {
      const a = (k) => rows.reduce((x, r) => x + Number(r[k]), 0);
      const won = Object.keys(PRICE).reduce((x, k) => x + a(k) * PRICE[k] / 1e6, 0) * WON_PER_USD;
      const input = a('input_tokens') + a('cache_read') + a('cache_write_5m') + a('cache_write_1h');
      return `${a('calls')}회 · 입력 ${input.toLocaleString()}토큰 (캐시에서 읽음 ${input ? Math.round(a('cache_read') * 100 / input) : 0}%) · 약 ${won < 10 ? won.toFixed(1) : Math.round(won).toLocaleString()}원`;
    };
    p.textContent = `AI 사용량 — 오늘 ${line(data.filter((r) => r.day === today))} / 이번 달 ${line(data)} (Haiku 요금, 1달러 ${WON_PER_USD.toLocaleString()}원 기준 추정)`;
  });
  return p;
}

async function loadHealth() {
  try { state.health = await api('GET', 'health'); } catch { state.health = null; }
}

/** Supabase 는 한 번에 최대 1000행 → 끝까지 나눠서 읽음 */
async function loadContacts() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('contacts').select('*')
      .order('last_msg_at', { ascending: false, nullsFirst: false }).order('igsid').range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

async function loadAppointments() {
  try { state.appointments = await api('GET', 'appointments'); state.appointmentsError = null; }
  catch (e) { state.appointmentsError = e.message; }
}

async function loadAttention() {
  try { state.attention = await api('GET', 'attention'); state.attentionError = null; }
  catch (e) { state.attentionError = e.message; }
}

// ── 화면 ────────────────────────────────────────
function renderLogin(msg) {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%;margin-top:16px' }, '로그인');
  app.replaceChildren(h('form', {
    class: 'card login',
    onsubmit: (e) => {
      e.preventDefault();
      guard(btn, async () => {
        const { error } = await sb.auth.signInWithPassword({ email: email.value, password: pw.value });
        if (error) throw new Error('로그인 실패: ' + error.message);
        await start();
      });
    },
  }, h('h1', {}, 'DM 봇 대시보드'), msg && h('p', { class: 'banner' }, msg),
  h('label', {}, '이메일', email), h('label', {}, '비밀번호', pw), btn));
}

function render() {
  const s = state.settings;
  const tabs = [['contacts', '상대'], ['appointments', '약속'], ['calendar', '캘린더'], ['attention', '주의 필요'], ['history', '발송 이력'], ['profiles', '말투 프로필'], ['settings', '설정']];
  const badge = { attention: state.attention.length, appointments: state.appointments.filter(a => a.status === 'requested').length };
  app.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      h('h1', { class: 'grow' }, 'DM 봇 대시보드'),
      h('button', { class: 'btn small', onclick: (e) => guard(e.target, async () => { await loadAll(); render(); toast('새로고침됨'); }) }, '새로고침'),
      h('button', { class: 'btn small', onclick: () => sb.auth.signOut() }, '로그아웃')),
    masterSwitch(s),
    alertBanners(s),
    statusCard(s),
    tokenBanner(s),
    h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label]) => h('button', {
      class: 'tab' + (state.tab === k ? ' active' : ''), role: 'tab', 'aria-selected': String(state.tab === k),
      onclick: () => { state.tab = k; state.order = null; saveTab(k); render(); },
    }, label, badge[k] ? h('span', { class: 'badge' }, String(badge[k])) : null))),
    ({ contacts: contactsTab, appointments: appointmentsTab, calendar: calendarTab, attention: attentionTab, history: historyTab, profiles: profilesTab, settings: settingsTab })[state.tab](),
  ));
}

function masterSwitch(s) {
  const on = s.global_enabled;
  return h('div', { class: 'master ' + (on ? 'on' : 'off') },
    h('div', { class: 'grow' },
      h('strong', {}, on ? '자동답변 켜짐' : '자동답변 전체 꺼짐'),
      h('div', { style: 'font-size:13px;opacity:.9' }, on ? '상대별 설정에 따라 자동으로 답장합니다' : '어떤 메시지에도 답장하지 않습니다 (최우선)'),
      // 인스타에 DM이 왔는데 여기 '마지막 DM'이 한참 전이면 연결(웹훅)이 끊긴 것
      state.health ? h('div', { style: 'font-size:12px;opacity:.85;margin-top:2px' },
        `마지막 DM 받음 ${since(state.health.last_in)} · 마지막 봇 답장 ${since(state.health.last_sent)}`) : null),
    h('button', {
      class: 'btn',
      onclick: (e) => guard(e.target, async () => {
        if (!on && !confirm('자동답변을 켤까요? 켜는 즉시 대기 중인 메시지에 답장이 나갈 수 있습니다.')) return;
        state.settings = await update('settings', { id: 1 }, { global_enabled: !on, updated_at: new Date().toISOString() });
        render();
        toast(on ? '전체 꺼짐' : '전체 켜짐');
      }),
    }, on ? '전체 끄기' : '켜기'));
}

// ── 지금 내 상황: 봇이 "뭐해?/어디야?" 에 답할 때 참고 ──
const STATUSES = ['집', '카페', '일하는 중', '회의 중', '밥 먹는 중', '운동 중', '이동 중', '운전 중', '친구 만나는 중', '쉬는 중', '바쁨'];
const AREAS = ['논현동', '역삼동', '신사동', '압구정', '청담동', '삼성동', '강남역', '선릉', '성수동', '홍대', '이태원', '잠실'];

function statusCard(s) {
  const save = (patch, msg) => (e) => guard(e.target, async () => {
    const at = new Date().toISOString();
    // 자는 중이 아닌 상황으로 바꾸거나 지우면 열려 있는 수면 기록을 끝냄 (안 그러면 봇이 계속 자는 중으로 봄)
    if ('owner_status' in patch && patch.owner_status !== '자는 중') {
      const r = await sb.from('calendar_events').update({ end_at: at }).eq('kind', 'sleep').is('end_at', null);
      if (r.error) throw new Error(r.error.message);
      state.calEvents = null;
    }
    state.settings = await update('settings', { id: 1 }, { ...patch, owner_status_at: at });
    state.statusOpen = false;   // 고르면 다시 한 줄로
    render();
    toast(msg);
  });
  const custom = h('input', { type: 'text', placeholder: '직접 입력 (예: 부모님 댁, 공항 가는 중)', maxlength: 60, class: 'grow', 'aria-label': '상황 직접 입력' });
  const area = h('input', { type: 'text', list: 'areas', placeholder: '동네 선택·입력', value: s.owner_area ?? '', maxlength: 30, style: 'width:160px', 'aria-label': '동네' });
  const chip = (label) => h('button', {
    class: 'btn small' + (s.owner_status === label ? ' primary' : ''), 'aria-pressed': String(s.owner_status === label),
    onclick: save({ owner_status: label }, `상황: ${label}`),
  }, label);
  const now = [s.owner_status, s.owner_area].filter(Boolean).join(' · ');
  // 오래된 '하는 일'은 봇이 쓰지 않음 (봇과 같은 기준: 자는 중 12시간, 방금 일어남 1시간, 나머지 6시간). 위치(동네)는 바꿀 때까지 계속 씀
  const ageH = s.owner_status_at ? (Date.now() - new Date(s.owner_status_at)) / 3600e3 : Infinity;
  const ignored = [s.owner_status && ageH >= ({ '자는 중': 12, '방금 일어남': 1 }[s.owner_status] ?? 6) && '상황'].filter(Boolean);
  // 수면 ↔ 일어남: 버튼 한 번으로 상황을 바꾸고 캘린더에 수면 시간을 기록
  const sleeping = s.owner_status === '자는 중';
  const sleepBtn = h('button', { class: 'btn primary', onclick: (e) => guard(e.target, async () => {
    const at = new Date().toISOString();
    const r = sleeping
      ? await sb.from('calendar_events').update({ end_at: at }).eq('kind', 'sleep').is('end_at', null)
      : await sb.from('calendar_events').insert({ kind: 'sleep', start_at: at });
    if (r.error) throw new Error(r.error.message);
    state.settings = await update('settings', { id: 1 }, { owner_status: sleeping ? '방금 일어남' : '자는 중', owner_status_at: at });
    state.calEvents = null;
    render();
    toast(sleeping ? '일어남 — 수면 기록 완료' : '수면 시작 — 캘린더에 기록');
  }) }, sleeping ? '☀️ 일어났어' : '🌙 잘게');
  return h('div', { class: 'card', style: 'margin:12px 0' },
    h('div', { class: 'row' },
      h('span', { class: 'grow' }, h('strong', {}, '지금: '), now || '설정 안 함',
        h('span', { class: 'muted' }, now ? ` (${ago(s.owner_status_at)})${ignored.length ? ` · ${ignored.join('·')}은 오래돼서 봇이 무시 중` : ''}` : ' — 봇이 지어내지 않음')),
      sleepBtn,
      h('button', { class: 'btn small', 'aria-expanded': String(state.statusOpen), onclick: () => { state.statusOpen = !state.statusOpen; render(); } },
        state.statusOpen ? '접기' : '바꾸기')),
    state.statusOpen ? statusEditor() : null);

  function statusEditor() {
    return h('div', {},
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin-top:8px' }, STATUSES.map(chip),
      s.owner_status && !STATUSES.includes(s.owner_status) ? h('button', { class: 'btn small primary' }, s.owner_status) : null),
    h('div', { class: 'row', style: 'margin-top:8px' }, custom,
      h('button', { class: 'btn small', onclick: (e) => custom.value.trim() ? save({ owner_status: custom.value.trim() }, '상황 저장됨')(e) : toast('내용을 입력하세요', true) }, '직접 입력 저장')),
    h('div', { class: 'row', style: 'margin-top:8px' }, area, h('datalist', { id: 'areas' }, AREAS.map(a => h('option', { value: a }))),
      h('button', { class: 'btn small', onclick: (e) => save({ owner_area: area.value.trim() || null }, area.value.trim() ? `동네: ${area.value.trim()}` : '동네 지움')(e) }, '동네 저장'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn small', onclick: save({ owner_status: null, owner_area: null }, '상황 지움') }, '상황 지우기')));
  }
}

const since = (v) => v ? ago(v) : '없음';
/** 인스타 앱에서 그 사람과의 대화방 열기 (아이디를 알 때만) */
const igLink = (x) => x.username ? h('a', { class: 'btn small', href: `https://ig.me/m/${encodeURIComponent(x.username)}`, target: '_blank', rel: 'noopener' }, '인스타에서 열기') : null;

/** 봇이 멈추거나 상황이 오래됐을 때 맨 위에 경고 */
function alertBanners(s) {
  const out = [];
  const hAgo = (v) => v ? (Date.now() - new Date(v)) / 3600e3 : 0;
  if (state.health?.stuck) out.push(`답장 ${state.health.stuck}건이 5분 넘게 처리되지 않았어요. 10분 뒤에도 그대로면 개발자에게 알려 주세요.`);
  if (s.daily_run_at && hAgo(s.daily_run_at) > 26) out.push('새벽 유지 작업(토큰 갱신·정리)이 하루 넘게 돌지 않았어요. 개발자에게 알려 주세요.');
  if (s.owner_status === '자는 중' && hAgo(s.owner_status_at) >= 12) out.push("12시간 넘게 '자는 중'이에요. 일어났으면 ☀️ 일어났어를 눌러 주세요. (봇은 이제 자는 중으로 보지 않아요)");
  return out.length ? h('div', {}, out.map(t => h('div', { class: 'banner' }, t))) : null;
}

function tokenBanner(s) {
  const days = s.token_expires_at ? (new Date(s.token_expires_at) - Date.now()) / 86400000 : null;
  if (s.token_error) return h('div', { class: 'banner' }, s.token_error.startsWith('인스타') ? s.token_error
    : '인스타 토큰 갱신 실패 — 개발자에게 알려 주세요 (' + s.token_error + ')');
  if (days !== null && days < 10) return h('div', { class: 'banner' }, `인스타 토큰이 ${Math.max(0, Math.floor(days))}일 후 만료됩니다`);
  return null;
}

/** 일시정지 남은 분 (끝났으면 0) — 화면을 다시 그릴 때마다 지금 시각으로 다시 계산 */
const pauseLeft = (c) => c.paused_until ? Math.max(0, Math.ceil((new Date(c.paused_until) - Date.now()) / 60000)) : 0;

const CONTACT_FILTERS = [
  ['all', '전체', () => true],
  ['off', '꺼짐', c => !c.auto_enabled],
  ['accept', '수락 명단', c => c.appt_accept],
  ['paused', '일시정지 중', c => pauseLeft(c) > 0],
  ['rel', '관계 적음', c => !!(c.relation || c.gender || c.memo)],
];

/** 상대 탭 맨 위: 지금 일시정지 중인 사람 (내가 직접 대화 중 → 봇이 답하지 않는 사람) */
function pausedLine() {
  const list = state.contacts.filter(c => pauseLeft(c) > 0).sort((a, b) => pauseLeft(a) - pauseLeft(b));
  if (!list.length) return null;
  return h('div', { class: 'banner', style: 'margin:0 0 8px' },
    `일시정지 중 (내가 직접 대화 중이라 봇이 안 답함): ${list.map(c => `${who(c)} ${pauseLeft(c)}분`).join(' · ')}`);
}

function contactsTab() {
  const listEl = h('div', { class: 'list' });
  const byId = new Map(state.contacts.map(c => [c.igsid, c]));
  // 순서는 탭에 들어올 때·검색·필터를 바꿀 때만 다시 정함 → 토글을 눌러도 카드가 제자리에 있음 (옆 사람 잘못 누르기 방지)
  const resort = () => {
    const q = state.search.trim().toLowerCase();
    const keep = CONTACT_FILTERS.find(([k]) => k === state.filter)?.[2] ?? (() => true);
    state.order = state.contacts.filter(c => keep(c) && (!q || [c.name, c.username, c.igsid, c.summary, c.relation, c.memo].some(v => v?.toLowerCase().includes(q))))
      // 맨 위: 자동발송 꺼진 상대(최근에 끈 순) → 지금 일시정지 중인 상대 → 나머지는 원래 순서
      .map((c, i) => [c, i]).sort(([a, i], [b, j]) => (a.auto_enabled - b.auto_enabled)
        || (!a.auto_enabled && ((b.auto_off_at ?? '').localeCompare(a.auto_off_at ?? '')))
        || ((pauseLeft(b) > 0) - (pauseLeft(a) > 0)) || i - j).map(([c]) => c.igsid);
  };
  const draw = () => {
    if (!state.order) resort();
    const rows = state.order.map(id => byId.get(id)).filter(Boolean);
    // 상대가 천 명 넘으면 한꺼번에 그릴 때 화면이 멈춤 → 50명씩
    const shown = rows.slice(0, state.shown);
    listEl.replaceChildren(...(rows.length ? shown.map(contactItem) : [h('p', { class: 'muted' }, '상대가 없습니다')]),
      rows.length > shown.length ? h('button', { class: 'btn', onclick: () => { state.shown += 50; draw(); } },
        `더 보기 (${rows.length - shown.length}명 남음)`) : null);
  };
  draw();
  // 인스타 대화 목록의 상대를 전부 추가 (한 번에 일부씩 → after 가 남아 있으면 이어서 호출)
  const importAll = (e) => guard(e.target, async () => {
    let after = null, total = 0;
    do {
      e.target.textContent = `불러오는 중… ${total}명`;
      const r = await api('POST', 'import_contacts', { after });
      total += r.count; after = r.after;
    } while (after);
    await loadAll(); render();
    toast(`인스타 대화 상대 ${total}명 반영됨`);
  });
  // 모든 상대의 자동발송을 한 번에 켜기/끄기 (전체 스위치와 별개 — 전체 OFF 면 여전히 아무것도 안 보냄)
  // '전체 끄기'로 한 번에 꺼진 사람은 끈 시각이 똑같이 찍힘(DB) → '전체 켜기'는 그 사람들만 다시 켜고, 따로 꺼 둔 사람은 그대로
  const setAll = (v) => (e) => guard(e.target, async () => {
    const off = state.contacts.filter(c => !c.auto_enabled);
    const bulk = state.settings.bulk_off_at;
    const targets = v ? (bulk && off.some(c => c.auto_off_at && Date.parse(c.auto_off_at) === Date.parse(bulk))
      ? off.filter(c => c.auto_off_at && Date.parse(c.auto_off_at) === Date.parse(bulk)) : off)
      : state.contacts.filter(c => c.auto_enabled);
    if (!targets.length) return toast(`이미 모두 ${v ? '켜져' : '꺼져'} 있어요`);
    const kept = v ? off.length - targets.length : 0;
    if (!confirm(v
      ? `상대 ${targets.length}명의 자동발송을 켤까요?${kept ? `\n따로 꺼 둔 ${kept}명은 그대로 둡니다.` : ''}\n켜면 이 사람들이 DM을 보낼 때 봇이 답장합니다.`
      : `상대 ${targets.length}명의 자동발송을 끌까요?\n(잠깐 멈추려면 맨 위 '전체 끄기' 스위치를 쓰세요 — 사람별 설정이 그대로 남아요)\n여기서 끄면 나중에 '전체 켜기'로 이번에 끈 사람만 다시 켤 수 있어요.`)) return;
    if (v) {
      let q = sb.from('contacts').update({ auto_enabled: true }).eq('auto_enabled', false);
      if (kept) q = q.eq('auto_off_at', bulk);
      const { error } = await q;
      if (error) throw new Error(error.message);
      targets.forEach(c => { c.auto_enabled = true; c.auto_off_at = null; });
    } else {
      const { data, error } = await sb.from('contacts').update({ auto_enabled: false }).eq('auto_enabled', true).select('igsid, auto_off_at');
      if (error) throw new Error(error.message);
      const at = data?.[0]?.auto_off_at ?? null;   // 한 번에 꺼진 사람들의 공통 시각
      const offAt = new Map((data ?? []).map(r => [r.igsid, r.auto_off_at]));
      state.contacts.forEach(c => { if (offAt.has(c.igsid)) { c.auto_enabled = false; c.auto_off_at = offAt.get(c.igsid); } });
      if (at) state.settings = await update('settings', { id: 1 }, { bulk_off_at: at });
    }
    state.order = null;
    render();
    toast(`상대 ${targets.length}명 자동발송 ${v ? '켜짐' : '꺼짐'}`);
  });
  return h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:8px' },
      h('span', { class: 'muted grow' }, `상대 ${state.contacts.length}명 · 자동발송 켜짐 ${state.contacts.filter(c => c.auto_enabled).length}명`),
      h('button', { class: 'btn small primary', onclick: setAll(true) }, '전체 켜기'),
      h('button', { class: 'btn small', onclick: setAll(false) }, '전체 끄기')),
    pausedLine(),
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;margin-bottom:8px' }, CONTACT_FILTERS.map(([k, label, keep]) => h('button', {
      class: 'btn small' + (state.filter === k ? ' primary' : ''), 'aria-pressed': String(state.filter === k),
      onclick: () => { state.filter = k; state.shown = 50; state.order = null; render(); },
    }, `${label} ${state.contacts.filter(keep).length}`))),
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      h('input', { type: 'text', placeholder: '이름·아이디·관계·메모 검색', value: state.search, 'aria-label': '상대 검색', class: 'grow',
        oninput: (e) => { state.search = e.target.value; state.shown = 50; state.order = null; draw(); } }),
      h('button', { class: 'btn small', onclick: importAll, title: '인스타 DM 목록의 모든 상대를 여기에 추가' }, '상대 전부 불러오기')),
    h('datalist', { id: 'relations' }, RELATIONS.map(r => h('option', { value: r }))),
    listEl);
}

const RELATIONS = ['형', '누나', '오빠', '언니', '선배', '후배', '동생', '동갑', '친구', '동기', '고객', '거래처', '선생님', '교수님', '직장 상사', '동료', '가족'];
const FORMAL_REL = /형|누나|오빠|언니|선배|고객|손님|선생|교수|상사|사장|대표|부장|차장|과장|팀장|거래처|어르신|님/;
const CASUAL_REL = /동생|후배|동갑|친구|동기/;
/** 봇이 이 상대에게 쓸 말투 (메모 → 관계 → 대화 이력) — 봇과 같은 기준 */
function speechLabel(c) {
  const memo = c.memo ?? '', rel = c.relation ?? '';
  if (/반말\s*(안|않|금지|X)/i.test(memo)) return '존댓말 (메모)';
  if (/반말/.test(memo)) return '반말 (메모)';
  if (/존댓말|존대/.test(memo)) return '존댓말 (메모)';
  if (CASUAL_REL.test(rel)) return '반말 (관계)';
  if (FORMAL_REL.test(rel)) return '존댓말 (관계)';
  return '대화 이력대로';
}

/** 관계·성별·메모 적기 (시간 날 때 적으면 봇이 반말/존댓말·호칭을 맞춤) */
function relationEditor(c, replace) {
  const rel = h('input', { type: 'text', list: 'relations', value: c.relation ?? '', maxlength: 20, placeholder: '관계 (형·동생·고객…)', 'aria-label': '관계', style: 'flex:1 1 120px' });
  const gender = h('select', { 'aria-label': '성별', style: 'flex:0 0 auto;width:auto' },
    ['', '남자', '여자'].map(g => h('option', { value: g, selected: (c.gender ?? '') === g }, g || '성별')));
  const memo = h('input', { type: 'text', value: c.memo ?? '', maxlength: 100, placeholder: "메모 (예: 반말 쓰는 형, 존댓말 쓰는 동생)", 'aria-label': '메모', class: 'grow' });
  const save = (e) => guard(e.target, async () => {
    replace(await update('contacts', { igsid: c.igsid }, { relation: rel.value.trim() || null, gender: gender.value || null, memo: memo.value.trim() || null }));
    toast(`${who(c)} 관계 저장 — 봇 말투: ${speechLabel(c)}`);
  });
  return h('div', { class: 'card', hidden: true, style: 'margin-top:8px;padding:10px' },
    h('div', { class: 'row' }, rel, gender),
    h('div', { class: 'row', style: 'margin-top:8px' }, memo, h('button', { class: 'btn small primary', type: 'button', onclick: save }, '저장')),
    h('p', { class: 'muted', style: 'margin:6px 0 0' }, '형·누나·선배·고객·선생님은 존댓말, 동생·동갑·친구는 반말이 기본이에요. 다르면 메모에 "반말 쓰는 형"처럼 적으세요. 메모는 상대에게 말하지 않아요.'));
}

function contactItem(c) {
  const [pv, pvInput] = previewBox(c);
  const left = pauseLeft(c);
  const paused = left > 0;
  const replace = (row) => { Object.assign(c, row); render(); };
  const relBox = relationEditor(c, replace);
  const relInfo = [c.relation, c.gender, c.memo].filter(Boolean).join(' · ');
  const profileSel = h('select', {
    'aria-label': '말투 프로필', style: 'width:auto',
    onchange: (e) => guard(e.target, async () => {
      replace(await update('contacts', { igsid: c.igsid }, { profile_id: e.target.value ? Number(e.target.value) : null }));
      toast('말투 프로필 변경됨');
    }),
  }, h('option', { value: '' }, '자동 (아이디 매칭 → 기본)'),
  state.profiles.filter(p => !p.is_default).map(p => h('option', { value: String(p.id), selected: c.profile_id === p.id },
    `${p.display_name || p.contact_key} (${p.contact_key})`)));

  return h('div', { class: 'item' },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('strong', {}, who(c)), ' ',
        c.username && c.name ? h('span', { class: 'muted' }, '@' + c.username) : null,
        h('div', { class: 'muted' }, '마지막 대화 ' + ago(c.last_msg_at)),
        h('div', { class: 'muted' }, (relInfo ? relInfo + ' · ' : '') + '봇 말투: ' + speechLabel(c))),
      paused ? h('span', { class: 'pill warn', title: `${fmt(c.paused_until)}까지 — 내가 직접 대화 중이라 봇이 답하지 않음` }, `일시정지 ${left}분 남음`) : null,
      paused ? h('button', { class: 'btn small', onclick: (e) => guard(e.target, async () => replace(await update('contacts', { igsid: c.igsid }, { paused_until: null }))) }, '해제') : null,
      toggle(c.auto_enabled, `${who(c)} 자동발송`, (v, el) => guard(el, async () => {
        replace(await update('contacts', { igsid: c.igsid }, { auto_enabled: v }));
        toast(`${who(c)} 자동발송 ${v ? '켜짐' : '꺼짐'}`);
      }))),
    h('div', { class: 'summary' }, c.summary || h('span', { class: 'muted' }, '요약 없음')),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('span', { class: 'muted grow' }, c.summary_at ? '요약 ' + fmt(c.summary_at) : ''),
      profileSel,
      h('button', { class: 'btn small', onclick: (e) => guard(e.target, async () => {
        e.target.textContent = '요약 중…';
        const r = await api('POST', 'summarize', { igsid: c.igsid });
        replace({ summary: r.summary, summary_at: new Date().toISOString() });
        toast('요약 갱신됨');
      }) }, '요약 갱신'),
      h('button', { class: 'btn small', onclick: () => { state.apptPick = c.igsid; state.tab = 'appointments'; render(); } }, '약속잡기'),
      h('button', { class: 'btn small', onclick: () => { pv.hidden = !pv.hidden; if (!pv.hidden) pvInput.focus(); } }, '미리보기'),
      h('button', { class: 'btn small', onclick: () => { relBox.hidden = !relBox.hidden; } }, relInfo ? '관계 고치기' : '관계 적기')),
    relBox,
    pv);
}

/** 답장 미리보기: 이 상대가 이런 말을 보내면 봇이 뭐라고 할지 (보내지도 저장하지도 않음) */
function previewBox(c) {
  const input = h('input', { type: 'text', placeholder: '상대가 보낼 말 (예: 내일 7시 강남 ㄱ?)', maxlength: 500, class: 'grow', 'aria-label': '미리볼 문장' });
  const out = h('div', { style: 'margin-top:6px;white-space:pre-wrap' });
  const run = (e) => guard(e.target, async () => {
    if (!input.value.trim()) throw new Error('미리볼 문장을 입력하세요');
    out.textContent = '봇이 생각하는 중…';
    const r = await api('POST', 'preview', { igsid: c.igsid, text: input.value });
    out.textContent = [
      r.text ? `보낼 답: "${r.text}"` : r.skip ? `답하지 않음: ${r.skip}` : `보내지 않고 주의 필요로: ${r.review}`,
      r.draft ? `(봇이 쓰려던 답: "${r.draft}")` : '',
      r.when ? `약속 날짜로 기록: ${dateLabel(r.when.date)}${r.when.time ? ' ' + r.when.time : ''}` : '',
      r.note ? `봇 판단: ${r.note}` : '',
      r.blocked ? `※ ${r.blocked}` : '',
    ].filter(Boolean).join('\n');
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(e); });
  const box = h('div', { class: 'card', hidden: true, style: 'margin-top:8px;padding:10px' },
    h('div', { class: 'row' }, input, h('button', { class: 'btn small primary', type: 'button', onclick: run }, '보기')),
    out,
    h('p', { class: 'muted', style: 'margin:6px 0 0' }, '실제로 보내지 않아요. 한 번 볼 때마다 AI 비용이 1번 들어요.'));
  return [box, input];
}

// ── 캘린더 (시간대별 기록 → 봇이 답장할 때 참고) ──────────
const KIND = { schedule: ['일정', 'good'], appointment: ['약속', 'warn'], sleep: ['수면', ''] };
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const addDays = (ymdStr, n) => { const d = new Date(ymdStr + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };

async function loadCalendar() {
  const end = new Date(addDays(state.calDate, 1) + 'T00:00');
  const prev = new Date(addDays(state.calDate, -1) + 'T00:00');   // 전날 밤에 시작한 수면도 보이게
  const { data, error } = await sb.from('calendar_events').select('*')
    .gte('start_at', prev.toISOString()).lt('start_at', end.toISOString()).order('start_at');
  if (error) throw new Error(error.message);
  const start = new Date(state.calDate + 'T00:00');
  // 끝 시각이 없으면: 수면은 지금까지, 나머지는 1시간
  state.calEvents = data.map(e => ({ ...e, s: new Date(e.start_at),
    e: e.end_at ? new Date(e.end_at) : e.kind === 'sleep' ? new Date() : new Date(new Date(e.start_at).getTime() + 3600e3) }))
    .filter(e => e.e > start);
}

/** 캘린더 맨 위: 고른 날짜의 약속 (약속 탭 목록에서) */
function dayAppointments() {
  const list = state.appointments.filter(a => a.date === state.calDate && ['requested', 'accepted', 'confirmed', 'planned', 'proposed'].includes(a.status))
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  if (!list.length) return null;
  return h('div', { class: 'card' },
    h('h2', {}, '이날 약속'),
    list.map(a => h('div', { class: 'row', style: 'margin-top:4px' },
      h('strong', {}, a.time ?? '종일'), h('span', { class: 'grow' }, who(a)),
      h('span', { class: 'pill ' + (APPT[a.status]?.[1] || '') }, APPT[a.status]?.[0] || a.status))),
    h('p', { class: 'muted', style: 'margin:8px 0 0' }, '봇은 이 날짜에 약속이 있다는 것만 알고, 누구와인지는 몰라요.'));
}

function calendarTab() {
  if (!state.calDate) state.calDate = ymd(new Date());
  if (!state.calEvents) {
    guard(null, async () => { await loadCalendar(); render(); });
    return h('p', { class: 'muted' }, '불러오는 중…');
  }
  const go = (n) => () => { state.calDate = n === 0 ? ymd(new Date()) : addDays(state.calDate, n); state.calEvents = null; render(); };
  const dayStart = new Date(state.calDate + 'T00:00');

  const kind = h('select', { 'aria-label': '종류', style: 'flex:0 0 auto;width:auto' },
    h('option', { value: 'schedule' }, '일정'), h('option', { value: 'appointment' }, '약속'));
  const from = h('input', { type: 'time', value: '09:00', 'aria-label': '시작 시각' });
  const to = h('input', { type: 'time', value: '10:00', 'aria-label': '끝 시각' });
  const title = h('input', { type: 'text', placeholder: '내용 (나만 보임 — 봇은 시간만 참고)', maxlength: 80, class: 'grow', 'aria-label': '내용' });
  const add = (e) => guard(e.target, async () => {
    const s = new Date(`${state.calDate}T${from.value}`);
    let en = to.value ? new Date(`${state.calDate}T${to.value}`) : null;
    if (en && en <= s) en = new Date(en.getTime() + 86400e3);   // 23:00~01:00 처럼 자정을 넘김
    if (kind.value === 'schedule' && !title.value.trim()) throw new Error('일정 내용을 입력하세요');
    const { error } = await sb.from('calendar_events').insert({ kind: kind.value, title: title.value.trim(), start_at: s.toISOString(), end_at: en?.toISOString() ?? null });
    if (error) throw new Error(error.message);
    await loadCalendar(); render();
    toast(`${from.value} ${KIND[kind.value][0]} 추가됨`);
  });
  const form = h('div', { class: 'card' },
    h('h2', {}, `${dateLabel(state.calDate)} 기록 추가`),
    h('div', { class: 'row' }, kind, from, h('span', { class: 'muted' }, '~'), to),
    h('div', { class: 'row', style: 'margin-top:8px' }, title, h('button', { class: 'btn small primary', onclick: add }, '추가')),
    h('p', { class: 'muted', style: 'margin:8px 0 0' }, '약속이 있는 날에 누가 만나자고 하면 봇은 수락 명단이어도 "그날은 약속이 있어"라고만 답해요. 약속 내용은 말하지 않아요.'));

  const del = (ev) => (e) => guard(e.target, async () => {
    if (!confirm(`${hm(ev.s)} ${KIND[ev.kind][0]} ${ev.title || ''} 삭제할까요?`)) return;
    const { error } = await sb.from('calendar_events').delete().eq('id', ev.id);
    if (error) throw new Error(error.message);
    await loadCalendar(); render();
  });
  const hours = Array.from({ length: 24 }, (_, hr) => {
    const hs = new Date(dayStart.getTime() + hr * 3600e3), he = new Date(hs.getTime() + 3600e3);
    const evs = state.calEvents.filter(ev => ev.s < he && ev.e > hs);
    return h('div', { class: 'hour' + (evs.length ? ' busy' : '') },
      h('span', { class: 'muted hour-label' }, `${String(hr).padStart(2, '0')}시`),
      h('div', { class: 'grow row', style: 'gap:6px' }, evs.map(ev => h('button', {
        class: 'pill ' + KIND[ev.kind][1], title: '눌러서 삭제', onclick: del(ev), style: 'cursor:pointer;background:none',
      }, `${KIND[ev.kind][0]}${ev.title ? ' · ' + ev.title : ''} ${hm(ev.s)}~${ev.end_at || ev.kind !== 'sleep' ? hm(ev.e) : ''}`))),
      h('button', { class: 'btn small', 'aria-label': `${hr}시에 추가`, onclick: () => {
        from.value = `${String(hr).padStart(2, '0')}:00`; to.value = `${String((hr + 1) % 24).padStart(2, '0')}:00`;
        title.focus(); title.scrollIntoView({ block: 'center' });
      } }, '+'));
  });

  return h('div', { class: 'list' },
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: go(-1), 'aria-label': '전날' }, '◀'),
      h('input', { type: 'date', value: state.calDate, 'aria-label': '날짜',
        onchange: (e) => { if (e.target.value) { state.calDate = e.target.value; state.calEvents = null; render(); } } }),
      h('button', { class: 'btn small', onclick: go(1), 'aria-label': '다음날' }, '▶'),
      h('button', { class: 'btn small', onclick: go(0) }, '오늘')),
    dayAppointments(),
    form,
    h('div', { class: 'card', style: 'padding:4px 12px' }, hours));
}

// ── 약속 ────────────────────────────────────────
const APPT = { requested: ['약속 요청 받음', 'warn'], accepted: ['봇이 수락함', 'good'], confirmed: ['약속 확정', 'good'], declined: ['봇이 거절함 (일정 겹침)', ''], planned: ['날짜 정함 (미발송)', ''], proposed: ['날짜 보냄', 'good'], done: ['완료', ''], cancelled: ['취소', 'bad'] };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateLabel = (v) => { if (!v) return ''; const [y, m, d] = v.slice(0, 10).split('-'); return `${y}년.${m}월.${d}일`; };

/** 보류된 약속 요청에 바로 답하기: [좋아 보내기](날짜·시각은 봇이 뽑은 값, 고칠 수 있음) / [안 돼 보내기] */
function replyForm(a) {
  const date = h('input', { type: 'date', min: ymd(new Date()), value: a.date ?? '', 'aria-label': '약속 날짜' });
  const time = h('input', { type: 'time', value: a.time ?? '', 'aria-label': '약속 시각 (선택)' });
  const send = (answer) => (e) => guard(e.target, async () => {
    if (answer === 'yes' && !date.value) throw new Error('날짜를 고르세요');
    if (!confirm(answer === 'yes' ? `${dateLabel(date.value)}${time.value ? ' ' + time.value : ''} 좋다고 보낼까요?` : '안 된다고 보낼까요?')) return;
    const r = await api('POST', 'appoint_reply', { id: a.id, answer, date: date.value, time: time.value || null });
    toast(`보냄: ${r.text}`);
    await Promise.all([loadAppointments(), loadAttention()]);
    render();
  });
  return h('div', { style: 'margin-top:8px' },
    h('div', { class: 'row' }, date, time, h('span', { class: 'grow' }),
      h('button', { class: 'btn small primary', onclick: send('yes'), disabled: !a.can_send }, '좋아 보내기'),
      h('button', { class: 'btn small', onclick: send('no'), disabled: !a.can_send }, '안 돼 보내기'),
      igLink(a)),
    h('p', { class: 'muted', style: 'margin:6px 0 0' }, a.can_send
      ? '인스타에서 이미 답했다면 누르지 마세요 (두 번 답하게 돼요). 그때는 아래 완료·취소만 누르세요.'
      : '24시간이 지나 봇이 보낼 수 없어요. 인스타에서 직접 답한 뒤 완료·취소를 누르세요.'));
}

/** 날짜 고르기 + [날짜 보내기] [보내지 않고 저장] */
function appointForm(igsid, id, canSend) {
  const date = h('input', { type: 'date', min: ymd(new Date()), style: 'width:auto', 'aria-label': '약속 날짜' });
  const time = h('input', { type: 'time', 'aria-label': '약속 시각 (선택)', title: '시각은 비워도 돼요' });
  const preview = h('span', { class: 'muted' });
  const show = () => { preview.textContent = date.value ? dateLabel(date.value) + (time.value ? ' ' + time.value : '') : ''; };
  date.addEventListener('input', show);
  time.addEventListener('input', show);
  const go = (send) => (e) => guard(e.target, async () => {
    const who_ = typeof igsid === 'function' ? igsid() : igsid;
    if (!who_) throw new Error('상대를 고르세요');
    if (!date.value) throw new Error('날짜를 고르세요');
    if (send && !confirm(`${dateLabel(date.value)}${time.value ? ' ' + time.value : ''} 약속 메시지를 보낼까요?`)) return;
    const r = await api('POST', 'appoint', { igsid: who_, date: date.value, time: time.value || null, send, id });
    toast(send ? `보냄: ${r.text}` : '약속 목록에 저장됨');
    state.apptPick = '';
    await loadAppointments();
    render();
  });
  return h('div', { class: 'row', style: 'margin-top:8px' },
    date, time, preview, h('span', { class: 'grow' }),
    h('button', { class: 'btn small primary', onclick: go(true), disabled: canSend === false,
      title: canSend === false ? '상대의 마지막 메시지가 24시간 지나 봇이 보낼 수 없어요' : '' }, '날짜 보내기'),
    h('button', { class: 'btn small', onclick: go(false) }, '보내지 않고 저장'));
}

function appointmentsTab() {
  if (state.appointmentsError) return h('p', { class: 'banner' }, '불러오기 실패: ' + state.appointmentsError);
  // 직접 추가: 요청이 없었던 사람도 무조건 약속 목록에 올릴 수 있음
  const pick = h('select', { 'aria-label': '약속 잡을 상대' },
    h('option', { value: '' }, '상대 선택…'),
    [...state.contacts].sort((a, b) => who(a).localeCompare(who(b), 'ko'))
      .map(c => h('option', { value: c.igsid, selected: c.igsid === state.apptPick }, who(c) + (c.username && c.name ? ` (@${c.username})` : ''))));
  const add = h('div', { class: 'card' },
    h('h2', {}, '약속 추가'),
    h('p', { class: 'muted' }, '요청이 없었던 사람도 여기서 바로 약속 목록에 올릴 수 있어요. "날짜 보내기"는 설정의 약속 메시지 문구로 상대에게 DM을 보내고, "보내지 않고 저장"은 목록에만 기록해요.'),
    pick, appointForm(() => pick.value));

  // 무조건 수락 명단: 이 사람들이 약속을 잡자고 하면 봇이 회피하지 않고 바로 수락
  const byName = [...state.contacts].sort((a, b) => who(a).localeCompare(who(b), 'ko'));
  const setAccept = (c, v) => (e) => guard(e.target, async () => {
    Object.assign(c, await update('contacts', { igsid: c.igsid }, { appt_accept: v }));
    render();
    toast(`${who(c)} ${v ? '수락 명단에 추가' : '수락 명단에서 뺌'}`);
  });
  const accPick = h('select', { 'aria-label': '수락 명단에 추가할 상대', class: 'grow' },
    h('option', { value: '' }, '상대 선택…'),
    byName.filter(c => !c.appt_accept).map(c => h('option', { value: c.igsid }, who(c) + (c.username && c.name ? ` (@${c.username})` : ''))));
  const accepted = byName.filter(c => c.appt_accept);
  const acceptCard = h('div', { class: 'card' },
    h('h2', {}, '무조건 수락 명단'),
    h('p', { class: 'muted' }, '여기 있는 사람이 약속을 잡자고 하면 봇이 "시간 보고 알려줄게" 대신 바로 수락해요. 수락한 약속은 아래 목록에 "봇이 수락함"으로 올라와요.'),
    h('div', { class: 'row' }, accPick, h('button', { class: 'btn small primary', onclick: (e) => {
      const c = state.contacts.find(x => x.igsid === accPick.value);
      if (!c) return toast('상대를 고르세요', true);
      setAccept(c, true)(e);
    } }, '추가')),
    accepted.length
      ? h('div', { class: 'list', style: 'margin-top:8px' }, accepted.map(c => h('div', { class: 'row' },
          h('span', { class: 'grow' }, who(c)), h('button', { class: 'btn small', onclick: setAccept(c, false) }, '빼기'))))
      : h('p', { class: 'muted' }, '명단이 비어 있어요'));

  const OPEN = ['requested', 'accepted', 'confirmed', 'planned', 'proposed'];
  const open = state.appointments.filter(a => OPEN.includes(a.status));
  const closed = state.appointments.filter(a => !OPEN.includes(a.status));
  const item = (a) => h('div', { class: 'item' },
    h('div', { class: 'row' },
      h('strong', { class: 'grow' }, who(a)),
      h('span', { class: 'pill ' + (APPT[a.status]?.[1] || '') }, APPT[a.status]?.[0] || a.status),
      a.date ? h('strong', {}, dateLabel(a.date) + (a.time ? ' ' + a.time : '')) : null),
    a.request_text ? h('div', { class: 'text' }, '“' + a.request_text + '”') : null,
    h('div', { class: 'muted' }, [
      a.requested_at ? '요청 ' + fmt(a.requested_at) : '직접 추가 ' + fmt(a.created_at),
      a.sent_at ? ' · 보냄 ' + fmt(a.sent_at) : '',
      a.can_send ? '' : ' · 24시간 지나 봇이 보낼 수 없음 (인스타에서 직접)',
    ].join('')),
    a.status === 'requested' ? replyForm(a) : ['proposed', 'confirmed', 'accepted', 'declined'].includes(a.status) ? null : appointForm(a.igsid, a.id, a.can_send),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'grow' }),
      ...[['done', '완료'], ['cancelled', '취소']].map(([st, label]) => h('button', {
        class: 'btn small', onclick: (e) => guard(e.target, async () => {
          await api('POST', 'appointment_status', { id: a.id, status: st });
          await loadAppointments();
          render();
        }),
      }, label))));

  return h('div', { class: 'list' }, acceptCard, add,
    open.length ? open.map(item) : h('p', { class: 'muted' }, '진행 중인 약속이 없어요'),
    closed.length ? h('details', {}, h('summary', { class: 'muted', style: 'cursor:pointer' }, `지난 약속 ${closed.length}개`),
      h('div', { class: 'list', style: 'margin-top:8px' }, closed.map(item))) : null);
}

const STATUS = {
  expired: ['24시간 지남', 'bad'], needs_review: ['판단 필요', 'warn'], failed: ['발송 실패', 'bad'],
  sent: ['발송됨', 'good'], blocked_off: ['전체 OFF로 차단', 'warn'], sending: ['발송 여부 불명', 'warn'],
};
const pill = (st) => h('span', { class: 'pill ' + (STATUS[st]?.[1] || '') }, STATUS[st]?.[0] || st);

function attentionTab() {
  if (state.attentionError) return h('p', { class: 'banner' }, '불러오기 실패: ' + state.attentionError);
  if (!state.attention.length) return h('p', { class: 'muted' }, '확인할 메시지가 없습니다 👍');
  // 같은 사람이 나눠 보낸 메시지는 카드 한 장으로 묶음 (오래된 순으로 내용 표시, 가장 최근 건의 이유·봇 판단)
  const groups = [];
  for (const a of state.attention) {
    let g = groups.find(x => x.igsid === a.igsid);
    if (!g) groups.push(g = { ...a, items: [] });
    g.items.push(a);
  }
  const dismiss = (ids) => (e) => guard(e.target, async () => {
    await api('POST', 'dismiss', { ids });
    state.attention = state.attention.filter(x => !ids.includes(x.id));
    render();
  });
  return h('div', { class: 'list' },
    h('div', { class: 'row' },
      h('p', { class: 'muted grow', style: 'margin:0' }, '봇이 답하지 않은 메시지예요. 인스타에서 직접 답하면 자동으로 정리돼요.'),
      h('button', { class: 'btn small', onclick: (e) => confirm(`${state.attention.length}건을 모두 확인 처리할까요?`) && dismiss(state.attention.map(x => x.id))(e) }, '모두 확인')),
    groups.map(a => h('div', { class: 'item' },
      h('div', { class: 'row' },
        h('strong', { class: 'grow' }, who(a)), pill(a.status), h('span', { class: 'muted' }, fmt(a.event_ts)),
        igLink(a),
        h('button', { class: 'btn small', onclick: dismiss(a.items.map(x => x.id)) }, a.items.length > 1 ? `확인 (${a.items.length})` : '확인')),
      h('div', { class: 'text' }, [...a.items].reverse().map(x => x.text).join('\n')),
      a.reason ? h('div', { class: 'muted' }, a.reason) : null,
      a.note ? h('div', { class: 'muted' }, '봇 판단: ' + a.note) : null,
      a.draft ? h('div', { class: 'row', style: 'margin-top:6px' },
        h('span', { class: 'grow' }, '보내려다 멈춘 답: “' + a.draft + '”'),
        h('button', { class: 'btn small', onclick: () => navigator.clipboard.writeText(a.draft).then(() => toast('복사됨 — 인스타에 붙여넣으세요'), () => toast('복사 안 됨', true)) }, '복사')) : null)));
}

function historyTab() {
  if (!state.history.length && !state.historyDone) {
    guard(null, async () => { state.history = await api('GET', 'history'); state.historyDone = state.history.length < 50; render(); });
    return h('p', { class: 'muted' }, '불러오는 중…');
  }
  if (!state.history.length) return h('p', { class: 'muted' }, '발송 이력이 없습니다');
  return h('div', { class: 'list' },
    state.history.map(l => h('div', { class: 'item' },
      h('div', { class: 'row' }, h('strong', { class: 'grow' }, who(l)), pill(l.status), h('span', { class: 'muted' }, fmt(l.created_at)), igLink(l)),
      h('div', { class: 'text' }, l.text),
      l.error ? h('div', { class: 'muted' }, l.error) : null)),
    state.historyDone ? null : h('button', { class: 'btn', onclick: (e) => guard(e.target, async () => {
      const more = await api('GET', `history&offset=${state.history.length}`);
      state.history.push(...more);
      state.historyDone = more.length < 50;
      render();
    }) }, '더 보기'));
}

function profilesTab() {
  if (!state.profiles.length) return h('p', { class: 'muted' }, '말투 프로필이 없습니다. 오너 PC 에서 analyze_tone.py 를 실행하세요.');
  return h('div', { class: 'list' }, state.profiles.map(p => {
    const ta = h('textarea', { value: p.style_guide });
    const st = p.stats || {};
    return h('details', { class: 'item', open: p.is_default },
      h('summary', { style: 'cursor:pointer' },
        h('strong', {}, p.is_default ? '기본 프로필 (이력 없는 상대)' : (p.display_name || p.contact_key)), ' ',
        p.is_default ? null : h('span', { class: 'muted' }, p.contact_key), ' ',
        st.owner_messages ? h('span', { class: 'muted' },
          `· 메시지 ${st.owner_messages}개 · 존댓말 ${Math.round((st.honorific_ratio || 0) * 100)}% · 평균 ${st.avg_len}자`) : null),
      h('label', {}, '말투 지침 (Claude 에게 그대로 전달됨)', ta),
      h('div', { class: 'row', style: 'margin-top:8px' },
        h('span', { class: 'muted grow' }, '수정 ' + fmt(p.updated_at) + (p.learned_at ? ` · 자동 학습 ${fmt(p.learned_at)}` : '')),
        p.style_guide_prev ? h('button', { class: 'btn small', type: 'button', onclick: (e) => guard(e.target, async () => {
          if (!confirm('자동 학습 전 말투로 되돌릴까요?')) return;
          Object.assign(p, await api('POST', 'revert_profile', { id: p.id }));
          render();
          toast('학습 전 말투로 되돌림');
        }) }, '학습 전으로') : null,
        h('button', { class: 'btn primary small', onclick: (e) => guard(e.target, async () => {
          Object.assign(p, await update('tone_profiles', { id: p.id }, { style_guide: ta.value, updated_at: new Date().toISOString() }));
          toast('저장됨');
        }) }, '저장')),
      st.top_endings ? h('pre', { class: 'stats' }, JSON.stringify({ 어미: st.top_endings, 이모지: st.top_emojis, 웃음: st.top_laughs, 자주쓰는말: st.top_words }, null, 0)) : null);
  }));
}

function settingsTab() {
  const s = state.settings;
  const triggers = h('textarea', { value: (s.trigger_phrases || []).join('\n'), style: 'min-height:90px' });
  const intro = h('textarea', { value: s.intro_message });
  const pause = h('input', { type: 'number', min: 1, max: 1440, value: String(s.pause_minutes) });
  const delay = h('input', { type: 'number', min: 0, max: 600, value: String(s.reply_delay_sec) });
  const apptMsg = h('input', { type: 'text', value: s.appointment_message ?? '{date}에 볼까?' });
  const apptMsgFormal = h('input', { type: 'text', value: s.appointment_message_formal ?? '{date}에 뵐까요?' });
  const yesMsg = h('input', { type: 'text', value: s.appt_yes_message ?? '{date} 좋아' });
  const yesMsgFormal = h('input', { type: 'text', value: s.appt_yes_message_formal ?? '{date} 좋아요' });
  const noMsg = h('input', { type: 'text', value: s.appt_no_message ?? '그날은 안 될 것 같아' });
  const noMsgFormal = h('input', { type: 'text', value: s.appt_no_message_formal ?? '그날은 어려울 것 같아요' });
  // 봇 말투·규칙: 개발자에게 부탁하지 않고 직접 고침 (안전장치는 코드에 그대로)
  const glossary = h('textarea', { value: s.my_glossary ?? '', style: 'min-height:120px' });
  const banned = h('textarea', { value: (s.banned_phrases || []).join('\n'), style: 'min-height:70px' });
  const catchup = h('textarea', { value: s.catchup_text ?? '', style: 'min-height:80px' });
  const gapDays = h('input', { type: 'number', min: 7, max: 3650, value: String(s.long_gap_days ?? 90) });
  const delayMax = h('input', { type: 'number', min: 0, max: 600, value: String(s.reply_delay_max_sec ?? 180) });
  const typingOn = h('input', { type: 'checkbox', checked: s.typing_indicator !== false, style: 'width:auto' });
  const learnOn = h('input', { type: 'checkbox', checked: s.auto_learn !== false, style: 'width:auto' });
  return h('form', {
    class: 'card',
    onsubmit: (e) => {
      e.preventDefault();
      guard(e.submitter, async () => {
        const phrases = triggers.value.split('\n').map(x => x.trim()).filter(Boolean);
        if (!phrases.length) throw new Error('트리거 문구를 하나 이상 입력하세요');
        if (!apptMsg.value.includes('{date}') || !apptMsgFormal.value.includes('{date}')) throw new Error('약속 메시지 두 칸 모두에 {date} 를 넣어 주세요');
        if (![yesMsg, yesMsgFormal, noMsg, noMsgFormal].every(x => x.value.trim())) throw new Error('약속 답장 문구를 비워 둘 수 없어요');
        if (!(Number(gapDays.value) >= 7 && Number(gapDays.value) <= 3650)) throw new Error('오랜만 기준은 7~3650일로 입력하세요');
        if (!(Number(delayMax.value) >= 0 && Number(delayMax.value) <= 600)) throw new Error('답장 대기 최대는 0~600초로 입력하세요');
        state.settings = await update('settings', { id: 1 }, {
          trigger_phrases: phrases, intro_message: intro.value.trim(),
          pause_minutes: Number(pause.value), reply_delay_sec: Number(delay.value),
          appointment_message: apptMsg.value.trim(), appointment_message_formal: apptMsgFormal.value.trim(),
          appt_yes_message: yesMsg.value.trim(), appt_yes_message_formal: yesMsgFormal.value.trim(),
          appt_no_message: noMsg.value.trim(), appt_no_message_formal: noMsgFormal.value.trim(),
          my_glossary: glossary.value.trim(), banned_phrases: banned.value.split('\n').map(x => x.trim()).filter(Boolean),
          catchup_text: catchup.value.trim(), long_gap_days: Number(gapDays.value),
          reply_delay_max_sec: Number(delayMax.value), typing_indicator: typingOn.checked, auto_learn: learnOn.checked,
          updated_at: new Date().toISOString(),
        });
        toast('설정 저장됨');
      });
    },
  },
  h('h2', {}, '설정'),
  h('p', { class: 'muted' }, s.token_expires_at
    ? `인스타 토큰 만료: ${fmt(s.token_expires_at).split(' ')[0]} (D-${Math.max(0, Math.floor((new Date(s.token_expires_at) - Date.now()) / 86400000))}) — 만료 10일 전부터 새벽에 자동 갱신. 새 토큰 등록은 PC에서만 할 수 있어요.`
    : '인스타 토큰 만료일: 새벽 확인 후 표시돼요. 새 토큰 등록은 PC에서만 할 수 있어요.'),
  usageLine(),
  h('label', {}, '자기소개 트리거 문구 (한 줄에 하나)', triggers),
  h('p', { class: 'muted' }, '내가 직접 이 문구가 들어간 메시지를 보내면 봇이 이어서 자기소개를 보냅니다. 띄어쓰기·문장부호는 무시하고 비교합니다.'),
  h('label', {}, '자기소개 메시지', intro),
  h('label', {}, '내가 직접 답장하면 자동답변 일시정지 (분)', pause),
  h('label', {}, '답장 대기 시간 (초) — 연속 메시지를 모아서 한 번에 답함', delay),
  h('label', {}, '답장 대기 최대 (초) — 상대별로 내가 실제로 답하던 속도(말투 학습에서 잼) 근처에서 무작위로 기다리되 이 시간은 넘지 않음', delayMax),
  h('label', { style: 'display:flex;gap:8px;align-items:center' }, typingOn, "보내기 직전 '입력 중…' 표시"),
  h('label', { style: 'display:flex;gap:8px;align-items:center' }, learnOn, '말투 자동 학습 (내가 직접 보낸 메시지로 상대별 말투를 7일마다 갱신, 말투 탭에서 되돌리기)'),
  h('label', {}, '약속잡기 메시지 — 반말 상대 ({date} 자리에 "10월 25일(일) 오후 7시" 형식이 들어감)', apptMsg),
  h('label', {}, '약속잡기 메시지 — 존댓말 상대 (말투 정보가 적은 사람)', apptMsgFormal),
  h('label', {}, '약속 요청에 [좋아 보내기] — 반말 / 존댓말 ({date} 자리에 날짜·시각)', yesMsg, yesMsgFormal),
  h('label', {}, '약속 요청에 [안 돼 보내기] — 반말 / 존댓말', noMsg, noMsgFormal),
  h('h2', { style: 'margin-top:24px' }, '봇 말투·규칙 직접 고치기'),
  h('p', { class: 'muted' }, '저장하면 다음 답장부터 바로 적용돼요. 고친 뒤에는 상대 카드의 [미리보기]로 확인해 보세요. 웃음 금지, 한 줄로 쓰기, 설명문 차단, 전체 끄기 같은 안전장치는 여기서 바꿀 수 없어요.'),
  h('label', {}, '내 말 사전·추가 규칙 (한 줄에 하나, 예: - 킹받네 = 짜증 난다는 뜻)', glossary),
  h('label', {}, '금지 표현 (한 줄에 하나) — 답장에 들어 있으면 보내지 않고 주의 필요에 올림', banned),
  h('label', {}, '오랜만에 연락 온 사람에게 할 근황 답 (비우면 쓰지 않음)', catchup),
  h('label', {}, '며칠 만의 연락부터 오랜만으로 볼지 (최소 7일)', gapDays),
  h('button', { class: 'btn primary', type: 'submit', style: 'margin-top:16px' }, '저장'));
}

// ── 시작 ────────────────────────────────────────
// 마지막에 본 탭 기억 (이 기기·브라우저에만, 저장이 막혀 있어도 동작)
const saveTab = (k) => { try { localStorage.setItem('dmbot.tab', k); } catch { /* 저장 불가 */ } };
const lastTab = () => { try { return localStorage.getItem('dmbot.tab'); } catch { return null; } };

async function start() {
  app.replaceChildren(h('p', { class: 'wrap muted' }, '불러오는 중…'));
  try {
    await loadAll();
    state.tab = state.attention.length ? 'attention' : (lastTab() || state.tab);
    render();
  } catch (e) {
    // 오너 계정이 아니거나 로그인이 만료됐을 때만 로그아웃. 신호가 약해서 난 오류는 다시 시도
    if (/오너 계정이 아니|JWT|401|403/i.test(e.message)) { await sb.auth.signOut(); renderLogin(e.message); return; }
    app.replaceChildren(h('div', { class: 'wrap' }, h('p', { class: 'banner' }, '불러오기 실패: ' + e.message),
      h('button', { class: 'btn primary', style: 'margin-top:12px', onclick: () => start() }, '다시 시도')));
  }
}

// 인스타 등 다른 앱에 갔다가 돌아오면 30초 이상 지났을 때 새로고침 (쓰고 있던 글이 있으면 그대로 둠)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.settings || Date.now() - state.loadedAt < 30000) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value) return;
  guard(null, async () => { await loadAll(); render(); });
});

// 화면이 켜져 있는 동안 30초마다 일시정지만 새로 받아 반영 (인스타에서 직접 답하거나 정지가 끝나면 바로 보이게).
// 입력 중이거나 미리보기·관계 적기 창이 열려 있으면 그리지 않음 (쓰던 내용이 사라지지 않게)
setInterval(() => guard(null, async () => {
  if (document.visibilityState !== 'visible' || !state.settings) return;
  const { data, error } = await sb.from('contacts').select('igsid,paused_until').gt('paused_until', new Date().toISOString());
  if (error) return;
  const live = new Map(data.map(r => [r.igsid, r.paused_until]));
  for (const c of state.contacts) {
    if (live.has(c.igsid)) c.paused_until = live.get(c.igsid);
    else if (pauseLeft(c) > 0) c.paused_until = null;   // 그새 '해제'됐거나 끝남
  }
  if (state.tab !== 'contacts') return;   // 다른 탭(캘린더·설정 입력 등)은 건드리지 않음
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (document.querySelector('.item .card:not([hidden])')) return;
  render();
}), 30000);

sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') renderLogin(); });
const { data: { session } } = await sb.auth.getSession();
session ? start() : renderLogin();
