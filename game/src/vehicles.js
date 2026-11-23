// Cars: physics, damage and stealing. A car is a circle with a heading, a
// speed and a type; the player, traffic and the police all drive the same
// bodies, so a stolen cruiser handles like a cruiser.

import { CFG } from './config.js';
import { clamp, angleDiff } from './random.js';
import { resolveBuildingCollision } from './city.js';

let carId = 1;

export function makeCar(type, x, y, ang, driver) {
  const spec = CFG.carTypes[type] || CFG.carTypes.sedan;
  return {
    id: carId++,
    type, name: spec.name,
    x, y, ang: ang || 0, speed: 0,
    maxSpeed: spec.maxSpeed, accel: spec.accel, grip: spec.grip,
    color: spec.color,
    hp: 100, driver: driver || 'parked',
    w: type === 'truck' || type === 'van' ? 52 : 46,
    h: type === 'truck' || type === 'van' ? 24 : 22,
    radius: 20,
    smoke: 0, dead: false, honk: 0,
    steer: 0, throttle: 0,
  };
}

// Drive one car for a frame. throttle -1..1, steer -1..1, handbrake true/false.
export function driveCar(car, throttle, steer, handbrake, dt) {
  const grip = handbrake ? car.grip * 0.45 : car.grip;
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) car.speed += car.accel * throttle * 0.7 * dt;
  else car.speed -= Math.sign(car.speed) * 140 * dt;
  if (Math.abs(car.speed) < 8 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -car.maxSpeed * 0.4, car.maxSpeed);
  const turn = steer * grip * 0.55 * dt * Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  car.ang += turn * Math.sign(car.speed || 1);
  car.x += Math.cos(car.ang) * car.speed * dt;
  car.y += Math.sin(car.ang) * car.speed * dt;
  if (handbrake && Math.abs(car.speed) > 150) {
    car.ang += steer * 0.9 * dt * Math.sign(car.speed);
  }
}

// Move the car and resolve building and world collisions.
export function moveCar(S, car, dt) {
  const hit = resolveBuildingCollision(S.city.buildings, car, car.radius);
  if (hit && Math.abs(car.speed) > 120) {
    damageCar(S, car, Math.abs(car.speed) * 0.06);
    car.speed *= 0.45;
  }
  return hit;
}

// Two cars bumping: push apart and trade a little damage and speed.
export function collideCars(S, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = a.radius + b.radius - 4;
  if (d >= min || d < 0.01) return false;
  const nx = dx / d, ny = dy / d;
  const push = (min - d) / 2;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const rel = Math.abs(a.speed - b.speed);
  if (rel > 140) {
    damageCar(S, a, rel * 0.03);
    damageCar(S, b, rel * 0.03);
    const tmp = a.speed; a.speed = b.speed * 0.6; b.speed = tmp * 0.6;
  }
  return true;
}

// Hurt a car; at zero health it explodes and is removed.
export function damageCar(S, car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  car.smoke = Math.max(car.smoke, amount * 0.02);
  if (car.hp <= 0) {
    car.dead = true;
    explodeCar(S, car);
  }
}

// An explosion: particles, sound, heat if the player caused it.
export function explodeCar(S, car) {
  S.audio.boom();
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 260;
    S.parts.push({ x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.5, max: 1.2, size: 3 + Math.random() * 5, color: Math.random() < 0.5 ? '#ff9a2a' : '#5a5a5a', kind: 'fire' });
  }
  S.parts.push({ x: car.x, y: car.y, vx: 0, vy: 0, life: 1.4, max: 1.4, size: 70, color: '#ff7a1a', kind: 'flash' });
  S.cam.shake = Math.max(S.cam.shake, 10);
  if (car.driver === 'player') {
    S.player.hp -= 25;
  }
}

// The nearest car the player could steal, within reach and not wrecked.
export function nearestStealableCar(S) {
  const p = S.player;
  let best = null, bestD = 78;
  for (const car of S.cars) {
    if (car.dead || car.driver === 'player') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// Step into the nearest car. Stealing in front of a cop adds heat.
export function enterCar(S) {
  const car = nearestStealableCar(S);
  if (!car) return false;
  const wasParked = car.driver === 'parked' || car.driver === 'traffic';
  car.driver = 'player';
  S.player.inCar = car;
  S.player.onFoot = false;
  S.player.x = car.x; S.player.y = car.y;
  if (wasParked) {
    S.stats.stolen++;
    addHeat(S, CFG.police.heatPerTheft * 0.5);
  }
  return true;
}

// Step out beside the car, on foot again.
export function exitCar(S) {
  const car = S.player.inCar;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  const side = car.ang + Math.PI / 2;
  S.player.x = car.x + Math.cos(side) * 34;
  S.player.y = car.y + Math.sin(side) * 34;
  S.player.onFoot = true;
  S.player.inCar = null;
}

// Add wanted heat; the police module turns heat into stars.
export function addHeat(S, amount) {
  S.player.heat = Math.min(8, (S.player.heat || 0) + amount);
}

// The wanted star count from the current heat.
export function wantedStars(S) {
  const heat = S.player.heat || 0;
  const t = CFG.police.wantedThresholds;
  let stars = 0;
  for (let i = 0; i < t.length; i++) {
    if (heat >= t[i]) stars = i;
  }
  return stars;
}
