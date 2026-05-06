// ── Input: drag-to-steer via pointer events ──────────────────────────────────
// Uses ONE unified pointer-event API (no separate mouse/touch listeners).
// Handlers do zero work — just store raw clientX. The game loop converts
// to steering once per frame via update(). setPointerCapture lets us listen
// only on the canvas; events keep flowing even if the finger leaves it.

// Keyboard tuning — iterate here.
const KEY_TAP_INCREMENT = 0.1;   // steering added on each keydown (0..1 scale)
const KEY_HOLD_RATE = 1.0;       // steering added per second while held
const KEY_RECENTER_RATE = 0.5;   // steering drifted back to 0 per second when no key held
const KEY_REVERSE_MULTIPLIER = 3; // tap+hold rates multiplied when reversing direction

export class Input {
  constructor(canvas) {
    this._canvas = canvas;
    this._steering = 0;
    this._dragging = false;
    this._startX = 0;
    this._maxDragPx = 150;

    // Raw pointer position — written by handler, read in update()
    this._rawX = 0;
    this._rawDirty = false;

    // Public state for renderer
    this.dragScreenX = 0;
    this.dragScreenY = 0;
    this.dragging = false;
    this.pointerType = 'mouse'; // 'mouse' | 'touch' | 'pen'

    // Keyboard state
    this._keyLeft = false;
    this._keyRight = false;
    this._keyTarget = 0;        // -1, 0, or +1 based on keys held
    this._source = 'pointer';   // 'pointer' | 'keyboard'
    this._lastUpdateMs = 0;     // for dt computation in update()

    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this._dragging = true;
      this._startX = e.clientX;
      this._rawX = e.clientX;
      this._rawDirty = true;
      this._setDragScreen(e.clientX, e.clientY);
      this.dragging = true;
      this.pointerType = e.pointerType || 'mouse';
      this._source = 'pointer';
    }, { passive: true });

    canvas.addEventListener('pointermove', (e) => {
      // Zero work — just record raw value. update() processes it once per frame.
      this._rawX = e.clientX;
      this._rawDirty = true;
      this._source = 'pointer';
    }, { passive: true });

    const end = () => {
      this._dragging = false;
      this.dragging = false;
      this._rawDirty = false;
      if (this._source === 'pointer') {
        this._steering = 0;
      }
    };
    canvas.addEventListener('pointerup', end, { passive: true });
    canvas.addEventListener('pointercancel', end, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      let dir = 0;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this._keyLeft = true;
        dir = -1;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this._keyRight = true;
        dir = 1;
      }
      if (dir !== 0) {
        // Discrete tap bump: each press nudges steering in this direction.
        // When reversing direction, the tap bump is amplified so the wheel
        // crosses zero quickly instead of having to undo prior accumulation.
        const reversing = (this._steering > 0 && dir < 0) || (this._steering < 0 && dir > 0);
        const tap = KEY_TAP_INCREMENT * (reversing ? KEY_REVERSE_MULTIPLIER : 1);
        this._steering += tap * dir;
        if (this._steering > 1) this._steering = 1;
        else if (this._steering < -1) this._steering = -1;
        this._keyTarget = (this._keyLeft && this._keyRight) ? 0
                        : this._keyLeft ? -1
                        : this._keyRight ? 1 : 0;
        this._source = 'keyboard';
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      let matched = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this._keyLeft = false;
        matched = true;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this._keyRight = false;
        matched = true;
      }
      if (matched) {
        this._keyTarget = (this._keyLeft && this._keyRight) ? 0
                        : this._keyLeft ? -1
                        : this._keyRight ? 1 : 0;
        e.preventDefault();
      }
    });

    window.addEventListener('blur', () => {
      this._keyLeft = false;
      this._keyRight = false;
      this._keyTarget = 0;
      this._source = 'pointer';
    });
  }

  /** Called once per frame from the game loop. Drives _steering from the
   *  current source (pointer drag or keyboard ramp). */
  update() {
    const now = performance.now();
    let dt = this._lastUpdateMs ? (now - this._lastUpdateMs) / 1000 : 0;
    this._lastUpdateMs = now;
    if (dt > 0.05) dt = 0.05; // clamp so a tab pause does not snap to full lock

    if (this._source === 'pointer') {
      if (!this._dragging || !this._rawDirty) return;
      const dx = this._rawX - this._startX;
      this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
      this._rawDirty = false;
      return;
    }

    // Keyboard source: while a single direction is held, accumulate _steering
    // in that direction. With no key held, drift slowly back to 0.
    const dir = this._keyTarget;
    if (dir !== 0) {
      const reversing = (this._steering > 0 && dir < 0) || (this._steering < 0 && dir > 0);
      const rate = KEY_HOLD_RATE * (reversing ? KEY_REVERSE_MULTIPLIER : 1);
      this._steering += rate * dt * dir;
      if (this._steering > 1) this._steering = 1;
      else if (this._steering < -1) this._steering = -1;
    } else if (this._steering !== 0) {
      const decay = KEY_RECENTER_RATE * dt;
      if (this._steering > 0) {
        this._steering = this._steering - decay > 0 ? this._steering - decay : 0;
      } else {
        this._steering = this._steering + decay < 0 ? this._steering + decay : 0;
      }
    }
  }

  /** Snap steering to 0. Called externally on respawn or wall collision so the
   *  wheel matches the car's new direction. Held keys are kept; if a key is
   *  still down, the accumulator will start building from 0 again. */
  recenter() {
    this._steering = 0;
  }

  _setDragScreen(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = 1080 / rect.width;
    const scaleY = 1920 / rect.height;
    this.dragScreenX = (clientX - rect.left) * scaleX;
    this.dragScreenY = (clientY - rect.top) * scaleY;
  }

  get steering() {
    return this._steering;
  }
}
