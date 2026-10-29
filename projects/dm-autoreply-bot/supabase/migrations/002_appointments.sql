-- 002: 약속 기능 (상대의 약속 요청 기록 + 대시보드 약속잡기)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.

alter table public.queue drop constraint queue_kind_check;
alter table public.queue add constraint queue_kind_check check (kind in ('inbound', 'echo', 'intro', 'appoint'));

alter table public.settings add column appointment_message text not null default '{date}에 볼까?';
grant update (appointment_message) on public.settings to authenticated;

create table public.appointments (
  id               bigint generated always as identity primary key,
  igsid            text not null references public.contacts(igsid) on delete cascade,
  status           text not null default 'requested'
                   check (status in ('requested', 'planned', 'proposed', 'done', 'cancelled')),
  -- requested: 상대가 약속을 잡자고 함(봇이 회피 답장) / planned: 오너가 직접 추가(미발송)
  -- proposed: 날짜 메시지 보냄 / done·cancelled: 오너가 정리
  request_text_enc text,                      -- 상대가 보낸 약속 요청 원문 (암호화)
  requested_at     timestamptz,
  date             date,
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index appointments_status on public.appointments (status, created_at desc);
alter table public.appointments enable row level security;
revoke all on public.appointments from anon, authenticated;
-- 원문이 암호화돼 있어 대시보드는 api.php(service_role) 경유로만 조회
