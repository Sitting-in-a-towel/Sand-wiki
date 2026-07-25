export type SectionKind = "data" | "placeholder" | "link" | "tools";

export interface Category {
  slug: string;
  label: string;
  wip?: boolean;
}

export interface Section {
  slug: string;
  label: string;
  kind: SectionKind;
  href?: string;
  categories: Category[];
}

const itemCategories: Category[] = [
  { slug: "weapons", label: "Weapons" },
  { slug: "artillery", label: "Artillery" },
  { slug: "resources", label: "Resources" },
  { slug: "attire", label: "Attire" },
  { slug: "tools", label: "Tools" },
  { slug: "medical", label: "Medical" },
  { slug: "ammo", label: "Ammo" },
  { slug: "misc", label: "Misc" },
];

const tramplerCategories: Category[] = [
  { slug: "chassis", label: "Chassis" },
  { slug: "reactors", label: "Reactors" },
  { slug: "engines", label: "Engines" },
  { slug: "crew", label: "Crew Compartments" },
  { slug: "driving", label: "Driving Compartments" },
  { slug: "cargo", label: "Cargo" },
  { slug: "turrets", label: "Turret Decks & Defenses" },
  { slug: "stations", label: "Crafting Stations" },
  { slug: "structure", label: "Structure & Decks" },
];

export const SECTIONS: Section[] = [
  { slug: "items", label: "Items", kind: "data", categories: itemCategories },
  {
    slug: "environment",
    label: "Environment",
    kind: "data",
    categories: [
      { slug: "loot-containers", label: "Loot Containers" },
      { slug: "landmarks", label: "Landmarks" },
      { slug: "game-modes", label: "Game Modes" },
      // NPCs live under Environment as two real categories (kind:"environment").
      { slug: "creatures", label: "Creatures" },
      { slug: "enemy-tramplers", label: "Enemy Tramplers" },
    ],
  },
  { slug: "tramplers", label: "Tramplers", kind: "data", categories: tramplerCategories },
  { slug: "tech", label: "Tech Tree", kind: "link", categories: [] },
  { slug: "builder", label: "Builder", kind: "link", categories: [] },
  { slug: "map", label: "3D Map", kind: "link", categories: [] },
  { slug: "gallery", label: "Gallery", kind: "link", categories: [] },
  {
    // Data hub: a dropdown of standalone tool pages (each category slug IS the route),
    // unlike "data" sections whose categories filter the section index page.
    slug: "data",
    label: "Data",
    kind: "tools",
    categories: [
      { slug: "ballistics", label: "Ballistics" },
      { slug: "crafting", label: "Crafting" },
      { slug: "contracts", label: "Contracts" },
      { slug: "achievements", label: "Achievements" },
    ],
  },
];

export const ITEM_CATEGORIES = itemCategories;
export const ITEM_CATEGORY_SLUGS = itemCategories.map((c) => c.slug);

export function isItemCategory(slug: string): boolean {
  return ITEM_CATEGORY_SLUGS.includes(slug);
}

/** Categories whose items carry a caliber, so they get a "Class" filter instead of a tier filter. */
export const WEAPON_CLASS_CATEGORIES = ["weapons", "artillery", "ammo"];

export function isWeaponClassCategory(slug: string | undefined): boolean {
  return slug !== undefined && WEAPON_CLASS_CATEGORIES.includes(slug);
}

export function categoryLabel(slug: string): string {
  for (const section of SECTIONS) {
    const found = section.categories.find((c) => c.slug === slug);
    if (found) return found.label;
  }
  return slug;
}

export function getSection(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

/** A section whose page is a placeholder ("coming soon") rather than real data. */
export function isWipSection(section: Section): boolean {
  return section.kind === "placeholder";
}

const envCategories = SECTIONS.find((s) => s.slug === "environment")?.categories ?? [];
export const ENV_CATEGORY_SLUGS = envCategories.map((c) => c.slug);

export function isEnvCategory(slug: string): boolean {
  return ENV_CATEGORY_SLUGS.includes(slug);
}

export const TRAMPLER_CATEGORIES = tramplerCategories;
export const TRAMPLER_CATEGORY_SLUGS = tramplerCategories.map((c) => c.slug);

export function isTramplerCategory(slug: string): boolean {
  return TRAMPLER_CATEGORY_SLUGS.includes(slug);
}

/** Ordered keyword rules mapping a component name to a functional category.
 *  Specific keywords MUST precede generic ones (e.g. "Turret Deck" before "Deck",
 *  "Crew Cabin" before "Cabin"). Unmatched names fall back to "structure". */
const TRAMPLER_NAME_RULES: { kw: RegExp; category: string }[] = [
  { kw: /chassis/i, category: "chassis" },
  { kw: /reactor/i, category: "reactors" },
  { kw: /\bengine\b/i, category: "engines" },
  { kw: /turret deck/i, category: "turrets" },
  { kw: /armor plate|embrasure|battering ram|casemate/i, category: "turrets" },
  { kw: /crew (cabin|module)|captain|\bcabin\b/i, category: "crew" }, // standalone "cabin" also maps to crew
  { kw: /steering deck|flybridge|pilot bridge|wheelhouse/i, category: "driving" },
  { kw: /cargo/i, category: "cargo" },
  { kw: /workbench|workshop/i, category: "stations" },
];

export function tramplerCategoryForName(name: string): string {
  for (const { kw, category } of TRAMPLER_NAME_RULES) {
    if (kw.test(name)) return category;
  }
  return "structure";
}

/** Maps the scraper's game `type` enum to a wiki item category slug. Unknown/null -> "misc". */
const TYPE_TO_CATEGORY: Record<string, string> = {
  WEAPON: "weapons",
  WEAPON_BELT: "weapons",
  AMMO: "ammo",
  TURRET_AMMO: "ammo",
  RESOURCE_T1: "resources",
  RESOURCE_T2: "resources",
  RESOURCE_T3: "resources",
  ENERGY: "tools",
  ARMOR: "attire",
  BACKPACK: "attire",
  ATTACK_CONSUMABLE: "weapons",
  RAID_EXPLOSIVES: "weapons",
  UTILITY_CONSUMABLE: "tools",
  FOOD: "medical",
  KEY: "misc",
  MONEY: "misc",
  LARGE_VALUABLE: "misc",
  SMALL_VALUABLE: "misc",
};

export function categoryForType(type: string | null | undefined): string {
  if (!type) return "misc";
  return TYPE_TO_CATEGORY[type] ?? "misc";
}

/** Per-item category overrides, keyed by slug, for items the type mapping gets wrong:
 *  untyped weapons, a utility-typed medical item, and deployable defensive consumables
 *  (typed ATTACK_CONSUMABLE but functionally tools). Checked before the type mapping. */
const CATEGORY_OVERRIDES: Record<string, string> = {
  "rifle-musket": "weapons", // M1866/9 "Einzel" Breechloader — has no game type
  "med-kit": "medical", // MedKit — typed UTILITY_CONSUMABLE but is medical
  "projectile-amplifier": "tools", // Pestkop Lorenz Amplifier — deployable field station
  "projectile-deflect-shield": "tools", // Von Liebig Reflector — deployable shield
  "projectile-sphere-shield": "tools", // Domovyk Protective Dome — deployable shield
  binoculars: "tools", // Player Gear — no game type
  flashlight: "tools", // Player Gear (wiki: Lamp)
  multitool: "tools", // Player Gear (wiki: Repair Tool)
  map: "tools", // Player Gear
  "flare-gun": "tools", // Player Gear
};

/** Name-aware category. Per-slug overrides win first; otherwise weapon-type items whose
 *  name contains a number followed by "mm" (e.g. "40mm", "85 mm") are artillery, and
 *  everything else uses the type mapping. Single source of item categorization — applied
 *  at seed time. */
export function categoryForItem(
  type: string | null | undefined,
  name: string,
  slug?: string,
): string {
  if (slug && CATEGORY_OVERRIDES[slug]) return CATEGORY_OVERRIDES[slug];
  const base = categoryForType(type);
  if (base === "weapons" && /\d+\s?mm/i.test(name)) return "artillery";
  return base;
}

/** Per-category accent color (hex). Decorative dot only — the text label carries meaning. */
export const CATEGORY_COLORS: Record<string, string> = {
  weapons: "#d4654f",
  artillery: "#8b94a6",
  guns: "#8b94a6", // legacy fallback — not a current category
  ammo: "#e0a341",
  resources: "#7fb069",
  tools: "#4fb3a6",
  attire: "#6aa9c9",
  medical: "#d56a8c",
  misc: "#9b8b73",
  // environment categories
  "loot-containers": "#c9a24b",
  landmarks: "#7aa6b0",
  "game-modes": "#b07aa0",
  npcs: "#9b8b73",
  // enemy categories
  creatures: "#c65f5f",
  "enemy-tramplers": "#8b94a6",
  // trampler categories
  chassis: "#a6794f",
  reactors: "#d4a23f",
  engines: "#cf7a4f",
  crew: "#6aa9c9",
  driving: "#7fb069",
  cargo: "#9b8b73",
  turrets: "#8b94a6",
  stations: "#4fb3a6",
  structure: "#7a8a99",
};

export function categoryColor(slug: string): string {
  return CATEGORY_COLORS[slug] ?? CATEGORY_COLORS.misc;
}

/** The three Trampler research factions. `rep` is the per-faction number shown in the
 *  in-game tree (likely reputation level) — verified against the screenshots. */
export const FACTIONS = {
  godlewski: { name: "Godlewski's Expedition", rep: 5 },
  kaiser: { name: "Kaiser's Friends", rep: 13 },
  landwehr: { name: "K.K. Landwehr", rep: 4 },
} as const;

export type FactionKey = keyof typeof FACTIONS;

export function isFaction(s: string): s is FactionKey {
  return Object.prototype.hasOwnProperty.call(FACTIONS, s);
}
