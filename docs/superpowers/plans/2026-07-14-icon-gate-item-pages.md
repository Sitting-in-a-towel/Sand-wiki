# Icon-Presence Gate for Item Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the datamine transform from emitting `kind: "item"` wiki pages that have no icon (no shippable game sprite = not available in game), removing the 63 junk/unreleased pages the last `item_defs` union over-minted and preventing future ones.

**Architecture:** Add one pure function `pruneIconlessItems(entities)` in `transform/items.ts` and call it in `run.ts` after icon/entity overrides and before diff/validate. Because the transform's baseline is the previous committed artifact, this single prune on the full merged set both evicts the already-shipped 63 and blocks future no-icon mints; it is self-healing (an item reappears once it ships with a real icon). Only `kind: "item"` is affected — `tech-node`/`environment`/`trampler-part` keep their by-design null icons.

**Tech Stack:** TypeScript, tsx (Node), Vitest. Spec: `docs/superpowers/specs/2026-07-14-icon-gate-item-pages-design.md`.

---

### Task 1: `pruneIconlessItems` function (TDD)

**Files:**
- Modify: `packages/datamine/transform/items.ts`
- Test: `packages/datamine/transform/items.test.ts`

- [ ] **Step 1: Write the failing test**

Append this test case inside the existing `describe("items transform", () => { ... })` block in `packages/datamine/transform/items.test.ts` (before the closing `});` on line 80). It reuses the same inline `Entity` factory shape used by the existing `applyIconOverrides`/`applyEntityOverrides` tests:

```typescript
  it("pruneIconlessItems drops only null-icon item entities, keeps everything else", () => {
    const ent = (slug: string, kind: Entity["kind"], icon: string | null): Entity => ({
      id: slug, slug, kind, name: slug, description: null, category: "misc",
      rarity: null, icon, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const out = pruneIconlessItems([
      ent("note", "item", null),              // dropped: item, no icon
      ent("box", "item", null),               // dropped: item, no icon
      ent("iron-ingot", "item", "/icons/iron.png"), // kept: item with icon
      ent("captain-module", "trampler-part", null), // kept: part, null by design
      ent("tier-1-armor", "tech-node", null),       // kept: tech-node, null by design
      ent("scrapyard", "environment", null),        // kept: environment, null by design
    ]);
    expect(out.map((e) => e.slug)).toEqual([
      "iron-ingot", "captain-module", "tier-1-armor", "scrapyard",
    ]);
  });
```

Also add `pruneIconlessItems` to the import on line 2 of `items.test.ts`:

```typescript
import { sekItemPatch, newItemEntity, applyIconOverrides, applyEntityOverrides, pruneIconlessItems } from "./items";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/datamine && npx vitest run transform/items.test.ts -t "pruneIconlessItems"`
Expected: FAIL — `pruneIconlessItems is not a function` (or an import/type error).

- [ ] **Step 3: Write minimal implementation**

Append this function to the end of `packages/datamine/transform/items.ts` (after `newItemEntity`):

```typescript
/** Drop item-kind entities that have no icon. Item icons come from sprite-match against
 *  shipped game art, so a null icon means the item has no in-game sprite yet — i.e. it is
 *  not released / not player-facing (internal notes, debug/test boxes, packed-turret
 *  containers, and genuinely-unreleased items). Scoped strictly to kind "item":
 *  tech-node / environment / trampler-part legitimately have null icons and are kept.
 *  Because the transform baseline is the previous artifact, this both evicts already-shipped
 *  no-icon pages and blocks new ones; an item reappears automatically once it ships with a
 *  real icon. To rescue a released item that lacks a sprite, add it to overrides/icon-map.json
 *  (applied before this prune). */
export function pruneIconlessItems(entities: Entity[]): Entity[] {
  return entities.filter((e) => e.kind !== "item" || !!e.icon);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/datamine && npx vitest run transform/items.test.ts`
Expected: PASS — all `items transform` tests green, including the new case.

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/items.ts packages/datamine/transform/items.test.ts
git commit -m "feat(datamine): pruneIconlessItems — drop null-icon item entities"
```

---

### Task 2: Wire the prune into the transform run

**Files:**
- Modify: `packages/datamine/transform/run.ts` (import line 13; entity assembly around line 63; `knownSlugs` line 89)

- [ ] **Step 1: Add `pruneIconlessItems` to the items import**

In `packages/datamine/transform/run.ts`, line 13 currently reads:

```typescript
import { applyIconOverrides, applyEntityOverrides, type EntityOverride } from "./items";
```

Change it to:

```typescript
import { applyIconOverrides, applyEntityOverrides, pruneIconlessItems, type EntityOverride } from "./items";
```

- [ ] **Step 2: Apply the prune after overrides**

In `run.ts`, lines 62-63 currently read:

```typescript
// Force corrected icons last (fixes stale/wrong paths in the source data).
const entities = applyEntityOverrides(applyIconOverrides(merged.entities, iconMap), entityOverrides);
```

Change to (add the prune as a final step, and log how many were dropped):

```typescript
// Force corrected icons last (fixes stale/wrong paths in the source data).
const withOverrides = applyEntityOverrides(applyIconOverrides(merged.entities, iconMap), entityOverrides);
// Item pages require an icon: an item with no shippable sprite is not available in-game
// (internal notes/debug boxes/packed-turret containers, and not-yet-released items). Non-item
// kinds (tech-node/environment/trampler-part) keep their by-design null icons. Applied after
// icon-map so an override can rescue an item before the prune.
const entities = pruneIconlessItems(withOverrides);
const prunedCount = withOverrides.length - entities.length;
console.log(`icon gate: dropped ${prunedCount} icon-less item page(s)`);
```

Note: `knownSlugs` on line 89 is derived from `withCombat` (which flows from `entities` through
the trampler + combat merges, both of which preserve the entity set), so it already reflects the
pruned set — no change needed there. The existing loot dangling-link filter will drop any link
into a pruned slug (none today).

- [ ] **Step 3: Run the transform to verify it drops the 63 (guard trips as expected)**

Run: `cd packages/datamine && npx tsx transform/run.ts`
Expected: prints `icon gate: dropped 63 icon-less item page(s)`, then exits non-zero with
`REFUSING: 63 existing slug(s) would be removed: ...` (the removal guard fires without the flag —
this is correct; it forces a human to review removals).

- [ ] **Step 4: Run WITH the slug-change flag and review the removed list**

Run: `cd packages/datamine && npx tsx transform/run.ts --allow-slug-changes`
Expected: completes; the removed list contains the 63 junk/unreleased slugs (26 `note*`,
`debug-resource-box-*`, `autopistol-test`, `box`, `ammo-crate`, `crystal-crate`,
`game-keyislanddoor*`, `game-packed*turret*container`, shells/harpoon/emp-grenade/energy-rods,
backpacks, `-decommissioned` armor, `-2` dupes) and **no** legit item. It rewrites
`packages/data/generated/{entities,recipes,links}.json` and the reports.

Verify with:

```bash
cd packages/data && node -e "const e=require('./generated/entities.json'); const i=e.filter(x=>x.kind==='item'); console.log('items:', i.length, '| null-icon items:', i.filter(x=>!x.icon).length)"
```

Expected: `null-icon items: 0` and item count reduced by 63 (206 → 143).

- [ ] **Step 5: Confirm links/recipes unchanged and image report cleaned**

```bash
cd d:/Documents/SandLabs && git diff --stat packages/data/generated/links.json packages/data/generated/recipes.json
```

Expected: no changes to `links.json` / `recipes.json` (verified: 0 references to dropped slugs).
`packages/datamine/reports/missing-images.json` `summary["item:null"]` should now be `0` (or
absent); `trampler-part:null` and the by-design tech-node/environment counts remain.

- [ ] **Step 6: Full transform test suite green**

Run: `cd packages/datamine && npx vitest run`
Expected: PASS — all suites (reconcile/merge/diff/loot/etc.) still green.

- [ ] **Step 7: Commit code + regenerated artifact together**

```bash
git add packages/datamine/transform/run.ts packages/data/generated/entities.json packages/datamine/reports/missing-images.json
git commit -m "feat(datamine): gate item pages on icon presence; drop 63 no-icon items

Wire pruneIconlessItems into the transform run and regenerate the
artifact. Removes 63 junk/unreleased item pages (notes, debug/test
boxes, key-island-door ids, packed-turret containers, unreleased
shells/rods/grenades) the last item_defs union over-minted. Self-
healing: items reappear once they ship with a real icon. links.json
and recipes.json unchanged (no references)."
```

---

### Task 3: Verify the wiki renders without the dropped pages

**Files:** none (verification only)

- [ ] **Step 1: Build the data package + wiki to confirm the artifact is valid**

Run: `cd d:/Documents/SandLabs && npm run build --workspace @sandlabs/data`
Expected: PASS (the data package re-reads the regenerated JSON; no schema/validation errors).

- [ ] **Step 2: Confirm a sample dropped slug 404s and a kept item still resolves**

Use the `/run` skill (or `npm run dev --workspace apps/wiki`) to load the wiki, then check:
- `/items/note` (or the item route pattern used in `apps/wiki`) → not found / 404.
- `/items/iron-ingot` (a kept, icon'd item) → renders normally.

Expected: dropped slugs are gone from item lists and detail routes; kept items unaffected.
If a route pattern is unclear, grep `apps/wiki` for the item detail page and item-list source.

---

## Notes for the executor

- **`kind` values** in this repo's unified Entity model: `item`, `trampler-part`, `tech-node`,
  `environment` (see `packages/data/src/types.ts`). The prune keys only on `"item"`.
- **Why `--allow-slug-changes` is needed once:** `run.ts` refuses runs that remove existing
  slugs unless the flag is passed (guards against accidental mass-deletion). The 63 removals are
  intentional, so the flag is correct here. Future builds will not remove anything (the 63 are
  gone from baseline), so the flag is not needed going forward unless real slugs change.
- **Escape hatch:** a genuinely-released item with no game sprite → add its icon to
  `packages/datamine/transform/overrides/icon-map.json` (applied before the prune). A junk item
  that *does* have an icon → `overrides/exclusions.json` (by SEK id) or `overrides/entity-overrides.json`
  (`disabled: true`).
- **PROD DB / deployment:** per repo memory the wiki now ships static `@sandlabs/data` (no
  seed), so committing the regenerated `entities.json` is the deploy path. Do NOT run any
  `db:seed`/`db:reset` against the live DB.
