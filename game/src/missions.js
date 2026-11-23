// Missions and side activities: the story Marisol Vega hands out.
// Eight story missions, each a short chain of stages: go somewhere, steal a
// car, clear out a crew, run taxi fares, race checkpoints, grab a stash, and
// finally rob Solara National Bank. Taxi fares also run as a free side
// activity alongside any mission stage. Finishing a mission pays out, raises
// reputation, saves, and starts the next one.
import { MISSION_PAYOUTS, TAXI_FARE } from './config.js';
import { clamp, dist2 } from './random.js';
import { SPOTS } from './city.js';
import { spawnEnemy } from './combat.js';
import { spawnVehicle } from './vehicles.js';

export const MISSIONS = [
  {
    title: 'First Delivery',
    giver: 'Marisol Vega',
    brief: 'Drive the package to the Marina. No questions, no stops.',
    stages: [
      { type: 'goto', at: SPOTS.marina, text: 'Deliver the package to the Marina' },
    ],
  },
  {
    title: 'Wheels Up',
    giver: 'Marisol Vega',
    brief: 'A Vento GT is parked in Uptown. Borrow it. Permanently.',
    stages: [
      { type: 'steal', car: 'sports', at: SPOTS.uptown, text: 'Steal the Vento GT in Uptown' },
      { type: 'goto', at: SPOTS.garage, text: 'Bring the Vento GT to the Safehouse Garage' },
    ],
  },
  {
    title: 'Dockside Debt',
    giver: 'Marisol Vega',
    brief: 'The Docks crew owes us. Remind them, loudly.',
    stages: [
      { type: 'kill', count: 3, at: SPOTS.docks, text: 'Deal with the Docks crew (0/3)' },
      { type: 'goto', at: SPOTS.marisolOffice, text: 'Report back to Marisol' },
    ],
  },
  {
    title: 'Taxi Trouble',
    giver: 'Marisol Vega',
    brief: 'A rival cab firm is muscling in. Take their fares first.',
    stages: [
      { type: 'taxi', count: 2, text: 'Complete 2 taxi fares' },
    ],
  },
  {
    title: 'Night Run',
    giver: 'Marisol Vega',
    brief: 'Race the checkpoints before the clock runs out.',
    stages: [
      { type: 'race', points: 5, time: 75, text: 'Hit all 5 checkpoints before time runs out' },
    ],
  },
  {
    title: 'Hospital Run',
    giver: 'Marisol Vega',
    brief: 'A friend needs a fast ride to St. Aurelia. Cops optional.',
    stages: [
      { type: 'goto', at: SPOTS.hospital, text: 'Reach St. Aurelia Hospital' },
    ],
  },
  {
    title: 'Warehouse War',
    giver: 'Marisol Vega',
    brief: 'The Docks warehouse is guarded. Clear it out.',
    stages: [
      { type: 'kill', count: 5, at: SPOTS.docks, text: 'Clear the warehouse guards (0/5)' },
      { type: 'collect', at: SPOTS.docks, text: 'Grab the cash stash in the warehouse' },
    ],
  },
  {
    title: 'The Big One',
    giver: 'Marisol Vega',
    brief: 'Solara National Bank. In, out, gone. This is the one.',
    stages: [
      { type: 'goto', at: SPOTS.bank, text: 'Reach Solara National Bank' },
      { type: 'kill', count: 4, at: SPOTS.bank, text: 'Hold off the bank guards (0/4)' },
      { type: 'goto', at: SPOTS.marina, text: 'Escape to the Marina' },
    ],
  },
];

export function startMission(game, i) {
  const st = game.state;
  const m = MISSIONS[i];
  if (!m) {
    st.mission = null;
    st.objective = 'All missions complete — free roam Solara City!';
    return;
  }
  st.mission = m;
  st.missionStage = 0;
  st.missionTimer = 0;
  st.racePoints = [];
  st.enemies = [];
  setupStage(game);
  game.say('MISSION: ' + m.title + ' — ' + m.brief, 6);
}

// Prepare the current stage: spawn its enemies, scatter its race points, or
// open the first taxi fare of a taxi stage.
function setupStage(game) {
  const st = game.state;
  const m = st.mission;
  if (!m) return;
  const stage = m.stages[st.missionStage];
  st.objective = stage.text;
  if (stage.type === 'kill') {
    for (let i = 0; i < stage.count; i++) spawnEnemy(game, stage.at.x, stage.at.y);
    st.kills = 0;
  }
  if (stage.type === 'race') {
    st.missionTimer = stage.time;
    st.racePoints = [];
    for (let i = 0; i < stage.points; i++) {
      st.racePoints.push({
        x: clamp(600 + game.rng.range(0, 5200), 400, 6000),
        y: clamp(600 + game.rng.range(0, 5200), 400, 6000),
        hit: false,
      });
    }
  }
  if (stage.type === 'taxi') {
    st.taxiDone = 0;
    startTaxiFare(game);
  }
}

export function advanceStage(game) {
  const st = game.state;
  const m = st.mission;
  st.missionStage++;
  if (st.missionStage >= m.stages.length) {
    const pay = MISSION_PAYOUTS[st.missionIndex] || 500;
    game.addCash(pay);
    st.rep += 10;
    game.say('MISSION COMPLETE: ' + m.title + '  +$' + pay, 5);
    if (game.audio) game.audio.missionDone();
    st.missionIndex++;
    game.save();
    if (st.missionIndex >= MISSIONS.length) {
      st.mission = null;
      st.screen = 'won';
      st.objective = 'You pulled off the Big One. Solara City is yours.';
    } else {
      startMission(game, st.missionIndex);
    }
  } else {
    setupStage(game);
  }
}

// A fare: a random pickup near the player, a random destination, 90 seconds,
// and a fare that grows a little each time.
export function startTaxiFare(game) {
  const st = game.state;
  const spots = [SPOTS.marina, SPOTS.uptown, SPOTS.plaza, SPOTS.hospital, SPOTS.docks, SPOTS.bank];
  const dest = spots[game.rng.int(0, spots.length - 1)];
  st.taxi = {
    dest,
    timer: 90,
    fare: TAXI_FARE + game.rng.int(0, 60),
    picked: false,
    pickup: {
      x: st.player.x + game.rng.range(-300, 300),
      y: st.player.y + game.rng.range(-300, 300),
    },
  };
  st.objective = 'Taxi: pick up the fare, then drive to ' + dest.label;
}

export function updateMissions(game, dt) {
  const st = game.state;
  const m = st.mission;
  if (!m) return;
  const stage = m.stages[st.missionStage];
  const p = st.player;
  const near = (spot, r) => dist2(p.x, p.y, spot.x, spot.y) < r * r;
  if (stage.type === 'goto' && near(stage.at, 90)) advanceStage(game);
  else if (stage.type === 'steal') {
    const car = st.cars.find((c) => c.type === stage.car && !c.dead && dist2(p.x, p.y, c.x, c.y) < 120 * 120);
    if (car && st.playerCar === car.id) {
      game.addWanted(1);
      advanceStage(game);
    } else if (!st.cars.some((c) => c.type === stage.car && !c.dead)) {
      // The target car was destroyed or never spawned: put a fresh one out.
      spawnVehicle(game, 'sports', stage.at.x + 60, stage.at.y, 0, { parked: true });
    }
  } else if (stage.type === 'kill') {
    stage.text = stage.text.replace(/\(\d+\/\d+\)/, '(' + st.kills + '/' + stage.count + ')');
    st.objective = stage.text;
    if (st.kills >= stage.count) advanceStage(game);
  } else if (stage.type === 'collect' && near(stage.at, 90)) {
    advanceStage(game);
  } else if (stage.type === 'taxi') {
    if (st.taxiDone >= stage.count) advanceStage(game);
  } else if (stage.type === 'race') {
    st.missionTimer -= dt;
    for (const rp of st.racePoints) {
      if (!rp.hit && near(rp, 80)) {
        rp.hit = true;
        game.say('Checkpoint! ' + st.racePoints.filter((r) => r.hit).length + '/' + st.racePoints.length, 2);
        if (game.audio) game.audio.pickup();
      }
    }
    if (st.racePoints.every((r) => r.hit)) advanceStage(game);
    else if (st.missionTimer <= 0) {
      game.say('Race failed — time up. Try again from Marisol.', 4);
      startMission(game, st.missionIndex);
    }
  }
  // Taxi fares run on their own timer alongside whatever the mission is.
  if (st.taxi) {
    st.taxi.timer -= dt;
    if (!st.taxi.picked && near(st.taxi.pickup, 60)) {
      st.taxi.picked = true;
      game.say('Fare picked up — drive to ' + st.taxi.dest.label, 3);
    } else if (st.taxi.picked && near(st.taxi.dest, 90)) {
      game.addCash(st.taxi.fare);
      st.stats.fares++;
      st.taxiDone++;
      game.say('Fare complete +$' + st.taxi.fare, 3);
      if (game.audio) game.audio.missionDone();
      st.taxi = null;
      if (m && m.stages[st.missionStage].type === 'taxi' && st.taxiDone < m.stages[st.missionStage].count) startTaxiFare(game);
    } else if (st.taxi.timer <= 0) {
      game.say('Taxi fare expired.', 3);
      st.taxi = null;
    }
  }
}
