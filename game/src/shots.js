// Screenshot scene presets: each one stages the world (player, car,
// wanted level, time of day, mission) so the four screenshots show the
// game at its most complete. Called from the ?shot=N URL parameter.

import { LANDMARKS, WORLD } from './config.js';
import { nearestCar } from './vehicles.js';
import { spawnPoliceCarAt } from './police.js';

// put Ken in the nearest parked car to (x, z)
function putInCar(state, x, z) {
  const player = state.player;
  player.pos.set(x, 0, z);
  const car = nearestCar(state.cars, x, z, 150);
  if (car) {
    player.car = car;
    car.kind = 'player';
    car.steer = 0;
    car.pos.set(x, 0, z);
    car.group.position.set(x, 0, z);
    player.onFoot = false;
    player.group.visible = false;
  }
}

export function applyShot(state, n) {
  const player = state.player;
  if (n === 1) {
    // cover: stolen car, 3-star chase, day, HUD + minimap + wanted stars
    state.hour = 10;
    putInCar(state, 21, 60);
    if (player.car) player.car.heading = 0;
    // a police car pulling up alongside, in frame for the cover
    spawnPoliceCarAt(state, state.scene, 10, 56, 0);
    state.wanted = 3;
    state.cash = 1250;
    state.respect = 24;
    state.weapon = 'pistol';
    state.ammo = 9;
    state.missions.index = 1;
    state.missions.stage = 1;
    state.hud.setObjective('Collect cash from 3 pier shops (1/3)');
    player.camYaw = Math.PI;
    player.camPitch = 0.3;
  } else if (n === 2) {
    // streets: Ken on foot on Palmera Boulevard, traffic, palms, city
    state.hour = 15;
    player.onFoot = true;
    player.group.visible = true;
    player.pos.set(21, 0, 100);
    player.heading = 0;
    player.camYaw = Math.PI;
    player.camPitch = 0.28;
    state.wanted = 0;
    state.cash = 500;
    state.respect = 10;
    state.missions.index = 0;
    state.missions.stage = 0;
    state.hud.setObjective("M1 · First Wheels — steal a car, take it to Sal's Garage");
  } else if (n === 3) {
    // mission: shootout on the pier, objective beacon, sea behind
    state.hour = 17.5;
    player.onFoot = true;
    player.group.visible = true;
    player.pos.set(-21, 0, 218);
    player.heading = 0;
    player.camYaw = Math.PI;
    player.camPitch = 0.25;
    state.wanted = 2;
    state.cash = 700;
    state.respect = 18;
    state.weapon = 'pistol';
    state.ammo = 12;
    state.missions.index = 1;
    state.missions.stage = 0;
    state.hud.setObjective('Collect cash from 3 pier shops (0/3)');
  } else if (n === 4) {
    // night: car chase under headlights and neon
    state.hour = 22;
    putInCar(state, 21, -60);
    if (player.car) player.car.heading = Math.PI;
    state.wanted = 2;
    state.cash = 1900;
    state.respect = 32;
    state.weapon = 'pistol';
    state.ammo = 7;
    state.missions.index = 2;
    state.missions.stage = 1;
    state.hud.setObjective('Deliver the package to Neon Row at night');
    player.camYaw = 0;
    player.camPitch = 0.3;
  }
}
