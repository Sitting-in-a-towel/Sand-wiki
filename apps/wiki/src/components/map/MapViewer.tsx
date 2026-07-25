/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ToolNavBrand } from "@/components/ToolNavBrand";
import { slugForName, keyOpens, doorKey } from "@/components/map/entityLinkIndex";
import "@/components/map/map.css";

// Faithful port of sand3d/viewer/index.html's <script type="module"> body.
// Kept as close to byte-for-byte as a React wrapper allows — see the task
// notes for the deliberate list of adaptations (scoped $, ASSETS path,
// bundled three imports, RAF handle + listener teardown, loot cross-links).
export default function MapViewer() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return mountViewer(root);
  }, []);

  return (
    <div className="sand3d-map" ref={rootRef}>
      <canvas id="c"></canvas>
      <header>
        <ToolNavBrand title="3D Map" />
        <div className="mv-seg">
          <span className="tab on" id="tabMap">Map</span>
          <span className="tab" id="tabSearch">Search</span>
        </div>
        <div id="locpick">
          <input id="locinput" type="text" placeholder="Search location…" autoComplete="off" spellCheck={false} />
          <div id="loclist"></div>
        </div>
      </header>
      <aside>
        <div id="catpanel">
          <h2>Categories</h2>
          <div className="tools">
            <button id="allOn">All</button>
            <button id="allOff">None</button>
            <button id="baseBtn" aria-pressed="false">Hide terrain</button>
            <button id="xrayBtn" aria-pressed="false">X-ray items</button>
          </div>
          <div id="legend"></div>
        </div>
      </aside>
      <div id="info"></div>
      <div id="help">
        <b>Drag</b> look · <b>scroll</b> move · <b>WASD</b> fly · <b>Space</b> up · <b>Q</b> down · <b>Shift</b> fast · <b>click</b> inspect
      </div>
      <div id="hud"></div>
      <div id="tip"></div>
      <div id="load">loading…</div>
      <div id="err"></div>
      <div id="search">
        <input
          id="sbox"
          placeholder="Search objects across all 62 locations (e.g. wine, ghoul, sniper, key)…"
          autoComplete="off"
        />
        <div id="sresults"></div>
      </div>
    </div>
  );
}

function mountViewer(root) {
  const $ = (id) => root.querySelector("#" + id);
  const errEl = $("err"), loadEl = $("load"), tip = $("tip");
  function fail(msg) { errEl.style.display = "block"; errEl.innerHTML = msg; loadEl.style.display = "none"; }

  // teardown bookkeeping: removable listeners + the RAF handle
  const off = [];
  // liveness flag: StrictMode double-invokes this effect in dev (mount -> cleanup -> mount,
  // same DOM). Guards the top-level fetch().then() chains below so a phantom first-mount's
  // fetch resolving after its teardown ran does nothing (else the picker list gets
  // built twice / a stale location loads).
  let alive = true;

  // ---- loot cross-links: a label becomes an icon + link to its wiki entity page when
  //      a matching entity exists; falls back to (icon +) plain text otherwise. `cls`
  //      styles the name (".ci" for loot items, "mv-become-nm" for spawner members). ----
  // loot-box labels carry a spawner "effort" variant (Low/Mid/High/Mixed) we don't
  // want to show — strip it for display but keep the tier (T1/T2/…).
  const cleanLabel = (s) => (s || "").replace(/\s*\b(?:Low|Mid|High|Mixed)\s+Effort\b/gi, "").replace(/\s{2,}/g, " ").trim();
  // trailing effort/tier tag ("… [mid]") kept as a small badge so swapping to the wiki name
  // (which has no such tag) doesn't drop the spawner's effort tier.
  const effBadge = (label) => { const m = /\s*(\[[^\]]+\])\s*$/.exec(label || ""); return m ? ` <span class="eff">${m[1]}</span>` : ""; };
  // what to show for a loot row: the resolved wiki entity's canonical name when it links,
  // otherwise the cleaned blueprint label. Keeps the effort badge either way.
  const dispName = (label, hit) => (hit && !hit.family ? `${hit.name}${effBadge(label)}` : cleanLabel(label));
  const namedLink = (label, cls) => {
    const hit = slugForName(label);
    const disp = dispName(label, hit);
    const ic = hit && hit.icon ? `<img class="mv-loot-icon" src="${hit.icon}" alt="" aria-hidden="true">` : "";
    return hit
      ? `<a class="${cls}" href="${hit.href}">${ic}${disp}</a>`
      : `<span class="${cls}">${ic}${disp}</span>`;
  };

  // ---- renderer / scene ----
  const canvas = $("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // filmic tone mapping + colour management for a "rendered" look (matches the builder)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  // sandy vertical gradient sky (screen-filling) instead of flat dark brown
  const _sky = (() => {
    const c = document.createElement("canvas"); c.width = 2; c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#b39c72"); grd.addColorStop(0.45, "#8a7551"); grd.addColorStop(1, "#4c4029");
    g.fillStyle = grd; g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  scene.background = _sky;
  scene.fog = new THREE.Fog(0x8a7551, 500, 2600); // dark sandy haze so distance blends into the sky
  // image-based lighting: a neutral procedural room env gives every surface soft, even
  // fill — the single biggest quality win, same approach as the Trampler Builder.
  const _pmrem = new THREE.PMREMGenerator(renderer);
  const _envTex = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = _envTex;
  scene.environmentIntensity = 0.4; // gentle IBL fill — full strength blows the scene out
  _pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 8000);
  // first-person fly camera: pivot is the camera itself (look in place), not an orbit target.
  const euler = new THREE.Euler(0, 0, 0, "YXZ"); // yaw(Y) then pitch(X), no roll
  let sceneR = 100; // scene scale (set per location) drives all speeds
  const sceneCenter = new THREE.Vector3(); // scene centre (set per location) → adaptive speed
  function setLook() { camera.quaternion.setFromEuler(euler); }
  const fwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const rgt = () => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a2118, 0.35)); // cool sky / warm ground
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.2); sun.position.set(0.6, 1, 0.35); scene.add(sun); // warm key
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25); fill.position.set(-0.5, 0.4, -0.6); scene.add(fill); // cool fill

  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); // updateStyle=true:
    camera.aspect = w / h; camera.updateProjectionMatrix(); } // set canvas CSS size so buffer-centre==screen-centre
  window.addEventListener("resize", resize); off.push(() => window.removeEventListener("resize", resize));
  resize();

  // ---- WASD/QE + Space fly (move along view direction) ----
  const keys = {};
  function onKeyDown(e) { if (/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === "Space") e.preventDefault(); // Space = ascend; don't page-scroll or click focused UI
    keys[e.code] = true; }
  function onKeyUp(e) { keys[e.code] = false; }
  window.addEventListener("keydown", onKeyDown); off.push(() => window.removeEventListener("keydown", onKeyDown));
  window.addEventListener("keyup", onKeyUp); off.push(() => window.removeEventListener("keyup", onKeyUp));
  const boostMul = () => (keys.ShiftLeft || keys.ShiftRight) ? 4 : 1; // hold Shift = 4× speed (fast traversal)
  // Adaptive speed: scale with the camera's distance to the scene centre (clamped), so you
  // slow right down when close among objects and stay quick when far out. Base factor tuned
  // slower than before per feedback that it was hard to navigate up close.
  const BASE_SPEED = 0.25;
  const moveScale = () => { const d = camera.position.distanceTo(sceneCenter); return Math.min(sceneR, Math.max(sceneR * 0.04, d)); };
  let dollyVel = 0; // wheel-scroll momentum along the view dir; eased out each frame (smooth scroll)
  function flyStep(dt) {
    const sp = moveScale() * BASE_SPEED * dt * boostMul(); // slower when close to the scene; Shift = 4× boost
    const f = fwd(), r = rgt(), m = new THREE.Vector3();
    if (keys.KeyW) m.add(f); if (keys.KeyS) m.sub(f);
    if (keys.KeyD) m.add(r); if (keys.KeyA) m.sub(r);
    if (keys.KeyE || keys.Space) m.y += 1; if (keys.KeyQ) m.y -= 1; // Space or E = up, Q = down
    if (m.lengthSq()) camera.position.addScaledVector(m.normalize(), sp);
    // smooth wheel dolly: apply the current momentum this frame, then decay it toward zero.
    // ~0.12s time constant → glides to a stop in ~0.3s instead of snapping per notch.
    if (Math.abs(dollyVel) > sceneR * 1e-4) {
      camera.position.addScaledVector(fwd(), dollyVel * dt);
      dollyVel *= Math.exp(-dt / 0.12);
    } else dollyVel = 0;
  }

  // ---- highlight materials (shared) ----
  const HOVER = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });
  const SELECT = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33e0ff, emissiveIntensity: 1.4 });
  let hovered = null, selected = null;
  function setMat(o, m) { if (!o) return; if (m) { if (!o._om) o._om = o.material; o.material = m; }
    else if (o._om) { o.material = o._om; o._om = null; } }

  // hovering a name in the left list drops bright, always-on-top markers on the matching
  // objects so small ones (e.g. keys) are spottable from afar. Cleared on mouse-leave.
  const _hlGroup = new THREE.Group(); scene.add(_hlGroup);
  const _hlGeo = new THREE.SphereGeometry(1, 12, 8);
  const _hlMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, depthTest: false, transparent: true, opacity: 0.95 });
  const _hlV = new THREE.Vector3();
  function highlightMeshes(meshes, color) {
    _hlGroup.clear();
    if (!meshes || !meshes.length) return;
    if (color) _hlMat.color.set(color); // markers take the item's category colour
    const r = Math.max(0.6, sceneR * 0.0015); // small pin
    for (const o of meshes) {
      if (!o.visible) continue;
      o.getWorldPosition(_hlV);
      const s = new THREE.Mesh(_hlGeo, _hlMat);
      s.position.copy(_hlV); s.scale.setScalar(r); s.renderOrder = 1000;
      _hlGroup.add(s);
    }
  }

  // ---- state ----
  let CATS = [], LOCCATS = [], current = null, pickables = [], showBase = true, xray = false;
  // only these enemy/AI-spawn objects are shown; every other "enemy" object is fully hidden
  const ENEMY_ALLOW = new Set(["Ai Spawn Nest Ghoul", "Sentinel Spawner Ambush"]);
  const DOOR_RED = "#e0473c"; // destructible-door tint (applied to meshes + the legend dot)
  let byCat = {}; // catKey -> {label,color, things:Map(thingKey->{label,meshes})}
  const hidden = new Set(); // hidden thing keys (blueprint); category state derives from these
  let pendingSolo = null; // blueprint to isolate after next load (from a search jump)
  let SEARCHIX = {}, LOCMAP = {}; // global thing index + key->{glb,label,cat} (from manifest)
  let SPAWNS = {}; // blueprint -> [[item label, cat], ...] (set/random spawners)
  const GLB2KEY = {}; // reverse: glb path -> location key (for the URL hash)
  let currentLocKey = null; // key of the currently-open location
  const openCats = new Set(); // expanded categories (persist across re-render)
  // ---- persist the category filter across reloads/locations (localStorage) ----
  const known = new Set(); // thing-keys we've already applied the default-visibility rule to
  const FKEY = "sand3d-map:filters";
  const saveFilters = () => { try { localStorage.setItem(FKEY, JSON.stringify({ hidden: [...hidden], known: [...known] })); } catch { /* storage disabled */ } };
  try { const s = JSON.parse(localStorage.getItem(FKEY) || "{}");
    if (Array.isArray(s.hidden)) s.hidden.forEach(k => hidden.add(k));
    if (Array.isArray(s.known)) s.known.forEach(k => known.add(k)); } catch { /* ignore */ }
  // Generic green "Container Box" crates are clutter — hidden by default until the user
  // opts in. Applied once per newly-seen thing-key; the user's choice then persists.
  const defaultHidden = (label) => /^container box\b/i.test(label || "");
  function applyDefaults() {
    let changed = false;
    for (const k in byCat) for (const [tk, t] of byCat[k].things) {
      if (!known.has(tk)) { known.add(tk); changed = true; if (defaultHidden(t.label)) hidden.add(tk); }
    }
    if (changed) saveFilters();
  }
  const loader = new GLTFLoader();
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const PICK_TOL = 24; // px: clicking/hovering this near a small object still selects it
  const _wp = new THREE.Vector3(), _dir = new THREE.Vector3(); // scratch for the generous-pick fallback

  // baked assets (manifest, spawns table, *.glb.gz). Default: the wiki's own public/map/
  // folder. In production the ~500MB asset set lives off-repo (e.g. Vercel Blob); point
  // NEXT_PUBLIC_MAP_ASSETS_BASE at that base URL and every fetch below follows it.
  const _base = process.env.NEXT_PUBLIC_MAP_ASSETS_BASE || "/map/";
  const ASSETS = _base.endsWith("/") ? _base : _base + "/";

  // ---- load the static spawner->items table (optional; click panel lists what a spawner can become) ----
  fetch(ASSETS + "spawns.json").then(r => r.ok ? r.json() : {}).then(s => { if (!alive) return; SPAWNS = s; }).catch(() => {});

  // ---- searchable location picker + manifest load ----
  // Events duplicate the islands, except these two standalone set-pieces — drop the rest.
  const KEEP_EVENTS = new Set(["loc_event_Dreadnought", "loc_event_ShipGraveyard"]);
  const catRank = c => (c === "event" ? 0 : c === "poi" ? 3 : 1); // events on top, POIs at the very bottom
  let LOCITEMS = [], locFiltered = [], locActive = -1; // combobox state
  const locInput = $("locinput"), locList = $("loclist");

  function renderLocList(q) {
    q = (q || "").trim().toLowerCase();
    locFiltered = q ? LOCITEMS.filter(it => it.label.toLowerCase().includes(q)) : LOCITEMS.slice();
    locActive = -1; locList.innerHTML = "";
    if (!locFiltered.length) { const d = document.createElement("div"); d.className = "locempty"; d.textContent = "No match"; locList.appendChild(d); return; }
    const counts = {}; for (const it of locFiltered) counts[it.cat] = (counts[it.cat] || 0) + 1;
    let lastCat = null;
    locFiltered.forEach((it, i) => {
      if (it.cat !== lastCat) { lastCat = it.cat;
        const h = document.createElement("div"); h.className = "locgroup";
        h.textContent = `${it.catLabel} (${counts[it.cat]})`; locList.appendChild(h); }
      const row = document.createElement("div"); row.className = "locrow"; row.dataset.i = i;
      row.innerHTML = `<span class="locname">${it.label}</span><span class="loccount">${it.objects}</span>`;
      row.onmousedown = e => { e.preventDefault(); chooseLoc(i); }; // mousedown fires before the input's blur
      locList.appendChild(row);
    });
  }
  function highlightActive() {
    locList.querySelectorAll(".locrow").forEach(r => r.classList.toggle("active", +r.dataset.i === locActive));
    const a = locList.querySelector(".locrow.active"); if (a) a.scrollIntoView({ block: "nearest" });
  }
  function chooseLoc(i) { const it = locFiltered[i]; if (!it) return;
    locList.classList.remove("open"); locInput.blur(); loadLoc(it.glb, it.label); }
  locInput.addEventListener("focus", () => { locInput.select(); renderLocList(""); locList.classList.add("open"); });
  locInput.addEventListener("input", () => { renderLocList(locInput.value); locList.classList.add("open"); });
  locInput.addEventListener("blur", () => { setTimeout(() => locList.classList.remove("open"), 120); });
  locInput.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault();
      if (!locList.classList.contains("open")) { renderLocList(locInput.value); locList.classList.add("open"); }
      const n = locFiltered.length; if (!n) return;
      locActive = (locActive + (e.key === "ArrowDown" ? 1 : -1) + n) % n; highlightActive();
    } else if (e.key === "Enter") { e.preventDefault();
      if (locActive >= 0) chooseLoc(locActive); else if (locFiltered.length === 1) chooseLoc(0);
    } else if (e.key === "Escape") { locList.classList.remove("open"); locInput.blur(); }
  });

  // resolve a landmark name (from a /map#place=<name> deep link on a wiki landmark page)
  // to a location key — match the location label first, then the key suffix; on ties
  // prefer island > fort > event > poi. Lets landmark pages link without knowing keys.
  const _normPlace = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function resolvePlace(name) {
    const q = _normPlace(name); if (!q) return null;
    const prio = { island: 0, fort: 1, event: 2, poi: 3 };
    let best = null, bestP = 99;
    const consider = it => { const p = prio[it.cat] ?? 5; if (p < bestP) { best = it; bestP = p; } };
    for (const it of LOCITEMS) if (_normPlace(it.label) === q) consider(it);
    if (!best) for (const it of LOCITEMS) if (_normPlace(it.key.replace(/^(island_|poi_|loc_event_)/, "")) === q) consider(it);
    return best ? best.key : null;
  }

  fetch(ASSETS + "manifest.json").then(r => { if (!r.ok) throw 0; return r.json(); }).then(m => {
    if (!alive) return;
    CATS = m.cats; LOCCATS = m.loccats;
    const _dc = CATS.find(c => c[0] === "door"); if (_dc) _dc[2] = DOOR_RED; // legend dot matches the red door meshes
    // clean: drop event locations that just duplicate islands (keep KEEP_EVENTS)
    const locs = m.locations.filter(l => l.cat !== "event" || KEEP_EVENTS.has(l.key));
    // cross-location object-search index, built from the cleaned set
    LOCMAP = {}; SEARCHIX = {};
    locs.forEach(l => { LOCMAP[l.key] = { glb: l.glb, label: l.label, cat: l.cat }; GLB2KEY[l.glb] = l.key;
      (l.things || []).forEach(([label, cat, bp, count]) => {
        if (cat === "enemy" && !ENEMY_ALLOW.has(label)) return; // keep hidden enemies out of search too
        let e = SEARCHIX[bp]; if (!e) e = SEARCHIX[bp] = { label, cat, total: 0, locs: {} };
        e.total += count; e.locs[l.key] = (e.locs[l.key] || 0) + count; }); });
    // ordered picker list: events first, then the rest; manifest order within a category
    const catLabel = Object.fromEntries((LOCCATS || []).map(([ck, cl]) => [ck, cl]));
    const cats = [...new Set(locs.map(l => l.cat))].sort((a, b) => catRank(a) - catRank(b));
    LOCITEMS = [];
    for (const ck of cats) for (const l of locs.filter(x => x.cat === ck))
      LOCITEMS.push({ glb: l.glb, label: l.label, cat: ck, catLabel: catLabel[ck] || ck, objects: l.objects, key: l.key });
    // initial location: #loc=<key>, else #place=<landmark name>, else the first item
    const h = readHash();
    const startKey = (h.loc && LOCMAP[h.loc]) ? h.loc : resolvePlace(h.place);
    if (startKey && LOCMAP[startKey]) loadLoc(LOCMAP[startKey].glb, LOCMAP[startKey].label);
    else if (LOCITEMS.length) loadLoc(LOCITEMS[0].glb, LOCITEMS[0].label);
  }).catch(() => fail(
    `Couldn't load <code>manifest.json</code>. The 3D viewer needs a local web server (browsers block
     <code>fetch()</code> of local files over <code>file://</code>).<br><br>Run from this folder:<br>
     <code>python3 -m http.server</code><br>then open <code>http://localhost:8000/</code>.<br><br>
     If the page is already served, the GLBs may not be baked yet.`));

  // ---- category legend: checkbox toggles the category (cascades to its things), big row expands ----
  const thingKeyOf = o => o.userData.b || o.userData.t; // group objects by blueprint (fallback label)
  function buildGroups() { // per-location: catKey -> {things:Map}
    byCat = {};
    for (const o of pickables) {
      const cat = o.userData.c, tk = thingKeyOf(o);
      let g = byCat[cat]; if (!g) { const meta = CATS.find(c => c[0] === cat) || [cat, cat, "#888"];
        g = byCat[cat] = { label: meta[1], color: meta[2], things: new Map() }; }
      let t = g.things.get(tk); if (!t) { t = { label: o.userData.t, meshes: [] }; g.things.set(tk, t); }
      t.meshes.push(o);
    }
  }
  function catState(k) { const g = byCat[k]; let h = 0, n = 0; // 'all' | 'none' | 'some'
    for (const tk of g.things.keys()) hidden.has(tk) ? h++ : n++;
    return h === 0 ? "all" : n === 0 ? "none" : "some"; }
  function buildLegend() {
    const lg = $("legend"); lg.innerHTML = "";
    CATS.forEach(([k, label, color]) => {
      const g = byCat[k]; if (!g) return;
      const count = [...g.things.values()].reduce((a, t) => a + t.meshes.length, 0);
      const open = openCats.has(k), st = catState(k);
      const wrap = document.createElement("div");
      const row = document.createElement("div"); row.className = "catrow"; row.dataset.k = k;
      row.innerHTML = `<input class="cx" type="checkbox" ${st !== "none" ? "checked" : ""}>` +
        `<span class="caret">${open ? "▾" : "▸"}</span>` +
        `<span class="sw" style="background:${color}"></span>` +
        `<span class="n">${label}</span><span class="c">${count}</span>`;
      const cb = row.querySelector("input"); cb.indeterminate = (st === "some");
      const things = document.createElement("div"); things.className = "things" + (open ? " open" : "");
      [...g.things.entries()].sort((a, b) => b[1].meshes.length - a[1].meshes.length).forEach(([tk, t]) => {
        const tr = document.createElement("div"); tr.className = "thingrow" + (hidden.has(tk) ? " off" : ""); tr.dataset.tk = tk;
        tr.innerHTML = `<input type="checkbox" ${hidden.has(tk) ? "" : "checked"}>` +
          `<span class="dotmini" style="background:${color}"></span><span class="n">${t.label}</span><span class="c">${t.meshes.length}</span>`;
        tr.onclick = e => { e.stopPropagation(); hidden.has(tk) ? hidden.delete(tk) : hidden.add(tk); saveFilters(); update(); };
        tr.onmouseenter = () => highlightMeshes(t.meshes, color); // spotlight these objects in the scene
        tr.onmouseleave = () => highlightMeshes(null);
        things.appendChild(tr);
      });
      cb.onclick = e => { e.stopPropagation(); const hide = (st !== "none"); // checkbox: toggle whole category
        for (const tk of g.things.keys()) hide ? hidden.add(tk) : hidden.delete(tk); saveFilters(); update(); };
      const caret = row.querySelector(".caret");
      const toggleOpen = e => { e.stopPropagation(); openCats.has(k) ? openCats.delete(k) : openCats.add(k);
        const o = openCats.has(k); things.classList.toggle("open", o); caret.textContent = o ? "▾" : "▸"; };
      caret.onclick = toggleOpen; row.onclick = toggleOpen; // big expand target (everything but the checkbox)
      row.onmouseenter = () => highlightMeshes([...g.things.values()].flatMap(t => t.meshes), color); // whole category
      row.onmouseleave = () => highlightMeshes(null);
      wrap.appendChild(row); wrap.appendChild(things); lg.appendChild(wrap);
    });
  }
  function update() { // apply the hidden-set to objects + refresh legend UI
    for (const o of pickables) o.visible = !hidden.has(thingKeyOf(o));
    if (current) current.traverse(o => { const ud = o.userData; if (!ud) return;
      if (ud.sand) o.visible = showBase;
      else if (ud.base) o.visible = showBase; }); // transparent/non-display mats are dropped at bake time
    if (hovered && !hovered.visible) { if (hovered !== selected) setMat(hovered, null); hovered = null; tip.style.display = "none"; }
    buildLegend();
  }
  $("allOn").onclick = () => { hidden.clear(); saveFilters(); update(); };
  $("allOff").onclick = () => { for (const k in byCat) for (const tk of byCat[k].things.keys()) hidden.add(tk); saveFilters(); update(); };
  $("baseBtn").onclick = () => { showBase = !showBase; const b = $("baseBtn");
    b.textContent = showBase ? "Hide terrain" : "Show terrain"; b.setAttribute("aria-pressed", String(!showBase)); update(); };
  // X-ray: draw item meshes over terrain (depthTest off + high renderOrder). Highlight mats share the flag.
  function applyXray() {
    HOVER.depthTest = SELECT.depthTest = !xray;
    for (const o of pickables) { o.renderOrder = xray ? 10 : 0;
      if (o.material) o.material.depthTest = !xray;
      if (o._om) o._om.depthTest = !xray; }
  }
  $("xrayBtn").onclick = () => { xray = !xray; const b = $("xrayBtn");
    b.textContent = xray ? "X-ray on" : "X-ray items"; b.setAttribute("aria-pressed", String(xray)); applyXray(); };

  // ---- fetch + gunzip + parse a GLB ----
  async function fetchGlb(url) {
    const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status);
    let buf;
    if (url.endsWith(".gz")) {
      if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
      buf = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    } else buf = await r.arrayBuffer();
    return await loader.parseAsync(buf, "");
  }

  // TODO(map): also dispose materials/textures here (careful: skip shared HOVER/SELECT mats) — leaks across remounts.
  function disposeCurrent() {
    if (!current) return; scene.remove(current);
    current.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    current = null; pickables = []; selected = hovered = null; $("info").style.display = "none";
  }

  async function loadLoc(glb, label) {
    currentLocKey = GLB2KEY[glb] || null; writeHash(); // reflect the open location in the URL
    loadEl.style.display = "flex"; loadEl.textContent = "loading " + (label || glb) + "…"; errEl.style.display = "none";
    try {
      const gltf = await fetchGlb(ASSETS + glb);
      disposeCurrent();
      current = gltf.scene; scene.add(current);
      pickables = [];
      const _neut = new Set(); // dedup shared materials
      const _doorMat = new Set(); // dedup door materials being recoloured
      current.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = true;
        if (o.userData && o.userData.t) { // interactable — keeps its category tint
          // enemies/AI spawns: hide everything except these two (fully hidden, not just toggled off)
          if (o.userData.c === "enemy" && !ENEMY_ALLOW.has(o.userData.t)) { o.visible = false; return; }
          // destructible doors: recolour to red
          if (o.userData.c === "door") {
            const dmats = Array.isArray(o.material) ? o.material : [o.material];
            for (const mt of dmats) { if (mt && mt.color && !_doorMat.has(mt)) { _doorMat.add(mt); mt.color.set(DOOR_RED); } }
          }
          pickables.push(o); return;
        }
        // non-clickable geometry (terrain + base structures): mute to earth-grey mid-tones
        // so only the colored, clickable objects carry hue. Matte, no env reflection.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) {
          if (!mt || _neut.has(mt) || !mt.color) continue; _neut.add(mt);
          const l = mt.color.getHSL({}).l;
          mt.color.setHSL(0.08, 0.06, Math.min(0.5, Math.max(0.3, l)));
          if (mt.metalness !== undefined) mt.metalness = 0;
          if (mt.roughness !== undefined) mt.roughness = 1;
        }
      });
      // frame camera on bounding box, then look at its centre
      const box = new THREE.Box3().setFromObject(current); const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3()); sceneR = Math.max(sz.x, sz.y, sz.z) * 0.6 + 5;
      sceneCenter.copy(c); // adaptive speed scales with distance from here
      camera.position.set(c.x + sceneR * 0.7, c.y + sceneR * 0.8, c.z + sceneR * 0.7);
      camera.near = Math.max(0.3, sceneR / 2000); camera.far = sceneR * 60; camera.updateProjectionMatrix();
      camera.lookAt(c); euler.setFromQuaternion(camera.quaternion, "YXZ"); // seed fly-cam orientation
      showBase = true; $("baseBtn").textContent = "Hide terrain"; // keep the persisted category filter
      buildGroups();
      applyDefaults(); // default-hide new container-box crates (once), respecting saved choices
      if (pendingSolo) { // arriving from a search jump: isolate one thing
        for (const k in byCat) for (const tk of byCat[k].things.keys()) if (tk !== pendingSolo) hidden.add(tk);
        for (const k in byCat) if (byCat[k].things.has(pendingSolo)) openCats.add(k);
        pendingSolo = null;
      }
      update();
      applyXray(); // re-apply x-ray to the new location's items
      applyHash(readHash()); // restore any afterLoad state (camera) from the URL
      const li = $("locinput"); if (li) li.value = label || ""; // sync the searchable picker
      $("hud").textContent = label || "";
      loadEl.style.display = "none";
    } catch (e) { fail(`Failed to load <code>${glb}</code>: ${e.message}.<br>Make sure the GLBs are baked and served over http.`); }
  }

  // ---- URL hash state (extensible) ----
  // Each part knows how to read its current value and how to apply one from the hash.
  // To add filters/camera later: add an entry here (get returns null/'' to omit; apply restores).
  // `afterLoad:true` parts are applied once a location finishes loading (filters/camera need it).
  const HASH_PARTS = {
    loc: {
      get: () => currentLocKey || null,
      apply: (key) => { const l = LOCMAP[key]; if (!l) return false;
        if (key === currentLocKey) return true; // already open
        loadLoc(l.glb, l.label); return true; },
    },
  };
  let _suppressHash = false;
  function readHash() {
    const out = {}, h = location.hash.replace(/^#/, "");
    if (h) for (const kv of h.split("&")) { const i = kv.indexOf("=");
      if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }
    return out;
  }
  function writeHash() {
    if (_suppressHash) return;
    const parts = [];
    for (const k in HASH_PARTS) { const v = HASH_PARTS[k].get(); if (v != null && v !== "") parts.push(k + "=" + encodeURIComponent(v)); }
    const h = parts.length ? "#" + parts.join("&") : location.pathname + location.search;
    history.replaceState(null, "", h); // replaceState: doesn't fire hashchange
  }
  function applyHash(state) { // apply the non-loc parts that need a loaded location
    for (const k in HASH_PARTS) { const p = HASH_PARTS[k];
      if (p.afterLoad && k in state) { _suppressHash = true; try { p.apply(state[k]); } finally { _suppressHash = false; } } }
  }
  // react to manual hash edits / back-forward (our own writes use replaceState, so they don't loop here)
  function onHashChange() { const s = readHash();
    const key = (s.loc && LOCMAP[s.loc]) ? s.loc : resolvePlace(s.place);
    if (key && LOCMAP[key] && key !== currentLocKey) loadLoc(LOCMAP[key].glb, LOCMAP[key].label); }
  window.addEventListener("hashchange", onHashChange); off.push(() => window.removeEventListener("hashchange", onHashChange));

  // ---- picking ----
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    ndc.x = (px / r.width) * 2 - 1; ndc.y = -(py / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const vis = pickables.filter(o => o.visible); // skip filtered-out objects
    // 1) exact triangle hit wins — precise when you click right on something.
    const hit = ray.intersectObjects(vis, false);
    if (hit.length) return hit[0].object;
    // 2) fallback: nearest object CENTER within PICK_TOL px of the cursor, so small
    //    crates/markers are selectable by clicking near them. Tie → nearer the camera.
    const f = fwd();
    let best = null, bestD = PICK_TOL, bestCam = Infinity;
    for (const o of vis) {
      o.getWorldPosition(_wp);
      _dir.subVectors(_wp, camera.position);
      const camDist = _dir.length();
      if (_dir.dot(f) <= 0) continue; // behind the camera
      _wp.project(camera); // world → NDC (mutates _wp)
      const sx = (_wp.x * 0.5 + 0.5) * r.width;
      const sy = (-_wp.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d > PICK_TOL) continue;
      if (d < bestD - 2 || (Math.abs(d - bestD) <= 2 && camDist < bestCam)) {
        best = o; bestD = d; bestCam = camDist;
      }
    }
    return best;
  }
  function hoverPick(ev) {
    const o = pick(ev);
    if (o !== hovered) { if (hovered && hovered !== selected) setMat(hovered, null);
      hovered = o; if (o && o !== selected) setMat(o, HOVER); }
    if (o) { tip.style.display = "block"; tip.style.left = (ev.clientX + 13) + "px"; tip.style.top = (ev.clientY + 13) + "px";
      tip.textContent = o.userData.t; canvas.style.cursor = "pointer"; }
    else { tip.style.display = "none"; canvas.style.cursor = "grab"; }
  }
  function clickPick(ev) {
    const o = pick(ev);
    if (selected) { setMat(selected, null); if (selected === hovered) setMat(selected, HOVER); }
    selected = o;
    if (o) setMat(o, SELECT);
    showInfo(o);
  }
  let LOOTMODE = "Storm"; // Stormdive vs Voyage loot amounts — see docs/LOOT.md
  function showInfo(o) {
    const info = $("info");
    if (!o) { info.style.display = "none"; return; }
    const cat = CATS.find(c => c[0] === o.userData.c) || ["", "?", "#888"];
    const E = SPAWNS[o.userData.b];
    const V = (LOOTMODE === "Voyage"); // loot row = [item, stormMin, stormMax, voyageMin, voyageMax]
    const qty = r => { const mn = V ? r[3] : r[1], mx = V ? r[4] : r[2]; return mn === mx ? `${mn}` : `${mn}–${mx}`; };
    const contents = loot => loot.map(r => `${namedLink(r[0], "ci")}<span class="cq">${qty(r)}</span>`).join("");

    let body = "";
    const hasLoot = !!(E && ((E.loot && E.loot.length) || (E.m && E.m.some(s => ((SPAWNS[s.bp] || {}).loot || []).length))));
    if (hasLoot) // same containers, different counts per game mode
      body += `<div class="mv-amounts"><span class="k">Amounts:</span><div class="mv-aseg">` +
        `<button class="${V ? "" : "on"}" data-m="Storm">Stormdive</button>` +
        `<button class="${V ? "on" : ""}" data-m="Voyage">Voyage</button></div></div>`;
    if (E && E.loot && E.loot.length) // directly-clicked container: its own contents
      body += `<div class="mv-becomes-lbl">Contents</div><div class="mv-contents">${contents(E.loot)}</div>`;
    if (E && E.m && E.m.length) { // spawner: members, each member's loot collapsed (first open)
      let opened = false;
      body += `<div class="mv-becomes-lbl">Can become</div>` +
        E.m.map(s => {
          const tail = (s.pct != null) ? `${s.pct}%` : (s.count ? `×${s.count}` : "");
          const pct = tail ? `<span class="mv-become-pct">${tail}</span>` : "";
          const ml = (SPAWNS[s.bp] || {}).loot;
          const foldable = !!(ml && ml.length);
          const sel = (foldable && !opened) ? " sel" : ""; if (sel) opened = true;
          const inner = foldable ? `<div class="mv-become-contents">${contents(ml)}</div>` : "";
          // name is plain text (clicking the row folds/unfolds); a separate ↗ icon opens
          // the wiki page, so users don't change page by accident while expanding.
          const hit = slugForName(s.label), disp = dispName(s.label, hit);
          const ic = hit && hit.icon ? `<img class="mv-loot-icon" src="${hit.icon}" alt="" aria-hidden="true">` : "";
          const open = hit ? `<a class="mv-become-open" href="${hit.href}" title="Open ${disp}" aria-label="Open ${disp}">↗</a>` : "";
          return `<div class="mv-become${foldable ? " foldable" : ""}${sel}"><div class="mv-become-row">` +
            `<span class="mv-become-caret" aria-hidden="true"></span>${ic}<span class="mv-become-nm">${disp}</span>${open}${pct}` +
            `</div>${inner}</div>`;
        }).join("");
    }
    // lockable door: show the key it requires (colour-matched, incl. fort)
    const req = doorKey(o.userData.t);
    if (req)
      body += `<div class="mv-becomes-lbl">Requires</div><div class="mv-contents">` +
        `<a class="ci" href="${req.href}">${req.icon ? `<img class="mv-loot-icon" src="${req.icon}" alt="" aria-hidden="true">` : ""}${req.name}</a><span class="cq"></span></div>`;
    // key backlink: if the clicked object is a key, list the locations/boxes it opens
    const opens = keyOpens(o.userData.t);
    if (opens.length)
      body += `<div class="mv-becomes-lbl">Opens</div><div class="mv-contents">` +
        opens.map(x => {
          const ic = x.icon ? `<img class="mv-loot-icon" src="${x.icon}" alt="" aria-hidden="true">` : "";
          return `<a class="ci" href="${x.href}">${ic}${x.name}</a><span class="cq"></span>`;
        }).join("") + `</div>`;

    // title: wiki name when it links (effort tier kept as a badge), else the cleaned label
    const tHit = slugForName(o.userData.t);
    const tText = tHit
      ? `${tHit.name}${effBadge(o.userData.t)}`
      : cleanLabel(o.userData.t).replace(/\s*(\[[^\]]+\])\s*$/, ' <span class="eff">$1</span>');
    const title = tHit ? `<a href="${tHit.href}">${tText}</a>` : tText;
    info.style.display = "flex";
    info.innerHTML =
      `<div class="mv-ins-head">` +
        `<div class="mv-ins-title">${title}</div>` +
        `<div class="mv-ins-cat"><span class="dot" style="background:${cat[2]}"></span>${cat[1]}</div>` +
      `</div><div class="mv-ins-body">${body}</div>`;
    // amounts toggle
    info.querySelectorAll(".mv-aseg button").forEach(el => el.onclick = () => { LOOTMODE = el.dataset.m; showInfo(selected); });
    // expand/collapse a "can become" member — clicking anywhere on the row toggles it,
    // except the ↗ open-link (which navigates). Only foldable members respond.
    info.querySelectorAll(".mv-become-row").forEach(row => row.onclick = e => {
      if (e.target.closest("a")) return;
      const b = row.closest(".mv-become");
      if (!b.classList.contains("foldable")) return;
      const was = b.classList.contains("sel");
      info.querySelectorAll(".mv-become").forEach(x => x.classList.remove("sel"));
      if (!was) b.classList.add("sel");
    });
  }

  // left-drag = look in place, click(no move) = pick, wheel = move forward (WASD/QE strafe+vertical)
  const LOOK = 0.0026;
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  function onContextMenu(e) { e.preventDefault(); } // no menu over the 3D view
  canvas.addEventListener("contextmenu", onContextMenu); off.push(() => canvas.removeEventListener("contextmenu", onContextMenu));
  function onPointerDown(ev) { if (ev.button !== 0) return; // left only
    dragging = true; lastX = ev.clientX; lastY = ev.clientY; moved = 0;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} }
  canvas.addEventListener("pointerdown", onPointerDown); off.push(() => canvas.removeEventListener("pointerdown", onPointerDown));
  function onPointerMove(ev) {
    if (dragging) {
      const dx = ev.clientX - lastX, dy = ev.clientY - lastY; lastX = ev.clientX; lastY = ev.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      const lim = Math.PI / 2 - 0.02; // look: turn the view in place
      euler.y -= dx * LOOK; euler.x = Math.max(-lim, Math.min(lim, euler.x - dy * LOOK)); setLook();
      tip.style.display = "none";
      canvas.style.cursor = "grabbing"; return;
    }
    hoverPick(ev);
  }
  canvas.addEventListener("pointermove", onPointerMove); off.push(() => canvas.removeEventListener("pointermove", onPointerMove));
  function endDrag(ev) { if (!dragging) return; const wasClick = (moved < 6); dragging = false;
    try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
    canvas.style.cursor = "grab"; if (wasClick) clickPick(ev); }
  canvas.addEventListener("pointerup", endDrag); off.push(() => canvas.removeEventListener("pointerup", endDrag));
  function onWheel(ev) { ev.preventDefault();
    // add an impulse to the dolly momentum; flyStep eases it out (smooth scroll). Uses the
    // same adaptive scale as WASD, so scrolling is gentle when close and snappier when far.
    dollyVel += -Math.sign(ev.deltaY) * moveScale() * BASE_SPEED * boostMul(); }
  canvas.addEventListener("wheel", onWheel, { passive: false }); off.push(() => canvas.removeEventListener("wheel", onWheel));

  // ---- Map / Search tabs ----
  function setView(v) {
    $("tabMap").classList.toggle("on", v === "map");
    $("tabSearch").classList.toggle("on", v === "search");
    $("search").classList.toggle("on", v === "search");
    for (const k in keys) keys[k] = false; // drop held movement keys when leaving the 3D view
  }
  $("tabMap").onclick = () => setView("map");
  $("tabSearch").onclick = () => { setView("search"); $("sbox").focus(); };

  // ---- search across all locations ----
  function renderSearch(q) {
    q = q.trim().toLowerCase(); const out = $("sresults"); out.innerHTML = "";
    if (!q) { out.innerHTML = '<p class="sub">Type to search objects across all ' + Object.keys(LOCMAP).length + " locations.</p>"; return; }
    const hits = Object.keys(SEARCHIX).filter(bp => { const e = SEARCHIX[bp];
      return e.label.toLowerCase().includes(q) || bp.toLowerCase().includes(q); });
    hits.sort((a, b) => SEARCHIX[b].total - SEARCHIX[a].total);
    if (!hits.length) { out.innerHTML = '<p class="sub">No matches.</p>'; return; }
    hits.slice(0, 80).forEach(bp => { const e = SEARCHIX[bp];
      const c = CATS.find(x => x[0] === e.cat) || ["", "?", "#888"];
      const div = document.createElement("div"); div.className = "sresult";
      let chips = ""; Object.keys(e.locs).sort((a, b) => e.locs[b] - e.locs[a]).forEach(k => {
        chips += `<span class="chip" data-k="${k}" data-bp="${bp}">${LOCMAP[k].label} <b>×${e.locs[k]}</b></span>`; });
      div.innerHTML = `<div class="h"><span class="sw" style="background:${c[2]}"></span>${e.label}` +
        `<span class="tot">· ${c[1]} · ${e.total} across ${Object.keys(e.locs).length} locations</span></div>` +
        `<div class="chips">${chips}</div>`;
      out.appendChild(div);
    });
    out.querySelectorAll(".chip").forEach(ch => ch.onclick = () => jumpTo(ch.dataset.k, ch.dataset.bp));
  }
  function onSearchInput(e) { renderSearch(e.target.value); }
  $("sbox").addEventListener("input", onSearchInput); off.push(() => $("sbox").removeEventListener("input", onSearchInput));
  function jumpTo(locKey, bp) { const loc = LOCMAP[locKey]; if (!loc) return;
    pendingSolo = bp; setView("map"); loadLoc(loc.glb, loc.label); }

  // ---- loop ----
  let last = performance.now();
  let rafId;
  function tick(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now;
    flyStep(dt); renderer.render(scene, camera); rafId = requestAnimationFrame(tick); }
  rafId = requestAnimationFrame(tick);
  renderSearch("");

  return () => {
    alive = false;
    cancelAnimationFrame(rafId);
    off.forEach(f => f());
    _envTex.dispose();
    _sky.dispose(); _hlGeo.dispose(); _hlMat.dispose();
    renderer.dispose();
    disposeCurrent();
  };
}
