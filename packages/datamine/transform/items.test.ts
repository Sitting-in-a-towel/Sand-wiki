import { describe, it, expect } from "vitest";
import { sekItemPatch, newItemEntity, applyIconOverrides, applyEntityOverrides, pruneIconlessItems } from "./items";
import type { SekItem } from "./sek";
import type { Entity } from "@sandlabs/data";

const sek = (o: Partial<SekItem>): SekItem => ({
  id: "x", name: "X", icon: null, rarity: null, type: null, pawnValue: null, short: null, desc: null, ...o,
});

describe("items transform", () => {
  it("sekItemPatch produces only datamine-owned fields", () => {
    const p = sekItemPatch(sek({ rarity: "NOTEWORTHY", icon: "/icons/x.png", desc: "Hi." }));
    expect(p).toEqual({ rarity: "Noteworthy", icon: "/icons/x.png", description: "Hi." });
  });

  it("sekItemPatch omits fields the datamine doesn't provide", () => {
    const p = sekItemPatch(sek({ rarity: null, icon: null, desc: null }));
    expect(p).toEqual({}); // nothing to refresh -> baseline kept
  });

  it("newItemEntity builds a full Entity for an unmatched SEK item", () => {
    const e = newItemEntity("80-mm-emp-shell", sek({ id: "item_turretAmmo_EMP", name: "80 mm EMP Shell", icon: "/icons/emp.png", rarity: "COMMON", desc: "Boom." }));
    expect(e.slug).toBe("80-mm-emp-shell");
    expect(e.kind).toBe("item");
    expect(e.name).toBe("80 mm EMP Shell");
    expect(e.rarity).toBe("Common");
    expect(e.icon).toBe("/icons/emp.png");
    expect(e.description).toBe("Boom.");
    expect(e.disabled).toBe(false);
    expect(e.category).toBe("misc"); // type null -> misc default
  });

  it("newItemEntity derives category from the SEK type", () => {
    expect(newItemEntity("x", sek({ type: "WEAPON" })).category).toBe("weapons");
    expect(newItemEntity("x", sek({ type: "AMMO" })).category).toBe("ammo");
    expect(newItemEntity("x", sek({ type: "TURRET_AMMO" })).category).toBe("ammo");
    expect(newItemEntity("x", sek({ type: "RESOURCE_T2" })).category).toBe("resources");
    expect(newItemEntity("x", sek({ type: "FOOD" })).category).toBe("medical");
    expect(newItemEntity("x", sek({ type: "MONEY" })).category).toBe("misc");
    expect(newItemEntity("x", sek({ type: null })).category).toBe("misc");
  });

  it("maps the full SEK rarity enum, keeps null otherwise", () => {
    expect(sekItemPatch(sek({ rarity: "UNCOMMON" })).rarity).toBe("Uncommon");
    expect(sekItemPatch(sek({ rarity: "REMARKABLE" })).rarity).toBe("Remarkable");
    expect(sekItemPatch(sek({ rarity: "COMMON" })).rarity).toBe("Common");
  });

  it("applyIconOverrides forces the mapped icon, leaves others untouched", () => {
    const e = (slug: string, icon: string | null): Entity => ({
      id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
      rarity: null, icon, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const out = applyIconOverrides(
      [e("coin-crown", "/icons/wrong.png"), e("other", "/icons/keep.png")],
      { "coin-crown": "/icons/icon_item_coinCrown.png" },
    );
    expect(out.find((x) => x.slug === "coin-crown")?.icon).toBe("/icons/icon_item_coinCrown.png");
    expect(out.find((x) => x.slug === "other")?.icon).toBe("/icons/keep.png");
  });

  it("applyEntityOverrides forces name/disabled by slug, leaves others and unset fields untouched", () => {
    const e = (slug: string, name: string): Entity => ({
      id: slug, slug, kind: "item", name, description: null, category: "misc",
      rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const out = applyEntityOverrides(
      [e("dupe", "Dupe"), e("box-black", "Box with Radio Beacon"), e("other", "Other")],
      { "dupe": { disabled: true }, "box-black": { name: "Box with Radio Beacon (Black)" } },
    );
    const dupe = out.find((x) => x.slug === "dupe")!;
    expect(dupe.disabled).toBe(true);
    expect(dupe.name).toBe("Dupe"); // name not in override -> untouched
    expect(out.find((x) => x.slug === "box-black")!.name).toBe("Box with Radio Beacon (Black)");
    expect(out.find((x) => x.slug === "box-black")!.disabled).toBe(false); // disabled untouched
    expect(out.find((x) => x.slug === "other")!.name).toBe("Other"); // unmapped -> untouched
  });

  it("descriptionAppend is idempotent/self-healing (never stacks up across re-runs)", () => {
    const ent = (description: string | null): Entity => ({
      id: "x", slug: "x", kind: "environment", name: "X", description, category: "landmarks",
      rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const ov = { x: { descriptionAppend: "Finale note." } };
    const first = applyEntityOverrides([ent("Intro.")], ov)[0].description!;
    expect(first).toBe("Intro.\n\nFinale note.");
    // Feeding the already-appended description back in (baseline = previous artifact) must NOT stack.
    const second = applyEntityOverrides([ent(first)], ov)[0].description!;
    expect(second).toBe("Intro.\n\nFinale note.");
    expect(second.split("Finale note.").length - 1).toBe(1);
    // Heals an already-duplicated baseline down to a single copy.
    const healed = applyEntityOverrides([ent("Intro.\n\nFinale note.\n\nFinale note.")], ov)[0].description!;
    expect(healed.split("Finale note.").length - 1).toBe(1);
  });

  it("pruneIconlessItems drops only null-icon item entities, keeps everything else", () => {
    const ent = (slug: string, kind: Entity["kind"], icon: string | null): Entity => ({
      id: slug, slug, kind, name: slug, description: null, category: "misc",
      rarity: null, icon, imageAlt: null, derivedName: null, sourceUrl: null,
      disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
    });
    const out = pruneIconlessItems([
      ent("note", "item", null),              // dropped: item, no icon
      ent("box", "item", null),               // dropped: item, no icon
      ent("iron-ingot", "item", "/icons/iron.png"), // kept: item with icon
      ent("captain-module", "trampler-part", null), // kept: part, null by design
      ent("tier-1-armor", "tech-node", null),       // kept: tech-node, null by design
      ent("scrapyard", "environment", null),        // kept: environment, null by design
    ]);
    expect(out.map((e) => e.slug)).toEqual([
      "iron-ingot", "captain-module", "tier-1-armor", "scrapyard",
    ]);
  });
});
