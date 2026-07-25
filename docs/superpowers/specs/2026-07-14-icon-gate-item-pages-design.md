# Icon-presence gate for datamined item pages

**Date:** 2026-07-14
**Status:** Approved — ready for implementation plan
**Area:** `packages/datamine/transform` (ID-based per-patch transform)

## Problem

The last datamine (build 2026-07-10, commit `3f81a82`) over-minted item pages. Enumeration
now unions the full `item_defs` ItemDatabase into the item set, which surfaced **63 item-kind
entities with a null icon** that are not player-facing:

- **Internal / junk:** 26 `note*` pickups, `debug-resource-box-{1,2}`, `autopistol-test`,
  `box`, `ammo-crate`, `crystal-crate`, 5 `game-keyislanddoor*`, ~13 `game-packed*turret*container`,
  duplicate `ironclad-s-cargo-box`, `-decommissioned` armor variants, `-2` name-drift dupes.
- **Real but not yet released:** `40/70/80-mm` shells, `70-mm-canister-shots`,
  `90-mm-grapple-harpoon`, `spark-contact-emp-grenade`, unstable/impure energy rods,
  large/small backpacks.

All 63 shipped **live** (`disabled: false`) in the committed 448-entity artifact
(`packages/data/generated/entities.json`), so they render on the wiki.

## The rule

**An entity with `kind === "item"` and a null `icon` is not emitted as a wiki page.**

Item icons come from sprite-match against shipped game art, so *no extractable sprite = not
released / not shippable in game*. Icon-presence is the measurable proxy for the intended
criterion, "available in game."

### Why one rule handles both cleanup and prevention

The transform's baseline **is the previous committed artifact** (`baseline.ts` loads
`packages/data/generated/`). The 63 junk pages are therefore already baked into baseline and
would reconcile as `matched` on the next run — a gate scoped to `new` mints alone would not
evict them. Applying the rule to the **full merged item set** instead:

1. removes the 63 already-shipped pages, **and**
2. blocks future no-icon mints, **and**
3. is **self-healing** — when any of these items ships with a real icon in a future build, it
   reappears automatically as a normal item page (it will have a non-null icon, so the prune
   no longer drops it).

### Scope guard

Strictly `kind === "item"`. `tech-node`, `environment`, and `trampler-part` entities
legitimately have null icons (rendered by design / thumbnail pending) and are **not** touched.
Confirmed against the current artifact: the only null-icon populations are 63 items,
2 trampler-parts (kept), and the by-design tech-node/environment sets (kept).

## Placement

- New pure function `pruneIconlessItems(entities: Entity[]): Entity[]` in
  `transform/items.ts`.
- Called in `run.ts` **after** `applyIconOverrides` / `applyEntityOverrides` (so an
  `overrides/icon-map.json` entry can rescue an item before the prune) and **before**
  diff / validate / `knownSlugs` computation.
- `knownSlugs` (used by the loot dangling-link filter) is computed from the **pruned** set,
  so any future loot link into a pruned item is dropped correctly. (No-op today: verified 0
  links target these slugs, 0 links source from them, 0 of 41 recipes reference them — the
  prune has zero collateral on links/recipes.)

## Fallout

None. Verified against the current artifact:
- links with a to-be-dropped `targetSlug`: **0**
- links with a to-be-dropped `sourceSlug`: **0**
- recipes referencing a to-be-dropped slug: **0 / 41**

## Execution

1. Implement `pruneIconlessItems` + wire into `run.ts`.
2. Run `npx tsx packages/datamine/transform/run.ts --allow-slug-changes` (the run drops 63,
   which trips the existing "REFUSING: N slugs removed" guard without the flag).
3. Review the printed removed list (expect the 63 above, no legit items).
4. Commit the regenerated `packages/data/generated/entities.json`. `links.json` and
   `recipes.json` are unchanged. The `reports/missing-images.json` `item:null` count drops
   ~63 → 0, restoring the report's usefulness.

## Escape hatch

If a genuinely-released item ever lacks a game sprite, add its icon via the existing
`overrides/icon-map.json` (applied before the prune). No new mechanism required. A junk item
that *has* an icon (not the current case — "most don't have icons") is still handled by the
existing `overrides/exclusions.json` / `entity-overrides.json` (disabled) mechanisms.

## Testing

Unit test for `pruneIconlessItems` (`items.test.ts` or a new `items.test.ts` case):
- drops a null-icon `kind: "item"` entity,
- keeps an item with a non-null icon,
- keeps null-icon `tech-node`, `environment`, and `trampler-part` entities.

Existing transform test suite stays green; the merge/reconcile tests are unaffected (the
prune is a final, additive step).
