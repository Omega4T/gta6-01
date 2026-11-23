// Deterministic screenshot staging: a ?shot= parameter in the page URL sets
// up one exact scene — player, car, wanted level, time of day and mission —
// then runs a fixed number of frames and freezes, so the four screenshots
// are the same on every machine. The game itself never depends on it.

import { LANDMARKS } from './city.js';
import { makeCar, addHeat } from './vehicles.js';
import { startMission, startTaxi, startRace } from './missions.js';
import { spawnEnemy } from './combat.js';

// The four official shots and what each one sets up.
export const SHOTS = {
  chase: {
    label: 'Police chase at golden hour',
    file: '1-chase.png',
    time: 17 * 60 + 45,
    setup(S) {
      placePlayerInCar(S, 'sports', 2100, 2100, 0, 320);
      addHeat(S, 3.4);
      spawnChasers(S, 3);
      S.mission.index = 0;
      startMission(S, 0);
    },
  },
  foot: {
    label: 'On foot in Old Town at midday',
    file: '2-foot.png',
    time: 12 * 60,
    setup(S) {
      placePlayerOnFoot(S, 2174, 2250, 0);
      S.mission.index = 0;
      startMission(S, 0);
      startTaxi(S);
      // The fare waits a block away, so its marker does not cover the player.
      S.taxi.px = 2400; S.taxi.py = 2100;
    },
  },
  mission: {
    label: 'Dockside Debt shootout',
    file: '3-mission.png',
    time: 15 * 60 + 30,
    setup(S) {
      placePlayerOnFoot(S, LANDMARKS.docksDrop.x - 160, LANDMARKS.docksDrop.y - 60, 0);
      S.player.weapon = 'shotgun';
      S.mission.index = 2;
      startMission(S, 2);
      // Jump straight to the shootout step.
      S.mission.step = 1;
      S.mission.spawned = false;
      for (let i = 0; i < 3; i++) {
        spawnEnemy(S, LANDMARKS.docksDrop.x + (i - 1) * 90, LANDMARKS.docksDrop.y + 40, 60);
      }
      S.player.ammo.shotgun = 24;
    },
  },
  night: {
    label: 'Marina at night with a taxi fare',
    file: '4-night.png',
    time: 22 * 60,
    setup(S) {
      placePlayerInCar(S, 'taxi', 600, 2400, Math.PI / 2, 200);
      startTaxi(S);
      S.taxi.phase = 'toDest';
      S.taxi.dx = 900; S.taxi.dy = 2700;
      S.taxi.fare = 106;
      S.radio.station = 2;
    },
  },
};

function placePlayerInCar(S, type, x, y, ang, speed) {
  const car = makeCar(type, x, y, ang, 'player');
  car.speed = speed || 0;
  S.cars.push(car);
  S.player.inCar = car;
  S.player.onFoot = false;
  S.player.x = x; S.player.y = y;
  S.cam.x = x; S.cam.y = y;
}

function placePlayerOnFoot(S, x, y, ang) {
  S.player.onFoot = true;
  S.player.inCar = null;
  S.player.x = x; S.player.y = y;
  S.player.ang = ang;
  S.cam.x = x; S.cam.y = y;
}

// Three cruisers already closing in behind the player, staggered across
// the lanes so all three read in the frame.
function spawnChasers(S, count) {
  const p = S.player;
  const gaps = [120, 195, 265];
  const offsets = [-46, 34, -18];
  for (let i = 0; i < count; i++) {
    const behind = p.inCar ? p.inCar.ang + Math.PI : p.ang + Math.PI;
    const side = (p.inCar ? p.inCar.ang : p.ang) + Math.PI / 2;
    const gap = gaps[i % gaps.length];
    const off = offsets[i % offsets.length];
    const x = p.x + Math.cos(behind) * gap + Math.cos(side) * off;
    const y = p.y + Math.sin(behind) * gap + Math.sin(side) * off;
    const cop = makeCar('police', x, y, p.inCar ? p.inCar.ang : p.ang, 'police');
    cop.speed = 340;
    S.cars.push(cop);
    S.cops.push(cop);
  }
}

// Apply a named shot: clock, scene, then a fixed warm-up and a freeze.
// The mission banner is cleared so it never covers the screenshot.
export function applyShot(S, name) {
  const shot = SHOTS[name];
  if (!shot) return false;
  S.clock = shot.time;
  shot.setup(S);
  S.banner = null;
  S.shotName = name;
  return true;
}
