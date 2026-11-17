// police.js — the wanted system and the force that answers it: patrol cars
// that chase and ram, foot cops who chase and arrest, sirens, and the wanted
// level decaying once the player is out of sight.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, dist2D } from './random.js';
import { buildCar } from './vehicles.js';
import { resolveCollisions } from './city.js';

const COP_NAMES = ['Unit 7', 'Unit 12', 'Unit 3', 'Unit 21', 'Unit 9'];

export function raiseWanted(G, levels, reason) {
  if (G.wanted >= CFG.maxWanted) return;
  G.wanted = Math.min(CFG.maxWanted, G.wanted + levels);
  G.wantedTimer = 0;
  G.hud.flashStars();
  if (reason) G.events.radio('RADIO: ' + reason);
}

export function makeCop(scene, rng, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.05, 10),
    new THREE.MeshLambertMaterial({ color: 0x1a2a44 }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xf1c27d }));
  head.position.y = 1.82; g.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 12),
    new THREE.MeshLambertMaterial({ color: 0x0d1b2e }));
  hat.position.y = 2.0; g.add(hat);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    mesh: g, x, z, yaw: 0, hp: CFG.copHp, name: rng.pick(COP_NAMES),
    arrestT: 0, shootCd: rng.range(0.5, 1.5), speed: 6.5, alive: true,
  };
}

export function spawnCopCar(G) {
  // Spawn on a street behind the player, out of immediate sight.
  const a = G.rng.range(0, Math.PI * 2);
  const x = clamp(G.player.pos.x + Math.sin(a) * 55, -125, 125);
  const z = clamp(G.player.pos.z + Math.cos(a) * 55, -125, 125);
  const car = buildCar(G.scene, 0x1a2a44, true);
  car.kind = 'police';
  car.x = x; car.z = z;
  car.yaw = Math.atan2(G.player.pos.x - x, G.player.pos.z - z);
  car.speed = 8;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = car.yaw;
  G.copCars.push(car);
  G.cars.push(car);
  G.events.radio('RADIO: ' + G.rng.pick(COP_NAMES) + ' responding to the call');
  G.audio.sirenBurst();
  return car;
}

export function spawnFootCop(G) {
  const a = G.rng.range(0, Math.PI * 2);
  const x = clamp(G.player.pos.x + Math.sin(a) * 22, -130, 130);
  const z = clamp(G.player.pos.z + Math.cos(a) * 22, -130, 130);
  const cop = makeCop(G.scene, G.rng, x, z);
  G.cops.push(cop);
  return cop;
}

// How many police the current wanted level should field.
function desiredCounts(wanted) {
  return {
    cars: wanted <= 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : 4,
    cops: wanted <= 1 ? 1 : wanted === 2 ? 2 : wanted >= 4 ? 4 : 3,
  };
}

export function updatePolice(G, dt) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  // No heat, no force: the pre-staged cars and cops stand down and hide
  // until the wanted level rises again.
  if (G.wanted === 0) {
    for (const c of G.copCars) { c.mesh.visible = false; c.speed = 0; }
    for (const c of G.cops) { if (c.alive) { c.alive = false; c.mesh.visible = false; } }
    G.audio.siren(false);
    return;
  }
  // Wanted decays only while no cop can see the player.
  let nearestCop = Infinity;
  for (const c of G.copCars) nearestCop = Math.min(nearestCop, dist2D(c.x, c.z, px, pz));
  for (const c of G.cops) if (c.alive) nearestCop = Math.min(nearestCop, dist2D(c.x, c.z, px, pz));
  if (G.wanted > 0) {
    if (nearestCop > 45) {
      G.wantedTimer += dt;
      if (G.wantedTimer > CFG.wantedDecaySeconds) {
        G.wanted -= 1;
        G.wantedTimer = 0;
        G.events.radio('RADIO: Lost visual on the suspect, standing down');
        if (G.wanted === 0) {
          G.events.toast('You lost the cops');
          G.events.radio('RADIO: All units, suspect gone. Resume patrol');
        }
      }
    } else {
      G.wantedTimer = 0;
    }
  }
  // Keep the force topped up.
  if (G.wanted > 0) {
    const want = desiredCounts(G.wanted);
    const aliveCars = G.copCars.filter((c) => c.speed !== -999).length;
    if (aliveCars < want.cars && G.copCars.length < 6) spawnCopCar(G);
    const aliveCops = G.cops.filter((c) => c.alive).length;
    if (aliveCops < want.cops && G.cops.length < 8) spawnFootCop(G);
  }
  G.audio.siren(G.wanted > 0 && G.copCars.length > 0);

  // Cop cars: steer toward the player, ram when close, ease off when the
  // player is on foot and slow (so an arrest can happen instead of a splat).
  for (const car of G.copCars) {
    if (car.speed === -999) continue; // wrecked
    car.mesh.visible = true; // chasing cars must be seen to be believed
    const d = dist2D(car.x, car.z, px, pz);
    const wantYaw = Math.atan2(px - car.x, pz - car.z);
    let dy = wantYaw - car.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    car.yaw += clamp(dy, -1.6 * dt, 1.6 * dt);
    const targetSpeed = d > 6 ? CFG.copCarSpeed : (G.player.inCar ? 14 : 4);
    car.speed += clamp(targetSpeed - car.speed, -20 * dt, 12 * dt);
    let nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    let nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const hit = resolveCollisions(G.city.colliders, nx, nz, 1.7);
    if (hit.x !== nx || hit.z !== nz) { car.speed *= 0.4; nx = hit.x; nz = hit.z; }
    car.x = clamp(nx, -132, 132); car.z = clamp(nz, -132, 212);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.38;
    // Ram the player's car: damage + shake, and a wanted bump if it was a hit.
    if (d < 3.6) {
      if (G.player.inCar) {
        G.player.car.speed *= 0.82;
        G.events.damagePlayer(2 * dt * 10, 'rammed by a cop car');
        G.effects.burst(car.x, 0.6, car.z, 0xffcc66, 3, 2);
      } else if (d < 2.2) {
        G.events.damagePlayer(8 * dt, 'hit by a cop car');
      }
    }
  }
  // Foot cops: run the player down; stand close for 2 s to make an arrest.
  for (const cop of G.cops) {
    if (!cop.alive) continue;
    const d = dist2D(cop.x, cop.z, px, pz);
    if (d > 90) { cop.alive = false; cop.mesh.visible = false; continue; }
    const wantYaw = Math.atan2(px - cop.x, pz - cop.z);
    cop.yaw = wantYaw;
    const speed = d > 3 ? cop.speed : 0;
    let nx = cop.x + Math.sin(cop.yaw) * speed * dt;
    let nz = cop.z + Math.cos(cop.yaw) * speed * dt;
    const hit = resolveCollisions(G.city.colliders, nx, nz, 0.5);
    cop.x = hit.x; cop.z = hit.z;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.yaw;
    if (d < 2.4 && !G.player.inCar) {
      cop.arrestT += dt;
      if (cop.arrestT > 0.6 && cop.arrestT - dt <= 0.6) {
        G.events.radio('RADIO: ' + cop.name + ' moving in for the arrest');
      }
      if (cop.arrestT > 2) {
        G.events.busted('Busted by ' + cop.name);
        return;
      }
    } else {
      cop.arrestT = Math.max(0, cop.arrestT - dt * 2);
    }
    // Cops shoot when the player is armed and far, with poor aim.
    if (G.player.armed && d > 8 && d < 45) {
      cop.shootCd -= dt;
      if (cop.shootCd <= 0) {
        cop.shootCd = G.rng.range(1.1, 2.0);
        if (G.rng.chance(0.3)) {
          G.events.damagePlayer(G.rng.range(4, 9), 'shot by ' + cop.name);
          G.effects.tracer(cop.x, 1.4, cop.z, px, 1.2, pz, 0xffdd55);
          G.audio.shot();
        } else {
          G.effects.tracer(cop.x, 1.4, cop.z, px + G.rng.range(-3, 3), 1.2, pz + G.rng.range(-3, 3), 0xffdd55);
          G.audio.shot();
        }
      }
    }
  }
  // Clean up dead / far cops occasionally.
  if (G.cops.length > 10) {
    G.cops = G.cops.filter((c) => c.alive);
  }
}
