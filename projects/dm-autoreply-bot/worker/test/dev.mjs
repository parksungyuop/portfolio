// 대시보드 로컬 확인용: 가짜 백엔드(8787) + Worker(8788, 대시보드 포함) + 시드 데이터. Ctrl+C 로 종료
//   cd dashboard && npx vite build --mode devlocal
//   cd worker && node test/dev.mjs   → http://127.0.0.1:8788/  (owner@test.local / owner-pass-1234)
// 확인 후 dashboard 는 `npx vite build` 로 다시 빌드할 것 (운영 주소로)
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, webcrypto } from 'node:crypto';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.resolve(here, '..');
const DEV_VARS = path.join(WORKER_DIR, '.dev.vars');
if (existsSync(DEV_VARS)) { console.error('.dev.vars 가 이미 있어 중단'); process.exit(1); }
// 포트가 이미 쓰이고 있으면(이전 실행이 남긴 서버 등) 엉뚱한 서버와 통신하게 되므로 중단
import { createServer } from 'node:net';
const portFree = (port) => new Promise((ok) => { const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(port, '127.0.0.1'); });
for (const port of [8787, 8788]) if (!await portFree(port)) { console.error(`포트 ${port} 사용 중 — 남아 있는 서버(workerd 등)를 먼저 종료하세요`); process.exit(1); }
const procs = [];
const cleanup = () => { for (const p of procs.splice(0)) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']); try { unlinkSync(DEV_VARS); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(0));

function start(cmd, args, cwd, readyText) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, shell: true, env: { ...process.env, CI: '1', NO_COLOR: '1' } });
    procs.push(p);
    let log = '';
    const on = (d) => { log += d; if (log.includes(readyText)) resolve(); };
    p.stdout.on('data', on); p.stderr.on('data', on);
    p.on('exit', (c) => reject(new Error(`${cmd} 종료 ${c}\n${log.slice(-1500)}`)));
  });
}

const ENC = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
writeFileSync(DEV_VARS, `SUPABASE_SERVICE_KEY=x\nIG_APP_SECRET=s\nIG_VERIFY_TOKEN=v\nCLAUDE_API_KEY=x\nENC_KEY_B64=${ENC}\nIG_ACCESS_TOKEN=T\nIG_TOKEN_EXPIRES_AT=${Math.floor(Date.now() / 1000) + 6 * 86400}`);
await start('node', ['fake_server.mjs', '8787'], path.resolve(WORKER_DIR, '../supabase/test'), 'READY');
const vars = { SUPABASE_URL: 'http://127.0.0.1:8787', IG_API_BASE: 'http://127.0.0.1:8787/ig', CLAUDE_API_URL: 'http://127.0.0.1:8787/claude',
  OWNER_UUID: '11111111-1111-1111-1111-111111111111', INLINE_WORKER: '0', FORCE_HTTPS: '0', MAX_SUBREQUESTS: '1000' };
await start('npx', ['wrangler', 'dev', '--port', '8788', '--ip', '127.0.0.1', '--test-scheduled', '--show-interactive-dev-session=false',
  ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])], WORKER_DIR, 'Ready on');

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers } }).then((r) => r.text());
const fake = (p, b = {}) => post('http://127.0.0.1:8787' + p, JSON.stringify(b));
const sql = (q) => fake('/_test/sql', { sql: q });
const run = () => fetch('http://127.0.0.1:8788/__scheduled?cron=*+*+*+*+*');
let seq = 0;
const msg = (igsid, text, ago = 0) => ({ sender: { id: igsid }, recipient: { id: 'ME' }, timestamp: Date.now() - ago * 1000, message: { mid: 'm' + (++seq), text } });
const hook = (events) => { const b = JSON.stringify({ object: 'instagram', entry: [{ messaging: events }] }); return post('http://127.0.0.1:8788/ig/webhook', b, { 'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', 's').update(b).digest('hex') }); };
const ready = () => sql("update queue set not_before = now() - interval '1 second' where status='pending'");

await fake('/_test/reset');
await sql(`insert into tone_profiles (is_default, display_name, style_guide, stats) values (true, '기본', '- 반말, 짧게', '{"owner_messages": 820, "honorific_ratio": 0.12, "avg_len": 9.4}');
  insert into tone_profiles (contact_key, display_name, style_guide, stats) values ('user_1001', '민지', '- 반말, 이모지 많이', '{"owner_messages": 340, "honorific_ratio": 0, "avg_len": 7.1}'),
  ('user_1002', '김팀장님', '- 존댓말', '{"owner_messages": 95, "honorific_ratio": 0.97, "avg_len": 21.3}')`);
await hook([msg('1001', '뭐해'), msg('1002', '내일 회의 자료 확인 부탁드려요'), msg('1003', '협업 문의드립니다'), msg('1004', '어제 그 돈 언제 보내줄 거야?', 25 * 3600)]);
await ready(); for (let i = 0; i < 4; i++) await run();
await fake('/_test/config', { claudeText: '[약속] 시간 확인해보고 알려줄게' });
await hook([msg('1001', '이번 주말에 볼래?')]); await ready(); await run();
await fake('/_test/config', { claudeText: '- 일상 대화, 안부' });
await fetch('http://127.0.0.1:8788/__scheduled?cron=0+19+*+*+*');
await fake('/_test/config', { claudeText: '응 알겠어' });
await sql("update contacts set paused_until = now() + interval '20 minutes' where igsid = '1003'");
console.log('READY http://127.0.0.1:8788/  (owner@test.local / owner-pass-1234)');
setInterval(() => {}, 1 << 30);
