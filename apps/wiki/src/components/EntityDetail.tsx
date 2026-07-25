import { Breadcrumb, type Crumb } from "@/components/Breadcrumb";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/site";
import { StatGrid } from "@/components/StatGrid";
import { ItemTabs, type Tab } from "@/components/ItemTabs";
import { ItemDetailsPanel } from "@/components/ItemDetailsPanel";
import { DescriptionText } from "@/components/DescriptionText";
import { ItemIcon } from "@/components/ItemIcon";
import type { StatCell, DetailRow } from "@/lib/item-view";

export interface EntityIcon {
  name: string;
  icon: string | null;
  rarity?: string | null;
  decorative?: boolean;
  /** When `icon` is null, falls back to this category's glyph instead of the generic ▦. */
  categorySlug?: string | null;
}

export interface EntityDetailProps {
  breadcrumb: Crumb[];
  icon?: EntityIcon;
  title: string;
  badges?: React.ReactNode;
  description?: string | null;
  stats?: StatCell[];
  detailRows?: DetailRow[];
  tabs?: Tab[];
  /** Shown in the main column when there are no tabs (e.g. the item "no data" message). */
  tabsEmptyFallback?: React.ReactNode;
  /** Renders a "Disabled" badge near the title (admins only ever see disabled rows). */
  disabled?: boolean;
  /** Admin-only control strip (image edit + disable toggle), shown at the very bottom. */
  adminControls?: React.ReactNode;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </h2>
  );
}

/** Shared shell for item / trampler-part / environment-entity detail pages.
 *  Adaptive layout: a Details sidebar (and the wider max-width) appears only when
 *  `detailRows` are provided; otherwise a single centered column. */
export function EntityDetail({
  breadcrumb,
  icon,
  title,
  badges,
  description,
  stats,
  detailRows,
  tabs,
  tabsEmptyFallback,
  disabled,
  adminControls,
}: EntityDetailProps) {
  const hasDetails = !!detailRows && detailRows.length > 0;
  const hasSidebar = hasDetails;

  const main = tabs && tabs.length > 0 ? <ItemTabs tabs={tabs} /> : tabsEmptyFallback ?? null;
  const hasStats = !!stats && stats.length > 0;

  const statsBlock = hasStats ? (
    <section>
      <SectionTitle>Statistics</SectionTitle>
      <StatGrid cells={stats!} />
    </section>
  ) : null;

  return (
    <article className={`mx-auto space-y-6 py-6 ${hasSidebar ? "max-w-5xl" : "max-w-3xl"}`}>
      <JsonLd data={breadcrumbJsonLd(breadcrumb)} />
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb items={breadcrumb} />
      </div>

      <header className="flex flex-wrap items-start gap-5">
        {icon && (
          <ItemIcon
            name={icon.name}
            icon={icon.icon}
            size="lg"
            rarity={icon.rarity ?? undefined}
            decorative={icon.decorative ?? false}
            categorySlug={icon.categorySlug}
          />
        )}
        <div className="min-w-[16rem] flex-1 space-y-3">
          {(badges || disabled) && (
            <div className="flex flex-wrap items-center gap-2">
              {disabled && (
                <span className="border border-warning/60 bg-warning/10 px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-warning">
                  Disabled
                </span>
              )}
              {badges}
            </div>
          )}
          <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-[0.01em] sm:text-4xl">
            {title}
          </h1>
          {description && <DescriptionText text={description} />}
        </div>
      </header>

      {hasSidebar ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-6">
            {statsBlock}
            {main}
          </div>
          <aside>
            {hasDetails && <ItemDetailsPanel rows={detailRows!} />}
          </aside>
        </div>
      ) : (
        <div className="space-y-6">
          {statsBlock}
          {main !== null && <div className="min-w-0">{main}</div>}
        </div>
      )}

      {adminControls && (
        <div className="border border-border-strong bg-card-elevated p-4">{adminControls}</div>
      )}
    </article>
  );
}
