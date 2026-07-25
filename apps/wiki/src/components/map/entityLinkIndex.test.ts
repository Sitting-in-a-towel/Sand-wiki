import { describe, it, expect } from "vitest";
import { slugForName, __normalize, keyOpens, doorKey } from "./entityLinkIndex";

describe("__normalize", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(__normalize("  Crate   of  Shells ")).toBe("crate of shells");
  });
});

describe("slugForName", () => {
  it("returns null for an unknown name", () => {
    expect(slugForName("definitely not a real entity xyzzy")).toBeNull();
  });

  it("resolves a known item name to its /items route (case-insensitive)", () => {
    expect(slugForName("Binoculars")).toMatchObject({ href: "/items/binoculars" });
    expect(slugForName("  BINOCULARS  ")).toMatchObject({ href: "/items/binoculars" });
  });

  it("resolves another known item name", () => {
    expect(slugForName("Black Box")).toMatchObject({ href: "/items/black-box" });
  });

  it("resolves a known environment name to its /environment route", () => {
    expect(slugForName("Crate of Shells")).toMatchObject({ href: "/environment/crate-of-shells" });
  });

  it("includes the entity icon path when the entity has one", () => {
    // Binoculars has a sprite in the current dataset.
    expect(slugForName("Binoculars")).toMatchObject({ icon: "/icons/icon_item_binocular.png" });
    // Every resolved route exposes an `icon` key (string path or null).
    const hit = slugForName("Black Box");
    expect(hit).not.toBeNull();
    expect(hit).toHaveProperty("icon");
  });

  it("returns null for empty input", () => {
    expect(slugForName("")).toBeNull();
  });

  // Curated alias: the map's turret loot label diverges from the wiki kit name, so it
  // only resolves via the alias layer (verified against the real store).
  it("resolves a turret loot label to its wiki artillery kit via the alias layer", () => {
    expect(slugForName("Auto Mounted Turret T1 Packable"))
      .toMatchObject({ href: "/items/game-packed-auto-turret-t1-container" });
    expect(slugForName("Shotgun Mounted Turret T3 Packable"))
      .toMatchObject({ href: "/items/game-packed-shotgun-turret-t3-container" });
  });

  // Loot boxes vary by tier/effort but the wiki has one untiered container per type;
  // the family fallback links them regardless of the tier/effort suffix.
  it("resolves loot-box families to their untiered wiki container", () => {
    expect(slugForName("Shells Box T1 Mid Effort")).toMatchObject({ href: "/environment/crate-of-shells" });
    expect(slugForName("Medical Cabinet T2 Low Effort")).toMatchObject({ href: "/environment/medical-cabinet" });
    expect(slugForName("Locked Box Military")).toMatchObject({ href: "/environment/military-box" });
    expect(slugForName("Army Box T1 High Effort")).toMatchObject({ href: "/environment/military-box" });
    expect(slugForName("Safe Middle T2")).toMatchObject({ href: "/environment/valuables-safe" });
    expect(slugForName("Valuable Piles03")).toMatchObject({ href: "/items/coin-crown" });
  });

  it("doorKey returns a lockable door's colour-matched key (incl. fort)", () => {
    expect(doorKey("Sqr Door Lockable Black")).toMatchObject({ href: "/items/game-key-island-door-black" });
    expect(doorKey("Sqr Door Lockable Fort")).toMatchObject({ href: "/items/game-key-island-door-fort" });
    expect(doorKey("Destructible Door Medium")).toBeNull(); // not a keyed door
  });

  it("keyOpens lists what a key unlocks (requires-key backlink)", () => {
    expect(keyOpens("Green Key").some(o => o.href === "/environment/kaiserplatz")).toBe(true);
    expect(keyOpens("Box Key").some(o => o.href === "/environment/military-box")).toBe(true);
    expect(keyOpens("Metal Rods")).toEqual([]); // not a key
  });

  // Armored turrets have no corresponding wiki kit — intentionally unlinked (no alias,
  // no name match) so they stay plain text rather than mislinking.
  it("leaves an armored turret (no wiki kit) unlinked", () => {
    expect(slugForName("Auto Mounted Turret Armored T1 Packable")).toBeNull();
  });

  // "Backpack" (item, slug "backpack01") is disabled in the current dataset and has
  // no enabled entity of the same name — verified via packages/data/generated/entities.json.
  it("returns null for a disabled entity's name, even though it exists in the dataset", () => {
    expect(slugForName("Backpack")).toBeNull();
  });

  // Collision-priority check (item > environment > trampler-part) is intentionally
  // NOT tested against the real dataset: as of this writing, no normalized name in
  // packages/data/generated/entities.json appears in more than one of
  // {item, environment, trampler-part}, so there is no real fixture to assert against.
  // (Verified by grouping entities.json by normalized name and checking for kind overlap.)
});
