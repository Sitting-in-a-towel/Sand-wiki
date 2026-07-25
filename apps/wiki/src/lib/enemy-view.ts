import type { StatCell } from "@/lib/item-view";
import type { EnemyStats } from "@sandlabs/data";

/** One StatGrid cell per enemy variant: label = variant name, value = "<hp> HP"
 *  (or "—" when HP is unknown). Used on the enemy detail page. */
export function enemyStatCells(variants: EnemyStats["variants"]): StatCell[] {
  return variants.map((v) => ({
    label: v.name,
    value: v.hp != null ? `${v.hp} HP` : "—",
  }));
}
