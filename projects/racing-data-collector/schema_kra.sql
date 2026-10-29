-- ============================================================
-- 한국마사회(KRA) 공공데이터 API → RACE 구조 DB 스키마 (PostgreSQL)
-- 구조: events(경주일) → races(경주) → entries(출주=결과), dividends(배당)
--       + horses / jockeys / trainers / owners 마스터
-- 각 컬럼 주석 = KRA API 응답 필드명.  API 코드는 data.go.kr 기준.
--   경주계획표 API214_1 · 경주성적 API4_3 · 마필 API8_2 · 기수 API12_1
--   조교사 API19_1 · 마주정보 API · 경주별 배당률 API
-- ============================================================

-- ---------- 마스터 ----------
CREATE TABLE owners (
  ow_no      VARCHAR(10) PRIMARY KEY,   -- owNo
  ow_name    VARCHAR(100) NOT NULL,     -- owName
  meet       SMALLINT,                  -- meet (1 서울 2 제주 3 부경)
  silk_image_url VARCHAR(255)           -- KRA 미제공, 직접 업로드 (RACE silk_image_url)
);

CREATE TABLE trainers (
  tr_no      VARCHAR(10) PRIMARY KEY,   -- trNo
  tr_name    VARCHAR(50) NOT NULL,      -- trName
  meet       SMALLINT,                  -- meet
  birthday   DATE,                      -- birthday
  st_date    DATE,                      -- stDate (데뷔)
  status     VARCHAR(10) DEFAULT 'Active'
);

CREATE TABLE jockeys (
  jk_no      VARCHAR(10) PRIMARY KEY,   -- jkNo
  jk_name    VARCHAR(50) NOT NULL,      -- jkName
  meet       SMALLINT,                  -- meet
  birthday   DATE,                      -- birthday
  debut      DATE,                      -- debut
  part       VARCHAR(20),               -- part (프리/소속조)
  wg_other   NUMERIC(4,1),              -- wgOther (타조 최저부담)
  wg_part    NUMERIC(4,1),              -- wgPart  (소속조 최저부담)
  status     VARCHAR(10) DEFAULT 'Active'
);

CREATE TABLE horses (
  hr_no        VARCHAR(10) PRIMARY KEY, -- hrNo
  hr_name      VARCHAR(50) NOT NULL,    -- hrName
  meet         SMALLINT,                -- meet
  sex          VARCHAR(4),              -- sex (수/암/거)
  birthday     DATE,                    -- birthday
  name_origin  VARCHAR(10),             -- name (국산/외산: RACE bred_country)
  rank         VARCHAR(10),             -- rank (등급: RACE class)
  rating       NUMERIC(5,1),            -- rating (현재)
  fa_hr_name   VARCHAR(50),             -- faHrName (부마: sire)
  mo_hr_name   VARCHAR(50),             -- moHrName (모마: dam)
  ow_no        VARCHAR(10) REFERENCES owners,   -- owNo
  tr_no        VARCHAR(10) REFERENCES trainers, -- trNo
  status       VARCHAR(10) DEFAULT 'Active'     -- 현역/말소
);

-- ---------- 경주일 (RACE events) ----------
CREATE TABLE events (
  event_id   SERIAL PRIMARY KEY,
  rc_date    DATE NOT NULL,             -- rcDate
  meet       SMALLINT NOT NULL,         -- meet (RACE venue)
  race_count SMALLINT,
  status     VARCHAR(12) DEFAULT 'Scheduled', -- Scheduled/Completed
  UNIQUE (rc_date, meet)
);

-- ---------- 경주 (RACE races) ----------
CREATE TABLE races (
  race_id      SERIAL PRIMARY KEY,
  event_id     INT NOT NULL REFERENCES events,
  rc_no        SMALLINT NOT NULL,       -- rcNo (race_number)
  rc_name      VARCHAR(100),            -- rcName (title)
  rc_dist      SMALLINT,                -- rcDist
  rank         VARCHAR(10),             -- rank (등급: class)
  age_cond     VARCHAR(10),             -- ageCond
  budam        VARCHAR(10),             -- budam (부담구분: 별정/마령/핸디)
  prize_cond   VARCHAR(50),             -- prizeCond
  track        VARCHAR(10),             -- track (주로상태: 건조/다습…)
  weather      VARCHAR(10),             -- weather
  st_time      TIME,                    -- stTime (scheduled_time)
  chaksun_1    INT, chaksun_2 INT, chaksun_3 INT,
  chaksun_4    INT, chaksun_5 INT,      -- chaksun1~5 (prize_money_1st~5th)
  prize_money  INT GENERATED ALWAYS AS
    (COALESCE(chaksun_1,0)+COALESCE(chaksun_2,0)+COALESCE(chaksun_3,0)
    +COALESCE(chaksun_4,0)+COALESCE(chaksun_5,0)) STORED,
  win_time     VARCHAR(10),             -- 1착 rcTime (race_winning_time)
  -- 구간 누적기록 (우승마 기준, 경주성적 API): RACE sectional_time_n
  sec_s1f_time NUMERIC(5,1),            -- buS1fAccTime
  sec_g3f_time NUMERIC(5,1),            -- buG3fAccTime
  sec_g2f_time NUMERIC(5,1),            -- buG2fAccTime
  sec_g1f_time NUMERIC(5,1),            -- buG1fAccTime
  bet_types    VARCHAR(100),            -- KRA 미제공, 수동 (RACE bet)
  replay_url   VARCHAR(255),            -- KRA 미제공, 수동
  photo_finish VARCHAR(255),            -- KRA 미제공, 수동
  results_status VARCHAR(12) DEFAULT 'Pending', -- Pending/Official
  note         TEXT,
  UNIQUE (event_id, rc_no)
);

-- ---------- 출주 = 결과 (RACE entries, 한 테이블) ----------
CREATE TABLE entries (
  entry_id     SERIAL PRIMARY KEY,
  race_id      INT NOT NULL REFERENCES races,
  hr_no        VARCHAR(10) NOT NULL REFERENCES horses,   -- hrNo
  jk_no        VARCHAR(10) REFERENCES jockeys,           -- jkNo
  tr_no        VARCHAR(10) REFERENCES trainers,          -- trNo
  ow_no        VARCHAR(10) REFERENCES owners,            -- owNo
  -- 출주표 (경주계획표 API)
  chul_no      SMALLINT NOT NULL,       -- chulNo (horse_number = barrier, KRA는 동일)
  wg_budam     NUMERIC(4,1),            -- wgBudam (jockey_weight 부담중량)
  wg_hr        SMALLINT,                -- wgHr (horse_weight)
  wg_hr_diff   SMALLINT,                -- wgHrDiff (전주 대비 증감)
  rating_before NUMERIC(5,1),           -- rating (계획표 시점: domestic_rating_before)
  age          SMALLINT,                -- age
  -- 결과 (경주성적 API)
  horse_status VARCHAR(12) DEFAULT 'Entered', -- Entered/Finished/Scratched(출전취소)
  ord          SMALLINT,                -- ord (finish_position)
  rc_time      VARCHAR(10),             -- rcTime (finish_time)
  diff_unit    VARCHAR(10),             -- diffUnit (margin: 착차, "1 1/2" 등)
  win_odds     NUMERIC(6,1),            -- winOdds (win_dividend 단승)
  plc_odds     NUMERIC(6,1),            -- plcOdds (연승)
  -- 구간별 통과순위/기록 (RACE 800m/400m_position, sectional_position_n)
  s1f_ord      SMALLINT,                -- s1fOrd
  g3f_ord      SMALLINT,                -- g3fOrd
  g2f_ord      SMALLINT,                -- g2fOrd  ≈ RACE 400m_position
  g1f_ord      SMALLINT,                -- g1fOrd
  s1f_time     NUMERIC(5,1),            -- buS1fTime
  g3f_time     NUMERIC(5,1),            -- buG3fTime
  g2f_time     NUMERIC(5,1),            -- buG2fTime
  g1f_time     NUMERIC(5,1),            -- buG1fTime
  rating_after NUMERIC(5,1),            -- 성적 확정 후 rating (domestic_rating_after)
  UNIQUE (race_id, chul_no),
  UNIQUE (race_id, hr_no)
);

-- ---------- 배당 (RACE dividends, 정규화) ----------
CREATE TABLE dividends (
  dividend_id   SERIAL PRIMARY KEY,
  race_id       INT NOT NULL REFERENCES races,
  dividend_type VARCHAR(8) NOT NULL,    -- 단승/연승/복승/쌍승/복연승/삼복승/삼쌍승
  combination   VARCHAR(20) NOT NULL,   -- "8/1/2" (마번 조합)
  winning_amount NUMERIC(10,1) NOT NULL,-- 배당률 (100원 기준)
  stake         INT DEFAULT 100,
  is_refund     BOOLEAN DEFAULT FALSE,  -- 환불
  UNIQUE (race_id, dividend_type, combination)
);

-- ---------- 심판/제재 (RACE stewards) ----------
CREATE TABLE sanctions (
  sanction_id  SERIAL PRIMARY KEY,
  event_id     INT REFERENCES events,
  target_type  VARCHAR(8) NOT NULL,     -- jockey/trainer/horse
  target_no    VARCHAR(10) NOT NULL,    -- jkNo / trNo / hrNo
  kind         VARCHAR(20),             -- 기승정지/과태료/출전정지 (RACE fines/suspensions)
  from_date    DATE, to_date DATE,
  reason       TEXT
);

-- ---------- 인덱스 ----------
CREATE INDEX ix_entries_hr  ON entries (hr_no, race_id);
CREATE INDEX ix_entries_jk  ON entries (jk_no, race_id);
CREATE INDEX ix_entries_tr  ON entries (tr_no, race_id);
CREATE INDEX ix_races_event ON races (event_id);

-- ---------- 집계 뷰 (RACE 성적요약 / 최근5전 / 리더보드는 저장 안 하고 계산) ----------
CREATE VIEW v_horse_summary AS
SELECT hr_no,
       COUNT(*) FILTER (WHERE ord IS NOT NULL) AS runs,
       COUNT(*) FILTER (WHERE ord=1) AS win1,
       COUNT(*) FILTER (WHERE ord=2) AS win2,
       COUNT(*) FILTER (WHERE ord=3) AS win3,
       COUNT(*) FILTER (WHERE ord=4) AS win4
FROM entries GROUP BY hr_no;

CREATE VIEW v_jockey_summary AS
SELECT jk_no, COUNT(*) AS rides,
       COUNT(*) FILTER (WHERE ord=1) AS wins,
       ROUND(100.0*COUNT(*) FILTER (WHERE ord=1)/NULLIF(COUNT(*),0),1) AS win_pct
FROM entries WHERE ord IS NOT NULL GROUP BY jk_no;

-- ponytail: 레이팅 이력은 RACE처럼 entries.rating_before/after 로만 보관.
--           별도 히스토리 테이블은 등급조정 조회 요구 생기면 추가.
