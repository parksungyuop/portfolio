// 로컬 테스트용 가짜 서버: Supabase REST(PostgREST 일부) + Instagram Graph API + Claude API
// DB 는 PGlite(실제 Postgres) 위에 schema.sql 그대로 적용. PHP 코드는 URL 만 바꿔서 그대로 사용.
// 실행: node fake_server.mjs <port>
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.argv[2] || 8787);
export const OWNER = '11111111-1111-1111-1111-111111111111';
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace('00000000-0000-0000-0000-000000000000', OWNER));
await db.exec(`grant usage on schema public, auth to anon, authenticated;`);

// 가짜 로그인 계정 (로컬 테스트 전용 값)
const USERS = {
  'owner@test.local': { id: OWNER, password: 'owner-pass-1234' },
  'other@test.local': { id: '22222222-2222-2222-2222-222222222222', password: 'other-pass-1234' },
};
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, email) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.fake`;
/** Authorization 헤더 → { role, sub }. service 키('x')는 RLS 우회, JWT 는 authenticated, 그 외 anon */
function caller(auth) {
  const t = (auth || '').replace(/^Bearer /, '');
  if (t === 'x') return { role: 'service' };
  if (t === 'owner-token') return { role: 'authenticated', sub: OWNER };
  if (t === 'other-token') return { role: 'authenticated', sub: USERS['other@test.local'].id };
  const parts = t.split('.');
  if (parts.length === 3) {
    try {
      const { sub } = JSON.parse(Buffer.from(parts[1], 'base64url'));
      if (/^[0-9a-f-]{36}$/.test(sub)) return { role: 'authenticated', sub };
    } catch {}
  }
  return { role: 'anon' };
}

const fresh = () => ({ sent: [], actions: [], claude: [], refresh: [], alerts: [], cfg: { claudeText: '응 알겠어', claudeDelayMs: 0, igDelayMs: 0, igFail: false, claudeFail: false,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 30 } } } });
let st = fresh();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ident = (s) => { if (!/^[a-z_]+$/.test(s)) throw Object.assign(new Error('bad ident ' + s), { status: 400 }); return s; };

function where(params, args) {
  const conds = [];
  for (let [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    const col = ident(k);
    const neg = v.startsWith('not.');
    if (neg) v = v.slice(4);
    const m = v.match(/^(eq|neq|lt|lte|gt|gte|is|in)\.(.*)$/s);
    if (!m) throw Object.assign(new Error('bad filter ' + v), { status: 400 });
    const [, op, val] = m;
    const push = (c) => conds.push(neg ? `not (${c})` : c);
    if (op === 'is') { push(`${col} is ${({ null: 'null', true: 'true', false: 'false' })[val]}`); continue; }
    if (op === 'in') {
      const items = val.replace(/^\(|\)$/g, '').split(',');
      push(`${col}::text in (${items.map(i => { args.push(i); return `$${args.length}`; }).join(',')})`);
      continue;
    }
    args.push(val === 'true' ? true : val === 'false' ? false : val);
    push(`${col} ${({ eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' })[op]} $${args.length}`);
  }
  return conds.length ? ' where ' + conds.join(' and ') : '';
}

async function rest(db, method, path, params, body, prefer) {
  if (path.startsWith('rpc/')) {
    const fn = ident(path.slice(4));
    const keys = Object.keys(body || {});
    const res = await db.query(`select * from ${fn}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`,
      keys.map(k => body[k]));
    if (res.fields.length === 1 && res.fields[0].name === fn) return res.rows[0]?.[fn] ?? null;
    return res.rows;
  }
  const table = ident(path);
  const args = [];
  if (method === 'GET') {
    let sql = `select * from ${table}` + where(params, args);
    const order = params.get('order');
    if (order) {
      sql += ' order by ' + order.split(',').map(o => {
        const [c, ...mods] = o.split('.');
        return `${ident(c)} ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullslast') ? ' nulls last' : mods.includes('nullsfirst') ? ' nulls first' : ''}`;
      }).join(', ');
    }
    if (params.get('limit')) sql += ` limit ${Number(params.get('limit'))}`;
    if (params.get('offset')) sql += ` offset ${Number(params.get('offset'))}`;
    return (await db.query(sql, args)).rows;
  }
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const out = [];
    for (const row of rows) {
      const cols = Object.keys(row).map(ident);
      const a = cols.map(c => row[c]);
      const merge = (prefer || '').includes('merge-duplicates');
      const conflict = !params.get('on_conflict') ? '' : ` on conflict (${ident(params.get('on_conflict'))}) `
        + (merge ? `do update set ${cols.map(c => `${c} = excluded.${c}`).join(',')}` : 'do nothing');
      out.push(...(await db.query(`insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})${conflict} returning *`, a)).rows);
    }
    return out;
  }
  if (method === 'PATCH') {
    const cols = Object.keys(body).map(ident);
    cols.forEach(c => args.push(body[c]));
    return (await db.query(`update ${table} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}` + where(params, args) + ' returning *', args)).rows;
  }
  if (method === 'DELETE') { await db.query(`delete from ${table}` + where(params, args), args); return null; }
}

async function handle(req, body) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p.startsWith('/rest/v1/')) {
    // 서버(PHP)는 Authorization 없이 apikey 만 보냄 (새 secret 키 방식)
    const c = !req.headers.authorization && req.headers.apikey === 'x' ? { role: 'service' } : caller(req.headers.authorization);
    const run = (ex) => rest(ex, req.method, p.slice(9), url.searchParams, body, req.headers.prefer);
    let out = c.role === 'service' ? await run(db) : await db.transaction(async (tx) => {
      await tx.exec(`set local role ${c.role}; select set_config('request.jwt.claim.sub', '${c.sub || ''}', true);`);
      return run(tx);
    });
    if ((req.headers.accept || '').includes('vnd.pgrst.object')) {   // .single()
      if (!Array.isArray(out) || out.length !== 1) return [406, { message: 'JSON object requested, multiple (or no) rows returned' }];
      out = out[0];
    }
    return [200, out];
  }

  if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const u = USERS[body?.email];
    if (!u || u.password !== body.password) return [400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }];
    const now = Math.floor(Date.now() / 1000);
    return [200, { access_token: jwt(u.id, body.email), token_type: 'bearer', expires_in: 86400, expires_at: now + 86400,
      refresh_token: 'fake-refresh', user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: body.email,
        app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }];
  }
  if (p === '/auth/v1/logout') return [204, null];
  if (p === '/auth/v1/user') {
    const c = caller(req.headers.authorization);
    return c.sub ? [200, { id: c.sub, aud: 'authenticated', role: 'authenticated' }] : [401, { msg: 'invalid JWT' }];
  }
  if (p === '/ig/refresh_access_token') {
    st.refresh.push(url.searchParams.get('access_token'));
    if (st.cfg.refreshFail) return [400, { error: { message: 'fake refresh fail' } }];
    return [200, { access_token: 'NEW_TOKEN', token_type: 'bearer', expires_in: 5184000 }];
  }
  if (p === '/ig/me/messages' && req.method === 'POST' && body.sender_action) {   // '입력 중…' 표시 (메시지 아님)
    st.actions.push({ to: body.recipient.id, action: body.sender_action });
    return st.cfg.typingFail ? [400, { error: { message: 'unsupported' } }] : [200, { recipient_id: body.recipient.id }];
  }
  if (p === '/ig/me/messages' && req.method === 'POST') {
    st.sent.push({ to: body.recipient.id, text: body.message.text, auth: req.headers.authorization });   // 받는 즉시 기록 (= 인스타가 실제로 보냄)
    const n = st.sent.length;
    await sleep(st.cfg.igDelayMs);
    if (st.cfg.igFail) return [500, { error: { message: 'fake fail' } }];
    if (st.cfg.igError) return [st.cfg.igError.status, st.cfg.igError.body];   // 예: 차단(551)·토큰(190)
    return [200, { recipient_id: body.recipient.id, message_id: `botmid_${n}` }];
  }
  if (p === '/ig/me' && req.method === 'GET') {
    if (st.cfg.meFail) return [400, { error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 } }];
    return [200, { id: 'app_scoped', user_id: 'SELF', username: 'bot_self' }];
  }
  if (p === '/ig/me/conversations' && req.method === 'GET' && url.searchParams.get('user_id')) {   // 한 상대의 대화 기록
    return [200, { data: [{ messages: { data: (st.cfg.convTimes ?? []).map((t) => ({ created_time: t })) } }] }];
  }
  if (p === '/ig/me/conversations' && req.method === 'GET') {   // 2쪽짜리 대화 목록 (after=p2 로 두 번째 쪽)
    const conv = (id, u) => ({ participants: { data: [{ id: 'SELF', username: 'bot_self' }, { id, username: u }] }, updated_time: '2026-01-01T00:00:00+0000' });
    return url.searchParams.get('after') === 'p2'
      ? [200, { data: [conv('imp3', 'u3')] }]
      : [200, { data: [conv('imp1', 'u1'), conv('imp2', 'u2')], paging: { cursors: { after: 'p2' }, next: 'x' } }];
  }
  if (p.startsWith('/ig/') && req.method === 'GET') {
    const id = p.slice(4);
    return [200, { id, username: `user_${id}`, name: `이름_${id}` }];
  }
  if (p === '/claude' && req.method === 'POST') {
    // system 이 블록 배열(캐시 배치)이면 테스트가 글자로 확인할 수 있게 합쳐 둠 (원래 블록은 systemBlocks)
    if (Array.isArray(body.system)) { body.systemBlocks = body.system; body.system = body.system.map((b) => b.text).join('\n\n'); }
    st.claude.push(body);
    await sleep(st.cfg.claudeDelayMs);
    if (st.cfg.claudeFail) return [500, { error: 'fake' }];
    if (st.cfg.claudeError) return [st.cfg.claudeError.status, st.cfg.claudeError.body];   // 예: 크레딧 부족
    let text = st.cfg.claudeText;
    if (body.output_config?.format && !st.cfg.claudeRaw) {   // 구조화 출력 요청 → 예전 형식 문자열을 JSON 으로 감쌈
      const no = text.includes('NO_REPLY');
      // 태그: [약속] [구체] [바쁨] [날짜:YYYY-MM-DD] [시간:HH:MM]
      const tag = (k) => text.match(new RegExp(`\\[${k}:([^\\]]*)\\]`))?.[1] ?? '';
      // [기억:사실|YYYY-MM-DD] → remember
      const remember = [...text.matchAll(/\[기억:([^|\]]*)\|?([^\]]*)\]/g)].map((m) => ({ fact: m[1], date: m[2] }));
      const msg = text.replace(/\[(약속|바쁨|구체)\]|\[(날짜|시간|기억):[^\]]*\]/g, '').trim();
      text = JSON.stringify({ note: '', action: no ? 'no_reply' : 'reply', appointment: text.includes('[약속]'), specific: text.includes('[구체]'), busy: text.includes('[바쁨]'),
        appt_date: tag('날짜'), appt_time: tag('시간'), message: no ? '' : msg, remember });
    }
    return [200, { content: [{ type: 'text', text }], usage: st.cfg.usage }];
  }

  if (p === '/alert' && req.method === 'POST') { st.alerts.push(body); return [200, { ok: true }]; }   // 알림 메일 대신
  if (p === '/_test/state') return [200, { sent: st.sent, actions: st.actions, claude: st.claude, refresh: st.refresh, alerts: st.alerts }];
  if (p === '/_test/config') { Object.assign(st.cfg, body); return [200, st.cfg]; }
  if (p === '/_test/sql') return [200, (await db.exec(body.sql)).at(-1)?.rows ?? []];
  if (p === '/_test/reset') {
    await db.exec(`truncate send_log, messages, queue, contacts, tone_profiles, app_secrets, calendar_events, claude_usage, contact_facts restart identity cascade;
                   delete from settings; insert into settings (id, global_enabled) values (1, true);`);
    st = fresh();
    return [200, { ok: true }];
  }
  return [404, { error: 'not found ' + p }];
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,x-client-info,x-supabase-api-version,range',
};
createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', async () => {
    let status, out;
    try {
      [status, out] = await handle(req, raw ? JSON.parse(raw) : null);
    } catch (e) {
      status = e.code === '23505' ? 409 : e.code === '42501' ? 403 : (e.status || 400);
      out = { code: e.code, message: e.message };
    }
    res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
    res.end(out === null || out === undefined ? '' : JSON.stringify(out));
  });
}).listen(PORT, '127.0.0.1', () => console.log('READY ' + PORT));
