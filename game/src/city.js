// city.js — builds Solmar Bay: the ground, roads, pastel buildings, palms,
// the Crown Tower, the pier with its ferris wheel, Neon Row and the street
// signs that name the place. Also owns the building colliders and the street
// network the traffic, pedestrians and missions all drive on.
import * as THREE from 'three';
import { CFG, PALETTE, PLACES } from './config.js';
import { clamp } from './random.js';

// Street centrelines: between the 5x5 blocks, pitch 54 m.
export const STREET_LINES = [-81, -27, 27, 81];
const PITCH = CFG.blockSize + CFG.streetWidth;

function textTexture(text, opts) {
  const { w = 512, h = 128, bg = '#10202e', fg = '#ffffff', font = 64, sub = '' } = opts || {};
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${font}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h / 2 - 18 : h / 2);
  if (sub) {
    g.font = `28px system-ui, sans-serif`;
    g.fillText(sub, w / 2, h / 2 + 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(base, rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 14; y < 244; y += 26) {
    for (let x = 12; x < 116; x += 26) {
      const lit = rng.chance(0.55);
      g.fillStyle = lit ? '#ffe9a8' : '#2c3a4a';
      g.fillRect(x, y, 16, 18);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm() {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 5.2, 6), trunkMat);
  trunk.position.y = 2.6; trunk.rotation.z = 0.08;
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.3, Math.sin(a) * 1.1);
    leaf.rotation.set(Math.sin(a) * 0.9, -a, Math.cos(a) * 0.9);
    palm.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a1f }));
  nut.position.y = 5.1; palm.add(nut);
  return palm;
}

export function createCity(scene, rng) {
  const colliders = [];
  const animated = { wheel: null, neons: [] };
  const H = CFG.cityHalf;

  // Ground: grass-green city slab, then roads, sidewalks, sand and sea.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 60, H * 2 + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 30);
  ground.receiveShadow = true; scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const s of STREET_LINES) {
    for (const [w, l, x, z] of [
      [CFG.streetWidth, H * 2, s, 0], [H * 2, CFG.streetWidth, 0, s],
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
      road.rotation.x = -Math.PI / 2; road.position.set(x, 0, z);
      road.receiveShadow = true; scene.add(road);
    }
  }
  // Outer ring road.
  for (const [w, l, x, z] of [[CFG.streetWidth, H * 2, -H + 7, 0], [CFG.streetWidth, H * 2, H - 7, 0],
    [H * 2, CFG.streetWidth, 0, -H + 7], [H * 2, CFG.streetWidth, 0, H - 7]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(x, 0, z);
    road.receiveShadow = true; scene.add(road);
  }
  // Centre-line dashes on every street.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const s of STREET_LINES) {
    for (let d = -120; d <= 120; d += 12) {
      for (const [x, z, ry] of [[s, d, 0], [d, s, Math.PI / 2]]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), dashMat);
        dash.rotation.x = -Math.PI / 2; dash.rotation.z = ry;
        dash.position.set(x, 0.02, z); scene.add(dash);
      }
    }
  }
  // Sidewalk slabs around each block.
  for (let bx = -2; bx <= 2; bx++) {
    for (let bz = -2; bz <= 2; bz++) {
      if (bx === 0 && bz === 0) continue; // Crown Tower plaza
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CFG.blockSize + 6, CFG.blockSize + 6), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(bx * PITCH, 0.01, bz * PITCH);
      walk.receiveShadow = true; scene.add(walk);
    }
  }

  // Buildings: one or two pastel towers per block, with lit-window facades.
  const baseColors = PALETTE.buildings.map((c) => '#' + c.toString(16).padStart(6, '0'));
  for (let bx = -2; bx <= 2; bx++) {
    for (let bz = -2; bz <= 2; bz++) {
      if (bx === 0 && bz === 0) continue;
      const cx = bx * PITCH, cz = bz * PITCH;
      const twin = rng.chance(0.4);
      const spots = twin ? [[-9, -9, 16, 16], [10, 10, 15, 15]] : [[0, 0, 30, 30]];
      for (const [ox, oz, w, d] of spots) {
        const h = rng.range(8, twin ? 20 : 30);
        const color = rng.pick(baseColors);
        const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(color, rng) });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true; b.receiveShadow = true; scene.add(b);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
        // Roof rim so towers read at a distance.
        const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1),
          new THREE.MeshLambertMaterial({ color: 0xffffff }));
        rim.position.set(cx + ox, h + 0.3, cz + oz); scene.add(rim);
      }
    }
  }

  // Crown Tower: the landmark. 85 m gold-crowned tower on the central plaza.
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(52, 52),
    new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 0);
  plaza.receiveShadow = true; scene.add(plaza);
  const towerMat = new THREE.MeshLambertMaterial({ map: facadeTexture('#ffd166', rng), emissive: 0x332200 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(18, 85, 18), towerMat);
  tower.position.set(0, 42.5, 0); tower.castShadow = true; scene.add(tower);
  colliders.push({ minX: -9, maxX: 9, minZ: -9, maxZ: 9 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0xffc300, emissive: 0x664400 }));
  crown.position.set(0, 88, 0); crown.castShadow = true; scene.add(crown);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 10, 6),
    new THREE.MeshLambertMaterial({ color: 0xff2e88, emissive: 0x881144 }));
  spike.position.set(0, 95, 0); scene.add(spike);
  const towerSign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5),
    new THREE.MeshBasicMaterial({ map: textTexture('CROWN TOWER', { bg: '#1a2a4a', fg: '#ffd166' }) }));
  // Mid-tower sign band: high enough to read as tower signage, low enough
  // to be seen from street level (the crown is the top of the tower).
  towerSign.position.set(0, 38, 9.2); scene.add(towerSign);
  const towerSign2 = towerSign.clone(); towerSign2.rotation.y = Math.PI; towerSign2.position.z = -9.2; scene.add(towerSign2);
  // West + east faces, so the name reads from every approach.
  const towerSignW = towerSign.clone(); towerSignW.rotation.y = -Math.PI / 2; towerSignW.position.set(-9.2, 38, 0); scene.add(towerSignW);
  const towerSignE = towerSign.clone(); towerSignE.rotation.y = Math.PI / 2; towerSignE.position.set(9.2, 38, 0); scene.add(towerSignE);

  // Palms along Palmera Boulevard (the x = -27 street) and the marina front.
  for (let z = -120; z <= 120; z += 18) {
    for (const x of [-35.5, -18.5]) {
      const palm = makePalm(); palm.position.set(x, 0, z + rng.range(-2, 2)); scene.add(palm);
    }
  }
  for (let x = -120; x <= 120; x += 22) {
    const palm = makePalm(); palm.position.set(x, 0, 122); scene.add(palm);
  }

  // The sea, the beach and Solmar Pier (south, z > 135) with a ferris wheel.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 60, 22),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.01, H + 11); scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 200, 160),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, H + 100); scene.add(sea);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 0.24, 80), pierMat);
  pier.position.set(-27, 0, H + 40); pier.receiveShadow = true; scene.add(pier);
  // No collider for the pier deck itself: it is a walkway, not a wall. The
  // shops on it have their own colliders.
  const pierSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.4),
    new THREE.MeshBasicMaterial({ map: textTexture('SOLMAR PIER', { bg: '#0e3a5c', fg: '#ffffff' }) }));
  pierSign.position.set(-27, 4.5, H + 2.5); scene.add(pierSign);

  // Ferris wheel at the end of the pier.
  const wheel = new THREE.Group();
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xff2e88 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(11, 0.35, 8, 40), rimMat));
  const spokeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 22, 0.4), spokeMat);
    spoke.rotation.z = (i / 6) * Math.PI; wheel.add(spoke);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshLambertMaterial({ color: PALETTE.neon[i % PALETTE.neon.length] }));
    cab.position.set(Math.cos(a) * 11, Math.sin(a) * 11, 0); wheel.add(cab);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 8), spokeMat);
  axle.rotation.x = Math.PI / 2; wheel.add(axle);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 22, 0.8), spokeMat);
  legL.position.set(-5, -10, 0); legL.rotation.z = 0.3; wheel.add(legL);
  const legR = legL.clone(); legR.position.x = 5; legR.rotation.z = -0.3; wheel.add(legR);
  wheel.position.set(-27, 19, H + 68); scene.add(wheel);
  animated.wheel = wheel;

  // Pier shops: three small kiosks the M2 collections use.
  const shopNames = ['TACO SOL', 'SURF SHACK', 'PIER ARCADE'];
  const pierShops = [];
  shopNames.forEach((name, i) => {
    const z = H + 22 + i * 20;
    // Shops sit ON the pier deck (deck spans x -35..-19), alternating sides.
    const x = i % 2 === 0 ? -31.5 : -22.5;
    const shop = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 6),
      new THREE.MeshLambertMaterial({ color: PALETTE.buildings[i % PALETTE.buildings.length] }));
    shop.position.set(x, 2.25, z); shop.castShadow = true; scene.add(shop);
    colliders.push({ minX: x - 3.5, maxX: x + 3.5, minZ: z - 3, maxZ: z + 3 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.8),
      new THREE.MeshBasicMaterial({ map: textTexture(name, { bg: '#10202e', fg: '#ffe600', font: 44 }) }));
    sign.position.set(x, 5.4, z + (i % 2 === 0 ? 3.1 : -3.1));
    if (i % 2 === 1) sign.rotation.y = Math.PI;
    scene.add(sign);
    pierShops.push({ name, x: -27, z, shopX: x });
  });

  // Neon Row: the x = 27 street, neon signs on both sides.
  const neonNames = ['NEON ROW', 'HOTEL SOL', 'CLUB VOLT', 'CASINO LUZ', 'TACO SOL'];
  neonNames.forEach((name, i) => {
    const z = -80 + i * 40;
    const x = i % 2 === 0 ? 18.5 : 35.5;
    const color = PALETTE.neon[i % PALETTE.neon.length];
    const mat = new THREE.MeshBasicMaterial({
      map: textTexture(name, { bg: '#0a0a18', fg: '#' + color.toString(16).padStart(6, '0'), font: 56 }),
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), mat);
    sign.position.set(x, 9 + (i % 3), z);
    sign.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(sign);
    animated.neons.push(mat);
  });

  // Street-name signs at the big intersections.
  const streetSigns = [
    ['PALMERA BOULEVARD', -27, -120], ['PALMERA BOULEVARD', -27, 120],
    ['NEON ROW', 27, -120], ['MARINA DEL SOL', -100, 128],
  ];
  for (const [name, x, z] of streetSigns) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x555555 }));
    post.position.set(x + 8, 2, z); scene.add(post);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.6),
      new THREE.MeshBasicMaterial({ map: textTexture(name, { bg: '#0d5c2e', fg: '#ffffff', font: 44 }) }));
    sign.position.set(x + 8, 4.4, z); scene.add(sign);
  }

  // Sal's Garage: a low workshop on the west edge, the M1 delivery point.
  const garage = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0xe07a5f }));
  garage.position.set(-118, 3, 81); garage.castShadow = true; scene.add(garage);
  colliders.push({ minX: -126, maxX: -110, minZ: 75, maxZ: 87 });
  const gSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3),
    new THREE.MeshBasicMaterial({ map: textTexture("SAL'S GARAGE", { bg: '#3a1c0f', fg: '#ffd166', font: 52 }) }));
  gSign.position.set(-110, 7.2, 81); gSign.rotation.y = Math.PI / 2; scene.add(gSign);
  const garageDoor = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5),
    new THREE.MeshLambertMaterial({ color: 0x333a44 }));
  garageDoor.position.set(-109.9, 2.25, 81); garageDoor.rotation.y = Math.PI / 2; scene.add(garageDoor);

  // Park benches + crates as small props (no colliders: they are low enough to step over visually).
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  for (let i = 0; i < 14; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.9), benchMat);
    bench.position.set(rng.range(-120, 120), 0.5, rng.pick([-35.5, -18.5, 18.5, 35.5]));
    scene.add(bench);
  }

  function update(dt, t) {
    if (animated.wheel) animated.wheel.rotation.z += dt * 0.12;
    // Neon signs breathe: one of them dims briefly on a slow cycle.
    animated.neons.forEach((mat, i) => {
      mat.opacity = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.7);
      mat.transparent = true;
    });
  }

  // A random point on a street centreline, for traffic and pedestrian spawns.
  function streetPoint() {
    if (rng.chance(0.5)) return { x: rng.pick(STREET_LINES), z: rng.range(-125, 125), along: 'z' };
    return { x: rng.range(-125, 125), z: rng.pick(STREET_LINES), along: 'x' };
  }

  return {
    colliders, update, streetPoint,
    garagePos: { x: -106, z: 81 },
    pierShops,
    towerPos: { x: 0, z: 0 },
    bounds: H,
  };
}

// True when (x, z) is inside any building collider (with a margin in metres).
export function hitsCollider(colliders, x, z, margin) {
  for (const c of colliders) {
    if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return c;
  }
  return null;
}

// Push a circle (x, z, radius) out of building colliders; returns corrected x/z.
export function resolveCollisions(colliders, x, z, radius) {
  for (const c of colliders) {
    const cx = clamp(x, c.minX, c.maxX);
    const cz = clamp(z, c.minZ, c.maxZ);
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * radius;
      z = cz + (dz / d) * radius;
    } else if (d2 <= 0.0001) {
      // Inside the box: push out along the smallest penetration axis.
      const pl = x - (c.minX - radius), pr = (c.maxX + radius) - x;
      const pt = z - (c.minZ - radius), pb = (c.maxZ + radius) - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - radius;
      else if (m === pr) x = c.maxX + radius;
      else if (m === pt) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z };
}
