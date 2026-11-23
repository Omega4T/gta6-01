// Solara City v2 — game orchestration: state, helpers, and the step loop.
// This file owns the state object and the small helpers every system shares
// (messages, cash, wanted, particles, saving). The actual updates live in the
// split modules: vehicles, crowd, police, combat, missions, garage, radio.
// One step(dt) advances the world; the renderer only reads.
import { PLAYER, WEAPONS, CAR_TYPES, DENSITY, SAVE_KEY, WORLD } from './config.js';
import { createRandom, clamp, dist2 } from './random.js';
import { SPOTS } from './city.js';
import { spawnVehicle, resetCarIds, playerCar, nearestCar, enterCar, exitCar, updateDriving, updateTraffic } from './vehicles.js';
import { spawnPedestrian, updatePedestrians } from './crowd.js';
import { updatePolice, addWanted } from './police.js';
import { fireWeapon, updateBullets, updateEnemies, updatePickups } from './combat.js';
import { startMission, updateMissions } from './missions.js';

export function createGame(city, seed, audio) {
  const rng = createRandom(seed ^ 0x51ab);
  const state = {
    screen: 'menu', time: 0, clock: 9.5,
    player: { x: 2500, y: 2900, angle: -Math.PI / 2, hp: 100, armour: 0, weapon: 'pistol', speed: 0, moving: false },
    ammo: { pistol: 120, shotgun: 24, smg: 90 },
    cash: 250, rep: 0, wanted: 0, wantedTimer: 0, bustTimer: 0, roadblockSet: false,
    cars: [], peds: [], enemies: [], bullets: [], particles: [], floaters: [], casings: [],
    missionIndex: 0, mission: null, missionStage: 0, missionTimer: 0, racePoints: [],
    taxi: null, taxiDone: 0, packagesFound: 0, kills: 0,
    message: '', messageTimer: 0, objective: 'Visit Marisol Vega',
    heli: null, stats: { shots: 0, carsStolen: 0, fares: 0 },
    muted: false, photoMode: false, paused: false,
    radioIndex: 0, ownedCars: [], garageSelected: 0,
    shootCooldown: 0, playerCar: null,
  };

  const game = {
    state, city, rng, audio,
    say(text, secs) { state.message = text; state.messageTimer = secs || 4; },
    addCash(n) {
      state.cash += n;
      state.floaters.push({ x: state.player.x, y: state.player.y - 30, text: (n > 0 ? '+' : '') + '$' + n, life: 1.6, color: n > 0 ? '#7dff8a' : '#ff7a6a' });
    },
    addWanted(n) { addWanted(game, n); },
    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), s = rng.range(speed * 0.3, speed);
        state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rng.range(0.3, 0.8), max: 0.8, color, size: rng.range(2, 5) });
      }
    },
    explode(x, y) {
      game.burst(x, y, '#ff9a3c', 26, 260);
      game.burst(x, y, '#ffd23f', 16, 180);
      game.burst(x, y, '#555', 14, 120);
      state.floaters.push({ x, y: y - 20, text: 'BOOM', life: 1.2, color: '#ff7a3c' });
      if (audio) audio.explosion();
    },
    spawnCar(type, x, y, angle, parked, police) { return spawnVehicle(game, type, x, y, angle, { parked: !!parked, police: !!police }); },
    spawnPed(x, y) { return spawnPedestrian(game, x, y); },
    enterCar(car) { enterCar(game, car); },
    exitCar() { exitCar(game); },
    nearestCar(maxD) { return nearestCar(game, maxD); },
    playerCar() { return playerCar(game); },
    missionText() {
      const m = state.mission;
      return m ? m.title + ' — ' + state.objective : state.objective;
    },
  };

  function seedTraffic(count) {
    // Moving traffic on the road lines (v1 only ever spawned parked cars).
    const types = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck', 'beach', 'muscle'];
    for (let i = 0; i < count; i++) {
      const alongX = rng.chance(0.5);
      let x, y, angle;
      if (alongX) {
        const rz = city.roadsZ[rng.int(0, city.roadsZ.length - 1)];
        x = rng.range(300, WORLD.size - 300);
        y = rz + rng.pick([-22, 22]);
        angle = y > rz ? Math.PI : 0;
      } else {
        const rx = city.roadsX[rng.int(0, city.roadsX.length - 1)];
        x = rx + rng.pick([-22, 22]);
        y = rng.range(300, WORLD.size - 300);
        angle = x > rx ? -Math.PI / 2 : Math.PI / 2;
      }
      const car = spawnVehicle(game, rng.pick(types), x, y, angle, { parked: false });
      car.speed = CAR_TYPES[car.type].top * rng.range(0.3, 0.45);
    }
  }

  function reset(newGame) {
    resetCarIds();
    state.cars = []; state.peds = []; state.enemies = []; state.bullets = [];
    state.particles = []; state.floaters = []; state.casings = [];
    state.time = 0; state.clock = 9.5; state.wanted = 0; state.wantedTimer = 0;
    state.bustTimer = 0; state.roadblockSet = false;
    state.player = { x: 2500, y: 2900, angle: -Math.PI / 2, hp: 100, armour: 0, weapon: 'pistol', speed: 0, moving: false };
    state.ammo = { pistol: 120, shotgun: 24, smg: 90 };
    state.taxi = null; state.taxiDone = 0; state.packagesFound = 0; state.kills = 0;
    state.heli = null; state.playerCar = null;
    state.screen = 'play';
    if (newGame) {
      state.cash = 250; state.rep = 0; state.missionIndex = 0;
      state.ownedCars = []; state.radioIndex = 0;
    }
    const parkedTypes = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck', 'beach', 'muscle'];
    for (const s of city.carSpawns.slice(0, 70)) {
      spawnVehicle(game, rng.pick(parkedTypes), s.x, s.y, s.angle, { parked: true });
    }
    seedTraffic(48);
    for (let i = 0; i < DENSITY.pedestrians; i++) {
      const s = city.pedSpawns[rng.int(0, city.pedSpawns.length - 1)];
      spawnPedestrian(game, s.x, s.y);
    }
    spawnVehicle(game, 'sedan', 2520, 2980, 0, { parked: true });
    startMission(game, state.missionIndex);
    game.say('Welcome to Solara City. Follow the yellow marker.', 5);
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, rep: state.rep, missionIndex: state.missionIndex,
        packagesFound: state.packagesFound, muted: state.muted,
        ownedCars: state.ownedCars, radioIndex: state.radioIndex,
      }));
    } catch { /* storage off */ }
  }
  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.cash = d.cash || 250; state.rep = d.rep || 0; state.missionIndex = d.missionIndex || 0;
      state.packagesFound = d.packagesFound || 0; state.muted = !!d.muted;
      state.ownedCars = Array.isArray(d.ownedCars) ? d.ownedCars : [];
      state.radioIndex = Number.isInteger(d.radioIndex) ? d.radioIndex : 0;
      return true;
    } catch { return false; }
  }
  game.save = save;
  game.load = load;
  game.reset = reset;
  game.startMission = (i) => startMission(game, i);

  function updateOnFoot(dt, input, aimAngle) {
    const p = state.player;
    const axis = input.axis();
    const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = p.x + axis.x * speed * dt;
    const ny = p.y + axis.y * speed * dt;
    if (!city.collidesBuilding(nx, ny, PLAYER.radius)) { p.x = nx; p.y = ny; }
    p.x = clamp(p.x, 40, WORLD.size - 40);
    p.y = clamp(p.y, 40, WORLD.size - 40);
    p.moving = axis.x !== 0 || axis.y !== 0;
    p.speed = p.moving ? speed : 0;
    p.angle = p.moving ? Math.atan2(axis.y, axis.x) : aimAngle;
    updatePickups(game);
  }

  function step(dt, input, aimAngle, shootHeld, shootPressed) {
    if (state.screen !== 'play') return;
    state.time += dt;
    state.clock = (state.clock + dt / 60) % 24;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    for (const f of state.floaters) f.life -= dt;
    state.floaters = state.floaters.filter((f) => f.life > 0);
    for (const c of state.casings) c.life -= dt;
    state.casings = state.casings.filter((c) => c.life > 0);
    for (const pt of state.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    state.particles = state.particles.filter((pt) => pt.life > 0);

    const p = state.player;
    const w = WEAPONS[p.weapon];
    state.shootCooldown = Math.max(0, state.shootCooldown - dt);
    if ((shootPressed || (shootHeld && w.auto)) && state.shootCooldown <= 0 && !playerCar(game)) {
      state.shootCooldown = w.rate;
      fireWeapon(game);
    }
    if (playerCar(game)) updateDriving(game, dt, input);
    else updateOnFoot(dt, input, aimAngle);
    updateTraffic(game, dt);
    updatePedestrians(game, dt);
    updatePolice(game, dt);
    updateEnemies(game, dt);
    updateBullets(game, dt);
    updateMissions(game, dt);
    if (audio) {
      const car = playerCar(game);
      audio.engine(car ? Math.abs(car.speed) / CAR_TYPES[car.type].top : 0, !!car);
      audio.siren(state.wanted > 0, dt);
      audio.music(dt);
    }
  }
  game.step = step;

  return game;
}
