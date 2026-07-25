// Upload the /map 3D viewer assets (manifest.json, spawns.json, *.glb.gz) to Vercel Blob.
//
// The baked asset set (~500MB) is too large to commit to git, so it lives in Vercel
// Blob (public, CDN-backed) and the viewer reads it via NEXT_PUBLIC_MAP_ASSETS_BASE.
//
// Prerequisites:
//   1. A Vercel Blob store on the project (Dashboard → Storage → Blob), which
//      provisions BLOB_READ_WRITE_TOKEN.
//   2. `vercel env pull .env.local` (from apps/wiki) so BLOB_READ_WRITE_TOKEN lands
//      in .env.local — this script loads it automatically (no dotenv-cli needed).
//   3. `@vercel/blob` (already a devDependency).
//
// Usage (from apps/wiki):
//   node scripts/upload-map-assets.mjs [SRC_DIR]
//   SRC_DIR defaults to ./public/map (where a local bake was copied).
//
// It prints the NEXT_PUBLIC_MAP_ASSETS_BASE value to set in the Vercel project env
// (Production/Preview) and in your local .env.local to test against Blob.

import { put } from "@vercel/blob";
import { readdir, readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const SRC = process.argv[2] || "public/map";
const PREFIX = "map"; // blob key prefix → base URL ends in ".../map/"

// Load .env.local if the token isn't already exported (so no dotenv-cli wrapper is needed).
if (!process.env.BLOB_READ_WRITE_TOKEN && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN || !/^vercel_blob_rw_/.test(TOKEN)) {
  console.error(
    `BLOB_READ_WRITE_TOKEN is missing or not a real read-write token${TOKEN === "[SENSITIVE]" ? ' (got the "[SENSITIVE]" placeholder — that var is flagged Sensitive on Vercel, so `env pull` cannot emit it)' : ""}.\n` +
      "Put a real 'vercel_blob_rw_…' token in apps/wiki/.env.local, then re-run: node scripts/upload-map-assets.mjs",
  );
  process.exit(1);
}

const all = await readdir(SRC);
const files = all.filter(
  (f) => f.endsWith(".glb.gz") || f === "manifest.json" || f === "spawns.json",
);
if (files.length === 0) {
  console.error(`No assets found in ${SRC} (expected manifest.json, spawns.json, *.glb.gz).`);
  process.exit(1);
}

console.log(`Uploading ${files.length} file(s) from ${SRC} to Vercel Blob under "${PREFIX}/"…`);
let base = null;
for (const f of files) {
  const body = await readFile(path.join(SRC, f));
  // .glb.gz are already gzipped and are inflated in the browser by DecompressionStream,
  // so upload them as opaque bytes — NOT with Content-Encoding: gzip (that would make the
  // CDN auto-decompress and the viewer would then try to inflate plain GLB and fail).
  const contentType = f.endsWith(".json") ? "application/json" : "application/octet-stream";
  const { url } = await put(`${PREFIX}/${f}`, body, {
    access: "public",
    token: TOKEN, // pass explicitly so it never falls back to OIDC auth
    addRandomSuffix: false, // deterministic keys so manifest's bare filenames resolve
    allowOverwrite: true, // safe to re-run after a re-bake
    contentType,
  });
  base = url.slice(0, url.lastIndexOf("/") + 1);
  console.log(`  ✓ ${f} → ${url}`);
}

console.log("\nDone. Set this env var (Vercel project → Settings → Environment Variables,");
console.log("and in .env.local to test locally against Blob):\n");
console.log(`  NEXT_PUBLIC_MAP_ASSETS_BASE=${base}`);
console.log(
  "\nAfter uploading, spot-check one GLB is served WITHOUT `content-encoding: gzip`:",
);
console.log(`  curl -sI ${base}${files.find((f) => f.endsWith(".glb.gz")) ?? "<file>.glb.gz"} | grep -i content-encoding`);
console.log("(should print nothing — the viewer inflates the gzip itself).");
