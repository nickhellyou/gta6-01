// Keyboard + mouse input with pointer lock for the orbit camera.
// Tracks held keys, click edges and mouse deltas; the game loop consumes
// the deltas each frame so camera movement stays frame-rate independent.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;
    this.onFirstClick = null;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mouseClicked = true;
      if (this.onFirstClick) {
        const cb = this.onFirstClick;
        this.onFirstClick = null;
        cb();
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  // request pointer lock on the game canvas (called from a user gesture)
  lockPointer() {
    if (!this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  // is a key currently held
  down(code) {
    return this.keys.has(code);
  }

  // was a key pressed since the last frame (edge)
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // consume per-frame edges and mouse deltas; call once per frame
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
  }
}
