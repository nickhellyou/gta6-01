// Solmar Bay screenshot tool: loads the game in headless Chromium, stages
// each of the 4 shots (?shot=1..4) and saves a real render of the game as
// a JPEG (1280x720, quality 82, kept under the 256 KiB cap). Run it with:
//   node tools/shots.mjs
// It serves game/ itself, so no separate server is needed.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..');
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const PORT = 18082;
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    const file = normalize(join(gameDir, rel));
    if (!file.startsWith(gameDir)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SHOTS = [
  { n: 1, name: '1-chase.jpg', wait: 6000, note: 'cover: stolen car + police chase + wanted stars + HUD/minimap' },
  { n: 2, name: '2-streets.jpg', wait: 2500, note: 'on foot on Palmera Boulevard, traffic, palms, city signs' },
  { n: 3, name: '3-mission.jpg', wait: 4500, note: 'shootout on the pier, objective beacon, sea' },
  { n: 4, name: '4-night.jpg', wait: 6000, note: 'night chase, headlights, neon' },
];

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  await mkdir(shotsDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(`http://localhost:${PORT}/?shot=${shot.n}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__gameReady === true, { timeout: 15000 });
      await page.mouse.click(640, 360);
      await sleep(shot.wait);
      const file = join(shotsDir, shot.name);
      await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
      const stat = await readFile(file).then((b) => b.length).catch(() => 0);
      const ok = stat > 0 && stat <= 262144 && errors.length === 0;
      results.push({ ...shot, bytes: stat, errors, ok });
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${shot.name} — ${(stat / 1024).toFixed(0)} KiB — ${shot.note}${errors.length ? ' — ERRORS: ' + errors.slice(0, 2).join(' | ') : ''}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} screenshots taken`);
  if (failed.length) process.exit(1);
}

main();
