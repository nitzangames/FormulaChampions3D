const GOLD_KEY = 'mini-gt-3d:gold';
const UNLOCKED_KEY = 'mini-gt-3d:unlocked-cars';

export const UNLOCK_COST = 100;
export const GOLD_REWARDS = [20, 16, 12, 8];

export function getGold() {
  try {
    const raw = localStorage.getItem(GOLD_KEY);
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) { return 0; }
}

export function addGold(amount) {
  const balance = getGold() + amount;
  try { localStorage.setItem(GOLD_KEY, String(balance)); } catch (_) {}
  return balance;
}

export function getUnlockedCars() {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    if (raw === null) return [0];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch (_) {}
  return [0];
}

export function isCarUnlocked(styleIndex) {
  return getUnlockedCars().includes(styleIndex);
}

export function unlockCar(styleIndex) {
  if (isCarUnlocked(styleIndex)) return false;
  if (getGold() < UNLOCK_COST) return false;
  addGold(-UNLOCK_COST);
  const unlocked = getUnlockedCars();
  unlocked.push(styleIndex);
  try { localStorage.setItem(UNLOCKED_KEY, JSON.stringify(unlocked)); } catch (_) {}
  return true;
}
