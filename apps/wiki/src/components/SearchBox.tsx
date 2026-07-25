"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ItemIcon } from "@/components/ItemIcon";
import { rarityColor } from "@/lib/rarity";
import { categoryLabel } from "@/lib/taxonomy";
import { searchSuggestions, type SearchIndex, type Suggestions } from "@/lib/search";

const EMPTY: SearchIndex = { items: [], places: [] };

/** Bold the first case-insensitive occurrence of the query inside a label.
 *  The full label text is preserved so the option's accessible name is unchanged. */
function highlightMatch(label: string, query: string): React.ReactNode {
  if (!query) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return label;
  return (
    <>
      {label.slice(0, idx)}
      <b className="font-semibold text-primary">{label.slice(idx, idx + query.length)}</b>
      {label.slice(idx + query.length)}
    </>
  );
}

// Shared across all instances — fetch the index at most once per page load.
let indexPromise: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  if (!indexPromise) {
    indexPromise = fetch("/api/search-index")
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : EMPTY))
      .catch(() => EMPTY);
  }
  return indexPromise;
}

interface Flat { kind: "category" | "item" | "place"; slug: string; label: string; category: string; icon?: string | null; rarity?: string | null }
interface Group { header: string; options: Flat[] }

const placeGroup = (s: Suggestions, header: string, category: string): Group | null => {
  const rows = s.places.filter((p) => p.category === category);
  return rows.length
    ? { header, options: rows.map((p) => ({ kind: "place", slug: p.slug, label: p.name, category: p.category })) }
    : null;
};

/** Ordered dropdown groups, each included only when it has matches:
 *  Categories → Items → Loot Containers → Landmarks → Creatures → Enemy Tramplers.
 *  All place kinds (containers, landmarks, NPCs) live under /environment. */
function buildGroups(s: Suggestions): Group[] {
  const groups: (Group | null)[] = [];
  if (s.categories.length) {
    groups.push({ header: "Categories", options: s.categories.map((c) => ({ kind: "category", slug: c.slug, label: c.label, category: c.slug })) });
  }
  if (s.items.length) {
    groups.push({ header: "Items", options: s.items.map((i) => ({ kind: "item", slug: i.slug, label: i.name, category: i.category, icon: i.icon, rarity: i.rarity })) });
  }
  groups.push(placeGroup(s, "Loot Containers", "loot-containers"));
  groups.push(placeGroup(s, "Landmarks", "landmarks"));
  groups.push(placeGroup(s, "Creatures", "creatures"));
  groups.push(placeGroup(s, "Enemy Tramplers", "enemy-tramplers"));
  return groups.filter((g): g is Group => g !== null);
}

export function SearchBox({ variant }: { variant: "navbar" | "hero" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<SearchIndex>(EMPTY);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Hide the navbar search on the homepage (the hero search covers it there).
  if (variant === "navbar" && pathname === "/") return null;

  const suggestions = query.trim()
    ? searchSuggestions(query, index.items, index.places)
    : { categories: [], items: [], places: [] };
  const groups = buildGroups(suggestions);
  const options = groups.flatMap((g) => g.options);
  const showList = open && options.length > 0;

  function ensureIndex() {
    if (index.items.length === 0 && index.places.length === 0) loadIndex().then(setIndex);
  }

  function navigate(f: Flat) {
    setOpen(false);
    setActive(-1);
    setQuery("");
    if (f.kind === "category") router.push(`/items?category=${f.slug}`);
    else if (f.kind === "place") router.push(`/environment/${f.slug}`); // containers, landmarks, NPCs
    else router.push(`/items/${f.slug}`);
  }

  function submitFreeText() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/items?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && options[active]) navigate(options[active]);
      else submitFreeText();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const isHero = variant === "hero";
  const trimmed = query.trim();
  const showNoResults = open && trimmed.length > 0 && options.length === 0;

  // Build a flat list with stable global indices so aria-activedescendant IDs
  // can be computed without mutating a variable inside a render callback.
  const groupsWithBase = groups.map((g, gi) => ({
    ...g,
    base: groups.slice(0, gi).reduce((acc, prev) => acc + prev.options.length, 0),
  }));

  const inputCls = isHero
    ? "peer w-full border border-border-strong bg-background py-3 pl-10 pr-3 text-[15px] text-foreground placeholder:text-dim transition-[color,background-color,border-color] duration-200 ease-out hover:border-primary focus:border-primary focus:bg-card focus:outline-none"
    : "peer w-44 border border-border-strong bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-dim transition-[color,background-color,border-color] duration-200 ease-out hover:border-primary focus:border-primary focus:bg-card focus:outline-none sm:w-56";

  const panelCls = `absolute top-full z-30 mt-1.5 min-w-[18rem] border border-border-strong bg-card-elevated p-1.5 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.7)] ${
    isHero ? "left-0 w-full" : "right-0"
  }`;

  return (
    <div ref={boxRef} className={`relative ${isHero ? "mx-auto w-full max-w-md" : ""}`}>
      <input
        type="search"
        role="combobox"
        aria-label="Search items"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
        placeholder="Search items…"
        value={query}
        className={inputCls}
        onFocus={() => { ensureIndex(); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-dim transition-colors duration-200 ease-out peer-focus:text-primary ${
          isHero ? "left-3.5 text-lg" : "left-3 text-sm"
        }`}
      >
        ⌕
      </span>

      {showList && (
        <ul role="listbox" id={listId} className={panelCls}>
          {groupsWithBase.map((g) => (
            <Fragment key={g.header}>
              <li
                role="presentation"
                className="px-3 pb-1 pt-2 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {g.header}
              </li>
              {g.options.map((f, j) => {
                const i = g.base + j;
                // Right-column label: "Filter" for category suggestions, the item's
                // category for items. Places are already grouped by their category, so
                // repeating it would be redundant (and collide with the section header).
                const rightLabel =
                  f.kind === "category" ? "Filter" : f.kind === "item" ? categoryLabel(f.category) : "";
                return (
                  <li
                    key={`${f.kind}-${f.slug}`}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={active === i}
                    className={`grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      active === i ? "bg-card" : "hover:bg-card"
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); navigate(f); }}
                  >
                    {f.kind === "item" ? (
                      <span className="flex justify-center">
                        <ItemIcon name={f.label} icon={f.icon} rarity={f.rarity} categorySlug={f.category} size="sm" decorative />
                      </span>
                    ) : (
                      <span className="grid size-8 place-items-center border border-border bg-card text-muted-foreground">
                        <CategoryIcon slug={f.category} className="size-4 shrink-0" />
                      </span>
                    )}
                    <span className="truncate text-foreground" style={f.kind === "item" ? { color: rarityColor(f.rarity) ?? undefined } : undefined}>
                      {highlightMatch(f.label, trimmed)}
                    </span>
                    {rightLabel && (
                      <span className="font-mono text-[11px] uppercase tracking-[0.03em] text-muted-foreground" aria-hidden="true">
                        {rightLabel}
                      </span>
                    )}
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
      )}

      {showNoResults && (
        <div role="status" className={`${panelCls} px-5 py-5 text-center`}>
          <div className="font-display text-sm uppercase tracking-[0.04em] text-foreground">No matches</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Nothing matches “{trimmed}”. Check spelling or browse by category.
          </div>
        </div>
      )}
    </div>
  );
}
