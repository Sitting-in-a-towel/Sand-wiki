"use client";
import { usePathname } from "next/navigation";

export function ConditionalChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const fullBleed =
    pathname === "/tech" ||
    pathname.startsWith("/tech/") ||
    pathname === "/builder" ||
    pathname.startsWith("/builder/") ||
    pathname === "/gallery" ||
    pathname.startsWith("/gallery/") ||
    pathname === "/map" ||
    pathname.startsWith("/map/");
  if (fullBleed) return <>{children}</>;
  return (
    <>
      {header}
      <main className="max-w-6xl mx-auto w-full p-4 flex-1">{children}</main>
      {footer}
    </>
  );
}
