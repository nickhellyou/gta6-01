// Traffic cars and pedestrians: cars loop around city blocks on the roads,
// pedestrians stroll the sidewalks and run away from gunfire.

import * as THREE from 'three';
import { WORLD, COLORS, TUNING } from './config.js';
import { makeRng } from './random.js';
import { createCarMesh } from './vehicles.js';

const ROAD_LINES = [];
for (let v = -189; v <= 189; v += WORLD.roadGap) ROAD_LINES.push(v);

// build a rectangular loop around one block (waypoints on road centrelines)
function makeLoop(rng) {
  const bx = ROAD_LINES[rng.int(1, ROAD_LINES.length - 2)];
  const bz = ROAD_LINES[rng.int(1, ROAD_LINES.length - 2)];
  const g = WORLD.roadGap;
  const half = WORLD.roadWidth / 2 - 1.6;
  return [
    { x: bx - half, z: bz - half },
    { x: bx + g + half, z: bz - half },
    { x: bx + g + half, z: bz + g + half },
    { x: bx - half, z: bz + g + half },
  ];
}

export function createTraffic(scene, count) {
  const rng = makeRng(777);
  const traffic = { cars: [], peds: [] };
  for (let i = 0; i < count; i++) {
    const color = rng.pick(COLORS.carPalette);
    const mesh = createCarMesh(color, false);
    scene.add(mesh.group);
    const loop = makeLoop(rng);
    const start = loop[rng.int(0, 3)];
    traffic.cars.push({
      kind: 'traffic',
      group: mesh.group,
      wheels: mesh.wheels,
      pos: new THREE.Vector3(start.x, 0, start.z),
      heading: 0,
      speed: rng.range(7, 11),
      steer: 0,
      loop,
      wp: (rng.int(0, 3) + 1) % 4,
      color,
    });
  }
  for (let i = 0; i < TUNING.pedCount; i++) {
    const mesh = makePedMesh(rng);
    scene.add(mesh);
    traffic.peds.push({
      kind: 'ped',
      mesh,
      pos: new THREE.Vector3(rng.range(-180, 180), 0, rng.range(-180, 180)),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.1, 1.9),
      target: null,
      fleeing: false,
      fleeTimer: 0,
      health: 100,
    });
  }
  return traffic;
}

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = rng.pick([0xd23b3b, 0x2e6fd8, 0xe8b93b, 0x3fae6a, 0xe8e4da, 0x7a4fd0]);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8 }),
  );
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.95 });
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), legMat);
    leg.position.set(sx, 0.31, 0);
    g.add(leg);
  }
  return g;
}

// one traffic car drives toward its next loop waypoint, turning at corners
function updateTrafficCar(car, dt) {
  const target = car.loop[car.wp];
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.2) {
    car.wp = (car.wp + 1) % 4;
    return;
  }
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.group.position.set(car.pos.x, 0, car.pos.z);
  car.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2;
  for (const w of car.wheels) w.rotation.x += spin;
}

function updatePed(ped, dt, shotPos) {
  if (shotPos) {
    const dx = ped.pos.x - shotPos.x;
    const dz = ped.pos.z - shotPos.z;
    const d = Math.hypot(dx, dz);
    if (d < 30) {
      ped.fleeing = true;
      ped.fleeTimer = 3;
      ped.target = { x: ped.pos.x + (dx / (d || 1)) * 20, z: ped.pos.z + (dz / (d || 1)) * 20 };
    }
  }
  if (ped.fleeing) {
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0) ped.fleeing = false;
  }
  if (!ped.target) {
    ped.target = {
      x: Math.max(-190, Math.min(190, ped.pos.x + (Math.random() - 0.5) * 60)),
      z: Math.max(-190, Math.min(190, ped.pos.z + (Math.random() - 0.5) * 60)),
    };
  }
  const dx = ped.target.x - ped.pos.x;
  const dz = ped.target.z - ped.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) {
    ped.target = null;
    return;
  }
  const speed = ped.fleeing ? 5.2 : ped.speed;
  const want = Math.atan2(dx, dz);
  ped.heading = want;
  ped.pos.x += Math.sin(want) * speed * dt;
  ped.pos.z += Math.cos(want) * speed * dt;
  ped.mesh.position.set(ped.pos.x, 0, ped.pos.z);
  ped.mesh.rotation.y = ped.heading;
  // simple walk bob
  ped.mesh.position.y = Math.abs(Math.sin(Date.now() * 0.008 + ped.pos.x)) * 0.05;
}

export function updateTraffic(traffic, dt, shotPos) {
  for (const car of traffic.cars) {
    if (car.kind === 'player') continue; // a stolen car is driven by the player now
    updateTrafficCar(car, dt);
  }
  for (const ped of traffic.peds) updatePed(ped, dt, shotPos);
}
