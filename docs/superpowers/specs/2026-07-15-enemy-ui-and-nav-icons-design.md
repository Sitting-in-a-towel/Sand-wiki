# Enemy Wiki UI (Phase 2) + Top-Nav Section Icons

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Branch:** `feat/enemy-npc-datamining` (continues from Phase 1)

## Context

Phase 1 (data pipeline, merged into the branch) shipped two `kind:"enemy"`
entities — **Upior** (creature) and **Ironclad** (enemy-trampler) — with
per-variant HP (`enemyStats`) and `role:"loot"` links, into
`packages/data/generated/`. They are **not yet visible** in the wiki: there is no
`/enemies` route, no `entityHref` case, and the taxonomy has no Enemies section.

This spec covers two bundled pieces of wiki-UI work:
- **Design A — Phase 2:** render the enemy entities as wiki pages.
- **Design B:** add icons to the top-level navigation entries (which are text-only
  today), including the new Enemies entry.

Both are `apps/wiki` UI work; they share the taxonomy and nav files, so they ship
in one plan.

---

## Design A — Phase 2: Enemy wiki UI

Mirrors the existing `environment` section end-to-end.

### Routes
- `/enemies` — **category-card landing** (matches `app/environment/page.tsx`):
  shows "Creatures" and "Enemy Tramplers" category cards; clicking a card goes to
  `/enemies?category=creatures` (a `CategoryQuickNav` sidebar + `EntityCard` grid).
- `/enemies/[slug]` — detail page via the shared `EntityDetail` shell.

### Detail page (`app/enemies/[slug]/page.tsx`, cloned from `environment/[slug]`)
- **Icon/hero:** `EntityDetail` `icon={{ name, icon: entity.icon, categorySlug: entity.category }}`.
  Enemies have `icon:null`, so the hero renders the category glyph placeholder
  (via `ItemIcon` → `CategoryIcon`) — expected and acceptable.
- **Type badge:** `CategoryTag` on the entity's category (`creatures` /
  `enemy-tramplers`).
- **HP table:** a `StatGrid` built from `enemyStats.variants` — one `StatCell` per
  variant (label = variant name e.g. "Buckler", value = HP e.g. "5000"). Rendered
  via a new small `enemyStatCells(variants)` helper (near `StatBox.tsx`, analogous
  to `itemStatCells`). Passed to `EntityDetail`'s `stats` prop.
- **Loot:** reuse `groupLootByTier` + `LootTable`. The loot links' `tier` field
  holds the group label (Ranged / Melee / Melee (Shovel) / Cargo / Guaranteed), so
  each group becomes a tab — identical to how environment renders per-tier loot.
- **Metadata:** `generateMetadata` cloned from environment; canonical
  `/enemies/${slug}`.

### Wiring (small, per the codebase exploration)
- **`lib/taxonomy.ts`:** add an `Enemies` section to `SECTIONS`
  (`{ slug: "enemies", label: "Enemies", kind: "data", categories: [
  {slug:"creatures",label:"Creatures"}, {slug:"enemy-tramplers",label:"Enemy Tramplers"} ] }`).
  Add an `enemyCategories` const + `ENEMY_CATEGORY_SLUGS` / `isEnemyCategory`
  helper (mirroring the env helpers). Add `creatures` + `enemy-tramplers` to
  `CATEGORY_COLORS`.
- **`components/CategoryIcon.tsx`:** add glyphs for `creatures` (e.g.
  `GiDeathSkull`) and `enemy-tramplers` (e.g. `GiWalkingTurret` / a mech glyph)
  to the `ICONS` map.
- **`lib/entity-links.ts`:** add `case "enemy": return \`/enemies/${slug}\`;` to
  `entityHref`. This makes the item-page "dropped by" backlinks (incoming
  `role:"loot"` from enemy sources) clickable. Note the parallel `entityHref` in
  `lib/proposal-schema.ts` is keyed on legacy proposal-type names and is NOT
  updated (enemies are not user-proposable in this phase).
- **`packages/data/src/accessors.ts`:** add `"enemy"` to the `entityPaths`
  allowlist so `/enemies/[slug]` gets static params + sitemap coverage.
- **`lib/queries.ts`:** add `getEnemyBySlug` (clone `getEnvEntityBySlug`; guard
  `kind !== "enemy"`; resolve `loot` outgoing links), `listEnemies(category,
  isAdmin)` (clone `listEnvEntities`), `enemyCategoryCounts()` (→
  `data.categoryCounts("enemy")`).

### Reused unchanged
`EntityDetail`, `EntityCard`, `CategoryEntryCard`, `CategoryQuickNav`,
`CategoryTag`, `SectionBanner`, `LootTable`, `StatGrid`, `lib/loot.ts`,
`lib/entity-links.ts#groupLootByTier`.

### Out of scope (Phase 2)
- Enemy hero art / real icons (they stay glyph-placeholder for now).
- Admin editing of enemies (no proposal-schema wiring).
- Attack/movement/vision stats (deferred in Phase 1).

---

## Design B — Top-nav section icons

Top-level nav entries (Items, Environment, Tramplers, Tech Tree, Builder, Gallery,
Data, and the new Enemies) currently render as **text only** — only the dropdown
sub-items have glyphs (via `CategoryIcon`). Add an icon beside each top-level
entry.

- **New `SectionIcon` component** (sibling to `CategoryIcon`, same
  `react-icons/gi` family) backed by a `SECTION_ICONS` map keyed by **section
  slug**: `items`, `environment`, `tramplers`, `tech`, `builder`, `gallery`,
  `enemies`, `admin`. Falls back to a neutral default for unmapped slugs. Kept
  separate from the category `ICONS` map (different keyspace: section slugs vs
  category slugs).
- **`components/MainNav.tsx`:** render `<SectionIcon slug={section.slug} .../>`
  beside each top-level trigger (data sections) and link (link sections).
- **`components/MobileNav.tsx`:** render the section icon in its section list too,
  for consistency.
- Icons chosen to fit the existing `gi` aesthetic (e.g. items→box, environment→
  island/castle, tramplers→tank, tech→flask/tree, builder→wrench, enemies→skull,
  gallery→images, admin/data→database).

### Out of scope (Design B)
- Restyling the nav layout/spacing beyond adding the icon element.
- Section icons anywhere other than the desktop + mobile nav.

---

## Testing

- **Unit:** the wiki uses Vitest for component/lib tests. Add/extend:
  - `enemyStatCells` helper test (variants → StatCell[]).
  - `entityHref` test covering the new `"enemy"` case.
  - taxonomy: `isEnemyCategory` test.
  - `SectionIcon` render test (known slug → icon, unknown → fallback).
- **E2E:** the repo has a Playwright suite (baseline partly red pre-existing — red
  ≠ regression). Add a smoke check that `/enemies` and `/enemies/upior` render
  (title + a loot row + HP), if the e2e harness is reasonably runnable; otherwise
  verify via `next build` + a dev-server fetch.
- **Build:** `next build` (or the app's typecheck+lint) must pass; the static
  params for `/enemies/[slug]` must include both enemies (via `entityPaths`).
- **Manual/driven:** load `/enemies`, both category views, `/enemies/upior`,
  `/enemies/ironclad`; confirm HP table + loot tabs; confirm an item page dropped
  by an enemy shows a clickable "dropped by" backlink; confirm the top nav shows
  icons on every section incl. Enemies.

## Known risks / notes
- **Two `entityHref` functions:** only `lib/entity-links.ts` is updated;
  `lib/proposal-schema.ts` intentionally left (enemies not proposable yet).
- **`entityPaths` allowlist** must include `"enemy"` or the detail route 404s in a
  static export / misses the sitemap.
- **Icon aesthetics** are subjective — glyph picks are a first pass, easily
  swapped in `CategoryIcon.tsx` / `SECTION_ICONS`.
- **Loot tab ordering:** `groupLootByTier` orders by first-seen; enemy groups will
  appear in `enemies.json` order (variants first, then Guaranteed). Acceptable; a
  sort tweak can follow if desired.
