"""
인스타 "내 정보 다운로드"(JSON) → 상대별 오너 말투 프로필 생성 → Supabase 업로드.
오너 PC 에서 1회 실행. 표준 라이브러리만 사용 (업로드 시 암호화에만 `pip install cryptography`).

  python analyze_tone.py <내보내기 폴더> --dry-run          # 업로드 없이 profiles_preview.json 생성 (먼저 확인용)
  python analyze_tone.py <내보내기 폴더> --env tone.env     # 생성 + 업로드
  python analyze_tone.py --self-test

tone.env (KEY=VALUE, 이 파일은 절대 공유/업로드 금지):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=...
  ANTHROPIC_API_KEY=...          # 없으면 --no-claude 로 통계 기반 지침만 생성
  ENC_KEY_B64=...                # 서버 config.php 의 ENC_KEY_B64 와 동일해야 함
"""
import argparse, base64, json, os, re, statistics, sys, time, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

MIN_OWNER_MSGS = 30          # 이보다 적으면 상대별 프로필 없이 기본 프로필 사용
EXAMPLE_PAIRS = 15
CLAUDE_MODEL = "claude-haiku-5-5"   # 비용 절감. 더 섬세한 지침이 필요하면 claude-sonnet-5-5

EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️]")
LAUGH = re.compile("[ㅋㅎ]{2,}")
TRAIL = re.compile(r"[\sㅋㅎㅠㅜ~!?.,…^\-]+$|" + EMOJI.pattern + "+$")
HONORIFIC = re.compile("(요|니다|세요|까요|죠|습니까|십시오|시죠)$")
SYSTEM_TEXT = re.compile(r"(공감했습니다|메시지에 반응|Liked a message|Reacted .* to your message|"
                         r"sent an attachment|첨부 파일을 보냈습니다|님이 동영상 채팅|started a video chat|"
                         r"unsent a message|메시지를 보내지 않았습니다|call ended|started an audio call|"
                         r"started a video call|스티커를 보냈습니다)")


# ── 파싱 ─────────────────────────────────────────

def fix(s):
    """인스타 내보내기는 UTF-8 바이트를 latin-1 문자로 이스케이프해서 저장 → 되돌림"""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def load_threads(root):
    """폴더 → [{key, name, participants, messages:[{sender, text, ts}]}] (메시지는 시간순)"""
    threads = defaultdict(lambda: {"participants": set(), "messages": []})
    for f in Path(root).rglob("message_*.json"):
        if "inbox" not in f.parts:
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        t = threads[f.parent]
        t["participants"] |= {fix(p["name"]) for p in data.get("participants", [])}
        for m in data.get("messages", []):
            text = fix(m.get("content", "")).strip()
            if text and not SYSTEM_TEXT.search(text):
                t["messages"].append({"sender": fix(m.get("sender_name", "")), "text": text,
                                      "ts": m["timestamp_ms"] / 1000})
    out = []
    for folder, t in threads.items():
        t["messages"].sort(key=lambda m: m["ts"])
        out.append({"key": re.sub(r"_\d+$", "", folder.name), "participants": t["participants"],
                    "messages": t["messages"]})
    return out


def detect_owner(threads):
    """모든 대화방에 공통으로 등장하는 이름 = 오너"""
    c = Counter(p for t in threads for p in t["participants"])
    return c.most_common(1)[0][0] if c else None


# ── 통계 ─────────────────────────────────────────

def ending(text):
    s = TRAIL.sub("", text)
    while TRAIL.search(s) and s:
        s = TRAIL.sub("", s)
    word = s.split()[-1] if s.split() else ""
    return word[-2:] if len(word) >= 2 else word


def style_stats(owner_msgs, all_msgs, owner):
    texts = [m["text"] for m in owner_msgs]
    n = len(texts)
    if n == 0:
        return {}
    ends = Counter(e for e in map(ending, texts) if e)
    emojis = Counter(e for t in texts for e in EMOJI.findall(t) if e != "️")
    laughs = Counter(LAUGH.findall(" ".join(texts)))
    words = Counter(w for t in texts for w in re.findall(r"[가-힣a-zA-Z]{2,}", t))
    stripped = [TRAIL.sub("", t) for t in texts]

    bursts, run = [], 0                       # 오너가 연속으로 몇 개씩 나눠 보내는지
    for m in all_msgs:
        if m["sender"] == owner:
            run += 1
        elif run:
            bursts.append(run)
            run = 0
    if run:
        bursts.append(run)

    return {
        "owner_messages": n,
        "avg_len": round(sum(map(len, texts)) / n, 1),
        "median_len": statistics.median(map(len, texts)),
        "honorific_ratio": round(sum(bool(HONORIFIC.search(s)) for s in stripped) / n, 2),
        "emoji_per_msg": round(sum(emojis.values()) / n, 2),
        "top_emojis": [e for e, _ in emojis.most_common(8)],
        "laugh_per_msg": round(sum(laughs.values()) / n, 2),
        "top_laughs": [l for l, _ in laughs.most_common(3)],
        "top_endings": [[e, round(c / n, 2)] for e, c in ends.most_common(10)],
        "top_words": [w for w, _ in words.most_common(15)],
        "avg_burst": round(sum(bursts) / len(bursts), 1) if bursts else 1,
    }


def example_pairs(msgs, owner, k=EXAMPLE_PAIRS):
    """상대 메시지(연속분 합침) → 오너 답장(연속분 합침) 쌍, 최근 것부터"""
    pairs, i = [], 0
    while i < len(msgs):
        j = i
        while j < len(msgs) and msgs[j]["sender"] != owner:
            j += 1
        o = j
        while o < len(msgs) and msgs[o]["sender"] == owner:
            o += 1
        if i < j < o:
            pairs.append(("\n".join(m["text"] for m in msgs[i:j][-3:]),
                          "\n".join(m["text"] for m in msgs[j:o])))
        i = max(o, i + 1)
    return pairs[-k:]


def format_examples(pairs):
    return "\n\n".join(f"상대: {a}\n나: {b}" for a, b in pairs)


def guide_from_stats(s):
    """Claude 없이 만드는 기본 지침"""
    tone = "존댓말" if s["honorific_ratio"] >= 0.5 else "반말"
    return (f"- {tone} 사용 (존댓말 비율 {int(s['honorific_ratio'] * 100)}%)\n"
            f"- 한 메시지 평균 {s['avg_len']}자, 짧게. 평균 {s['avg_burst']}개로 나눠 보내는 편\n"
            f"- 자주 쓰는 어미: {', '.join(e for e, _ in s['top_endings'][:6])}\n"
            f"- 웃음 표현: {', '.join(s['top_laughs']) or '거의 안 씀'} (메시지당 {s['laugh_per_msg']})\n"
            f"- 이모지: {' '.join(s['top_emojis']) or '거의 안 씀'} (메시지당 {s['emoji_per_msg']})\n"
            f"- 자주 쓰는 단어: {', '.join(s['top_words'][:10])}")


def guide_from_claude(s, examples, owner, api_key):
    prompt = (f"아래는 '{owner}'가 인스타 DM에서 특정 상대에게 보낸 메시지의 통계와 실제 대화 예시다.\n"
              f"이 사람의 말투를 다른 AI가 그대로 흉내 낼 수 있도록 말투 지침을 한국어 글머리표 8~12줄로 써라.\n"
              f"반말/존댓말, 어미, 웃음·이모지 습관, 길이, 자주 쓰는 표현, 상대와의 거리감을 구체적인 예와 함께.\n"
              f"대화 내용(사실·사건)은 지침에 넣지 말고 말투만 써라.\n\n"
              f"[통계]\n{json.dumps(s, ensure_ascii=False)}\n\n[대화 예시]\n{examples}")
    # 생각(thinking) 토큰도 max_tokens 에 포함되므로 넉넉히, effort 는 low 로
    body = json.dumps({"model": CLAUDE_MODEL, "max_tokens": 4000, "output_config": {"effort": "low"},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", body, {
        "x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                res = json.load(r)
            text = "".join(b.get("text", "") for b in res["content"] if b.get("type") == "text").strip()
            if not text:
                raise RuntimeError(f"본문 없음 (stop_reason: {res.get('stop_reason')})")
            return text
        except Exception as e:  # 일시 오류 재시도
            if attempt == 2:
                raise
            print(f"  Claude 재시도 ({e})", file=sys.stderr)
            time.sleep(5 * (attempt + 1))


# ── 프로필 생성 ───────────────────────────────────

def build_profiles(threads, owner, since_ts, make_guide):
    recent = []
    for t in threads:
        msgs = [m for m in t["messages"] if m["ts"] >= since_ts]
        if msgs:
            recent.append({**t, "messages": msgs})

    profiles, all_owner, all_pairs = {}, [], []
    for t in recent:
        owner_msgs = [m for m in t["messages"] if m["sender"] == owner]
        all_owner += owner_msgs
        others = t["participants"] - {owner}
        if len(others) != 1:                  # 단톡방: 기본 프로필 통계에만 사용
            continue
        pairs = example_pairs(t["messages"], owner)
        all_pairs += pairs[-3:]
        if len(owner_msgs) < MIN_OWNER_MSGS:
            continue
        s = style_stats(owner_msgs, t["messages"], owner)
        prev = profiles.get(t["key"])
        if prev and prev["stats"]["owner_messages"] >= s["owner_messages"]:
            continue                          # 같은 키 폴더가 여러 개면 대화 많은 쪽
        profiles[t["key"]] = {"contact_key": t["key"], "display_name": next(iter(others)), "is_default": False,
                              "stats": s, "_examples": format_examples(pairs)}

    default_stats = style_stats(all_owner, [m for t in recent for m in t["messages"]], owner)
    default = {"contact_key": None, "display_name": "기본", "is_default": True, "stats": default_stats,
               "_examples": format_examples(all_pairs[-EXAMPLE_PAIRS:])}

    items = [default] + sorted(profiles.values(), key=lambda p: -p["stats"]["owner_messages"])
    for i, p in enumerate(items, 1):
        print(f"[{i}/{len(items)}] {p['display_name']} ({p['stats'].get('owner_messages', 0)}개)")
        p["style_guide"] = make_guide(p["stats"], p["_examples"]) if p["stats"] else ""
    return items


# ── 업로드 ───────────────────────────────────────

def encrypt(plain, key_b64):
    """PHP enc() 와 동일 형식: v1: + base64(iv | 암호문 | tag)"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = base64.b64decode(key_b64)
    assert len(key) == 32, "ENC_KEY_B64 는 32바이트"
    iv = os.urandom(12)
    return "v1:" + base64.b64encode(iv + AESGCM(key).encrypt(iv, plain.encode(), None)).decode()


def sb(env, method, path, body=None, prefer=None):
    key = env["SUPABASE_SERVICE_KEY"]
    h = {"apikey": key, "Content-Type": "application/json"}
    if key.startswith("eyJ"):                 # 예전 service_role(JWT)만 Authorization 에도. 새 sb_secret_ 키는 apikey 만
        h["Authorization"] = "Bearer " + key
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(env["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path,
                                 json.dumps(body).encode() if body is not None else None, h, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def upload(items, env):
    for p in items:
        row = {"contact_key": p["contact_key"], "display_name": p["display_name"], "is_default": p["is_default"],
               "stats": p["stats"], "style_guide": p["style_guide"],
               "examples_enc": encrypt(p["_examples"], env["ENC_KEY_B64"]),
               "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        if p["is_default"]:                   # contact_key 가 null 이라 upsert 불가 → 수정 후 없으면 삽입
            if not sb(env, "PATCH", "tone_profiles?is_default=eq.true", row, "return=representation"):
                sb(env, "POST", "tone_profiles", row)
        else:
            sb(env, "POST", "tone_profiles?on_conflict=contact_key", row, "resolution=merge-duplicates")
    print(f"업로드 완료: {len(items)}개")


def read_env(path):
    env = dict(os.environ)
    if path:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


# ── 자체 테스트 ──────────────────────────────────

def self_test():
    import tempfile
    mojibake = lambda s: s.encode("utf-8").decode("latin-1")   # 인스타 내보내기 방식 재현
    now = time.time() * 1000
    day = 86400 * 1000
    with tempfile.TemporaryDirectory() as d:
        th = Path(d, "your_instagram_activity/messages/inbox/friend_abc_123456")
        th.mkdir(parents=True)
        msgs = []
        for i in range(40):
            msgs += [{"sender_name": mojibake("친구"), "timestamp_ms": now - i * day / 10, "content": mojibake(f"뭐해 {i}")},
                     {"sender_name": mojibake("홍길동"), "timestamp_ms": now - i * day / 10 + 1000,
                      "content": mojibake("ㅋㅋㅋ 나 집이지 😂")}]
        msgs.append({"sender_name": mojibake("홍길동"), "timestamp_ms": now - 400 * day, "content": mojibake("옛날 메시지")})
        msgs.append({"sender_name": mojibake("친구"), "timestamp_ms": now, "content": mojibake("친구님이 메시지에 공감했습니다")})
        msgs.append({"sender_name": mojibake("홍길동"), "timestamp_ms": now - 5000, "content": "Audio call ended"})
        (th / "message_1.json").write_text(json.dumps({
            "participants": [{"name": mojibake("친구")}, {"name": mojibake("홍길동")}], "messages": msgs}))
        boss = Path(d, "your_instagram_activity/messages/inbox/boss_999")
        boss.mkdir()
        (boss / "message_1.json").write_text(json.dumps({
            "participants": [{"name": mojibake("팀장님")}, {"name": mojibake("홍길동")}],
            "messages": [{"sender_name": mojibake("홍길동"), "timestamp_ms": now, "content": mojibake("네 알겠습니다")}]}))

        threads = load_threads(d)
        assert detect_owner(threads) == "홍길동"
        t = next(t for t in threads if t["key"] == "friend_abc")
        assert t["participants"] == {"친구", "홍길동"}, t["participants"]
        assert all("공감" not in m["text"] for m in t["messages"]), "시스템 문구 제외"
        assert all(m["text"] != "Audio call ended" for m in t["messages"]), "통화 알림 제외"
        items = build_profiles(threads, "홍길동", time.time() - 365 * 86400, lambda s, e: guide_from_stats(s))
        keys = {p["contact_key"] for p in items}
        assert keys == {None, "friend_abc"}, keys          # boss 는 메시지 1개 → 기본 프로필만
        f = next(p for p in items if p["contact_key"] == "friend_abc")
        assert f["stats"]["owner_messages"] == 40, "1년 지난 메시지 제외"
        assert f["stats"]["honorific_ratio"] == 0 and "😂" in f["stats"]["top_emojis"]
        assert f["stats"]["top_endings"][0][0] == "이지", f["stats"]["top_endings"]
        assert "상대: 뭐해" in f["_examples"] and "나: ㅋㅋㅋ 나 집이지 😂" in f["_examples"]
        assert "반말" in f["style_guide"]
        assert next(p for p in items if p["is_default"])["stats"]["owner_messages"] == 41
    assert fix("ì\x95\x88ë\x85\x95") == "안녕" and fix("already 한글") == "already 한글"
    assert HONORIFIC.search(TRAIL.sub("", "감사합니다!!")) and not HONORIFIC.search(TRAIL.sub("", "고마워 ㅋㅋ"))
    try:
        enc = encrypt("테스트", base64.b64encode(b"k" * 32).decode())
        assert enc.startswith("v1:")
    except ImportError:
        print("(cryptography 미설치: 암호화 테스트 생략)")
    print("self-test OK")


# ── main ─────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8")   # Windows 콘솔 한글 깨짐 방지
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir", nargs="?")
    ap.add_argument("--env")
    ap.add_argument("--owner-name", help="자동 감지가 틀릴 때 내보내기 파일의 오너 이름")
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-claude", action="store_true", help="Claude 없이 통계 기반 지침만")
    ap.add_argument("--preview", default="profiles_preview.json")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not a.export_dir:
        ap.error("내보내기 폴더 경로가 필요합니다")

    env = read_env(a.env)
    threads = load_threads(a.export_dir)
    if not threads:
        sys.exit("message_*.json 을 찾지 못했습니다. JSON 형식으로 내보냈는지 확인하세요.")
    owner = a.owner_name or detect_owner(threads)
    print(f"대화방 {len(threads)}개, 오너 이름: {owner}")

    use_claude = not a.no_claude and env.get("ANTHROPIC_API_KEY")
    if not a.no_claude and not use_claude:
        print("ANTHROPIC_API_KEY 없음 → 통계 기반 지침으로 생성")
    make_guide = (lambda s, e: guide_from_claude(s, e, owner, env["ANTHROPIC_API_KEY"])) if use_claude \
        else (lambda s, e: guide_from_stats(s))

    items = build_profiles(threads, owner, time.time() - a.days * 86400, make_guide)
    Path(a.preview).write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"미리보기 저장: {a.preview}  (대화 원문 포함 — 확인 후 삭제하세요)")
    if not a.dry_run:
        for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "ENC_KEY_B64"):
            if not env.get(k):
                sys.exit(f"{k} 가 필요합니다 (--env 파일 또는 환경변수)")
        upload(items, env)


if __name__ == "__main__":
    main()
