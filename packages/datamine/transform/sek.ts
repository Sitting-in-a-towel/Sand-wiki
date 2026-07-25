// Typed loaders for the committed sek-out datasets (the datamine inputs).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SEK = resolve(import.meta.dirname, "../sek-out");

export interface SekItem {
  id: string; name: string; icon: string | null; rarity: string | null;
  type: string | null; pawnValue: number | null; short: string | null; desc: string | null;
}

export interface LocEntry { name: string; short?: string | null; desc: string | null }
export interface Localization {
  locales: string[];
  items: Record<string, { locales: Record<string, LocEntry> }>;
  compartments: Record<string, { locales: Record<string, LocEntry> }>;
  factions: string[];
}

function read<T>(file: string, dir = SEK): T {
  return JSON.parse(readFileSync(resolve(dir, file), "utf-8")) as T;
}

export function loadSekItems(dir = SEK): SekItem[] { return read("items.json", dir); }
export function loadLocalization(dir = SEK): Localization { return read("localization.json", dir); }

// --- container loot (already reconciled to wiki slugs + tier-collapse by build_container_loot.py) ---
export interface LootEntry { slug: string; name: string; chance: number; voyage: string | null; storm: string | null }
export interface LootTier { tier: string; rollSets: number; loot: LootEntry[] }
export interface Container { name: string; icon: string; category: string; tiers: LootTier[] }
export type ContainerLoot = Record<string, Container>;  // keyed by SEK container slug

export function loadContainerLoot(dir = SEK): ContainerLoot {
  // build_container_loot.py emits a { meta, containers } envelope; tolerate a bare map too.
  const raw = read<Record<string, unknown>>("container_loot.json", dir);
  return (raw.containers ?? raw) as ContainerLoot;
}

// --- enemies (NPC entities + variant HP + combined loot; produced by build_enemies.py) ---
import type { EnemyData } from "./enemies";

export function loadEnemies(dir = SEK): EnemyData[] {
  const p = resolve(dir, "enemies.json");
  if (!existsSync(p)) return [];  // Stage A hasn't produced it yet -> no-op in the transform
  const raw = JSON.parse(readFileSync(p, "utf-8")) as { enemies?: EnemyData[] } | EnemyData[];
  return (Array.isArray(raw) ? raw : raw.enemies ?? []);
}

// --- world/ground loose-item spawns (the "World / Ground Loot" source; build_world_spawns.py) ---
import type { WorldSpawnData } from "./world-spawns";

export function loadWorldSpawns(dir = SEK): WorldSpawnData | null {
  const p = resolve(dir, "world_spawns.json");
  if (!existsSync(p)) return null;  // Stage A hasn't produced it yet -> no-op
  return JSON.parse(readFileSync(p, "utf-8")) as WorldSpawnData;
}

// --- locked crates (Military/Valuables/Utility Box; build_lockbox_loot.py) ---
import type { LockboxData } from "./lockbox";

export function loadLockboxes(dir = SEK): LockboxData | null {
  const p = resolve(dir, "lockbox_loot.json");
  if (!existsSync(p)) return null;  // Stage A hasn't produced it yet -> no-op
  return JSON.parse(readFileSync(p, "utf-8")) as LockboxData;
}

// --- per-location notable loot (Dreadnought experimental cannons, etc.; build_location_loot.py) ---
import type { LocationLootData } from "./location-loot";

export function loadLocationLoot(dir = SEK): LocationLootData | null {
  const p = resolve(dir, "location_loot.json");
  if (!existsSync(p)) return null;  // Stage A hasn't produced it yet -> no-op
  return JSON.parse(readFileSync(p, "utf-8")) as LocationLootData;
}
