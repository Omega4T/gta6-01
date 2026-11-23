// Keyboard and mouse input. Keys are tracked by `code`, so any keyboard
// layout works; the mouse aim stays in screen pixels and the renderer turns
// it into world coordinates each frame. Actions are edge-triggered: calling
// takeActions() hands back the bits pressed since the last call, then clears
// them, so a key press fires exactly once.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_HANDBRAKE = 8;
export const ACTION_MUTE = 16;
export const ACTION_PHOTO = 32;
export const ACTION_WEAPON_NEXT = 64;
export const ACTION_RADIO = 128;
export const ACTION_GARAGE = 256;

// One action per key; two keys may share an action (Space and Enter confirm).
const KEY_ACTIONS = {
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  KeyF: ACTION_ENTER,
  ShiftLeft: ACTION_HANDBRAKE,
  ShiftRight: ACTION_HANDBRAKE,
  KeyM: ACTION_MUTE,
  KeyH: ACTION_PHOTO,
  KeyQ: ACTION_WEAPON_NEXT,
  KeyR: ACTION_RADIO,
  KeyG: ACTION_GARAGE,
};

// Keys whose default browser behaviour (page scroll) must be stopped.
const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let anyKey = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    held.add(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a !== undefined) actions |= a;
    anyKey = true;
    if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
  }

  function onKeyUp(e) {
    held.delete(e.code);
  }

  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  }

  function onDown(e) {
    onMove(e);
    mouseDown = true;
    mouseClicked = true;
  }

  function onUp() {
    mouseDown = false;
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    // Movement vector, normalised so diagonals are not faster than straight.
    axis() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x && y) {
        x *= 0.7071;
        y *= 0.7071;
      }
      return { x, y };
    },
    // Either Shift key doubles as run (on foot) and handbrake (in a car).
    running() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    // Edge-triggered actions since the last call; clears the queue.
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
    // Was the mouse clicked since the last call? Clears the flag.
    consumeClick() {
      const c = mouseClicked;
      mouseClicked = false;
      return c;
    },
    get mouseDown() {
      return mouseDown;
    },
    get mouseX() {
      return mouseX;
    },
    get mouseY() {
      return mouseY;
    },
    // Was any key pressed since the last call? Clears the flag.
    get anyKey() {
      const v = anyKey;
      anyKey = false;
      return v;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
