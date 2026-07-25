import type { IconType } from "react-icons";
import { GiFamilyTree, GiWrench, GiDatabase, GiIsland } from "react-icons/gi";

/** Monochrome glyph for a top-level nav SECTION (keyed by section slug — a different
 *  keyspace than CategoryIcon's category slugs). Only the standalone tool/link entries
 *  carry an icon (Tech Tree, Builder, 3D Map, Data); the data-browse sections (Items, Environment,
 *  Tramplers, Enemies) are label-only. Renders nothing for an unmapped slug. Decorative:
 *  the section label text always sits beside it. */
const SECTION_ICONS: Record<string, IconType> = {
  tech: GiFamilyTree,
  builder: GiWrench,
  map: GiIsland,
  admin: GiDatabase,
};

export function SectionIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = SECTION_ICONS[slug];
  if (!Icon) return null;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
