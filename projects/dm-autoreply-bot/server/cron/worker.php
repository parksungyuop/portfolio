<?php
// cPanel 크론 (매 분): php ~/dmbot/cron/worker.php
declare(strict_types=1);
require __DIR__ . '/../bootstrap.php';
set_time_limit(WORKER_BUDGET_SEC + 30);
worker_run(WORKER_BUDGET_SEC);
