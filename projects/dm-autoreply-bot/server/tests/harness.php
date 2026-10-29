<?php
// 테스트·로컬 개발 공용: 가짜 서버(supabase/test/fake_server.mjs, PGlite) + php -S(server/public) 기동 + 도우미
declare(strict_types=1);

$root = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/dmbot_test_' . getmypid();
@mkdir($tmp, 0700, true);
$FAKE ??= 18787;
$WEB ??= 18788;
$SECRET = 'test_secret';

file_put_contents("$tmp/token.json", json_encode(['access_token' => 'TEST', 'expires_at' => time() + 86400 * 50]));
file_put_contents("$tmp/config.php", '<?php
define("OWNER_NAME", "홍길동");
define("SUPABASE_URL", "http://127.0.0.1:' . $FAKE . '");
define("SUPABASE_SERVICE_KEY", "x");
define("OWNER_UUID", "11111111-1111-1111-1111-111111111111");
define("IG_APP_SECRET", "' . $SECRET . '");
define("IG_VERIFY_TOKEN", "verify_me");
define("IG_API_BASE", "http://127.0.0.1:' . $FAKE . '/ig");
define("IG_TOKEN_FILE", ' . var_export("$tmp/token.json", true) . ');
define("CLAUDE_API_URL", "http://127.0.0.1:' . $FAKE . '/claude");
define("CLAUDE_API_KEY", "x");
define("CLAUDE_MODEL_REPLY", "m");
define("CLAUDE_MODEL_SUMMARY", "m");
define("ENC_KEY_B64", "' . base64_encode(random_bytes(32)) . '");
define("LOCK_FILE", ' . var_export("$tmp/worker.lock", true) . ');
define("WORKER_BUDGET_SEC", 30);
define("WEBHOOK_BUDGET_SEC", 5);
define("MAX_CONTACTS_PER_RUN", 10);
define("LEASE_SEC", 120);
define("MAX_ATTEMPTS", 5);
define("REPLY_WINDOW_SEC", 24 * 3600 - 300);
define("CONTEXT_MESSAGES", 20);
');
$env = getenv() + ['DM봇_CONFIG' => "$tmp/config.php", 'DM봇_HOME' => $root];
$env['DM봇_CONFIG'] = "$tmp/config.php";
$env['DM봇_HOME'] = $root;

// ── 프로세스 기동 ──
// $log 지정 시 출력은 파일로 (읽지 않는 파이프는 버퍼가 차면 자식 프로세스가 멈춤)
function spawn(array $cmd, array $env, ?string $cwd = null, ?string $log = null)
{
    $out = $log ? ['file', $log, 'a'] : ['pipe', 'w'];
    $p = proc_open($cmd, [0 => ['pipe', 'r'], 1 => $out, 2 => $out], $pipes, $cwd, $env);
    if (!$p) {
        throw new RuntimeException('spawn 실패: ' . implode(' ', $cmd));
    }
    return [$p, $pipes];
}

[$fakeProc, $fakePipes] = spawn(['node', dirname($root) . '/supabase/test/fake_server.mjs', (string) $FAKE], $env,
    dirname($root) . '/supabase/test');
$line = fgets($fakePipes[1]);
if (!str_starts_with((string) $line, 'READY')) {
    fwrite(STDERR, "가짜 서버 시작 실패: $line " . stream_get_contents($fakePipes[2]));
    exit(1);
}
fclose($fakePipes[1]);                              // READY 이후 출력 없음
$DOCROOT ??= "$root/public";
[$webProc] = spawn([PHP_BINARY, '-S', "127.0.0.1:$WEB", '-t', $DOCROOT], $env, null, "$tmp/web.log");
usleep(500_000);

register_shutdown_function(function () use ($fakeProc, $webProc, $tmp) {
    proc_terminate($fakeProc);
    proc_terminate($webProc);
    array_map('unlink', glob("$tmp/*") ?: []);
    @rmdir($tmp);
});

// ── 도우미 ──
function req(string $method, string $url, ?string $body = null, array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers), CURLOPT_TIMEOUT => 60]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $res = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, $res];
}
function fake(string $path, array $body = []): mixed
{
    global $FAKE;
    [, $r] = req('POST', "http://127.0.0.1:$FAKE$path", json_encode($body, JSON_UNESCAPED_UNICODE));
    return json_decode($r, true);
}
function sql(string $q): array { return fake('/_test/sql', ['sql' => $q]); }
function sent(): array { return fake('/_test/state')['sent']; }
function claude_calls(): array { return fake('/_test/state')['claude']; }
function ready(): void { sql("update queue set not_before = now() - interval '1 second' where status = 'pending'"); }
function expire_leases(): void
{
    sql("update contacts set lease_until = now() - interval '1 second';
         update queue set locked_until = now() - interval '1 second' where locked_until is not null");
}

$seq = 0;
function inbound(string $igsid, string $text, int $agoSec = 0): array
{
    global $seq;
    return ['sender' => ['id' => $igsid], 'recipient' => ['id' => 'ME'], 'timestamp' => (time() - $agoSec) * 1000,
        'message' => ['mid' => 'in_' . (++$seq), 'text' => $text]];
}
function echo_ev(string $igsid, string $text, ?string $mid = null): array
{
    global $seq;
    return ['sender' => ['id' => 'ME'], 'recipient' => ['id' => $igsid], 'timestamp' => time() * 1000,
        'message' => ['mid' => $mid ?? 'echo_' . (++$seq), 'text' => $text, 'is_echo' => true]];
}
function webhook(array $events, ?string $sig = null): int
{
    global $WEB, $SECRET;
    $body = json_encode(['object' => 'instagram', 'entry' => [['id' => 'ME', 'time' => time(), 'messaging' => $events]]],
        JSON_UNESCAPED_UNICODE);
    [$code] = req('POST', "http://127.0.0.1:$WEB/webhook.php", $body,
        ['X-Hub-Signature-256: ' . ($sig ?? 'sha256=' . hash_hmac('sha256', $body, $SECRET))]);
    return $code;
}
function worker_cmd(): array { global $root; return [PHP_BINARY, "$root/cron/worker.php"]; }
function worker(array $extraEnv = []): void
{
    global $env;
    [$p, $pipes] = spawn(worker_cmd(), $extraEnv + $env);
    $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    proc_close($p);
    if (trim($out) !== '') {
        echo "    [worker] " . trim($out) . "\n";
    }
}
function statuses(): array
{
    return array_column(sql("select mid, status from queue order by id"), 'status', 'mid');
}
function reset_all(): void { fake('/_test/reset'); }

