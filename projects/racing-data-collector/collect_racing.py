"""example-racing.site 공개 API → KRA 형식 SQLite (race.db)
사용: python collect_racing.py [max_event_id]
"""
import json, sqlite3, sys, time, urllib.request, urllib.error

BASE = "https://example-racing.site/api/"
DB = "race.db"

DDL = """
CREATE TABLE IF NOT EXISTS owners  (ow_no TEXT PRIMARY KEY, ow_name TEXT NOT NULL, meet TEXT, silk_image_url TEXT);
CREATE TABLE IF NOT EXISTS trainers(tr_no TEXT PRIMARY KEY, tr_name TEXT NOT NULL, meet TEXT, birthday TEXT, st_date TEXT, status TEXT DEFAULT 'Active');
CREATE TABLE IF NOT EXISTS jockeys (jk_no TEXT PRIMARY KEY, jk_name TEXT NOT NULL, meet TEXT, birthday TEXT, debut TEXT, part TEXT, wg_other REAL, wg_part REAL, status TEXT DEFAULT 'Active');
CREATE TABLE IF NOT EXISTS horses  (hr_no TEXT PRIMARY KEY, hr_name TEXT NOT NULL, meet TEXT, sex TEXT, birthday TEXT, name_origin TEXT, rank TEXT, rating REAL,
                                    fa_hr_name TEXT, mo_hr_name TEXT, ow_no TEXT, tr_no TEXT, status TEXT DEFAULT 'Active');
CREATE TABLE IF NOT EXISTS events  (event_id INTEGER PRIMARY KEY, rc_date TEXT NOT NULL, meet TEXT NOT NULL, race_count INTEGER, status TEXT, UNIQUE(rc_date, meet));
CREATE TABLE IF NOT EXISTS races   (race_id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events, rc_no INTEGER NOT NULL, rc_name TEXT, rc_dist INTEGER,
                                    rank TEXT, age_cond TEXT, budam TEXT, prize_cond TEXT, track TEXT, weather TEXT, st_time TEXT,
                                    chaksun_1 INTEGER, chaksun_2 INTEGER, chaksun_3 INTEGER, chaksun_4 INTEGER, chaksun_5 INTEGER, prize_money INTEGER,
                                    win_time TEXT, sec_1 REAL, sec_2 REAL, sec_3 REAL, sec_4 REAL, sec_5 REAL,
                                    bet_types TEXT, replay_url TEXT, replay_drone TEXT, replay_frontal TEXT, photo_finish TEXT,
                                    results_status TEXT, note TEXT, added_prize TEXT, breeders_purse TEXT, sponsored_by TEXT, UNIQUE(event_id, rc_no));
CREATE TABLE IF NOT EXISTS entries (entry_id INTEGER PRIMARY KEY, race_id INTEGER NOT NULL REFERENCES races, hr_no TEXT NOT NULL, jk_no TEXT, tr_no TEXT, ow_no TEXT,
                                    chul_no INTEGER, barrier INTEGER, wg_budam REAL, wg_hr REAL, wg_hr_diff REAL, rating_before REAL, age INTEGER,
                                    horse_status TEXT, ord INTEGER, rc_time TEXT, diff_unit TEXT, win_odds REAL, plc_odds REAL,
                                    g4f_ord INTEGER, g2f_ord INTEGER,
                                    sec_time_1 REAL, sec_pos_1 INTEGER, sec_time_2 REAL, sec_pos_2 INTEGER, sec_time_3 REAL, sec_pos_3 INTEGER,
                                    sec_time_4 REAL, sec_pos_4 INTEGER, sec_time_5 REAL, sec_pos_5 INTEGER,
                                    rating_after REAL, last_5_runs TEXT, best_time TEXT, sfd TEXT, UNIQUE(race_id, hr_no));
CREATE TABLE IF NOT EXISTS dividends(dividend_id INTEGER PRIMARY KEY, race_id INTEGER NOT NULL REFERENCES races, dividend_type TEXT, combination TEXT,
                                    winning_amount REAL, stake REAL, is_refund INTEGER DEFAULT 0, UNIQUE(race_id, dividend_type, combination));
CREATE INDEX IF NOT EXISTS ix_entries_hr ON entries(hr_no, race_id);
CREATE INDEX IF NOT EXISTS ix_entries_jk ON entries(jk_no, race_id);
CREATE INDEX IF NOT EXISTS ix_entries_tr ON entries(tr_no, race_id);
"""


def get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def upsert(cur, table, row):
    cols = ", ".join(row)
    q = ", ".join("?" * len(row))
    cur.execute(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({q})", list(row.values()))


def num(v):
    try:
        return float(v) if v not in (None, "", "-") else None
    except ValueError:
        return None


def load_race(cur, ev, r):
    data = get(f"race-page/race/{r['id']}/view/results")
    if not data:
        return 0
    race, entries, divs = data["race"], data.get("entries", []), data.get("dividends", [])
    winner = next((e for e in entries if e.get("finish_position") == 1), None)
    upsert(cur, "races", {
        "race_id": race["id"], "event_id": ev["id"], "rc_no": race["race_number"], "rc_name": race["title"],
        "rc_dist": race["distance"], "rank": race["class"], "track": race["track_condition"], "st_time": race["scheduled_time"],
        "chaksun_1": num(race["prize_money_1st"]), "chaksun_2": num(race["prize_money_2nd"]), "chaksun_3": num(race["prize_money_3rd"]),
        "chaksun_4": num(race["prize_money_4th"]), "chaksun_5": num(race["prize_money_5th"]), "prize_money": race["prize_money"],
        "win_time": winner["finish_time"] if winner else None,
        "sec_1": num(race["sectional_time_1"]), "sec_2": num(race["sectional_time_2"]), "sec_3": num(race["sectional_time_3"]),
        "sec_4": num(race["sectional_time_4"]), "sec_5": num(race["sectional_time_5"]),
        "bet_types": race["bet"], "replay_url": race["race_replay_video"], "replay_drone": race["race_replay_video_drone"],
        "replay_frontal": race["race_replay_video_frontal"], "photo_finish": race["photo_finish_image"],
        "results_status": race["results_status"], "note": race["note"], "added_prize": race["added_prize"],
        "breeders_purse": race["breeders_purse"], "sponsored_by": race["sponsored_by"],
    })
    for e in entries:
        hr, jk, tr = str(e["horse_id"]), str(e["jockey_id"]) if e.get("jockey_id") else None, str(e["trainer_id"]) if e.get("trainer_id") else None
        ow = e.get("owner_name") or None  # RACE는 마주 ID 미노출 → 이름을 키로 사용
        if ow:
            upsert(cur, "owners", {"ow_no": ow, "ow_name": ow, "meet": ev["venue"], "silk_image_url": e.get("silk_image_url")})
        if tr:
            upsert(cur, "trainers", {"tr_no": tr, "tr_name": e["trainer_name"], "meet": ev["venue"]})
        if jk:
            upsert(cur, "jockeys", {"jk_no": jk, "jk_name": e["jockey_name"], "meet": ev["venue"], "status": e.get("global_jockey_status")})
        upsert(cur, "horses", {
            "hr_no": hr, "hr_name": e["horse_name"], "meet": ev["venue"], "sex": e.get("horse_gender"), "birthday": e.get("birthdate"),
            "name_origin": e.get("bred_country"), "rank": race["class"], "rating": num(e.get("horse_rating")),
            "fa_hr_name": e.get("sire_name"), "mo_hr_name": e.get("dam_name"), "ow_no": ow, "tr_no": tr, "status": e.get("global_horse_status"),
        })
        upsert(cur, "entries", {
            "entry_id": e["id"], "race_id": race["id"], "hr_no": hr, "jk_no": jk, "tr_no": tr, "ow_no": ow,
            "chul_no": num(e.get("horse_number")), "barrier": e.get("barrier"),
            "wg_budam": num(e.get("jockey_weight")), "wg_hr": num(e.get("horse_weight")), "rating_before": num(e.get("domestic_rating_before")),
            "horse_status": e.get("horse_status"), "ord": e.get("finish_position"), "rc_time": e.get("finish_time"), "diff_unit": e.get("margin"),
            "win_odds": num(e.get("win_dividend")), "g4f_ord": e.get("800m_position"), "g2f_ord": e.get("400m_position"),
            **{f"sec_time_{i}": num(e.get(f"sectional_time_{i}")) for i in range(1, 6)},
            **{f"sec_pos_{i}": e.get(f"sectional_position_{i}") for i in range(1, 6)},
            "rating_after": num(e.get("domestic_rating_after")), "last_5_runs": e.get("last_5_runs"), "best_time": e.get("best_time"), "sfd": e.get("sfd"),
        })
    for d in divs:
        upsert(cur, "dividends", {"dividend_id": d["id"], "race_id": race["id"], "dividend_type": d["dividend_type"], "combination": d["combination"],
                                  "winning_amount": num(d["winning_amount"]), "stake": num(d["stake"]), "is_refund": d.get("is_refund", 0)})
    return len(entries)


def main(max_event=400, start=1):
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.executescript(DDL)
    misses = 0
    for eid in range(start, max_event + 1):
        data = get(f"race-page/event/{eid}")
        if not data or not data.get("event"):
            misses += 1
            if misses >= 15:  # ponytail: 연속 15개 404면 끝으로 간주
                break
            continue
        misses = 0
        ev, races = data["event"], data.get("race_ids", [])
        upsert(cur, "events", {"event_id": ev["id"], "rc_date": ev["date"], "meet": ev["venue"], "race_count": len(races), "status": ev["status"]})
        n = sum(load_race(cur, ev, r) for r in races)
        con.commit()
        print(f"event {eid} {ev['date']} {ev['venue']}: {len(races)} races, {n} entries")
        time.sleep(0.2)
    for t in ("events", "races", "entries", "dividends", "horses", "jockeys", "trainers", "owners"):
        print(t, cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
    assert cur.execute("SELECT COUNT(*) FROM entries WHERE ord=1").fetchone()[0] > 0, "no winners loaded"
    con.close()


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 400, int(sys.argv[2]) if len(sys.argv) > 2 else 1)
