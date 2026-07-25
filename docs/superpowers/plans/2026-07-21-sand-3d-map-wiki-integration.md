# SAND 3D Location Map — wiki integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `/map` route to the wiki that ports the `sand3d` three.js location viewer, with its loot panel cross-linking into wiki entity pages.

**Architecture:** A server `page.tsx` renders a `'use client'` `MapClient` that gates small screens and dynamically (`ssr:false`) imports `MapViewer`, which runs the ported three.js scene in a `useEffect`. Baked assets live as static files under `apps/wiki/public/map/`. The loot panel uses a pure `slugForName` helper (built from `@sandlabs/data`) to turn loot names into `<Link>`s. This mirrors the existing Trampler Builder's structure exactly.

**Tech Stack:** Next.js 16 (App Router), React client components, bundled `three@^0.184.0` (`three/examples/jsm`), `@sandlabs/data` static store, Vitest (unit), Playwright (e2e).

---

## ⚠️ Read before coding

This repo runs a **modified Next.js**. Per `apps/wiki/AGENTS.md`: read the relevant guide in `apps/wiki/node_modules/next/dist/docs/` before writing routing/component code, and heed deprecation notices. In particular confirm the current `next/dynamic` `ssr:false` usage against the installed version — the Trampler Builder ([src/components/builder/BuilderClient.tsx](../../apps/wiki/src/components/builder/BuilderClient.tsx)) is the known-good reference in this exact version; mirror it.

## Prerequisite (out-of-band, not a code task)

`/map` is inert until assets exist. The user bakes them by running `sand3d/extract.py` against their game install, then copies `sand3d/viewer/assets/*` into `apps/wiki/public/map/`. Until then the viewer shows its own "couldn't load manifest.json" message (ported as-is). The implementer does **not** need the game or a full bake to build/verify the code — Task 7 adds a tiny fixture `manifest.json`/`spawns.json` so the e2e smoke runs without the GLBs.

## Source of truth

The viewer being ported is [`d:/Téléchargements/sand3d/sand3d/viewer/index.html`](d:/Téléchargements/sand3d/sand3d/viewer/index.html) (494 lines: a `<style>` block ~lines 7–85, static markup ~87–113, and a `<script type="module">` ~120–492). Tasks reference it by line ranges. Keep a copy open while porting.

## File Structure

Files created / modified:

- **Create** `apps/wiki/src/app/map/page.tsx` — server component: `metadata` + renders `<MapClient />`. Imports `map.css` at page level (like the builder) so panel styling is present on first paint.
- **Create** `apps/wiki/src/app/map/MapClient.tsx` — `'use client'`: `<1024px` gate + `dynamic(() => import(".../MapViewer"), {ssr:false})`. Direct clone of `BuilderClient.tsx`.
- **Create** `apps/wiki/src/components/map/MapViewer.tsx` — `'use client'`: the ported three.js scene + UI (canvas, header, sidebar, info/tooltip/hud/search panels) in one component, logic in a `useEffect` with teardown. Uses `slugForName` for loot links.
- **Create** `apps/wiki/src/components/map/map.css` — ported/token-remapped styles from the viewer's `<style>` block, all selectors scoped under `.sand3d-map`.
- **Create** `apps/wiki/src/components/map/entityLinkIndex.ts` — pure `slugForName(name)` name→entity-route index built from `@sandlabs/data`.
- **Create** `apps/wiki/src/components/map/entityLinkIndex.test.ts` — Vitest unit tests for `slugForName`.
- **Modify** `apps/wiki/src/lib/taxonomy.ts:56-59` — add a `map` link section to `SECTIONS` (wires both MainNav and MobileNav).
- **Modify** `apps/wiki/src/components/SectionIcon.tsx:9-13` — add a `map` glyph.
- **Create** `apps/wiki/public/map/manifest.json` + `apps/wiki/public/map/spawns.json` — minimal fixtures so the route/e2e works pre-bake (real bake overwrites them; the `.glb.gz` files remain user-supplied).
- **Create/Modify** an e2e spec under `apps/wiki` (path per existing suite, see Task 7).
- **Modify** `sand3d/README.md` (optional doc note, Task 8) — where to copy assets for the wiki.

---

### Task 1: Nav entry + section icon

**Files:**
- Modify: `apps/wiki/src/lib/taxonomy.ts:56-59`
- Modify: `apps/wiki/src/components/SectionIcon.tsx:9-13`

- [ ] **Step 1: Add the `map` section to `SECTIONS`**

In `apps/wiki/src/lib/taxonomy.ts`, add a `link` section immediately after the `builder` entry (line 57). It has no categories, so both `MainNav` (renders non-`data` sections as a plain link to `section.href ?? /${slug}`) and `MobileNav` (`TOOLS = SECTIONS.filter(s => s.kind === "link")`) pick it up automatically.

```ts
  { slug: "tech", label: "Tech Tree", kind: "link", categories: [] },
  { slug: "builder", label: "Builder", kind: "link", categories: [] },
  { slug: "map", label: "3D Map", kind: "link", categories: [] },
  { slug: "gallery", label: "Gallery", kind: "link", categories: [] },
  { slug: "admin", label: "Data", kind: "link", href: "/admin", categories: [] },
```

- [ ] **Step 2: Add the section icon**

In `apps/wiki/src/components/SectionIcon.tsx`, import a map glyph and register it. `react-icons/gi` is already the icon set in use.

```tsx
import type { IconType } from "react-icons";
import { GiFamilyTree, GiWrench, GiDatabase, GiIsland } from "react-icons/gi";

const SECTION_ICONS: Record<string, IconType> = {
  tech: GiFamilyTree,
  builder: GiWrench,
  map: GiIsland,
  admin: GiDatabase,
};
```

- [ ] **Step 3: Verify it builds and the link appears**

Run: `cd apps/wiki && npx tsc --noEmit`
Expected: no new type errors.
Then run the dev server (`npm run dev`), open `http://localhost:3000`, confirm "3D Map" appears in the desktop nav and in the mobile menu's Tools group, linking to `/map` (404 for now — route lands in Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/wiki/src/lib/taxonomy.ts apps/wiki/src/components/SectionIcon.tsx
git commit -m "feat(wiki): add 3D Map nav entry"
```

---

### Task 2: `slugForName` entity-link index (TDD)

**Files:**
- Create: `apps/wiki/src/components/map/entityLinkIndex.ts`
- Test: `apps/wiki/src/components/map/entityLinkIndex.test.ts`

The loot panel shows game display names (from `spawns.json`). This maps a display name to a wiki route when a matching enabled entity exists, else returns `null`. Kinds map to routes: `item → /items`, `environment → /environment`, `trampler-part → /tramplers`. `tech-node` is intentionally excluded (never appears in loot). On a name collision, `item` wins, then `environment`, then `trampler-part` (loot is overwhelmingly items).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { slugForName, __normalize } from "./entityLinkIndex";

describe("__normalize", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(__normalize("  Ironclad   Alloy  Steel ")).toBe("ironclad alloy steel");
  });
});

describe("slugForName", () => {
  it("returns null for an unknown name", () => {
    expect(slugForName("definitely not a real entity xyzzy")).toBeNull();
  });

  it("resolves a known item name to its /items route (case-insensitive)", () => {
    // Pick a name known to exist in @sandlabs/data at test-write time and keep it
    // here; if the datamine renames it, update this fixture.
    const hit = slugForName("Alloy Steel");
    expect(hit).not.toBeNull();
    expect(hit!.href.startsWith("/items/")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/wiki && npx vitest run src/components/map/entityLinkIndex.test.ts`
Expected: FAIL — `Cannot find module './entityLinkIndex'`.

- [ ] **Step 3: Confirm the fixture name exists**

Before implementing, verify the item name used in the test actually exists so the test is meaningful:
Run: `cd d:/Documents/SandLabs && node -e "const d=require('./apps/wiki/node_modules/.pnpm')" ` is unreliable; instead grep the static data:
Run: `grep -ri '"name": "Alloy Steel"' packages/data/src packages/data 2>/dev/null | head`
If absent, pick any real item name from `packages/data` and update the test in Step 1. (Names live in the `@sandlabs/data` store; `listByKind("item")` returns them at runtime.)

- [ ] **Step 4: Implement `entityLinkIndex.ts`**

```ts
import { listByKind } from "@sandlabs/data";

/** Kinds that have a wiki detail route, in collision-priority order. */
const KIND_ROUTE: { kind: string; base: string }[] = [
  { kind: "item", base: "/items" },
  { kind: "environment", base: "/environment" },
  { kind: "trampler-part", base: "/tramplers" },
];

/** Lowercase, trim, collapse internal whitespace. Exported for tests. */
export function __normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface EntityLink {
  href: string;
}

let INDEX: Map<string, EntityLink> | null = null;

/** Build once: normalized-name -> {href}. Higher-priority kinds are inserted
 *  first and lower-priority kinds must not overwrite an existing key. */
function getIndex(): Map<string, EntityLink> {
  if (INDEX) return INDEX;
  const m = new Map<string, EntityLink>();
  for (const { kind, base } of KIND_ROUTE) {
    for (const e of listByKind(kind)) {
      const key = __normalize(e.name);
      if (!m.has(key)) m.set(key, { href: `${base}/${e.slug}` });
    }
  }
  INDEX = m;
  return m;
}

/** Route for a loot/container display name, or null if no enabled entity matches. */
export function slugForName(name: string): EntityLink | null {
  if (!name) return null;
  return getIndex().get(__normalize(name)) ?? null;
}
```

Note: `listByKind` already filters to enabled entities (it uses the same store as the rest of the wiki).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/wiki && npx vitest run src/components/map/entityLinkIndex.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/wiki/src/components/map/entityLinkIndex.ts apps/wiki/src/components/map/entityLinkIndex.test.ts
git commit -m "feat(map): name->entity-route index for loot cross-links"
```

---

### Task 3: `map.css` — ported, token-remapped, scoped styles

**Files:**
- Create: `apps/wiki/src/components/map/map.css`

Port the viewer's `<style>` block ([index.html lines 7–85](d:/Téléchargements/sand3d/sand3d/viewer/index.html)) with two changes: (a) wrap every selector under `.sand3d-map` so it can't leak into the rest of the wiki, and (b) drive the palette from the site's dark tokens. The viewer's sand palette already matches the wiki's dark theme, so the remap is small.

- [ ] **Step 1: Create `map.css`**

Start from the original `<style>` contents. Apply these exact transforms:

1. Replace the `:root{…}` custom-property block with a scoped one and map to site tokens where they exist (fall back to the original hex if a token is unavailable):

```css
.sand3d-map {
  --s3d-bg: var(--background, #15120e);
  --s3d-panel: color-mix(in srgb, var(--card, #1f1b15) 93%, transparent);
  --s3d-line: var(--border, #332c22);
  --s3d-ink: var(--foreground, #ece3d4);
  --s3d-mut: var(--muted-foreground, #9b8f7c);
  position: fixed;
  inset: var(--site-header-height, 56px) 0 0 0; /* below the wiki navbar */
}
```

2. In every ported rule, prefix the selector with `.sand3d-map ` and rename the original `var(--bg|--panel|--line|--ink|--mut)` to `var(--s3d-bg|…)`. Example — the original:

```css
#c{position:fixed;inset:0;display:block;width:100%;height:100%;}
header{position:fixed;top:0;left:0;right:0;height:46px;…background:var(--panel);…}
```

becomes:

```css
.sand3d-map #c{position:absolute;inset:0;display:block;width:100%;height:100%;}
.sand3d-map header{position:absolute;top:0;left:0;right:0;height:46px;…background:var(--s3d-panel);…}
```

3. Change the four `position:fixed` anchors that assumed a full-window viewer (`#c`, `header`, `aside`, `#search`) to `position:absolute` so they anchor to the `.sand3d-map` container (which is itself `fixed` below the navbar) rather than the whole window. `#info`, `#help`, `#hud`, `#tip`, `#load`, `#err` can stay `fixed` (overlays) but re-check `top` offsets against the 56px header — bump `header{top:0}` stays 0 within the container, and `#info{top:58px}` / `aside{top:46px}` remain relative to the container top.

4. Keep all other rules byte-for-byte (just re-scoped/renamed). Do not restyle the panels beyond the token swap.

- [ ] **Step 2: Verify the file parses**

Run: `cd apps/wiki && npx tsc --noEmit` (css isn't type-checked, but this catches an import typo in Task 4).
Manual: eyeball that every selector begins with `.sand3d-map`.

- [ ] **Step 3: Commit**

```bash
git add apps/wiki/src/components/map/map.css
git commit -m "feat(map): scoped, token-mapped viewer styles"
```

---

### Task 4: Route scaffold + `MapClient` gate (page renders)

**Files:**
- Create: `apps/wiki/src/app/map/page.tsx`
- Create: `apps/wiki/src/app/map/MapClient.tsx`
- Create: `apps/wiki/src/components/map/MapViewer.tsx` (stub in this task; filled in Task 5)

- [ ] **Step 1: Create the `MapViewer` stub**

So `MapClient`'s dynamic import resolves this task, create a minimal placeholder that Task 5 replaces.

```tsx
"use client";
import "@/components/map/map.css";

export default function MapViewer() {
  return (
    <div className="sand3d-map">
      <div id="load">3D viewer coming online…</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `MapClient.tsx`** (clone of `BuilderClient.tsx`, retargeted)

```tsx
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "@/components/map/map.css";

// three.js can't server-render, so the viewer is loaded client-only.
const MapViewer = dynamic(() => import("@/components/map/MapViewer"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading 3D map…</div>,
});

// Below this width the fly-around 3D scene is impractical; show a gate instead.
const MIN_WIDTH = 1024;

export default function MapClient() {
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => setWideEnough(window.innerWidth >= MIN_WIDTH);
    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (wideEnough === null) {
    return <div className="bld-loading">Loading 3D map…</div>;
  }

  if (!wideEnough) {
    return (
      <div className="bld-gate">
        <div className="bld-gate-card">
          <span className="bld-gate-glyph" aria-hidden="true">
            ▦
          </span>
          <h1 className="bld-gate-title">Bigger screen needed</h1>
          <p className="bld-gate-text">
            The 3D Map is a fly-around WebGL scene that needs a desktop or
            laptop. Open it on a screen at least {MIN_WIDTH}px wide.
          </p>
          <div className="bld-gate-links">
            <Link href="/environment?category=landmarks" className="bld-gate-btn primary">
              Browse Landmarks
            </Link>
            <Link href="/" className="bld-gate-btn ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <MapViewer />;
}
```

Note: `bld-gate*` / `bld-loading` classes are reused from `builder.css`; import it too if those styles don't resolve. Confirm by grepping: `grep -n "bld-gate" apps/wiki/src/components/builder/builder.css`. If reuse feels wrong, copy the `.bld-gate*` and `.bld-loading` rules into `map.css` under `.sand3d-map`-neutral names; simplest is to `import "@/components/builder/builder.css"` at the top of `MapClient.tsx`.

- [ ] **Step 3: Create `page.tsx`**

```tsx
import MapClient from "./MapClient";
import "@/components/map/map.css";

export const metadata = {
  title: "3D Location Map",
  description:
    "Fly-around 3D viewer of SAND's locations — every placeable object, tinted by category, clickable for loot.",
};

export default function MapPage() {
  return <MapClient />;
}
```

- [ ] **Step 4: Verify the route renders and the gate works**

Run: `cd apps/wiki && npx tsc --noEmit` → no new errors.
Dev server: open `http://localhost:3000/map` in a ≥1024px window → shows "3D viewer coming online…". Narrow the window below 1024px → shows the "Bigger screen needed" gate. Click the nav "3D Map" → lands on `/map`.

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/app/map apps/wiki/src/components/map/MapViewer.tsx
git commit -m "feat(map): /map route scaffold + small-screen gate"
```

---

### Task 5: Port the three.js viewer into `MapViewer.tsx`

**Files:**
- Modify: `apps/wiki/src/components/map/MapViewer.tsx` (replace the Task-4 stub)

This is the core port. The whole scene logic from [index.html lines 120–492](d:/Téléchargements/sand3d/sand3d/viewer/index.html) moves into one `useEffect`. Do NOT rewrite the algorithms — copy the body and apply the explicit edits below. Behavior must stay identical (fly camera, legend, Hide-terrain, X-ray, click-inspect + loot, Search tab, `#loc=` hash).

- [ ] **Step 1: Write the JSX (ported static markup)**

Render the viewer's markup ([index.html lines 87–113](d:/Téléchargements/sand3d/sand3d/viewer/index.html)) as JSX inside a single root `div.sand3d-map` with a `ref`. Convert `class`→`className`, `for`→`htmlFor`, self-close tags, and keep the same element `id`s (queries are scoped to the container, so no global collisions). The `<script type="importmap">` and `<script type="module">` tags are NOT rendered — that logic goes into the effect (Step 3).

```tsx
"use client";
import { useEffect, useRef } from "react";
import "@/components/map/map.css";

export default function MapViewer() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cleanup = mountViewer(root); // defined below, returns teardown
    return cleanup;
  }, []);

  return (
    <div className="sand3d-map" ref={rootRef}>
      <canvas id="c" />
      <header>
        <h1>SAND · 3D</h1>
        <span className="tab on" id="tabMap">Map</span>
        <span className="tab" id="tabSearch">Search</span>
        <select id="loc" />
        <span className="sub" id="sub" />
      </header>
      <aside>
        <div id="catpanel">
          <h2>Categories</h2>
          <div className="tools">
            <button id="allOn">All</button>
            <button id="allOff">None</button>
            <button id="baseBtn">Hide terrain</button>
            <button id="xrayBtn">X-ray items</button>
          </div>
          <div id="legend" />
        </div>
      </aside>
      <div id="info" />
      <div id="help">
        <b>Drag</b> look · <b>scroll</b> move · <b>WASD/QE</b> fly · <b>Shift</b> 5% speed · <b>click</b> inspect
      </div>
      <div id="hud" />
      <div id="tip" />
      <div id="load">loading…</div>
      <div id="err" />
      <div id="search">
        <input id="sbox" placeholder="Search objects across all locations (e.g. wine, ghoul, sniper, key)…" autoComplete="off" />
        <div id="sresults" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the imports (bundled three, no CDN)**

At the top of the file, replace the CDN importmap with real module imports (same style the builder uses):

```tsx
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { slugForName } from "@/components/map/entityLinkIndex";
```

- [ ] **Step 3: Port the script body into `mountViewer(root)`**

Add a module-scope function `function mountViewer(root: HTMLElement): () => void { … }` that contains the copied script body ([index.html lines 124–491](d:/Téléchargements/sand3d/sand3d/viewer/index.html)) with these EXACT edits:

1. **Scope DOM lookups.** Replace `const $=id=>document.getElementById(id);` with:
   ```js
   const $ = (id) => root.querySelector("#" + id);
   ```
   (All existing `$('info')` etc. calls then resolve within the container.)

2. **Canvas + listeners.** `const canvas=$('c');` stays. All `addEventListener('resize'|'keydown'|'keyup'|'hashchange', …)` on `window`/`addEventListener` (global) must be captured into named handlers so they can be removed on teardown. Collect every added listener into a local array `const off = []` pushing `() => target.removeEventListener(evt, fn)`.

3. **Asset base.** Change `const ASSETS='assets/';` to:
   ```js
   const ASSETS = "/map/";
   ```

4. **Render loop handle.** Capture the RAF id: `let rafId = requestAnimationFrame(tick);` and inside `tick`, `rafId = requestAnimationFrame(tick);` so teardown can cancel it.

5. **Loot-panel cross-links.** In `showInfo(o)` ([index.html ~393–425](d:/Téléchargements/sand3d/sand3d/viewer/index.html)), wrap rendered item/member display names in an anchor when `slugForName` resolves. Concretely, add a helper inside `mountViewer`:
   ```js
   const nameHtml = (label) => {
     const hit = slugForName(label);
     return hit ? `<a class="s3d-elink" href="${hit.href}">${label}</a>` : label;
   };
   ```
   Then in `lootRows`, replace the bare `${it}` with `${nameHtml(it)}`; in the "Can become" member `row`, replace `${s.label}` with `${nameHtml(s.label)}`; and in the title line replace `<b>${o.userData.t}</b>` with `<b>${nameHtml(o.userData.t)}</b>`. These are plain `<a href>` links (client-side hrefs into the wiki) — full-page nav is fine here; do not attempt to inject Next `<Link>` into the innerHTML string.

6. **Teardown return.** At the end of `mountViewer`, `return () => { cancelAnimationFrame(rafId); off.forEach(f => f()); renderer.dispose(); disposeCurrent(); };` (reuse the existing `disposeCurrent()` which already removes the scene and disposes geometries).

7. **Keep everything else identical** — camera, fly controls, legend build, hash parts, picking, search. Do not "improve" it.

8. Add a small CSS rule for the new link class in `map.css` (Task 3 file): `.sand3d-map .s3d-elink{color:var(--s3d-ink);text-decoration:underline dotted;}` and `.sand3d-map .s3d-elink:hover{color:#fff;}`.

- [ ] **Step 4: Type-check and lint**

Run: `cd apps/wiki && npx tsc --noEmit`
Expected: no new errors. If the copied JS trips strict TS (implicit `any` on the ported vanilla code), add a single `// @ts-nocheck` at the very top of `MapViewer.tsx` — the ported body is proven vanilla JS and re-typing 350 lines is out of scope; the React shell above it is the only part that benefits from typing. (Acceptable per the "faithful port, not a rewrite" decision.)

Run: `cd apps/wiki && npm run lint` (note: the wiki lint baseline is partly red pre-existing — compare against a clean checkout; only new errors in `map/*` count).

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/src/components/map/MapViewer.tsx apps/wiki/src/components/map/map.css
git commit -m "feat(map): port sand3d three.js viewer as MapViewer"
```

---

### Task 6: Verify with real (or fixture) assets

**Files:** none (verification task; fixtures added in Task 7 if no real bake is available)

- [ ] **Step 1: Place assets**

If a real bake exists: copy `sand3d/viewer/assets/{manifest.json,spawns.json,*.glb.gz}` into `apps/wiki/public/map/`. Otherwise proceed with Task 7's fixtures first, then return here.

- [ ] **Step 2: Manual verification checklist (Chrome/Edge)**

Dev server, open `http://localhost:3000/map` in a ≥1024px window and confirm:
- Location dropdown populates with optgroups; selecting one loads its GLB.
- Fly controls: drag looks, WASD/QE move, scroll dollies, Shift slows.
- Category legend toggles objects; per-thing rows toggle; All/None work.
- "Hide terrain" and "X-ray items" toggle as before.
- Click an object → info panel opens with category + loot (if a container). The Stormdive/Voyage switch changes amounts.
- A loot/container name that matches a wiki entity renders as a dotted-underline link and navigates to the correct `/items/…` (or `/environment/…`) page.
- Search tab lists objects across locations; clicking a chip jumps to that location and isolates the object.
- The URL hash updates to `#loc=…`; reloading restores the location.
- Navigate away from `/map` and back → no WebGL context-lost warning in the console (teardown worked).

- [ ] **Step 3: Commit assets (only if a real bake is present)**

```bash
git add apps/wiki/public/map
git commit -m "chore(map): baked 3D location assets"
```
If the `.glb.gz` set is large enough to bloat the repo, first configure Git LFS for `apps/wiki/public/map/*.glb.gz` (`.gitattributes`) — optional, per the spec.

---

### Task 7: e2e smoke + pre-bake fixtures

**Files:**
- Create: `apps/wiki/public/map/manifest.json` (fixture)
- Create: `apps/wiki/public/map/spawns.json` (fixture)
- Create/Modify: an e2e spec (match the existing suite location — find it first)

- [ ] **Step 1: Locate the e2e suite**

Run: `cd apps/wiki && ls e2e tests 2>/dev/null; grep -n "testDir\|testMatch" playwright.config.* 2>/dev/null`
Use whatever directory/pattern the config declares. Mirror an existing spec's imports/fixtures.

- [ ] **Step 2: Add minimal fixtures so the route works without GLBs**

`apps/wiki/public/map/manifest.json`:
```json
{ "cats": [["container","Containers","#c9a24b"]],
  "loccats": [["island","Islands"]],
  "locations": [
    { "key": "poi_Test", "glb": "poi_Test.glb.gz", "label": "Test POI", "cat": "island", "objects": 0, "things": [] }
  ] }
```
`apps/wiki/public/map/spawns.json`:
```json
{}
```
(No `.glb.gz` is shipped as a fixture — the smoke test asserts the shell/dropdown, not a GLB load, which would need a real binary.)

- [ ] **Step 3: Write the smoke spec**

```ts
import { test, expect } from "@playwright/test";

test("3D map route mounts and populates the location dropdown", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map");
  // The ported header title is stable text.
  await expect(page.getByRole("heading", { name: "SAND · 3D" })).toBeVisible();
  // The manifest fetch fills the <select id="loc"> with at least one option.
  const loc = page.locator("#loc");
  await expect(loc.locator("option")).toHaveCount(1, { timeout: 10000 });
});
```
Adjust the selector/role to match how the suite queries (some suites disable webgl; if WebGL init throws in CI, guard the test with the suite's existing pattern or mark it `test.skip` on webgl-less runners — document which).

- [ ] **Step 4: Run the smoke test**

Run: `cd apps/wiki && npx playwright test <path-to-spec>`
Expected: the new test passes. (Pre-existing red tests elsewhere are not this task's concern — see mobile-support note: red ≠ new regression. Confirm the map spec itself is green.)

- [ ] **Step 5: Commit**

```bash
git add apps/wiki/public/map/manifest.json apps/wiki/public/map/spawns.json <e2e-spec-path>
git commit -m "test(map): e2e smoke + pre-bake fixtures"
```

---

### Task 8: Doc note for baking assets into the wiki (optional)

**Files:**
- Modify: `sand3d/README.md` (the "View it" section) — note the sand3d repo is a *separate* repo; commit there separately (see repo-topology). If editing the wiki side instead, add a short `apps/wiki/public/map/README.md`.

- [ ] **Step 1: Add the copy step**

Add a short note: after a bake, copy `viewer/assets/{manifest.json,spawns.json,*.glb.gz}` into the wiki at `apps/wiki/public/map/` to feed the `/map` page; re-baking overwrites them.

- [ ] **Step 2: Commit (in the correct repo)**

`sand3d/README.md` lives in the sand3d tree, not the SandLabs repo — commit it there. A wiki-side `public/map/README.md` commits in the SandLabs repo.
```bash
# wiki-side option:
git add apps/wiki/public/map/README.md
git commit -m "docs(map): how to supply baked assets"
```

---

## Self-Review

**Spec coverage:**
- Route & shell (`/map`, page + client) → Tasks 4. ✓
- Nav entry "3D Map" → Task 1. ✓
- React client component on bundled three, scoped DOM, teardown → Task 5 (steps 2, 1/3, 6). ✓
- Assets under `public/map/`, base `/map/` → Task 5 step 3, Task 6, Task 7. ✓
- Loot panel verbatim + cross-links via `slugForName` → Task 2 + Task 5 step 5. ✓
- Theme remap + mobile gate → Task 3 + Task 4 (`MapClient` `MIN_WIDTH`). ✓
- Testing (e2e smoke + `slugForName` unit) → Task 2 + Task 7. ✓
- Out of scope (extractor, DB loot, terrain fix, per-page embed) → not implemented, correct. ✓
- Prerequisite (user bakes assets) → called out up front + Task 6. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" left; the one deliberate `// @ts-nocheck` is a justified, explicit decision, not a placeholder. The e2e spec path is intentionally discovered in Task 7 Step 1 because the suite location varies — with an exact command to find it.

**Type consistency:** `slugForName(name) → {href} | null` and `__normalize` are defined in Task 2 and consumed identically in Task 5 step 5. `mountViewer(root) → () => void` defined and consumed in Task 5. Section slug `map` used consistently across taxonomy + SectionIcon + route. `.sand3d-map` scope class consistent across CSS (Task 3) and JSX (Task 5).

**Note on `@ts-nocheck`:** applied only to `MapViewer.tsx`, which contains the faithfully-ported vanilla JS. The pure, typed logic (`entityLinkIndex.ts`) is a separate file and stays fully type-checked and unit-tested.
