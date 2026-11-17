// vehicles.js — the cars themselves: building a car mesh, arcade driving
// physics for the player's car, and entering / exiting / stealing cars.
// Traffic and police cars reuse buildCar; only the player's car is driven here.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, dist2D } from './random.js';
import { resolveCollisions } from './city.js';

export function buildCar(scene, color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2a44 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2a44 : color });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.1), cabinMat);
  cabin.position.set(0, 1.3, -0.2); cabin.castShadow = true; g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.5, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ef, emissive: 0x223344 }));
  glass.position.set(0, 1.28, -0.2); g.add(glass);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w); wheels.push(w);
  }
  // Headlights: small emissive discs, lit at night by render.js.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), lightMat);
    h.position.set(x, 0.65, 2.21); g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), tailMat);
    t.position.set(x, 0.65, -2.21); t.rotation.y = Math.PI; g.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    bar.position.set(0, 1.75, -0.2); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.75, -0.2); bar2.position.x = 0.75; g.add(bar2);
    const star = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    star.position.set(0, 1.1, 0); star.rotation.y = Math.PI / 2; g.add(star);
  }
  scene.add(g);
  return {
    mesh: g, wheels, x: 0, z: 0, yaw: 0, speed: 0, steer: 0,
    kind: 'parked', axis: 'z', dir: 1, driver: null, skid: 0,
  };
}

export function nearestCar(G, maxDist) {
  let best = null; let bestD = maxDist;
  for (const car of G.cars) {
    if (car.driver === 'player') continue;
    const d = dist2D(G.player.pos.x, G.player.pos.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  // Police cars can be stolen too, once their driver bails.
  for (const car of G.copCars) {
    if (car.driver) continue;
    const d = dist2D(G.player.pos.x, G.player.pos.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// Steal / enter the nearest car. Taking a car that is not yours is a crime.
export function enterCar(G, car) {
  const wasParked = car.kind === 'parked';
  const wasTraffic = car.kind === 'traffic';
  car.kind = 'player';
  car.driver = 'player';
  G.player.car = car;
  G.player.inCar = true;
  G.player.pos.set(car.x, 0, car.z);
  if (wasParked || wasTraffic) {
    G.events.raiseWanted(1, 'Grand theft auto on ' + (wasTraffic ? 'Palmera Blvd' : 'the street'));
    G.events.radio('RADIO: Stolen vehicle reported, ' + (wasTraffic ? 'Palmera Blvd' : 'downtown'));
    G.events.toast('Car stolen — the law is coming');
  }
  G.audio.engineStart(0);
  return car;
}

export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  car.driver = null;
  if (car.kind === 'player') car.kind = 'parked';
  car.speed = 0;
  // Step out to the driver's side, clear of the door.
  const sx = car.x + Math.cos(car.yaw) * 1.8;
  const sz = car.z - Math.sin(car.yaw) * 1.8;
  G.player.pos.set(sx, 0, sz);
  G.player.car = null;
  G.player.inCar = false;
  G.audio.engineStop();
}

// Arcade driving: throttle, brake/reverse, steering that bites harder at low
// speed, handbrake drift, building and car collisions.
export function driveCar(G, dt) {
  const car = G.player.car;
  if (!car) return;
  const input = G.input;
  const mv = input.move();
  const handbrake = input.handbrake();
  if (mv.f > 0) car.speed += CFG.carAccel * dt;
  else if (mv.f < 0) {
    car.speed -= (car.speed > 0.5 ? CFG.carBrake : CFG.carAccel * 0.6) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
  }
  car.speed = clamp(car.speed, -CFG.carReverseMax, CFG.carMaxSpeed);
  const steerTarget = -mv.s * CFG.carSteer * (car.speed >= 0 ? 1 : -1);
  const steerRate = handbrake ? 6 : 3.2;
  car.steer += clamp(steerTarget - car.steer, -steerRate * dt, steerRate * dt);
  const grip = handbrake ? 1.4 : CFG.carGrip;
  car.yaw += car.steer * (car.speed / CFG.carMaxSpeed) * grip * dt * (car.speed >= 0 ? 1 : -1);
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  let nx = car.x + fx * car.speed * dt;
  let nz = car.z + fz * car.speed * dt;
  // Buildings stop the car; a hard hit costs speed and throws dust.
  const hit = resolveCollisions(G.city.colliders, nx, nz, 1.7);
  if (hit.x !== nx || hit.z !== nz) {
    if (Math.abs(car.speed) > 8) {
      G.effects.burst(hit.x, 0.4, hit.z, 0xcccccc, 10, 3);
      G.audio.punch();
    }
    car.speed *= 0.35;
    nx = hit.x; nz = hit.z;
  }
  // Other cars: soft push apart, both lose a little speed.
  for (const other of G.cars) {
    if (other === car || other.driver === 'player') continue;
    const d = dist2D(nx, nz, other.x, other.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      const px = (nx - other.x) / d, pz = (nz - other.z) / d;
      nx += px * push; nz += pz * push;
      car.speed *= 0.92;
      if (other.kind === 'traffic') { other.x -= px * push; other.z -= pz * push; other.speed *= 0.6; }
    }
  }
  car.x = clamp(nx, -132, 132);
  car.z = clamp(nz, -132, 212);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  // Body roll into corners, wheel spin, skid dust when sliding.
  car.mesh.rotation.z = -car.steer * 0.06 * Math.min(1, Math.abs(car.speed) / 12);
  for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.38;
  car.skid = handbrake && Math.abs(car.speed) > 6 ? car.skid + dt : 0;
  if (car.skid > 0.05) {
    G.effects.burst(car.x - fx * 1.6, 0.25, car.z - fz * 1.6, 0xbbbbbb, 2, 1.2);
    car.skid = 0;
  }
  G.player.pos.set(car.x, 0, car.z);
  G.player.speedKmh = Math.abs(car.speed) * 3.6;
  G.audio.engineStart(Math.abs(car.speed) / CFG.carMaxSpeed);
}
