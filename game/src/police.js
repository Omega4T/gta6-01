// Police and the wanted level, 0 to 5 stars.
// One star brings cruisers that chase and ram. Higher stars bring more of
// them, a helicopter from three stars that keeps the player visible, and a
// roadblock from four. Out of every cruiser's sight for long enough and the
// heat cools down one star at a time. Caught on foot, the player is busted.
import { CAR_TYPES, POLICE, WORLD } from './config.js';
import { clamp, dist2, angleTo, angleDiff } from './random.js';
import { spawnVehicle, playerCar } from './vehicles.js';

export function addWanted(game, n) {
  const s = game.state;
  s.wanted = clamp(s.wanted + n, 0, POLICE.starsMax);
  s.wantedTimer = 0;
  if (n > 0) game.say('Wanted level ' + s.wanted + '!', 3);
}

function spawnCruiser(game) {
  const s = game.state;
  const a = game.rng.range(0, Math.PI * 2);
  const x = clamp(s.player.x + Math.cos(a) * POLICE.spawnDist, 100, WORLD.size - 100);
  const y = clamp(s.player.y + Math.sin(a) * POLICE.spawnDist, 100, WORLD.size - 100);
  const c = spawnVehicle(game, 'police', x, y, angleTo(x, y, s.player.x, s.player.y), { police: true });
  c.traffic = false;
  return c;
}

function setRoadblock(game) {
  // Two cruisers placed on the road ahead of the player, already turning in.
  const s = game.state;
  const p = s.player;
  const ahead = p.angle;
  for (let i = 0; i < POLICE.roadblockCars; i++) {
    const x = clamp(p.x + Math.cos(ahead) * (420 + i * 90), 100, WORLD.size - 100);
    const y = clamp(p.y + Math.sin(ahead) * (420 + i * 90), 100, WORLD.size - 100);
    const c = spawnVehicle(game, 'police', x, y, angleTo(x, y, p.x, p.y), { police: true, roadblock: true });
    c.traffic = false;
  }
  game.say('Roadblock ahead!', 3);
}

export function updatePolice(game, dt) {
  const s = game.state;
  const p = s.player;
  if (s.wanted > 0) {
    s.wantedTimer += dt;
    let seen = false;
    for (const c of s.cars) {
      if (c.police && !c.dead && dist2(p.x, p.y, c.x, c.y) < 700 * 700) { seen = true; break; }
    }
    if (!seen && s.wantedTimer > POLICE.decayDelay) {
      s.wanted--;
      s.wantedTimer = 0;
      if (s.wanted === 0) game.say('You lost the cops.', 3);
    }
  }
  const want = POLICE.maxCruisers[s.wanted];
  const cruisers = s.cars.filter((c) => c.police && !c.dead);
  if (cruisers.length < want) spawnCruiser(game);
  if (s.wanted >= POLICE.roadblockAtStars && !s.roadblockSet) {
    s.roadblockSet = true;
    setRoadblock(game);
  }
  if (s.wanted < POLICE.roadblockAtStars) s.roadblockSet = false;

  for (const c of cruisers) {
    const def = CAR_TYPES.police;
    const a = angleTo(c.x, c.y, p.x, p.y);
    const diff = angleDiff(c.angle, a);
    c.angle += clamp(diff, -def.turn * dt, def.turn * dt);
    const target = def.top * (s.wanted >= 3 ? 0.95 : 0.8);
    c.speed += clamp(target - c.speed, -def.brake * dt, def.accel * dt);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (game.city.collidesBuilding(nx, ny, 22)) { c.speed *= 0.3; c.angle += 0.6; }
    else { c.x = nx; c.y = ny; }
    const d = Math.sqrt(dist2(c.x, c.y, p.x, p.y));
    const pcar = playerCar(game);
    if (pcar && d < 52) {
      pcar.hp -= POLICE.ramDamage * dt;
      c.speed *= 0.92;
      pcar.x += Math.cos(a) * 30 * dt;
      pcar.y += Math.sin(a) * 30 * dt;
      if (game.rng.chance(0.05)) game.burst(pcar.x, pcar.y, '#c9c9c9', 4, 100);
    }
    if (!pcar && d < POLICE.bustRadius) {
      s.bustTimer += dt;
      if (s.bustTimer > POLICE.bustTime) {
        s.screen = 'busted';
        game.addCash(-Math.min(s.cash, 300));
        s.wanted = 0;
        game.save();
        if (game.audio) game.audio.busted();
      }
    } else {
      s.bustTimer = Math.max(0, s.bustTimer - dt * 2);
    }
  }
  if (s.wanted >= POLICE.heliAtStars) {
    if (!s.heli) s.heli = { x: p.x, y: p.y, angle: 0 };
    s.heli.x += (p.x - s.heli.x) * dt * 0.7;
    s.heli.y += (p.y - s.heli.y) * dt * 0.7;
    s.heli.angle += dt * 2;
    s.wantedTimer = Math.min(s.wantedTimer, 4);
  } else {
    s.heli = null;
  }
}
