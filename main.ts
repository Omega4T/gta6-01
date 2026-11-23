// Solara City — make.fun gta6-01 entry program (Node 22, standard library only).
// The game itself is plain static files under game/ (index.html plus ES modules,
// no libraries, no network at runtime). This program is the handover: it copies
// game/ and screenshots/ from the directory this file sits in to the output
// directory and writes dossier.json there with the vendored make.fun library,
// which is the summary the judge reads.
//
// Play it locally first with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the scorer's own limits, so a local run refuses exactly
// what the scorer would refuse: at most 4 screenshots, each at most 256 KiB;
// at most 993 files in game/ totalling at most 48 MiB; no game path over 1000
// bytes. Only text_max_bytes changes the dossier's bytes; the rest are guards.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
