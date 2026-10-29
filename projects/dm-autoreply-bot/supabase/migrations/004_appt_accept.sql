-- 004: 약속 무조건 수락 명단 + 수락 상태
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.contacts add column appt_accept boolean not null default false;   -- true = 약속 요청을 봇이 바로 수락
grant update (appt_accept) on public.contacts to authenticated;

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('requested', 'accepted', 'planned', 'proposed', 'done', 'cancelled'));
-- accepted: 무조건 수락 명단의 상대가 약속을 잡자고 해서 봇이 수락함
