// js/multiplayer.js
// All multiplayer glue. Depends on window.PlaySDK being loaded.

import { TIERS, TRACK_SEEDS } from './constants.js';

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
