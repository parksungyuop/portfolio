<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    // status 0 = 응답 못 받음 (타임아웃·연결 끊김) → 상대 서버에서 처리됐는지 알 수 없음
    public function __construct(public int $status, public string $body, string $msg)
    {
        parent::__construct($msg);
    }
}

/** JSON 요청. 2xx 아니면 HttpError. */
function http_json(string $method, string $url, ?array $body, array $headers, int $timeout = 30): mixed
{
    $ch = curl_init($url);
    $h = array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $h,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => $timeout,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    $res = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        throw new HttpError(0, '', "$method $url: $err");
    }
    if ($status < 200 || $status >= 300) {
        throw new HttpError($status, $res, "$method $url: HTTP $status " . mb_substr($res, 0, 300));
    }
    return $res === '' ? null : json_decode($res, true);
}
