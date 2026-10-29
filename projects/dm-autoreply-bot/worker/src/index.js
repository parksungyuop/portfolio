// bot.example.com
//   /            대시보드 (../dashboard/dist 정적 파일 — Worker 코드를 거치지 않음)
//   /ig/webhook  Instagram 웹훅 (GET 검증, POST 수신)
//   /ig/api      대시보드 API (오너 로그인 필수)
//   크론: 매 분 대기열 처리, 매일 04:00 KST 유지 작업
import { ctx, num, verifySignature } from './core.js';
import { workerRun, webhookEnqueue, dailyRun } from './bot.js';
import { handleApi } from './api.js';

const text = (status, body = '') => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

async function handleWebhook(request, env, executionCtx) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const ok = env.IG_VERIFY_TOKEN && url.searchParams.get('hub.mode') === 'subscribe'
      && url.searchParams.get('hub.verify_token') === env.IG_VERIFY_TOKEN;
    return ok ? text(200, url.searchParams.get('hub.challenge') ?? '') : text(403);
  }
  if (request.method !== 'POST') return text(405);

  const raw = await request.arrayBuffer();
  if (!await verifySignature(env.IG_APP_SECRET, raw, request.headers.get('X-Hub-Signature-256'))) return text(403);
  try {
    await webhookEnqueue(ctx(env), JSON.parse(new TextDecoder().decode(raw) || '{}'));
  } catch (e) {
    // 적재 실패 시 200 을 주지 않음 → Meta 가 재전송 → 유실 없음 (mid UNIQUE 로 중복도 없음)
    console.error('webhook enqueue: ' + e.message);
    return text(500);
  }
  // 응답은 바로 보내고, 처리는 응답 뒤에 이어서 (PHP 의 fastcgi_finish_request 역할)
  if (env.INLINE_WORKER === '1') executionCtx.waitUntil(workerRun(env, num({ env }, 'WEBHOOK_BUDGET_SEC')).catch((e) => console.error(e.message)));
  return text(200, 'EVENT_RECEIVED');
}

export default {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url);
    // 암호화 없는 http 접속은 https 로 (로그인 정보 보호). 로컬 개발·테스트는 FORCE_HTTPS=0
    if (url.protocol === 'http:' && env.FORCE_HTTPS !== '0') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/ig/webhook') return handleWebhook(request, env, executionCtx);
    if (url.pathname === '/ig/api') return handleApi(request, env);
    return env.ASSETS.fetch(request);   // 대시보드·개인정보처리방침 정적 파일 (없는 경로는 404)
  },

  async scheduled(event, env) {
    if (event.cron === '0 19 * * *') await dailyRun(env);
    else await workerRun(env, num({ env }, 'WORKER_BUDGET_SEC'));
  },
};
