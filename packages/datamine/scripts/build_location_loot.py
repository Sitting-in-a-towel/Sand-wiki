"""Build sek-out/location_loot.json — per-location NOTABLE (location-exclusive) loot.

From extract_location_spawns.py output, keep only blueprints that (a) resolve to a real item
page, and (b) are location-exclusive (spawn in <= exclusiveMaxLocations distinct mapped
locations) — most artefact loot is generic (everywhere) and stays in World/Ground Loot; only a
few places (Dreadnought / Ship Graveyard = the T4 experimental cannons) have uniques. Chance is
computed from the spawner set weights (mandatory weighted set -> weight/Σweight). Emits only for
the location roots listed in the override (mapped to a wiki slug).
Run from packages/datamine/ :  python scripts/build_location_loot.py
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loot_resolve import make_resolver

SEK_ITEMS = os.environ.get("SEK_ITEMS", "sek-out/items.json")
GEN_ENTITIES = os.environ.get("GEN_ENTITIES", "../data/generated/entities.json")
WIKI_ENTITIES = os.environ.get("WIKI_ENTITIES", "../../apps/wiki/prisma/data.json")

spawns = json.load(open("extracted/json/location_spawns.json", encoding="utf-8"))
ov = json.load(open("transform/overrides/location-loot-overrides.json", encoding="utf-8"))

# union catalog (prisma id->slug + sek items joined to generated names) — same as build_world_spawns
wiki_items = []
if os.path.exists(WIKI_ENTITIES):
    raw = json.load(open(WIKI_ENTITIES, encoding="utf-8"))
    wiki_items += [e for e in (raw.get("items", []) if isinstance(raw, dict) else raw) if e.get("id")]
gen = json.load(open(GEN_ENTITIES, encoding="utf-8")) if os.path.exists(GEN_ENTITIES) else []
gen_slug_by_name = {e["name"].lower(): e["slug"] for e in gen if e.get("kind") == "item" and e.get("name")}
gen_item_slugs = {e["slug"] for e in gen if e.get("kind") == "item"}
name_by_slug = {e["slug"]: e["name"] for e in gen if e.get("slug")}
if os.path.exists(SEK_ITEMS):
    for it in json.load(open(SEK_ITEMS, encoding="utf-8")):
        slug = gen_slug_by_name.get((it.get("name") or "").lower())
        if slug:
            wiki_items.append({"id": it["id"], "slug": slug, "name": it["name"]})
resolve = make_resolver(wiki_items, ov.get("itemSlugAliases", {}))

root_to_slug = {l["root"]: l["slug"] for l in ov["locations"]}
excl_spawner = re.compile(ov.get("excludeSpawnerPattern", "$^"))
excl_bp = re.compile(ov.get("excludeBlueprintPattern", "$^"))
MAXLOC = ov.get("exclusiveMaxLocations", 3)
is_real = lambda r: not re.search(r"test|demo|deusexmash", r, re.I)

def loc_identity(root):
    """Collapse mapped roots to their wiki slug so a location + its _setup sub-prefab count once."""
    return root_to_slug.get(root, root)

# exclusivity: distinct location identities per blueprint (real locations only, allowed spawners)
locs_by_bp = {}
for root, d in spawns.items():
    if not is_real(root):
        continue
    ident = loc_identity(root)
    for s in d["spawns"]:
        if excl_spawner.search(s.get("spawner", "")):
            continue
        locs_by_bp.setdefault(s["blueprint"], set()).add(ident)

def chance_of(entry):
    w, tot = entry.get("weight"), entry.get("spawnerTotalWeight")
    if w is not None and tot:
        return round(100.0 * w / tot, 1)
    if entry.get("mandatory"):
        return 100.0            # single mandatory spawner always yields its blueprint
    return None

# aggregate per mapped location slug
by_slug = {}
for root, d in spawns.items():
    slug = root_to_slug.get(root)
    if not slug:
        continue
    for s in d["spawns"]:
        bp = s["blueprint"]
        if excl_spawner.search(s.get("spawner", "")) or excl_bp.search(bp):
            continue
        if len(locs_by_bp.get(bp, ())) > MAXLOC:
            continue  # generic (spawns widely) -> not location-notable
        islug, iname, ok = resolve(bp)
        if not islug or islug not in gen_item_slugs:
            continue  # only real item pages
        ch = chance_of(s)
        e = by_slug.setdefault(slug, {})
        row = e.get(islug)
        if row is None:
            e[islug] = {"slug": islug, "name": name_by_slug.get(islug, iname), "chance": ch,
                        "min": s.get("count", 1), "max": s.get("count", 1)}
        else:
            if ch is not None:
                row["chance"] = ch if row["chance"] is None else max(row["chance"], ch)
            row["min"] = min(row["min"], s.get("count", 1)); row["max"] = max(row["max"], s.get("count", 1))

meta_by_slug = {l["slug"]: l for l in ov["locations"]}
out = []
for slug, items in by_slug.items():
    m = meta_by_slug[slug]
    loot = sorted(items.values(), key=lambda r: (-(r["chance"] or 0), r["name"].lower()))
    for r in loot:
        r["count"] = str(r["min"]) if r["min"] == r["max"] else f'{r["min"]}-{r["max"]}'
        del r["min"]; del r["max"]
        r["tier"] = "Notable loot"
    out.append({"slug": slug, "name": m["name"], "mint": bool(m.get("mint")),
                "category": m.get("category", "landmarks"), "description": m.get("description"), "loot": loot})

artifact = {"meta": {"source": "location_spawns.json", "locations": len(out)}, "locations": out}
os.makedirs("sek-out", exist_ok=True)
json.dump(artifact, open("sek-out/location_loot.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"locations with notable loot: {len(out)}")
for l in out:
    print(f"  {l['slug']}{' (mint)' if l['mint'] else ''}: " + ", ".join(f"{r['name']} {r['chance']}%" if r['chance'] is not None else r['name'] for r in l['loot']))
