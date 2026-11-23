// Keyboard and mouse state for Solara City. One object holds the live keys and
// the mouse aim; the game reads it every frame and edge-triggered actions use
// the pressed-this-frame set, which the loop clears after each update.

export function bindInput(canvas) {
  const input = {
    keys: {},
    justPressed: {},
    mouse: { x: 0, y: 0, down: false, justClicked: false },
    anyKey: false,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    input.justPressed[e.code] = true;
    input.anyKey = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    input.keys = {};
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - rect.left;
    input.mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouse.down = true;
      input.mouse.justClicked = true;
      input.anyKey = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Drop the edge-triggered flags after the frame consumed them.
  input.endFrame = function endFrame() {
    input.justPressed = {};
    input.mouse.justClicked = false;
    input.anyKey = false;
  };

  input.pressed = function pressed(code) {
    return !!input.justPressed[code];
  };
  input.down = function down(code) {
    return !!input.keys[code];
  };

  return input;
}
