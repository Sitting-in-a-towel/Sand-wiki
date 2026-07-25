import { listByKind, getEntity, incomingLinks } from "@sandlabs/data";

/** Kinds that have a wiki detail route, in collision-priority order. */
const KIND_ROUTE: { kind: string; base: string }[] = [
  { kind: "item", base: "/items" },
  { kind: "environment", base: "/environment" },
  { kind: "trampler-part", base: "/tramplers" },
];

/** Curated aliases for loot labels whose in-game name diverges from the wiki entity
 *  name, so plain name-matching can't connect them. Keyed by (un-normalized) label →
 *  wiki slug; each is verified against the store when the index is built, so a stale
 *  entry degrades to plain text rather than a dead link. Extend as mismatches surface.
 *
 *  Turrets: the map spawns the "packable" walker part (walker_…Turret…_packable) while
 *  the wiki models the lootable as the packed artillery "Kit" item
 *  (game-packed-…-turret-t{N}-container). Armored / rail-gun / untiered turrets are
 *  intentionally omitted — they have no corresponding wiki kit item. */
const ALIASES: Record<string, string> = {
  "Auto Mounted Turret T1 Packable": "game-packed-auto-turret-t1-container",
  "Auto Mounted Turret T2 Packable": "game-packed-auto-turret-t2-container",
  "Auto Mounted Turret T3 Packable": "game-packed-auto-turret-t3-container",
  "Auto Mounted Turret T4 Accelerating Packable": "game-packed-auto-turret-t4-accelerating-container",
  "Shotgun Mounted Turret T1 Packable": "game-packed-shotgun-turret-t1-container",
  "Shotgun Mounted Turret T2 Packable": "game-packed-shotgun-turret-t2-container",
  "Shotgun Mounted Turret T3 Packable": "game-packed-shotgun-turret-t3-container",
  "Shotgun Mounted Turret T4 Double Barrel Packable": "game-packed-shotgun-turret-t4-double-barrel-container",
  "Mounted Turret T1 Packable": "game-packed-turret-t1-container",
  "Mounted Turret T2 Packable": "game-packed-turret-t2-container",
  "Mounted Turret T3 Packable": "game-packed-turret-t3-container",
};

/** Family fallback: loot-box labels vary by tier/effort (e.g. "Shells Box T1 Mid
 *  Effort") but the wiki models each loot type as ONE untiered container. Match the
 *  family prefix → wiki container slug; verified against the store. Ambiguous families
 *  (Army Box, Container Box, Valuable Piles) are intentionally omitted until confirmed. */
const FAMILIES: { re: RegExp; slug: string }[] = [
  { re: /^shells box\b/i, slug: "crate-of-shells" },
  { re: /^food box\b/i, slug: "food-crate" },
  { re: /^parts box\b/i, slug: "parts-crate" },
  { re: /^army box\b/i, slug: "military-box" },
  { re: /^medical cabinet\b/i, slug: "medical-cabinet" },
  { re: /^locked box military\b/i, slug: "military-box" },
  { re: /^locked box utility\b/i, slug: "utility-box" },
  { re: /^locked box valuables\b/i, slug: "valuables-box" },
  { re: /^safe\b/i, slug: "valuables-safe" },
  { re: /^valuable pile/i, slug: "coin-crown" }, // ground piles of crowns ("Valuable Piles01"…)
  { re: /^coin crown pile/i, slug: "coin-crown" }, // tiered crown piles ("Coin Crown Pile 25"…)
];

/** Lockable door label → the key item that opens it (colour-matched, plus the fort key). */
const DOOR_KEY: Record<string, string> = {
  black: "game-key-island-door-black",
  blue: "game-key-island-door-blue",
  green: "game-key-island-door-green",
  red: "game-key-island-door-red",
  white: "game-key-island-door-white",
  fort: "game-key-island-door-fort",
};

/** Lowercase, trim, collapse internal whitespace. Exported for tests. */
export function __normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface EntityRoute {
  href: string;
  /** The wiki entity's canonical display name — what the map panel should show, in place
   *  of the blueprint-derived loot label (e.g. "District Officer's Portable Safe", not
   *  "Document Safe"). */
  name: string;
  /** Sprite path (e.g. "/icons/…png") when the entity has one, else null. */
  icon: string | null;
  /** True when matched via a loot-box FAMILY rule: many tiered/effort labels collapse to one
   *  untiered wiki page, so the panel keeps the original label (which carries the tier) rather
   *  than replacing it with the container's generic wiki name. */
  family?: boolean;
}

/** Resolve a wiki slug to its route + name + icon, or null if the entity is missing/disabled. */
function routeFor(slug: string): EntityRoute | null {
  const e = getEntity(slug);
  if (!e || e.disabled) return null;
  const base = KIND_ROUTE.find((k) => k.kind === e.kind)?.base;
  return base ? { href: `${base}/${slug}`, name: e.name, icon: e.icon ?? null } : null;
}

let INDEX: Map<string, EntityRoute> | null = null;

/** Build once: normalized-name -> {href}. Higher-priority kinds are inserted
 *  first; lower-priority kinds must not overwrite an existing key. Disabled
 *  entities are skipped — the wiki's hard rule is that disabled entities are
 *  scrubbed from all cross-refs (listByKind does not filter these itself). */
function getIndex(): Map<string, EntityRoute> {
  if (INDEX) return INDEX;
  const m = new Map<string, EntityRoute>();
  const add = (key: string, e: { slug: string; name: string; icon: string | null }, base: string) => {
    const k = __normalize(key);
    if (k && !m.has(k)) m.set(k, { href: `${base}/${e.slug}`, name: e.name, icon: e.icon ?? null });
  };
  // Three passes, highest priority first (never overwrites): the flavour `name`, then the
  // blueprint-derived `derivedName` (loot labels come from the same blueprint id, so they
  // match this when the flavour name diverges), then `derivedName` with a leading
  // "Game "/"Item " word dropped — the extractor strips that prefix from container labels
  // ("Packed Turret …") while the wiki keeps it in derivedName ("Game Packed Turret …").
  for (const { kind, base } of KIND_ROUTE)
    for (const e of listByKind(kind)) if (!e.disabled) add(e.name, e, base);
  for (const { kind, base } of KIND_ROUTE)
    for (const e of listByKind(kind)) if (!e.disabled && e.derivedName) add(e.derivedName, e, base);
  for (const { kind, base } of KIND_ROUTE)
    for (const e of listByKind(kind))
      if (!e.disabled && e.derivedName) {
        const stripped = e.derivedName.replace(/^(?:Game|Item)\s+/i, "");
        if (stripped !== e.derivedName) add(stripped, e, base);
      }
  // curated aliases win over name matches (they correct known mismatches); each is
  // verified against the store so a missing/disabled target is skipped, never dead-linked.
  for (const [label, slug] of Object.entries(ALIASES)) {
    const r = routeFor(slug);
    if (r) m.set(__normalize(label), r);
  }
  INDEX = m;
  return m;
}

/** Route for a loot/container display name, or null if nothing matches. Tries the
 *  built index (exact name + curated aliases) first, then the loot-box family rules. */
export function slugForName(name: string): EntityRoute | null {
  if (!name) return null;
  const hit = getIndex().get(__normalize(name));
  if (hit) return hit;
  for (const f of FAMILIES)
    if (f.re.test(name.trim())) {
      const r = routeFor(f.slug);
      return r ? { ...r, family: true } : null;
    }
  return null;
}

/** The key a lockable door requires ("Sqr Door Lockable Black" → Black Key), or null.
 *  Doors aren't wiki entities, so this powers a "Requires" row rather than a title link. */
export function doorKey(label: string): { name: string; href: string; icon: string | null } | null {
  const m = /^sqr door lockable (black|blue|green|red|white|fort)\b/i.exec(label || "");
  if (!m) return null;
  const slug = DOOR_KEY[m[1].toLowerCase()];
  const e = getEntity(slug);
  if (!e || e.disabled) return null;
  const base = KIND_ROUTE.find((k) => k.kind === e.kind)?.base;
  return base ? { name: e.name, href: `${base}/${slug}`, icon: e.icon ?? null } : null;
}

/** Reverse backlink for a key: the locations/containers it opens (i.e. the entities
 *  that `requires-key` this key). Empty unless `name` resolves to a game-key-* item. */
export function keyOpens(name: string): { name: string; href: string; icon: string | null }[] {
  const hit = slugForName(name);
  const slug = hit?.href.split("/").pop();
  if (!slug || !/^game-key-/.test(slug)) return [];
  const out: { name: string; href: string; icon: string | null }[] = [];
  for (const l of incomingLinks(slug, ["requires-key"])) {
    const e = getEntity(l.sourceSlug);
    if (!e || e.disabled) continue;
    const base = KIND_ROUTE.find((k) => k.kind === e.kind)?.base;
    if (base) out.push({ name: e.name, href: `${base}/${e.slug}`, icon: e.icon ?? null });
  }
  return out;
}
