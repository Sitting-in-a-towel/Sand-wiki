import { describe, it, expect } from "vitest";
import { entityHref, groupLootByTier, isLinkRole, linkFields, LINK_ROLES, type LinkRow } from "./entity-links";

const row = (over: Partial<LinkRow>): LinkRow => ({
  targetSlug: null, targetKind: null, name: "x", icon: null, rarity: null,
  amount: null, tier: null, value1: null, value2: null, value3: null, sortOrder: 0, ...over,
});

describe("groupLootByTier", () => {
  it("groups rows into tiers in canonical order, preserving row order", () => {
    const groups = groupLootByTier([
      row({ name: "B", tier: "Rare", sortOrder: 1001 }),
      row({ name: "A", tier: "Normal", sortOrder: 1 }),
      row({ name: "C", tier: "Normal", sortOrder: 2 }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Rare"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["A", "C"]);
  });

  it("puts unknown tiers last and null tier under 'Other'", () => {
    const groups = groupLootByTier([
      row({ name: "Z", tier: null, sortOrder: 5 }),
      row({ name: "A", tier: "Normal", sortOrder: 1 }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Other"]);
  });
});

describe("key-progression roles", () => {
  it("registers requires-key and rewards-key with no extra editable columns", () => {
    expect(LINK_ROLES["requires-key"]).toBeDefined();
    expect(LINK_ROLES["rewards-key"]).toBeDefined();
    expect(linkFields("requires-key")).toEqual([]);
    expect(linkFields("rewards-key")).toEqual([]);
  });
});

describe("isLinkRole", () => {
  it("recognizes every registered role, including fieldless key roles", () => {
    expect(isLinkRole("loot")).toBe(true);
    expect(isLinkRole("cost")).toBe(true);
    expect(isLinkRole("requires-key")).toBe(true);
    expect(isLinkRole("rewards-key")).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(isLinkRole("tech-prereq")).toBe(false);
    expect(isLinkRole("")).toBe(false);
    expect(isLinkRole("nonsense")).toBe(false);
  });
});

describe("groupLootByTier ordering", () => {
  it("sorts numeric Tier N labels in order, others after", () => {
    const groups = groupLootByTier([
      row({ tier: "Tier 3" }), row({ tier: "Tier 1" }),
      row({ tier: "Drops" }), row({ tier: "Tier 2" }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Tier 1", "Tier 2", "Tier 3", "Drops"]);
  });

  it("still orders the legacy rarity tiers", () => {
    const groups = groupLootByTier([
      row({ tier: "Very Rare" }), row({ tier: "Normal" }), row({ tier: "Rare" }),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["Normal", "Rare", "Very Rare"]);
  });
});

describe("entityHref", () => {
  it("maps NPCs (environment kind) to /environment/<slug>", () => {
    expect(entityHref("environment", "upior")).toBe("/environment/upior");
  });
  it("returns null for unknown kinds", () => {
    expect(entityHref("mystery", "x")).toBeNull();
  });
});

describe("buy roles", () => {
  it("registers buy-cost / buy-yield / buy-unlock as link roles", () => {
    expect(isLinkRole("buy-cost")).toBe(true);
    expect(isLinkRole("buy-yield")).toBe(true);
    expect(isLinkRole("buy-unlock")).toBe(true);
  });

  it("buy-cost and buy-yield edit the amount field; buy-unlock has none", () => {
    expect(linkFields("buy-cost")).toEqual(["amount"]);
    expect(linkFields("buy-yield")).toEqual(["amount"]);
    expect(linkFields("buy-unlock")).toEqual([]);
  });
});
