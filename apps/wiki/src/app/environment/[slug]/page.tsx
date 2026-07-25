import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEnvEntityBySlug } from "@/lib/queries";
import { metaDescription } from "@/lib/site";
import { lootEntryView } from "@/lib/loot";
import { groupLootByTier, entityHref, type LinkRow } from "@/lib/entity-links";
import { categoryLabel } from "@/lib/taxonomy";
import { byRarityThenName } from "@/lib/rarity";
import { enemyStatCells } from "@/lib/enemy-view";
import { EntityDetail } from "@/components/EntityDetail";
import { CategoryTag } from "@/components/CategoryTag";
import { MapLink } from "@/components/MapLink";
import { LootTable } from "@/components/LootTable";
import { KeyLinksTable, type KeyLinkView } from "@/components/KeyLinksTable";
import { UsedInTable } from "@/components/UsedInTable";
import { type Tab } from "@/components/ItemTabs";
import { sessionIsAdmin } from "@/lib/auth";
import { AdminEntityControls } from "@/components/AdminEntityControls";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) return {};
  const description = metaDescription(
    entity.description,
    `${entity.name} — location, loot, and details in SAND: Raiders of Sophie.`,
  );
  const canonical = `/environment/${entity.slug}`;
  return {
    title: entity.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: entity.name,
      description,
      url: canonical,
      images: entity.icon ? [{ url: entity.icon }] : undefined,
    },
  };
}

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) notFound();

  const admin = await sessionIsAdmin();
  if (entity.disabled && !admin) notFound();

  const lootRows: LinkRow[] = entity.outgoingLinks.map((l) => ({
    targetSlug: l.target?.slug ?? null,
    targetKind: l.target?.kind ?? null,
    // Prefer the resolved item's real wiki name; fall back to the stored link
    // name only for unresolved (name-only) rows.
    name: l.target?.name ?? l.name,
    icon: l.target?.icon ?? null,
    rarity: l.target?.rarity ?? null,
    amount: l.amount,
    tier: l.tier,
    value1: l.value1,
    value2: l.value2,
    value3: l.value3,
    sortOrder: l.sortOrder,
  }));
  // Key-progression links (which key opens this location, which key it rewards).
  const keyView = (l: (typeof entity.keyLinks)[number]): KeyLinkView => ({
    href: l.target ? entityHref(l.target.kind, l.target.slug) : null,
    name: l.name,
    icon: l.target?.icon ?? null,
    rarity: l.target?.rarity ?? null,
    categorySlug: l.target?.category ?? null,
  });
  const requiresKeys = entity.keyLinks.filter((l) => l.role === "requires-key").map(keyView);
  const rewardsKeys = entity.keyLinks.filter((l) => l.role === "rewards-key").map(keyView);

  // Tab order: Craft, Keys, then one tab per loot tier (Normal / Rare / …). A location
  // with none of these simply has no tabs.
  const tierGroups = groupLootByTier(lootRows);
  const craftTabs: Tab[] = entity.craftedBy.length > 0
    ? [{
        id: "craft",
        label: "Craft",
        content: <UsedInTable recipes={entity.craftedBy} caption={`Items crafted at ${entity.name}`} />,
      }]
    : [];
  const keyTabs: Tab[] = requiresKeys.length > 0 || rewardsKeys.length > 0
    ? [{
        id: "keys",
        label: "Keys",
        content: <KeyLinksTable sections={[
          { label: "Required to open", rows: requiresKeys },
          { label: "Rewards", rows: rewardsKeys },
        ]} />,
      }]
    : [];
  const tabs: Tab[] = [
    ...craftTabs,
    ...keyTabs,
    ...tierGroups.map((g) => ({
      id: `loot-${g.tier || "all"}`,
      label: g.tier || "Loot",
      content: <LootTable entries={g.rows.map(lootEntryView).sort(byRarityThenName)} />,
    })),
  ];

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Environment", href: "/environment" },
        { label: categoryLabel(entity.category), href: `/environment?category=${entity.category}` },
        { label: entity.name },
      ]}
      icon={{ name: entity.name, icon: entity.icon, decorative: true, categorySlug: entity.category }}
      title={entity.name}
      badges={
        <>
          <CategoryTag slug={entity.category} />
          {entity.category === "landmarks" && <MapLink name={entity.name} />}
        </>
      }
      description={entity.description}
      // NPC entities (creatures / enemy-tramplers) carry enemyStats → show per-variant HP.
      stats={entity.enemyStats ? enemyStatCells(entity.enemyStats.variants) : undefined}
      disabled={entity.disabled}
      adminControls={
        admin ? (
          <AdminEntityControls slug={entity.slug} icon={entity.icon} imageAlt={entity.imageAlt} disabled={entity.disabled} />
        ) : undefined
      }
      tabs={tabs}
    />
  );
}
