# SAND 3D Location Map — wiki integration design

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan
**Scope:** Port the standalone `sand3d` web viewer into the `apps/wiki` Next.js app as a standalone `/map` route.

## Background

`sand3d` (in `d:/Téléchargements/sand3d/sand3d`) is a two-part tool:

1. **`extract.py` + `pipeline/`** — a Python extractor that reads a local SAND game install (~7 GB
   of asset bundles) and bakes each in-game location into a gzipped glTF (`<location>.glb.gz`), plus
   a `manifest.json` (locations, categories, per-object search index) and a `spawns.json` (spawner →
   loot side table). Producing assets takes tens of minutes and requires the game install.
2. **`viewer/index.html`** — a self-contained vanilla three.js viewer (~494 lines). It loads three
   from a CDN importmap, inflates the gzipped GLBs with `DecompressionStream`, and provides a
   fly-around camera, a category legend with per-object toggles, Hide-terrain / X-ray toggles, a
   click-to-inspect info panel with loot tables (Stormdive vs Voyage amounts), a cross-location
   search tab, and URL-hash deep-linking (`#loc=…`).

The wiki (`apps/wiki`, Next.js 16 / Prisma 6) already depends on `three@^0.184.0` (the Trampler
Builder uses raw three, not react-three-fiber), already models locations/landmarks as entities, and
already has a datamined loot pipeline. This design brings the 3D viewer into the wiki as a first-class
page.

### Terrain caveat (carried over, unchanged)

The reconstructed sand/terrain surface is a best-effort port of the game's height-stamp pipeline and
is known to be spatially wrong in places (missing per-world seeded biome height layer). Object/prop
positions are faithful; the ground is approximate. This is an unresolved open problem in `sand3d` and
is **out of scope** here — we preserve the existing "Hide terrain" toggle and do not attempt to fix it.

## Decisions

| Question | Decision |
|---|---|
| Placement | **Standalone `/map` explorer** — one full-screen route porting the whole viewer (dropdown, legend, search). Not embedded on per-location detail pages. |
| Assets | **Baked locally, committed to the repo** under `apps/wiki/public/map/`. |
| Loot data | **Port `spawns.json` verbatim; link out to wiki entity pages** where a name matches a known entity. |
| Port style | **React `'use client'` component using the wiki's bundled `three`** (no CDN importmap). Faithful port of the existing logic, not a rewrite; not react-three-fiber. |

## Architecture

New route: `apps/wiki/src/app/map/`

- **`page.tsx`** — server component. Provides page `metadata`, the site chrome/nav, and a brief
  intro. Renders `<MapViewer />` in a full-viewport-below-navbar container. No data fetching (assets
  are static files fetched client-side).
- **`MapViewer.tsx`** — `'use client'` component. Owns the entire three.js viewer: the JSX for the
  header (location `<select>`, Map/Search tabs), the left sidebar (category legend), and the
  info/tooltip/hud/loading/error panels, plus the three.js scene logic in a `useEffect`.

Nav entry added to [`apps/wiki/src/lib/site.ts`](../../../apps/wiki/src/lib/site.ts) and the mobile
nav, label **"3D Map"**, route `/map`.

### `MapViewer.tsx` — the port

The viewer logic from `viewer/index.html` moves into a single `useEffect(() => { … }, [])` block,
adapted as follows:

- **three bundled locally.** `import * as THREE from 'three'` and
  `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'` (or the `three/examples/jsm`
  path the builder uses). The `<script type="importmap">` CDN dependency is removed. First open no
  longer needs the network. `DecompressionStream` (a browser API) is kept for `.gz` inflation — the
  Chrome/Edge requirement stays, surfaced as a friendly message if absent.
- **DOM scoped to a ref.** The original queries `document.getElementById(...)` for `#c`, `#info`,
  `#legend`, `#loc`, etc. In the component, the same markup is rendered as JSX inside a
  `containerRef`, and lookups become `containerRef.current.querySelector(...)` (or per-element refs).
  IDs may be retained but scoped to the container to avoid collisions.
- **Lifecycle teardown.** The effect returns a cleanup that disposes the renderer and geometries,
  removes `window`/canvas event listeners, and `cancelAnimationFrame`s the render loop, so navigating
  away from `/map` fully releases WebGL resources.
- **Asset base.** The viewer's `const ASSETS = 'assets/'` becomes `'/map/'` (see Assets below).
- **Behavior preserved verbatim:** fly camera (drag look, WASD/QE, scroll, Shift-slow), category
  legend with per-thing toggles + All/None, Hide-terrain, X-ray, click-to-inspect, loot panel with
  Stormdive/Voyage amount switch, cross-location Search tab, and `#loc=…` hash deep-linking.

### Assets

Baked output is committed under **`apps/wiki/public/map/`**:

```
apps/wiki/public/map/
├── manifest.json
├── spawns.json
└── *.glb.gz          (one per location, ~60 files)
```

Served statically by Next.js at `/map/manifest.json`, `/map/<location>.glb.gz`, etc. No DB, no build
step — consistent with the wiki's static-data / self-hosted deployment model.

**Size consideration:** the `.glb.gz` set is on the order of tens of MB. Default is a plain git
commit (as chosen). Git LFS for `apps/wiki/public/map/*.glb.gz` is a documented option if repo bloat
becomes a concern, but is not adopted by default.

The user bakes these separately by running `sand3d/extract.py` against their game install and copying
`viewer/assets/*` into `apps/wiki/public/map/`. The Python extractor/pipeline is **not** vendored into
the wiki repo.

### Loot panel → wiki cross-links

`spawns.json` is shipped **verbatim** — no re-derivation, no coupling to the wiki DB. The single new
piece of glue is a helper:

```
slugForName(label: string): { href: string } | null
```

It maps a loot/container **display name** to a wiki entity route using the static `@sandlabs/data`
name→slug index (already available to the app at build time). Matching is by normalized name
(case/whitespace-insensitive). When a match exists, the info panel renders the name as a Next
`<Link>` to the entity page (e.g. `/items/[slug]`); when it does not, it renders plain text —
identical to the current appearance. The mapping is best-effort and fully graceful: no match ⇒ no
link, never an error.

The name→slug index is built once (module-level memoized map) from `@sandlabs/data` to avoid
re-scanning on every panel render.

### Theme & mobile

- **Theme.** The viewer's existing sand/dark palette (`--bg`, `--panel`, `--line`, `--ink`, `--mut`)
  is remapped to the site's dark-theme tokens so the page reads as part of the wiki. Layout/geometry
  of the panels is unchanged.
- **Mobile.** Reuse the Trampler Builder's `<1024px` gate: small viewports get a "best viewed on
  desktop" message instead of the heavy WebGL scene, matching the existing mobile support pattern.

## Testing

- **e2e smoke** (Playwright): `/map` mounts, `manifest.json` fetch succeeds, the location dropdown
  populates with option groups. Note: the wiki e2e/lint baseline is partly red pre-existing — a
  pre-existing red is not a regression from this work.
- **Unit test** for `slugForName`: known name → expected `href`; unknown name → `null`.
- Manual verification: load a location, fly, toggle categories, Hide-terrain/X-ray, open a container
  and confirm loot rows + Stormdive/Voyage switch, click a loot name that maps to an entity and
  confirm the link resolves, use Search and jump-to a location.

## Out of scope

- The Python extractor/`pipeline/` (untouched; assets baked separately by the user).
- Rebuilding loot from the wiki DB (we port `spawns.json`).
- Fixing terrain accuracy (kept as-is; "Hide terrain" preserved).
- Embedding the viewer on individual location/landmark detail pages (standalone `/map` only).
- Firefox/Safari support (unchanged; `DecompressionStream` requirement stays, with a graceful message).

## Open items / prerequisites

- **Assets must be baked before the page is useful.** The user runs `extract.py` against their game
  install and drops the output into `apps/wiki/public/map/`. Until then `/map` shows the viewer's
  existing "assets not baked / manifest failed" message.
