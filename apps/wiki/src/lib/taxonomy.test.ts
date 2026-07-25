import { describe, it, expect } from "vitest";
import {
  SECTIONS, ITEM_CATEGORIES, ITEM_CATEGORY_SLUGS,
  isItemCategory, categoryLabel, getSection, categoryForType, categoryForItem,
  isEnvCategory, CATEGORY_COLORS, categoryColor,
  isTramplerCategory, tramplerCategoryForName, TRAMPLER_CATEGORY_SLUGS,
  isWeaponClassCategory, WEAPON_CLASS_CATEGORIES,
  isWipSection,
  FACTIONS, isFaction,
} from "./taxonomy";

describe("taxonomy", () => {
  it("exposes the top-level sections in order", () => {
    expect(SECTIONS.map((s) => s.slug)).toEqual([
      "items", "environment", "tramplers", "tech", "builder", "gallery", "data",
    ]);
  });

  it("has unique section slugs", () => {
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
  });

  it("has unique category slugs within each section", () => {
    for (const s of SECTIONS) {
      const slugs = s.categories.map((c) => c.slug);
      expect(new Set(slugs).size, `duplicate in ${s.slug}`).toBe(slugs.length);
    }
  });

  it("defines the eight item categories", () => {
    expect(ITEM_CATEGORY_SLUGS).toEqual([
      "weapons", "artillery", "resources", "attire", "tools", "medical", "ammo", "misc",
    ]);
    expect(ITEM_CATEGORIES.every((c) => c.label.length > 0)).toBe(true);
  });

  it("validates item categories", () => {
    expect(isItemCategory("weapons")).toBe(true);
    expect(isItemCategory("npcs")).toBe(false);
    expect(isItemCategory("nope")).toBe(false);
  });

  it("maps a category slug to its label, falling back to the slug", () => {
    expect(categoryLabel("weapons")).toBe("Weapons");
    expect(categoryLabel("loot-containers")).toBe("Loot Containers");
    expect(categoryLabel("game-modes")).toBe("Game Modes");
    expect(categoryLabel("unknown")).toBe("unknown");
  });

  it("looks up a section by slug", () => {
    expect(getSection("environment")?.label).toBe("Environment");
    expect(getSection("missing")).toBeUndefined();
  });

  it("environment is a data section with its env categories (incl. NPCs)", () => {
    const env = getSection("environment");
    expect(env?.kind).toBe("data");
    expect(env?.categories.map((c) => c.slug)).toEqual([
      "loot-containers", "landmarks", "game-modes", "creatures", "enemy-tramplers",
    ]);
  });

  it("validates env categories", () => {
    expect(isEnvCategory("loot-containers")).toBe(true);
    expect(isEnvCategory("landmarks")).toBe(true);
    expect(isEnvCategory("weapons")).toBe(false);
  });

  it("exposes the nine trampler categories as a data section", () => {
    const tr = getSection("tramplers");
    expect(tr?.kind).toBe("data");
    expect(tr?.categories.map((c) => c.slug)).toEqual([
      "chassis", "reactors", "engines", "crew", "driving",
      "cargo", "turrets", "stations", "structure",
    ]);
    expect(isTramplerCategory("chassis")).toBe(true);
    expect(isTramplerCategory("weapons")).toBe(false);
  });

  it("maps component names to functional categories, specific before generic", () => {
    expect(tramplerCategoryForName("KF-B \"Hole\" Middling Chassis")).toBe("chassis");
    expect(tramplerCategoryForName("NZ AzE80 Motor-Reactor, Covered (1x3)")).toBe("reactors");
    expect(tramplerCategoryForName("NZ Mb2k Maneuver Engine, Small")).toBe("engines");
    expect(tramplerCategoryForName("S&H MK4 Crew Cabin, 4 People")).toBe("crew");
    expect(tramplerCategoryForName("S&H M78 Framed Steering Deck")).toBe("driving");
    expect(tramplerCategoryForName("S&H Cargo Bay, L-Shape")).toBe("cargo");
    expect(tramplerCategoryForName("S.Trs Turret Deck")).toBe("turrets");
    expect(tramplerCategoryForName("S&H Armaments Workbench")).toBe("stations");
    expect(tramplerCategoryForName("S&H Supporting Frame")).toBe("structure");
  });

  it("resolves trampler category labels", () => {
    expect(categoryLabel("stations")).toBe("Crafting Stations");
    expect(categoryLabel("chassis")).toBe("Chassis");
  });
});

describe("categoryForType", () => {
  it("maps known game types to wiki categories", () => {
    expect(categoryForType("WEAPON")).toBe("weapons");
    expect(categoryForType("WEAPON_BELT")).toBe("weapons");
    expect(categoryForType("AMMO")).toBe("ammo");
    expect(categoryForType("TURRET_AMMO")).toBe("ammo");
    expect(categoryForType("RESOURCE_T1")).toBe("resources");
    expect(categoryForType("RESOURCE_T3")).toBe("resources");
    expect(categoryForType("ENERGY")).toBe("tools");
    expect(categoryForType("ARMOR")).toBe("attire");
    expect(categoryForType("BACKPACK")).toBe("attire");
    expect(categoryForType("ATTACK_CONSUMABLE")).toBe("weapons");
    expect(categoryForType("RAID_EXPLOSIVES")).toBe("weapons");
    expect(categoryForType("UTILITY_CONSUMABLE")).toBe("tools");
    expect(categoryForType("FOOD")).toBe("medical");
    expect(categoryForType("KEY")).toBe("misc");
    expect(categoryForType("MONEY")).toBe("misc");
    expect(categoryForType("LARGE_VALUABLE")).toBe("misc");
    expect(categoryForType("SMALL_VALUABLE")).toBe("misc");
  });

  it("maps null/unknown types to misc", () => {
    expect(categoryForType(null)).toBe("misc");
    expect(categoryForType("SOME_NEW_TYPE")).toBe("misc");
  });
});

describe("categoryForItem", () => {
  it("routes mm-named weapons to artillery", () => {
    expect(categoryForItem("WEAPON", "40mm Cannon")).toBe("artillery");
    expect(categoryForItem("WEAPON", "85 mm Howitzer")).toBe("artillery");
    expect(categoryForItem("WEAPON_BELT", "120mm Belt")).toBe("artillery");
  });

  it("keeps non-mm weapons in weapons", () => {
    expect(categoryForItem("WEAPON", "Assault Rifle")).toBe("weapons");
    expect(categoryForItem("WEAPON_BELT", "Ammo Belt")).toBe("weapons");
  });

  it("only applies the mm rule to weapon types", () => {
    // "mm" in a non-weapon name must not move it to artillery
    expect(categoryForItem("FOOD", "Yummy 9mm Snack")).toBe("medical");
    expect(categoryForItem("RESOURCE_T1", "100mm Scrap")).toBe("resources");
  });

  it("falls back to type mapping for null/unknown", () => {
    expect(categoryForItem(null, "anything")).toBe("misc");
    expect(categoryForItem("SOME_NEW_TYPE", "40mm")).toBe("misc");
  });

  it("applies per-slug overrides ahead of the type mapping", () => {
    // Untyped weapon and a utility-typed medical item.
    expect(categoryForItem(null, 'M1866/9 "Einzel" Breechloader', "rifle-musket")).toBe("weapons");
    expect(categoryForItem("UTILITY_CONSUMABLE", "MedKit", "med-kit")).toBe("medical");
    // Deployable defensive consumables: ATTACK_CONSUMABLE would map to weapons.
    expect(categoryForItem("ATTACK_CONSUMABLE", "Pestkop Lorenz Amplifier", "projectile-amplifier")).toBe("tools");
    expect(categoryForItem("ATTACK_CONSUMABLE", "Von Liebig Reflector", "projectile-deflect-shield")).toBe("tools");
    expect(categoryForItem("ATTACK_CONSUMABLE", "Domovyk Protective Dome", "projectile-sphere-shield")).toBe("tools");
  });

  it("leaves non-overridden slugs to the normal mapping", () => {
    expect(categoryForItem("UTILITY_CONSUMABLE", "Repair Kit", "repair-kit")).toBe("tools");
    expect(categoryForItem("ENERGY", "NZ Mk2 Energy Rod", "energy-rod-mk2")).toBe("tools");
  });

  it("maps Player Gear slugs to tools", () => {
    expect(categoryForItem(null, "Binoculars", "binoculars")).toBe("tools");
    expect(categoryForItem(null, "Flashlight", "flashlight")).toBe("tools");
    expect(categoryForItem(null, "Multitool", "multitool")).toBe("tools");
    expect(categoryForItem(null, "Map", "map")).toBe("tools");
    expect(categoryForItem(null, "Flare Gun", "flare-gun")).toBe("tools");
  });
});

describe("category colors", () => {
  it("defines a color for every item category", () => {
    for (const slug of ITEM_CATEGORY_SLUGS) {
      expect(CATEGORY_COLORS[slug], `missing color for ${slug}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("defines a color for every trampler category", () => {
    for (const slug of TRAMPLER_CATEGORY_SLUGS) {
      expect(CATEGORY_COLORS[slug], `missing color for ${slug}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("falls back to the misc color for unknown slugs", () => {
    expect(categoryColor("nope")).toBe(CATEGORY_COLORS.misc);
    expect(categoryColor("weapons")).toBe("#d4654f");
  });
});

describe("isWeaponClassCategory", () => {
  it("is true only for caliber-bearing categories", () => {
    expect(WEAPON_CLASS_CATEGORIES).toEqual(["weapons", "artillery", "ammo"]);
    expect(isWeaponClassCategory("weapons")).toBe(true);
    expect(isWeaponClassCategory("artillery")).toBe(true);
    expect(isWeaponClassCategory("ammo")).toBe(true);
    expect(isWeaponClassCategory("tools")).toBe(false);
    expect(isWeaponClassCategory(undefined)).toBe(false);
  });
});

describe("WIP markers", () => {
  it("flags placeholder sections as WIP", () => {
    expect(
      isWipSection({ slug: "x", label: "X", kind: "placeholder", categories: [] }),
    ).toBe(true);
  });
  it("does not flag data or link sections as WIP", () => {
    expect(isWipSection(getSection("items")!)).toBe(false);
    expect(isWipSection(getSection("environment")!)).toBe(false);
    expect(isWipSection(getSection("tramplers")!)).toBe(false);
    expect(isWipSection(getSection("tech")!)).toBe(false);
  });
  it("leaves all env categories live (no WIP placeholders)", () => {
    const env = getSection("environment")!;
    for (const c of env.categories) expect(c.wip).toBeFalsy();
  });
});

describe("factions", () => {
  it("maps the three research factions to display names", () => {
    expect(FACTIONS.godlewski.name).toBe("Godlewski's Expedition");
    expect(FACTIONS.kaiser.name).toBe("Kaiser's Friends");
    expect(FACTIONS.landwehr.name).toBe("K.K. Landwehr");
  });
  it("isFaction guards unknown keys", () => {
    expect(isFaction("godlewski")).toBe(true);
    expect(isFaction("nope")).toBe(false);
  });
});

describe("gallery nav section", () => {
  it("is registered as a link section pointing at /gallery", () => {
    const gallery = getSection("gallery");
    expect(gallery).toBeDefined();
    expect(gallery?.kind).toBe("link");
    expect(gallery?.href ?? "/gallery").toBe("/gallery");
    expect(gallery?.categories).toEqual([]);
  });

  it("orders gallery alongside the other tool links (after builder)", () => {
    const slugs = SECTIONS.map((s) => s.slug);
    expect(slugs).toContain("gallery");
    expect(slugs.indexOf("gallery")).toBeGreaterThan(slugs.indexOf("builder"));
  });
});

describe("NPC categories under Environment", () => {
  it("registers creatures + enemy-tramplers as Environment categories", () => {
    const env = getSection("environment");
    const slugs = env?.categories.map((c) => c.slug) ?? [];
    expect(slugs).toContain("creatures");
    expect(slugs).toContain("enemy-tramplers");
    expect(slugs).not.toContain("npcs"); // the old WIP placeholder is gone
  });
  it("treats the NPC categories as environment categories", () => {
    expect(isEnvCategory("creatures")).toBe(true);
    expect(isEnvCategory("enemy-tramplers")).toBe(true);
  });
  it("labels the NPC categories", () => {
    expect(categoryLabel("enemy-tramplers")).toBe("Enemy Tramplers");
    expect(categoryLabel("creatures")).toBe("Creatures");
  });
  it("has no separate Enemies section", () => {
    expect(getSection("enemies")).toBeUndefined();
  });
});
