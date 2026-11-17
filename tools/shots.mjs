// Headless screenshot runner for SOLMAR BAY. Loads each shot in shots.json,
// waits for window.__shotReady, and saves a 1280x720 JPEG into screenshots/
// under the name in shots.json. The dossier takes the images in name order,
// the first the cover, so the file names ARE the presentation order:
// 1-chase (mid-action police chase) first, then streets, mission, night.
// Prints any console or page errors so a broken render is caught early.
// Expects the game server (node serve.ts) already running on localhost:8080.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'screenshots');
const SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shots.json'), 'utf8'));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
fs.mkdirSync(OUT, { recursive: true });
for (const { name, query } of SHOTS) {
  const url = `http://localhost:8080/index.html${query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 90000 });
  } catch (e) {
    errors.push(`[timeout] __shotReady never set for ${name}`);
    continue;
  }
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
  console.log(`${name}: ${fs.statSync(file).size} bytes`);
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if (errors.length) process.exit(1);
