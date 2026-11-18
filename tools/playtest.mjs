// Solmar Bay playtest: drives the real game in headless Chromium with
// real keyboard input and checks 10 steps end to end. Run it with:
//   node tools/playtest.mjs
// It serves game/ itself, so no separate server is needed.
// Exits 0 when every step passes, 1 otherwise.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '..');
const gameDir = join(repoRoot, 'game');

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

const PORT = 18081;
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

const results = [];
function step(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// read the live game state (plain JSON-safe snapshot)
async function getState(page) {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const p = g.player;
    const cars = g.cars.map((c) => ({ kind: c.kind, x: c.pos.x, z: c.pos.z, speed: c.speed || 0 }));
    const police = g.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z }));
    return {
      started: g.flags.started,
      paused: g.flags.paused,
      busted: g.flags.busted,
      wasted: g.flags.wasted,
      px: p.pos.x,
      pz: p.pos.z,
      onFoot: p.onFoot,
      heading: p.heading,
      camYaw: p.camYaw,
      speed: p.speed,
      health: p.health,
      cash: g.cash,
      wanted: g.wanted,
      weapon: g.weapon,
      ammo: g.ammo,
      missionIndex: g.missions.index,
      missionStage: g.missions.stage,
      cars,
      police,
      hour: g.hour,
    };
  });
}

// face a target by setting the camera yaw (the mouse does the same thing)
async function faceTarget(page, tx, tz) {
  await page.evaluate(([tx, tz]) => {
    const g = window.__game;
    const dx = tx - g.player.pos.x;
    const dz = tz - g.player.pos.z;
    const bearing = Math.atan2(dx, dz);
    g.player.camYaw = bearing + Math.PI;
  }, [tx, tz]);
}

// walk toward a point with real W input until close or the timeout hits
async function walkTo(page, tx, tz, timeoutMs = 20000) {
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < timeoutMs) {
      const s = await getState(page);
      if (!s) return false;
      const d = Math.hypot(tx - s.px, tz - s.pz);
      if (d < 2.5) return true;
      await faceTarget(page, tx, tz);
      await sleep(120);
    }
    return false;
  } finally {
    await page.keyboard.up('KeyW');
  }
}

// drive toward a point with real W + A/D steering until close or timeout
async function driveTo(page, tx, tz, timeoutMs = 45000) {
  const t0 = Date.now();
  let lastDist = Infinity;
  let stuckSince = 0;
  let reversingUntil = 0;
  try {
    while (Date.now() - t0 < timeoutMs) {
      const s = await getState(page);
      if (!s) return false;
      const d = Math.hypot(tx - s.px, tz - s.pz);
      if (d < 9) return true;
      const car = s.cars.find((c) => c.kind === 'player');
      if (!car) return false;
      const bearing = Math.atan2(tx - s.px, tz - s.pz);
      const heading = Math.atan2(Math.sin(car.heading ?? 0), Math.cos(car.heading ?? 0));
      // heading of the player car is stored on the car object; read it via the game
      const carHeading = await page.evaluate(() => window.__game.player.car?.heading ?? 0);
      let err = bearing - carHeading;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const now = Date.now();
      if (now < reversingUntil) {
        await page.keyboard.down('KeyS');
        await page.keyboard.up('KeyW');
        await page.keyboard.up('KeyA');
        await page.keyboard.up('KeyD');
      } else {
        await page.keyboard.down('KeyW');
        await page.keyboard.up('KeyS');
        if (err > 0.25) {
          await page.keyboard.down('KeyA');
          await page.keyboard.up('KeyD');
        } else if (err < -0.25) {
          await page.keyboard.down('KeyD');
          await page.keyboard.up('KeyA');
        } else {
          await page.keyboard.up('KeyA');
          await page.keyboard.up('KeyD');
        }
      }
      // stuck detection: barely moving for 2s means reverse out
      if (Math.abs(s.speed) < 1 && d > lastDist - 0.5) {
        if (!stuckSince) stuckSince = now;
        if (now - stuckSince > 2000) {
          reversingUntil = now + 1200;
          stuckSince = 0;
        }
      } else {
        stuckSince = 0;
      }
      lastDist = d;
      await sleep(120);
    }
    return false;
  } finally {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyS');
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyD');
  }
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  try {
    await page.goto(`http://localhost:${PORT}/?lowfx=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gameReady === true, { timeout: 15000 });

    // 1. load + start: the start screen shows, clicking starts the game
    const startVisible = await page.evaluate(() => {
      return document.getElementById('screen-start').style.display !== 'none';
    });
    step('1. load + start screen', startVisible);
    await page.mouse.click(400, 225);
    await sleep(800);
    let s = await getState(page);
    step('1b. game started', !!s?.started, s ? '' : 'state null');

    // 2. walk >= 5 m with real W input (poll until moved, up to 30 s)
    const x0 = s.px;
    const z0 = s.pz;
    await page.keyboard.down('KeyW');
    let walked = 0;
    const walkT0 = Date.now();
    while (Date.now() - walkT0 < 30000) {
      await sleep(300);
      s = await getState(page);
      if (!s) break;
      walked = Math.hypot(s.px - x0, s.pz - z0);
      if (walked >= 5) break;
    }
    await page.keyboard.up('KeyW');
    step('2. walk >= 5 m', walked >= 5, `${walked.toFixed(1)} m`);

    // 3. find the nearest parked car and walk to it
    const nearest = await page.evaluate(() => {
      const g = window.__game;
      let best = null;
      let bestD = Infinity;
      for (const c of g.cars) {
        if (c.kind !== 'parked') continue;
        const d = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z);
        if (d < bestD) {
          bestD = d;
          best = { x: c.pos.x, z: c.pos.z, d };
        }
      }
      return best;
    });
    step('3. a parked car exists nearby', !!nearest && nearest.d < 120, nearest ? `${nearest.d.toFixed(1)} m away` : 'none');
    const reached = nearest ? await walkTo(page, nearest.x, nearest.z, 60000) : false;
    step('3b. walked to the parked car', reached);

    // 4. steal it with E — wanted goes to 1
    await page.keyboard.press('KeyE');
    await sleep(600);
    s = await getState(page);
    step('4. steal car with E (wanted 1)', !s.onFoot && s.wanted >= 1, `onFoot=${s.onFoot} wanted=${s.wanted}`);

    // 5. drive >= 50 km/h
    await page.keyboard.down('KeyW');
    let topSpeed = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      s = await getState(page);
      if (!s) break;
      topSpeed = Math.max(topSpeed, s.speed);
      if (topSpeed >= 50) break;
    }
    await page.keyboard.up('KeyW');
    step('5. drive >= 50 km/h', topSpeed >= 50, `top ${topSpeed.toFixed(0)} km/h`);

    // 6. police chase is active: a police car exists and closes in
    await sleep(4000);
    s = await getState(page);
    const pd0 = s.police.length ? Math.min(...s.police.map((c) => Math.hypot(c.x - s.px, c.z - s.pz))) : Infinity;
    await sleep(3000);
    s = await getState(page);
    const pd1 = s.police.length ? Math.min(...s.police.map((c) => Math.hypot(c.x - s.px, c.z - s.pz))) : Infinity;
    step('6. police chase active', s.police.length > 0 && pd1 < pd0 + 5, `${s.police.length} police cars, dist ${pd0.toFixed(0)} -> ${pd1.toFixed(0)} m`);

    // 7. M1: drive south on the x=21 road to the garage block (42, 126);
    // arriving on the road beside it (21, 126) is inside the 24 m trigger
    const cashBefore = s.cash;
    const missionBefore = s.missionIndex;
    const arrived = await driveTo(page, 21, 126, 120000);
    await sleep(1000);
    s = await getState(page);
    step('7. M1 complete at the garage (+$500)', arrived && s.missionIndex > missionBefore && s.cash >= cashBefore + 500, `mission ${missionBefore} -> ${s.missionIndex}, cash $${cashBefore} -> $${s.cash}`);

    // 8. pistol unlocked with ammo
    step('8. pistol unlocked (ammo > 0)', s.weapon === 'pistol' && s.ammo > 0, `${s.weapon}, ammo ${s.ammo}`);

    // 9. the game is still running with no errors
    step('9. game still running, 0 errors', !!s && !s.busted && !s.wasted && errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

    // 10. Ken is alive
    step('10. HP > 0', s.health > 0, `HP ${s.health.toFixed(0)}`);
  } catch (e) {
    step('playtest crashed', false, e.message);
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
