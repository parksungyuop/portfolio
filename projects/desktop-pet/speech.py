"""펫 머리 위에 뜨는 말풍선.

대사는 `config.json` 의 "speech" 섹션에 상황별로 나뉘어 저장된다.
우클릭 → 말풍선 → 대사 설정 창에서 직접 고칠 수 있고, 저장하면 즉시 반영된다.

말풍선 창은 입력을 통과시키는(WindowTransparentForInput) 별도 최상위 창이라
펫을 드래그하거나 바탕화면을 클릭하는 데 방해가 되지 않는다.
"""

from __future__ import annotations

import random

from PyQt6.QtCore import QPoint, QRect, QRectF, Qt
from PyQt6.QtGui import QColor, QFont, QFontMetrics, QPainter, QPainterPath, QPen
from PyQt6.QtWidgets import QApplication, QWidget

CONFIG_KEY = "speech"

# (키, 설정 창에 보이는 이름, 언제 나오는지 설명)
CATEGORIES: list[tuple[str, str, str]] = [
    ("idle",        "평소",           "가만히 있을 때 가끔 혼잣말합니다"),
    ("work_start",  "작업 시작",      "Claude 가 일을 시작한 순간 한 번"),
    ("work_busy",   "작업 중",        "Claude 가 일하는 동안 가끔"),
    ("work_end",    "작업 끝",        "Claude 가 멈춘 순간 한 번"),
    ("pickup",      "집어 들었을 때", "마우스로 잡아 올릴 때"),
    ("claude_open", "Claude 열기",    "더블클릭으로 Claude 를 띄울 때"),
]

CATEGORY_KEYS = [key for key, _, _ in CATEGORIES]

DEFAULT_LINES: dict[str, list[str]] = {
    "idle": [
        "오늘도 잘 부탁해",
        "커피 한 잔 하고 오지 그래",
        "심심하다…",
        "허리 좀 펴고 앉아",
    ],
    "work_start": [
        "좋아, 시작해 보자",
        "이번 건은 금방 끝나겠는데",
    ],
    "work_busy": [
        "열심히 굴러가는 중",
        "조금만 더…",
    ],
    "work_end": [
        "끝! 확인해 봐",
        "수고했어",
    ],
    "pickup": [
        "어어, 어디 가는 거야",
        "내려줘…",
    ],
    "claude_open": [
        "클로드 부르러 간다",
    ],
}

BUBBLE_MAX_W = 280
PAD_X = 14
PAD_Y = 10
TAIL_W = 16
TAIL_H = 10
RADIUS = 12
TEXT_FLAGS = int(Qt.TextFlag.TextWordWrap.value | Qt.AlignmentFlag.AlignHCenter.value)


# ------------------------------------------------------------------ 설정값


def default_settings() -> dict:
    return {
        "enabled": True,
        "min_interval_sec": 25,
        "max_interval_sec": 70,
        "duration_sec": 4.0,
        "font_size": 10,
        "lines": {key: list(value) for key, value in DEFAULT_LINES.items()},
    }


def load_settings(cfg: dict) -> dict:
    """저장된 값을 기본값 위에 덮어쓴다. 깨진 값은 조용히 무시한다."""
    base = default_settings()
    stored = cfg.get(CONFIG_KEY)
    if not isinstance(stored, dict):
        return base

    if "enabled" in stored:
        base["enabled"] = bool(stored["enabled"])
    for key in ("min_interval_sec", "max_interval_sec", "duration_sec", "font_size"):
        try:
            base[key] = type(base[key])(stored[key])
        except (KeyError, TypeError, ValueError):
            pass

    lines = stored.get("lines")
    if isinstance(lines, dict):
        for key in CATEGORY_KEYS:
            value = lines.get(key)
            if isinstance(value, list):
                base["lines"][key] = [str(s).strip() for s in value if str(s).strip()]

    return sanitize(base)


def sanitize(settings: dict) -> dict:
    settings["min_interval_sec"] = max(3, int(settings["min_interval_sec"]))
    settings["max_interval_sec"] = max(settings["min_interval_sec"],
                                       int(settings["max_interval_sec"]))
    settings["duration_sec"] = min(30.0, max(1.0, float(settings["duration_sec"])))
    settings["font_size"] = min(24, max(7, int(settings["font_size"])))
    return settings


def store_settings(cfg: dict, settings: dict) -> None:
    cfg[CONFIG_KEY] = settings


# ------------------------------------------------------------------ 말풍선


class SpeechBubble(QWidget):
    """둥근 말풍선 하나. 꼬리가 펫 머리를 가리킨다."""

    def __init__(self):
        super().__init__(None)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.Tool
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.WindowDoesNotAcceptFocus
            | Qt.WindowType.WindowTransparentForInput   # 클릭이 그대로 통과한다
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self._text = ""
        self._text_rect = QRect()
        self._tail_x = TAIL_W
        self._font = QFont()
        self._font.setFamilies(["Malgun Gothic", "Segoe UI", "sans-serif"])
        self._font.setPointSize(10)

    def set_font_size(self, points: int) -> None:
        self._font.setPointSize(max(7, int(points)))

    def show_text(self, text: str, anchor: QPoint) -> None:
        self._text = text
        metrics = QFontMetrics(self._font)
        measured = metrics.boundingRect(QRect(0, 0, BUBBLE_MAX_W, 10000), TEXT_FLAGS, text)
        self._text_rect = QRect(PAD_X, PAD_Y,
                                max(measured.width(), 40), max(measured.height(), 16))
        self.resize(self._text_rect.width() + PAD_X * 2,
                    self._text_rect.height() + PAD_Y * 2 + TAIL_H)
        self.move_to(anchor)
        self.show()
        self.raise_()

    def move_to(self, anchor: QPoint) -> None:
        """꼬리 끝이 anchor 를 가리키도록 옮긴다. 화면 밖으로는 안 나간다."""
        if self._text_rect.isNull():
            return
        width, height = self.width(), self.height()
        screen = QApplication.screenAt(anchor) or QApplication.primaryScreen()
        area = screen.availableGeometry()
        x = max(area.left() + 2, min(anchor.x() - width // 2, area.right() - width - 2))
        y = max(area.top() + 2, anchor.y() - height)
        # 화면 가장자리에서 창이 밀려도 꼬리는 계속 펫을 가리키게 한다
        self._tail_x = max(RADIUS + TAIL_W,
                           min(anchor.x() - x, width - RADIUS - TAIL_W))
        self.move(x, y)

    def paintEvent(self, event) -> None:  # noqa: N802 (Qt 시그니처)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        body = QRectF(0.7, 0.7, self.width() - 1.4, self.height() - TAIL_H - 1.4)
        shape = QPainterPath()
        shape.addRoundedRect(body, RADIUS, RADIUS)

        tail = QPainterPath()
        tail.moveTo(self._tail_x - TAIL_W / 2, body.bottom() - 1)
        tail.lineTo(self._tail_x, body.bottom() + TAIL_H)
        tail.lineTo(self._tail_x + TAIL_W / 2, body.bottom() - 1)
        tail.closeSubpath()

        painter.setPen(QPen(QColor(56, 56, 62, 225), 1.4))
        painter.setBrush(QColor(255, 255, 255, 243))
        painter.drawPath(shape.united(tail))

        painter.setFont(self._font)
        painter.setPen(QColor(28, 28, 32))
        painter.drawText(self._text_rect, TEXT_FLAGS, self._text)


# ------------------------------------------------------------------ 연출


class SpeechDirector:
    """언제 무슨 대사를 띄울지 정한다. 펫 창이 매 틱 `tick()` 을 부른다."""

    def __init__(self, pet, cfg: dict):
        self.pet = pet
        self.cfg = cfg
        self.settings = load_settings(cfg)
        self.bubble = SpeechBubble()
        self.bubble.set_font_size(self.settings["font_size"])
        self._show_ms_left = 0
        self._next_ms = 0
        self._last: dict[str, str] = {}
        self._reschedule()

    # ---------------------------------------------------------- 상태 변경

    @property
    def enabled(self) -> bool:
        return bool(self.settings["enabled"])

    def set_enabled(self, value: bool) -> None:
        self.settings["enabled"] = bool(value)
        if not value:
            self.hide()

    def apply(self, settings: dict) -> None:
        """설정 창에서 저장을 눌렀을 때 통째로 갈아 끼운다."""
        self.settings = sanitize(settings)
        self.bubble.set_font_size(self.settings["font_size"])
        self.hide()
        self._reschedule()

    def hide(self) -> None:
        self._show_ms_left = 0
        if self.bubble.isVisible():
            self.bubble.hide()

    # ---------------------------------------------------------- 대사 출력

    def lines_for(self, category: str) -> list[str]:
        return [s for s in self.settings["lines"].get(category, []) if s.strip()]

    def say(self, category: str) -> bool:
        """해당 상황의 대사 하나를 띄운다. 대사가 비어 있으면 아무것도 안 한다."""
        if not self.enabled:
            return False
        pool = self.lines_for(category)
        if not pool:
            return False
        previous = self._last.get(category)
        candidates = [s for s in pool if s != previous] or pool
        line = random.choice(candidates)
        self._last[category] = line
        self.show_now(line)
        return True

    def show_now(self, text: str) -> None:
        """대사 목록을 거치지 않고 주어진 문구를 바로 띄운다 (미리보기용)."""
        text = text.strip()
        if not text:
            return
        self.bubble.show_text(text, self._anchor())
        self._show_ms_left = int(self.settings["duration_sec"] * 1000)
        self._reschedule()

    # ------------------------------------------------------------- 루프

    def tick(self, dt_ms: int) -> None:
        if not self.enabled:
            self.hide()
            return

        if self._show_ms_left > 0:
            self._show_ms_left -= dt_ms
            if self._show_ms_left <= 0:
                self.bubble.hide()
            else:
                self.bubble.move_to(self._anchor())   # 펫을 따라다닌다
            return

        self._next_ms -= dt_ms
        if self._next_ms <= 0:
            watcher = getattr(self.pet, "watcher", None)
            working = watcher is not None and watcher.active
            if not self.say("work_busy" if working else "idle"):
                self._reschedule()

    # ------------------------------------------------------------ 내부

    def _anchor(self) -> QPoint:
        """말풍선 꼬리가 가리킬 지점 = 펫 머리 위."""
        pet = self.pet
        return QPoint(int(pet.px + pet.width() / 2), int(pet.py) + 4)

    def _reschedule(self) -> None:
        low = int(self.settings["min_interval_sec"]) * 1000
        high = int(self.settings["max_interval_sec"]) * 1000
        self._next_ms = random.randint(low, max(low, high))
