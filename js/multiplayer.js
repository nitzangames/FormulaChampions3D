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
