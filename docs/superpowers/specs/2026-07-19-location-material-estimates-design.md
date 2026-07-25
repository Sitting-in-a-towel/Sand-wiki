# Location Material Estimates — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan

## Goal

Give players a rough, comparable estimate of how much of each key material
(coins, metal parts, coral, etc.) they can expect to loot at each landmark, so
they can decide where to head for what they need.

Two surfaces:

1. **Per-location "Estimated haul"** card on each landmark detail page.
2. **A cross-location comparison page** (`/loot`) — a sortable matrix that
   answers "where do I go for X?".

## Non-goals

- Exact/guaranteed loot amounts. These are rough estimates; hauls vary per run.
- Client-side voyage/storm toggling or per-tier interactivity (deferred).
- Changing the existing loot-tier tabs or container detail pages.
- Coverage of non-landmark environments (creatures, game-modes).

## Architecture — Approach A (precompute in datamine → static JSON)

All estimation math lives in the datamine transform pipeline. The wiki renders
read-only static data. This matches the repo's existing flow
(datamine → static JSON in `@sandlabs/data` → wiki) and adds zero runtime
compute.

### Inputs (all already produced by the datamine)

- `packages/datamine/sek-out/location_contents.json` — per-location counts of
  crates, coin spawners, lockboxes, treasures, and item spawners. Currently
  **not** wired into the wiki.
- `packages/datamine/sek-out/container_loot.json` — per-container, per-tier
  expected yield of each item (`chance`, `voyage` range, `storm` range,
  `stormBonus`).
- `packages/datamine/sek-out/lockbox_loot.json` — per-lockbox expected yield
  (`chance`, `count` range).

### Output

New file `packages/data/generated/location_estimates.json`, exposed via
`@sandlabs/data`. Sketch:

```json
{
  "kaiserplatz": {
    "resources": { "coins": 1200, "metal-parts": 65, "coral-piece": 15 },
    "stormMultiplier": { "coral-piece": 1.36 },
    "crates": [
      { "name": "Parts Crate", "count": 6 },
      { "name": "Valuables Crate", "count": 2 },
      { "name": "lockbox", "count": 10 }
    ],
    "hasCombatSupplies": true
  }
}
```

Keys are entity slugs (only real, enabled landmark entities).

### Computation (per location, per headline resource)

- **Coins** — near-exact:
  `Σ (coincrown_N.count × N) + (coincrownpile_N.count × N)`.
- **Crate-sourced resources** — for each crate spawner
  (`lootboxes{type}_{effort}[_m]`) and each named crate in `crates`:
  1. Map to a `container_loot` container key.
  2. Map effort → container tier.
  3. `expected_yield(resource) = chance × avg(voyage range)`.
  4. Multiply by the spawner count; sum across all crates at the location.
- **Lockbox-sourced resources** — same, from `lockbox_loot`, over
  `alarmlockbox{color}` spawners.
- **Storm multiplier** — store the yield-weighted `stormBonus` per resource so
  the UI can flag "↑ more in storms" without recomputing.

Numbers are rounded to "nice" values at render time and prefixed with `~`.

### Mappings to resolve in the implementation plan

- **Spawner / crate-name → container key:**
  - `lootboxesweapons_* → weapon-crate`
  - `lootboxesparts_*   → parts-crate`
  - `lootboxesfood_*    → food-crate`
  - `lootboxesmedical_* → medical-cabinet`
  - `lootboxesvaluables_* → valuables-safe`
  - `lootboxesshells_*  → crate-of-shells`
  - named `"Valuables Crate" → valuables-safe`, etc.
- **Effort → tier:** `loweffort → lowest tier`, `mideffort → middle`,
  `higheffort → highest`; clamp when a container has fewer tiers. Verify against
  the actual tier counts in `container_loot.json` during implementation.
- **`_m` suffix:** determine whether it changes yield/tier; default to treating
  it as the same container/tier as the non-`_m` id until proven otherwise.
- **Unmapped spawners** (e.g. `containerbox`, `energyrod`, `armor`): do not
  contribute to headline numbers; if present, set `hasCombatSupplies: true`.
- **Location key → entity slug:** reuse/extend the mapping already used by
  `build_location_loot.py` (`transform/overrides/location-loot-overrides.json`).
  Skip test/disabled roots (`testIslandSet`, `Factorio`,
  `POIUndergroundRoomTurretAmmo`, etc.) and anything not resolving to an enabled
  landmark entity.

## Headline resource set

A shared constant `HEADLINE_RESOURCES` (used by both the per-location card and
the comparison columns):

Coins, Metal Parts, Weapon Parts, Coral Piece, Coral Dust, Metal T1, Metal T2,
Metal T3, Alloy Steel, Gunpowder, Fabric, Optic Lenses.

Everything else (ammo, guns, food, med kits) collapses into a
`+ combat supplies` note rather than its own number.

## UI — Per-location "Estimated haul" (layout B)

On `/environment/[slug]` when `category === "landmarks"` and an estimate exists:

- A new **"Estimated haul"** card containing:
  - Headline number **tiles** (one per non-zero headline resource), coins
    accented gold.
  - A row of **crate-count chips** (`6× Parts Crate`, `10× lockboxes`, …).
  - A **storm flag** ("↑ more in storms").
- Does not alter the existing loot-tier tabs.
- Omitted entirely for landmarks without an estimate.

## UI — Comparison page `/loot` (layout A)

- New route `/loot`, added to site nav.
- A **full sortable matrix**:
  - Rows = landmarks with estimates.
  - Columns = headline resources + lockbox count.
  - Click a column header to sort (client component for sort state).
  - Max value per column highlighted (gold).
- Reads the same `location_estimates.json`.

## Honesty / disclaimer

Both surfaces carry a short note:

> Rough estimates from datamined spawn tables — actual hauls vary per run and
> increase in storms.

## Testing

- **Pipeline unit checks:** coin math on a known location (Kaiserplatz coins),
  crate → yield multiplication on a single mapped crate, storm-multiplier
  derivation, and slug-mapping/skip behavior for test roots.
- **Data snapshot:** `location_estimates.json` regenerates deterministically and
  covers only enabled landmark entities.
- **UI:** per-location card renders from a fixture; comparison table sorts
  correctly and highlights per-column max; both hide gracefully when data is
  absent.

## Files (anticipated)

- `packages/datamine/scripts/build_location_estimates.py` (or a TS transform
  step) — the join/compute.
- `packages/datamine/transform/run.ts` — wire the new step in.
- `packages/data/generated/location_estimates.json` — output.
- `packages/data/src/` — export the new dataset + types.
- `apps/wiki/src/lib/loot-estimates.ts` — `HEADLINE_RESOURCES`, loaders,
  rounding helpers.
- `apps/wiki/src/components/EstimatedHaul.tsx` — per-location card.
- `apps/wiki/src/app/environment/[slug]/page.tsx` — mount the card.
- `apps/wiki/src/app/loot/page.tsx` — comparison matrix.
- Nav config — add `/loot`.
