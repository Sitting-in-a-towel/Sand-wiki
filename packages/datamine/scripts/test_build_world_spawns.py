import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(base, rel, obj):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_build_world_spawns(tmp_path):
    _write(tmp_path, "extracted/json/world_spawns.json", {
        "item_shotgun": {"countMin": 1, "countMax": 1, "spawners": 3, "mandatoryAny": False},
        "item_c4Dynamite": {"countMin": 1, "countMax": 2, "spawners": 5, "mandatoryAny": True},
        "game_keyLockedBox": {"countMin": 1, "countMax": 1, "spawners": 9, "mandatoryAny": False},
        "game_armyBox_t1": {"countMin": 1, "countMax": 1, "spawners": 4, "mandatoryAny": False},  # crate, not an item
        "game_navalMine": {"countMin": 1, "countMax": 1, "spawners": 2, "mandatoryAny": False},   # excluded
        "mob_ironclad_Tophelm": {"countMin": 1, "countMax": 1, "spawners": 1, "mandatoryAny": False},  # not an item
    })
    _write(tmp_path, "sek-out/items.json", [
        {"id": "item_shotgun", "name": "Boomstick Shotgun"},
        {"id": "item_c4Dynamite", "name": "C4 Charge"},
        {"id": "game_keyLockedBox", "name": "Locked Box"},
    ])
    gen = tmp_path / "gen-entities.json"
    gen.write_text(json.dumps([
        {"slug": "boomstick-shotgun", "name": "Boomstick Shotgun", "kind": "item"},
        {"slug": "c4-charge", "name": "C4 Charge", "kind": "item"},
        {"slug": "locked-box", "name": "Locked Box", "kind": "item"},
    ]), encoding="utf-8")
    _write(tmp_path, "transform/overrides/world-spawn-overrides.json",
           json.loads((HERE.parent / "transform" / "overrides" / "world-spawn-overrides.json").read_text(encoding="utf-8")))

    env = {**os.environ, "SEK_ITEMS": "sek-out/items.json", "GEN_ENTITIES": str(gen),
           "WIKI_ENTITIES": str(tmp_path / "nonexistent.json")}  # force the sek<->gen join path only
    subprocess.run([sys.executable, str(HERE / "build_world_spawns.py")], cwd=tmp_path, check=True, env=env)

    data = json.loads((tmp_path / "sek-out" / "world_spawns.json").read_text(encoding="utf-8"))
    assert data["source"]["slug"] == "world-ground-loot"
    assert data["source"]["category"] == "loot-containers"
    by_slug = {r["slug"]: r for r in data["loot"]}
    # real items resolve and are flagged
    assert set(by_slug) == {"boomstick-shotgun", "c4-charge", "locked-box"}
    # crate / mob (not items) are skipped; naval mine is excluded
    assert "game-army-box" not in by_slug and "naval-mine" not in by_slug
    # every row: one "Ground spawn" tier, no chance, a stack count, resolved name from generated
    row = by_slug["c4-charge"]
    assert row["tier"] == "Ground spawn" and row["chance"] is None and row["count"] == "1-2"
    assert row["name"] == "C4 Charge"
