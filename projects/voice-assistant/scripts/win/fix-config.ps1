# 샌드박스 밖(바로가기 경유)에서 실행: 진짜 %APPDATA%\Jarvis\config.json 을 쓴다
$dir = Join-Path $env:APPDATA 'Jarvis'; New-Item -ItemType Directory -Force $dir | Out-Null
$p = Join-Path $dir 'config.json'
$json = @'
{
  "hud": { "displayName": "비서", "honorific": "홍길동 님", "honorificEn": "President Hong" },
  "wake": { "clap": true, "clapSensitivity": 0.5 },
  "brain": { "model": "claude-opus-5-5" }
}
'@
[IO.File]::WriteAllText($p, $json, (New-Object System.Text.UTF8Encoding $false))
Copy-Item $p (Join-Path $PSScriptRoot 'real-config.txt') -Force
