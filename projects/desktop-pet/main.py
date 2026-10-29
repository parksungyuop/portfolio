"""데스크톱 펫 - Codex v2 펫 패키지를 윈도우 바탕화면 위에 띄운다.

  * 항상 위에 뜨는 투명 프레임리스 창 (작업표시줄에는 안 보임)
  * 걷기 / 인사 / 점프 / 대기 / 작업중 / 폭발(review) 자동 연출
  * 마우스 커서를 16방향으로 따라 봄
  * 드래그해서 옮기고 던지면 중력을 받아 떨어짐
  * 더블클릭하면 Claude 데스크톱 앱 실행
  * Claude 가 작업 중이면 안경 쓰고 노트북 앞에 앉아 같이 일함
  * 상황별 말풍선 (대사는 우클릭 → 말풍선 → 대사 설정에서 직접 편집)
  * 트레이 아이콘에서 펫 교체, 크기, 동작 강제 실행
"""

from __future__ import annotations

import ctypes
import json
import math
import random
import sys
import threading
from pathlib import Path

from PIL import Image
from PyQt6.QtCore import QPoint, QTimer, Qt
from PyQt6.QtGui import QAction, QActionGroup, QCursor, QIcon, QImage, QPainter, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QMenu,
    QMessageBox,
    QSystemTrayIcon,
    QWidget,
)

import activity
import launcher
import petpack
import speech
import working_pose

APP_DIR = Path(__file__).resolve().parent
CONFIG_FILE = APP_DIR / "config.json"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE = "ClaudeDesktopPet"

TICK_MS = 16                 # 약 60fps
WALK_SPEED = 105.0           # px/s (배율 1.0 기준)
GRAVITY = 2400.0             # px/s^2
BOUNCE = 0.34                # 착지 반발 계수
FRICTION = 0.62              # 착지 시 수평 감쇠
LOOK_RADIUS = 420.0          # 이 거리 안에 커서가 있으면 쳐다본다
LOOK_DEADZONE = 34.0         # 이보다 가까우면 정면(=idle)으로 간주

# (동작 이름, 가중치, 최소 반복, 최대 반복)
BEHAVIOR_TABLE = [
    ("idle",    30, 2, 5),
    ("walk",    28, 1, 1),
    ("waving",   9, 1, 2),
    ("jumping", 10, 1, 3),
    ("waiting",  8, 1, 2),
    ("running",  8, 2, 4),
    ("failed",   3, 1, 1),
    ("review",   4, 1, 1),
]

ANIMATION_LABELS = {
    "idle": "가만히",
    "running-right": "오른쪽으로 걷기",
    "running-left": "왼쪽으로 걷기",
    "waving": "인사하기",
    "jumping": "점프",
    "failed": "시무룩",
    "waiting": "기다리기",
    "running": "작업 중",
    "review": "점화 · 폭발 · 재생성",
    "working": "안경 쓰고 노트북 작업",
}

# 합성으로 만드는 포즈 — 무작위 순환에는 넣지 않고 Claude가 일할 때만 쓴다
WORKING_ANIM = "working"


def pil_to_pixmap(img: Image.Image, scale: float) -> QPixmap:
    if scale != 1.0:
        size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
        img = img.resize(size, Image.LANCZOS)
    data = img.tobytes("raw", "RGBA")
    qimg = QImage(data, img.width, img.height, img.width * 4, QImage.Format.Format_RGBA8888)
    return QPixmap.fromImage(qimg.copy())  # copy() 로 파이썬 버퍼와 분리


class SpriteSet:
    """한 펫을 한 배율로 미리 렌더해 둔 QPixmap 모음."""

    def __init__(self, pack: petpack.PetPack, scale: float):
        self.pack = pack
        self.scale = scale
        self.anims: dict[str, tuple[list[QPixmap], list[int]]] = {}
        for name in pack.available_animations():
            cells, durations = pack.animation(name)
            self.anims[name] = ([pil_to_pixmap(c, scale) for c in cells], durations)
        self.looks = [pil_to_pixmap(pack.look_frame(i), scale) for i in range(16)]

        # 안경 + 노트북 포즈는 원본 아틀라스에 없어서 합성해 붙인다.
        # 눈 탐지가 실패할 수 있는 선택적 연출이므로 실패해도 앱은 계속 뜬다.
        try:
            cells, durations = working_pose.build_frames(pack)
            self.anims[WORKING_ANIM] = ([pil_to_pixmap(c, scale) for c in cells], durations)
        except Exception as exc:  # noqa: BLE001 - 연출 실패가 앱을 죽이면 안 된다
            print(f"[pet] '{WORKING_ANIM}' 포즈 생성 실패: {exc}", file=sys.stderr)

        first = self.anims["idle"][0][0]
        self.width = first.width()
        self.height = first.height()

    def has(self, name: str) -> bool:
        return name in self.anims


def load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_config(cfg: dict) -> None:
    try:
        CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


class PetWindow(QWidget):
    """바탕화면 위를 돌아다니는 펫 창."""

    def __init__(self, packs: list[petpack.PetPack], cfg: dict):
        super().__init__()
        self.packs = packs
        self.cfg = cfg
        self.scale = float(cfg.get("scale", 0.5))
        self.look_enabled = bool(cfg.get("look_enabled", True))
        self.always_on_top = bool(cfg.get("always_on_top", True))

        wanted = cfg.get("pet_id")
        self.pack = next((p for p in packs if p.pet_id == wanted), packs[0])
        self.sprites = SpriteSet(self.pack, self.scale)

        # 물리 상태
        self.px = 0.0
        self.py = 0.0
        self.vx = 0.0
        self.vy = 0.0
        self.airborne = False
        self.dragging = False
        self._heal_ms_left = 0            # 입력 잠금 자가 복구 확인 주기
        self.drag_offset = QPoint()
        self.drag_last: QPoint | None = None
        self.drag_vx = 0.0
        self.drag_vy = 0.0

        # 애니메이션 상태
        self.anim_name = "idle"
        self.frames: list[QPixmap] = []
        self.durations: list[int] = []
        self.frame_idx = 0
        self.frame_elapsed = 0
        self.look_index: int | None = None

        # 행동 상태
        self.behavior = "idle"
        self.behavior_ms_left = 0
        self.behavior_loops_left = 0
        self.walk_dir = 1
        self.forced: str | None = None
        self.tray: QSystemTrayIcon | None = None

        # Claude 가 작업 중인지 지켜보는 백그라운드 감시자
        self.watcher = activity.ClaudeActivityWatcher(
            window_sec=float(cfg.get("claude_activity_window_sec", activity.DEFAULT_WINDOW_SEC))
        )
        self.watcher.enabled = bool(cfg.get("claude_activity", True))
        self._was_working = self.watcher.active

        # 말풍선 — 대사 목록과 등장 간격은 cfg["speech"] 에 들어 있다
        self.speech = speech.SpeechDirector(self, cfg)
        self._speech_dialog = None

        self._init_window()
        self._apply_sprites(keep_position=False)
        self._set_animation("idle")
        self._start_behavior("idle")

        self.timer = QTimer(self)
        self.timer.timeout.connect(self._tick)
        self.timer.start(TICK_MS)

    # ------------------------------------------------------------------ 창

    def _init_window(self) -> None:
        flags = (
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.Tool                      # 작업표시줄에 안 뜨게
            | Qt.WindowType.WindowDoesNotAcceptFocus  # 다른 창의 포커스를 뺏지 않게
        )
        if self.always_on_top:
            flags |= Qt.WindowType.WindowStaysOnTopHint
        self.setWindowFlags(flags)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowTitle("Desktop Pet")
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_menu)

    def _screen_rect(self):
        center = QPoint(int(self.px) + self.width() // 2, int(self.py) + self.height() // 2)
        screen = QApplication.screenAt(center) or QApplication.primaryScreen()
        return screen.availableGeometry()

    def _ground_y(self) -> float:
        return float(self._screen_rect().bottom() - self.height() + 1)

    def _apply_sprites(self, keep_position: bool = True) -> None:
        """스프라이트 교체 후 창 크기와 위치를 다시 맞춘다."""
        old_center_x = self.px + self.width() / 2 if keep_position else None
        self.resize(self.sprites.width, self.sprites.height)
        rect = self._screen_rect()
        if old_center_x is None:
            self.px = rect.left() + rect.width() * 0.62
        else:
            self.px = old_center_x - self.sprites.width / 2
        self.py = self._ground_y()
        self._clamp_to_screen()
        self.move(int(self.px), int(self.py))

    def _clamp_to_screen(self) -> None:
        rect = self._screen_rect()
        self.px = min(max(self.px, rect.left()), rect.right() - self.width() + 1)
        self.py = min(max(self.py, rect.top()), self._ground_y())

    # ---------------------------------------------------------- 애니메이션

    def _set_animation(self, name: str) -> None:
        if not self.sprites.has(name):
            name = "idle"
        if name == self.anim_name and self.frames:
            return
        self.anim_name = name
        self.frames, self.durations = self.sprites.anims[name]
        self.frame_idx = 0
        self.frame_elapsed = 0

    def _advance_animation(self, dt_ms: int) -> bool:
        """프레임을 진행시키고, 한 바퀴 돌았으면 True."""
        wrapped = False
        self.frame_elapsed += dt_ms
        while self.frame_elapsed >= self.durations[self.frame_idx]:
            self.frame_elapsed -= self.durations[self.frame_idx]
            self.frame_idx += 1
            if self.frame_idx >= len(self.frames):
                self.frame_idx = 0
                wrapped = True
        return wrapped

    # -------------------------------------------------------------- 행동

    def _start_behavior(self, name: str, loops: int | None = None) -> None:
        self.behavior = name
        self.behavior_loops_left = 0
        self.behavior_ms_left = 0

        if name == "idle":
            self._set_animation("idle")
            self.behavior_ms_left = random.randint(1800, 4800)
        elif name == "walk":
            self.walk_dir = random.choice((-1, 1))
            self._set_animation("running-right" if self.walk_dir > 0 else "running-left")
            self.behavior_ms_left = random.randint(1600, 5200)
        elif name == "jumping":
            self._set_animation("jumping")
            self.behavior_loops_left = loops or random.randint(1, 3)
            self._launch_hop()
        elif name == WORKING_ANIM:
            # Claude 가 멈출 때까지 계속 — 시간 제한도 반복 횟수도 두지 않는다
            self._set_animation(WORKING_ANIM)
        else:
            self._set_animation(name)
            table = {n: (lo, hi) for n, _, lo, hi in BEHAVIOR_TABLE}
            lo, hi = table.get(name, (1, 2))
            self.behavior_loops_left = loops or random.randint(lo, hi)

    def _heal_input(self, dt: int) -> None:
        """모달 창이 없는데 창이 비활성으로 남아 있으면 되살린다.

        Qt 는 모달 창을 띄우면서 다른 창에 EnableWindow(FALSE) 를 건다.
        그 창이 제대로 닫히지 못하면 잠금이 안 풀려서, 펫은 타이머로 계속
        움직이는데 마우스만 안 먹는 상태가 된다. 파일 대화상자나 메시지
        상자에서도 같은 일이 날 수 있어 여기서 한 번씩 확인해 되돌린다.
        """
        if sys.platform != "win32":
            return
        self._heal_ms_left -= dt
        if self._heal_ms_left > 0:
            return
        self._heal_ms_left = 1000

        modal = QApplication.activeModalWidget()
        if modal is not None and modal.isVisible():
            return                      # 정상적으로 모달 창이 떠 있는 중
        hwnd = int(self.winId())
        user32 = ctypes.windll.user32
        if not user32.IsWindowEnabled(hwnd):
            user32.EnableWindow(hwnd, True)

    def _launch_hop(self) -> None:
        self.airborne = True
        self.vy = -720.0 * self.scale
        self.vx = random.uniform(-70.0, 70.0) * self.scale

    def _next_behavior(self) -> None:
        if self.forced:
            name, self.forced = self.forced, None
            self._start_behavior(name)
            return
        names = [n for n, _, _, _ in BEHAVIOR_TABLE]
        weights = [w for _, w, _, _ in BEHAVIOR_TABLE]
        # 같은 행동이 연속으로 나오면 심심하니 방금 한 건 가중치를 낮춘다
        weights = [w * 0.25 if n == self.behavior else w for n, w in zip(names, weights)]
        self._start_behavior(random.choices(names, weights=weights)[0])

    def play(self, name: str) -> None:
        """메뉴에서 특정 동작을 즉시 실행."""
        mapping = {"running-right": "walk", "running-left": "walk"}
        if name in mapping:
            self._start_behavior("walk")
            self.walk_dir = 1 if name == "running-right" else -1
            self._set_animation(name)
        else:
            self._start_behavior(name, loops=1 if name not in ("idle",) else None)

    # -------------------------------------------------------------- 루프

    def _tick(self) -> None:
        dt = TICK_MS
        self._heal_input(dt)
        self.speech.tick(dt)

        if self.dragging:
            self._set_animation("waving")
            self._advance_animation(dt)
            self.look_index = None
            self.update()
            return

        self._sync_claude_activity()

        rect = self._screen_rect()
        left_bound = float(rect.left())
        right_bound = float(rect.right() - self.width() + 1)
        ground = self._ground_y()

        if self.airborne:
            self.vy += GRAVITY * self.scale * dt / 1000.0
            self.px += self.vx * dt / 1000.0
            self.py += self.vy * dt / 1000.0

            if self.px < left_bound:
                self.px, self.vx = left_bound, -self.vx * 0.6
            elif self.px > right_bound:
                self.px, self.vx = right_bound, -self.vx * 0.6

            landed = False
            if self.py >= ground:
                self.py = ground
                if abs(self.vy) > 260 * self.scale:
                    self.vy = -self.vy * BOUNCE      # 통통 튀기
                    self.vx *= FRICTION
                else:
                    self.vx = self.vy = 0.0
                    self.airborne = False
                    landed = True

            self._set_animation("jumping")
            self._advance_animation(dt)

            if landed:
                if self.behavior == "jumping" and self.behavior_loops_left > 1:
                    self.behavior_loops_left -= 1
                    self._launch_hop()
                else:
                    self._next_behavior()
        else:
            if self.behavior == "walk":
                self.px += self.walk_dir * WALK_SPEED * self.scale * dt / 1000.0
                if self.px <= left_bound:
                    self.px, self.walk_dir = left_bound, 1
                    self._set_animation("running-right")
                elif self.px >= right_bound:
                    self.px, self.walk_dir = right_bound, -1
                    self._set_animation("running-left")

            wrapped = self._advance_animation(dt)

            if self.behavior_ms_left > 0:
                self.behavior_ms_left -= dt
                if self.behavior_ms_left <= 0:
                    self._next_behavior()
            elif self.behavior_loops_left > 0 and wrapped:
                self.behavior_loops_left -= 1
                if self.behavior_loops_left <= 0:
                    self._next_behavior()

        self._update_look()
        self.move(int(self.px), int(self.py))
        self.update()

    def _sync_claude_activity(self) -> None:
        """Claude 가 일하는 동안에는 안경 쓰고 노트북 보는 자세로 고정한다."""
        working = self.watcher.active

        # 시작 / 끝 대사는 자세 전환과 별개로, 상태가 바뀌는 순간에만 한 번씩
        if working != self._was_working:
            self._was_working = working
            self.speech.say("work_start" if working else "work_end")

        if self.airborne or not self.sprites.has(WORKING_ANIM):
            return
        if working and self.behavior != WORKING_ANIM:
            self._start_behavior(WORKING_ANIM)
        elif not working and self.behavior == WORKING_ANIM:
            self._next_behavior()

    def _update_look(self) -> None:
        """커서 방향을 16단계로 양자화. 0 = 위(12시), 시계방향."""
        self.look_index = None
        if not self.look_enabled or self.airborne:
            return
        if self.behavior not in ("idle", "waiting"):
            return
        cursor = QCursor.pos()
        cx = self.px + self.width() / 2.0
        cy = self.py + self.height() * 0.42     # 머리 높이 기준
        dx = cursor.x() - cx
        dy = cursor.y() - cy
        distance = math.hypot(dx, dy)
        if distance <= LOOK_DEADZONE or distance >= LOOK_RADIUS:
            return  # 데드존과 사정권 밖은 정면 = idle 로 폴백
        angle = math.degrees(math.atan2(dx, -dy)) % 360.0
        self.look_index = int(round(angle / petpack.LOOK_STEP_DEG)) % 16

    def paintEvent(self, event) -> None:  # noqa: N802 (Qt 시그니처)
        painter = QPainter(self)
        if self.look_index is not None:
            pixmap = self.sprites.looks[self.look_index]
        else:
            pixmap = self.frames[self.frame_idx]
        painter.drawPixmap(0, 0, pixmap)

    # -------------------------------------------------------------- 입력

    def mousePressEvent(self, event) -> None:  # noqa: N802
        if event.button() != Qt.MouseButton.LeftButton:
            return
        self.dragging = True
        self.airborne = False
        self.vx = self.vy = 0.0
        self.drag_vx = self.drag_vy = 0.0
        self.drag_offset = event.position().toPoint()
        self.drag_last = event.globalPosition().toPoint()
        self.speech.say("pickup")
        event.accept()

    def mouseMoveEvent(self, event) -> None:  # noqa: N802
        if not self.dragging:
            return
        pos = event.globalPosition().toPoint()
        if self.drag_last is not None:
            # 놓는 순간의 속도를 위해 최근 이동량을 지수 평활로 누적
            gain = 0.4 * (1000 / TICK_MS)
            self.drag_vx = self.drag_vx * 0.6 + (pos.x() - self.drag_last.x()) * gain
            self.drag_vy = self.drag_vy * 0.6 + (pos.y() - self.drag_last.y()) * gain
        self.drag_last = pos
        self.px = float(pos.x() - self.drag_offset.x())
        self.py = float(pos.y() - self.drag_offset.y())
        self.move(int(self.px), int(self.py))
        event.accept()

    def mouseReleaseEvent(self, event) -> None:  # noqa: N802
        if event.button() != Qt.MouseButton.LeftButton or not self.dragging:
            return
        self.dragging = False
        self.drag_last = None
        self._start_behavior("jumping", loops=1)
        # _launch_hop 이 넣은 초기 속도를 실제로 던진 속도로 덮어쓴다
        self.airborne = True
        self.vx = max(-1800.0, min(1800.0, self.drag_vx))
        self.vy = max(-1800.0, min(1800.0, self.drag_vy))
        event.accept()

    def mouseDoubleClickEvent(self, event) -> None:  # noqa: N802
        if event.button() == Qt.MouseButton.LeftButton:
            self.open_claude()
            event.accept()

    # -------------------------------------------------------------- Claude

    def open_claude(self) -> None:
        """더블클릭 / 메뉴에서 Claude 데스크톱 앱을 띄운다."""
        self.play("waving")     # 인사하고 나서 실행
        self.speech.say("claude_open")
        ok, message = launcher.launch_claude(self.cfg)
        save_config(self.cfg)   # 찾아낸 실행 방법을 캐시해 둔다
        if ok:
            self.notify("Claude를 실행했습니다", message, warning=False)
        else:
            self.play("failed")
            self.notify("Claude를 실행하지 못했습니다", message, warning=True)

    def choose_claude_target(self) -> None:
        """Claude 실행 파일이나 바로가기를 사용자가 직접 지정."""
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Claude 실행 파일 또는 바로가기 선택",
            str(Path.home()),
            "실행 가능한 항목 (*.exe *.lnk *.bat *.cmd);;모든 파일 (*.*)",
        )
        if not path:
            return
        self.cfg[launcher.CONFIG_KEY] = {
            "kind": launcher.KIND_PATH,
            "value": path,
            "label": Path(path).stem,
        }
        save_config(self.cfg)
        self.notify("Claude 실행 대상을 지정했습니다", path, warning=False)

    def redetect_claude(self) -> None:
        target = launcher.resolve(self.cfg, force=True)
        save_config(self.cfg)
        if target:
            self.notify("Claude를 다시 찾았습니다", launcher.describe(target), warning=False)
        else:
            self.notify(
                "Claude를 찾지 못했습니다",
                "'Claude 실행 대상 지정...' 에서 직접 골라 주세요.",
                warning=True,
            )

    def notify(self, title: str, message: str, warning: bool) -> None:
        tray = getattr(self, "tray", None)
        if tray is not None and tray.isVisible():
            icon = (
                QSystemTrayIcon.MessageIcon.Warning
                if warning
                else QSystemTrayIcon.MessageIcon.Information
            )
            tray.showMessage(title, message, icon, 4000)
        elif warning:
            QMessageBox.warning(self, title, message)

    # --------------------------------------------------------------- 메뉴

    def _show_menu(self, pos: QPoint) -> None:
        # popup() + deleteLater 로 바꿔 봤다가 항목을 눌러도 triggered 가
        # 핸들러까지 오지 않아 되돌렸다. 메뉴가 숨겨질 때 액션이 먼저 지워진다.
        # 입력이 잠기는 문제는 설정 창을 비모달로 바꾸는 쪽에서 해결한다.
        self.build_menu().exec(self.mapToGlobal(pos))

    def build_menu(self) -> QMenu:
        menu = QMenu(self)
        header = menu.addAction(self.pack.display_name)
        header.setEnabled(False)
        menu.addSeparator()

        open_claude = menu.addAction("Claude 열기  (펫 더블클릭)")
        open_claude.triggered.connect(self.open_claude)

        claude_menu = menu.addMenu("Claude 실행 설정")
        current = self.cfg.get(launcher.CONFIG_KEY)
        info = claude_menu.addAction(f"현재 대상: {launcher.describe(current)}")
        info.setEnabled(False)
        claude_menu.addSeparator()
        claude_menu.addAction("자동으로 다시 찾기").triggered.connect(self.redetect_claude)
        claude_menu.addAction("실행 대상 직접 지정...").triggered.connect(self.choose_claude_target)
        claude_menu.addSeparator()
        watch = claude_menu.addAction("작업 중이면 노트북 자세로 앉기")
        watch.setCheckable(True)
        watch.setChecked(self.watcher.enabled)
        watch.toggled.connect(self.set_activity_watch)
        state = claude_menu.addAction(
            "지금 상태: " + ("작업 중" if self.watcher.active else "쉬는 중")
        )
        state.setEnabled(False)

        menu.addSeparator()

        actions = menu.addMenu("동작 시키기")
        for name in self.sprites.anims:
            act = actions.addAction(ANIMATION_LABELS.get(name, name))
            act.triggered.connect(lambda _=False, n=name: self.play(n))

        bubble = menu.addMenu("말풍선")
        use = bubble.addAction("말풍선 띄우기")
        use.setCheckable(True)
        use.setChecked(self.speech.enabled)
        use.toggled.connect(self.set_speech_enabled)
        bubble.addAction("대사 설정...").triggered.connect(self.open_speech_settings)
        bubble.addSeparator()
        for key, label, _ in speech.CATEGORIES:
            act = bubble.addAction(f"지금 말하기 — {label}")
            act.setEnabled(bool(self.speech.lines_for(key)))
            act.triggered.connect(lambda _=False, k=key: self.speech.say(k))

        if len(self.packs) > 1:
            pets = menu.addMenu("펫 바꾸기")
            pet_group = QActionGroup(pets)
            for pack in self.packs:
                act = pets.addAction(pack.display_name)
                act.setCheckable(True)
                act.setChecked(pack.pet_id == self.pack.pet_id)
                pet_group.addAction(act)
                act.triggered.connect(lambda _=False, p=pack: self.switch_pet(p))

        sizes = menu.addMenu("크기")
        size_group = QActionGroup(sizes)
        for label, value in (("아주 작게 30%", 0.3), ("작게 40%", 0.4),
                             ("보통 50%", 0.5), ("크게 70%", 0.7), ("아주 크게 100%", 1.0)):
            act = sizes.addAction(label)
            act.setCheckable(True)
            act.setChecked(abs(self.scale - value) < 1e-6)
            size_group.addAction(act)
            act.triggered.connect(lambda _=False, v=value: self.set_scale(v))

        menu.addSeparator()
        look = menu.addAction("마우스 따라 보기")
        look.setCheckable(True)
        look.setChecked(self.look_enabled)
        look.toggled.connect(self.set_look_enabled)

        top = menu.addAction("항상 위에 표시")
        top.setCheckable(True)
        top.setChecked(self.always_on_top)
        top.toggled.connect(self.set_always_on_top)

        auto = menu.addAction("윈도우 시작 시 자동 실행")
        auto.setCheckable(True)
        auto.setChecked(is_autostart_enabled())
        auto.toggled.connect(self.set_autostart)

        menu.addSeparator()
        quit_action = QAction("종료", menu)
        quit_action.triggered.connect(QApplication.quit)
        menu.addAction(quit_action)
        return menu

    # ------------------------------------------------------------- 설정

    def switch_pet(self, pack: petpack.PetPack) -> None:
        self.pack = pack
        self.sprites = SpriteSet(pack, self.scale)
        self.anim_name = "idle"
        self.frames, self.durations = self.sprites.anims["idle"]
        self.frame_idx = 0
        self.frame_elapsed = 0
        self._apply_sprites()
        self._start_behavior("waving", loops=1)
        self.cfg["pet_id"] = pack.pet_id
        save_config(self.cfg)

    def set_scale(self, value: float) -> None:
        self.scale = value
        self.sprites = SpriteSet(self.pack, value)
        self.frames, self.durations = self.sprites.anims[self.anim_name]
        self.frame_idx = min(self.frame_idx, len(self.frames) - 1)
        self._apply_sprites()
        self.cfg["scale"] = value
        save_config(self.cfg)

    def set_activity_watch(self, value: bool) -> None:
        self.watcher.enabled = value
        self.cfg["claude_activity"] = value
        save_config(self.cfg)

    def set_speech_enabled(self, value: bool) -> None:
        self.speech.set_enabled(value)
        speech.store_settings(self.cfg, self.speech.settings)
        save_config(self.cfg)

    def open_speech_settings(self) -> None:
        """대사 편집 창. 저장을 누른 경우에만 반영한다.

        exec() 로 띄우지 않는다. 모달 창은 그동안 펫 창을 통째로 잠그는데,
        그 잠금이 안 풀린 채 남으면 펫이 움직이기만 하고 클릭이 안 먹는다.
        편집 중에도 펫을 만질 수 있는 편이 맞기도 하다.
        """
        import speech_dialog

        if self._speech_dialog is not None:      # 이미 열려 있으면 그 창을 앞으로
            self._speech_dialog.raise_()
            self._speech_dialog.activateWindow()
            return

        # 펫 창은 포커스를 받지 않게 만들어져 있어서, 부모로 걸면 입력이 막힌다
        dialog = speech_dialog.SpeechSettingsDialog(self.speech.settings, self.speech.show_now)
        dialog.setWindowModality(Qt.WindowModality.NonModal)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self._speech_dialog = dialog

        def finished(result: int) -> None:
            self._speech_dialog = None
            if not result:
                self.speech.hide()   # 미리보기로 띄운 말풍선을 걷는다
                return
            self.speech.apply(dialog.result_settings())
            speech.store_settings(self.cfg, self.speech.settings)
            save_config(self.cfg)

        dialog.finished.connect(finished)
        dialog.show()
        dialog.raise_()
        QTimer.singleShot(0, dialog.activateWindow)

    def set_look_enabled(self, value: bool) -> None:
        self.look_enabled = value
        self.cfg["look_enabled"] = value
        save_config(self.cfg)

    def set_always_on_top(self, value: bool) -> None:
        self.always_on_top = value
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, value)
        self.show()
        self.cfg["always_on_top"] = value
        save_config(self.cfg)

    def set_autostart(self, value: bool) -> None:
        ok, message = set_autostart_enabled(value)
        if not ok:
            QMessageBox.warning(self, "자동 실행", message)


# --------------------------------------------------------------- 자동 실행


def _autostart_command() -> str:
    launcher = APP_DIR / "펫 실행.vbs"
    return f'wscript.exe "{launcher}"'


def is_autostart_enabled() -> bool:
    try:
        import winreg
    except ImportError:
        return False
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _ = winreg.QueryValueEx(key, RUN_VALUE)
            return value == _autostart_command()
    except (OSError, FileNotFoundError):
        return False


def set_autostart_enabled(enabled: bool) -> tuple[bool, str]:
    """HKCU\\...\\Run 에 시작 항목을 넣거나 뺀다. 관리자 권한은 필요 없다."""
    try:
        import winreg
    except ImportError:
        return False, "이 기능은 윈도우에서만 동작합니다."
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                winreg.SetValueEx(key, RUN_VALUE, 0, winreg.REG_SZ, _autostart_command())
            else:
                try:
                    winreg.DeleteValue(key, RUN_VALUE)
                except FileNotFoundError:
                    pass
        return True, ""
    except OSError as exc:
        return False, f"레지스트리를 수정하지 못했습니다: {exc}"


# ------------------------------------------------------------------- 실행


def build_tray(window: PetWindow) -> QSystemTrayIcon:
    icon_source = window.pack.animation("idle")[0][0]
    tray = QSystemTrayIcon(QIcon(pil_to_pixmap(icon_source, 64 / petpack.CELL_H)), window)
    window.tray = tray
    tray.setToolTip(f"{window.pack.display_name} — 더블클릭하면 Claude, 우클릭하면 메뉴")
    tray.setContextMenu(window.build_menu())
    # 메뉴 상태(체크 표시)가 항상 최신이도록 열릴 때마다 새로 만든다
    tray.activated.connect(
        lambda reason: tray.setContextMenu(window.build_menu())
        if reason == QSystemTrayIcon.ActivationReason.Context
        else None
    )
    tray.show()
    return tray


def main() -> int:
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    root = petpack.pets_root()
    candidates = petpack.discover_pets(root)
    if not candidates:
        QMessageBox.critical(
            None,
            "펫을 찾을 수 없습니다",
            f"펫 패키지가 없습니다.\n\n찾은 위치: {root}\n\n"
            "이 폴더 안에 <펫이름>/pet.json 과 스프라이트시트가 있어야 합니다.",
        )
        return 1

    packs: list[petpack.PetPack] = []
    problems: list[str] = []
    for path in candidates:
        try:
            packs.append(petpack.PetPack.load(path))
        except petpack.PetLoadError as exc:
            problems.append(str(exc))

    if not packs:
        QMessageBox.critical(None, "펫을 불러오지 못했습니다", "\n\n".join(problems))
        return 1

    cfg = load_config()
    if len(sys.argv) > 2 and sys.argv[1] == "--pet":
        cfg["pet_id"] = sys.argv[2]

    window = PetWindow(packs, cfg)
    window.show()
    window.watcher.start()
    tray = build_tray(window)

    if not cfg.get(launcher.CONFIG_KEY):
        # Claude 위치 탐색은 PowerShell 을 한 번 부르므로 UI 를 막지 않게 백그라운드로.
        # Qt 객체는 건드리지 않고 설정 딕셔너리만 채운다.
        def _prefetch() -> None:
            if launcher.resolve(cfg):
                save_config(cfg)

        threading.Thread(target=_prefetch, daemon=True).start()

    if problems:
        tray.showMessage("일부 펫을 건너뛰었습니다", "\n".join(problems),
                         QSystemTrayIcon.MessageIcon.Warning, 6000)

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
