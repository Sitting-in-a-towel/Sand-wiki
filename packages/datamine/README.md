# @sandlabs/datamine

Vendored SAND datamining pipeline (from SEK, `Sitting-in-a-towel/sand-expedition-kit`)
plus the wiki-specific transform (Plan 2). Regenerates `packages/data/generated/*.json`
for a new game build.

- `scripts/` — vendored SEK Python (extract → build → art), repointed to our paths.
  - `extract_enemy_stats.py` — enemy HP/name/type extractor (mob_* EPBs).
  - `build_enemies.py` — builds `sek-out/enemies.json` from enemy stats + loot sources + overrides.
  - `loot_resolve.py` — shared item-id→wiki-slug resolver (used by build_enemies).
- `sek-out/` — committed SEK-shape datasets (the transform's input).
  - `enemies.json` — committed enemy dataset (transform input).
- `extracted/`, `gamefiles/` — gitignored; populated by extraction on a machine with a
  game-files copy. NEVER mine the live install — copy `Sand_Data` + `GameAssembly.dll` here.
  - `json/enemy_stats.json` — gitignored intermediate (extract output from `extract_enemy_stats.py`).
- `transform/` — wiki-specific TS transform (Plan 2) that converts datamined datasets into wiki entity artifacts.
  - `enemies.ts` — merges enemy entities + loot links into the artifact.
  - `overrides/enemy-overrides.json` — enemy NPC definitions + item-slug aliases.
- See `UPDATE_PIPELINE.md` for the per-release run.
