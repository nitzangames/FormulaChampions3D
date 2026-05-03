// ── Graphics settings ────────────────────────────────────────────────────────
// User-togglable renderer knobs for shadows, antialiasing, and pixel ratio.
// Android gets conservative defaults since mid-range Android GPUs + Chrome
// struggle with PCFSoftShadowMap + 2x pixel ratio + MSAA at the same time.
// iPhone leaves the defaults at max.
//
// Persisted to localStorage so the choice survives reloads.

const STORAGE_KEY = 'mini-gt-3d:graphics';

function detectAndroid() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /Android/i.test(ua);
}

const IS_ANDROID = detectAndroid();

// Defaults — Android gets a budget preset, everyone else gets max.
// Shadows are cheap enough even on Android, so we leave them on by default;
// antialias (MSAA) and high pixel ratio are the hard hits on mobile tilers.
const defaults = IS_ANDROID
  ? { shadows: true, antialias: false, pixelRatio: 1.0 }
  : { shadows: true, antialias: true,  pixelRatio: 2.0 };

const settings = { ...defaults };

(function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (typeof obj.shadows === 'boolean') settings.shadows = obj.shadows;
    if (typeof obj.antialias === 'boolean') settings.antialias = obj.antialias;
    if (typeof obj.pixelRatio === 'number') {
      // Clamp to supported steps
      const steps = [1.0, 1.5, 2.0];
      let best = steps[0], bd = Math.abs(obj.pixelRatio - steps[0]);
      for (let i = 1; i < steps.length; i++) {
        const d = Math.abs(obj.pixelRatio - steps[i]);
        if (d < bd) { bd = d; best = steps[i]; }
      }
      settings.pixelRatio = best;
    }
  } catch (_) {}
})();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
}

export function isAndroid() { return IS_ANDROID; }

export function getShadowsEnabled() { return settings.shadows; }
export function getAntialiasEnabled() { return settings.antialias; }
export function getPixelRatio() { return settings.pixelRatio; }

export function setShadowsEnabled(v) { settings.shadows = !!v; save(); }
export function setAntialiasEnabled(v) { settings.antialias = !!v; save(); }
export function setPixelRatio(v) {
  const n = Number(v);
  settings.pixelRatio = (n === 1 || n === 1.5 || n === 2) ? n : 1.0;
  save();
}

// Cycle through the 3 supported pixel-ratio steps.
export function cyclePixelRatio() {
  const steps = [1.0, 1.5, 2.0];
  const idx = steps.indexOf(settings.pixelRatio);
  settings.pixelRatio = steps[(idx + 1) % steps.length];
  save();
  return settings.pixelRatio;
}
