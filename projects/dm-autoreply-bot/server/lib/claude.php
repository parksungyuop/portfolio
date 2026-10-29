<?php
declare(strict_types=1);

// Sonnet 5.5 / Haiku 5.5 는 생각(thinking)이 기본으로 켜져 있고 생각 토큰도 max_tokens 에 포함됨.
// 짧은 DM·요약이라 effort 'low' 로 생각을 최소화하고, max_tokens 는 넉넉히 둬서 답이 잘리지 않게 함.
function claude_text(string $model, string $system, string $user, int $maxTokens = 2000): string
{
    $r = http_json('POST', CLAUDE_API_URL, [
        'model'         => $model,
        'max_tokens'    => $maxTokens,
        'output_config' => ['effort' => 'low'],
        'system'        => $system,
        'messages'      => [['role' => 'user', 'content' => $user]],
    ], ['x-api-key: ' . CLAUDE_API_KEY, 'anthropic-version: 2023-06-01'], 60);

    $text = '';
    foreach ($r['content'] ?? [] as $block) {
        if (($block['type'] ?? '') === 'text') {
            $text .= $block['text'];
        }
    }
    $stop = $r['stop_reason'] ?? 'end_turn';
    if (trim($text) === '' && $stop !== 'end_turn') {
        // 잘림·거절 등으로 본문이 없으면 'NO_REPLY' 로 오인하지 않도록 오류 처리 → 재시도/주의 목록
        throw new RuntimeException("Claude 응답 본문 없음 (stop_reason: $stop)");
    }
    return trim($text);
}
