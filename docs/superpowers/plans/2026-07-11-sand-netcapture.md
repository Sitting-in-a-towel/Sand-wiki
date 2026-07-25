# SAND Net-Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sand-netcapture`, a guided per-patch tool that passively (observe-only) captures the game client's own PlayFab/master-server HTTPS responses to disk and transforms `GetResearchTree` into structured JSON for the wiki.

**Architecture:** A Python mitmproxy addon records allowlisted responses byte-for-byte to `out/captures/`, a CLI drives a guided session with a live coverage checklist and safely sets/restores the Windows system proxy, and pure transform functions map captured JSON to wiki-shaped output. Mirrors the existing `sand-scraper` tool's `config → capture → transform → emit` shape and its pure-unit-test style.

**Tech Stack:** Python 3.12, mitmproxy (addon + `mitmdump`), `winreg`/`ctypes` (Windows system-proxy toggle), `tomllib`, pytest.

**Spec:** `docs/superpowers/specs/2026-07-11-sand-netcapture-design.md`

**Hard constraint (anti-ban):** The proxy is strictly observe-only. It NEVER modifies a request or response, replays, or issues extra requests. No task in this plan may add flow-mutating code.

---

## File Structure

```
sand-netcapture/
  pyproject.toml                       # package metadata + deps (mitmproxy, pytest)
  config.toml                          # proxy port, host allowlist, expected endpoints, faction/tier mapping
  .gitignore                           # ignore out/ and .venv/
  README.md                            # Phase-0 probe steps, run instructions, safety, Frida fallback
  src/sand_netcapture/
    __init__.py
    config.py                          # load/validate config.toml -> Config dataclass
    capture_core.py                    # PURE: endpoint-key derivation + record building (no mitmproxy import)
    capture.py                         # mitmproxy addon: response() -> filter host, write file, tick coverage
    coverage.py                        # PURE: format the seen-vs-expected checklist
    proxy.py                           # Windows system-proxy set/restore (winreg + WinINet refresh)
    emit.py                            # stable-sorted JSON writer (copied from sand-scraper)
    transform_research_tree.py         # PURE: GetResearchTree JSON -> structured node list
    __main__.py                        # CLI: launch mitmdump w/ addon, guided checklist, proxy set/restore
  tests/
    fixtures/
      master_GetResearchTree.min.json  # hand-redacted 2-node sample (real server shape)
    test_config.py
    test_capture_core.py
    test_capture.py
    test_coverage.py
    test_proxy.py
    test_emit.py
    test_transform_research_tree.py
  out/                                 # gitignored: captures/, transformed outputs
```

**Working directory for all commands:** `sand-netcapture/` (create it in Task 1). All `pytest` runs assume you are inside `sand-netcapture/` with the dev extras installed (Task 1).

---

## Task 1: Scaffold the package

**Files:**
- Create: `sand-netcapture/pyproject.toml`
- Create: `sand-netcapture/.gitignore`
- Create: `sand-netcapture/src/sand_netcapture/__init__.py` (empty)
- Create: `sand-netcapture/config.toml`

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[project]
name = "sand-netcapture"
version = "0.1.0"
description = "Passively captures the SAND game client's PlayFab/master-server responses and transforms them for the wiki."
requires-python = ">=3.12"
dependencies = [
    "mitmproxy==11.0.2",
]

[project.optional-dependencies]
dev = ["pytest==8.3.4"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
.venv/
out/
__pycache__/
*.pyc
```

- [ ] **Step 3: Create empty `src/sand_netcapture/__init__.py`**

Create the file with no content.

- [ ] **Step 4: Create `config.toml`**

```toml
# Local proxy port that mitmdump listens on and the system proxy points at.
proxy_port = 8080

# Only responses whose host contains one of these substrings are recorded.
# Fill these in from the Phase-0 probe (README). Examples are placeholders to be
# confirmed against a real session.
host_allowlist = [
    "playfabapi.com",
    "playfab.com",
]

# Endpoint keys we expect to see in a complete session, used for the coverage checklist.
# Derived from the request URL / PlayFab function name (see capture_core.derive_endpoint_key).
expected_endpoints = [
    "Login",
    "GetCharacters",
    "GetResearchTree",
    "GetCompartmentDefinitions",
    "GetStorage",
    "GetExpedition",
    "GetShopItems",
]

# Where raw captures and the capture index are written.
captures_dir = "out/captures"

# --- research-tree transform ---
# Maps the server's integer Fraction (0/1/2) to the wiki faction slug, by index.
# VERIFY against a real capture before trusting: order is an assumption.
fraction_factions = ["godlewski", "kaiser", "landwehr"]
# The server Tier is 0-based; the wiki uses 1-based tiers.
tier_offset = 1
```

- [ ] **Step 5: Create the venv and install (Windows PowerShell)**

Run (from `sand-netcapture/`):
```
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
```
Expected: installs mitmproxy + pytest without error.

- [ ] **Step 6: Commit**

```bash
git add sand-netcapture/pyproject.toml sand-netcapture/.gitignore sand-netcapture/src/sand_netcapture/__init__.py sand-netcapture/config.toml
git commit -m "chore(netcapture): scaffold sand-netcapture package"
```

---

## Task 2: Config loader

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/config.py`
- Test: `sand-netcapture/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_config.py
from pathlib import Path
from sand_netcapture.config import load_config


def test_load_config_parses_all_fields(tmp_path: Path):
    cfg_file = tmp_path / "config.toml"
    cfg_file.write_text(
        'proxy_port = 9090\n'
        'host_allowlist = ["playfabapi.com"]\n'
        'expected_endpoints = ["Login", "GetResearchTree"]\n'
        'captures_dir = "out/captures"\n'
        'fraction_factions = ["godlewski", "kaiser", "landwehr"]\n'
        'tier_offset = 1\n',
        encoding="utf-8",
    )
    cfg = load_config(cfg_file)
    assert cfg.proxy_port == 9090
    assert cfg.host_allowlist == ["playfabapi.com"]
    assert cfg.expected_endpoints == ["Login", "GetResearchTree"]
    assert cfg.captures_dir == tmp_path / "out" / "captures"
    assert cfg.fraction_factions == ["godlewski", "kaiser", "landwehr"]
    assert cfg.tier_offset == 1


def test_load_config_missing_file_raises(tmp_path: Path):
    import pytest
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "nope.toml")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.config'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/config.py
from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    proxy_port: int
    host_allowlist: list[str]
    expected_endpoints: list[str]
    captures_dir: Path
    fraction_factions: list[str]
    tier_offset: int


def load_config(path: Path) -> Config:
    """Load and validate config.toml. Paths are resolved relative to the config file."""
    if not path.is_file():
        raise FileNotFoundError(f"Config not found: {path}")
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    base = path.parent
    return Config(
        proxy_port=int(raw["proxy_port"]),
        host_allowlist=list(raw["host_allowlist"]),
        expected_endpoints=list(raw["expected_endpoints"]),
        captures_dir=(base / raw.get("captures_dir", "out/captures")),
        fraction_factions=list(raw.get("fraction_factions", ["godlewski", "kaiser", "landwehr"])),
        tier_offset=int(raw.get("tier_offset", 1)),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_config.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/config.py sand-netcapture/tests/test_config.py
git commit -m "feat(netcapture): config loader"
```

---

## Task 3: Capture core (pure endpoint-key + record building)

This is the pure heart of the addon — no mitmproxy import, so it is trivially testable. Given a request URL, response status, and body bytes, it produces the endpoint key and the index record.

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/capture_core.py`
- Test: `sand-netcapture/tests/test_capture_core.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_capture_core.py
from sand_netcapture.capture_core import derive_endpoint_key, host_allowed, build_record


def test_derive_endpoint_key_from_playfab_path():
    # PlayFab function calls end in /Client/GetResearchTree etc.
    assert derive_endpoint_key("https://abc.playfabapi.com/Client/GetResearchTree") == "GetResearchTree"
    assert derive_endpoint_key("https://abc.playfabapi.com/Client/Login?sdk=1") == "Login"


def test_derive_endpoint_key_strips_trailing_slash():
    assert derive_endpoint_key("https://master.example.com/GetShopItems/") == "GetShopItems"


def test_host_allowed_substring_match():
    allow = ["playfabapi.com", "master.example.com"]
    assert host_allowed("abc.playfabapi.com", allow) is True
    assert host_allowed("evil.com", allow) is False


def test_build_record_captures_metadata():
    rec = build_record(
        key="GetResearchTree",
        url="https://abc.playfabapi.com/Client/GetResearchTree",
        status=200,
        body=b'{"ok":true}',
        timestamp="2026-07-11T12:00:00Z",
    )
    assert rec == {
        "key": "GetResearchTree",
        "url": "https://abc.playfabapi.com/Client/GetResearchTree",
        "status": 200,
        "size": 11,
        "timestamp": "2026-07-11T12:00:00Z",
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_capture_core.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.capture_core'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/capture_core.py
from __future__ import annotations

from urllib.parse import urlparse


def host_allowed(host: str, allowlist: list[str]) -> bool:
    """True if host contains any allowlisted substring."""
    return any(fragment in host for fragment in allowlist)


def derive_endpoint_key(url: str) -> str:
    """Stable endpoint key = the last non-empty path segment (no query).

    PlayFab client calls look like `/Client/GetResearchTree`; a custom master server
    may use `/GetShopItems`. Both reduce to the final path segment.
    """
    path = urlparse(url).path.rstrip("/")
    segment = path.rsplit("/", 1)[-1]
    return segment or "unknown"


def build_record(*, key: str, url: str, status: int, body: bytes, timestamp: str) -> dict:
    """Metadata row for the capture index. Never stores the body itself."""
    return {
        "key": key,
        "url": url,
        "status": status,
        "size": len(body),
        "timestamp": timestamp,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_capture_core.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/capture_core.py sand-netcapture/tests/test_capture_core.py
git commit -m "feat(netcapture): pure capture-core (endpoint key, host filter, record)"
```

---

## Task 4: Capture addon (writes files, tracks coverage)

The mitmproxy addon. It uses `capture_core` and a small filesystem writer. To keep it testable without a live proxy, the addon accepts a `writer` object and exposes a plain `handle_response(host, url, status, body, timestamp)` method that `response(flow)` delegates to. `response(flow)` only unpacks the mitmproxy flow — it does NOT mutate it.

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/capture.py`
- Test: `sand-netcapture/tests/test_capture.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_capture.py
import json
from pathlib import Path
from sand_netcapture.capture import CaptureAddon


def make_addon(tmp_path: Path) -> CaptureAddon:
    return CaptureAddon(
        captures_dir=tmp_path / "captures",
        host_allowlist=["playfabapi.com"],
        expected_endpoints=["GetResearchTree", "Login"],
    )


def test_allowed_response_writes_body_and_index(tmp_path: Path):
    addon = make_addon(tmp_path)
    addon.handle_response(
        host="abc.playfabapi.com",
        url="https://abc.playfabapi.com/Client/GetResearchTree",
        status=200,
        body=b'{"Result":{"Nodes":[]}}',
        timestamp="2026-07-11T12:00:00Z",
    )
    body_file = tmp_path / "captures" / "GetResearchTree.json"
    index_file = tmp_path / "captures" / "_index.json"
    assert body_file.read_bytes() == b'{"Result":{"Nodes":[]}}'
    index = json.loads(index_file.read_text(encoding="utf-8"))
    assert index[0]["key"] == "GetResearchTree"
    assert "GetResearchTree" in addon.seen


def test_disallowed_host_is_ignored(tmp_path: Path):
    addon = make_addon(tmp_path)
    addon.handle_response(
        host="tracker.evil.com",
        url="https://tracker.evil.com/collect",
        status=200,
        body=b"nope",
        timestamp="2026-07-11T12:00:00Z",
    )
    assert not (tmp_path / "captures").exists() or not any((tmp_path / "captures").iterdir())
    assert addon.seen == set()


def test_non_200_recorded_but_not_counted_as_seen(tmp_path: Path):
    addon = make_addon(tmp_path)
    addon.handle_response(
        host="abc.playfabapi.com",
        url="https://abc.playfabapi.com/Client/Login",
        status=500,
        body=b"err",
        timestamp="2026-07-11T12:00:00Z",
    )
    index = json.loads((tmp_path / "captures" / "_index.json").read_text(encoding="utf-8"))
    assert index[0]["status"] == 500
    assert addon.seen == set()  # failures do not count toward coverage
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_capture.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.capture'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/capture.py
from __future__ import annotations

import json
from pathlib import Path

from .capture_core import build_record, derive_endpoint_key, host_allowed


class CaptureAddon:
    """mitmproxy addon: observe-only recorder of allowlisted responses.

    NEVER mutates the flow. `response(flow)` unpacks the flow and delegates to
    `handle_response`, which does all the (testable) work.
    """

    def __init__(self, *, captures_dir: Path, host_allowlist: list[str], expected_endpoints: list[str]):
        self.captures_dir = Path(captures_dir)
        self.host_allowlist = list(host_allowlist)
        self.expected_endpoints = list(expected_endpoints)
        self.seen: set[str] = set()
        self._index: list[dict] = []

    def handle_response(self, *, host: str, url: str, status: int, body: bytes, timestamp: str) -> None:
        if not host_allowed(host, self.host_allowlist):
            return
        key = derive_endpoint_key(url)
        self.captures_dir.mkdir(parents=True, exist_ok=True)
        (self.captures_dir / f"{key}.json").write_bytes(body)
        self._index.append(build_record(key=key, url=url, status=status, body=body, timestamp=timestamp))
        (self.captures_dir / "_index.json").write_text(
            json.dumps(self._index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        if status == 200:
            self.seen.add(key)

    # mitmproxy entry point. Import guarded so unit tests need no mitmproxy flow objects.
    def response(self, flow) -> None:  # pragma: no cover - exercised in live runs
        from datetime import datetime, timezone

        self.handle_response(
            host=flow.request.host,
            url=flow.request.pretty_url,
            status=flow.response.status_code,
            body=flow.response.raw_content or b"",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_capture.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/capture.py sand-netcapture/tests/test_capture.py
git commit -m "feat(netcapture): capture addon writes bodies + index, tracks coverage"
```

---

## Task 5: Coverage checklist formatting

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/coverage.py`
- Test: `sand-netcapture/tests/test_coverage.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_coverage.py
from sand_netcapture.coverage import format_checklist, all_captured


def test_format_checklist_marks_seen_and_missing():
    text = format_checklist(expected=["Login", "GetResearchTree"], seen={"Login"})
    assert "[x] Login" in text
    assert "[ ] GetResearchTree" in text


def test_all_captured_true_only_when_every_expected_seen():
    assert all_captured(expected=["Login", "GetResearchTree"], seen={"Login"}) is False
    assert all_captured(expected=["Login", "GetResearchTree"], seen={"Login", "GetResearchTree"}) is True
    assert all_captured(expected=["Login"], seen={"Login", "Extra"}) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_coverage.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.coverage'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/coverage.py
from __future__ import annotations


def format_checklist(*, expected: list[str], seen: set[str]) -> str:
    """One line per expected endpoint: [x] if captured, [ ] if not."""
    lines = [f"[{'x' if e in seen else ' '}] {e}" for e in expected]
    return "\n".join(lines)


def all_captured(*, expected: list[str], seen: set[str]) -> bool:
    """True once every expected endpoint has been seen."""
    return all(e in seen for e in expected)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_coverage.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/coverage.py sand-netcapture/tests/test_coverage.py
git commit -m "feat(netcapture): coverage checklist formatting"
```

---

## Task 6: Stable JSON emitter

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/emit.py`
- Test: `sand-netcapture/tests/test_emit.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_emit.py
import json
from pathlib import Path
from sand_netcapture.emit import write_json


def test_write_json_pretty_utf8_trailing_newline(tmp_path: Path):
    out = tmp_path / "sub" / "data.json"
    write_json({"b": 1, "a": 2}, out)
    text = out.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert json.loads(text) == {"b": 1, "a": 2}
    assert '  "b": 1' in text  # 2-space indent
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_emit.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.emit'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/emit.py
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_json(data: Any, path: Path) -> None:
    """Write pretty JSON (UTF-8, 2-space indent, trailing newline), creating parents."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_emit.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/emit.py sand-netcapture/tests/test_emit.py
git commit -m "feat(netcapture): stable JSON emitter"
```

---

## Task 7: Windows system-proxy set/restore

Two responsibilities, split for testability:
- `build_proxy_server(port)` — pure helper returning the `127.0.0.1:PORT` string (unit-tested).
- `set_system_proxy` / `restore_system_proxy` — actual `winreg` writes + WinINet refresh. These touch the real registry, so they are **not** unit-tested; instead we test that `set_system_proxy` returns a restore-token capturing the prior state, using a monkeypatched fake registry backend.

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/proxy.py`
- Test: `sand-netcapture/tests/test_proxy.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_proxy.py
from sand_netcapture.proxy import build_proxy_server, ProxyState, apply_state


def test_build_proxy_server_format():
    assert build_proxy_server(8080) == "127.0.0.1:8080"


def test_apply_state_round_trips_through_a_fake_backend():
    # Fake registry backend: a dict of {name: (value, kind)}.
    store = {"ProxyEnable": (0, "dword"), "ProxyServer": ("", "sz")}

    def fake_read():
        return ProxyState(enabled=store["ProxyEnable"][0], server=store["ProxyServer"][0])

    def fake_write(state: ProxyState):
        store["ProxyEnable"] = (state.enabled, "dword")
        store["ProxyServer"] = (state.server, "sz")

    prior = fake_read()
    apply_state(ProxyState(enabled=1, server="127.0.0.1:8080"), write=fake_write)
    assert store["ProxyEnable"] == (1, "dword")
    assert store["ProxyServer"] == ("127.0.0.1:8080", "sz")

    apply_state(prior, write=fake_write)  # restore
    assert store["ProxyEnable"] == (0, "dword")
    assert store["ProxyServer"] == ("", "sz")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_proxy.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.proxy'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/proxy.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_proxy.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/proxy.py sand-netcapture/tests/test_proxy.py
git commit -m "feat(netcapture): windows system-proxy set/restore"
```

---

## Task 8: Research-tree transform

Maps the real `GetResearchTree` server response (`Result.Nodes[]`) to a structured, ID-based node list, stable-sorted by `id`. Uses the fixture captured from SandTools' real response.

**Honest scope note (do not silently "fix"):** the server response has NO node display names and NO a/b/c letters — those in the legacy `tech-tree-extracted.json` are wiki-presentation added by hand. This transform therefore emits an **authoritative ID-based tree** (comp-ids + node-id prereqs), NOT a byte-identical replacement for the legacy file. Display-name resolution (join with `GetCompartmentDefinitions` + localization) and letter derivation are explicit follow-ups in the design's "future work", not this task.

**Files:**
- Create: `sand-netcapture/tests/fixtures/master_GetResearchTree.min.json`
- Create: `sand-netcapture/src/sand_netcapture/transform_research_tree.py`
- Test: `sand-netcapture/tests/test_transform_research_tree.py`

- [ ] **Step 1: Create the redacted fixture**

```json
{
  "_op": "GetResearchTree",
  "Result": {
    "Nodes": [
      {
        "Id": "f67098d9-f21c-4cb2-a43c-1319e74b844b",
        "IsUnlocked": true,
        "IsAvailable": false,
        "Fraction": 0,
        "Tier": 0,
        "CompartmentDefinitionIds": ["walker_compCrew_Large_Wood_2x2_epb"],
        "ShopItems": [],
        "ResearchPrice": [
          { "ItemDefinition": "item_coinCrown", "_name": "Crowns", "Amount": 700 }
        ],
        "RequiredNodesIds": ["76abc596-d1b3-4661-8950-ae66a3964fb2"],
        "DependentNodesIds": ["87a93b7c-11af-43ab-94a2-22c284b86315"]
      },
      {
        "Id": "76abc596-d1b3-4661-8950-ae66a3964fb2",
        "IsUnlocked": true,
        "IsAvailable": true,
        "Fraction": 1,
        "Tier": 1,
        "CompartmentDefinitionIds": ["walker_compEngine_Small_Steel_1x1_aaa"],
        "ShopItems": [],
        "ResearchPrice": [
          { "ItemDefinition": "item_coinCrown", "_name": "Crowns", "Amount": 1500 },
          { "ItemDefinition": "item_weirdCoral", "_name": "Weird Coral", "Amount": 15 }
        ],
        "RequiredNodesIds": [],
        "DependentNodesIds": ["f67098d9-f21c-4cb2-a43c-1319e74b844b"]
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing test**

```python
# tests/test_transform_research_tree.py
import json
from pathlib import Path
from sand_netcapture.transform_research_tree import transform_research_tree

FIXTURE = Path(__file__).parent / "fixtures" / "master_GetResearchTree.min.json"
FACTIONS = ["godlewski", "kaiser", "landwehr"]


def test_transform_maps_fields_and_sorts_by_id():
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = transform_research_tree(raw, fraction_factions=FACTIONS, tier_offset=1)
    nodes = result["nodes"]
    # stable-sorted by id -> "76abc..." comes before "f67098..."
    assert [n["id"] for n in nodes] == [
        "76abc596-d1b3-4661-8950-ae66a3964fb2",
        "f67098d9-f21c-4cb2-a43c-1319e74b844b",
    ]
    first = nodes[0]
    assert first["faction"] == "kaiser"          # Fraction 1 -> index 1
    assert first["tier"] == 2                      # Tier 1 + offset 1
    assert first["unlockCompartmentIds"] == ["walker_compEngine_Small_Steel_1x1_aaa"]
    assert first["unlockCost"] == [
        {"name": "Crowns", "itemId": "item_coinCrown", "amount": 1500},
        {"name": "Weird Coral", "itemId": "item_weirdCoral", "amount": 15},
    ]
    assert first["prereqIds"] == []
    # second node references the first as a prereq
    assert nodes[1]["prereqIds"] == ["76abc596-d1b3-4661-8950-ae66a3964fb2"]


def test_unknown_fraction_index_falls_back_to_string():
    raw = {"Result": {"Nodes": [{
        "Id": "x", "Fraction": 9, "Tier": 0,
        "CompartmentDefinitionIds": [], "ResearchPrice": [], "RequiredNodesIds": [],
    }]}}
    result = transform_research_tree(raw, fraction_factions=FACTIONS, tier_offset=1)
    assert result["nodes"][0]["faction"] == "fraction-9"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_transform_research_tree.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.transform_research_tree'`

- [ ] **Step 4: Write minimal implementation**

```python
# src/sand_netcapture/transform_research_tree.py
from __future__ import annotations

from typing import Any


def _faction_slug(fraction: int, fraction_factions: list[str]) -> str:
    if 0 <= fraction < len(fraction_factions):
        return fraction_factions[fraction]
    return f"fraction-{fraction}"


def _cost(price: list[dict]) -> list[dict]:
    return [
        {"name": p.get("_name"), "itemId": p.get("ItemDefinition"), "amount": p.get("Amount")}
        for p in price
    ]


def transform_research_tree(raw: dict[str, Any], *, fraction_factions: list[str], tier_offset: int) -> dict:
    """GetResearchTree server response -> authoritative ID-based node list.

    Emits comp-ids and node-id prereqs verbatim; display-name/letter resolution is a
    separate follow-up (see design 'future work'). Stable-sorted by id for clean diffs.
    """
    nodes = []
    for n in raw.get("Result", {}).get("Nodes", []):
        nodes.append({
            "id": n["Id"],
            "faction": _faction_slug(int(n.get("Fraction", -1)), fraction_factions),
            "tier": int(n.get("Tier", 0)) + tier_offset,
            "unlockCompartmentIds": list(n.get("CompartmentDefinitionIds", [])),
            "unlockCost": _cost(n.get("ResearchPrice", [])),
            "prereqIds": list(n.get("RequiredNodesIds", [])),
        })
    nodes.sort(key=lambda x: x["id"])
    return {
        "_meta": {"source": "master_GetResearchTree", "note": "authoritative ID-based tree; display names/letters resolved separately"},
        "nodes": nodes,
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_transform_research_tree.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/transform_research_tree.py sand-netcapture/tests/test_transform_research_tree.py sand-netcapture/tests/fixtures/master_GetResearchTree.min.json
git commit -m "feat(netcapture): research-tree transform (authoritative ID-based)"
```

---

## Task 9: CLI runner (guided session)

Wires everything together. Two subcommands via `argparse`:
- `capture` — enable the system proxy, launch `mitmdump` with the addon as a subprocess, poll `_index.json` to refresh the coverage checklist, and ALWAYS restore the proxy in a `finally` block.
- `transform` — read `out/captures/GetResearchTree.json`, run the transform, emit `out/tech-tree.json`.

Because the `capture` path spawns a real subprocess and touches the registry, unit tests cover only the argument dispatch and the transform path; the live capture path is guarded and documented for manual runs.

**Files:**
- Create: `sand-netcapture/src/sand_netcapture/__main__.py`
- Test: `sand-netcapture/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_cli.py
import json
from pathlib import Path
from sand_netcapture.__main__ import run_transform


def test_run_transform_reads_capture_and_writes_output(tmp_path: Path):
    captures = tmp_path / "captures"
    captures.mkdir()
    (captures / "GetResearchTree.json").write_text(json.dumps({
        "Result": {"Nodes": [{
            "Id": "abc", "Fraction": 0, "Tier": 0,
            "CompartmentDefinitionIds": ["c1"], "ResearchPrice": [], "RequiredNodesIds": [],
        }]}
    }), encoding="utf-8")
    out = tmp_path / "tech-tree.json"
    run_transform(
        captures_dir=captures,
        out_path=out,
        fraction_factions=["godlewski", "kaiser", "landwehr"],
        tier_offset=1,
    )
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["nodes"][0]["id"] == "abc"
    assert data["nodes"][0]["faction"] == "godlewski"
    assert data["nodes"][0]["tier"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sand_netcapture.__main__'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/sand_netcapture/__main__.py
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .config import load_config
from .coverage import all_captured, format_checklist
from .emit import write_json
from .transform_research_tree import transform_research_tree


def run_transform(*, captures_dir: Path, out_path: Path, fraction_factions: list[str], tier_offset: int) -> None:
    raw = json.loads((captures_dir / "GetResearchTree.json").read_text(encoding="utf-8"))
    result = transform_research_tree(raw, fraction_factions=fraction_factions, tier_offset=tier_offset)
    write_json(result, out_path)
    print(f"Wrote {out_path} ({len(result['nodes'])} nodes)")


def _seen_from_index(captures_dir: Path) -> set[str]:
    index_file = captures_dir / "_index.json"
    if not index_file.is_file():
        return set()
    rows = json.loads(index_file.read_text(encoding="utf-8"))
    return {r["key"] for r in rows if r.get("status") == 200}


def run_capture(*, config_path: Path) -> None:  # pragma: no cover - live session
    import subprocess

    from .proxy import enable_capture_proxy, restore_system_proxy

    cfg = load_config(config_path)
    addon_path = Path(__file__).with_name("capture.py")
    prior = enable_capture_proxy(cfg.proxy_port)
    proc = None
    try:
        proc = subprocess.Popen([
            sys.executable, "-m", "mitmproxy.tools.main", "mitmdump",
            "-p", str(cfg.proxy_port), "-s", str(addon_path),
            "--set", f"captures_dir={cfg.captures_dir}",
            "--set", f"host_allowlist={','.join(cfg.host_allowlist)}",
            "--set", f"expected_endpoints={','.join(cfg.expected_endpoints)}",
        ])
        print("Proxy up. Launch the game, log in, and click through the menus.")
        print("Press Ctrl+C when the checklist below is complete.\n")
        while True:
            seen = _seen_from_index(cfg.captures_dir)
            print("\033[2J\033[H" + format_checklist(expected=cfg.expected_endpoints, seen=seen))
            if all_captured(expected=cfg.expected_endpoints, seen=seen):
                print("\nAll expected endpoints captured — safe to quit (Ctrl+C).")
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    finally:
        if proc is not None:
            proc.terminate()
        restore_system_proxy(prior)
        print("\nSystem proxy restored.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="sand-netcapture")
    parser.add_argument("--config", type=Path, default=Path("config.toml"))
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("capture", help="guided proxy capture session")
    sub.add_parser("transform", help="transform captured GetResearchTree to wiki JSON")
    args = parser.parse_args(argv)

    if args.cmd == "capture":
        run_capture(config_path=args.config)
    elif args.cmd == "transform":
        cfg = load_config(args.config)
        run_transform(
            captures_dir=cfg.captures_dir,
            out_path=cfg.captures_dir.parent / "tech-tree.json",
            fraction_factions=cfg.fraction_factions,
            tier_offset=cfg.tier_offset,
        )


if __name__ == "__main__":
    main()
```

Note: the addon needs to read the mitmproxy `--set` options passed by the CLI. Append this
single block to the **bottom** of `capture.py` (it adds module-level mitmproxy hooks; it does
not change the existing `CaptureAddon` class). mitmproxy discovers `load`/`running`/`response`
as module-level hooks — no `addons` list is needed.

```python
# --- mitmproxy module-level entry points (live session only) ---
_ADDON: CaptureAddon | None = None


def load(loader):  # pragma: no cover - live session
    loader.add_option("captures_dir", str, "out/captures", "capture output dir")
    loader.add_option("host_allowlist", str, "", "comma-separated host substrings")
    loader.add_option("expected_endpoints", str, "", "comma-separated expected keys")


def running():  # pragma: no cover - live session
    from mitmproxy import ctx

    global _ADDON
    _ADDON = CaptureAddon(
        captures_dir=Path(ctx.options.captures_dir),
        host_allowlist=ctx.options.host_allowlist.split(","),
        expected_endpoints=ctx.options.expected_endpoints.split(","),
    )


def response(flow):  # pragma: no cover - live session
    if _ADDON is not None:
        _ADDON.response(flow)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/test_cli.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Run the full suite**

Run: `.venv\Scripts\python -m pytest -v`
Expected: PASS (all tests from Tasks 2–9)

- [ ] **Step 6: Commit**

```bash
git add sand-netcapture/src/sand_netcapture/__main__.py sand-netcapture/src/sand_netcapture/capture.py sand-netcapture/tests/test_cli.py
git commit -m "feat(netcapture): CLI runner (guided capture + transform)"
```

---

## Task 10: README (probe steps, run instructions, safety, fallback)

**Files:**
- Create: `sand-netcapture/README.md`

- [ ] **Step 1: Write the README**

````markdown
# SAND Net-Capture

Passively captures the SAND game client's own PlayFab / master-server HTTPS responses
(research tree, compartment definitions, shop, etc.) and transforms them for the Unofficial
SAND Wiki. Companion to the offline `sand-scraper` (which reads static game bundles).

- Design: `../docs/superpowers/specs/2026-07-11-sand-netcapture-design.md`

## Safety — read this first

- **Observe-only.** The proxy forwards every request/response unmodified and only copies
  response bodies to disk. No request tampering, no response injection, no replay, no extra
  requests to the server.
- **You drive the game by hand.** The tool never automates or talks to the client.
- **Never commit `out/`.** Raw captures contain session tickets / account data. `out/` is
  gitignored; only redacted fixtures and transformed outputs are committed.
- **No guarantee against bans.** MITM of your own client is inherently against some games'
  ToS even when passive. Accepted trade-off; kept minimal.

## Setup

```
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
```

## Phase 0 — Probe (do this once, before trusting the tool)

Confirms the client's TLS is not certificate-pinned and records the real hostnames.

1. Install mitmproxy's root CA: run `.venv\Scripts\mitmdump` once, browse to
   http://mitm.it from the machine, install the Windows cert (Local Machine → Trusted Root).
2. Start `.venv\Scripts\mitmdump -p 8080`.
3. Set Windows proxy to `127.0.0.1:8080` (Settings → Network → Proxy), launch the game, log in.
4. **If you see decoded PlayFab/master JSON flow by:** not pinned — note the hostnames and put
   them in `config.toml`'s `host_allowlist`. Proceed to Phase 1.
5. **If the game fails to connect / mitmproxy logs TLS handshake errors:** the client pins its
   certs. Stop — the proxy approach won't work; see "Fallback" below.
6. Turn the Windows proxy back off.

## Phase 1 — Guided capture

1. Edit `config.toml`: set `host_allowlist` (from the probe) and `expected_endpoints`.
2. Run:
   ```
   .venv\Scripts\python -m sand_netcapture capture
   ```
   This enables the system proxy, starts the recorder, and prints a live checklist.
3. Launch the game, log in, and click through the menus (research tree, shop, storage,
   expeditions, characters) until every endpoint shows `[x]`.
4. Press Ctrl+C. The system proxy is restored automatically.

Raw responses land in `out/captures/<Endpoint>.json` plus `out/captures/_index.json`.

## Transform

```
.venv\Scripts\python -m sand_netcapture transform
```

Writes `out/tech-tree.json` — an authoritative, ID-based research tree (faction slug, tier,
compartment ids, cost, prerequisite node ids), stable-sorted by id.

**Note:** the server response has no node display names or a/b/c letters — those in the wiki's
legacy `tech-tree-extracted.json` were hand-added. Resolving names (join with
`GetCompartmentDefinitions` + localization) and wiring this into the wiki generator are
follow-ups (see the design doc's "future work").

## Fallback (cert pinning)

If Phase 0 shows pinning, the proxy cannot decrypt the traffic. The documented fallback is a
Frida in-process hook that reads plaintext before encryption — significantly more work
(IL2CPP RE, brittle per patch). Not implemented; reassess with the user before pursuing.

## Tests

```
.venv\Scripts\python -m pytest
```
Pure unit tests over committed fixtures. The live capture session is manual (not automated).
````

- [ ] **Step 2: Commit**

```bash
git add sand-netcapture/README.md
git commit -m "docs(netcapture): README with probe steps, run flow, safety, fallback"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** placement (Task 1), config incl. host allowlist + expected endpoints (Task 2), generic capture + coverage (Tasks 3–5), stable emit (Task 6), proxy set/restore (Task 7), research-tree transform (Task 8), guided-session CLI (Task 9), probe + safety + fallback docs (Task 10). Passive/observe-only enforced in Tasks 4 & 9 and documented in Task 10.
- **Known deviation from spec's "drop-in" wording:** the real `GetResearchTree` schema lacks display names/letters, so Task 8 emits an authoritative ID-based tree instead of a byte-identical `tech-tree-extracted.json`. This was surfaced to the user; name-resolution is future work. If the user wants a true drop-in in v1, add a task that captures `GetCompartmentDefinitions`, resolves comp-id → localized name (reusing `sand-scraper`'s localization), and derives letters by (faction, tier) ordering.
- **`host_allowlist` / `expected_endpoints` / `fraction_factions` values are unverified** until a real Phase-0 probe + capture; treat the config defaults as placeholders to confirm, not facts.
- **mitmproxy addon registration (Task 9)** uses module-level `load`/`running`/`response` hooks — verify against the pinned mitmproxy 11.x API during implementation; adjust the option-passing if the `--set` interface differs.
