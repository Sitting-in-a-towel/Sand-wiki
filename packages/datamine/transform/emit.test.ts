import { describe, it, expect } from "vitest";
import { reportDanglingRefs } from "./emit";
import type { Entity, EntityLink, Recipe } from "@sandlabs/data";

const entity = (slug: string): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: "/icons/x.png", imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

const link = (o: Partial<EntityLink>): EntityLink => ({
  sourceSlug: "a", targetSlug: null, role: "cost", name: "", amount: null,
  tier: null, value1: null, value2: null, value3: null, sortOrder: 0, buyGroup: null,
  ...o,
});

const recipe = (o: Partial<Recipe>): Recipe => ({
  slug: "r", workbench: null, tier: null, craftTimeSeconds: null, locationSlug: null,
  inputs: [], outputs: [], ...o,
});

describe("reportDanglingRefs", () => {
  it("flags a dangling link target and recipe input/output slugs, not known ones", () => {
    const entities = [entity("a"), entity("b")];
    const links = [link({ sourceSlug: "a", targetSlug: "missing", role: "cost" })];
    const recipes = [recipe({ inputs: [{ itemSlug: "a", amount: 1 }], outputs: [{ itemSlug: "gone", amount: 1 }] })];
    const out = reportDanglingRefs(entities, links, recipes);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((s) => s.includes("missing"))).toBe(true);
    expect(out.some((s) => s.includes("gone"))).toBe(true);
    expect(out.some((s) => s.endsWith(": a"))).toBe(false);
    expect(out.some((s) => s.endsWith(": b"))).toBe(false);
  });

  it("returns empty when everything resolves to a known entity", () => {
    const entities = [entity("a"), entity("b")];
    const links = [link({ sourceSlug: "a", targetSlug: "b", role: "cost" })];
    const recipes = [recipe({ inputs: [{ itemSlug: "a", amount: 1 }], outputs: [{ itemSlug: "b", amount: 1 }] })];
    expect(reportDanglingRefs(entities, links, recipes)).toEqual([]);
  });

  it("does not flag a null targetSlug (legal name-only link)", () => {
    const entities = [entity("a")];
    const links = [link({ sourceSlug: "a", targetSlug: null, role: "cost" })];
    expect(reportDanglingRefs(entities, links, [])).toEqual([]);
  });

  it("flags a dangling link source", () => {
    const entities = [entity("a")];
    const links = [link({ sourceSlug: "gone-source", targetSlug: "a", role: "cost" })];
    const out = reportDanglingRefs(entities, links, []);
    expect(out).toEqual(["link cost source: gone-source"]);
  });

  it("flags a dangling recipe locationSlug", () => {
    const entities = [entity("a")];
    const recipes = [recipe({ slug: "a", locationSlug: "gone-place", inputs: [{ itemSlug: "a", amount: 1 }] })];
    const out = reportDanglingRefs(entities, [], recipes);
    expect(out).toEqual(["recipe a location: gone-place"]);
  });
});
