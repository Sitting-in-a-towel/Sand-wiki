import { describe, it, expect } from "vitest";
import { enemyStatCells } from "./enemy-view";

describe("enemyStatCells", () => {
  it("maps each variant to a label/value HP cell", () => {
    const cells = enemyStatCells([
      { name: "Buckler", hp: 5000 },
      { name: "Falchion", hp: 4000 },
    ]);
    expect(cells).toEqual([
      { label: "Buckler", value: "5000 HP" },
      { label: "Falchion", value: "4000 HP" },
    ]);
  });
  it("renders a dash when hp is null", () => {
    expect(enemyStatCells([{ name: "Ranged", hp: null }])).toEqual([
      { label: "Ranged", value: "—" },
    ]);
  });
  it("returns [] for no variants", () => {
    expect(enemyStatCells([])).toEqual([]);
  });
});
