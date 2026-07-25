import type { Entity, EntityLink } from "@sandlabs/data";
import type { LootResult } from "./loot";

export interface EnemyVariant { name: string; hp: number }
export interface EnemyLootRow {
  group: string;
  slug: string | null;   // null => item id didn't resolve to a wiki slug (reported upstream)
  name: string;
  chance: number | null; // null => drop rate unknown (orphaned extraTables with no roll weights)
  voyage: string | null;
  storm: string | null;
}
export interface EnemyData {
  id: string;
  slug: string;
  name: string;
  type: "creature" | "enemy-trampler";
  icon: string | null;
  variants: EnemyVariant[];
  loot: EnemyLootRow[];
}

const CATEGORY: Record<EnemyData["type"], string> = {
  creature: "creatures",
  "enemy-trampler": "enemy-tramplers",
};

// NPCs are modelled as environment entities (kind "environment") in the creatures /
// enemy-tramplers categories, so they flow through the Environment listing, detail route,
// search, and sitemap unchanged. Their HP lives on enemyStats (rendered by the env detail page).
function toEntity(e: EnemyData): Entity {
  return {
    id: e.id, slug: e.slug, kind: "environment", name: e.name,
    description: null, category: CATEGORY[e.type], rarity: null,
    icon: e.icon, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
    enemyStats: { type: e.type, variants: e.variants },
  };
}

/** Upsert enemy (NPC) entities over the baseline: refresh any existing slug in place,
 *  append the rest. Idempotent across re-runs (baseline = previous artifact). */
export function mergeEnemies(entities: Entity[], enemies: EnemyData[]): Entity[] {
  const bySlug = new Map(enemies.map((e) => [e.slug, toEntity(e)]));
  const refreshed = entities.map((e) => bySlug.get(e.slug) ?? e);
  const existing = new Set(entities.map((e) => e.slug));
  const added = enemies.filter((e) => !existing.has(e.slug)).map(toEntity);
  return refreshed.concat(added);
}

/** Build role:"loot" EntityLink rows from enemy slug -> dropped item slug.
 *  tier = loot group label; chance -> value1, voyage -> value2, storm -> value3.
 *  Returns the LootResult shape so run.ts can reuse applyLoot(). */
export function buildEnemyLootLinks(enemies: EnemyData[]): LootResult {
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  for (const e of enemies) {
    covered.add(e.slug);
    let sort = 0;
    for (const r of e.loot) {
      if (!r.slug) continue;
      links.push({
        sourceSlug: e.slug, targetSlug: r.slug, role: "loot", name: r.name,
        amount: null, tier: r.group, value1: r.chance == null ? null : String(r.chance),
        value2: r.voyage ?? null, value3: r.storm ?? null, sortOrder: sort++, buyGroup: null,
      });
    }
  }
  return { covered, links };
}
