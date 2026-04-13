// ── main.js — career-driven game loop ─────────────────────────────────────

import { World, Vec2 } from '../physics2d/index.js';
import { GameState } from './game.js';
import { Input } from './input.js';
import {
  VERSION, FIXED_DT, NUM_CARS, NUM_LAPS, MAX_SPEED,
  TRACK_SEEDS, PX_TO_WORLD, RESPAWN_DELAY_SEC, AI_SKILLS,
  COUNTDOWN_SECONDS, TILE, TURN_SPEED_PENALTY,
  TIERS, POINTS, SEASON_LENGTHS, CAR_COLORS,
} from './constants.js';
import { Car } from './car.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies } from './track.js';
import {
  Race, computeCenterLineLengths, rankStandings,
  advanceWaypoint, computeProgress,
} from './race.js';
import { AIController } from './ai-controller.js';
import {
  initAudio, playCountdownBeep, playGoBeep, playCrash,
  playLapFinish, playLapBoundary, playBumpSound, hapticThump,
  playClick, hapticTap,
  getSfxEnabled, setSfxEnabled, getHapticsEnabled, setHapticsEnabled,
} from './audio.js';
import {
  getCareer, hasCareer, startNewCareer, recordRaceResult,
  seasonSummary, endSeason, resetCareer, isCareerComplete,
} from './career.js';
import { initRenderer, render as renderScene, getScene, getCamera, updateSunPosition } from './renderer3d.js';
import { initChaseCamera, updateChaseCamera, triggerShake, resetChaseCamera } from './camera3d.js';
import { buildTrack as buildTrack3D, disposeTrack, setStartLights } from './track-builder.js';
import { buildCarModel, updateCarModel } from './car-models.js';
import { initEffects, updateEffects, spawnSmoke, spawnSparks, addSkidmark, clearEffects } from './effects3d.js';
import { buildScenery, disposeScenery } from './scenery.js';

// ── State ───────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const gameState = new GameState();
const input = new Input(canvas);

let world = null;
let cars = [];
let carModels = [];
let aiControllers = [];
let race = null;
let centerLine = null;
let walls = null;
let cl = null;
let track = null;

let respawnTimer = 0;
let prevCountdown = COUNTDOWN_SECONDS;
let prevLaps = [];
let accumulator = 0;
let lastTime = 0;
let finishShownTimeout = null;

// Career-driven
let career = null;              // cached career state
let currentSeed = null;         // seed of the track currently being raced

// Minimap
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const MINIMAP_DOT_COLORS = CAR_COLORS.map(hex => '#' + hex.toString(16).padStart(6, '0'));

// Overlay canvas for 2D steering wheel
const overlayCanvas = document.getElementById('overlay-canvas');
const overlayCtx = overlayCanvas.getContext('2d');

// ── Time formatting ─────────────────────────────────────────────────────────

function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const hundredths = Math.floor((totalSec % 1) * 100);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function positionSuffix(pos) {
  if (pos === 1) return '1ST';
  if (pos === 2) return '2ND';
  if (pos === 3) return '3RD';
  return `${pos}TH`;
}

// ── Screen management ───────────────────────────────────────────────────────

const SCREEN_IDS = [
  'screen-title', 'screen-seasonsetup', 'screen-career',
  'screen-countdown', 'screen-respawn', 'screen-finished',
  'screen-seasonend', 'screen-careercomplete', 'screen-pause',
];

function showScreen(name) {
  for (const id of SCREEN_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (name && id === `screen-${name}`) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }
  // Hide HUD on menu screens
  if (['title', 'seasonsetup', 'career', 'finished', 'seasonend', 'careercomplete', 'pause'].includes(name)) {
    hideHUD();
  }
}

function showHUD() { document.getElementById('hud').classList.remove('hidden'); }
function hideHUD() { document.getElementById('hud').classList.add('hidden'); }

// ── Init renderer ───────────────────────────────────────────────────────────

initRenderer(canvas);
initAudio();
initEffects(getScene(), getCamera());

// ── Track setup ─────────────────────────────────────────────────────────────

function initTrack(seed) {
  disposeTrack();
  disposeScenery();
  clearEffects();

  track = generateTrack(seed);
  centerLine = buildTrackPath(track);
  walls = buildWallPaths(centerLine);
  cl = computeCenterLineLengths(centerLine);

  world = new World({ gravity: new Vec2(0, 0), fixedDt: FIXED_DT });

  world.onCollision = (bodyA, bodyB, contact) => {
    const udA = bodyA.userData;
    const udB = bodyB.userData;
    if (!udA || !udB) return;

    let carBody = null;
    if (udA.type === 'car' && udB.type === 'wall') carBody = bodyA;
    else if (udB.type === 'car' && udA.type === 'wall') carBody = bodyB;

    if (carBody) {
      const car = cars.find(c => c.body === carBody);
      if (car) {
        const wasCrashed = car.crashed;
        car.onWallCollision(contact);
        if (!wasCrashed && car.crashed) {
          spawnSparks(car.x, car.y);
          if (car === cars[0]) {
            playCrash();
            hapticThump();
            triggerShake(0.4);
            respawnTimer = RESPAWN_DELAY_SEC;
          }
        } else if (!car.crashed) {
          playBumpSound();
        }
      }
    }
  };

  createWallBodies(world, walls);
  buildTrack3D(getScene(), centerLine, walls, track);
  buildScenery(getScene(), centerLine, walls, track);
}

// ── Car spawning ────────────────────────────────────────────────────────────

function spawnCars() {
  const scene = getScene();

  for (const model of carModels) {
    if (model && model.parent) model.parent.remove(model);
  }
  cars = [];
  carModels = [];
  aiControllers = [];

  // Finish line = exit of start tile = waypoint 3 (2 grid tiles + 1 start tile)
  const finishIdx = 3;
  const p = centerLine[finishIdx];
  const pNext = centerLine[(finishIdx + 1) % centerLine.length];

  const dx = pNext.x - p.x;
  const dy = pNext.y - p.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const fwdX = dx / len;
  const fwdY = dy / len;
  const perpX = -fwdY;
  const perpY = fwdX;
  const spawnAngle = Math.atan2(fwdX, -fwdY);

  // 2×4 grid — 2 cars per row, 4 rows. Row 1 = P1/P2, Row 4 = P7/P8.
  const acrossOffsets = [-80, 80];
  const alongOffsets = [-100, -300, -600, -900];

  // Compute spawn positions + the waypoint index each car corresponds to.
  // Each tile is TILE=512px long. From finish line (wp3) backward:
  //   -0   .. -512  → in start tile (wp2→wp3)     → initial waypoint = 2
  //   -512 .. -1024 → in grid tile 2 (wp1→wp2)    → initial waypoint = 1
  //   -1024..       → in grid tile 1 (wp0→wp1)    → initial waypoint = 0
  const spawnPositions = [];
  for (const along of alongOffsets) {
    const absAlong = Math.abs(along);
    let initialWaypoint;
    if (absAlong < 512)      initialWaypoint = 2;
    else if (absAlong < 1024) initialWaypoint = 1;
    else                      initialWaypoint = 0;

    for (const across of acrossOffsets) {
      spawnPositions.push({
        x: p.x + fwdX * along + perpX * across,
        y: p.y + fwdY * along + perpY * across,
        waypointIdx: initialWaypoint,
      });
    }
  }

  // Player = index 0, always starts last (P8 = spawn index NUM_CARS-1)
  function getSpawnPosForCar(i) {
    return i === 0 ? spawnPositions[NUM_CARS - 1] : spawnPositions[i - 1];
  }

  // Get tier speed multiplier
  const tierIdx = career ? career.tierIndex : 0;
  const speedMult = TIERS[tierIdx].speedMult;

  for (let i = 0; i < NUM_CARS; i++) {
    const car = new Car(world);
    const pos = getSpawnPosForCar(i);
    car.spawn(pos.x, pos.y, spawnAngle);

    car.currentWaypointIdx = pos.waypointIdx;
    car.lapsCompleted = 0;
    car.halfwayReached = false;
    car.seenLowerQuarter = false;
    car.bestLap = null;
    car.currentLapStartMs = 0;
    car.finished = false;
    car.maxSpeedMult = speedMult; // tier-specific speed

    cars.push(car);

    const model = buildCarModel(0, CAR_COLORS[i]);
    model.castShadow = true;
    scene.add(model);
    carModels.push(model);
  }

  for (let i = 0; i < AI_SKILLS.length; i++) {
    const ai = new AIController(cars[i + 1], walls, AI_SKILLS[i], cars);
    aiControllers.push(ai);
  }

  race = new Race(cars, centerLine, finishIdx);

  prevLaps = new Array(NUM_CARS).fill(0);
  resetChaseCamera();
  initChaseCamera(getCamera());
  respawnTimer = 0;
}

// ── Respawn ─────────────────────────────────────────────────────────────────

function respawnPlayer() {
  const car = cars[0];
  if (!car || !car.body) return;

  const idx = car.currentWaypointIdx;
  const pt = centerLine[idx];
  const nextPt = centerLine[(idx + 1) % centerLine.length];

  const dx = nextPt.x - pt.x;
  const dy = nextPt.y - pt.y;
  const angle = Math.atan2(dx, -dy);

  car.body.position.set(pt.x, pt.y);
  car.body.velocity.set(0, 0);
  car.body.angularVelocity = 0;
  car.body.angle = angle - Math.PI / 2;
  car.body._aabbDirty = true;
  car.speed = 0;
  car.crashed = false;
  car._bounceTimer = 0;
}

// ── HUD update ──────────────────────────────────────────────────────────────

function updateHUD() {
  const state = gameState.state;

  if (state === 'countdown') {
    const num = gameState.countdownNumber;
    const cdEl = document.getElementById('countdown-number');
    if (cdEl) {
      const text = num > 0 ? String(num) : 'GO!';
      if (cdEl.textContent !== text) {
        cdEl.textContent = text;
        cdEl.style.animation = 'none';
        cdEl.offsetHeight;
        cdEl.style.animation = '';
      }
    }
  }

  const respawnEl = document.getElementById('screen-respawn');
  if (respawnEl) {
    if (respawnTimer > 0 && (state === 'racing' || state === 'finishing')) {
      respawnEl.classList.remove('hidden');
    } else {
      respawnEl.classList.add('hidden');
    }
  }

  if (state === 'racing' || state === 'finishing') {
    const laps = Math.min((cars[0].lapsCompleted || 0) + 1, NUM_LAPS);
    const lapEl = document.getElementById('hud-lap');
    if (lapEl) lapEl.textContent = `LAP ${laps}/${NUM_LAPS}`;

    const timeEl = document.getElementById('hud-time');
    if (timeEl) timeEl.textContent = formatTime(gameState.raceTime);

    const bestEl = document.getElementById('hud-best');
    if (bestEl && cars[0].bestLap) {
      bestEl.textContent = `BEST ${formatTime(cars[0].bestLap)}`;
    } else if (bestEl) {
      bestEl.textContent = 'BEST --:--.--';
    }

    const speedEl = document.getElementById('hud-speed');
    if (speedEl) {
      const kmh = Math.round(Math.abs(cars[0].speed) * 0.36);
      speedEl.textContent = `${kmh} km/h`;
    }

    const posEl = document.getElementById('hud-pos');
    if (posEl && cl) {
      const standings = rankStandings(cars, (car) =>
        computeProgress(
          { x: car.physX, y: car.physY },
          car.currentWaypointIdx,
          centerLine, cl, car.lapsCompleted || 0
        )
      );
      const playerStanding = standings.find(s => s.idx === 0);
      const pos = playerStanding ? playerStanding.position : 1;
      posEl.textContent = `POS ${pos}/${NUM_CARS}`;
    }
  }
}

// ── Career UI ───────────────────────────────────────────────────────────────

function showTitle() {
  // Show "Continue Career" only if one exists
  const continueBtn = document.getElementById('btn-continue-career');
  if (continueBtn) {
    if (hasCareer()) continueBtn.classList.remove('hidden');
    else continueBtn.classList.add('hidden');
  }
  showScreen('title');
}

function showSeasonSetup() {
  showScreen('seasonsetup');
}

function showCareerHome() {
  career = getCareer();
  if (!career) { showTitle(); return; }

  const tier = TIERS[career.tierIndex];
  document.getElementById('career-tier').textContent = tier.name;
  document.getElementById('career-race').textContent =
    `${Math.min(career.currentRace + 1, career.seasonLength)} / ${career.seasonLength}`;

  const playerEntry = career.standings.find(s => s.carIdx === 0);
  document.getElementById('career-points').textContent = String(playerEntry ? playerEntry.points : 0);

  const sorted = [...career.standings].sort((a, b) => b.points - a.points);
  const playerPos = sorted.findIndex(s => s.carIdx === 0) + 1;
  document.getElementById('career-standing').textContent = `${playerPos} / ${NUM_CARS}`;

  renderStandings('standings-mini', sorted);

  showScreen('career');
}

function renderStandings(elementId, sortedStandings) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < sortedStandings.length; i++) {
    const entry = sortedStandings[i];
    const row = document.createElement('div');
    row.className = 'row' + (entry.carIdx === 0 ? ' player' : '');
    const name = entry.carIdx === 0 ? 'YOU' : `AI ${entry.carIdx}`;
    row.innerHTML = `<span><span class="pos">P${i + 1}</span>${name}</span><span>${entry.points} pts</span>`;
    el.appendChild(row);
  }
}

// ── Start a race from career state ──────────────────────────────────────────

function startNextRace() {
  career = getCareer();
  if (!career) { showTitle(); return; }

  if (finishShownTimeout) {
    clearTimeout(finishShownTimeout);
    finishShownTimeout = null;
  }

  const seedIndex = career.trackOrder[career.currentRace];
  const seed = TRACK_SEEDS[seedIndex];
  currentSeed = seed;

  initTrack(seed);
  spawnCars();
  setStartLights(0); // lights out until countdown begins
  gameState.startCountdown();
  prevCountdown = COUNTDOWN_SECONDS;

  showScreen('countdown');
  showHUD();

  lastTime = 0;
  accumulator = 0;
}

// ── Race results ────────────────────────────────────────────────────────────

function showRaceResults(finishOrder) {
  const playerPos = finishOrder.indexOf(0) + 1;
  document.getElementById('finish-position').textContent = positionSuffix(playerPos);
  document.getElementById('finish-time').textContent = `TIME: ${formatTime(gameState.raceTime)}`;

  const bestEl = document.getElementById('finish-best');
  if (bestEl && cars[0].bestLap) {
    bestEl.textContent = `BEST LAP: ${formatTime(cars[0].bestLap)}`;
  } else if (bestEl) {
    bestEl.textContent = '';
  }

  const pts = POINTS[playerPos - 1] || 0;
  document.getElementById('finish-points').textContent = pts > 0 ? `+${pts} POINTS` : '';

  // Record into career
  const updated = recordRaceResult(finishOrder);
  career = updated;

  // Show updated championship standings
  const sorted = [...career.standings].sort((a, b) => b.points - a.points);
  renderStandings('race-standings', sorted);

  showScreen('finished');
}

function continueFromResults() {
  career = getCareer();
  if (!career) { showTitle(); return; }

  if (career.completed) {
    showSeasonEnd();
  } else {
    showCareerHome();
  }
}

function showSeasonEnd() {
  const summary = seasonSummary();
  if (!summary) { showCareerHome(); return; }

  const tier = TIERS[career.tierIndex];
  const titleEl = document.getElementById('seasonend-title');
  const msgEl = document.getElementById('seasonend-message');

  if (summary.playerWon) {
    if (career.tierIndex >= TIERS.length - 1) {
      titleEl.textContent = `${tier.name} CHAMPION!`;
      msgEl.textContent = 'You have won every tier. Continue to finish.';
    } else {
      const nextTier = TIERS[career.tierIndex + 1];
      titleEl.textContent = `${tier.name} CHAMPION!`;
      msgEl.textContent = `Promoted to ${nextTier.name}.`;
    }
  } else {
    titleEl.textContent = `${tier.name} — SEASON OVER`;
    const sorted = summary.finalStandings;
    const playerPos = sorted.findIndex(s => s.carIdx === 0) + 1;
    msgEl.textContent = `You finished ${positionSuffix(playerPos)}. Restart the season to try again.`;
  }

  renderStandings('seasonend-standings', summary.finalStandings);
  showScreen('seasonend');
}

function handleSeasonEndContinue() {
  const summary = seasonSummary();
  if (!summary) { showCareerHome(); return; }

  const playerWon = summary.playerWon;
  const wasLastTier = career.tierIndex >= TIERS.length - 1;

  if (playerWon && wasLastTier) {
    // Full career complete
    showScreen('careercomplete');
    return;
  }

  // Either promote and start new season, or retry same tier
  endSeason(playerWon);
  showCareerHome();
}

// ── Button handlers ─────────────────────────────────────────────────────────

function setupButtons() {
  // Title: New Career
  document.getElementById('btn-new-career').addEventListener('click', () => {
    playClick(); hapticTap();
    showSeasonSetup();
  });

  // Title: Continue Career
  document.getElementById('btn-continue-career').addEventListener('click', () => {
    playClick(); hapticTap();
    showCareerHome();
  });

  // Season setup: season length buttons
  document.querySelectorAll('.btn-season').forEach((btn) => {
    btn.addEventListener('click', () => {
      playClick(); hapticTap();
      const len = parseInt(btn.getAttribute('data-length'), 10);
      if (!len) return;
      startNewCareer(len);
      showCareerHome();
    });
  });

  // Season setup: back
  document.getElementById('btn-season-back').addEventListener('click', () => {
    playClick(); hapticTap();
    showTitle();
  });

  // Career home: next race
  document.getElementById('btn-next-race').addEventListener('click', () => {
    playClick(); hapticTap();
    startNextRace();
  });

  // Career home: abandon
  document.getElementById('btn-abandon').addEventListener('click', () => {
    playClick(); hapticTap();
    if (confirm('Abandon this career? All progress will be lost.')) {
      resetCareer();
      career = null;
      showTitle();
    }
  });

  // HUD: Pause
  document.getElementById('btn-pause').addEventListener('click', () => {
    playClick(); hapticTap();
    gameState.pause();
    showScreen('pause');
    updateToggles();
  });

  // Pause: Resume
  document.getElementById('btn-resume').addEventListener('click', () => {
    playClick(); hapticTap();
    gameState.resume();
    showScreen(null);
    showHUD();
  });

  // Pause: Retry
  document.getElementById('btn-retry').addEventListener('click', () => {
    playClick(); hapticTap();
    startNextRace();
  });

  // Pause: Quit
  document.getElementById('btn-quit').addEventListener('click', () => {
    playClick(); hapticTap();
    clearEffects();
    gameState.reset();
    showCareerHome();
  });

  // Finished: Continue
  document.getElementById('btn-next').addEventListener('click', () => {
    playClick(); hapticTap();
    continueFromResults();
  });

  // Season end: Continue
  document.getElementById('btn-season-continue').addEventListener('click', () => {
    playClick(); hapticTap();
    handleSeasonEndContinue();
  });

  // Career complete: New Career
  document.getElementById('btn-career-done').addEventListener('click', () => {
    playClick(); hapticTap();
    resetCareer();
    career = null;
    showSeasonSetup();
  });

  // SFX toggle
  document.getElementById('btn-sfx').addEventListener('click', () => {
    const newVal = !getSfxEnabled();
    setSfxEnabled(newVal);
    updateToggles();
    playClick(); hapticTap();
  });

  // Haptics toggle
  document.getElementById('btn-haptics').addEventListener('click', () => {
    const newVal = !getHapticsEnabled();
    setHapticsEnabled(newVal);
    updateToggles();
    playClick(); hapticTap();
  });
}

function updateToggles() {
  const sfxBtn = document.getElementById('btn-sfx');
  const hapBtn = document.getElementById('btn-haptics');
  if (sfxBtn) {
    sfxBtn.textContent = getSfxEnabled() ? 'ON' : 'OFF';
    sfxBtn.classList.toggle('active', getSfxEnabled());
  }
  if (hapBtn) {
    hapBtn.textContent = getHapticsEnabled() ? 'ON' : 'OFF';
    hapBtn.classList.toggle('active', getHapticsEnabled());
  }
}

// ── Fixed update ────────────────────────────────────────────────────────────

function fixedUpdate() {
  const state = gameState.state;

  if (state === 'countdown') {
    const prevNum = gameState.countdownNumber;
    const done = gameState.tickCountdown();
    if (gameState.countdownNumber < prevNum && gameState.countdownNumber > 0) {
      playCountdownBeep();
    }
    // Update start lights: 3 = 2 lights, 2 = 4 lights, 1 = 5 lights
    const cd = gameState.countdownNumber;
    if (cd >= 3)      setStartLights(2);
    else if (cd >= 2) setStartLights(4);
    else if (cd >= 1) setStartLights(5);

    if (done) {
      playGoBeep();
      setStartLights(0); // lights out → GO
      showScreen(null);
      showHUD();
    }
    return;
  }

  if (state === 'racing' || state === 'finishing') {
    gameState.tickRace();

    const playerSteering = input.steering;
    cars[0].lastSteering = playerSteering;
    cars[0].update(playerSteering);

    const playerProgress = computeProgress(
      { x: cars[0].physX, y: cars[0].physY },
      cars[0].currentWaypointIdx,
      centerLine, cl, cars[0].lapsCompleted
    );

    for (let i = 0; i < aiControllers.length; i++) {
      const ai = aiControllers[i];
      const aiCar = cars[i + 1];
      const aiProgress = computeProgress(
        { x: aiCar.physX, y: aiCar.physY },
        aiCar.currentWaypointIdx,
        centerLine, cl, aiCar.lapsCompleted
      );
      const steering = ai.tick(playerProgress, aiProgress);
      aiCar.lastSteering = steering;
      aiCar.update(steering);
    }

    world.fixedStep(FIXED_DT);

    for (const body of world.bodies) {
      body.renderPosition.copy(body.position);
      body.renderAngle = body.angle;
    }

    for (const car of cars) car.postPhysicsUpdate();

    for (const car of cars) {
      car.currentWaypointIdx = advanceWaypoint(
        car, car.currentWaypointIdx, centerLine
      );
    }

    race.update(gameState.raceTime);

    for (let i = 0; i < cars.length; i++) {
      const laps = cars[i].lapsCompleted || 0;
      if (laps > prevLaps[i]) {
        if (i === 0) {
          if (laps >= NUM_LAPS) {
            playLapFinish();
            hapticThump();
          } else {
            playLapBoundary();
          }
        }
        prevLaps[i] = laps;
      }
    }

    // Check if player finished
    if (state === 'racing' && (cars[0].lapsCompleted || 0) >= NUM_LAPS) {
      gameState.state = 'finishing';
      cars[0].finished = true;

      // Compute final finish order for ALL cars by progress
      const finalStandings = rankStandings(cars, (car) =>
        computeProgress(
          { x: car.physX, y: car.physY },
          car.currentWaypointIdx,
          centerLine, cl, car.lapsCompleted || 0
        )
      );
      const finishOrder = finalStandings.map(s => s.idx);

      gameState.finish(null);

      finishShownTimeout = setTimeout(() => {
        showRaceResults(finishOrder);
        finishShownTimeout = null;
      }, 2000);
    }

    if (respawnTimer > 0) {
      respawnTimer -= FIXED_DT;
      if (respawnTimer <= 0) {
        respawnTimer = 0;
        respawnPlayer();
      }
    }
  }
}

// ── Minimap ────────────────────────────────────────────────────────────────

function drawMinimap() {
  if (!centerLine || centerLine.length === 0) return;

  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const pad = 10;

  minimapCtx.clearRect(0, 0, w, h);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of centerLine) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY);
  const offX = (w - rangeX * scale) / 2;
  const offY = (h - rangeY * scale) / 2;

  function toMiniX(x) { return offX + (x - minX) * scale; }
  function toMiniY(y) { return offY + (y - minY) * scale; }

  minimapCtx.beginPath();
  minimapCtx.moveTo(toMiniX(centerLine[0].x), toMiniY(centerLine[0].y));
  for (let i = 1; i < centerLine.length; i++) {
    minimapCtx.lineTo(toMiniX(centerLine[i].x), toMiniY(centerLine[i].y));
  }
  minimapCtx.closePath();
  minimapCtx.strokeStyle = '#666';
  minimapCtx.lineWidth = 3;
  minimapCtx.stroke();

  for (let i = cars.length - 1; i >= 0; i--) {
    const car = cars[i];
    if (!car) continue;
    const cx = toMiniX(car.x);
    const cy = toMiniY(car.y);
    const radius = i === 0 ? 4 : 3;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    minimapCtx.fillStyle = MINIMAP_DOT_COLORS[i] || '#fff';
    minimapCtx.fill();
  }
}

// ── Steering Wheel (2D overlay) ─────────────────────────────────────────────

function drawSteeringWheel(ctx, screenX, screenY, steering, speed) {
  const R = 120;
  const rimOuter = R;
  const rimInner = R * 0.76;
  const hubRadius = R * 0.28;
  const rotation = steering * Math.PI * 0.75;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.translate(screenX, screenY);
  ctx.rotate(rotation);

  // Matte black suede donut rim
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(0, 0, rimOuter, 0, Math.PI * 2);
  ctx.arc(0, 0, rimInner, 0, Math.PI * 2, true);
  ctx.fill('evenodd');

  // Suede texture
  ctx.fillStyle = '#1f1f1f';
  for (let i = 0; i < 100; i++) {
    const a = (i * 0.4389) % (Math.PI * 2);
    const r = rimInner + 2 + ((i * 1.93) % (rimOuter - rimInner - 4));
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // 12 o'clock marker
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(-5, -rimOuter - 1, 10, (rimOuter - rimInner) + 3);

  // 3 spokes
  const spokeAngles = [Math.PI / 2, 0, Math.PI];
  const spokeHalfW = R * 0.06;
  const spokeInner = hubRadius;
  const spokeOuter = rimInner - 2;

  for (const a of spokeAngles) {
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#2a2a2e';
    ctx.beginPath();
    ctx.moveTo(spokeInner, -spokeHalfW);
    ctx.lineTo(spokeOuter - spokeHalfW, -spokeHalfW);
    ctx.arc(spokeOuter - spokeHalfW, 0, spokeHalfW, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(spokeInner, spokeHalfW);
    ctx.arc(spokeInner, 0, spokeHalfW, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3a3a3e';
    ctx.fillRect(spokeInner + 4, -spokeHalfW + 1, spokeOuter - spokeInner - 8, 1.5);

    ctx.fillStyle = '#0a0a0a';
    for (let i = 0; i < 3; i++) {
      const t = 0.28 + i * 0.22;
      const x = spokeInner + (spokeOuter - spokeInner) * t;
      ctx.beginPath();
      ctx.arc(x, 0, spokeHalfW * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(0, 0, hubRadius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a8a8ac';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 0, hubRadius, 0, Math.PI * 2); ctx.stroke();

  const ratio = 1 - Math.abs(steering || 0) * (1 - TURN_SPEED_PENALTY);
  const pct = Math.round(ratio * 100);
  ctx.save();
  ctx.rotate(-rotation);
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 27px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pct + '%', 0, 0);
  ctx.restore();

  ctx.restore();
}

// ── Render frame ────────────────────────────────────────────────────────────

function renderFrame(dt) {
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const model = carModels[i];
    if (!car || !model) continue;

    const steering = i === 0 ? input.steering : 0;
    updateCarModel(model, car.x, car.y, car.angle, car.speed, steering, dt);
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const steer = car.lastSteering || 0;
    if (Math.abs(steer) > 0.5 && car.speed > MAX_SPEED * 0.3) {
      spawnSmoke(car.x, car.y, car.angle);
    }
    if (car.speed > 50) {
      addSkidmark(car.x, car.y, car.angle, steer);
    }
  }
  updateEffects(dt);

  if (cars[0]) {
    updateChaseCamera(cars[0].x, cars[0].y, cars[0].angle, cars[0].speed);
    updateSunPosition(cars[0].x * PX_TO_WORLD, cars[0].y * PX_TO_WORLD);
  }

  renderScene();
  updateHUD();

  const st = gameState.state;
  if (st === 'racing' || st === 'finishing') {
    drawMinimap();
  }

  overlayCtx.clearRect(0, 0, 1080, 1920);
  if (input.dragging && st !== 'paused') {
    const yOffset = input.pointerType === 'mouse' ? 0 : -220;
    drawSteeringWheel(overlayCtx, input.dragScreenX, input.dragScreenY + yOffset, input.steering, cars[0]?.speed || 0);
  }
}

// ── Game loop ───────────────────────────────────────────────────────────────

function gameLoop(timestamp) {
  requestAnimationFrame(gameLoop);

  if (lastTime === 0) {
    lastTime = timestamp;
    return;
  }

  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  input.update();

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    fixedUpdate();
    accumulator -= FIXED_DT;
  }

  renderFrame(dt);
}

// ── Boot ────────────────────────────────────────────────────────────────────

function boot() {
  const versionEl = document.getElementById('version-text');
  if (versionEl) versionEl.textContent = VERSION;

  setupButtons();
  showTitle();

  lastTime = 0;
  accumulator = 0;
  requestAnimationFrame(gameLoop);
}

boot();
