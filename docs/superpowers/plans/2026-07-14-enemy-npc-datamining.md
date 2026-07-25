# Enemy NPC Datamining — Phase 1 (Data Pipeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Datamine the two enemy NPC types — **Upior** (creature) and **Ironclad** (enemy trampler) — into the static dataset as first-class `kind:"enemy"` entities carrying per-variant HP and a combined loot table, so the wiki can later render enemy pages.

**Architecture:** Two-stage pipeline, mirroring the existing loot-container flow. **Stage A (Python)** adds `extract_enemy_stats.py` (Odin-decodes HP/name/type off the `mob_*` EPB prefabs) and `build_enemies.py` (joins those stats with the already-computed `loot_sources.json` drops + localization → `sek-out/enemies.json`), plus a shared `loot_resolve.py` item→slug resolver. **Stage B (TypeScript)** adds `transform/enemies.ts` (`mergeEnemies` upserts the two enemy entities; `buildEnemyLootLinks` emits `role:"loot"` links reusing the existing `applyLoot`) wired into `transform/run.ts`, plus a new `EnemyStats` type and an images-report exemption for null enemy icons.

**Tech Stack:** TypeScript + tsx + Vitest (transform); Python 3 + UnityPy + pytest (extract/build); JSON datasets.

**Scope note:** This plan covers **Phase 1 only** — data lands in `packages/data/generated/{entities,links}.json` and is verified via reports + JSON inspection. **Phase 2 (wiki UI: `/enemies` routes, `EntityDetail` enemy branch, nav taxonomy)** is a separate follow-up plan authored after Phase 1 data is merged and verified.

**Working branch:** `feat/enemy-npc-datamining` (already checked out). All `git`/`pnpm` commands run from repo root `d:\Documents\SandLabs`; all `python` commands run from `packages/datamine/` unless stated. Use the Bash tool (Git Bash) for the `$(cat <<'EOF' ...)` commit idiom.

---

## File Structure

**Create:**
- `packages/datamine/scripts/extract_enemy_stats.py` — Odin-decodes HP / niceName / type off the allow-listed `mob_*` EPBs → `extracted/json/enemy_stats.json`. (No unit test — needs live game files, like every other `extract_*.py`.)
- `packages/datamine/scripts/loot_resolve.py` — pure item-id → wiki-slug resolver (aliases + drop-suffix strip + id/name match). Shared, unit-tested.
- `packages/datamine/scripts/test_loot_resolve.py` — pytest for the resolver.
- `packages/datamine/scripts/build_enemies.py` — joins `enemy_stats.json` + `loot_sources.json` + localization + overrides → `sek-out/enemies.json`. Unit-tested via subprocess + fixtures.
- `packages/datamine/scripts/test_build_enemies.py` — pytest for the builder.
- `packages/datamine/transform/overrides/enemy-overrides.json` — enemy definitions (id/slug/name/type/variants/loot mapping) + item-slug aliases.
- `packages/datamine/transform/enemies.ts` — `EnemyData` types + `mergeEnemies` + `buildEnemyLootLinks`.
- `packages/datamine/transform/enemies.test.ts` — Vitest for the above.

**Modify:**
- `packages/data/src/types.ts` — add `EnemyStats`, extend `Entity.kind` doc comment, add optional `Entity.enemyStats`.
- `packages/datamine/transform/sek.ts` — add `loadEnemies()` loader (tolerates absence).
- `packages/datamine/transform/images.ts` — treat null `enemy` icons as by-design (not `needsExtraction`).
- `packages/datamine/transform/images.test.ts` — cover the enemy exemption.
- `packages/datamine/transform/run.ts` — wire enemy merge + loot into the orchestration.
- `packages/datamine/UPDATE_PIPELINE.md` + `packages/datamine/README.md` — document the new steps.

**Data outputs (regenerated, committed in Task 10):** `packages/data/generated/{entities,links}.json`, `packages/datamine/extracted/json/enemy_stats.json`, `packages/datamine/sek-out/enemies.json`.

---

## Task 1: Data model — `EnemyStats` type + `enemy` kind

**Files:**
- Modify: `packages/data/src/types.ts`

TypeScript type additions have no runtime behavior to TDD; this task is verified by a typecheck. It is a prerequisite for every later TS task.

- [ ] **Step 1: Add the `EnemyStats` interface**

In `packages/data/src/types.ts`, immediately after the `TechNodeStats` interface (before `LocalizedText`), add:

```ts
export interface EnemyStats {
  /** creature = on-foot mob (Upior); enemy-trampler = enemy walker (Ironclad). */
  type: "creature" | "enemy-trampler";
  /** One row per in-game variant, e.g. Upior Melee/Ranged or Ironclad Buckler/Falchion. */
  variants: { name: string; hp: number }[];
}
```

- [ ] **Step 2: Extend the `Entity.kind` doc comment and add `enemyStats`**

In the `Entity` interface, update the `kind` comment and add the optional field next to the other `*Stats` fields:

```ts
  kind: string; // "item" | "environment" | "trampler-part" | "tech-node" | "enemy"
```

Then, directly after the `techNodeStats: TechNodeStats | null;` line, add:

```ts
  /** Present only on kind:"enemy" entities (NPC pages). Absent on all other kinds. */
  enemyStats?: EnemyStats | null;
```

- [ ] **Step 3: Typecheck the data package**

Run: `pnpm --filter @sandlabs/data build`
Expected: exits 0 (tsc compiles `src` → `dist` with no errors).

If `@sandlabs/data` has no `build` script, instead run: `pnpm --filter @sandlabs/data exec tsc --noEmit` — expected: exits 0, no output.

- [ ] **Step 4: Commit**

```bash
git add packages/data/src/types.ts
git commit -m "$(cat <<'EOF'
feat(data): EnemyStats type + kind:"enemy" for NPC entities

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `transform/enemies.ts` — merge + loot links

**Files:**
- Create: `packages/datamine/transform/enemies.ts`
- Test: `packages/datamine/transform/enemies.test.ts`

`mergeEnemies` must **upsert** by slug (the transform baseline is the previous artifact, which already contains the enemy entities after the first run — appending blindly would create duplicate slugs and fail `validateEntities`). `buildEnemyLootLinks` returns the existing `LootResult` shape so it can reuse `applyLoot` from `loot.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/datamine/transform/enemies.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeEnemies, buildEnemyLootLinks, type EnemyData } from "./enemies";
import type { Entity } from "@sandlabs/data";

const upior: EnemyData = {
  id: "upior", slug: "upior", name: "Upiór", type: "creature", icon: null,
  variants: [{ name: "Ranged", hp: 100 }, { name: "Melee", hp: 100 }],
  loot: [
    { group: "Ranged", slug: "pistol-ammo", name: "Pistol Ammo", chance: 100, voyage: "1", storm: "1-2" },
    { group: "Melee", slug: null, name: "Unresolved Thing", chance: 50, voyage: "1", storm: "1" },
  ],
};

const baseItem = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: "/i.png", imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("enemy merge", () => {
  it("appends a new enemy entity with enemyStats and mapped category", () => {
    const out = mergeEnemies([baseItem("pistol-ammo")], [upior]);
    expect(out).toHaveLength(2);
    const e = out.find((x) => x.slug === "upior")!;
    expect(e.kind).toBe("enemy");
    expect(e.category).toBe("creatures");
    expect(e.icon).toBeNull();
    expect(e.enemyStats).toEqual({ type: "creature", variants: [{ name: "Ranged", hp: 100 }, { name: "Melee", hp: 100 }] });
  });

  it("upserts (refreshes) an existing enemy instead of duplicating it", () => {
    const stale: Entity = { ...baseItem("upior"), kind: "enemy", name: "OLD", enemyStats: { type: "creature", variants: [] } };
    const out = mergeEnemies([stale, baseItem("pistol-ammo")], [upior]);
    expect(out.filter((x) => x.slug === "upior")).toHaveLength(1);
    expect(out.find((x) => x.slug === "upior")!.name).toBe("Upiór");
  });

  it("maps enemy-trampler type to the enemy-tramplers category", () => {
    const ic: EnemyData = { ...upior, id: "ironclad", slug: "ironclad", name: "Ironclad", type: "enemy-trampler", loot: [] };
    const e = mergeEnemies([], [ic]).find((x) => x.slug === "ironclad")!;
    expect(e.category).toBe("enemy-tramplers");
    expect(e.enemyStats!.type).toBe("enemy-trampler");
  });
});

describe("enemy loot links", () => {
  it("emits role:loot links (source=enemy, tier=group), skipping unresolved items", () => {
    const { covered, links } = buildEnemyLootLinks([upior]);
    expect([...covered]).toEqual(["upior"]);
    expect(links).toHaveLength(1); // the null-slug row is dropped
    expect(links[0]).toEqual({
      sourceSlug: "upior", targetSlug: "pistol-ammo", role: "loot", name: "Pistol Ammo",
      amount: null, tier: "Ranged", value1: "100", value2: "1", value3: "1-2", sortOrder: 0, buyGroup: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @sandlabs/datamine exec vitest run transform/enemies.test.ts`
Expected: FAIL — cannot resolve `./enemies` (module not found).

- [ ] **Step 3: Write the implementation**

Create `packages/datamine/transform/enemies.ts`:

```ts
import type { Entity, EntityLink } from "@sandlabs/data";
import type { LootResult } from "./loot";

export interface EnemyVariant { name: string; hp: number }
export interface EnemyLootRow {
  group: string;
  slug: string | null;   // null => item id didn't resolve to a wiki slug (reported upstream)
  name: string;
  chance: number;
  voyage: string | null;
  storm: string | null;
}
export interface EnemyData {
  id: string;
  slug: string;
  name: string;
  type: "creature" | "enemy-trampler";
  icon: string | null;
  variants: EnemyVariant[];
  loot: EnemyLootRow[];
}

const CATEGORY: Record<EnemyData["type"], string> = {
  creature: "creatures",
  "enemy-trampler": "enemy-tramplers",
};

function toEntity(e: EnemyData): Entity {
  return {
    id: e.id, slug: e.slug, kind: "enemy", name: e.name,
    description: null, category: CATEGORY[e.type], rarity: null,
    icon: e.icon, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
    enemyStats: { type: e.type, variants: e.variants },
  };
}

/** Upsert enemy entities over the baseline: refresh any existing slug in place,
 *  append the rest. Idempotent across re-runs (baseline = previous artifact). */
export function mergeEnemies(entities: Entity[], enemies: EnemyData[]): Entity[] {
  const bySlug = new Map(enemies.map((e) => [e.slug, toEntity(e)]));
  const refreshed = entities.map((e) => bySlug.get(e.slug) ?? e);
  const existing = new Set(entities.map((e) => e.slug));
  const added = enemies.filter((e) => !existing.has(e.slug)).map(toEntity);
  return refreshed.concat(added);
}

/** Build role:"loot" EntityLink rows from enemy slug -> dropped item slug.
 *  tier = loot group label; chance -> value1, voyage -> value2, storm -> value3.
 *  Returns the LootResult shape so run.ts can reuse applyLoot(). */
export function buildEnemyLootLinks(enemies: EnemyData[]): LootResult {
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  for (const e of enemies) {
    covered.add(e.slug);
    let sort = 0;
    for (const r of e.loot) {
      if (!r.slug) continue;
      links.push({
        sourceSlug: e.slug, targetSlug: r.slug, role: "loot", name: r.name,
        amount: null, tier: r.group, value1: String(r.chance),
        value2: r.voyage ?? null, value3: r.storm ?? null, sortOrder: sort++, buyGroup: null,
      });
    }
  }
  return { covered, links };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @sandlabs/datamine exec vitest run transform/enemies.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/enemies.ts packages/datamine/transform/enemies.test.ts
git commit -m "$(cat <<'EOF'
feat(datamine): enemies transform — mergeEnemies + buildEnemyLootLinks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `sek.ts` — `loadEnemies()` loader

**Files:**
- Modify: `packages/datamine/transform/sek.ts`

Thin file-IO loader (like the other `sek.ts` loaders — no dedicated unit test). Must return `[]` when `enemies.json` is absent, so `run.ts` works before Stage A has produced data.

- [ ] **Step 1: Add the loader**

In `packages/datamine/transform/sek.ts`, add the `existsSync` import and a loader. Change the top import line:

```ts
import { readFileSync, existsSync } from "node:fs";
```

Then, at the end of the file, add:

```ts
// --- enemies (NPC entities + variant HP + combined loot; produced by build_enemies.py) ---
import type { EnemyData } from "./enemies";

export function loadEnemies(dir = SEK): EnemyData[] {
  const p = resolve(dir, "enemies.json");
  if (!existsSync(p)) return [];  // Stage A hasn't produced it yet -> no-op in the transform
  const raw = JSON.parse(readFileSync(p, "utf-8")) as { enemies?: EnemyData[] } | EnemyData[];
  return (Array.isArray(raw) ? raw : raw.enemies ?? []);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @sandlabs/datamine exec tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/datamine/transform/sek.ts
git commit -m "$(cat <<'EOF'
feat(datamine): loadEnemies() loader (tolerates absent enemies.json)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `images.ts` — null enemy icons are by-design

**Files:**
- Modify: `packages/datamine/transform/images.ts`
- Test: `packages/datamine/transform/images.test.ts`

Enemy entities ship with `icon: null` intentionally (like tech-nodes/locations). Without this, they'd be wrongly flagged in `missing-images.json` as `needsExtraction`.

- [ ] **Step 1: Write the failing test**

Add this test to `packages/datamine/transform/images.test.ts` (inside the existing top-level `describe`, or append a new one). It assumes a helper to build a minimal entity; if the file already has one, use it and drop the local `mk`:

```ts
import { describe, it, expect } from "vitest";
import { classifyImages } from "./images";
import type { Entity } from "@sandlabs/data";

const mk = (over: Partial<Entity>): Entity => ({
  id: "x", slug: "x", kind: "item", name: "X", description: null, category: "c",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null, ...over,
});

describe("images: enemy icon exemption", () => {
  it("counts null-icon enemies under byDesign, not needsExtraction", () => {
    const report = classifyImages(
      [mk({ slug: "upior", kind: "enemy", icon: null })],
      () => false,
    );
    expect(report.needsExtraction).toHaveLength(0);
    expect(report.byDesign.enemyNoIcon).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @sandlabs/datamine exec vitest run transform/images.test.ts`
Expected: FAIL — `report.byDesign.enemyNoIcon` is `undefined` (and the enemy leaked into `needsExtraction`).

- [ ] **Step 3: Implement the exemption**

In `packages/datamine/transform/images.ts`:

3a. Extend the `ImageReport` `byDesign` shape:

```ts
  byDesign: { techNodeNoIcon: number; environmentNoIcon: number; enemyNoIcon: number };
```

3b. In `classifyImages`, add the counter and the branch. Add `let enemyNoIcon = 0;` next to the other counters, and inside the `if (!e.icon)` block, before `bump(...)`, add:

```ts
      if (e.kind === "enemy") { enemyNoIcon++; continue; } // NPC pages ship without an icon by design
```

3c. Include it in the returned `byDesign`:

```ts
  return { _doc: DOC, summary, needsExtraction, byDesign: { techNodeNoIcon, environmentNoIcon, enemyNoIcon } };
```

3d. Extend the `DOC` string — append this sentence before the closing quote of `DOC`:

```
" enemy -> NPC pages (Upior/Ironclad) have no in-game item sprite and ship iconless by design."
```

(Concatenate it onto the existing `DOC` string literal, e.g. add `+ " enemy -> ..."`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @sandlabs/datamine exec vitest run transform/images.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/transform/images.ts packages/datamine/transform/images.test.ts
git commit -m "$(cat <<'EOF'
feat(datamine): exempt null-icon enemy entities from the images report

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire enemies into `transform/run.ts`

**Files:**
- Modify: `packages/datamine/transform/run.ts`

No new unit test — `run.ts` is the orchestrator, verified end-to-end in Task 9. Because enemies are only **added** (never removed), this does **not** trip the slug-removal guard, so `--allow-slug-changes` is not needed for the first landing.

- [ ] **Step 1: Add imports**

Add `loadEnemies` to the existing `sek` import, and a new import for the enemy transform:

```ts
import { loadSekItems, loadLocalization, loadContainerLoot, loadEnemies } from "./sek";
```

Add after the `buildLootLinks` import line:

```ts
import { mergeEnemies, buildEnemyLootLinks } from "./enemies";
```

- [ ] **Step 2: Load enemies alongside the other sek datasets**

After `const containerLoot = loadContainerLoot();` add:

```ts
const enemies = loadEnemies();
```

- [ ] **Step 3: Merge enemy entities after combat stats**

Immediately after the combat-stats block (after the `console.log(\`combat stats: ...\`)` line, before the recipes block), add:

```ts
// --- enemies: add/refresh NPC entities (Upior, Ironclad) with enemyStats ---
const withEnemies = enemies.length ? mergeEnemies(withCombat, enemies) : withCombat;
console.log(enemies.length
  ? `enemies: merged ${enemies.length} NPC entit${enemies.length === 1 ? "y" : "ies"}`
  : "enemies: source absent (enemies.json) — none merged");
```

- [ ] **Step 4: Replace `withCombat` with `withEnemies` downstream**

From this point on, the final entity set is `withEnemies`. Make these exact substitutions in the rest of the file:

- In the loot block: `const knownSlugs = new Set(withCombat.map((e) => e.slug));` → `const knownSlugs = new Set(withEnemies.map((e) => e.slug));`
- `const diff = diffEntities(baseline.entities, withCombat);` → `... withEnemies);`
- `validateEntities(withCombat);` → `validateEntities(withEnemies);`
- `const danglingRefs = reportDanglingRefs(withCombat, links, recipeMerge.recipes);` → `... withEnemies, links, ...`
- `const images = classifyImages(withCombat, ...)` → `classifyImages(withEnemies, ...)`
- `writeArtifact(withCombat, recipeMerge.recipes, links);` → `writeArtifact(withEnemies, ...)`

- [ ] **Step 5: Append enemy loot to the links**

Find the loot block ending in `const links = applyLoot(baseline.links, loot);`. Replace that single line with:

```ts
const enemyLoot = buildEnemyLootLinks(enemies);
const enemyDangling = enemyLoot.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (enemyDangling.length) {
  console.warn(`enemy loot: dropping ${enemyDangling.length} link(s) to unknown item slugs:`,
    [...new Set(enemyDangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
enemyLoot.links = enemyLoot.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const links = applyLoot(applyLoot(baseline.links, loot), enemyLoot);
console.log(`enemy loot: ${enemyLoot.links.length} link(s) across ${enemyLoot.covered.size} enemies`);
```

Note: `knownSlugs` is declared just above the container-loot `buildLootLinks` call; the enemy block must come **after** that declaration and after `const links = applyLoot(...)` is redefined. Keep the container-loot lines intact and insert the enemy block so the final `const links` includes both.

- [ ] **Step 6: Update the final console.log wording (optional, cosmetic)**

Update the closing summary log to mention enemies were merged (leave the file-list text otherwise unchanged).

- [ ] **Step 7: Verify the transform still runs (no enemies yet)**

Run: `pnpm --filter @sandlabs/datamine transform`
Expected: exits 0. Because `sek-out/enemies.json` does not exist yet, the log shows `enemies: source absent (enemies.json) — none merged` and the generated files are **unchanged** vs. the committed baseline (verify with `git status --short packages/data/generated`). If any generated file changed, investigate before continuing.

- [ ] **Step 8: Commit**

```bash
git add packages/datamine/transform/run.ts
git commit -m "$(cat <<'EOF'
feat(datamine): wire enemy merge + loot into the transform orchestrator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `extract_enemy_stats.py` — Odin-decode enemy prefab stats

**Files:**
- Create: `packages/datamine/scripts/extract_enemy_stats.py`

This is an extraction script (needs live game files + UnityPy), so — like every `extract_*.py` — it has no unit test; it is verified by running it and eyeballing the output. Odin component field names are recovered from `global-metadata.dat`, not a code dump, so the HP extraction scans robustly for a health-like scalar rather than assuming one exact key.

- [ ] **Step 1: Write the extractor**

Create `packages/datamine/scripts/extract_enemy_stats.py`:

```python
"""Extract per-enemy gameplay stats (HP, niceName, type) from the mob_* EPB prefabs.
Odin-decodes each allow-listed GameObject's components. Output: extracted/json/enemy_stats.json
Run from packages/datamine/ :  python scripts/extract_enemy_stats.py
"""
import UnityPy, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from odin_parser import decode

BASE = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/'
BUNDLES = ['epb_assets_all.bundle']

# EPB names (without the _epb suffix) we care about. Everything else is skipped.
ALLOW = {
    'mob_ghoul', 'mob_ghoul_melee', 'mob_ghoul_turret',
    'mob_ironclad_Buckler', 'mob_ironclad_Falchion', 'mob_ironclad_Tophelm',
}

def component_type(c):
    return str(c.get('$type', '')).split(',')[0].split('.')[-1]

def find_hp(doc):
    """Scan the HealthDataComponent for the first health-like numeric (handles a scalar
    `value` or a nested {value:{...}} shape). Returns int HP or None."""
    for c in doc.get('components', {}).get('$items', []):
        if not isinstance(c, dict) or 'HealthDataComponent' not in component_type(c):
            continue
        # HealthDataComponent may store HP as a scalar `value` or nested under `value`.
        v = c.get('value')
        if isinstance(v, (int, float)):
            return int(v)
        if isinstance(v, dict):
            for k in ('value', 'health', 'maxHealth', 'hp'):
                if isinstance(v.get(k), (int, float)):
                    return int(v[k])
        for k in ('health', 'maxHealth', 'hp', 'maxHp'):
            if isinstance(c.get(k), (int, float)):
                return int(c[k])
    return None

def find_nice_name(doc):
    for c in doc.get('components', {}).get('$items', []):
        if isinstance(c, dict) and 'NiceNameDataComponent' in component_type(c):
            return c.get('name') or c.get('value')
    return None

def classify(types):
    if any('Trampler' in t or 'Walker' in t for t in types):
        return 'enemy-trampler'
    return 'creature'

result, errors = {}, 0
for b in BUNDLES:
    env = UnityPy.load(BASE + b)
    objs = {obj.path_id: obj for obj in env.objects}
    for obj in env.objects:
        if obj.type.name != 'GameObject':
            continue
        try:
            go = obj.read()
            name = go.m_Name
            if not name.endswith('_epb') or name.removesuffix('_epb') not in ALLOW:
                continue
            comps = go.m_Component if hasattr(go, 'm_Component') else go.m_Components
            merged = {'components': {'$items': []}}
            for c in comps:
                ptr = c['component'] if isinstance(c, dict) else c.component
                pid = ptr['m_PathID'] if isinstance(ptr, dict) else ptr.path_id
                o = objs.get(pid)
                if not o or o.type.name != 'MonoBehaviour':
                    continue
                t = o.read_typetree()
                sb = t.get('serializationData', {}).get('SerializedBytes', [])
                if not sb:
                    continue
                try:
                    doc = decode(sb)
                except Exception:
                    errors += 1
                    continue
                merged['components']['$items'].extend(doc.get('components', {}).get('$items', []))
            types = [component_type(c) for c in merged['components']['$items'] if isinstance(c, dict)]
            key = name.removesuffix('_epb')
            result[key] = {
                'hp': find_hp(merged),
                'niceName': find_nice_name(merged),
                'type': classify(types),
                'components': sorted(set(types)),
            }
        except Exception:
            errors += 1

os.makedirs('extracted/json', exist_ok=True)
json.dump(result, open('extracted/json/enemy_stats.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'{len(result)} enemies extracted, {errors} decode errors')
print(json.dumps(result, indent=1, ensure_ascii=False))
```

- [ ] **Step 2: Run the extractor and verify output**

Run (from `packages/datamine/`): `python scripts/extract_enemy_stats.py`
Expected: prints `6 enemies extracted, ...` and a JSON block where each of the 6 allow-listed keys has a numeric `hp` (ghouls ≈ 100; ironclads ≈ 4000–5000), a `type` (`creature` for ghouls, `enemy-trampler` for ironclads), and a `components` list.

If any `hp` is `null`: inspect that enemy's `components` list in the output to see the real health-component name/shape, and adjust `find_hp` accordingly (add the actual key, or the actual component-type fragment). Re-run until all 6 have HP. If `type` is wrong for ironclads, check `components` for the trampler/walker class name and widen `classify`.

- [ ] **Step 3: Commit the script only**

`extracted/json/enemy_stats.json` is a gitignored Stage-A intermediate (like `entity_loot.json` from `extract_loot_spawners.py`) — it is regenerated by running this extractor on the game-files machine and consumed immediately by `build_enemies.py` (Task 8/9). Only `sek-out/enemies.json` (the transform input) is committed, in Task 9. So commit the script alone here:

```bash
git add packages/datamine/scripts/extract_enemy_stats.py
git commit -m "$(cat <<'EOF'
feat(datamine): extract_enemy_stats.py — HP/name/type from mob_* EPBs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

Leave `extracted/json/enemy_stats.json` in place on disk (uncommitted) — Task 8's test uses fixtures, and Task 9 reads this local file to build the committed `enemies.json`.

---

## Task 7: `loot_resolve.py` — shared item-id → wiki-slug resolver

**Files:**
- Create: `packages/datamine/scripts/loot_resolve.py`
- Test: `packages/datamine/scripts/test_loot_resolve.py`

A pure resolver factory (aliases → drop-suffix strip → id/name match), unit-tested in isolation. `build_enemies.py` (Task 8) uses it to turn loot-table item ids into wiki slugs.

- [ ] **Step 1: Write the failing test**

Create `packages/datamine/scripts/test_loot_resolve.py`:

```python
from loot_resolve import make_resolver

WIKI = [
    {"id": "item_pistolAmmo", "slug": "pistol-ammo", "name": "Pistol Ammo"},
    {"id": "item_resourceMetal_t1", "slug": "metal-t1", "name": "Metal"},
    {"id": "item_alloySteel", "slug": "resource-alloy-steel", "name": "Alloy Steel"},
]
ALIASES = {"game_coinCrownPile_10": "coin-crown"}

def test_alias_wins():
    r = make_resolver(WIKI, ALIASES)
    # alias target not in WIKI list -> resolved False but slug returned
    assert r("game_coinCrownPile_10") == ("coin-crown", "game_coinCrownPile_10", False)

def test_direct_id_match():
    r = make_resolver(WIKI, ALIASES)
    assert r("item_pistolAmmo") == ("pistol-ammo", "Pistol Ammo", True)

def test_drop_suffix_strip():
    r = make_resolver(WIKI, ALIASES)
    assert r("item_resourceMetal_t1_mobDrop") == ("metal-t1", "Metal", True)

def test_unresolved():
    r = make_resolver(WIKI, ALIASES)
    slug, name, ok = r("item_totallyUnknown", fallback_name="Unknown Thing")
    assert slug is None and ok is False and name == "Unknown Thing"
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `packages/datamine/scripts/`): `python -m pytest test_loot_resolve.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'loot_resolve'`.

- [ ] **Step 3: Write the resolver**

Create `packages/datamine/scripts/loot_resolve.py`:

```python
"""Pure item-id -> wiki-slug resolver, shared by loot/enemy builders.
make_resolver(wiki_items, aliases) -> resolve(lid, fallback_name=None) -> (slug|None, name, ok).
Match order: explicit alias -> exact id (case-insensitive) -> drop-suffix strip -> name match.
"""
import re

DROP_SUFFIX = re.compile(r"(_mob ?drop|_mine ?drop|mobdrop|minedrop)$", re.I)

def make_resolver(wiki_items, aliases):
    by_id = {w["id"]: w for w in wiki_items if w.get("id")}
    by_id_lc = {w["id"].lower(): w for w in wiki_items if w.get("id")}
    by_name = {w["name"].lower(): w for w in wiki_items if w.get("name")}
    by_slug = {w["slug"]: w for w in wiki_items if w.get("slug")}

    def resolve(lid, fallback_name=None):
        name = fallback_name or lid
        if lid in aliases:
            s = aliases[lid]
            w = by_slug.get(s)
            return s, (w["name"] if w else name), (w is not None)
        w = by_id.get(lid) or by_id_lc.get(lid.lower())
        if w:
            return w["slug"], w["name"], True
        base = DROP_SUFFIX.sub("", lid)
        if base != lid:
            w = by_id.get(base) or by_id_lc.get(base.lower())
            if w:
                return w["slug"], w["name"], True
        if name.lower() in by_name:
            w = by_name[name.lower()]
            return w["slug"], w["name"], True
        return None, name, False

    return resolve
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `packages/datamine/scripts/`): `python -m pytest test_loot_resolve.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/datamine/scripts/loot_resolve.py packages/datamine/scripts/test_loot_resolve.py
git commit -m "$(cat <<'EOF'
feat(datamine): shared loot_resolve.py item-id -> wiki-slug resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `build_enemies.py` + `enemy-overrides.json`

**Files:**
- Create: `packages/datamine/transform/overrides/enemy-overrides.json`
- Create: `packages/datamine/scripts/build_enemies.py`
- Test: `packages/datamine/scripts/test_build_enemies.py`

Joins `enemy_stats.json` (HP) + `loot_sources.json` (already-computed drops) + `enemy-overrides.json` (enemy defs + aliases), resolving item ids to wiki slugs against the shipped `generated/entities.json`. Upior loot is grouped per variant (via each variant's `lootEffort` matching a `loot_sources` cell); Ironclad loot is a single merged pool (the caliber split is already collapsed at the `loot_sources` stage) plus its guaranteed drops. Testable via subprocess + tmp fixtures (mirrors `test_build_localization.py`), using cwd-relative input paths and a `WIKI_ENTITIES` env override for the cross-package snapshot.

- [ ] **Step 1: Write the overrides file**

Create `packages/datamine/transform/overrides/enemy-overrides.json`:

```json
{
 "_doc": "Enemy NPC definitions + item-slug aliases for build_enemies.py. lootEffort maps a variant to a loot_sources 'Mob Drops' cell effort; enemies with a top-level lootGroup use a single merged pool from their lootSource.",
 "itemSlugAliases": {
  "game_coinCrownPile_10": "coin-crown",
  "game_ValuablePiles01_mobDrop": "small-valuables",
  "item_alloySteel": "resource-alloy-steel"
 },
 "enemies": [
  {
   "id": "upior", "slug": "upior", "name": "Upiór", "type": "creature", "icon": null,
   "lootSource": "Mob Drops",
   "variants": [
    { "name": "Ranged", "epb": "mob_ghoul", "lootEffort": "ranged mob" },
    { "name": "Melee", "epb": "mob_ghoul_melee", "lootEffort": "melee mob" },
    { "name": "Melee (Shovel)", "epb": "mob_ghoul_turret", "lootEffort": "melee mob (tool)" }
   ]
  },
  {
   "id": "ironclad", "slug": "ironclad", "name": "Ironclad", "type": "enemy-trampler", "icon": null,
   "lootSource": "Ironclad Loot Box",
   "lootGroup": "Cargo",
   "variants": [
    { "name": "Buckler", "epb": "mob_ironclad_Buckler" },
    { "name": "Falchion", "epb": "mob_ironclad_Falchion" },
    { "name": "Tophelm", "epb": "mob_ironclad_Tophelm" }
   ]
  }
 ]
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/datamine/scripts/test_build_enemies.py`:

```python
import json, subprocess, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _write(base, rel, obj):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")

def test_build_enemies(tmp_path):
    _write(tmp_path, "extracted/json/enemy_stats.json", {
        "mob_ghoul": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ghoul_melee": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ghoul_turret": {"hp": 100, "niceName": "Upior", "type": "creature", "components": []},
        "mob_ironclad_Buckler": {"hp": 5000, "niceName": None, "type": "enemy-trampler", "components": []},
        "mob_ironclad_Falchion": {"hp": 4000, "niceName": None, "type": "enemy-trampler", "components": []},
        "mob_ironclad_Tophelm": {"hp": 4000, "niceName": None, "type": "enemy-trampler", "components": []},
    })
    _write(tmp_path, "sek-out/loot_sources.json", [
        {"name": "Mob Drops", "tiers": [], "efforts": [], "mandatory": [], "cells": {
            "0|ranged mob": {"tier": None, "effort": "ranged mob", "sets": 1,
                "voyage": [{"item": "item_pistolAmmo", "pct": 100.0, "min": 1, "max": 1}],
                "storm":  [{"item": "item_pistolAmmo", "pct": 100.0, "min": 1, "max": 2}]},
            "0|melee mob": {"tier": None, "effort": "melee mob", "sets": 1,
                "voyage": [{"item": "game_coinCrownPile_10", "pct": 50.0, "min": 1, "max": 1}],
                "storm":  [{"item": "game_coinCrownPile_10", "pct": 50.0, "min": 1, "max": 1}]},
            "0|melee mob (tool)": {"tier": None, "effort": "melee mob (tool)", "sets": 1,
                "voyage": [], "storm": []},
        }},
        {"name": "Ironclad Loot Box", "tiers": [], "efforts": [], "cells": {
            "0|": {"tier": None, "effort": None, "sets": 4,
                "voyage": [{"item": "item_weaponParts", "pct": 80.0, "min": 5, "max": 10}],
                "storm":  [{"item": "item_weaponParts", "pct": 80.0, "min": 5, "max": 10}]}},
         "mandatory": [{"item": "item_alloySteel", "min": 1, "max": 1}]},
    ])
    _write(tmp_path, "transform/overrides/enemy-overrides.json",
           json.loads((HERE.parent / "transform" / "overrides" / "enemy-overrides.json").read_text(encoding="utf-8")))
    wiki = tmp_path / "wiki-entities.json"
    wiki.write_text(json.dumps([
        {"id": "item_pistolAmmo", "slug": "pistol-ammo", "name": "Pistol Ammo", "kind": "item"},
        {"id": "item_weaponParts", "slug": "weapon-parts", "name": "Weapon Parts", "kind": "item"},
        {"id": "item_alloySteel", "slug": "resource-alloy-steel", "name": "Alloy Steel", "kind": "item"},
        {"id": "game_coinCrownPile_10", "slug": "coin-crown", "name": "Coin (Crown)", "kind": "item"},
    ]), encoding="utf-8")

    env = {**os.environ, "WIKI_ENTITIES": str(wiki)}
    subprocess.run([sys.executable, str(HERE / "build_enemies.py")], cwd=tmp_path, check=True, env=env)

    data = json.loads((tmp_path / "sek-out" / "enemies.json").read_text(encoding="utf-8"))
    enemies = {e["id"]: e for e in data["enemies"]}

    upior = enemies["upior"]
    assert upior["type"] == "creature" and upior["icon"] is None
    assert [v["hp"] for v in upior["variants"]] == [100, 100, 100]
    ranged = [r for r in upior["loot"] if r["group"] == "Ranged"]
    assert ranged and ranged[0]["slug"] == "pistol-ammo" and ranged[0]["storm"] == "1-2"

    ic = enemies["ironclad"]
    assert [v["name"] for v in ic["variants"]] == ["Buckler", "Falchion", "Tophelm"]
    assert [v["hp"] for v in ic["variants"]] == [5000, 4000, 4000]
    cargo = [r for r in ic["loot"] if r["group"] == "Cargo"]
    guaranteed = [r for r in ic["loot"] if r["group"] == "Guaranteed"]
    assert cargo and cargo[0]["slug"] == "weapon-parts"
    assert guaranteed and guaranteed[0]["slug"] == "resource-alloy-steel" and guaranteed[0]["chance"] == 100.0
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `packages/datamine/scripts/`): `python -m pytest test_build_enemies.py -v`
Expected: FAIL — `build_enemies.py` doesn't exist (subprocess raises `CalledProcessError`, or file-not-found).

- [ ] **Step 4: Write the builder**

Create `packages/datamine/scripts/build_enemies.py`:

```python
"""Build sek-out/enemies.json from enemy_stats.json + loot_sources.json + enemy-overrides.json.
Upior loot groups per variant (variant.lootEffort -> a 'Mob Drops' cell); Ironclad loot is one
merged 'Cargo' pool + a 'Guaranteed' group (mandatory drops). Item ids resolve to wiki slugs via
loot_resolve against the shipped generated entities snapshot (WIKI_ENTITIES env, default
../data/generated/entities.json). Run from packages/datamine/ : python scripts/build_enemies.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loot_resolve import make_resolver

WIKI_ENTITIES = os.environ.get("WIKI_ENTITIES", "../data/generated/entities.json")

enemy_stats = json.load(open("extracted/json/enemy_stats.json", encoding="utf-8"))
sources = {s["name"]: s for s in json.load(open("sek-out/loot_sources.json", encoding="utf-8"))}
ov = json.load(open("transform/overrides/enemy-overrides.json", encoding="utf-8"))
wiki_items = [e for e in json.load(open(WIKI_ENTITIES, encoding="utf-8")) if e.get("id")]

resolve = make_resolver(wiki_items, ov.get("itemSlugAliases", {}))

def fmt_range(lo, hi):
    return str(lo) if lo == hi else f"{lo}-{hi}"

def rows_from_cell(cell, group):
    """One loot cell (voyage/storm item lists) -> loot rows; chance = max pct across modes."""
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
        chance = max(x[2] for x in (v, s) if x)
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
    variants = [{"name": v["name"], "hp": enemy_stats.get(v["epb"], {}).get("hp")} for v in edef["variants"]]

    loot = []
    if any("lootEffort" in v for v in edef["variants"]):
        # Per-variant grouping (Upior): each variant -> the matching effort cell.
        eff = cells_by_effort(src)
        for v in edef["variants"]:
            cell = eff.get(v.get("lootEffort"))
            if cell:
                loot.extend(rows_from_cell(cell, v["name"]))
    else:
        # Single merged pool (Ironclad): all cells under one group label.
        group = edef.get("lootGroup", "Drops")
        for cell in src.get("cells", {}).values():
            loot.extend(rows_from_cell(cell, group))

    # Guaranteed (mandatory) drops -> a 100% "Guaranteed" group.
    for m in src.get("mandatory", []):
        slug, name, ok = resolve(m["item"])
        rng = fmt_range(m["min"], m["max"])
        loot.append({"group": "Guaranteed", "slug": slug, "name": name, "chance": 100.0,
                     "voyage": rng, "storm": rng, "resolved": ok})

    unresolved += [r["name"] for r in loot if not r["resolved"]]
    out.append({
        "id": edef["id"], "slug": edef["slug"], "name": edef["name"],
        "type": edef["type"], "icon": edef.get("icon"),
        "variants": variants, "loot": loot,
    })

artifact = {"meta": {"source": "enemy_stats.json + loot_sources.json", "enemies": len(out)}, "enemies": out}
os.makedirs("sek-out", exist_ok=True)
json.dump(artifact, open("sek-out/enemies.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

print(f"enemies: {len(out)}")
for e in out:
    print(f"  {e['slug']}: {len(e['variants'])} variants, {len(e['loot'])} loot rows")
if unresolved:
    print(f"unresolved loot items ({len(unresolved)}): {sorted(set(unresolved))}")
    print("  -> add an itemSlugAliases entry in transform/overrides/enemy-overrides.json")
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `packages/datamine/scripts/`): `python -m pytest test_build_enemies.py -v`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add packages/datamine/scripts/build_enemies.py packages/datamine/scripts/test_build_enemies.py packages/datamine/transform/overrides/enemy-overrides.json
git commit -m "$(cat <<'EOF'
feat(datamine): build_enemies.py -> sek-out/enemies.json (+ overrides)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: End-to-end pipeline run + verify + commit generated data

**Files:**
- Regenerate + commit: `packages/datamine/sek-out/enemies.json`, `packages/data/generated/{entities,links}.json`

Runs the real Stage-A build over the checked-in `loot_sources.json` + `enemy_stats.json`, then the TS transform, and verifies the two enemy entities and their loot land correctly in the shipped dataset.

- [ ] **Step 1: Build the real enemies dataset**

Run (from `packages/datamine/`): `python scripts/build_enemies.py`
Expected: prints `enemies: 2`, each with 3 variants and a non-zero loot-row count. If it prints `unresolved loot items`, add each id to `itemSlugAliases` in `enemy-overrides.json` (map to the correct existing wiki slug — look it up in `packages/data/generated/entities.json`), then re-run until unresolved is empty or only genuinely-unreleased items remain. Note any deliberately-left-unresolved items in the commit message.

- [ ] **Step 2: Run the full transform**

Run (from repo root): `pnpm --filter @sandlabs/datamine transform`
Expected: exits 0; the log now shows `enemies: merged 2 NPC entities` and `enemy loot: N link(s) across 2 enemies` (N > 0), and `missing images` reports no new enemy entries under `needsExtraction`. No `REFUSING: ... slug(s) would be removed` line (enemies are additions only). If a dangling-refs warning lists an enemy loot target, that item slug is wrong — fix the alias and rebuild (Step 1).

- [ ] **Step 3: Verify the generated data**

Run (from repo root):

```bash
node -e "const e=require('./packages/data/generated/entities.json'); const l=require('./packages/data/generated/links.json'); for(const s of ['upior','ironclad']){const x=e.find(y=>y.slug===s); console.log(s, x?('kind='+x.kind+' cat='+x.category+' hp='+JSON.stringify(x.enemyStats.variants.map(v=>v.hp))):'MISSING'); console.log('  loot links:', l.filter(k=>k.role==='loot'&&k.sourceSlug===s).length);} const back=l.filter(k=>k.role==='loot'&&(k.sourceSlug==='upior'||k.sourceSlug==='ironclad')).map(k=>k.targetSlug); console.log('sample drop targets:', [...new Set(back)].slice(0,8).join(', '));"
```

Expected: `upior kind=enemy cat=creatures hp=[100,100,100]` with loot links > 0; `ironclad kind=enemy cat=enemy-tramplers hp=[5000,4000,4000]` with loot links > 0; sample drop targets are real item slugs (e.g. `pistol-ammo`, `resource-alloy-steel`).

- [ ] **Step 4: Run the full TS test suite (no regressions)**

Run (from repo root): `pnpm --filter @sandlabs/datamine test`
Expected: all transform tests pass (including the new `enemies.test.ts` and updated `images.test.ts`).

- [ ] **Step 5: Commit the regenerated datasets**

```bash
git add packages/datamine/sek-out/enemies.json packages/data/generated/entities.json packages/data/generated/links.json
git commit -m "$(cat <<'EOF'
feat(data): mine Upior + Ironclad enemy entities, stats, and loot links

Two kind:"enemy" entities with per-variant HP and combined loot tables
(role:"loot" links). Item pages now backlink to the enemies that drop them.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Document the new pipeline steps

**Files:**
- Modify: `packages/datamine/UPDATE_PIPELINE.md`
- Modify: `packages/datamine/README.md`

- [ ] **Step 1: Add the enemy steps to `UPDATE_PIPELINE.md`**

In the Stage A extract→build sequence, add (in the appropriate spot, after the loot-spawner / loot-sources steps):

```markdown
- `python scripts/extract_enemy_stats.py` — Odin-decodes HP / niceName / type off the
  allow-listed `mob_ghoul*` / `mob_ironclad_*` EPBs → `extracted/json/enemy_stats.json`
  (committed input). If an HP comes out null, inspect the printed `components` list and
  adjust `find_hp` (field/component name recovered from metadata, not a code dump).
- `python scripts/build_enemies.py` — joins `enemy_stats.json` + `loot_sources.json` +
  `enemy-overrides.json`, resolving drop items to wiki slugs → `sek-out/enemies.json`.
  Add unresolved item ids to `transform/overrides/enemy-overrides.json` → `itemSlugAliases`.
```

And in the Stage B / transform description, note: "The transform now also merges `sek-out/enemies.json` into `kind:"enemy"` entities (`transform/enemies.ts`), emitting `role:"loot"` links from each enemy. Enemies are additions-only, so the first landing needs **no** `--allow-slug-changes`."

- [ ] **Step 2: Add the enemy files to the `README.md` directory-roles list**

Add bullets noting `scripts/extract_enemy_stats.py`, `scripts/build_enemies.py`, `scripts/loot_resolve.py`, `transform/enemies.ts`, `transform/overrides/enemy-overrides.json`, and that `sek-out/enemies.json` + `extracted/json/enemy_stats.json` are committed enemy inputs.

- [ ] **Step 3: Commit**

```bash
git add packages/datamine/UPDATE_PIPELINE.md packages/datamine/README.md
git commit -m "$(cat <<'EOF'
docs(datamine): document enemy NPC extract/build/transform steps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 Done — Verification Summary

At completion:
- `pnpm --filter @sandlabs/datamine test` — all transform tests green.
- `python -m pytest scripts/test_loot_resolve.py scripts/test_build_enemies.py` (from `packages/datamine/scripts/`) — green.
- `packages/data/generated/entities.json` contains `upior` (creature, HP [100,100,100]) and `ironclad` (enemy-trampler, HP [5000,4000,4000]), both `kind:"enemy"`.
- `packages/data/generated/links.json` has `role:"loot"` links from both enemies to real item slugs; item pages backlink automatically.
- `reports/missing-images.json` counts null enemy icons under `byDesign`, not `needsExtraction`.

**Not yet visible in the wiki** — `kind:"enemy"` has no route/renderer yet. That is **Phase 2**, authored as a separate plan (`/enemies` list + detail routes, `EntityDetail` enemy branch with the HP-variant table + `LootTable`, and nav taxonomy) once this data is merged and reviewed.

---

## Follow-up (Phase 2 preview — not part of this plan)

For the next plan's author: the wiki UI touch-points are `apps/wiki/src/app/environment/[slug]/page.tsx` (template for a detail route + `EntityDetail` usage), `apps/wiki/src/components/{EntityDetail,LootTable,StatGrid,StatBox}.tsx`, `apps/wiki/src/lib/{queries,taxonomy,entity-links,loot}.ts`, and `apps/wiki/src/components/MainNav.tsx`. Enemy loot rows already carry the variant/group in `tier`, so `groupLootByTier` + `LootTable` render them with no new component.
