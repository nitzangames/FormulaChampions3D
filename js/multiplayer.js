// js/multiplayer.js
// All multiplayer glue. Depends on window.PlaySDK being loaded.

import { TIERS, TRACK_SEEDS, MP_SNAPSHOT_INTERVAL_MS, MP_BUFFER_MS, MP_FINISH_GRACE_MS } from './constants.js';

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
    showMpToast('Multiplayer unavailable. Reload the page?');
    onCancelCallback();
    return;
  }

  window.PlaySDK.onReady(() => {
    // isSignedIn can flip true after onReady (token arrives via postMessage).
    // Poll for up to ~4.5s before giving up — defensive fallback for older
    // cached SDKs. The platform's fixed SDK should satisfy on the first check.
    let tries = 15;
    (function check() {
      if (window.PlaySDK.isSignedIn) {
        window.PlaySDK.multiplayer.showLobby({
          maxPlayers: 4,
          onStart: () => { onStartCallback(); },
          onCancel: () => { onCancelCallback(); },
        });
        return;
      }
      if (--tries <= 0) {
        console.warn('[mp] still not signed in after retries — giving up');
        showMpToast('Multiplayer needs you signed in at play.nitzan.games.');
        onCancelCallback();
        return;
      }
      setTimeout(check, 300);
    })();
  });
}

// Visible in-game toast. alert() is often suppressed in cross-origin iframes
// so we render our own banner at the bottom of the screen.
let _mpToastTimer = null;
function showMpToast(message) {
  let el = document.getElementById('mp-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mp-toast';
    el.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%)',
      'background:#c92a2a',
      'color:#fff',
      'padding:12px 18px',
      'border-radius:10px',
      'font:600 14px -apple-system,BlinkMacSystemFont,sans-serif',
      'max-width:80%',
      'text-align:center',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
      'z-index:10000',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  if (_mpToastTimer) clearTimeout(_mpToastTimer);
  _mpToastTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

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

// Per-remote snapshot buffer, keyed by userId.
// Each entry: { t, x, y, angle, speed, lap, wp } where t is in LOCAL clock
// (we translate from sender clock using a per-remote offset set on first pkt).
const remoteSnapshots = new Map();
const remoteClockOffset = new Map(); // userId -> localNow - msg.t at first pkt
let lastLocalBroadcast = 0;

export function mpClearSnapshots() {
  remoteSnapshots.clear();
  remoteClockOffset.clear();
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
  // Lock an offset on the first packet from each player so subsequent
  // snapshots live in the local clock domain. Eliminates stutter from
  // cross-client Date.now() skew.
  if (!remoteClockOffset.has(fromUserId)) {
    remoteClockOffset.set(fromUserId, Date.now() - msg.t);
  }
  const offset = remoteClockOffset.get(fromUserId);
  const localT = msg.t + offset;

  if (!remoteSnapshots.has(fromUserId)) remoteSnapshots.set(fromUserId, []);
  const buf = remoteSnapshots.get(fromUserId);
  buf.push({
    t: localT,
    x: msg.x, y: msg.y,
    angle: msg.angle, speed: msg.speed,
    lap: msg.lap, wp: msg.wp,
  });
  const cutoff = localT - 1000;
  while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
}

// Finish tracking. Kept robust even when mpLocalUserId() returns null:
//   - localFinished is a boolean latch for the local player's finish.
//   - remoteFinishes is keyed by fromUserId from incoming race-finish
//     messages (server-stamped, always accurate).
// "All done" = localFinished + |remoteFinishes| >= room.players.length.
// No userId match required to count ourselves.
let localFinished = false;
let localFinishData = null; // { finishTime, bestLap }
const remoteFinishes = new Map();
let finishWatchdog = null;
let onAllFinishedCallback = null;

export function mpResetFinishTracker(onAllFinished) {
  localFinished = false;
  localFinishData = null;
  remoteFinishes.clear();
  if (finishWatchdog) { clearTimeout(finishWatchdog); finishWatchdog = null; }
  onAllFinishedCallback = onAllFinished;
}

export function mpReportLocalFinish(userId, finishTime, bestLap) {
  if (localFinished) return;
  localFinished = true;
  localFinishData = { finishTime, bestLap };
  // Broadcast regardless of whether we know our own userId — the server
  // stamps `from` on relay, so recipients will know it came from us.
  mpBroadcast({ type: 'race-finish', finishTime, bestLap });
  if (!finishWatchdog) {
    finishWatchdog = setTimeout(() => _checkAllFinished(true), MP_FINISH_GRACE_MS);
  }
  _checkAllFinished(false);
}

export function mpIngestFinish(fromUserId, msg) {
  if (remoteFinishes.has(fromUserId)) return;
  remoteFinishes.set(fromUserId, { finishTime: msg.finishTime, bestLap: msg.bestLap });
  if (!finishWatchdog) {
    finishWatchdog = setTimeout(() => _checkAllFinished(true), MP_FINISH_GRACE_MS);
  }
  _checkAllFinished(false);
}

function _checkAllFinished(graceExpired) {
  const room = mpGetRoom();
  if (!room) return;

  const totalPlayers = room.players.length;
  const doneCount = remoteFinishes.size + (localFinished ? 1 : 0);
  if (doneCount < totalPlayers && !graceExpired) return;

  if (finishWatchdog) { clearTimeout(finishWatchdog); finishWatchdog = null; }

  // Figure out which room.players entry is "us" so we can attach our local
  // finish data. Prefer matching against mpLocalUserId() if known; otherwise
  // pick the single player that isn't in remoteFinishes (since the server
  // never echoes our own message back to us).
  const myId = localUserId;
  let selfIdx = myId ? room.players.findIndex(p => p.userId === myId) : -1;
  if (selfIdx < 0 && localFinished) {
    selfIdx = room.players.findIndex(p => !remoteFinishes.has(p.userId));
  }

  const results = room.players.map((p, i) => {
    const isMe = (i === selfIdx);
    const data = isMe
      ? (localFinishData || { finishTime: null, bestLap: null })
      : (remoteFinishes.get(p.userId) || { finishTime: null, bestLap: null });
    return {
      userId: p.userId,
      name: isMe ? (p.displayName || 'YOU') : (p.displayName || 'Anonymous'),
      ...data,
    };
  }).sort((a, b) => {
    if (a.finishTime == null && b.finishTime == null) return 0;
    if (a.finishTime == null) return 1;
    if (b.finishTime == null) return -1;
    return a.finishTime - b.finishTime;
  });
  if (onAllFinishedCallback) onAllFinishedCallback(results);
}

const MP_EXTRAPOLATE_MS = 150; // keep extrapolating forward this long past last snap

export function mpInterpolateRemote(userId, now) {
  const buf = remoteSnapshots.get(userId);
  if (!buf || buf.length === 0) return null;
  const targetT = now - MP_BUFFER_MS;
  if (buf.length === 1) return buf[0];
  if (targetT <= buf[0].t) return buf[0];

  // Past the last snapshot: extrapolate forward using last known velocity
  // for up to MP_EXTRAPOLATE_MS. Beyond that, clamp to last pose so a
  // disconnected/stalled remote doesn't drift forever.
  if (targetT >= buf[buf.length - 1].t) {
    const last = buf[buf.length - 1];
    const extrapMs = Math.min(targetT - last.t, MP_EXTRAPOLATE_MS);
    if (extrapMs <= 0 || last.speed === 0) return last;
    // Visual angle convention: forward = (sin A, -cos A).
    const fx = Math.sin(last.angle);
    const fy = -Math.cos(last.angle);
    const dtSec = extrapMs / 1000;
    return {
      x: last.x + fx * last.speed * dtSec,
      y: last.y + fy * last.speed * dtSec,
      angle: last.angle,
      speed: last.speed,
      lap: last.lap,
      wp: last.wp,
    };
  }

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
