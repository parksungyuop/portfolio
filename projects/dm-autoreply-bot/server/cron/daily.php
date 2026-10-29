<?php
// cPanel 크론 (하루 1회, 예: 새벽 4시): php ~/dmbot/cron/daily.php
declare(strict_types=1);
require __DIR__ . '/../bootstrap.php';
set_time_limit(300);

echo 'token: ' . token_refresh() . "\n";        // 가장 중요 → 먼저
cleanup();
echo 'summaries: ' . summarize_due(200) . "\n";
