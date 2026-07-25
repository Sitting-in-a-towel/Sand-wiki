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
    prior = None
    proc = None
    try:
        prior = enable_capture_proxy(cfg.proxy_port)
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
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        if prior is not None:
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
