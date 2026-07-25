import { describe, it, expect } from "vitest";
import { mergeLockboxEntities, buildLockboxLinks, applyLockboxLinks, type LockboxData } from "./lockbox";
import type { Entity, EntityLink } from "@sandlabs/data";

const data: LockboxData = {
  crates: [
    {
      id: "military-box", slug: "military-box", name: "Military Box", category: "loot-containers",
      icon: null, requiresKeySlug: "game-key-locked-box", requiresKeyName: "Box Key",
      loot: [
        { slug: "turret-ammo", name: "Turret Ammo", chance: 98.7, tier: "Loot", count: "20-60" },
        { slug: null as unknown as string, name: "Unresolved", chance: 10, tier: "Loot", count: "1" },
      ],
    },
  ],
};

const baseItem = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: "/i.png", imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("lockbox entities", () => {
  it("adds each crate as a loot-container environment entity", () => {
    const e = mergeLockboxEntities([], data).find((x) => x.slug === "military-box")!;
    expect(e.kind).toBe("environment");
    expect(e.category).toBe("loot-containers");
    expect(e.description).toContain("key-locked");
  });
  it("upserts (no duplicate) on re-run", () => {
    const stale: Entity = { ...baseItem("military-box"), kind: "environment", name: "OLD" };
    const out = mergeLockboxEntities([stale], data);
    expect(out.filter((x) => x.slug === "military-box")).toHaveLength(1);
    expect(out.find((x) => x.slug === "military-box")!.name).toBe("Military Box");
  });
});

describe("lockbox links", () => {
  it("emits loot links (chance+count) and a requires-key link, skipping unresolved loot", () => {
    const { covered, links } = buildLockboxLinks(data);
    expect([...covered]).toEqual(["military-box"]);
    const loot = links.filter((l) => l.role === "loot");
    const key = links.filter((l) => l.role === "requires-key");
    expect(loot).toHaveLength(1); // null-slug row dropped
    expect(loot[0]).toMatchObject({ sourceSlug: "military-box", targetSlug: "turret-ammo", value1: "98.7", value2: "20-60", tier: "Loot" });
    expect(key[0]).toMatchObject({ sourceSlug: "military-box", targetSlug: "game-key-locked-box", role: "requires-key", name: "Box Key" });
  });

  it("applyLockboxLinks replaces prior crate links, keeps others", () => {
    const base: EntityLink[] = [
      { sourceSlug: "military-box", targetSlug: "old", role: "loot", name: "Old", amount: null, tier: "Loot", value1: "1", value2: null, value3: null, sortOrder: 0, buyGroup: null },
      { sourceSlug: "weapon-crate", targetSlug: "x", role: "loot", name: "X", amount: null, tier: "T1", value1: "5", value2: null, value3: null, sortOrder: 0, buyGroup: null },
    ];
    const out = applyLockboxLinks(base, buildLockboxLinks(data));
    expect(out.filter((l) => l.sourceSlug === "military-box").map((l) => l.targetSlug).sort())
      .toEqual(["game-key-locked-box", "turret-ammo"]);
    expect(out.find((l) => l.sourceSlug === "weapon-crate")).toBeTruthy(); // untouched
  });
});
