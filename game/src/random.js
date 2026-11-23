// Seeded random numbers for Solara City: one deterministic stream drives the
// whole city layout, so every run of the game builds the same streets.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A number between low and high, from the given stream.
export function rand(rng, low, high) {
  return low + rng() * (high - low);
}

// A whole number between low and high, inclusive.
export function randi(rng, low, high) {
  return low + Math.floor(rng() * (high - low + 1));
}

// One element of an array, picked by the stream.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// True with the given probability, from the stream.
export function chance(rng, p) {
  return rng() < p;
}

// A shuffled copy of an array, using the stream.
export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

// Clamp a value into a range.
export function clamp(v, low, high) {
  return v < low ? low : v > high ? high : v;
}

// Shortest signed angle from a to b, in radians.
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Distance between two points.
export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
