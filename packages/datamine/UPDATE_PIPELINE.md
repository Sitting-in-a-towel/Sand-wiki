# UPDATE PIPELINE — regenerate all data for a new SAND build

Run on a machine with a **copy** of the game files (never the live install). Needs
Python 3 + `pip install -r requirements.txt`, and Il2CppDumper in `tools/il2cppdumper/`.
All commands run from `packages/datamine/`.

## 0. Refresh the file copy
Copy `<install>/Sand_Data` and `<install>/GameAssembly.dll` into `gamefiles/`.

## 1. Class reference (only for new investigations)
Il2CppDumper on `gamefiles/GameAssembly.dll` + `gamefiles/Sand_Data/il2cpp_data/Metadata/global-metadata.dat`
-> `extracted/il2cpp_dump/dump.cs`.

## 2. Extract -> build (order matters)
```bash
python scripts/extract_icons.py
python scripts/extract_loot_spawners.py
python scripts/extract_loot_tables.py            # -> extracted/json/loottables_{voyage,storm}.json (Odin configs — see loot note)
python scripts/build_loot_sources.py
python scripts/extract_enemy_stats.py            # -> extracted/json/enemy_stats.json (Odin-decoded mob_* EPBs — see enemy note)
python scripts/build_enemies.py
python scripts/scan_location_prefabs.py
python scripts/build_location_contents.py
python scripts/extract_compartments_db.py        # -> extracted/json/compartments_database.json (INSPECT for stats — see note)
python scripts/extract_compartment_stats.py      # -> extracted/json/compartment_stats_probe.json (DIAGNOSTIC — see note)
python scripts/build_parts_v2.py
python scripts/extract_progression_descriptions.py
python scripts/build_research_nodes.py
python scripts/build_research_tree_from_sandhelp.py
python scripts/extract_weapon_stats.py && python scripts/build_weapon_stats.py
python scripts/extract_turret_stats.py && python scripts/build_turret_stats.py
# localization: obtain per-locale i2_terms_<locale>.json (re-extract I2Languages, all langs) into extracted/json/
python scripts/build_localization.py             # -> sek-out/localization.json (all locales)
python scripts/extract_item_defs.py              # -> extracted/json/item_defs.json (full ItemDatabase — see note)
# raw typetree dumps build_site_data enumerates over (not Odin — plain MonoBehaviours):
python scripts/dump_bundle_json.py gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/craftingrecipes_assets_all.bundle extracted/json/craftingrecipes.json
python scripts/dump_bundle_json.py gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/lootsets_assets_all.bundle extracted/json/lootsets.json
python scripts/build_site_data.py                # items, recipes, loot_tables -> sek-out/
python scripts/build_container_loot.py
```

> **Loot-table changes (datamine):** `extract_loot_tables.py` decodes the two Odin-serialized
> `conf_worldLootTables{Voyage,Storm}Config` MonoBehaviours in `configuration_assets_all` into the
> `{_lootTables:{$items:[…]}}` shape `build_loot_sources.py` / `build_site_data.py` consume (the raw
> dumps are gitignored). `build_site_data.py` writes the normalized **all-tables** view to
> `sek-out/loot_tables.json` (committed, ~197 tables, `{id, voyage:[{item,min,max}], storm:[…]}`).
> That file is nothing-reads-it output — its only purpose is the per-build diff: after a re-mine,
> `git diff sek-out/loot_tables.json` shows every drop-composition / count-range change across ALL
> tables, not just the 8 player-facing containers `container_loot.json` surfaces. Commit the
> regenerated `loot_tables.json` each build so the next build's diff stays meaningful.

> **Trampler stats note:** after `extract_compartments_db.py`, inspect
> `extracted/json/compartments_database.json` for health/weight/energy/slot fields. If
> present, the Plan-2 transform maps them; if absent, the transform falls back to the
> committed baseline. Report findings so the mapping can be wired.

> **Item completeness:** `extract_item_defs.py` writes `extracted/json/item_defs.json` (the full
> ItemDatabase). `build_site_data.py` now enumerates items from item_defs ∪ localization ∪ loot ∪
> recipes — so vendor/quest/world items (turret kits, keys, elemental ammo) appear. If
> `item_defs.json` is absent, enumeration still unions localization (≈249 items). The TS transform
> additionally drops loc-only ids that don't match a baseline entity (localization enriches, never
> mints new wiki pages); genuinely-new items come from the curated item_defs/items.json.

> **Enemy stats (datamine):** `extract_enemy_stats.py` Odin-decodes HP / niceName / type off the
> allow-listed `mob_ghoul*` / `mob_ironclad_*` EPBs in `epb_assets_all.bundle` →
> `extracted/json/enemy_stats.json` (a gitignored Stage-A intermediate, like `entity_loot.json`).
> If an HP comes out null, inspect the printed `components` list and adjust `find_hp` (field/component
> names were recovered from `global-metadata.dat`, not a code dump).
>
> `build_enemies.py` joins `enemy_stats.json` + `sek-out/loot_sources.json` +
> `transform/overrides/enemy-overrides.json`, resolving drop items to wiki slugs against
> `apps/wiki/prisma/data.json` (the internal id↔slug snapshot; the same source `build_container_loot.py`
> uses — NOT generated/entities.json, whose ids are DB CUIDs) → `sek-out/enemies.json` (committed).
> Loot-row display names are enriched from the shipped `packages/data/generated/entities.json`. Add
> unresolved item ids to `enemy-overrides.json` → `itemSlugAliases`.

> **Trampler stats (datamine):** `extract_compartment_stats.py` reads the `walker_*_epb` prefabs
> in `epb_assets_all.bundle`. Each prefab MonoBehaviour holds an Odin-serialized Entitas component
> list (`serializationData.SerializedBytes`, decoded via `odin_parser.py`). It writes
> `sek-out/compartment_stats.json` (name-matched via the localized compartment name; collided names
> excluded). The transform (`trampler.ts`) refreshes only the provided fields, preserving the rest.
>
> RESOLVED MAPPING (2026-06-18 release build): the ONLY datamine-able gameplay stat is
> **`health`** = `HealthDataComponent.value` (matches/corrects the baseline). `PhysicsDataComponent
> .mass` is a physics constant (1.0/400.0), NOT the gameplay weight. **weight / energyConsumption /
> energyCapacity / ratedPower / crewSlots / itemSlots / weightCapacity are NOT in any static asset**
> — checked: epb prefab Entitas components (only Health/Physics/View/etc), `configuration_assets_all`
> (CheatItemDefinitions + loot configs), and `ui_assets_all` (CompartmentStats UI is a display widget
> with no values). They are populated at runtime/code-side, so they stay on the baseline (sandhelp).
> To pursue further: generate `dump.cs` (step 1) and search for a WalkerCompartment balance/config
> class; values may still be code constants rather than data.
>
> **Items (datamine):** `extract_item_defs.py` reads `CheatItemDefinitionsData` in
> `configuration_assets_all` → 117 items with `Name`/`Type`/`StorageStack` (authoritative category).
> No rarity/value/icon in that asset (baseline already has rarity; icons via sprite-match).

## 3. Art (slow, ~GBs RAM)
```bash
python scripts/render_part_thumbs.py
python scripts/render_thumbs_v2.py
python scripts/render_location_thumbs.py
python scripts/render_container_thumbs.py
python scripts/export_part_meshes_v3.py      # -> apps/wiki/public/meshes + packages/data/generated/mesh_index.json
```

## 4. Transform -> wiki artifact (Plan 2)
```bash
# from repo root
npx tsx packages/datamine/transform/run.ts        # -> packages/data/generated/*.json + diff report
```
Review the diff (especially slug changes), then commit the regenerated artifact + art.

> **Enemy entities (transform):** The transform merges `sek-out/enemies.json` into `kind:"enemy"`
> entities (`transform/enemies.ts` → `mergeEnemies`), emitting `role:"loot"` links from each enemy
> (Upior, Ironclad). Enemies are additions-only, so the first landing needs NO `--allow-slug-changes`.
> Null enemy icons are by-design (exempt from the icon gate and the missing-images report, like
> tech-nodes/locations).

## 4b. (OPTIONAL, DISABLED) Research-tree WebSocket capture
The tech tree (node edges, unlock costs, tiers, faction assignment) is **server-side** — it is
NOT in the game files (only the node name/description catalog is, in `ProgressionTreeDescriptions`).
It arrives at runtime via a `GetResearchTree` message over an encrypted WebSocket
(`wss://eus.<masterserver>/gameclient/`) after PlayFab login. `scripts/capture_research_tree.py`
is a mitmproxy addon that can intercept and dump it.

**This step is OPT-IN and DISABLED BY DEFAULT.** It is a TLS man-in-the-middle of your own
authenticated session: ToS gray area, may fail on certificate pinning (connection just drops),
and BattlEye is present (a proxy doesn't inject the process, but a live authenticated session is
never zero-risk). Run it manually, on your own account, ONE shot, low volume — never automate.
The wiki ships fine without it (the `/tech` page uses the sand-help reconstruction).

To enable (manual, deliberate):
```bash
pip install mitmproxy
set SAND_RESEARCH_CAPTURE=1            # env flag — without it the addon no-ops
mitmdump -s scripts/capture_research_tree.py
# then route SAND through 127.0.0.1:8080, trust the mitmproxy CA (mitm.it), log in, open the tree
```
Output: `extracted/json/research_tree_capture/*.json` + `research_tree_capture.json` (gitignored —
it is your account data, do NOT commit). A `build_research_tree_from_capture.py` mapper into
`research_tree.json` is authored once the real payload shape is known from a first capture.

## 5. After-update checklist
- Bundle names can shift between builds — every extractor prints what it found; "NOT FOUND" = asset moved.
- Re-verify slug reconciliation overrides (`transform/overrides/slug-map.json`) against the diff.
- dump.cs TypeDefIndexes shift — re-dump before trusting old line numbers.
