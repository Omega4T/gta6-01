// Solara City v2.1 boot and main loop. Input is read every frame, the game
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. Screens: menu, play, paused,
// garage, busted, wasted, won.
// ?seed=N fixes the city seed. ?shot=chase|foot|mission|night stages that
// scene instead of running the loop, paints it a few times and sets
// __shotReady so a screenshot tool knows the frame is done.
import { STEP, SEED_DEFAULT } from './config.js';
import { createCity } from './city.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_MUTE, ACTION_PHOTO, ACTION_WEAPON_NEXT, ACTION_RADIO, ACTION_GARAGE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { cycleStation } from './radio.js';
import { garageAction, garageCycle, garageConfirm } from './garage.js';

const MAX_FRAME = 0.25;
const WEAPON_ORDER = ['fists', 'pistol', 'shotgun', 'smg'];

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SEED_DEFAULT;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = createCity(seed);
const audio = createAudio();
const game = createGame(city, seed, audio);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
window.__solara = { game, city, renderer };

function announce(message) {
  status.textContent = message;
}

// Screenshot mode: set up the staged scene, paint it three times, flag ready.
function runShot(name) {
  game.load();
  game.reset(false);
  game.state.screen = 'play';
  stageShot(name, city, game);
  renderer.snapTo(game.state.player.x, game.state.player.y);
  let painted = 0;
  function paint() {
    renderer.draw(city, game, audio, performance.now() / 1000);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const saved = game.load();
  if (audio && game.state.radioIndex) audio.setStation(game.state.radioIndex);
  game.state.screen = 'menu';
  let accumulator = 0;
  let last = performance.now();
  let shootPressed = false;
  let prevMouse = false;

  function startGame(fresh) {
    audio.unlock();
    game.reset(fresh);
    accumulator = 0;
    announce('Playing Solara City. Follow the yellow marker.');
  }

  // One frame's worth of key actions: mute, photo mode, garage menu keys,
  // weapon cycle, radio, entering a car, confirming on menus, pause.
  function handleActions() {
    const actions = input.takeActions();
    const st = game.state;
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.muted);
      st.muted = audio.muted;
      game.save();
      announce(audio.muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_PHOTO) {
      st.photoMode = !st.photoMode;
    }
    if (st.screen === 'garage') {
      if (actions & ACTION_WEAPON_NEXT) garageCycle(game);
      if (actions & ACTION_CONFIRM) garageConfirm(game);
      if (actions & ACTION_GARAGE) garageAction(game);
      return;
    }
    if (actions & ACTION_WEAPON_NEXT && st.screen === 'play') {
      const i = WEAPON_ORDER.indexOf(st.player.weapon);
      st.player.weapon = WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length];
      announce('Weapon: ' + st.player.weapon);
    }
    if (actions & ACTION_RADIO && st.screen === 'play') cycleStation(game, audio);
    if (actions & ACTION_GARAGE && st.screen === 'play') garageAction(game);
    if (actions & ACTION_ENTER && st.screen === 'play') {
      if (st.playerCar) game.exitCar();
      else {
        const car = game.nearestCar(70);
        if (car) game.enterCar(car);
        else announce('No car nearby. Walk to a car and press E.');
      }
    }
    if (actions & ACTION_CONFIRM) {
      if (st.screen === 'menu') startGame(false);
      else if (st.screen === 'wasted' || st.screen === 'busted') {
        game.load();
        startGame(false);
      } else if (st.screen === 'won') {
        st.screen = 'play';
      } else if (st.screen === 'paused') {
        st.screen = 'play';
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (st.screen === 'play') {
        st.screen = 'paused';
        announce('Paused.');
      } else if (st.screen === 'paused') {
        st.screen = 'play';
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const st = game.state;
    handleActions();
    if (st.screen === 'play') {
      accumulator += dt;
      let n = 0;
      while (accumulator >= STEP && n < 8) {
        const world = renderer.screenToWorld(input.mouseX, input.mouseY);
        const aim = Math.atan2(world.y - st.player.y, world.x - st.player.x);
        const mouse = input.mouseDown;
        shootPressed = mouse && !prevMouse;
        game.step(STEP, input, aim, mouse, shootPressed);
        prevMouse = mouse;
        accumulator -= STEP;
        n++;
      }
      if (n === 8) accumulator = 0;
    } else {
      accumulator = 0;
      prevMouse = input.mouseDown;
    }
    // Clicking on a menu screen starts or retries the game.
    if (input.consumeClick() && (st.screen === 'menu' || st.screen === 'wasted' || st.screen === 'busted' || st.screen === 'won')) {
      if (st.screen === 'menu') startGame(false);
      else if (st.screen === 'won') st.screen = 'play';
      else {
        game.load();
        startGame(false);
      }
    }
    renderer.draw(city, game, audio, now / 1000);
  }

  // Switching tabs mid-game pauses instead of letting the world run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.screen === 'play') game.state.screen = 'paused';
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Solara City. Press Space or click to start.' + (saved ? ' Saved game found.' : ''));
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
