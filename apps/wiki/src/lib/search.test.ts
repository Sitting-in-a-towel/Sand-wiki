import { describe, it, expect } from "vitest";
import { searchSuggestions, type IndexItem, type IndexPlace } from "./search";

const index: IndexItem[] = [
  { slug: "sniper-rifle", name: "1874s Petros Sniper Rifle", category: "weapons", derivedName: "Sniper Rifle" },
  { slug: "pistol-ammo", name: "8x21 mm Ammo", category: "ammo", derivedName: "Pistol Ammo" },
  { slug: "energy-bar", name: "NZ Mk2 Energy Rod", category: "medical", derivedName: "Energy Bar" },
];

const places: IndexPlace[] = [
  { slug: "weapon-crate", name: "Weapon Crate", category: "loot-containers" },
  { slug: "food-crate", name: "Food Crate", category: "loot-containers" },
  { slug: "dreadnaught", name: "Dreadnaught", category: "landmarks" },
];

// NPCs (creatures / enemy-tramplers) are environment "places" now.
const npcs: IndexPlace[] = [
  { slug: "ironclad", name: "Ironclad", category: "enemy-tramplers" },
  { slug: "upior", name: "Upiór", category: "creatures" },
];

describe("searchSuggestions", () => {
  it("returns nothing for an empty/whitespace query", () => {
    expect(searchSuggestions("", index)).toEqual({ categories: [], items: [], places: [] });
    expect(searchSuggestions("   ", index)).toEqual({ categories: [], items: [], places: [] });
  });

  it("matches item names case-insensitively", () => {
    const r = searchSuggestions("rifle", index);
    expect(r.items.map((i) => i.slug)).toEqual(["sniper-rifle"]);
  });

  it("matches category labels", () => {
    const r = searchSuggestions("ammo", index);
    expect(r.categories.map((c) => c.slug)).toContain("ammo");
    expect(r.items.map((i) => i.slug)).toContain("pistol-ammo");
  });

  it("caps item results at 8", () => {
    const many: IndexItem[] = Array.from({ length: 20 }, (_, n) => ({
      slug: `gun-${n}`, name: `Gun ${n}`, category: "weapons", derivedName: `Gun ${n}`,
    }));
    expect(searchSuggestions("gun", many).items).toHaveLength(8);
  });

  it("matches the derived name even when the display name does not contain the query", () => {
    // "pistol ammo" is absent from the display name "8x21 mm Ammo" but present in derivedName.
    const r = searchSuggestions("pistol ammo", index);
    expect(r.items.map((i) => i.slug)).toEqual(["pistol-ammo"]);
  });

  it("still displays the real name in suggestions", () => {
    const r = searchSuggestions("pistol ammo", index);
    expect(r.items[0].name).toBe("8x21 mm Ammo");
  });

  it("matches the display name when the query is absent from the derived name", () => {
    // "petros" is in the display name but not the derived name "Sniper Rifle".
    const r = searchSuggestions("petros", index);
    expect(r.items.map((i) => i.slug)).toEqual(["sniper-rifle"]);
  });

  it("matches places by name and returns them in the places field", () => {
    const r = searchSuggestions("crate", index, places);
    expect(r.places.map((p) => p.slug)).toEqual(["weapon-crate", "food-crate"]);
  });

  it("returns places of both categories, tagged by category", () => {
    const r = searchSuggestions("a", index, places);
    expect(r.places.some((p) => p.category === "loot-containers")).toBe(true);
    expect(r.places.some((p) => p.category === "landmarks")).toBe(true);
  });

  it("defaults places to empty when not provided", () => {
    expect(searchSuggestions("crate", index).places).toEqual([]);
  });

  it("caps place results at 6", () => {
    const many: IndexPlace[] = Array.from({ length: 20 }, (_, n) => ({
      slug: `crate-${n}`, name: `Crate ${n}`, category: "loot-containers",
    }));
    expect(searchSuggestions("crate", index, many).places).toHaveLength(6);
  });

  it("matches NPCs (as places) by name, tagged by their npc category", () => {
    const r = searchSuggestions("iron", index, npcs);
    const iron = r.places.find((p) => p.slug === "ironclad");
    expect(iron?.category).toBe("enemy-tramplers");
  });
});
