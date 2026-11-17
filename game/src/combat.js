// combat.js — fighting: the pistol (hitscan with spread, ammo, reload), the
// punch, rival crew members who shoot back, health packs, and the particle /
// tracer effects that make it read. Kill feed entries name killer, weapon
// and victim, like the genre does.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, dist2D } from './random.js';

const RIVAL_NAMES = ['Rocco', 'Vito', 'Marco', 'Lennie', 'Sonny', 'Frankie'];

// A tiny pooled particle system: one THREE.Points cloud, positions rewritten
// per burst. No allocation in the hot loop beyond the pool itself.
export function createEffects(scene) {
  const MAX = 400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0 });
  // Tracers: short-lived glowing lines from muzzle to impact.
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, tracerMat.clone());
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }

  function burst(x, y, z, colorHex, count, speed) {
    const c = new THREE.Color(colorHex);
    let placed = 0;
    for (const p of parts) {
      if (placed >= count) break;
      if (p.life > 0) continue;
      placed += 1;
      p.life = 0.5 + Math.random() * 0.4;
      p.x = x; p.y = y; p.z = z;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = Math.random() * speed * 0.8;
      p.r = c.r; p.g = c.g; p.b = c.b;
    }
  }

  function tracer(x1, y1, z1, x2, y2, z2, colorHex) {
    for (const t of tracers) {
      if (t.life > 0) continue;
      t.life = 0.12;
      t.line.visible = true;
      t.line.material.color.setHex(colorHex || 0xffee88);
      const arr = t.line.geometry.attributes.position.array;
      arr[0] = x1; arr[1] = y1; arr[2] = z1; arr[3] = x2; arr[4] = y2; arr[5] = z2;
      t.line.geometry.attributes.position.needsUpdate = true;
      return;
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 6 * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy = 0; }
      } else { p.y = -99; }
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r || 1; col[i * 3 + 1] = p.g || 1; col[i * 3 + 2] = p.b || 1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
  }

  return { burst, tracer, update };
}

export function makeRival(scene, rng, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.05, 10),
    new THREE.MeshLambertMaterial({ color: 0x7b2d26 }));
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe0ac69 }));
  head.position.y = 1.82; g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 1.15, 0.25); g.add(gun);
  g.position.set(x, 0, z);
  scene.add(g);
  return {
    mesh: g, x, z, yaw: 0, hp: CFG.rivalHp, alive: true,
    name: rng.pick(RIVAL_NAMES), shootCd: rng.range(0.8, 1.8), speed: 4.5,
  };
}

// Rivals: walk at the player, shoot with a wind-up, and die with a feed line.
export function updateRivals(G, dt) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (const r of G.rivals) {
    if (!r.alive) continue;
    const d = dist2D(r.x, r.z, px, pz);
    if (d > 90) continue;
    const wantYaw = Math.atan2(px - r.x, pz - r.z);
    r.yaw = wantYaw;
    if (d > 7) {
      r.x += Math.sin(wantYaw) * r.speed * dt;
      r.z += Math.cos(wantYaw) * r.speed * dt;
    }
    r.mesh.position.set(r.x, 0, r.z);
    r.mesh.rotation.y = r.yaw;
    r.shootCd -= dt;
    if (r.shootCd <= 0 && d < 38) {
      r.shootCd = G.rng.range(1.0, 1.9);
      const hitChance = clamp(0.55 - d * 0.012, 0.12, 0.55);
      G.effects.tracer(r.x, 1.4, r.z, px, 1.2, pz, 0xffaa33);
      G.audio.shot();
      if (G.rng.chance(hitChance)) {
        G.events.damagePlayer(G.rng.range(5, 10), 'shot by ' + r.name);
      }
    }
  }
}

function nearestEnemy(G, maxDist) {
  let best = null; let bestD = maxDist;
  for (const list of [G.rivals, G.cops]) {
    for (const e of list) {
      if (!e.alive) continue;
      const d = dist2D(e.x, e.z, G.player.pos.x, G.player.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

// Pistol shot: hitscan toward the camera's aim, with spread. A hit on a rival
// or cop feeds the kill feed; a miss throws dust where the bullet lands.
export function shootPistol(G) {
  const p = G.player;
  if (!p.armed || p.reloading) return;
  if (p.ammo <= 0) {
    G.audio.fail();
    if (p.reserve > 0) startReload(G);
    return;
  }
  p.ammo -= 1;
  G.audio.shot();
  const cam = G.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  // Muzzle flash at the player's hand, tracer down the aim line.
  const mx = p.pos.x + Math.sin(p.yaw) * 0.6;
  const mz = p.pos.z + Math.cos(p.yaw) * 0.6;
  G.effects.burst(mx, 1.35, mz, 0xffee88, 6, 3);
  const spread = 0.03;
  dir.x += (G.rng.next() - 0.5) * spread;
  dir.y += (G.rng.next() - 0.5) * spread;
  dir.z += (G.rng.next() - 0.5) * spread;
  dir.normalize();
  const hit = nearestEnemy(G, 60);
  const range = hit ? hit.dist : 60;
  const ex = p.pos.x + dir.x * range;
  const ez = p.pos.z + dir.z * range;
  G.effects.tracer(mx, 1.35, mz, ex, 1.2, ez, 0xffee88);
  if (hit) {
    const e = hit.enemy;
    e.hp -= CFG.pistolDamage;
    G.effects.burst(e.x, 1.3, e.z, 0xff3333, 8, 3);
    if (e.hp <= 0) {
      e.alive = false;
      e.mesh.visible = false;
      const isCop = G.cops.includes(e);
      G.events.killFeed('You', 'Pistol', e.name + (isCop ? ' (PD)' : ''));
      G.events.radio(isCop ? 'RADIO: Officer down! All units converge!' : 'Rocco: One of ours is down!');
      if (isCop) G.events.raiseWanted(1, 'Officer down');
      G.cash += 25;
      G.audio.pickup();
    }
  } else {
    G.effects.burst(ex, 0.2, ez, 0xccbbaa, 4, 2);
  }
  // Firing in public draws the law.
  if (G.wanted < 1) G.events.raiseWanted(1, 'Shots fired downtown');
}

export function startReload(G) {
  const p = G.player;
  if (!p.armed || p.reloading || p.reserve <= 0 || p.ammo >= CFG.pistolMag) return;
  p.reloading = true;
  p.reloadT = 1.1;
  G.audio.reload();
}

// A punch: short range, hits the nearest enemy in front, no ammo needed.
export function punch(G) {
  const p = G.player;
  if (p.punchCd > 0 || p.inCar) return;
  p.punchCd = 0.45;
  G.audio.punch();
  const hit = nearestEnemy(G, CFG.punchRange + 0.4);
  if (hit) {
    const e = hit.enemy;
    e.hp -= CFG.punchDamage;
    G.effects.burst(e.x, 1.3, e.z, 0xffaa33, 6, 3);
    if (e.hp <= 0) {
      e.alive = false; e.mesh.visible = false;
      G.events.killFeed('You', 'Fists', e.name);
      G.cash += 25;
    }
  }
}

// Health packs: green crosses that heal 40. Spawned around town, respawn slow.
export function spawnHealthPacks(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.streetPoint();
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x22cc44 }));
    crossH.position.z = 0.42;
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x22cc44 }));
    crossV.position.z = 0.42;
    g.add(box, crossH, crossV);
    g.position.set(p.x, 0.7, p.z);
    G.scene.add(g);
    G.pickups.push({ mesh: g, x: p.x, z: p.z, kind: 'health', taken: false, respawnT: 0 });
  }
}

export function updatePickups(G, dt) {
  for (const pk of G.pickups) {
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) { pk.taken = false; pk.mesh.visible = true; }
      continue;
    }
    pk.mesh.rotation.y += dt * 1.5;
    pk.mesh.position.y = 0.7 + Math.sin(performance.now() / 400) * 0.1;
    if (dist2D(pk.x, pk.z, G.player.pos.x, G.player.pos.z) < 1.6) {
      pk.taken = true; pk.respawnT = 45; pk.mesh.visible = false;
      if (pk.kind === 'health') {
        G.player.hp = Math.min(CFG.playerMaxHp, G.player.hp + 40);
        G.events.toast('Health +40');
        G.events.radio('Sal: Patch yourself up, kid. You look rough.');
        G.audio.pickup();
      }
    }
  }
}
