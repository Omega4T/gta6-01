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
  { title: 'First Delivery', giver: 'Marisol Vega', brief: 'Drive the package to the Marina. No questions, no stops.', stages: [{ type: 'goto', at: SPOTS.marina, text: 'Deliver the package to the Marina' }] },
  { title: 'Wheels Up', giver: 'Marisol Vega', brief: 'A Vento GT is parked in Uptown. Borrow it. Permanently.', stages: [{ type: 'steal', car: 'sports', at: SPOTS.uptown, text: 'Steal the Vento GT in Uptown' }, { type: 'goto', at: SPOTS.garage, text: 'Bring the Vento GT to the Safehouse Garage' }] },
  { title: 'Dockside Debt', giver: 'Marisol Vega', brief: 'The Docks crew owes us. Remind them, loudly.', stages: [{ type: 'kill', count: 3, at: SPOTS.docks, text: 'Deal with the Docks crew (0/3)' }, { type: 'goto', at: SPOTS.marisolOffice, text: 'Report back to Marisol' }] },
  { title: 'Taxi Trouble', giver: 'Marisol Vega', brief: 'A rival cab firm is muscling in. Take their fares first.', stages: [{ type: 'taxi', count: 2, text: 'Complete 2 taxi fares' }] },
  { title: 'Night Run', giver: 'Marisol Vega', brief: 'Race the checkpoints before the clock runs out.', stages: [{ type: 'race', points: 5, time: 75, text: 'Hit all 5 checkpoints before time runs out' }] },
  { title: 'Hospital Run', giver: 'Marisol Vega', brief: 'A friend needs a fast ride to St. Aurelia. Cops optional.', stages: [{ type: 'goto', at: SPOTS.hospital, text: 'Reach St. Aurelia Hospital' }] },
  { title: 'Warehouse War', giver: 'Marisol Vega', brief: 'The Docks warehouse is guarded. Clear it out.', stages: [{ type: 'kill', count: 5, at: SPOTS.docks, text: 'Clear the warehouse guards (0/5)' }, { type: 'collect', at: SPOTS.docks, text: 'Grab the cash stash in the warehouse' }] },
  { title: 'The Big One', giver: 'Marisol Vega', brief: 'Solara National Bank. In, out, gone. This is the one.', stages: [{ type: 'goto', at: SPOTS.bank, text: 'Reach Solara National Bank' }, { type: 'kill', count: 4, at: SPOTS.bank, text: 'Hold off the bank guards (0/4)' }, { type: 'goto', at: SPOTS.marina, text: 'Escape to the Marina' }] },
];

export function startMission(game, i) {
  const s = game.state;
  const m = MISSIONS[i];
  if (!m) {
    s.mission = null;
    s.objective = 'All missions complete — free roam Solara City!';
    return;
  }
  s.mission = m;
  s.missionStage = 0;
  s.missionTimer = 0;
  s.racePoints = [];
  s.enemies = [];
  setupStage(game);
  game.say('MISSION: ' + m.title + ' — ' + m.brief, 6);
}

function setupStage(game) {
  const s = game.state;
  const m = s.mission;
  if (!m) return;
  const st = m.stages[s.missionStage];
  s.objective = st.text;
  if (st.type === 'kill') {
    for (let i = 0; i < st.count; i++) spawnEnemy(game, st.at.x, st.at.y);
    s.kills = 0;
  }
  if (st.type === 'race') {
    s.missionTimer = st.time;
    s.racePoints = [];
    for (let i = 0; i < st.points; i++) {
      s.racePoints.push({
        x: clamp(600 + game.rng.range(0, 5200), 400, 6000),
        y: clamp(600 + game.rng.range(0, 5200), 400, 6000),
        hit: false,
      });
    }
  }
  if (st.type === 'taxi') {
    s.taxiDone = 0;
    startTaxiFare(game);
  }
}

export function advanceStage(game) {
  const s = game.state;
  const m = s.mission;
  s.missionStage++;
  if (s.missionStage >= m.stages.length) {
    const pay = MISSION_PAYOUTS[s.missionIndex] || 500;
    game.addCash(pay);
    s.rep += 10;
    game.say('MISSION COMPLETE: ' + m.title + '  +$' + pay, 5);
    if (game.audio) game.audio.missionDone();
    s.missionIndex++;
    game.save();
    if (s.missionIndex >= MISSIONS.length) {
      s.mission = null;
      s.screen = 'won';
      s.objective = 'You pulled off the Big One. Solara City is yours.';
    } else {
      startMission(game, s.missionIndex);
    }
  } else {
    setupStage(game);
  }
}

export function startTaxiFare(game) {
  const s = game.state;
  const spots = [SPOTS.marina, SPOTS.uptown, SPOTS.plaza, SPOTS.hospital, SPOTS.docks, SPOTS.bank];
  const dest = spots[game.rng.int(0, spots.length - 1)];
  s.taxi = {
    dest, timer: 90, fare: TAXI_FARE + game.rng.int(0, 60), picked: false,
    pickup: { x: s.player.x + game.rng.range(-300, 300), y: s.player.y + game.rng.range(-300, 300) },
  };
  s.objective = 'Taxi: pick up the fare, then drive to ' + dest.label;
}

export function updateMissions(game, dt) {
  const s = game.state;
  const m = s.mission;
  if (!m) return;
  const st = m.stages[s.missionStage];
  const p = s.player;
  const at = (spot, r) => dist2(p.x, p.y, spot.x, spot.y) < r * r;
  if (st.type === 'goto' && at(st.at, 90)) advanceStage(game);
  else if (st.type === 'steal') {
    const car = s.cars.find((c) => c.type === st.car && !c.dead && dist2(p.x, p.y, c.x, c.y) < 120 * 120);
    if (car && s.playerCar === car.id) {
      game.addWanted(1);
      advanceStage(game);
    } else if (!s.cars.some((c) => c.type === st.car && !c.dead)) {
      spawnVehicle(game, 'sports', st.at.x + 60, st.at.y, 0, { parked: true });
    }
  } else if (st.type === 'kill') {
    st.text = st.text.replace(/\(\d+\/\d+\)/, '(' + s.kills + '/' + st.count + ')');
    s.objective = st.text;
    if (s.kills >= st.count) advanceStage(game);
  } else if (st.type === 'collect' && at(st.at, 90)) {
    advanceStage(game);
  } else if (st.type === 'taxi') {
    if (s.taxiDone >= st.count) advanceStage(game);
  } else if (st.type === 'race') {
    s.missionTimer -= dt;
    for (const rp of s.racePoints) {
      if (!rp.hit && at(rp, 80)) {
        rp.hit = true;
        game.say('Checkpoint! ' + s.racePoints.filter((r) => r.hit).length + '/' + s.racePoints.length, 2);
        if (game.audio) game.audio.pickup();
      }
    }
    if (s.racePoints.every((r) => r.hit)) advanceStage(game);
    else if (s.missionTimer <= 0) {
      game.say('Race failed — time up. Try again from Marisol.', 4);
      startMission(game, s.missionIndex);
    }
  }
  if (s.taxi) {
    s.taxi.timer -= dt;
    if (!s.taxi.picked && at(s.taxi.pickup, 60)) {
      s.taxi.picked = true;
      game.say('Fare picked up — drive to ' + s.taxi.dest.label, 3);
    } else if (s.taxi.picked && at(s.taxi.dest, 90)) {
      game.addCash(s.taxi.fare);
      s.stats.fares++;
      s.taxiDone++;
      game.say('Fare complete +$' + s.taxi.fare, 3);
      if (game.audio) game.audio.missionDone();
      s.taxi = null;
      if (m && m.stages[s.missionStage].type === 'taxi' && s.taxiDone < m.stages[s.missionStage].count) startTaxiFare(game);
    } else if (s.taxi.timer <= 0) {
      game.say('Taxi fare expired.', 3);
      s.taxi = null;
    }
  }
}
