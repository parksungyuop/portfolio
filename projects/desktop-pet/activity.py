"""Claude가 지금 일하고 있는지 감지한다.

Claude Code는 세션이 진행되는 동안 `~/.claude/projects/<프로젝트>/<세션>.jsonl` 에
주고받은 내용을 계속 덧붙인다. 그래서 그 파일들의 가장 최근 수정 시각이
방금 전이면 '작업 중'으로 본다. 별도 설정이나 훅 없이 바로 동작한다.

`CLAUDE_CONFIG_DIR` 환경변수를 쓰고 있으면 그 경로를 따른다.
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path

DEFAULT_WINDOW_SEC = 25.0    # 마지막 갱신 이후 이 시간까지는 작업 중으로 본다
DEFAULT_POLL_SEC = 2.0


def claude_home() -> Path:
    configured = os.environ.get("CLAUDE_CONFIG_DIR")
    return Path(configured) if configured else Path.home() / ".claude"


def newest_session_mtime(root: Path | None = None) -> float:
    """세션 기록 파일 중 가장 최근 수정 시각. 없으면 0."""
    root = (root or claude_home()) / "projects"
    newest = 0.0
    try:
        project_dirs = list(os.scandir(root))
    except OSError:
        return 0.0
    for project in project_dirs:
        if not project.is_dir():
            continue
        try:
            entries = os.scandir(project.path)
        except OSError:
            continue
        with entries:
            for entry in entries:
                if not entry.name.endswith(".jsonl"):
                    continue
                try:
                    mtime = entry.stat().st_mtime
                except OSError:
                    continue
                if mtime > newest:
                    newest = mtime
    return newest


class ClaudeActivityWatcher:
    """백그라운드 스레드로 폴링하고 `active` 플래그만 갱신한다.

    Qt 객체는 건드리지 않으므로 GUI 스레드와 충돌하지 않는다.
    """

    def __init__(
        self,
        window_sec: float = DEFAULT_WINDOW_SEC,
        poll_sec: float = DEFAULT_POLL_SEC,
    ):
        self.window_sec = window_sec
        self.poll_sec = poll_sec
        self.enabled = True
        self._active = False
        self._last_seen = 0.0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @property
    def active(self) -> bool:
        return self.enabled and self._active

    @property
    def last_seen(self) -> float:
        return self._last_seen

    def start(self) -> None:
        if self._thread is not None:
            return
        try:
            self.poll_once()      # 첫 폴링까지 기다리지 않고 바로 상태를 잡는다
        except OSError:
            pass
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def poll_once(self) -> bool:
        newest = newest_session_mtime()
        self._last_seen = newest
        # 파일 시각이 미래로 잡히는 경우(시계 오차)도 활동으로 친다
        self._active = newest > 0 and (time.time() - newest) < self.window_sec
        return self._active

    def _loop(self) -> None:
        while not self._stop.wait(self.poll_sec):
            if not self.enabled:
                self._active = False
                continue
            try:
                self.poll_once()
            except OSError:
                self._active = False
