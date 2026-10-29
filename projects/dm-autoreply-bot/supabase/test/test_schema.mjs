// schema.sql 로컬 검증 (PGlite = WASM Postgres). 실행: npm install && node test_schema.mjs
// 동시 접속(SKIP LOCKED) 자체는 단일 연결이라 여기선 못 봄 → PHP 단계 검증 (7)에서 실제 프로젝트로 확인
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const OWNER = '11111111-1111-1111-1111-111111111111';
const db = new PGlite();

// Supabase 환경 흉내: 역할 + auth.uid()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
`);
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  .replace('00000000-0000-0000-0000-000000000000', OWNER);
await db.exec(schema);
await db.exec(`grant all on all tables in schema public to service_role;
               grant all on all sequences in schema public to service_role;`);

const q = async (sql, params) => params
  ? (await db.query(sql, params)).rows
  : (await db.exec(sql)).at(-1).rows;
const as = async (role, sub, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
};
const fails = async (p) => { try { await p; return false; } catch { return true; } };
const ready = () => q(`update queue set not_before = now() - interval '1 second' where status = 'pending'`);
let n = 0; const ok = (name) => console.log(`PASS ${++n}. ${name}`);

// ── enqueue ──
assert.equal((await q(`select enqueue('inbound','m1','u1','x', now()) r`))[0].r, true);
assert.equal((await q(`select enqueue('inbound','m1','u1','x', now()) r`))[0].r, false);
assert.equal((await q(`select count(*)::int c from queue`))[0].c, 1);
assert.ok((await q(`select last_user_msg_at from contacts where igsid='u1'`))[0].last_user_msg_at);
ok('enqueue: 상대 자동 생성, 같은 mid 중복 무시');

const nb = (await q(`select extract(epoch from not_before - now())::int s from queue where mid='m1'`))[0].s;
assert.ok(nb >= 18 && nb <= 20, `delay ${nb}`);
assert.equal((await q(`select * from claim_jobs(10, 120)`)).length, 0);
ok('응답 지연 20초 전에는 가져가지 않음');

// ── 묶기: 대기 중 새 메시지가 오면 마지막 메시지 기준으로 보류 ──
await ready();
await q(`select enqueue('inbound','m2','u1','x', now())`);
assert.equal((await q(`select * from claim_jobs(10, 120)`)).length, 0);
await ready();
const got = await q(`select * from claim_jobs(10, 120)`);
assert.deepEqual(got.map(r => r.mid).sort(), ['m1', 'm2']);
ok('연속 메시지는 조용해진 뒤 한 번에 묶어서 가져감');

// ── 임대 중엔 다른 워커가 못 가져감 ──
await q(`select enqueue('inbound','m3','u1','x', now())`); await ready();
assert.equal((await q(`select * from claim_jobs(10, 120)`)).length, 0);
ok('같은 상대는 임대 중 다른 워커가 못 가져감 (이중 발송 방지)');

// ── 임대 만료 → processing 재처리 (유실 없음) ──
await q(`update contacts set lease_until = now() - interval '1 second';
         update queue set locked_until = now() - interval '1 second' where status='processing'`);
const again = await q(`select * from claim_jobs(10, 120)`);
assert.deepEqual(again.map(r => r.mid).sort(), ['m1', 'm2', 'm3']);
assert.equal(again.find(r => r.mid === 'm1').attempts, 2);
ok('실행 중단 후 임대 만료되면 미처리 건 전부 재처리');

// ── sending 중 중단 → needs_review, 재발송 안 함 ──
await q(`update queue set status='sending' where mid='m1';
         update queue set status='done' where mid in ('m2','m3');
         update contacts set lease_until = now() - interval '1 second';
         update queue set locked_until = now() - interval '1 second'`);
assert.equal((await q(`select * from claim_jobs(10, 120)`)).length, 0);
assert.equal((await q(`select status from queue where mid='m1'`))[0].status, 'needs_review');
ok('발송 도중 중단 건은 재발송 없이 needs_review');

// ── 재시도 한도 ──
await q(`select enqueue('inbound','m4','u2','x', now())`); await ready();
await q(`update queue set attempts = 5 where mid='m4'`);
assert.equal((await q(`select * from claim_jobs(10, 120)`)).length, 0);
assert.equal((await q(`select status from queue where mid='m4'`))[0].status, 'failed');
ok('재시도 5회 초과 시 failed');

// ── send_log: 작업당 1회 ──
const qid = (await q(`select id from queue where mid='m3'`))[0].id;
await q(`insert into send_log (queue_id, igsid, text_enc, status) values ($1,'u1','x','sending')`, [qid]);
assert.ok(await fails(q(`insert into send_log (queue_id, igsid, text_enc, status) values ($1,'u1','x','sending')`, [qid])));
ok('send_log.queue_id UNIQUE 로 같은 작업 두 번 발송 기록 불가');

// ── 기본 프로필 1개만 ──
await q(`insert into tone_profiles (is_default) values (true)`);
assert.ok(await fails(q(`insert into tone_profiles (is_default) values (true)`)));
assert.ok(await fails(q(`insert into tone_profiles (contact_key, is_default) values ('a', true)`)));
ok('기본 프로필은 정확히 1개, contact_key 없음');

// ── 권한 ──
await as('anon', '', async () => {
  assert.ok(await fails(q(`select * from settings`)));
  assert.ok(await fails(q(`select enqueue('inbound','x','u9','x', now())`)));
});
await as('authenticated', '22222222-2222-2222-2222-222222222222', async () => {
  assert.equal((await q(`select * from settings`)).length, 0);
  assert.equal((await q(`update settings set global_enabled = true returning id`)).length, 0);
});
ok('anon 접근 불가, 오너 아닌 로그인 사용자는 0행');

await as('authenticated', OWNER, async () => {
  assert.equal((await q(`update settings set global_enabled = true returning id`)).length, 1);
  assert.equal((await q(`update contacts set auto_enabled = false where igsid='u1' returning igsid`)).length, 1);
  assert.ok(await fails(q(`update settings set token_expires_at = now()`)));
  assert.ok(await fails(q(`update contacts set lease_until = null`)));
  assert.ok(await fails(q(`select * from queue`)));
  assert.ok(await fails(q(`select * from messages`)));
  assert.ok(await fails(q(`select * from send_log`)));
  assert.ok(await fails(q(`select * from claim_jobs(1, 1)`)));
});
ok('오너: 스위치·토글 수정 가능 / 큐·원문·RPC·내부 컬럼 접근 불가');

console.log(`\n${n}개 전부 통과`);
