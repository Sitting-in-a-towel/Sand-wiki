"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "@/components/map/map.css";
import "@/components/builder/builder.css"; // reuse .bld-gate*/.bld-loading styles

// three.js can't server-render, so the viewer is loaded client-only.
const MapViewer = dynamic(() => import("@/components/map/MapViewer"), {
  ssr: false,
  loading: () => <div className="bld-loading">Loading 3D map…</div>,
});

// Below this width the fly-around 3D scene is impractical; show a gate instead.
const MIN_WIDTH = 1024;

export default function MapClient() {
  // `null` until measured on the client, so neither the gate nor the viewer
  // renders on the server / first paint based on a guessed width.
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => setWideEnough(window.innerWidth >= MIN_WIDTH);
    measure();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (wideEnough === null) {
    return <div className="bld-loading">Loading 3D map…</div>;
  }

  if (!wideEnough) {
    return (
      <div className="bld-gate">
        <div className="bld-gate-card">
          <span className="bld-gate-glyph" aria-hidden="true">
            ▦
          </span>
          <h1 className="bld-gate-title">Bigger screen needed</h1>
          <p className="bld-gate-text">
            The 3D Map is a fly-around WebGL scene that needs a desktop or
            laptop. Open it on a screen at least {MIN_WIDTH}px wide.
          </p>
          <div className="bld-gate-links">
            <Link
              href="/environment?category=landmarks"
              className="bld-gate-btn primary"
            >
              Browse Landmarks
            </Link>
            <Link href="/" className="bld-gate-btn ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <MapViewer />;
}
