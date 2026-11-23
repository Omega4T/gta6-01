// Missions and side jobs: eight story jobs from the fixer Marisol Vega, plus
// taxi fares, a street race and twelve hidden packages. Each mission is a
// list of small steps the player works through in order.

import { CFG } from './config.js';
import { rand, pick, chance, dist } from './random.js';
import { LANDMARKS, randomSidewalkPoint, randomRoadPoint } from './city.js';
import { makeCar, addHeat } from './vehicles.js';
import { spawnEnemy } from './combat.js';
import { newPed } from './crowd.js';
import { addFloatText } from './combat.js';

// The eight story missions, as step lists. Positions come from the landmarks.
export function missionSteps(S, index) {
  const L = LANDMARKS;
  switch (index) {
    case 0:
      return [
        { kind: 'pickup', x: L.docksDrop.x, y: L.docksDrop.y, label: 'Pick up the parcel at the Docks' },
        { kind: 'deliver', x: L.oldTown.x, y: L.oldTown.y, label: 'Deliver the parcel to Old Town' },
      ];
    case 1:
      return [
        { kind: 'steal', type: 'sports', label: 'Steal a Viento GT' },
        { kind: 'deliver', x: L.safehouse.x, y: L.safehouse.y, label: 'Bring the Viento to the garage lot' },
      ];
    case 2:
      return [
        { kind: 'goto', x: L.docksDrop.x, y: L.docksDrop.y, label: 'Get to the Docks warehouse' },
        { kind: 'kill', count: 4, cx: L.docksDrop.x, cy: L.docksDrop.y, label: 'Settle the debt — 4 crew left' },
      ];
    case 3:
      return [
        { kind: 'fares', count: 3, label: 'Drive the cab — 3 fares to go' },
      ];
    case 4:
      return [
        { kind: 'race', time: 75, label: 'Race the checkpoints — 75 seconds' },
      ];
    case 5:
      return [
        { kind: 'escape', label: 'Lose the cops — get your wanted level to zero' },
      ];
    case 6:
      return [
        { kind: 'pickup', x: L.docksDrop.x, y: L.docksDrop.y, label: 'Pick up the cargo at the Docks' },
        { kind: 'deliver', x: L.marina.x, y: L.marina.y, label: 'Deliver the cargo to the Marina' },
      ];
    default:
      return [
        { kind: 'goto', x: L.bank.x, y: L.bank.y, label: 'Get to the Uptown Bank' },
        { kind: 'hold', x: L.bank.x, y: L.bank.y, seconds: 20, label: 'Hold the bank lobby — 20 seconds' },
        { kind: 'deliver', x: L.safehouse.x, y: L.safehouse.y, label: 'Lose the heat and reach the Safehouse' },
      ];
  }
}

// Begin a story mission: set up its first step and any props it needs.
export function startMission(S, index) {
  const m = S.mission;
  m.index = index;
  m.steps = missionSteps(S, index);
  m.step = 0;
  m.active = true;
  m.carried = false;
  m.killsDone = 0;
  m.faresDone = 0;
  m.holdTimer = 0;
  m.timer = 0;
  m.race = null;
  if (index === 1) {
    // Park a red Viento GT near the Marina for the player to steal.
    const car = makeCar('sports', LANDMARKS.marina.x + 90, LANDMARKS.marina.y + 40, 0, 'parked');
    S.cars.push(car);
    S.mission.sportsCar = car;
  }
  if (index === 5) addHeat(S, 3.4);
  if (index === 6) addHeat(S, 2.4);
  if (index === 3) startTaxi(S);
  if (index === 4) startRace(S);
  S.banner = { title: CFG.missions[index].name, sub: CFG.missions[index].brief, t: 0 };
}

// The mission's current step, or null when no mission is running.
export function currentStep(S) {
  const m = S.mission;
  if (!m.active || m.step >= m.steps.length) return null;
  return m.steps[m.step];
}

// The map target of the current step, for the minimap and the HUD.
export function missionTarget(S) {
  const step = currentStep(S);
  if (!step) return null;
  if (step.kind === 'steal' && S.mission.sportsCar && !S.mission.sportsCar.dead) {
    return { x: S.mission.sportsCar.x, y: S.mission.sportsCar.y, label: step.label };
  }
  if (step.kind === 'fares' && S.taxi.active) return taxiTarget(S);
  if (step.kind === 'race' && S.race) {
    const pt = S.race.points[S.race.idx];
    return pt ? { x: pt.x, y: pt.y, label: step.label } : null;
  }
  if (step.x !== undefined) return { x: step.x, y: step.y, label: step.label };
  return null;
}

// One line of objective text for the HUD.
export function objectiveText(S) {
  const step = currentStep(S);
  if (!step) {
    if (S.mission.index >= CFG.missions.length) return 'All jobs done — free roam Solara City.';
    return 'Press M to call Marisol for the next job.';
  }
  if (step.kind === 'kill') return step.label + ' (' + (step.count - S.mission.killsDone) + ' left)';
  if (step.kind === 'fares') return 'Cab fares: ' + S.mission.faresDone + ' / ' + step.count;
  if (step.kind === 'race' && S.race) return 'Checkpoint ' + (S.race.idx + 1) + ' / ' + S.race.points.length + ' — ' + Math.ceil(S.race.timer) + 's';
  if (step.kind === 'hold') return step.label + ' — ' + Math.ceil(step.seconds - S.mission.holdTimer) + 's';
  return step.label;
}

// Advance the mission state machine one frame.
export function updateMission(S, dt) {
  const m = S.mission;
  if (!m.active) return;
  const step = currentStep(S);
  if (!step) {
    completeMission(S);
    return;
  }
  const p = S.player;
  switch (step.kind) {
    case 'goto':
      if (dist(p.x, p.y, step.x, step.y) < 70) advanceStep(S);
      break;
    case 'pickup':
      if (dist(p.x, p.y, step.x, step.y) < 60) {
        m.carried = true;
        advanceStep(S);
        S.audio.pickup();
      }
      break;
    case 'deliver':
      // Delivery needs the parcel (or the stolen car) in hand.
      if (m.carried && dist(p.x, p.y, step.x, step.y) < 70) advanceStep(S);
      break;
    case 'steal':
      if (p.inCar && p.inCar.type === step.type) {
        m.carried = true;
        advanceStep(S);
      }
      break;
    case 'kill': {
      if (!m.spawned) {
        m.spawned = true;
        m.killsDone = 0;
        for (let i = 0; i < step.count; i++) {
          spawnEnemy(S, step.cx + rand(S.rng, -160, 160), step.cy + rand(S.rng, -160, 160), 60);
        }
      }
      if (S.enemies.length === 0 && m.spawned) {
        m.killsDone = step.count;
        advanceStep(S);
      }
      break;
    }
    case 'fares':
      if (m.faresDone >= step.count) {
        S.taxi.active = false;
        advanceStep(S);
      }
      break;
    case 'race':
      updateRace(S, dt);
      if (S.race && S.race.done) advanceStep(S);
      if (S.race && S.race.failed) {
        S.race = null;
        S.banner = { title: 'RACE LOST', sub: 'Too slow — try again from the East Highway.', t: 0 };
        m.active = false;
      }
      break;
    case 'escape':
      if ((S.player.heat || 0) <= 0.01) advanceStep(S);
      break;
    case 'hold': {
      if (dist(p.x, p.y, step.x, step.y) < 130) {
        m.holdTimer += dt;
        if (!m.holdSpawned) {
          m.holdSpawned = true;
          for (let i = 0; i < 3; i++) spawnEnemy(S, step.x + rand(S.rng, -200, 200), step.y + rand(S.rng, -200, 200), 50);
        }
        if (m.holdTimer >= step.seconds) advanceStep(S);
      } else {
        m.holdTimer = Math.max(0, m.holdTimer - dt * 0.5);
      }
      break;
    }
  }
}

function advanceStep(S) {
  S.mission.step++;
  S.mission.spawned = false;
  S.mission.holdSpawned = false;
  S.mission.holdTimer = 0;
  S.audio.pickup();
}

// Pay out the mission, unlock the next one and save.
export function completeMission(S) {
  const m = S.mission;
  const def = CFG.missions[m.index];
  S.player.cash += def.payout;
  S.stats.earned += def.payout;
  addFloatText(S, S.player.x, S.player.y - 30, '+$' + def.payout, '#7ae84a');
  S.audio.jingle();
  S.banner = { title: 'JOB DONE', sub: def.name + ' — $' + def.payout, t: 0 };
  S.mode = 'complete';
  S.modeTimer = 0;
  m.active = false;
  m.index++;
  m.step = 0;
  S.saveGame();
}

// ---- Taxi ----

export function startTaxi(S) {
  S.taxi.active = true;
  S.taxi.phase = 'toPassenger';
  const spot = randomSidewalkPoint(S.rng);
  S.taxi.px = spot.x; S.taxi.py = spot.y;
  S.taxi.fare = 0;
  S.taxi.passenger = null;
}

export function taxiTarget(S) {
  if (!S.taxi.active) return null;
  if (S.taxi.phase === 'toPassenger') return { x: S.taxi.px, y: S.taxi.py, label: 'Pick up the passenger' };
  return { x: S.taxi.dx, y: S.taxi.dy, label: 'Drop off — fare $' + S.taxi.fare };
}

export function updateTaxi(S, dt) {
  if (!S.taxi.active) return;
  const p = S.player;
  if (S.taxi.phase === 'toPassenger') {
    if (dist(p.x, p.y, S.taxi.px, S.taxi.py) < 60) {
      S.taxi.phase = 'toDest';
      const dest = randomRoadPoint(S.rng);
      S.taxi.dx = dest.x; S.taxi.dy = dest.y;
      S.taxi.fare = 40 + Math.floor(dist(S.taxi.px, S.taxi.py, dest.x, dest.y) / 40);
      S.audio.pickup();
    }
  } else {
    if (dist(p.x, p.y, S.taxi.dx, S.taxi.dy) < 70) {
      p.cash += S.taxi.fare;
      S.stats.earned += S.taxi.fare;
      addFloatText(S, p.x, p.y - 30, '+$' + S.taxi.fare + ' fare', '#7ae84a');
      S.audio.jingle();
      if (S.mission.active) S.mission.faresDone++;
      S.taxi.phase = 'toPassenger';
      const spot = randomSidewalkPoint(S.rng);
      S.taxi.px = spot.x; S.taxi.py = spot.y;
    }
  }
}

// ---- Street race ----

const RACE_POINTS = [
  { x: 4500, y: 1500 },
  { x: 3900, y: 900 },
  { x: 2700, y: 600 },
  { x: 1500, y: 900 },
  { x: 600, y: 2400 },
];

export function startRace(S) {
  S.race = { active: true, points: RACE_POINTS.slice(), idx: 0, timer: 75, done: false, failed: false };
}

export function updateRace(S, dt) {
  if (!S.race || !S.race.active) return;
  const r = S.race;
  r.timer -= dt;
  const p = S.player;
  const pt = r.points[r.idx];
  if (pt && dist(p.x, p.y, pt.x, pt.y) < 80) {
    r.idx++;
    S.audio.pickup();
    addFloatText(S, p.x, p.y - 30, 'CHECKPOINT', '#ffd94a');
    if (r.idx >= r.points.length) {
      r.done = true;
      r.active = false;
      S.player.cash += 200;
    }
  }
  if (r.timer <= 0 && !r.done) {
    r.failed = true;
    r.active = false;
  }
}

// Start a race by driving into the East Highway marker.
export function raceStartNear(S) {
  return dist(S.player.x, S.player.y, LANDMARKS.raceStart.x, LANDMARKS.raceStart.y) < 90;
}

// ---- Hidden packages ----

export function scatterPackages(S) {
  S.packages = [];
  for (let i = 0; i < CFG.packageCount; i++) {
    const spot = randomSidewalkPoint(S.rng);
    S.packages.push({ x: spot.x, y: spot.y, taken: false });
  }
}

export function collectPackages(S) {
  const p = S.player;
  for (const pk of S.packages) {
    if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 34) {
      pk.taken = true;
      p.cash += CFG.packageReward;
      S.stats.earned += CFG.packageReward;
      addFloatText(S, p.x, p.y - 30, 'PACKAGE +$' + CFG.packageReward, '#e84ad4');
      S.audio.pickup();
      S.saveGame();
    }
  }
}
