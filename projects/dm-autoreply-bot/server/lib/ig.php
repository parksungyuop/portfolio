<?php
declare(strict_types=1);

function ig_token(): string
{
    $t = json_decode((string) @file_get_contents(IG_TOKEN_FILE), true);
    if (empty($t['access_token'])) {
        throw new RuntimeException('IG 토큰 없음: ' . IG_TOKEN_FILE);
    }
    return $t['access_token'];
}

function ig_get(string $path, array $query = []): array
{
    $url = IG_API_BASE . '/' . $path . ($query ? '?' . http_build_query($query) : '');
    return http_json('GET', $url, null, ['Authorization: Bearer ' . ig_token()]) ?? [];
}

/** 상대 username/name. 실패하면 [] (기본 말투로 진행) */
function ig_profile(string $igsid): array
{
    try {
        return ig_get($igsid, ['fields' => 'name,username']);
    } catch (Throwable $e) {
        error_log("ig_profile $igsid: " . $e->getMessage());
        return [];
    }
}

/**
 * 인스타 DM 발송. **Graph API 발송은 반드시 이 함수로만** (전체 스위치 강제 지점).
 *
 * 반환: 'sent' | 'blocked_off'(전체 OFF) | 'duplicate'(이미 시도된 작업) | 'unknown'(응답 유실, 발송 여부 불명)
 * 확실한 실패(HTTP 오류 응답)는 send_log 를 지우고 HttpError 를 던짐 → 호출자가 재시도.
 */
function ig_send(string $igsid, string $text, array $queueIds): string
{
    $qid = max($queueIds);                 // 묶음 발송은 마지막 작업 id 로 기록
    $textEnc = enc($text);
    $token = ig_token();                   // 토큰 문제는 send_log 기록 전에 실패시켜 재시도 가능하게

    $s = sb_one('settings', ['id' => 'eq.1']);
    if (!$s || !$s['global_enabled']) {
        sb_insert('send_log', ['queue_id' => $qid, 'igsid' => $igsid, 'text_enc' => $textEnc, 'status' => 'blocked_off']);
        return 'blocked_off';
    }

    $log = sb_insert('send_log', ['queue_id' => $qid, 'igsid' => $igsid, 'text_enc' => $textEnc, 'status' => 'sending']);
    if (!$log) {
        return 'duplicate';
    }
    // 여기서 죽으면 queue 가 sending 으로 남음 → claim_jobs 가 needs_review 처리 (재발송 안 함)
    sb_update('queue', ['id' => sb_in($queueIds)], ['status' => 'sending', 'updated_at' => iso(time())]);

    try {
        $r = http_json('POST', IG_API_BASE . '/me/messages',
            ['recipient' => ['id' => $igsid], 'message' => ['text' => mb_strcut($text, 0, 1000, 'UTF-8')]],
            ['Authorization: Bearer ' . $token]);
    } catch (HttpError $e) {
        if ($e->status === 0) {
            sb_update('send_log', ['id' => 'eq.' . $log['id']], ['error' => mb_substr($e->getMessage(), 0, 500)]);
            return 'unknown';
        }
        sb_delete('send_log', ['id' => 'eq.' . $log['id']]);
        throw $e;
    }

    $mid = $r['message_id'] ?? null;
    sb_update('send_log', ['id' => 'eq.' . $log['id']], ['status' => 'sent', 'ig_mid' => $mid]);
    sb_insert('messages', ['mid' => $mid, 'igsid' => $igsid, 'direction' => 'bot',
        'text_enc' => $textEnc, 'ts' => iso(time())], 'mid');
    return 'sent';
}
