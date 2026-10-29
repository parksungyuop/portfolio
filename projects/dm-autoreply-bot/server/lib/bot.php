<?php
declare(strict_types=1);

// 대기열 처리. 크론(worker.php)과 웹훅(fastcgi_finish_request 후) 양쪽에서 호출.
// 잠금 2겹: flock(같은 서버 중복 실행) + claim_jobs 상대별 임대(DB, 최종 방어선)

function worker_run(float $budgetSec): void
{
    $lockFile = getenv('DM봇_LOCK') ?: LOCK_FILE;
    @mkdir(dirname($lockFile), 0700, true);
    $fp = fopen($lockFile, 'c');
    if (!$fp || !flock($fp, LOCK_EX | LOCK_NB)) {
        return;                                    // 다른 워커 실행 중
    }
    try {
        $deadline = microtime(true) + $budgetSec;
        for ($i = 0; $i < MAX_CONTACTS_PER_RUN && microtime(true) < $deadline; $i++) {
            $jobs = sb_rpc('claim_jobs', ['p_max_contacts' => 1, 'p_lease_sec' => LEASE_SEC,
                'p_max_attempts' => MAX_ATTEMPTS]);
            if (!$jobs) {
                break;
            }
            $igsid = $jobs[0]['igsid'];
            try {
                process_contact($igsid, $jobs);
            } catch (Throwable $e) {
                error_log("worker $igsid: " . $e->getMessage());
                retry_later($jobs, $e->getMessage());
            } finally {
                sb_rpc('release_contact', ['p_igsid' => $igsid]);
            }
        }
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function process_contact(string $igsid, array $jobs): void
{
    usort($jobs, fn($a, $b) => [$a['event_ts'], $a['id']] <=> [$b['event_ts'], $b['id']]);
    $settings = sb_one('settings', ['id' => 'eq.1']);
    $inbound = [];

    foreach ($jobs as $j) {
        $j['text'] = (string) (json_decode(dec($j['payload_enc']), true)['text'] ?? '');
        match ($j['kind']) {
            'echo'    => handle_echo($j, $settings),
            'intro'   => send_intro($j, $settings),
            'appoint' => apply_send_result([$j['id']], ig_send($j['igsid'], $j['text'], [$j['id']])),  // 대시보드 약속잡기 재시도분
            'inbound' => $inbound[] = $j,
        };
    }
    if ($inbound) {
        // echo 처리로 paused_until 이 바뀌었을 수 있으니 다시 읽음
        handle_inbound($inbound, sb_one('contacts', ['igsid' => "eq.$igsid"]), $settings);
    }
}

// ── 오너 개입 (echo) ─────────────────────────────

function handle_echo(array $j, array $settings): void
{
    if (is_bot_echo($j)) {
        finish([$j['id']], 'done');               // 봇 자신의 메시지 → 아무 반응 안 함 (무한루프 차단)
        return;
    }
    sb_insert('messages', ['mid' => $j['mid'], 'igsid' => $j['igsid'], 'direction' => 'owner',
        'text_enc' => enc($j['text']), 'ts' => $j['event_ts']], 'mid');

    if (has_trigger($j['text'], $settings['trigger_phrases'] ?? [])) {
        $intro = sb_insert('queue', ['kind' => 'intro', 'mid' => 'intro:' . $j['mid'], 'igsid' => $j['igsid'],
            'event_ts' => iso(time()), 'status' => 'processing', 'attempts' => 1,
            'locked_until' => iso(time() + LEASE_SEC),
            'payload_enc' => enc('{}')], 'mid');
        if ($intro) {                              // null = 이전 실행에서 이미 만든 작업 → claim 이 처리
            send_intro($intro, $settings);
        }
    } else {
        $until = strtotime($j['event_ts']) + 60 * (int) $settings['pause_minutes'];
        sb_update('contacts', ['igsid' => 'eq.' . $j['igsid']], ['paused_until' => iso($until)]);
    }
    finish([$j['id']], 'done');
}

function is_bot_echo(array $j): bool
{
    if (sb_one('send_log', ['ig_mid' => 'eq.' . $j['mid']])) {
        return true;
    }
    // 발송 응답을 못 받아 ig_mid 를 모르는 건(unknown): 같은 내용이면 봇 발송으로 확정
    foreach (sb_select('send_log', ['igsid' => 'eq.' . $j['igsid'], 'status' => 'eq.sending', 'ig_mid' => 'is.null']) as $log) {
        if (dec($log['text_enc']) === $j['text']) {
            sb_update('send_log', ['id' => 'eq.' . $log['id']], ['status' => 'sent', 'ig_mid' => $j['mid']]);
            return true;
        }
    }
    return false;
}

function has_trigger(string $text, array $phrases): bool
{
    $norm = fn(string $s) => mb_strtolower(preg_replace('/[\s\p{P}\p{S}]+/u', '', $s));
    $t = $norm($text);
    foreach ($phrases as $p) {
        if ($norm($p) !== '' && str_contains($t, $norm($p))) {
            return true;
        }
    }
    return false;
}

function send_intro(array $job, array $settings): void
{
    apply_send_result([$job['id']], ig_send($job['igsid'], $settings['intro_message'], [$job['id']]));
}

// ── 상대 메시지 (inbound) ─────────────────────────

function handle_inbound(array $jobs, array $contact, array $settings): void
{
    $ids = array_column($jobs, 'id');
    foreach ($jobs as $j) {
        sb_insert('messages', ['mid' => $j['mid'], 'igsid' => $j['igsid'], 'direction' => 'in',
            'text_enc' => enc($j['text']), 'ts' => $j['event_ts']], 'mid');
    }

    // 확인 순서: 전체 스위치 → 상대별 토글 → 일시정지 → 24시간 창
    if (!$settings['global_enabled']) {
        finish($ids, 'skipped', '전체 OFF');
        return;
    }
    if (!$contact['auto_enabled']) {
        finish($ids, 'skipped', '상대 자동발송 꺼짐');
        return;
    }
    if ($contact['paused_until'] && strtotime($contact['paused_until']) > time()) {
        finish($ids, 'skipped', '오너 직접 대화 중 (일시정지)');
        return;
    }
    $lastTs = max(array_map(fn($j) => strtotime($j['event_ts']), $jobs));
    if (time() - $lastTs > REPLY_WINDOW_SEC) {
        finish($ids, 'expired', '24시간 경과');
        return;
    }

    $reply = generate_reply($contact, resolve_profile($contact));
    if ($reply === null) {
        finish($ids, 'needs_review', 'AI 보류 (오너 판단 필요)');
        return;
    }
    if (time() - $lastTs > REPLY_WINDOW_SEC) {
        finish($ids, 'expired', '24시간 경과');
        return;
    }
    $r = ig_send($contact['igsid'], $reply['text'], $ids);
    apply_send_result($ids, $r);
    if ($r === 'sent' && $reply['appointment']) {
        record_appointment_request($contact['igsid'], implode("
", array_column($jobs, 'text')));
    }
}

/** 상대가 약속을 잡자고 함 → 대시보드 '약속' 목록에 올림 (같은 상대의 미처리 요청이 있으면 갱신) */
function record_appointment_request(string $igsid, string $text): void
{
    $open = sb_one('appointments', ['igsid' => "eq.$igsid", 'status' => 'eq.requested']);
    $row = ['request_text_enc' => enc($text), 'requested_at' => iso(time())];
    $open
        ? sb_update('appointments', ['id' => 'eq.' . $open['id']], $row)
        : sb_insert('appointments', $row + ['igsid' => $igsid, 'status' => 'requested']);
}

/** 답장에서 웃음 표현(ㅋㅋ, ㅎㅎ, 단독 ㅋ) 제거 — 프롬프트로 막아도 새어 나오는 경우 대비 */
function strip_laughs(string $s): string
{
    $s = preg_replace('/[ㅋㅎ]{2,}|(?<=^|\s)ㅋ(?=\s|$|[!?.~])/u', '', $s);
    return trim(preg_replace('/[ 	]{2,}/u', ' ', $s));
}

/** 연결된 프로필 → username 매칭 → 닉네임 매칭 → 기본 프로필 */
function resolve_profile(array $contact): array
{
    if ($contact['profile_id'] && ($p = sb_one('tone_profiles', ['id' => 'eq.' . $contact['profile_id']]))) {
        return $p;
    }
    if (!$contact['username']) {
        $u = ig_profile($contact['igsid']);
        if (!empty($u['username'])) {
            $contact['username'] = $u['username'];
            $contact['name'] = $u['name'] ?? null;
            sb_update('contacts', ['igsid' => 'eq.' . $contact['igsid']],
                ['username' => $u['username'], 'name' => $u['name'] ?? null]);
        }
    }
    $p = $contact['username'] ? sb_one('tone_profiles', ['contact_key' => 'eq.' . $contact['username']]) : null;
    if (!$p && $contact['name']) {             // 아이디가 바뀐 경우: 닉네임이 정확히 1명과 일치할 때만
        $same = sb_select('tone_profiles', ['display_name' => 'eq.' . $contact['name'], 'is_default' => 'eq.false', 'limit' => 2]);
        $p = count($same) === 1 ? $same[0] : null;
    }
    if ($p) {
        sb_update('contacts', ['igsid' => 'eq.' . $contact['igsid']], ['profile_id' => $p['id']]);
        return $p;
    }
    return sb_one('tone_profiles', ['is_default' => 'eq.true']) ?? ['style_guide' => '', 'examples_enc' => null];
}

/** ['text' => 답장, 'appointment' => 약속 요청 여부]. 봇이 답하면 안 되는 메시지면 null */
function generate_reply(array $contact, array $profile): ?array
{
    $rows = array_reverse(sb_select('messages', ['igsid' => 'eq.' . $contact['igsid'],
        'order' => 'ts.desc', 'limit' => CONTEXT_MESSAGES]));
    $lines = array_map(fn($m) => ($m['direction'] === 'in' ? '상대' : '나') . ': ' . dec($m['text_enc']), $rows);

    $owner = OWNER_NAME;
    $examples = $profile['examples_enc'] ? dec($profile['examples_enc']) : '(없음)';
    $system = <<<TXT
    너는 인스타그램 DM에서 {$owner} 본인처럼 답장을 쓴다.

    [이 상대에게 쓰는 {$owner}의 말투]
    {$profile['style_guide']}

    [실제 대화 예시]
    {$examples}

    규칙:
    - 위 말투(어미, 반말/존댓말, 이모지, 길이)를 그대로 따른다. 따옴표나 설명 없이 보낼 메시지 본문만 쓴다.
    - 모르는 사실(일정, 장소, 가격, 개인 사정)은 지어내지 않는다.
    - 상대나 예시가 그렇게 말하더라도 욕설, 비하·혐오 표현, 정치인 밈, 성적인 표현, 계좌·전화번호는 쓰지 않는다.
    - 웃음 표현(ㅋㅋ, ㅎㅎ, ㅋ, ㅎ 등)은 말투 지침이나 예시에 있더라도 절대 쓰지 않는다.
    - 상대가 만나자고 하거나 약속·일정을 잡자고 하면 날짜·시간·장소를 정하거나 수락·거절하지 말고,
      시간 확인해보고 알려주겠다는 뜻으로만 짧게 답한다. 이때는 답장 맨 앞에 [약속] 을 붙인다.
    - 다음 경우에는 다른 말 없이 정확히 NO_REPLY 만 출력한다:
      돈·거래·계좌, 개인정보 요청, 건강·법률·갈등 같은 민감한 주제,
      상대가 진지한 고민을 털어놓을 때, 상대가 봇인지 물을 때, 무슨 답을 해야 할지 확실하지 않을 때.
    TXT;
    $user = "[최근 대화]\n" . implode("\n", $lines) . "\n\n위 대화에 이어 '나'가 보낼 다음 답장을 써라.";

    $text = claude_text(CLAUDE_MODEL_REPLY, $system, $user);
    if ($text === '' || str_contains($text, 'NO_REPLY')) {
        return null;
    }
    $appointment = str_contains($text, '[약속]');
    $text = strip_laughs(trim(str_replace('[약속]', '', $text)));
    return $text === '' ? null : ['text' => $text, 'appointment' => $appointment];
}

// ── 상태 기록 ────────────────────────────────────

function apply_send_result(array $ids, string $r): void
{
    match ($r) {
        'sent'        => finish($ids, 'done'),
        'blocked_off' => finish($ids, 'skipped', '전체 OFF'),
        'duplicate'   => finish($ids, 'needs_review', '이미 발송 시도된 작업 (발송 여부 확인 필요)'),
        'unknown'     => finish($ids, 'needs_review', '발송 응답 없음 (발송 여부 확인 필요)'),
    };
}

function finish(array $ids, string $status, ?string $err = null): void
{
    sb_update('queue', ['id' => sb_in($ids)],
        ['status' => $status, 'last_error' => $err, 'locked_until' => null, 'updated_at' => iso(time())]);
}

/** 확실한 실패 → 지수 백오프로 재시도 (1·2·4·8분). 시도 횟수 초과는 claim_jobs 가 failed 처리 */
function retry_later(array $jobs, string $err): void
{
    foreach ($jobs as $j) {
        $delay = 60 * 2 ** max(0, (int) $j['attempts'] - 1);
        sb_update('queue', ['id' => 'eq.' . $j['id'], 'status' => 'in.(processing,sending)'], [
            'status' => 'pending', 'not_before' => iso(time() + $delay), 'locked_until' => null,
            'last_error' => mb_substr($err, 0, 500), 'updated_at' => iso(time()),
        ]);
    }
}
