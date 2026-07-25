"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import { SectionIcon } from "@/components/SectionIcon";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SECTIONS } from "@/lib/taxonomy";

// Browse = real data sections; Tools = the standalone tool/link pages (Tech Tree,
// Builder, Gallery) plus the Data hub (`tools` kind — links to its hub page here;
// its sub-pages are one tap away on the hub).
const BROWSE = SECTIONS.filter((s) => s.kind === "data");
const TOOLS = SECTIONS.filter((s) => s.kind === "link" || s.kind === "tools");

const groupLabelCls =
  "px-2 pb-1 pt-4 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function itemCls(active: boolean) {
  return [
    "rounded px-2 py-2 text-sm font-semibold transition-colors",
    active
      ? "bg-card-elevated text-primary"
      : "text-foreground hover:bg-card-elevated hover:text-primary",
  ].join(" ");
}

export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderLink = (slug: string, label: string, href: string) => (
    <Link
      key={slug}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={`flex items-center gap-2.5 ${itemCls(isActive(href))}`}
    >
      <SectionIcon slug={slug} className="size-4 shrink-0" />
      {label}
    </Link>
  );

  return (
    <Sheet>
      <SheetTrigger asChild className="nav:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col border-border bg-card">
        <SheetTitle asChild>
          <Link
            href="/"
            className="group px-2 font-display text-xl font-bold tracking-wide text-foreground"
          >
            SAND
            <span aria-hidden="true" className="mx-0.5 text-primary">
              ·
            </span>
            HELP
          </Link>
        </SheetTitle>

        <nav aria-label="Mobile" className="mt-2 flex-1 overflow-y-auto px-2">
          <div className={groupLabelCls}>Browse</div>
          {BROWSE.map((s) => renderLink(s.slug, s.label, s.href ?? `/${s.slug}`))}

          <div className={groupLabelCls}>Tools</div>
          {TOOLS.map((s) => renderLink(s.slug, s.label, s.href ?? `/${s.slug}`))}

          <div className={groupLabelCls}>More</div>
          {renderLink("about", "About", "/about")}
        </nav>

        <div className="px-4 pb-2">
          <SearchBox variant="navbar" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
