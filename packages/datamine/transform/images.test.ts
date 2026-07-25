import { describe, it, expect } from "vitest";
import { classifyImages } from "./images";
import type { Entity } from "@sandlabs/data";

const ent = (slug: string, kind: string, icon: string | null): Entity => ({
  id: slug, slug, kind, name: slug, description: null, category: "misc",
  rarity: null, icon, imageAlt: null, derivedName: null, sourceUrl: null,
  disabled: false, itemStats: null, tramplerStats: null, techNodeStats: null,
});

describe("classifyImages", () => {
  const entities = [
    ent("has-icon", "item", "/icons/ok.png"),       // file present
    ent("broken", "item", "/icons/gone.png"),        // file missing
    ent("no-icon", "trampler-part", null),           // null icon -> needs extraction
    ent("a-location", "environment", null),          // null env -> by design (no game icon)
    ent("tech", "tech-node", null),                  // null but by design
  ];
  // only /icons/ok.png "exists"
  const r = classifyImages(entities, (icon) => icon === "/icons/ok.png");

  it("flags broken (file-missing) and null icons as needing extraction", () => {
    const slugs = r.needsExtraction.map((m) => m.slug);
    expect(slugs).toContain("broken");
    expect(slugs).toContain("no-icon");
    expect(r.needsExtraction.find((m) => m.slug === "broken")?.issue).toBe("file-missing");
    expect(r.needsExtraction.find((m) => m.slug === "no-icon")?.issue).toBe("null");
  });

  it("excludes entities whose icon file exists", () => {
    expect(r.needsExtraction.map((m) => m.slug)).not.toContain("has-icon");
  });

  it("counts tech-node and environment null icons as by-design, not needing extraction", () => {
    expect(r.byDesign.techNodeNoIcon).toBe(1);
    expect(r.byDesign.environmentNoIcon).toBe(1);
    expect(r.needsExtraction.map((m) => m.slug)).not.toContain("tech");
    expect(r.needsExtraction.map((m) => m.slug)).not.toContain("a-location");
  });
});

describe("images: NPC (environment) icon exemption", () => {
  it("counts null-icon NPCs under environment byDesign, not needsExtraction", () => {
    const report = classifyImages(
      [ent("upior", "environment", null)],
      () => false,
    );
    expect(report.needsExtraction).toHaveLength(0);
    expect(report.byDesign.environmentNoIcon).toBe(1);
  });
});
