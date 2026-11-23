// Deterministic screenshot staging behind ?shot=chase|foot|mission|night.
// Each scene sets up the real game state (player, car, wanted level, mission, time
// of day) and then steps the real simulation forward a fixed number of frames, so
// the frame is what live play looks like and the same seed always gives the same frame.
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

function addCruisers(game, n) {
  // Cruisers right behind the player on the same road, already in pursuit.
  const p = game.state.player;
  for (let i = 0; i < n; i++) {
    game.spawnCar('police', p.x + (i === 0 ? -14 : 16), p.y + 240 + i * 130, -Math.PI / 2, false, true);
  }
}

// Set game to the named scene and return nothing; main.js paints it twice.
export function stageShot(name, city, game) {
  const s = game.state;
  if (name === 'foot') {
    s.missionIndex = 0; s.cash = 850; s.rep = 12;
    game.reset(false);
    s.player.x = 2552; s.player.y = 3050; s.player.angle = -Math.PI / 2;
    s.clock = 12.5;
    game.spawnCar('sedan', 2590, 3100, Math.PI / 2, true, false);
    game.spawnPed(2500, 2980); game.spawnPed(2620, 3120); game.spawnPed(2480, 3140);
    stepFrames(game, IDLE_INPUT, 30);
    return;
  }
  if (name === 'mission') {
    s.missionIndex = 2; s.cash = 1900; s.rep = 28;
    game.reset(false);
    s.player.x = 2528; s.player.y = 5480;
    s.player.weapon = 'shotgun'; s.clock = 14.0;
    s.missionTimer = 0;
    // Line the crew up on the road in front of the player so the shootout reads.
    game.state.enemies.forEach((e, i) => { e.x = 2480 + (i % 2) * 100; e.y = 5280 + Math.floor(i / 2) * 70; });
    stepFrames(game, IDLE_INPUT, 90, 0.6);
    // A few live bullets in the air so the shootout reads in one frame.
    game.state.bullets.push({ x: s.player.x + 120, y: s.player.y + 40, angle: 0.5, speed: 950, life: 0.4, damage: 16, fromPlayer: true });
    return;
  }
  if (name === 'night') {
    s.missionIndex = 3; s.cash = 2400; s.rep = 35;
    game.reset(false);
    s.clock = 22.0;
    putPlayerInCar(game, 'taxi', 1040, 3300, -Math.PI / 2);
    if (s.taxi) { s.taxi.pickup = { x: 1040, y: 2960 }; s.taxi.picked = false; s.taxi.dest = SPOTS.uptown; }
    game.spawnPed(990, 3100); game.spawnPed(1090, 3400);
    stepFrames(game, DRIVE_INPUT, 40);
    return;
  }
  // Default: chase — three-star police chase at dusk downtown.
  s.missionIndex = 0; s.cash = 1250; s.rep = 18;
  game.reset(false);
  s.clock = 18.6;
  putPlayerInCar(game, 'sports', 3024, 3000, -Math.PI / 2);
  game.addWanted(3);
  addCruisers(game, 2);
  game.spawnPed(2780, 2700); game.spawnPed(3160, 2900);
  stepFrames(game, DRIVE_INPUT, 50);
}
