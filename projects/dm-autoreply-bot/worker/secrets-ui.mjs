// 비밀값 입력 화면 (이 PC 안에서만 열림): node secrets-ui.mjs → 브라우저에 주소가 열림
// 값을 붙여넣고 [저장] → secrets.local.env 에 기록, [Cloudflare에 등록] → upload-secrets.mjs 실행
// 저장된 값은 화면에 다시 표시하지 않음 (채워짐/비어 있음만 표시)
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const FILE = new URL('./secrets.local.env', import.meta.url);
const KEY = randomBytes(16).toString('hex');   // 다른 사이트가 이 화면을 조작하지 못하게 하는 주소 비밀값
const FIELDS = [
  ['IG_APP_SECRET', 'Instagram 앱 시크릿 코드', '맞춤 설정 화면 위쪽 "Instagram 앱 시크릿 코드" → [표시] → 복사', (v) => /^[0-9a-f]{32}$/i.test(v), '32자리 영숫자여야 해요'],
  ['IG_ACCESS_TOKEN', 'Instagram 액세스 토큰', '"2. 액세스 토큰 생성" → 계정 옆 [토큰 생성] → 복사 (만료 시각은 자동으로 60일 뒤로 저장)', (v) => v.length > 50 && !/\s/.test(v), '토큰이 너무 짧거나 공백이 있어요'],
  ['SUPABASE_SERVICE_KEY', 'Supabase Secret key', '이미 채워져 있으면 비워 두세요', (v) => v.startsWith('sb_secret_') || v.startsWith('eyJ'), 'sb_secret_ 로 시작해야 해요 (publishable 아님)'],
  ['CLAUDE_API_KEY', 'Claude API 키', '이미 채워져 있으면 비워 두세요', (v) => v.startsWith('sk-ant-'), 'sk-ant- 로 시작해야 해요'],
];
const ALL = ['SUPABASE_SERVICE_KEY', 'CLAUDE_API_KEY', 'ENC_KEY_B64', 'IG_VERIFY_TOKEN', 'IG_APP_SECRET', 'IG_ACCESS_TOKEN', 'IG_TOKEN_EXPIRES_AT'];

const read = () => readFileSync(FILE, 'utf8');
const get = (text, k) => (text.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim();
function set(text, k, v) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(msg = '', log = '') {
  const text = read();
  const status = ALL.map((k) => `<li class="${get(text, k) ? 'ok' : 'no'}">${get(text, k) ? '✓' : '–'} ${k}</li>`).join('');
  const rows = FIELDS.map(([k, label, hint]) => `
    <label>${esc(label)} <span class="st ${get(text, k) ? 'ok' : 'no'}">${get(text, k) ? '저장됨' : '비어 있음'}</span>
      <input type="password" name="${k}" autocomplete="off" spellcheck="false" placeholder="여기에 붙여넣기 (Ctrl+V)">
      <small>${esc(hint)}</small></label>`).join('');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>봇 비밀값 입력</title>
<style>
  body{font:15px/1.5 "Malgun Gothic",sans-serif;background:#f6f6f4;color:#1c1c1a;margin:0}
  main{max-width:640px;margin:24px auto;padding:0 16px}
  .card{background:#fff;border:1px solid #e4e3df;border-radius:10px;padding:16px;margin-bottom:12px}
  h1{font-size:18px;margin:0 0 4px} label{display:block;margin:14px 0;font-weight:600}
  input{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #ccc;border-radius:8px;font:inherit;font-weight:400}
  small{display:block;color:#6b6b66;font-weight:400;margin-top:3px}
  .st{font-size:12px;font-weight:400;padding:1px 8px;border-radius:10px;margin-left:6px}
  .st.ok,li.ok{color:#2b8a3e} .st.ok{border:1px solid #2b8a3e} .st.no{color:#999;border:1px solid #ccc} li.no{color:#999}
  ul{columns:2;padding-left:18px;margin:8px 0 0} button{padding:9px 16px;border-radius:8px;border:0;font:inherit;cursor:pointer;margin-right:8px}
  .p{background:#3b5bdb;color:#fff} .s{background:#2b8a3e;color:#fff}
  .msg{padding:10px 12px;border-radius:8px;background:#e7f5ff;margin-bottom:12px;white-space:pre-wrap}
  pre{background:#1c1c1a;color:#eee;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:13px}
</style>
<main>
  <div class="card"><h1>봇 비밀값 입력</h1>
    <small>값은 이 PC 의 worker\\secrets.local.env 에만 저장되고, 화면에는 다시 표시되지 않아요. 비워 둔 칸은 바꾸지 않아요.</small>
    <ul>${status}</ul></div>
  ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
  <form class="card" method="post" action="/save?k=${KEY}">${rows}
    <button class="p" type="submit">저장</button></form>
  <form class="card" method="post" action="/upload?k=${KEY}">
    <b>Cloudflare 에 등록</b><small>저장한 값을 봇 서버(bot.example.com)에 올려요. 값을 바꾸면 다시 누르면 돼요.</small><br>
    <button class="s" type="submit">Cloudflare에 등록</button></form>
  ${log ? `<pre>${esc(log)}</pre>` : ''}
</main></html>`;
}

const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => b += d); req.on('end', () => ok(new URLSearchParams(b))); });
const send = (res, html) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('k') !== KEY) { res.writeHead(404); return res.end(); }
  if (req.method === 'POST' && url.pathname === '/save') {
    const form = await body(req);
    let text = read();
    const done = [], errors = [];
    for (const [k, label, , ok, why] of FIELDS) {
      const v = (form.get(k) ?? '').trim();
      if (!v) continue;
      if (!ok(v)) { errors.push(`✗ ${label}: ${why}`); continue; }
      text = set(text, k, v);
      if (k === 'IG_ACCESS_TOKEN') text = set(text, 'IG_TOKEN_EXPIRES_AT', String(Math.floor(Date.now() / 1000) + 60 * 86400));
      done.push(`✓ ${label} 저장`);
    }
    writeFileSync(FILE, text);
    return send(res, page([...done, ...errors].join('\n') || '입력한 값이 없어요'));
  }
  if (req.method === 'POST' && url.pathname === '/upload') {
    const p = spawn('node', ['upload-secrets.mjs'], { cwd: new URL('.', import.meta.url), shell: process.platform === 'win32' });
    let log = '';
    p.stdout.on('data', (d) => log += d); p.stderr.on('data', (d) => log += d);
    p.on('close', (code) => send(res, page(code === 0 ? '✓ Cloudflare 등록 완료' : '✗ 등록 실패 — 아래 기록을 확인하세요', log.replace(/\x1b\[[0-9;]*m/g, ''))));
    return;
  }
  send(res, page());
});

server.listen(0, '127.0.0.1', () => {
  const addr = `http://127.0.0.1:${server.address().port}/?k=${KEY}`;
  console.log(`입력 화면: ${addr}\n(이 창을 닫으면 화면도 꺼져요)`);
  spawn('cmd', ['/c', 'start', '', addr.replace(/&/g, '^&')], { detached: true, stdio: 'ignore' }).unref();
});
