-- 005: 지금 내 상황 (대시보드 버튼으로 설정 → 봇이 답장할 때 참고)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.settings
  add column owner_status    text,          -- 예: '카페', '자는 중', 직접 입력한 문장
  add column owner_area      text,          -- 예: '논현동'
  add column owner_status_at timestamptz;   -- 설정 시각 (오래된 상황인지 봇이 판단)
grant update (owner_status, owner_area, owner_status_at) on public.settings to authenticated;

-- 처음 연락 온 새 상대도 바로 자동답변 (schema.prod.sql 의 기본값 false 를 되돌림)
alter table public.contacts alter column auto_enabled set default true;
