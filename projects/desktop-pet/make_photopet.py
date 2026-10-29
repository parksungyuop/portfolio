# -*- coding: utf-8 -*-
"""사진 한 장에서 펫 프레임 폴더를 만든다.

사진에서 머리만 오려내고, 몸통·팔·다리는 코드로 그려서 붙인다.
프레임마다 기울기·상하 흔들림·팔다리 스윙 값만 바꿔 동작을 만든다.
결과 폴더는 make_petpack.py 가 그대로 먹는 구조다.
"""
from __future__ import annotations

import math
from collections import Counter, deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# 아틀라스 셀 규격
W, H = 192, 208

# 서 있을 때 기준선
FEET_Y = 200      # 발바닥
CHIN_Y = 120      # 턱 높이 -> 전체 176px, 약 1.85등신
HEAD_W = 76       # 머리 "폭"을 기준으로 맞춘다.
                  # 높이로 맞추면 사진마다 머리가 잘린 정도가 달라서
                  # 표정이 바뀔 때 얼굴이 커졌다 작아졌다 한다.

# 그려 넣는 색
SUIT = (38, 52, 44, 255)      # 재킷 (사진에서 뽑은 짙은 녹색)
SUIT_HI = (54, 72, 62, 255)   # 깃 · 밝은 면
SUIT_LO = (26, 36, 30, 255)   # 팔 · 다리 (몸통과 구분되게 한 톤 어둡게)
STRIPE = (50, 67, 57, 255)    # 핀스트라이프
SHIRT = (228, 240, 240, 255)
TIE = (198, 208, 182, 255)    # 연한 세이지
TIE_LO = (150, 164, 128, 255)
SHOE = (22, 24, 28, 255)


# ---------------------------------------------------------------- 머리 오려내기

def _flood_bg(im: Image.Image, tol: int) -> Image.Image:
    """네 모서리에서 번져 나가며 단색 배경을 투명하게 만든다."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    base = max(Counter((c[0] // 8, c[1] // 8, c[2] // 8) for c in corners).items(),
               key=lambda kv: kv[1])[0]
    br, bg_, bb = base[0] * 8 + 4, base[1] * 8 + 4, base[2] * 8 + 4

    def near(c):
        return abs(c[0] - br) <= tol and abs(c[1] - bg_) <= tol and abs(c[2] - bb) <= tol

    seen = bytearray(w * h)
    q = deque()
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if near(px[sx, sy]) and not seen[sy * w + sx]:
            seen[sy * w + sx] = 1
            q.append((sx, sy))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and near(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    for y in range(h):
        row = y * w
        for x in range(w):
            if seen[row + x]:
                px[x, y] = (255, 255, 255, 0)
    return im


def _is_skin(c) -> bool:
    r, g, b, a = c
    return a > 128 and r > 120 and r > g > b and (r - b) > 28


def _trim_below_jaw(im: Image.Image, chin: float | None = None) -> Image.Image:
    """턱 아래로는 살색 폭만 남긴다 (옷깃·어깨의 검은 덩어리 제거).

    chin 을 주면 자동 탐지 대신 그 높이(0~1)에서 자른다.
    """
    w, h = im.size
    px = im.load()
    rows = []
    for y in range(h):
        xs = [x for x in range(w) if _is_skin(px[x, y])]
        rows.append((xs[0], xs[-1]) if xs else None)

    widest = max((r[1] - r[0], y) for y, r in enumerate(rows) if r)[1]

    # 턱 끝 찾기.
    # 광대에서 아래로 내려오면 살색 폭이 점점 좁아지다가 목에서 가장 좁아지고,
    # 그 아래 옷깃·어깨가 들어오면서 다시 넓어진다. 그 첫 골짜기가 목이다.
    prof = {y: rows[y][1] - rows[y][0] for y in range(widest, h) if rows[y]}
    ys = sorted(prof)
    sm = {}
    for i, y in enumerate(ys):                    # 잔털 때문에 들쭉날쭉하니 평활화
        win = ys[max(0, i - 2):i + 3]
        sm[y] = sum(prof[v] for v in win) / len(win)

    cut = h
    for i, y in enumerate(ys):
        nxt = ys[i + 1:i + 10]
        if len(nxt) < 6:
            break
        if all(sm[v] > sm[y] + 1.5 for v in nxt[3:]):   # 여기서부터 다시 넓어진다
            cut = min(h, y + max(4, round(h * 0.018)))  # 턱 끝이 살짝 남게 여유
            break
    if chin is not None:                          # 직접 지정하면 그대로 따른다
        cut = int(chin * h)

    for y in range(widest, h):
        if y >= cut:
            for x in range(w):
                px[x, y] = (255, 255, 255, 0)
            continue
        lo, hi = rows[y][0] - 5, rows[y][1] + 5
        for x in range(w):
            if x < lo or x > hi:
                px[x, y] = (255, 255, 255, 0)
    return im


def _taper_neck(im: Image.Image, *, frac: float = 0.17, neck: float = 0.36) -> Image.Image:
    """머리 아랫부분을 목 굵기로 좁힌다.

    사진을 그냥 자르면 턱 밑이 일자로 뚝 끊겨서 목 없는 인형이 된다.
    아래 frac 만큼을 얼굴 중심 쪽으로 서서히 모아 목을 만들고,
    가장자리는 알파를 부드럽게 떨어뜨려 자른 티를 없앤다.
    """
    im = im.convert("RGBA")
    w, h = im.size
    a = im.split()[3].load()
    px = im.load()

    start = int(h * (1 - frac))
    rows = {}
    for y in range(h):
        xs = [x for x in range(w) if a[x, y] > 100]
        if xs:
            rows[y] = (xs[0], xs[-1])
    if start not in rows:
        return im
    lo0, hi0 = rows[start]
    cxf = (lo0 + hi0) / 2
    half0 = (hi0 - lo0) / 2
    half1 = w * neck / 2

    for y in range(start, h):
        t = (y - start) / max(1, h - 1 - start)
        t = t * t * (3 - 2 * t)                  # 부드럽게 좁아지도록
        half = half0 + (half1 - half0) * t
        feather = max(2.0, half * 0.22)
        for x in range(w):
            d = abs(x - cxf) - half
            if d <= 0:
                continue
            k = max(0.0, 1.0 - d / feather)
            r, g, b, al = px[x, y]
            px[x, y] = (r, g, b, int(al * k))
    return im


def oval_cut(path: str | Path, cx: float, cy: float, rx: float, ry: float,
             *, feather: float = 0.02, rot: float = 0.0) -> Image.Image:
    """배경이 복잡한 사진용. 얼굴 둘레를 타원으로 도려낸다.

    좌표는 전부 이미지 크기에 대한 비율(0~1). 플러드 필이 안 먹는 사진
    (실내 배경, 얼굴 옆의 손 같은 것)에서 쓴다.
    """
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    ss = 4                                        # 4배로 그린 뒤 줄여 계단 없애기
    m = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([(cx - rx) * w * ss, (cy - ry) * h * ss,
               (cx + rx) * w * ss, (cy + ry) * h * ss], fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    if rot:
        m = m.rotate(rot, resample=Image.BICUBIC, center=(cx * w, cy * h))
    m = m.filter(ImageFilter.GaussianBlur(max(1.0, feather * min(w, h) * 0.5)))
    out = im.copy()
    out.putalpha(ImageChops.multiply(im.split()[3], m))
    return out.crop(out.getbbox())


def load_head(path: str | Path, *, tol: int = 26,
              chin: float | None = None) -> Image.Image:
    """사진 -> 배경 지우고 턱 아래를 정리한 머리 이미지."""
    im = _flood_bg(Image.open(path), tol)
    im = _trim_below_jaw(im, chin)
    box = im.getbbox()
    if box:
        im = im.crop(box)
    im = _taper_neck(im)
    box = im.getbbox()
    if box is None:
        raise SystemExit(f"{path}: 오려낼 게 없습니다. --tol 을 올려보세요.")
    return im.crop(box)


def skin_tone(head: Image.Image) -> tuple[int, int, int, int]:
    """손 색으로 쓸 대표 살색."""
    px = head.convert("RGBA").load()
    w, h = head.size
    c = Counter()
    for y in range(int(h * 0.45), int(h * 0.75)):
        for x in range(int(w * 0.25), int(w * 0.75)):
            p = px[x, y]
            if _is_skin(p):
                c[(p[0] // 12, p[1] // 12, p[2] // 12)] += 1
    if not c:
        return (226, 180, 150, 255)
    k = c.most_common(1)[0][0]
    return (k[0] * 12 + 6, k[1] * 12 + 6, k[2] * 12 + 6, 255)


# ---------------------------------------------------------------- 프레임 그리기

def _capsule(dr, p0, p1, r, fill):
    dr.line([p0, p1], fill=fill, width=r * 2)
    for (x, y) in (p0, p1):
        dr.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def frame(head: Image.Image, *, lean: float = 0.0, bob: float = 0.0,
          arm: float = 0.0, leg: float = 0.0, tilt: float = 0.0,
          gaze: tuple[float, float] = (0.0, 0.0), droop: float = 0.0,
          wave: float | None = None, hands_up: float = 0.0,
          stride: float = 0.0, arms_out: float = 0.0, head_scale: float = 1.0,
          skin: tuple[int, int, int, int] | None = None) -> Image.Image:
    """파라미터 하나 세트가 프레임 하나.

    lean  좌우 기울기(-1..1)   bob   위아래(+아래)   arm/leg  스윙 위상(라디안)
    tilt  고개 각도(도)        gaze  머리 밀기(-1..1) droop    시무룩 정도(0..1)
    wave  손 흔들기 각도       hands_up 만세 정도(0..1)
    stride 보폭(0..1)          arms_out 팔을 옆으로 벌린 정도(0..1)
    """
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    skin = skin or (226, 180, 150, 255)

    hw = max(1, round(HEAD_W * head_scale))
    hh = max(1, round(head.height * hw / head.width))
    # 상체(cx)만 앞으로 내밀고 골반(hipx)은 덜 따라간다.
    # 통째로 밀면 옆으로 미끄러지는 것처럼 보이고, 이렇게 해야 기울어 보인다.
    cx = W / 2 + lean * 11
    hipx = W / 2 + lean * 2
    chin = CHIN_Y + bob + droop * 5      # 턱 높이
    neck = chin - 6                       # 어깨 윗선 (턱이 살짝 파묻힌다)
    hip = neck + 46
    feet = FEET_Y + bob * 0.3
    sw_ = hw * 0.46                       # 어깨 반폭

    # --- 다리 (몸통보다 먼저: 엉덩이에서 나오게)
    for side in (-1, 1):
        swing = math.sin(leg + (0 if side < 0 else math.pi))
        # 앞모습이라 앞뒤 보폭은 안 보인다. 대신 다리를 넓게 벌리고
        # 내딛는 쪽을 들어올려서 성큼성큼 걷는 느낌을 낸다.
        sep = 13 + 8 * stride
        kx = hipx - sep * side
        fx = kx + swing * (5 + 5 * stride)        # 발끝은 좌우로 조금만
        lift = max(0.0, swing) * (5 + 7 * stride)
        _capsule(dr, (kx, hip - 6), (fx, feet - 6 - lift), 8, SUIT_LO)
        dr.ellipse([fx - 11, feet - 10 - lift, fx + 11, feet - lift], fill=SHOE)

    # --- 팔. 내린 팔은 몸통 뒤, 든 팔은 머리 앞에 그린다.
    #     (안 그러면 인사하는 손이 머리 뒤로 숨는다)
    arms = []
    for side in (-1, 1):
        sx, sy = cx - sw_ * 0.92 * side, neck + 10
        if wave is not None and side < 0:          # 화면 오른쪽 팔을 들어 흔든다
            a = math.radians(wave)
            ex, ey = sx + math.sin(a) * 40, sy - math.cos(a) * 40
            up = True
        elif hands_up:
            ex = sx - 12 * side * (1 - hands_up) - 7 * side * hands_up
            ey = sy - 40 * hands_up + 34 * (1 - hands_up)
            up = hands_up > 0.45
        else:
            aw = math.sin(arm + (0 if side < 0 else math.pi))     # 좌우 반대 위상
            reach = 8 + 26 * arms_out
            ex = sx - reach * side + aw * 12 * (1 - 0.55 * arms_out)
            # 팔을 벌렸을 때는 한쪽이 올라가면 반대쪽이 내려간다
            ey = sy + (40 - 26 * arms_out) - aw * 13 * arms_out - abs(aw) * 3
            up = False
        arms.append((sx, sy, ex, ey, up))

    def _arm(d, a):
        """어깨-팔꿈치-손 두 마디로 그린다. 곧은 막대기면 허수아비처럼 보인다."""
        sx, sy, ex, ey, _ = a
        dx, dy = ex - sx, ey - sy
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length        # 팔에 수직인 방향
        mx, my = (sx + ex) / 2, (sy + ey) / 2
        if abs(mx + nx - cx) < abs(mx - nx - cx):  # 팔꿈치는 몸 바깥으로
            nx, ny = -nx, -ny
        bend = length * 0.2
        elx, ely = mx + nx * bend, my + ny * bend
        for width, colour in ((7, SUIT_LO), (5, SUIT)):
            _capsule(d, (sx, sy), (elx, ely), width, colour)
            _capsule(d, (elx, ely), (ex, ey), width, colour)
        d.ellipse([ex - 7, ey - 7, ex + 7, ey + 7], fill=skin)

    for a in arms:
        if not a[4]:
            _arm(dr, a)

    # --- 몸통 (어깨는 사다리꼴로 기울여서 사람 어깨처럼)
    torso = [(cx - sw_ * 0.72, neck), (cx + sw_ * 0.72, neck),
             (cx + sw_, neck + 12), (hipx + sw_ * 0.88, hip),
             (hipx - sw_ * 0.88, hip), (cx - sw_, neck + 12)]
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dl = ImageDraw.Draw(lay)
    dl.polygon(torso, fill=SUIT)
    for k in range(-5, 6):                      # 핀스트라이프
        x = cx + k * 7 + lean * 3
        dl.line([(x, neck), (x, hip)], fill=STRIPE, width=1)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(torso, fill=255)
    lay.putalpha(Image.composite(lay.split()[3], Image.new("L", (W, H), 0), mask))
    img.alpha_composite(lay)
    # 재킷 앞자락
    dr.line([(cx, neck + 26), (hipx, hip)], fill=SUIT_LO, width=2)

    # --- 셔츠 깃 + 넥타이
    dr.polygon([(cx - 15, neck - 3), (cx + 15, neck - 3), (cx, neck + 24)], fill=SHIRT)
    dr.polygon([(cx - 3.5, neck + 3), (cx + 3.5, neck + 3), (cx + 2.5, neck + 9),
                (cx - 2.5, neck + 9)], fill=TIE)
    dr.polygon([(cx - 4, neck + 9), (cx + 4, neck + 9), (cx + 2.5, neck + 28),
                (cx - 2.5, neck + 28)], fill=TIE)
    dr.line([(cx + 2, neck + 10), (cx + 1, neck + 27)], fill=TIE_LO, width=1)
    # 재킷 깃 (셔츠 위로 덮는 V)
    dr.polygon([(cx - sw_ * 0.78, neck + 1), (cx - 12, neck - 2),
                (cx - 2, neck + 26), (cx - sw_ * 0.72, neck + 20)], fill=SUIT_HI)
    dr.polygon([(cx + sw_ * 0.78, neck + 1), (cx + 12, neck - 2),
                (cx + 2, neck + 26), (cx + sw_ * 0.72, neck + 20)], fill=SUIT_HI)

    # --- 머리 (깃보다 위, 턱이 깃에 살짝 얹힌다)
    hd = head.resize((hw, hh), Image.LANCZOS)
    ang = tilt + lean * 4
    if ang:
        hd = hd.rotate(-ang, resample=Image.BICUBIC, expand=True)
    hx = round(cx - hd.width / 2 + gaze[0] * 4)
    hy = round(chin - hd.height + gaze[1] * 3)
    img.alpha_composite(hd, (hx, hy))

    # --- 든 팔은 머리 위로
    dr = ImageDraw.Draw(img)
    for a in arms:
        if a[4]:
            _arm(dr, a)

    # --- 발밑 그림자
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.ellipse([hipx - 32, FEET_Y - 6, hipx + 32, FEET_Y + 5], fill=(0, 0, 0, 60))
    sh = sh.filter(ImageFilter.GaussianBlur(3))
    return Image.alpha_composite(sh, img)


# ---------------------------------------------------------------- 동작 만들기

# 행 이름 -> 어떤 표정 사진을 쓸지
# 표정별 머리 배율. 사진마다 머리카락이 잡히는 정도가 달라서, 폭을 맞춰도
# 세로가 길어 보일 수 있다. 그때 여기서 미세하게 줄인다 (faces.json 의 "scale").
FACE_SCALE: dict[str, float] = {}

FACE_FOR_ROW = {
    "idle": "normal", "running-right": "normal", "running-left": "normal",
    "waving": "happy", "jumping": "happy", "failed": "angry",
    "waiting": "normal", "running": "normal", "review": "surprised",
}


def _poses() -> dict[str, list[dict]]:
    """행 이름 -> 프레임 파라미터 목록. 길이는 petpack.ANIMATIONS 와 맞춘다."""
    tau = math.tau
    P: dict[str, list[dict]] = {}

    P["idle"] = [dict(bob=math.sin(i / 6 * tau) * 2.0,
                      tilt=math.sin(i / 6 * tau) * 1.5) for i in range(6)]

    def walk(sign: float) -> list[dict]:
        # 공사장에서 성큼성큼 걷는 사진을 본떴다.
        # 몸을 앞으로 크게 기울이고, 팔을 옆으로 벌리고, 보폭이 크고,
        # 큰 걸음마다 무게중심이 내려앉는다.
        out = []
        for i in range(8):
            ph = i / 8 * tau
            swing = math.sin(ph)
            out.append(dict(
                lean=0.78 * sign,
                arm=ph, leg=ph,
                stride=0.72 + 0.28 * abs(swing),
                arms_out=0.55 + 0.35 * abs(swing),
                bob=2.4 * abs(swing) - 0.9,
                tilt=(-3.0 + swing * 2.0) * sign,
            ))
        return out
    P["running-right"] = walk(1)
    P["running-left"] = walk(-1)

    P["waving"] = [dict(wave=w, tilt=-4, bob=b)
                   for w, b in ((30, 0), (52, -1.5), (34, 0), (52, -1.5))]

    P["jumping"] = [dict(bob=6, leg=0.0, hands_up=0.15),
                    dict(bob=-10, leg=0.5, hands_up=0.75),
                    dict(bob=-18, leg=0.8, hands_up=1.0),
                    dict(bob=-8, leg=0.5, hands_up=0.7),
                    dict(bob=4, leg=0.1, hands_up=0.2)]

    P["failed"] = [dict(droop=1.0, tilt=7 + math.sin(i / 8 * tau) * 3,
                        bob=3 + math.sin(i / 8 * tau) * 1.5,
                        lean=math.sin(i / 8 * tau) * 0.18) for i in range(8)]

    P["waiting"] = [dict(bob=math.sin(i / 6 * tau) * 1.4, arm=0.35,
                         leg=math.sin(i / 6 * tau) * 0.25,
                         tilt=math.sin(i / 6 * tau + 1.0) * 3) for i in range(6)]

    P["running"] = [dict(arm=i / 6 * tau, leg=i / 6 * tau,
                         bob=abs(math.sin(i / 6 * tau)) * -1.4) for i in range(6)]

    # 폭발 행은 놀란 얼굴로 — 움찔했다가 뒤로 자빠질 듯 뒷걸음
    P["review"] = [dict(hands_up=0.5, bob=-2, tilt=-2),
                   dict(hands_up=0.9, bob=-6, tilt=-4, lean=-0.15),
                   dict(hands_up=1.0, bob=-9, tilt=-6, lean=-0.3),
                   dict(hands_up=0.95, bob=-6, tilt=-5, lean=-0.2),
                   dict(hands_up=0.8, bob=-3, tilt=-3, lean=-0.1),
                   dict(hands_up=0.6, bob=-1, tilt=-2)]
    return P


def build(faces: dict[str, Image.Image], out: Path) -> None:
    """포즈 폴더를 통째로 만든다. faces 는 {'normal': 머리이미지, ...}."""
    out.mkdir(parents=True, exist_ok=True)
    base = faces["normal"]
    skin = skin_tone(base)

    def head_for(row: str) -> Image.Image:
        return faces.get(FACE_FOR_ROW.get(row, "normal"), base)

    for row, frames in _poses().items():
        d = out / row
        d.mkdir(exist_ok=True)
        for f in d.glob("*.png"):
            f.unlink()
        hd = head_for(row)
        hs = FACE_SCALE.get(FACE_FOR_ROW.get(row, "normal"), 1.0)
        for i, kw in enumerate(frames, 1):
            frame(hd, skin=skin, head_scale=hs, **kw).save(d / f"{i:02d}.png")
        print(f"  {row:<14} {len(frames):2d} 장  ({FACE_FOR_ROW.get(row, 'normal')})")

    # 시선 16방향: 0 = 위(12시), 시계방향 22.5도
    d = out / "look"
    d.mkdir(exist_ok=True)
    for f in d.glob("*.png"):
        f.unlink()
    for i in range(16):
        a = math.radians(i * LOOK_STEP)
        gx, gy = math.sin(a), -math.cos(a)
        frame(base, skin=skin, gaze=(gx, gy), tilt=gx * 5,
              lean=gx * 0.12).save(d / f"{i:02d}.png")
    print(f"  {'look':<14} 16 장  (normal)")


LOOK_STEP = 360.0 / 16


def load_faces(cfg_path: str | Path) -> dict[str, Image.Image]:
    """faces.json 을 읽어 표정별 머리 이미지를 만든다."""
    import json
    cfg_path = Path(cfg_path)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    out: dict[str, Image.Image] = {}
    for key, spec in cfg.items():
        if key.startswith("_") or not isinstance(spec, dict):
            continue
        p = cfg_path.parent / spec["file"]
        if spec.get("mode") == "oval":
            im = oval_cut(p, *spec["oval"], feather=spec.get("feather", 0.02),
                          rot=spec.get("rot", 0.0))
            im = _taper_neck(im, frac=spec.get("taper", 0.20),
                             neck=spec.get("neck", 0.40))
            im = im.crop(im.getbbox())
        else:
            im = load_head(p, tol=spec.get("tol", 26), chin=spec.get("chin"))
        out[key] = im
        FACE_SCALE[key] = float(spec.get("scale", 1.0))
        print(f"  {key:<10} {spec['file']:<22} {im.size}  x{FACE_SCALE[key]}")
    if "normal" not in out:
        raise SystemExit(f"{cfg_path}: 'normal' 표정이 있어야 합니다.")
    return out


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="사진 -> 펫 프레임 폴더")
    ap.add_argument("out", help="프레임을 쓸 폴더")
    ap.add_argument("--faces", required=True, help="faces.json 경로")
    a = ap.parse_args()

    print(f"{a.faces} 읽는 중")
    faces = load_faces(a.faces)
    missing = {v for v in FACE_FOR_ROW.values()} - set(faces)
    if missing:
        print(f"  (없는 표정 {sorted(missing)} 은 normal 로 대체합니다)")
    print("")
    print(f"{a.out}/ 에 프레임 생성")
    build(faces, Path(a.out))
    print("")
    print(f'다음: python make_petpack.py "{a.out}" --id <아이디> --name "<이름>"')


if __name__ == "__main__":
    main()
