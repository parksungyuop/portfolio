"""포즈 이미지 폴더 → 펫 패키지(스프라이트시트 + pet.json) 변환기.

앱이 요구하는 아틀라스는 1536x2288 RGBA, 8열 11행, 셀 192x208 이다.
이걸 손으로 맞추는 게 고역이라 이 스크립트가 대신 한다.

    python make_petpack.py 소스폴더 --id my-pet --name "내 펫"

소스 폴더는 애니메이션 이름으로 된 하위 폴더를 두는 방식이 기본이다.

    my-pet/
      idle/            01.png 02.png ...      (필수)
      running-right/   01.png ...
      running-left/    ...                    (--mirror 로 자동 생성 가능)
      waving/  jumping/  failed/  waiting/  running/  review/
      look/            00.png ... 15.png      (선택, 없으면 idle 로 대체됨)

한 폴더에 `idle-01.png`, `waving-02.png` 처럼 이름 앞에 붙여 넣어도 인식한다.
파일 순서는 숫자를 숫자로 보고 정렬하므로 `2.png` 가 `10.png` 앞에 온다.

없는 애니메이션의 행은 완전히 투명하게 비워 둔다. 로더가 "사용 안 함" 으로 읽는다.
`idle` 만 반드시 있어야 한다.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import petpack

CELL_W, CELL_H = petpack.CELL_W, petpack.CELL_H
COLS, ROWS = petpack.COLS, petpack.ROWS
LOOK_COUNT = 16

# 시선 16방향을 담는 행 두 개까지 포함한 전체 행 이름
ROW_NAMES: dict[int, str] = {row: name for name, (row, _) in petpack.ANIMATIONS.items()}
ROW_NAMES[9] = "look 0-7"
ROW_NAMES[10] = "look 8-15"

IMAGE_SUFFIXES = {".png", ".webp", ".gif", ".bmp", ".jpg", ".jpeg"}
# 배경 제거용 임시 색. 그림에 이미 들어 있으면 다음 후보로 넘어간다
SENTINELS = ((255, 0, 255), (254, 1, 254), (0, 255, 1))
ALPHA_FLOOR = 8               # 이 값 이하의 알파는 배경으로 본다


class BuildError(RuntimeError):
    pass


# ------------------------------------------------------------------ 입력 수집


def natural_key(path: Path) -> list:
    """`2.png` 가 `10.png` 앞에 오도록."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", path.name)]


def collect_frames(source: Path, name: str) -> list[Path]:
    """`<소스>/<name>/*` 을 먼저 보고, 없으면 `<소스>/<name>-*` 을 본다."""
    folder = source / name
    if folder.is_dir():
        found = [p for p in folder.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES]
    else:
        found = [
            p
            for p in source.iterdir()
            if p.suffix.lower() in IMAGE_SUFFIXES
            and re.fullmatch(rf"{re.escape(name)}[-_ ]?\d*", p.stem, re.IGNORECASE)
        ]
    return sorted(found, key=natural_key)


def look_slots(paths: list[Path]) -> list[Path | None]:
    """시선 그림을 16방향 자리에 꽂는다.

    파일 이름이 전부 0~15 사이의 숫자면 그 숫자를 방향 번호로 쓴다.
    (`03.png` 가 없어도 `04.png` 는 4번 자리에 그대로 남는다.)
    그렇지 않으면 정렬한 순서대로 앞에서부터 채운다.
    """
    numbered: dict[int, Path] = {}
    for path in paths:
        digits = re.findall(r"\d+", path.stem)
        if not digits:
            break
        index = int(digits[-1])
        if not 0 <= index < LOOK_COUNT or index in numbered:
            break
        numbered[index] = path
    else:
        return [numbered.get(i) for i in range(LOOK_COUNT)]

    slots: list[Path | None] = [None] * LOOK_COUNT
    for i, path in enumerate(paths[:LOOK_COUNT]):
        slots[i] = path
    return slots


# ------------------------------------------------------------------ 이미지 손질


def remove_background(image: Image.Image, tolerance: int) -> Image.Image:
    """네 모서리에서 번져 나가며 단색 배경을 지운다.

    이미 알파가 있는 그림은 건드리지 않는다. 흰 배경 사진처럼
    가장자리가 한 가지 색으로 이어져 있을 때만 의미가 있다.
    """
    rgb = image.convert("RGB")
    present = set(rgb.getdata())
    sentinel = next((c for c in SENTINELS if c not in present), None)
    if sentinel is None:                          # 후보 색이 전부 그림에 들어 있는 경우
        return image

    for corner in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1),
                   (rgb.width - 1, rgb.height - 1)):
        if rgb.getpixel(corner) != sentinel:
            ImageDraw.floodfill(rgb, corner, sentinel, thresh=tolerance)

    keep = Image.new("L", rgb.size)
    keep.putdata([0 if pixel == sentinel else 255 for pixel in rgb.getdata()])

    result = image.copy()
    # 원본 알파와 교집합 — 이미 투명한 곳은 계속 투명하게 둔다
    result.putalpha(Image.composite(result.getchannel("A"),
                                    Image.new("L", result.size, 0), keep))
    return result


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    """ALPHA_FLOOR 를 넘는 픽셀만 내용으로 보고 경계를 잡는다."""
    alpha = image.getchannel("A").point(lambda v: 255 if v > ALPHA_FLOOR else 0)
    return alpha.getbbox()


def union_box(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def fit_cell(image: Image.Image, box: tuple[int, int, int, int], scale: float,
             pad: int) -> Image.Image:
    """잘라낸 영역을 공통 배율로 줄여 셀 안에 가로 가운데 · 아래쪽으로 붙인다."""
    cropped = image.crop(box)
    width = max(1, round(cropped.width * scale))
    height = max(1, round(cropped.height * scale))
    cropped = cropped.resize((width, height), Image.LANCZOS)

    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.paste(cropped, ((CELL_W - width) // 2, CELL_H - pad - height))
    return cell


# ------------------------------------------------------------------ 배치


class Layout:
    """모든 프레임에 같은 배율을 적용하기 위해 먼저 전체를 훑는다."""

    def __init__(self, align: str, pad: int):
        self.align = align
        self.pad = pad
        # 값이 None 인 칸은 "빈 칸으로 남긴다"는 뜻. 시선 행은 순서가 곧 방향이라
        # 중간이 비어도 앞으로 당기면 안 된다.
        self.sources: dict[int, list[Image.Image | None]] = {}
        self.boxes: dict[int, list[tuple[int, int, int, int] | None]] = {}

    def add(self, row: int, images: list[Image.Image | None], keep_slots: bool = False) -> None:
        kept: list[Image.Image | None] = []
        boxes: list[tuple[int, int, int, int] | None] = []
        for image in images:
            box = alpha_bbox(image) if image is not None else None
            if box is None and not keep_slots:
                continue                # 그냥 버려도 되는 행이면 빈 그림은 뺀다
            kept.append(image if box is not None else None)
            boxes.append(box)
        while kept and kept[-1] is None:   # 뒤쪽 빈 칸은 남겨둘 이유가 없다
            kept.pop()
            boxes.pop()
        if kept:
            self.sources[row] = kept
            self.boxes[row] = boxes

    def resolve_align(self) -> str:
        if self.align != "auto":
            return self.align
        sizes = {img.size for images in self.sources.values() for img in images if img}
        # 원본 캔버스가 모두 같으면 프레임 사이의 상대적인 움직임을 살린다
        return "union" if len(sizes) == 1 else "each"

    def build(self) -> dict[int, list[Image.Image]]:
        align = self.resolve_align()
        all_boxes = [b for boxes in self.boxes.values() for b in boxes if b is not None]
        if not all_boxes:
            raise BuildError("쓸 수 있는 그림이 하나도 없습니다.")

        shared = union_box(all_boxes)
        if align == "union":
            content_w = shared[2] - shared[0]
            content_h = shared[3] - shared[1]
        else:
            content_w = max(b[2] - b[0] for b in all_boxes)
            content_h = max(b[3] - b[1] for b in all_boxes)

        scale = min((CELL_W - self.pad * 2) / content_w, (CELL_H - self.pad * 2) / content_h)
        blank = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))

        out: dict[int, list[Image.Image]] = {}
        for row, images in self.sources.items():
            cells = []
            for image, box in zip(images, self.boxes[row]):
                if image is None or box is None:
                    cells.append(blank.copy())
                else:
                    cells.append(fit_cell(image, shared if align == "union" else box,
                                          scale, self.pad))
            out[row] = cells
        self.used_align = align
        self.used_scale = scale
        return out


# ------------------------------------------------------------------ 빌드


def load_image(path: Path, remove_bg: bool, tolerance: int) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if remove_bg:
        image = remove_background(image, tolerance)
    return image


def build_rows(source: Path, args) -> tuple[dict[int, list[Image.Image]], list[str]]:
    layout = Layout(args.align, args.pad)
    notes: list[str] = []
    raw: dict[int, list[Image.Image]] = {}

    for name, (row, durations) in petpack.ANIMATIONS.items():
        paths = collect_frames(source, name)
        if not paths:
            continue
        if len(paths) > COLS:
            notes.append(f"{name}: 그림이 {len(paths)}장인데 한 행은 {COLS}칸까지라 앞의 "
                         f"{COLS}장만 씁니다.")
            paths = paths[:COLS]
        elif len(paths) > len(durations):
            notes.append(f"{name}: 앱이 쓰는 프레임은 {len(durations)}장까지라 "
                         f"뒤의 {len(paths) - len(durations)}장은 화면에 안 나옵니다.")
        raw[row] = [load_image(p, args.remove_bg, args.bg_tolerance) for p in paths]

    idle_row = petpack.ANIMATIONS["idle"][0]
    if idle_row not in raw:
        raise BuildError(
            "idle 그림을 찾지 못했습니다. `<소스>/idle/` 폴더나 `idle-01.png` 같은 "
            "파일이 최소 한 장은 있어야 합니다."
        )

    if args.mirror:
        right_row = petpack.ANIMATIONS["running-right"][0]
        left_row = petpack.ANIMATIONS["running-left"][0]
        if right_row in raw and left_row not in raw:
            raw[left_row] = [i.transpose(Image.FLIP_LEFT_RIGHT) for i in raw[right_row]]
            notes.append("running-left: running-right 를 좌우로 뒤집어 만들었습니다.")
        elif left_row in raw and right_row not in raw:
            raw[right_row] = [i.transpose(Image.FLIP_LEFT_RIGHT) for i in raw[left_row]]
            notes.append("running-right: running-left 를 좌우로 뒤집어 만들었습니다.")

    look_paths = collect_frames(source, "look")
    if look_paths:
        slots = look_slots(look_paths)
        filled = sum(1 for s in slots if s is not None)
        if filled != LOOK_COUNT:
            notes.append(f"look: {filled}/{LOOK_COUNT} 방향만 채워졌습니다. "
                         "빈 방향은 idle 로 대체됩니다.")
        look_images = [
            load_image(p, args.remove_bg, args.bg_tolerance) if p is not None else None
            for p in slots
        ]
        raw[petpack.LOOK_ROWS[0]] = look_images[:COLS]
        raw[petpack.LOOK_ROWS[1]] = look_images[COLS:]
    else:
        notes.append("look: 시선 그림이 없어 비워 둡니다. 커서를 따라볼 때 idle 로 대체됩니다.")

    for row, images in raw.items():
        layout.add(row, images, keep_slots=row in petpack.LOOK_ROWS)

    cells = layout.build()
    notes.insert(0, f"정렬 방식 {layout.used_align}, 공통 축소 배율 {layout.used_scale:.3f}")
    return cells, notes


def compose_sheet(cells: dict[int, list[Image.Image]]) -> Image.Image:
    sheet = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))
    for row, images in cells.items():
        for col, cell in enumerate(images[:COLS]):
            sheet.paste(cell, (col * CELL_W, row * CELL_H))
    return sheet


def make_preview(sheet: Image.Image, path: Path) -> None:
    """행 이름을 붙인 축소판. 눈으로 한 번 훑어보라고 만든다."""
    shrink = 3
    label_w = 120
    cell_w, cell_h = CELL_W // shrink, CELL_H // shrink
    canvas = Image.new("RGB", (label_w + cell_w * COLS, cell_h * ROWS), (245, 245, 242))
    draw = ImageDraw.Draw(canvas)

    for row in range(ROWS):
        for col in range(COLS):
            x0, y0 = label_w + col * cell_w, row * cell_h
            shade = (228, 228, 224) if (row + col) % 2 else (238, 238, 234)
            draw.rectangle([x0, y0, x0 + cell_w - 1, y0 + cell_h - 1], fill=shade)
        draw.text((8, row * cell_h + cell_h // 2 - 6), ROW_NAMES.get(row, str(row)),
                  fill=(60, 60, 60))

    small = sheet.resize((cell_w * COLS, cell_h * ROWS), Image.LANCZOS)
    canvas.paste(small, (label_w, 0), small)

    for row in range(1, ROWS):
        draw.line([(0, row * cell_h), (canvas.width, row * cell_h)], fill=(200, 200, 196))
    canvas.save(path)


def write_pack(sheet: Image.Image, out_dir: Path, args) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet_name = f"spritesheet.{args.format}"
    sheet_path = out_dir / sheet_name
    if args.format == "webp":
        sheet.save(sheet_path, "WEBP", lossless=True, quality=100, method=6)
    else:
        sheet.save(sheet_path, "PNG")

    manifest = {
        "id": args.id,
        "displayName": args.name or args.id,
        "description": args.desc,
        "spriteVersionNumber": 2,
        "spritesheetPath": sheet_name,
    }
    (out_dir / "pet.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return sheet_path


# ------------------------------------------------------------------ 뼈대 만들기


def init_source(path: Path) -> int:
    if path.exists() and any(path.iterdir()):
        print(f"이미 뭔가 들어 있는 폴더입니다: {path}", file=sys.stderr)
        return 1
    for name in petpack.ANIMATIONS:
        (path / name).mkdir(parents=True, exist_ok=True)
    (path / "look").mkdir(parents=True, exist_ok=True)
    (path / "읽어보세요.txt").write_text(
        "폴더마다 그 동작의 그림을 순서대로 넣으세요. 파일 이름은 01.png, 02.png 처럼.\n"
        "idle 만 반드시 있어야 하고 나머지는 비워 둬도 됩니다.\n"
        "look 은 위(12시)에서 시계방향으로 22.5도씩, 00.png ~ 15.png 로 16장입니다.\n"
        "\n"
        "다 넣었으면:\n"
        f"  python make_petpack.py \"{path}\" --id 펫아이디 --name \"보이는 이름\"\n",
        encoding="utf-8",
    )
    print(f"뼈대를 만들었습니다: {path}")
    return 0


# ------------------------------------------------------------------ 진입점


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="포즈 이미지 폴더를 펫 패키지로 만든다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="예) python make_petpack.py C:\\작업\\내펫 --id my-pet --name \"내 펫\" --mirror",
    )
    parser.add_argument("source", type=Path, help="포즈 이미지가 든 폴더")
    parser.add_argument("--init", action="store_true",
                        help="소스 폴더에 빈 하위 폴더 뼈대만 만들고 끝낸다")
    parser.add_argument("--id", help="펫 아이디 (기본: 소스 폴더 이름)")
    parser.add_argument("--name", help="메뉴에 보이는 이름 (기본: 아이디)")
    parser.add_argument("--desc", default="", help="설명")
    parser.add_argument("--out", type=Path,
                        help="출력 폴더 (기본: ~/.codex/pets/<아이디>)")
    parser.add_argument("--force", action="store_true", help="출력 폴더가 있어도 덮어쓴다")
    parser.add_argument("--mirror", action="store_true",
                        help="걷기 좌우 중 한쪽만 있으면 뒤집어서 나머지를 만든다")
    parser.add_argument("--remove-bg", action="store_true",
                        help="네 모서리에서 번져 나가며 단색 배경을 지운다")
    parser.add_argument("--bg-tolerance", type=int, default=30,
                        help="배경으로 볼 색 차이 (기본 30, 크게 줄수록 많이 지움)")
    parser.add_argument("--align", choices=("auto", "union", "each"), default="auto",
                        help="union=프레임 간 움직임 유지, each=한 장씩 바닥에 맞춤")
    parser.add_argument("--pad", type=int, default=6, help="셀 안쪽 여백 픽셀 (기본 6)")
    parser.add_argument("--format", choices=("webp", "png"), default="webp")
    parser.add_argument("--no-preview", action="store_true", help="미리보기 PNG를 만들지 않는다")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 보여준다")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if args.init:
        return init_source(args.source)

    if not args.source.is_dir():
        print(f"소스 폴더가 없습니다: {args.source}", file=sys.stderr)
        return 1

    args.id = args.id or args.source.name
    if not re.fullmatch(r"[A-Za-z0-9._-]+", args.id):
        print(f"펫 아이디에는 영문·숫자·`.`·`_`·`-` 만 쓸 수 있습니다: {args.id}", file=sys.stderr)
        return 1

    out_dir = args.out or petpack.pets_root() / args.id
    if out_dir.exists() and any(out_dir.iterdir()) and not (args.force or args.dry_run):
        print(f"출력 폴더에 이미 파일이 있습니다: {out_dir}\n덮어쓰려면 --force", file=sys.stderr)
        return 1

    try:
        cells, notes = build_rows(args.source, args)
    except BuildError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    sheet = compose_sheet(cells)

    print(f"아틀라스 {sheet.width}x{sheet.height}")
    for row in range(ROWS):
        drawn = [c for c in cells.get(row, []) if c.getbbox() is not None]
        state = f"{len(drawn)}칸" if drawn else "비어 있음"
        print(f"  행 {row:>2}  {ROW_NAMES.get(row, ''):<14} {state}")
    for note in notes:
        print(f"  · {note}")

    if args.dry_run:
        print("\n--dry-run 이라 파일은 쓰지 않았습니다.")
        return 0

    if out_dir.exists() and args.force:
        shutil.rmtree(out_dir)
    sheet_path = write_pack(sheet, out_dir, args)

    if not args.no_preview:
        preview_path = out_dir / "preview.png"
        make_preview(sheet, preview_path)
        print(f"\n미리보기 {preview_path}")

    # 앱이 실제로 읽을 수 있는지 같은 로더로 확인한다
    try:
        pack = petpack.PetPack.load(out_dir)
    except petpack.PetLoadError as exc:
        print(f"\n만들긴 했는데 앱이 못 읽습니다: {exc}", file=sys.stderr)
        return 1

    print(f"스프라이트시트 {sheet_path}")
    print(f"매니페스트 {out_dir / 'pet.json'}")
    print(f"쓸 수 있는 동작: {', '.join(pack.available_animations())}")
    print("\n펫을 다시 실행하면 우클릭 → 펫 바꾸기 에 나타납니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
