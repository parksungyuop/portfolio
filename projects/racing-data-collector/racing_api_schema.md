# example-racing.site API / DB 구조 (F12 네트워크 탭 기준, 2026-09-18 확인)

프론트: 정적 HTML + `assets/js/dist/*.js` 가 `/api/*` JSON 호출 → DOM 렌더.
ID: 내부 정수 id + 외부용 `encoded_id`(4자리 base36 유사, 예 hr9y) 병행.

## 엔드포인트
| 페이지 | 엔드포인트 |
|---|---|
| 결과/레이스카드 | GET /api/race-page/event?type=results (최신 개최일 + race 목록) |
|  | GET /api/race-page/race/{race_id}/view/results  ← race + entries + dividends |
|  | GET /api/race-page/race/{race_id}/view/card |
|  | GET /results/print/{event_id}/{race_id}?format=csv (CSV) |
| 기수 | GET /api/jockey-page/details/{enc} · stats/{enc} · rides/{enc}?page&limit |
| 심판보고 | GET /api/stewards-report/latest-date · years · events?year&month · ?event_id= |
| 일정 | GET /api/fixtures-page?m=&y=&venue=&published=1 |
| 레이팅 | GET /api/horse-ratings |
| 트랙레코드 | GET /api/track-records |
| 방문추적 | POST /api/track-visit |
| 이미지 | /uploads/owners/*.png (마주복) · /uploads/photo_finish/pf_{race_id}_{ts}.jpg |

## 테이블 (응답 키 = 컬럼)

### events (개최일)
id, title, date, declaration_closing, venue, image_url, description, planned_races,
sponsor, status(Completed…), electronic_draw_video, is_published, created_at, encoded_id

### races
id, event_id, planned_race_title, race_number, title, distance, type, is_barrier,
surface(Dirt), track, track_condition, weight, class, rating,
prize_money, prize_money_1st..6th, status, scheduled_time,
photo_finish_image, race_replay_video / _drone / _frontal,
electronic_draw_video, electronic_draw_date, is_live_draw, draw_mode(barrier_seq),
bet(발매권종 문자열), dividend_status, results_note, results_status(Official),
sectional_time_1..5, note, added_prize, breeders_purse, sponsored_by, created_at

### entries (출주 = 결과, 한 테이블. race 1:N)
id, race_id, horse_id, jockey_id, trainer_id, horse_status(Finished/Scratched…),
finish_position, horse_number, barrier, horse_weight, jockey_weight, apprentice_allowance,
finish_time, margin, win_dividend, 800m_position, 400m_position,
domestic_rating_before/after, international_rating1/2_before/after, display_rating,
sectional_time_1..5, sectional_position_1..5, last_5_runs, best_time, sfd
(+ 조인으로 horse_name, sire_name, dam_name, owner_name, breeder_name, silk_image_url 등 평면화)

### dividends (race 1:N)
id, race_id, dividend_type(WIN/PLA/FC/TRI/QRT/SIX/DD/WTA…), combination("8/1/2"),
winning_amount, stake, is_refund, created_at, updated_at

### horses
id, name, gender(Horse/Mare…), color, birthdate, age, bred_country, status,
rating(현재), previous_rating, description, sire_name, dam_name,
owner(id/name), trainer(id/name), breeder(id/name), total_runs, encoded_id

### jockeys
id, name, date_of_birth, license_number, nationality, image_url, status,
apprentice_allowance, created_at (stats: rides/wins/seconds/thirds/fourths 는 집계)

### trainers / owners / breeders
id, name (+ owners: silk_image_url)

### stewards_reports (event 1:1) + 하위 vet / fines / suspensions / followups
pdf_url

### fixtures.race_list — JSON 문자열을 `||` 로 이어붙인 형태(비정규화)
type, age, class, distance, title, special_days/starts/gender/country/max_wins

### track_records
distance, finish_time, finish_time_seconds, horse_id, horse_name, jockey_name, trainer_name, date, track(Outer)

## 참고
- 결과와 레이스카드가 같은 entries 행 (출주 등록 후 finish_* 컬럼만 채움).
- 레이팅 이력은 entries 의 before/after 로 보관 (별도 히스토리 테이블 없음).
- 구간기록은 race(우승마)와 entry(각 마필) 양쪽에 저장.
- 인증 없음, CORS 제한 없음 → 수집 스크립트로 바로 fetch 가능.
