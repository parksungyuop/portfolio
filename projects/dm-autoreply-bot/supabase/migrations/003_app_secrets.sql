-- 003: Cloudflare Worker 용 서버 비밀 저장소 (갱신된 IG 장기 토큰 등, 값은 암호화)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
create table public.app_secrets (
  key        text primary key,
  value      text not null,                 -- enc() 로 암호화한 값
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
-- 정책·권한 없음 → service 키(Worker)만 접근
