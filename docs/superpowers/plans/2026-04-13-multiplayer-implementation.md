# Multiplayer v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realtime multiplayer racing using PlaySDK's built-in lobby; host picks track+class, up to 4 humans race together, post-race loop lets host pick next track without re-lobbying.

**Architecture:** PlaySDK's `showLobby()` handles room management; after `onStart` fires, a host-only picker screen broadcasts `race-config` + `race-start`, everyone races in parallel local simulations, each client broadcasts its own car state at 20 Hz, remote cars are rendered via kinematic bodies teleported to interpolated snapshot positions. Locally-authoritative collisions (your car bounces off remote ghosts in your own physics world; their client decides independently if they bounced).

**Tech Stack:** PlaySDK (via CDN), existing Physics2D engine (uses `isStatic: true` for kinematic remote cars), existing Three.js renderer, vanilla ES modules.

**Testing approach:** This codebase has no test suite — verification is smoke-tested end-to-end on `play.nitzan.games` with two browser tabs signed into separate accounts, plus `node check-errors.js` for console-error regressions. Each task ends with a deploy + manual verification checklist.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `index.html` | Load PlaySDK, add MULTIPLAYER button and MP screen divs. |
| `css/ui.css` | Styles for new MP screens, following existing cqh convention. |
| `js/multiplayer.js` | **New.** Lobby flow, host picker, race-config/start broadcast, snapshot send/recv + interpolation, remote car factory, finish aggregator, post-race loop. |
| `js/main.js` | Wire MULTIPLAYER button, add `raceMode === 'multiplayer'` branch, new `startMultiplayerRace({seed, tierIdx, startAt})` entry, call MP broadcast + apply from `fixedUpdate`, hook finish broadcast. |
| `js/car.js` | Add `isKinematic` constructor option — kinematic cars skip input/physics integration and are position-teleported each frame. |
| `js/constants.js` | Version bump + MP constants (`MP_SNAPSHOT_HZ = 20`, `MP_BUFFER_MS = 100`, `MP_MAX_PLAYERS = 4`, `MP_FINISH_GRACE_MS = 30000`). |

Everything else (renderer, scenery, audio, track-builder, race, input) is untouched.

---

## Task 1: Load PlaySDK and add MULTIPLAYER button

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Load PlaySDK script in `<head>`**

Add this line to `index.html` right after the existing `three.min.js` script tag:

```html
<script src="https://cdn-play.nitzan.games/lib/play-sdk.js"></script>
```

- [ ] **Step 2: Add MULTIPLAYER button to title screen**

Inside `#screen-title`, add the button just below `btn-quick-race`:

```html
<button id="btn-multiplayer" class="btn-secondary">MULTIPLAYER</button>
```

- [ ] **Step 3: Verify locally**

Run `node dev-server.js` and open http://localhost:8084. Title should show three buttons: NEW CAREER, QUICK RACE, MULTIPLAYER. Clicking MULTIPLAYER does nothing yet.

Run `node check-errors.js` and expect no new console errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(mp): load PlaySDK + MULTIPLAYER title button"
```

---

## Task 2: Create `js/multiplayer.js` scaffold and wire the button

**Files:**
- Create: `js/multiplayer.js`
- Modify: `js/main.js`

- [ ] **Step 1: Create `js/multiplayer.js` with core helpers and userId capture**

```javascript
// js/multiplayer.js
// All multiplayer glue. Depends on window.PlaySDK being loaded.

let localUserId = null;

function decodeTokenSub(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub;
  } catch { return null; }
}

// PlaySDK doesn't currently expose getUserId(), so we capture the same
// auth signals it uses (URL param + postMessage) to decode `sub` ourselves.
(function captureLocalUserId() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('play_token');
  if (urlToken) { localUserId = decodeTokenSub(urlToken); return; }
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'play-auth' && e.data.token) {
      localUserId = decodeTokenSub(e.data.token);
    }
  });
})();

export function mpLocalUserId() { return localUserId; }

export function mpGetRoom() {
  return window.PlaySDK && window.PlaySDK.multiplayer
    ? window.PlaySDK.multiplayer.getRoom()
    : null;
}

export function mpIsHost() {
  const r = mpGetRoom();
  return !!(r && r.isHost);
}

export function mpPlayerSlot(userId) {
  const r = mpGetRoom();
  if (!r) return -1;
  return r.players.findIndex(p => p.userId === userId);
}

let onStartCallback = null;
let onCancelCallback = null;

export function mpOpenLobby({ onStart, onCancel } = {}) {
  onStartCallback = onStart || (() => {});
  onCancelCallback = onCancel || (() => {});

  if (!window.PlaySDK || !window.PlaySDK.multiplayer) {
    console.warn('[mp] PlaySDK not available');
    onCancelCallback();
    return;
  }

  window.PlaySDK.onReady(() => {
    if (!window.PlaySDK.isSignedIn) {
      alert('Multiplayer requires signing in at play.nitzan.games');
      onCancelCallback();
      return;
    }
    window.PlaySDK.multiplayer.showLobby({
      maxPlayers: 4,
      onStart: () => { onStartCallback(); },
      onCancel: () => { onCancelCallback(); },
    });
  });
}
```

- [ ] **Step 2: Wire the button in `js/main.js`**

Add near the other imports at the top:

```javascript
import { mpOpenLobby, mpGetRoom, mpIsHost, mpLocalUserId } from './multiplayer.js';
```

Inside `setupButtons()`, right after the `btn-quick-race` handler:

```javascript
document.getElementById('btn-multiplayer').addEventListener('click', () => {
  playClick(); hapticTap();
  mpOpenLobby({
    onStart: () => {
      console.log('[mp] lobby started, host:', mpIsHost());
    },
    onCancel: () => showTitle(),
  });
});
```

- [ ] **Step 3: Deploy + smoke test**

```bash
cd /Users/nitzanwilnai/Programming/Claude/GamesPlatform
./scripts/deploy-game.sh /Users/nitzanwilnai/Programming/Claude/JSGames/FormulaChampions3D
```

Open `https://play.nitzan.games/formula-champions-3d` signed in. Click MULTIPLAYER → SDK lobby overlay appears. Create a public room → room code shows. Back arrow → returns to title.

- [ ] **Step 4: Commit**

```bash
git add js/multiplayer.js js/main.js
git commit -m "feat(mp): scaffold multiplayer.js + wire MULTIPLAYER button to SDK lobby"
```

---

## Task 3: Host picker screen + waiting screen

**Files:**
- Modify: `index.html`, `css/ui.css`, `js/main.js`, `js/multiplayer.js`

- [ ] **Step 1: Add new screens in `index.html`**

After `#screen-quicktrack`:

```html
<!-- Multiplayer: Host picks track + tier -->
<div id="screen-mphostpick" class="screen hidden">
  <h2>CHOOSE RACE</h2>
  <p class="subtitle">Select a class, then a track. Everyone will race.</p>
  <div class="mp-section-label">CLASS</div>
  <div id="mp-tier-grid" class="tier-grid"></div>
  <div class="mp-section-label">TRACK</div>
  <div id="mp-track-grid" class="track-grid"></div>
  <button id="btn-mphostpick-confirm" class="btn-primary">START RACE</button>
  <button id="btn-mphostpick-leave" class="btn-secondary">LEAVE ROOM</button>
</div>

<!-- Multiplayer: Non-host waiting for host -->
<div id="screen-mpwaiting" class="screen hidden">
  <h2 id="mpwaiting-title">WAITING</h2>
  <p class="subtitle" id="mpwaiting-subtitle">Host is choosing the next race...</p>
  <button id="btn-mpwaiting-leave" class="btn-secondary">LEAVE ROOM</button>
</div>
```

- [ ] **Step 2: Register screens in `js/main.js`**

In the `SCREEN_IDS` array (around line 102), append `'screen-mphostpick', 'screen-mpwaiting'`.

In the `showScreen` hideHUD list (around line 120), append `'mphostpick', 'mpwaiting'`.

- [ ] **Step 3: Add styles in `css/ui.css`**

Append at the end:

```css
.mp-section-label {
  font-size: 1.3cqh;
  color: #aaa;
  letter-spacing: 0.3cqh;
  margin-top: 1cqh;
  margin-bottom: 0.4cqh;
}
#screen-mphostpick .tier-grid,
#screen-mphostpick .track-grid {
  max-width: 60cqw;
}
#screen-mphostpick .track-grid {
  max-height: 24cqh;
  overflow-y: auto;
}
.tier-card.selected,
.track-card.selected {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.2);
}
```

- [ ] **Step 4: Add picker + waiting helpers in `js/multiplayer.js`**

At the top, import the existing constants:

```javascript
import { TIERS, TRACK_SEEDS } from './constants.js';
```

Add:

```javascript
let selectedTierIdx = 0;
let selectedSeedIdx = 0;

export function mpShowHostPicker({ onConfirm, onLeave }) {
  const tierGrid = document.getElementById('mp-tier-grid');
  tierGrid.innerHTML = '';
  selectedTierIdx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    const card = document.createElement('div');
    card.className = 'tier-card' + (i === selectedTierIdx ? ' selected' : '');
    card.textContent = TIERS[i].name;
    card.addEventListener('click', () => {
      selectedTierIdx = i;
      tierGrid.querySelectorAll('.tier-card').forEach((el, idx) => {
        el.classList.toggle('selected', idx === i);
      });
    });
    tierGrid.appendChild(card);
  }

  const trackGrid = document.getElementById('mp-track-grid');
  trackGrid.innerHTML = '';
  selectedSeedIdx = 0;
  for (let i = 0; i < TRACK_SEEDS.length; i++) {
    const card = document.createElement('div');
    card.className = 'track-card' + (i === selectedSeedIdx ? ' selected' : '');
    card.textContent = 'TRACK ' + (i + 1);
    card.addEventListener('click', () => {
      selectedSeedIdx = i;
      trackGrid.querySelectorAll('.track-card').forEach((el, idx) => {
        el.classList.toggle('selected', idx === i);
      });
    });
    trackGrid.appendChild(card);
  }

  document.getElementById('btn-mphostpick-confirm').onclick = () => {
    onConfirm({
      seed: TRACK_SEEDS[selectedSeedIdx],
      tierIdx: selectedTierIdx,
    });
  };
  document.getElementById('btn-mphostpick-leave').onclick = () => {
    const r = mpGetRoom();
    if (r) r.leave();
    onLeave();
  };
}

export function mpShowWaiting({ title, subtitle, onLeave }) {
  document.getElementById('mpwaiting-title').textContent = title || 'WAITING';
  document.getElementById('mpwaiting-subtitle').textContent =
    subtitle || 'Host is choosing the next race...';
  document.getElementById('btn-mpwaiting-leave').onclick = () => {
    const r = mpGetRoom();
    if (r) r.leave();
    onLeave();
  };
}
```

- [ ] **Step 5: Update the onStart handler in `main.js`**

Replace the placeholder onStart from Task 2:

```javascript
mpOpenLobby({
  onStart: () => {
    if (mpIsHost()) {
      showScreen('mphostpick');
      mpShowHostPicker({
        onConfirm: ({ seed, tierIdx }) => {
          console.log('[mp] host confirmed', seed, tierIdx);
          // Task 4 will broadcast race-config + race-start here.
        },
        onLeave: () => showTitle(),
      });
    } else {
      showScreen('mpwaiting');
      mpShowWaiting({ onLeave: () => showTitle() });
    }
  },
  onCancel: () => showTitle(),
});
```

Import `mpShowHostPicker` and `mpShowWaiting` in `main.js`.

- [ ] **Step 6: Deploy + verify**

Two tabs signed in as different accounts. Create a public room in tab 1, join in tab 2. Host clicks Start → tab 1 shows picker, tab 2 shows waiting. Host picks a tier + track; START RACE just logs for now.

- [ ] **Step 7: Commit**

```bash
git add index.html css/ui.css js/main.js js/multiplayer.js
git commit -m "feat(mp): host picker + non-host waiting screens"
```

---

## Task 4: Broadcast `race-config` + `race-start`; synced countdown

**Files:**
- Modify: `js/multiplayer.js`, `js/main.js`

- [ ] **Step 1: Add messaging + start broadcast in `multiplayer.js`**

Add module-level state and functions:

```javascript
let gameMessageHandler = null;
let onDisconnectCallback = null;

export function mpInitMessaging() {
  if (!window.PlaySDK || !window.PlaySDK.multiplayer) return;
  window.PlaySDK.multiplayer.on('game', (fromUserId, payload) => {
    if (!payload || !payload.type) return;
    if (gameMessageHandler) gameMessageHandler(fromUserId, payload);
  });
  window.PlaySDK.multiplayer.on('disconnected', () => {
    if (onDisconnectCallback) onDisconnectCallback();
  });
  window.PlaySDK.multiplayer.on('kicked', () => {
    if (onDisconnectCallback) onDisconnectCallback();
  });
}

export function mpSetMessageHandler(fn) { gameMessageHandler = fn; }
export function mpSetDisconnectHandler(fn) { onDisconnectCallback = fn; }

export function mpBroadcast(payload) {
  const r = mpGetRoom();
  if (r) r.send(payload);
}

export function mpHostStartRace({ seed, tierIdx }) {
  const startAt = Date.now() + 1500; // 1.5s lead for propagation
  mpBroadcast({ type: 'race-config', seed, tierIdx });
  setTimeout(() => {
    mpBroadcast({ type: 'race-start', startAt, hostNow: Date.now() });
  }, 200);
  return { seed, tierIdx, startAt };
}
```

- [ ] **Step 2: Call `mpInitMessaging` on page load**

In `js/main.js`, after the `initRenderer(canvas); initAudio(); initEffects(getScene(), getCamera());` block:

```javascript
mpInitMessaging();
mpSetDisconnectHandler(() => {
  gameState.state = 'postrace';
  showTitle();
});
```

Import `mpInitMessaging`, `mpSetDisconnectHandler`, `mpSetMessageHandler`, `mpHostStartRace`, `mpBroadcast` in `main.js`.

- [ ] **Step 3: Add `startMultiplayerRace` in `main.js`**

Below `startQuickRace`:

```javascript
function startMultiplayerRace({ seed, tierIdx, startAt }) {
  raceMode = 'multiplayer';
  currentSeed = seed;
  quickTierIndex = tierIdx;  // reuse tier-lookup plumbing

  finishOrder = [];
  playerFinished = false;
  playerAutoController = null;
  raceRecorded = false;

  initTrack(seed);
  spawnCars();
  setStartLights(0);

  const delay = Math.max(0, startAt - Date.now());
  setTimeout(() => {
    gameState.startCountdown();
    prevCountdown = COUNTDOWN_SECONDS;
    showScreen('countdown');
    showHUD();
    lastTime = 0;
    accumulator = 0;
  }, delay);
}
```

- [ ] **Step 4: Host confirms → broadcast + local start**

Update the Task 3 host `onConfirm`:

```javascript
onConfirm: ({ seed, tierIdx }) => {
  const { startAt } = mpHostStartRace({ seed, tierIdx });
  startMultiplayerRace({ seed, tierIdx, startAt });
},
```

- [ ] **Step 5: Wire message handler for race-config/race-start**

Declare at the top of `main.js` (near the other module-level race state):

```javascript
let pendingMpConfig = null;
```

In the init block (same place as `mpInitMessaging`):

```javascript
mpSetMessageHandler((fromUserId, msg) => {
  if (msg.type === 'race-config') {
    pendingMpConfig = { seed: msg.seed, tierIdx: msg.tierIdx };
    return;
  }
  if (msg.type === 'race-start' && pendingMpConfig) {
    const cfg = pendingMpConfig;
    pendingMpConfig = null;
    startMultiplayerRace({
      seed: cfg.seed,
      tierIdx: cfg.tierIdx,
      startAt: msg.startAt,
    });
    return;
  }
});
```

- [ ] **Step 6: Deploy + verify**

Two tabs. Host picks + starts. Both tabs load the same track and begin countdown within ~50-150ms of each other. The race runs with only the local car visible (remote cars come in Task 5-6).

- [ ] **Step 7: Commit**

```bash
git add js/multiplayer.js js/main.js
git commit -m "feat(mp): broadcast race-config + race-start, synced countdown"
```

---

## Task 5: Kinematic Car flag + spawn path for multiplayer

**Files:**
- Modify: `js/car.js`, `js/main.js`

- [ ] **Step 1: Read `js/car.js` fully before editing**

```bash
cat js/car.js
```

Confirm the constructor signature, physics body creation, and `update()` / `postPhysicsUpdate()` methods.

- [ ] **Step 2: Add `isKinematic` to `Car`**

In `js/car.js`, modify the constructor to accept the flag. The exact edit depends on the existing signature, but the effect must be:

1. Constructor accepts a second options object: `new Car(world, { isKinematic })`.
2. `this.isKinematic = isKinematic;` is stored.
3. The body is created with `isStatic: this.isKinematic` so it participates in collision but never integrates velocity.
4. `update(steering)` returns early if `this.isKinematic`.
5. `postPhysicsUpdate()` returns early if `this.isKinematic` (or at minimum, does not reset forces on a body that has none).
6. `spawn(x, y, angle)` still places the body at the spawn pose — no change needed.

Example constructor change (adjust to match existing shape):

```javascript
constructor(world, { isKinematic = false } = {}) {
  this.isKinematic = isKinematic;
  // ... rest unchanged, passing isStatic: isKinematic to new Body({ ... }) ...
}

update(steering) {
  if (this.isKinematic) return;
  // ... existing code ...
}

postPhysicsUpdate() {
  if (this.isKinematic) return;
  // ... existing code ...
}
```

- [ ] **Step 3: Rewrite the spawn path in `spawnCars()`**

Read `js/main.js` from the top of `spawnCars` (around line 184) to the end of the function (around line 278) before editing.

After `const speedMult = TIERS[tierIdx].speedMult;`, insert:

```javascript
const carSpawnSpecs = [];
if (raceMode === 'multiplayer') {
  const room = mpGetRoom();
  const players = room ? room.players : [];
  const myId = mpLocalUserId();
  carSpawnSpecs.push({ slotIdx: 0, isLocal: true, userId: myId });
  let slot = 1;
  for (const p of players) {
    if (p.userId === myId) continue;
    carSpawnSpecs.push({ slotIdx: slot++, isLocal: false, userId: p.userId });
  }
} else {
  for (let i = 0; i < NUM_CARS; i++) {
    carSpawnSpecs.push({ slotIdx: i, isLocal: (i === 0), userId: null });
  }
}
```

Replace the existing `for (let i = 0; i < NUM_CARS; i++) { ... cars.push(car); carModels.push(model); }` loop with:

```javascript
for (const spec of carSpawnSpecs) {
  const i = spec.slotIdx;
  const car = new Car(world, { isKinematic: !spec.isLocal && raceMode === 'multiplayer' });
  const pos = getSpawnPosForCar(i);
  car.spawn(pos.x, pos.y, spawnAngle);
  car.currentWaypointIdx = pos.waypointIdx;
  car.lapsCompleted = 0;
  car.halfwayReached = false;
  car.seenLowerQuarter = false;
  car.bestLap = null;
  car.currentLapStartMs = 0;
  car.finished = false;
  car.maxSpeedMult = speedMult;
  car.userData = { userId: spec.userId || null };

  cars.push(car);

  const model = buildCarModel(0, CAR_COLORS[i]);
  model.castShadow = true;
  scene.add(model);
  carModels.push(model);
}
```

Guard the AI-controller loop:

```javascript
if (raceMode !== 'multiplayer') {
  for (let i = 0; i < AI_SKILLS.length; i++) {
    const ai = new AIController(cars[i + 1], walls, AI_SKILLS[i], cars);
    aiControllers.push(ai);
  }
}
```

Also update `prevLaps`:

```javascript
prevLaps = new Array(cars.length).fill(0);
```

(Previously `NUM_CARS`; MP races may have fewer cars.)

- [ ] **Step 4: Deploy + verify**

Two tabs, start MP. Each tab shows 2 cars: the local player's car drives normally; the other car is a static visual sitting at spawn (no snapshots yet — Task 6). Single-player modes should still spawn 8 cars and work as before.

- [ ] **Step 5: Commit**

```bash
git add js/car.js js/main.js
git commit -m "feat(mp): Car isKinematic flag + MP-aware spawn path"
```

---

## Task 6: Broadcast local car state at 20 Hz; apply remote snapshots

**Files:**
- Modify: `js/constants.js`, `js/multiplayer.js`, `js/main.js`

- [ ] **Step 1: Add MP constants**

In `js/constants.js`:

```javascript
export const MP_SNAPSHOT_HZ = 20;
export const MP_SNAPSHOT_INTERVAL_MS = 1000 / MP_SNAPSHOT_HZ;
export const MP_BUFFER_MS = 100;
export const MP_MAX_PLAYERS = 4;
export const MP_FINISH_GRACE_MS = 30000;
```

- [ ] **Step 2: Snapshot buffer + broadcast helpers in `multiplayer.js`**

Import at the top:

```javascript
import { MP_SNAPSHOT_INTERVAL_MS, MP_BUFFER_MS } from './constants.js';
```

Add:

```javascript
const remoteSnapshots = new Map(); // userId -> [ { t, x, y, angle, speed, lap, wp } ]
let lastLocalBroadcast = 0;

export function mpClearSnapshots() {
  remoteSnapshots.clear();
  lastLocalBroadcast = 0;
}

export function mpBroadcastLocalCar(car, now) {
  if (now - lastLocalBroadcast < MP_SNAPSHOT_INTERVAL_MS) return;
  lastLocalBroadcast = now;
  mpBroadcast({
    type: 'car-state',
    t: now,
    x: car.physX,
    y: car.physY,
    angle: car.angle,
    speed: car.speed || 0,
    lap: car.lapsCompleted || 0,
    wp: car.currentWaypointIdx || 0,
  });
}

export function mpIngestCarState(fromUserId, msg) {
  if (!remoteSnapshots.has(fromUserId)) remoteSnapshots.set(fromUserId, []);
  const buf = remoteSnapshots.get(fromUserId);
  buf.push({
    t: msg.t,
    x: msg.x, y: msg.y,
    angle: msg.angle, speed: msg.speed,
    lap: msg.lap, wp: msg.wp,
  });
  const cutoff = msg.t - 1000;
  while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
}

export function mpInterpolateRemote(userId, now) {
  const buf = remoteSnapshots.get(userId);
  if (!buf || buf.length === 0) return null;
  const targetT = now - MP_BUFFER_MS;
  if (buf.length === 1) return buf[0];
  if (targetT <= buf[0].t) return buf[0];
  if (targetT >= buf[buf.length - 1].t) return buf[buf.length - 1];
  let a = buf[0], b = buf[1];
  for (let i = 1; i < buf.length; i++) {
    if (buf[i].t >= targetT) { a = buf[i - 1]; b = buf[i]; break; }
  }
  const span = b.t - a.t;
  const alpha = span > 0 ? (targetT - a.t) / span : 0;
  let da = b.angle - a.angle;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return {
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    angle: a.angle + da * alpha,
    speed: a.speed + (b.speed - a.speed) * alpha,
    lap: b.lap,
    wp: b.wp,
  };
}
```

- [ ] **Step 3: Route `car-state` in the main.js handler**

Extend `mpSetMessageHandler` callback:

```javascript
if (msg.type === 'car-state') {
  mpIngestCarState(fromUserId, msg);
  return;
}
```

Import `mpIngestCarState` in `main.js`.

- [ ] **Step 4: Broadcast local car state from `fixedUpdate`**

In `main.js` `fixedUpdate`, inside the `if (state === 'racing' || state === 'finishing')` block, after the existing lap/finish-tracking loop and before `if (respawnTimer > 0)`:

```javascript
if (raceMode === 'multiplayer' && cars[0]) {
  mpBroadcastLocalCar(cars[0], Date.now());
}
```

Also, at the top of `startMultiplayerRace`, reset state:

```javascript
mpClearSnapshots();
```

Import `mpBroadcastLocalCar` and `mpClearSnapshots` in `main.js`.

- [ ] **Step 5: Add `applyRemoteSnapshots()` and call it per frame**

Add this function in `main.js` (e.g. right below `spawnCars`):

```javascript
function applyRemoteSnapshots() {
  if (raceMode !== 'multiplayer') return;
  const now = Date.now();
  for (let i = 1; i < cars.length; i++) {
    const car = cars[i];
    if (!car.isKinematic) continue;
    const uid = car.userData && car.userData.userId;
    if (!uid) continue;
    const snap = mpInterpolateRemote(uid, now);
    if (!snap) continue;
    car.body.setPosition(snap.x, snap.y);
    car.body.angle = snap.angle;
    car.body.previousAngle = snap.angle;
    car.body.renderAngle = snap.angle;
    car.physX = snap.x;
    car.physY = snap.y;
    car.speed = snap.speed;
    car.lapsCompleted = snap.lap;
    car.currentWaypointIdx = snap.wp;
  }
}
```

Call it from the per-frame render path, right before the existing `updateCarModel` loop (look around `main.js:1148`):

```javascript
applyRemoteSnapshots();
// ... existing updateCarModel loop ...
```

Import `mpInterpolateRemote` in `main.js`.

If `car.physX`/`car.physY` aren't standard fields on `Car`, check `js/car.js` and either add them (set from `car.body.position` after spawn) or update `car.body.renderPosition` directly so the existing renderer hook works.

- [ ] **Step 6: Deploy + verify**

Two tabs. Both should see each other's car move smoothly. No collisions expected yet (Task 7 verifies collisions work). Watch for jitter: if cars jump rather than interpolate smoothly, the buffer may be too short — bump `MP_BUFFER_MS` to 150.

- [ ] **Step 7: Commit**

```bash
git add js/constants.js js/multiplayer.js js/main.js
git commit -m "feat(mp): 20Hz car-state broadcast + interpolated remote car rendering"
```

---

## Task 7: Verify local collisions against kinematic remote cars

**Files:**
- Possibly modify: `js/car.js`

- [ ] **Step 1: Deploy + collision smoke test**

Two tabs. Have one player ram the other. Expected: your car bounces and loses speed when you hit the remote ghost. The remote ghost is unaffected in your view (its own client independently decides if it bounced).

- [ ] **Step 2: If collisions don't trigger, diagnose**

Likely causes and fixes:
- `collisionGroup` / `collisionMask` on cars excludes static bodies → set both kinematic and dynamic cars to the same group/mask.
- Remote body's AABB isn't dirtied after `setPosition` → confirm `Body.setPosition` sets `_aabbDirty = true` (it does per `physics2d/src/body.js:75`).
- Remote body has `isSensor: true` → confirm neither kinematic nor dynamic cars set that flag.

Fix the smallest issue and redeploy.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add js/car.js
git commit -m "fix(mp): kinematic remote cars collide with local player car"
```

If no change was needed, skip this commit.

---

## Task 8: Broadcast + aggregate finish; show MP results screen

**Files:**
- Modify: `index.html`, `css/ui.css`, `js/multiplayer.js`, `js/main.js`

- [ ] **Step 1: Add MP results screen in `index.html`**

After `#screen-mpwaiting`:

```html
<div id="screen-mpresults" class="screen hidden">
  <h2>RACE RESULTS</h2>
  <div id="mpresults-standings" class="standings-mini"></div>
  <button id="btn-mpresults-next" class="btn-primary hidden">NEXT RACE</button>
  <div id="mpresults-waiting" class="subtitle hidden">Waiting for host to pick next track...</div>
  <button id="btn-mpresults-leave" class="btn-secondary">LEAVE ROOM</button>
</div>
```

Register `'screen-mpresults'` in `SCREEN_IDS` and add `'mpresults'` to the `hideHUD` list in `main.js`.

- [ ] **Step 2: Style the results box**

Append to `css/ui.css`:

```css
#screen-mpresults .standings-mini {
  width: 86cqw; max-width: 86cqw;
  font-size: 2cqh;
  padding: 2cqh 4cqh;
}
#screen-mpresults .standings-mini .row { padding: 0.6cqh 0; }
```

- [ ] **Step 3: Finish tracker in `multiplayer.js`**

Import at top:

```javascript
import { MP_FINISH_GRACE_MS } from './constants.js';
```

Add:

```javascript
const finishedPlayers = new Map();
let finishWatchdog = null;
let onAllFinishedCallback = null;

export function mpResetFinishTracker(onAllFinished) {
  finishedPlayers.clear();
  if (finishWatchdog) { clearTimeout(finishWatchdog); finishWatchdog = null; }
  onAllFinishedCallback = onAllFinished;
}

export function mpReportLocalFinish(userId, finishTime, bestLap) {
  if (!userId) return;
  if (finishedPlayers.has(userId)) return;
  finishedPlayers.set(userId, { finishTime, bestLap });
  mpBroadcast({ type: 'race-finish', finishTime, bestLap });
  if (!finishWatchdog) {
    finishWatchdog = setTimeout(() => _checkAllFinished(true), MP_FINISH_GRACE_MS);
  }
  _checkAllFinished(false);
}

export function mpIngestFinish(fromUserId, msg) {
  if (finishedPlayers.has(fromUserId)) return;
  finishedPlayers.set(fromUserId, { finishTime: msg.finishTime, bestLap: msg.bestLap });
  if (!finishWatchdog) {
    finishWatchdog = setTimeout(() => _checkAllFinished(true), MP_FINISH_GRACE_MS);
  }
  _checkAllFinished(false);
}

function _checkAllFinished(graceExpired) {
  const room = mpGetRoom();
  if (!room) return;
  const everyoneDone = room.players.every(p => finishedPlayers.has(p.userId));
  if (everyoneDone || graceExpired) {
    if (finishWatchdog) { clearTimeout(finishWatchdog); finishWatchdog = null; }
    const results = room.players.map(p => ({
      userId: p.userId,
      name: p.displayName || 'Anonymous',
      ...(finishedPlayers.get(p.userId) || { finishTime: null, bestLap: null }),
    })).sort((a, b) => {
      if (a.finishTime == null && b.finishTime == null) return 0;
      if (a.finishTime == null) return 1;
      if (b.finishTime == null) return -1;
      return a.finishTime - b.finishTime;
    });
    if (onAllFinishedCallback) onAllFinishedCallback(results);
  }
}
```

- [ ] **Step 4: Guard the SP "player finished" branch in `fixedUpdate`**

Read `main.js` around lines 910-930. The current block triggers an AI-takeover controller + `showRaceResults` when the local player finishes. Modify it so MP mode takes a different branch:

```javascript
if (laps >= NUM_LAPS && !cars[i].finished) {
  cars[i].finished = true;
  finishOrder.push(i);

  if (i === 0) {
    playerFinished = true;
    if (raceMode === 'multiplayer') {
      gameState.state = 'finishing';
      mpReportLocalFinish(mpLocalUserId(), gameState.raceTime, cars[0].bestLap);
    } else {
      // existing AI-takeover + showRaceResults path unchanged
      playerAutoController = new AIController(
        cars[0], walls, AI_SKILLS[AI_SKILLS.length - 1], cars,
      );
      gameState.state = 'finishing';
      showRaceResults(finishOrder);
    }
  } else if (playerFinished && raceMode !== 'multiplayer') {
    showRaceResults(finishOrder);
  }
}
```

Also guard the `if (!raceRecorded && finishOrder.length >= NUM_CARS)` block so it doesn't fire in MP mode (MP finish is driven by `mpReportLocalFinish` + remote finishes, not by all-cars-finished-locally):

```javascript
if (!raceRecorded && finishOrder.length >= NUM_CARS && raceMode !== 'multiplayer') {
  // existing block unchanged
}
```

- [ ] **Step 5: Route `race-finish` in the message handler**

```javascript
if (msg.type === 'race-finish') {
  mpIngestFinish(fromUserId, msg);
  return;
}
```

Import `mpIngestFinish` in `main.js`.

- [ ] **Step 6: Reset finish tracker and wire the callback on race start**

Inside `startMultiplayerRace`, after `mpClearSnapshots()`:

```javascript
mpResetFinishTracker((results) => {
  gameState.state = 'postrace';
  renderMpResults(results);
  showScreen('mpresults');
});
```

Import `mpResetFinishTracker` and `mpReportLocalFinish` in `main.js`.

- [ ] **Step 7: Implement `renderMpResults` in `main.js`**

```javascript
function renderMpResults(results) {
  const el = document.getElementById('mpresults-standings');
  el.innerHTML = results.map((r, i) => {
    const time = r.finishTime != null ? formatTime(r.finishTime) : 'DNF';
    return `<div class="row"><span><span class="pos">${i + 1}.</span>${r.name}</span><span>${time}</span></div>`;
  }).join('');
  const isHost = mpIsHost();
  document.getElementById('btn-mpresults-next').classList.toggle('hidden', !isHost);
  document.getElementById('mpresults-waiting').classList.toggle('hidden', isHost);
}
```

- [ ] **Step 8: Deploy + verify**

Two tabs, full race. After both finish, both tabs land on `#screen-mpresults`. Host sees NEXT RACE; non-host sees "Waiting for host to pick next track...". Standings show both player names and times sorted by finish time.

- [ ] **Step 9: Commit**

```bash
git add index.html css/ui.css js/multiplayer.js js/main.js
git commit -m "feat(mp): finish broadcast + shared results screen"
```

---

## Task 9: Post-race loop — NEXT RACE (host) / LEAVE (all)

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Wire NEXT RACE + LEAVE buttons**

In `setupButtons()`:

```javascript
document.getElementById('btn-mpresults-next').addEventListener('click', () => {
  playClick(); hapticTap();
  if (!mpIsHost()) return;
  showScreen('mphostpick');
  mpShowHostPicker({
    onConfirm: ({ seed, tierIdx }) => {
      const { startAt } = mpHostStartRace({ seed, tierIdx });
      startMultiplayerRace({ seed, tierIdx, startAt });
    },
    onLeave: () => showTitle(),
  });
});

document.getElementById('btn-mpresults-leave').addEventListener('click', () => {
  playClick(); hapticTap();
  const r = mpGetRoom();
  if (r) r.leave();
  showTitle();
});

document.getElementById('btn-mpwaiting-leave').addEventListener('click', () => {
  playClick(); hapticTap();
  const r = mpGetRoom();
  if (r) r.leave();
  showTitle();
});
```

- [ ] **Step 2: Non-host transitions from results → waiting when host picks again**

Extend the `race-config` branch in the main.js message handler:

```javascript
if (msg.type === 'race-config') {
  pendingMpConfig = { seed: msg.seed, tierIdx: msg.tierIdx };
  const onResults = !document.getElementById('screen-mpresults').classList.contains('hidden');
  if (onResults) {
    showScreen('mpwaiting');
    mpShowWaiting({
      title: 'NEXT RACE LOADING',
      subtitle: 'Host picked the next track...',
      onLeave: () => { const r = mpGetRoom(); if (r) r.leave(); showTitle(); },
    });
  }
  return;
}
```

- [ ] **Step 3: Deploy + verify full loop**

Two tabs. Race once → results. Host clicks NEXT RACE → host sees picker, non-host flips from results to "NEXT RACE LOADING". Host picks → both race again with the new track. LEAVE in one tab returns that tab to title; the other tab keeps running.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat(mp): post-race loop — host next-race picker, leave buttons"
```

---

## Task 10: Version bump + final e2e + deploy

**Files:**
- Modify: `js/constants.js`

- [ ] **Step 1: Bump VERSION**

```javascript
export const VERSION = 'v0.2.0';
```

- [ ] **Step 2: Single-player regression pass**

Play one career race (short season) and one quick race end-to-end. Both must still work as before.

- [ ] **Step 3: Multiplayer e2e**

Two tabs, full loop:
1. Both sign in.
2. Create → join.
3. Host picks → both race.
4. Collide at least once mid-race — local bounces confirmed on both tabs.
5. Both finish — results screen shows on both.
6. Host clicks NEXT RACE → both tabs race a second time.
7. Click LEAVE on one tab — returns to title; other tab continues (or returns to title if only one player left).

- [ ] **Step 4: Commit + push + deploy**

```bash
git add js/constants.js
git commit -m "chore: v0.2.0 — multiplayer v1"
git push
cd /Users/nitzanwilnai/Programming/Claude/GamesPlatform
./scripts/deploy-game.sh /Users/nitzanwilnai/Programming/Claude/JSGames/FormulaChampions3D
```

---

## Self-Review Notes

- **Spec coverage:** UX flow → Tasks 1-3; race-config + race-start → Task 4; snapshots + interpolation → Task 6; remote car spawn/kinematic → Task 5; collision verification → Task 7; finish + results → Task 8; post-race loop → Task 9.
- **Local userId discovery** is the weakest part — we rely on the same token-extraction path as the SDK itself. If the SDK later hides the token path, `PlaySDK.getUserId()` should replace the decode.
- **Spawn ordering** assumes `room.players` is identical across all clients. This is documented SDK behavior.
- **Clock skew** beyond host-only `startAt` is uncompensated; we accept ~100-200ms start drift.
- **Collision asymmetry** is expected v1 behavior — documented in the spec.
- **Single-player paths** are untouched; `raceMode` branching isolates MP additions.
