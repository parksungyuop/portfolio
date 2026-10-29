-- 015: Claude 사용량 기록 (하루·종류별 토큰 합계 → 대시보드 설정 탭에 표시)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
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
