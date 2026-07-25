# Map Viewer Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Reskin the existing `/map` 3D viewer chrome to the wiki design system (per the approved mockup `apps/wiki/world-map.html`), and enrich the loot inspector with wiki entity links + icons.

**Architecture:** Pure restyle of the existing `MapViewer` client component — no new routes/data/scene changes. Scoped CSS (`.sand3d-map`) moves from sand-specific hexes to `globals.css` tokens + `--font-display`; the two HTML-generating functions (`buildLegend`, `showInfo`) get mockup-matching markup; `entityLinkIndex` gains icons. Keep all current behavior + recent tweaks (searchable picker, Space/Q controls, adaptive speed, no count text).

**Tech Stack:** Next.js client component, three.js (untouched), `@sandlabs/data` (icons/slugs), Vitest, Playwright.

**Spec:** the approved "Design: reskin `/map`" section in the session (serves as the spec).

---

## Reference tokens (globals.css, verified present)
`--background #0d0a06 · --card #15100a · --card-elevated #1d160d · --border #2a2012 · --border-strong #3a2c18 · --foreground #ece0cb · --muted-foreground #9a8f7c · --dim #74695a · --primary #e8893b · --primary-hover #f29b52 · --secondary #b5532a · --info #6aa9c9 · --warning #e0a341 · --font-display var(--font-oswald)`. `--font-mono`/`--font-body` are NOT global — define them on `.sand3d-map` like `builder.css` does.

## Decisions baked in
- Reuse `<ToolNavBrand title="3D Map" />` (NOT the mockup's square "S" mark).
- Category dot colors stay manifest-driven (the datamined palette).
- Inspector item names: link out to entity pages + show icon; plain text when no match. No reverse backlinks on entity pages (deferred).

---

### Task 1: `entityLinkIndex` returns an icon

**Files:** Modify `apps/wiki/src/components/map/entityLinkIndex.ts`; Test `apps/wiki/src/components/map/entityLinkIndex.test.ts`

- [ ] **Step 1: extend the test (TDD)** — add to the existing suite:

```ts
it("includes the entity icon when present", () => {
  const hit = slugForName("Binoculars");
  expect(hit).not.toBeNull();
  // icon is either a string src or null; when the entity has one it's a path
  expect(hit).toHaveProperty("icon");
});
```

- [ ] **Step 2: run, expect fail** — `cd apps/wiki && npx vitest run src/components/map/entityLinkIndex.test.ts` (fails: no `icon` key).

- [ ] **Step 3: implement** — change `EntityRoute` + the index build to carry `icon`:

```ts
export interface EntityRoute {
  href: string;
  icon: string | null;
}
// in getIndex(), when inserting:
if (!m.has(key)) m.set(key, { href: `${base}/${e.slug}`, icon: e.icon ?? null });
```

- [ ] **Step 4: run, expect pass** — same vitest command; all green.
- [ ] **Step 5: commit** — `git add … && git commit -m "feat(map): entity-route index also returns icon"`

---

### Task 2: `map.css` — restyle to design tokens + mockup layout

**Files:** Modify `apps/wiki/src/components/map/map.css`

Port the mockup's look onto the EXISTING scoped selectors (keep the ids/classes the JS uses; do not rename ids). This is a visual rewrite — use the mockup (`apps/wiki/world-map.html` `<style>`) as the reference and translate each `.mv-*` rule to the corresponding existing selector.

- [ ] **Step 1: container + fonts.** `.sand3d-map` keeps `position:fixed; inset:0` but restyle: `background:var(--background); color:var(--foreground); font-family:var(--font-body);` and declare `--font-body: system-ui,-apple-system,"Segoe UI",sans-serif; --font-mono: ui-monospace,"Cascadia Code",Menlo,monospace;` on it (like `builder.css`). Drop the `--s3d-*` sand aliases; use tokens directly below.

- [ ] **Step 2: app-bar (`header`).** Height 54px, `border-bottom:1px solid var(--border)`, `background:color-mix(in srgb,var(--background) 88%,transparent)`, `backdrop-filter:blur(10px)`. Style the Map/Search `.tab` spans as the mockup `.mv-seg` (bordered segmented control; `.tab.on` → `background:var(--primary);color:#1a0f04`). Style `#locinput`/`#loclist`/`.locrow` (the searchable picker) to the mockup's select look: `#locinput{font-family:var(--font-display);text-transform:uppercase;letter-spacing:.04em;font-size:13px;font-weight:600;color:var(--foreground);background:var(--card);border:1px solid var(--border-strong);padding:7px 13px}`; dropdown panel `background:var(--card)` etc.

- [ ] **Step 3: category panel (`aside`, `#catpanel`, tools, `#legend`).** `aside{background:var(--card);border-right:1px solid var(--border)}`. Head label `.mv-cats-head .t` look for the "Categories" `<h2>`. Restyle `.tools` to the 2×2 grid of `.mv-tool` buttons (`display:grid;grid-template-columns:1fr 1fr;gap:6px`; button `background:var(--card-elevated);border:1px solid var(--border);color:var(--muted-foreground)`; active `aria-pressed`/`.on` → primary border+tint). Restyle `.catrow`→`.mv-cat` grid, custom `.catrow input[type=checkbox]`→`.cx` (14px, `:checked` primary + ✓), `.caret`, `.sw`→dot 11px, `.n`, `.c` mono/dim. `.thingrow` (expanded things) indented rows.

- [ ] **Step 4: viewport overlays.** `#help`→ mockup `.mv-hint` (bottom-center pill, tokens). `#hud`→ `.mv-loctag` (bottom-right, uppercase display). Add `.mv-compass` styling (used by the new element in Task 3). `#load`/`#err`/`#tip` retinted to tokens.

- [ ] **Step 5: inspector (`#info`).** Restyle `#info` to `.mv-inspector` (top-right, `width:336px`, `background:color-mix(in srgb,var(--card) 96%,transparent)`, `border:1px solid var(--border-strong)`, shadow, blur, column flex, overflow hidden). Add classes the new `showInfo` markup will emit (Task 5): `.mv-ins-head/.mv-ins-title/.mv-ins-title .eff/.mv-ins-cat/.mv-ins-id/.mv-ins-body/.mv-amounts/.mv-aseg/.mv-becomes-lbl/.mv-become(.sel)/.mv-become-row/.mv-become-dot/.mv-become-nm/.mv-become-pct/.mv-become-contents/.ci/.cq` — copy these rules from the mockup verbatim (they already use tokens), scoping each under `.sand3d-map`. Add loot-icon style: `.sand3d-map .mv-loot-icon{width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:6px;background:var(--card-elevated);border:1px solid var(--border)}`.

- [ ] **Step 6: verify** — every selector begins with `.sand3d-map`; no leftover `var(--s3d-*)` that isn't defined; braces balanced. `git commit -m "style(map): reskin viewer chrome to the wiki design system"`

---

### Task 3: `MapViewer.tsx` markup — app-bar, tools, overlays

**Files:** Modify `apps/wiki/src/components/map/MapViewer.tsx` (JSX only)

- [ ] **Step 1: category tools 2×2 + aria.** In the `<aside>`, wrap the four tool buttons so CSS can grid them; give `#baseBtn`/`#xrayBtn` `aria-pressed="false"` (the JS toggles textContent already; also toggle aria in Task 4/existing handlers — minimal: add `aria-pressed` attr in JSX, and set it in the existing `baseBtn`/`xrayBtn` onclick). Keep ids.

- [ ] **Step 2: overlays.** Add a compass element inside the viewport area near `#help`/`#hud`: `<div id="compass">N</div>`. Keep `#help` and `#hud` (restyled in CSS). Update `#help` inner text already reads "Space up · Q down" (keep).

- [ ] **Step 3: verify** — `npx tsc --noEmit` (only 3 pre-existing). `git commit -m "feat(map): app-bar/tool/overlay markup for reskin"`

---

### Task 4: `buildLegend` markup → mockup `.mv-cat`

**Files:** Modify `apps/wiki/src/components/map/MapViewer.tsx` (`buildLegend`)

- [ ] **Step 1: reorder + rename the row markup** so it matches the mockup column order (checkbox, caret, dot, name, count) while keeping the SAME event wiring. Change the `row.innerHTML` to:

```js
row.innerHTML = `<input class="cx" type="checkbox" ${st !== "none" ? "checked" : ""}>` +
  `<span class="caret">${open ? "▾" : "▸"}</span>` +
  `<span class="sw" style="background:${color}"></span>` +
  `<span class="n">${label}</span><span class="c">${count}</span>`;
```

(Keep `row.className="catrow"`, the `cb`/`caret` lookups, and all handlers unchanged — only the order/`class="cx"` on the input changed. CSS in Task 2 styles `.catrow .cx`.)

- [ ] **Step 2: toggle `.off` class already handled** by `hidden`/thingrow logic — no change. Verify `tsc`. `git commit -m "style(map): category legend rows match mockup"`

---

### Task 5: `showInfo` → mockup inspector + icons + links

**Files:** Modify `apps/wiki/src/components/map/MapViewer.tsx` (`showInfo` + the existing `nameHtml`)

- [ ] **Step 1: icon-aware link helper.** Replace `nameHtml` with one that renders icon + linked name from the extended index:

```js
const nameHtml = (label) => {
  const hit = slugForName(label);
  const icon = hit && hit.icon ? `<img class="mv-loot-icon" src="${hit.icon}" alt="" aria-hidden="true">` : "";
  return hit
    ? `${icon}<a class="ci" href="${hit.href}">${label}</a>`
    : `${icon}${label}`;
};
```

- [ ] **Step 2: restyle the panel markup.** Rewrite `showInfo`'s `$("info").innerHTML` to the mockup structure using the existing data (`o.userData.t` title, `cat` label+color dot, `o.userData.b` id, `E`/`E.m`/`E.loot` loot with `LOOTMODE` amounts). Use classes: `.mv-ins-head/.mv-ins-title` (highlight a trailing `[..]` effort tag in `<span class="eff">`), `.mv-ins-cat` (dot + label), `.mv-ins-id` (blueprint id), `.mv-ins-body`, `.mv-amounts` + `.mv-aseg` (Stormdive/Voyage — wire the existing `LOOTMODE` click handler to `.mv-aseg button`), `.mv-becomes-lbl`, and each member as `.mv-become` with `.mv-become-row` (dot+`nameHtml(member)`+`.mv-become-pct`) and `.mv-become-contents` (grid of `nameHtml(item)` + `.cq` quantity). Direct container contents (`E.loot`) render as a `.mv-become-contents` block under a "Contents" label. Keep the existing `.lm`/amounts click rebinding but retarget to `.mv-aseg button`.

- [ ] **Step 2b:** keep `#info` shown/hidden logic (`display:block/none`) and the `selected` highlight unchanged.

- [ ] **Step 3: verify** — `npx tsc --noEmit` clean; manually confirm (dev) an opened container shows icons + links that navigate to entity pages, and the Stormdive/Voyage toggle still switches amounts. `git commit -m "feat(map): reskinned loot inspector with entity icons + links"`

---

### Task 6: fix + extend the e2e for the new picker/chrome

**Files:** Modify `apps/wiki/tests/e2e/map.spec.ts`

- [ ] **Step 1: fix the broken assertion.** The picker overhaul replaced `<select id="loc">` with `#locinput`, so `#loc option` no longer exists. Update the "mounts" test to assert the combobox instead:

```ts
test("mounts on a wide viewport and the location picker opens with the fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/map");
  await expect(page.getByText("3D Map")).toBeVisible();
  const input = page.locator("#locinput");
  await expect(input).toBeVisible();
  await input.click(); // focus opens the list
  await expect(page.locator("#loclist .locrow")).toHaveCount(1); // fixture: one location
  await expect(page.locator("#loclist")).toContainText("Test POI");
});
```

(Keep the narrow-viewport gate test as-is.)

- [ ] **Step 2: run** — with a dev server on :3000 (fixtures in `public/map`), `cd apps/wiki && npx playwright test tests/e2e/map.spec.ts --project=chromium`. Both pass. NOTE: local working tree currently has the REAL manifest (63 locs) — for the e2e, either run against the committed fixtures (`git stash`-free: temporarily `git checkout apps/wiki/public/map/manifest.json spawns.json`, run, then re-copy real) OR assert `≥ 1` rows. Prefer restoring fixtures for the run.
- [ ] **Step 3: commit** — `git add … && git commit -m "test(map): update e2e for the searchable location picker"`

---

## Self-Review
- **Spec coverage:** chrome tokens (T2), app-bar+ToolNavBrand+seg+picker (T2/T3), category panel (T2/T4), inspector + icons + links (T1/T2/T5), overlays+compass (T2/T3), e2e regression (T6). ✓
- **Placeholders:** none — code shown for each logic step; CSS steps reference the mockup rules to port verbatim with `.sand3d-map` scoping.
- **Type consistency:** `EntityRoute { href, icon }` defined T1, consumed by `nameHtml` T5. `#locinput`/`#loclist`/`.locrow` used consistently in CSS (T2) and e2e (T6). Existing ids (`#info`,`#legend`,`#help`,`#hud`,`#compass`) unchanged except the added `#compass`.
- **Regression caught:** T6 fixes the `#loc`→`#locinput` e2e break from `c2bfef7`.
