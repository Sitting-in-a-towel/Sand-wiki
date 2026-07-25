import Link from "next/link";
import type { CrateDrop } from "@/lib/queries";
import { SortableTable, type SortableTableRow } from "@/components/SortableTable";

/** Reverse loot view on an item page: which sources drop this item — crates, landmarks, and
 *  NPCs (creatures / enemy-tramplers) — grouped, with tier/group labels. */
export function CrateDropList({ drops }: { drops: CrateDrop[] }) {
  const byCrate = new Map<string, { name: string; tiers: string[] }>();
  for (const d of drops) {
    const e = byCrate.get(d.crateSlug) ?? { name: d.crateName, tiers: [] };
    const label = d.chance ? `${d.tier} (${d.chance})` : d.tier;
    if (!e.tiers.includes(label)) e.tiers.push(label);
    byCrate.set(d.crateSlug, e);
  }

  const rows: SortableTableRow[] = [...byCrate.entries()].map(([slug, c]) => ({
    keys: [c.name.toLowerCase(), c.tiers.join(", ")],
    cells: [
      <Link key="c" href={`/environment/${slug}`} className="text-primary transition-colors hover:text-primary-hover">{c.name}</Link>,
      <span key="t" className="whitespace-nowrap">{c.tiers.join(", ")}</span>,
    ],
  }));

  return (
    <div className="overflow-x-auto">
      <SortableTable
        caption="Sources that drop this item"
        columns={[{ label: "Source" }, { label: "Tiers" }]}
        rows={rows}
      />
    </div>
  );
}
