-- 인스타 DM 자동답변 봇 스키마
-- 실행: Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 Run (새 프로젝트에 1회만. 재실행하면 테이블 중복 오류)
-- 검증: supabase/test 에서 npm install && node test_schema.mjs
-- 실행 전: 아래 is_owner() 안의 OWNER_UUID 를 Authentication → Users 의 오너 UUID 로 바꿀 것

-- ─────────────────────────────────────────────
-- 오너 판별 (RLS·대시보드 권한의 유일한 기준)
-- ─────────────────────────────────────────────
create or replace function public.is_owner() returns boolean
language sql stable as $$
  select auth.uid() = '00000000-0000-0000-0000-000000000000'::uuid  -- OWNER_UUID
$$;

-- ─────────────────────────────────────────────
-- 테이블
-- ─────────────────────────────────────────────
create table public.settings (
  id               int primary key default 1 check (id = 1),     -- 1행 고정
  global_enabled   boolean not null default false,               -- 처음엔 꺼진 상태로 시작
  pause_minutes    int     not null default 30 check (pause_minutes between 1 and 1440),
  reply_delay_sec  int     not null default 20 check (reply_delay_sec between 0 and 600),
  trigger_phrases  text[]  not null default array['사실 이거 홍길동 봇이야', '이거 봇이야'],
  intro_message    text    not null default '안녕하세요! 저는 홍길동 님의 DM을 대신 답하는 AI 봇이에요. 중요한 내용은 홍길동 님이 직접 확인하고 답드릴게요 🙂',
  token_expires_at timestamptz,                                  -- 토큰 자체는 서버 파일에만 저장
  token_error      text,
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.tone_profiles (
  id           bigint generated always as identity primary key,
  contact_key  text unique,                       -- 인스타 username (기본 프로필은 null)
  display_name text,
  is_default   boolean not null default false,
  stats        jsonb   not null default '{}',     -- 어미·이모지·존댓말 비율·길이 등
  style_guide  text    not null default '',       -- Claude 프롬프트에 들어가는 말투 지침
  examples_enc text,                              -- 대표 대화 예시 (AES-256-GCM)
  updated_at   timestamptz not null default now(),
  check (is_default = (contact_key is null))
);
create unique index tone_profiles_one_default on public.tone_profiles (is_default) where is_default;

create table public.contacts (
  igsid            text primary key,
  username         text,
  name             text,
  profile_id       bigint references public.tone_profiles(id) on delete set null,  -- null = 기본 프로필
  auto_enabled     boolean not null default true,
  paused_until     timestamptz,
  lease_until      timestamptz,                   -- 워커 상대별 잠금 (같은 상대는 동시에 1워커만)
  last_user_msg_at timestamptz,                   -- 24시간 창 기준
  last_msg_at      timestamptz,
  summary          text,
  summary_at       timestamptz,
  created_at       timestamptz not null default now()
);

create table public.queue (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('inbound', 'echo', 'intro')),
  mid          text not null unique,              -- 웹훅 재전송 중복 자동 무시
  igsid        text not null references public.contacts(igsid) on delete cascade,
  payload_enc  text,
  event_ts     timestamptz not null,              -- 인스타 기준 메시지 시각
  status       text not null default 'pending'
               check (status in ('pending','processing','sending','done','skipped','expired','failed','needs_review')),
  attempts     int not null default 0,
  not_before   timestamptz not null default now(),
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index queue_ready on public.queue (igsid, not_before) where status in ('pending', 'processing');
create index queue_status on public.queue (status, created_at);

create table public.messages (
  id        bigint generated always as identity primary key,
  mid       text unique,
  igsid     text not null references public.contacts(igsid) on delete cascade,
  direction text not null check (direction in ('in', 'bot', 'owner')),
  text_enc  text not null,
  ts        timestamptz not null
);
create index messages_contact_ts on public.messages (igsid, ts desc);

create table public.send_log (
  id         bigint generated always as identity primary key,
  queue_id   bigint unique references public.queue(id) on delete set null,  -- 작업당 발송 시도 1회
  igsid      text not null,
  text_enc   text not null,
  ig_mid     text unique,                         -- echo 가 봇 발송인지 판별
  status     text not null check (status in ('sending','sent','failed','blocked_off')),
  error      text,
  created_at timestamptz not null default now()
);
create index send_log_created on public.send_log (created_at desc);

-- ─────────────────────────────────────────────
-- RPC: 웹훅 적재 (상대 생성 + 큐 적재를 1회 호출로)
-- ─────────────────────────────────────────────
create or replace function public.enqueue(
  p_kind text, p_mid text, p_igsid text, p_payload_enc text, p_event_ts timestamptz
) returns boolean                                  -- true = 새로 적재, false = 중복
language plpgsql as $$
declare
  v_delay int;
  v_id bigint;
begin
  insert into contacts (igsid) values (p_igsid) on conflict do nothing;

  v_delay := case p_kind
    when 'inbound' then (select reply_delay_sec from settings where id = 1)
    when 'echo'    then 15                         -- 봇 발송 기록(ig_mid)이 먼저 저장될 시간
    else 0 end;

  insert into queue (kind, mid, igsid, payload_enc, event_ts, not_before)
  values (p_kind, p_mid, p_igsid, p_payload_enc, p_event_ts, now() + make_interval(secs => v_delay))
  on conflict (mid) do nothing
  returning id into v_id;

  if v_id is not null then
    update contacts set
      last_msg_at      = greatest(coalesce(last_msg_at, p_event_ts), p_event_ts),
      last_user_msg_at = case when p_kind = 'inbound'
                              then greatest(coalesce(last_user_msg_at, p_event_ts), p_event_ts)
                              else last_user_msg_at end
    where igsid = p_igsid;
  end if;
  return v_id is not null;
end $$;

-- ─────────────────────────────────────────────
-- RPC: 작업 가져가기
--  · 상대(contact) 단위로 임대 → 같은 상대의 작업은 한 워커만 처리 (이중 발송 방지)
--  · 해당 상대에게 아직 대기시간이 안 지난 작업이 있으면 보류 (연속 메시지 묶기)
--  · 임대 만료된 processing 은 다시 가져감 (실행 시간 초과 시 유실 방지)
--  · 임대 만료된 sending 은 재발송하지 않고 needs_review (최대 1회 발송)
-- ─────────────────────────────────────────────
create or replace function public.claim_jobs(p_max_contacts int, p_lease_sec int, p_max_attempts int default 5)
returns setof public.queue
language plpgsql as $$
declare
  v_lease timestamptz := now() + make_interval(secs => p_lease_sec);
begin
  update queue set status = 'needs_review', last_error = '발송 중 중단됨 (발송 여부 불확실)', updated_at = now()
  where status = 'sending' and locked_until < now();

  update queue set status = 'failed', updated_at = now()
  where status in ('pending', 'processing') and attempts >= p_max_attempts
    and (locked_until is null or locked_until < now());

  return query
  with picked as (
    select c.igsid from contacts c
    where (c.lease_until is null or c.lease_until < now())
      and exists (select 1 from queue q
                  where q.igsid = c.igsid and q.status in ('pending', 'processing')
                    and q.not_before <= now())
      and not exists (select 1 from queue q
                      where q.igsid = c.igsid and q.status = 'pending' and q.not_before > now())
    order by (select min(q.not_before) from queue q
              where q.igsid = c.igsid and q.status in ('pending', 'processing'))
    limit p_max_contacts
    for update skip locked
  ), leased as (
    update contacts c set lease_until = v_lease
    from picked p where c.igsid = p.igsid
    returning c.igsid
  )
  update queue q set status = 'processing', locked_until = v_lease,
                     attempts = q.attempts + 1, updated_at = now()
  from leased l
  where q.igsid = l.igsid and q.status in ('pending', 'processing') and q.not_before <= now()
  returning q.*;
end $$;

-- 워커가 상대 처리를 마치면 호출 (안 불러도 임대 만료 시 자동 해제)
create or replace function public.release_contact(p_igsid text) returns void
language sql as $$
  update contacts set lease_until = null where igsid = p_igsid
$$;

-- ─────────────────────────────────────────────
-- 권한: 서버(service_role)만 RPC·큐·원문 접근, 대시보드(authenticated)는 오너만 필요한 것만
-- ─────────────────────────────────────────────
alter table public.settings      enable row level security;
alter table public.tone_profiles enable row level security;
alter table public.contacts      enable row level security;
alter table public.queue         enable row level security;
alter table public.messages      enable row level security;
alter table public.send_log      enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.enqueue(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_jobs(int, int, int) from public, anon, authenticated;
revoke execute on function public.release_contact(text) from public, anon, authenticated;
grant execute on function public.enqueue(text, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_jobs(int, int, int) to service_role;
grant execute on function public.release_contact(text) to service_role;

grant select on public.settings, public.contacts, public.tone_profiles to authenticated;
grant update (global_enabled, pause_minutes, reply_delay_sec, trigger_phrases, intro_message, updated_at)
  on public.settings to authenticated;
grant update (auto_enabled, paused_until, profile_id) on public.contacts to authenticated;
grant update (style_guide, stats, updated_at) on public.tone_profiles to authenticated;

create policy owner_all on public.settings      for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.contacts      for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all on public.tone_profiles for all to authenticated using (public.is_owner()) with check (public.is_owner());
-- queue / messages / send_log: authenticated 정책·권한 없음 → service_role(api.php) 경유로만 조회

-- ─────────────────────────────────────────────
-- 약속 기능 (migrations/002_appointments.sql 과 동일 내용)
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 서버 비밀 저장소 (migrations/003_app_secrets.sql 과 동일 내용)
-- ─────────────────────────────────────────────
create table public.app_secrets (
  key        text primary key,
  value      text not null,                 -- enc() 로 암호화한 값
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
-- 정책·권한 없음 → service 키(Worker)만 접근

-- ─────────────────────────────────────────────
-- 약속 무조건 수락 명단 (migrations/004_appt_accept.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.contacts add column appt_accept boolean not null default false;
grant update (appt_accept) on public.contacts to authenticated;
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('requested', 'accepted', 'planned', 'proposed', 'done', 'cancelled'));

-- ─────────────────────────────────────────────
-- 지금 내 상황 (migrations/005_owner_status.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.settings
  add column owner_status    text,          -- 예: '카페', '자는 중', 직접 입력한 문장
  add column owner_area      text,          -- 예: '논현동'
  add column owner_status_at timestamptz;   -- 설정 시각 (오래된 상황인지 봇이 판단)
grant update (owner_status, owner_area, owner_status_at) on public.settings to authenticated;

-- ─────────────────────────────────────────────
-- 캘린더 (migrations/006_calendar.sql 과 동일 내용)
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 자동발송 끈 시각 (migrations/007_auto_off_at.sql 과 동일 내용)
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 새벽 작업 시각 (migrations/008_daily_run_at.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.settings add column if not exists daily_run_at timestamptz;

-- ─────────────────────────────────────────────
-- 오너가 직접 고치는 봇 규칙 (migrations/009_owner_rules.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.settings
  -- 답장에 들어 있으면 보내지 않는 표현 (띄어쓰기·문장부호 무시하고 비교)
  add column if not exists banned_phrases text[] not null default '{하자요}',
  -- 내 말 사전·추가 규칙 (한 줄에 하나, 봇 프롬프트에 그대로 들어감)
  add column if not exists my_glossary text not null default '- ㅖㅏ·예ㅏ = 예아, ㅔㅏ = 네아 = 응, 알았다(동의·확인). 상대가 이렇게 말하면 알았다는 뜻이고, 나도 알았다고 할 때 ㅖㅏ 나 예아 를 쓸 수 있다.
- 고트 = GOAT(Greatest Of All Time) = 신과 같다, 최고라는 칭찬.
- 존댓말로 권하거나 제안할 때는 "~하시죠", "~하도록 하죠"를 쓴다.',
  -- 오랜만에 연락 온 사람에게 할 근황 답
  add column if not exists catchup_text text not null default '- 상대가 뭐하고 사냐, 뭐하고 지내냐, 요즘 어떠냐 같은 근황을 물으면 일하면서 지낸다는 식으로 답한다.
- 무슨 일 하냐, 전에 하던 일 계속 하냐고 물으면 개발자 일 하고 있다고 답한다.',
  -- 며칠 만의 연락부터 '오랜만'으로 볼지
  add column if not exists long_gap_days int not null default 90 check (long_gap_days between 7 and 3650);
grant update (banned_phrases, my_glossary, catchup_text, long_gap_days) on public.settings to authenticated;

-- ─────────────────────────────────────────────
-- 약속 시각·거절 상태·존댓말 약속 문구 (migrations/010_appointment_time.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.appointments add column if not exists time_hm text
  check (time_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');           -- 약속 시각 (없으면 날짜만)
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('requested', 'accepted', 'declined', 'planned', 'proposed', 'done', 'cancelled'));
-- declined: 캘린더 일정·약속과 겹쳐서 봇이 "그날은 약속이 있어"로 거절함 (오너가 처리할 필요 없음)

alter table public.settings add column if not exists appointment_message_formal text not null default '{date}에 뵐까요?';
grant update (appointment_message_formal) on public.settings to authenticated;

-- ─────────────────────────────────────────────
-- 주의 필요 이유·전체 끄기 시각 (migrations/011_review_reason.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.queue add column if not exists review_enc text;          -- enc(JSON {note, draft}) — 메시지 원문이 들어 있으니 암호화
alter table public.settings add column if not exists bulk_off_at timestamptz;  -- 마지막 '전체 끄기'로 꺼진 시각 (그 사람들만 '전체 켜기'로 되돌림)
grant update (bulk_off_at) on public.settings to authenticated;

-- ─────────────────────────────────────────────
-- 알림·약속 바로 답하기 (migrations/012_alerts_appt_reply.sql 과 동일 내용)
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 상대별 관계·성별·메모 (migrations/013_contact_relation.sql 과 동일 내용)
-- ─────────────────────────────────────────────
alter table public.contacts
  add column if not exists relation text,                                   -- 형, 누나, 선배, 동생, 동갑, 친구, 고객, 선생님 … (직접 입력 가능)
  add column if not exists gender text check (gender in ('남자', '여자')),
  add column if not exists memo text;                                       -- 예: '반말 쓰는 형', '존댓말 쓰는 동생', '대학 동기'
grant update (relation, gender, memo) on public.contacts to authenticated;

-- Claude 사용량 기록 (migrations/015_claude_usage.sql 과 동일 내용)
create table public.claude_usage (
  day            date   not null,               -- 한국 날짜
  kind           text   not null,               -- reply(답장) | preview(미리보기) | summary(요약)
  calls          int    not null default 0,
  input_tokens   bigint not null default 0,     -- 캐시 안 된 입력
  output_tokens  bigint not null default 0,     -- 출력 (생각 포함)
  cache_read     bigint not null default 0,     -- 캐시에서 읽은 입력 (입력 요금의 10%)
  cache_write_5m bigint not null default 0,     -- 캐시 만들기 5분 (1.25배)
  cache_write_1h bigint not null default 0,     -- 캐시 만들기 1시간 (2배)
  primary key (day, kind)
);
alter table public.claude_usage enable row level security;
revoke all on public.claude_usage from anon, authenticated;
grant select on public.claude_usage to authenticated;
create policy owner_read on public.claude_usage for select to authenticated using (public.is_owner());

-- 워커가 실행 1회에 한 번 더함 (실행이 겹쳐도 합계가 맞게 DB 에서 더함)
create or replace function public.add_usage(p_rows jsonb) returns void
language sql as $$
  insert into claude_usage as u (day, kind, calls, input_tokens, output_tokens, cache_read, cache_write_5m, cache_write_1h)
  select r.day, r.kind, r.calls, r.input_tokens, r.output_tokens, r.cache_read, r.cache_write_5m, r.cache_write_1h
  from jsonb_to_recordset(p_rows) as r(day date, kind text, calls int, input_tokens bigint, output_tokens bigint,
                                       cache_read bigint, cache_write_5m bigint, cache_write_1h bigint)
  on conflict (day, kind) do update set
    calls          = u.calls + excluded.calls,
    input_tokens   = u.input_tokens + excluded.input_tokens,
    output_tokens  = u.output_tokens + excluded.output_tokens,
    cache_read     = u.cache_read + excluded.cache_read,
    cache_write_5m = u.cache_write_5m + excluded.cache_write_5m,
    cache_write_1h = u.cache_write_1h + excluded.cache_write_1h
$$;
revoke execute on function public.add_usage(jsonb) from public, anon, authenticated;
grant execute on function public.add_usage(jsonb) to service_role;

-- 말투 재학습·기억 메모·요약 암호화·답장 타이밍 (migrations/016_learning_memory.sql 과 동일 내용)

-- 말투 재학습: 바로 전 지침·예시를 남겨 대시보드에서 되돌리기
alter table public.tone_profiles
  add column if not exists style_guide_prev  text,
  add column if not exists examples_prev_enc text,
  add column if not exists learned_at        timestamptz;   -- 마지막 자동 재학습 (null = 내보내기 파일로 만든 그대로)

alter table public.settings
  add column if not exists auto_learn          boolean not null default true,   -- 주 1회 말투 재학습
  add column if not exists reply_delay_max_sec int not null default 180 check (reply_delay_max_sec between 0 and 600),
  add column if not exists typing_indicator    boolean not null default true;   -- 보내기 전 '입력 중…' 표시
grant update (auto_learn, reply_delay_max_sec, typing_indicator) on public.settings to authenticated;

-- 요약은 대화 내용이라 암호화 (대시보드는 API 로 복호화해서 받음). 예전 평문 요약(summary)은 지우지 않고 새벽 작업이 하루 10개씩 암호화로 옮김
alter table public.contacts add column if not exists summary_enc text;

-- 기억 메모: 상대가 말한 일정·취향 (답장할 때 [기억]으로 넣음). 상대당 최근 10개, 날짜 지난 일정은 7일 뒤 삭제
create table public.contact_facts (
  id         bigint generated always as identity primary key,
  igsid      text not null references public.contacts(igsid) on delete cascade,
  fact_enc   text not null,
  event_date date,
  created_at timestamptz not null default now()
);
create index contact_facts_igsid on public.contact_facts (igsid, created_at desc);
alter table public.contact_facts enable row level security;
revoke all on public.contact_facts from anon, authenticated;   -- 서버만 (원문은 암호문)

-- 재학습 대상: 마지막 학습 뒤 내가 직접 보낸 메시지가 충분히 쌓인 상대 (프로필 있으면 20개, 새로 만들면 30개), 학습은 7일에 한 번
create or replace function public.learn_candidates(p_limit int)
returns table (igsid text, profile_id bigint, username text, name text, n bigint)
language sql stable as $$
  select c.igsid, p.id, c.username, c.name, count(m.id)
  from contacts c
  left join tone_profiles p on p.id = c.profile_id
  join messages m on m.igsid = c.igsid and m.direction = 'owner' and m.ts > coalesce(p.learned_at, '-infinity')
  where (p.id is null or not p.is_default)
    and (p.learned_at is null or p.learned_at < now() - interval '7 days')
  group by c.igsid, p.id, c.username, c.name
  having count(m.id) >= case when p.id is null then 30 else 20 end
  order by count(m.id) desc
  limit p_limit
$$;
revoke execute on function public.learn_candidates(int) from public, anon, authenticated;
grant execute on function public.learn_candidates(int) to service_role;

-- 답장 대기: 상대별로 내가 실제로 답하던 속도(재학습 통계 reply_sec) 근처에서 무작위, 상한은 설정값
create or replace function public.enqueue(
  p_kind text, p_mid text, p_igsid text, p_payload_enc text, p_event_ts timestamptz
) returns boolean
language plpgsql as $$
declare
  v_delay int;
  v_id bigint;
begin
  insert into contacts (igsid) values (p_igsid) on conflict do nothing;

  v_delay := case p_kind
    when 'inbound' then (
      select greatest(s.reply_delay_sec,
               least(s.reply_delay_max_sec,
                     coalesce((p.stats->>'reply_sec')::numeric * (0.7 + random() * 0.6), 0)))::int
      from settings s
      left join contacts c on c.igsid = p_igsid
      left join tone_profiles p on p.id = c.profile_id
      where s.id = 1)
    when 'echo'    then 15                         -- 봇 발송 기록(ig_mid)이 먼저 저장될 시간
    else 0 end;

  insert into queue (kind, mid, igsid, payload_enc, event_ts, not_before)
  values (p_kind, p_mid, p_igsid, p_payload_enc, p_event_ts, now() + make_interval(secs => v_delay))
  on conflict (mid) do nothing
  returning id into v_id;

  if v_id is not null then
    update contacts set
      last_msg_at      = greatest(coalesce(last_msg_at, p_event_ts), p_event_ts),
      last_user_msg_at = case when p_kind = 'inbound'
                              then greatest(coalesce(last_user_msg_at, p_event_ts), p_event_ts)
                              else last_user_msg_at end
    where igsid = p_igsid;
  end if;
  return v_id is not null;
end $$;
revoke execute on function public.enqueue(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue(text, text, text, text, timestamptz) to service_role;
