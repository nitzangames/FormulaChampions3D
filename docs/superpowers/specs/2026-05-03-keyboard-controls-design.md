# Keyboard Controls — Design

## Goal

Add keyboard steering to FormulaChampions3D so desktop players can race without dragging the mouse. The car's throttle is automatic, so this only covers steering input.

## Scope

A single-file change to `js/input.js`. No new modules, no constants in `js/constants.js`, no changes at the call site in `js/main.js`.

## Bindings

| Key             | Target steering |
|-----------------|-----------------|
| ArrowLeft, A    | −1              |
| ArrowRight, D   | +1              |
| Both held       |  0              |

Auto-repeat events (`e.repeat === true`) are ignored so a held key does not retrigger logic each tick. `preventDefault()` is called only on the four matched keys, so other browser shortcuts continue to work.

## Ramp

A held key does not snap `_steering` to ±1. Instead `_steering` moves toward a `_keyTarget` value at a fixed rate:

```
RAMP_RATE = 1 / 0.15      // full lock in ~150ms
delta     = RAMP_RATE * dt
_steering = clamp(_steering + sign(target - _steering) * delta, target_low, target_high)
```

When all steering keys are released, `_keyTarget` becomes 0 and the same rate decays `_steering` back to neutral.

## Source arbitration (last-input-wins)

The class tracks `_source: 'pointer' | 'keyboard'`.

- `pointerdown` and `pointermove` set `_source = 'pointer'`. Existing drag math runs and writes `_steering` directly.
- `keydown` for one of the four keys sets `_source = 'keyboard'` and updates `_keyTarget`. Drag input is ignored while the source is keyboard, even if the pointer is still down.
- `keyup` updates `_keyTarget` based on remaining held keys. The source stays `'keyboard'` until a pointer event sets it back.
- The existing `pointerup` / `pointercancel` zeroing only runs when `_source === 'pointer'`. If the user is keyboarding while the pointer happens to lift, the keyboard ramp is not interrupted.

## dt source

`update()` currently takes no arguments and is called once per frame from `js/main.js:1509`. To avoid changing the call site, dt is computed internally using `performance.now()`:

```
const now  = performance.now();
const dt   = this._lastUpdate ? (now - this._lastUpdate) / 1000 : 0;
this._lastUpdate = now;
```

dt is clamped to 0.05s (one frame at 20fps) so a tab pause does not snap steering to full lock on resume.

## Listener placement

`keydown` and `keyup` are attached to `window`, not the canvas, because the canvas rarely has focus on desktop. A `blur` listener on `window` clears all held-key state and resets `_keyTarget` to 0, so alt-tabbing away with a key held does not leave the car pinned in a turn.

## Allocation rules

Per the project rule against per-frame allocations:

- Handlers store booleans and numbers only — no objects, no arrays, no closures created per event beyond the listener registration itself.
- `update()` does arithmetic on existing numeric fields; no temporaries, no `Math.sign` allocations (use a `target > _steering ? 1 : -1` ternary).

## Public API

Unchanged. `input.steering` still returns a number in [−1, 1]. Consumers in `main.js` do not need to know whether steering came from drag or keyboard.

## Out of scope

- Throttle, brake, handbrake, gear keys (the car has no such inputs).
- Pause / menu / restart hotkeys.
- Configurable bindings.
- Gamepad support.
