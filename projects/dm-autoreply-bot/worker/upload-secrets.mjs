// secrets.local.env 의 값을 Cloudflare Worker 비밀값으로 한 번에 등록 (npm run secrets)
// 값은 화면에 출력하지 않음. 비어 있는 항목은 건너뜀 → 채운 뒤 다시 실행하면 됨
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FILE = new URL('./secrets.local.env', import.meta.url);
if (!existsSync(FILE)) { console.error('secrets.local.env 가 없습니다'); process.exit(1); }

const CHECK = {
  SUPABASE_SERVICE_KEY: (v) => v.startsWith('sb_secret_') || v.startsWith('eyJ') || 'sb_secret_ 로 시작하는 Secret key 여야 함 (publishable 키 아님)',
  CLAUDE_API_KEY: (v) => v.startsWith('sk-ant-') || 'sk-ant- 로 시작해야 함',
  ENC_KEY_B64: (v) => Buffer.from(v, 'base64').length === 32 || '32바이트 base64 여야 함',
  IG_VERIFY_TOKEN: (v) => v.length >= 16 || '16자 이상',
  IG_APP_SECRET: (v) => /^[0-9a-f]{32}$/i.test(v) || 'Meta 앱 시크릿(32자리 영숫자)',
  IG_ACCESS_TOKEN: (v) => v.length > 50 || 'Instagram 액세스 토큰',
  IG_TOKEN_EXPIRES_AT: (v) => /^\d{10}$/.test(v) || '유닉스 시간(10자리 숫자)',
};

const env = {};
for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const upload = {};
let bad = false;
for (const [k, check] of Object.entries(CHECK)) {
  const v = env[k] ?? '';
  if (!v) { console.log(`- ${k}: 비어 있음 → 건너뜀`); continue; }
  const ok = check(v);
  if (ok !== true) { console.log(`✗ ${k}: ${ok}`); bad = true; continue; }
  upload[k] = v;
  console.log(`✓ ${k}`);
}
if (bad) { console.error('\n형식이 맞지 않는 값이 있어 등록하지 않았습니다.'); process.exit(1); }
if (!Object.keys(upload).length || process.argv.includes('--dry-run')) process.exit(0);   // --dry-run: 형식만 확인

const tmp = path.join(tmpdir(), `dmbot-secrets-${process.pid}.json`);
writeFileSync(tmp, JSON.stringify(upload), { mode: 0o600 });
try {
  const r = spawnSync('npx', ['wrangler', 'secret', 'bulk', tmp], { stdio: 'inherit', shell: process.platform === 'win32' });
  process.exitCode = r.status ?? 1;
} finally {
  unlinkSync(tmp);
}
