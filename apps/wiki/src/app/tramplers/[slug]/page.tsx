import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTramplerPartBySlug, getUnlockingNode } from "@/lib/queries";
import { metaDescription } from "@/lib/site";
import { categoryLabel } from "@/lib/taxonomy";
import { tramplerStatCells, tramplerDetailRows } from "@/lib/trampler-view";
import { EntityDetail } from "@/components/EntityDetail";
import { actionButtonClass } from "@/components/ui/button";
import { CategoryTag } from "@/components/CategoryTag";
import { ItemIconLink } from "@/components/ItemIconLink";
import { type Tab } from "@/components/ItemTabs";
import { sessionIsAdmin } from "@/lib/auth";
import { AdminEntityControls } from "@/components/AdminEntityControls";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const part = await getTramplerPartBySlug(slug);
  if (!part) return {};
  const description = metaDescription(
    part.description,
    `${part.name} — Trampler part stats and build cost in SAND: Raiders of Sophie.`,
  );
  const canonical = `/tramplers/${part.slug}`;
  return {
    title: part.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: part.name,
      description,
      url: canonical,
      images: part.icon ? [{ url: part.icon }] : undefined,
    },
  };
}

export default async function TramplerPartPage({ params }: { params: Params }) {
  const { slug } = await params;
  const part = await getTramplerPartBySlug(slug);
  if (!part) notFound();

  const admin = await sessionIsAdmin();
  if (part.disabled && !admin) notFound();

  const techNode = await getUnlockingNode(slug);

  const cost = part.outgoingLinks;
  const stats = part.tramplerStats ?? {
    dimensions: null, health: null, weight: null, weightCapacity: null, weightCompensation: null,
    energyConsumption: null, energyCapacity: null, ratedPower: null, crewSlots: null, itemSlots: null,
    researchNode: null, researchName: null, researchTier: null,
  };

  const tabs: Tab[] = [];
  if (cost.length > 0) {
    tabs.push({
      id: "build-cost",
      label: "Build Cost",
      content: (
        <div className="flex flex-wrap gap-4">
          {cost.map((c) => (
            <ItemIconLink
              key={c.id}
              slug={c.target?.slug ?? undefined}
              name={c.name}
              icon={c.target?.icon ?? null}
              amount={c.amount ?? undefined}
              rarity={c.target?.rarity ?? null}
            />
          ))}
        </div>
      ),
    });
  }

  return (
    <EntityDetail
      breadcrumb={[
        { label: "Tramplers", href: "/tramplers" },
        { label: categoryLabel(part.category), href: `/tramplers?category=${part.category}` },
        { label: part.name },
      ]}
      icon={{ name: part.name, icon: part.icon, decorative: true }}
      title={part.name}
      badges={
        <>
          <CategoryTag slug={part.category} />
          {techNode && (
            <Link href={`/tech?select=${techNode.slug}`} className={actionButtonClass}>
              Show in tech tree
            </Link>
          )}
        </>
      }
      description={part.description}
      stats={tramplerStatCells(stats)}
      detailRows={tramplerDetailRows(stats)}
      disabled={part.disabled}
      adminControls={
        admin ? (
          <AdminEntityControls slug={part.slug} icon={part.icon} imageAlt={part.imageAlt} disabled={part.disabled} />
        ) : undefined
      }
      tabs={tabs}
    />
  );
}
