import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(base, rel, obj):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_build_enemies(tmp_path):
    _write(tmp_path, "extracted/json/enemy_stats.json", {
        "mob_ghoul": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ghoul_melee": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ghoul_turret": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ironclad_Buckler": {"hp": 5000, "niceName": None, "type": "enemy-trampler", "components": []},
        "mob_ironclad_Falchion": {"hp": 4000, "niceName": None, "type": "enemy-trampler", "components": []},
        "mob_ironclad_Tophelm": {"hp": 4000, "niceName": None, "type": "enemy-trampler", "components": []},
    })
    _write(tmp_path, "sek-out/loot_sources.json", [
        {"name": "Mob Drops", "approx": True, "tiers": [], "efforts": [], "mandatory": [], "cells": {
            "0|ranged mob": {"tier": None, "effort": "ranged mob", "sets": 1,
                "voyage": [{"item": "item_pistolAmmo", "pct": 100.0, "min": 1, "max": 1}],
                "storm":  [{"item": "item_pistolAmmo", "pct": 100.0, "min": 1, "max": 2}]},
            "0|melee mob": {"tier": None, "effort": "melee mob", "sets": 1,
                "voyage": [{"item": "game_coinCrownPile_10", "pct": 50.0, "min": 1, "max": 1}],
                "storm":  [{"item": "game_coinCrownPile_10", "pct": 50.0, "min": 1, "max": 1}]},
            "0|melee mob (tool)": {"tier": None, "effort": "melee mob (tool)", "sets": 1,
                "voyage": [], "storm": []},
        }},
        {"name": "Ironclad Loot Box", "tiers": [], "efforts": [], "cells": {
            "0|": {"tier": None, "effort": None, "sets": 4,
                "voyage": [{"item": "item_weaponParts", "pct": 80.0, "min": 5, "max": 10}],
                "storm":  [{"item": "item_weaponParts", "pct": 80.0, "min": 5, "max": 10}]}},
         "mandatory": [{"item": "item_alloySteel", "min": 1, "max": 1}]},
    ])
    _ov = json.loads((HERE.parent / "transform" / "overrides" / "enemy-overrides.json").read_text(encoding="utf-8"))
    # Authored drop chance for one extra table (mechanism for game-code-sourced rates).
    for _e in _ov["enemies"]:
        if _e["id"] == "ironclad":
            _e["extraTableChances"] = {"ironcladLoot_repairKitEntity_set": 12.5}
    _write(tmp_path, "transform/overrides/enemy-overrides.json", _ov)
    # Orphaned extra tables (repair kit + a packed turret) the source can't reach.
    _write(tmp_path, "extracted/json/loottables_voyage.json", {"_lootTables": {"$items": [
        {"lootTableId": "ironcladLoot_repairKitEntity_set", "items": {"$items": [
            {"itemBlueprint": "item_repairKit", "countMin": 1, "countMax": 1}]}},
        {"lootTableId": "ironcladLoot_packedTurretT2_80mm_set", "items": {"$items": [
            {"itemBlueprint": "game_packedTurretT2Container", "countMin": 1, "countMax": 1}]}},
    ]}})
    wiki = tmp_path / "wiki-entities.json"
    wiki.write_text(json.dumps([
        {"id": "item_pistolAmmo", "slug": "pistol-ammo", "name": "Pistol Ammo", "kind": "item"},
        {"id": "item_weaponParts", "slug": "weapon-parts", "name": "Weapon Parts", "kind": "item"},
        {"id": "item_alloySteel", "slug": "resource-alloy-steel", "name": "Alloy Steel", "kind": "item"},
        {"id": "game_coinCrownPile_10", "slug": "coin-crown", "name": "Coin (Crown)", "kind": "item"},
        {"id": "RepairKit", "slug": "repair-kit", "name": "Repair Kit", "kind": "item"},
        {"id": "game_packedTurretT2Container", "slug": "game-packed-turret-t2-container", "name": "Packed Turret T2", "kind": "item"},
    ]), encoding="utf-8")

    env = {**os.environ, "WIKI_ENTITIES": str(wiki)}
    subprocess.run([sys.executable, str(HERE / "build_enemies.py")], cwd=tmp_path, check=True, env=env)

    data = json.loads((tmp_path / "sek-out" / "enemies.json").read_text(encoding="utf-8"))
    enemies = {e["id"]: e for e in data["enemies"]}

    upior = enemies["upior"]
    assert upior["type"] == "creature" and upior["icon"] is None
    assert [v["hp"] for v in upior["variants"]] == [100, 100, 100]
    ranged = [r for r in upior["loot"] if r["group"] == "Ranged"]
    assert ranged and ranged[0]["slug"] == "pistol-ammo" and ranged[0]["storm"] == "1-2"
    # Mob Drops is approx (no real per-set weights) -> chance suppressed (unknown), not fabricated.
    assert all(r["chance"] is None for r in upior["loot"])

    ic = enemies["ironclad"]
    assert [v["name"] for v in ic["variants"]] == ["Buckler", "Falchion", "Tophelm"]
    assert [v["hp"] for v in ic["variants"]] == [5000, 4000, 4000]
    # Single "Loot" group (no separate "Guaranteed" tab); everything lives there.
    assert all(r["group"] == "Loot" for r in ic["loot"])
    by_slug = {r["slug"]: r for r in ic["loot"]}
    # cargo item (computed %), alloy folded in at 100%, and orphaned extraTables at unknown chance.
    assert by_slug["weapon-parts"]["chance"] == 80.0
    assert by_slug["resource-alloy-steel"]["chance"] == 100.0
    # authored extraTableChances shows for the repair kit; unauthored artillery stays unknown.
    assert by_slug["repair-kit"]["chance"] == 12.5
    assert by_slug["game-packed-turret-t2-container"]["chance"] is None
