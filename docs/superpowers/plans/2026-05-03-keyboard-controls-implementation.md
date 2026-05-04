# Keyboard Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard steering (Arrow Left/Right + A/D) to the player car with a 150ms ramp and last-input-wins arbitration against the existing pointer drag system.

**Architecture:** All changes are confined to `js/input.js`. The `Input` class gains keyboard state fields, window-level keydown/keyup/blur listeners, a `_source` arbiter, and a rewritten `update()` that ramps `_steering` toward a key-driven target when keyboard is the active source. The public API (`input.steering`) is unchanged so the call site at `js/main.js:1509` does not move.

**Tech Stack:** Vanilla ES modules, browser KeyboardEvent + window event listeners, `performance.now()` for dt. No dependencies added.

**Verification model:** This project has no unit test framework. Verification is `node check-errors.js` (headless Chrome run against the dev server on :8084) for runtime/syntax errors, plus manual browser testing of specific behaviors listed in each task.

---

## File Structure

- Modify: `js/input.js` — add keyboard state, listeners, source arbiter, and ramp logic in `update()`.

No other files are touched.

---

### Task 1: Add keyboard state fields and listeners (no behavioral effect yet)

This task wires up keyboard event capture and tracks the target steering direction in `_keyTarget`, but does not yet feed it into `_steering`. After this task the game still steers from drag only; the new fields are observable via `window.__inputDebug` for verification.

**Files:**
- Modify: `js/input.js`

- [ ] **Step 1: Add keyboard state fields to the constructor**

Edit `js/input.js`. After the existing line `this.pointerType = 'mouse'; // 'mouse' | 'touch' | 'pen'` add:

```javascript
    // Keyboard state
    this._keyLeft = false;
    this._keyRight = false;
    this._keyTarget = 0;        // -1, 0, or +1 based on keys held
    this._source = 'pointer';   // 'pointer' | 'keyboard'
    this._lastUpdateMs = 0;     // for dt computation in update()
```

- [ ] **Step 2: Add keydown listener at the bottom of the constructor**

After the existing `canvas.addEventListener('pointercancel', end, { passive: true });` line, before the closing `}` of the constructor, add:

```javascript
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      let matched = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this._keyLeft = true;
        matched = true;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this._keyRight = true;
        matched = true;
      }
      if (matched) {
        this._keyTarget = (this._keyLeft && this._keyRight) ? 0
                        : this._keyLeft ? -1
                        : this._keyRight ? 1 : 0;
        this._source = 'keyboard';
        e.preventDefault();
      }
    });
```

- [ ] **Step 3: Add keyup listener immediately after keydown**

```javascript
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
```

- [ ] **Step 4: Add blur listener immediately after keyup**

```javascript
    window.addEventListener('blur', () => {
      this._keyLeft = false;
      this._keyRight = false;
      this._keyTarget = 0;
    });
```

- [ ] **Step 5: Run the syntax/runtime check**

Make sure the dev server is running (`node dev-server.js` in another terminal), then:

```bash
node check-errors.js
```

Expected output: `NO ERRORS - Game loaded successfully`. If errors appear, fix them before proceeding.

- [ ] **Step 6: Manual sanity check**

Open `http://localhost:8084`. Start a race. Press A, D, ArrowLeft, ArrowRight while the page has focus — the page must not throw, scroll, or trigger browser shortcuts. The car should NOT yet steer from keyboard (only drag works) — that is correct at this stage; Task 2 wires keys into steering. Behavioral verification of the listeners themselves happens in Task 2 step 3, since that is where keypresses produce a visible effect.

- [ ] **Step 7: Commit**

```bash
git add js/input.js
git commit -m "feat(input): add keyboard state and listeners (not wired into steering)"
```

---

### Task 2: Rewrite update() to ramp steering from keyboard target

This task wires `_keyTarget` into `_steering` via a 150ms ramp, and computes dt internally so the call site at `js/main.js:1509` does not change. After this task, holding A/D or Arrow keys steers the car. Drag still works because pointer events have not yet been gated.

**Files:**
- Modify: `js/input.js` — replace the `update()` method

- [ ] **Step 1: Replace the update() method**

Find the existing `update()` in `js/input.js` (currently around lines 53-58):

```javascript
  /** Called once per frame from the game loop. Converts raw coords to steering. */
  update() {
    if (!this._dragging || !this._rawDirty) return;
    const dx = this._rawX - this._startX;
    this._steering = Math.max(-1, Math.min(1, dx / this._maxDragPx));
    this._rawDirty = false;
  }
```

Replace it with:

```javascript
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

    // Keyboard source: ramp _steering toward _keyTarget at 1 / 0.15 per second.
    const target = this._keyTarget;
    const delta = (1 / 0.15) * dt;
    if (this._steering < target) {
      this._steering = this._steering + delta < target ? this._steering + delta : target;
    } else if (this._steering > target) {
      this._steering = this._steering - delta > target ? this._steering - delta : target;
    }
  }
```

Note: the conditional uses ternaries instead of `Math.min`/`Math.max` only to be consistent with the spec's "no per-frame allocations" rule — this is purely stylistic; `Math.min`/`Math.max` would work too. The existing pointer path keeps using `Math.max`/`Math.min` because that's how it was already written.

- [ ] **Step 2: Run the runtime check**

```bash
node check-errors.js
```

Expected: `NO ERRORS - Game loaded successfully`.

- [ ] **Step 3: Manual verification — keyboard steering works**

Open `http://localhost:8084`, start a race (any car/track). During racing:

- Hold ArrowLeft or A → car steers left, with a visible ramp-up over ~150ms (not instant).
- Release the key → car steering returns to neutral over ~150ms.
- Hold ArrowRight or D → car steers right.
- Hold both left and right → car goes straight (target is 0).

The on-screen steering wheel UI (drawn from `js/main.js:1492`) should rotate smoothly with the keyboard input — confirms `input.steering` is being read correctly.

- [ ] **Step 4: Manual verification — drag still works**

Without using the keyboard, drag horizontally on the canvas. Car should steer based on drag distance, exactly as before.

- [ ] **Step 5: Commit**

```bash
git add js/input.js
git commit -m "feat(input): keyboard steering with 150ms ramp"
```

---

### Task 3: Source arbitration — pointer events claim 'pointer' source, gate pointer-end zeroing

Without this task, the pointer's `end` handler still zeros `_steering` even when the user is keyboarding, and a leftover `_source = 'keyboard'` from an earlier key press will cause subsequent drags to be ignored. This task makes pointer events explicitly set `_source = 'pointer'` so drag re-takes control, and gates the pointer-end zeroing on the source.

**Files:**
- Modify: `js/input.js` — pointer event handlers

- [ ] **Step 1: Set source to 'pointer' on pointerdown**

In the existing `pointerdown` handler, after the line `this.pointerType = e.pointerType || 'mouse';`, add:

```javascript
      this._source = 'pointer';
```

So the handler ends with:

```javascript
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
```

- [ ] **Step 2: Gate the end() handler so it only zeros _steering when source is pointer**

Find the existing `end` function (currently around lines 42-47):

```javascript
    const end = () => {
      this._dragging = false;
      this._steering = 0;
      this.dragging = false;
      this._rawDirty = false;
    };
```

Replace it with:

```javascript
    const end = () => {
      this._dragging = false;
      this.dragging = false;
      this._rawDirty = false;
      if (this._source === 'pointer') {
        this._steering = 0;
      }
    };
```

- [ ] **Step 3: Run the runtime check**

```bash
node check-errors.js
```

Expected: `NO ERRORS - Game loaded successfully`.

- [ ] **Step 4: Manual verification — last-input-wins works**

Open `http://localhost:8084`, start a race.

Test sequence:
1. Hold A. Car steers left. ✓
2. While still holding A, click and drag on canvas. Car should keep steering from the keyboard (drag is ignored because `_source` is still `'keyboard'`). ✓
3. Release A. Car returns to neutral via the keyboard ramp (drag is still pressed but ignored). ✓
4. Without releasing the pointer, lift it. Now drag again — drag still ignored because `_source` is `'keyboard'`. ✓
5. Click fresh on the canvas without pressing any key. Drag should now drive steering — `pointerdown` set `_source = 'pointer'`. ✓
6. While dragging, press A. Keyboard takes over (`_source = 'keyboard'`). Release the pointer — steering should NOT snap to 0; the keyboard ramp continues. ✓

Test sequence 7 (pointer-only regression):
7. Refresh the page. Without ever pressing a key, drag horizontally. Car steers from drag. Release. Car goes neutral (zero applied because source is still default 'pointer'). ✓

- [ ] **Step 5: Commit**

```bash
git add js/input.js
git commit -m "feat(input): last-input-wins arbitration between pointer and keyboard"
```

---

### Task 4: Verify blur cleanup

The blur listener was added in Task 1 but its behavior is only meaningful now that keyboard actually drives steering. This task is verification only — no code changes — to confirm alt-tab does not strand the car in a turn.

**Files:** none modified.

- [ ] **Step 1: Manual verification — alt-tab while holding key**

Open `http://localhost:8084`, start a race.

1. Hold ArrowLeft. Car steers left.
2. Without releasing, alt-tab to another window (or click outside the browser to defocus). The browser fires `blur`, which clears `_keyLeft` / `_keyRight` / `_keyTarget`.
3. Wait 1 second, then alt-tab back. The car should be steering toward neutral (ramp from −1 → 0 over 150ms), not pinned at full left lock.

Note: the next ramp tick on resume uses a clamped dt of 0.05s (one frame at 20fps), so even after a long alt-tab the car ramps smoothly rather than snapping.

- [ ] **Step 2: Run the runtime check one final time**

```bash
node check-errors.js
```

Expected: `NO ERRORS - Game loaded successfully`.

- [ ] **Step 3: Final commit (only if any tweaks were needed during verification)**

If verification surfaced no issues, skip this step. Otherwise:

```bash
git add js/input.js
git commit -m "fix(input): <describe tweak>"
```

---

## Spec Coverage Check

- Bindings (ArrowLeft/A → −1, ArrowRight/D → +1, both → 0): Task 1 step 2/3.
- Auto-repeat ignored: Task 1 step 2 (`if (e.repeat) return`).
- preventDefault only on matched keys: Task 1 step 2/3.
- 150ms ramp: Task 2 step 1 (`(1 / 0.15) * dt`).
- Last-input-wins via `_source`: Task 3 steps 1–2.
- Pointer-end zero gated on source: Task 3 step 2.
- dt computed internally with `performance.now()`, clamped to 0.05s: Task 2 step 1.
- Window-level listeners: Task 1 steps 2–4.
- Window blur clears state: Task 1 step 4, verified Task 4.
- No allocations in handlers / update(): all handlers use boolean and number assignments only; update() uses scalar arithmetic.
- Public API unchanged: `input.steering` getter is untouched.
- Out-of-scope items (throttle/brake, menu hotkeys, gamepad): nothing in any task.
