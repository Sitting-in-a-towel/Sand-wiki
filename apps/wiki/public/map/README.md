# 3D Map Assets

This folder serves static assets for the `/map` 3D location viewer route.

## What's Here

The `/map` viewer fetches assets from this location:

- `/map/manifest.json` — metadata for all baked locations (names, glb paths, item categories, object counts)
- `/map/spawns.json` — optional spawner→item loot tables (populated by the bake, enables loot tooltips)
- `/map/*.glb.gz` — per-location 3D models (gzipped GLB files), one per location

## Current Fixtures

`manifest.json` and `spawns.json` currently contain minimal placeholders so the viewer and its e2e smoke tests work without a real asset bake:

- One fake "Test POI" location with key `poi_Test`
- No actual `.glb.gz` files (the viewer will fail to load this location, as expected)

These fixtures are **overwritten** when real assets are baked and deployed.

## How to Produce Real Assets

Real 3D assets are baked by the [`sand3d`](../../sand3d) tool, which extracts and prepares 3D models from a local SAND game install. The tool is **not part of this repo**.

### Baking workflow:

1. Follow the sand3d README to set up and run its `extract.py` against your game install
2. The bake writes to `sand3d/viewer/assets/` containing:
   - `manifest.json`
   - `spawns.json`
   - `*.glb.gz` files (one per location)
3. Copy the **contents** of `sand3d/viewer/assets/` into this folder (`apps/wiki/public/map/`)

For exact sand3d invocation flags and setup, see the sand3d repository's README.

## Size and Storage

A full bake of all locations is large — on the order of **~500 MB** (the biggest single `.glb.gz` is ~40 MB). That is too large to commit to git, so:

- `*.glb.gz` are **gitignored** (see `apps/wiki/.gitignore`) — they are never committed.
- Only the small `manifest.json` / `spawns.json` **fixtures** are tracked (fresh-clone default + e2e).
- Real assets are served **off-repo from Vercel Blob** (public, CDN-backed), and the viewer
  reads them via the `NEXT_PUBLIC_MAP_ASSETS_BASE` env var (default `/map/`).

### Publishing a bake to Vercel Blob

1. Bake locally and copy the output into this folder (see above).
2. Provision a Vercel Blob store (Dashboard → Storage → Blob), which sets `BLOB_READ_WRITE_TOKEN`.
3. Pull it and run the upload script from `apps/wiki`:
   ```bash
   vercel env pull .env.local
   npx dotenv -e .env.local -- node scripts/upload-map-assets.mjs
   ```
4. Set the printed `NEXT_PUBLIC_MAP_ASSETS_BASE=https://<store-id>.public.blob.vercel-storage.com/map/`
   in the Vercel project env (Production/Preview) — and in `.env.local` to test locally against Blob.

Local development without Blob still works: leave `NEXT_PUBLIC_MAP_ASSETS_BASE` unset and drop a
local bake into this folder (the gitignored `.glb.gz` + real `manifest.json`/`spawns.json`).

## Browser Compatibility

The viewer decompresses gzipped GLBs using the browser [`DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream) API. **Chrome and Edge support this; Firefox and Safari historically do not.** The page displays a friendly error message if the API is unavailable.

If broader browser support is needed, an alternative decompression library (e.g., pako) could replace `DecompressionStream` — this is deferred for now.
