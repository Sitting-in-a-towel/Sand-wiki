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
