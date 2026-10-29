-- 006: 오너 캘린더 (시간대별 일정·약속·수면 기록 → 봇이 답장할 때 참고)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
create table public.calendar_events (
  id         bigint generated always as identity primary key,
  kind       text not null default 'schedule' check (kind in ('schedule', 'appointment', 'sleep')),
  -- schedule: 일반 일정 / appointment: 약속 (봇은 내용 대신 "그날은 약속이 있어"만 말함) / sleep: 수면 버튼 기록
  title      text not null default '',
  start_at   timestamptz not null,
  end_at     timestamptz,                    -- null = 끝 시각 없음 (수면 중이면 아직 안 일어남)
  created_at timestamptz not null default now()
);
create index calendar_events_start on public.calendar_events (start_at);
alter table public.calendar_events enable row level security;
grant select, insert, update, delete on public.calendar_events to authenticated;
create policy owner_all on public.calendar_events for all to authenticated using (public.is_owner()) with check (public.is_owner());
