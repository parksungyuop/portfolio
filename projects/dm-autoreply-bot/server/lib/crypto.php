<?php
declare(strict_types=1);

// 형식: "v1:" + base64(iv 12바이트 | 암호문 | tag 16바이트)
// Python cryptography 의 AESGCM(key).encrypt(iv, data, None) 결과(암호문|tag)와 호환

function enc(string $plain): string
{
    $iv = random_bytes(12);
    $ct = openssl_encrypt($plain, 'aes-256-gcm', enc_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($ct === false) {
        throw new RuntimeException('암호화 실패');
    }
    return 'v1:' . base64_encode($iv . $ct . $tag);
}

function dec(?string $s): string
{
    if ($s === null || $s === '') {
        return '';
    }
    $raw = base64_decode(substr($s, 3), true);
    if (!str_starts_with($s, 'v1:') || $raw === false || strlen($raw) < 28) {
        throw new RuntimeException('암호문 형식 오류');
    }
    $plain = openssl_decrypt(substr($raw, 12, -16), 'aes-256-gcm', enc_key(), OPENSSL_RAW_DATA,
        substr($raw, 0, 12), substr($raw, -16));
    if ($plain === false) {
        throw new RuntimeException('복호화 실패 (키 불일치 또는 변조)');
    }
    return $plain;
}

function enc_key(): string
{
    $k = base64_decode(ENC_KEY_B64, true);
    if ($k === false || strlen($k) !== 32) {
        throw new RuntimeException('ENC_KEY_B64 는 32바이트 base64 여야 함');
    }
    return $k;
}
