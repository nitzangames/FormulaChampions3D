// js/multiplayer.js
// All multiplayer glue. Depends on window.PlaySDK being loaded.

import { TIERS, TRACK_SEEDS, MP_SNAPSHOT_INTERVAL_MS, MP_BUFFER_MS } from './constants.js';

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
// Each entry: { t, x, y, angle, speed, lap, wp } sorted ascending by t.
const remoteSnapshots = new Map();
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
