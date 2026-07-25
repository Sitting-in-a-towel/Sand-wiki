from __future__ import annotations

import json
from pathlib import Path

from .capture_core import build_record, derive_endpoint_key, host_allowed


class CaptureAddon:
    """mitmproxy addon: observe-only recorder of allowlisted responses.

    NEVER modifies the flow. `response(flow)` unpacks the flow and delegates to
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
