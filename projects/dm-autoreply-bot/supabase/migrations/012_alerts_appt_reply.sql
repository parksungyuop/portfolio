-- 012: Gmail 알림(보류·실패·봇이 잡은 약속·토큰 문제) + 대시보드에서 약속 요청에 바로 답하기
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.settings
  add column if not exists alert_pending boolean not null default false,   -- 보낼 알림이 남아 있음 (너무 자주 보내지 않게 모아서 보냄)
  add column if not exists last_alert_at timestamptz,                      -- 마지막 알림 메일 보낸 시각
  add column if not exists appt_yes_message text not null default '{date} 좋아',
  add column if not exists appt_yes_message_formal text not null default '{date} 좋아요',
  add column if not exists appt_no_message text not null default '그날은 안 될 것 같아',
  add column if not exists appt_no_message_formal text not null default '그날은 어려울 것 같아요';
grant update (appt_yes_message, appt_yes_message_formal, appt_no_message, appt_no_message_formal) on public.settings to authenticated;

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('requested', 'accepted', 'declined', 'confirmed', 'planned', 'proposed', 'done', 'cancelled'));
-- confirmed: 오너가 대시보드에서 [좋아 보내기]로 확정
