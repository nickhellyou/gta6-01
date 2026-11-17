// input.js — keyboard + mouse state for third-person play. Held keys are read
// every fixed step; one-shot presses (interact, punch, reload, pause, mute)
// are queued and taken once, so a press between frames is never lost.
export const ACT_INTERACT = 1;
export const ACT_PUNCH = 2;
export const ACT_RELOAD = 4;
export const ACT_PAUSE = 8;
export const ACT_MUTE = 16;
export const ACT_SHOOT = 32;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') actions |= ACT_INTERACT;
    if (e.code === 'KeyF') actions |= ACT_PUNCH;
    if (e.code === 'KeyR') actions |= ACT_RELOAD;
    if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACT_PAUSE;
    if (e.code === 'KeyM') actions |= ACT_MUTE;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    mouseDown = true; dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (e.button === 0) actions |= ACT_SHOOT;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += e.movementX; mouseDY += e.movementY;
    } else if (dragging) {
      mouseDX += e.clientX - lastX; mouseDY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  canvas.addEventListener('click', () => {
    // Pointer lock gives real mouse-look; drag works as a fallback (headless too).
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch { /* headless: drag still works */ }
    }
  });

  return {
    held(code) { return keys.has(code); },
    // -1..1 forward/back and strafe from WASD + arrows.
    move() {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { f, s };
    },
    sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    jump() { return keys.has('Space'); },
    handbrake() { return keys.has('Space'); },
    mouseDownNow() { return mouseDown; },
    takeMouse() { const d = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return d; },
    takeActions() { const a = actions; actions = 0; return a; },
    // Test / autopilot hooks: pretend a key is held, or queue an action.
    press(code) { keys.add(code); },
    release(code) { keys.delete(code); },
    queue(action) { actions |= action; },
  };
}
