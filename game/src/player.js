// Ken, the wheelman, on foot: WASD movement relative to the camera,
// sprint, jump, gravity, building collision, and stealing cars with E.

import * as THREE from 'three';
import { TUNING } from './config.js';
import { collidesWithBuildings, clampToCity } from './city.js';
import { nearestCar } from './vehicles.js';

export function createPlayer(scene) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e6fd8, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }),
  );
  head.position.y = 1.74;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.8 }),
  );
  cap.position.y = 1.92;
  group.add(cap);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.95 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), legMat);
  legL.position.set(-0.16, 0.31, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x2e6fd8, roughness: 0.85 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), armMat);
  armL.position.set(-0.42, 1.05, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armR);
  group.position.set(0, 0, 0);
  scene.add(group);
  return {
    group,
    legL,
    legR,
    pos: new THREE.Vector3(21, 0, 21),
    vel: new THREE.Vector3(),
    vy: 0,
    grounded: true,
    heading: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    onFoot: true,
    health: TUNING.playerMaxHealth,
    car: null,
    speed: 0,
    walkPhase: 0,
  };
}

// step the player: on foot movement, or car enter/exit. Returns nothing;
// state.player.speed is updated for the HUD speedometer.
export function updatePlayer(state, dt) {
  const player = state.player;
  const input = state.input;
  if (!player.onFoot) {
    // driving: keep the player mesh hidden and glued to the car seat
    player.group.visible = false;
    player.pos.copy(player.car.pos);
    player.speed = Math.abs(player.car.speed) * 3.2;
    if (input.wasPressed('KeyE')) {
      exitCar(state);
    }
    return;
  }
  player.group.visible = true;

  // camera-relative movement
  const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
  const strafe = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? TUNING.sprintSpeed : TUNING.walkSpeed;
  const sin = Math.sin(player.camYaw);
  const cos = Math.cos(player.camYaw);
  // camera looks toward -Z of its yaw; forward is away from camera
  let mx = 0;
  let mz = 0;
  if (fwd !== 0 || strafe !== 0) {
    mx = -sin * fwd + cos * strafe;
    mz = -cos * fwd - sin * strafe;
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    player.heading = Math.atan2(mx, mz);
  }
  player.speed = (fwd !== 0 || strafe !== 0) ? speed : 0;
  const nx = player.pos.x + mx * speed * dt;
  const nz = player.pos.z + mz * speed * dt;
  if (!collidesWithBuildings(state.city, nx, nz, 0.5)) {
    player.pos.x = nx;
    player.pos.z = nz;
  } else {
    if (!collidesWithBuildings(state.city, nx, player.pos.z, 0.5)) player.pos.x = nx;
    if (!collidesWithBuildings(state.city, player.pos.x, nz, 0.5)) player.pos.z = nz;
  }
  const clamped = clampToCity(player.pos.x, player.pos.z);
  player.pos.x = clamped.x;
  player.pos.z = clamped.z;

  // jump + gravity
  if (player.grounded && input.wasPressed('Space')) {
    player.vy = TUNING.jumpSpeed;
    player.grounded = false;
  }
  player.vy -= TUNING.gravity * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) {
    player.pos.y = 0;
    player.vy = 0;
    player.grounded = true;
  }

  // walk cycle: legs swing, body bobs
  if (player.speed > 0) {
    player.walkPhase += dt * (sprint ? 13 : 9);
    const swing = Math.sin(player.walkPhase) * 0.55;
    player.legL.rotation.x = swing;
    player.legR.rotation.x = -swing;
    player.group.position.y = Math.abs(Math.sin(player.walkPhase)) * 0.06;
  } else {
    player.legL.rotation.x = 0;
    player.legR.rotation.x = 0;
    player.group.position.y = 0;
  }
  player.group.position.set(player.pos.x, player.pos.y, player.pos.z);
  player.group.rotation.y = player.heading;

  // steal a nearby car with E
  if (input.wasPressed('KeyE')) {
    const car = nearestCar(state.cars, player.pos.x, player.pos.z, 3.2);
    if (car) enterCar(state, car);
  }
}

function enterCar(state, car) {
  const player = state.player;
  player.car = car;
  car.kind = 'player';
  car.steer = 0;
  player.onFoot = false;
  player.group.visible = false;
  state.audio.uiClick();
  state.hud.flash('Car stolen — wanted +1');
  if (state.wanted < 5) state.wanted += 1;
  state.events.steal = { x: car.pos.x, z: car.pos.z };
}

function exitCar(state) {
  const player = state.player;
  const car = player.car;
  car.kind = 'parked';
  car.speed = 0;
  player.car = null;
  player.onFoot = true;
  player.pos.set(car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.2, 0, car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.2);
  player.group.visible = true;
  state.audio.setEngine(0, false);
}
