// SOLMAR BAY: Neon Tide — the gta6-01 entry program (Node 22, stdlib only).
// The game is plain static files under game/ (three.js vendored in
// game/vendor/three/, everything else our own source, no network at runtime).
// This program hands it in: it stages game/ and screenshots/ from beside this
// file into /output (or MAKEFUN_OUTPUT_DIR outside the grader) and writes
// /output/dossier.json with the vendored make.fun library, which is what the
// judge reads. It refuses to hand in an entry with fewer than 3 screenshots,
// because the gate needs at least that many and a silent short set would
// waste the submission.
//
// Run it locally the same way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game itself with `node serve.ts`, then http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shotsDir = join(here, 'screenshots');

// Fail loudly, before copying anything, if the screenshots are short: the
// gate needs 3 or 4, and a 0-to-2 set means the screenshot run never happened.
const shotFiles = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith('.'))
  : [];
if (shotFiles.length < 3) {
  throw new Error(
    `expected at least 3 screenshots in ${shotsDir}, found ${shotFiles.length} — run tools/shots.mjs first`,
  );
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// A second loud guard: refuse a dossier whose screenshots are all tiny,
// which would mean the screenshot run produced blank frames.
for (const name of shotFiles) {
  const { size } = statSync(join(shotsDir, name));
  if (size < 1024) throw new Error(`screenshot ${name} is only ${size} bytes — likely a blank frame`);
}

// The scorer's own caps (reference/gate.json): text_max_bytes is the only one
// that shapes the dossier's bytes; the rest refuse an entry the scorer would
// refuse anyway (more than 4 screenshots or one over 256 KiB; game/ over 993
// files or 48 MiB in all, or a path under game/ over 1000 bytes — game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
