<?php
declare(strict_types=1);

// 일 1회 유지 작업 + 대화 요약 (daily.php, api.php 에서 사용)

const SUMMARY_MESSAGES = 50;
const TOKEN_REFRESH_DAYS = 10;            // 만료 10일 전부터 갱신
const KEEP_QUEUE_DAYS = 30;               // done/skipped/expired 작업
const KEEP_REVIEW_DAYS = 90;              // needs_review/failed 작업
const KEEP_MESSAGES_DAYS = 90;            // 맥락용 대화 원문
const KEEP_SEND_LOG_DAYS = 180;           // 자동발송 이력

function summarize_contact(string $igsid): string
{
    $rows = array_reverse(sb_select('messages', ['igsid' => "eq.$igsid", 'order' => 'ts.desc',
        'limit' => SUMMARY_MESSAGES]));
    if (!$rows) {
        return '';
    }
    $lines = array_map(fn($m) => date('m/d H:i', strtotime($m['ts'])) . ' '
        . ($m['direction'] === 'in' ? '상대' : ($m['direction'] === 'bot' ? '나(봇)' : '나')) . ': '
        . dec($m['text_enc']), $rows);

    $summary = claude_text(CLAUDE_MODEL_SUMMARY,
        OWNER_NAME . '의 인스타 DM 대화를 오너가 대시보드에서 훑어볼 수 있게 요약한다. '
        . '한국어 글머리표 3~5줄: 최근 용건, 약속·할 일(날짜 포함), 답이 필요한 질문, 분위기. 요약만 출력.',
        implode("\n", $lines));
    sb_update('contacts', ['igsid' => "eq.$igsid"], ['summary' => $summary, 'summary_at' => iso(time())]);
    return $summary;
}

/** 마지막 요약 이후 새 대화가 있는 상대만 요약 */
function summarize_due(float $budgetSec): int
{
    $deadline = microtime(true) + $budgetSec;
    $n = 0;
    foreach (sb_select('contacts', ['last_msg_at' => 'not.is.null', 'order' => 'last_msg_at.desc']) as $c) {
        if (microtime(true) > $deadline) {
            break;
        }
        if ($c['summary_at'] && strtotime($c['summary_at']) >= strtotime($c['last_msg_at'])) {
            continue;
        }
        try {
            summarize_contact($c['igsid']);
            $n++;
        } catch (Throwable $e) {
            error_log("summary {$c['igsid']}: " . $e->getMessage());
        }
    }
    return $n;
}

/** 장기 토큰(60일) 만료 전 갱신. 반환: 'refreshed' | 'ok' | 'error' */
function token_refresh(bool $force = false): string
{
    $t = json_decode((string) @file_get_contents(IG_TOKEN_FILE), true) ?: [];
    $exp = (int) ($t['expires_at'] ?? 0);
    if (!$force && $exp - time() > TOKEN_REFRESH_DAYS * 86400) {
        return 'ok';
    }
    try {
        $r = http_json('GET', IG_API_BASE . '/refresh_access_token?' . http_build_query(
            ['grant_type' => 'ig_refresh_token', 'access_token' => ig_token()]), null, []);
        if (empty($r['access_token'])) {
            throw new RuntimeException('응답에 access_token 없음');
        }
        $new = ['access_token' => $r['access_token'], 'expires_at' => time() + (int) ($r['expires_in'] ?? 5184000)];
        $tmp = IG_TOKEN_FILE . '.tmp';
        file_put_contents($tmp, json_encode($new));
        @chmod($tmp, 0600);
        rename($tmp, IG_TOKEN_FILE);                // 원자적 교체: 쓰는 도중 죽어도 기존 토큰 유지
        sb_update('settings', ['id' => 'eq.1'], ['token_expires_at' => iso($new['expires_at']), 'token_error' => null]);
        return 'refreshed';
    } catch (Throwable $e) {
        error_log('token refresh: ' . $e->getMessage());
        sb_update('settings', ['id' => 'eq.1'], ['token_error' => mb_substr($e->getMessage(), 0, 300)
            . ($exp ? ' (만료: ' . date('Y-m-d', $exp) . ')' : '')]);
        return 'error';
    }
}

function cleanup(): void
{
    $ago = fn(int $days) => 'lt.' . iso(time() - $days * 86400);
    sb_delete('queue', ['status' => 'in.(done,skipped,expired)', 'created_at' => $ago(KEEP_QUEUE_DAYS)]);
    sb_delete('queue', ['status' => 'in.(needs_review,failed)', 'created_at' => $ago(KEEP_REVIEW_DAYS)]);
    sb_delete('messages', ['ts' => $ago(KEEP_MESSAGES_DAYS)]);
    sb_delete('send_log', ['created_at' => $ago(KEEP_SEND_LOG_DAYS)]);
    sb_delete('appointments', ['status' => 'in.(done,cancelled)', 'created_at' => $ago(KEEP_SEND_LOG_DAYS)]);
}
