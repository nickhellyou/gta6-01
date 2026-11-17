// player.js — the player on foot: third-person WASD movement relative to the
// orbit camera, sprint, jump with gravity, and the camera itself (mouse orbit
// with pointer lock, drag fallback, arrow-key turn). Driving is in vehicles.js.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp } from './random.js';
import { resolveCollisions } from './city.js';

export function makePlayerMesh(scene) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xef476f });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 10), jacket);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xf1c27d }));
  head.position.y = 1.82; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x118ab2 }));
  cap.position.y = 2.02; g.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x22223b });
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), legMat);
    leg.position.set(s * 0.15, 0.3, 0); g.add(leg); legs.push(leg);
  }
  // The pistol, visible in the hand once Sal arms you (after M1).
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 1.15, 0.25); gun.visible = false; g.add(gun);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return { mesh: g, legs, gun };
}

export function createPlayer(scene) {
  const visual = makePlayerMesh(scene);
  return {
    visual,
    pos: new THREE.Vector3(-27, 0, 60),
    velY: 0,
    yaw: 0,            // facing direction
    camYaw: Math.PI,   // camera orbit around the player
    camPitch: 0.32,
    hp: CFG.playerMaxHp,
    inCar: false,
    car: null,
    armed: false,      // pistol unlocked after M1
    ammo: 0,
    reserve: 0,
    reloading: false,
    reloadT: 0,
    punchCd: 0,
    speedKmh: 0,
    onGround: true,
    walkPhase: 0,
    lastHurtAt: -99,
    moving: false,
  };
}

// One fixed step of on-foot movement. Returns nothing; the camera is updated
// in render.js from camYaw / camPitch / pos.
export function stepPlayer(G, dt) {
  const p = G.player;
  if (p.inCar) return;
  const mouse = G.input.takeMouse();
  p.camYaw -= mouse.dx * 0.0032;
  p.camPitch = clamp(p.camPitch + mouse.dy * 0.0022, -0.15, 0.9);
  const mv = G.input.move();
  const sprint = G.input.sprint();
  const speed = sprint ? CFG.sprintSpeed : CFG.walkSpeed;
  // Camera-relative movement: W runs away from the camera.
  const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
  const rx = -fz, rz = fx;
  let dx = fx * mv.f + rx * mv.s;
  let dz = fz * mv.f + rz * mv.s;
  const len = Math.hypot(dx, dz);
  p.moving = len > 0.01;
  if (p.moving) {
    dx /= len; dz /= len;
    p.yaw = Math.atan2(dx, dz);
    let nx = p.pos.x + dx * speed * dt;
    let nz = p.pos.z + dz * speed * dt;
    const hit = resolveCollisions(G.city.colliders, nx, nz, CFG.playerRadius);
    nx = hit.x; nz = hit.z;
    p.pos.x = clamp(nx, -132, 132);
    p.pos.z = clamp(nz, -132, 212);
    p.walkPhase += dt * (sprint ? 13 : 9);
    if (G.rng.chance(dt * (sprint ? 6 : 2))) {
      G.effects.burst(p.pos.x, 0.1, p.pos.z, 0xccbbaa, 1, 0.6);
    }
  }
  // Jump + gravity.
  if (G.input.jump() && p.onGround) {
    p.velY = CFG.jumpSpeed;
    p.onGround = false;
  }
  if (!p.onGround) {
    p.velY -= CFG.gravity * dt;
    p.pos.y += p.velY * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.velY = 0; p.onGround = true; }
  }
  p.speedKmh = p.moving ? speed * 3.6 : 0;
  if (p.punchCd > 0) p.punchCd -= dt;
  // Reload timer.
  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const need = CFG.pistolMag - p.ammo;
      const take = Math.min(need, p.reserve);
      p.ammo += take; p.reserve -= take;
      p.reloading = false;
    }
  }
  // Pose the mesh.
  const v = p.visual;
  v.mesh.position.copy(p.pos);
  v.mesh.rotation.y = p.yaw;
  v.gun.visible = p.armed;
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.45 : 0;
  v.legs[0].rotation.x = swing;
  v.legs[1].rotation.x = -swing;
  v.mesh.visible = !p.inCar;
}
