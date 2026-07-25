import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(base, rel, obj):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_build_lockbox_loot(tmp_path):
    _write(tmp_path, "extracted/json/lockbox_loot.json", {
        "lootData": {
            "1": {  # containerType 1 (military): tier 0 (S) = 1 set, tier 1 (A) = 1 set
                "0": [[{"item": "item_turretAmmo", "count": 60}, {"item": "game_keyLockedBox", "count": 1}]],
                "1": [[{"item": "item_shotgun", "count": 2}]],
                "2": [[{"item": "item_neverRolled", "count": 1}]],  # tier B, chance 0 -> excluded
            },
        },
        "crates": {
            "game_lockedBox_military": {"containerType": "1",
                "tierChances": {"0": 10, "1": 100, "2": 0, "3": 0, "4": 0}},
        },
    })
    _write(tmp_path, "sek-out/items.json", [
        {"id": "item_turretAmmo", "name": "Turret Ammo"},
        {"id": "item_shotgun", "name": "Boom Shotgun"},
    ])
    gen = tmp_path / "gen.json"
    gen.write_text(json.dumps([
        {"slug": "turret-ammo", "name": "Turret Ammo", "kind": "item"},
        {"slug": "boom-shotgun", "name": "Boom Shotgun", "kind": "item"},
        {"slug": "game-key-locked-box", "name": "Box Key", "kind": "item"},
    ]), encoding="utf-8")
    _write(tmp_path, "transform/overrides/lockbox-overrides.json",
           json.loads((HERE.parent / "transform" / "overrides" / "lockbox-overrides.json").read_text(encoding="utf-8")))

    env = {**os.environ, "SEK_ITEMS": "sek-out/items.json", "GEN_ENTITIES": str(gen),
           "WIKI_ENTITIES": str(tmp_path / "none.json")}
    subprocess.run([sys.executable, str(HERE / "build_lockbox_loot.py")], cwd=tmp_path, check=True, env=env)

    data = json.loads((tmp_path / "sek-out" / "lockbox_loot.json").read_text(encoding="utf-8"))
    crates = {c["slug"]: c for c in data["crates"]}
    mil = crates["military-box"]
    assert mil["category"] == "loot-containers"
    assert mil["requiresKeySlug"] == "game-key-locked-box" and mil["requiresKeyName"] == "Box Key"
    by = {r["slug"]: r for r in mil["loot"]}
    # tierChances 10/100 (total 110): S rolls 10/110, A rolls 100/110
    assert by["boom-shotgun"]["chance"] == 90.9   # only in A tier: 100/110
    assert by["turret-ammo"]["chance"] == 9.1     # only in S tier: 10/110
    assert by["turret-ammo"]["count"] == "60"
    # tier B (chance 0) never contributes
    assert all(r["slug"] != "item_neverRolled" for r in mil["loot"])
    # box key dropped in S tier resolves to the real Box Key (alias), not the junk over-mint
    assert "game-key-locked-box" in by
