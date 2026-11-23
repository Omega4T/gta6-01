// Keyboard and mouse input. Keys are tracked by code so any keyboard layout
// works; the mouse aim stays in screen pixels and the renderer converts it to
// world coordinates every frame. Actions are edge-triggered: takeActions()
// returns the bits pressed since the last call and then clears them.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_HANDBRAKE = 8;
export const ACTION_MUTE = 16;
export const ACTION_PHOTO = 32;
export const ACTION_WEAPON_NEXT = 64;
export const ACTION_RADIO = 128;
export const ACTION_GARAGE = 256;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM, Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE, Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER, KeyF: ACTION_ENTER,
  ShiftLeft: ACTION_HANDBRAKE, ShiftRight: ACTION_HANDBRAKE,
  KeyM: ACTION_MUTE, KeyH: ACTION_PHOTO, KeyQ: ACTION_WEAPON_NEXT,
  KeyR: ACTION_RADIO, KeyG: ACTION_GARAGE,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0, mouseY = 0, mouseDown = false, mouseClicked = false;
  let anyKey = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a !== undefined) actions |= a;
    anyKey = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  }
  function onDown(e) { onMove(e); mouseDown = true; mouseClicked = true; }
  function onUp() { mouseDown = false; }
  function onBlur() { keys.clear(); mouseDown = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    axis() {
      let x = 0, y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x && y) { x *= 0.7071; y *= 0.7071; }
      return { x, y };
    },
    running() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    takeActions() { const a = actions; actions = 0; return a; },
    consumeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    get mouseDown() { return mouseDown; },
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    get anyKey() { const v = anyKey; anyKey = false; return v; },
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
