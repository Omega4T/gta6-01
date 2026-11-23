// Solara City: boot, the fixed-step game loop, the player on foot and behind
// the wheel, the state machine (menu, play, pause, busted, wasted, done),
// the camera, and the save file. Every system is wired together here.

import { CFG } from './config.js';
import { makeRng, rand, clamp, dist } from './random.js';
import { buildCity, LANDMARKS, resolveBuildingCollision } from './city.js';
import { bindInput } from './input.js';
import { createAudio } from './audio.js';
import { makeCar, driveCar, moveCar, collideCars, enterCar, exitCar, addHeat, wantedStars } from './vehicles.js';
import { spawnTraffic, spawnPeds, updateTraffic, updatePeds, scatterPeds, nearestPed } from './crowd.js';
import { updatePolice, wastePlayer } from './police.js';
import { fireWeapon, updateBullets, updateEnemies, updatePickups, updateParticles, updateFloats, hurtPlayer } from './combat.js';
import { startMission, updateMission, updateTaxi, updateRace, startRace, raceStartNear, collectPackages, missionTarget, startTaxi } from './missions.js';
import { scatterPackages } from './missions.js';
import { nearGarage, buyCar, retrieveCar, storeCurrentCar, garageLines } from './garage.js';
import { drawGame, darkness } from './render.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'solara-city-save-v1';

// Build a fresh game state.
function createState() {
  const rng = makeRng(CFG.citySeed);
  const city = buildCity(rng);
  const S = {
    rng, city,
    time: 0,
    clock: 8 * 60,
    mode: 'menu',
    modeTimer: 0,
    frozen: false,
    shotName: null,
    player: {
      x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, ang: 0,
      hp: CFG.player.maxHealth, maxHealth: CFG.player.maxHealth,
      armor: 0, maxArmor: CFG.player.maxArmor,
      cash: CFG.player.startCash,
      rep: 0, heat: 0, weapon: 'pistol',
      ammo: { pistol: 120, shotgun: 36, smg: 90 },
      onFoot: true, inCar: null,
    },
    cars: [], peds: [], cops: [], roadblocks: [],
    bullets: [], parts: [], floats: [], pickups: [],
    enemies: [], packages: [],
    heli: null,
    mission: { index: 0, active: false, step: 0, steps: [], carried: false, killsDone: 0, faresDone: 0, holdTimer: 0, spawned: false, holdSpawned: false },
    taxi: { active: false, phase: 'toPassenger', px: 0, py: 0, dx: 0, dy: 0, fare: 0 },
    race: null,
    garage: { owned: [] },
    radio: { station: 0 },
    cam: { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, zoom: 0.9, shake: 0 },
    fireCooldown: 0,
    bustedTimer: 0,
    copSpawnTimer: 0,
    roadblockTimer: 12,
    banner: null,
    showGarage: false,
    hasSave: false,
    stats: { kills: 0, stolen: 0, earned: 0 },
    audio: null,
    input: null,
  };
  // A sedan parked by the safehouse, the player's first ride, centred on the
  // road so driving away does not clip the sidewalk pedestrians.
  const starter = makeCar('sedan', LANDMARKS.safehouse.x, LANDMARKS.safehouse.y - 60, Math.PI / 2, 'parked');
  S.cars.push(starter);
  // The parked cars from the city layout join the world as stealable cars.
  for (const pc of city.parked) {
    S.cars.push(makeCar(pc.type, pc.x, pc.y, pc.ang, 'parked'));
  }
  spawnTraffic(S);
  spawnPeds(S);
  scatterPackages(S);
  // A few pickups on the street to start with.
  S.pickups.push({ x: LANDMARKS.safehouse.x + 120, y: LANDMARKS.safehouse.y + 90, kind: 'health', bob: 0 });
  S.pickups.push({ x: LANDMARKS.oldTown.x, y: LANDMARKS.oldTown.y + 120, kind: 'armor', bob: 2 });
  S.pickups.push({ x: LANDMARKS.marina.x + 60, y: LANDMARKS.marina.y, kind: 'ammo', bob: 4 });
  return S;
}

// Persist cash, progress, packages and the garage.
function saveGame(S) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: S.player.cash,
      missionIndex: S.mission.index,
      packagesTaken: S.packages.map((p) => p.taken),
      owned: S.garage.owned,
      rep: S.player.rep,
      station: S.radio.station,
    }));
  } catch (e) { /* storage unavailable: the game still plays */ }
}

function loadGame(S) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    S.player.cash = data.cash ?? CFG.player.startCash;
    S.mission.index = data.missionIndex ?? 0;
    S.garage.owned = data.owned || [];
    S.player.rep = data.rep || 0;
    S.radio.station = data.station || 0;
    if (Array.isArray(data.packagesTaken)) {
      data.packagesTaken.forEach((taken, i) => {
        if (taken && S.packages[i]) S.packages[i].taken = true;
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ---- Player ----

function updatePlayer(S, dt) {
  const p = S.player;
  const input = S.input;
  if (p.onFoot) {
    let mx = 0, my = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) my -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) my += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? CFG.player.runSpeed : CFG.player.walkSpeed;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      resolveBuildingCollision(S.city.buildings, p, CFG.player.radius);
    }
    // Aim at the mouse.
    const mw = screenToWorld(S, input.mouse.x, input.mouse.y);
    p.ang = Math.atan2(mw.y - p.y, mw.x - p.x);
    // Shooting.
    if (input.mouse.down || input.mouse.justClicked) {
      const w = CFG.weapons[p.weapon];
      if (w.auto ? input.mouse.down : input.mouse.justClicked) {
        fireWeapon(S, mw.x, mw.y);
      }
    }
    if (input.pressed('KeyE')) enterCar(S);
  } else if (p.inCar) {
    const car = p.inCar;
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const steer = (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0) + (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
    const handbrake = input.down('Space');
    driveCar(car, throttle, steer, handbrake, dt);
    moveCar(S, car, dt);
    p.x = car.x; p.y = car.y;
    p.ang = car.ang;
    if (input.pressed('KeyE')) exitCar(S);
    // Drive-by shooting with the mouse.
    if (input.mouse.down || input.mouse.justClicked) {
      const w = CFG.weapons[p.weapon];
      if (p.weapon !== 'fists' && (w.auto ? input.mouse.down : input.mouse.justClicked)) {
        const mw = screenToWorld(S, input.mouse.x, input.mouse.y);
        fireWeapon(S, mw.x, mw.y);
      }
    }
  }
  // Cars running over pedestrians: the driver pays in heat.
  for (const car of S.cars) {
    if (car.dead || Math.abs(car.speed) < 60) continue;
    for (const ped of S.peds) {
      if (dist(car.x, car.y, ped.x, ped.y) < car.radius + 6) {
        S.peds.splice(S.peds.indexOf(ped), 1);
        if (car.driver === 'player') {
          addHeat(S, CFG.police.heatPerKill);
          S.stats.kills++;
        }
        scatterPeds(S, car.x, car.y, 240);
        break;
      }
    }
  }
  // The player's car bumping traffic.
  if (p.inCar && !p.inCar.dead) {
    for (const other of S.cars) {
      if (other === p.inCar || other.dead) continue;
      collideCars(S, p.inCar, other);
    }
  }
}

// Screen pixel to world coordinates through the camera.
function screenToWorld(S, sx, sy) {
  const canvas = S.canvas;
  const cam = S.cam;
  return {
    x: cam.x + (sx - canvas.width / 2) / cam.zoom,
    y: cam.y + (sy - canvas.height / 2) / cam.zoom,
  };
}

// ---- One fixed update step ----

function update(S, dt) {
  S.time += dt;
  S.clock = (S.clock + dt) % 1440;
  S.fireCooldown = Math.max(0, S.fireCooldown - dt);
  if (S.banner) S.banner.t += dt;
  S.cam.shake = Math.max(0, S.cam.shake - dt * 22);
  const input = S.input;

  if (S.mode === 'menu') {
    if (input.pressed('Enter') || input.pressed('Space')) {
      S.audio.start();
      S.mode = 'play';
      if (S.hasSave) loadGame(S);
    }
    if (input.pressed('KeyN')) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      S.hasSave = false;
      S.mode = 'play';
    }
    input.endFrame();
    return;
  }

  if (S.mode === 'busted' || S.mode === 'wasted' || S.mode === 'complete') {
    S.modeTimer += dt;
    if (input.pressed('Enter') && S.modeTimer > 0.6) {
      S.mode = 'play';
      S.banner = null;
    }
    input.endFrame();
    return;
  }

  if (S.mode === 'pause') {
    if (input.pressed('KeyP') || input.pressed('Escape')) S.mode = 'play';
    input.endFrame();
    return;
  }

  // Playing.
  if (input.pressed('KeyP') || input.pressed('Escape')) {
    if (S.showGarage) S.showGarage = false;
    else S.mode = 'pause';
    input.endFrame();
    return;
  }
  if (input.pressed('Digit0')) {
    S.audio.setMuted(!S.audio.muted);
  }
  if (input.pressed('KeyR') && !S.showGarage) {
    S.radio.station = (S.radio.station + 1) % CFG.radio.length;
    S.audio.setStation(S.radio.station);
  }
  if (input.pressed('KeyM') && !S.showGarage) {
    if (!S.mission.active && S.mission.index < CFG.missions.length) {
      startMission(S, S.mission.index);
    }
  }
  if (input.pressed('KeyT') && !S.showGarage) {
    if (S.taxi.active) S.taxi.active = false;
    else startTaxi(S);
  }
  if (input.pressed('KeyG') && nearGarage(S)) {
    S.showGarage = !S.showGarage;
  }
  if (S.showGarage) {
    for (let i = 0; i < 6; i++) {
      if (input.pressed('Digit' + (i + 1))) {
        const line = garageLines(S)[i];
        if (!line) continue;
        if (line.owned) retrieveCar(S, line.type);
        else {
          const result = buyCar(S, line.type);
          S.banner = { title: result === 'bought' ? 'CAR BOUGHT' : result.toUpperCase(), sub: line.text, t: 0 };
        }
      }
    }
    input.endFrame();
    return;
  }
  // Weapon selection.
  for (let i = 0; i < CFG.weaponOrder.length; i++) {
    if (input.pressed('Digit' + (i + 1)) && !S.showGarage) {
      S.player.weapon = CFG.weaponOrder[i];
    }
  }
  // Race start by driving into the East Highway marker.
  if (!S.race && !S.mission.active && raceStartNear(S) && input.pressed('KeyF')) {
    startRace(S);
  }

  updatePlayer(S, dt);
  updateTraffic(S, dt);
  updatePeds(S, dt);
  updatePolice(S, dt);
  updateBullets(S, dt);
  updateEnemies(S, dt);
  updatePickups(S, dt);
  updateParticles(S, dt);
  updateFloats(S, dt);
  updateMission(S, dt);
  // A race started free-roam (F at the highway marker) is not a mission step,
  // so it needs its own update here; the mission's race step only reads the
  // result.
  if (S.race && S.race.active) updateRace(S, dt);
  updateTaxi(S, dt);
  collectPackages(S);

  // Camera follows the player, widening with speed.
  const p = S.player;
  const speedRatio = p.inCar ? Math.abs(p.inCar.speed) / p.inCar.maxSpeed : 0;
  const targetZoom = p.inCar ? 0.9 - speedRatio * 0.26 : 0.95;
  S.cam.zoom += (targetZoom - S.cam.zoom) * Math.min(1, dt * 2);
  S.cam.x += (p.x - S.cam.x) * Math.min(1, dt * 5);
  S.cam.y += (p.y - S.cam.y) * Math.min(1, dt * 5);

  // Audio follows the game.
  S.audio.engine(speedRatio, !!p.inCar);
  if (wantedStars(S) > 0) S.audio.siren(dt);
  S.audio.music(dt);

  // Death ends the run.
  if (p.hp <= 0) wastePlayer(S);

  input.endFrame();
}

// ---- Boot ----

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const S = createState();
  S.canvas = canvas;
  S.audio = createAudio();
  S.input = bindInput(canvas);
  S.saveGame = () => saveGame(S);
  S.hasSave = !!localStorage.getItem(SAVE_KEY);

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Screenshot staging: ?shot=chase|foot|mission|night builds one exact
  // scene, warms it up for a fixed number of frames, then freezes it.
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    S.mode = 'play';
    if (applyShot(S, shot)) {
      S.audio.started = false;
      for (let i = 0; i < 45; i++) update(S, 1 / 60);
      S.frozen = true;
    }
  }

  // Fixed-step loop with interpolation-free rendering.
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!S.frozen) {
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 5) {
        update(S, 1 / 60);
        acc -= 1 / 60;
        steps++;
      }
      if (steps === 5) acc = 0;
    }
    drawGame(ctx, S);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Expose the state for debugging and for the screenshot driver.
  window.__solara = S;
}

boot();
