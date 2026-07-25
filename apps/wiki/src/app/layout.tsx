import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Oswald } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/SiteHeader";
import { ConditionalChrome } from "@/components/ConditionalChrome";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, SITE_NAME, siteJsonLd } from "@/lib/site";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const SITE_TITLE = "Sand Help — Unofficial SAND: Raiders of Sophie Wiki";
const SITE_DESCRIPTION = "A community, unofficial database for SAND: Raiders of Sophie.";

export const metadata: Metadata = {
  // metadataBase makes every relative canonical/OG URL resolve to an absolute URL.
  metadataBase: new URL(SITE_URL),
  // Per-page `generateMetadata` returns a bare title (e.g. "Laser Rifle"); the
  // template appends the brand. The home/default title is used where none is set.
  title: { default: SITE_TITLE, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

const DISCORD_URL = "https://discord.gg/sandgame";
const STEAM_URL =
  "https://store.steampowered.com/app/1431300/SAND_Raiders_of_Sophie/";
const SUPPORT_URL = "https://buymeacoffee.com/baalmarduk";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark-only: `.dark` drives the shadcn token layer; color-scheme is set in CSS.
  return (
    <html lang="en" className={`dark ${oswald.variable}`}>
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <JsonLd data={siteJsonLd()} />
        <ConditionalChrome
          header={<SiteHeader />}
          footer={
            <footer className="border-t border-border text-sm text-muted-foreground">
              <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 text-center">
                <nav
                  aria-label="Footer"
                  className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
                >
                  <Link href="/about" className="text-primary underline-offset-2 hover:underline">
                    About
                  </Link>
                  <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Discord ↗
                  </a>
                  <a
                    href={STEAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Get the game ↗
                  </a>
                  <a
                    href={SUPPORT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Buy me a coffee ☕
                  </a>
                </nav>

                <p className="text-xs leading-relaxed">
                  Unofficial fan site. Not affiliated with or endorsed by tinyBuild.
                  <br />
                  SAND: Raiders of Sophie is a trademark of its respective owners.
                </p>

                <p className="text-xs">© 2026 SAND HELP</p>
              </div>
            </footer>
          }
        >
          {children}
        </ConditionalChrome>
        <Analytics />
        {/* Cloudflare Web Analytics */}
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "6adb0f5c668c4f8a91c4ff95423d0ee7"}'
        />
      </body>
    </html>
  );
}
