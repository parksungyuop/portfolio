-- 016: 말투 재학습 · 기억 메모 · 요약 암호화 · 답장 타이밍
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.

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
