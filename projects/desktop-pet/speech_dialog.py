"""대사 설정 창.

왼쪽에서 상황을 고르고 오른쪽에 한 줄에 하나씩 대사를 적는다.
저장을 누르면 `config.json` 에 그대로 들어가고 펫이 즉시 그 대사를 쓴다.
"""

from __future__ import annotations

from typing import Callable

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QDoubleSpinBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPlainTextEdit,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
)

import speech

HINT = "한 줄에 대사 하나씩 적으세요. 빈 줄은 무시됩니다."


class SpeechSettingsDialog(QDialog):
    def __init__(self, settings: dict, on_preview: Callable[[str], None], parent=None):
        super().__init__(parent)
        self.setWindowTitle("대사 설정")
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)
        self.resize(620, 460)

        self._on_preview = on_preview
        self._lines: dict[str, list[str]] = {
            key: list(settings["lines"].get(key, [])) for key in speech.CATEGORY_KEYS
        }
        self._current: str | None = None

        root = QVBoxLayout(self)

        self.enabled_box = QCheckBox("말풍선 사용")
        self.enabled_box.setChecked(bool(settings["enabled"]))
        root.addWidget(self.enabled_box)

        body = QHBoxLayout()
        root.addLayout(body, 1)

        self.category_list = QListWidget()
        self.category_list.setFixedWidth(150)
        for key, label, _ in speech.CATEGORIES:
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, key)
            self.category_list.addItem(item)
        body.addWidget(self.category_list)

        right = QVBoxLayout()
        body.addLayout(right, 1)

        self.description = QLabel()
        self.description.setWordWrap(True)
        right.addWidget(self.description)

        self.editor = QPlainTextEdit()
        self.editor.setPlaceholderText(HINT)
        right.addWidget(self.editor, 1)

        hint = QLabel(HINT)
        hint.setStyleSheet("color: gray;")
        right.addWidget(hint)

        form = QFormLayout()
        root.addLayout(form)

        self.duration = QDoubleSpinBox()
        self.duration.setRange(1.0, 30.0)
        self.duration.setSingleStep(0.5)
        self.duration.setSuffix(" 초")
        self.duration.setValue(float(settings["duration_sec"]))
        form.addRow("말풍선이 떠 있는 시간", self.duration)

        interval = QHBoxLayout()
        self.min_interval = QSpinBox()
        self.min_interval.setRange(3, 3600)
        self.min_interval.setSuffix(" 초")
        self.min_interval.setValue(int(settings["min_interval_sec"]))
        self.max_interval = QSpinBox()
        self.max_interval.setRange(3, 3600)
        self.max_interval.setSuffix(" 초")
        self.max_interval.setValue(int(settings["max_interval_sec"]))
        interval.addWidget(self.min_interval)
        interval.addWidget(QLabel("~"))
        interval.addWidget(self.max_interval)
        interval.addStretch(1)
        form.addRow("평소 대사가 나오는 간격", interval)

        self.font_size = QSpinBox()
        self.font_size.setRange(7, 24)
        self.font_size.setSuffix(" pt")
        self.font_size.setValue(int(settings["font_size"]))
        form.addRow("글자 크기", self.font_size)

        buttons = QHBoxLayout()
        root.addLayout(buttons)

        preview = QPushButton("미리보기")
        preview.setToolTip("커서가 놓인 줄을 지금 말풍선으로 띄워 봅니다")
        preview.clicked.connect(self._preview)
        buttons.addWidget(preview)

        restore = QPushButton("이 상황 기본값")
        restore.clicked.connect(self._restore_current)
        buttons.addWidget(restore)

        buttons.addStretch(1)

        box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel
        )
        box.button(QDialogButtonBox.StandardButton.Save).setText("저장")
        box.button(QDialogButtonBox.StandardButton.Cancel).setText("취소")
        box.accepted.connect(self._accept)
        box.rejected.connect(self.reject)
        buttons.addWidget(box)

        self.category_list.currentRowChanged.connect(self._switch_category)
        self.category_list.setCurrentRow(0)

    # ------------------------------------------------------------ 편집

    def _switch_category(self, row: int) -> None:
        self._flush()
        if row < 0:
            return
        key = self.category_list.item(row).data(Qt.ItemDataRole.UserRole)
        self._current = key
        _, label, description = next(c for c in speech.CATEGORIES if c[0] == key)
        self.description.setText(f"{label} — {description}")
        self.editor.setPlainText("\n".join(self._lines.get(key, [])))

    def _flush(self) -> None:
        """지금 편집 중인 내용을 작업본에 되돌려 담는다."""
        if self._current is None:
            return
        text = self.editor.toPlainText()
        self._lines[self._current] = [
            line.strip() for line in text.splitlines() if line.strip()
        ]

    def _restore_current(self) -> None:
        if self._current is None:
            return
        self.editor.setPlainText("\n".join(speech.DEFAULT_LINES.get(self._current, [])))

    def _preview(self) -> None:
        line = self.editor.textCursor().block().text().strip()
        if not line:
            line = next(
                (s.strip() for s in self.editor.toPlainText().splitlines() if s.strip()), ""
            )
        if line:
            self._on_preview(line)

    # ------------------------------------------------------------ 결과

    def _accept(self) -> None:
        self._flush()
        if self.max_interval.value() < self.min_interval.value():
            self.max_interval.setValue(self.min_interval.value())
        self.accept()

    def result_settings(self) -> dict:
        return speech.sanitize(
            {
                "enabled": self.enabled_box.isChecked(),
                "min_interval_sec": self.min_interval.value(),
                "max_interval_sec": self.max_interval.value(),
                "duration_sec": self.duration.value(),
                "font_size": self.font_size.value(),
                "lines": {key: list(value) for key, value in self._lines.items()},
            }
        )
