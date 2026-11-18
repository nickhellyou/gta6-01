// Solmar Bay: Neon Tide — bootstrap, game loop and state machine.
// Builds the world, runs the frame loop, and owns the menu / playing /
// paused / busted / wasted screens plus the localStorage save.

import * as THREE from 'three';
import { WORLD, TUNING, MISSIONS, SAVE_KEY } from './config.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, updateCity } from './city.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPlayer, updatePlayer } from './player.js';
import { createParkedCars, updatePlayerCar } from './vehicles.js';
import { createPolice, updatePolice } from './police.js';
import { createMissions, updateMissions, restartMission } from './missions.js';
import { createCombat, updateCombat } from './combat.js';
import { createHud, updateHud, radioChatter } from './hud.js';
import { createRender, updateRender } from './render.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);

const input = new Input(canvas);
const audio = new AudioEngine();
const city = buildCity(scene);
const traffic = createTraffic(scene, TUNING.trafficCount);
const parkedCars = createParkedCars(scene, 12);
const cars = [...traffic.cars, ...parkedCars];
const player = createPlayer(scene);
const police = createPolice(scene);
const missions = createMissions(scene);
const combat = createCombat(scene);
const hud = createHud();
const render = createRender(scene, canvas);

const state = {
  scene,
  canvas,
  input,
  audio,
  city,
  traffic,
  cars,
  player,
  police,
  missions,
  combat,
  hud,
  render,
  camera: render.camera,
  hour: 10,
  cash: 0,
  respect: 0,
  wanted: 0,
  weapon: 'fists',
  ammo: 0,
  events: {},
  flags: { started: false, paused: false, busted: false, wasted: false },
  time: 0,
  radioTimer: 0,
  radioLines: [
    'SOLMAR FM: traffic on Palmera Boulevard is moving fine tonight.',
    'Dispatch: all units, keep an eye on the pier after dark.',
    'SOLMAR FM: Crown Tower lights up the bay — best view in the city.',
    'Dispatch: reports of a stolen car near the marina. Stay sharp.',
    'SOLMAR FM: Neon Row is buzzing — the tide is coming in.',
  ],
  radioIndex: 0,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash === 'number') state.cash = data.cash;
    if (typeof data.respect === 'number') state.respect = data.respect;
    if (typeof data.missionIndex === 'number' && data.missionIndex < MISSIONS.length) {
      state.missions.index = data.missionIndex;
    }
    if (data.weapon === 'pistol') {
      state.weapon = 'pistol';
      state.ammo = data.ammo ?? 12;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      respect: state.respect,
      missionIndex: state.missions.index,
      weapon: state.weapon,
      ammo: state.ammo,
    }));
  } catch (e) {}
}

loadSave();
hud.setObjective(MISSIONS[state.missions.index]?.objective ?? 'Harbor Legend — Solmar Bay is yours. Free roam.');
hud.showScreen('start');

// start the game from the start screen (user gesture: audio + pointer lock)
function startGame() {
  if (state.flags.started) return;
  audio.ensure();
  audio.uiClick();
  input.lockPointer();
  state.flags.started = true;
  state.flags.paused = false;
  hud.hideScreens();
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    hud.quiet = true; // screenshots: keep the centre of the frame clean
    applyShot(state, parseInt(shot, 10));
  } else {
    hud.flash('Welcome to Solmar Bay — steal a car!');
  }
}

function resumeGame() {
  if (!state.flags.paused) return;
  audio.ensure();
  input.lockPointer();
  state.flags.paused = false;
  hud.hideScreens();
}

function respawn() {
  const p = state.player;
  if (p.car) {
    p.car.kind = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.onFoot = true;
  p.group.visible = true;
  p.pos.set(21, 0, 21);
  p.heading = 0;
  p.health = TUNING.playerMaxHealth;
  state.wanted = 0;
  state.flags.busted = false;
  state.flags.wasted = false;
  restartMission(state);
  saveGame();
  hud.hideScreens();
  input.lockPointer();
}

document.getElementById('screen-start').addEventListener('click', startGame);
document.getElementById('screen-pause').addEventListener('click', resumeGame);
document.getElementById('screen-busted').addEventListener('click', respawn);
document.getElementById('screen-wasted').addEventListener('click', respawn);
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && state.flags.started && !state.flags.busted && !state.flags.wasted && !state.flags.paused) {
    state.flags.paused = true;
    hud.showScreen('pause');
  }
});

// radio chatter on a slow timer while playing
function maybeRadio(dt) {
  state.radioTimer -= dt;
  if (state.radioTimer <= 0) {
    state.radioTimer = 26;
    radioChatter(hud, state.radioLines[state.radioIndex % state.radioLines.length]);
    state.radioIndex += 1;
  }
}

let last = performance.now();
let saveTimer = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Esc pauses (and the pointer-lock exit pauses too)
  if (input.wasPressed('Escape') && state.flags.started && !state.flags.busted && !state.flags.wasted) {
    state.flags.paused = !state.flags.paused;
    if (state.flags.paused) hud.showScreen('pause');
    else resumeGame();
  }

  if (!state.flags.started || state.flags.paused || state.flags.busted || state.flags.wasted) {
    updateRender(render, state, dt);
    input.endFrame();
    return;
  }

  state.time += dt;
  state.hour += dt / 120;
  if (state.hour >= 24) state.hour -= 24;

  updatePlayer(state, dt);
  if (state.player.car) updatePlayerCar(state, dt);
  updateTraffic(traffic, dt, state.events.shot);
  updatePolice(state, dt);
  updateMissions(state, dt);
  updateCombat(state, dt);
  updateCity(city, dt, state.hour, state.time);
  updateHud(hud, state, dt);
  updateRender(render, state, dt);
  maybeRadio(dt);

  if (state.player.health <= 0 && !state.flags.wasted) {
    state.flags.wasted = true;
    hud.showScreen('wasted');
    document.exitPointerLock?.();
  }
  if (state.flags.busted) {
    hud.showScreen('busted');
    document.exitPointerLock?.();
  }

  saveTimer += dt;
  if (saveTimer > 15) {
    saveTimer = 0;
    saveGame();
  }

  state.events.shot = null;
  state.events.steal = null;
  state.events.crash = null;
  input.endFrame();
}

requestAnimationFrame(loop);

// debug / automation hooks for the playtest and screenshot tools
window.__game = state;
window.__gameReady = true;
window.__applyShot = (n) => applyShot(state, n);
window.__startGame = startGame;
