# 자비스 1a단계(음성 루프) 구현 계획

**Goal:** 명세 §10 1a — "⌥Space(또는 호출어) → Yes, boss → 말하기 → 한국어 답 → 자막"이 실제 앱에서 한 바퀴 돈다. HUD는 오브+자막만. 설정 창 최소본(ElevenLabs 키 입력).

**Architecture:** Electron main 하나(`apps/desktop/main`)가 상태 기계를 들고, `voice/`(ear·mouth), `brain/`(장수 query)이 이벤트를 넣는다. 렌더러는 상태·자막만 받는다(IPC 채널 `hud:state`). 결정 논리는 전부 `packages/core`의 순수 함수로 두고 vitest가 고정한다.

**Spec:** `docs/01-jarvis-design.md` §4 흐름, §5 상태 기계, §6.1 옵션, F-12·F-13·F-16·F-19·F-27

## Global Constraints
- 비밀은 `safeStorage`로 `Application Support/Jarvis/secrets.bin`에만. 개발 중엔 env(`ELEVENLABS_API_KEY`)도 허용하되 로그 금지
- SDK 옵션 불변식은 `assertToolPolicy`가 기동 시 단언한다 (F-11·F-12)
- 마이크는 `jarvis-ear`만 연다. 호출어 렌더러 감지는 `spike:wake` 통과 뒤(별도 태스크) — 1a는 ⌥Space로 깨운다
- 오디오 재생은 1a에서 `afplay`(문장별 mp3). 렌더러 재생은 CSP 검토 뒤

## Tasks
1. `packages/core`: `state-machine.ts`(전이표 = `fixtures/state-transitions.json`), `sentence-stream.ts`(델타 → 문장 누적), `brain-errors.ts`(`classifyBrainError`), `config-schema.ts`(zod), `local-intents.ts`(STOP만) — 각각 테스트
2. `apps/desktop/voice/ear.ts`: jarvis-ear spawn·재spawn·명령·이벤트
3. `apps/desktop/voice/mouth.ts`: ElevenLabs WS 문장 큐 → mp3 → afplay, Yuna 폴백, 정규화·240자 컷
4. `apps/desktop/brain/session.ts`: 스트리밍 입력 장수 query, `interrupt()`, 5분 유휴 종료, 오류 분류
5. `apps/desktop/main/{index,config,secrets,hud-window,hotkey}.ts` + `renderer/{index.html,hud.js}` + `preload.cts`
6. `windows/settings`: 키 입력 1칸 + 저장
7. 수동 검증: 완료 기준 문장, `docs/verification.md`에 첫 음성까지 ms 기록
