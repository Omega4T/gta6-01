// Solara City v2 — make.fun gta6-01 entry program (Node 22, stdlib only).
// The game is plain static files under game/ (index.html and ES modules, no
// libraries, no network at runtime). This file is the handover step: it copies
// game/ and screenshots/ into the output directory and writes dossier.json
// there, using the vendored make.fun library. The dossier is the summary the
// judge reads, so the caps below match the scorer's own limits exactly: a run
// here refuses the same things a run there would refuse.
//
// Local check, standing in for the grader's /output:
//   MAKEFUN_OUTPUT_DIR=/tmp/out1 node main.ts
// Local play first with `node serve.ts`, then open http://localhost:8080.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
