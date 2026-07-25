import { describe, it, expect } from "vitest";
import { mergeWorldSpawnEntity, buildWorldSpawnLinks, type WorldSpawnData } from "./world-spawns";
import type { Entity } from "@sandlabs/data";

const ws: WorldSpawnData = {
  source: { id: "world-ground-loot", slug: "world-ground-loot", name: "World / Ground Loot", category: "loot-containers", icon: null },
  loot: [
    { slug: "boomstick-shotgun", name: "Boomstick Shotgun", chance: null, tier: "Ground spawn", count: "1" },
    { slug: null as unknown as string, name: "Unresolved", chance: null, tier: "Ground spawn", count: "1" },
  ],
};

const baseItem = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: "/i.png", imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("world-spawn entity", () => {
  it("adds the World / Ground Loot environment entity", () => {
    const out = mergeWorldSpawnEntity([baseItem("boomstick-shotgun")], ws);
    const e = out.find((x) => x.slug === "world-ground-loot")!;
    expect(e.kind).toBe("environment");
    expect(e.category).toBe("loot-containers");
    expect(e.description).toContain("ground");
  });
  it("upserts (no duplicate) on re-run", () => {
    const stale: Entity = { ...baseItem("world-ground-loot"), kind: "environment", name: "OLD" };
    const out = mergeWorldSpawnEntity([stale], ws);
    expect(out.filter((x) => x.slug === "world-ground-loot")).toHaveLength(1);
    expect(out.find((x) => x.slug === "world-ground-loot")!.name).toBe("World / Ground Loot");
  });
  it("is a no-op when data is absent", () => {
    const base = [baseItem("x")];
    expect(mergeWorldSpawnEntity(base, null)).toBe(base);
  });
});

describe("world-spawn loot links", () => {
  it("emits role:loot links from the source, skipping unresolved rows, no chance/qty", () => {
    const { covered, links } = buildWorldSpawnLinks(ws);
    expect([...covered]).toEqual(["world-ground-loot"]);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      sourceSlug: "world-ground-loot", targetSlug: "boomstick-shotgun", role: "loot",
      name: "Boomstick Shotgun", amount: null, tier: "Ground spawn",
      value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null,
    });
  });
});
