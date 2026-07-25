import { describe, it, expect } from "vitest";
import { slugForName } from "./entityLinkIndex";

/** Loot labels seen on the 3D map's right panel → the wiki item page they must link to.
 *  These labels come from spawns.json (the extractor's blueprint-derived names), which
 *  diverge from the entities' flavour `name` — so they resolve via `derivedName` (and, for
 *  the game_/item_-prefixed container blueprints, a prefix-stripped `derivedName`) or a
 *  family rule, not by exact name. Regression guard for the map→item backlinks. */
const EXPECT: Record<string, string> = {
  // already resolved by name (guard against regressions)
  Ficus: "/items/ficus",
  "Raw Aurogen Crystal": "/items/crystal-handles",
  "Rusty 80 mm Naval Cannon Kit": "/items/game-packed-turret-t1-container",
  // resolve via derivedName (flavour name differs from the in-game blueprint name)
  "Artefact Crystal": "/items/artefact-crystal",
  "Treasure Shovel": "/items/treasure-shovel",
  "Wok Bomb": "/items/wok-bomb",
  "Document Safe": "/items/document-safe",
  "Wine Box": "/items/wine-box",
  "Canned Fish": "/items/canned-fish",
  // resolve via prefix-stripped derivedName ("Game Packed …" ⟷ extractor's "Packed …")
  "Packed Turret T4 Rail Gun Container": "/items/game-packed-turret-t4-rail-gun-container",
  // resolve via family rule (tiered ground piles → the one Crowns item)
  "Coin Crown Pile 25": "/items/coin-crown",
  "Coin Crown Pile 5": "/items/coin-crown",
};

describe("map loot → wiki item backlinks", () => {
  for (const [label, href] of Object.entries(EXPECT)) {
    it(`links "${label}" → ${href}`, () => {
      expect(slugForName(label)?.href).toBe(href);
    });
  }

  // the panel shows the entity's canonical wiki name in place of the blueprint label
  it.each([
    ["Document Safe", "District Officer's Portable Safe"],
    ["Artefact Crystal", "Crystal"],
    ["Wok Bomb", "E-Wok Bomb"],
    ["Wine Box", "Crate of 1889 Chardonnay"],
    ["Canned Fish", "Canned Sea Deer XL"],
  ])('resolves "%s" to wiki name "%s"', (label, name) => {
    expect(slugForName(label)?.name).toBe(name);
  });

  // tiered container labels resolve via a family rule → flagged so the panel keeps the
  // tier-bearing label instead of the generic wiki container name
  it("flags family (tiered-container) matches so the panel keeps the label", () => {
    const r = slugForName("Shells Box T3 High Effort");
    expect(r?.href).toBe("/environment/crate-of-shells");
    expect(r?.family).toBe(true);
    // a 1:1 item match is NOT a family match
    expect(slugForName("Document Safe")?.family).toBeUndefined();
  });
});
