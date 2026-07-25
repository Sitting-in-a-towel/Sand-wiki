import type { Entity } from "@sandlabs/data";

export interface MissingImage {
  slug: string;
  name: string;
  kind: string;
  category: string;
  icon: string | null;
  issue: "null" | "file-missing";
}

export interface ImageReport {
  _doc: string;
  summary: Record<string, number>;
  needsExtraction: MissingImage[];
  byDesign: { techNodeNoIcon: number; environmentNoIcon: number };
}

const DOC =
  "Entities whose icon is absent (null) or points at a file that does not exist on disk — " +
  "TODO for the next datamining/extraction pass. By kind: " +
  "items -> extract_icons.py must emit /icons/<sprite> (a 'file-missing' means the data " +
  "references a sprite filename that was never produced; check the icon mapping/filename). " +
  "trampler-part -> render_part_thumbs.py / export_part_meshes_v3.py (/tramplers). " +
  "By design (reported under byDesign, NOT needsExtraction): tech-node entities have no own " +
  "icon (the /tech page renders the unlock's glyph); environment locations (landmarks/game-" +
  "modes) have NO icon in the game files at all, so they are never extractable (loot " +
  "containers, which do have art, are unaffected). NPC entities (Upior/Ironclad, kind " +
  "environment/creatures|enemy-tramplers) likewise have no in-game item sprite and ship iconless.";

/** Classify entity images using an injected file-existence check (so it is pure/testable).
 *  `fileExists` receives the entity's `icon` value (e.g. "/icons/x.png"). Entities that have
 *  no extractable icon source — tech-nodes (render the unlock glyph) and environment locations
 *  (no icon exists in the game files) — are counted under `byDesign`, not needsExtraction. */
export function classifyImages(
  entities: Entity[],
  fileExists: (icon: string) => boolean,
): ImageReport {
  const needsExtraction: MissingImage[] = [];
  const summary: Record<string, number> = {};
  let techNodeNoIcon = 0;
  let environmentNoIcon = 0;

  const bump = (key: string) => { summary[key] = (summary[key] ?? 0) + 1; };

  for (const e of entities) {
    if (!e.icon) {
      if (e.kind === "tech-node") { techNodeNoIcon++; continue; }
      if (e.kind === "environment") { environmentNoIcon++; continue; } // locations + NPCs have no game-file icon
      bump(`${e.kind}:null`);
      needsExtraction.push({ slug: e.slug, name: e.name, kind: e.kind, category: e.category, icon: null, issue: "null" });
    } else if (!fileExists(e.icon)) {
      bump(`${e.kind}:file-missing`);
      needsExtraction.push({ slug: e.slug, name: e.name, kind: e.kind, category: e.category, icon: e.icon, issue: "file-missing" });
    }
  }

  needsExtraction.sort((a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug));
  return { _doc: DOC, summary, needsExtraction, byDesign: { techNodeNoIcon, environmentNoIcon } };
}
