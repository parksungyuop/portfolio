// 대시보드 전용 API: 복호화가 필요한 조회, 수동 요약, 약속잡기.
// 발송은 약속잡기(appoint) 한 곳뿐이며 반드시 igSend() 경유 (전체 OFF·24시간 창 확인).
// 인증: 대시보드 로그인 JWT → Supabase /auth/v1/user 로 검증 → OWNER_UUID 일치만 허용
import { ctx, num, now, iso, ts, http, HttpError, sb, select, one, insert, update, inList, enc, dec, igSend, igToken, flushUsage } from './core.js';
import { applySendResult, summarizeContact, previewReply, contactIsFormal } from './bot.js';

class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const bad = (msg) => new ApiError(400, msg);
const conflict = (msg) => new ApiError(409, msg);   // 요청은 맞지만 지금은 못 함 (전체 OFF, 24시간 경과 등)

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function handleApi(request, env) {
  const c = ctx(env);
  try {
    const user = await apiUser(c, request.headers.get('Authorization') ?? '');
    if (!user) return json(401, { error: '로그인 필요' });
    if (!env.OWNER_UUID || user.id !== env.OWNER_UUID) return json(403, { error: '권한 없음' });

    const url = new URL(request.url);
    const action = url.searchParams.get('action') ?? '';
    const input = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    switch (`${request.method} ${action}`) {
      case 'GET attention': return json(200, await attention(c));
      case 'POST dismiss': return json(200, await dismiss(c, input.ids ?? [input.id]));
      case 'POST appoint_reply': return json(200, await appointReply(c, input));
      case 'GET history': return json(200, await history(c, Math.max(0, Number(url.searchParams.get('offset') ?? 0))));
      case 'POST summarize': return json(200, { summary: await summarizeContact(c, igsidOf(input.igsid)) });
      case 'GET appointments': return json(200, await appointments(c));
      case 'POST appoint': return json(200, await appoint(c, input));
      case 'POST appointment_status': return json(200, await appointmentStatus(c, input));
      case 'POST import_contacts': return json(200, await importContacts(c, input.after));
      case 'GET health': return json(200, await health(c));
      case 'POST preview': return json(200, await preview(c, input));
      case 'GET summaries': return json(200, await summaries(c));
      case 'POST revert_profile': return json(200, await revertProfile(c, Number(input.id)));
      default: return json(404, { error: '알 수 없는 요청' });
    }
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.message });
    console.error('api: ' + e.message);
    return json(500, { error: '서버 오류' });
  } finally {
    await flushUsage(c);   // 미리보기·수동 요약의 Claude 사용량
  }
}

async function apiUser(c, auth) {
  const m = auth.match(/^Bearer\s+(\S+)$/);
  if (!m) return null;
  try {
    return await http(c, 'GET', `${c.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, null,
      { apikey: c.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + m[1] }, 10000);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

function igsidOf(v) {
  const s = String(v ?? '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw bad('igsid 형식 오류');
  return s;
}

async function contactNames(c, igsids, cols = 'igsid,username,name') {
  const ids = [...new Set(igsids)];
  if (!ids.length) return {};
  return Object.fromEntries((await select(c, 'contacts', { igsid: inList(ids), select: cols })).map((r) => [r.igsid, r]));
}

/** 대시보드 '주의 필요': 24시간 초과 / 판단 필요 / 실패 */
async function attention(c) {
  const rows = await select(c, 'queue', { status: 'in.(expired,needs_review,failed)', kind: 'neq.echo', order: 'created_at.desc', limit: 100 });
  const names = await contactNames(c, rows.map((r) => r.igsid));
  const out = [];
  for (const q of rows) {
    const review = q.review_enc ? JSON.parse(await dec(c, q.review_enc) || '{}') : {};   // 봇 판단·보내려다 멈춘 답
    out.push({
      id: q.id, igsid: q.igsid, status: q.status, kind: q.kind,
      username: names[q.igsid]?.username ?? null, name: names[q.igsid]?.name ?? null,
      text: q.kind === 'intro' ? '(자기소개)' : String(JSON.parse(await dec(c, q.payload_enc) || '{}').text ?? ''),
      reason: q.last_error, note: review.note || null, draft: review.draft || null, event_ts: q.event_ts,
    });
  }
  return out;
}

/** 주의 필요 확인: {id} 하나 또는 {ids: [...]} 여러 건 (같은 사람 카드 묶음·모두 확인) */
async function dismiss(c, list) {
  const ids = (Array.isArray(list) ? list : [list]).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
  if (!ids.length) throw bad('확인할 항목이 없어요');
  const rows = await update(c, 'queue', { id: inList(ids), status: 'in.(expired,needs_review,failed)' },
    { status: 'done', last_error: '오너 확인함', updated_at: iso(now()) });
  return { ok: rows.length > 0, count: rows.length };
}

async function history(c, offset) {
  const rows = await select(c, 'send_log', { order: 'created_at.desc', limit: 50, offset });
  const names = await contactNames(c, rows.map((r) => r.igsid));
  const out = [];
  for (const l of rows) {
    out.push({
      id: l.id, igsid: l.igsid, status: l.status, created_at: l.created_at,
      username: names[l.igsid]?.username ?? null, name: names[l.igsid]?.name ?? null,
      text: await dec(c, l.text_enc), error: l.error,
    });
  }
  return out;
}

// ── 약속 ─────────────────────────────────────────

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** '10월 25일(토)' — 올해가 아니면 연도를 붙임. 시각이 있으면 '오후 7시' / '오후 7시 30분' */
export const koreanDate = (ymd, hm = null) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = `${y === Number(kstToday().slice(0, 4)) ? '' : `${y}년 `}${m}월 ${d}일(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
  if (!hm) return day;
  const [hh, mm] = hm.split(':').map(Number);
  return `${day} ${hh < 12 ? '오전' : '오후'} ${hh % 12 || 12}시${mm ? ` ${mm}분` : ''}`;
};

async function appointments(c) {
  const rows = await select(c, 'appointments', { order: 'created_at.desc', limit: 200 });
  const contacts = await contactNames(c, rows.map((r) => r.igsid), 'igsid,username,name,last_user_msg_at');
  const out = [];
  for (const a of rows) {
    const ct = contacts[a.igsid] ?? {};
    out.push({
      id: a.id, igsid: a.igsid, status: a.status, date: a.date ? String(a.date).slice(0, 10) : null, time: a.time_hm ?? null,
      username: ct.username ?? null, name: ct.name ?? null,
      request_text: await dec(c, a.request_text_enc), requested_at: a.requested_at,
      sent_at: a.sent_at, created_at: a.created_at,
      can_send: !!ct.last_user_msg_at && now() - ts(ct.last_user_msg_at) <= num(c, 'REPLY_WINDOW_SEC'),   // 인스타 24시간 창
    });
  }
  return out;
}

/**
 * 약속잡기: {igsid, date: 'YYYY-MM-DD', time?: 'HH:MM', send: bool, id?: 기존 약속 행}
 * send=true  → 약속 문구의 {date} 를 날짜(·시각)로 바꿔 상대에게 발송 → proposed
 *              존댓말 상대(봇 답장과 같은 기준)는 appointment_message_formal, 아니면 appointment_message
 * send=false → 발송 없이 목록에만 추가/수정 → planned (상대가 요청하지 않았어도 오너가 직접 추가 가능)
 */
async function appoint(c, input) {
  const igsid = igsidOf(input.igsid);
  const date = String(input.date ?? '');
  const [y, m, d] = date.split('-').map(Number);
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === date;
  if (!real) throw bad('날짜 형식 오류 (YYYY-MM-DD)');
  if (date < kstToday()) throw bad('지난 날짜는 고를 수 없어요');
  const time = input.time ? String(input.time) : null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw bad('시각 형식 오류 (HH:MM)');
  const contact = await one(c, 'contacts', { igsid: 'eq.' + igsid });
  if (!contact) throw bad('없는 상대');
  const id = input.id != null ? Number(input.id) : null;
  let text = null;
  const row = { date, time_hm: time };

  if (input.send) {
    const s = await one(c, 'settings', { id: 'eq.1' });
    if (!s.global_enabled) throw conflict('전체 자동답변이 꺼져 있어 보내지 않았어요. 메시지 없이 목록에만 추가하려면 "보내지 않고 저장"을 쓰세요.');
    const last = contact.last_user_msg_at;
    if (!last || now() - ts(last) > num(c, 'REPLY_WINDOW_SEC')) {
      throw conflict('상대의 마지막 메시지가 24시간이 지나 인스타 정책상 봇이 보낼 수 없어요. 인스타 앱에서 직접 보내세요.');
    }
    const tpl = (await contactIsFormal(c, contact)) ? s.appointment_message_formal : s.appointment_message;
    text = tpl.replaceAll('{date}', koreanDate(date, time));
    const rnd = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const job = await insert(c, 'queue', {
      kind: 'appoint', mid: 'appoint:' + rnd, igsid, payload_enc: await enc(c, JSON.stringify({ text })),
      event_ts: iso(now()), status: 'processing', attempts: 1, locked_until: iso(now() + num(c, 'LEASE_SEC')),
    });
    const r = await igSend(c, igsid, text, [job.id]);
    await applySendResult(c, [job.id], r);
    if (r !== 'sent') throw conflict(`발송되지 않았어요 (${r}). 대시보드 '주의 필요'를 확인하세요.`);
    Object.assign(row, { status: 'proposed', sent_at: iso(now()) });
  } else {
    row.status = 'planned';
  }

  const saved = id != null
    ? (await update(c, 'appointments', { id: 'eq.' + id }, row))[0] ?? null
    : await insert(c, 'appointments', { ...row, igsid });
  return { ok: true, text, id: saved?.id ?? null };
}

/**
 * 인스타 대화 목록의 상대를 전부 contacts 에 추가 (이미 있으면 아이디·마지막 대화 시각만 갱신, 설정은 그대로).
 * 새로 추가된 상대의 자동발송은 DB 기본값(켜짐)을 따름. 외부 호출 한도 때문에 한 번에 일부만 → after 를 돌려주면 이어서 호출.
 */
async function importContacts(c, after) {
  const base = c.env.IG_API_BASE;
  const auth = { Authorization: 'Bearer ' + await igToken(c) };
  const me = String((await http(c, 'GET', `${base}/me?fields=user_id`, null, auth)).user_id ?? '');
  let added = 0;
  let cursor = after ? String(after) : null;
  do {
    const qs = new URLSearchParams({ platform: 'instagram', fields: 'participants,updated_time', limit: '50', ...(cursor ? { after: cursor } : {}) });
    const page = await http(c, 'GET', `${base}/me/conversations?${qs}`, null, auth);
    const rows = [];
    for (const conv of page.data ?? []) {
      for (const p of conv.participants?.data ?? []) {
        if (p.id && String(p.id) !== me) rows.push({ igsid: String(p.id), username: p.username ?? null, last_msg_at: conv.updated_time ?? null });
      }
    }
    const uniq = [...new Map(rows.map((r) => [r.igsid, r])).values()];
    if (uniq.length) await sb(c, 'POST', 'contacts?on_conflict=igsid', uniq, ['resolution=merge-duplicates']);
    added += uniq.length;
    cursor = page.paging?.next ? page.paging?.cursors?.after ?? null : null;
  } while (cursor && c.sub + 3 <= num(c, 'MAX_SUBREQUESTS'));
  return { count: added, after: cursor };
}

/**
 * 답장 미리보기: {igsid, text} — 이 상대가 text 를 보내면 봇이 뭐라고 할지. 보내지도 저장하지도 않음 (AI 1회 호출 비용만 듦)
 * 실제로는 안 보내질 상황(전체 OFF·상대 꺼짐·일시정지)도 함께 알려 줌
 */
/** 상대별 요약 (암호화 저장 → 여기서 풀어서 줌) { igsid: 요약 }. 아직 옮기지 않은 예전 평문 요약도 함께 */
async function summaries(c) {
  const out = {};
  for (const r of await select(c, 'contacts', { summary: 'not.is.null', select: 'igsid,summary', limit: 1000 })) out[r.igsid] = r.summary;
  for (const r of await select(c, 'contacts', { summary_enc: 'not.is.null', select: 'igsid,summary_enc', limit: 1000 })) out[r.igsid] = await dec(c, r.summary_enc);
  return out;
}

/** 자동 재학습한 말투를 바로 전 것으로 되돌림 */
async function revertProfile(c, id) {
  if (!Number.isInteger(id) || id <= 0) throw bad('잘못된 프로필');
  const p = await one(c, 'tone_profiles', { id: 'eq.' + id });
  if (!p?.style_guide_prev) throw conflict('되돌릴 이전 말투가 없어요');
  const [row] = await update(c, 'tone_profiles', { id: 'eq.' + id }, {
    style_guide: p.style_guide_prev, examples_enc: p.examples_prev_enc ?? p.examples_enc,
    style_guide_prev: null, examples_prev_enc: null, updated_at: iso(now()),
  });
  return { style_guide: row.style_guide, style_guide_prev: null, updated_at: row.updated_at };
}

async function preview(c, input) {
  const igsid = igsidOf(input.igsid);
  const text = String(input.text ?? '').trim();
  if (!text || text.length > 500) throw bad('미리볼 문장을 1~500자로 입력하세요');
  const contact = await one(c, 'contacts', { igsid: 'eq.' + igsid });
  if (!contact) throw bad('없는 상대');
  const s = await one(c, 'settings', { id: 'eq.1' });
  const d = await previewReply(c, contact, s, text);
  const blocked = !s.global_enabled ? '전체 자동답변이 꺼져 있어 실제로는 보내지 않아요'
    : !contact.auto_enabled ? '이 상대는 자동발송이 꺼져 있어 실제로는 보내지 않아요'
    : contact.paused_until && ts(contact.paused_until) > now() ? '직접 대화 중(일시정지)이라 실제로는 보내지 않아요' : null;
  return { text: d.text ?? null, skip: d.skip ?? null, review: d.review ?? null, draft: d.draft ?? null, note: d.note ?? null, when: d.when?.date ? d.when : null, blocked };
}

/** 대시보드 상태 줄: 마지막으로 DM 받은 시각, 마지막 봇 답장, 5분 넘게 처리 안 된 답장 수 */
async function health(c) {
  const first = async (table, q) => (await select(c, table, { ...q, order: 'created_at.desc', limit: 1, select: 'created_at' }))[0]?.created_at ?? null;
  const stuck = await select(c, 'queue', { status: 'in.(pending,processing,sending)', created_at: 'lt.' + iso(now() - 300), select: 'id', limit: 100 });
  return { last_in: await first('queue', { kind: 'eq.inbound' }), last_sent: await first('send_log', { status: 'eq.sent' }), stuck: stuck.length };
}

/**
 * 보류된 약속 요청에 대시보드에서 바로 답하기: {id, answer: 'yes'|'no', date?, time?}
 * yes → '{date} 좋아' 문구(반말/존댓말)로 보내고 약속 확정(confirmed) → 캘린더에 뜸
 * no  → '그날은 안 될 것 같아' 문구로 보내고 취소(cancelled)
 * 보내면 그 사람의 주의 필요 건도 정리. 전체 OFF·24시간 확인은 그대로 거침
 */
async function appointReply(c, input) {
  const a = await one(c, 'appointments', { id: 'eq.' + Number(input.id ?? 0) });
  if (!a || a.status !== 'requested') throw bad('답할 약속 요청이 아니에요');
  const yes = input.answer === 'yes';
  if (!yes && input.answer !== 'no') throw bad('answer 는 yes 또는 no');
  let date = null, time = null;
  if (yes) {
    date = String(input.date ?? '');
    const [y, m, d] = date.split('-').map(Number);
    if (!(/^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === date)) throw bad('날짜를 고르세요');
    if (date < kstToday()) throw bad('지난 날짜는 고를 수 없어요');
    time = input.time ? String(input.time) : null;
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw bad('시각 형식 오류 (HH:MM)');
  }
  const contact = await one(c, 'contacts', { igsid: 'eq.' + a.igsid });
  const s = await one(c, 'settings', { id: 'eq.1' });
  if (!s.global_enabled) throw conflict('전체 자동답변이 꺼져 있어 보내지 않았어요. 인스타에서 직접 답한 뒤 완료·취소를 누르세요.');
  if (!contact?.last_user_msg_at || now() - ts(contact.last_user_msg_at) > num(c, 'REPLY_WINDOW_SEC')) {
    throw conflict('상대의 마지막 메시지가 24시간이 지나 인스타 정책상 봇이 보낼 수 없어요. 인스타 앱에서 직접 보내세요.');
  }
  const formal = await contactIsFormal(c, contact);
  const tpl = yes ? (formal ? s.appt_yes_message_formal : s.appt_yes_message) : (formal ? s.appt_no_message_formal : s.appt_no_message);
  const text = tpl.replaceAll('{date}', yes ? koreanDate(date, time) : '');
  const rnd = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const job = await insert(c, 'queue', {
    kind: 'appoint', mid: 'appoint:' + rnd, igsid: a.igsid, payload_enc: await enc(c, JSON.stringify({ text })),
    event_ts: iso(now()), status: 'processing', attempts: 1, locked_until: iso(now() + num(c, 'LEASE_SEC')),
  });
  const r = await igSend(c, a.igsid, text, [job.id]);
  await applySendResult(c, [job.id], r);
  if (r !== 'sent') throw conflict(`발송되지 않았어요 (${r}). 대시보드 '주의 필요'를 확인하세요.`);
  await update(c, 'appointments', { id: 'eq.' + a.id }, yes
    ? { status: 'confirmed', date, time_hm: time, sent_at: iso(now()) }
    : { status: 'cancelled', sent_at: iso(now()) });
  await update(c, 'queue', { igsid: 'eq.' + a.igsid, status: 'in.(needs_review,expired,failed)', kind: 'neq.echo' },
    { status: 'done', last_error: '약속 요청에 대시보드에서 답함', updated_at: iso(now()) });
  return { ok: true, text };
}

async function appointmentStatus(c, input) {
  const status = String(input.status ?? '');
  if (!['done', 'cancelled'].includes(status)) throw bad('status 는 done 또는 cancelled');
  const rows = await update(c, 'appointments', { id: 'eq.' + Number(input.id ?? 0) }, { status });
  return { ok: rows.length === 1 };
}
