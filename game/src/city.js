// Solmar Bay city builder: roads, buildings, pier, ferris wheel, neon,
// palms, lamps, sea and marina. Returns colliders (building AABBs) and the
// animated bits (ferris wheel, neon signs, lamps) for the frame loop.

import * as THREE from 'three';
import { WORLD, COLORS, LANDMARKS } from './config.js';
import { makeRng } from './random.js';

const ROAD_XS = [];
for (let x = -189; x <= 189; x += WORLD.roadGap) ROAD_XS.push(x);
const ROAD_ZS = [...ROAD_XS];

// snap a coordinate to the nearest road centre line (roads are clear of
// buildings, so a snapped point is never stuck inside a block)
export function nearestRoad(v) {
  let best = ROAD_XS[0];
  for (const r of ROAD_XS) {
    if (Math.abs(r - v) < Math.abs(best - v)) best = r;
  }
  return best;
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = true;
  return m;
}

function makePalm(x, z, rng) {
  const g = new THREE.Group();
  const h = rng.range(5, 7);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, h, 6),
    new THREE.MeshStandardMaterial({ color: COLORS.trunk, roughness: 1 }),
  );
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 2.6, 4),
      new THREE.MeshStandardMaterial({ color: COLORS.palm, roughness: 0.9 }),
    );
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, h + 0.6, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

function makeNeonSign(text, color, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const c = canvas.getContext('2d');
  c.fillStyle = '#111111';
  c.fillRect(0, 0, 256, 64);
  c.font = 'bold 34px Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = '#' + color.toString(16).padStart(6, '0');
  c.shadowBlur = 18;
  c.fillStyle = '#' + color.toString(16).padStart(6, '0');
  c.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.neonColor = color;
  return mesh;
}

// build the whole city into the scene; returns the animated city parts.
export function buildCity(scene) {
  const rng = makeRng(20261118);
  const city = {
    colliders: [],
    ferrisWheel: null,
    neonSigns: [],
    lamps: [],
    landmarks: LANDMARKS,
  };

  // ground: sidewalk-colored base for the whole city block area
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size + 60, WORLD.size + 60),
    new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // roads: asphalt strips along every road line
  const roadMat = new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.95 });
  for (const x of ROAD_XS) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.size), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.02, 0);
    r.receiveShadow = true;
    scene.add(r);
    // dashed centre line
    for (let z = -189; z <= 189; z += 14) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 5),
        new THREE.MeshBasicMaterial({ color: 0xd8c95a }),
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.04, z);
      scene.add(dash);
    }
  }
  for (const z of ROAD_ZS) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.roadWidth), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.02, z);
    r.receiveShadow = true;
    scene.add(r);
    for (let x = -189; x <= 189; x += 14) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xd8c95a }),
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.04, z);
      scene.add(dash);
    }
  }

  // sea + sand on the south edge
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 160),
    new THREE.MeshStandardMaterial({ color: COLORS.sea, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.6, WORLD.seaZ + 80);
  scene.add(sea);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 16),
    new THREE.MeshStandardMaterial({ color: COLORS.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, WORLD.seaZ + 6);
  sand.receiveShadow = true;
  scene.add(sand);

  // buildings on every block (skip landmark blocks and the sea strip)
  const landmarkBlocks = new Set([
    '-84,-84', '42,126', '42,-42', '-84,-42', '126,168',
  ]);
  for (let bx = -189; bx <= 147; bx += WORLD.roadGap) {
    for (let bz = -189; bz <= 147; bz += WORLD.roadGap) {
      const cx = bx + WORLD.roadGap / 2;
      const cz = bz + WORLD.roadGap / 2;
      if (cz > 168) continue;
      const key = `${cx},${cz}`;
      if (landmarkBlocks.has(key)) continue;
      const w = rng.range(16, 26);
      const d = rng.range(16, 26);
      const h = rng.chance(0.12) ? rng.range(28, 44) : rng.range(7, 22);
      const color = rng.pick(COLORS.building);
      const b = box(w, h, d, color, cx, h / 2, cz);
      scene.add(b);
      const roof = box(w * 0.7, 1.2, d * 0.7, 0x5a5348, cx, h + 0.6, cz);
      scene.add(roof);
      // lit window strips on taller buildings
      if (h > 20) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.5, h * 0.45),
          new THREE.MeshBasicMaterial({ color: 0xffd98a }),
        );
        win.position.set(cx, h * 0.55, cz + d / 2 + 0.06);
        scene.add(win);
      }
      city.colliders.push({
        minX: cx - w / 2, maxX: cx + w / 2,
        minZ: cz - d / 2, maxZ: cz + d / 2,
      });
    }
  }

  // Crown Tower: the tallest landmark, with a crown beacon
  const ct = LANDMARKS.crownTower;
  const tower = box(22, 58, 22, 0xe8dcc8, ct.x, 29, ct.z);
  scene.add(tower);
  const crown = box(14, 4, 14, COLORS.neonGold, ct.x, 60, ct.z, { emissive: COLORS.neonGold, emissiveIntensity: 0.9 });
  scene.add(crown);
  const ctSign = makeNeonSign('CROWN TOWER', COLORS.neonCyan, 18, 4.5);
  ctSign.position.set(ct.x, 46, ct.z + 11.1);
  scene.add(ctSign);
  city.neonSigns.push(ctSign);
  city.colliders.push({ minX: ct.x - 11, maxX: ct.x + 11, minZ: ct.z - 11, maxZ: ct.z + 11 });

  // Sal's Garage: low wide building with a neon sign
  const sg = LANDMARKS.salsGarage;
  const garage = box(24, 7, 16, 0xb8452e, sg.x, 3.5, sg.z);
  scene.add(garage);
  const sgSign = makeNeonSign("SAL'S GARAGE", COLORS.neonGold, 16, 4);
  sgSign.position.set(sg.x, 8.5, sg.z + 8.1);
  scene.add(sgSign);
  city.neonSigns.push(sgSign);
  city.colliders.push({ minX: sg.x - 12, maxX: sg.x + 12, minZ: sg.z - 8, maxZ: sg.z + 8 });

  // Harbor Clinic (health pack spot)
  const hc = LANDMARKS.hospital;
  const hosp = box(20, 12, 16, 0xe8e4da, hc.x, 6, hc.z);
  scene.add(hosp);
  const hcSign = makeNeonSign('HARBOR CLINIC', 0x7dff9a, 15, 3.8);
  hcSign.position.set(hc.x, 13.5, hc.z + 8.1);
  scene.add(hcSign);
  city.neonSigns.push(hcSign);
  city.colliders.push({ minX: hc.x - 10, maxX: hc.x + 10, minZ: hc.z - 8, maxZ: hc.z + 8 });

  // Neon Row: two shops on the block with a row of glowing signs facing the street
  const nr = LANDMARKS.neonRow;
  const neonWords = ['NEON', 'TIDE', 'SOLMAR', 'VICE'];
  const neonColors = [COLORS.neonPink, COLORS.neonCyan, COLORS.neonGold, 0xb06bff];
  for (let i = 0; i < 2; i++) {
    const x = nr.x - 10 + i * 20;
    const shop = box(12, 6, 10, 0x3a3f4a, x, 3, nr.z);
    scene.add(shop);
    city.colliders.push({ minX: x - 6, maxX: x + 6, minZ: nr.z - 5, maxZ: nr.z + 5 });
  }
  for (let i = 0; i < 4; i++) {
    const x = nr.x - 15 + i * 10;
    const sign = makeNeonSign(neonWords[i], neonColors[i], 9, 2.4);
    sign.position.set(x, 8 + (i % 2) * 1.5, nr.z + 5.2);
    scene.add(sign);
    city.neonSigns.push(sign);
  }

  // Solmar Pier: deck into the sea, 3 shops, ferris wheel at the end
  const pier = box(30, 1.5, WORLD.pierZ - WORLD.seaZ + 8, 0x8a6f4d, WORLD.pierX, 0.4, (WORLD.seaZ + WORLD.pierZ) / 2);
  pier.castShadow = false;
  scene.add(pier);
  for (const shop of LANDMARKS.pierShops) {
    const s = box(8, 5, 7, 0x4a5a6a, shop.x, 3.2, shop.z);
    scene.add(s);
    const sign = makeNeonSign('PIER SHOP', COLORS.neonPink, 7, 1.8);
    sign.position.set(shop.x, 6.4, shop.z + 3.6);
    scene.add(sign);
    city.neonSigns.push(sign);
    city.colliders.push({ minX: shop.x - 4, maxX: shop.x + 4, minZ: shop.z - 3.5, maxZ: shop.z + 3.5 });
  }
  // ferris wheel
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(WORLD.pierX, 0, WORLD.pierZ - 6);
  const supportA = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 26, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  supportA.position.set(-5, 13, 0);
  supportA.rotation.z = 0.35;
  wheelGroup.add(supportA);
  const supportB = supportA.clone();
  supportB.position.set(5, 13, 0);
  supportB.rotation.z = -0.35;
  wheelGroup.add(supportB);
  const wheel = new THREE.Group();
  wheel.position.set(0, 26, 0);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(11, 0.5, 8, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.neonPink, emissive: COLORS.neonPink, emissiveIntensity: 0.7 }),
  );
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 22, 6),
      new THREE.MeshStandardMaterial({ color: 0xcccccc }),
    );
    spoke.rotation.z = a;
    wheel.add(spoke);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2, 2),
      new THREE.MeshStandardMaterial({ color: i % 2 ? COLORS.neonCyan : COLORS.neonGold, emissive: i % 2 ? COLORS.neonCyan : COLORS.neonGold, emissiveIntensity: 0.4 }),
    );
    cabin.position.set(Math.cos(a) * 11, Math.sin(a) * 11, 0);
    wheel.add(cabin);
  }
  wheelGroup.add(wheel);
  scene.add(wheelGroup);
  city.ferrisWheel = wheel;

  // Marina Del Sol: a few boats near the shore
  const marina = LANDMARKS.marina;
  for (let i = 0; i < 3; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.2, 9),
      new THREE.MeshStandardMaterial({ color: [0xe8e4da, 0x2e6fd8, 0xd23b3b][i], roughness: 0.5 }),
    );
    hull.position.y = 0.4;
    boat.add(hull);
    const cabinB = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.4, 3),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    cabinB.position.set(0, 1.6, -1);
    boat.add(cabinB);
    boat.position.set(marina.x - 12 + i * 12, -0.2, WORLD.seaZ + 14);
    boat.rotation.y = rng.range(-0.3, 0.3);
    scene.add(boat);
  }

  // palms along Palmera Boulevard (x = 21) and near the pier
  for (let z = -168; z <= 168; z += 42) {
    scene.add(makePalm(15, z, rng));
    scene.add(makePalm(27, z + 21, rng));
  }
  for (let i = 0; i < 4; i++) scene.add(makePalm(-36 + i * 10, 204, rng));

  // street lamps along the main roads
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const x of [-63, 21, 105]) {
    for (let z = -168; z <= 168; z += 84) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lampMat);
      pole.position.set(x + 6, 3.5, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), bulbMat);
      bulb.position.set(x + 6, 7.1, z);
      scene.add(bulb);
      city.lamps.push(bulb);
    }
  }

  return city;
}

// point-in-AABB test against building colliders (radius = entity size)
export function collidesWithBuildings(city, x, z, radius) {
  for (const c of city.colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) {
      return c;
    }
  }
  return null;
}

// clamp a position inside the drivable city (pier is walkable, sea is not)
export function clampToCity(x, z) {
  const onPier = x > WORLD.pierX - 15 && x < WORLD.pierX + 15 && z > WORLD.seaZ - 4 && z < WORLD.pierZ + 2;
  if (onPier) return { x, z };
  return {
    x: Math.max(-208, Math.min(208, x)),
    z: Math.max(-208, Math.min(WORLD.seaZ - 2, z)),
  };
}

// animate the ferris wheel, pulse neon signs, glow lamps at night
export function updateCity(city, dt, hour, time) {
  if (city.ferrisWheel) city.ferrisWheel.rotation.z += dt * 0.25;
  const night = hour < 6 || hour > 19;
  const pulse = 0.75 + Math.sin(time * 2.2) * 0.25;
  for (const sign of city.neonSigns) {
    sign.material.opacity = 1;
    sign.material.transparent = false;
    const base = night ? 1 : 0.55;
    sign.scale.setScalar(1);
    sign.material.color.setScalar(1);
    sign.material.color.multiplyScalar(1);
    sign.userData.pulse = pulse * base;
  }
  for (const lamp of city.lamps) {
    lamp.material.color.setHex(night ? 0xffe9a8 : 0x8a8578);
  }
}
