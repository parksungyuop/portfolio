# DM 자동답변 봇

공식 Instagram API로 받은 DM에 오너의 말투를 학습한 Claude가 대신 답장하는 봇.

- `worker/` — Cloudflare Worker (웹훅 · 대시보드 API · 1분 크론)
- `server/` — PHP 8 버전 (공유 호스팅용, Composer 의존성 0개)
- `supabase/` — Postgres 스키마 · 마이그레이션 (`claim_jobs()` = `FOR UPDATE SKIP LOCKED` 대기열)
- `dashboard/` — Vite + 순수 JS 오너 대시보드 (Supabase RLS)
- `tools/analyze_tone.py` — 과거 대화에서 말투 프로필 추출

설계 문서: [계획서.md](계획서.md) · [수정계획서.md](수정계획서.md) · [배포가이드.md](배포가이드.md)

비밀값(Supabase 서비스 키, IG 앱 시크릿, Claude API 키, 암호화 키)은 저장소에 없음. `wrangler secret put`으로 등록.
