# Enemy Wiki UI (Phase 2) + Top-Nav Section Icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase-1 enemy entities (Upior, Ironclad) visible in the wiki as `/enemies` pages (category-card landing + detail with HP table and loot tabs), and add an icon beside every top-level nav entry.

**Architecture:** Pure `apps/wiki` UI work mirroring the existing `environment` section. Add an `Enemies` section to the taxonomy, category glyphs, an `entityHref` case, an `entityPaths` allowlist entry, three query functions, an `enemyStatCells` helper, and two new route files (landing + detail) cloned from `environment`. Separately, add a `SectionIcon` component + `SECTION_ICONS` map rendered in `MainNav`/`MobileNav`.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Vitest, react-icons/gi. Runs via npm workspaces.

**Branch:** `feat/enemy-npc-datamining` (already checked out — continues from Phase 1). Repo root `d:\Documents\SandLabs`; run npm from root. Use the Bash tool (Git Bash) for commit heredocs. The "LF will be replaced by CRLF" warning is normal.

**Tooling:** npm workspaces (NOT pnpm). Test a file: `npm run test --workspace=apps/wiki -- run src/<path>.test.ts`. Full wiki tests: `npm run test --workspace=apps/wiki`. Typecheck: `npx tsc --noEmit -p apps/wiki/tsconfig.json`. Lint: `npm run lint --workspace=apps/wiki`. Build: `npm run build --workspace=apps/wiki`.

---

## File Structure

**Create:**
- `apps/wiki/src/lib/enemy-view.ts` — `enemyStatCells(variants)` helper.
- `apps/wiki/src/lib/enemy-view.test.ts` — its test.
- `apps/wiki/src/components/SectionIcon.tsx` — section-slug→glyph component + `SECTION_ICONS`.
- `apps/wiki/src/components/SectionIcon.test.tsx` — its test.
- `apps/wiki/src/app/enemies/page.tsx` — landing (category cards + category grid).
- `apps/wiki/src/app/enemies/[slug]/page.tsx` — detail page.

**Modify:**
- `packages/data/src/accessors.ts` — add `"enemy"` to `entityPaths` allowlist.
- `apps/wiki/src/lib/entity-links.ts` — add `"enemy"` case to `entityHref` (+ test file).
- `apps/wiki/src/lib/entity-links.test.ts` — new/extended test for the case (create if absent).
- `apps/wiki/src/lib/taxonomy.ts` — add `Enemies` section, `enemyCategories`, `ENEMY_CATEGORY_SLUGS`/`isEnemyCategory`, `CATEGORY_COLORS` entries.
- `apps/wiki/src/lib/taxonomy.test.ts` — `isEnemyCategory` test (create if absent).
- `apps/wiki/src/components/CategoryIcon.tsx` — add `creatures` + `enemy-tramplers` glyphs.
- `apps/wiki/src/lib/queries.ts` — add `getEnemyBySlug`, `listEnemies`, `enemyCategoryCounts`.
- `apps/wiki/src/app/api/search-index/route.ts` — add an `enemies` group.
- `apps/wiki/src/components/MainNav.tsx` — render `SectionIcon` on each top-level entry.
- `apps/wiki/src/components/MobileNav.tsx` — render `SectionIcon` in the section lists.

---

## Task 1: entityHref + entityPaths for `enemy`

**Files:**
- Modify: `packages/data/src/accessors.ts`
- Modify: `apps/wiki/src/lib/entity-links.ts`
- Test: `apps/wiki/src/lib/entity-links.test.ts`

- [ ] **Step 1: Write the failing test**

Create (or extend) `apps/wiki/src/lib/entity-links.test.ts`. If the file exists, add the `describe` block below; if not, create it with the imports:

```ts
import { describe, it, expect } from "vitest";
import { entityHref } from "./entity-links";

describe("entityHref enemy case", () => {
  it("maps enemy kind to /enemies/<slug>", () => {
    expect(entityHref("enemy", "upior")).toBe("/enemies/upior");
  });
  it("still returns null for unknown kinds", () => {
    expect(entityHref("mystery", "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=apps/wiki -- run src/lib/entity-links.test.ts`
Expected: FAIL — `entityHref("enemy", "upior")` returns `null`.

- [ ] **Step 3: Add the `enemy` case**

In `apps/wiki/src/lib/entity-links.ts`, in `entityHref`, add the case before `default`:

```ts
    case "enemy": return `/enemies/${slug}`;
```

- [ ] **Step 4: Add `enemy` to the entityPaths allowlist**

In `packages/data/src/accessors.ts`, find `entityPaths` (it currently filters to `["item","environment","trampler-part"]`) and add `"enemy"` to that array. For example, change:

```ts
  const kinds = ["item", "environment", "trampler-part"];
```
to:
```ts
  const kinds = ["item", "environment", "trampler-part", "enemy"];
```

(Match the actual variable/shape in the file — the key change is including `"enemy"` so `/enemies/[slug]` gets static params + sitemap coverage. Read the function first and adapt.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test --workspace=apps/wiki -- run src/lib/entity-links.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0.
If `@sandlabs/data` needs a rebuild for the accessors change to be picked up, run `npm run build --workspace=packages/data` (or its typecheck) — expected exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/accessors.ts apps/wiki/src/lib/entity-links.ts apps/wiki/src/lib/entity-links.test.ts
git commit -m "$(cat <<'EOF'
feat(wiki): route enemy kind — entityHref case + entityPaths allowlist

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Taxonomy — Enemies section + category glyphs

**Files:**
- Modify: `apps/wiki/src/lib/taxonomy.ts`
- Modify: `apps/wiki/src/components/CategoryIcon.tsx`
- Test: `apps/wiki/src/lib/taxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

Create (or extend) `apps/wiki/src/lib/taxonomy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isEnemyCategory, getSection, categoryLabel } from "./taxonomy";

describe("enemy taxonomy", () => {
  it("recognizes enemy category slugs", () => {
    expect(isEnemyCategory("creatures")).toBe(true);
    expect(isEnemyCategory("enemy-tramplers")).toBe(true);
    expect(isEnemyCategory("weapons")).toBe(false);
  });
  it("registers the Enemies section with both categories", () => {
    const s = getSection("enemies");
    expect(s?.kind).toBe("data");
    expect(s?.categories.map((c) => c.slug)).toEqual(["creatures", "enemy-tramplers"]);
  });
  it("labels enemy categories", () => {
    expect(categoryLabel("enemy-tramplers")).toBe("Enemy Tramplers");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=apps/wiki -- run src/lib/taxonomy.test.ts`
Expected: FAIL — `isEnemyCategory` is not exported / Enemies section missing.

- [ ] **Step 3: Add the Enemies section + helpers**

In `apps/wiki/src/lib/taxonomy.ts`:

3a. Add a category const near `itemCategories`/`tramplerCategories`:

```ts
const enemyCategories: Category[] = [
  { slug: "creatures", label: "Creatures" },
  { slug: "enemy-tramplers", label: "Enemy Tramplers" },
];
```

3b. Add the section to the `SECTIONS` array — place it right after the `tramplers` entry:

```ts
  { slug: "enemies", label: "Enemies", kind: "data", categories: enemyCategories },
```

3c. Add the helpers (near the `isEnvCategory` helper):

```ts
export const ENEMY_CATEGORIES = enemyCategories;
export const ENEMY_CATEGORY_SLUGS = enemyCategories.map((c) => c.slug);

export function isEnemyCategory(slug: string): boolean {
  return ENEMY_CATEGORY_SLUGS.includes(slug);
}
```

3d. Add colors to `CATEGORY_COLORS` (in the map, e.g. after the environment block):

```ts
  // enemy categories
  creatures: "#c65f5f",
  "enemy-tramplers": "#8b94a6",
```

- [ ] **Step 4: Add the category glyphs**

In `apps/wiki/src/components/CategoryIcon.tsx`:

4a. Add the two icons to the `react-icons/gi` import list: `GiDeathSkull`, `GiWalkingTurret`.

(If `GiWalkingTurret` doesn't exist in the installed react-icons version, use `GiMechaMask` or `GiTank` — verify by checking the export resolves; `GiTank` is already imported and safe.)

4b. Add to the `ICONS` map:

```ts
  creatures: GiDeathSkull,
  "enemy-tramplers": GiWalkingTurret,
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test --workspace=apps/wiki -- run src/lib/taxonomy.test.ts` — expected PASS.
Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0 (confirms the icon imports resolve).

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/lib/taxonomy.ts apps/wiki/src/lib/taxonomy.test.ts apps/wiki/src/components/CategoryIcon.tsx
git commit -m "$(cat <<'EOF'
feat(wiki): Enemies section in taxonomy + creature/enemy-trampler glyphs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Queries — getEnemyBySlug, listEnemies, enemyCategoryCounts

**Files:**
- Modify: `apps/wiki/src/lib/queries.ts`

No dedicated unit test (thin wrappers over `@sandlabs/data`, matching the untested env queries); verified end-to-end when the pages render (Task 10).

- [ ] **Step 1: Add the three functions**

In `apps/wiki/src/lib/queries.ts`, near the environment functions (`listEnvEntities`, `getEnvEntityBySlug`, `envCategoryCounts`), add. Ensure `cache` is already imported (it is, used by `getEnvEntityBySlug`):

```ts
/** Enemy NPC entities (Upior, Ironclad), optionally filtered by category. */
export async function listEnemies(category?: string, isAdmin = false) {
  const rows = category
    ? data.listByCategory("enemy", category)
    : data.listByKind("enemy");
  return visible(rows, isAdmin).slice().sort((a, b) => a.name.localeCompare(b.name));
}

export const getEnemyBySlug = cache(async (slug: string) => {
  const entity = data.getEntity(slug);
  if (entity === null || entity.kind !== "enemy") return null;

  const allLinks = data.outgoingLinks(slug, ["loot"])
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug));
  const outgoingLinks = allLinks.map((l) => {
    const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
    return {
      ...l,
      target: t ? { slug: t.slug, kind: t.kind, name: t.name, icon: t.icon, rarity: t.rarity, category: t.category } : null,
    };
  });

  return { ...entity, outgoingLinks };
});

/** Count of enemy entities per category — for the Enemies landing. */
export async function enemyCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("enemy");
}
```

(Verify `visible` and `data` are the same helpers the env functions use in this file — reuse them exactly.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/lib/queries.ts
git commit -m "$(cat <<'EOF'
feat(wiki): enemy queries — getEnemyBySlug, listEnemies, enemyCategoryCounts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `enemyStatCells` helper

**Files:**
- Create: `apps/wiki/src/lib/enemy-view.ts`
- Test: `apps/wiki/src/lib/enemy-view.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/wiki/src/lib/enemy-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { enemyStatCells } from "./enemy-view";

describe("enemyStatCells", () => {
  it("maps each variant to a label/value HP cell", () => {
    const cells = enemyStatCells([
      { name: "Buckler", hp: 5000 },
      { name: "Falchion", hp: 4000 },
    ]);
    expect(cells).toEqual([
      { label: "Buckler", value: "5000 HP" },
      { label: "Falchion", value: "4000 HP" },
    ]);
  });
  it("renders a dash when hp is null", () => {
    expect(enemyStatCells([{ name: "Ranged", hp: null }])).toEqual([
      { label: "Ranged", value: "—" },
    ]);
  });
  it("returns [] for no variants", () => {
    expect(enemyStatCells([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=apps/wiki -- run src/lib/enemy-view.test.ts`
Expected: FAIL — module `./enemy-view` not found.

- [ ] **Step 3: Write the helper**

Create `apps/wiki/src/lib/enemy-view.ts`:

```ts
import type { StatCell } from "@/lib/item-view";
import type { EnemyStats } from "@sandlabs/data";

/** One StatGrid cell per enemy variant: label = variant name, value = "<hp> HP"
 *  (or "—" when HP is unknown). Used on the enemy detail page. */
export function enemyStatCells(variants: EnemyStats["variants"]): StatCell[] {
  return variants.map((v) => ({
    label: v.name,
    value: v.hp != null ? `${v.hp} HP` : "—",
  }));
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm run test --workspace=apps/wiki -- run src/lib/enemy-view.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/lib/enemy-view.ts apps/wiki/src/lib/enemy-view.test.ts
git commit -m "$(cat <<'EOF'
feat(wiki): enemyStatCells — per-variant HP cells for the enemy page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/enemies` landing page

**Files:**
- Create: `apps/wiki/src/app/enemies/page.tsx`

Clone `apps/wiki/src/app/environment/page.tsx` (the category-card landing + category grid), swapping env → enemy. READ `environment/page.tsx` first and adapt it — the code below is the target result.

- [ ] **Step 1: Create the page**

Create `apps/wiki/src/app/enemies/page.tsx`:

```tsx
import { getSection, isEnemyCategory } from "@/lib/taxonomy";
import { listEnemies, enemyCategoryCounts } from "@/lib/queries";
import { sessionIsAdmin } from "@/lib/auth";
import { EntityCard } from "@/components/EntityCard";
import { SectionBanner } from "@/components/SectionBanner";
import { CategoryQuickNav } from "@/components/CategoryQuickNav";
import { CategoryEntryCard, type CategoryEntry } from "@/components/CategoryEntryCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata = {
  title: "Enemies",
  description: "Enemy NPCs — creatures and enemy tramplers — in SAND: Raiders of Sophie.",
};

export default async function EnemiesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = str(sp.category);
  const category = raw && isEnemyCategory(raw) ? raw : undefined;
  const section = getSection("enemies");
  const categories = section?.categories ?? [];
  const labelOf = (slug: string) => categories.find((c) => c.slug === slug)?.label ?? slug;
  const counts = await enemyCategoryCounts();

  if (!category) {
    const entries: CategoryEntry[] = categories.map((c) => {
      const n = counts[c.slug] ?? 0;
      return {
        icon: c.slug,
        title: c.label,
        wip: false,
        href: `/enemies?category=${c.slug}`,
        meta: n > 0 ? `${n} entr${n === 1 ? "y" : "ies"}` : "Coming soon",
      };
    });
    return (
      <section className="pb-2">
        <SectionBanner
          eyebrow="Database"
          title="Enemies"
          tagline="Creatures and enemy tramplers roaming the islands — their stats and drops."
          art="azure-island"
          focal="center 38%"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <CategoryEntryCard key={e.title} entry={e} />
          ))}
        </div>
      </section>
    );
  }

  const admin = await sessionIsAdmin();
  const entities = await listEnemies(category, admin);
  return (
    <section className="py-2">
      <div className="grid items-start gap-6 lg:grid-cols-[212px_1fr]">
        <aside className="order-1">
          <CategoryQuickNav
            categories={categories}
            current={category}
            basePath="/enemies"
            label="Enemy categories"
            counts={counts}
          />
        </aside>

        <div className="order-2 min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{labelOf(category)}</h1>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {entities.length} result{entities.length === 1 ? "" : "s"}
            </span>
          </div>

          {entities.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 border border-border bg-card py-14 text-center text-muted-foreground">
              <span className="grid size-14 place-items-center border border-border bg-card-elevated text-2xl text-border-strong">
                ▦
              </span>
              <span className="font-display text-base uppercase tracking-[0.04em] text-foreground">
                Coming soon
              </span>
              <span className="max-w-xs text-sm">No entries yet for this category.</span>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {entities.map((e) => (
                <EntityCard
                  key={e.id}
                  entity={{ slug: e.slug, name: e.name, href: `/enemies/${e.slug}`, icon: e.icon, categorySlug: category, disabled: e.disabled }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
```

Note: `art="azure-island"` is reused from the environment banner as a placeholder — if `lib/art` has no entry it renders without a backdrop, which is fine. Swap for a fitting art key later if one exists (check `apps/wiki/src/lib/art.ts` for available keys).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/app/enemies/page.tsx
git commit -m "$(cat <<'EOF'
feat(wiki): /enemies landing — creatures + enemy-tramplers category cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/enemies/[slug]` detail page

**Files:**
- Create: `apps/wiki/src/app/enemies/[slug]/page.tsx`

Clone `apps/wiki/src/app/environment/[slug]/page.tsx`, dropping craftedBy/keyLinks/adminControls, and adding the HP `StatGrid` via the `stats` prop. READ the environment detail page first.

- [ ] **Step 1: Create the page**

Create `apps/wiki/src/app/enemies/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEnemyBySlug } from "@/lib/queries";
import { metaDescription } from "@/lib/site";
import { lootEntryView } from "@/lib/loot";
import { groupLootByTier, type LinkRow } from "@/lib/entity-links";
import { categoryLabel } from "@/lib/taxonomy";
import { byRarityThenName } from "@/lib/rarity";
import { enemyStatCells } from "@/lib/enemy-view";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { LootTable } from "@/components/LootTable";
import { type Tab } from "@/components/ItemTabs";
import { sessionIsAdmin } from "@/lib/auth";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const entity = await getEnemyBySlug(slug);
  if (!entity) return {};
  const description = metaDescription(
    entity.description,
    `${entity.name} — enemy stats and loot drops in SAND: Raiders of Sophie.`,
  );
  const canonical = `/enemies/${entity.slug}`;
  return {
    title: entity.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: entity.name,
      description,
      url: canonical,
      images: entity.icon ? [{ url: entity.icon }] : undefined,
    },
  };
}

export default async function EnemyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnemyBySlug(slug);
  if (!entity) notFound();

  const admin = await sessionIsAdmin();
  if (entity.disabled && !admin) notFound();

  const lootRows: LinkRow[] = entity.outgoingLinks.map((l) => ({
    targetSlug: l.target?.slug ?? null,
    targetKind: l.target?.kind ?? null,
    name: l.target?.name ?? l.name,
    icon: l.target?.icon ?? null,
    rarity: l.target?.rarity ?? null,
    amount: l.amount,
    tier: l.tier,
    value1: l.value1,
    value2: l.value2,
    value3: l.value3,
    sortOrder: l.sortOrder,
  }));

  const tierGroups = groupLootByTier(lootRows);
  const tabs: Tab[] = tierGroups.map((g) => ({
    id: `loot-${g.tier || "all"}`,
    label: g.tier || "Loot",
    content: <LootTable entries={g.rows.map(lootEntryView).sort(byRarityThenName)} />,
  }));

  const stats = enemyStatCells(entity.enemyStats?.variants ?? []);

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Enemies", href: "/enemies" },
        { label: categoryLabel(entity.category), href: `/enemies?category=${entity.category}` },
        { label: entity.name },
      ]}
      icon={{ name: entity.name, icon: entity.icon, decorative: true, categorySlug: entity.category }}
      title={entity.name}
      badges={<CategoryTag slug={entity.category} />}
      description={entity.description}
      stats={stats}
      disabled={entity.disabled}
      tabs={tabs}
      sourceUrl={entity.sourceUrl}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0. (Confirms `lootEntryView`, `byRarityThenName`, `metaDescription`, `Tab`, `sessionIsAdmin` import paths match the environment page — if any differ, copy the exact import from `environment/[slug]/page.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/app/enemies/[slug]/page.tsx
git commit -m "$(cat <<'EOF'
feat(wiki): /enemies/[slug] detail — HP table + loot tabs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add enemies to search-index

**Files:**
- Modify: `apps/wiki/src/app/api/search-index/route.ts`

- [ ] **Step 1: Add an enemies group**

In `apps/wiki/src/app/api/search-index/route.ts`, after the `places` block, add an `enemies` group and include it in the response:

```ts
  const enemies = data.listByKind("enemy")
    .filter((e) => !e.disabled)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, category: e.category }));
  return NextResponse.json({ items, places, enemies }, {
    headers: { "cache-control": "public, max-age=3600" },
  });
```

(Replace the existing `return NextResponse.json({ items, places }, ...)` with the version above. If the client search consumer strictly types the payload, this is additive — a missing consumer just ignores the new key. Do NOT wire the client dropdown to render enemies in this task unless it's a trivial mirror of the `places` group; if it needs more than a mirror, leave client rendering out and note it.)

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0.

```bash
git add apps/wiki/src/app/api/search-index/route.ts
git commit -m "$(cat <<'EOF'
feat(wiki): include enemies in the search index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `SectionIcon` component + `SECTION_ICONS` map

**Files:**
- Create: `apps/wiki/src/components/SectionIcon.tsx`
- Test: `apps/wiki/src/components/SectionIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/wiki/src/components/SectionIcon.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SectionIcon } from "./SectionIcon";

describe("SectionIcon", () => {
  it("renders an svg glyph for a known section slug", () => {
    const { container } = render(<SectionIcon slug="enemies" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("renders a fallback svg for an unknown slug", () => {
    const { container } = render(<SectionIcon slug="does-not-exist" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
```

(If `@testing-library/react` is not available in this repo, instead assert on the returned element type without rendering: import the component and call it — but prefer render if the dep exists. Check `apps/wiki/package.json` devDependencies; other `*.test.tsx` in this repo — e.g. `LootTable.test.tsx`, `StatBox.test.tsx` — show the established rendering approach; mirror it.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=apps/wiki -- run src/components/SectionIcon.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `apps/wiki/src/components/SectionIcon.tsx`:

```tsx
import type { IconType } from "react-icons";
import {
  GiCardboardBox, GiIsland, GiTank, GiFlaskWave, GiWrench,
  GiPhotoCamera, GiDeathSkull, GiDatabase,
} from "react-icons/gi";

/** Monochrome glyph for a top-level nav SECTION (keyed by section slug — a different
 *  keyspace than CategoryIcon's category slugs). Decorative: the section label text
 *  always sits beside it. Falls back to a neutral box for unmapped slugs. */
const SECTION_ICONS: Record<string, IconType> = {
  items: GiCardboardBox,
  environment: GiIsland,
  tramplers: GiTank,
  enemies: GiDeathSkull,
  tech: GiFlaskWave,
  builder: GiWrench,
  gallery: GiPhotoCamera,
  admin: GiDatabase,
};

export function SectionIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = SECTION_ICONS[slug] ?? GiCardboardBox;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
```

(If any of these `gi` icon names don't exist in the installed react-icons version, the typecheck in Step 4 will fail — substitute a close existing one, e.g. `GiIsland`→`GiCastle`, `GiFlaskWave`→`GiFlask`/`GiChemicalDrop`, `GiWrench`→`BsTools`, `GiPhotoCamera`→`GiPhotoCamera`/an images glyph, `GiDatabase`→`GiCog`. `GiTank`, `GiDeathSkull`, `GiCardboardBox` are known-good from CategoryIcon.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test --workspace=apps/wiki -- run src/components/SectionIcon.test.tsx` — expected PASS.
Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0 (confirms all icon imports resolve).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/components/SectionIcon.tsx apps/wiki/src/components/SectionIcon.test.tsx
git commit -m "$(cat <<'EOF'
feat(wiki): SectionIcon — per-section nav glyphs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Render section icons in MainNav + MobileNav

**Files:**
- Modify: `apps/wiki/src/components/MainNav.tsx`
- Modify: `apps/wiki/src/components/MobileNav.tsx`

READ both files first. No unit test (visual nav change; verified in Task 10).

- [ ] **Step 1: MainNav — import + render**

In `apps/wiki/src/components/MainNav.tsx`:

1a. Add the import:
```ts
import { SectionIcon } from "@/components/SectionIcon";
```

1b. In the `kind === "data"` branch, the `NavigationMenuTrigger` renders `{section.label}`. Change it to render the icon before the label:
```tsx
                  <SectionIcon slug={section.slug} className="size-4 shrink-0" />
                  {section.label}
```
(The trigger already has `gap-1` in `triggerCls`, so the icon + label space correctly.)

1c. In the final link branch (`const href = section.href ?? ...`), the `<Link>` renders `{section.label}`. Change it to:
```tsx
              <Link
                href={href}
                className={`${navItemCls}${isActive(href) ? " nav-tick text-primary" : ""}`}
              >
                <SectionIcon slug={section.slug} className="size-4 shrink-0" />
                {section.label}
              </Link>
```
Also add `inline-flex items-center gap-1.5` to `navItemCls` if the link isn't already a flex row (check: `navItemCls` is currently `"nav-link rounded px-2 py-1 text-sm font-semibold text-foreground hover:text-primary"` — add `inline-flex items-center gap-1.5` so icon+label align):
```ts
const navItemCls = "nav-link inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-semibold text-foreground hover:text-primary";
```
(The WIP-section branch renders `{section.label} <WipBadge/>` — leave it, or add the icon there too for consistency; optional.)

- [ ] **Step 2: MobileNav — import + render**

In `apps/wiki/src/components/MobileNav.tsx`:

2a. Add the import:
```ts
import { SectionIcon } from "@/components/SectionIcon";
```

2b. The `renderLink(slug, label, href)` helper returns a `<Link>` with `{label}`. Change it to include the icon and make the link a flex row:
```tsx
  const renderLink = (slug: string, label: string, href: string) => (
    <Link
      key={slug}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={`flex items-center gap-2.5 ${itemCls(isActive(href))}`}
    >
      <SectionIcon slug={slug} className="size-4 shrink-0" />
      {label}
    </Link>
  );
```
(The "More → About" link calls `renderLink("about", ...)` — `SectionIcon` will fall back to the neutral box for `about`, which is fine.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p apps/wiki/tsconfig.json` — expected exits 0.
Run: `npm run lint --workspace=apps/wiki` — expected no new errors (pre-existing lint baseline may be noisy; ensure you introduce none).

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/components/MainNav.tsx apps/wiki/src/components/MobileNav.tsx
git commit -m "$(cat <<'EOF'
feat(wiki): section icons on desktop + mobile nav entries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Verify end-to-end (build + drive the app)

**Files:** none (verification only).

- [ ] **Step 1: Full wiki test suite**

Run: `npm run test --workspace=apps/wiki`
Expected: the new tests pass; no NEW failures vs. the pre-existing baseline (the repo's wiki test/e2e baseline is partly red pre-existing — compare against `git stash`-clean baseline only if unsure; a pre-existing red ≠ your regression).

- [ ] **Step 2: Production build**

Run: `npm run build --workspace=apps/wiki`
Expected: build succeeds; `/enemies` and `/enemies/[slug]` appear in the route/output list, with `[slug]` statically generated for both `upior` and `ironclad` (confirms `entityPaths` includes enemy). If the build fails on the new routes, fix before proceeding.

- [ ] **Step 3: Drive the running app**

Start the dev server (`npm run dev --workspace=apps/wiki`) in the background and verify (curl or a browser-driver if available):
- `GET /enemies` → 200, shows "Creatures" + "Enemy Tramplers" category cards.
- `GET /enemies?category=creatures` → 200, lists Upior.
- `GET /enemies?category=enemy-tramplers` → 200, lists Ironclad.
- `GET /enemies/upior` → 200, shows the type badge, HP cells (100 ×3 variants), and loot tabs (Ranged/Melee/Melee (Shovel)).
- `GET /enemies/ironclad` → 200, HP cells (Buckler 5000 / Falchion 4000 / Tophelm 4000), loot tabs (Cargo, Guaranteed).
- An item dropped by an enemy (e.g. `/items/resource-alloy-steel`) shows a "dropped by" / incoming-loot reference linking to `/enemies/ironclad` (confirms `entityHref` enemy case). If the item detail page doesn't currently render incoming loot backlinks for enemies, note it — that may be a separate enhancement (the environment "loot" backlink mechanism should already cover it since role is "loot").
- The top nav shows an icon beside every section label (Items, Environment, Tramplers, Enemies, Tech Tree, Builder), and the mobile drawer likewise.

Capture the observed results (status codes + a note on each check). Use the `/run` or `verify` skill/tooling if available for driving.

- [ ] **Step 4: Report**

Summarize verification results. If everything passes, the feature is complete. If the "dropped by" backlink on item pages doesn't surface enemies, report it as a follow-up (not necessarily in-scope for this plan).

---

## Self-Review Checklist (controller, after all tasks)

- **Spec coverage:** Design A (routes, detail HP+loot, taxonomy, glyphs, entityHref, entityPaths, queries, search) — Tasks 1-7. Design B (SectionIcon + nav render) — Tasks 8-9. Verify — Task 10.
- **Type consistency:** `enemyStatCells(variants)` uses `EnemyStats["variants"]` (hp `number|null`); pages import `getEnemyBySlug`/`listEnemies`/`enemyCategoryCounts` as defined in Task 3; `entityHref("enemy",…)` matches the route path `/enemies/[slug]`; taxonomy slugs `creatures`/`enemy-tramplers` match the Phase-1 `category` values in `entities.json` and the `CategoryIcon`/`CATEGORY_COLORS` keys.
- **No placeholders:** all steps have concrete code; icon-name fallbacks are called out where the react-icons version might differ.
