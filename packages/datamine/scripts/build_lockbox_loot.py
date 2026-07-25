"""Build sek-out/lockbox_loot.json — the key-locked crates (Military / Valuables / Utility Box).

Joins extracted/json/lockbox_loot.json (the conf_worldContractsConfig loot pool +
per-crate tier roll chances) with the wiki item catalog. Each crate opens to a rolled
reward tier, then one random set within (containerType, tier). Overall per-item drop
chance = Σ_tier P(tier) * (#sets-with-item / #sets-in-tier), over the tiers whose roll
chance is non-zero (only S + A for these crates). Item ids resolve via loot_resolve
against the union of prisma/data.json + (sek items joined to generated names).
Run from packages/datamine/ :  python scripts/build_lockbox_loot.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loot_resolve import make_resolver

SEK_ITEMS = os.environ.get("SEK_ITEMS", "sek-out/items.json")
GEN_ENTITIES = os.environ.get("GEN_ENTITIES", "../data/generated/entities.json")
WIKI_ENTITIES = os.environ.get("WIKI_ENTITIES", "../../apps/wiki/prisma/data.json")

extracted = json.load(open("extracted/json/lockbox_loot.json", encoding="utf-8"))
loot_data = extracted.get("lootData", {})
crate_roll = extracted.get("crates", {})
ov = json.load(open("transform/overrides/lockbox-overrides.json", encoding="utf-8"))

# Union catalog: prisma snapshot (game-id -> slug) + sek items joined to generated names.
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

def fmt_range(lo, hi):
    return str(lo) if lo == hi else f"{lo}-{hi}"

out_crates = []
unresolved = []
for cdef in ov["crates"]:
    roll = crate_roll.get(cdef["epb"], {})
    ct = roll.get("containerType")
    tier_chances = {t: c for t, c in (roll.get("tierChances") or {}).items() if c}
    total = sum(tier_chances.values())
    tiers = loot_data.get(str(ct), {})

    # blueprint -> {p, min, max}
    agg = {}
    for t, chance in tier_chances.items():
        sets = tiers.get(t, [])
        if not sets or not total:
            continue
        p_tier = chance / total
        n = len(sets)
        seen_per_item = {}   # blueprint -> #sets containing it (in this tier)
        for s in sets:
            for it in {x["item"] for x in s if x.get("item")}:  # dedup within a set
                seen_per_item[it] = seen_per_item.get(it, 0) + 1
        counts = {}          # blueprint -> [min,max] observed count
        for s in sets:
            for x in s:
                bp = x.get("item")
                if not bp:
                    continue
                c = int(x.get("count", 1) or 1)
                lo, hi = counts.get(bp, (c, c))
                counts[bp] = (min(lo, c), max(hi, c))
        for bp, hits in seen_per_item.items():
            e = agg.setdefault(bp, {"p": 0.0, "min": counts[bp][0], "max": counts[bp][1]})
            e["p"] += p_tier * (hits / n)
            e["min"] = min(e["min"], counts[bp][0])
            e["max"] = max(e["max"], counts[bp][1])

    loot = []
    for bp, e in agg.items():
        slug, name, ok = resolve(bp)
        if not slug:
            unresolved.append(bp)
            continue
        loot.append({"slug": slug, "name": name, "chance": round(e["p"] * 100, 1),
                     "tier": "Loot", "count": fmt_range(e["min"], e["max"]), "resolved": ok})
    loot.sort(key=lambda r: -r["chance"])

    # Enrich display names from the shipped entities.
    out_crates.append({
        "id": cdef["id"], "slug": cdef["slug"], "name": cdef["name"],
        "category": "loot-containers", "icon": cdef.get("icon"),
        "requiresKeySlug": cdef.get("requiresKeySlug"), "requiresKeyName": None, "loot": loot,
    })

if os.path.exists(GEN_ENTITIES):
    name_by_slug = {e["slug"]: e["name"] for e in gen if e.get("slug")}
    for c in out_crates:
        for r in c["loot"]:
            if r["slug"] in name_by_slug:
                r["name"] = name_by_slug[r["slug"]]
        if c["requiresKeySlug"]:
            c["requiresKeyName"] = name_by_slug.get(c["requiresKeySlug"], c["requiresKeySlug"])

artifact = {"meta": {"source": "conf_worldContractsConfig._lockedBoxLootData", "crates": len(out_crates)}, "crates": out_crates}
os.makedirs("sek-out", exist_ok=True)
json.dump(artifact, open("sek-out/lockbox_loot.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print(f"lockbox crates: {len(out_crates)}")
for c in out_crates:
    print(f"  {c['slug']}: {len(c['loot'])} loot rows, key={c['requiresKeySlug']}")
if unresolved:
    print(f"unresolved (skipped) blueprints: {sorted(set(unresolved))}")
