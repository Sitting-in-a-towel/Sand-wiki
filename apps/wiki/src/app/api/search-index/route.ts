import { NextResponse } from "next/server";
import * as data from "@sandlabs/data";

/** Lightweight index for client-side search autocomplete: all items plus the
 *  environment entities (loot containers, landmarks, and NPCs) that get their own
 *  dropdown groups. Sourced from the static @sandlabs/data layer (no DB on the read path). */
const PLACE_CATEGORIES = new Set(["loot-containers", "landmarks", "creatures", "enemy-tramplers"]);

export async function GET() {
  const items = data.listByKind("item")
    .filter((e) => !e.disabled)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      slug: e.slug, name: e.name, category: e.category,
      derivedName: e.derivedName, icon: e.icon, rarity: e.rarity,
    }));
  const places = data.listByKind("environment")
    .filter((e) => !e.disabled && PLACE_CATEGORIES.has(e.category))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, category: e.category }));
  return NextResponse.json({ items, places }, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
