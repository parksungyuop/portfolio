<?php
declare(strict_types=1);

// 대시보드 전용 API: 복호화가 필요한 조회, 수동 요약, 약속잡기.
// 발송은 약속잡기(appoint) 한 곳뿐이며 반드시 ig_send() 경유 (전체 OFF·24시간 창 확인).
// 인증: 대시보드 로그인 JWT → Supabase /auth/v1/user 로 검증 → OWNER_UUID 일치만 허용

/** 요청은 올바르지만 지금 처리할 수 없음 (전체 OFF, 24시간 경과 등) → 409 */
final class ApiConflict extends RuntimeException
{
}

function api_main(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    try {
        $user = api_user();
        if (!$user) {
            api_out(401, ['error' => '로그인 필요']);
            return;
        }
        if (OWNER_UUID === '' || !hash_equals(OWNER_UUID, (string) ($user['id'] ?? ''))) {
            api_out(403, ['error' => '권한 없음']);
            return;
        }
        $in = json_decode((string) file_get_contents('php://input'), true) ?: [];
        $method = $_SERVER['REQUEST_METHOD'];
        $action = (string) ($_GET['action'] ?? '');

        match ("$method $action") {
            'GET attention'  => api_out(200, api_attention()),
            'POST dismiss'   => api_out(200, api_dismiss((int) ($in['id'] ?? 0))),
            'GET history'    => api_out(200, api_history(max(0, (int) ($_GET['offset'] ?? 0)))),
            'POST summarize' => api_out(200, ['summary' => summarize_contact(api_igsid($in['igsid'] ?? ''))]),
            'GET appointments'        => api_out(200, api_appointments()),
            'POST appoint'            => api_out(200, api_appoint($in)),
            'POST appointment_status' => api_out(200, api_appointment_status($in)),
            default          => api_out(404, ['error' => '알 수 없는 요청']),
        };
    } catch (InvalidArgumentException $e) {
        api_out(400, ['error' => $e->getMessage()]);
    } catch (ApiConflict $e) {
        api_out(409, ['error' => $e->getMessage()]);
    } catch (Throwable $e) {
        error_log('api: ' . $e->getMessage());
        api_out(500, ['error' => '서버 오류']);
    }
}

function api_out(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
}

function api_user(): ?array
{
    $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) {
        return null;
    }
    try {
        return http_json('GET', rtrim(SUPABASE_URL, '/') . '/auth/v1/user', null,
            ['apikey: ' . SUPABASE_SERVICE_KEY, 'Authorization: Bearer ' . $m[1]], 10);
    } catch (HttpError $e) {
        if ($e->status === 401 || $e->status === 403) {
            return null;
        }
        throw $e;
    }
}

function api_igsid(mixed $v): string
{
    $s = (string) $v;
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $s)) {
        throw new InvalidArgumentException('igsid 형식 오류');
    }
    return $s;
}

function contact_names(array $igsids): array
{
    if (!$igsids) {
        return [];
    }
    $rows = sb_select('contacts', ['igsid' => sb_in(array_unique($igsids)), 'select' => 'igsid,username,name']);
    return array_column($rows, null, 'igsid');
}

/** 대시보드 '주의 필요': 24시간 초과 / 판단 필요 / 실패 */
function api_attention(): array
{
    $rows = sb_select('queue', ['status' => 'in.(expired,needs_review,failed)', 'kind' => 'neq.echo',
        'order' => 'created_at.desc', 'limit' => 100]);
    $names = contact_names(array_column($rows, 'igsid'));
    return array_map(fn($q) => [
        'id' => $q['id'], 'igsid' => $q['igsid'], 'status' => $q['status'], 'kind' => $q['kind'],
        'username' => $names[$q['igsid']]['username'] ?? null, 'name' => $names[$q['igsid']]['name'] ?? null,
        'text' => $q['kind'] === 'intro' ? '(자기소개)' : (string) (json_decode(dec($q['payload_enc']), true)['text'] ?? ''),
        'reason' => $q['last_error'], 'event_ts' => $q['event_ts'],
    ], $rows);
}

function api_dismiss(int $id): array
{
    $rows = sb_update('queue', ['id' => "eq.$id", 'status' => 'in.(expired,needs_review,failed)'],
        ['status' => 'done', 'last_error' => '오너 확인함', 'updated_at' => iso(time())]);
    return ['ok' => count($rows) === 1];
}

function api_history(int $offset): array
{
    $rows = sb_select('send_log', ['order' => 'created_at.desc', 'limit' => 50, 'offset' => $offset]);
    $names = contact_names(array_column($rows, 'igsid'));
    return array_map(fn($l) => [
        'id' => $l['id'], 'igsid' => $l['igsid'], 'status' => $l['status'], 'created_at' => $l['created_at'],
        'username' => $names[$l['igsid']]['username'] ?? null, 'name' => $names[$l['igsid']]['name'] ?? null,
        'text' => dec($l['text_enc']), 'error' => $l['error'],
    ], $rows);
}

// ── 약속 ─────────────────────────────────────────

function korean_date(string $ymd): string
{
    [$y, $m, $d] = array_map('intval', explode('-', $ymd));
    return "{$y}년 {$m}월 {$d}일";
}

function api_appointments(): array
{
    $rows = sb_select('appointments', ['order' => 'created_at.desc', 'limit' => 200]);
    $ids = array_unique(array_column($rows, 'igsid'));
    $contacts = $ids ? array_column(sb_select('contacts', ['igsid' => sb_in($ids),
        'select' => 'igsid,username,name,last_user_msg_at']), null, 'igsid') : [];
    return array_map(function ($a) use ($contacts) {
        $c = $contacts[$a['igsid']] ?? [];
        $last = $c['last_user_msg_at'] ?? null;
        return [
            'id' => $a['id'], 'igsid' => $a['igsid'], 'status' => $a['status'],
            'date' => $a['date'] ? substr((string) $a['date'], 0, 10) : null,   // 'YYYY-MM-DD'
            'username' => $c['username'] ?? null, 'name' => $c['name'] ?? null,
            'request_text' => dec($a['request_text_enc']), 'requested_at' => $a['requested_at'],
            'sent_at' => $a['sent_at'], 'created_at' => $a['created_at'],
            'can_send' => $last !== null && time() - strtotime($last) <= REPLY_WINDOW_SEC,   // 인스타 24시간 창
        ];
    }, $rows);
}

/**
 * 약속잡기: {igsid, date: 'YYYY-MM-DD', send: bool, id?: 기존 약속 행}
 * send=true  → settings.appointment_message 의 {date} 를 날짜로 바꿔 상대에게 발송 → proposed
 * send=false → 발송 없이 목록에만 추가/수정 → planned (상대가 요청하지 않았어도 오너가 직접 추가 가능)
 */
function api_appoint(array $in): array
{
    $igsid = api_igsid($in['igsid'] ?? '');
    $date = (string) ($in['date'] ?? '');
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) {
        throw new InvalidArgumentException('날짜 형식 오류 (YYYY-MM-DD)');
    }
    if ($date < date('Y-m-d')) {
        throw new InvalidArgumentException('지난 날짜는 고를 수 없어요');
    }
    $contact = sb_one('contacts', ['igsid' => "eq.$igsid"]);
    if (!$contact) {
        throw new InvalidArgumentException('없는 상대');
    }
    $id = isset($in['id']) ? (int) $in['id'] : null;
    $text = null;
    $row = ['date' => $date];

    if (!empty($in['send'])) {
        $s = sb_one('settings', ['id' => 'eq.1']);
        if (!$s['global_enabled']) {
            throw new ApiConflict('전체 자동답변이 꺼져 있어 보내지 않았어요. 메시지 없이 목록에만 추가하려면 "보내지 않고 추가"를 쓰세요.');
        }
        $last = $contact['last_user_msg_at'];
        if (!$last || time() - strtotime($last) > REPLY_WINDOW_SEC) {
            throw new ApiConflict('상대의 마지막 메시지가 24시간이 지나 인스타 정책상 봇이 보낼 수 없어요. 인스타 앱에서 직접 보내세요.');
        }
        $text = str_replace('{date}', korean_date($date), $s['appointment_message']);
        $job = sb_insert('queue', ['kind' => 'appoint', 'mid' => 'appoint:' . bin2hex(random_bytes(8)),
            'igsid' => $igsid, 'payload_enc' => enc(json_encode(['text' => $text], JSON_UNESCAPED_UNICODE)),
            'event_ts' => iso(time()), 'status' => 'processing', 'attempts' => 1,
            'locked_until' => iso(time() + LEASE_SEC)]);
        $r = ig_send($igsid, $text, [$job['id']]);
        apply_send_result([$job['id']], $r);
        if ($r !== 'sent') {
            throw new ApiConflict("발송되지 않았어요 ($r). 대시보드 '주의 필요'를 확인하세요.");
        }
        $row += ['status' => 'proposed', 'sent_at' => iso(time())];
    } else {
        $row += ['status' => 'planned'];
    }

    $saved = $id
        ? (sb_update('appointments', ['id' => "eq.$id"], $row)[0] ?? null)
        : sb_insert('appointments', $row + ['igsid' => $igsid]);
    return ['ok' => true, 'text' => $text, 'id' => $saved['id'] ?? null];
}

function api_appointment_status(array $in): array
{
    $status = (string) ($in['status'] ?? '');
    if (!in_array($status, ['done', 'cancelled'], true)) {
        throw new InvalidArgumentException('status 는 done 또는 cancelled');
    }
    $rows = sb_update('appointments', ['id' => 'eq.' . (int) ($in['id'] ?? 0)], ['status' => $status]);
    return ['ok' => count($rows) === 1];
}
