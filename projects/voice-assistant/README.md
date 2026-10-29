# 음성 AI 비서

호출어로 깨우는 음성 기반 데스크톱 AI 비서.

- `packages/core` — 상태 머신 · 에이전트 연동 (Claude Agent SDK, MCP)
- `apps/desktop` — Electron 앱 (HUD 오버레이, 음성 루프)
- `scripts/spike-*.ts` — 호출어 · STT · TTS · 캘린더 · HUD 단위 검증 스파이크
- `docs/` — 설계서와 단계별 계획 (에코 가드 포함)

```bash
pnpm install
pnpm tsx scripts/fetch-models.ts   # 호출어 ONNX 모델 받기 (저장소에 미포함)
pnpm check                         # 타입체크 + 테스트
pnpm start
```
