<?php
// 검증 (1)~(8) + api·daily. 실행: php server/tests/run.php
declare(strict_types=1);
require __DIR__ . '/harness.php';

$pass = 0;
$fail = 0;
function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    $ok ? $pass++ : $fail++;
    echo ($ok ? 'PASS' : 'FAIL') . "  $name" . ($ok || $detail === '' ? '' : "\n      → $detail") . "\n";
}
function last_sent(): array { $s = sent(); return end($s) ?: []; }
function count_to(string $igsid): int { return count(array_filter(sent(), fn($s) => $s['to'] === $igsid)); }

// ════════════════════════════════════════════════
echo "── 웹훅 기본\n";
reset_all();
[$c, $b] = req('GET', "http://127.0.0.1:$WEB/webhook.php?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=12345");
check('GET 검증: 올바른 토큰 → challenge 반환', $c === 200 && $b === '12345', "$c $b");
[$c] = req('GET', "http://127.0.0.1:$WEB/webhook.php?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1");
check('GET 검증: 틀린 토큰 → 403', $c === 403, (string) $c);
check('POST 서명 틀림 → 403, 적재 안 됨', webhook([inbound('x', 'hi')], 'sha256=bad') === 403
    && count(sql('select * from queue')) === 0);
$ev = inbound('x', 'hi');
check('POST 정상 → 200, 같은 mid 재전송은 1건만 적재', webhook([$ev]) === 200 && webhook([$ev]) === 200
    && count(sql('select * from queue')) === 1);
check('원문은 암호화 저장', !str_contains(json_encode(sql('select payload_enc from queue')), 'hi'));

// ════════════════════════════════════════════════
echo "── (1) 이력 없는 상대에게 기본 말투\n";
reset_all();
sql("insert into tone_profiles (is_default, style_guide) values (true, 'DEFAULT_GUIDE_MARK');
     insert into tone_profiles (contact_key, style_guide) values ('user_known', 'KNOWN_GUIDE_MARK')");
webhook([inbound('newbie', '안녕하세요')]);
ready();
worker();
$calls = claude_calls();
check('(1) 처음 보는 상대 → 기본 프로필로 답변 생성·발송',
    count($calls) === 1 && str_contains($calls[0]['system'], 'DEFAULT_GUIDE_MARK') && count_to('newbie') === 1,
    json_encode($calls, JSON_UNESCAPED_UNICODE));
webhook([inbound('known', '야 뭐해')]);
ready();
worker();
$calls = claude_calls();
check('(1-b) 이력 있는 상대(username 매칭) → 상대별 프로필',
    count($calls) === 2 && str_contains($calls[1]['system'], 'KNOWN_GUIDE_MARK'));
check('(1-c) 매칭된 프로필이 contacts.profile_id 에 저장', (bool) sql("select profile_id from contacts where igsid='known'")[0]['profile_id']);
// 아이디가 바뀐 상대: 가짜 IG 는 username=user_<id>, name=이름_<id> 를 돌려줌
sql("insert into tone_profiles (contact_key, display_name, style_guide) values ('old_id', '이름_renamed', 'NICK_GUIDE_MARK'),
     ('dup1', '이름_dup', 'X'), ('dup2', '이름_dup', 'Y')");
webhook([inbound('renamed', 'ㅎㅇ'), inbound('dup', 'ㅎㅇ')]);
ready();
worker();
$last2 = array_slice(array_column(claude_calls(), 'system'), 2);
$has = fn(string $mark) => count(array_filter($last2, fn($x) => str_contains($x, $mark)));
check('(1-d) 아이디 바뀐 상대 → 닉네임으로 매칭', count($last2) === 2 && $has('NICK_GUIDE_MARK') === 1);
check('(1-e) 닉네임이 여러 프로필과 겹치면 기본 프로필', $has('DEFAULT_GUIDE_MARK') === 1);

// ════════════════════════════════════════════════
echo "── (2) 전체 OFF 시 발송 0건\n";
reset_all();
sql("update settings set global_enabled = false");
$evs = [];
foreach (range(1, 5) as $i) {
    $evs[] = inbound("off$i", "메시지 $i");
}
$evs[] = echo_ev('off1', '사실 이거 홍길동 봇이야');
webhook($evs);
ready();
worker();
$st = statuses();
check('(2) 전체 OFF: 상대 메시지 5건 + 트리거 문구 → 발송 0건', count(sent()) === 0, json_encode(sent()));
check('(2-b) 상대 메시지는 skipped, Claude 호출도 0', count(array_filter($st, fn($s) => $s === 'skipped')) >= 5
    && count(claude_calls()) === 0, json_encode($st));
check('(2-c) 자기소개 시도는 blocked_off 로 기록', count(sql("select * from send_log where status='blocked_off'")) === 1);

// ════════════════════════════════════════════════
echo "── (3) 트리거 문구 → 자기소개\n";
reset_all();
webhook([echo_ev('t1', '사실 이거 홍길동 봇이야!! ㅋㅋ')]);
ready();
worker();
$intro = sql("select intro_message from settings")[0]['intro_message'];
$s = sent();
check('(3) 트리거 감지 → 자기소개 1건 발송', count($s) === 1 && $s[0]['to'] === 't1' && $s[0]['text'] === $intro,
    json_encode($s, JSON_UNESCAPED_UNICODE));
check('(3-b) 트리거는 일시정지를 걸지 않음', sql("select paused_until from contacts where igsid='t1'")[0]['paused_until'] === null);
// 자기소개 메시지의 echo 가 돌아와도 반응 없음
webhook([echo_ev('t1', $intro, 'botmid_1')]);
ready();
worker();
check('(3-c) 자기소개 echo 에는 반응 없음', count(sent()) === 1);

// ════════════════════════════════════════════════
echo "── (4) 오너 직접 답장 → 일시정지\n";
reset_all();
webhook([echo_ev('p1', '어 나 지금 가는 중')]);
webhook([inbound('p1', '오키 빨리 와')]);
ready();
worker();
$pu = sql("select extract(epoch from paused_until - now())::int s from contacts where igsid='p1'")[0]['s'];
check('(4) 오너 직접 답장 후 상대 메시지 → 발송 0건', count(sent()) === 0 && count(claude_calls()) === 0);
check('(4-b) 일시정지 30분 설정', $pu > 29 * 60 && $pu <= 30 * 60, "남은 초: $pu");
sql("update contacts set paused_until = now() - interval '1 second' where igsid='p1'");
webhook([inbound('p1', '어디야?')]);
ready();
worker();
check('(4-c) 일시정지 끝나면 다시 자동답변', count_to('p1') === 1);

// ════════════════════════════════════════════════
echo "── (5) 24시간 초과 미발송\n";
reset_all();
webhook([inbound('old', '어제 그거 봤어?', 25 * 3600)]);
ready();
worker();
check('(5) 25시간 전 메시지 → 발송 0건, expired', count(sent()) === 0 && statuses() === [array_key_first(statuses()) => 'expired'],
    json_encode(statuses()));
webhook([inbound('edge', '경계', 23 * 3600)]);
ready();
worker();
check('(5-b) 23시간 전 메시지 → 발송', count_to('edge') === 1);

// ════════════════════════════════════════════════
echo "── (6) echo 무한루프 없음\n";
reset_all();
webhook([inbound('loop', 'ㅎㅇ')]);
ready();
worker();
$botMid = sql("select ig_mid from send_log where status='sent'")[0]['ig_mid'] ?? '';
for ($i = 0; $i < 10; $i++) {
    webhook([echo_ev('loop', '응 알겠어', $botMid)]);
    ready();
    worker();
}
check('(6) 봇 발송 echo 10회 → 추가 발송 0, Claude 추가 호출 0', count(sent()) === 1 && count(claude_calls()) === 1);
check('(6-b) 봇 echo 는 일시정지를 걸지 않음', sql("select paused_until from contacts where igsid='loop'")[0]['paused_until'] === null);
// 응답 유실로 ig_mid 를 모르는 발송의 echo 도 봇으로 인식
// 인스타 응답을 기다리는 중 워커를 죽여서 '응답 유실' 상황을 만든다
reset_all();
fake('/_test/config', ['igDelayMs' => 4000]);
webhook([inbound('amb', '야')]);
ready();
[$p] = spawn(worker_cmd(), $env, null, "$tmp/bg.log");
usleep(2_000_000);
proc_terminate($p);
proc_close($p);
fake('/_test/config', ['igDelayMs' => 0]);
webhook([echo_ev('amb', '응 알겠어', 'real_mid_from_ig')]);
expire_leases();
ready();
worker();
check('(6-c) 발송 응답 유실 건의 echo 도 봇으로 인식 (일시정지 안 걸림, 재발송 없음)',
    sql("select paused_until from contacts where igsid='amb'")[0]['paused_until'] === null && count_to('amb') === 1,
    json_encode(sql("select * from contacts where igsid='amb'")));

// ════════════════════════════════════════════════
echo "── (7) 크론 중복 실행 시 이중 발송 없음\n";
reset_all();
fake('/_test/config', ['claudeDelayMs' => 150]);
$evs = [];
foreach (range(1, 20) as $i) {
    $evs[] = inbound("c$i", "동시성 $i");
}
webhook($evs);
ready();
// flock 은 일부러 우회 (서로 다른 잠금 파일) → DB 임대만으로 막히는지 확인
$procs = [];
foreach ([1, 2, 3] as $k) {
    $procs[] = spawn(worker_cmd(), ['DM봇_LOCK' => "$tmp/lock$k"] + $env, null, "$tmp/bg.log")[0];
}
foreach ($procs as $p) {
    proc_close($p);
}
worker();
$per = array_count_values(array_column(sent(), 'to'));
check('(7) 워커 3개 동시 실행 × 20명 → 정확히 1인 1건',
    count($per) === 20 && max($per) === 1, json_encode($per));
check('(7-b) 같은 잠금 파일이면 두 번째 워커는 즉시 종료', (function () use ($env, $tmp) {
    $fp = fopen("$tmp/worker.lock", 'c');
    flock($fp, LOCK_EX);
    $t = microtime(true);
    worker();
    $dt = microtime(true) - $t;
    flock($fp, LOCK_UN);
    return $dt < 3;
})());
fake('/_test/config', ['claudeDelayMs' => 0]);

// ════════════════════════════════════════════════
echo "── (8) 실행 중단돼도 유실 없음\n";
reset_all();
fake('/_test/config', ['claudeDelayMs' => 3000]);
webhook([inbound('k1', 'a'), inbound('k2', 'b'), inbound('k3', 'c')]);
ready();
[$p] = spawn(worker_cmd(), $env, null, "$tmp/bg.log");
usleep(1_500_000);
proc_terminate($p);                                 // Claude 응답 기다리는 중 강제 종료 (= 실행 시간 초과)
proc_close($p);
check('(8) 강제 종료 시점까지 발송 0', count(sent()) === 0);
fake('/_test/config', ['claudeDelayMs' => 0]);
worker();
// 워커는 상대를 1명씩 가져감 → 죽은 워커가 잡고 있던 건 k1 뿐, k2·k3 는 다른 워커가 바로 처리해도 정상
check('(8-b) 죽은 워커가 잡고 있던 상대(k1)는 임대 만료 전 손대지 않음, 나머지는 처리',
    count_to('k1') === 0 && count_to('k2') === 1 && count_to('k3') === 1, json_encode(sent()));
expire_leases();
worker();
$per = array_count_values(array_column(sent(), 'to'));
ksort($per);
check('(8-c) 임대 만료 후 3건 모두 1회씩 발송, 큐 전부 done',
    $per === ['k1' => 1, 'k2' => 1, 'k3' => 1] && array_unique(array_values(statuses())) === ['done'],
    json_encode([$per, statuses()]));

reset_all();
fake('/_test/config', ['igDelayMs' => 3000]);
webhook([inbound('s1', 'x')]);
ready();
[$p] = spawn(worker_cmd(), $env, null, "$tmp/bg.log");
usleep(1_500_000);
proc_terminate($p);                                 // 인스타가 이미 보냈는데 응답 받기 전에 종료
proc_close($p);
fake('/_test/config', ['igDelayMs' => 0]);
expire_leases();
worker();
check('(8-d) 발송 도중 종료 → 재발송 없이 needs_review (최대 1회 발송)',
    count_to('s1') === 1 && array_values(statuses()) === ['needs_review'], json_encode([sent(), statuses()]));

// ── 재시도 ──
reset_all();
fake('/_test/config', ['claudeFail' => true]);
webhook([inbound('r1', 'x')]);
ready();
worker();
$row = sql("select status, attempts, extract(epoch from not_before - now())::int d from queue")[0];
check('재시도: API 실패 → pending, 1분 뒤 재시도 예약', $row['status'] === 'pending' && $row['attempts'] === 1
    && $row['d'] > 50 && $row['d'] <= 60, json_encode($row));
fake('/_test/config', ['claudeFail' => false]);
ready();
worker();
check('재시도: 복구 후 정상 발송', count_to('r1') === 1);
fake('/_test/config', ['igFail' => true]);
webhook([inbound('r2', 'x')]);
ready();
worker();
check('재시도: 인스타 오류 응답 → 재시도 가능 상태 (send_log 남지 않음)',
    statuses()[array_key_last(statuses())] === 'pending' && count(sql("select * from send_log where igsid='r2'")) === 0);
fake('/_test/config', ['igFail' => false]);
ready();
worker();
check('재시도: 인스타 복구 후 1회 발송', count_to('r2') === 2);   // 실패 시도도 가짜 서버엔 기록됨(1) + 성공(1)

// ════════════════════════════════════════════════
echo "── 대시보드 API (api.php)\n";
function api(string $method, string $action, ?string $token, array $body = []): array
{
    global $WEB;
    [$c, $r] = req($method, "http://127.0.0.1:$WEB/api.php?action=$action", $method === 'POST' ? json_encode($body) : null,
        $token ? ["Authorization: Bearer $token"] : []);
    return [$c, json_decode($r, true)];
}
reset_all();
check('api: 토큰 없음 → 401', api('GET', 'attention', null)[0] === 401);
check('api: 잘못된 토큰 → 401', api('GET', 'attention', 'garbage')[0] === 401);
check('api: 오너 아닌 로그인 사용자 → 403', api('GET', 'attention', 'other-token')[0] === 403);
webhook([inbound('att', '어제 그 돈 언제 줄 거야', 25 * 3600), inbound('h1', '안녕')]);
ready();
worker();
[$c, $att] = api('GET', 'attention', 'owner-token');
check('api: 주의 목록에 24시간 초과 건이 복호화돼서 나옴', $c === 200 && count($att) === 1
    && $att[0]['text'] === '어제 그 돈 언제 줄 거야' && $att[0]['status'] === 'expired' && $att[0]['username'] === null,
    json_encode($att, JSON_UNESCAPED_UNICODE));
[$c, $hist] = api('GET', 'history', 'owner-token');
check('api: 발송 이력 복호화 + 상대 아이디', $c === 200 && count($hist) === 1 && $hist[0]['text'] === '응 알겠어'
    && $hist[0]['status'] === 'sent' && $hist[0]['username'] === 'user_h1', json_encode($hist, JSON_UNESCAPED_UNICODE));
[$c, $d] = api('POST', 'dismiss', 'owner-token', ['id' => $att[0]['id'] ?? 0]);
check('api: 확인 처리 → 주의 목록에서 빠짐', ($d['ok'] ?? false) === true && api('GET', 'attention', 'owner-token')[1] === []);
fake('/_test/config', ['claudeText' => '- 인사함']);
[$c, $sm] = api('POST', 'summarize', 'owner-token', ['igsid' => 'h1']);
check('api: 수동 요약 → contacts.summary 저장', $c === 200 && ($sm['summary'] ?? '') === '- 인사함'
    && sql("select summary from contacts where igsid='h1'")[0]['summary'] === '- 인사함');
check('api: 이상한 igsid 거부', api('POST', 'summarize', 'owner-token', ['igsid' => "x'; drop"])[0] === 400);
sql("update settings set global_enabled = false");
$before = count(sent());
api('GET', 'attention', 'owner-token');
api('GET', 'history', 'owner-token');
api('POST', 'summarize', 'owner-token', ['igsid' => 'h1']);
api('POST', 'dismiss', 'owner-token', ['id' => 1]);
$ap = api('POST', 'appoint', 'owner-token', ['igsid' => 'h1', 'date' => date('Y-m-d', time() + 86400 * 3), 'send' => true]);
check('(2-d) 전체 OFF 상태에서 api 전 경로(약속잡기 포함) 호출 → 발송 0건', count(sent()) === $before && $ap[0] === 409,
    json_encode($ap, JSON_UNESCAPED_UNICODE));
fake('/_test/config', ['claudeText' => '응 알겠어']);

// ════════════════════════════════════════════════
echo "── 일일 작업 (daily.php)\n";
function daily(): void
{
    global $env, $root;
    [$p, $pipes] = spawn([PHP_BINARY, "$root/cron/daily.php"], $env);
    stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    proc_close($p);
}
reset_all();
file_put_contents("$tmp/token.json", json_encode(['access_token' => 'OLD', 'expires_at' => time() + 86400 * 30]));
daily();
check('토큰: 만료 30일 남음 → 갱신 안 함', count(fake('/_test/state')['refresh']) === 0);
file_put_contents("$tmp/token.json", json_encode(['access_token' => 'OLD', 'expires_at' => time() + 86400 * 5]));
daily();
$tok = json_decode(file_get_contents("$tmp/token.json"), true);
$exp = sql("select extract(epoch from token_expires_at)::bigint e, token_error from settings")[0];
check('토큰: 만료 5일 남음 → 갱신, 파일·settings 반영', fake('/_test/state')['refresh'] === ['OLD']
    && $tok['access_token'] === 'NEW_TOKEN' && abs($exp['e'] - (time() + 5184000)) < 60 && $exp['token_error'] === null,
    json_encode([$tok, $exp]));
fake('/_test/config', ['refreshFail' => true]);
file_put_contents("$tmp/token.json", json_encode(['access_token' => 'KEEP', 'expires_at' => time() + 86400]));
daily();
check('토큰: 갱신 실패 → 기존 토큰 유지, 대시보드용 token_error 기록',
    json_decode(file_get_contents("$tmp/token.json"), true)['access_token'] === 'KEEP'
    && str_contains((string) sql("select token_error from settings")[0]['token_error'], 'fake refresh fail'));
fake('/_test/config', ['refreshFail' => false]);
file_put_contents("$tmp/token.json", json_encode(['access_token' => 'TEST', 'expires_at' => time() + 86400 * 50]));

reset_all();
webhook([inbound('d1', '하이'), inbound('d2', '하이')]);
ready();
worker();
sql("update contacts set summary = 'old', summary_at = now() + interval '1 minute' where igsid = 'd2'");
$calls = count(claude_calls());
daily();
check('요약: 새 대화 있는 상대만 요약', count(claude_calls()) === $calls + 1
    && sql("select summary from contacts where igsid='d1'")[0]['summary'] !== null
    && sql("select summary from contacts where igsid='d2'")[0]['summary'] === 'old');

sql("update queue set created_at = now() - interval '31 days' where igsid = 'd1';
     update messages set ts = now() - interval '91 days' where igsid = 'd1';
     update send_log set created_at = now() - interval '181 days' where igsid = 'd1';
     insert into queue (kind, mid, igsid, event_ts, status, created_at) values
       ('inbound', 'rv_old', 'd2', now(), 'needs_review', now() - interval '31 days')");
daily();
check('정리: 기간 지난 큐·원문·이력 삭제, 최근 것·판단 필요 건은 유지',
    count(sql("select * from queue where igsid='d1'")) === 0 && count(sql("select * from messages where igsid='d1'")) === 0
    && count(sql("select * from send_log where igsid='d1'")) === 0 && count(sql("select * from queue where igsid='d2'")) === 2
    && count(sql("select * from messages where igsid='d2'")) === 2);

// ════════════════════════════════════════════════
echo "── 게시물·웃음·약속\n";
reset_all();
$p1 = inbound('pst', 'x');
unset($p1['message']['text']);
$p1['message']['attachments'] = [['type' => 'share', 'payload' => ['url' => 'https://www.instagram.com/p/ABC/']]];
$p2 = inbound('pst', 'https://www.instagram.com/p/ABC/');
$p3 = inbound('pst', '이거 봐');
$p3['message']['attachments'] = [['type' => 'ig_reel']];
webhook([$p1, $p2, $p3]);
check('게시물·릴스 공유, 링크만 보낸 메시지 → 적재 안 함 (답장 안 함)', count(sql('select * from queue')) === 0);

$e = echo_ev('pst2', 'x');
unset($e['message']['text']);
$e['message']['attachments'] = [['type' => 'image']];
webhook([$e]);
webhook([inbound('pst2', '안녕')]);
ready();
worker();
check('오너가 게시물을 보내도 오너 개입으로 보고 일시정지', count_to('pst2') === 0
    && sql("select paused_until from contacts where igsid='pst2'")[0]['paused_until'] !== null);

fake('/_test/config', ['claudeText' => 'ㅋㅋㅋ 응 먹었어 ㅎㅎ']);
webhook([inbound('lol', '밥 먹었어?')]);
ready();
worker();
$s = sent();
check('답장에서 ㅋㅋ·ㅎㅎ 제거', ($s[0]['text'] ?? '') === '응 먹었어', json_encode($s, JSON_UNESCAPED_UNICODE));
check('프롬프트에 웃음 금지·약속 회피 규칙 포함', str_contains(claude_calls()[0]['system'], 'ㅋㅋ, ㅎㅎ')
    && str_contains(claude_calls()[0]['system'], '[약속]'));

fake('/_test/config', ['claudeText' => '[약속] 시간 확인해보고 알려줄게ㅋㅋ']);
webhook([inbound('apt', '이번 주말에 볼래?')]);
ready();
worker();
$apts = api('GET', 'appointments', 'owner-token')[1];
check('약속 요청 → 회피 답장 발송 (태그·웃음 제거)', last_sent()['text'] === '시간 확인해보고 알려줄게', json_encode(sent(), JSON_UNESCAPED_UNICODE));
check('약속 요청 → 대시보드 약속 목록에 요청 원문과 함께 기록', count($apts) === 1 && $apts[0]['status'] === 'requested'
    && $apts[0]['request_text'] === '이번 주말에 볼래?' && $apts[0]['can_send'] === true, json_encode($apts, JSON_UNESCAPED_UNICODE));
webhook([inbound('apt', '아니면 다음 주?')]);
ready();
worker();
check('같은 상대가 또 약속 요청하면 새 행 대신 기존 요청 갱신', count(api('GET', 'appointments', 'owner-token')[1]) === 1);

$future = date('Y-m-d', time() + 86400 * 10);
$n = count(sent());
[$c, $r] = api('POST', 'appoint', 'owner-token', ['igsid' => 'apt', 'date' => $future, 'send' => true, 'id' => $apts[0]['id']]);
$want = date('Y년 n월 j일', strtotime($future)) . '에 볼까?';
check('약속잡기 → 날짜 메시지 발송, 상태 proposed', $c === 200 && count(sent()) === $n + 1 && last_sent()['text'] === $want
    && sql("select status, date::text d from appointments where igsid='apt'")[0] === ['status' => 'proposed', 'd' => $future],
    json_encode([$c, $r, sent()], JSON_UNESCAPED_UNICODE));
webhook([echo_ev('apt', $want, 'botmid_' . count(sent()))]);
ready();
worker();
check('약속잡기 메시지의 echo 는 봇 발송으로 인식 (일시정지 안 됨)',
    sql("select paused_until from contacts where igsid='apt'")[0]['paused_until'] === null);

[$c] = api('POST', 'appoint', 'owner-token', ['igsid' => 'lol', 'date' => $future, 'send' => false]);
check('요청 없던 상대도 직접 추가 가능 (보내지 않고 추가 → planned)', $c === 200
    && sql("select status from appointments where igsid='lol'")[0]['status'] === 'planned');

sql("update contacts set last_user_msg_at = now() - interval '25 hours' where igsid = 'lol'");
$n = count(sent());
[$c, $r] = api('POST', 'appoint', 'owner-token', ['igsid' => 'lol', 'date' => $future, 'send' => true]);
check('24시간 지난 상대 → 409, 발송 안 함', $c === 409 && count(sent()) === $n, json_encode($r, JSON_UNESCAPED_UNICODE));
check('지난 날짜·잘못된 형식 → 400', api('POST', 'appoint', 'owner-token', ['igsid' => 'apt', 'date' => '2020-01-01', 'send' => false])[0] === 400
    && api('POST', 'appoint', 'owner-token', ['igsid' => 'apt', 'date' => '2026.13.40', 'send' => false])[0] === 400);
$id = sql("select id from appointments where igsid='apt'")[0]['id'];
check('약속 완료 처리', api('POST', 'appointment_status', 'owner-token', ['id' => $id, 'status' => 'done'])[1]['ok'] === true
    && sql("select status from appointments where id=$id")[0]['status'] === 'done');
fake('/_test/config', ['claudeText' => '응 알겠어']);

echo "\n결과: PASS $pass / FAIL $fail\n";
exit($fail ? 1 : 0);
