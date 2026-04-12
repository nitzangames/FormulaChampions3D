import { TIERS, POINTS, TRACK_SEEDS, NUM_CARS } from './constants.js';

// Career persistence — stored in localStorage.
// Schema:
// {
//   tierIndex: 0-3 (F4-F1, current tier)
//   seasonLength: 5 | 10 | 20
//   currentRace: 0..seasonLength-1 (next race to run)
//   trackOrder: [int]  (shuffled TRACK_SEEDS indices, length = seasonLength)
//   standings: [{ carIdx: int, points: int }]  (cumulative points per car this season)
//   completed: bool  (season finished; waiting for promotion/retry)
// }

const KEY = 'mini-gt-3d:career';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}

export function getCareer() {
  return load();
}

export function hasCareer() {
  return load() !== null;
}

export function resetCareer() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

/**
 * Start a new career at F4 with the given season length.
 */
export function startNewCareer(seasonLength) {
  const state = {
    tierIndex: 0,
    seasonLength,
    currentRace: 0,
    trackOrder: pickTrackOrder(seasonLength),
    standings: emptyStandings(),
    completed: false,
  };
  save(state);
  return state;
}

/**
 * Record race results and advance the season.
 * finishOrder is an array of car indices in finishing order (first entry = winner).
 * Returns the updated state.
 */
export function recordRaceResult(finishOrder) {
  const state = load();
  if (!state) return null;

  // Award points based on finish position
  for (let pos = 0; pos < finishOrder.length; pos++) {
    const carIdx = finishOrder[pos];
    const pts = POINTS[pos] || 0;
    const entry = state.standings.find(s => s.carIdx === carIdx);
    if (entry) entry.points += pts;
  }

  state.currentRace++;
  if (state.currentRace >= state.seasonLength) {
    state.completed = true;
  }
  save(state);
  return state;
}

/**
 * Returns { playerWon, finalStandings } for a completed season.
 * finalStandings is sorted by points descending.
 */
export function seasonSummary() {
  const state = load();
  if (!state || !state.completed) return null;
  const sorted = [...state.standings].sort((a, b) => b.points - a.points);
  const playerWon = sorted[0].carIdx === 0;
  return { playerWon, finalStandings: sorted };
}

/**
 * If the player won the current season, promote to the next tier and start
 * a new season. Otherwise, restart the current tier's season.
 * Returns the new state.
 */
export function endSeason(promote) {
  const state = load();
  if (!state) return null;

  const newTierIndex = promote ? Math.min(state.tierIndex + 1, TIERS.length - 1) : state.tierIndex;

  const next = {
    tierIndex: newTierIndex,
    seasonLength: state.seasonLength,
    currentRace: 0,
    trackOrder: pickTrackOrder(state.seasonLength),
    standings: emptyStandings(),
    completed: false,
  };
  save(next);
  return next;
}

/**
 * Has the player completed F1 (won the final tier's season)?
 */
export function isCareerComplete() {
  const state = load();
  if (!state) return false;
  return state.tierIndex >= TIERS.length - 1 && state.completed && seasonSummary().playerWon;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function emptyStandings() {
  const arr = [];
  for (let i = 0; i < NUM_CARS; i++) arr.push({ carIdx: i, points: 0 });
  return arr;
}

function pickTrackOrder(seasonLength) {
  // Build a pool by cycling through TRACK_SEEDS if seasonLength > TRACK_SEEDS.length,
  // then shuffle.
  const pool = [];
  for (let i = 0; i < seasonLength; i++) {
    pool.push(i % TRACK_SEEDS.length);
  }
  // Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
