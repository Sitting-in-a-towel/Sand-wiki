import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(base, rel, obj):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_build_location_loot(tmp_path):
    # Railgun spawns only in Dreadnought (+ Ship Graveyard) -> exclusive; item_ammo spawns in 4
    # locations -> generic (excluded, > exclusiveMaxLocations=3).
    def ammo_spawn():
        return {"blueprint": "item_ammo", "count": 30, "weight": None, "spawnerTotalWeight": None,
                "mandatory": False, "spawner": "game_itemSpawner_ammo"}
    rail = {"blueprint": "game_packedTurretT4RailGun_Container", "count": 1, "weight": 100,
            "spawnerTotalWeight": 300, "mandatory": True, "spawner": "game_itemSpawnerRandomArtefactTurretPacked_M"}
    _write(tmp_path, "extracted/json/location_spawns.json", {
        "loc_event_Dreadnought": {"bundle": "x", "spawns": [rail, ammo_spawn()]},
        "loc_event_ShipGraveyard": {"bundle": "x", "spawns": [rail]},
        "island_A": {"bundle": "x", "spawns": [ammo_spawn()]},
        "island_B": {"bundle": "x", "spawns": [ammo_spawn()]},
        "island_C": {"bundle": "x", "spawns": [ammo_spawn()]},
    })
    _write(tmp_path, "sek-out/items.json", [{"id": "item_ammo", "name": "Pistol Ammo"}])
    gen = tmp_path / "gen.json"
    gen.write_text(json.dumps([
        {"slug": "game-packed-turret-t4-rail-gun-container", "name": "Experimental 80 mm Railgun Kit", "kind": "item"},
        {"slug": "pistol-ammo", "name": "Pistol Ammo", "kind": "item"},
    ]), encoding="utf-8")
    _write(tmp_path, "transform/overrides/location-loot-overrides.json",
           json.loads((HERE.parent / "transform" / "overrides" / "location-loot-overrides.json").read_text(encoding="utf-8")))

    env = {**os.environ, "SEK_ITEMS": "sek-out/items.json", "GEN_ENTITIES": str(gen),
           "WIKI_ENTITIES": str(tmp_path / "none.json")}
    subprocess.run([sys.executable, str(HERE / "build_location_loot.py")], cwd=tmp_path, check=True, env=env)

    data = json.loads((tmp_path / "sek-out" / "location_loot.json").read_text(encoding="utf-8"))
    locs = {l["slug"]: l for l in data["locations"]}
    assert set(locs) == {"dreadnaught", "ship-graveyard"}
    d = locs["dreadnaught"]
    slugs = {r["slug"] for r in d["loot"]}
    assert "game-packed-turret-t4-rail-gun-container" in slugs   # exclusive -> included
    assert "pistol-ammo" not in slugs                            # generic (4 locations) -> excluded
    rk = next(r for r in d["loot"] if r["slug"] == "game-packed-turret-t4-rail-gun-container")
    assert rk["chance"] == 33.3 and rk["tier"] == "Notable loot"  # 100/300 weighted mandatory set
    assert locs["ship-graveyard"]["mint"] is True                 # minted (no existing entity)
