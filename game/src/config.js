// Solmar Bay: Neon Tide — world constants, tuning and mission definitions.
// All systems read these values; nothing here touches the DOM or three.js.

export const WORLD = {
  size: 420,            // city spans -210..210 on x and z
  roadGap: 42,          // distance between road centre lines
  roadWidth: 11,
  blockSize: 31,        // building block side
  seaZ: 210,            // sea starts at z > seaZ (south edge)
  pierZ: 258,           // pier deck extends to this z
  pierX: -21,           // pier centre x
  groundY: 0,
};

export const COLORS = {
  skyDay: 0x87b5e0,
  skyDusk: 0xff9a5c,
  skyNight: 0x0b1026,
  sea: 0x1e6f8e,
  sand: 0xd9c08a,
  asphalt: 0x2e2e33,
  sidewalk: 0x8f8a80,
  building: [0xe8dcc8, 0xd8c9a8, 0xc9b18c, 0xb8a888, 0xe0cfa8, 0xd0b890],
  glass: 0x6fb7d9,
  neonPink: 0xff2e88,
  neonCyan: 0x22e6ff,
  neonGold: 0xffc233,
  palm: 0x2f7d4f,
  trunk: 0x7a5a38,
  carPalette: [0xd23b3b, 0x2e6fd8, 0xe8b93b, 0x3fae6a, 0xe8e4da, 0x222226, 0x7a4fd0, 0xe07b2e],
  policeCar: 0x1c2733,
  policeLightR: 0xff2222,
  policeLightB: 0x2266ff,
};

export const TUNING = {
  walkSpeed: 6,
  sprintSpeed: 10,
  jumpSpeed: 8,
  gravity: 22,
  carAccel: 16,
  carBrake: 26,
  carReverseAccel: 9,
  carMaxSpeed: 34,
  carTurn: 1.9,
  carDrag: 0.6,
  handbrakeDrag: 3.2,
  pistolDamage: 34,
  pistolAmmo: 12,
  punchDamage: 18,
  punchRange: 2.2,
  playerMaxHealth: 100,
  wantedDecaySeconds: 14,
  policeChaseSpeed: 30,
  copCatchDistance: 1.6,
  trafficCount: 14,
  pedCount: 18,
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    name: "M1 · First Wheels",
    briefing: "Ken needs wheels. Steal any car and bring it to Sal's Garage.",
    objective: 'Steal a car, then drive to the garage marker',
    reward: 500,
    unlock: 'pistol',
  },
  {
    id: 'pier-pressure',
    name: 'M2 · Pier Pressure',
    briefing: 'Collect the protection cash from the 3 pier shops. Rival crew will not like it.',
    objective: 'Collect cash from 3 pier shops (0/3)',
    reward: 800,
    unlock: null,
  },
  {
    id: 'neon-tide',
    name: 'M3 · Neon Tide',
    briefing: 'Night run. Deliver the package to Neon Row, then shake a 3-star heat.',
    objective: 'Deliver the package to Neon Row at night',
    reward: 1200,
    unlock: null,
  },
];

export const LANDMARKS = {
  crownTower: { x: -84, z: -84, name: 'Crown Tower' },
  salsGarage: { x: 42, z: 126, name: "Sal's Garage" },
  pierShops: [
    { x: -33, z: 232, name: 'Pier Shop 1' },
    { x: -21, z: 244, name: 'Pier Shop 2' },
    { x: -9, z: 232, name: 'Pier Shop 3' },
  ],
  neonRow: { x: 42, z: -42, name: 'Neon Row' },
  marina: { x: 126, z: 168, name: 'Marina Del Sol' },
  hospital: { x: -84, z: -42, name: 'Harbor Clinic' },
};

export const SAVE_KEY = 'tidekeeper-solmar-bay-save-v1';

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
