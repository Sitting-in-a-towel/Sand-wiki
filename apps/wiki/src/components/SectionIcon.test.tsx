import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionIcon } from "./SectionIcon";

describe("SectionIcon", () => {
  it("renders an svg glyph for a mapped section slug (tech/builder/map/admin)", () => {
    expect(renderToStaticMarkup(<SectionIcon slug="tech" />)).toContain("<svg");
    expect(renderToStaticMarkup(<SectionIcon slug="builder" />)).toContain("<svg");
    expect(renderToStaticMarkup(<SectionIcon slug="map" />)).toContain("<svg");
    expect(renderToStaticMarkup(<SectionIcon slug="admin" />)).toContain("<svg");
  });

  it("renders nothing for a data-browse section (label-only)", () => {
    for (const slug of ["items", "environment", "tramplers", "enemies"]) {
      expect(renderToStaticMarkup(<SectionIcon slug={slug} />)).toBe("");
    }
  });

  it("renders nothing for an unmapped slug", () => {
    expect(renderToStaticMarkup(<SectionIcon slug="does-not-exist" />)).toBe("");
  });
});
