from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_json(data: Any, path: Path) -> None:
    """Write pretty JSON (UTF-8, 2-space indent, trailing newline), creating parents."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
