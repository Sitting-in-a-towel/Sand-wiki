import type { Entity, EntityLink } from "@sandlabs/data";

/** Per-location NOTABLE (location-exclusive) loot from build_location_loot.py. */
export interface LocationLootRow { slug: string; name: string; chance: number | null; tier: string; count: string | null }
export interface LocationLoot {
  slug: string;
  name: string;
  mint: boolean;         // true -> the location entity doesn't exist yet and must be created
  category: string;
  description?: string | null;
  loot: LocationLootRow[];
}
export interface LocationLootData { locations: LocationLoot[] }

/** Tier label used for datamined location-exclusive loot — also the key applyLocationLoot uses to
 *  replace ONLY these links on re-run, leaving any existing (wiki-authored) location loot intact. */
export const NOTABLE_TIER = "Notable loot";

/** Mint/refresh location entities flagged mint:true (e.g. Ship Graveyard) — upsert so the
 *  minted name/category/description stay correct across re-runs (baseline = previous artifact,
 *  which already contains a first-minted entity). Non-mint locations (Dreadnought) are left
 *  untouched — we only add loot links to those, and curate their text via entity-overrides. */
export function mergeLocationEntities(entities: Entity[], data: LocationLootData | null): Entity[] {
  if (!data) return entities;
  const mints = new Map(data.locations.filter((l) => l.mint).map((l) => [l.slug, l]));
  const toEntity = (l: LocationLoot, base?: Entity): Entity => ({
    id: base?.id ?? l.slug, slug: l.slug, kind: "environment", name: l.name,
    description: l.description ?? null, category: l.category, rarity: null,
    icon: base?.icon ?? null, imageAlt: base?.imageAlt ?? null, derivedName: null,
    sourceUrl: base?.sourceUrl ?? null, disabled: base?.disabled ?? false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  });
  const existing = new Set(entities.map((e) => e.slug));
  const refreshed = entities.map((e) => (mints.has(e.slug) ? toEntity(mints.get(e.slug)!, e) : e));
  const added = [...mints.values()].filter((l) => !existing.has(l.slug)).map((l) => toEntity(l));
  return refreshed.concat(added);
}

export interface LocationLootLinks { covered: Set<string>; links: EntityLink[] }

/** role:"loot" links (tier = NOTABLE_TIER, chance in value1, count in value2) from each location. */
export function buildLocationLootLinks(data: LocationLootData | null): LocationLootLinks {
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  if (!data) return { covered, links };
  for (const l of data.locations) {
    covered.add(l.slug);
    let sort = 0;
    for (const r of l.loot) {
      if (!r.slug) continue;
      links.push({
        sourceSlug: l.slug, targetSlug: r.slug, role: "loot", name: r.name,
        amount: null, tier: r.tier, value1: r.chance == null ? null : String(r.chance),
        value2: r.count ?? null, value3: null, sortOrder: sort++, buyGroup: null,
      });
    }
  }
  return { covered, links };
}

/** Full-overwrite loot for covered locations: the datamined notable loot is authoritative for a
 *  location we surface, so drop ALL prior loot links from those sources (e.g. the stale wiki-import
 *  "Very Rare" single-item tab on the Dreadnought) and add ours. Non-covered locations untouched. */
export function applyLocationLoot(baseLinks: EntityLink[], result: LocationLootLinks): EntityLink[] {
  const kept = baseLinks.filter((l) => !(l.role === "loot" && result.covered.has(l.sourceSlug)));
  return kept.concat(result.links);
}
