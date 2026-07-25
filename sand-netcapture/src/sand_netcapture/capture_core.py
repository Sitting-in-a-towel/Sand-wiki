from __future__ import annotations

from urllib.parse import urlparse


def host_allowed(host: str, allowlist: list[str]) -> bool:
    """True if host contains any allowlisted substring.

    Empty fragments are ignored: an empty string would match every host, which would
    silently capture all traffic and break the observe-only scoping.
    """
    return any(fragment and fragment in host for fragment in allowlist)


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
