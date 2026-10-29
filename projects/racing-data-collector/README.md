# 경마 데이터 수집기

example-racing.site의 공개 JSON API를 분석해 개최일·경주·출주·배당 데이터를 SQLite로 수집하는 스크립트.

- `racing_api_schema.md` — 개발자 도구 네트워크 탭으로 확인한 엔드포인트와 응답 구조
- `schema_kra.sql` — 수집 DB 스키마
- `collect_racing.py` — 수집기 (Python 표준 라이브러리만 사용: urllib, sqlite3)

```bash
python collect_racing.py
```
