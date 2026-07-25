import { itemCategoryCounts, envCategoryCounts, tramplerCategoryCounts, recipeCount } from "@/lib/queries";
import { StatGrid } from "@/components/StatGrid";
import { SectionBanner } from "@/components/SectionBanner";

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export const metadata = {
  title: "About",
  description: "About Sand Help — an unofficial, community database for SAND: Raiders of Sophie.",
};

export default async function AboutPage() {
  const [itemCounts, envCounts, tramplerCounts, recipes] = await Promise.all([
    itemCategoryCounts(),
    envCategoryCounts(),
    tramplerCategoryCounts(),
    recipeCount(),
  ]);

  const stats = [
    { label: "Items", value: sum(itemCounts) },
    { label: "Trampler parts", value: sum(tramplerCounts) },
    { label: "Environments", value: sum(envCounts) },
    { label: "Recipes", value: recipes },
  ];

  return (
    <div className="pb-2">
      <SectionBanner
        eyebrow="About"
        title="A wiki for the wastes"
        tagline="A community-maintained reference for SAND: Raiders of Sophie — kept current by players."
        art="cargo-port"
        focal="center 42%"
      />

      <section className="mx-auto w-full max-w-5xl space-y-8">
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Every item, trampler part, environment and recipe, kept current by players. This is an{" "}
          <strong className="text-foreground">unofficial</strong> site,{" "}
          <strong className="text-foreground">not affiliated with or endorsed by tinyBuild</strong> or
          the game&apos;s developers.
        </p>

        <StatGrid cells={stats} />

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Data &amp; license
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Some in-game assets, such as item icons, are used for identification only — we claim no
              ownership of them, and all rights remain with tinyBuild and the game&apos;s developers.
              Items and recipes are extracted from a playtest build; display names are derived from
              internal identifiers, so they may differ from the in-game wording.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Credits &amp; thanks
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The interactive tools were built by the community:{" "}
              <strong className="text-foreground">Sadpanda</strong> for the Trampler Builder, and{" "}
              <strong className="text-foreground">DownloadPizza</strong> for the 3D Map. Thank you.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
