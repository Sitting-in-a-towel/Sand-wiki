import type { IconType } from "react-icons";
import {
  GiPistolGun, GiFieldGun, GiWoodPile , GiArmorVest, GiFirstAidKit,
  GiAmmoBox, GiCardboardBox, GiOpenChest, GiCastle, GiGamepad, GiPerson,
  GiTank, GiNuclearPlant, GiGears, GiHelmet, GiSteeringWheel,
  GiCargoCrate, GiCannon, GiAnvil, GiCog,
  GiDeathSkull, GiWalkingTurret,
} from "react-icons/gi";
import { BsTools } from "react-icons/bs";

/** Monochrome category glyph (replaces the old color dot). Decorative — the category
 *  label text always sits beside it, so meaning is never icon-only. */
const ICONS: Record<string, IconType> = {
  weapons: GiPistolGun,
  artillery: GiFieldGun,
  resources: GiWoodPile,
  attire: GiArmorVest,
  tools: BsTools,
  medical: GiFirstAidKit,
  ammo: GiAmmoBox,
  misc: GiCardboardBox,
  "loot-containers": GiOpenChest,
  landmarks: GiCastle,
  "game-modes": GiGamepad,
  npcs: GiPerson,
  // trampler categories
  chassis: GiTank,
  reactors: GiNuclearPlant,
  engines: GiGears,
  crew: GiHelmet,
  driving: GiSteeringWheel,
  cargo: GiCargoCrate,
  turrets: GiCannon,
  stations: GiAnvil,
  structure: GiCog,
  // enemy categories
  creatures: GiDeathSkull,
  "enemy-tramplers": GiWalkingTurret,
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? GiCardboardBox;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
