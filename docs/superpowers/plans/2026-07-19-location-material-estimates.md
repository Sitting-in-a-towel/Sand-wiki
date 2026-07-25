# Location Material Estimates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show players a rough, comparable estimate of the key materials (coins, metal parts, coral, etc.) they can loot at each landmark, via an "Estimated haul" card on landmark pages and a sortable `/loot` comparison matrix.

**Architecture:** A new datamine build step (`transform/estimates-run.ts`) joins the already-produced `sek-out/location_contents.json` (per-location crate/coin/lockbox counts) with `sek-out/container_loot.json` and `sek-out/lockbox_loot.json` (per-container expected yield) into a new static file `packages/data/generated/location_estimates.json`, keyed by entity slug. The wiki imports it via `@sandlabs/data` and renders it read-only — no runtime compute.

**Tech Stack:** TypeScript, `tsx` runner, `vitest` (both `packages/datamine` and `apps/wiki` use `vitest run`), Next.js (App Router — **modified fork**, see note), React server + client components.

> ⚠️ **Modified Next.js:** `apps/wiki` runs a forked Next.js with breaking changes (`apps/wiki/AGENTS.md`). Before writing any page/route code (Tasks 8–9), read the relevant guide under `apps/wiki/node_modules/next/dist/docs/`.

---

## Data shapes (reference — already verified in the repo)

**`sek-out/location_contents.json`** — keyed by internal location id:
```json
"Kaiserplatz": {
  "benches": 0,
  "crates": { "Valuables Crate": 2 },
  "treasures": { "Buried Treasure": 7, "Artefact": 5 },
  "mobs": 17, "locked": 10,
  "items": {
    "lootboxesparts_mideffort": 6, "lootboxesvaluables_higheffort_m": 7,
    "coincrown_5": 10, "coincrownpile_25": 2,
    "alarmlockboxyellow": 1, "containerbox": 45, "energyrod": 5
  }
}
```

**`sek-out/container_loot.json`** — `{ meta, containers }`; each container has tiers `Tier 1|2|3` (except `suspicious-pile-of-sand`: 1–2, `ironclad-loot-box`: `Drops`):
```json
"parts-crate": { "name":"Parts Crate", "tiers":[
  { "tier":"Tier 1", "rollSets":4, "loot":[
    { "slug":"resource-metal-parts", "name":"Resource Metal Parts",
      "chance":100.0, "voyage":"15-40", "storm":"20-55" } ] } ] }
```
Loaded by `loadContainerLoot()` in `transform/sek.ts` → `ContainerLoot = Record<string, Container>`; types `Container/LootTier/LootEntry` are exported there.

**`sek-out/lockbox_loot.json`** — `{ meta, crates: LockboxCrate[] }`; each crate has `slug`, `name`, `loot:[{slug,name,chance,count,tier}]` (`count` like `"20-60"` or `"200"`). Types in `transform/lockbox.ts` (`LockboxData`).

**Verified headline resource slugs:** `coin-crown`, `resource-metal-parts`, `resource-weapon-parts`, `resource-coral-piece`, `resource-coral-dust`, `resource-metal-t1`, `resource-metal-t2`, `resource-metal-t3`, `resource-alloy-steel`, `resource-gunpowder`, `resource-fabric`, `resource-optic-lenses`.

**Verified auto-matches (location id → landmark entity slug):** `Kaiserplatz→kaiserplatz`, `Dreadnought→dreadnaught`, `Venedig→venedig`, `StufenInsel→stufeninsel`, `MeereSauge_FishingVillage→meeresauge`, `Factorio→factorio` (factorio entity is disabled — will be filtered out by the enabled-entity check).

---

## File Structure

**Datamine (compute):**
- Create `packages/datamine/transform/overrides/location-estimate-map.json` — location id → slug overrides + skip list.
- Create `packages/datamine/transform/location-estimates.ts` — pure compute functions + types.
- Create `packages/datamine/transform/location-estimates.test.ts` — unit tests.
- Create `packages/datamine/transform/estimates-run.ts` — IO runner → writes `packages/data/generated/location_estimates.json`.
- Modify `packages/datamine/package.json` — add `"estimates"` script.

**Data package (exposure):**
- Create `packages/data/generated/location_estimates.json` — generated output (committed).
- Modify `packages/data/src/types.ts` — add `LocationEstimate` / `LocationEstimates`.
- Modify `packages/data/src/index.ts` — import JSON, export `getLocationEstimate` + `listLocationEstimates`.

**Wiki (render):**
- Create `apps/wiki/src/lib/loot-estimates.ts` — `HEADLINE_RESOURCES`, `formatAmount`, re-exports.
- Create `apps/wiki/src/lib/loot-estimates.test.ts` — formatting tests.
- Create `apps/wiki/src/components/EstimatedHaul.tsx` — per-location card (layout B).
- Modify `apps/wiki/src/app/environment/[slug]/page.tsx` — mount the card for landmarks.
- Create `apps/wiki/src/components/LootComparisonTable.tsx` — client, sortable matrix (layout A).
- Create `apps/wiki/src/app/loot/page.tsx` — comparison page (server) wrapping the table.
- Modify `apps/wiki/src/lib/taxonomy.ts` — add the `loot` nav section.
- Modify `apps/wiki/src/components/SectionIcon.tsx` — add a `loot` icon case.

---

## Compute algorithm (locked decisions)

Per location, produce headline-resource totals from three sources:

1. **Coins** — from `items` spawner ids matching `/^coincrown(?:pile)?_(\d+)$/`: each contributes `N × count` coins. Plus `coin-crown` yielded by crates (source 2).
2. **Crate resources** — for each crate:
   - `items` ids matching `/^lootboxes([a-z]+)_(low|mid|high)effort(_m)?$/` → `type` (weapons/parts/food/medical/valuables/shells), `effort` → container tier index (`low→0, mid→1, high→2`, clamped to the container's tier count). The `_m` suffix is treated as the same container/tier (no separate table exists).
   - named `crates` (physical): map label → container key, using **mid tier** (index 1, clamped) since physical crates carry no effort.
   - Per crate, `expectedYield(resource) = rollSets × (chance/100) × avg(range)` for each headline resource in that tier's loot; multiply by the crate's count and accumulate.
3. **Lockbox resources** — `items` ids matching `/^alarmlockbox(yellow|green|black)$/` map to lockbox slugs (`yellow→military-box`, `green→valuables-box`, `black→utility-box`); `expectedYield = (chance/100) × avg(count)` per headline resource, × count.

**Storm multiplier** (per resource): accumulate a parallel storm total using each crate entry's `storm` range (lockboxes have no storm variant → storm = voyage). Store `stormMultiplier[res] = round2(stormTotal / voyageTotal)` where `voyageTotal > 0`.

**Container-key maps:**
```
type → container:   weapons→weapon-crate, parts→parts-crate, food→food-crate,
                    medical→medical-cabinet, valuables→valuables-safe, shells→crate-of-shells
cratelabel → container: "Weapons Crate"→weapon-crate, "Food Crate"→food-crate,
                    "Resource Crate"→parts-crate, "Shell Crate"→crate-of-shells,
                    "Med Crate"→medical-cabinet, "Valuables Crate"→valuables-safe
lockbox color → slug: yellow→military-box, green→valuables-box, black→utility-box
```

**`hasCombatSupplies`** — true if any crate is a weapon-crate/crate-of-shells or any lockbox present (these carry ammo/guns not shown as headline numbers).

**`minimalLoot`** — true when the location matched an entity but its computed headline totals are all zero AND it has ≤1 total item spawner (the fort case: `crates=0, items=1`). Renders an honest note instead of an empty card.

**Crate summary (`crates` array for chips):** aggregate human-readable counts: each mapped crate type totalled (e.g. `{name:"Parts Crate", count:6}`), plus `{name:"lockbox", count:<sum>}`, plus coin-pile count `{name:"coin piles", count:<sum of coin spawner counts>}`, plus treasures passed through by label. Sorted by count descending.

**Rounding** happens at render time, not in the data — the JSON stores full-precision numbers.

---

### Task 1: Location→slug override map

**Files:**
- Create: `packages/datamine/transform/overrides/location-estimate-map.json`

- [ ] **Step 1: Write the map file**

```json
{
  "_doc": "Maps sek-out/location_contents.json keys (internal location ids) to wiki landmark entity slugs for build-location-estimates. `map` overrides/augments the auto-slugify match. `skip` drops non-shippable roots. Only locations resolving to an ENABLED landmark entity get an estimate; add entries here as pages are matched.",
  "map": {
    "Kaiserplatz": "kaiserplatz",
    "Dreadnought": "dreadnaught",
    "Venedig": "venedig",
    "StufenInsel": "stufeninsel",
    "MeereSauge_FishingVillage": "meeresauge"
  },
  "skip": ["testIslandSet", "POIUndergroundRoomTurretAmmo"]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/datamine/transform/overrides/location-estimate-map.json
git commit -m "feat(datamine): location->slug map for material estimates"
```

---

### Task 2: Range parsing + expected-yield helpers (pure)

**Files:**
- Create: `packages/datamine/transform/location-estimates.ts`
- Test: `packages/datamine/transform/location-estimates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/datamine/transform/location-estimates.test.ts
import { describe, it, expect } from "vitest";
import { avgRange, tierForEffort } from "./location-estimates";

describe("avgRange", () => {
  it("averages a hyphen range", () => expect(avgRange("15-40")).toBe(27.5));
  it("parses a single value", () => expect(avgRange("200")).toBe(200));
  it("returns 0 for null/empty", () => {
    expect(avgRange(null)).toBe(0);
    expect(avgRange("")).toBe(0);
  });
});

describe("tierForEffort", () => {
  it("maps effort words to a clamped tier index", () => {
    expect(tierForEffort("low", 3)).toBe(0);
    expect(tierForEffort("mid", 3)).toBe(1);
    expect(tierForEffort("high", 3)).toBe(2);
    expect(tierForEffort("high", 2)).toBe(1); // clamp to fewer tiers
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/datamine && npx vitest run transform/location-estimates.test.ts`
Expected: FAIL — "Cannot find module './location-estimates'".

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/datamine/transform/location-estimates.ts
/** Average of a datamined qty range string ("15-40" -> 27.5, "200" -> 200, null -> 0). */
export function avgRange(range: string | null | undefined): number {
  if (!range) return 0;
  const parts = range.split("-").map((p) => Number(p.trim())).filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return 0;
  if (parts.length === 1) return parts[0];
  return (parts[0] + parts[1]) / 2;
}

/** Effort word -> 0-based tier index, clamped to the container's tier count. */
export function tierForEffort(effort: "low" | "mid" | "high", tierCount: number): number {
  const idx = { low: 0, mid: 1, high: 2 }[effort];
  return Math.min(idx, Math.max(0, tierCount - 1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/datamine && npx vitest run transform/location-estimates.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/location-estimates.ts packages/datamine/transform/location-estimates.test.ts
git commit -m "feat(datamine): range + effort->tier helpers for estimates"
```

---

### Task 3: Types + spawner classifier (pure)

**Files:**
- Modify: `packages/datamine/transform/location-estimates.ts`
- Test: `packages/datamine/transform/location-estimates.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { classifySpawner } from "./location-estimates";

describe("classifySpawner", () => {
  it("parses coin spawners", () => {
    expect(classifySpawner("coincrown_5")).toEqual({ kind: "coin", coins: 5 });
    expect(classifySpawner("coincrownpile_25")).toEqual({ kind: "coin", coins: 25 });
  });
  it("parses crate spawners with effort and _m suffix", () => {
    expect(classifySpawner("lootboxesparts_mideffort")).toEqual({ kind: "crate", container: "parts-crate", effort: "mid" });
    expect(classifySpawner("lootboxesvaluables_higheffort_m")).toEqual({ kind: "crate", container: "valuables-safe", effort: "high" });
  });
  it("parses lockbox spawners", () => {
    expect(classifySpawner("alarmlockboxyellow")).toEqual({ kind: "lockbox", container: "military-box" });
  });
  it("returns other for unknown spawners", () => {
    expect(classifySpawner("containerbox")).toEqual({ kind: "other" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/datamine && npx vitest run transform/location-estimates.test.ts`
Expected: FAIL — "classifySpawner is not a function".

- [ ] **Step 3: Write minimal implementation (append to `location-estimates.ts`)**

```ts
export interface LocationEstimate {
  slug: string;
  name: string;
  resources: Record<string, number>;
  stormMultiplier: Record<string, number>;
  crates: { name: string; count: number }[];
  hasCombatSupplies: boolean;
  minimalLoot: boolean;
}
export type LocationEstimates = Record<string, LocationEstimate>;

const TYPE_CONTAINER: Record<string, string> = {
  weapons: "weapon-crate", parts: "parts-crate", food: "food-crate",
  medical: "medical-cabinet", valuables: "valuables-safe", shells: "crate-of-shells",
};
const LOCKBOX_COLOR: Record<string, string> = {
  yellow: "military-box", green: "valuables-box", black: "utility-box",
};
export const CRATE_LABEL_CONTAINER: Record<string, string> = {
  "Weapons Crate": "weapon-crate", "Food Crate": "food-crate", "Resource Crate": "parts-crate",
  "Shell Crate": "crate-of-shells", "Med Crate": "medical-cabinet", "Valuables Crate": "valuables-safe",
};

export type Spawner =
  | { kind: "coin"; coins: number }
  | { kind: "crate"; container: string; effort: "low" | "mid" | "high" }
  | { kind: "lockbox"; container: string }
  | { kind: "other" };

/** Classify a location_contents `items` spawner id. */
export function classifySpawner(id: string): Spawner {
  const coin = /^coincrown(?:pile)?_(\d+)$/.exec(id);
  if (coin) return { kind: "coin", coins: Number(coin[1]) };

  const crate = /^lootboxes([a-z]+)_(low|mid|high)effort(?:_m)?$/.exec(id);
  if (crate && TYPE_CONTAINER[crate[1]]) {
    return { kind: "crate", container: TYPE_CONTAINER[crate[1]], effort: crate[2] as "low" | "mid" | "high" };
  }

  const lock = /^alarmlockbox(yellow|green|black)$/.exec(id);
  if (lock) return { kind: "lockbox", container: LOCKBOX_COLOR[lock[1]] };

  return { kind: "other" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/datamine && npx vitest run transform/location-estimates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/location-estimates.ts packages/datamine/transform/location-estimates.test.ts
git commit -m "feat(datamine): estimate types + spawner classifier"
```

---

### Task 4: Per-location estimate computation (pure)

**Files:**
- Modify: `packages/datamine/transform/location-estimates.ts`
- Test: `packages/datamine/transform/location-estimates.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { computeEstimate, type LocationContents } from "./location-estimates";
import type { ContainerLoot } from "./sek";
import type { LockboxData } from "./lockbox";

const HEADLINE = ["coin-crown", "resource-metal-parts"];

const containers: ContainerLoot = {
  "parts-crate": {
    name: "Parts Crate", icon: "", category: "loot-containers",
    tiers: [
      { tier: "Tier 1", rollSets: 1, loot: [{ slug: "resource-metal-parts", name: "Resource Metal Parts", chance: 100, voyage: "10-20", storm: "20-30" }] },
      { tier: "Tier 2", rollSets: 1, loot: [{ slug: "resource-metal-parts", name: "Resource Metal Parts", chance: 100, voyage: "10-20", storm: "20-30" }] },
    ],
  },
};
const lockboxes = { meta: {}, crates: [] } as unknown as LockboxData;

it("sums coins and crate metal parts and derives storm multiplier", () => {
  const contents: LocationContents = {
    benches: 0, crates: {}, treasures: {}, mobs: 0, locked: 0,
    items: { coincrown_5: 4, lootboxesparts_mideffort: 3 },
  };
  const est = computeEstimate("kaiserplatz", "Kaiserplatz", contents, containers, lockboxes, HEADLINE);
  // coins: 5 * 4 = 20
  expect(est.resources["coin-crown"]).toBe(20);
  // metal parts: mid tier -> Tier 2, rollSets 1, chance 1.0, avg(10-20)=15, x3 crates = 45
  expect(est.resources["resource-metal-parts"]).toBe(45);
  // storm: avg(20-30)=25 vs 15 -> 25/15 ≈ 1.67
  expect(est.stormMultiplier["resource-metal-parts"]).toBeCloseTo(1.67, 2);
  expect(est.crates).toContainEqual({ name: "Parts Crate", count: 3 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/datamine && npx vitest run transform/location-estimates.test.ts`
Expected: FAIL — "computeEstimate is not a function".

- [ ] **Step 3: Write minimal implementation (append)**

```ts
import type { ContainerLoot, Container } from "./sek";
import type { LockboxData } from "./lockbox";

export interface LocationContents {
  benches: number;
  crates: Record<string, number>;
  treasures: Record<string, number>;
  mobs: number;
  locked: number;
  items: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Accumulate one crate's expected headline yield (× count) into voyage/storm totals. */
function addCrateYield(
  container: Container | undefined, tierIdx: number, count: number, headline: string[],
  voyage: Record<string, number>, storm: Record<string, number>,
) {
  if (!container) return;
  const tier = container.tiers[Math.min(tierIdx, container.tiers.length - 1)];
  if (!tier) return;
  for (const entry of tier.loot) {
    if (!headline.includes(entry.slug)) continue;
    const p = entry.chance / 100;
    voyage[entry.slug] = (voyage[entry.slug] ?? 0) + tier.rollSets * p * avgRange(entry.voyage) * count;
    storm[entry.slug] = (storm[entry.slug] ?? 0) + tier.rollSets * p * avgRange(entry.storm ?? entry.voyage) * count;
  }
}

export function computeEstimate(
  slug: string, name: string, contents: LocationContents,
  containers: ContainerLoot, lockboxes: LockboxData, headline: string[],
): LocationEstimate {
  const voyage: Record<string, number> = {};
  const storm: Record<string, number> = {};
  const crateCounts: Record<string, number> = {};
  let coinPiles = 0, lockboxCount = 0, itemSpawnerCount = 0, hasCombatSupplies = false;

  for (const [id, count] of Object.entries(contents.items)) {
    itemSpawnerCount += count;
    const s = classifySpawner(id);
    if (s.kind === "coin") {
      voyage["coin-crown"] = (voyage["coin-crown"] ?? 0) + s.coins * count;
      storm["coin-crown"] = (storm["coin-crown"] ?? 0) + s.coins * count;
      coinPiles += count;
    } else if (s.kind === "crate") {
      const container = containers[s.container];
      addCrateYield(container, tierForEffort(s.effort, container?.tiers.length ?? 1), count, headline, voyage, storm);
      crateCounts[container?.name ?? s.container] = (crateCounts[container?.name ?? s.container] ?? 0) + count;
      if (s.container === "weapon-crate" || s.container === "crate-of-shells") hasCombatSupplies = true;
    } else if (s.kind === "lockbox") {
      lockboxCount += count;
      hasCombatSupplies = true;
      const box = lockboxes.crates.find((c) => c.slug === s.container);
      for (const entry of box?.loot ?? []) {
        if (!headline.includes(entry.slug)) continue;
        const y = (entry.chance / 100) * avgRange(entry.count) * count;
        voyage[entry.slug] = (voyage[entry.slug] ?? 0) + y;
        storm[entry.slug] = (storm[entry.slug] ?? 0) + y;
      }
    }
  }

  // physical crates (no effort) -> mid tier
  for (const [label, count] of Object.entries(contents.crates)) {
    const key = CRATE_LABEL_CONTAINER[label];
    const container = key ? containers[key] : undefined;
    addCrateYield(container, tierForEffort("mid", container?.tiers.length ?? 1), count, headline, voyage, storm);
    if (container) crateCounts[container.name] = (crateCounts[container.name] ?? 0) + count;
    if (key === "weapon-crate" || key === "crate-of-shells") hasCombatSupplies = true;
  }

  const resources: Record<string, number> = {};
  const stormMultiplier: Record<string, number> = {};
  for (const res of headline) {
    if ((voyage[res] ?? 0) > 0) {
      resources[res] = round2(voyage[res]);
      stormMultiplier[res] = round2((storm[res] ?? voyage[res]) / voyage[res]);
    }
  }

  const crates = Object.entries(crateCounts).map(([name, count]) => ({ name, count }));
  if (lockboxCount) crates.push({ name: "lockbox", count: lockboxCount });
  if (coinPiles) crates.push({ name: "coin piles", count: coinPiles });
  for (const [label, count] of Object.entries(contents.treasures)) crates.push({ name: label, count });
  crates.sort((a, b) => b.count - a.count);

  const minimalLoot = Object.keys(resources).length === 0 && itemSpawnerCount <= 1;

  return { slug, name, resources, stormMultiplier, crates, hasCombatSupplies, minimalLoot };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/datamine && npx vitest run transform/location-estimates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/location-estimates.ts packages/datamine/transform/location-estimates.test.ts
git commit -m "feat(datamine): compute per-location material estimate"
```

---

### Task 5: The runner — write `location_estimates.json`

**Files:**
- Create: `packages/datamine/transform/estimates-run.ts`
- Modify: `packages/datamine/package.json`

- [ ] **Step 1: Write the runner**

```ts
// packages/datamine/transform/estimates-run.ts
// Joins sek-out/location_contents.json with container/lockbox yields into
// packages/data/generated/location_estimates.json, keyed by ENABLED landmark slug.
//   npx tsx transform/estimates-run.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadContainerLoot, loadLockboxes } from "./sek";
import { computeEstimate, type LocationContents, type LocationEstimates } from "./location-estimates";
import { HEADLINE_SLUGS } from "./location-estimates-headline";

const here = import.meta.dirname;
const readJson = (p: string) => JSON.parse(readFileSync(resolve(here, p), "utf-8"));

const contents = readJson("../sek-out/location_contents.json") as Record<string, LocationContents>;
const mapCfg = readJson("overrides/location-estimate-map.json") as { map: Record<string, string>; skip: string[] };
const entities = readJson("../../data/generated/entities.json") as { slug: string; name: string; kind: string; category: string; disabled?: boolean }[];

const containers = loadContainerLoot();
const lockboxes = loadLockboxes();
if (!lockboxes) throw new Error("lockbox_loot.json missing — run the datamine first");

// enabled landmark entities, by slug
const landmarks = new Map(
  entities.filter((e) => e.kind === "environment" && e.category === "landmarks" && !e.disabled).map((e) => [e.slug, e]),
);

const slugify = (s: string) => s.toLowerCase().replace(/^(island_|poi_|env_|loc_event_)/, "").replace(/[^a-z0-9]/g, "");

/** Resolve a location_contents key to an enabled landmark slug, or null to skip. */
function resolveSlug(key: string): string | null {
  if (mapCfg.skip.includes(key)) return null;
  const override = mapCfg.map[key];
  if (override) return landmarks.has(override) ? override : null;
  const n = slugify(key);
  for (const slug of landmarks.keys()) if (slugify(slug) === n) return slug;
  return null;
}

const out: LocationEstimates = {};
const skipped: string[] = [];
for (const [key, contentsForLoc] of Object.entries(contents)) {
  const slug = resolveSlug(key);
  if (!slug) { skipped.push(key); continue; }
  out[slug] = computeEstimate(slug, landmarks.get(slug)!.name, contentsForLoc, containers, lockboxes, HEADLINE_SLUGS);
}

const dest = resolve(here, "../../data/generated/location_estimates.json");
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n", "utf-8");
console.log(`location estimates: wrote ${Object.keys(out).length} location(s) -> packages/data/generated/location_estimates.json`);
console.log(`location estimates: skipped ${skipped.length} unmatched key(s): ${skipped.join(", ")}`);
```

- [ ] **Step 2: Create the shared headline-slug list (single source of truth)**

Create `packages/datamine/transform/location-estimates-headline.ts`:

```ts
// The headline resource item-slugs surfaced in estimates. Mirrored (as display
// metadata) by apps/wiki/src/lib/loot-estimates.ts HEADLINE_RESOURCES — keep the
// slug lists in sync.
export const HEADLINE_SLUGS = [
  "coin-crown", "resource-metal-parts", "resource-weapon-parts",
  "resource-coral-piece", "resource-coral-dust",
  "resource-metal-t1", "resource-metal-t2", "resource-metal-t3",
  "resource-alloy-steel", "resource-gunpowder", "resource-fabric", "resource-optic-lenses",
];
```

- [ ] **Step 3: Add the npm script**

In `packages/datamine/package.json`, add to `"scripts"`:
```json
"estimates": "tsx transform/estimates-run.ts"
```

- [ ] **Step 4: Run it and verify output**

Run: `cd packages/datamine && npm run estimates`
Expected: logs `wrote 5 location(s)` (kaiserplatz, dreadnaught, venedig, stufeninsel, meeresauge — factorio filtered as disabled) and a skipped list. File `packages/data/generated/location_estimates.json` exists.

- [ ] **Step 5: Sanity-check the numbers**

Run: `cd packages/data && node -e "const e=require('./generated/location_estimates.json'); console.log(JSON.stringify(e.kaiserplatz.resources,null,1)); console.log('coins>0', e.kaiserplatz.resources['coin-crown']>0)"`
Expected: coins > 0 and several resources populated for kaiserplatz.

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/transform/estimates-run.ts packages/datamine/transform/location-estimates-headline.ts packages/datamine/package.json packages/data/generated/location_estimates.json
git commit -m "feat(datamine): generate location_estimates.json"
```

---

### Task 6: Expose estimates via `@sandlabs/data`

**Files:**
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/index.ts`

- [ ] **Step 1: Add types to `packages/data/src/types.ts`**

```ts
export interface LocationEstimate {
  slug: string;
  name: string;
  resources: Record<string, number>;
  stormMultiplier: Record<string, number>;
  crates: { name: string; count: number }[];
  hasCombatSupplies: boolean;
  minimalLoot: boolean;
}
export type LocationEstimates = Record<string, LocationEstimate>;
```

- [ ] **Step 2: Import + export accessors in `packages/data/src/index.ts`**

After the existing `import links from "../generated/links.json";` line add:
```ts
import locationEstimatesJson from "../generated/location_estimates.json";
```
And near the other bound accessors add:
```ts
import type { LocationEstimate, LocationEstimates } from "./types";

const locationEstimates = locationEstimatesJson as unknown as LocationEstimates;

export const getLocationEstimate = (slug: string): LocationEstimate | undefined => locationEstimates[slug];
export const listLocationEstimates = (): LocationEstimate[] => Object.values(locationEstimates);
```

- [ ] **Step 3: Verify it type-checks / builds**

Run: `cd packages/data && npx tsc --noEmit`
Expected: no errors. (If `resolveJsonModule` complains, confirm it's already enabled — the package already imports `entities.json`, so it is.)

- [ ] **Step 4: Commit**

```bash
git add packages/data/src/types.ts packages/data/src/index.ts
git commit -m "feat(data): expose getLocationEstimate / listLocationEstimates"
```

---

### Task 7: Wiki lib — headline metadata + formatting

**Files:**
- Create: `apps/wiki/src/lib/loot-estimates.ts`
- Test: `apps/wiki/src/lib/loot-estimates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/wiki/src/lib/loot-estimates.test.ts
import { describe, it, expect } from "vitest";
import { formatAmount, HEADLINE_RESOURCES } from "./loot-estimates";

describe("formatAmount", () => {
  it("prefixes ~ and rounds to nice numbers", () => {
    expect(formatAmount(1187)).toBe("~1,200");
    expect(formatAmount(64.4)).toBe("~65");
    expect(formatAmount(3.2)).toBe("~3");
  });
  it("renders 0 as a dash", () => expect(formatAmount(0)).toBe("—"));
});

describe("HEADLINE_RESOURCES", () => {
  it("covers coin-crown with a label", () => {
    const coin = HEADLINE_RESOURCES.find((r) => r.slug === "coin-crown");
    expect(coin?.label).toBe("Coins");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/wiki && npx vitest run src/lib/loot-estimates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/wiki/src/lib/loot-estimates.ts
// Display metadata for the headline resources shown in location estimates.
// The `slug` list MUST match packages/datamine/transform/location-estimates-headline.ts.
export interface HeadlineResource { slug: string; label: string }

export const HEADLINE_RESOURCES: HeadlineResource[] = [
  { slug: "coin-crown", label: "Coins" },
  { slug: "resource-metal-parts", label: "Metal Parts" },
  { slug: "resource-weapon-parts", label: "Weapon Parts" },
  { slug: "resource-coral-piece", label: "Coral Piece" },
  { slug: "resource-coral-dust", label: "Coral Dust" },
  { slug: "resource-metal-t1", label: "Metal T1" },
  { slug: "resource-metal-t2", label: "Metal T2" },
  { slug: "resource-metal-t3", label: "Metal T3" },
  { slug: "resource-alloy-steel", label: "Alloy Steel" },
  { slug: "resource-gunpowder", label: "Gunpowder" },
  { slug: "resource-fabric", label: "Fabric" },
  { slug: "resource-optic-lenses", label: "Optic Lenses" },
];

/** Round to a "nice" magnitude and format with ~ prefix; 0 -> em-dash. */
export function formatAmount(n: number): string {
  if (!n || n <= 0) return "—";
  let rounded: number;
  if (n >= 1000) rounded = Math.round(n / 100) * 100;
  else if (n >= 100) rounded = Math.round(n / 10) * 10;
  else if (n >= 20) rounded = Math.round(n / 5) * 5;
  else rounded = Math.round(n);
  return "~" + rounded.toLocaleString("en-US");
}

export const ESTIMATE_DISCLAIMER =
  "Rough estimates from datamined spawn tables — actual hauls vary per run and increase in storms.";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/wiki && npx vitest run src/lib/loot-estimates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/loot-estimates.ts apps/wiki/src/lib/loot-estimates.test.ts
git commit -m "feat(wiki): headline resource metadata + amount formatting"
```

---

### Task 8: EstimatedHaul card + mount on landmark pages

**Files:**
- Create: `apps/wiki/src/components/EstimatedHaul.tsx`
- Modify: `apps/wiki/src/app/environment/[slug]/page.tsx`

- [ ] **Step 1: Write the component (layout B — tiles + crate chips)**

```tsx
// apps/wiki/src/components/EstimatedHaul.tsx
import type { LocationEstimate } from "@sandlabs/data";
import { HEADLINE_RESOURCES, formatAmount, ESTIMATE_DISCLAIMER } from "@/lib/loot-estimates";

export function EstimatedHaul({ estimate }: { estimate: LocationEstimate }) {
  if (estimate.minimalLoot) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Estimated haul</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Minimal loot — this is a combat point of interest with few containers.
        </p>
      </section>
    );
  }

  const tiles = HEADLINE_RESOURCES
    .map((r) => ({ ...r, amount: estimate.resources[r.slug] ?? 0, storm: estimate.stormMultiplier[r.slug] ?? 1 }))
    .filter((t) => t.amount > 0);
  const anyStorm = tiles.some((t) => t.storm > 1.05);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Estimated haul</h2>
        {anyStorm && <span className="text-xs text-sky-400">↑ more in storms</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.slug} className="rounded-md border border-border bg-background p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className={`mt-0.5 text-xl font-bold tabular-nums ${t.slug === "coin-crown" ? "text-primary" : "text-foreground"}`}>
              {formatAmount(t.amount)}
            </div>
          </div>
        ))}
      </div>

      {estimate.crates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {estimate.crates.map((c) => (
            <span key={c.name} className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground">
              <b className="text-primary">{c.count}</b>× {c.name}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
    </section>
  );
}
```

> Class names above follow the wiki's existing token utilities (`bg-card`, `border-border`, `text-muted-foreground`, `text-primary`) seen in `EntityDetail` and sibling components. If a token differs, match the neighbours in `apps/wiki/src/components/`.

- [ ] **Step 2: Mount it on the landmark page**

In `apps/wiki/src/app/environment/[slug]/page.tsx`:

Add imports near the top:
```tsx
import { getLocationEstimate } from "@sandlabs/data";
import { EstimatedHaul } from "@/components/EstimatedHaul";
```

Inside `EnvEntityPage`, after `const admin = await sessionIsAdmin();`, add:
```tsx
const estimate = entity.category === "landmarks" ? getLocationEstimate(slug) : undefined;
```

Pass it into `EntityDetail` via the `description` slot area. `EntityDetail` renders `description` above the tabs; place the card just under it by extending the description node:
```tsx
description={
  <>
    {entity.description}
    {estimate && <div className="mt-4"><EstimatedHaul estimate={estimate} /></div>}
  </>
}
```
> Confirm `EntityDetail`'s `description` prop accepts a `ReactNode` (it renders arbitrary content today). If it is typed `string`, instead add an optional `belowDescription?: ReactNode` prop to `EntityDetail` and render it between the description and the tabs — a 2-line change in `apps/wiki/src/components/EntityDetail`.

- [ ] **Step 3: Verify it renders**

Run the dev server (it is often already on :3000 — check first):
`cd apps/wiki && npm run dev`
Open `http://localhost:3000/environment/kaiserplatz`.
Expected: an "Estimated haul" card with coin/parts/etc. tiles, crate chips, and the disclaimer. Open `/environment/fort-arpad` — no card (fort-arpad has no estimate) or, if mapped later, the "Minimal loot" note.

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/components/EstimatedHaul.tsx apps/wiki/src/app/environment/[slug]/page.tsx
git commit -m "feat(wiki): Estimated haul card on landmark pages"
```

---

### Task 9: `/loot` comparison page (sortable matrix)

**Files:**
- Create: `apps/wiki/src/components/LootComparisonTable.tsx`
- Create: `apps/wiki/src/app/loot/page.tsx`
- Modify: `apps/wiki/src/lib/taxonomy.ts`
- Modify: `apps/wiki/src/components/SectionIcon.tsx`

> Read `apps/wiki/node_modules/next/dist/docs/` for the current App Router page conventions before writing `loot/page.tsx`.

- [ ] **Step 1: Write the client sortable table**

```tsx
// apps/wiki/src/components/LootComparisonTable.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { HEADLINE_RESOURCES, formatAmount } from "@/lib/loot-estimates";

export interface Row {
  slug: string;
  name: string;
  resources: Record<string, number>;
  lockboxes: number;
}
const COLUMNS = [...HEADLINE_RESOURCES.map((r) => ({ key: r.slug, label: r.label })), { key: "__lockboxes", label: "Lockboxes" }];

export function LootComparisonTable({ rows }: { rows: Row[] }) {
  const [sortKey, setSortKey] = useState<string>("coin-crown");
  const valueOf = (row: Row, key: string) => (key === "__lockboxes" ? row.lockboxes : row.resources[key] ?? 0);
  const sorted = [...rows].sort((a, b) => valueOf(b, sortKey) - valueOf(a, sortKey));
  const maxByCol = Object.fromEntries(COLUMNS.map((c) => [c.key, Math.max(0, ...rows.map((r) => valueOf(r, c.key)))]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
            {COLUMNS.map((c) => (
              <th key={c.key}
                  onClick={() => setSortKey(c.key)}
                  className={`cursor-pointer px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide ${sortKey === c.key ? "text-primary" : "text-muted-foreground"}`}>
                {c.label}{sortKey === c.key ? " ▾" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.slug} className="border-b border-border">
              <td className="px-2 py-2 text-left">
                <Link href={`/environment/${row.slug}`} className="text-foreground hover:text-primary">{row.name}</Link>
              </td>
              {COLUMNS.map((c) => {
                const v = valueOf(row, c.key);
                const isMax = v > 0 && v === maxByCol[c.key];
                return (
                  <td key={c.key} className={`px-2 py-2 text-right tabular-nums ${isMax ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {c.key === "__lockboxes" ? (v || "—") : formatAmount(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write the server page**

```tsx
// apps/wiki/src/app/loot/page.tsx
import { listLocationEstimates } from "@sandlabs/data";
import { ESTIMATE_DISCLAIMER } from "@/lib/loot-estimates";
import { LootComparisonTable, type Row } from "@/components/LootComparisonTable";

export const metadata = { title: "Loot Guide — where to find materials" };

export default function LootGuidePage() {
  const rows: Row[] = listLocationEstimates()
    .filter((e) => !e.minimalLoot)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      resources: e.resources,
      lockboxes: e.crates.find((c) => c.name === "lockbox")?.count ?? 0,
    }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">Loot Guide</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Estimated materials per landmark. Click a column to sort and find where to farm what you need.
      </p>
      <div className="mt-5">
        <LootComparisonTable rows={rows} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
    </main>
  );
}
```

- [ ] **Step 3: Add the nav section** in `apps/wiki/src/lib/taxonomy.ts`

In the `SECTIONS` array, add before the `admin` entry:
```ts
{ slug: "loot", label: "Loot Guide", kind: "link", href: "/loot", categories: [] },
```

- [ ] **Step 4: Add a SectionIcon case** in `apps/wiki/src/components/SectionIcon.tsx`

Add a `loot` branch to the icon switch/map (match the file's existing pattern; use a coin/sack-style icon consistent with the others). If the component already falls back gracefully for unknown slugs, this step is optional — verify by checking whether the `tech`/`builder` link sections render an icon.

- [ ] **Step 5: Verify end-to-end**

Dev server (`cd apps/wiki && npm run dev`), open `http://localhost:3000/loot`.
Expected: a table of the covered landmarks; clicking "Coral Piece" re-sorts by coral, per-column max shown in the primary color; a "Loot Guide" link appears in the top nav; row names link to their landmark pages.

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/components/LootComparisonTable.tsx apps/wiki/src/app/loot/page.tsx apps/wiki/src/lib/taxonomy.ts apps/wiki/src/components/SectionIcon.tsx
git commit -m "feat(wiki): /loot comparison matrix + nav entry"
```

---

### Task 10: Full verification + docs

**Files:**
- Modify: `packages/datamine/README.md` or the datamine docs (wherever the pipeline steps are listed) — document the new `npm run estimates` step and its position (run AFTER `npm run transform`, since it reads the final `entities.json`).

- [ ] **Step 1: Run all tests**

Run: `cd packages/datamine && npm test` then `cd apps/wiki && npm test`
Expected: green (note per `mobile-support-state` memory, the wiki e2e/lint baseline may have pre-existing red — distinguish new failures from baseline).

- [ ] **Step 2: Type-check the wiki**

Run: `cd apps/wiki && npx tsc --noEmit` (or the repo's typecheck script)
Expected: no new errors.

- [ ] **Step 3: Regenerate to confirm determinism**

Run: `cd packages/datamine && npm run estimates` twice; `git diff --stat packages/data/generated/location_estimates.json`
Expected: no diff on the second run (deterministic output).

- [ ] **Step 4: Document the pipeline step**

Add a line to the datamine docs describing: `npm run estimates` reads `sek-out/location_contents.json` + `container_loot.json` + `lockbox_loot.json` + `generated/entities.json`, applies `overrides/location-estimate-map.json`, and writes `packages/data/generated/location_estimates.json`. Extend coverage by adding entries to the map.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(datamine): document location estimates pipeline step"
```

---

## Known limitations (documented, deferred)

- **Coverage:** only landmarks in `location-estimate-map.json` (auto-matched + manual) that resolve to an *enabled* entity get estimates. Contents-rich cities without a wiki page (Achilleon, Tieftauchparadies, …) are excluded until pages are minted (separate effort). Expanding coverage = adding map entries.
- **Treasures** (Buried Treasure, Artefact, Aurogen Crystal) have no yield table, so they appear only as crate-chip counts, not in headline numbers.
- **`rollSets` / effort→tier** are modelled as documented assumptions; the estimate is deliberately rough and relative, not authoritative. If in-game numbers later contradict, adjust `computeEstimate` and the tests lock the new behaviour.
- **Storm** is shown as a single "↑ more in storms" flag plus a stored per-resource multiplier; no interactive voyage/storm toggle (was explicitly deferred).
```
