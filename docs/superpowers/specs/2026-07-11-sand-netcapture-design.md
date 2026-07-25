# SAND Net-Capture — Design

**Date:** 2026-07-11
**Status:** Approved (design), pending implementation plan

## Problem

The offline `sand-scraper` (UnityPy) can only read data that ships in the game's
Addressable bundles. A whole class of game data is **runtime / server-side** and never
touches local files: the research (tech) tree, compartment/part definitions and their
server-sourced stat hashes, the shop, expeditions, and storage. Today the wiki's tech
tree lives in `apps/wiki/prisma/tech-tree-extracted.json`, which was **hand-transcribed
from cropped in-game screenshots** (it literally carries `"verify"` low-confidence notes).
That is fragile, manual, and goes stale every patch.

The game's backend is **PlayFab + a custom master server** (`ClientMasterServerNetwork`),
confirmed by the SandTools repo, which contains *captured* JSON responses
(`master_GetResearchTree.json`, `master_GetCompartmentDefinitions.json`, `GetShopItems`,
`GetExpedition`, `GetStorage`, `GetCharacters`, plus `playfab_*`). SandTools proves the
data is reachable as plain JSON over HTTPS, but it ships only the *artifacts*, not a
reusable capture mechanism.

## Goal

Build **`sand-netcapture`**: a guided, per-patch tool that passively captures the game
client's own PlayFab/master-server HTTPS responses to disk, and transforms the useful ones
into wiki-shaped JSON — starting with a drop-in replacement for `tech-tree-extracted.json`.

## Guiding constraint — passive & read-only (anti-ban)

This is a hard requirement, not a nicety:

- The proxy **only observes**. It forwards every request and response **byte-for-byte
  unmodified** and copies response bodies to disk.
- **No request tampering. No response injection. No replay. Zero extra requests** to the
  master server. From the server's perspective the session is identical to normal play; the
  only added party is a local proxy the user's own client trusts.
- The tool **never automates or talks to the game client**. The user drives everything by
  hand in the in-game menus.

**Honest caveat (accepted by the user):** no MITM approach can be *guaranteed* ban-safe — a
game may treat any proxy or added root CA as a ToS violation even when interception is purely
passive. This design minimizes the footprint to observe-only with no injection and no client
automation, which is about as clean as interception gets. The user has accepted this trade-off.

## Approach

Chosen mechanism: **TLS-intercepting proxy (mitmproxy)**, preceded by a throwaway probe to
rule out certificate pinning. Frida in-process hooking is the documented fallback **only** if
the probe shows the client pins its certs. (Rejected as primary: Frida — far larger IL2CPP RE
effort, brittle per patch; Fiddler/Charles as a product — not scriptable, no coverage
automation, though it is fine as a probe.)

### Two phases

- **Phase 0 — Probe (throwaway, documented steps, not shipped code).** Run mitmproxy/Fiddler
  by hand, launch the game, confirm decrypted responses are readable, and record the real
  hostnames (PlayFab title host + master-server host). De-risks cert pinning **before** any
  tool code. If the client pins certs → stop and reassess (Frida fallback), do not build the
  proxy tool.
- **Phase 1 — Tool.** The mitmproxy addon + coverage CLI + transforms, built only after the
  probe is green.

## Placement

A new sibling tool `sand-netcapture/`, laid out to mirror `sand-scraper/`:

```
sand-netcapture/
  pyproject.toml
  config.toml            # proxy port, host allowlist, expected-endpoints list
  README.md              # setup, the Phase-0 probe steps, run instructions, Frida-fallback note
  src/sand_netcapture/
    __main__.py          # runner/CLI: launch mitmdump, set/restore system proxy, live checklist
    capture.py           # mitmproxy addon: host filter, endpoint-key derivation, raw dump, coverage
    transform_research_tree.py   # first transform: GetResearchTree -> tech-tree-extracted.json shape
    emit.py              # stable-sorted JSON writer (mirrors sand-scraper)
    config.py            # load/validate config.toml
  tests/
    fixtures/            # hand-redacted sample captures (tokens/PII scrubbed)
  out/                   # gitignored: captures/, transformed outputs
```

Kept separate from `sand-scraper` because it is a different concern (needs the game running +
a proxy vs. reading static files offline), but it reuses the same `extract → transform → emit`
shape and the "run manually per patch, `git diff` the output" workflow.

## Components

1. **`config.toml`** — proxy port; the **host allowlist** (PlayFab title host + master-server
   host, filled in from the probe); the **expected-endpoints list** that drives the coverage
   checklist.
2. **`capture.py`** (mitmproxy addon) — on each response, if the host is allowlisted, derive a
   stable **endpoint key** (from URL path / PlayFab function name, e.g. `GetResearchTree`),
   write the raw body to `out/captures/<key>.json`, and append metadata to
   `out/captures/_index.json` (url, status, timestamp, size). Core logic `(flow) → (key, record)`
   is a pure function, unit-testable with synthetic flow objects. **Never modifies the flow.**
3. **`__main__.py`** (runner/CLI) — launch `mitmdump` with the addon; set the Windows system
   proxy; print the **live coverage checklist** (`✓ GetResearchTree  ✗ GetShopItems …`);
   announce when all expected endpoints are seen; **restore the system proxy on exit** via
   try/finally (even on Ctrl-C or crash).
4. **`transform_*.py`** — one transformer per endpoint we want in the wiki, added incrementally.
   First: `transform_research_tree.py`, mapping `GetResearchTree` → the **exact schema of
   `apps/wiki/prisma/tech-tree-extracted.json`** so it is a drop-in replacement.
5. **`emit.py`** — stable-sorted JSON writer so outputs `git diff` cleanly patch-to-patch.

Scope note: **capture is generic** (dumps *all* allowlisted endpoints raw), but **transforms
are per-endpoint, on demand**. Ship the research-tree transform first; the rest are cheap
follow-ups because the raw data is already on disk.

## Data flow

```
game client → system proxy → mitmdump + capture.py
   → filter host → dump raw → out/captures/<key>.json + _index.json + coverage tick
   → (user watches checklist, quits when complete)
→ transform_research_tree.py reads capture → emit → out/tech-tree.json (wiki shape)
→ copy into apps/wiki/prisma/ → regenerate/seed
```

Operating model: **guided one-shot session.** User starts the tool, launches the game, logs
in, and clicks through the menus once; the live checklist shows which expected endpoints have
/ haven't been seen so they know when they've triggered them all before quitting.

## Security & error handling

**Security (live account traffic):**
- `out/` is gitignored in full — **raw captures are never committed** (they contain session
  tickets, auth tokens, user data).
- Test fixtures are **hand-redacted** samples (tokens/IDs scrubbed) under `tests/fixtures/`.
- Transforms emit **only game-definition data** (nodes, costs, part stats) — no account
  fields — and only those transformed outputs are copied into the wiki.

**Error handling:**
- **Cert pinning** (known risk): TLS handshake failures / client can't connect → surface a
  clear "traffic not decryptable — likely cert pinning" message pointing at the Frida fallback.
  Do not half-build Frida now.
- **Proxy cleanup:** system proxy always restored on exit (try/finally); a crash must never
  leave the machine proxied.
- **Partial / failed calls:** `_index.json` records status codes; non-200s are shown but do
  **not** count toward coverage, so a failed call is never mistaken for "done."

## Testing

Mirrors `sand-scraper`'s pure-unit approach:
- **Transforms:** unit tests over redacted fixture captures → assert exact wiki-shape output.
  This is the bulk of the value and fully offline.
- **Capture core:** unit-test host-filter + key-derivation + coverage logic against synthetic
  mitmproxy flow objects — no network.
- **Live proxy run:** inherently manual → **documented in the README**, not automated (same
  stance `sand-scraper` takes for its real-install integration test).

## Out of scope / future work

- Transforms beyond the research tree (compartment definitions, shop, expeditions, storage) —
  cheap follow-ups once their raw captures exist; not built in v1.
- Frida in-process hooking — only if the probe proves cert pinning.
- Any automation of the game client, request replay, or write/injection — explicitly excluded.
- Wiring the emitted `tech-tree.json` into the wiki seed/build — handled on the wiki side,
  same as the `sand-scraper` handoff; this tool's responsibility ends at emitting wiki-shaped JSON.

## Success criteria

1. Phase 0 probe confirms decryptable (non-pinned) traffic and records the real hostnames.
2. A guided session captures all expected endpoints to `out/captures/`, driven only by manual
   menu navigation, with the proxy in strict observe-only mode.
3. `transform_research_tree.py` produces a `tech-tree.json` that validates against the existing
   `tech-tree-extracted.json` schema and is a drop-in replacement.
4. System proxy is reliably restored after every run, including crashes.
5. No raw capture (with secrets) is ever committed; only redacted fixtures + transformed outputs.
