// Orchestrates the transform: load baseline + sek-out, reconcile items, build i18n, merge
// items, deep-derive container loot links, diff, validate, write artifact + missing report.
// Recipes + non-loot links + parts/tech/locations entities pass through from the baseline
// this iteration (merge framework is extensible per-kind).
//   npx tsx transform/run.ts [--allow-slug-changes]
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadBaseline } from "./baseline";
import { loadSekItems, loadLocalization, loadContainerLoot, loadEnemies, loadWorldSpawns, loadLockboxes, loadLocationLoot } from "./sek";
import { reconcile } from "./reconcile";
import { buildItemI18n } from "./i18n";
import { mergeItems } from "./merge";
import { applyIconOverrides, applyEntityOverrides, pruneIconlessItems, type EntityOverride } from "./items";
import { loadCompartmentStats, mergeTrampler } from "./trampler";
import { loadWeaponStats, loadTurretStats, mergeCombatStats } from "./combat-stats";
import { loadRecipes, mergeRecipes } from "./recipes";
import { enumerateItems } from "./enumerate";
import { canonicalSekId } from "./variants";
import { buildLootLinks, applyLoot, type LootOverrides } from "./loot";
import { mergeEnemies, buildEnemyLootLinks } from "./enemies";
import { mergeWorldSpawnEntity, buildWorldSpawnLinks } from "./world-spawns";
import { mergeLockboxEntities, buildLockboxLinks, applyLockboxLinks } from "./lockbox";
import { mergeLocationEntities, buildLocationLootLinks, applyLocationLoot } from "./location-loot";
import { classifyImages } from "./images";
import { diffEntities } from "./diff";
import { validateEntities, writeArtifact, writeMissingReport, writeImagesReport, writeRecipesMissingReport, reportDanglingRefs } from "./emit";

const PUBLIC = resolve(import.meta.dirname, "../../../apps/wiki/public");

const allowSlugChanges = process.argv.includes("--allow-slug-changes");
const readJson = (p: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, p), "utf-8"));
const overrides = readJson("overrides/slug-map.json") as Record<string, string>;
const lootOverrides = readJson("overrides/loot-overrides.json") as LootOverrides;
const exclusions = new Set(readJson("overrides/exclusions.json") as string[]);
const iconMap = readJson("overrides/icon-map.json") as Record<string, string>;
const partOverrides = readJson("overrides/part-slug-map.json") as Record<string, string>;
// Slugs intentionally kept hardcoded (baseline-only) — non-droppable/non-craftable items the
// game registry doesn't expose for datamining (binoculars, flashlight, map, multitool). They are
// NOT gaps to fix, so they're filtered out of the missing-from-datamine report.
const hardcodedItems = new Set(readJson("overrides/hardcoded-items.json") as string[]);
// Curated display-level fixes the datamine can't express (disable a redundant duplicate,
// disambiguate identical names). slug -> {name?, disabled?, category?}.
const entityOverrides = readJson("overrides/entity-overrides.json") as Record<string, EntityOverride>;

const baseline = loadBaseline();
// Drop excluded SEK ids (junk/duplicate pseudo-items that shouldn't become wiki pages,
// e.g. game_treasureShovel) before any reconcile/merge so they never get added.
const sekItems = loadSekItems().filter((i) => !exclusions.has(i.id));
const loc = loadLocalization();
const containerLoot = loadContainerLoot();
const enemies = loadEnemies();
const worldSpawns = loadWorldSpawns();
const lockboxes = loadLockboxes();
const locationLoot = loadLocationLoot();

// --- items: enumerate (SEK items ∪ localization registry) -> reconcile -> i18n -> merge ---
const allItems = enumerateItems(loc, sekItems).filter((i) => !exclusions.has(i.id));
const rec = reconcile(allItems.map((i) => ({ id: i.id, name: i.name })), baseline.entities, overrides);
// Localization ENRICHES/MATCHES baseline entities but must never MINT new pages — the loc
// table is noisy (internal "Note" items, debug/test boxes, name-drift dupes). Only items that
// come from the curated SEK items.json may create a new entity; loc-only ids that don't match
// a baseline entity (status "new") are dropped here. Matched/override loc ids still enrich + i18n.
const realSekIds = new Set(sekItems.map((i) => canonicalSekId(i.id)));
const mergeable = allItems.filter((it) => {
  const hit = rec.bySekId.get(it.id);
  return hit !== undefined && (hit.status !== "new" || realSekIds.has(it.id));
});
const i18n = buildItemI18n(loc, new Map([...rec.bySekId].map(([id, hit]) => [id, hit.slug])));
const merged = mergeItems(baseline.entities, mergeable, rec.bySekId, i18n);
// Force corrected icons last (fixes stale/wrong paths in the source data).
const withOverrides = applyEntityOverrides(applyIconOverrides(merged.entities, iconMap), entityOverrides);
// Item pages require an icon: an item with no shippable sprite is not available in-game
// (internal notes/debug boxes/packed-turret containers, and not-yet-released items). Non-item
// kinds (tech-node/environment/trampler-part) keep their by-design null icons. Applied after
// icon-map so an override can rescue an item before the prune.
const entities = pruneIconlessItems(withOverrides);
const prunedCount = withOverrides.length - entities.length;
console.log(`icon gate: dropped ${prunedCount} icon-less item page(s)`);
// Genuine gaps only — drop the intentionally-hardcoded baseline-only items.
const missing = merged.missing.filter((m) => !hardcodedItems.has(m.slug));
const hardcodedKept = merged.missing.length - missing.length;

// --- trampler stats: refresh part stats from compartment_stats.json when present ---
const compartmentStats = loadCompartmentStats();
const withTrampler = compartmentStats.length
  ? mergeTrampler(entities, compartmentStats, partOverrides)
  : entities;
if (compartmentStats.length) {
  console.log(`trampler stats: refreshed from ${compartmentStats.length} compartments`);
} else {
  console.log("trampler stats: source absent (compartment_stats.json) — baseline preserved");
}

// --- combat stats: refresh item ItemStats from weapon/turret datasets ---
const withCombat = mergeCombatStats(withTrampler, loadWeaponStats(), loadTurretStats(), rec.bySekId);
const combatRefreshed = withCombat.filter((e, i) => e.itemStats !== withTrampler[i].itemStats).length;
console.log(`combat stats: refreshed ${combatRefreshed} items`);

// --- enemies: add/refresh NPC entities (Upior, Ironclad) with enemyStats ---
const withEnemies = enemies.length ? mergeEnemies(withCombat, enemies) : withCombat;
console.log(enemies.length
  ? `enemies: merged ${enemies.length} NPC entit${enemies.length === 1 ? "y" : "ies"}`
  : "enemies: source absent (enemies.json) — none merged");

// --- world spawns: add the synthetic "World / Ground Loot" source entity ---
const withWorld = mergeWorldSpawnEntity(withEnemies, worldSpawns);
console.log(worldSpawns
  ? `world spawns: merged "World / Ground Loot" source (${worldSpawns.loot.length} loose items)`
  : "world spawns: source absent (world_spawns.json) — none merged");

// --- locked crates: mint Military/Valuables/Utility Box container entities ---
const withLockboxes = mergeLockboxEntities(withWorld, lockboxes);
console.log(lockboxes
  ? `lockboxes: merged ${lockboxes.crates.length} locked-crate container(s)`
  : "lockboxes: source absent (lockbox_loot.json) — none merged");

// --- per-location notable loot: mint any new location entities (e.g. Ship Graveyard) ---
const withLocations = mergeLocationEntities(withLockboxes, locationLoot);
console.log(locationLoot
  ? `location loot: ${locationLoot.locations.length} location(s) with notable loot`
  : "location loot: source absent (location_loot.json) — none merged");

// --- recipes: merge crafting recipes over baseline (keep baseline-only + report) ---
const recipeMerge = mergeRecipes(baseline.recipes, loadRecipes(), rec.bySekId);
console.log(`recipes: ${recipeMerge.recipes.length} total (${recipeMerge.missing.length} baseline-only kept)`);

// --- loot: deep-derive container loot links, then drop any pointing at an unknown slug ---
const knownSlugs = new Set(withLocations.map((e) => e.slug));
const loot = buildLootLinks(containerLoot, lootOverrides);
const dangling = loot.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (dangling.length) {
  console.warn(`loot: dropping ${dangling.length} link(s) to unknown item slugs:`,
    [...new Set(dangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
loot.links = loot.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const enemyLoot = buildEnemyLootLinks(enemies);
const enemyDangling = enemyLoot.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (enemyDangling.length) {
  console.warn(`enemy loot: dropping ${enemyDangling.length} link(s) to unknown item slugs:`,
    [...new Set(enemyDangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
enemyLoot.links = enemyLoot.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const worldLoot = buildWorldSpawnLinks(worldSpawns);
const worldDangling = worldLoot.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (worldDangling.length) {
  console.warn(`world loot: dropping ${worldDangling.length} link(s) to unknown item slugs:`,
    [...new Set(worldDangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
worldLoot.links = worldLoot.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const lockboxLinks = buildLockboxLinks(lockboxes);
const lockboxDangling = lockboxLinks.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (lockboxDangling.length) {
  console.warn(`lockbox links: dropping ${lockboxDangling.length} link(s) to unknown slugs:`,
    [...new Set(lockboxDangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
lockboxLinks.links = lockboxLinks.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const locationLootLinks = buildLocationLootLinks(locationLoot);
const locDangling = locationLootLinks.links.filter((l) => l.targetSlug && !knownSlugs.has(l.targetSlug));
if (locDangling.length) {
  console.warn(`location loot: dropping ${locDangling.length} link(s) to unknown item slugs:`,
    [...new Set(locDangling.map((l) => l.targetSlug))].slice(0, 20).join(", "));
}
locationLootLinks.links = locationLootLinks.links.filter((l) => !l.targetSlug || knownSlugs.has(l.targetSlug));
const links = applyLocationLoot(
  applyLockboxLinks(applyLoot(applyLoot(applyLoot(baseline.links, loot), enemyLoot), worldLoot), lockboxLinks),
  locationLootLinks,
);
console.log(`enemy loot: ${enemyLoot.links.length} link(s) across ${enemyLoot.covered.size} enemies`);
console.log(`lockboxes: ${lockboxLinks.links.length} link(s) (loot + requires-key) across ${lockboxLinks.covered.size} crates`);
console.log(`location loot: ${locationLootLinks.links.length} notable link(s) across ${locationLootLinks.covered.size} locations`);
console.log(`world loot: ${worldLoot.links.length} loose-item link(s)`);

// --- diff + guards ---
const diff = diffEntities(baseline.entities, withLocations);
console.log(`entities ${diff.total.prev} -> ${diff.total.next} | +${diff.added.length} added, -${diff.removed.length} removed`);
console.log(`reconcile: ${[...rec.bySekId.values()].filter((h) => h.status === "matched").length} matched, ` +
  `${[...rec.bySekId.values()].filter((h) => h.status === "new").length} new, ` +
  `${[...rec.bySekId.values()].filter((h) => h.status === "override").length} override`);
console.log(`loot: refreshed ${loot.covered.size} containers, ${loot.links.length} loot links`);
console.log(`missing-from-datamine: ${missing.length} genuine gaps (+${hardcodedKept} intentionally hardcoded, excluded)`);
if (diff.added.length) console.log("  added:", diff.added.slice(0, 20).join(", ") + (diff.added.length > 20 ? " …" : ""));

if (diff.removed.length > 0 && !allowSlugChanges) {
  console.error(`REFUSING: ${diff.removed.length} existing slug(s) would be removed: ${diff.removed.join(", ")}`);
  console.error("re-run with --allow-slug-changes if this is intended.");
  process.exit(1);
}

validateEntities(withLocations);

const danglingRefs = reportDanglingRefs(withLocations, links, recipeMerge.recipes);
if (danglingRefs.length) {
  console.warn(`referential integrity: ${danglingRefs.length} dangling reference(s) to missing entities:`,
    danglingRefs.slice(0, 20).join(", ") + (danglingRefs.length > 20 ? " …" : ""));
}

// --- images: report entities whose icon is null or whose file is missing on disk ---
const images = classifyImages(withLocations, (icon) => existsSync(resolve(PUBLIC, `.${icon}`)));
console.log(`missing images: ${images.needsExtraction.length} need extraction ` +
  `(by design: ${images.byDesign.techNodeNoIcon} tech-nodes, ${images.byDesign.environmentNoIcon} locations/NPCs)`);

// recipes + non-loot links + parts/tech/locations entities pass through from baseline.
writeArtifact(withLocations, recipeMerge.recipes, links);
writeMissingReport(missing);
writeRecipesMissingReport(recipeMerge.missing);
writeImagesReport(images);
console.log("wrote packages/data/generated/{entities,recipes,links}.json + reports/{missing-from-datamine,missing-images,missing-recipes}.json");
