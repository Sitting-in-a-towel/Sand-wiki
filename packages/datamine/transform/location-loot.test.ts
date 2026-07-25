import { describe, it, expect } from "vitest";
import { mergeLocationEntities, buildLocationLootLinks, applyLocationLoot, NOTABLE_TIER, type LocationLootData } from "./location-loot";
import type { Entity, EntityLink } from "@sandlabs/data";

const data: LocationLootData = {
  locations: [
    { slug: "dreadnaught", name: "Dreadnought", mint: false, category: "landmarks", loot: [
      { slug: "game-packed-turret-t4-rail-gun-container", name: "Experimental 80 mm Railgun Kit", chance: 33.3, tier: NOTABLE_TIER, count: "1" },
    ] },
    { slug: "ship-graveyard", name: "Ship Graveyard", mint: true, category: "landmarks", loot: [
      { slug: "game-packed-turret-t4-rail-gun-container", name: "Experimental 80 mm Railgun Kit", chance: 3, tier: NOTABLE_TIER, count: "1" },
    ] },
  ],
};

const ent = (slug: string, kind = "environment"): Entity => ({
  id: slug, slug, kind, name: slug, description: null, category: "landmarks", rarity: null,
  icon: null, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
  itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("location entity minting", () => {
  it("mints mint:true locations and leaves non-mint ones", () => {
    const out = mergeLocationEntities([ent("dreadnaught")], data);
    expect(out.map((e) => e.slug).sort()).toEqual(["dreadnaught", "ship-graveyard"]);
    expect(out.find((e) => e.slug === "ship-graveyard")!.kind).toBe("environment");
  });
  it("upserts an already-minted location's description on re-run", () => {
    const withDesc: LocationLootData = { locations: [
      { slug: "ship-graveyard", name: "Ship Graveyard", mint: true, category: "landmarks", description: "worm pit finale", loot: [] },
    ] };
    const out = mergeLocationEntities([ent("ship-graveyard")], withDesc);
    expect(out.filter((e) => e.slug === "ship-graveyard")).toHaveLength(1);   // no duplicate
    expect(out.find((e) => e.slug === "ship-graveyard")!.description).toBe("worm pit finale");
  });
});

describe("location loot links", () => {
  it("emits notable-tier loot links with chance in value1", () => {
    const { covered, links } = buildLocationLootLinks(data);
    expect([...covered].sort()).toEqual(["dreadnaught", "ship-graveyard"]);
    const d = links.find((l) => l.sourceSlug === "dreadnaught")!;
    expect(d).toMatchObject({ targetSlug: "game-packed-turret-t4-rail-gun-container", role: "loot", tier: NOTABLE_TIER, value1: "33.3" });
  });

  it("applyLocationLoot full-overwrites loot for covered locations, keeps others' loot", () => {
    const base: EntityLink[] = [
      { sourceSlug: "dreadnaught", targetSlug: "wiki-veryrare", role: "loot", name: "Old", amount: null, tier: "Very Rare", value1: "5", value2: null, value3: null, sortOrder: 0, buyGroup: null },
      { sourceSlug: "weapon-crate", targetSlug: "x", role: "loot", name: "X", amount: null, tier: "Tier 1", value1: "5", value2: null, value3: null, sortOrder: 0, buyGroup: null },
    ];
    const out = applyLocationLoot(base, buildLocationLootLinks(data));
    const dread = out.filter((l) => l.sourceSlug === "dreadnaught");
    expect(dread.some((l) => l.targetSlug === "wiki-veryrare")).toBe(false);  // stale wiki loot dropped
    expect(dread.some((l) => l.targetSlug === "game-packed-turret-t4-rail-gun-container")).toBe(true);
    expect(out.some((l) => l.sourceSlug === "weapon-crate")).toBe(true);      // non-covered untouched
  });
});
