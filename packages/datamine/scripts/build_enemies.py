"""Build sek-out/enemies.json from enemy_stats.json + loot_sources.json + enemy-overrides.json.
Upior loot groups per variant (variant.lootEffort -> a 'Mob Drops' cell); Ironclad loot is one
merged group (edef.lootGroup, e.g. "Loot") that inlines its mandatory drops at 100% and any
extraTables drops. Item ids resolve to wiki slugs via loot_resolve against the wiki item snapshot
(WIKI_ENTITIES env, default ../../apps/wiki/prisma/data.json) — the same internal-id<->slug source
build_container_loot.py uses; the generated entities.json carries DB CUIDs, not game ids, so it
can't resolve loot refs. extraTables (from enemy-overrides) are loot tables the source can't reach
(orphaned on-death drops); they're read straight from loottables_{voyage,storm}.json and emitted
with no computed chance (no roll weights available). Run from packages/datamine/ :
python scripts/build_enemies.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loot_resolve import make_resolver

WIKI_ENTITIES = os.environ.get("WIKI_ENTITIES", "../../apps/wiki/prisma/data.json")

enemy_stats = json.load(open("extracted/json/enemy_stats.json", encoding="utf-8"))
sources = {s["name"]: s for s in json.load(open("sek-out/loot_sources.json", encoding="utf-8"))}
ov = json.load(open("transform/overrides/enemy-overrides.json", encoding="utf-8"))
# Snapshot is either {items:[...]} (prisma/data.json) or a bare list (test fixture).
_wiki_raw = json.load(open(WIKI_ENTITIES, encoding="utf-8"))
wiki_items = [e for e in (_wiki_raw.get("items", []) if isinstance(_wiki_raw, dict) else _wiki_raw) if e.get("id")]

resolve = make_resolver(wiki_items, ov.get("itemSlugAliases", {}))

# Raw loot tables (id -> [{item, min, max}]), for extraTables the source can't reach. Optional:
# absent in the unit test unless a fixture is provided.
def _load_tables(path):
    if not os.path.exists(path):
        return {}
    doc = json.load(open(path, encoding="utf-8"))
    out = {}
    for t in doc.get("_lootTables", {}).get("$items", []):
        out[t["lootTableId"]] = [
            {"item": i["itemBlueprint"], "min": i["countMin"], "max": i["countMax"]}
            for i in t.get("items", {}).get("$items", [])
        ]
    return out

loot_tables = _load_tables("extracted/json/loottables_voyage.json")

def fmt_range(lo, hi):
    return str(lo) if lo == hi else f"{lo}-{hi}"

def rows_from_cell(cell, group, approx=False):
    """One loot cell (voyage/storm item lists) -> loot rows; chance = max pct across modes.
    When approx (e.g. the "Mob Drops" source, whose per-set roll weights aren't in the game
    data — build_loot_sources assumes equal weight), the computed % is a fabrication, so emit
    chance=None (unknown) rather than a misleading uniform number."""
    order, seen, vagg, sagg = [], set(), {}, {}
    for mode, agg in (("voyage", vagg), ("storm", sagg)):
        for e in (cell.get(mode) or []):
            it = e["item"]
            if it not in seen:
                seen.add(it); order.append(it)
            agg[it] = [e["min"], e["max"], e["pct"]]
    rows = []
    for it in order:
        slug, name, ok = resolve(it)
        v, s = vagg.get(it), sagg.get(it)
        chance = None if approx else max(x[2] for x in (v, s) if x)
        rows.append({
            "group": group, "slug": slug, "name": name, "chance": chance,
            "voyage": fmt_range(v[0], v[1]) if v else None,
            "storm": fmt_range(s[0], s[1]) if s else None,
            "resolved": ok,
        })
    return rows

def cells_by_effort(source):
    return {c.get("effort"): c for c in source.get("cells", {}).values()}

out, unresolved = [], []
for edef in ov["enemies"]:
    src = sources.get(edef["lootSource"], {})
    # "Mob Drops" has no real per-set roll weights (build_loot_sources flags it approx +
    # assumes equal weight), so its computed % is fabricated — suppress it (chance=None).
    approx = bool(src.get("approx"))
    variants = [{"name": v["name"], "hp": enemy_stats.get(v["epb"], {}).get("hp")} for v in edef["variants"]]

    loot = []
    if any("lootEffort" in v for v in edef["variants"]):
        # Per-variant grouping (Upior): each variant -> the matching effort cell.
        eff = cells_by_effort(src)
        for v in edef["variants"]:
            cell = eff.get(v.get("lootEffort"))
            if cell:
                loot.extend(rows_from_cell(cell, v["name"], approx))
    else:
        # Single merged pool (Ironclad): all cells under one group label.
        group = edef.get("lootGroup", "Drops")
        for cell in src.get("cells", {}).values():
            loot.extend(rows_from_cell(cell, group, approx))

    # Mandatory (guaranteed) drops -> the enemy's main loot group at 100% (no separate tab).
    mand_group = edef.get("lootGroup", "Loot")
    for m in src.get("mandatory", []):
        slug, name, ok = resolve(m["item"])
        rng = fmt_range(m["min"], m["max"])
        loot.append({"group": mand_group, "slug": slug, "name": name, "chance": 100.0,
                     "voyage": rng, "storm": rng, "resolved": ok})

    # extraTables: orphaned on-death drop tables the source can't reach (repair kit, artillery).
    # Read straight from the loot tables. Their drop odds aren't in the game bundles (hard-coded
    # in compiled C#), so chance is null UNLESS authored in extraTableChances (table id -> %,
    # e.g. recovered from the assembly or community-sourced).
    extra_chances = edef.get("extraTableChances", {})
    for tid in edef.get("extraTables", []):
        chance = extra_chances.get(tid)
        for it in loot_tables.get(tid, []):
            slug, name, ok = resolve(it["item"])
            rng = fmt_range(it["min"], it["max"])
            loot.append({"group": mand_group, "slug": slug, "name": name, "chance": chance,
                         "voyage": rng, "storm": rng, "resolved": ok})

    # Genuinely dropped = no slug at all (no id/name/alias match). A row with a slug but
    # resolved=False still links fine (its alias target is a live slug missing from the lagging
    # wiki snapshot), so it is NOT counted here.
    unresolved += [r["name"] for r in loot if not r["slug"]]
    out.append({
        "id": edef["id"], "slug": edef["slug"], "name": edef["name"],
        "type": edef["type"], "icon": edef.get("icon"),
        "variants": variants, "loot": loot,
    })

# Enrich loot-row names from the shipped entities (authoritative display names). The wiki-item
# snapshot lags behind live for a few slugs (knownLiveSlugs), so aliased rows can otherwise carry
# a raw id as their name. Tolerates the file being absent (e.g. in the unit test).
GEN_ENTITIES = os.environ.get("GEN_ENTITIES", "../data/generated/entities.json")
if os.path.exists(GEN_ENTITIES):
    name_by_slug = {e["slug"]: e["name"] for e in json.load(open(GEN_ENTITIES, encoding="utf-8")) if e.get("slug")}
    for e in out:
        for r in e["loot"]:
            if r["slug"] in name_by_slug:
                r["name"] = name_by_slug[r["slug"]]

artifact = {"meta": {"source": "enemy_stats.json + loot_sources.json", "enemies": len(out)}, "enemies": out}
os.makedirs("sek-out", exist_ok=True)
json.dump(artifact, open("sek-out/enemies.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print(f"enemies: {len(out)}")
for e in out:
    print(f"  {e['slug']}: {len(e['variants'])} variants, {len(e['loot'])} loot rows")
if unresolved:
    print(f"unresolved loot items ({len(unresolved)}): {sorted(set(unresolved))}")
    print("  -> add an itemSlugAliases entry in transform/overrides/enemy-overrides.json")
