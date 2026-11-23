// Solara City 3D — bootstrap, game loop, input, camera, screens and saves.
// Wires the city, cars, crowd, police, combat, missions, garage, audio and
// HUD together into one playable open-world game.
import * as THREE from 'three';
import { makeRng, clamp, angleDiff } from './rng.js';
import { buildCity, districtAt, CITY_HALF, randomRoadPoint } from './city.js';
import { Car, TrafficSystem, CAR_TYPES } from './cars.js';
import { Player, Crowd } from './people.js';
import { Police } from './police.js';
import { Combat, WEAPONS } from './combat.js';
import { MissionManager, JOBS } from './missions.js';
import { Garage } from './garage.js';
import { AudioEngine } from './audio.js';
import { HUD, rankFor } from './hud.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'solara-city-3d-saves';
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const TOD = params.get('tod') || (SHOT === 'foot' ? 'night' : SHOT === 'title' ? 'dusk' : 'golden');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById('gl').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(0, 90, 280);

const city = buildCity(scene, TOD);
const traffic = new TrafficSystem(scene, city.colliders);
const crowd = new Crowd(scene, city.colliders);
const player = new Player(scene);
const police = new Police(scene, city.colliders);
const combat = new Combat(scene);
const missions = new MissionManager(scene);
const garage = new Garage(scene);
const audio = new AudioEngine();
const hud = new HUD();
const rng = makeRng(555);

const state = {
  mode: 'title', // title | play | pause | banner
  cash: 250,
  rp: 0,
  stats: { carsStolen: 0, copsEscaped: 0, kmDriven: 0, kills: 0, taxiFares: 0, cashEarned: 0 },
  packagesFound: 0,
  crew: [
    { name: 'MIRA', role: 'DRIVER', ability: 'SWAP PLATES', key: 'Z', cd: 0, maxCd: 45 },
    { name: 'LIO', role: 'MECHANIC', ability: 'QUICK FIX', key: 'X', cd: 0, maxCd: 30 },
    { name: 'KIKI', role: 'LOOKOUT', ability: 'EYES OUT', key: 'C', cd: 0, maxCd: 40 },
  ],
  eyesOut: 0,
  titleOrbit: false,
  autoDrive: false,
  targetCar: null,
  killsAtStageStart: 0,
  bannerKind: null,
};

const input = {
  forward: false, back: false, left: false, right: false,
  brake: false, sprint: false, mouseDown: false,
};
let camYaw = Math.PI, camPitch = 0.32;
let camPos = new THREE.Vector3(0, 90, 280);
let camLook = new THREE.Vector3(0, 0, 0);
let lastTime = performance.now();
let shotFiredRecently = 0;

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'brake', ShiftLeft: 'sprint', ShiftRight: 'sprint',
};

addEventListener('keydown', (e) => {
  audio.ensure();
  if (KEYMAP[e.code] !== undefined) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyM') startNextJob();
  if (e.code === 'KeyT') startTaxi();
  if (e.code === 'KeyG') toggleGarage();
  if (e.code === 'KeyR') { const st = audio.cycleStation(); hud.toast(`RADIO — ${st.name} · ${st.track}`); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5)) - 1;
    if (n >= 0 && n < WEAPONS.length) {
      if (combat.select(n)) hud.toast(`${WEAPONS[n].name} ready`);
      else hud.toast(`${WEAPONS[n].name} is locked — finish jobs to unlock it`);
    }
  }
  if (e.code === 'KeyZ') useCrew(0);
  if (e.code === 'KeyX') useCrew(1);
  if (e.code === 'KeyC') useCrew(2);
});
addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] !== undefined) input[KEYMAP[e.code]] = false;
});
addEventListener('mousedown', (e) => {
  audio.ensure();
  if (state.mode !== 'play') return;
  if (e.target.closest('.screen') || e.target.closest('button')) return;
  input.mouseDown = true;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  }
  tryShoot();
});
addEventListener('mouseup', () => { input.mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    camYaw -= e.movementX * 0.0028;
    camPitch = clamp(camPitch + e.movementY * 0.002, 0.05, 0.9);
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- mission hooks: what the mission system can ask the game to do ----
const missionHooks = {
  say: (who, text) => hud.say(who, text, who.startsWith('MARISOL') ? 'M' : who[0]),
  spawnEnemies: (x, z, count) => {
    combat.clearEnemies();
    state.killsAtStageStart = combat.kills;
    for (let i = 0; i < count; i++) {
      combat.spawnEnemy(x + rng.range(-14, 14), z + rng.range(-14, 14), { hp: 60 });
    }
  },
  spawnTargetCar: () => {
    const p = randomRoadPoint(rng);
    const van = new Car(scene, CAR_TYPES[4], p.x, p.z, 0, { traffic: true });
    van.health = 100;
    state.targetCar = van;
    return van;
  },
  enemiesLeft: () => combat.enemies.filter(e => !e.dead).length,
  killCount: () => combat.kills - state.killsAtStageStart,
  onJobComplete: (job) => {
    state.cash += job.reward;
    state.rp += job.rp;
    state.stats.cashEarned += job.reward;
    if (job.unlock) { combat.unlock(job.unlock); hud.toast(`WEAPON UNLOCKED: ${WEAPONS.find(w => w.id === job.unlock).name}`); }
    audio.jingle();
    showBanner('JOB COMPLETE', job.title, `+$${job.reward.toLocaleString()} · +${job.rp} RP — Marisol is pleased. The city notices.`, 'job');
  },
  onPackage: () => {
    state.packagesFound = missions.packagesFound;
    state.cash += 150;
    state.stats.cashEarned += 150;
    hud.toast(`HIDDEN PACKAGE ${missions.packagesFound}/12 — +$150`);
    audio.blip(880, 0.15, 'triangle', 0.2);
  },
  onTaxiPaid: (fare) => {
    state.cash += fare;
    state.stats.taxiFares++;
    state.stats.cashEarned += fare;
    hud.toast(`FARE PAID — +$${fare}`);
    audio.jingle();
  },
};

function startNextJob() {
  if (state.mode !== 'play') return;
  if (missions.active) { hud.toast('Finish the current job first — Marisol hates loose ends.'); return; }
  missions.nextJob(missionHooks);
}
function startTaxi() {
  if (state.mode !== 'play') return;
  if (missions.active) { hud.toast('Finish the job first — the cab can wait.'); return; }
  if (!player.inCar) { hud.toast('You need a car to run taxi fares.'); return; }
  missions.startTaxi(player.x, player.z, missionHooks);
}
function toggleGarage() {
  if (state.mode !== 'play') return;
  if (hud.garageEl) { hud.closeGarage(); return; }
  hud.showGarage(garage.list(), state.cash,
    (id) => {
      const r = garage.buy(id, state.cash);
      if (r.ok) { state.cash -= CAR_TYPES.find(t => t.id === id).price; hud.toast(r.msg); }
      else hud.toast(r.msg);
      hud.closeGarage();
    },
    (id) => {
      const car = garage.pullOut(id, city.garageLot.x, city.garageLot.z, 0);
      hud.closeGarage();
      hud.toast(`${car.type.name} is waiting at the lot.`);
    },
    () => hud.closeGarage());
}
function useCrew(i) {
  const c = state.crew[i];
  if (!c || c.cd > 0 || state.mode !== 'play') return;
  if (i === 0) {
    police.heat = clamp(police.heat - 0.22, 0, 1);
    hud.toast('MIRA — SWAP PLATES: heat dropping, plates changed.');
  } else if (i === 1) {
    if (player.inCar) { player.inCar.health = 100; hud.toast('LIO — QUICK FIX: car repaired.'); }
    else { player.armor = Math.min(100, player.armor + 50); hud.toast('LIO — QUICK FIX: fresh armour vest.'); }
  } else {
    state.eyesOut = 20;
    hud.toast('KIKI — EYES OUT: every SCPD unit marked on your minimap.');
  }
  c.cd = c.maxCd;
  audio.blip(660, 0.12, 'triangle', 0.2);
}

function tryEnterExitCar() {
  if (state.mode !== 'play') return;
  if (player.inCar) {
    player.exitCar();
    return;
  }
  const car = traffic.nearestCar(player.x, player.z, 5.5);
  if (car) {
    if (car.traffic) {
      // yank the driver out — that's a crime, the city notices
      traffic.cars = traffic.cars.filter(c => c !== car);
      car.traffic = false;
      police.addHeat(0.16);
      state.stats.carsStolen++;
      hud.toast(`Stole the ${car.type.name} — SCPD noticed.`);
    } else if (car.parked) {
      traffic.parked = traffic.parked.filter(c => c !== car);
      car.parked = false;
      police.addHeat(0.1);
      state.stats.carsStolen++;
      hud.toast(`Hot-wired the ${car.type.name}.`);
    }
    player.enterCar(car);
    audio.ensure();
    audio.blip(330, 0.1, 'square', 0.15);
  } else if (state.targetCar && Math.hypot(state.targetCar.x - player.x, state.targetCar.z - player.z) < 5.5) {
    player.enterCar(state.targetCar);
  }
}

function tryShoot() {
  if (state.mode !== 'play' || player.inCar || player.dead) return;
  const w = combat.weapon;
  if (w.id === 'fists') {
    // melee swing: hit the nearest enemy in front
    const targets = combat.enemies.filter(e => !e.dead);
    let best = null, bd = 2.6;
    for (const e of targets) {
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { best.onHit(w.damage); audio.noise(0.06, 0.2, 900); }
    return;
  }
  const origin = new THREE.Vector3(player.x, 1.45, player.z);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const aim = origin.clone().add(camDir.clone().multiplyScalar(60));
  const dir = aim.sub(origin).normalize();
  const targets = [];
  for (const e of combat.enemies) if (!e.dead) targets.push(e);
  for (const c of police.cruisers) {
    if (c.dead) continue;
    targets.push(carTarget(c));
  }
  for (const c of traffic.cars.concat(traffic.parked)) {
    if (c.dead) continue;
    targets.push(carTarget(c));
  }
  if (state.targetCar && !state.targetCar.dead) targets.push(carTarget(state.targetCar));
  if (combat.fire(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, targets)) {
    audio.gunshot();
    police.addHeat(0.07);
    shotFiredRecently = 0.4;
  }
}
function carTarget(car) {
  return {
    get x() { return car.x; }, get z() { return car.z; }, y: 0.9, radius: 2.4,
    get hp() { return car.health; }, get dead() { return car.dead; },
    onHit: (dmg) => {
      car.damage(dmg);
      if (car.dead) {
        combat.spawnExplosion(car.x, 1.5, car.z);
        audio.explosion();
        if (car.police) police.addHeat(0.12);
      }
    },
  };
}

// ---- screens ----
function showBanner(kicker, title, text, kind) {
  state.mode = 'banner';
  state.bannerKind = kind;
  document.getElementById('bannerKicker').textContent = kicker;
  document.getElementById('bannerTitle').textContent = title;
  document.getElementById('bannerText').textContent = text;
  document.getElementById('bannerScreen').classList.remove('hidden');
}
function hideBanner() {
  document.getElementById('bannerScreen').classList.add('hidden');
  state.mode = 'play';
}
document.getElementById('btnBanner').onclick = () => {
  hideBanner();
  if (state.bannerKind === 'busted' || state.bannerKind === 'wasted') respawn();
};
function respawn() {
  player.dead = false;
  player.health = 100;
  player.armor = 50;
  player.x = 60; player.z = 300;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  police.reset();
  combat.clearEnemies();
  if (state.targetCar) { state.targetCar.remove(scene); state.targetCar = null; }
}
function onBusted() {
  const lost = Math.round(state.cash * 0.15);
  state.cash -= lost;
  audio.fail();
  showBanner('BUSTED', 'THE SCPD GOT YOU', `You lost $${lost.toLocaleString()} in fines and impound fees. Marisol bailed you out — this time.`, 'busted');
}
function onWasted() {
  const lost = Math.round(state.cash * 0.1);
  state.cash -= lost;
  audio.fail();
  showBanner('WASTED', 'FLATLINED ON THE STRIP', `Hospital bill: $${lost.toLocaleString()}. The city doesn't wait for anyone.`, 'wasted');
}
function togglePause() {
  if (state.mode === 'play') showPause();
  else if (state.mode === 'pause') hidePause();
}
function showPause() {
  state.mode = 'pause';
  hud.renderStats({
    stats: state.stats, packagesFound: missions.packagesFound,
    completion: completion(),
    jobList: JOBS.map(j => ({ title: j.title, done: missions.completedJobs.includes(j.id), grade: j.grade || 'G' })),
  });
  hud.renderSlots(document.getElementById('pauseSlots'), loadSaves(), (i) => {
    saveGame(i);
    hud.toast(`Saved to slot ${i + 1}.`);
    hud.renderSlots(document.getElementById('pauseSlots'), loadSaves(), () => {});
  });
  document.getElementById('pauseScreen').classList.remove('hidden');
}
function hidePause() {
  document.getElementById('pauseScreen').classList.add('hidden');
  state.mode = 'play';
}
document.getElementById('btnResume').onclick = hidePause;
document.getElementById('btnQuit').onclick = () => {
  document.getElementById('pauseScreen').classList.add('hidden');
  showTitle();
};
function showTitle() {
  state.mode = 'title';
  state.titleOrbit = true;
  document.getElementById('app').classList.add('hideHud');
  hud.renderSlots(document.getElementById('titleSlots'), loadSaves(), (i) => {
    const sv = loadSaves()[i];
    if (sv) loadGame(sv);
    startPlay();
  });
  document.getElementById('titleScreen').classList.remove('hidden');
}
function startPlay() {
  document.getElementById('titleScreen').classList.add('hidden');
  document.getElementById('pauseScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hideHud');
  state.mode = 'play';
  state.titleOrbit = false;
  audio.ensure();
  if (missions.jobIndex === -1 && !missions.active && missions.completedJobs.length === 0) {
    hud.say('MARISOL VEGA — FIXER', 'Welcome to Solara City, kid. Press M and I\'ll give you your first job.', 'M', 6000);
  }
}
document.getElementById('btnPlay').onclick = () => { resetProgress(); startPlay(); };
document.getElementById('btnContinue').onclick = () => {
  const sv = loadSaves()[0];
  if (sv) loadGame(sv);
  startPlay();
};
function resetProgress() {
  state.cash = 250; state.rp = 0;
  state.stats = { carsStolen: 0, copsEscaped: 0, kmDriven: 0, kills: 0, taxiFares: 0, cashEarned: 0 };
  missions.completedJobs = [];
  missions.jobIndex = -1;
  missions.active = false;
  garage.owned = ['peko'];
}

// ---- saves ----
function loadSaves() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[null,null,null]'); }
  catch { return [null, null, null]; }
}
function completion() {
  const jobs = missions.completedJobs.length / 8 * 70;
  const packs = missions.packagesFound / 12 * 15;
  const rp = Math.min(1, state.rp / 4200) * 15;
  return Math.round(jobs + packs + rp);
}
function saveGame(i) {
  const saves = loadSaves();
  saves[i] = {
    cash: state.cash, rp: state.rp, jobsDone: missions.completedJobs.length,
    jobs: missions.completedJobs, packagesFound: missions.packagesFound,
    owned: garage.owned, stats: state.stats, rank: rankFor(state.rp).cur.name,
    completion: completion(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
}
function loadGame(sv) {
  state.cash = sv.cash; state.rp = sv.rp;
  state.stats = sv.stats;
  missions.completedJobs = sv.jobs || [];
  missions.packagesFound = sv.packagesFound || 0;
  garage.owned = sv.owned || ['peko'];
  for (let i = 0; i < sv.packagesFound; i++) {
    const p = missions.packageMeshes[i];
    if (p) { p.found = true; p.mesh.visible = false; }
  }
}

// ---- helpers used by screenshot staging ----
function giveCar(typeId, x, z, heading) {
  const type = CAR_TYPES.find(t => t.id === typeId);
  const car = new Car(scene, type, x, z, heading);
  return car;
}
function enterCar(car) {
  player.enterCar(car);
  camYaw = car.heading;
}
function camSnapBehind() {
  if (player.inCar) {
    const c = player.inCar;
    camPos.set(c.x - Math.sin(c.heading) * 11, 4.4, c.z - Math.cos(c.heading) * 11);
    camLook.set(c.x + Math.sin(c.heading) * 8, 1.5, c.z + Math.cos(c.heading) * 8);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  } else {
    camPos.set(player.x - Math.sin(camYaw) * 7, 3.2, player.z - Math.cos(camYaw) * 7);
    camLook.set(player.x, 1.5, player.z);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }
}

const game = {
  state, player, police, missions, combat, traffic, garage, hud, audio,
  missionHooks, startPlay, showTitle, showPause, giveCar, enterCar, camSnapBehind,
  setCamYaw: (y) => { camYaw = y; },
};
window.__game = game;

// ---- main loop ----
function updateCamera(dt) {
  if (state.titleOrbit) {
    const t = performance.now() / 1000 * 0.045;
    const target = new THREE.Vector3(Math.sin(t) * 300, 105, Math.cos(t) * 300);
    const look = new THREE.Vector3(0, 10, 40);
    camPos.lerp(target, Math.min(1, dt * 1.2));
    camLook.lerp(look, Math.min(1, dt * 1.2));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    return;
  }
  if (player.inCar) {
    const c = player.inCar;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const target = new THREE.Vector3(c.x - fx * 10, 3.9, c.z - fz * 10);
    const look = new THREE.Vector3(c.x + fx * 9, 1.6, c.z + fz * 9);
    camPos.lerp(target, Math.min(1, dt * 7));
    camLook.lerp(look, Math.min(1, dt * 9));
  } else {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const target = new THREE.Vector3(player.x - fx * 7.5, 2.6 + camPitch * 3, player.z - fz * 7.5);
    const look = new THREE.Vector3(player.x + fx * 3, 1.6, player.z + fz * 3);
    camPos.lerp(target, Math.min(1, dt * 10));
    camLook.lerp(look, Math.min(1, dt * 10));
    // camera yaw follows the player when walking without mouse
    if (player.speed > 0.5 && document.pointerLockElement !== renderer.domElement) {
      camYaw += angleDiff(camYaw, player.heading) * Math.min(1, dt * 1.5);
    }
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function hudState() {
  const job = missions.job;
  const stage = missions.stage;
  const t = missions.currentTargetPoint();
  const px = player.inCar ? player.inCar.x : player.x;
  const pz = player.inCar ? player.inCar.z : player.z;
  const dist = t ? Math.hypot(px - t.x, pz - t.z) : null;
  const nextStage = job && missions.stageIndex + 1 < job.stages.length
    ? job.stages[missions.stageIndex + 1].text : '';
  return {
    job, jobIndex: missions.jobIndex, stageText: stage ? stage.text : '',
    stageIndex: missions.stageIndex, stageCount: missions.stageCount,
    stageProgress: missions.stage ? missions.stageProgress / missions.stageTotal() : 0,
    stageTimer: missions.stageTimer || 0, nextStageText: nextStage,
    targetDist: dist, targetPoint: t,
    taxi: missions.taxi,
    cash: state.cash, wanted: police.wanted, rp: state.rp,
    dispatch: police.dispatch,
    weapons: WEAPONS.map(w => ({ ...w, ammo: combat.ammo[w.id] })),
    weaponIndex: combat.weaponIndex,
    crew: state.crew,
    health: player.health, armor: player.armor,
    speedKmh: player.inCar ? Math.abs(player.inCar.speed) * 3.6 : player.speed * 3.6,
    carName: player.inCar ? player.inCar.type.name : 'ON FOOT',
    carHealth: player.inCar ? player.inCar.health : null,
    station: audio.stationInfo,
    district: districtAt(px, pz).name,
    onFoot: !player.inCar, inMenu: state.mode !== 'play',
    px, pz, heading: player.inCar ? player.inCar.heading : player.heading,
    packages: missions.packageMeshes,
    packagesFound: missions.packagesFound,
    jobsDone: missions.completedJobs.length,
    garageLot: city.garageLot,
    policeDots: (police.wanted > 0 || state.eyesOut > 0)
      ? police.cruisers.filter(c => !c.dead).map(c => ({ x: c.x, z: c.z })) : [],
  };
}

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const playing = state.mode === 'play';

  if (playing) {
    for (const c of state.crew) c.cd = Math.max(0, c.cd - dt);
    state.eyesOut = Math.max(0, state.eyesOut - dt);
    shotFiredRecently = Math.max(0, shotFiredRecently - dt);

    // player / car
    if (player.inCar) {
      const car = player.inCar;
      const prevX = car.x, prevZ = car.z;
      const driveInput = state.autoDrive ? { ...input, forward: true } : input;
      car.update(dt, driveInput, city.colliders);
      state.stats.kmDriven += Math.hypot(car.x - prevX, car.z - prevZ);
      if (car.dead) {
        combat.spawnExplosion(car.x, 1.5, car.z, true);
        audio.explosion();
        player.exitCar();
        player.damage(30);
      }
      // ram the mission target van
      if (state.targetCar && !state.targetCar.dead) {
        const d = Math.hypot(car.x - state.targetCar.x, car.z - state.targetCar.z);
        if (d < 4.5 && Math.abs(car.speed) > 4) {
          state.targetCar.damage(34 * dt);
          if (state.targetCar.dead) {
            combat.spawnExplosion(state.targetCar.x, 1.5, state.targetCar.z, true);
            audio.explosion();
          }
        }
      }
    } else {
      player.update(dt, input, camYaw, city.colliders);
    }
    if (input.mouseDown && combat.weapon.auto) tryShoot();

    traffic.update(dt);
    if (state.targetCar && !state.targetCar.dead) {
      state.targetCar.update(dt, null, city.colliders);
    }
    crowd.update(dt, player.x, player.z, shotFiredRecently > 0);
    combat.update(dt);
    combat.updateEnemies(dt, player.x, player.z, player, (e, d) => {
      // enemy fires at the player
      const ox = e.x, oz = e.z;
      combat.spawnTracer(ox, 1.4, oz, player.x, 1.3, player.z);
      audio.gunshot();
      if (d < 34 && rng.next() < 0.45) player.damage(8);
    });
    if (combat.kills !== state.stats.kills) {
      const fresh = combat.kills - state.stats.kills;
      state.stats.kills = combat.kills;
      if (missions.active && missions.stage && missions.stage.kind === 'kill') {
        missions.onKill();
        if (fresh > 0) police.addHeat(0.04);
      }
    }
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    const pSpeed = player.inCar ? Math.abs(player.inCar.speed) : player.speed;
    police.update(dt, px, pz, pSpeed, player.inCar, onBusted,
      player.inCar ? player.inCar.heading : player.heading);
    missions.update(dt, px, pz, player, missionHooks);
    missions.updateTaxi(px, pz, player, missionHooks);

    // context hint near cars / lot
    if (!player.inCar) {
      const near = traffic.nearestCar(player.x, player.z, 5.5);
      if (near) hud.hint('Press E — steal the ' + near.type.name);
      else if (Math.hypot(player.x - city.garageLot.x, player.z - city.garageLot.z) < 18) hud.hint('Press G — open the garage');
      else hud.hint('');
    } else hud.hint('');

    if (player.dead) onWasted();
    audio.setEngine(player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0, !!player.inCar);
    audio.setSiren(police.wanted > 0);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
  if (state.mode === 'play' || state.mode === 'pause') hud.update(hudState());
}

document.getElementById('loading').remove();
if (SHOT) {
  // staged screenshot: jump straight into the staged state
  applyShot(game, SHOT);
} else {
  showTitle();
}
loop();
