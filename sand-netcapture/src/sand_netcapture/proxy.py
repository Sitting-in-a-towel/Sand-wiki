from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

_INTERNET_SETTINGS = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"


@dataclass(frozen=True)
class ProxyState:
    enabled: int   # 0 or 1
    server: str    # e.g. "127.0.0.1:8080" ("" when disabled)


def build_proxy_server(port: int) -> str:
    return f"127.0.0.1:{port}"


def apply_state(state: ProxyState, *, write: Callable[[ProxyState], None]) -> None:
    """Apply a ProxyState via the injected writer. Kept separate so it is testable
    without touching the real registry."""
    write(state)


# --- real Windows backend (not unit-tested; exercised in live runs) ---

def _read_registry_state() -> ProxyState:  # pragma: no cover
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _INTERNET_SETTINGS, 0, winreg.KEY_READ) as key:
        try:
            enabled = winreg.QueryValueEx(key, "ProxyEnable")[0]
        except FileNotFoundError:
            enabled = 0
        try:
            server = winreg.QueryValueEx(key, "ProxyServer")[0]
        except FileNotFoundError:
            server = ""
    return ProxyState(enabled=int(enabled), server=str(server))


def _write_registry_state(state: ProxyState) -> None:  # pragma: no cover
    import ctypes
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _INTERNET_SETTINGS, 0, winreg.KEY_WRITE) as key:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, state.enabled)
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, state.server)
    # Tell WinINet to reload settings (INTERNET_OPTION_SETTINGS_CHANGED=39, _REFRESH=37).
    internet_set_option = ctypes.windll.Wininet.InternetSetOptionW
    internet_set_option(0, 39, 0, 0)
    internet_set_option(0, 37, 0, 0)


def enable_capture_proxy(port: int) -> ProxyState:  # pragma: no cover
    """Turn the system proxy on, pointed at our port. Returns the PRIOR state for restore."""
    prior = _read_registry_state()
    apply_state(ProxyState(enabled=1, server=build_proxy_server(port)), write=_write_registry_state)
    return prior


def restore_system_proxy(prior: ProxyState) -> None:  # pragma: no cover
    apply_state(prior, write=_write_registry_state)
