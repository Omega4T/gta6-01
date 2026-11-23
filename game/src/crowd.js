// Pedestrians: the crowd that makes the streets feel alive.
// Peds wander between random nearby points and never walk through buildings.
// Gunfire or a speeding car sends them fleeing, and a frightened ped may call
// the police. The crowd is topped up near the player so the visible streets
// are never empty; dead peds stay down where they fell.
import { DENSITY, WORLD } from './config.js';
import { clamp, dist2, angleTo } from './random.js';

const SHIRT_COLORS = [
  '#e8e0d0', '#7aa8ff', '#ff9a7a', '#b8e07a',
  '#d0a0e0', '#f2d06a', '#8ad0c8', '#e07a9a',
];

export function spawnPedestrian(game, x, y) {
  const ped = {
    x,
    y,
    angle: game.rng.range(0, Math.PI * 2),
    speed: game.rng.range(35, 70),
    hp: 30,
    flee: 0,
    color: game.rng.pick(SHIRT_COLORS),
    target: null,
    dead: false,
    callsCops: false,
  };
  game.state.peds.push(ped);
  return ped;
}

// Pick a new nearby wander target for a ped.
function pickTarget(game, ped) {
  ped.target = {
    x: clamp(ped.x + game.rng.range(-260, 260), 300, WORLD.size - 300),
    y: clamp(ped.y + game.rng.range(-260, 260), 300, WORLD.size - 300),
  };
}

// Gunfire or a crash at (x, y): peds in the radius run, and one of them may
// phone the police — but only if the player is not already wanted.
export function scareNearbyPeds(game, x, y, radius) {
  const st = game.state;
  for (const ped of st.peds) {
    if (ped.dead) continue;
    if (dist2(x, y, ped.x, ped.y) < radius * radius) {
      ped.flee = 3;
      if (!ped.callsCops) {
        ped.callsCops = true;
        if (st.wanted === 0 && game.rng.chance(0.4)) game.addWanted(1);
      }
    }
  }
}

export function updatePedestrians(game, dt) {
  const st = game.state;
  for (const ped of st.peds) {
    if (ped.dead) continue;
    if (ped.flee > 0) {
      // Fleeing: run straight away from the player for three seconds.
      ped.flee -= dt;
      const a = angleTo(st.player.x, st.player.y, ped.x, ped.y);
      ped.x += Math.cos(a) * 160 * dt;
      ped.y += Math.sin(a) * 160 * dt;
      ped.angle = a;
      continue;
    }
    if (!ped.target || dist2(ped.x, ped.y, ped.target.x, ped.target.y) < 20 * 20) pickTarget(game, ped);
    const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
    ped.angle = a;
    const nx = ped.x + Math.cos(a) * ped.speed * dt;
    const ny = ped.y + Math.sin(a) * ped.speed * dt;
    if (!game.city.collidesBuilding(nx, ny, 10)) {
      ped.x = nx;
      ped.y = ny;
    }
  }
  // Keep the crowd topped up near the player.
  const alive = st.peds.filter((p) => !p.dead).length;
  if (alive < DENSITY.pedestrians) {
    spawnPedestrian(
      game,
      clamp(st.player.x + game.rng.range(-550, 550), 300, WORLD.size - 300),
      clamp(st.player.y + game.rng.range(-550, 550), 300, WORLD.size - 300),
    );
  }
}
