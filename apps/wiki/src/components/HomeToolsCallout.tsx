import Link from "next/link";

// Per-card surface: a faint rust glow in the top-left corner over the standard
// card-elevated → card vertical fade. Mirrors the home hero's desert-glow idea,
// kept much subtler so it reads as a panel, not a second hero.
const cardBackground =
  "radial-gradient(120% 120% at 0% 0%, color-mix(in srgb, var(--secondary) 16%, transparent), transparent 55%), " +
  "linear-gradient(160deg, var(--card-elevated) 0%, var(--card) 100%)";

// Faint blueprint grid, masked to fade out toward the bottom-left so it sits
// behind the glyph in the top-right. Same line color/idea as the hero grid.
const cardGrid: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
  backgroundSize: "38px 38px",
  WebkitMaskImage: "radial-gradient(120% 90% at 85% 0%, #000, transparent 72%)",
  maskImage: "radial-gradient(120% 90% at 85% 0%, #000, transparent 72%)",
};

interface Tool {
  href: string;
  kicker: string;
  title: string;
  desc: string;
  cta: string;
  /** Tailwind text color class for the kicker dot, glyph stroke and CTA. */
  accent: string;
  /** Tailwind hover box-shadow class — a soft accent-tinted halo on lift. */
  halo: string;
  glyph: React.ReactNode;
  stats: { value: string; label: string }[];
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.href}
      className={`group relative flex flex-col overflow-hidden border border-border p-7 transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary ${tool.halo}`}
      style={{ background: cardBackground }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50" style={cardGrid} />
      <div aria-hidden className={`pointer-events-none absolute right-6 top-6 size-14 opacity-80 ${tool.accent}`}>
        {tool.glyph}
      </div>

      <span className={`relative flex items-center gap-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.2em] ${tool.accent}`}>
        <span className="inline-block size-1.5 bg-current" />
        {tool.kicker}
      </span>

      <h3 className="relative mt-auto pt-10 font-display text-[30px] font-bold uppercase leading-none tracking-[0.02em] text-foreground">
        {tool.title}
      </h3>
      <p className="relative mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-muted-foreground">{tool.desc}</p>

      <span className={`relative mt-5 inline-flex items-center gap-2 font-display text-[12px] font-semibold uppercase tracking-[0.16em] transition-[gap] duration-150 group-hover:gap-3.5 ${tool.accent}`}>
        {tool.cta}
        <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
      </span>

      <div className="relative mt-5 flex gap-5 border-t border-border pt-4">
        {tool.stats.map((s) => (
          <span key={s.label} className="font-mono text-[11px] text-muted-foreground">
            <b className="font-semibold text-foreground">{s.value}</b> {s.label}
          </span>
        ))}
      </div>
    </Link>
  );
}

export interface HomeToolsCalloutProps {
  techNodes: number;
  factions: number;
  tramplerParts: number;
}

/** Home-page "Plan your run" box: equal CTA panels for the interactive tools
 *  (tech tree, trampler builder, 3D map). Sits directly below the search hero.
 *  Stat strips use live counts where available; the map's are static descriptors. */
export function HomeToolsCallout({ techNodes, factions, tramplerParts }: HomeToolsCalloutProps) {
  const tools: Tool[] = [
    {
      href: "/tech",
      kicker: "Research",
      title: "Tech Tree",
      desc: "Explore every research node, trace prerequisites and unlocks, and track your progress across factions.",
      cta: "Open tech tree",
      accent: "text-primary",
      halo: "hover:shadow-[0_16px_44px_-20px_rgba(232,137,59,0.55)]",
      stats: [
        { value: String(techNodes), label: "nodes" },
        { value: String(factions), label: "factions" },
        { value: "Saved", label: "progress" },
      ],
      glyph: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-full">
          <circle cx="32" cy="10" r="5" />
          <circle cx="14" cy="40" r="5" />
          <circle cx="32" cy="40" r="5" />
          <circle cx="50" cy="40" r="5" />
          <circle cx="32" cy="56" r="4" />
          <path d="M32 15v9M32 24l-16 11M32 24l16 11M32 24v11M32 45v7" />
        </svg>
      ),
    },
    {
      href: "/builder",
      kicker: "Fabrication",
      title: "Trampler Builder",
      desc: "Assemble your trampler from datamined parts, weigh stats and energy, and preview the loadout before you commit.",
      cta: "Open builder",
      accent: "text-accent",
      halo: "hover:shadow-[0_16px_44px_-20px_rgba(201,162,75,0.5)]",
      stats: [
        { value: String(tramplerParts), label: "parts" },
        { value: "Live", label: "stats" },
        { value: "Loadout", label: "preview" },
      ],
      glyph: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-full">
          <rect x="18" y="20" width="28" height="18" />
          <path d="M18 29h28" />
          <circle cx="22" cy="48" r="6" />
          <circle cx="42" cy="48" r="6" />
          <path d="M28 48h8M24 20l4-8h8l4 8M50 24l6 4-6 4" />
        </svg>
      ),
    },
    {
      href: "/map",
      kicker: "Exploration",
      title: "3D Map",
      desc: "Fly through every island, fort and POI in 3D — filter objects by category and click any crate to jump to its loot.",
      cta: "Open the map",
      accent: "text-info",
      halo: "hover:shadow-[0_16px_44px_-20px_rgba(106,169,201,0.5)]",
      stats: [
        { value: "3D", label: "fly-around" },
        { value: "Loot", label: "on click" },
        { value: "All", label: "locations" },
      ],
      glyph: (
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-full">
          <path d="M12 18 24 13 40 19 52 14V46L40 51 24 45 12 50Z" />
          <path d="M24 13v32M40 19v32" />
          <circle cx="37" cy="29" r="4.5" />
          <path d="M37 33.5V40" />
        </svg>
      ),
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Interactive tools
          </span>
          <h2 className="mt-1 font-display text-[24px] font-bold uppercase tracking-[0.02em] text-foreground">
            Plan your run
          </h2>
        </div>
        <p className="max-w-sm text-[13px] text-muted-foreground sm:text-right">
          Go deeper than the database — chart the research path, bolt the machine together, then explore it all in 3D.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <ToolCard key={t.href} tool={t} />
        ))}
      </div>
    </section>
  );
}
