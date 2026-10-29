# 스파링 매칭 웹

격투 스포츠인을 위한 스파링 파트너 매칭·커뮤니티 웹 베타입니다. 베타 무대는 **서울 전역**입니다.

같은 종목, 비슷한 체급, 맞는 강도의 파트너를 찾아 **상호 동의로** 안전한 운동 약속을 만드는 것이 핵심입니다. 소개팅 앱의 매칭 인터랙션(카드 탐색 → 제안 → 상호 수락 → 대화)을 차용하되, 제품의 중심은 연애가 아닌 **운동 파트너 연결**입니다.

UI는 영화 격투 영화 포스터 5종([references/README.md](./references/README.md))을 무드 레퍼런스로 한 **"네온 & 그레인" 비주얼 시스템 v2**입니다 — 한글 네온사인 헤드라인, 필름 그레인·비네트, 독초록 안전 색, 아웃라인 워터마크 활자. 디자인 토큰과 사용 원칙은 설계서 §5.3에 정리되어 있습니다.

## 실행

Node.js 내장 서버만으로 실행됩니다. 이 서버는 **가입 시 만든 공개 운동 프로필, 매칭 요청, 매칭된 대화 메시지**를 `data/match-chat.json`에 저장합니다.

```powershell
node server.mjs
```

그 후 브라우저에서 `http://127.0.0.1:4173`을 엽니다. 인증 없는 mock API라 기본은 이 컴퓨터에서만 접속됩니다(같은 네트워크에 열려면 `HOST=0.0.0.0`을 직접 지정).

화면 서체(Black Han Sans·Noto Sans KR)는 Google Fonts에서 불러옵니다. 오프라인이면 시스템 폰트로 자동 대체되며 기능에는 영향이 없습니다.

데모 로그인 계정은 `demo@sparringmatch.beta` / `sparringmatch2026`입니다. 데모 계정에는 **받은 스파링 요청 1건**이 미리 담겨 있어, 로그인 직후 수락/거절 흐름을 바로 체험할 수 있습니다.

## 포함된 베타 화면

- 종목·강도·거리 기반 파트너 탐색 (예시 프로필 + 서버에 저장된 가입 프로필) — 포스터형 카드, 나와 겹치는 조건 칩, 넘기기/저장/제안
- 홈 "오늘의 추천 3명", 수락 직후 매칭 순간 화면, 대화 목록 "내 차례" 표시, 3단계 회원가입
- 만 15세 이상 확인, 가입 운동 프로필의 서버 저장
- 스파링 제안 모달과 서버 저장 전송 상태
- **받은 스파링 요청함**: 메시지 탭에서 받은 제안을 확인하고 수락/거절 (수락 시 매칭 대화방 자동 생성, 상단바·사이드바 배지에 실시간 건수 표시)
- 매칭된 사용자 간 서버 저장 채팅
- 커뮤니티, 체육관 지도 모형, 이벤트 보드
- 장비샵: 새제품/중고 필터, 상품 상세, 찜·장바구니 mock 동작
- 안전 가이드, 신고/차단 안내, 공개 범위 설명

## 로컬 서버 API 요약

| 메서드·경로 | 용도 |
| --- | --- |
| `GET /api/health` | 서버 상태 확인 |
| `GET·POST /api/profiles` | 공개 운동 프로필 목록·가입 저장 |
| `GET·POST /api/match-requests` | 스파링 요청 조회·전송 |
| `POST /api/match-requests/:id/accept` | 받은 요청 수락 (수신자만, 매칭 대화방 생성) |
| `POST /api/match-requests/:id/decline` | 받은 요청 거절 (수신자만, 사유 미전달) |
| `GET /api/conversations` · `POST /api/conversations/:id/messages` | 매칭 대화 조회·메시지 저장 |

## 프로젝트 구조

```text
Sparringmatch/
├─ index.html            # 진입점 (한국어, 접근성 스킵 링크 포함)
├─ app.js                # SPA 렌더링·상태·이벤트 (프레임워크 없음)
├─ styles.css            # 다크 + 레드 디자인 토큰 기반 스타일 시스템
├─ server.mjs            # Node 내장 http 서버 (정적 파일 + 매칭/채팅 API)
├─ data/match-chat.json  # 프로필·요청·대화 로컬 저장소
├─ docs/                 # 시장 분석·수익화 문서
│  ├─ KOREA_COMBAT_SPORTS_MARKET_ANALYSIS.md   # 한국 격투기 시장 분석 + 수익화 아이디어
│  └─ DATING_APP_MONETIZATION_ANALYSIS.md      # 소개팅 앱 수익화 분석 + 적용 아이디어
├─ references/           # 디자인 레퍼런스 (영화 격투 영화 포스터 5종, 내부 참고 전용)
└─ PRODUCT_DEVELOPMENT_PLAN.md       # 제품 설계서 (기획·설계·보안·운영·수익화)
```

## 문서 안내

- **제품 설계서**: [PRODUCT_DEVELOPMENT_PLAN.md](./PRODUCT_DEVELOPMENT_PLAN.md) — MVP 범위, 청소년 안전 모드, 데이터 모델, 보안, 운영, 수익화, 일정까지 전체 설계
- **시장 분석**: [docs/KOREA_COMBAT_SPORTS_MARKET_ANALYSIS.md](./docs/KOREA_COMBAT_SPORTS_MARKET_ANALYSIS.md) — 종목별 한국 시장 현황과 그에 근거한 수익화 아이디어
- **수익화 벤치마킹**: [docs/DATING_APP_MONETIZATION_ANALYSIS.md](./docs/DATING_APP_MONETIZATION_ANALYSIS.md) — 데이팅 앱 수익 메커니즘 분해와 SparringMatch 적용안 (도입 금지 목록 포함)
- **UI 변경 기획서 v3**: [docs/UI_REDESIGN_PLAN.md](./docs/UI_REDESIGN_PLAN.md) — Tinder·Bumble·Hinge 벤치마킹과 적용 내역
- **Q/A 기록**: [docs/QA_REPORT_2026-09-21.md](./docs/QA_REPORT_2026-09-21.md) — 고친 점·개선할 점·추가할 점
- **디자인 레퍼런스**: [references/README.md](./references/README.md) — 영화 포스터 무드 보드와 사용 원칙(저작권 주의)

## 주의사항

체육관·이벤트·상품과 기본 파트너 목록은 예시용 mock 데이터입니다. 가입할 때 작성한 공개 운동 프로필은 이 컴퓨터의 `data/match-chat.json`에 저장되어 파트너 목록에 표시됩니다. 로그인 비밀번호는 서버로 전송·저장하지 않고 이 브라우저의 로컬 mock 저장소만 사용합니다. 실제 계정 인증·비밀번호 보안·결제·주문·배송·중고거래를 처리하지 않으므로 실제 개인정보나 결제정보를 입력하지 마세요.
