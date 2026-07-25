import Link from "next/link";

/** "View on 3D map" link for landmark pages. Deep-links to /map#place=<name>; the map
 *  resolves the landmark name to its baked location (by label, then location key). Uses
 *  the map's info-blue accent so it reads as the same feature. */
export function MapLink({ name }: { name: string }) {
  return (
    <Link
      href={`/map#place=${encodeURIComponent(name)}`}
      className="inline-flex items-center gap-1.5 border border-info/60 bg-info/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-info transition-colors hover:bg-info/20"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
        <circle cx="12" cy="11" r="2" />
      </svg>
      View on 3D map
    </Link>
  );
}
