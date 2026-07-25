import type { Entity, EntityLink } from "@sandlabs/data";

/** A key-locked loot crate (Military/Valuables/Utility Box) from build_lockbox_loot.py. */
export interface LockboxLootRow { slug: string; name: string; chance: number | null; tier: string; count: string | null }
export interface LockboxCrate {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: string | null;
  requiresKeySlug: string | null;
  requiresKeyName: string | null;
  loot: LockboxLootRow[];
}
export interface LockboxData { crates: LockboxCrate[] }

const DESCRIPTION =
  "A key-locked crate found out in the world — unlock it with the Box Key to claim the loot inside.";

function toEntity(c: LockboxCrate): Entity {
  return {
    id: c.id, slug: c.slug, kind: "environment", name: c.name,
    description: DESCRIPTION, category: c.category, rarity: null, icon: c.icon,
    imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  };
}

/** Upsert the locked-crate environment entities (idempotent; baseline = previous artifact). */
export function mergeLockboxEntities(entities: Entity[], data: LockboxData | null): Entity[] {
  if (!data) return entities;
  const bySlug = new Map(data.crates.map((c) => [c.slug, toEntity(c)]));
  const refreshed = entities.map((e) => bySlug.get(e.slug) ?? e);
  const existing = new Set(entities.map((e) => e.slug));
  const added = data.crates.filter((c) => !existing.has(c.slug)).map(toEntity);
  return refreshed.concat(added);
}

export interface LockboxLinks { covered: Set<string>; links: EntityLink[] }

/** Build the crates' outgoing links: role:"loot" (with chance in value1, stack count in value2)
 *  plus a role:"requires-key" link to the Box Key. `covered` = crate slugs, so applyLockboxLinks
 *  can replace them wholesale on re-run. */
export function buildLockboxLinks(data: LockboxData | null): LockboxLinks {
  const covered = new Set<string>();
  const links: EntityLink[] = [];
  if (!data) return { covered, links };
  for (const c of data.crates) {
    covered.add(c.slug);
    let sort = 0;
    for (const r of c.loot) {
      if (!r.slug) continue;
      links.push({
        sourceSlug: c.slug, targetSlug: r.slug, role: "loot", name: r.name,
        amount: null, tier: r.tier, value1: r.chance == null ? null : String(r.chance),
        value2: r.count ?? null, value3: null, sortOrder: sort++, buyGroup: null,
      });
    }
    if (c.requiresKeySlug) {
      links.push({
        sourceSlug: c.slug, targetSlug: c.requiresKeySlug, role: "requires-key",
        name: c.requiresKeyName ?? c.requiresKeySlug, amount: null, tier: null,
        value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null,
      });
    }
  }
  return { covered, links };
}

/** Replace all links originating from a locked crate (loot + requires-key), then add the new
 *  set — keeps every other link untouched and stays idempotent across re-runs. */
export function applyLockboxLinks(baseLinks: EntityLink[], result: LockboxLinks): EntityLink[] {
  const kept = baseLinks.filter((l) => !result.covered.has(l.sourceSlug));
  return kept.concat(result.links);
}
