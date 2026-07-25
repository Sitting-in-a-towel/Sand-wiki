import type { Entity } from "@sandlabs/data";
import type { SekItem } from "./sek";
import { mapRarity } from "./rarity";

// SEK item `type` flag -> wiki category (drives the item's list/section). Calibrated against
// the wiki's categories (weapons/ammo/resources/medical/tools/misc/attire/artillery). Types
// without a confident mapping (and null) fall back to "misc". Only used for NEW items —
// matched items keep their baseline category.
const TYPE_CATEGORY: Record<string, string> = {
  WEAPON: "weapons",
  AMMO: "ammo",
  TURRET_AMMO: "ammo",
  RESOURCE_T1: "resources",
  RESOURCE_T2: "resources",
  RESOURCE_T3: "resources",
  FOOD: "medical", // the wiki files food/consumables under "medical" (e.g. food-can)
};

/** Wiki category for a SEK item type; "misc" when unknown/null. */
export function mapCategory(type: string | null): string {
  if (!type) return "misc";
  return TYPE_CATEGORY[type.toUpperCase()] ?? "misc";
}

/** Force specific entity icons (slug -> icon path). Fixes stale/wrong icon paths in the
 *  source data (SEK or baseline) by pointing at a sprite that actually exists on disk.
 *  Applied after the merge so it always wins. */
export function applyIconOverrides(entities: Entity[], iconMap: Record<string, string>): Entity[] {
  return entities.map((e) => (iconMap[e.slug] ? { ...e, icon: iconMap[e.slug] } : e));
}

/** Curated, display-level entity field overrides keyed by slug, for fixes the datamine can't
 *  express: hide a redundant duplicate (disabled) or disambiguate identical names. Only the
 *  whitelisted fields below are overridable; applied after the merge so they always win. */
export interface EntityOverride {
  name?: string;
  disabled?: boolean;
  category?: string;
  /** Replace the description outright. */
  description?: string;
  /** Append this to the existing description (curated notes the wiki import lacks), as a new
   *  paragraph. Ignored when `description` is also set. */
  descriptionAppend?: string;
}

export function applyEntityOverrides(entities: Entity[], overrides: Record<string, EntityOverride>): Entity[] {
  return entities.map((e) => {
    const o = overrides[e.slug];
    if (!o) return e;
    let description = e.description;
    if (o.description !== undefined) description = o.description;
    else if (o.descriptionAppend) {
      // Idempotent + self-healing: strip any existing copies of the appended block first (the
      // transform baseline is the previous artifact, so a naive append would stack up each run),
      // then append exactly one.
      const base = (e.description ?? "").split(o.descriptionAppend).join("").replace(/\n{3,}/g, "\n\n").trim();
      description = base ? `${base}\n\n${o.descriptionAppend}` : o.descriptionAppend;
    }
    return {
      ...e,
      ...(o.name !== undefined ? { name: o.name } : {}),
      ...(o.disabled !== undefined ? { disabled: o.disabled } : {}),
      ...(o.category !== undefined ? { category: o.category } : {}),
      description,
    };
  });
}

/** Datamine-owned fields to refresh over a matched baseline item. Only includes a field
 *  when the datamine actually provides a value, so the merge keeps the baseline otherwise. */
export type ItemPatch = Partial<Pick<Entity, "rarity" | "icon" | "description">>;

export function sekItemPatch(it: SekItem): ItemPatch {
  const p: ItemPatch = {};
  const rarity = mapRarity(it.rarity);
  if (rarity !== null) p.rarity = rarity;
  if (it.icon) p.icon = it.icon;
  if (it.desc) p.description = it.desc;
  return p;
}

/** A brand-new item Entity for a SEK item with no baseline match. category derives from the
 *  SEK type (mapCategory; "misc" when unknown); stats null (merge/refresh fills them when
 *  available). id mirrors the slug (DB ids are gone; slug is the key). */
export function newItemEntity(slug: string, it: SekItem): Entity {
  return {
    id: slug, slug, kind: "item", name: it.name,
    description: it.desc, category: mapCategory(it.type), rarity: mapRarity(it.rarity),
    icon: it.icon, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
    itemStats: null, tramplerStats: null, techNodeStats: null,
  };
}

/** Drop item-kind entities that have no icon. Item icons come from sprite-match against
 *  shipped game art, so a null icon means the item has no in-game sprite yet — i.e. it is
 *  not released / not player-facing (internal notes, debug/test boxes, packed-turret
 *  containers, and genuinely-unreleased items). Scoped strictly to kind "item":
 *  tech-node / environment / trampler-part legitimately have null icons and are kept.
 *  Because the transform baseline is the previous artifact, this both evicts already-shipped
 *  no-icon pages and blocks new ones; an item reappears automatically once it ships with a
 *  real icon. To rescue a released item that lacks a sprite, add it to overrides/icon-map.json
 *  (applied before this prune). */
export function pruneIconlessItems(entities: Entity[]): Entity[] {
  return entities.filter((e) => e.kind !== "item" || !!e.icon);
}
