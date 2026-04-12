// ── Input: drag-to-steer via pointer events ──────────────────────────────────
// Uses ONE unified pointer-event API (no separate mouse/touch listeners).
// Handlers do zero work — just store raw clientX. The game loop converts
// to steering once per frame via update(). setPointerCapture lets us listen
// only on the canvas; events keep flowing even if the finger leaves it.

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

    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this._dragging = true;
      this._startX = e.clientX;
      this._rawX = e.clientX;
      this._rawDirty = true;
      this._setDragScreen(e.clientX, e.clientY);
      this.dragging = true;
      this.pointerType = e.pointerType || 'mouse';
    }, { passive: true });

    canvas.addEventListener('pointermove', (e) => {
      // Zero work — just record raw value. update() processes it once per frame.
      this._rawX = e.clientX;
      this._rawDirty = true;
    }, { passive: true });

    const end = () => {
      this._dragging = false;
      this._steering = 0;
      this.dragging = false;
      this._rawDirty = false;
    };
    canvas.addEventListener('pointerup', end, { passive: true });
    canvas.addEventListener('pointercancel', end, { passive: true });
  }

  /** Called once per frame from the game loop. Converts raw coords to steering. */
  update() {
    if (!this._dragging || !this._rawDirty) return;
    const dx = this._rawX - this._startX;
    this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
    this._rawDirty = false;
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
