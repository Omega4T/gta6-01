// Solara City v2.1 — the make.fun gta6-01 entry program, Node 22, stdlib only.
//
// The game itself is plain static files under game/: index.html plus ES
// modules, no libraries, no network at runtime. This file is the handover
// step between the repository and the grader: it copies game/ and
// screenshots/ into the output directory and writes dossier.json there,
// using the vendored make.fun library. The dossier is the summary the judge
// reads, so the caps below match the scorer's own limits exactly — a run
// here refuses the same things a run there would refuse.
//
// Local check, standing in for the grader's /output:
//   MAKEFUN_OUTPUT_DIR=/tmp/out1 node main.ts
// To play locally first, run `node serve.ts` and open http://localhost:8080.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

copyTree(join(rootDir, 'game'), join(outputDir, 'game'));

const shotsDir = join(rootDir, 'screenshots');
if (existsSync(shotsDir)) {
  copyTree(shotsDir, join(outputDir, 'screenshots'));
} else {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
}

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
