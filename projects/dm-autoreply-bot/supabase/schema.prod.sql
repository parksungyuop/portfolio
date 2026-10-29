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
