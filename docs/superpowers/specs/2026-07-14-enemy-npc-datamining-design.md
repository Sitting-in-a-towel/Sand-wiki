# Enemy NPC Datamining — Upiors & Ironclads

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan

## Problem

The datamine pipeline models items, recipes, loot containers, trampler parts, and
tech nodes — but no enemy NPCs. The game has enemy types the wiki should document:

- **Upiors** (internally `ghoul`; localized "Upiór") — undead creatures.
- **Ironclads** — enemy tramplers (walkers).

Both have loot tables the player wants to know about, plus basic gameplay info.
Today their loot is either excluded from shipped data (`mob-drops`, `militia-box`
in `excludeContainers`) or only surfaced as loot *containers* (Ironclad cargo
boxes), never as enemy entities. This design adds first-class enemy wiki pages.

## Scope

**In scope:** Two wiki pages — **Upior** (creature) and **Ironclad** (enemy
trampler). Each shows type, an HP-per-variant table, and a combined loot table.

**Explicitly out of scope (deferred):**
- Attack damage / range / cooldown — lives in AI behaviour trees
  (`beh_ghoul*` / `beh_ironclad*` in `ai_assets_all.bundle`), the same
  "code-side constant" class of data currently deferred for tramplers.
- Movement speed, vision range, mass, push-resist, explosion radius — extractable
  but omitted per the "minimal (HP + loot only)" decision. The extractor may
  capture them opportunistically, but they are not rendered.
- Faction — no per-mob faction field surfaced on the EPBs.
- Living Sand creatures (Leviathan / Quicksand) — mineable but out of scope;
  skipped via an allow-list.

## Ground truth (verified against game files)

| Enemy | EPB(s) | HP | Type | Loot tables |
|---|---|---|---|---|
| Upior (Ranged) | `mob_ghoul_epb` | 100 | creature | `mobLoot_ghoulRange_set1..6` |
| Upior (Melee) | `mob_ghoul_melee_epb` | 100 | creature | `mobLoot_ghoulMelee_set1..5` |
| Upior (Melee/Shovel) | `mob_ghoul_turret_epb` | 100 | creature | `mobLoot_ghoulMeleeShovel_set1` |
| Ironclad Buckler | `mob_ironclad_Buckler_epb` | 5000 | enemy-trampler | `ironcladLoot_lootBox_*`, `ironcladLoot_packedTurret*`, `ironcladLoot_lootBox_mandatotyAlloy_set` |
| Ironclad Falchion | `mob_ironclad_Falchion_epb` | 4000 | enemy-trampler | (as above) |
| Ironclad Tophelm | `mob_ironclad_Tophelm_epb` | 4000 | enemy-trampler | (as above) |

- HP source: `HealthDataComponent.value` (Odin-decoded from the EPB).
- Name source: `NiceNameDataComponent.name` ("Upior") is the reliable bridge;
  localization `Enemies/game_ghoulNavAgent_name` = "Upiór", `Enemies/*` +
  `Gameplay/damageEvent-mob_ironclad_*` for the Ironclad hulls.
- Type discriminator: presence of `MobGhoulDataComponent` → creature; presence of
  `TramplerAgentMovementDataComponent` / `WalkerDataComponent` → enemy-trampler.
- Loot: the `mobLoot_ghoul*` and `ironcladLoot_*` tables already live in
  `extracted/json/loottables_{voyage,storm}.json`, and `build_loot_sources.py`
  already computes their per-item percentages + count ranges. The enemy→loot
  binding is by naming convention (the ghoul EPBs carry no
  `LootSetupDataComponent`; drops spawn via `*_mobDrop_epb` referenced from the
  `mobLoot_*` tables).

## Data model (`packages/data/src/types.ts`)

- Add `"enemy"` to the `Entity.kind` union.
- Add optional `Entity.enemyStats`:

  ```ts
  interface EnemyStats {
    type: "creature" | "enemy-trampler";
    variants: { name: string; hp: number }[];
  }
  ```

- Loot uses the existing `EntityLink` unchanged, with `role: "loot"`:
  - `sourceSlug` = enemy slug (`upior`, `ironclad`)
  - `targetSlug` = dropped item slug
  - `tier` = variant / loot-group label (e.g. "Ranged", "40mm cargo", "Guaranteed")
  - `value1` = chance %, `value2` = voyage count range, `value3` = storm count range

  This is the same convention as container loot, so item pages get a "dropped by"
  backlink for free via the existing link infrastructure.

- **Icons:** enemies are **icon-optional**, like `tech-node` / location entities
  which ship with null icons by design. The icon-gate (which drops icon-less
  *item* entities) does not apply to `kind:"enemy"`. A hero image can be added
  later. `reportDanglingRefs` and the images report must treat null enemy icons as
  by-design, not `needsExtraction`.

- Category: `"creatures"` for Upior, `"enemy-tramplers"` for Ironclad (used by nav
  listing).

## Pipeline architecture

Chosen approach: **reuse the existing loot math, add a dedicated enemy extractor
and TS transform module.** Leaves shipped `container_loot.json` untouched.

### Stage A — Python extract → build (`packages/datamine/scripts/`)

1. **New `extract_enemy_stats.py`** (mirrors `extract_loot_spawners.py`):
   walks the allow-listed `mob_ghoul*` / `mob_ironclad_*` EPBs in
   `epb_assets_all.bundle`, Odin-decodes `HealthDataComponent.value`,
   `NiceNameDataComponent.name`, and the type-discriminator component →
   `extracted/json/enemy_stats.json`, keyed by EPB name.

2. **Reuse `build_loot_sources.py`** output — it already emits `mobLoot_ghoul*`
   and `ironcladLoot_*` drops with percentages + voyage/storm count ranges into
   `loot_sources.json`. No change needed to the loot math itself.

3. **New `build_enemies.py`**: joins `enemy_stats.json` + the computed loot rows +
   localization, grouping variants under their parent NPC via a naming-convention
   map (`mobLoot_ghoul*` → Upior, `ironcladLoot_*` → Ironclad). Resolves dropped
   item ids to wiki slugs (same resolution `build_container_loot.py` uses).
   Applies a **new `enemy-overrides.json`** (loot-group labels, item slug aliases,
   exclusions, allow-list). Emits **`sek-out/enemies.json`**:

   ```jsonc
   {
     "meta": { ... },
     "enemies": [
       {
         "id": "upior", "slug": "upior", "name": "Upiór",
         "type": "creature", "icon": null,
         "variants": [ { "name": "Ranged", "hp": 100 }, ... ],
         "loot": [ { "slug": "...", "name": "...", "variant": "Ranged",
                     "chance": 12.5, "voyage": "1", "storm": "1-2" }, ... ]
       },
       { "id": "ironclad", ... }
     ]
   }
   ```

### Stage B — TypeScript transform (`packages/datamine/transform/`)

4. **New `enemies.ts`**:
   - `mergeEnemies(entities, enemiesData)` — adds/updates the two `kind:"enemy"`
     Entity rows with `enemyStats`. New entities (not in baseline) are added; the
     lossless-merge slug guard still applies (first landing may need
     `--allow-slug-changes`, matching the icon-gate precedent).
   - `buildEnemyLootLinks(enemiesData)` → `EntityLink[]` with `role:"loot"`.
   - `applyEnemyLoot(links, enemyLinks)` — full-overwrite of loot links whose
     `sourceSlug` is an enemy slug; leaves all other links intact.

5. **Wire into `transform/run.ts`**: load `sek-out/enemies.json`, call
   `mergeEnemies` before emit, merge enemy loot links, and keep the existing
   "drop loot links pointing at unknown slugs" guard.

6. **Reports:** existing `reportDanglingRefs` / images report updated so null enemy
   icons are by-design (not flagged for extraction). Optional
   `reports/missing-enemies.json` for baseline enemies the datamine can't
   reproduce (likely empty at first).

### Stage C — Wiki UI (`apps/wiki`) — Phase 2

7. The shared `EntityDetail` shell gets an `enemy` branch: a type badge, an
   HP-by-variant table, and the existing loot-table component (already renders
   `role:"loot"` links; loot rows are grouped/tagged by `tier` = variant label).
8. Nav / listing gains an **"Enemies"** category surfacing the two pages.

This is the visible half of "full wiki pages" and runs **after Phase 1 data is
merged and verified**.

### Rejected alternative

Un-excluding `mob-drops` from `container_loot.json` and modeling enemies as
loot-containers (`kind:"environment"`). Simpler, but forces enemies into the wrong
kind and leaves no place for HP / type. Rejected.

## Phasing

- **Phase 1 — Data:** Stages A + B. Enemy entities, `enemyStats`, and loot links
  land in `packages/data/generated/{entities,links}.json`. Verified via the
  transform reports and by inspecting the generated JSON.
- **Phase 2 — UI:** Stage C. Enemy pages render in the wiki.

## Testing

- **Python:** unit-test `build_enemies.py`'s join + naming-convention grouping on a
  small fixture (a couple of `mobLoot_*` / `ironcladLoot_*` tables + stub
  `enemy_stats.json`), asserting variant grouping, HP, and loot slug resolution.
- **TypeScript:** `enemies.test.ts` covering `mergeEnemies` (new-entity add,
  `enemyStats` shape, slug stability) and `buildEnemyLootLinks` /
  `applyEnemyLoot` (correct roles, full-overwrite scoping, unknown-slug drop),
  mirroring `loot.test.ts`.
- **End-to-end:** run the transform; assert the two enemy entities exist with the
  expected variant HP and non-empty loot, and that item pages backlink to them.

## Known risks

- **Ironclad loot-variant labels:** the `build_loot_sources.py` stage already
  collapses the caliber tables (40/70/80mm + packed-turret) into a single merged
  "Ironclad Loot Box" pool, so per-caliber (let alone per-hull
  Buckler/Falchion/Tophelm) attribution is not available downstream. Ironclad loot
  is therefore shown as one merged group (labeled "Cargo", overridable via
  `enemy-overrides.json`) plus a "Guaranteed" group for the mandatory Alloy Steel —
  not a false per-hull mapping. Ironclad HP variants (Buckler 5000 / Falchion 4000 /
  Tophelm 4000) still appear per-hull in the stats table (HP comes from the EPBs
  directly, independent of loot).
- **Name-key mismatch:** loc stem `game_ghoulNavAgent_name` vs EPB `mob_ghoul`; the
  EPB `NiceNameDataComponent` is the bridge, with an override fallback.
- **First-landing slug guard:** the new enemy slugs are *additions only* (nothing is
  removed), so the run.ts slug-removal guard is not tripped — unlike the icon-gate
  change, the first landing needs **no** `--allow-slug-changes`.
- **No `dump.cs`:** class/field names were recovered from
  `global-metadata.dat` strings + live Odin decoding; field names used in the
  extractor should be re-verified against a live decode when implementing.
