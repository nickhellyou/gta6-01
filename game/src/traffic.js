// traffic.js — the city in motion: traffic cars cruising the street grid and
// pedestrians wandering the sidewalks. Both keep to the roads, slow for the
// car ahead, and react when the player runs into them.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { clamp, dist2D } from './random.js';
import { buildCar } from './vehicles.js';

const PED_SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95d5b2, 0xf72585, 0x90a8ed, 0xff9f1c, 0xffffff];

export function makePed(scene, rng, x, z) {
  const g = new THREE.Group();
  const shirt = rng.pick(PED_SHIRTS);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.05, 8),
    new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: rng.pick([0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac]) }));
  head.position.y = 1.7; head.castShadow = true; g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2b2d42 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), legMat);
    leg.position.set(s * 0.14, 0.28, 0); g.add(leg);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    mesh: g, x, z, yaw: rng.range(0, Math.PI * 2), speed: CFG.pedSpeed * rng.range(0.7, 1.3),
    tx: x, tz: z, down: false, downT: 0, fleeT: 0, crimeCd: 0, walkPhase: rng.range(0, 6),
  };
}

export function spawnPedestrians(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.streetPoint();
    // Pedestrians walk on the sidewalk, just off the road.
    const off = G.rng.chance(0.5) ? 8.5 : -8.5;
    const ped = makePed(G.scene, G.rng, p.along === 'z' ? p.x + off : p.x, p.along === 'z' ? p.z : p.z + off);
    G.peds.push(ped);
  }
}

export function spawnTraffic(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.streetPoint();
    const car = buildCar(G.scene, G.rng.pick(PALETTE.carColors), false);
    const lane = 3.5;
    car.kind = 'traffic';
    car.axis = p.along;
    car.dir = G.rng.chance(0.5) ? 1 : -1;
    car.speed = CFG.trafficSpeed * G.rng.range(0.7, 1.15);
    if (p.along === 'z') { car.x = p.x + lane * car.dir; car.z = p.z; }
    else { car.x = p.x; car.z = p.z + lane * car.dir; }
    car.yaw = p.along === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    G.cars.push(car);
  }
}

export function spawnParked(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.streetPoint();
    const car = buildCar(G.scene, G.rng.pick(PALETTE.carColors), false);
    const lane = 5.2;
    car.kind = 'parked';
    car.axis = p.along;
    car.dir = G.rng.chance(0.5) ? 1 : -1;
    car.speed = 0;
    if (p.along === 'z') { car.x = p.x + lane; car.z = p.z; }
    else { car.x = p.x; car.z = p.z + lane; }
    car.yaw = p.along === 'z' ? (G.rng.chance(0.5) ? 0 : Math.PI) : (G.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    G.cars.push(car);
  }
}

function carAhead(G, car, look) {
  let best = Infinity;
  for (const other of G.cars) {
    if (other === car || other.speed === 0 && other.kind === 'parked') continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const ahead = car.axis === 'z' ? dz * car.dir : dx * car.dir;
    const side = car.axis === 'z' ? Math.abs(dx) : Math.abs(dz);
    if (ahead > 0 && ahead < look && side < 3) best = Math.min(best, ahead);
  }
  return best;
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.kind !== 'traffic') continue;
    // Slow for the car ahead; stop for the player crossing in front.
    const gap = carAhead(G, car, 14);
    const target = gap < 10 ? 0 : CFG.trafficSpeed;
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    // At an intersection (the car's along-coordinate hits a cross street),
    // sometimes turn onto the cross street.
    const coord = car.axis === 'z' ? car.z : car.x;
    const nearCross = [-81, -27, 27, 81].some((l) => Math.abs(coord - l) < 1.5);
    if (nearCross && G.rng.chance(dt * 0.25)) {
      const lines = [-81, -27, 27, 81];
      const cross = lines.reduce((a, b) => (Math.abs(b - coord) < Math.abs(a - coord) ? b : a), lines[0]);
      if (Math.abs(cross - coord) < 6) {
        car.axis = car.axis === 'z' ? 'x' : 'z';
        car.dir = G.rng.chance(0.5) ? 1 : -1;
        if (car.axis === 'z') { car.x = cross + 3.5 * car.dir; }
        else { car.z = cross + 3.5 * car.dir; }
        car.yaw = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
    if (car.axis === 'z') car.z += car.dir * car.speed * dt;
    else car.x += car.dir * car.speed * dt;
    // Edge of town: turn around and come back.
    if (car.axis === 'z' && Math.abs(car.z) > 128) { car.dir *= -1; car.z = clamp(car.z, -128, 128); car.yaw += Math.PI; }
    if (car.axis === 'x' && Math.abs(car.x) > 128) { car.dir *= -1; car.x = clamp(car.x, -128, 128); car.yaw += Math.PI; }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    // Wheel spin.
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.35;
  }
}

export function updatePeds(G, dt) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (const ped of G.peds) {
    if (ped.crimeCd > 0) ped.crimeCd -= dt;
    if (ped.down) {
      ped.downT -= dt;
      // Stay flat on the ground while down; stand back up when the timer ends.
      if (ped.downT <= 0) { ped.down = false; ped.fleeT = 3; ped.mesh.rotation.x = 0; }
      continue;
    }
    // Flee from a speeding player car or from gunfire nearby.
    const dPlayer = dist2D(ped.x, ped.z, px, pz);
    const fleeing = ped.fleeT > 0 || (G.player.car && dPlayer < 6 && Math.abs(G.player.car.speed) > 5);
    if (fleeing) {
      ped.fleeT -= dt;
      const away = Math.atan2(ped.x - px, ped.z - pz);
      ped.x += Math.sin(away) * 3.4 * dt;
      ped.z += Math.cos(away) * 3.4 * dt;
      ped.yaw = away;
    } else {
      // Wander: pick a new nearby target when the old one is reached.
      if (dist2D(ped.x, ped.z, ped.tx, ped.tz) < 1.5) {
        const p = G.city.streetPoint();
        ped.tx = p.x; ped.tz = p.z;
      }
      const a = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
      ped.yaw = a;
      ped.x += Math.sin(a) * ped.speed * dt;
      ped.z += Math.cos(a) * ped.speed * dt;
      ped.walkPhase += dt * 7;
    }
    ped.x = clamp(ped.x, -130, 130);
    ped.z = clamp(ped.z, -130, 210);
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.yaw;
    // Walk bob.
    ped.mesh.position.y = fleeing ? 0 : Math.abs(Math.sin(ped.walkPhase)) * 0.05;
  }
  // Player car hitting a pedestrian: a crime, and the ped goes down.
  if (G.player.car) {
    const car = G.player.car;
    for (const ped of G.peds) {
      if (ped.down || ped.crimeCd > 0) continue;
      if (dist2D(ped.x, ped.z, car.x, car.z) < 1.9 && Math.abs(car.speed) > 3) {
        ped.down = true; ped.downT = 4; ped.crimeCd = 6;
        ped.mesh.rotation.x = Math.PI / 2 - 0.15;
        G.events.raiseWanted(1, 'Hit a pedestrian on ' + nearestStreetName(ped.x, ped.z));
        G.events.radio('RADIO: Pedestrian down, ' + nearestStreetName(ped.x, ped.z));
        G.audio.punch();
      }
    }
  }
}

function nearestStreetName(x, z) {
  if (z > 135) return 'SOLMAR PIER';
  if (Math.abs(x - 27) < 10) return 'NEON ROW';
  if (Math.abs(x + 27) < 10) return 'PALMERA BOULEVARD';
  if (Math.abs(z - 81) < 10 || Math.abs(z + 81) < 10) return 'MARINA DEL SOL';
  return 'PALMERA BOULEVARD';
}
