// Police and the wanted level, 0 to 5 stars.
// One star brings cruisers that chase and ram. Higher stars bring more of
// them, a helicopter from three stars that keeps the player visible, and a
// roadblock from four. Out of every cruiser's sight for long enough and the
// heat cools down one star at a time. Caught on foot, the player is busted.
import { CAR_TYPES, POLICE, WORLD } from './config.js';
import { clamp, dist2, angleTo, angleDiff } from './random.js';
import { spawnVehicle, playerCar } from './vehicles.js';

export function addWanted(game, n) {
  const st = game.state;
  st.wanted = clamp(st.wanted + n, 0, POLICE.starsMax);
  st.wantedTimer = 0;
  if (n > 0) game.say('Wanted level ' + st.wanted + '!', 3);
}

// One cruiser spawns at a fixed distance in a random direction from the player.
function spawnCruiser(game) {
  const st = game.state;
  const a = game.rng.range(0, Math.PI * 2);
  const x = clamp(st.player.x + Math.cos(a) * POLICE.spawnDist, 100, WORLD.size - 100);
  const y = clamp(st.player.y + Math.sin(a) * POLICE.spawnDist, 100, WORLD.size - 100);
  const c = spawnVehicle(game, 'police', x, y, angleTo(x, y, st.player.x, st.player.y), { police: true });
  c.traffic = false;
  return c;
}

// Two cruisers placed on the road ahead of the player, already turning in.
function setRoadblock(game) {
  const st = game.state;
  const p = st.player;
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
  const st = game.state;
  const p = st.player;
  if (st.wanted > 0) {
    // Cool down one star after a long quiet spell out of every cruiser's sight.
    st.wantedTimer += dt;
    let seen = false;
    for (const c of st.cars) {
      if (c.police && !c.dead && dist2(p.x, p.y, c.x, c.y) < 700 * 700) {
        seen = true;
        break;
      }
    }
    if (!seen && st.wantedTimer > POLICE.decayDelay) {
      st.wanted--;
      st.wantedTimer = 0;
      if (st.wanted === 0) game.say('You lost the cops.', 3);
    }
  }
  const want = POLICE.maxCruisers[st.wanted];
  const cruisers = st.cars.filter((c) => c.police && !c.dead);
  if (cruisers.length < want) spawnCruiser(game);
  if (st.wanted >= POLICE.roadblockAtStars && !st.roadblockSet) {
    st.roadblockSet = true;
    setRoadblock(game);
  }
  if (st.wanted < POLICE.roadblockAtStars) st.roadblockSet = false;

  for (const c of cruisers) {
    const def = CAR_TYPES.police;
    const a = angleTo(c.x, c.y, p.x, p.y);
    const diff = angleDiff(c.angle, a);
    c.angle += clamp(diff, -def.turn * dt, def.turn * dt);
    const target = def.top * (st.wanted >= 3 ? 0.95 : 0.8);
    c.speed += clamp(target - c.speed, -def.brake * dt, def.accel * dt);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (game.city.collidesBuilding(nx, ny, 22)) {
      c.speed *= 0.3;
      c.angle += 0.6;
    } else {
      c.x = nx;
      c.y = ny;
    }
    const d = Math.sqrt(dist2(c.x, c.y, p.x, p.y));
    const pcar = playerCar(game);
    if (pcar && d < 52) {
      // Ram: shove the player's car and chew its hit points.
      pcar.hp -= POLICE.ramDamage * dt;
      c.speed *= 0.92;
      pcar.x += Math.cos(a) * 30 * dt;
      pcar.y += Math.sin(a) * 30 * dt;
      if (game.rng.chance(0.05)) game.burst(pcar.x, pcar.y, '#c9c9c9', 4, 100);
    }
    if (!pcar && d < POLICE.bustRadius) {
      st.bustTimer += dt;
      if (st.bustTimer > POLICE.bustTime) {
        st.screen = 'busted';
        game.addCash(-Math.min(st.cash, 300));
        st.wanted = 0;
        game.save();
        if (game.audio) game.audio.busted();
      }
    } else {
      st.bustTimer = Math.max(0, st.bustTimer - dt * 2);
    }
  }
  // The helicopter hovers over the player from three stars and keeps the
  // heat from cooling, so the player has to break line of sight properly.
  if (st.wanted >= POLICE.heliAtStars) {
    if (!st.heli) st.heli = { x: p.x, y: p.y, angle: 0 };
    st.heli.x += (p.x - st.heli.x) * dt * 0.7;
    st.heli.y += (p.y - st.heli.y) * dt * 0.7;
    st.heli.angle += dt * 2;
    st.wantedTimer = Math.min(st.wantedTimer, 4);
  } else {
    st.heli = null;
  }
}
