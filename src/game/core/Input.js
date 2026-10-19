// Unified keyboard/mouse + gamepad action input.
// Actions are polled each frame: input.down(a), input.pressed(a) (edge), input.released(a).

export const BINDINGS = {
  // action: { keys: [...KeyboardEvent.code], mouse: [buttons], pad: [standard gamepad buttons] }
  light: { keys: [], mouse: [0], pad: [2], label: 'Light Strike' },
  heavy: { keys: [], mouse: [2], pad: [3], label: 'Heavy Strike' },
  guard: { keys: ['KeyC', 'ControlLeft'], mouse: [], pad: [4], label: 'Guard / Counter' },
  rush: { keys: ['KeyF'], mouse: [], pad: [5], label: 'Stand Rush' },
  knockback: { keys: ['KeyG'], mouse: [], pad: [6], label: 'Knockback Strike' },
  timestop: { keys: ['KeyR'], mouse: [], pad: [7], label: 'Time Stop' },
  stand: { keys: ['KeyQ'], mouse: [], pad: [12], label: 'Summon / Dismiss Stand' },
  dodge: { keys: ['Space'], mouse: [], pad: [0], label: 'Dodge' },
  sprint: { keys: ['ShiftLeft', 'ShiftRight'], mouse: [], pad: [10], label: 'Sprint / Gallop' },
  interact: { keys: ['KeyE'], mouse: [], pad: [1], label: 'Interact / Mount' },
  lock: { keys: ['Tab'], mouse: [1], pad: [11], label: 'Target Lock' },
  horse: { keys: ['KeyH'], mouse: [], pad: [13], label: 'Call Slow Dancer' },
  journal: { keys: ['KeyJ'], mouse: [], pad: [14], label: 'Journal' },
  map: { keys: ['KeyM'], mouse: [], pad: [8], label: 'Map' },
  upgrades: { keys: ['KeyU'], mouse: [], pad: [15], label: 'Stand Upgrades' },
  pause: { keys: ['Escape', 'KeyP'], mouse: [], pad: [9], label: 'Pause' },
  heavenAbility: { keys: ['KeyT'], mouse: [], pad: [], label: 'Overwrite (Heaven)' },
  // menu navigation
  up: { keys: ['ArrowUp', 'KeyW'], mouse: [], pad: [12], label: 'Up' },
  down: { keys: ['ArrowDown', 'KeyS'], mouse: [], pad: [13], label: 'Down' },
  left: { keys: ['ArrowLeft', 'KeyA'], mouse: [], pad: [14], label: 'Left' },
  right: { keys: ['ArrowRight', 'KeyD'], mouse: [], pad: [15], label: 'Right' },
  confirm: { keys: ['Enter', 'Space'], mouse: [], pad: [0], label: 'Confirm' },
  back: { keys: ['Escape', 'Backspace'], mouse: [], pad: [1], label: 'Back' },
  skip: { keys: ['Enter', 'Space', 'Escape'], mouse: [], pad: [0, 9], label: 'Skip' },
};

export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.mouse = new Set();
    this.padButtons = [];
    this.prev = new Map();
    this.cur = new Map();
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.sensitivity = 1;
    this.invertY = false;
    this.padConnected = false;
    this.lastDevice = 'kbm';
    this.enabled = true;
    this.pointerLocked = false;
    this.wantPointerLock = false;
    this._onKeyDown = (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this.lockRefused = false;
    this.dragging = false;
    this._onMouseDown = (e) => {
      this.lastDevice = 'kbm';
      if (this.wantPointerLock && !this.pointerLocked && e.target === this.el) {
        this.requestLock();
        // the click that captures the mouse is not also a punch (unless capture is unavailable here)
        if (!this.lockRefused) return;
      }
      this.mouse.add(e.button);
      if (e.target === this.el) this.dragging = true;
    };
    this._onMouseUp = (e) => { this.mouse.delete(e.button); if (!this.mouse.size) this.dragging = false; };
    this._onMouseMove = (e) => {
      // look with a captured mouse, or by dragging where the page cannot capture it (embedded previews)
      if (!this.pointerLocked && !(this.dragging && this.wantPointerLock)) return;
      const dx = e.movementX || 0; const dy = e.movementY || 0;
      // browsers occasionally report a huge jump (on capture, or a stray event): drop it
      if (Math.abs(dx) > 220 || Math.abs(dy) > 220) return;
      this.mouseDX += dx;
      this.mouseDY += dy;
    };
    this._onWheel = (e) => { this.wheel += Math.sign(e.deltaY); };
    this._onContext = (e) => e.preventDefault();
    this._onLock = () => { this.pointerLocked = document.pointerLockElement === this.el; if (this.pointerLocked) this.lockRefused = false; };
    this._onLockError = () => { this.lockRefused = true; };
    document.addEventListener('pointerlockerror', this._onLockError);
    this._onBlur = () => { this.keys.clear(); this.mouse.clear(); };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    element.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    element.addEventListener('wheel', this._onWheel, { passive: true });
    element.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLock);
    window.addEventListener('blur', this._onBlur);
    this.axes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
  }

  setPointerLock(on) {
    this.wantPointerLock = on;
    if (!on && document.pointerLockElement) document.exitPointerLock?.();
  }

  requestLock() {
    if (this.pointerLocked || !this.el.requestPointerLock) return;
    const fail = () => { this.lockRefused = true; };
    try {
      // raw, un-accelerated mouse input where supported; plain capture otherwise
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          try {
            const q = this.el.requestPointerLock();
            if (q && q.catch) q.catch(fail);
          } catch { fail(); }
        });
      }
    } catch { fail(); }
  }

  _pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.padConnected = !!pad;
    this.padButtons.length = 0;
    this.padAxes = [0, 0, 0, 0];
    if (!pad) return;
    for (let i = 0; i < pad.buttons.length; i += 1) {
      const b = pad.buttons[i];
      this.padButtons[i] = b.pressed || b.value > 0.5;
      if (this.padButtons[i]) this.lastDevice = 'pad';
    }
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    this.padAxes = [dz(pad.axes[0] || 0), dz(pad.axes[1] || 0), dz(pad.axes[2] || 0), dz(pad.axes[3] || 0)];
    if (this.padAxes.some((a) => a !== 0)) this.lastDevice = 'pad';
  }

  // Call once per frame before reading.
  update(dt) {
    this._pollPad();
    // swap the two maps instead of allocating a new one every frame
    const spare = this.prev;
    this.prev = this.cur;
    this.cur = spare;
    this.cur.clear();
    for (const [action, b] of Object.entries(BINDINGS)) {
      let v = false;
      for (const k of b.keys) if (this.keys.has(k)) v = true;
      for (const m of b.mouse) if (this.mouse.has(m)) v = true;
      for (const p of b.pad) if (this.padButtons[p]) v = true;
      this.cur.set(action, v && this.enabled);
    }
    let mx = 0; let my = 0;
    if (this.enabled) {
      if (this.keys.has('KeyD')) mx += 1;
      if (this.keys.has('KeyA')) mx -= 1;
      if (this.keys.has('KeyW')) my += 1;
      if (this.keys.has('KeyS')) my -= 1;
      mx += this.padAxes[0];
      my -= this.padAxes[1];
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.axes.moveX = mx;
    this.axes.moveY = my;
    const s = this.sensitivity;
    const inv = this.invertY ? -1 : 1;
    // arrow keys turn the camera too (fallback where pointer lock is refused, e.g. embedded previews)
    const kx = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const ky = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
    this.axes.lookX = this.enabled ? this.mouseDX * 0.0022 * s + (this.padAxes[2] + kx) * 2.6 * s * dt : 0;
    this.axes.lookY = this.enabled ? (this.mouseDY * 0.0022 * s + (this.padAxes[3] + ky * 0.7) * 1.8 * s * dt) * inv : 0;
    this.mouseDX = 0; this.mouseDY = 0;
  }

  down(a) { return !!this.cur.get(a); }
  pressed(a) { return !!this.cur.get(a) && !this.prev.get(a); }
  released(a) { return !this.cur.get(a) && !!this.prev.get(a); }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.el.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.el.removeEventListener('wheel', this._onWheel);
    this.el.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLock);
    document.removeEventListener('pointerlockerror', this._onLockError);
    window.removeEventListener('blur', this._onBlur);
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
}
