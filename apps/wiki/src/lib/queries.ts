import { cache } from "react";
import * as data from "@sandlabs/data";
import type { Entity, Recipe } from "@sandlabs/data";
import { applyItemView, type ItemFilter } from "./item-filter";
import { itemClasses } from "./ammo";
import { toRecipeCard, type RecipeWithItems, type RecipeLine } from "./recipes";
import { entityHref } from "./entity-links";
import { toTechTree, FACTION_ROOT_PART } from "./tech-tree/transform";
import type { TechTree } from "./tech-tree/types";
import type { LinkOption } from "@/lib/link-picker";
import { groupBuyOptions, type BuyLinkRow, type BuyOptionView } from "./buy-options";

/** Total recipe count from the static data (replaces the old prisma.recipe.count). */
export async function recipeCount(): Promise<number> {
  return data.store.recipes.length;
}

/** A recipe row as loaded with `entity`-relation includes (Prisma renamed the
 *  relation field from `item` to `entity`). */
type LoadedRecipe = {
  slug: string;
  workbench: string | null;
  tier: number | null;
  craftTimeSeconds: number | null;
  location: { slug: string; name: string } | null;
  inputs: { amount: number; entity: { slug: string; name: string; icon: string | null; rarity: string | null } }[];
  outputs: { amount: number; entity: { slug: string; name: string; icon: string | null; rarity: string | null } }[];
};

/** Adapt a recipe loaded with `entity` includes to the `RecipeWithItems` shape
 *  (`item`) that toRecipeCard consumes. */
function toRecipeWithItems(r: LoadedRecipe): RecipeWithItems {
  const line = (l: { amount: number; entity: RecipeLine["item"] }): RecipeLine => ({ amount: l.amount, item: l.entity });
  return {
    slug: r.slug,
    workbench: r.workbench,
    tier: r.tier,
    craftTimeSeconds: r.craftTimeSeconds,
    location: r.location,
    inputs: r.inputs.map(line),
    outputs: r.outputs.map(line),
  };
}

/** Hide disabled entities from the public; admins see everything. Mirrors the old
 *  visibilityWhere() applied in-memory. */
function visible(rows: Entity[], isAdmin: boolean): Entity[] {
  return isAdmin ? rows : rows.filter((e) => !e.disabled);
}

/** Matcher for ItemFilter's name/derivedName/category/workbenchTier/rarity, in-memory.
 *  Mirrors buildItemQuery's WHERE (case-insensitive name match). */
function matchesItemFilter(e: Entity, f: ItemFilter): boolean {
  if (f.query) {
    const q = f.query.toLowerCase();
    const inName = e.name.toLowerCase().includes(q);
    const inDerived = (e.derivedName ?? "").toLowerCase().includes(q);
    if (!inName && !inDerived) return false;
  }
  if (f.category && e.category !== f.category) return false;
  if (f.workbenchTier !== undefined && e.itemStats?.workbenchTier !== f.workbenchTier) return false;
  if (f.rarity && e.rarity !== f.rarity) return false;
  return true;
}

/** Resolve a recipe's line slugs to display rows, dropping any line whose entity is
 *  disabled (mirrors the old `enabledLine` include filter). */
function resolveRecipe(r: Recipe): LoadedRecipe {
  const line = (l: { itemSlug: string; amount: number }) => {
    const e = data.getEntity(l.itemSlug);
    return e && !e.disabled
      ? { amount: l.amount, entity: { slug: e.slug, name: e.name, icon: e.icon, rarity: e.rarity } }
      : null;
  };
  const loc = r.locationSlug ? data.getEntity(r.locationSlug) : null;
  return {
    slug: r.slug, workbench: r.workbench, tier: r.tier, craftTimeSeconds: r.craftTimeSeconds,
    location: loc ? { slug: loc.slug, name: loc.name } : null,
    inputs: r.inputs.map(line).filter((x): x is NonNullable<typeof x> => x !== null),
    outputs: r.outputs.map(line).filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

export async function listItems(filter: ItemFilter, isAdmin = false) {
  const rows = visible(data.listByKind("item"), isAdmin)
    .filter((e) => matchesItemFilter(e, filter))
    .sort((a, b) => a.name.localeCompare(b.name)); // name-asc base order
  const flat = rows.map((i) => ({ ...i, ammoType: i.itemStats?.ammoType ?? null }));
  return applyItemView(flat, { sort: filter.sort, weaponClass: filter.weaponClass });
}

/** Distinct rarities present among items matching the filter (ignoring any rarity
 *  constraint), so the rarity chip row reflects the current category/search context. */
export async function listRarities(filter: ItemFilter): Promise<string[]> {
  const rest = { ...filter };
  delete rest.rarity;
  const rarities = new Set<string>();
  for (const e of data.listByKind("item")) {
    if (e.disabled || e.rarity == null) continue;
    if (matchesItemFilter(e, rest)) rarities.add(e.rarity);
  }
  return [...rarities];
}

/** Distinct non-null workbench tiers among items matching the filter (ignoring any tier
 *  constraint), ascending — for the items-list tier filter. workbenchTier lives on the
 *  ItemStats extension, so this queries itemStats scoped to the matching entities. */
export async function listWorkbenchTiers(filter: ItemFilter): Promise<number[]> {
  const rest = { ...filter };
  delete rest.workbenchTier;
  const tiers = new Set<number>();
  for (const e of data.listByKind("item")) {
    if (e.disabled) continue;
    const t = e.itemStats?.workbenchTier;
    if (t == null) continue;
    if (matchesItemFilter(e, rest)) tiers.add(t);
  }
  return [...tiers].sort((a, b) => a - b);
}

/** Distinct caliber-class labels (Pistol, Rifle, …) among items matching the filter,
 *  in canonical order — for the items-list class filter. Class is derived (not a stored
 *  column), so this fetches the matching rows and reduces them via itemClasses rather than
 *  using a DB `distinct`. No field needs excluding: weaponClass is app-level and never part
 *  of buildItemQuery's where clause. */
export async function listItemClasses(filter: ItemFilter): Promise<string[]> {
  const rows = data.listByKind("item")
    .filter((e) => !e.disabled && matchesItemFilter(e, filter))
    .map((e) => ({ ammoType: e.itemStats?.ammoType ?? null }));
  return itemClasses(rows);
}

/** Count of items per category — for the home browse grid. Mirrors
 *  envCategoryCounts / tramplerCategoryCounts; reads the stored `category` column. */
export async function itemCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("item");
}

/** Counts for the home "Plan your run" tools box: enabled tech nodes and the
 *  distinct factions they span. */
export async function techToolStats(): Promise<{ nodes: number; factions: number }> {
  const nodes = data.listByKind("tech-node").filter((e) => !e.disabled);
  const factions = new Set(nodes.map((e) => e.techNodeStats?.faction).filter(Boolean));
  return { nodes: nodes.length, factions: factions.size };
}

/** Environment entities (loot containers, etc.), optionally filtered by category. */
export async function listEnvEntities(category?: string, isAdmin = false) {
  const rows = category
    ? data.listByCategory("environment", category)
    : data.listByKind("environment");
  return visible(rows, isAdmin).slice().sort((a, b) => a.name.localeCompare(b.name));
}

export const getEnvEntityBySlug = cache(async (slug: string) => {
  const entity = data.getEntity(slug);
  if (entity === null || entity.kind !== "environment") return null;

  const linkRoles = ["loot", "requires-key", "rewards-key"];
  const allLinks = data.outgoingLinks(slug, linkRoles)
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug));

  const resolveTarget = (l: (typeof allLinks)[number]) => {
    const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
    return {
      ...l,
      target: t ? { slug: t.slug, kind: t.kind, name: t.name, icon: t.icon, rarity: t.rarity, category: t.category } : null,
    };
  };
  const linksResolved = allLinks.map(resolveTarget);
  const lootLinks = linksResolved.filter((l) => l.role === "loot");
  const keyLinks = linksResolved.filter((l) => l.role === "requires-key" || l.role === "rewards-key");

  const craftedBy = data.recipesAtLocation(slug).map((r) =>
    toRecipeCard(toRecipeWithItems({ ...resolveRecipe(r), location: null })),
  );

  return { ...entity, outgoingLinks: lootLinks, keyLinks, craftedBy };
});

/** Count of env entities per category — for the Environment landing. */
export async function envCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("environment");
}

/** Trampler parts, optionally filtered by functional category. List cards read
 *  dimensions/research from the tramplerStats extension, so it is included. */
export async function listTramplerParts(category?: string, isAdmin = false) {
  const rows = category
    ? data.listByCategory("trampler-part", category)
    : data.listByKind("trampler-part");
  return visible(rows, isAdmin).slice().sort((a, b) => {
    const ta = a.tramplerStats?.researchTier ?? Number.MAX_SAFE_INTEGER;
    const tb = b.tramplerStats?.researchTier ?? Number.MAX_SAFE_INTEGER;
    return ta - tb || a.name.localeCompare(b.name);
  });
}

export const getTramplerPartBySlug = cache(async (slug: string) => {
  const part = data.getEntity(slug);
  if (!part || part.kind !== "trampler-part") return null;
  const costLinks = data.outgoingLinks(slug, ["cost"])
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug))
    .map((l) => {
      const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
      // Synthesise a stable `id` for React key usage (the page uses `c.id` as the list key).
      const id = `${l.sourceSlug}:${l.role}:${l.sortOrder}`;
      return { ...l, id, target: t ? { slug: t.slug, kind: t.kind, icon: t.icon, rarity: t.rarity } : null };
    });
  return { ...part, outgoingLinks: costLinks };
});

/** Count of trampler parts per category — for the Tramplers landing. */
export async function tramplerCategoryCounts(): Promise<Record<string, number>> {
  return data.categoryCounts("trampler-part");
}

// Wrapped in React `cache()` so a page and its `generateMetadata` share one DB
// round-trip per request (Prisma calls aren't auto-memoized like `fetch`).
export const getItemBySlug = cache(async (slug: string) => {
  const item = data.getEntity(slug);
  if (!item || item.kind !== "item") return null;
  const craftedBy = data.recipesProducing(slug).map((r) => toRecipeCard(toRecipeWithItems(resolveRecipe(r))));
  const usedIn = data.recipesUsing(slug).map((r) => toRecipeCard(toRecipeWithItems(resolveRecipe(r))));
  return { ...item, craftedBy, usedIn };
});

/** An item's incoming loot links, resolved to their source slug + name (ordered by
 *  sortOrder). Prefills the item-side ("Found in") loot editor. Null if not an item. */
export async function getIncomingLootLinks(itemSlug: string) {
  const item = data.getEntity(itemSlug);
  if (!item || item.kind !== "item") return null;
  return data.incomingLinks(itemSlug, ["loot"])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => {
      const src = data.getEntity(l.sourceSlug)!;
      return { tier: l.tier, value1: l.value1, sortOrder: l.sortOrder, source: { slug: src.slug, name: src.name } };
    });
}

/** Env entities usable as loot sources (containers + landmarks), for the source dropdown
 *  in the item-side loot editor. */
export async function listLootSources(): Promise<LinkOption[]> {
  return data.listByKind("environment")
    .filter((e) => e.category === "loot-containers" || e.category === "landmarks")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, rarity: e.rarity, icon: e.icon, category: e.category }));
}

/** Every entity that has its own detail page (item / environment / trampler-part),
 *  for the sitemap. Tech nodes are excluded — they have no per-slug route (the
 *  interactive `/tech` tree links to them via `?select=`). */
export async function listEntityPaths(): Promise<{ slug: string; kind: string }[]> {
  return data.entityPaths();
}

export interface CrateDrop { crateSlug: string; crateName: string; tier: string; chance: string | null }

// Environment sources whose loot backlinks onto an item page: crates, landmarks, and NPCs
// (creatures / enemy-tramplers). Game-modes are excluded (no item loot). Keep this in sync
// with the "always backlink data" rule — an env loot source not listed here is a broken backlink.
const LOOT_SOURCE_CATEGORIES = new Set(["loot-containers", "landmarks", "creatures", "enemy-tramplers"]);

/** Every environment source (crate, landmark, or NPC) whose loot contains the given item slug,
 *  with the tier/group label + chance. Powers the item page's reverse "dropped by" view. */
export async function getCratesContaining(itemSlug: string): Promise<CrateDrop[]> {
  return data.incomingLinks(itemSlug, ["loot"])
    .map((l) => ({ l, src: data.getEntity(l.sourceSlug)! }))
    .filter(({ src }) => src.kind === "environment"
      && LOOT_SOURCE_CATEGORIES.has(src.category)
      && !src.disabled)
    .sort((x, y) => x.src.name.localeCompare(y.src.name) || x.l.sortOrder - y.l.sortOrder)
    .map(({ l, src }) => ({
      crateSlug: src.slug, crateName: src.name, tier: l.tier ?? "",
      chance: l.value1 == null ? null : `${l.value1}%`,
    }));
}

export interface KeyUsageLocation { slug: string; name: string; icon: string | null; rarity: string | null; category: string }
export interface KeyUsage { opens: KeyUsageLocation[]; rewardedBy: KeyUsageLocation[] }

/** Reverse view for a key item: locations this key opens (incoming `requires-key`) and
 *  locations that reward it (incoming `rewards-key`). Empty arrays for non-key items. */
export async function getKeyUsage(itemSlug: string): Promise<KeyUsage> {
  const rows = data.incomingLinks(itemSlug, ["requires-key", "rewards-key"])
    .map((l) => ({ l, src: data.getEntity(l.sourceSlug)! }))
    .filter(({ src }) => src.kind === "environment" && !src.disabled)
    .sort((x, y) => x.src.name.localeCompare(y.src.name) || x.l.sortOrder - y.l.sortOrder);
  const toLoc = ({ src }: (typeof rows)[number]): KeyUsageLocation => ({
    slug: src.slug, name: src.name, icon: src.icon, rarity: src.rarity, category: src.category,
  });
  return {
    opens: rows.filter(({ l }) => l.role === "requires-key").map(toLoc),
    rewardedBy: rows.filter(({ l }) => l.role === "rewards-key").map(toLoc),
  };
}

/** {slug,name,icon,rarity} rows for ItemLinkList. */
type LinkItem = { slug: string; name: string; icon: string | null; rarity: string | null };

/** Ammo items whose caliber family matches `caliber` (all interchangeable variants). */
export async function getAmmoByCaliber(caliber: string): Promise<LinkItem[]> {
  return data.listByKind("item")
    .filter((e) => e.category === "ammo" && !e.disabled && e.itemStats?.ammoType === caliber)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, icon: e.icon, rarity: e.rarity }));
}

/** Weapons/artillery that fire the given caliber family. */
export async function getWeaponsByCaliber(caliber: string): Promise<LinkItem[]> {
  return data.listByKind("item")
    .filter((e) => (e.category === "weapons" || e.category === "artillery") && !e.disabled && e.itemStats?.ammoType === caliber)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ slug: e.slug, name: e.name, icon: e.icon, rarity: e.rarity }));
}

/** Resolve the entities referenced by `[[slug]]` links in a description, keyed by
 *  slug, to { name, href, rarity }. slug is globally unique on Entity now, so this is
 *  a single query (no cross-table priority logic). rarity drives the link's color
 *  tint (non-null only for items in practice). Empty input → empty map (no queries). */
export async function getLinkTargetsBySlugs(
  slugs: string[],
): Promise<Map<string, { name: string; href: string; rarity: string | null }>> {
  const result = new Map<string, { name: string; href: string; rarity: string | null }>();
  for (const slug of slugs) {
    const e = data.getEntity(slug);
    if (!e || e.disabled) continue;
    const href = entityHref(e.kind, e.slug);
    if (href) result.set(e.slug, { name: e.name, href, rarity: e.rarity });
  }
  return result;
}

/** Outgoing EntityLink rows for one role on one entity (by slug), target resolved
 *  to slug/name, sorted. Used by the tab editor and its submit/apply paths. */
export async function getOutgoingLinks(slug: string, role: string) {
  const entity = data.getEntity(slug);
  if (!entity) return null;
  const outgoingLinks = data.outgoingLinks(slug, [role]).map((l) => ({
    name: l.name, amount: l.amount, tier: l.tier, value1: l.value1, sortOrder: l.sortOrder,
    target: l.targetSlug ? { slug: l.targetSlug } : null,
  }));
  return { id: entity.id, name: entity.name, kind: entity.kind, outgoingLinks };
}

/** An item's buy options, grouped and ready to render. Empty array if the item has
 *  none. buy-unlock targets resolve to tech-node slug/name; buy-cost to item slug/icon. */
export async function getBuyOptions(itemSlug: string): Promise<BuyOptionView[]> {
  const entity = data.getEntity(itemSlug);
  if (!entity) return [];
  const rows = data.outgoingLinks(itemSlug, ["buy-cost", "buy-yield", "buy-unlock"])
    .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug))
    .sort((a, b) => (a.buyGroup ?? 0) - (b.buyGroup ?? 0) || a.sortOrder - b.sortOrder)
    .map((l) => {
      const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
      return {
        role: l.role, buyGroup: l.buyGroup, amount: l.amount, name: l.name,
        target: t ? { slug: t.slug, kind: t.kind, icon: t.icon, rarity: t.rarity } : null,
      };
    });
  return groupBuyOptions(rows as BuyLinkRow[]);
}

/** Buy options for the editor: the item (id/name/kind) + its current options as views.
 *  Null if the slug is not an item. */
export async function getBuyOptionsForEdit(itemSlug: string) {
  const item = data.getEntity(itemSlug);
  if (!item || item.kind !== "item") return null;
  const options = await getBuyOptions(itemSlug);
  return { item: { id: item.id, name: item.name, kind: item.kind }, options };
}

/** Full tech tree: all tech-node entities with costs, unlocks and same-faction prereqs,
 *  plus each faction's free starting part. */
export async function getTechTree(): Promise<TechTree> {
  const rows = data.listByKind("tech-node")
    .filter((e) => !e.disabled)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      techNodeStats: e.techNodeStats,
      outgoingLinks: data.outgoingLinks(e.slug, ["tech-prereq", "tech-unlock-cost", "tech-unlocks"])
        .filter((l) => l.targetSlug === null || data.isEntityEnabled(l.targetSlug))
        .map((l) => {
          const t = l.targetSlug ? data.getEntity(l.targetSlug) : null;
          return {
            role: l.role, name: l.name, amount: l.amount, sortOrder: l.sortOrder,
            target: t ? { slug: t.slug, name: t.name, icon: t.icon, kind: t.kind, techNodeStats: t.techNodeStats } : null,
          };
        }),
    }));

  const rootSlugs = Object.values(FACTION_ROOT_PART);
  const rootParts = Object.fromEntries(
    rootSlugs
      .map((slug) => data.getEntity(slug))
      .filter((e): e is NonNullable<typeof e> => !!e && !e.disabled)
      .map((e) => [e.slug, { name: e.name, icon: e.icon, kind: e.kind }]),
  );

  return toTechTree(rows, rootParts);
}

/** The tech-node slug that unlocks the given entity (by slug), or null. Entities are
 *  typically unlocked by one node; the lowest-sortOrder incoming `tech-unlocks` wins. */
export async function getUnlockingNode(entitySlug: string): Promise<{ slug: string } | null> {
  const link = data.incomingLinks(entitySlug, ["tech-unlocks"])
    .filter((l) => data.isEntityEnabled(l.sourceSlug))
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return link ? { slug: link.sourceSlug } : null;
}

/** Items whose purchase a given tech node unlocks (reverse of buy-unlock). */
export async function getBuyUnlockedItems(techSlug: string) {
  const node = data.getEntity(techSlug);
  if (!node) return [];
  const seen = new Set<string>();
  return data.incomingLinks(techSlug, ["buy-unlock"])
    .map((l) => data.getEntity(l.sourceSlug))
    .filter((s): s is NonNullable<typeof s> => {
      if (!s || s.kind !== "item" || seen.has(s.slug)) return false;
      seen.add(s.slug);
      return true;
    })
    .map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, kind: s.kind }));
}
