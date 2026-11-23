// Solara City v2.1 — game orchestration: the state object, the small helpers
// every system shares (messages, cash, wanted, particles, saving), and the
// step loop. The actual updates live in the split modules: vehicles, crowd,
// police, combat, missions, garage and radio. One step(dt) advances the
// world; the renderer only ever reads.
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
  const st = {
    screen: 'menu',
    time: 0,
    clock: 9.5,
    player: {
      x: 2500,
      y: 2900,
      angle: -Math.PI / 2,
      hp: 100,
      armour: 0,
      weapon: 'pistol',
      speed: 0,
      moving: false,
    },
    ammo: { pistol: 120, shotgun: 24, smg: 90 },
    cash: 250,
    rep: 0,
    wanted: 0,
    wantedTimer: 0,
    bustTimer: 0,
    roadblockSet: false,
    cars: [],
    peds: [],
    enemies: [],
    bullets: [],
    particles: [],
    floaters: [],
    casings: [],
    missionIndex: 0,
    mission: null,
    missionStage: 0,
    missionTimer: 0,
    racePoints: [],
    taxi: null,
    taxiDone: 0,
    packagesFound: 0,
    kills: 0,
    message: '',
    messageTimer: 0,
    objective: 'Visit Marisol Vega',
    heli: null,
    stats: { shots: 0, carsStolen: 0, fares: 0 },
    muted: false,
    photoMode: false,
    paused: false,
    radioIndex: 0,
    ownedCars: [],
    garageSelected: 0,
    shootCooldown: 0,
    playerCar: null,
  };

  const game = {
    state: st,
    city,
    rng,
    audio,
    // A toast message for a few seconds.
    say(text, secs) {
      st.message = text;
      st.messageTimer = secs || 4;
    },
    // Cash with a floating "+$n" / "-$n" over the player.
    addCash(n) {
      st.cash += n;
      st.floaters.push({
        x: st.player.x,
        y: st.player.y - 30,
        text: (n > 0 ? '+' : '') + '$' + n,
        life: 1.6,
        color: n > 0 ? '#7dff8a' : '#ff7a6a',
      });
    },
    addWanted(n) {
      addWanted(game, n);
    },
    // A spray of particles in all directions.
    burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const sp = rng.range(speed * 0.3, speed);
        st.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rng.range(0.3, 0.8),
          max: 0.8,
          color,
          size: rng.range(2, 5),
        });
      }
    },
    // Fire, smoke and a BOOM floater, plus the explosion sound.
    explode(x, y) {
      game.burst(x, y, '#ff9a3c', 26, 260);
      game.burst(x, y, '#ffd23f', 16, 180);
      game.burst(x, y, '#555', 14, 120);
      st.floaters.push({ x, y: y - 20, text: 'BOOM', life: 1.2, color: '#ff7a3c' });
      if (audio) audio.explosion();
    },
    spawnCar(type, x, y, angle, parked, police) {
      return spawnVehicle(game, type, x, y, angle, { parked: !!parked, police: !!police });
    },
    spawnPed(x, y) {
      return spawnPedestrian(game, x, y);
    },
    enterCar(car) {
      enterCar(game, car);
    },
    exitCar() {
      exitCar(game);
    },
    nearestCar(maxD) {
      return nearestCar(game, maxD);
    },
    playerCar() {
      return playerCar(game);
    },
    missionText() {
      const m = st.mission;
      return m ? m.title + ' — ' + st.objective : st.objective;
    },
  };

  // Moving traffic on the road lines (v1 only ever spawned parked cars).
  function seedTraffic(count) {
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

  // Rebuild the world: clear every list, put the player back at the start,
  // seed parked cars, moving traffic and pedestrians, and (re)start the
  // current mission. newGame also resets cash, reputation and the garage.
  function reset(newGame) {
    resetCarIds();
    st.cars = [];
    st.peds = [];
    st.enemies = [];
    st.bullets = [];
    st.particles = [];
    st.floaters = [];
    st.casings = [];
    st.time = 0;
    st.clock = 9.5;
    st.wanted = 0;
    st.wantedTimer = 0;
    st.bustTimer = 0;
    st.roadblockSet = false;
    st.player = {
      x: 2500,
      y: 2900,
      angle: -Math.PI / 2,
      hp: 100,
      armour: 0,
      weapon: 'pistol',
      speed: 0,
      moving: false,
    };
    st.ammo = { pistol: 120, shotgun: 24, smg: 90 };
    st.taxi = null;
    st.taxiDone = 0;
    st.packagesFound = 0;
    st.kills = 0;
    st.heli = null;
    st.playerCar = null;
    st.screen = 'play';
    if (newGame) {
      st.cash = 250;
      st.rep = 0;
      st.missionIndex = 0;
      st.ownedCars = [];
      st.radioIndex = 0;
    }
    const parkedTypes = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck', 'beach', 'muscle'];
    for (const spot of city.carSpawns.slice(0, 70)) {
      spawnVehicle(game, rng.pick(parkedTypes), spot.x, spot.y, spot.angle, { parked: true });
    }
    seedTraffic(48);
    for (let i = 0; i < DENSITY.pedestrians; i++) {
      const spot = city.pedSpawns[rng.int(0, city.pedSpawns.length - 1)];
      spawnPedestrian(game, spot.x, spot.y);
    }
    spawnVehicle(game, 'sedan', 2520, 2980, 0, { parked: true });
    startMission(game, st.missionIndex);
    game.say('Welcome to Solara City. Follow the yellow marker.', 5);
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: st.cash,
        rep: st.rep,
        missionIndex: st.missionIndex,
        packagesFound: st.packagesFound,
        muted: st.muted,
        ownedCars: st.ownedCars,
        radioIndex: st.radioIndex,
      }));
    } catch { /* storage off */ }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      st.cash = d.cash || 250;
      st.rep = d.rep || 0;
      st.missionIndex = d.missionIndex || 0;
      st.packagesFound = d.packagesFound || 0;
      st.muted = !!d.muted;
      st.ownedCars = Array.isArray(d.ownedCars) ? d.ownedCars : [];
      st.radioIndex = Number.isInteger(d.radioIndex) ? d.radioIndex : 0;
      return true;
    } catch { return false; }
  }
  game.save = save;
  game.load = load;
  game.reset = reset;
  game.startMission = (i) => startMission(game, i);

  // On foot: WASD movement with building collision, facing the mouse when
  // standing still, and pickups collected by walking over them.
  function updateOnFoot(dt, input, aimAngle) {
    const p = st.player;
    const axis = input.axis();
    const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = p.x + axis.x * speed * dt;
    const ny = p.y + axis.y * speed * dt;
    if (!city.collidesBuilding(nx, ny, PLAYER.radius)) {
      p.x = nx;
      p.y = ny;
    }
    p.x = clamp(p.x, 40, WORLD.size - 40);
    p.y = clamp(p.y, 40, WORLD.size - 40);
    p.moving = axis.x !== 0 || axis.y !== 0;
    p.speed = p.moving ? speed : 0;
    p.angle = p.moving ? Math.atan2(axis.y, axis.x) : aimAngle;
    updatePickups(game);
  }

  // One fixed step: clock, message and particle timers, shooting, then the
  // player (driving or on foot), traffic, crowd, police, enemies, bullets,
  // missions, and finally the engine, siren and radio sounds.
  function step(dt, input, aimAngle, shootHeld, shootPressed) {
    if (st.screen !== 'play') return;
    st.time += dt;
    st.clock = (st.clock + dt / 60) % 24;
    if (st.messageTimer > 0) st.messageTimer -= dt;
    for (const f of st.floaters) f.life -= dt;
    st.floaters = st.floaters.filter((f) => f.life > 0);
    for (const c of st.casings) c.life -= dt;
    st.casings = st.casings.filter((c) => c.life > 0);
    for (const pt of st.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    st.particles = st.particles.filter((pt) => pt.life > 0);

    const p = st.player;
    const w = WEAPONS[p.weapon];
    st.shootCooldown = Math.max(0, st.shootCooldown - dt);
    if ((shootPressed || (shootHeld && w.auto)) && st.shootCooldown <= 0 && !playerCar(game)) {
      st.shootCooldown = w.rate;
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
      audio.siren(st.wanted > 0, dt);
      audio.music(dt);
    }
  }
  game.step = step;

  return game;
}
