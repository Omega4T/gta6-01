// Traffic and pedestrians: the crowd that makes Solara City feel alive.
// Traffic cars drive the road grid and stop at red lights; pedestrians walk
// the sidewalks, cross at crosswalks and run from gunfire.

import { CFG } from './config.js';
import { rand, randi, pick, chance, clamp, dist } from './random.js';
import { ROAD_CENTERS, randomRoadPoint, randomSidewalkPoint, isOnRoad, nearestRoad, resolveBuildingCollision } from './city.js';
import { makeCar, driveCar, moveCar, collideCars } from './vehicles.js';

// Spawn the traffic fleet on the roads.
export function spawnTraffic(S) {
  const types = ['sedan', 'sedan', 'taxi', 'van', 'muscle', 'beach', 'truck'];
  for (let i = 0; i < CFG.trafficCount; i++) {
    const p = randomRoadPoint(S.rng);
    const vertical = Math.abs(Math.sin(p.ang)) > 0.5;
    const dir = chance(S.rng, 0.5) ? 1 : -1;
    const car = makeCar(pick(S.rng, types), p.x, p.y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), 'traffic');
    car.speed = rand(S.rng, 90, 190);
    car.cruise = car.speed;
    car.vertical = vertical;
    car.road = vertical ? p.x : p.y;
    car.dir = dir;
    car.lane = chance(S.rng, 0.5) ? 1 : -1;
    S.cars.push(car);
  }
}

// Spawn pedestrians on the sidewalks.
export function spawnPeds(S) {
  const shirts = ['#e84a4a', '#4a8ae8', '#e8c84a', '#7ae84a', '#e84ad4', '#e8e8e8', '#2a2a2a', '#f2a04a'];
  for (let i = 0; i < CFG.pedCount; i++) {
    const p = randomSidewalkPoint(S.rng);
    S.peds.push(newPed(S, p.x, p.y, pick(S.rng, shirts)));
  }
}

export function newPed(S, x, y, shirt) {
  return {
    x, y, shirt: shirt || '#e84a4a',
    tx: x, ty: y, speed: rand(S.rng, 40, 75),
    state: 'walk', fleeX: 0, fleeY: 0, wait: 0,
    walkPhase: Math.random() * Math.PI * 2,
    scared: 0,
  };
}

// Is the light green for this axis at this intersection, at this moment?
export function lightIsGreen(S, light, vertical) {
  const cycle = (S.time + light.phase) % 12;
  return vertical ? cycle < 6 : cycle >= 6;
}

// The nearest intersection ahead of a traffic car, if any.
function intersectionAhead(S, car) {
  const look = 130;
  const nx = car.x + Math.cos(car.ang) * look;
  const ny = car.y + Math.sin(car.ang) * look;
  for (const light of S.city.lights) {
    if (Math.abs(nx - light.x) < 70 && Math.abs(ny - light.y) < 70) return light;
  }
  return null;
}

export function updateTraffic(S, dt) {
  const half = CFG.roadWidth / 2;
  for (const car of S.cars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    // Target speed: cruise, slower near a red light or a car ahead.
    let target = car.cruise;
    const light = intersectionAhead(S, car);
    if (light && !lightIsGreen(S, light, car.vertical)) {
      const d = dist(car.x, car.y, light.x, light.y);
      if (d < 120) target = 0;
    }
    // Do not rear-end the car ahead on the same road.
    for (const other of S.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const ahead = dx * Math.cos(car.ang) + dy * Math.sin(car.ang);
      const side = Math.abs(-dx * Math.sin(car.ang) + dy * Math.cos(car.ang));
      if (ahead > 0 && ahead < 70 && side < 26) { target = 0; break; }
    }
    const want = target - car.speed;
    car.speed += clamp(want, -320 * dt, 200 * dt);
    // Steer along the road, with a lane offset, and turn at intersections.
    const road = nearestRoad(car.x, car.y);
    let wantAng = car.ang;
    if (car.vertical) {
      const laneX = car.road + car.lane * 28;
      wantAng = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const dx = laneX - car.x;
      wantAng += clamp(dx * 0.004, -0.3, 0.3) * Math.sign(car.dir);
      // At an intersection centre, sometimes turn onto the crossing road.
      if (Math.abs(car.y % CFG.roadGap - 300) < 14 && chance(S.rng, 0.006)) {
        car.vertical = false;
        car.road = 300 + Math.round((car.y - 300) / CFG.roadGap) * CFG.roadGap;
        car.dir = chance(S.rng, 0.5) ? 1 : -1;
        car.lane = chance(S.rng, 0.5) ? 1 : -1;
      }
    } else {
      const laneY = car.road + car.lane * 28;
      wantAng = car.dir > 0 ? 0 : Math.PI;
      const dy = laneY - car.y;
      wantAng += clamp(dy * 0.004, -0.3, 0.3) * Math.sign(car.dir);
      if (Math.abs(car.x % CFG.roadGap - 300) < 14 && chance(S.rng, 0.006)) {
        car.vertical = true;
        car.road = 300 + Math.round((car.x - 300) / CFG.roadGap) * CFG.roadGap;
        car.dir = chance(S.rng, 0.5) ? 1 : -1;
        car.lane = chance(S.rng, 0.5) ? 1 : -1;
      }
    }
    let diff = wantAng - car.ang;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.ang += clamp(diff, -1.6 * dt, 1.6 * dt);
    car.x += Math.cos(car.ang) * car.speed * dt;
    car.y += Math.sin(car.ang) * car.speed * dt;
    // Keep inside the world; loop around the edges.
    if (car.x < 60) car.x = CFG.worldSize - 80;
    if (car.x > CFG.worldSize - 60) car.x = 80;
    if (car.y < 60) car.y = CFG.worldSize - 80;
    if (car.y > CFG.worldSize - 60) car.y = 80;
    // A scared driver flees the player.
    const pd = dist(car.x, car.y, S.player.x, S.player.y);
    if (pd < 90 && S.player.heat > 0.5) car.speed = Math.min(car.speed + 120 * dt, car.cruise + 120);
  }
  // Pairwise bumps between traffic cars.
  for (let i = 0; i < S.cars.length; i++) {
    for (let j = i + 1; j < S.cars.length; j++) {
      const a = S.cars[i], b = S.cars[j];
      if (a.dead || b.dead) continue;
      if (a.driver === 'traffic' && b.driver === 'traffic') collideCars(S, a, b);
    }
  }
}

export function updatePeds(S, dt) {
  for (const ped of S.peds) {
    if (ped.state === 'flee') {
      const dx = ped.x - ped.fleeX, dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      ped.x += (dx / d) * 150 * dt;
      ped.y += (dy / d) * 150 * dt;
      ped.scared -= dt;
      if (ped.scared <= 0) { ped.state = 'walk'; pickPedTarget(S, ped); }
      continue;
    }
    const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      ped.wait -= dt;
      if (ped.wait <= 0) pickPedTarget(S, ped);
    } else {
      ped.x += (dx / d) * ped.speed * dt;
      ped.y += (dy / d) * ped.speed * dt;
    }
    ped.walkPhase += dt * 9;
    resolveBuildingCollision(S.city.buildings, ped, 10);
  }
}

// Pick a new sidewalk waypoint for a pedestrian.
export function pickPedTarget(S, ped) {
  const p = randomSidewalkPoint(S.rng);
  ped.tx = p.x; ped.ty = p.y;
  ped.wait = chance(S.rng, 0.25) ? rand(S.rng, 1, 4) : 0;
}

// Every pedestrian near a point runs away from it.
export function scatterPeds(S, x, y, radius) {
  for (const ped of S.peds) {
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeX = x; ped.fleeY = y;
      ped.scared = rand(S.rng, 2, 4);
    }
  }
}

// The nearest pedestrian to a point.
export function nearestPed(S, x, y, maxD) {
  let best = null, bestD = maxD || 80;
  for (const ped of S.peds) {
    const d = dist(ped.x, ped.y, x, y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
