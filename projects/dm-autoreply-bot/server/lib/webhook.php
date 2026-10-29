<?php
declare(strict_types=1);

function webhook_main(): void
{
    header('Content-Type: text/plain; charset=utf-8');

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // PHP 는 쿼리 이름의 '.' 을 '_' 로 바꿈: hub.mode → hub_mode
        $ok = IG_VERIFY_TOKEN !== ''
            && ($_GET['hub_mode'] ?? '') === 'subscribe'
            && hash_equals(IG_VERIFY_TOKEN, (string) ($_GET['hub_verify_token'] ?? ''));
        if (!$ok) {
            http_response_code(403);
            return;
        }
        echo (string) ($_GET['hub_challenge'] ?? '');
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        return;
    }

    $raw = (string) file_get_contents('php://input');
    $sig = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
    if (IG_APP_SECRET === '' || !hash_equals('sha256=' . hash_hmac('sha256', $raw, IG_APP_SECRET), $sig)) {
        http_response_code(403);
        return;
    }

    try {
        webhook_enqueue(json_decode($raw, true) ?: []);
    } catch (Throwable $e) {
        // 적재 실패 시 200 을 주지 않음 → Meta 가 재전송 → 유실 없음 (mid UNIQUE 로 중복도 없음)
        error_log('webhook enqueue: ' . $e->getMessage());
        http_response_code(500);
        return;
    }

    http_response_code(200);
    echo 'EVENT_RECEIVED';

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
        worker_run(WEBHOOK_BUDGET_SEC);
    }
}

/** 텍스트 메시지만 큐에 적재. 반환: 새로 적재된 건수 */
function webhook_enqueue(array $payload): int
{
    if (($payload['object'] ?? '') !== 'instagram') {
        return 0;
    }
    $n = 0;
    foreach ($payload['entry'] ?? [] as $entry) {
        foreach ($entry['messaging'] ?? [] as $ev) {
            $m = $ev['message'] ?? null;
            // 리액션·읽음·삭제 이벤트는 무시
            if (!is_array($m) || empty($m['mid']) || !empty($m['is_deleted'])) {
                continue;
            }
            $echo = !empty($m['is_echo']);
            $text = trim((string) ($m['text'] ?? ''));
            // 상대가 보낸 게시물·릴스·사진·스토리 공유(첨부), 링크만 있는 메시지는 답장하지 않음.
            // 오너가 보낸 건(echo) 첨부여도 적재 → 오너 개입으로 보고 일시정지
            if (!$echo && ($text === '' || !empty($m['attachments']) || !empty($m['is_unsupported'])
                    || preg_match('~^(https?://\S+\s*)+$~u', $text))) {
                continue;
            }
            $igsid = (string) ($echo ? ($ev['recipient']['id'] ?? '') : ($ev['sender']['id'] ?? ''));
            if ($igsid === '') {
                continue;
            }
            $ts = intdiv((int) ($ev['timestamp'] ?? time() * 1000), 1000);
            $new = sb_rpc('enqueue', [
                'p_kind'        => $echo ? 'echo' : 'inbound',
                'p_mid'         => (string) $m['mid'],
                'p_igsid'       => $igsid,
                'p_payload_enc' => enc(json_encode(['text' => $text], JSON_UNESCAPED_UNICODE)),
                'p_event_ts'    => iso($ts),
            ]);
            $n += $new ? 1 : 0;
        }
    }
    return $n;
}
