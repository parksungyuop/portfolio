"""Claude 데스크톱 앱 실행기.

펫을 더블클릭했을 때 Claude를 띄우기 위한 모듈. 실행 방법을 한 번 찾아내면
config.json 에 캐시해 두고, 다음부터는 곧바로 실행한다.

찾는 순서:
  1. config.json 에 저장된 값 (사용자가 직접 지정한 경우 포함)
  2. 시작 메뉴 앱 목록의 AppID  (Store/MSIX 앱은 이 방법이 유일하게 안정적)
  3. 시작 메뉴 바로가기(.lnk)
  4. claude:// 프로토콜 핸들러에 등록된 실행 파일
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

# config.json 키
CONFIG_KEY = "claude_launch"

# kind 값
KIND_APPID = "appid"   # shell:AppsFolder\<AppID> 로 실행 (Store/MSIX 앱)
KIND_PATH = "path"     # .exe / .lnk 를 직접 실행
KIND_URI = "uri"       # claude:// 같은 프로토콜


class LaunchError(RuntimeError):
    pass


def _run_powershell(script: str, timeout: float = 12.0) -> str:
    """콘솔 창 없이 PowerShell 한 줄을 돌리고 stdout 을 돌려준다."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return (result.stdout or "").strip()


def _from_start_apps() -> dict | None:
    """시작 메뉴 앱 목록에서 Claude 의 AppID 를 찾는다.

    AppID 는 앱을 업데이트해도 바뀌지 않으므로 버전이 박힌 설치 경로보다 안전하다.
    """
    script = (
        "$a = Get-StartApps | Where-Object { $_.Name -eq 'Claude' };"
        "if (-not $a) { $a = Get-StartApps | Where-Object { $_.Name -like '*Claude*' } };"
        "if ($a) { @($a)[0].AppID }"
    )
    app_id = _run_powershell(script).splitlines()
    app_id = app_id[0].strip() if app_id else ""
    if not app_id:
        return None
    return {"kind": KIND_APPID, "value": app_id, "label": "시작 메뉴 앱 (Claude)"}


def _from_start_menu_shortcut() -> dict | None:
    roots = [
        Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
        Path(os.environ.get("ProgramData", "")) / "Microsoft/Windows/Start Menu/Programs",
    ]
    for root in roots:
        if not root.is_dir():
            continue
        for link in sorted(root.rglob("*.lnk")):
            if "claude" in link.stem.lower():
                return {"kind": KIND_PATH, "value": str(link), "label": link.stem}
    return None


def _from_protocol_handler() -> dict | None:
    """HKCU\\Software\\Classes\\claude\\shell\\open\\command 에 등록된 실행 파일."""
    try:
        import winreg
    except ImportError:
        return None
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(hive, r"Software\Classes\claude\shell\open\command") as key:
                command, _ = winreg.QueryValueEx(key, "")
        except OSError:
            continue
        if not command:
            continue
        # '"C:\...\Claude.exe" "%1"' 형태에서 실행 파일만 떼어낸다
        exe = command.split('"')[1] if command.startswith('"') else command.split(" ")[0]
        if exe and Path(exe).is_file():
            # WindowsApps 아래 실행 파일은 직접 실행이 막혀 있어 프로토콜로 띄운다
            if "WindowsApps" in exe:
                return {"kind": KIND_URI, "value": "claude://", "label": "claude:// 프로토콜"}
            return {"kind": KIND_PATH, "value": exe, "label": Path(exe).stem}
    return None


def resolve(cfg: dict, force: bool = False) -> dict | None:
    """실행 방법을 찾아 cfg 에 캐시하고 돌려준다. 못 찾으면 None."""
    cached = cfg.get(CONFIG_KEY)
    if cached and not force and isinstance(cached, dict) and cached.get("value"):
        return cached

    for finder in (_from_start_apps, _from_start_menu_shortcut, _from_protocol_handler):
        found = finder()
        if found:
            cfg[CONFIG_KEY] = found
            return found
    return None


def describe(target: dict | None) -> str:
    if not target:
        return "찾지 못함"
    return f"{target.get('label') or target['kind']} — {target['value']}"


def launch(target: dict) -> None:
    """찾아둔 방법으로 Claude 를 띄운다. 이미 켜져 있으면 그 창이 앞으로 나온다."""
    kind = target.get("kind")
    value = target.get("value") or ""

    if kind == KIND_APPID:
        # explorer 를 통해 shell:AppsFolder 를 열면 Store/MSIX 앱도 정상 활성화된다
        subprocess.Popen(
            ["explorer.exe", f"shell:AppsFolder\\{value}"],
            creationflags=CREATE_NO_WINDOW,
        )
        return

    if kind == KIND_PATH:
        path = Path(value)
        if not path.exists():
            raise LaunchError(f"실행 파일을 찾을 수 없습니다: {value}")
        os.startfile(str(path))  # noqa: S606 (윈도우 전용, 사용자가 지정한 경로)
        return

    if kind == KIND_URI:
        os.startfile(value)  # noqa: S606
        return

    raise LaunchError(f"알 수 없는 실행 방식입니다: {kind!r}")


def launch_claude(cfg: dict) -> tuple[bool, str]:
    """(성공 여부, 메시지). 실패해도 예외를 던지지 않는다."""
    target = resolve(cfg)
    if not target:
        return False, (
            "Claude 앱을 찾지 못했습니다.\n"
            "우클릭 메뉴 → 'Claude 실행 대상 지정...' 에서 "
            "Claude 실행 파일이나 바로가기를 직접 골라 주세요."
        )
    try:
        launch(target)
    except (LaunchError, OSError) as exc:
        return False, f"Claude 실행에 실패했습니다.\n{describe(target)}\n\n{exc}"
    return True, describe(target)
