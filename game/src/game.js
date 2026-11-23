// Solara City game state: player, cars, traffic, pedestrians, police, missions,
// combat, pickups and saving. One step(dt) advances everything; the renderer only reads.
import { PLAYER, WEAPONS, CAR_TYPES, POLICE, MISSION_PAYOUTS, TAXI_FARE, PACKAGE_REWARD, SAVE_KEY, WORLD } from './config.js';
import { createRandom, clamp, dist2, angleTo, angleDiff } from './random.js';
import { SPOTS } from './city.js';

const MISSIONS = [
  { title: 'First Delivery', giver: 'Marisol Vega', brief: 'Drive the package to the Marina. No questions, no stops.', stages: [{ type: 'goto', at: SPOTS.marina, text: 'Deliver the package to the Marina' }] },
  { title: 'Wheels Up', giver: 'Marisol Vega', brief: 'A Vento GT is parked in Uptown. Borrow it. Permanently.', stages: [{ type: 'steal', car: 'sports', at: SPOTS.uptown, text: 'Steal the Vento GT in Uptown' }, { type: 'goto', at: SPOTS.garage, text: 'Bring the Vento GT to the Safehouse Garage' }] },
  { title: 'Dockside Debt', giver: 'Marisol Vega', brief: 'The Docks crew owes us. Remind them, loudly.', stages: [{ type: 'kill', count: 3, at: SPOTS.docks, text: 'Deal with the Docks crew (0/3)' }, { type: 'goto', at: SPOTS.marisolOffice, text: 'Report back to Marisol' }] },
  { title: 'Taxi Trouble', giver: 'Marisol Vega', brief: 'A rival cab firm is muscling in. Take their fares first.', stages: [{ type: 'taxi', count: 2, text: 'Complete 2 taxi fares' }] },
  { title: 'Night Run', giver: 'Marisol Vega', brief: 'Race the checkpoints before the clock runs out.', stages: [{ type: 'race', points: 5, time: 75, text: 'Hit all 5 checkpoints before time runs out' }] },
  { title: 'Hospital Run', giver: 'Marisol Vega', brief: 'A friend needs a fast ride to St. Aurelia. Cops optional.', stages: [{ type: 'goto', at: SPOTS.hospital, text: 'Reach St. Aurelia Hospital' }] },
  { title: 'Warehouse War', giver: 'Marisol Vega', brief: 'The Docks warehouse is guarded. Clear it out.', stages: [{ type: 'kill', count: 5, at: SPOTS.docks, text: 'Clear the warehouse guards (0/5)' }, { type: 'collect', at: SPOTS.docks, text: 'Grab the cash stash in the warehouse' }] },
  { title: 'The Big One', giver: 'Marisol Vega', brief: 'Solara National Bank. In, out, gone. This is the one.', stages: [{ type: 'goto', at: SPOTS.bank, text: 'Reach Solara National Bank' }, { type: 'kill', count: 4, at: SPOTS.bank, text: 'Hold off the bank guards (0/4)' }, { type: 'goto', at: SPOTS.marina, text: 'Escape to the Marina' }] },
];

let nextId = 1;

export function createGame(city, seed, audio) {
  const rng = createRandom(seed ^ 0x51ab);
  const state = {
    screen: 'menu', time: 0, clock: 9.5, // 09:30 in-game
    player: { x: 2500, y: 2900, angle: -Math.PI / 2, hp: 100, armour: 0, weapon: 'pistol', speed: 0, moving: false },
    ammo: { pistol: 120, shotgun: 24, smg: 90 },
    cash: 250, rep: 0, wanted: 0, wantedTimer: 0, bustTimer: 0,
    cars: [], peds: [], enemies: [], bullets: [], particles: [], floaters: [], casings: [],
    missionIndex: 0, mission: null, missionStage: 0, missionTimer: 0, racePoints: [],
    taxi: null, taxiDone: 0, packagesFound: 0, kills: 0,
    message: '', messageTimer: 0, objective: 'Visit Marisol Vega',
    heli: null, stats: { shots: 0, carsStolen: 0, fares: 0 },
    muted: false, photoMode: false, paused: false,
  };

  function say(text, secs) { state.message = text; state.messageTimer = secs || 4; }
  function addCash(n) { state.cash += n; state.floaters.push({ x: state.player.x, y: state.player.y - 30, text: (n > 0 ? '+' : '') + '$' + n, life: 1.6, color: n > 0 ? '#7dff8a' : '#ff7a6a' }); }
  function addWanted(n) { state.wanted = clamp(state.wanted + n, 0, POLICE.starsMax); state.wantedTimer = 0; if (n > 0) say('Wanted level ' + state.wanted + '!', 3); }
  function spawnCar(type, x, y, angle, parked, police) {
    const def = CAR_TYPES[type];
    const car = { id: nextId++, type, x, y, angle, speed: 0, hp: def.hp, maxHp: def.hp, color: def.color, parked: !!parked, police: !!police, traffic: !parked && !police, dir: rng.pick([1, -1]), axis: rng.chance(0.5) ? 'x' : 'z', smoke: 0, fire: 0, dead: false, honk: 0, flee: 0 };
    state.cars.push(car);
    return car;
  }
  function spawnPed(x, y) {
    const ped = { x, y, angle: rng.range(0, Math.PI * 2), speed: rng.range(35, 70), hp: 30, flee: 0, color: ['#e8e0d0', '#7aa8ff', '#ff9a7a', '#b8e07a', '#d0a0e0', '#f2d06a'][rng.int(0, 5)], target: null, dead: false, callsCops: false };
    state.peds.push(ped);
    return ped;
  }
  function spawnEnemy(x, y) {
    const e = { x: x + rng.range(-60, 60), y: y + rng.range(-60, 60), angle: 0, hp: 60, cooldown: rng.range(0.5, 1.5), speed: 120, dead: false };
    state.enemies.push(e);
    return e;
  }
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), s = rng.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.3, 0.8), max: 0.8, color, size: rng.range(2, 5) });
    }
  }
  function explode(x, y) {
    burst(x, y, '#ff9a3c', 26, 260); burst(x, y, '#ffd23f', 16, 180); burst(x, y, '#555', 14, 120);
    state.floaters.push({ x, y: y - 20, text: 'BOOM', life: 1.2, color: '#ff7a3c' });
    if (audio) audio.explosion();
  }

  function currentMission() { return MISSIONS[state.missionIndex] || null; }
  function startMission(i) {
    const m = MISSIONS[i];
    if (!m) { state.mission = null; state.objective = 'All missions complete — free roam Solara City!'; return; }
    state.mission = m; state.missionStage = 0; state.missionTimer = 0; state.racePoints = [];
    state.enemies = [];
    setupStage();
    say('MISSION: ' + m.title + ' — ' + m.brief, 6);
  }
  function setupStage() {
    const m = state.mission; if (!m) return;
    const s = m.stages[state.missionStage];
    state.objective = s.text;
    if (s.type === 'kill') {
      for (let i = 0; i < s.count; i++) spawnEnemy(s.at.x, s.at.y);
      state.kills = 0;
    }
    if (s.type === 'race') {
      state.missionTimer = s.time;
      state.racePoints = [];
      for (let i = 0; i < s.points; i++) {
        state.racePoints.push({ x: clamp(600 + rng.range(0, 5200), 400, 6000), y: clamp(600 + rng.range(0, 5200), 400, 6000), hit: false });
      }
    }
    if (s.type === 'taxi') { state.taxiDone = 0; startTaxiFare(); }
  }
  function advanceStage() {
    const m = state.mission;
    state.missionStage++;
    if (state.missionStage >= m.stages.length) {
      const pay = MISSION_PAYOUTS[state.missionIndex] || 500;
      addCash(pay); state.rep += 10;
      say('MISSION COMPLETE: ' + m.title + '  +$' + pay, 5);
      if (audio) audio.missionDone();
      state.missionIndex++;
      save();
      if (state.missionIndex >= MISSIONS.length) {
        state.mission = null; state.screen = 'won';
        state.objective = 'You pulled off the Big One. Solara City is yours.';
      } else {
        startMission(state.missionIndex);
      }
    } else setupStage();
  }
  function startTaxiFare() {
    const spots = [SPOTS.marina, SPOTS.uptown, SPOTS.plaza, SPOTS.hospital, SPOTS.docks, SPOTS.bank];
    const dest = spots[rng.int(0, spots.length - 1)];
    state.taxi = { dest, timer: 90, fare: TAXI_FARE + rng.int(0, 60), picked: false, pickup: { x: state.player.x + rng.range(-300, 300), y: state.player.y + rng.range(-300, 300) } };
    state.objective = 'Taxi: pick up the fare, then drive to ' + dest.label;
  }

  function reset(newGame) {
    nextId = 1;
    state.cars = []; state.peds = []; state.enemies = []; state.bullets = [];
    state.particles = []; state.floaters = []; state.casings = [];
    state.time = 0; state.clock = 9.5; state.wanted = 0; state.wantedTimer = 0; state.bustTimer = 0;
    state.player = { x: 2500, y: 2900, angle: -Math.PI / 2, hp: 100, armour: 0, weapon: 'pistol', speed: 0, moving: false };
    state.ammo = { pistol: 120, shotgun: 24, smg: 90 };
    state.taxi = null; state.taxiDone = 0; state.packagesFound = 0; state.kills = 0; state.heli = null;
    state.screen = 'play';
    if (newGame) { state.cash = 250; state.rep = 0; state.missionIndex = 0; }
    // Parked + traffic cars from city spawns.
    for (const s of city.carSpawns.slice(0, 90)) {
      const types = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck', 'beach'];
      spawnCar(s.parked ? rng.pick(types) : rng.pick(types), s.x, s.y, s.angle, s.parked, false);
    }
    for (let i = 0; i < 26; i++) {
      const s = city.pedSpawns[rng.int(0, city.pedSpawns.length - 1)];
      spawnPed(s.x, s.y);
    }
    // Player starts in a sedan near Marisol's office.
    const startCar = spawnCar('sedan', 2520, 2980, 0, true, false);
    state.playerCar = null;
    startMission(state.missionIndex);
    say('Welcome to Solara City. Follow the yellow marker.', 5);
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, rep: state.rep, missionIndex: state.missionIndex, packagesFound: state.packagesFound, muted: state.muted }));
    } catch { /* storage off */ }
  }
  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.cash = d.cash || 250; state.rep = d.rep || 0; state.missionIndex = d.missionIndex || 0;
      state.packagesFound = d.packagesFound || 0; state.muted = !!d.muted;
      return true;
    } catch { return false; }
  }

  function playerCar() {
    return state.playerCar ? state.cars.find(c => c.id === state.playerCar) || null : null;
  }
  function nearestCar(maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of state.cars) {
      if (c.dead || c.police) continue;
      const d = dist2(state.player.x, state.player.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function enterCar(car) {
    state.playerCar = car.id; car.parked = false; car.traffic = false;
    state.stats.carsStolen++;
    if (car.police) addWanted(1);
    else if (car.parked || true) { /* stealing any car is a crime if watched */ }
    say('Driving ' + CAR_TYPES[car.type].name + ' — E to exit, Shift = handbrake', 3);
    if (audio) audio.click();
  }
  function exitCar() {
    const car = playerCar();
    if (!car) return;
    state.playerCar = null;
    const a = car.angle + Math.PI / 2;
    state.player.x = car.x + Math.cos(a) * 34; state.player.y = car.y + Math.sin(a) * 34;
    state.player.angle = car.angle;
    car.speed = 0;
  }
  function shoot() {
    const p = state.player;
    const w = WEAPONS[p.weapon];
    if (p.weapon !== 'fists') {
      if ((state.ammo[p.weapon] || 0) <= 0) { say('Out of ammo — find a pickup (green crate).', 2); return; }
      state.ammo[p.weapon]--;
    }
    state.stats.shots++;
    const base = p.angle;
    for (let i = 0; i < w.pellets; i++) {
      const a = base + (rng.range(-1, 1) * w.spread);
      state.bullets.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, angle: a, speed: 950, life: w.range / 950, damage: w.damage, fromPlayer: true });
    }
    state.casings.push({ x: p.x, y: p.y, angle: base + Math.PI / 2, life: 1.2 });
    burst(p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 26, '#ffd23f', 4, 120);
    if (audio) audio.shot();
    // Gunfire draws attention.
    addWanted(0);
    for (const ped of state.peds) {
      if (dist2(p.x, p.y, ped.x, ped.y) < 500 * 500) { ped.flee = 3; if (!ped.callsCops) { ped.callsCops = true; if (state.wanted === 0 && rng.chance(0.4)) addWanted(1); } }
    }
  }

  function damagePlayer(n) {
    const p = state.player;
    if (p.armour > 0) { const absorbed = Math.min(p.armour, n); p.armour -= absorbed; n -= absorbed; }
    p.hp -= n;
    if (p.hp <= 0) { p.hp = 0; state.screen = 'wasted'; addCash(-Math.min(state.cash, 200)); save(); if (audio) audio.busted(); }
  }

  function updatePlayer(dt, input, aimAngle) {
    const p = state.player;
    const axis = input.axis();
    const car = playerCar();
    if (car) {
      const def = CAR_TYPES[car.type];
      const fwd = axis.y < 0 ? 1 : axis.y > 0 ? -0.55 : 0;
      const handbrake = input.running();
      if (fwd) car.speed += def.accel * fwd * dt * (handbrake ? 0.5 : 1);
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), def.brake * 0.4 * dt);
      if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
      car.speed = clamp(car.speed, -def.top * 0.45, def.top);
      const steer = axis.x * def.turn * clamp(Math.abs(car.speed) / 220, 0, 1) * (car.speed < 0 ? -1 : 1) * (handbrake ? 1.5 : 1);
      car.angle += steer * dt * (Math.abs(car.speed) > 20 ? 1 : 0);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const hit = city.collidesBuilding(nx, ny, 22);
      car.crashCd = Math.max(0, (car.crashCd || 0) - dt);
      if (hit) {
        const impact = Math.abs(car.speed);
        car.speed *= -0.25;
        if (car.crashCd <= 0 && impact > 60) {
          car.hp -= Math.min(10, 2 + impact * 0.015);
          car.crashCd = 0.6;
          burst(nx, ny, '#c9c9c9', 6, 140);
          if (audio) audio.crash();
        }
      } else { car.x = nx; car.y = ny; }
      car.x = clamp(car.x, 60, WORLD.size - 60); car.y = clamp(car.y, 60, WORLD.size - 60);
      if (car.speed > 60 && handbrake && rng.chance(0.3)) {
        state.particles.push({ x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20, vx: 0, vy: 0, life: 0.9, max: 0.9, color: '#888', size: 4 });
      }
      // Running over pedestrians is a crime.
      for (const ped of state.peds) {
        if (!ped.dead && dist2(car.x, car.y, ped.x, ped.y) < 26 * 26 && Math.abs(car.speed) > 80) {
          ped.dead = true; burst(ped.x, ped.y, '#c94f43', 10, 160); addWanted(1);
        }
      }
      p.x = car.x; p.y = car.y; p.angle = car.angle;
      if (car.hp <= 0 && !car.dead) {
        car.dead = true; explode(car.x, car.y); exitCar(); damagePlayer(25); say('Your car blew up!', 3);
      }
      car.smoke = car.hp < 50 ? 1 : car.hp < 25 ? 2 : 0;
      if (car.smoke && rng.chance(0.2)) state.particles.push({ x: car.x, y: car.y - 10, vx: rng.range(-10, 10), vy: -40, life: 0.8, max: 0.8, color: '#666', size: 5 });
      return;
    }
    // On foot.
    const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const mx = Math.cos(aimAngle) * 0 + axis.x, my = axis.y;
    // Walk relative to screen (north-up): W = up.
    let nx = p.x + axis.x * speed * dt, ny = p.y + axis.y * speed * dt;
    const hit = city.collidesBuilding(nx, ny, PLAYER.radius);
    if (hit) { nx = p.x; ny = p.y; }
    else { p.x = nx; p.y = ny; }
    p.x = clamp(p.x, 40, WORLD.size - 40); p.y = clamp(p.y, 40, WORLD.size - 40);
    p.moving = axis.x !== 0 || axis.y !== 0;
    p.speed = p.moving ? speed : 0;
    if (p.moving) p.angle = Math.atan2(axis.y, axis.x);
    else p.angle = aimAngle;
    // Pickups.
    for (const pk of city.pickups) {
      if (!pk.taken && dist2(p.x, p.y, pk.x, pk.y) < 30 * 30) {
        pk.taken = true;
        if (pk.kind === 'health') p.hp = Math.min(100, p.hp + 40);
        else if (pk.kind === 'armour') p.armour = Math.min(100, p.armour + 50);
        else { p.weapon = pk.kind; state.ammo[pk.kind] = (state.ammo[pk.kind] || 0) + 60; }
        say('Picked up ' + pk.kind + '!', 2); if (audio) audio.pickup();
      }
    }
    for (const pkg of city.packages) {
      if (!pkg.found && dist2(p.x, p.y, pkg.x, pkg.y) < 30 * 30) {
        pkg.found = true; state.packagesFound++; addCash(PACKAGE_REWARD);
        say('Hidden package found! +$' + PACKAGE_REWARD + ' (' + state.packagesFound + '/12)', 3);
        if (audio) audio.pickup();
      }
    }
  }

  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (car.dead || !car.traffic) continue;
      const def = CAR_TYPES[car.type];
      // Follow nearest road line.
      const onX = Math.abs(car.y - city.nearestRoadZ(car.y)) < Math.abs(car.x - city.nearestRoadX(car.x));
      let targetSpeed = def.top * 0.42;
      // Stop for red lights at intersections (phase from clock).
      const lightPhase = (state.time % 8) < 4;
      const nearIntersection = Math.abs(car.x - city.nearestRoadX(car.x)) < 60 && Math.abs(car.y - city.nearestRoadZ(car.y)) < 60;
      if (nearIntersection && !lightPhase) targetSpeed = 0;
      // Slow for the car ahead.
      for (const other of state.cars) {
        if (other === car || other.dead) continue;
        const d = dist2(car.x, car.y, other.x, other.y);
        if (d < 70 * 70) { targetSpeed = Math.min(targetSpeed, 60); break; }
      }
      if (car.flee > 0) { car.flee -= dt; targetSpeed = def.top * 0.7; }
      car.speed += clamp(targetSpeed - car.speed, -def.brake * dt, def.accel * 0.6 * dt);
      if (onX) {
        car.angle = car.dir > 0 ? 0 : Math.PI;
        car.y += (city.nearestRoadZ(car.y) + (car.dir > 0 ? 22 : -22) - car.y) * dt * 2;
        car.x += Math.cos(car.angle) * car.speed * dt;
      } else {
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.x += (city.nearestRoadX(car.x) + (car.dir > 0 ? -22 : 22) - car.x) * dt * 2;
        car.y += Math.sin(car.angle) * car.speed * dt;
      }
      // Wrap around the city edges so traffic never runs out.
      if (car.x < 80) { car.x = WORLD.size - 100; }
      if (car.x > WORLD.size - 80) { car.x = 100; }
      if (car.y < 80) { car.y = WORLD.size - 100; }
      if (car.y > WORLD.size - 80) { car.y = 100; }
      if (city.collidesBuilding(car.x, car.y, 20)) { car.angle += Math.PI / 2; car.dir *= -1; }
    }
  }

  function updatePeds(dt) {
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = angleTo(state.player.x, state.player.y, ped.x, ped.y);
        ped.x += Math.cos(a) * 160 * dt; ped.y += Math.sin(a) * 160 * dt;
        continue;
      }
      if (!ped.target || dist2(ped.x, ped.y, ped.target.x, ped.target.y) < 20 * 20) {
        ped.target = { x: clamp(ped.x + rng.range(-260, 260), 300, WORLD.size - 300), y: clamp(ped.y + rng.range(-260, 260), 300, WORLD.size - 300) };
      }
      const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * ped.speed * dt, ny = ped.y + Math.sin(a) * ped.speed * dt;
      if (!city.collidesBuilding(nx, ny, 10)) { ped.x = nx; ped.y = ny; }
    }
    // Keep the crowd topped up near the player.
    if (state.peds.filter(p => !p.dead).length < 20) {
      spawnPed(clamp(state.player.x + rng.range(-500, 500), 300, WORLD.size - 300), clamp(state.player.y + rng.range(-500, 500), 300, WORLD.size - 300));
    }
  }

  function updatePolice(dt) {
    // Wanted decay when out of sight of any cruiser.
    const p = state.player;
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      let seen = false;
      for (const c of state.cars) if (c.police && !c.dead && dist2(p.x, p.y, c.x, c.y) < 700 * 700) seen = true;
      if (!seen && state.wantedTimer > POLICE.decayDelay) {
        state.wanted--; state.wantedTimer = 0;
        if (state.wanted === 0) say('You lost the cops.', 3);
      }
    }
    const want = POLICE.maxCruisers[state.wanted];
    const cruisers = state.cars.filter(c => c.police && !c.dead);
    if (cruisers.length < want) {
      const a = rng.range(0, Math.PI * 2);
      const x = clamp(p.x + Math.cos(a) * POLICE.spawnDist, 100, WORLD.size - 100);
      const y = clamp(p.y + Math.sin(a) * POLICE.spawnDist, 100, WORLD.size - 100);
      const c = spawnCar('police', x, y, angleTo(x, y, p.x, p.y), false, true);
      c.traffic = false;
    }
    for (const c of cruisers) {
      const def = CAR_TYPES.police;
      const a = angleTo(c.x, c.y, p.x, p.y);
      const diff = angleDiff(c.angle, a);
      c.angle += clamp(diff, -def.turn * dt, def.turn * dt);
      const target = def.top * (state.wanted >= 3 ? 0.95 : 0.8);
      c.speed += clamp(target - c.speed, -def.brake * dt, def.accel * dt);
      const nx = c.x + Math.cos(c.angle) * c.speed * dt, ny = c.y + Math.sin(c.angle) * c.speed * dt;
      if (city.collidesBuilding(nx, ny, 22)) { c.speed *= 0.3; c.angle += 0.6; }
      else { c.x = nx; c.y = ny; }
      // Ram the player car / bust on foot.
      const d = Math.sqrt(dist2(c.x, c.y, p.x, p.y));
      const pcar = playerCar();
      if (pcar && d < 52) {
        pcar.hp -= POLICE.ramDamage * dt; c.speed *= 0.92;
        pcar.x += Math.cos(a) * 30 * dt; pcar.y += Math.sin(a) * 30 * dt;
        if (rng.chance(0.05)) burst(pcar.x, pcar.y, '#c9c9c9', 4, 100);
      }
      if (!pcar && d < POLICE.bustRadius) {
        state.bustTimer += dt;
        if (state.bustTimer > POLICE.bustTime) {
          state.screen = 'busted'; addCash(-Math.min(state.cash, 300)); state.wanted = 0; save();
          if (audio) audio.busted();
        }
      } else state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
    }
    // Helicopter from 3 stars: hovers above the player, keeps them visible.
    if (state.wanted >= POLICE.heliAtStars) {
      if (!state.heli) state.heli = { x: p.x, y: p.y, angle: 0 };
      state.heli.x += (p.x - state.heli.x) * dt * 0.7;
      state.heli.y += (p.y - state.heli.y) * dt * 0.7;
      state.heli.angle += dt * 2;
      state.wantedTimer = Math.min(state.wantedTimer, 4); // heli keeps the heat on
    } else state.heli = null;
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      if (city.collidesBuilding(b.x, b.y, 2)) { b.life = 0; burst(b.x, b.y, '#d8c98a', 3, 80); continue; }
      if (b.fromPlayer) {
        for (const e of state.enemies) {
          if (!e.dead && dist2(b.x, b.y, e.x, e.y) < 18 * 18) {
            e.hp -= b.damage; b.life = 0; burst(b.x, b.y, '#c94f43', 6, 120);
            if (e.hp <= 0) { e.dead = true; state.kills++; burst(e.x, e.y, '#c94f43', 12, 180); }
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const car of state.cars) {
          if (!car.dead && dist2(b.x, b.y, car.x, car.y) < 24 * 24) {
            car.hp -= b.damage; b.life = 0;
            if (car.traffic) { car.traffic = false; car.flee = 4; addWanted(1); }
            if (car.hp <= 0 && !car.dead) { car.dead = true; explode(car.x, car.y); }
            break;
          }
        }
      } else {
        if (dist2(b.x, b.y, state.player.x, state.player.y) < 16 * 16) {
          b.life = 0; damagePlayer(b.damage);
          burst(b.x, b.y, '#c94f43', 5, 100);
        }
        const pcar = playerCar();
        if (pcar && dist2(b.x, b.y, pcar.x, pcar.y) < 26 * 26) { b.life = 0; pcar.hp -= b.damage; }
      }
    }
    state.bullets = state.bullets.filter(b => b.life > 0);
  }

  function updateEnemies(dt) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      const p = state.player;
      const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
      e.angle = angleTo(e.x, e.y, p.x, p.y);
      if (d > 260) { e.x += Math.cos(e.angle) * e.speed * dt; e.y += Math.sin(e.angle) * e.speed * dt; }
      e.cooldown -= dt;
      if (e.cooldown <= 0 && d < 480) {
        e.cooldown = rng.range(0.9, 1.8);
        state.bullets.push({ x: e.x + Math.cos(e.angle) * 20, y: e.y + Math.sin(e.angle) * 20, angle: e.angle + rng.range(-0.06, 0.06), speed: 700, life: 0.8, damage: 9, fromPlayer: false });
        burst(e.x + Math.cos(e.angle) * 24, e.y + Math.sin(e.angle) * 24, '#ffd23f', 3, 100);
      }
    }
  }

  function updateMission(dt) {
    const m = state.mission; if (!m) return;
    const s = m.stages[state.missionStage];
    const p = state.player;
    const at = (spot, r) => dist2(p.x, p.y, spot.x, spot.y) < r * r;
    if (s.type === 'goto' && at(s.at, 90)) advanceStage();
    else if (s.type === 'steal') {
      const car = state.cars.find(c => c.type === s.car && !c.dead && dist2(p.x, p.y, c.x, c.y) < 120 * 120);
      if (car && state.playerCar === car.id) { addWanted(1); advanceStage(); }
      else if (!state.cars.some(c => c.type === s.car && !c.dead)) {
        // The target car was destroyed: respawn it so the mission stays winnable.
        spawnCar('sports', s.at.x + 60, s.at.y, 0, true, false);
      }
    } else if (s.type === 'kill') {
      s.text = s.text.replace(/\(\d+\/\d+\)/, '(' + state.kills + '/' + s.count + ')');
      state.objective = s.text;
      if (state.kills >= s.count) advanceStage();
    } else if (s.type === 'collect' && at(s.at, 90)) advanceStage();
    else if (s.type === 'taxi') {
      if (state.taxiDone >= s.count) advanceStage();
    } else if (s.type === 'race') {
      state.missionTimer -= dt;
      for (const rp of state.racePoints) {
        if (!rp.hit && at(rp, 80)) { rp.hit = true; say('Checkpoint! ' + state.racePoints.filter(r => r.hit).length + '/' + state.racePoints.length, 2); if (audio) audio.pickup(); }
      }
      if (state.racePoints.every(r => r.hit)) advanceStage();
      else if (state.missionTimer <= 0) { say('Race failed — time up. Try again from Marisol.', 4); startMission(state.missionIndex); }
    }
    // Taxi side activity runs alongside any mission stage.
    if (state.taxi) {
      state.taxi.timer -= dt;
      if (!state.taxi.picked && at(state.taxi.pickup, 60)) {
        state.taxi.picked = true; say('Fare picked up — drive to ' + state.taxi.dest.label, 3);
      } else if (state.taxi.picked && at(state.taxi.dest, 90)) {
        addCash(state.taxi.fare); state.stats.fares++; state.taxiDone++;
        say('Fare complete +$' + state.taxi.fare, 3);
        if (audio) audio.missionDone();
        state.taxi = null;
        if (m && m.stages[state.missionStage].type === 'taxi' && state.taxiDone < m.stages[state.missionStage].count) startTaxiFare();
      } else if (state.taxi.timer <= 0) { say('Taxi fare expired.', 3); state.taxi = null; }
    }
  }

  function step(dt, input, aimAngle, shootHeld, shootPressed) {
    if (state.screen !== 'play') return;
    state.time += dt;
    state.clock = (state.clock + dt / 60) % 24; // 1 real minute = 1 game hour
    if (state.messageTimer > 0) state.messageTimer -= dt;
    for (const f of state.floaters) f.life -= dt;
    state.floaters = state.floaters.filter(f => f.life > 0);
    for (const c of state.casings) c.life -= dt;
    state.casings = state.casings.filter(c => c.life > 0);
    for (const pt of state.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    state.particles = state.particles.filter(pt => pt.life > 0);

    const p = state.player;
    const w = WEAPONS[p.weapon];
    state.shootCooldown = Math.max(0, (state.shootCooldown || 0) - dt);
    if ((shootPressed || (shootHeld && w.auto)) && state.shootCooldown <= 0 && !playerCar()) {
      state.shootCooldown = w.rate;
      shoot();
    }
    updatePlayer(dt, input, aimAngle);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateMission(dt);
    if (audio) {
      const car = playerCar();
      audio.engine(car ? Math.abs(car.speed) / CAR_TYPES[car.type].top : 0, !!car);
      audio.siren(state.wanted > 0, dt);
      audio.music(dt);
    }
  }

  return {
    state, MISSIONS, reset, load, save, step, startMission, addCash, addWanted, say,
    enterCar, exitCar, nearestCar, playerCar, spawnCar, spawnPed, damagePlayer,
    missionText() { const m = state.mission; return m ? m.title + ' — ' + state.objective : state.objective; },
  };
}
