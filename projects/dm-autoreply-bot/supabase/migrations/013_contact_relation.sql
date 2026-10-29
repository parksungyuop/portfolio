-- 013: 상대별 참고 항목 (관계·성별·메모) — 오너가 시간 날 때 적으면 봇이 반말/존댓말·호칭을 맞춤
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.contacts
  add column if not exists relation text,                                   -- 형, 누나, 선배, 동생, 동갑, 친구, 고객, 선생님 … (직접 입력 가능)
  add column if not exists gender text check (gender in ('남자', '여자')),
  add column if not exists memo text;                                       -- 예: '반말 쓰는 형', '존댓말 쓰는 동생', '대학 동기'
grant update (relation, gender, memo) on public.contacts to authenticated;
