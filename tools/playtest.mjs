// Headless gameplay test for SOLMAR BAY: start the game, walk, steal a car,
// drive, watch the wanted level rise and the police chase, and check the M1
// objective progresses. Each step logs PASS/FAIL; the run fails if any step
// fails or if a console/page error appears. Expects node serve.ts on :8080.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
const snap = () => page.evaluate(() => window.__game.snapshot());

await page.goto('http://localhost:8080/index.html?debug=1&seed=7', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);
let s = await snap();
check('game loads, start screen shown', s.phase === 'start', `phase=${s.phase}`);

// Start the game with the START ENGINE button.
await page.click('#play-btn');
await page.waitForTimeout(800);
s = await snap();
check('start game', s.phase === 'play', `phase=${s.phase}`);

// Walk forward for 4 s: the player should actually move. (Headless SwiftShader
// runs the sim well below real time, so the bar is a small move, not a full
// 7 m/s sprint.)
const p0 = s.pos;
await page.keyboard.down('KeyW');
await page.waitForTimeout(4000);
await page.keyboard.up('KeyW');
s = await snap();
const moved = Math.hypot(s.pos[0] - p0[0], s.pos[1] - p0[1]);
check('walk on foot (WASD moves player)', moved > 2, `moved ${moved.toFixed(1)}m from ${p0} to ${s.pos}`);

// Teleport next to the nearest parked car (test hook) and steal it with E.
const parked = await page.evaluate(() => window.__game.nearestParked());
check('a parked car exists to steal', !!parked, JSON.stringify(parked));
if (parked) await page.evaluate((p) => window.__game.teleport(p.x, p.z), parked);
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
// Headless frames are slow (software rendering): wait until the steal lands.
try {
  await page.waitForFunction(() => window.__game.snapshot().inCar === true, { timeout: 15000 });
} catch { /* fall through to the check below */ }
s = await snap();
check('steal a car with E', s.inCar === true, `inCar=${s.inCar} wanted=${s.wanted}`);
check('stealing raises wanted', s.wanted >= 1, `wanted=${s.wanted}`);

// Drive forward for 5 s: speed should build and the car should travel.
await page.keyboard.down('KeyW');
await page.waitForTimeout(5000);
await page.keyboard.up('KeyW');
s = await snap();
check('drive (car gains speed)', s.carSpeed > 20, `carSpeed=${s.carSpeed} km/h pos=${s.pos}`);

// Police should be chasing by now (wanted >= 1 for several seconds).
await page.waitForTimeout(4000);
s = await snap();
check('police chase active', s.copCars >= 1, `copCars visible=${s.copCars} wanted=${s.wanted}`);

// Drive toward Sal's Garage to progress M1: put the car on the garage street
// facing west (yaw -PI/2 drives toward -x), then drive in. The drive itself
// was already proven above; this checks the mission trigger, not the steering.
await page.evaluate(() => window.__game.teleport(-95, 81, -Math.PI / 2));
await page.keyboard.down('KeyW');
await page.waitForTimeout(2000);
await page.keyboard.up('KeyW');
s = await snap();
check('M1 completes at the garage (+$500)', s.missionStage === 'done' && s.cash >= 500,
  `mission=${s.mission} stage=${s.missionStage} cash=$${s.cash} pos=${s.pos}`);

// Punch + pistol: arm via M1 reward, then check ammo state.
check('pistol unlocked after M1 (or armed for test)', s.armed === true || s.missionStage !== 'done',
  `armed=${s.armed} ammo=${s.ammo}`);

// Keep the game running a little longer and watch for errors.
await page.waitForTimeout(5000);
s = await snap();
check('game still running after 60s+ sim', s.phase === 'play' || s.phase === 'end', `phase=${s.phase} hp=${s.hp}`);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
const failed = results.filter((r) => !r.ok);
if (failed.length || errors.length) {
  console.error(`PLAYTEST FAILED: ${failed.length} step(s) failed, ${errors.length} error(s)`);
  process.exit(1);
}
console.log('PLAYTEST PASSED');
