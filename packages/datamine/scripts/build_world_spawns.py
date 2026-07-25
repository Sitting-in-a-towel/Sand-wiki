"""Build sek-out/world_spawns.json — the loose "World / Ground Loot" source.

Joins extracted/json/world_spawns.json (spawner blueprints + stack counts) with the
wiki item catalog, keeping only blueprints that resolve to a real ITEM page (the
"items that map to item pages" scope — crates/mobs/destructibles don't resolve to the
item catalog and drop out; a few false positives are force-dropped via
world-spawn-overrides excludeBlueprints). No per-item chance (weights are local to each
spawner, not a global rarity), so links carry only a stack-count range under one
"Ground spawn" tier. Item ids resolve via loot_resolve against a fresh game-id->slug
catalog built by joining sek-out/items.json (game id + name) with the shipped generated
entities (name -> slug) — this covers ALL shipped items, unlike the lagging
prisma/data.json snapshot. Run from packages/datamine/ :
python scripts/build_world_spawns.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loot_resolve import make_resolver

SEK_ITEMS = os.environ.get("SEK_ITEMS", "sek-out/items.json")
GEN_ENTITIES = os.environ.get("GEN_ENTITIES", "../data/generated/entities.json")
WIKI_ENTITIES = os.environ.get("WIKI_ENTITIES", "../../apps/wiki/prisma/data.json")

spawns = json.load(open("extracted/json/world_spawns.json", encoding="utf-8"))
ov = json.load(open("transform/overrides/world-spawn-overrides.json", encoding="utf-8"))

# Build the game-id -> wiki-slug catalog from the UNION of two sources for max coverage:
#  (a) prisma/data.json items — authoritative game-id -> slug (but a lagging snapshot), and
#  (b) sek-out/items.json (game id + name) joined to the shipped generated entities
#      (name -> slug) — covers items the snapshot misses.
wiki_items = []
if os.path.exists(WIKI_ENTITIES):
    raw = json.load(open(WIKI_ENTITIES, encoding="utf-8"))
    wiki_items += [e for e in (raw.get("items", []) if isinstance(raw, dict) else raw) if e.get("id")]
gen = json.load(open(GEN_ENTITIES, encoding="utf-8")) if os.path.exists(GEN_ENTITIES) else []
gen_slug_by_name = {e["name"].lower(): e["slug"] for e in gen if e.get("kind") == "item" and e.get("name")}
if os.path.exists(SEK_ITEMS):
    for it in json.load(open(SEK_ITEMS, encoding="utf-8")):
        slug = gen_slug_by_name.get((it.get("name") or "").lower())
        if slug:
            wiki_items.append({"id": it["id"], "slug": slug, "name": it["name"]})

resolve = make_resolver(wiki_items, ov.get("itemSlugAliases", {}))
exclude = set(ov.get("excludeBlueprints", []))

def fmt_range(lo, hi):
    return str(lo) if lo == hi else f"{lo}-{hi}"

# Resolve + dedup by wiki slug (many blueprints -> one item, e.g. ammo count variants);
# widen the stack-count range across all blueprints that map to the same item.
by_slug = {}
unresolved = []
for bp, info in spawns.items():
    if bp in exclude:
        continue
    slug, name, ok = resolve(bp)
    if not slug:
        unresolved.append(bp)
        continue
    lo, hi = info["countMin"], info["countMax"]
    e = by_slug.get(slug)
    if e is None:
        by_slug[slug] = {"slug": slug, "name": name, "min": lo, "max": hi}
    else:
        e["min"] = min(e["min"], lo)
        e["max"] = max(e["max"], hi)

# Enrich display names from the shipped entities (authoritative; tolerate absence).
if os.path.exists(GEN_ENTITIES):
    name_by_slug = {e["slug"]: e["name"] for e in json.load(open(GEN_ENTITIES, encoding="utf-8")) if e.get("slug")}
    for e in by_slug.values():
        if e["slug"] in name_by_slug:
            e["name"] = name_by_slug[e["slug"]]

src = ov["source"]
loot = [
    {"slug": e["slug"], "name": e["name"], "chance": None, "tier": "Ground spawn",
     "count": fmt_range(e["min"], e["max"])}
    for e in sorted(by_slug.values(), key=lambda e: e["name"].lower())
]
artifact = {
    "meta": {"source": "world_spawns.json", "items": len(loot), "unresolvedBlueprints": len(unresolved)},
    "source": {"id": src["id"], "slug": src["slug"], "name": src["name"],
               "category": src["category"], "icon": src.get("icon")},
    "loot": loot,
}
os.makedirs("sek-out", exist_ok=True)
json.dump(artifact, open("sek-out/world_spawns.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print(f"world-spawn items: {len(loot)} (from {len(spawns)} blueprints, {len(unresolved)} unresolved skipped)")
print("sample:", ", ".join(e["name"] for e in loot[:15]))
if unresolved:
    print(f"unresolved (skipped) blueprints: {sorted(unresolved)}")
