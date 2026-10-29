<?php
// ~/dmbot/config.php 로 복사 후 값 입력. chmod 600. public_html 안에 두지 말 것.

define('OWNER_NAME', '홍길동');

// Supabase (service role 키는 이 파일에만)
define('SUPABASE_URL', 'https://xxxx.supabase.co');
define('SUPABASE_SERVICE_KEY', '');
define('OWNER_UUID', '');                            // Supabase Auth 오너 계정 UUID (schema.sql 의 is_owner() 와 동일)

// Meta 앱 (Instagram API with Instagram Login)
define('IG_APP_SECRET', '');                         // 웹훅 서명 검증
define('IG_VERIFY_TOKEN', '');                       // 웹훅 등록 시 입력한 임의 문자열
define('IG_API_BASE', 'https://graph.instagram.com/v23.0');   // 버전은 Meta 앱 대시보드 기준으로
define('IG_TOKEN_FILE', __DIR__ . '/token.json');    // {"access_token": "...", "expires_at": 1234567890}

// Claude
define('CLAUDE_API_URL', 'https://api.anthropic.com/v1/messages');
define('CLAUDE_API_KEY', '');
define('CLAUDE_MODEL_REPLY', 'claude-haiku-5-5');     // 비용 절감. 품질이 아쉬우면 claude-sonnet-5-5
define('CLAUDE_MODEL_SUMMARY', 'claude-haiku-5-5');

// 암호화 키: php -r "echo base64_encode(random_bytes(32));"  (분실 시 기존 원문 복호화 불가)
define('ENC_KEY_B64', '');

// 워커
define('LOCK_FILE', __DIR__ . '/locks/worker.lock');
define('WORKER_BUDGET_SEC', 45);       // 크론 1회 실행 시간 (크론 주기 60초보다 짧게)
define('WEBHOOK_BUDGET_SEC', 20);      // fastcgi_finish_request 후 인라인 처리 시간
define('MAX_CONTACTS_PER_RUN', 10);
define('LEASE_SEC', 120);              // 반드시 WORKER_BUDGET_SEC + Claude 응답시간보다 길게
define('MAX_ATTEMPTS', 5);
define('REPLY_WINDOW_SEC', 24 * 3600 - 300);   // 24시간 창 - 여유 5분
define('CONTEXT_MESSAGES', 20);
