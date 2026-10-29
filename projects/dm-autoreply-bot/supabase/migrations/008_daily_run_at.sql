-- 008: 새벽 유지 작업(토큰 갱신·정리·요약)이 마지막으로 돈 시각 → 대시보드에서 멈춤 감지
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.settings add column if not exists daily_run_at timestamptz;
