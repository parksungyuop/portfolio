"""Codex v2 펫 패키지 로더.

`~/.codex/pets/<name>/pet.json` + 스프라이트시트를 읽어 프레임 단위로 잘라준다.
아틀라스 규격(hatch-pet 스킬 계약서와 동일):
  - 8열 x 11행, 셀 192x208, 전체 1536x2288, RGBA
  - 행 0-8  : 표준 애니메이션
  - 행 9-10 : 시계방향 16방향 시선 (0도 = 위/12시)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

CELL_W, CELL_H = 192, 208
COLS, ROWS = 8, 11

# 행 번호와 프레임별 지속시간(ms). animation-rows.md 값 그대로.
ANIMATIONS: dict[str, tuple[int, list[int]]] = {
    "idle":          (0, [280, 110, 110, 140, 140, 320]),
    "running-right": (1, [120] * 7 + [220]),
    "running-left":  (2, [120] * 7 + [220]),
    "waving":        (3, [140] * 3 + [280]),
    "jumping":       (4, [140] * 4 + [280]),
    "failed":        (5, [140] * 7 + [240]),
    "waiting":       (6, [150] * 5 + [260]),
    "running":       (7, [120] * 5 + [220]),
    "review":        (8, [150] * 5 + [280]),
}

LOOK_ROWS = (9, 10)          # 16방향 시선
LOOK_STEP_DEG = 360.0 / 16   # 22.5도


def pets_root() -> Path:
    """Codex 펫 디렉터리. CODEX_HOME 환경변수를 존중한다."""
    home = os.environ.get("CODEX_HOME")
    base = Path(home) if home else Path.home() / ".codex"
    return base / "pets"


def discover_pets(root: Path | None = None) -> list[Path]:
    """pet.json 을 가진 하위 폴더를 모두 찾는다."""
    root = root or pets_root()
    if not root.is_dir():
        return []
    found = [d for d in sorted(root.iterdir()) if (d / "pet.json").is_file()]
    return found


class PetLoadError(RuntimeError):
    pass


@dataclass
class PetPack:
    """펫 하나의 매니페스트 + 잘라놓은 프레임들."""

    path: Path
    pet_id: str
    display_name: str
    description: str
    version: int
    frames: list[list[Image.Image | None]] = field(repr=False, default_factory=list)

    @classmethod
    def load(cls, path: Path) -> "PetPack":
        manifest_file = path / "pet.json"
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except OSError as exc:
            raise PetLoadError(f"pet.json 을 읽을 수 없습니다: {manifest_file}") from exc
        except json.JSONDecodeError as exc:
            raise PetLoadError(f"pet.json 형식이 잘못되었습니다: {manifest_file}") from exc

        version = int(manifest.get("spriteVersionNumber", 1))
        if version != 2:
            raise PetLoadError(
                f"{path.name}: spriteVersionNumber 가 {version} 입니다. "
                "이 앱은 v2(8x11) 아틀라스만 지원합니다."
            )

        sheet_file = path / manifest.get("spritesheetPath", "spritesheet.webp")
        if not sheet_file.is_file():
            raise PetLoadError(f"스프라이트시트를 찾을 수 없습니다: {sheet_file}")

        sheet = Image.open(sheet_file).convert("RGBA")
        expected = (CELL_W * COLS, CELL_H * ROWS)
        if sheet.size != expected:
            raise PetLoadError(
                f"{path.name}: 아틀라스 크기가 {sheet.size} 입니다. "
                f"{expected} 이어야 합니다."
            )

        frames: list[list[Image.Image | None]] = []
        for row in range(ROWS):
            row_frames: list[Image.Image | None] = []
            for col in range(COLS):
                box = (col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H)
                cell = sheet.crop(box)
                # 완전 투명한 셀은 "사용 안 함" 표시라 None 으로 둔다.
                row_frames.append(None if cell.getbbox() is None else cell)
            frames.append(row_frames)

        return cls(
            path=path,
            pet_id=str(manifest.get("id", path.name)),
            display_name=str(manifest.get("displayName", path.name)),
            description=str(manifest.get("description", "")),
            version=version,
            frames=frames,
        )

    # --- 조회 헬퍼 -------------------------------------------------

    def animation(self, name: str) -> tuple[list[Image.Image], list[int]]:
        """이름으로 애니메이션 프레임과 지속시간을 얻는다.

        계약서상 사용 열보다 실제로 그려진 열이 많은 아틀라스도 있어서,
        지속시간 목록 길이를 실제 프레임 수에 맞춰 잘라내거나 늘린다.
        """
        row, durations = ANIMATIONS[name]
        cells = [c for c in self.frames[row] if c is not None]
        if not cells:
            raise PetLoadError(f"{self.pet_id}: '{name}' 행이 비어 있습니다.")
        cells = cells[: len(durations)]
        return cells, durations[: len(cells)]

    def look_frame(self, index: int) -> Image.Image:
        """0=위(12시) 기준 시계방향 16단계 중 index 번째 시선 프레임."""
        index %= 16
        row = LOOK_ROWS[index // COLS]
        cell = self.frames[row][index % COLS]
        if cell is None:  # 시선 행은 전부 채워져 있어야 하지만 방어적으로 처리
            cell = self.animation("idle")[0][0]
        return cell

    def available_animations(self) -> list[str]:
        out = []
        for name, (row, _) in ANIMATIONS.items():
            if any(c is not None for c in self.frames[row]):
                out.append(name)
        return out
