// ── Audio + haptics ──────────────────────────────────────────────────────────
// Procedural sounds via Web Audio API (no asset files). AudioContext is
// initialized lazily on the first user interaction (browsers require it).
// User-toggleable preferences for SFX and haptics, persisted to localStorage.

const STORAGE_KEY = 'mini-gt-3d:audio';
const LEGACY_KEY = 'racing-2d:audio';

const settings = {
  sfx: true,
  haptics: true,
};

(function load() {
  try {
    // One-shot migration: copy Racing 2D's old settings into the new key
    // if we haven't written the new key yet.
    if (localStorage.getItem(STORAGE_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (typeof obj.sfx === 'boolean') settings.sfx = obj.sfx;
      if (typeof obj.haptics === 'boolean') settings.haptics = obj.haptics;
    }
  } catch (_) {}
})();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
}

export function getSfxEnabled() { return settings.sfx; }
export function getHapticsEnabled() { return settings.haptics; }

export function setSfxEnabled(v) { settings.sfx = !!v; save(); }
export function setHapticsEnabled(v) { settings.haptics = !!v; save(); }

// ── AudioContext (lazy init) ─────────────────────────────────────────────────
let audioCtx = null;

export function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    audioCtx = null;
  }
}

function envOsc(type, freq, attack, decay, peak) {
  if (!settings.sfx || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + attack + decay + 0.02);
}

// ── Sound effects ────────────────────────────────────────────────────────────

/** Countdown beep (3, 2, 1) — short low tone */
export function playCountdownBeep() {
  envOsc('square', 440, 0.005, 0.12, 0.18);
}

/** GO! beep — higher, longer */
export function playGoBeep() {
  if (!settings.sfx || !audioCtx) return;
  const t = audioCtx.currentTime;
  // Two-stage rise tone
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(660, t);
  osc.frequency.linearRampToValueAtTime(990, t + 0.18);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.45);
}

/** Crash — short noise burst */
export function playCrash() {
  if (!settings.sfx || !audioCtx) return;
  const t = audioCtx.currentTime;
  // Noise via random buffer
  const dur = 0.35;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(120, t + dur);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(t);
}

/** Lap finish — ascending arpeggio */
export function playLapFinish() {
  if (!settings.sfx || !audioCtx) return;
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  const t0 = audioCtx.currentTime;
  notes.forEach((freq, i) => {
    const t = t0 + i * 0.08;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

/** Lap boundary beep (laps 1→2, 2→3) — softer, lower-pitched than lap finish */
export function playLapBoundary() {
  // Softer, lower-pitched version of playLapFinish
  envOsc('sine', 440, 0.01, 0.15, 0.3);
}

/** UI click (button press) */
export function playClick() {
  envOsc('square', 880, 0.002, 0.04, 0.12);
}

/** Car-vs-car bump — short low oscillator click ~80ms */
export function playBumpSound() {
  // Short low oscillator click. ~80ms.
  envOsc('square', 140, 0.005, 0.08, 0.25);
}

// ── Haptics ──────────────────────────────────────────────────────────────────

/** Short tap feedback (button press) */
export function hapticTap() {
  if (!settings.haptics) return;
  if (navigator.vibrate) navigator.vibrate(10);
}

/** Stronger feedback (crash, lap finish) */
export function hapticThump() {
  if (!settings.haptics) return;
  if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
}
