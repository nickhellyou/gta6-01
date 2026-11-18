// HUD: DOM overlay (health, cash, respect, wanted stars, weapon, objective,
// kill feed, radio chatter, damage vignette) and a live 2D minimap canvas.

import { WORLD, LANDMARKS } from './config.js';

function el(tag, id, parent, text = '') {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

const ROAD_LINES = [];
for (let v = -189; v <= 189; v += WORLD.roadGap) ROAD_LINES.push(v);

export function createHud() {
  const root = el('div', 'hud', document.body);
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:Arial,sans-serif;color:#fff;z-index:10';

  // top-left: health, cash, respect
  const stats = el('div', 'hud-stats', root);
  stats.style.cssText = 'position:absolute;top:14px;left:14px;text-shadow:0 1px 3px #000';
  el('div', 'hud-health-label', stats, 'HEALTH');
  const healthBar = el('div', 'hud-health-bar', stats);
  healthBar.style.cssText = 'width:180px;height:14px;background:#222;border:2px solid #fff3;margin-top:2px';
  const healthFill = el('div', 'hud-health-fill', healthBar);
  healthFill.style.cssText = 'height:100%;width:100%;background:#37c24a';
  const cashLine = el('div', 'hud-cash', stats, '$0');
  cashLine.style.cssText = 'margin-top:6px;font-size:20px;font-weight:bold';
  const respectLine = el('div', 'hud-respect', stats, 'Respect 0');
  respectLine.style.cssText = 'font-size:13px;opacity:.85';

  // top-right: wanted stars + clock
  const wantedBox = el('div', 'hud-wanted', root);
  wantedBox.style.cssText = 'position:absolute;top:14px;right:14px;text-align:right;text-shadow:0 1px 3px #000';
  const stars = el('div', 'hud-stars', wantedBox, '');
  stars.style.cssText = 'font-size:26px;letter-spacing:3px;color:#ffd23b';
  const clock = el('div', 'hud-clock', wantedBox, '10:00');
  clock.style.cssText = 'font-size:16px;margin-top:2px';

  // top-centre: mission objective
  const objective = el('div', 'hud-objective', root, '');
  objective.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);max-width:520px;text-align:center;font-size:15px;font-weight:bold;text-shadow:0 1px 3px #000;background:#0008;padding:6px 14px;border-radius:6px';

  // kill feed under the wanted stars
  const killfeed = el('div', 'hud-killfeed', root);
  killfeed.style.cssText = 'position:absolute;top:96px;right:14px;text-align:right;font-size:13px;text-shadow:0 1px 3px #000';

  // bottom-left: weapon + ammo
  const weapon = el('div', 'hud-weapon', root, 'Fists');
  weapon.style.cssText = 'position:absolute;bottom:16px;left:14px;font-size:18px;font-weight:bold;text-shadow:0 1px 3px #000';

  // bottom-right: minimap + speed
  const mapBox = el('div', 'hud-mapbox', root);
  mapBox.style.cssText = 'position:absolute;bottom:14px;right:14px;text-align:right';
  const minimap = el('canvas', 'hud-minimap', mapBox);
  minimap.width = 190;
  minimap.height = 190;
  minimap.style.cssText = 'border:2px solid #fff5;border-radius:8px;background:#0a0f1e';
  const speed = el('div', 'hud-speed', mapBox, '0 km/h');
  speed.style.cssText = 'font-size:20px;font-weight:bold;text-shadow:0 1px 3px #000;margin-top:4px';

  // centre flash message
  const flashEl = el('div', 'hud-flash', root, '');
  flashEl.style.cssText = 'position:absolute;top:34%;left:50%;transform:translate(-50%,-50%);font-size:26px;font-weight:bold;text-align:center;text-shadow:0 2px 6px #000;opacity:0;transition:opacity .3s;white-space:nowrap';

  // radio chatter (bottom centre)
  const radio = el('div', 'hud-radio', root, '');
  radio.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);font-size:13px;font-style:italic;color:#cfe8ff;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .4s';

  // damage vignette
  const vignette = el('div', 'hud-vignette', root);
  vignette.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(200,0,0,.55) 100%);opacity:0;pointer-events:none';

  // crosshair
  const cross = el('div', 'hud-crosshair', root, '+');
  cross.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:22px;font-weight:bold;color:#fff;text-shadow:0 0 4px #000;display:none';

  // full screens: start / pause / busted / wasted
  const screens = {};
  for (const name of ['start', 'pause', 'busted', 'wasted']) {
    const s = el('div', 'screen-' + name, document.body);
    s.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0f1ecc;color:#fff;font-family:Arial,sans-serif;z-index:20;text-align:center';
    s.style.display = 'none';
    screens[name] = s;
  }
  const start = screens.start;
  el('div', null, start, 'SOLMAR BAY').style.cssText = 'font-size:52px;font-weight:bold;letter-spacing:4px;color:#ffc233;text-shadow:0 3px 12px #000';
  el('div', null, start, 'NEON TIDE').style.cssText = 'font-size:26px;letter-spacing:10px;color:#22e6ff;margin-top:4px';
  el('div', null, start, 'An open-world crime game. Steal cars, dodge the cops, run three missions and own the harbor.').style.cssText = 'margin-top:18px;font-size:15px;max-width:520px;line-height:1.5';
  el('div', null, start, 'WASD move · Mouse look · Shift sprint · Space jump · E steal / exit car · F punch · Click shoot · R reload · Esc pause').style.cssText = 'margin-top:14px;font-size:13px;color:#cfe8ff';
  el('div', null, start, 'M1 First Wheels · M2 Pier Pressure · M3 Neon Tide').style.cssText = 'margin-top:8px;font-size:13px;color:#ffc233';
  el('div', null, start, '— Click to play —').style.cssText = 'margin-top:26px;font-size:18px;font-weight:bold;animation:none';
  const pause = screens.pause;
  el('div', null, pause, 'PAUSED').style.cssText = 'font-size:44px;font-weight:bold;letter-spacing:6px';
  el('div', null, pause, 'Click to keep playing').style.cssText = 'margin-top:12px;font-size:15px;color:#cfe8ff';
  const busted = screens.busted;
  el('div', null, busted, 'BUSTED').style.cssText = 'font-size:52px;font-weight:bold;letter-spacing:8px;color:#4da3ff';
  el('div', null, busted, 'The cops got you. The mission restarts — click to get back out there.').style.cssText = 'margin-top:12px;font-size:15px';
  const wasted = screens.wasted;
  el('div', null, wasted, 'WASTED').style.cssText = 'font-size:52px;font-weight:bold;letter-spacing:8px;color:#ff3b3b';
  el('div', null, wasted, 'Ken went down. The mission restarts — click to get back out there.').style.cssText = 'margin-top:12px;font-size:15px';

  const hud = {
    root, healthFill, cashLine, respectLine, stars, clock, objective,
    killfeed, weapon, minimap, speed, flashEl, radio, vignette, cross, screens,
    flashTimer: 0,
    radioTimer: 0,
    feedItems: [],
    quiet: false, // screenshot mode (?shot=N): no centre flash messages
    setObjective(text) {
      objective.textContent = text;
    },
    // big centre message that fades after a couple of seconds
    flash(text) {
      if (hud.quiet) return;
      flashEl.textContent = text;
      flashEl.style.opacity = 1;
      hud.flashTimer = 2.4;
    },
    addKillFeed(text) {
      hud.feedItems.push(text);
      if (hud.feedItems.length > 4) hud.feedItems.shift();
      killfeed.innerHTML = hud.feedItems.map((t) => `<div>${t}</div>`).join('');
    },
    // red edge flash when Ken takes damage (0..1 strength)
    damageFlash(strength) {
      vignette.style.opacity = Math.max(parseFloat(vignette.style.opacity || 0), strength);
    },
    showScreen(name) {
      for (const k of Object.keys(screens)) screens[k].style.display = k === name ? 'flex' : 'none';
      root.style.display = name ? 'none' : 'block';
    },
    hideScreens() {
      for (const k of Object.keys(screens)) screens[k].style.display = 'none';
      root.style.display = 'block';
    },
  };
  return hud;
}

function fmtHour(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// draw the live minimap: roads, sea, pier, landmarks, mission target,
// player arrow, cars, police and peds
function drawMinimap(hud, state) {
  const c = hud.minimap.getContext('2d');
  const W = hud.minimap.width;
  const S = W / 440; // world -220..220 maps to the canvas
  const toX = (x) => (x + 220) * S;
  const toY = (z) => (z + 220) * S;
  c.clearRect(0, 0, W, W);
  c.fillStyle = '#0a0f1e';
  c.fillRect(0, 0, W, W);
  // sea strip at the bottom (south)
  c.fillStyle = '#1e6f8e';
  c.fillRect(0, toY(210), W, W - toY(210));
  // roads
  c.strokeStyle = '#3a3f4a';
  c.lineWidth = 4;
  for (const v of ROAD_LINES) {
    c.beginPath(); c.moveTo(toX(v), 0); c.lineTo(toX(v), W); c.stroke();
    c.beginPath(); c.moveTo(0, toY(v)); c.lineTo(W, toY(v)); c.stroke();
  }
  // pier
  c.fillStyle = '#8a6f4d';
  c.fillRect(toX(WORLD.pierX - 15), toY(210), 30 * S, (WORLD.pierZ - 210) * S);
  // landmarks
  const lm = (x, z, color) => {
    c.fillStyle = color;
    c.beginPath(); c.arc(toX(x), toY(z), 3.5, 0, Math.PI * 2); c.fill();
  };
  lm(LANDMARKS.salsGarage.x, LANDMARKS.salsGarage.z, '#ffc233');
  lm(LANDMARKS.hospital.x, LANDMARKS.hospital.z, '#7dff9a');
  lm(LANDMARKS.neonRow.x, LANDMARKS.neonRow.z, '#ff2e88');
  lm(LANDMARKS.crownTower.x, LANDMARKS.crownTower.z, '#22e6ff');
  // mission target (pulsing gold star)
  if (state.missions.target) {
    const t = state.missions.target;
    const r = 5 + Math.sin(performance.now() * 0.005) * 2;
    c.fillStyle = '#ffc233';
    c.beginPath(); c.arc(toX(t.x), toY(t.z), r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(toX(t.x), toY(t.z), r + 3, 0, Math.PI * 2); c.stroke();
  }
  // traffic + parked cars
  for (const car of state.cars) {
    if (car.kind === 'police') continue;
    c.fillStyle = car.kind === 'player' ? '#ffffff' : '#9aa3b2';
    c.fillRect(toX(car.pos.x) - 1.5, toY(car.pos.z) - 1.5, 3, 3);
  }
  // police cars flash blue/red
  const flashBlue = Math.floor(performance.now() / 300) % 2 === 0;
  for (const car of state.police.cars) {
    c.fillStyle = flashBlue ? '#2266ff' : '#ff2222';
    c.beginPath(); c.arc(toX(car.pos.x), toY(car.pos.z), 3.5, 0, Math.PI * 2); c.fill();
  }
  // player arrow
  const p = state.player;
  c.save();
  c.translate(toX(p.pos.x), toY(p.pos.z));
  c.rotate(p.onFoot ? p.heading : (p.car ? p.car.heading : 0));
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath();
  c.fill();
  c.restore();
}

export function updateHud(hud, state, dt) {
  const p = state.player;
  const hp = Math.max(0, p.health);
  hud.healthFill.style.width = hp + '%';
  hud.healthFill.style.background = hp > 50 ? '#37c24a' : hp > 25 ? '#e8b93b' : '#e02020';
  hud.cashLine.textContent = '$' + state.cash.toLocaleString('en-US');
  hud.respectLine.textContent = 'Respect ' + state.respect;
  hud.stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  hud.clock.textContent = fmtHour(state.hour);
  hud.weapon.textContent = state.weapon === 'pistol' ? `Pistol · ${state.ammo} / 12` : 'Fists (F to punch)';
  hud.cross.style.display = state.weapon === 'pistol' ? 'block' : 'none';
  hud.speed.textContent = Math.round(p.speed) + ' km/h';
  if (hud.flashTimer > 0) {
    hud.flashTimer -= dt;
    if (hud.flashTimer <= 0) hud.flashEl.style.opacity = 0;
  }
  if (hud.radioTimer > 0) {
    hud.radioTimer -= dt;
    if (hud.radioTimer <= 0) hud.radio.style.opacity = 0;
  }
  const v = parseFloat(hud.vignette.style.opacity || 0);
  if (v > 0) hud.vignette.style.opacity = Math.max(0, v - dt * 1.4);
  drawMinimap(hud, state);
}

// radio chatter line (bottom centre, fades on its own)
export function radioChatter(hud, text) {
  hud.radio.textContent = text;
  hud.radio.style.opacity = 1;
  hud.radioTimer = 4;
}
