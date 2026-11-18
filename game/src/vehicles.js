// Cars: box-built car meshes, parked-car placement and arcade driving
// physics for the player's car (accelerate, steer, handbrake, collisions).

import * as THREE from 'three';
import { WORLD, COLORS, TUNING } from './config.js';
import { makeRng } from './random.js';
import { collidesWithBuildings, clampToCity } from './city.js';

// build a low-poly car: body, cabin, 4 wheels, headlights; police cars get
// a light bar. Returns { group, wheels }.
export function createCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPolice ? COLORS.policeCar : color,
    roughness: 0.35,
    metalness: 0.4,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.15, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    lamp.position.set(sx, 0.6, 2.22);
    group.add(lamp);
  }
  if (isPolice) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: COLORS.policeLightR }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: COLORS.policeLightB }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.set(0, 1.55, -0.2);
    bar.userData.red = red;
    bar.userData.blue = blue;
    group.add(bar);
    group.userData.lightBar = bar;
  }
  return { group, wheels };
}

// scatter parked cars along curbs; returns car objects (kind 'parked')
export function createParkedCars(scene, count) {
  const rng = makeRng(4242);
  const cars = [];
  // a starter car on the road just south of the spawn (21, 21), so Ken
  // always has wheels in reach for the first mission
  const starterMesh = createCarMesh(0xd23b3b, false);
  starterMesh.group.position.set(21, 0, 32);
  starterMesh.group.rotation.y = 0;
  scene.add(starterMesh.group);
  cars.push({
    kind: 'parked',
    group: starterMesh.group,
    wheels: starterMesh.wheels,
    pos: new THREE.Vector3(21, 0, 32),
    heading: 0,
    speed: 0,
    steer: 0,
    color: 0xd23b3b,
  });
  const roadLines = [];
  for (let v = -189; v <= 189; v += WORLD.roadGap) roadLines.push(v);
  for (let i = 0; i < count; i++) {
    const alongRoad = rng.chance(0.5);
    const line = rng.pick(roadLines);
    const along = rng.range(-180, 180);
    const side = rng.chance(0.5) ? 1 : -1;
    const offset = WORLD.roadWidth / 2 + 1.6;
    const x = alongRoad ? line + side * offset : along;
    const z = alongRoad ? along : line + side * offset;
    if (z > 195) continue;
    const heading = alongRoad ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const color = rng.pick(COLORS.carPalette);
    const mesh = createCarMesh(color, false);
    mesh.group.position.set(x, 0, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);
    cars.push({
      kind: 'parked',
      group: mesh.group,
      wheels: mesh.wheels,
      pos: new THREE.Vector3(x, 0, z),
      heading,
      speed: 0,
      steer: 0,
      color,
    });
  }
  return cars;
}

// nearest car to a point within maxDist (parked or traffic only)
export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.kind !== 'parked' && car.kind !== 'traffic') continue;
    const d = Math.hypot(car.pos.x - x, car.pos.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// arcade driving for the player's car; returns current speed (km/h-ish)
export function updatePlayerCar(state, dt) {
  const car = state.player.car;
  const input = state.input;
  if (!car) return 0;
  const forward = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  const handbrake = input.down('Space');

  if (forward) car.speed += TUNING.carAccel * dt;
  if (back) {
    if (car.speed > 0.5) car.speed -= TUNING.carBrake * dt;
    else car.speed -= TUNING.carReverseAccel * dt;
  }
  if (!forward && !back) {
    // engine drag
    car.speed -= Math.sign(car.speed) * TUNING.carDrag * 2 * dt;
    if (Math.abs(car.speed) < 0.2) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * TUNING.handbrakeDrag * 4 * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }
  car.speed = Math.max(-12, Math.min(TUNING.carMaxSpeed, car.speed));

  const steerTarget = (left ? 1 : 0) + (right ? -1 : 0);
  const steerRate = TUNING.carTurn * Math.min(1, Math.abs(car.speed) / 10);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.heading += car.steer * steerRate * dt * Math.sign(car.speed || 1) * (handbrake ? 1.6 : 1);

  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collidesWithBuildings(state.city, nx, nz, 1.6);
  if (hit) {
    // slide along the wall: cancel the component that entered the collider
    const hitX = collidesWithBuildings(state.city, nx, car.pos.z, 1.6);
    const hitZ = collidesWithBuildings(state.city, car.pos.x, nz, 1.6);
    if (!hitX) car.pos.x = nx;
    if (!hitZ) car.pos.z = nz;
    car.speed *= 0.4;
    if (Math.abs(car.speed) > 8) state.events.crash = { x: car.pos.x, z: car.pos.z };
  } else {
    car.pos.x = nx;
    car.pos.z = nz;
  }
  // car-vs-car bumps
  for (const other of state.cars) {
    if (other === car || other.kind === 'player') continue;
    const dx = car.pos.x - other.pos.x;
    const dz = car.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      car.pos.x += (dx / d) * push;
      car.pos.z += (dz / d) * push;
      car.speed *= 0.6;
      if (Math.abs(car.speed) > 6) state.events.crash = { x: car.pos.x, z: car.pos.z };
    }
  }
  const clamped = clampToCity(car.pos.x, car.pos.z);
  // cars cannot drive onto the pier or into the sea
  clamped.z = Math.min(clamped.z, WORLD.seaZ - 2);
  if (clamped.x !== car.pos.x || clamped.z !== car.pos.z) {
    car.pos.x = clamped.x;
    car.pos.z = clamped.z;
    car.speed *= 0.3;
  }
  car.group.position.set(car.pos.x, 0, car.pos.z);
  car.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2.2;
  for (const w of car.wheels) w.rotation.x += spin;
  if (car.wheels[0]) car.wheels[0].rotation.y = car.steer * 0.4;
  if (car.wheels[1]) car.wheels[1].rotation.y = car.steer * 0.4;
  state.audio.setEngine(Math.abs(car.speed) / TUNING.carMaxSpeed, true);
  return Math.abs(car.speed) * 3.2;
}
