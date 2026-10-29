# verification

| 명령 | 날짜 | OS빌드 | 지표 | 측정값 | 픽스처 해시 | 통과 |
|---|---|---|---|---|---|---|
| `xcrun swift scripts/check_speech.swift` | 2026-09-05 | macOS 26.6.1 (25G76) | SpeechTranscriber ko-KR supported/installed | supported=true · installed=true (30 locales) | — | 통과 |
| `env -u ANTHROPIC_API_KEY pnpm spike:sdk` | 2026-09-05 | 25G76 | 첫 델타 ms · 델타 수 · 비MCP 도구 · cost | 10412 · 9 · 없음 · 0.112318 | — | 통과 |
| `pnpm spike:tts (키 없음)` | 2026-09-05 | 25G76 | Yuna 폴백 전체 ms | 6684 | — | 통과 |
| `pnpm spike:hud` | 2026-09-05 | 25G76 | 평균 fps(20s) · 창 수 | 115.6 · 1 | — | 통과 |
| `pnpm spike:cal` | 2026-09-05 | 25G76 | 도구 수 · 오늘 이벤트 응답 · 해시/서명(v1.16.1) | 29 · 수신 · 328c9a329050/(none) | — | 통과 |
