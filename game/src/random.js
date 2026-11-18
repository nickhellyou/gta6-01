// Seeded random helpers (mulberry32) so the city layout is stable per run
// while traffic and pedestrians still feel alive.

// mulberry32: small fast seeded PRNG with a uniform [0, 1) output.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    // next float in [0, 1)
    next() {
      return random();
    },
    // next float in [min, max)
    range(min, max) {
      return min + random() * (max - min);
    },
    // next integer in [min, max]
    int(min, max) {
      return Math.floor(min + random() * (max - min + 1));
    },
    // pick one element of an array
    pick(arr) {
      return arr[Math.floor(random() * arr.length)];
    },
    // true with probability p
    chance(p) {
      return random() < p;
    },
  };
}
