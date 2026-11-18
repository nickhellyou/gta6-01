// Combat: fists and pistol, tracers, rival gunmen, health packs and the
// kill feed. Enemies are simple meshes with health; shots are resolved by
// a ray from the camera through the crosshair.

import * as THREE from 'three';
import { TUNING, LANDMARKS } from './config.js';
import { addWanted } from './police.js';

function makeRivalMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.85, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.85 }),
  );
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a070, roughness: 0.8 }),
  );
  head.position.y = 1.72;
  g.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.3, 1.2, 0.4);
  g.add(gun);
  return g;
}

function makeHealthPack() {
  const g = new THREE.Group();
  const boxM = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  );
  boxM.position.y = 0.8;
  g.add(boxM);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe02020 });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.1), crossMat);
  c1.position.set(0, 0.8, 0.48);
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.1), crossMat);
  c2.position.set(0, 0.8, 0.48);
  g.add(c2);
  return g;
}

export function createCombat(scene) {
  const combat = {
    scene,
    enemies: [],
    tracers: [],
    healthPacks: [],
    shootCooldown: 0,
    punchCooldown: 0,
    raycaster: new THREE.Raycaster(),
  };
  // health packs at the clinic and the garage
  for (const spot of [LANDMARKS.hospital, LANDMARKS.salsGarage]) {
    const pack = makeHealthPack();
    pack.position.set(spot.x + 14, 0, spot.z);
    scene.add(pack);
    combat.healthPacks.push({ mesh: pack, x: spot.x + 14, z: spot.z, taken: false });
  }
  combat.spawnRival = (x, z) => {
    const mesh = makeRivalMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const rival = {
      kind: 'rival',
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: 0,
      speed: 3.4,
      health: 100,
      shootTimer: 1.5 + Math.random(),
    };
    combat.enemies.push(rival);
    return rival;
  };
  return combat;
}

function spawnTracer(combat, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 }),
  );
  combat.scene.add(line);
  combat.tracers.push({ line, life: 0.12 });
}

// nearest enemy hit by a ray from the camera through the screen centre
function rayHitEnemy(combat, camera) {
  combat.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const origin = combat.raycaster.ray.origin;
  const dir = combat.raycaster.ray.direction;
  let best = null;
  let bestT = 70;
  for (const e of combat.enemies) {
    if (e.health <= 0) continue;
    const to = new THREE.Vector3(e.pos.x - origin.x, 1.2 - origin.y, e.pos.z - origin.z);
    const t = to.dot(dir);
    if (t < 1 || t > bestT) continue;
    const closest = new THREE.Vector3().copy(dir).multiplyScalar(t).add(origin);
    const d = Math.hypot(closest.x - e.pos.x, closest.y - 1.2, closest.z - e.pos.z);
    if (d < 1.3) {
      best = e;
      bestT = t;
    }
  }
  return { enemy: best, distance: bestT };
}

function killEnemy(state, enemy) {
  const combat = state.combat;
  const idx = combat.enemies.indexOf(enemy);
  if (idx >= 0) combat.enemies.splice(idx, 1);
  state.scene.remove(enemy.mesh);
  state.respect += 2;
  const label = enemy.kind === 'rival' ? 'Rival gunman' : 'Cop';
  state.hud.addKillFeed(`Ken took down a ${label}`);
  if (enemy.kind === 'cop') addWanted(state, 1);
}

export function updateCombat(state, dt) {
  const combat = state.combat;
  const input = state.input;
  combat.shootCooldown -= dt;
  combat.punchCooldown -= dt;

  // pistol: click to shoot from the crosshair
  if (state.weapon === 'pistol' && input.mouseClicked && combat.shootCooldown <= 0) {
    combat.shootCooldown = 0.28;
    if (state.ammo <= 0) {
      state.hud.flash('Out of ammo — press R to reload');
      state.audio.uiClick();
    } else {
      state.ammo -= 1;
      state.audio.gunshot();
      const from = state.camera.position.clone();
      const { enemy, distance } = rayHitEnemy(combat, state.camera);
      const end = enemy
        ? new THREE.Vector3(enemy.pos.x, 1.2, enemy.pos.z)
        : from.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(state.camera.quaternion).multiplyScalar(60));
      spawnTracer(combat, from, end);
      state.events.shot = { x: state.player.pos.x, z: state.player.pos.z };
      if (enemy) {
        enemy.health -= TUNING.pistolDamage;
        if (enemy.health <= 0) killEnemy(state, enemy);
      } else {
        // stray shots still draw attention
        if (Math.random() < 0.5) addWanted(state, 0);
      }
      if (state.wanted < 5 && Math.random() < 0.35) state.wanted += 1;
    }
  }

  // reload with R
  if (state.weapon === 'pistol' && input.wasPressed('KeyR') && state.ammo < TUNING.pistolAmmo) {
    state.ammo = TUNING.pistolAmmo;
    state.audio.uiClick();
    state.hud.flash('Reloaded — 12 rounds');
  }

  // fists: F punches whatever is right in front of Ken
  if (input.wasPressed('KeyF') && combat.punchCooldown <= 0) {
    combat.punchCooldown = 0.45;
    const p = state.player.pos;
    const fx = Math.sin(state.player.heading);
    const fz = Math.cos(state.player.heading);
    for (const e of [...combat.enemies]) {
      const dx = e.pos.x - p.x;
      const dz = e.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < TUNING.punchRange && dx * fx + dz * fz > 0) {
        state.audio.punch();
        e.health -= TUNING.punchDamage;
        state.hud.addKillFeed(`Ken punched a ${e.kind === 'rival' ? 'Rival' : 'Cop'} (${Math.max(0, e.health)} hp)`);
        if (e.health <= 0) killEnemy(state, e);
        break;
      }
    }
  }

  // rivals shoot back when Ken is close
  for (const e of [...combat.enemies]) {
    if (e.kind !== 'rival') continue;
    const p = state.player.pos;
    const dx = p.x - e.pos.x;
    const dz = p.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 26 && d > 2) {
      e.heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = e.heading;
      // close in slowly
      e.pos.x += Math.sin(e.heading) * e.speed * 0.4 * dt;
      e.pos.z += Math.cos(e.heading) * e.speed * 0.4 * dt;
      e.mesh.position.set(e.pos.x, 0, e.pos.z);
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 2 + Math.random() * 1.5;
        spawnTracer(combat, new THREE.Vector3(e.pos.x, 1.3, e.pos.z), new THREE.Vector3(p.x, 1.1, p.z));
        state.audio.gunshot();
        state.player.health -= 7;
        state.hud.damageFlash(0.4);
      }
    }
  }

  // health packs: walk over one to heal
  for (const pack of combat.healthPacks) {
    if (pack.taken) continue;
    pack.mesh.rotation.y += dt;
    const d = Math.hypot(state.player.pos.x - pack.x, state.player.pos.z - pack.z);
    if (d < 1.8 && state.player.health < TUNING.playerMaxHealth) {
      pack.taken = true;
      pack.mesh.visible = false;
      state.player.health = Math.min(TUNING.playerMaxHealth, state.player.health + 40);
      state.audio.pickup();
      state.hud.flash('Health +40');
    }
  }

  // tracers fade fast
  for (const t of [...combat.tracers]) {
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.95;
    if (t.life <= 0) {
      state.scene.remove(t.line);
      combat.tracers.splice(combat.tracers.indexOf(t), 1);
    }
  }
}
