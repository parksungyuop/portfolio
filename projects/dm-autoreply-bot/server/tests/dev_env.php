<?php
// 대시보드 로컬 확인용: 가짜 서버 + 시드 데이터 + 빌드된 대시보드를 띄우고 종료될 때까지 대기
//   cd dashboard && npx vite build --mode devlocal
//   php server/tests/dev_env.php      → http://127.0.0.1:8788/dash/  (owner@test.local / owner-pass-1234)
declare(strict_types=1);

$FAKE = 8787;
$WEB = 8788;
$www = sys_get_temp_dir() . '/dmbot_www_' . getmypid();
$dist = dirname(__DIR__, 2) . '/dashboard/dist';
if (!is_file("$dist/index.html")) {
    exit("먼저 대시보드를 빌드하세요: cd dashboard && npx vite build --mode devlocal\n");
}
@mkdir("$www/dash/assets", 0700, true);
foreach (glob(dirname(__DIR__) . '/public/*.php') as $f) {
    copy($f, "$www/" . basename($f));
}
copy("$dist/index.html", "$www/dash/index.html");
foreach (glob("$dist/assets/*") as $f) {
    copy($f, "$www/dash/assets/" . basename($f));
}
$DOCROOT = $www;
require __DIR__ . '/harness.php';

reset_all();
sql("insert into tone_profiles (is_default, display_name, style_guide, stats) values
  (true, '기본', '- 반말, 짧게\n- ㅋㅋ 자주 씀', '{\"owner_messages\": 820, \"honorific_ratio\": 0.12, \"avg_len\": 9.4}');
  insert into tone_profiles (contact_key, display_name, style_guide, stats) values
  ('user_1001', '민지', '- 반말, 이모지 많이 😂\n- 어미: ~지, ~ㅋㅋ', '{\"owner_messages\": 340, \"honorific_ratio\": 0.0, \"avg_len\": 7.1, \"top_endings\": [[\"이지\", 0.2]]}'),
  ('user_1002', '김팀장님', '- 존댓말, 이모지 없음\n- 어미: ~습니다, ~요', '{\"owner_messages\": 95, \"honorific_ratio\": 0.97, \"avg_len\": 21.3}')");
webhook([inbound('1001', '뭐해 ㅋㅋ'), inbound('1002', '내일 회의 자료 확인 부탁드려요'), inbound('1003', '안녕하세요 협업 문의드립니다'),
    inbound('1004', '어제 그 돈 언제 보내줄 거야?', 25 * 3600)]);
ready();
worker();
fake('/_test/config', ['claudeText' => "- 일상 대화, 안부 주고받음\n- 약속 없음"]);
sql("update contacts set summary = null");
[$p, $pipes] = spawn([PHP_BINARY, "$root/cron/daily.php"], $env);
stream_get_contents($pipes[1]);
proc_close($p);
sql("update contacts set paused_until = now() + interval '20 minutes' where igsid = '1003';
     update settings set token_expires_at = now() + interval '6 days'");
fake('/_test/config', ['claudeText' => '[약속] 시간 확인해보고 알려줄게']);
webhook([inbound('1001', '이번 주말에 볼래?')]);
ready();
worker();
fake('/_test/config', ['claudeText' => '응 알겠어']);

echo "READY http://127.0.0.1:$WEB/dash/  (owner@test.local / owner-pass-1234)\n";
while (true) {
    sleep(3600);
}
