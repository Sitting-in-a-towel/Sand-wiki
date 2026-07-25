import MapClient from "./MapClient";
// Imported at the page level (not only via the dynamically-loaded MapViewer) so the
// viewer chrome styling is present on first paint, before the ssr:false viewer hydrates.
import "@/components/map/map.css";

export const metadata = {
  title: "3D Location Map",
  description:
    "Fly-around 3D viewer of SAND's locations — every placeable object, tinted by category, clickable for loot.",
};

export default function MapPage() {
  return <MapClient />;
}
