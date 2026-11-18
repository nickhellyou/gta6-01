// Solmar Bay: Neon Tide — the program that hands the game in (Node 22,
// standard library only). It copies this repository's game/ and
// screenshots/ into the output directory and writes dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Run it locally the same way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the game with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(outDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), shotsDir, { recursive: true });
}

// Pre-flight: the dossier is refused outright when a screenshot is
// missing or over the 256 KiB cap, so fail here with a plain message
// instead of handing the scorer a broken entry.
const shotFiles = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => f.endsWith('.jpg')) : [];
if (shotFiles.length !== 4) {
  throw new Error(`expected 4 screenshots, found ${shotFiles.length}`);
}
for (const f of shotFiles) {
  const size = statSync(join(shotsDir, f)).size;
  if (size > 262144) throw new Error(`screenshot ${f} is ${size} bytes, over the 256 KiB cap`);
}

// The sealed scorer's caps (reference/gate.json): text_max_bytes is the
// only one that shapes the dossier's bytes; the others refuse an entry
// the scorer would refuse outright (more than 4 screenshots, one over
// 256 KiB, more than 993 files or 48 MiB under game/, or a game/ path
// over 1000 bytes).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier written: ${join(outDir, 'dossier.json')} (${dossier.length} bytes, ${shotFiles.length} screenshots)`);
