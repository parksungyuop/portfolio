-- 011: 주의 필요 카드에 '봇 판단'·'보내려다 멈춘 답' 표시 + '전체 켜기'가 일부러 꺼 둔 사람은 건드리지 않게
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.queue add column if not exists review_enc text;          -- enc(JSON {note, draft}) — 메시지 원문이 들어 있으니 암호화
alter table public.settings add column if not exists bulk_off_at timestamptz;  -- 마지막 '전체 끄기'로 꺼진 시각 (그 사람들만 '전체 켜기'로 되돌림)
grant update (bulk_off_at) on public.settings to authenticated;
