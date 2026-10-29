-- 007: 자동발송을 끈 시각 (대시보드에서 꺼진 상대를 최근에 끈 순서로 맨 위에 보여 주기 위함)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.contacts add column if not exists auto_off_at timestamptz;

-- 토글·전체 끄기 등 어떤 경로로 바뀌어도 DB 가 직접 기록
create or replace function public.contacts_auto_off_at() returns trigger language plpgsql as $$
begin
  if new.auto_enabled is distinct from old.auto_enabled then
    new.auto_off_at := case when new.auto_enabled then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists contacts_auto_off_at on public.contacts;
create trigger contacts_auto_off_at before update of auto_enabled on public.contacts
  for each row execute function public.contacts_auto_off_at();
