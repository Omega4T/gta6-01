// Deterministic screenshot staging behind ?shot=chase|foot|mission|night.
// Each scene sets up the real game state (player, cars, wanted level,
// mission, time of day) and then steps the real simulation forward a fixed
// number of frames, so the frame is what live play looks like and the same
// seed always gives the same frame. The v2 scenes are busier than v1: more
// cruisers, more traffic, more pedestrians in frame.
import { STEP } from './config.js';
import { SPOTS } from './city.js';

// No input at all: the player stands still while the world runs.
const IDLE_INPUT = { axis: () => ({ x: 0, y: 0 }), running: () => false };
// Drive straight ahead: W held, no steering, no handbrake.
const DRIVE_INPUT = { axis: () => ({ x: 0, y: -1 }), running: () => false };

function stepFrames(game, input, n, aim) {
  for (let i = 0; i < n; i++) {
    game.step(STEP, input, aim || -Math.PI / 2, false, false);
  }
}

// Put the player in a fresh car of the given type at a spot.
function putPlayerInCar(game, type, x, y, angle) {
  const car = game.spawnCar(type, x, y, angle, false, false);
  game.state.player.x = x;
  game.state.player.y = y;
  game.enterCar(car);
  return car;
}

// A line of police cruisers behind the player, closing in.
function addCruisers(game, n, spread) {
  const p = game.state.player;
  for (let i = 0; i < n; i++) {
    const behind = p.y + 240 + i * spread;
    const side = i % 2 === 0 ? -20 : 20;
    game.spawnCar('police', p.x + side, behind, -Math.PI / 2, false, true);
  }
}

// A few moving cars on the same roads so the street reads as alive.
function addStreetTraffic(game, x, y) {
  const types = ['sedan', 'taxi', 'van', 'beach'];
  for (let i = 0; i < 4; i++) {
    const car = game.spawnCar(types[i % types.length], x + (i - 1) * 160, y - 320 - i * 120, Math.PI / 2, false, false);
    car.speed = 180 + i * 30;
  }
}

// A crowd of pedestrians around a point.
function addCrowd(game, x, y, n) {
  for (let i = 0; i < n; i++) {
    const px = x + game.rng.range(-320, 320);
    const py = y + game.rng.range(-260, 260);
    game.spawnPed(px, py);
  }
}

// Set the game to the named scene; main.js paints it a few times.
export function stageShot(name, city, game) {
  const st = game.state;
  if (name === 'foot') {
    // On foot in Old Town at noon: parked cars, a crowd, moving traffic.
    st.missionIndex = 0;
    st.cash = 850;
    st.rep = 12;
    game.reset(false);
    st.player.x = 2552;
    st.player.y = 3050;
    st.player.angle = -Math.PI / 2;
    st.clock = 12.5;
    game.spawnCar('sedan', 2590, 3100, Math.PI / 2, true, false);
    game.spawnCar('taxi', 2460, 2960, 0, true, false);
    game.spawnCar('sports', 2700, 3180, -Math.PI / 2, true, false);
    addCrowd(game, 2552, 3050, 9);
    addStreetTraffic(game, 2552, 3050);
    stepFrames(game, IDLE_INPUT, 60);
    return;
  }
  if (name === 'mission') {
    // Dockside Debt mid-shootout: shotgun out, three guards, bullets flying.
    st.missionIndex = 2;
    st.cash = 1900;
    st.rep = 28;
    game.reset(false);
    st.player.x = 2528;
    st.player.y = 5480;
    st.player.weapon = 'shotgun';
    st.clock = 14.0;
    st.missionTimer = 0;
    game.state.enemies.forEach((e, i) => {
      e.x = 2440 + (i % 3) * 90;
      e.y = 5260 + Math.floor(i / 3) * 80;
    });
    addCrowd(game, 2528, 5480, 3);
    stepFrames(game, IDLE_INPUT, 90, 0.6);
    game.state.bullets.push({
      x: st.player.x + 120,
      y: st.player.y + 40,
      angle: 0.5,
      speed: 950,
      life: 0.4,
      damage: 16,
      fromPlayer: true,
    });
    game.state.bullets.push({
      x: st.player.x + 60,
      y: st.player.y - 90,
      angle: 1.2,
      speed: 950,
      life: 0.4,
      damage: 16,
      fromPlayer: true,
    });
    game.state.bullets.push({
      x: st.player.x - 40,
      y: st.player.y + 130,
      angle: -0.9,
      speed: 700,
      life: 0.5,
      damage: 9,
      fromPlayer: false,
    });
    return;
  }
  if (name === 'night') {
    // Marina at 10 pm in a taxi, fare waiting, neon and headlights on.
    st.missionIndex = 3;
    st.cash = 2400;
    st.rep = 35;
    game.reset(false);
    st.clock = 22.0;
    putPlayerInCar(game, 'taxi', 1040, 3300, -Math.PI / 2);
    if (st.taxi) {
      st.taxi.pickup = { x: 1040, y: 2960 };
      st.taxi.picked = false;
      st.taxi.dest = SPOTS.uptown;
    }
    addCrowd(game, 1040, 3300, 5);
    addStreetTraffic(game, 1040, 3300);
    game.spawnCar('sports', 1180, 3560, -Math.PI / 2, true, false);
    stepFrames(game, DRIVE_INPUT, 40);
    return;
  }
  // Default: chase — three-star police chase at golden hour downtown.
  st.missionIndex = 0;
  st.cash = 1250;
  st.rep = 18;
  game.reset(false);
  st.clock = 18.6;
  putPlayerInCar(game, 'sports', 3024, 3000, -Math.PI / 2);
  game.addWanted(3);
  addCruisers(game, 3, 120);
  addCrowd(game, 3024, 3000, 5);
  addStreetTraffic(game, 3024, 3000);
  stepFrames(game, DRIVE_INPUT, 50);
}
