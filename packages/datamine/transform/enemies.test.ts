import { describe, it, expect } from "vitest";
import { mergeEnemies, buildEnemyLootLinks, type EnemyData } from "./enemies";
import type { Entity } from "@sandlabs/data";

const upior: EnemyData = {
  id: "upior", slug: "upior", name: "Upiór", type: "creature", icon: null,
  variants: [{ name: "Ranged", hp: 100 }, { name: "Melee", hp: 100 }],
  loot: [
    { group: "Ranged", slug: "pistol-ammo", name: "Pistol Ammo", chance: 100, voyage: "1", storm: "1-2" },
    { group: "Melee", slug: null, name: "Unresolved Thing", chance: 50, voyage: "1", storm: "1" },
  ],
};

const baseItem = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: "/i.png", imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("enemy merge", () => {
  it("appends an NPC as an environment entity with enemyStats and mapped category", () => {
    const out = mergeEnemies([baseItem("pistol-ammo")], [upior]);
    expect(out).toHaveLength(2);
    const e = out.find((x) => x.slug === "upior")!;
    expect(e.kind).toBe("environment");
    expect(e.category).toBe("creatures");
    expect(e.icon).toBeNull();
    expect(e.enemyStats).toEqual({ type: "creature", variants: [{ name: "Ranged", hp: 100 }, { name: "Melee", hp: 100 }] });
  });

  it("upserts (refreshes) an existing NPC instead of duplicating it", () => {
    const stale: Entity = { ...baseItem("upior"), kind: "environment", name: "OLD", enemyStats: { type: "creature", variants: [] } };
    const out = mergeEnemies([stale, baseItem("pistol-ammo")], [upior]);
    expect(out.filter((x) => x.slug === "upior")).toHaveLength(1);
    expect(out.find((x) => x.slug === "upior")!.name).toBe("Upiór");
  });

  it("maps enemy-trampler type to the enemy-tramplers category", () => {
    const ic: EnemyData = { ...upior, id: "ironclad", slug: "ironclad", name: "Ironclad", type: "enemy-trampler", loot: [] };
    const e = mergeEnemies([], [ic]).find((x) => x.slug === "ironclad")!;
    expect(e.category).toBe("enemy-tramplers");
    expect(e.enemyStats!.type).toBe("enemy-trampler");
  });
});

describe("enemy loot links", () => {
  it("emits role:loot links (source=enemy, tier=group), skipping unresolved items", () => {
    const { covered, links } = buildEnemyLootLinks([upior]);
    expect([...covered]).toEqual(["upior"]);
    expect(links).toHaveLength(1); // the null-slug row is dropped
    expect(links[0]).toEqual({
      sourceSlug: "upior", targetSlug: "pistol-ammo", role: "loot", name: "Pistol Ammo",
      amount: null, tier: "Ranged", value1: "100", value2: "1", value3: "1-2", sortOrder: 0, buyGroup: null,
    });
  });
});
