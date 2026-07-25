from __future__ import annotations


def format_checklist(*, expected: list[str], seen: set[str]) -> str:
    """One line per expected endpoint: [x] if captured, [ ] if not."""
    lines = [f"[{'x' if e in seen else ' '}] {e}" for e in expected]
    return "\n".join(lines)


def all_captured(*, expected: list[str], seen: set[str]) -> bool:
    """True once every expected endpoint has been seen."""
    return all(e in seen for e in expected)
