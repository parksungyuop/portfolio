"""'노트북 작업 중' 포즈를 스프라이트시트에서 합성해 만든다.

원본 아틀라스에는 안경이나 노트북 프레임이 없다. 그래서 `running`(작업 중) 행을
바탕으로 펫을 아래로 내려 앉힌 뒤, 눈 위치를 찾아 안경을 씌우고 앞에 노트북을 그린다.
펫마다 눈 위치가 다르므로 좌표를 하드코딩하지 않고 어두운 눈 덩어리를 탐지한다.
"""

from __future__ import annotations

from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 시선 행에서 아래를 내려다보는 자세를 가져다 쓴다.
# 8 = 180도(정면 아래), 7 = 157.5도, 9 = 202.5도 — 가끔 곁눈질하는 느낌.
BASE_LOOKS = [8, 8, 9, 8, 8, 7]

# 차분히 일하는 속도.
DURATIONS = [420, 420, 320, 420, 420, 320]

SIT_DROP = 14          # 앉은 느낌을 주려고 아래로 내리는 픽셀
BOB = [0, 1, 1, 0, -1, 0]   # 프레임별 미세한 몸 흔들림

LID_COLOR = (58, 63, 70, 255)
LID_TOP = (86, 93, 102, 255)
LID_EDGE = (24, 27, 31, 255)
BASE_COLOR = (44, 48, 54, 255)
BASE_TOP = (110, 118, 128, 255)
GLOW_COLOR = (150, 205, 255)

FRAME_COLOR = (18, 18, 20, 255)
LENS_COLOR = (196, 226, 245, 96)
GLINT_COLOR = (255, 255, 255, 165)


# ----------------------------------------------------------------- 눈 찾기


def _blobs(mask: np.ndarray) -> list[dict]:
    """4방향 연결 성분. 마스크가 작아서 순수 파이썬으로도 충분히 빠르다."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out: list[dict] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(y, x)])
            seen[y, x] = True
            xs, ys = [], []
            while queue:
                cy, cx = queue.popleft()
                ys.append(cy)
                xs.append(cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            out.append(
                {
                    "area": len(xs),
                    "x0": min(xs), "x1": max(xs),
                    "y0": min(ys), "y1": max(ys),
                    "cx": sum(xs) / len(xs), "cy": sum(ys) / len(ys),
                }
            )
    return out


def find_eyes(frame: Image.Image) -> tuple[dict, dict] | None:
    """얼굴에서 좌우 한 쌍의 눈을 찾는다. 못 찾으면 None."""
    arr = np.array(frame).astype(int)
    alpha = arr[:, :, 3]
    ys, xs = np.nonzero(alpha > 30)
    if len(xs) == 0:
        return None
    top, bottom = ys.min(), ys.max()

    luminance = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    mask = (alpha > 150) & (luminance < 75)
    mask[top + int((bottom - top) * 0.40):, :] = False   # 얼굴 위쪽만

    candidates = [b for b in _blobs(mask) if b["area"] >= 30]
    if len(candidates) < 2:
        return None

    # 넓이가 비슷하고, 높이가 비슷하고, 좌우로 떨어져 있는 한 쌍이 눈이다.
    best, best_score = None, None
    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            a, b = candidates[i], candidates[j]
            if abs(a["cx"] - b["cx"]) < 8:
                continue
            area_gap = abs(a["area"] - b["area"]) / max(a["area"], b["area"])
            row_gap = abs(a["cy"] - b["cy"]) / max(1.0, (bottom - top) * 0.4)
            score = area_gap * 2.0 + row_gap * 3.0
            if best_score is None or score < best_score:
                best, best_score = (a, b), score

    if best is None or best_score is None or best_score > 1.6:
        return None
    left, right = sorted(best, key=lambda b: b["cx"])
    return left, right


def _fallback_eyes(frame: Image.Image) -> tuple[dict, dict]:
    """눈을 못 찾았을 때 비율로 자리를 잡는다."""
    arr = np.array(frame)
    ys, xs = np.nonzero(arr[:, :, 3] > 30)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0, y1 - y0
    eye_y = y0 + h * 0.16
    size = max(6.0, w * 0.13)

    def make(cx: float) -> dict:
        return {
            "x0": cx - size / 2, "x1": cx + size / 2,
            "y0": eye_y - size / 2, "y1": eye_y + size / 2,
            "cx": cx, "cy": eye_y, "area": size * size,
        }

    return make(x0 + w * 0.30), make(x0 + w * 0.70)


# ------------------------------------------------------------------- 그리기


def _draw_glasses(draw: ImageDraw.ImageDraw, eyes, dy: int, glint: float) -> None:
    left, right = eyes
    pad_x = max(3.0, (left["x1"] - left["x0"]) * 0.34)
    pad_y = max(3.0, (left["y1"] - left["y0"]) * 0.34)

    lenses = []
    for eye in (left, right):
        box = [
            eye["x0"] - pad_x, eye["y0"] - pad_y + dy,
            eye["x1"] + pad_x, eye["y1"] + pad_y + dy,
        ]
        # 감았을 때(눈이 납작할 때)도 렌즈는 동그랗게 유지
        height = box[3] - box[1]
        width = box[2] - box[0]
        if height < width * 0.7:
            grow = (width * 0.7 - height) / 2
            box[1] -= grow
            box[3] += grow
        lenses.append(box)

    for box in lenses:
        draw.rounded_rectangle(box, radius=4, fill=LENS_COLOR)
        # 렌즈 위를 스치는 반사광
        span = box[2] - box[0]
        gx = box[0] + span * glint
        draw.line([(gx, box[3] - 2), (gx + span * 0.34, box[1] + 2)], fill=GLINT_COLOR, width=2)
        draw.rounded_rectangle(box, radius=4, outline=FRAME_COLOR, width=3)

    # 콧대와 안경다리
    mid_y = (lenses[0][1] + lenses[0][3]) / 2
    draw.line([(lenses[0][2], mid_y), (lenses[1][0], mid_y)], fill=FRAME_COLOR, width=3)
    draw.line([(lenses[0][0], mid_y), (lenses[0][0] - 7, mid_y + 3)], fill=FRAME_COLOR, width=3)
    draw.line([(lenses[1][2], mid_y), (lenses[1][2] + 7, mid_y + 3)], fill=FRAME_COLOR, width=3)


def _draw_laptop(canvas: Image.Image, bbox: tuple[int, int, int, int], pulse: float) -> None:
    """펫 앞에 노트북을 그린다. 뚜껑 뒷면이 보이고 화면 빛이 위로 새어 나온다."""
    x0, _y0, x1, _y1 = bbox
    cx = (x0 + x1) / 2
    body_w = x1 - x0

    lid_w = body_w * 1.24
    lid_h = body_w * 0.62
    base_h = body_w * 0.11
    lid_left = cx - lid_w / 2
    lid_right = cx + lid_w / 2
    # 셀 아래쪽에 붙여 세운다 — 펫 몸의 아래 절반이 노트북 뒤로 가려진다
    lid_bottom = canvas.height - base_h
    lid_top = lid_bottom - lid_h

    # 화면 빛 번짐 — 펫 얼굴 쪽으로 올라간다
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [lid_left - 4, lid_top - lid_h * 0.95, lid_right + 4, lid_top + lid_h * 0.30],
        fill=(*GLOW_COLOR, int(56 * pulse)),
    )
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))

    draw = ImageDraw.Draw(canvas)

    # 받침(키보드) — 앞쪽이 살짝 넓은 사다리꼴
    base_spread = lid_w * 0.10
    draw.polygon(
        [
            (lid_left, lid_bottom),
            (lid_right, lid_bottom),
            (lid_right + base_spread, lid_bottom + base_h),
            (lid_left - base_spread, lid_bottom + base_h),
        ],
        fill=BASE_COLOR,
        outline=LID_EDGE,
    )
    draw.line(
        [(lid_left, lid_bottom), (lid_right, lid_bottom)],
        fill=BASE_TOP,
        width=2,
    )

    # 뚜껑 뒷면
    draw.rectangle([lid_left, lid_top, lid_right, lid_bottom], fill=LID_COLOR, outline=LID_EDGE, width=3)
    draw.line([(lid_left + 3, lid_top + 2), (lid_right - 3, lid_top + 2)], fill=LID_TOP, width=2)

    # 뚜껑 위쪽 테두리로 새어 나오는 화면 빛
    draw.line(
        [(lid_left + 5, lid_top + 1), (lid_right - 5, lid_top + 1)],
        fill=(*GLOW_COLOR, int(200 * pulse)),
        width=2,
    )

    # 뚜껑 가운데 작은 표시등
    dot_r = max(2.0, lid_w * 0.035)
    dot_y = (lid_top + lid_bottom) / 2
    draw.ellipse(
        [cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r],
        fill=(*GLOW_COLOR, int(210 * pulse)),
    )


_CACHE: dict[str, tuple[list[Image.Image], list[int]]] = {}


def build_frames(pack) -> tuple[list[Image.Image], list[int]]:
    """'노트북 작업' 6프레임을 합성해 돌려준다. 펫당 한 번만 계산한다."""
    cached = _CACHE.get(pack.pet_id)
    if cached is not None:
        return cached[0], list(cached[1])

    cells = [pack.look_frame(i) for i in BASE_LOOKS]

    reference = pack.animation("idle")[0][0]
    fallback = find_eyes(reference) or _fallback_eyes(reference)

    arr = np.array(reference)
    ys, xs = np.nonzero(arr[:, :, 3] > 30)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))

    frames: list[Image.Image] = []
    for i, cell in enumerate(cells):
        # 고개를 숙인 프레임마다 눈 위치가 다르므로 프레임별로 다시 찾는다
        eyes = find_eyes(cell) or fallback
        dy = SIT_DROP + BOB[i % len(BOB)]
        pulse = 0.72 + 0.28 * (i % 3) / 2.0
        glint = (i % 6) / 6.0

        canvas = Image.new("RGBA", cell.size, (0, 0, 0, 0))
        canvas.alpha_composite(cell, (0, dy))          # 앉히기

        overlay = Image.new("RGBA", cell.size, (0, 0, 0, 0))
        _draw_glasses(ImageDraw.Draw(overlay), eyes, dy, glint)
        # 안경은 펫 몸 위에만 남긴다 (배경으로 삐져나오지 않게)
        shifted_alpha = Image.new("L", cell.size, 0)
        shifted_alpha.paste(cell.getchannel("A"), (0, dy))
        overlay.putalpha(
            Image.composite(overlay.getchannel("A"), Image.new("L", cell.size, 0), shifted_alpha)
        )
        canvas.alpha_composite(overlay)

        shifted_bbox = (bbox[0], bbox[1] + dy, bbox[2], bbox[3] + dy)
        _draw_laptop(canvas, shifted_bbox, pulse)
        frames.append(canvas)

    _CACHE[pack.pet_id] = (frames, list(DURATIONS))
    return frames, list(DURATIONS)
