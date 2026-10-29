"""배치용 임시 스프라이트 생성기.

실제 캐릭터 그림이 들어오기 전에 파이프라인(폴더 -> 아틀라스 -> 로더)이
정말 도는지 확인하고, 화면에서 크기와 움직임 감을 미리 보기 위한 것이다.
누구의 얼굴도 아닌 단순 실루엣이며, 진짜 그림이 오면 폴더째 갈아끼우면 된다.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

W, H = 192, 208
INK = (60, 72, 92, 255)
SKIN = (226, 200, 178, 255)
SUIT = (108, 122, 140, 255)

SRC = Path("pet-src")


def figure(dr: ImageDraw.ImageDraw, *, lean=0.0, bob=0.0, arm=0.0, leg=0.0,
           gaze=(0.0, 0.0), droop=0.0):
    """머리·몸통·팔다리를 파라미터로 그린다. 값만 바꿔 프레임을 만든다."""
    cx = W / 2 + lean * 10
    top = 52 + bob + droop * 6
    # 다리
    for side in (-1, 1):
        sw = math.sin(leg) * 12 * side
        dr.line([(W / 2 - 6 * side, top + 78), (W / 2 - 6 * side + sw, top + 118)],
                fill=INK, width=9)
    # 몸통
    dr.rounded_rectangle([cx - 24, top + 26, cx + 24, top + 82], 10, fill=SUIT)
    # 팔
    for side in (-1, 1):
        aw = math.sin(arm) * 14 * side
        dr.line([(cx - 22 * side, top + 34), (cx - 30 * side + aw, top + 70 - abs(aw) * 0.6)],
                fill=SUIT, width=8)
    # 머리
    dr.ellipse([cx - 19, top - 6, cx + 19, top + 32], fill=SKIN, outline=INK, width=2)
    dr.arc([cx - 20, top - 12, cx + 20, top + 20], 190, 350, fill=INK, width=7)
    # 눈 (시선 방향만큼 밀어준다)
    gx, gy = gaze
    for side in (-1, 1):
        ex = cx + 7 * side + gx * 3
        ey = top + 13 + gy * 3
        dr.ellipse([ex - 2, ey - 2, ex + 2, ey + 2], fill=INK)
    my = top + 24 + droop * 3
    dr.arc([cx - 8, my - 5, cx + 8, my + 5], 20 if droop else 200,
           160 if droop else 340, fill=INK, width=2)


def frame(**kw) -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    figure(ImageDraw.Draw(img), **kw)
    return img


def emit(name: str, frames: list[Image.Image]):
    d = SRC / name
    d.mkdir(parents=True, exist_ok=True)
    for i, im in enumerate(frames, 1):
        im.save(d / f"{i:02d}.png")
    print(f"  {name:<14} {len(frames)} 장")


print(f"{SRC}/ 에 임시 프레임 생성")
emit("idle",          [frame(bob=math.sin(i / 6 * math.tau) * 2) for i in range(6)])
emit("running-right", [frame(lean=0.6, arm=i / 8 * math.tau, leg=i / 8 * math.tau) for i in range(8)])
emit("waving",        [frame(arm=-1.2 - math.sin(i / 4 * math.tau) * 0.5) for i in range(4)])
emit("jumping",       [frame(bob=-b, leg=0.6) for b in (0, 10, 18, 10, 0)])
emit("failed",        [frame(droop=1.0, bob=math.sin(i / 8 * math.tau)) for i in range(8)])
emit("waiting",       [frame(arm=0.3, bob=math.sin(i / 6 * math.tau) * 1.5) for i in range(6)])
emit("running",       [frame(arm=i / 6 * math.tau, leg=i / 6 * math.tau) for i in range(6)])
emit("review",        [frame(lean=0.2, arm=-0.5, gaze=(0.6, 0.8)) for _ in range(6)])

d = SRC / "look"
d.mkdir(parents=True, exist_ok=True)
for i in range(16):
    a = math.radians(i * 22.5)
    frame(gaze=(math.sin(a), -math.cos(a))).save(d / f"{i:02d}.png")
print(f"  {'look':<14} 16 장")
