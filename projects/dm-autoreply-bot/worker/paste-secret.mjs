// 클립보드에 복사한 값을 secrets.local.env 에 바로 넣기 (값은 화면에 출력하지 않음)
//   npm run paste-token   → IG_ACCESS_TOKEN (+ IG_TOKEN_EXPIRES_AT 을 지금+60일로 자동 설정)
//   npm run paste-secret  → IG_APP_SECRET
// 넣은 뒤 클립보드는 비움
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILE = new URL('./secrets.local.env', import.meta.url);
const which = process.argv[2];
const RULES = {
  token: { key: 'IG_ACCESS_TOKEN', ok: (v) => v.length > 50 && !/\s/.test(v), hint: 'Instagram 액세스 토큰(긴 문자열)' },
  secret: { key: 'IG_APP_SECRET', ok: (v) => /^[0-9a-f]{32}$/i.test(v), hint: 'Instagram 앱 시크릿 코드(32자리 영숫자)' },
};
const rule = RULES[which];
if (!rule) { console.error('사용법: node paste-secret.mjs token|secret'); process.exit(1); }

const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
const value = ps('Get-Clipboard -Raw').trim();
if (!rule.ok(value)) {
  console.error(`✗ 클립보드에 ${rule.hint}이(가) 없어요. Meta 화면에서 값을 복사한 뒤 다시 실행하세요. (클립보드 글자 수: ${value.length})`);
  process.exit(1);
}

let text = readFileSync(FILE, 'utf8');
const set = (key, v) => {
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${v}`) : `${text.trimEnd()}\n${key}=${v}\n`;
};
set(rule.key, value);
if (which === 'token') set('IG_TOKEN_EXPIRES_AT', String(Math.floor(Date.now() / 1000) + 60 * 86400));
writeFileSync(FILE, text);
ps('Set-Clipboard -Value " "');   // 클립보드 비우기

console.log(`✓ ${rule.key} 저장${which === 'token' ? ' + IG_TOKEN_EXPIRES_AT(지금부터 60일) 자동 설정' : ''} — 클립보드는 비웠어요`);
