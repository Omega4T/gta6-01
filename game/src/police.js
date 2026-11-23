// The SCPD: wanted stars, chasing cruisers, roadblocks and the helicopter.
// Heat rises with crimes and falls when the player stays out of sight; the
// stars on the HUD are just the heat read through the config thresholds.

import { CFG } from './config.js';
import { rand, pick, chance, clamp, angleDiff, dist } from './random.js';
import { randomRoadPoint } from './city.js';
import { makeCar, driveCar, moveCar, collideCars, wantedStars, addHeat } from './vehicles.js';
import { scatterPeds } from './crowd.js';

// How many cruisers the current wanted level wants on the road.
export function desiredCops(S) {
  return Math.min(CFG.police.maxCops, wantedStars(S));
}

// Spawn one cruiser on a road near the player, out of immediate sight.
export function spawnCop(S) {
  const p = S.player;
  for (let tries = 0; tries < 12; tries++) {
    const spot = randomRoadPoint(S.rng);
    if (dist(spot.x, spot.y, p.x, p.y) < 500) continue;
    const cop = makeCar('police', spot.x, spot.y, spot.ang, 'police');
    cop.speed = 200;
    S.cars.push(cop);
    S.cops.push(cop);
    return cop;
  }
  return null;
}

// A roadblock: two cruisers parked across the road ahead of the player.
export function spawnRoadblock(S) {
  const p = S.player;
  const ang = p.inCar ? p.inCar.ang : p.ang;
  const bx = p.x + Math.cos(ang) * 420;
  const by = p.y + Math.sin(ang) * 420;
  for (const off of [-52, 52]) {
    const cx = bx + Math.cos(ang + Math.PI / 2) * off;
    const cy = by + Math.sin(ang + Math.PI / 2) * off;
    const cop = makeCar('police', cx, cy, ang + Math.PI / 2, 'roadblock');
    S.cars.push(cop);
    S.roadblocks.push(cop);
  }
  S.roadblockTimer = 24;
}

export function updatePolice(S, dt) {
  const p = S.player;
  const stars = wantedStars(S);

  // Wanted decay: only while no cop can see the player.
  let seen = false;
  for (const cop of S.cops) {
    if (!cop.dead && dist(cop.x, cop.y, p.x, p.y) < 520) { seen = true; break; }
  }
  if (S.heli) seen = true;
  if (!seen && stars > 0) {
    p.heat = Math.max(0, (p.heat || 0) - CFG.police.decayPerSecond * dt);
  }

  // Keep the cruiser count at the wanted level.
  const alive = S.cops.filter((c) => !c.dead);
  if (alive.length < desiredCops(S) && S.copSpawnTimer <= 0) {
    spawnCop(S);
    S.copSpawnTimer = 2.5;
  }
  S.copSpawnTimer -= dt;

  // Roadblocks at three stars and up, on a timer.
  S.roadblockTimer -= dt;
  if (stars >= 3 && S.roadblockTimer <= 0) spawnRoadblock(S);

  // The helicopter at four stars and up: it circles overhead and keeps the
  // player lit, so the wanted level cannot decay while it is up.
  if (stars >= 4 && !S.heli) {
    S.heli = { x: p.x, y: p.y - 160, ang: 0, alt: 1 };
  }
  if (stars < 4) S.heli = null;
  if (S.heli) {
    S.heli.ang += dt * 0.9;
    const tx = p.x + Math.cos(S.heli.ang) * 120;
    const ty = p.y + Math.sin(S.heli.ang) * 120 - 60;
    S.heli.x += (tx - S.heli.x) * dt * 1.2;
    S.heli.y += (ty - S.heli.y) * dt * 1.2;
  }

  // Chase: each live cruiser steers at the player and tries to ram.
  for (const cop of S.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const wantAng = Math.atan2(p.y - cop.y, p.x - cop.x);
    let diff = angleDiff(cop.ang, wantAng);
    // A cruiser that is badly off-course reverses out before turning.
    if (Math.abs(diff) > 2.2 && cop.speed > 40) {
      driveCar(cop, -0.6, Math.sign(diff), false, dt);
    } else {
      // Match speed to the distance: full speed from far away, a crawl up
      // close, and a stop on top of the player, so the cruiser arrives and
      // stays there instead of blowing past and circling back.
      const targetSpeed = clamp(d * 0.9, 0, cop.maxSpeed);
      let throttle;
      if (cop.speed < targetSpeed - 20) throttle = 1;
      else if (cop.speed > targetSpeed + 40) throttle = -0.8;
      else throttle = 0.3;
      driveCar(cop, throttle, clamp(diff * 1.4, -1, 1), false, dt);
    }
    moveCar(S, cop, dt);
    // Ramming the player on foot hurts, and ramming the player's car
    // damages it — but only a fast hit shoves. A slow cruiser sitting on
    // the player pins him down instead of pushing him away.
    if (d < 46) {
      if (p.onFoot && Math.abs(cop.speed) > 150) {
        p.hp -= 14 * dt;
        p.x += (p.x - cop.x) / (d || 1) * 60 * dt;
        p.y += (p.y - cop.y) / (d || 1) * 60 * dt;
      } else if (p.inCar && Math.abs(cop.speed) > 120) {
        p.inCar.hp -= 6 * dt;
        cop.speed *= 0.6;
      }
    }
    // Busted: a cruiser on top of the player on foot ends the run. The
    // timer builds while the cop is in contact and drains slowly when he
    // loses the player, so repeated close passes add up to a catch.
    if (p.onFoot && d < 34) {
      S.bustedTimer += dt;
      if (S.bustedTimer > 1.2) bustPlayer(S);
    } else {
      S.bustedTimer = Math.max(0, S.bustedTimer - dt);
    }
    if (cop.hp <= 0) {
      cop.dead = true;
      S.cops = S.cops.filter((c) => c !== cop);
    }
  }

  // Clean up dead and distant roadblocks.
  S.roadblocks = S.roadblocks.filter((c) => !c.dead && dist(c.x, c.y, p.x, p.y) < 1600);
  for (const rb of S.roadblocks) {
    if (rb.hp <= 0) rb.dead = true;
  }
  S.cars = S.cars.filter((c) => !c.dead || c.driver === 'player');
}

// Caught on foot: pay the fine, lose the heat, wake up at the safehouse.
export function bustPlayer(S) {
  const p = S.player;
  const fine = Math.min(p.cash, CFG.police.bustedFine);
  p.cash -= fine;
  p.heat = 0;
  p.hp = p.maxHealth;
  if (p.inCar) { p.inCar.driver = 'parked'; p.inCar = null; }
  p.onFoot = true;
  p.x = 1500; p.y = 2100;
  S.cops = [];
  S.heli = null;
  S.mode = 'busted';
  S.modeTimer = 0;
  S.audio.busted();
  S.banner = { title: 'BUSTED', sub: 'Fine paid: $' + fine, t: 0 };
}

// Killed: pay the hospital bill, lose the heat, wake up at the safehouse.
export function wastePlayer(S) {
  const p = S.player;
  const fine = Math.min(p.cash, CFG.police.wastedFine);
  p.cash -= fine;
  p.heat = 0;
  p.hp = p.maxHealth;
  p.armor = 0;
  if (p.inCar) { p.inCar.driver = 'parked'; p.inCar = null; }
  p.onFoot = true;
  p.x = 1500; p.y = 2100;
  S.cops = [];
  S.heli = null;
  S.mode = 'wasted';
  S.modeTimer = 0;
  S.audio.busted();
  S.banner = { title: 'WASTED', sub: 'Hospital bill: $' + fine, t: 0 };
}
