-- 010: 약속 시각 · '봇이 거절함(일정 겹침)' 상태 · 존댓말 약속잡기 문구
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.appointments add column if not exists time_hm text
  check (time_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');           -- 약속 시각 (없으면 날짜만)
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('requested', 'accepted', 'declined', 'planned', 'proposed', 'done', 'cancelled'));
-- declined: 캘린더 일정·약속과 겹쳐서 봇이 "그날은 약속이 있어"로 거절함 (오너가 처리할 필요 없음)

alter table public.settings add column if not exists appointment_message_formal text not null default '{date}에 뵐까요?';
grant update (appointment_message_formal) on public.settings to authenticated;
