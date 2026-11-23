// Seeded random numbers plus the tiny angle and distance helpers the whole
// game shares. The city, the traffic and the missions all draw from streams
// forked off one seed, so the same seed always builds the same Solara City.
// Gameplay rolls never touch the layout stream: every purpose gets a fork.
export function createRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // Whole number in [min, max], both ends included.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // One entry out of a list.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // A fresh stream for one purpose, derived from this seed and a salt.
    fork(salt) {
      return createRandom((seed ^ Math.imul(salt, 2654435761)) >>> 0);
    },
    // Roll a whole number like a die with `sides` faces, 0-based.
    die(sides) {
      return Math.floor(next() * sides);
    },
  };
}

export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Squared distance: cheaper than a square root, enough for range checks.
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Shortest signed turn from angle a to angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Move `angle` toward `target` by at most maxStep radians.
export function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  return angle + clamp(d, -maxStep, maxStep);
}
