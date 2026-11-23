// Deterministic screenshot staging behind ?shot=chase|foot|mission|night.
// Each scene sets up the real game state (player, cars, wanted level, mission,
// time of day) and then steps the real simulation forward a fixed number of
// frames, so the frame is what live play looks like and the same seed always
// gives the same frame. v2 scenes are busier than v1: more cruisers, more
// traffic, more pedestrians in frame.
import { STEP } from './config.js';
import { SPOTS } from './city.js';

const IDLE_INPUT = { axis: () => ({ x: 0, y: 0 }), running: () => false };
const DRIVE_INPUT = { axis: () => ({ x: 0, y: -1 }), running: () => false };

function stepFrames(game, input, n, aim) {
  for (let i = 0; i < n; i++) game.step(STEP, input, aim || -Math.PI / 2, false, false);
}

function putPlayerInCar(game, type, x, y, angle) {
  const car = game.spawnCar(type, x, y, angle, false, false);
  game.state.player.x = x; game.state.player.y = y;
  game.enterCar(car);
  return car;
}

function addCruisers(game, n, spread) {
  const p = game.state.player;
  for (let i = 0; i < n; i++) {
    game.spawnCar('police', p.x + (i % 2 === 0 ? -20 : 20), p.y + 240 + i * spread, -Math.PI / 2, false, true);
  }
}

function addStreetTraffic(game, x, y) {
  // A few moving cars on the same roads so the street reads as alive.
  const types = ['sedan', 'taxi', 'van', 'beach'];
  for (let i = 0; i < 4; i++) {
    const car = game.spawnCar(types[i % types.length], x + (i - 1) * 160, y - 320 - i * 120, Math.PI / 2, false, false);
    car.speed = 180 + i * 30;
  }
}

function addCrowd(game, x, y, n) {
  for (let i = 0; i < n; i++) {
    game.spawnPed(x + game.rng.range(-320, 320), y + game.rng.range(-260, 260));
  }
}

// Set the game to the named scene; main.js paints it twice.
export function stageShot(name, city, game) {
  const s = game.state;
  if (name === 'foot') {
    s.missionIndex = 0; s.cash = 850; s.rep = 12;
    game.reset(false);
    s.player.x = 2552; s.player.y = 3050; s.player.angle = -Math.PI / 2;
    s.clock = 12.5;
    game.spawnCar('sedan', 2590, 3100, Math.PI / 2, true, false);
    game.spawnCar('taxi', 2460, 2960, 0, true, false);
    game.spawnCar('sports', 2700, 3180, -Math.PI / 2, true, false);
    addCrowd(game, 2552, 3050, 9);
    addStreetTraffic(game, 2552, 3050);
    stepFrames(game, IDLE_INPUT, 60);
    return;
  }
  if (name === 'mission') {
    s.missionIndex = 2; s.cash = 1900; s.rep = 28;
    game.reset(false);
    s.player.x = 2528; s.player.y = 5480;
    s.player.weapon = 'shotgun'; s.clock = 14.0;
    s.missionTimer = 0;
    game.state.enemies.forEach((e, i) => { e.x = 2440 + (i % 3) * 90; e.y = 5260 + Math.floor(i / 3) * 80; });
    addCrowd(game, 2528, 5480, 3);
    stepFrames(game, IDLE_INPUT, 90, 0.6);
    game.state.bullets.push({ x: s.player.x + 120, y: s.player.y + 40, angle: 0.5, speed: 950, life: 0.4, damage: 16, fromPlayer: true });
    game.state.bullets.push({ x: s.player.x + 60, y: s.player.y - 90, angle: 1.2, speed: 950, life: 0.4, damage: 16, fromPlayer: true });
    game.state.bullets.push({ x: s.player.x - 40, y: s.player.y + 130, angle: -0.9, speed: 700, life: 0.5, damage: 9, fromPlayer: false });
    return;
  }
  if (name === 'night') {
    s.missionIndex = 3; s.cash = 2400; s.rep = 35;
    game.reset(false);
    s.clock = 22.0;
    putPlayerInCar(game, 'taxi', 1040, 3300, -Math.PI / 2);
    if (s.taxi) { s.taxi.pickup = { x: 1040, y: 2960 }; s.taxi.picked = false; s.taxi.dest = SPOTS.uptown; }
    addCrowd(game, 1040, 3300, 5);
    addStreetTraffic(game, 1040, 3300);
    game.spawnCar('sports', 1180, 3560, -Math.PI / 2, true, false);
    stepFrames(game, DRIVE_INPUT, 40);
    return;
  }
  // Default: chase — three-star police chase at golden hour downtown.
  s.missionIndex = 0; s.cash = 1250; s.rep = 18;
  game.reset(false);
  s.clock = 18.6;
  putPlayerInCar(game, 'sports', 3024, 3000, -Math.PI / 2);
  game.addWanted(3);
  addCruisers(game, 3, 120);
  addCrowd(game, 3024, 3000, 5);
  addStreetTraffic(game, 3024, 3000);
  stepFrames(game, DRIVE_INPUT, 50);
}
