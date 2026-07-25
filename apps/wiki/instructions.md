# SAND Wiki — Instructions & Conventions

Living reference for the **Unofficial SAND Wiki** (a fan wiki for *SAND: Raiders of Sophie*).
The top sections document how things work today; the **Requirements / TODO** section at the
bottom is yours to keep specifying.

> Note: `AGENTS.md` is separate and only carries the "this Next.js version differs from your
> training data — read `node_modules/next/dist/docs/` first" caveat. This file is the product/
> data/UX reference .

## Git workflow (hard rule)

- **Never merge to `master` directly.** All changes land via a pull request — do the work on a
  feature branch and **open a PR** for review. Do not fast-forward, push, or merge into `master`
  locally. (Committing/pushing still happens only when the maintainer asks; when it does, it's to a
  branch + PR, never straight to `master`.)

## Data linking (hard rule)

- **Always cross-link related data in BOTH directions.** Whenever a relationship exists between
  two entities, it must be reachable from *both* pages — never one-way. A drop must show on the
  source's page (what it drops) **and** on the dropped item's page ("dropped by …"); a recipe
  input must show on the workbench/recipe **and** on the ingredient item's page ("used in"); a
  tech unlock must show on the node **and** on the unlocked entity; a key must show on the lock
  **and** on the key item. The data layer models links as directed `EntityLink` rows, so the
  reverse view is a query (`incomingLinks`) + a rendered section — if you add a new link role or a
  new kind of source (e.g. NPCs as loot sources), you MUST also add/extend the reverse-side query
  and UI so it backlinks. A relationship that only renders on one side is an incomplete feature.

## Overview

Next.js 16 (App Router) + React 19 + Prisma 6 + Neon Postgres + Tailwind v4 + **shadcn/ui**.
**Dark-only** — one `:root` token set, `color-scheme: dark`, no theme toggle (the old DaisyUI
`desertnight`/`desertday` themes were removed in the 2026-06 redesign). Display font: Oswald;
brand wordmark: Black Ops One. Accessibility is a hard gate — axe must pass (`npm run test:e2e`).

## Data model (Prisma)

> **⚠️ The bullets below predate the unified-entity migration and are stale.** The live schema
> (`prisma/schema.prisma`) is a single **`Entity`** table (`kind` = `item` | `environment` |
> `trampler-part` | `tech-node`) with per-kind stat tables (`ItemStats` / `TramplerStats` /
> `TechNodeStats`) and one **`EntityLink`** join (`role`, optional `target`, `amount` / `tier` /
> `value1–3`, `sortOrder`) carrying every relation. Recipes remain their own `Recipe` /
> `RecipeInput` / `RecipeOutput` tables (now with a nullable `locationId`). `Entity.curated`
> guards a row from prune; `Entity.lootCurated` stops the seed recreating its loot/cost links.
> Treat the per-kind-table bullets below as historical until this section is rewritten.
>
> **EntityLink roles:** `loot` (container/landmark → item, with `tier` / `value1`), `cost`
> (trampler part → item, `amount`), `tech-unlocks` / `tech-unlock-cost` / `tech-prereq`, and the
> **key-progression pair** `requires-key` / `rewards-key` (location → key item, no extra columns).
> Roles are registered in `src/lib/entity-links.ts` (`LINK_ROLES`) and edited through the
> Edit-tabs hub like loot/cost. The key roles are **seed-safe by construction**: `seed.ts` only
> delete+recreates the roles it knows (loot / cost / tech-*), so it never touches key links. Load
> the initial chain with the surgical `npm run db:load-key-progression` (idempotent;
> `prisma/key-progression.json`) — **never** the full seed.

- **`Item`** — `slug`, `name`, `derivedName` (search-only), `description`, `category`,
  `storageStack`, `workbenchTier`, `icon`, **`rarity`** (string, indexed),
  flat wiki-stat columns **`statType`/`statValue`/`damage`/`playerDamage`/`tramplerDamage`/
  `splashDamage`/`magazine`/`ammoName`**, and recipe relations (`producedBy`/`usedIn`).
  Ammo↔weapon linking is derived from `ammoName` caliber families (`src/lib/ammo.ts`) — there is
  deliberately NO ammo FK: `ammoName` ↔ ammo item is 1:1 in the wiki data, so a relation column
  (`ammoItemId`, removed 2026-06-11) added nothing. Resolve by name if an exact item is needed.
- **`Recipe`** / `RecipeInput` / `RecipeOutput` — crafting graph; ingredients reference items.
- **`EnvEntity`** — environment content: `slug`, `category`, `name`, `description`, `sourceUrl`,
  `icon`; loot tables (loot containers only) are relational: **`lootTiers`** → **`LootTier`**
  (`tier`, `col1–3Label`, `sortOrder`, unique per entity+tier) → **`LootEntry`** (`item?` FK with
  `name` display fallback, `value1–3` strings like `"10-20"`, `sortOrder`, unique per
  tier+sortOrder).
- **`TramplerPart`** — `costEntries` → **`TramplerPartCost`** (`item?` — null for Crowns, `name`,
  `amount`, `sortOrder`, unique per part+sortOrder).

## Taxonomy (`src/lib/taxonomy.ts` — single source of truth)

- **Sections** (nav): Items (data), Environment (data), Tramplers / Tech / Tools (placeholders).
- **Item categories**: weapons, artillery, resources, attire, tools, medical, ammo, misc.
  - `categoryForItem(type, name, slug)` maps the scraper's game `type` → category at seed time:
    weapon types with a `\d+\s?mm` name → **artillery**; per-slug overrides in `CATEGORY_OVERRIDES`
    (e.g. untyped M1866 → weapons, MedKit → medical); `ENERGY` → tools.
- **Environment categories**: loot-containers, landmarks, game-modes, **creatures**, **enemy-tramplers**
  (the last two are datamined NPCs — Upior/Ironclad — modelled as `kind:"environment"` with an
  `enemyStats` HP block; the old single WIP `npcs` slot was replaced by these two).
- **Rarity** (`src/lib/rarity.ts`): Common, Uncommon, Rare, Noteworthy, Remarkable, Experimental
  (tiers 1–6) → fixed game-palette colors (Rare=blue tier 3, Noteworthy=purple tier 4, matching
  the in-game palette). Rarity tints the item icon background + drives a filter.
- **Category icons** (`CategoryIcon.tsx`, react-icons `gi`): monochrome glyph per category — these
  replaced the old colored dots. `CATEGORY_COLORS`/`categoryColor` still exist but are no longer
  used in the UI.

## Data pipeline (all data is scraped, then seeded)

1. **Game files** → `sand-scraper` (separate Python tool, `feat/sand-scraper-impl` worktree) reads
   the installed game's Unity bundles → `prisma/data.json` (items + recipes) + `prisma/icons.json`
   + sprite PNGs in `public/icons/`. Game files do NOT contain rarity or gameplay stats.
2. **Community wiki** (`sandgame.wiki`, MediaWiki API) supplies rarity, weapon/ammo stats, and
   environment content:
   - `prisma/import-wiki-enrichment.mjs` → `prisma/wiki-enrichment.json` (per-item rarity + stats).
     Pure parser: `prisma/wiki-parse.mjs` (`{{Weapons}}`/`{{Ammo}}`/`{{Items}}` infoboxes).
   - `prisma/import-env-content.mjs` → `prisma/env-content.json` (loot containers + landmarks +
     game modes; descriptions + loot tables). Pure parser: `prisma/wiki-text.mjs`
     (`stripWikiMarkup`, `titleToSlug`, `parseLootTable`).
   - `prisma/wiki-overrides.json` — normalized-name → slug overrides for match misses (shared by
     both importers).
3. **Seed** (`prisma/seed.ts`) **upserts by `slug`**, merging the committed JSON snapshots —
   row IDs stay stable across re-seeds. Update payloads omit fields the source has no value for,
   so manual edits to source-empty fields survive; a field the scraper HAS a value for is
   overwritten (values never transition back to NULL via the seed). Rows whose slug leaves the
   snapshot are pruned (with a log line). Fully scraper-owned child rows (recipe lines, loot
   tiers/entries, cost rows) are recreated each seed. Invalid categories now throw instead of
   skipping; post-seed count assertions guard duplicate slugs.
   **Re-seed = `npm run db:seed`** (against the Neon dev DB).
4. **Refresh data** = run the relevant importer (`node prisma/import-*.mjs`) then re-seed.

> **Re-seed safety (curated rows are never erased).** The seed never prunes a row marked
> `curated: true`. Any hand-added or admin-applied **entity** (e.g. the `sprengstofffabrik`
> landmark) must have `Entity.curated = true`, and any hand-authored **recipe** (including
> location production recipes) must have `Recipe.curated = true`, or a re-seed will delete it.
> Apply-time code (`proposal-apply.ts`) and `prisma/load-location-recipes.ts` set these flags;
> the prune queries in `seed.ts` all filter `curated: false`. Child rows (recipe input/output
> lines, loot/cost/craft links) are always deleted and recreated for **non-curated** parents —
> never hand-edit those directly; edit them through the proposal flow instead.
>
> **Location production recipes** live as `Recipe` rows with `locationId` set (one recipe per
> location). Source of record: `prisma/location-recipes.json`, loaded idempotently via
> `npm run db:load-location-recipes`.

> **Re-seed & contributor field edits.** As of the 2026-06 seed-curation change, the seed
> **preserves every field a contributor edited via the contribute flow**: at start it reads
> applied `edit` proposals (`buildLockMap` in `src/lib/seed-curation.ts`) and the item/env/
> trampler upserts omit those fields from the `update` (even under `--force`; no bypass). So a
> re-seed no longer reverts manual `rarity`/`description`/stat edits. Caveats that REMAIN:
> - **Directus-only edits are NOT protected** — only edits recorded as applied proposals are.
> - The seed still **delete+recreates loot/cost/tech links** for non-`lootCurated` rows, and
>   still upserts source values for fields the contributor never touched.
> So: still prefer surgical loaders (`db:load-*`) for data changes, and don't run `db:seed`
> casually. Background: a 2026-06-14 `db:seed:force` reverted ~42 rarity edits before this
> protection existed; they were recovered from the `Proposal` table.

Community-wiki content is uneven/stubby (many landmark pages are empty; some loot tables sparse).
Imports copy what exists and link back via `sourceUrl`.

## Backoffice (Directus, local Docker)

- `npm run directus:up` → http://localhost:8055 (admin creds in `.env`: `DIRECTUS_*`; image pinned
  to the version the committed schema snapshot was taken with).
- Runs against the same Neon dev DB. System tables live in the `directus` Postgres schema
  (`DB_SEARCH_PATH=directus,public`) so `prisma migrate` never sees them — do NOT move them to
  `public`. The schema must exist before first boot:
  `'CREATE SCHEMA IF NOT EXISTS directus;' | npx prisma db execute --stdin --schema prisma/schema.prisma`.
- Collection config is snapshotted to `directus/snapshots/snapshot.yaml`
  (`npm run directus:snapshot` / `directus:apply`). After changing the data model in the Studio,
  re-snapshot and commit the diff. Directus names M2O fields after the FK column (`itemId`,
  `recipeId`, …), not Prisma's relation names.
- **Recipes are editable as one document**: `Recipe.inputs`/`outputs` are O2M editor fields
  (alias fields + `one_field` on the FK relations) — add/edit lines inline, item picked from a
  dropdown. NB: hand-authored recipes are still wiped by `npm run db:seed` (prune + line
  recreation) — avoid re-seeding after hand-authoring, or ask for the `manual`-flag seed change.
- **Icons render in the Studio** two ways:
  1. List/table thumbnails — local display extension
     (`directus/extensions/directus-extension-display-image-path`, mounted by compose; no build
     step — hand-written ESM): shows `icon` paths prefixed with a base URL (configured to
     `http://localhost:3000`, where the Next app serves `public/icons/`). Needs the compose CSP
     override `CONTENT_SECURITY_POLICY_DIRECTIVES__IMG_SRC` and the Next dev server running.
  2. Card images — Directus layouts only accept directus_files relations, so sprites are
     **mirrored into Directus storage** (`./directus/uploads`, gitignored compose volume) and
     each row's **`iconFile`** (uuid, on Item/EnvEntity/TramplerPart) points at the upload; the
     cards layout uses it as `imageSource`. `icon` stays the app's source of truth; the seed
     never writes `iconFile` (upserts preserve it). **Re-run `npx tsx
     prisma/sync-directus-icons.mjs` after any asset import** (idempotent — matches files by
     name, links rows). NB: the iconFile→directus_files relation is metadata-only — the
     cross-schema FK Directus creates was dropped on purpose so `prisma migrate diff` stays
     clean; if `directus:apply` ever recreates it, drop it again.
  **Dev-only as configured** — the production checklist (baseUrl, CSP, PUBLIC_URL, hosting) is
  tracked in `TODO.md`.
- **Moderator role**: `npm run directus:moderator` provisions (idempotently) a `Moderator`
  role + policy granting read/create/update on the content collections and read/create on
  files (icons) — **no delete, no admin**. Roles/policies/permissions are Directus *data*,
  not in `snapshot.yaml`, so this script is their source of truth; re-run it after a fresh
  Directus DB. Add a person as a moderator in the Studio: User Directory → invite → assign
  the `Moderator` role (per-user invites are not scripted). Caveat: moderator-*created* rows
  are still pruned by `npm run db:seed` until the corrections workflow (TODO #15–16) lands —
  edits to scraped rows survive, brand-new entities do not.
- Field interfaces (in the snapshot): taxonomy-owned sets are **closed dropdowns**
  (`Item.rarity`/`Item.category`, `EnvEntity.category`, `TramplerPart.category`); wiki-sourced
  sets are **dropdowns with "other" allowed** (`Item.statType`/`ammoName`/`workbenchTier`,
  `LootTier.tier`/`col1–3Label`, `Recipe.workbench`, `TramplerPart.dimensions`/`researchNode`/
  `researchTier`) — when the wiki introduces a new value, add it to the choice list; all FK
  fields are relational selects displaying names instead of raw ids. No DB-level enums on
  purpose: Directus wouldn't auto-render them, value sets move (taxonomy + wiki), and the seed
  already validates the closed sets.
- Edits made in Directus survive `npm run db:seed` (upsert-by-slug), EXCEPT fields the scraper has
  a value for — those are overwritten. Scraper-owned child rows (recipe lines, loot tiers/entries,
  cost rows) are always recreated. **Rows created in Directus are deleted on re-seed** (the prune
  removes any slug not in the snapshot) — don't author new entities there until the corrections
  workflow (TODO #15–16) lands.
- **This machine**: Docker lives inside WSL2 Ubuntu — run compose via
  `wsl -e bash -lc "cd /mnt/d/Documents/SandLabs/sand-wiki && docker compose …"` (the npm scripts
  are portable; the WSL wrapper is machine-specific). WSL's DNS is currently broken
  (Tailscale-managed resolv.conf) — a gitignored `docker-compose.override.yml` pins container DNS
  so Directus can reach Neon; fix WSL DNS to retire it. WSL idles out ~15s after the last wsl.exe
  session closes, taking the container with it (`restart: unless-stopped` brings it back when WSL
  returns).
- Gotchas: `docker compose exec` right after `directus:up` can race a cold container (~10s boot);
  `npm run directus:down` stops every service in the compose file; admin email must not use a
  `.local` TLD (Directus validator rejects it).
- **`DIRECT_DATABASE_URL` (the Neon URL without `-pooler`) is required twice**: prisma migrate's
  advisory lock sticks to pgbouncer backends (hanging deploys on the pooler URL) — the schema's
  `directUrl` routes the CLI around the pooler; and **Directus itself must use it** — its
  `DB_SEARCH_PATH` relies on `SET search_path`, which Neon's transaction-mode pooler does not
  preserve across queries (symptom: intermittent 500s / `42P01 relation does not exist` on
  login). Only the Next.js app stays on the pooled `DATABASE_URL`.

## Design system (locked — follow for all new UI)

The single source is `src/app/globals.css` (the shadcn token layer) + `src/lib/rarity.ts` (rarity
scale). The framework-free mockups in `docs/design/` (repo root) are the **approved visual reference**
the React UI mirrors — but where they disagree with these files, **globals.css / rarity.ts win**
(the README's stale Epic/Legendary/Relic names + slightly-off hexes are superseded).

- **Tokens** — never hard-code a hex; use a token. Surfaces `--background #0d0a06` /
  `--card #15100a` / `--card-elevated #1d160d`; borders `--border #2a2012` (dividers) /
  `--border-strong`/`--input #3a2c18` (input + stronger contrast). Text `--foreground #ece0cb`
  (body), `--muted-foreground #9a8f7c` (small/secondary text — **this is the floor for small text**),
  `--dim #74695a` (decorative only). Brand `--primary #e8893b` (+`-hover`/`-press`), `--secondary`,
  `--accent`. State `--info`/`--success`/`--warning`/`--destructive`. Consume via Tailwind color
  utilities (`bg-card`, `text-muted-foreground`, `border-border`, …) wired through `@theme inline`.
- **Rarity scale** (`rarity.ts`, tiers 1–6): Common `#AEAEB2` · Uncommon `#7CB079` · Rare `#7AA8D2`
  · Noteworthy `#A37FC9` · Remarkable `#E59A52` · Experimental `#D85F64`, exposed as
  `--rarity-1…6` / `text-rarity-N`. Used for **rails, dots, badge border/text** (all pass AA on dark
  surfaces) — **never as a card fill behind body text**.
- **Type** — Display **Oswald** (`font-display`, 300–700) for headings, brand, labels, stat labels,
  tabs, chips, buttons. Body = system sans (14px / 1.55). Data/stats = system mono, `tabular-nums`.
  Brand wordmark `SAND·HELP` = Black Ops One via `.brand-wordmark` (grunge SVG filter).
- **Radius = 0 everywhere** (`--radius: 0px`). No rounded cards/buttons/badges/inputs/chips. The
  only rounded element on the whole site is the dev-review phone bezel.
- **Spacing** — 4px base (`4·8·12·16·20·24·32·40·48`). Card padding 14–24; grid gap 12;
  section padding 18–24.
- **Motion** — color / background-color / border-color / brightness / opacity transitions ONLY,
  100–120ms. **No transforms, no entrance animations.** Every `:hover` pairs with `:focus-visible`.
  The one exception is the skeleton shimmer, gated behind `prefers-reduced-motion`. Shared
  affordance rules live in globals.css (`.nav-link`, `.row-link`, `.item-sprite`) — prefer them over
  ad-hoc per-element hover classes.
- **Accessibility (hard gate)** — every text/background pair targets **WCAG AA @14px**; axe must
  pass in `npm run test:e2e`. `--primary` is **never text on `--card`** — it always appears as a
  fill behind dark text (`--primary-foreground #1a0f04`). Active filter chips = `--primary` bg +
  dark fg. Small text never uses `--dim` (only 3.67:1 on `--background`) — use `--muted-foreground`.

## UI conventions

- **EntityCard** (`EntityCard.tsx`) — the one shared browse card across items / tramplers /
  environment: **4px rarity left-rail + neutral squared card**, squared sprite tile, name, a
  `Class·Rarity` meta line, optional stats. (Replaced the old per-kind `ItemCard`/`TramplerCard`/
  `EnvCard` and the full rarity-tinted card background.)
- **EntityDetail** (`EntityDetail` shell, shared by item/trampler/env detail) — neutral sprite tile
  with rarity left-rail + rarity/category badges + display headline; bordered mono **`StatGrid`**
  ("Statistics"); `[main | 300px facts]` split with a centered fallback when there are no relations.
  Relationships (Crafted by / Used in / Loot) are **one tabbed `.dtable`**, not separate panels.
  `ItemTabs` (client, ARIA tablist; squared underline) is reused for relationship tabs AND one tab
  **per loot tier** (Normal/Rare). Badges = token `RarityBadge`/`CategoryTag`/`WorkbenchBadge`.
- **List pages** — server component reading `searchParams`; canonical shell is
  `[sidebar | grid]` (`CategoryQuickNav`/`.side-cat` rail with counts on `lg+`, horizontal chip row
  below; active = `aria-current="page"`) + EntityCard grid. New list pages should match it. Ordered
  alphabetically by `name` (`item-filter.ts`); rarity/type ordering is a *desired change* in
  `TODO.md`. Empty state = explicit squared "No items match…" panel + `aria-live="polite"`
  `0 result(s)` badge, never a bare blank grid.
- **List filters** — all URL-driven + server-side: `?q=` (case-insensitive substring on
  `name`/`derivedName`), `?category=`, `?rarity=`, always **AND-combined** in the Prisma `where`
  (`item-filter.ts`); switching one preserves the others — treat this precedence as fixed.
  `RarityChips` (single-select `Link`s) renders **only** rarities present in the current result set,
  ordered by game tier, with an "All" reset chip.
- **Search-as-you-type** (`SearchBox`, client) — squared input + leading magnifier (primary on
  focus); fetches `/api/search-index` once per page load (singleton promise; `Cache-Control:
  public, max-age=3600`; payload `{slug,name,category,derivedName}`). Instant (no debounce)
  substring match over `name`/`derivedName`/category labels, capped at 8; results mix
  category-filter rows ("filter" badge → `/items?category=`) and item rows ("page" badge → detail),
  rendered in the `.ac` panel (grouped sections, `[mini-icon|name|category]` rows, first match
  bolded). Full combobox a11y: `role="combobox"` + `aria-expanded`/`-controls`/
  `-autocomplete="list"`/`-activedescendant`, listbox/option roles, ArrowUp/Down + Enter + Escape.
  Dropdown renders only on matches (closed = `aria-expanded=false`). Known gaps: **no live region
  announcing result count**; indexes items + categories only (no landmarks/loot containers).
  Variants: `navbar` (inline desktop, moved into the mobile drawer) and `hero`.
- **Forms** (contribute / edit / admin) — one system in `src/components/form-styles.ts`
  (`labelCls`/`inputCls`/`selectCls`/`textareaCls`/`hint`/`error`/`btn*`). Use **native** form
  elements (keep `name`/`value` for server actions) styled with these classes — don't reach for
  unstyled ad-hoc inputs. Closed taxonomy sets are selects; wiki-sourced sets allow "other".
  - **Entity/item selection uses the enriched picker, never a plain `<select>` of items.**
    Use `EntitySearchBox` (search + `ItemIcon` + rarity color) — already wrapped by `LinkPicker`
    (loot/cost/keys/found-in) and `RecipeEditForm` (recipe inputs/outputs). Pass options as
    `LinkOption[]` (`{slug,name,rarity,icon,category}`); the picker emits the same index-aligned
    FormData arrays the server parses.
  - **Rarity and category selects use `StyledSelect`** (`RaritySelect` = color swatch + tinted
    label; `CategorySelect` = `CategoryIcon`). They emit a hidden input with the chosen value.
  - **Other closed or wiki-sourced enums stay native** `<select>` / `EnumField` (kind, workbench,
    tiers, target type). `EnumField` keeps the "Other…" free-text path for wiki-sourced sets.
- **Icon + tooltip**: `ItemIconLink` (shared by recipe ingredients and loot grids) — icon, hover/
  focus name tooltip, links to the item; recipes add `×amount`, loot shows none.
- **App shell** — sticky blurred `SiteHeader` (brand wordmark, section-dropdown `MainNav` on
  NavigationMenu, inline search, auth menu); mobile = hamburger → left slide-in Sheet drawer holding
  nav + search. Footer restyled to tokens.
- **No browser dialogs.** Never use `window.alert`, `window.confirm`, or `window.prompt`.
  Use a styled in-app modal instead (e.g. `src/components/ConfirmDialog.tsx`).

## SEO / metadata

- **Origin** — `src/lib/site.ts` exports `SITE_URL` (from `NEXT_PUBLIC_SITE_URL`, localhost
  fallback for dev), `SITE_NAME`, and `metaDescription(text, fallback)` (clamps to ~160 chars).
  `SITE_URL` must be correct in production env for canonical/OG/sitemap URLs to be absolute.
- **Root metadata** (`app/layout.tsx`) sets `metadataBase`, a title template `"%s — Sand Help"`,
  and site-level OpenGraph/Twitter defaults. Per-page titles return a **bare** name (`"Items"`,
  `item.name`) — the template appends the brand; don't hard-code the suffix.
- **Detail pages** (`items|tramplers|environment/[slug]`) export `generateMetadata` with title,
  `metaDescription(...)`, a `canonical` (relative — `metadataBase` makes it absolute), and an
  OpenGraph block (icon as the image; `Entity.icon` already stores the full `/icons|/tramplers/…`
  public path — **do not re-prefix it**). The `getXBySlug` getters are wrapped in React `cache()`
  so the page + its `generateMetadata` share one DB round-trip per request.
- **Sitemap/robots** — `app/sitemap.ts` lists the static routes + every `item|environment|
  trampler-part` slug (via `listEntityPaths()` → `entityHref`; tech nodes excluded, no per-slug
  route). `app/robots.ts` allows `/`, disallows `/admin` `/contribute` `/api`, links the sitemap.
- **Not yet done** (post-launch follow-ups): per-entity OG **images** (dynamic `opengraph-image`),
  ISR/static rendering (every detail page is currently dynamic because `getSession()` reads
  cookies), faceted-list-URL canonicals, and JSON-LD structured data.

## Gotchas

- Re-seed upserts by slug (no longer destructive), but it still overwrites scraper-sourced fields
  and recreates scraper-owned child rows — see Data pipeline step 3 before relying on manual edits.
- `prisma generate` can EPERM on Windows if a dev server holds
  the engine DLL — the client still updates; verify with a quick query rather than killing processes.
- Playwright `reuseExistingServer` will reuse a stale `:3000` dev server (serving old code) → false
  e2e failures; build + `next start -p <other>` + a throwaway `playwright.tmp.config.ts` to verify.

---

## Requirements / TODO (you specify here)

_Add desired features, content, and rules below — this section is owned by the maintainer._

- [x] NPCs: datamined from the game files (Upior, Ironclad) as `environment` creatures/
      enemy-tramplers with HP + loot; live under the Environment section.
- [ ] Landmarks/Game Modes: most wiki pages are empty stubs — consider authoring descriptions
      locally instead of relying on the wiki.
- [ ] Weapon/artillery pages: render the `StatGrid` "Ammo" stat as an icon + tooltip
      (`ItemIconLink`) instead of the current plain text link, matching the loot/recipe
      icon grids. (Reverse view — ammo's "Used by" tab — is already implemented.)
- [ ] (add more here…)
