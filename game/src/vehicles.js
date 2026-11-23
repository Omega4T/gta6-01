// Vehicles: spawning, player driving physics, and traffic.
// A car is a plain object on the game state; this file owns everything that
// moves one. Player driving is arcade: accelerate, brake, steer harder with
// speed, handbrake for drift. Traffic cars follow the nearest road line,
// stop at red lights, slow for the car ahead, and wrap around the map edges.
import { CAR_TYPES, POLICE, WORLD } from './config.js';
import { clamp, dist2, angleTo } from './random.js';

let nextCarId = 1;

export function resetCarIds() {
  nextCarId = 1;
}

export function spawnVehicle(game, type, x, y, angle, opts) {
  const o = opts || {};
  const def = CAR_TYPES[type];
  const car = {
    id: nextCarId++,
    type,
    x,
    y,
    angle,
    speed: 0,
    hp: def.hp,
    maxHp: def.hp,
    color: def.color,
    parked: !!o.parked,
    police: !!o.police,
    traffic: !o.parked && !o.police,
    dir: game.rng.pick([1, -1]),
    axis: game.rng.chance(0.5) ? 'x' : 'z',
    smoke: 0,
    dead: false,
    honk: 0,
    flee: 0,
    crashCd: 0,
    roadblock: !!o.roadblock,
  };
  game.state.cars.push(car);
  return car;
}

export function carById(game, id) {
  return game.state.cars.find((c) => c.id === id) || null;
}

export function playerCar(game) {
  const st = game.state;
  return st.playerCar ? carById(game, st.playerCar) : null;
}

// Closest non-police car to the player within maxD, for entering.
export function nearestCar(game, maxD) {
  const st = game.state;
  let best = null;
  let bd = maxD * maxD;
  for (const c of st.cars) {
    if (c.dead || c.police) continue;
    const d = dist2(st.player.x, st.player.y, c.x, c.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function enterCar(game, car) {
  const st = game.state;
  st.playerCar = car.id;
  car.parked = false;
  car.traffic = false;
  st.stats.carsStolen++;
  if (car.police) game.addWanted(1);
  game.say('Driving ' + CAR_TYPES[car.type].name + ' — E to exit, Shift = handbrake', 3);
  if (game.audio) game.audio.click();
}

export function exitCar(game) {
  const st = game.state;
  const car = playerCar(game);
  if (!car) return;
  st.playerCar = null;
  const a = car.angle + Math.PI / 2;
  st.player.x = car.x + Math.cos(a) * 34;
  st.player.y = car.y + Math.sin(a) * 34;
  st.player.angle = car.angle;
  car.speed = 0;
}

export function damageCar(game, car, amount) {
  car.hp -= amount;
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    game.explode(car.x, car.y);
  }
}

// Player driving: arcade physics with steering that bites harder at speed.
function drivePlayerCar(game, dt, input) {
  const st = game.state;
  const car = playerCar(game);
  if (!car) return;
  const def = CAR_TYPES[car.type];
  const axis = input.axis();
  const handbrake = input.running();
  const fwd = axis.y < 0 ? 1 : axis.y > 0 ? -0.55 : 0;
  if (fwd) car.speed += def.accel * fwd * dt * (handbrake ? 0.5 : 1);
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), def.brake * 0.4 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
  car.speed = clamp(car.speed, -def.top * 0.45, def.top);
  const grip = clamp(Math.abs(car.speed) / 220, 0, 1);
  const steer = axis.x * def.turn * grip * (car.speed < 0 ? -1 : 1) * (handbrake ? 1.5 : 1);
  if (Math.abs(car.speed) > 20) car.angle += steer * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.crashCd = Math.max(0, car.crashCd - dt);
  const hit = game.city.collidesBuilding(nx, ny, 22);
  if (hit) {
    const impact = Math.abs(car.speed);
    car.speed *= -0.25;
    if (car.crashCd <= 0 && impact > 60) {
      damageCar(game, car, Math.min(10, 2 + impact * 0.015));
      car.crashCd = 0.6;
      game.burst(nx, ny, '#c9c9c9', 6, 140);
      if (game.audio) game.audio.crash();
    }
  } else {
    car.x = nx;
    car.y = ny;
  }
  car.x = clamp(car.x, 60, WORLD.size - 60);
  car.y = clamp(car.y, 60, WORLD.size - 60);
  // Handbrake at speed kicks up tyre smoke.
  if (car.speed > 60 && handbrake && game.rng.chance(0.3)) {
    st.particles.push({
      x: car.x - Math.cos(car.angle) * 20,
      y: car.y - Math.sin(car.angle) * 20,
      vx: 0,
      vy: 0,
      life: 0.9,
      max: 0.9,
      color: '#888',
      size: 4,
    });
  }
  // Running over pedestrians is a crime, and it is loud.
  for (const ped of st.peds) {
    if (!ped.dead && dist2(car.x, car.y, ped.x, ped.y) < 26 * 26 && Math.abs(car.speed) > 80) {
      ped.dead = true;
      game.burst(ped.x, ped.y, '#c94f43', 10, 160);
      game.addWanted(1);
    }
  }
  st.player.x = car.x;
  st.player.y = car.y;
  st.player.angle = car.angle;
  car.smoke = car.hp < 25 ? 2 : car.hp < 50 ? 1 : 0;
  if (car.smoke && game.rng.chance(0.2)) {
    st.particles.push({
      x: car.x,
      y: car.y - 10,
      vx: game.rng.range(-10, 10),
      vy: -40,
      life: 0.8,
      max: 0.8,
      color: '#666',
      size: 5,
    });
  }
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    game.explode(car.x, car.y);
    exitCar(game);
    game.say('Your car blew up!', 3);
  }
}

export function updateDriving(game, dt, input) {
  if (playerCar(game)) drivePlayerCar(game, dt, input);
}

// Traffic: follow the nearest road line at a cruising speed, stop at red
// lights, slow down for the car ahead, and wrap around the map edges.
export function updateTraffic(game, dt) {
  const st = game.state;
  for (const car of st.cars) {
    if (car.dead || !car.traffic) continue;
    const def = CAR_TYPES[car.type];
    const onX = Math.abs(car.y - game.city.nearestRoadZ(car.y)) < Math.abs(car.x - game.city.nearestRoadX(car.x));
    let targetSpeed = def.top * 0.42;
    const lightPhase = (st.time % 8) < 4;
    const nearCross = Math.abs(car.x - game.city.nearestRoadX(car.x)) < 60
      && Math.abs(car.y - game.city.nearestRoadZ(car.y)) < 60;
    if (nearCross && !lightPhase) targetSpeed = 0;
    for (const other of st.cars) {
      if (other === car || other.dead) continue;
      if (dist2(car.x, car.y, other.x, other.y) < 70 * 70) {
        targetSpeed = Math.min(targetSpeed, 60);
        break;
      }
    }
    if (car.flee > 0) {
      car.flee -= dt;
      targetSpeed = def.top * 0.7;
    }
    car.speed += clamp(targetSpeed - car.speed, -def.brake * dt, def.accel * 0.6 * dt);
    if (onX) {
      car.angle = car.dir > 0 ? 0 : Math.PI;
      car.y += (game.city.nearestRoadZ(car.y) + (car.dir > 0 ? 22 : -22) - car.y) * dt * 2;
      car.x += Math.cos(car.angle) * car.speed * dt;
    } else {
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x += (game.city.nearestRoadX(car.x) + (car.dir > 0 ? -22 : 22) - car.x) * dt * 2;
      car.y += Math.sin(car.angle) * car.speed * dt;
    }
    if (car.x < 80) car.x = WORLD.size - 100;
    if (car.x > WORLD.size - 80) car.x = 100;
    if (car.y < 80) car.y = WORLD.size - 100;
    if (car.y > WORLD.size - 80) car.y = 100;
    if (game.city.collidesBuilding(car.x, car.y, 20)) {
      car.angle += Math.PI / 2;
      car.dir *= -1;
    }
  }
}
