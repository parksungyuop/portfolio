<?php
declare(strict_types=1);

// Supabase REST (PostgREST). service role 키 → RLS 우회. 서버에서만 사용.

function sb(string $method, string $path, ?array $body = null, array $prefer = []): mixed
{
    $h = ['apikey: ' . SUPABASE_SERVICE_KEY];
    // 예전 service_role 키(JWT)만 Authorization 에도 넣음. 새 secret 키(sb_secret_…)는 apikey 헤더만.
    if (str_starts_with(SUPABASE_SERVICE_KEY, 'eyJ')) {
        $h[] = 'Authorization: Bearer ' . SUPABASE_SERVICE_KEY;
    }
    if ($prefer) {
        $h[] = 'Prefer: ' . implode(',', $prefer);
    }
    return http_json($method, rtrim(SUPABASE_URL, '/') . '/rest/v1/' . $path, $body, $h);
}

function sb_rpc(string $fn, array $args = []): mixed
{
    return sb('POST', "rpc/$fn", $args);
}

/** $query 예: ['igsid' => 'eq.123', 'order' => 'ts.desc', 'limit' => 20] */
function sb_select(string $table, array $query = []): array
{
    return sb('GET', $table . '?' . http_build_query($query + ['select' => '*'])) ?? [];
}

function sb_one(string $table, array $query): ?array
{
    return sb_select($table, $query + ['limit' => 1])[0] ?? null;
}

/** 삽입된 행 반환. UNIQUE 충돌이면 null. $ignoreOn 지정 시 그 컬럼 충돌은 조용히 무시(null). */
function sb_insert(string $table, array $row, ?string $ignoreOn = null): ?array
{
    $path = $table . ($ignoreOn ? '?on_conflict=' . $ignoreOn : '');
    $prefer = ['return=representation'];
    if ($ignoreOn) {
        $prefer[] = 'resolution=ignore-duplicates';
    }
    try {
        return sb('POST', $path, $row, $prefer)[0] ?? null;
    } catch (HttpError $e) {
        if ($e->status === 409) {
            return null;
        }
        throw $e;
    }
}

function sb_update(string $table, array $filter, array $patch): array
{
    return sb('PATCH', $table . '?' . http_build_query($filter), $patch, ['return=representation']) ?? [];
}

function sb_delete(string $table, array $filter): void
{
    sb('DELETE', $table . '?' . http_build_query($filter));
}

/** id 목록 → PostgREST in 필터 */
function sb_in(array $ids): string
{
    return 'in.(' . implode(',', array_map('strval', $ids)) . ')';
}

function iso(int $unix): string
{
    return gmdate('Y-m-d\TH:i:s\Z', $unix);
}
