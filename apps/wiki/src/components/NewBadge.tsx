"use client";
import { useEffect, useState } from "react";

// Auto-expiring "new" tag for a recently-added nav entry: shows until NEW_UNTIL, then
// renders nothing — no manual cleanup needed. Bump the date when flagging something new.
const NEW_UNTIL = new Date("2026-08-21T00:00:00Z").getTime(); // ~1 month after the 3D Map launch (2026-07-21)

/** Small primary "new" chip. Mount-gated so the server renders nothing and the client
 *  decides from the real clock — avoids a hydration mismatch if a page is statically cached. */
export function NewBadge() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(Date.now() < NEW_UNTIL), []);
  if (!show) return null;
  return (
    <span className="inline-flex items-center border border-primary bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#1a0f04]">
      new
    </span>
  );
}
