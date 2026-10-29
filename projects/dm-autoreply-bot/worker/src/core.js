// 공통: HTTP·Supabase REST·암호화·Instagram·Claude
// c = 실행 1회의 컨텍스트 { env, sub(외부 호출 수), igToken(캐시) }

export class HttpError extends Error {
  // status 0 = 응답 못 받음 (타임아웃·연결 끊김) → 상대 서버에서 처리됐는지 알 수 없음
  constructor(status, body, msg) { super(msg); this.status = status; this.body = body; }
}

export const ctx = (env) => ({ env, sub: 0, igToken: null, usage: {} });
export const num = (c, k) => Number(c.env[k]);
export const now = () => Math.floor(Date.now() / 1000);
export const iso = (sec) => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
export const ts = (s) => Math.floor(Date.parse(s) / 1000);

/** JSON 요청. 2xx 아니면 HttpError */
/** 오류 문장에 넣을 주소: 토큰 값은 가림 (오류가 대시보드 배너·로그에 그대로 보이므로) */
export const safeUrl = (url) => String(url).replace(/(access_token=)[^&\s]+/gi, '$1***');

export async function http(c, method, url, body, headers = {}, timeoutMs = 30000) {
  c.sub++;
  const shown = safeUrl(url);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new HttpError(0, '', `${method} ${shown}: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, text, `${method} ${shown}: HTTP ${res.status} ${safeUrl(text.slice(0, 300))}`);
  return text ? JSON.parse(text) : null;
}

// ── Supabase (service 키 → RLS 우회, 서버 전용) ──────────────

function sbHeaders(env, prefer) {
  const k = env.SUPABASE_SERVICE_KEY;
  const h = { apikey: k };
  if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;   // 예전 service_role(JWT)만. 새 sb_secret_ 키는 apikey 만
  if (prefer.length) h.Prefer = prefer.join(',');
  return h;
}
export const sb = (c, method, path, body = null, prefer = []) =>
  http(c, method, `${c.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, body, sbHeaders(c.env, prefer));
export const rpc = (c, fn, args = {}) => sb(c, 'POST', `rpc/${fn}`, args);
const q = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
export const select = async (c, table, query = {}) => (await sb(c, 'GET', `${table}?${q({ select: '*', ...query })}`)) ?? [];
export const one = async (c, table, query) => (await select(c, table, { ...query, limit: 1 }))[0] ?? null;
export const update = async (c, table, filter, patch) => (await sb(c, 'PATCH', `${table}?${q(filter)}`, patch, ['return=representation'])) ?? [];
export const del = (c, table, filter) => sb(c, 'DELETE', `${table}?${q(filter)}`);
export const inList = (ids) => `in.(${ids.join(',')})`;

/** 삽입된 행. UNIQUE 충돌이면 null. ignoreOn 지정 시 그 컬럼 충돌은 조용히 무시 */
export async function insert(c, table, row, ignoreOn = null) {
  const prefer = ['return=representation'];
  if (ignoreOn) prefer.push('resolution=ignore-duplicates');
  try {
    return (await sb(c, 'POST', table + (ignoreOn ? `?on_conflict=${ignoreOn}` : ''), row, prefer))?.[0] ?? null;
  } catch (e) {
    if (e.status === 409) return null;
    throw e;
  }
}

// ── 암호화: "v1:" + base64(iv 12 | 암호문 | tag 16) — PHP·Python 버전과 같은 형식 ──

const b64e = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const keys = new Map();
async function aesKey(env) {
  if (!keys.has(env.ENC_KEY_B64)) {
    const raw = b64d(env.ENC_KEY_B64 || '');
    if (raw.length !== 32) throw new Error('ENC_KEY_B64 는 32바이트 base64 여야 함');
    keys.set(env.ENC_KEY_B64, await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keys.get(env.ENC_KEY_B64);
}
export async function enc(c, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(c.env), new TextEncoder().encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return 'v1:' + b64e(out);
}
export async function dec(c, s) {
  if (!s) return '';
  if (!s.startsWith('v1:')) throw new Error('암호문 형식 오류');
  const raw = b64d(s.slice(3));
  if (raw.length < 28) throw new Error('암호문 형식 오류');
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await aesKey(c.env), raw.subarray(12)));
  } catch {
    throw new Error('복호화 실패 (키 불일치 또는 변조)');
  }
}

/** 웹훅 서명 검증: X-Hub-Signature-256 = "sha256=" + HMAC(앱 시크릿, 원문) */
export async function verifySignature(secret, rawBody, header) {
  if (!secret || !header?.startsWith('sha256=')) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const hex = header.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const sig = Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', k, sig, rawBody);   // 상수 시간 비교
}

// ── Instagram ──────────────────────────────────────

/** 장기 토큰: DB(app_secrets, 암호화)에 갱신본이 있으면 그것, 없으면 처음 등록한 비밀값 */
/** 비밀값 토큰의 지문 (토큰 자체는 저장하지 않고 '같은 토큰인지'만 비교) */
export async function tokenSeed(token) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 지금 쓸 인스타 토큰 {access_token, expires_at, seed}.
 *  DB 의 토큰은 자동 갱신된 것. 그 사이 PC 에서 새 토큰(비밀값)을 등록했으면(seed 가 다르면) 새 토큰을 바로 씀 */
export async function igTokenInfo(c) {
  const row = await one(c, 'app_secrets', { key: 'eq.ig_token' });
  const envTok = c.env.IG_ACCESS_TOKEN;
  const seed = envTok ? await tokenSeed(envTok) : null;
  if (row) {
    const info = JSON.parse(await dec(c, row.value));
    if (!envTok || !info.seed || info.seed === seed) return { ...info, seed: info.seed ?? seed };
  }
  if (envTok) return { access_token: envTok, expires_at: Number(c.env.IG_TOKEN_EXPIRES_AT || 0), seed };
  throw new Error('IG 토큰 없음 (IG_ACCESS_TOKEN 비밀값 등록 필요)');
}
export async function igToken(c) {
  c.igToken ??= (await igTokenInfo(c)).access_token;
  return c.igToken;
}

/** 상대 username/name. 실패하면 {} (기본 말투로 진행) */
export async function igProfile(c, igsid) {
  try {
    return await http(c, 'GET', `${c.env.IG_API_BASE}/${igsid}?fields=name,username`, null, { Authorization: 'Bearer ' + await igToken(c) });
  } catch (e) {
    console.error(`ig_profile ${igsid}: ${e.message}`);
    return {};
  }
}

/**
 * 인스타 DM 발송. **Graph API 발송은 반드시 이 함수로만** (전체 스위치 강제 지점).
 * 반환: 'sent' | 'blocked_off'(전체 OFF) | 'duplicate'(이미 시도된 작업) | 'unknown'(응답 유실, 발송 여부 불명)
 * 확실한 실패(HTTP 오류 응답)는 send_log 를 지우고 HttpError 를 던짐 → 호출자가 재시도.
 */
/** typing: 보내기 전 '입력 중…' 표시 후 글 길이만큼 잠깐 기다림 (봇 답장만. 대시보드 약속잡기는 바로) */
export async function igSend(c, igsid, text, queueIds, { typing = false } = {}) {
  const qid = Math.max(...queueIds);              // 묶음 발송은 마지막 작업 id 로 기록
  const textEnc = await enc(c, text);
  const token = await igToken(c);                 // 토큰 문제는 send_log 기록 전에 실패시켜 재시도 가능하게

  const s = await one(c, 'settings', { id: 'eq.1' });
  if (!s || !s.global_enabled) {
    await insert(c, 'send_log', { queue_id: qid, igsid, text_enc: textEnc, status: 'blocked_off' });
    return 'blocked_off';
  }
  if (typing && s.typing_indicator) {   // 전체 ON 확인 뒤에만. 실패해도(인스타가 지원 안 함 등) 답장은 그대로 보냄
    try {
      await http(c, 'POST', `${c.env.IG_API_BASE}/me/messages`, { recipient: { id: igsid }, sender_action: 'typing_on' }, { Authorization: 'Bearer ' + token }, 10000);
    } catch (e) { console.error('typing: ' + e.message); }
    const ms = c.env.TYPING_DELAY === '0' ? 0 : Math.min(4000, 1000 + 80 * [...text].length);   // 테스트는 0
    await new Promise((r) => setTimeout(r, ms));
  }
  const log = await insert(c, 'send_log', { queue_id: qid, igsid, text_enc: textEnc, status: 'sending' });
  if (!log) return 'duplicate';
  // 여기서 죽으면 queue 가 sending 으로 남음 → claim_jobs 가 needs_review 처리 (재발송 안 함)
  await update(c, 'queue', { id: inList(queueIds) }, { status: 'sending', updated_at: iso(now()) });

  let r;
  try {
    r = await http(c, 'POST', `${c.env.IG_API_BASE}/me/messages`,
      { recipient: { id: igsid }, message: { text: cutUtf8(text, 1000) } }, { Authorization: 'Bearer ' + token });
  } catch (e) {
    if (e.status === 0) {
      await update(c, 'send_log', { id: 'eq.' + log.id }, { error: e.message.slice(0, 500) });
      return 'unknown';
    }
    await del(c, 'send_log', { id: 'eq.' + log.id });
    throw e;
  }
  const mid = r?.message_id ?? null;
  await update(c, 'send_log', { id: 'eq.' + log.id }, { status: 'sent', ig_mid: mid });
  await insert(c, 'messages', { mid, igsid, direction: 'bot', text_enc: textEnc, ts: iso(now()) }, 'mid');
  return 'sent';
}

/** 인스타 메시지 1000바이트 제한 — UTF-8 글자가 잘리지 않게 자름 */
function cutUtf8(s, max) {
  const b = new TextEncoder().encode(s);
  if (b.length <= max) return s;
  let end = max;
  while (end > 0 && (b[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(b.subarray(0, end));
}

/**
 * 실패 원인을 짧은 한국어로 (대시보드 '주의 필요'에 보임) + 다시 해도 안 되는 오류인지(permanent).
 * 오류 원문은 서버 기록(console)에만 남김
 */
export function describeError(e) {
  let body = {};
  try { body = JSON.parse(e?.body || '{}'); } catch { /* 본문이 JSON 아님 */ }
  if (body?.type === 'error' && body.error) {   // Claude
    const t = body.error.type ?? '', m = String(body.error.message ?? '');
    if (['authentication_error', 'permission_error'].includes(t) || /credit|billing|balance/i.test(m)) {
      return { permanent: true, reason: 'Claude 결제·키 문제 — 개발자에게 알려 주세요' };
    }
    if (t === 'invalid_request_error') return { permanent: true, reason: 'AI 요청 오류 — 개발자에게 알려 주세요' };
    return { permanent: false, reason: 'AI 일시 오류 — 잠시 후 다시 시도' };   // 과부하·호출 한도·서버 오류
  }
  const ig = body?.error && typeof body.error === 'object' && 'code' in body.error ? body.error : null;
  if (ig) {   // Instagram
    if (ig.code === 190) return { permanent: true, token: true, reason: '인스타 연결 끊김 — PC에서 새 토큰을 등록하세요' };
    if ([4, 17, 32, 613].includes(ig.code) || e.status >= 500) return { permanent: false, reason: '인스타 일시 제한 — 잠시 후 다시 시도' };
    if (ig.code === 10 || ig.error_subcode === 2018278) return { permanent: true, reason: '24시간이 지나 보낼 수 없음' };
    if (ig.code === 551 || ig.code === 100) return { permanent: true, reason: '상대에게 보낼 수 없음 (차단·탈퇴·제한)' };
    return { permanent: true, reason: '인스타가 보내기를 거절함 — 인스타 앱에서 직접 확인해 주세요' };
  }
  if (e?.status >= 500 || e?.status === 0 || e?.status === 429) return { permanent: false, reason: '연결 오류 — 잠시 후 다시 시도' };
  return { permanent: false, reason: '처리 오류 — 잠시 후 다시 시도' };
}

/**
 * 오너 Gmail 로 짧은 알림 메일 (Cloudflare 메일 보내기, 받는 주소는 Cloudflare 에서 인증한 주소만 가능).
 * 이름·메시지 내용은 넣지 않음. 테스트에서는 ALERT_TEST_URL 로 대신 보냄. 설정이 없으면 아무것도 안 함
 */
export async function sendAlertMail(c, subject, text) {
  if (c.env.ALERT_TEST_URL) return http(c, 'POST', c.env.ALERT_TEST_URL, { subject, text });
  if (!c.env.ALERT_EMAIL || !c.env.ALERT_FROM || !c.env.ALERT_TO) return null;
  const { EmailMessage } = await import('cloudflare:email');
  const b64 = (s) => { let bin = ''; for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b); return btoa(bin); };
  const raw = [
    `From: =?UTF-8?B?${b64('DM 봇')}?= <${c.env.ALERT_FROM}>`,
    `To: <${c.env.ALERT_TO}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${c.env.ALERT_FROM.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  await c.env.ALERT_EMAIL.send(new EmailMessage(c.env.ALERT_FROM, c.env.ALERT_TO, raw));
  return true;
}

// ── Claude ─────────────────────────────────────────

// Haiku/Sonnet 5.5 는 생각(thinking)이 기본으로 켜져 있고 생각 토큰도 max_tokens 에 포함됨.
// 짧은 DM·요약이라 effort 'low' 로 최소화하고, max_tokens 는 넉넉히 둬서 답이 잘리지 않게 함.
// schema 를 주면 응답이 반드시 그 JSON 형식으로 옴 (구조화 출력) → JSON 문자열 반환
/** system: 글자 또는 블록 배열(앞쪽 고정 부분에 cache_control 을 단 것). kind: 사용량 기록 구분 */
export async function claudeText(c, model, system, user, maxTokens = 2000, schema = null, kind = 'reply') {
  const output_config = { effort: 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) };
  const r = await http(c, 'POST', c.env.CLAUDE_API_URL, {
    model, max_tokens: maxTokens, output_config, system,
    messages: [{ role: 'user', content: user }],
  }, { 'x-api-key': c.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' }, 60000);
  addUsage(c, kind, r?.usage ?? {});
  const text = (r?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const stop = r?.stop_reason ?? 'end_turn';
  // 잘림·거절 등으로 본문이 없으면 'NO_REPLY' 로 오인하지 않도록 오류 처리 → 재시도/주의 목록
  if (!text && stop !== 'end_turn') throw new Error(`Claude 응답 본문 없음 (stop_reason: ${stop})`);
  return text;
}

/** 응답의 토큰 사용량을 실행 컨텍스트에 모아 둠 → 실행 끝에 flushUsage 가 DB 에 한 번에 더함 (외부 호출 수 절약) */
function addUsage(c, kind, u) {
  const a = (c.usage[kind] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0 });
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  a.calls++;
  a.input_tokens += u.input_tokens ?? 0;
  a.output_tokens += u.output_tokens ?? 0;
  a.cache_read += u.cache_read_input_tokens ?? 0;
  a.cache_write_1h += w1h;
  a.cache_write_5m += u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - w1h);
}

/** 모아 둔 사용량을 하루·종류별 합계에 더함. 실패해도 답장 처리엔 영향 없음 */
export async function flushUsage(c) {
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);   // 한국 날짜
  const rows = Object.entries(c.usage).map(([kind, a]) => ({ day, kind, ...a }));
  c.usage = {};
  if (!rows.length) return;
  try { await rpc(c, 'add_usage', { p_rows: rows }); } catch (e) { console.error('usage: ' + e.message); }
}
