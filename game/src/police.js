// Wanted level and police response: patrol cars chase and ram, foot cops
// close in to arrest, and the heat cools off when nobody can see Ken.

import * as THREE from 'three';
import { TUNING } from './config.js';
import { createCarMesh } from './vehicles.js';
import { collidesWithBuildings, nearestRoad } from './city.js';

export function createPolice(scene) {
  return { scene, cars: [], cops: [], decayTimer: 0, arrestTimer: 0, flash: 0 };
}

export function addWanted(state, n) {
  state.wanted = Math.max(0, Math.min(5, state.wanted + n));
  state.police.decayTimer = 0;
}

function makeCopMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.85, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.85 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }),
  );
  head.position.y = 1.72;
  g.add(head);
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.12, 12),
    new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.7 }),
  );
  hat.position.y = 1.92;
  g.add(hat);
  return g;
}

function spawnPoliceCar(state, scene) {
  const p = state.player.pos;
  const dist = 30 + Math.random() * 15;
  const dir = Math.random() < 0.5 ? 1 : -1;
  // spawn on the same road the player is on, so the chase has a clear
  // straight run instead of a building block in the way
  const roadX = nearestRoad(p.x);
  const roadZ = nearestRoad(p.z);
  let x;
  let z;
  if (Math.abs(p.x - roadX) <= Math.abs(p.z - roadZ)) {
    x = roadX;
    z = Math.max(-190, Math.min(190, p.z + dir * dist));
    z = nearestRoad(z);
  } else {
    z = roadZ;
    x = Math.max(-190, Math.min(190, p.x + dir * dist));
    x = nearestRoad(x);
  }
  return spawnPoliceCarAt(state, scene, x, z, 0);
}

// place a police car at an exact spot (screenshot staging)
export function spawnPoliceCarAt(state, scene, x, z, heading) {
  const mesh = createCarMesh(0, true);
  mesh.group.position.set(x, 0, z);
  scene.add(mesh.group);
  const car = {
    kind: 'police',
    group: mesh.group,
    wheels: mesh.wheels,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    steer: 0,
    avoid: 0,
    color: 0x1c2733,
  };
  state.cars.push(car);
  state.police.cars.push(car);
  return car;
}

function spawnCop(state, scene) {
  const p = state.player.pos;
  const angle = Math.random() * Math.PI * 2;
  const dist = 25 + Math.random() * 15;
  const mesh = makeCopMesh();
  const x = Math.max(-190, Math.min(190, p.x + Math.cos(angle) * dist));
  const z = Math.max(-190, Math.min(190, p.z + Math.sin(angle) * dist));
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const cop = {
    kind: 'cop',
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading: 0,
    speed: 4.2,
    health: 100,
  };
  state.police.cops.push(cop);
  state.combat.enemies.push(cop);
  return cop;
}

function chaseCar(car, target, dt, state) {
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.1) return dist;
  // steer toward the player, unless sliding around a building
  if (car.avoid > 0) {
    car.avoid -= dt;
    car.heading += 1.6 * dt; // keep turning one way to get around the block
  } else {
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
  }
  car.speed = Math.min(TUNING.policeChaseSpeed, car.speed + 25 * dt);
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  if (!collidesWithBuildings(state.city, nx, nz, 1.6)) {
    car.pos.x = nx;
    car.pos.z = nz;
  } else {
    // blocked by a building: slow down and start sliding around it
    car.speed *= 0.5;
    car.avoid = 0.9;
  }
  car.group.position.set(car.pos.x, 0, car.pos.z);
  car.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2.2;
  for (const w of car.wheels) w.rotation.x += spin;
  return dist;
}

export function updatePolice(state, dt) {
  const police = state.police;
  const wanted = state.wanted;
  state.audio.setSiren(wanted > 0);

  // keep the right number of units on the street
  const wantCars = wanted > 0 ? Math.min(wanted, 3) : 0;
  const wantCops = wanted > 0 ? Math.min(Math.ceil(wanted / 2), 3) : 0;
  while (police.cars.length < wantCars) spawnPoliceCar(state, state.scene);
  while (police.cops.length < wantCops) spawnCop(state, state.scene);
  // stand down when the heat is gone
  if (wanted === 0) {
    for (const car of police.cars) {
      state.scene.remove(car.group);
      const i = state.cars.indexOf(car);
      if (i >= 0) state.cars.splice(i, 1);
    }
    police.cars.length = 0;
    for (const cop of police.cops) {
      state.scene.remove(cop.mesh);
      const j = state.combat.enemies.indexOf(cop);
      if (j >= 0) state.combat.enemies.splice(j, 1);
    }
    police.cops.length = 0;
    police.arrestTimer = 0;
    return;
  }

  // police cars chase and ram
  const playerPos = state.player.pos;
  let nearest = Infinity;
  for (const car of police.cars) {
    const d = chaseCar(car, playerPos, dt, state);
    nearest = Math.min(nearest, d);
    // ram the player's car: damage + shove
    if (d < 3.6) {
      car.speed *= 0.4;
      state.player.health -= 3 * dt;
      state.hud.damageFlash(0.35);
      if (state.player.car) state.player.car.speed *= 0.9;
    }
    // flash the light bar
    police.flash += dt;
    const bar = car.group.userData.lightBar;
    if (bar) {
      const on = Math.floor(police.flash * 6) % 2 === 0;
      bar.userData.red.material.color.setHex(on ? 0xff2222 : 0x441111);
      bar.userData.blue.material.color.setHex(on ? 0x112266 : 0x2266ff);
    }
  }

  // foot cops close in; close enough for a second means Busted — but only
  // when Ken is on foot (a cop cannot drag him out of a moving car)
  let copNear = false;
  for (const cop of police.cops) {
    const dx = playerPos.x - cop.pos.x;
    const dz = playerPos.z - cop.pos.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    if (d > 0.1) {
      const want = Math.atan2(dx, dz);
      cop.heading = want;
      cop.pos.x += Math.sin(want) * cop.speed * dt;
      cop.pos.z += Math.cos(want) * cop.speed * dt;
      cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
      cop.mesh.rotation.y = cop.heading;
    }
    if (state.player.onFoot && d < TUNING.copCatchDistance) copNear = true;
  }
  if (copNear) {
    police.arrestTimer += dt;
    state.hud.flash('The cops are on you — break away!');
    if (police.arrestTimer > 2.0) {
      state.flags.busted = true;
      police.arrestTimer = 0;
    }
  } else {
    police.arrestTimer = 0;
  }

  // heat cools when no unit can see Ken
  if (nearest > 60) {
    police.decayTimer += dt;
    if (police.decayTimer > TUNING.wantedDecaySeconds) {
      state.wanted = Math.max(0, state.wanted - 1);
      police.decayTimer = 0;
      state.hud.flash('Heat cooling down — wanted ' + state.wanted);
    }
  } else {
    police.decayTimer = 0;
  }
}
