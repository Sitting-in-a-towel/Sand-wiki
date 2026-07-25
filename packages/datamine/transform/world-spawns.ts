import type { Entity, EntityLink } from "@sandlabs/data";
import type { LootResult } from "./loot";

/** A loose item that spawns on the ground in the world (from build_world_spawns.py).
 *  `chance` is null (spawn odds aren't globally meaningful — weights are per-spawner);
 *  `count` is the observed stack-size range. */
export interface WorldSpawnLootRow { slug: string; name: string; chance: number | null; tier: string; count: string | null }
export interface WorldSpawnData {
  source: { id: string; slug: string; name: string; category: string; icon: string | null };
  loot: WorldSpawnLootRow[];
}

const DESCRIPTION =
  "Loose items that spawn on the ground out in the world (POIs, camps, wrecks) — pick them up " +
  "directly rather than from a container. Exact spawn odds vary by location and aren't fixed data.";

/** Upsert the single synthetic "World / Ground Loot" environment entity so its loot links
 *  have a valid source + its own page. Idempotent (baseline = previous artifact). */
export function mergeWorldSpawnEntity(entities: Entity[], ws: WorldSpawnData | null): Entity[] {
  if (!ws) return entities;
  const s = ws.source;
  const row: Entity = {
    id: s.id, slug: s.slug, kind: "environment", name: s.name,
    description: DESCRIPTION, category: s.category, rarity: null, icon: s.icon,
    imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  };
  return entities.some((e) => e.slug === s.slug)
    ? entities.map((e) => (e.slug === s.slug ? row : e))
    : entities.concat(row);
}

/** role:"loot" links from the world-spawn source to each loose item. No chance and no
 *  voyage/storm quantities (those columns don't apply to world spawns — the "Voyage"/"Storm"
 *  loot columns are voyage-mode specific). The stack count stays in the dataset for future
 *  use but isn't surfaced here to avoid a mislabeled column. Returns LootResult for applyLoot(). */
export function buildWorldSpawnLinks(ws: WorldSpawnData | null): LootResult {
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  if (!ws) return { covered, links };
  covered.add(ws.source.slug);
  let sort = 0;
  for (const r of ws.loot) {
    if (!r.slug) continue;
    links.push({
      sourceSlug: ws.source.slug, targetSlug: r.slug, role: "loot", name: r.name,
      amount: null, tier: r.tier, value1: r.chance == null ? null : String(r.chance),
      value2: null, value3: null, sortOrder: sort++, buyGroup: null,
    });
  }
  return { covered, links };
}
