<?php
// public_html/ig/api.php 로 업로드. 대시보드 전용 (오너 로그인 JWT 필수).
declare(strict_types=1);
// dmbot 폴더(public_html 바깥)를 위쪽 폴더에서 찾음 → 메인 도메인·서브도메인 어느 문서 루트에 올려도 동작
$home = getenv('DM봇_HOME') ?: null;
for ($d = dirname(__DIR__); !$home && $d !== dirname($d); $d = dirname($d)) {
    if (is_file("$d/dmbot/bootstrap.php")) {
        $home = "$d/dmbot";
    }
}
require ($home ?? exit('dmbot 폴더를 찾을 수 없음')) . '/bootstrap.php';
api_main();
