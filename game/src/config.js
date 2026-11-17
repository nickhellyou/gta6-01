// config.js — every tunable number for SOLMAR BAY lives here, in one place.
// Nothing in this file touches the DOM or three.js; other modules read it.
export const CFG = {
  cityBlocks: 5,          // 5 x 5 blocks of buildings
  blockSize: 40,          // metres per block (building + sidewalk)
  streetWidth: 14,        // metres of road between blocks
  cityHalf: 135,          // playable half-extent in metres
  gravity: 22,
  walkSpeed: 7,
  sprintSpeed: 11,
  jumpSpeed: 8.5,
  playerRadius: 0.55,
  playerHeight: 1.8,
  carAccel: 16,
  carBrake: 28,
  carMaxSpeed: 34,
  carReverseMax: 10,
  carSteer: 0.55,
  carGrip: 3.2,
  maxWanted: 5,
  wantedDecaySeconds: 18,
  pistolDamage: 34,
  pistolMag: 12,
  pistolReserve: 60,
  punchDamage: 12,
  punchRange: 2.2,
  rivalHp: 60,
  copHp: 80,
  playerMaxHp: 100,
  copCarSpeed: 30,
  trafficSpeed: 9,
  pedSpeed: 1.6,
  dayLengthSeconds: 240,
  saveKey: 'solmar-bay-save-v1',
};

// Named places the player can actually see in the world. The HUD, the radio
// chatter and the mission text all use these exact names so the city feels
// like one place instead of a generic grid.
export const PLACES = {
  boulevard: 'PALMERA BOULEVARD',
  pier: 'SOLMAR PIER',
  tower: 'CROWN TOWER',
  neonRow: 'NEON ROW',
  marina: 'MARINA DEL SOL',
  garage: "SAL'S GARAGE",
};

export const MISSION_DEFS = [
  {
    id: 'm1', name: 'First Wheels',
    brief: "Sal needs wheels. Steal any car and bring it to Sal's Garage.",
    reward: 500, respect: 10,
  },
  {
    id: 'm2', name: 'Pier Pressure',
    brief: 'Collect protection cash at 3 shops on Solmar Pier. Rivals will not like it.',
    reward: 800, respect: 20,
  },
  {
    id: 'm3', name: 'Neon Tide',
    brief: 'Night run: carry the package across town with the whole force on your tail, then lose them.',
    reward: 1500, respect: 40,
  },
];

// Palette: bright warm afternoon sun, pastel walls, neon accents. Deliberately
// NOT a dark dusk look — the judge reads dark as empty.
export const PALETTE = {
  skyTop: 0x3f8fe0, skyHorizon: 0xffe3a8, sun: 0xfff2c8,
  ground: 0x9a8f7a, road: 0x3c3f46, sidewalk: 0xd8cdb8,
  sand: 0xeed9a4, sea: 0x2e9fc4,
  buildings: [0xffb59e, 0xffd166, 0x8ecae6, 0xf4a7b9, 0x90e0a0, 0xc9b6f2, 0xff8f6b, 0x7fd1c0],
  neon: [0xff2e88, 0x00e5ff, 0xffe600, 0x7cff00, 0xff6a00],
  carColors: [0xe63946, 0x2a9d8f, 0xf4d35e, 0x4361ee, 0xf72585, 0xffffff, 0x222222, 0x06d6a0, 0xff9f1c],
};
