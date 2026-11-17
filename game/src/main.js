// main.js — boot and the one loop for SOLMAR BAY: Neon Tide. Input is read
// every frame, the world advances in fixed 1/60 s steps (several in a slow
// frame, none in a fast one), and the stage paints what is there. Screens:
// start, play, paused, busted/wasted. ?shot=chase|streets|mission|night
// (&seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady. ?debug=1 exposes window.__game for playtests.
import { CFG, MISSION_DEFS } from './config.js';
import { makeRng } from './random.js';
import { createInput, ACT_INTERACT, ACT_PUNCH, ACT_RELOAD, ACT_PAUSE, ACT_MUTE, ACT_SHOOT } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createPlayer, stepPlayer } from './player.js';
import { enterCar, exitCar, driveCar, nearestCar } from './vehicles.js';
import { spawnTraffic, spawnParked, spawnPedestrians, updateTraffic, updatePeds } from './traffic.js';
import { raiseWanted, updatePolice, spawnCopCar, spawnFootCop } from './police.js';
import { createMissions } from './missions.js';
import { createEffects, updateRivals, shootPistol, startReload, punch, spawnHealthPacks, updatePickups, makeRival } from './combat.js';
import { createHud } from './hud.js';
import { createStage } from './render.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const debug = params.get('debug') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const stage = createStage(canvas);
const rng = makeRng(seed);
const input = createInput(canvas);
const audio = createAudio();
const city = createCity(stage.scene, rng);
const effects = createEffects(stage.scene);
const player = createPlayer(stage.scene);

// The one shared state object every module works on.
const G = {
  scene: stage.scene, camera: stage.camera, stage, rng, input, audio, city,
  effects, player, hud: null, missions: null,
  cars: [], copCars: [], cops: [], rivals: [], peds: [], pickups: [],
  wanted: 0, wantedTimer: 0, cash: 0, respect: 0,
  timeOfDay: 14.5, night: false, nightMix: 0,
  screen: 'start', elapsed: 0, fireCd: 0,
  vehicles: { nearestCar },
  save, load,
  events: {},
};
G.hud = createHud(G);
G.missions = createMissions(G);

// Events: the verbs modules use to talk to the player (HUD, radio, wanted).
G.events = {
  raiseWanted(levels, reason) { raiseWanted(G, levels, reason); },
  radio(text) { G.hud.radioLine(text); },
  killFeed(killer, weapon, victim) { G.hud.killFeedLine(killer, weapon, victim); },
  toast(text) { G.hud.toast(text); },
  damagePlayer(amount, src) {
    if (G.screen !== 'play' || G.player.hp <= 0) return;
    G.player.hp -= amount;
    G.player.lastHurtAt = performance.now() / 1000;
    if (G.player.hp <= 0) {
      G.player.hp = 0;
      endGame('wasted', 'Taken down by ' + (src || 'the streets') + '. Solmar Bay shows no mercy.');
    }
  },
  busted(reason) { endGame('busted', reason + '. The cuffs click. Sal will have to wait.'); },
};

function save() {
  try {
    window.localStorage.setItem(CFG.saveKey, JSON.stringify({
      cash: G.cash, respect: G.respect,
      missionIndex: Math.min(G.missions.state.index, 2),
      armed: G.player.armed,
      best: Math.max(G.cash, readSave().best || 0),
    }));
  } catch { /* storage off: progress lasts this visit only */ }
}

function readSave() {
  try { return JSON.parse(window.localStorage.getItem(CFG.saveKey) || '{}'); }
  catch { return {}; }
}

function load() {
  const s = readSave();
  if (typeof s.cash === 'number') G.cash = s.cash;
  if (typeof s.respect === 'number') G.respect = s.respect;
  if (s.armed) {
    G.player.armed = true;
    G.player.ammo = CFG.pistolMag;
    G.player.reserve = CFG.pistolReserve;
  }
  return s;
}

function populate() {
  spawnParked(G, 12);
  spawnTraffic(G, 10);
  spawnPedestrians(G, 18);
  spawnHealthPacks(G, 6);
  // Pre-stage the police and rivals the screenshots and the wanted system
  // need: hidden and idle until the heat comes on.
  for (let i = 0; i < 2; i++) {
    const car = spawnCopCar(G);
    car.mesh.visible = false;
    car.speed = 0;
  }
  for (let i = 0; i < 2; i++) {
    const cop = spawnFootCop(G);
    cop.alive = false; cop.mesh.visible = false;
  }
  for (let i = 0; i < 3; i++) {
    const r = makeRival(G.scene, G.rng, 200, 200);
    r.alive = false; r.mesh.visible = false;
    G.rivals.push(r);
  }
  // Ambient radio so the world talks even before the first crime.
  G.hud.radioLine('RADIO: Sunny in Solmar Bay, 28 degrees. Drive safe.');
  G.hud.radioLine("Sal: Ken! My garage, west side. Come see me when you got wheels.");
}

function announce(message) { status.textContent = message; }

function startGame() {
  audio.unlock();
  G.screen = 'play';
  G.hud.showScreen(null);
  G.missions.state.stage = 'intro';
  G.missions.state.timer = 0;
  G.hud.setObjectiveTitle('MISSION: FIRST WHEELS');
  announce('Playing. Steal a car and deliver it to Sal\'s Garage.');
}

function endGame(kind, text) {
  if (G.screen === 'end') return;
  G.screen = 'end';
  audio.siren(false);
  audio.engineStop();
  if (G.missions.state.stage === 'active') G.missions.failMission(kind === 'busted' ? 'Busted by the PD' : 'Wasted on the streets');
  G.hud.showEnd(kind === 'busted' ? 'BUSTED' : 'WASTED', text + ' Cash kept: $' + G.cash + '.');
  const title = document.getElementById('end-title');
  title.className = kind;
  save();
  announce(text);
}

function restart() {
  G.player.hp = CFG.playerMaxHp;
  G.player.pos.set(-27, 0, 60);
  G.player.yaw = 0; G.player.camYaw = Math.PI;
  G.wanted = 0; G.wantedTimer = 0;
  G.night = false;
  if (G.player.car) { G.player.car.speed = 0; G.player.car = null; G.player.inCar = false; }
  for (const c of G.cops) { c.alive = false; c.mesh.visible = false; }
  for (const r of G.rivals) { r.alive = false; r.mesh.visible = false; }
  for (const c of G.copCars) { c.mesh.visible = false; c.speed = 0; }
  G.missions.state.stage = 'intro';
  G.missions.state.timer = 0;
  G.missions.state.index = Math.min(G.missions.state.index, 2);
  startGame();
}

function handleActions() {
  const a = input.takeActions();
  if (a & ACT_MUTE) {
    const muted = audio.toggleMute();
    G.hud.toast(muted ? 'Sound muted (M)' : 'Sound on (M)');
  }
  if (G.screen === 'play') {
    if (a & ACT_PAUSE) {
      G.screen = 'pause';
      G.hud.showScreen('pause');
      announce('Paused.');
      return;
    }
    if (a & ACT_INTERACT) {
      if (G.player.inCar) exitCar(G);
      else {
        const car = nearestCar(G, 4.5);
        if (car) enterCar(G, car);
      }
    }
    if (a & ACT_PUNCH) punch(G);
    if (a & ACT_RELOAD) startReload(G);
    // A click is a one-shot action: queue it here (handleActions owns the
    // action queue) and let the fixed steps below consume it, so a click
    // between frames is never eaten by the step loop's own reads.
    if (a & ACT_SHOOT) G.shootQueued = true;
  } else if (G.screen === 'pause' && (a & ACT_PAUSE)) {
    G.screen = 'play';
    G.hud.showScreen(null);
    announce('Playing.');
  }
}

function step(dt) {
  G.elapsed += dt;
  G.timeOfDay = (14.5 + (G.elapsed / CFG.dayLengthSeconds) * 24) % 24;
  // Shooting: click (queued by handleActions), or hold the mouse button
  // (auto-fire with a cooldown).
  if (G.shootQueued || input.mouseDownNow()) {
    if (G.fireCd <= 0 && G.player.armed && !G.player.inCar) {
      shootPistol(G);
      G.fireCd = 0.22;
    }
    G.shootQueued = false;
  }
  if (G.fireCd > 0) G.fireCd -= dt;
  if (G.player.inCar) driveCar(G, dt);
  else stepPlayer(G, dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateRivals(G, dt);
  updatePickups(G, dt);
  G.missions.update(dt);
  G.city.update(dt, G.elapsed);
  effects.update(dt);
  stage.updateCamera(G, dt);
  stage.updateLighting(G, dt);
  G.hud.update(dt);
}

function runShot(name) {
  populate();
  load();
  stageShot(G, name);
  let painted = 0;
  function paint() {
    stage.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  populate();
  const saved = load();
  if (saved.missionIndex > 0) {
    G.missions.state.index = saved.missionIndex;
    G.hud.setObjectiveTitle('MISSION: ' + MISSION_DEFS[saved.missionIndex].name.toUpperCase());
  }
  let accumulator = 0;
  let last = performance.now();
  document.getElementById('play-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', () => {
    G.screen = 'play'; G.hud.showScreen(null);
  });
  document.getElementById('retry-btn').addEventListener('click', restart);
  // Start on Enter/Space from the title screen too.
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Enter' || e.code === 'Space') && G.screen === 'start') startGame();
    if (e.code === 'Enter' && G.screen === 'end') restart();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') {
      G.screen = 'pause';
      G.hud.showScreen('pause');
    }
  });
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (G.screen === 'play') {
      while (accumulator >= STEP) { step(STEP); accumulator -= STEP; }
    } else {
      accumulator = 0;
      // The title screen still shows the living city behind the card.
      if (G.screen === 'start') {
        updateTraffic(G, STEP);
        updatePeds(G, STEP);
        G.city.update(STEP, G.elapsed);
        effects.update(STEP);
        stage.updateCamera(G, STEP);
        stage.updateLighting(G, STEP);
        G.hud.update(STEP);
      }
    }
    stage.render();
  }
  announce('SOLMAR BAY: Neon Tide. Press Enter or click Start Engine.');
  requestAnimationFrame(frame);
}

// Playtest + debug hooks, always exposed (harmless in normal play).
window.__game = {
    snapshot() {
      return {
        phase: G.screen, wanted: G.wanted, hp: Math.round(G.player.hp),
        cash: G.cash, respect: G.respect,
        mission: MISSION_DEFS[G.missions.state.index] ? MISSION_DEFS[G.missions.state.index].name : 'done',
        missionStage: G.missions.state.stage,
        collected: G.missions.state.collected,
        pos: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)],
        inCar: G.player.inCar,
        carSpeed: G.player.car ? Math.round(G.player.car.speed * 3.6) : 0,
        armed: G.player.armed, ammo: G.player.ammo,
        cops: G.cops.filter((c) => c.alive).length,
        copCars: G.copCars.filter((c) => c.mesh.visible).length,
        rivals: G.rivals.filter((r) => r.alive).length,
        night: G.night, timeOfDay: Math.round(G.timeOfDay * 10) / 10,
      };
    },
    teleport(x, z, yaw) {
      G.player.pos.set(x, 0, z);
      if (G.player.car) {
        G.player.car.x = x; G.player.car.z = z;
        if (yaw !== undefined) { G.player.car.yaw = yaw; G.player.car.mesh.rotation.y = yaw; }
        G.player.car.mesh.position.set(x, 0, z);
      }
      if (yaw !== undefined) G.player.yaw = yaw;
    },
    nearestParked() {
      let best = null; let bestD = Infinity;
      for (const car of G.cars) {
        if (car.kind !== 'parked' && car.kind !== 'traffic') continue;
        const d = (car.x - G.player.pos.x) ** 2 + (car.z - G.player.pos.z) ** 2;
        if (d < bestD) { bestD = d; best = car; }
      }
      return best ? { x: Math.round(best.x), z: Math.round(best.z), kind: best.kind } : null;
    },
    enterNearestCar() {
      const car = nearestCar(G, 6);
      if (car) { enterCar(G, car); return true; }
      return false;
    },
    start() { if (G.screen === 'start') startGame(); },
    setWanted(n) { G.wanted = n; },
};

if (shot) runShot(shot);
else runGame();
