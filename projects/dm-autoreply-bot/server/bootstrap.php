<?php
declare(strict_types=1);

require getenv('DM봇_CONFIG') ?: __DIR__ . '/config.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/crypto.php';
require __DIR__ . '/lib/supabase.php';
require __DIR__ . '/lib/ig.php';
require __DIR__ . '/lib/claude.php';
require __DIR__ . '/lib/bot.php';
require __DIR__ . '/lib/webhook.php';
require __DIR__ . '/lib/maint.php';
require __DIR__ . '/lib/api.php';

date_default_timezone_set('Asia/Seoul');
