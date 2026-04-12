// ── main.js — game loop wiring: 2D sim connected to 3D renderer ────────────

import { World, Vec2 } from '../physics2d/index.js';
import { GameState } from './game.js';
import { Input } from './input.js';
import {
  VERSION, FIXED_DT, NUM_CARS, NUM_LAPS, MAX_SPEED,
  TRACK_SEEDS, PX_TO_WORLD, RESPAWN_DELAY_SEC, AI_SKILLS,
  COUNTDOWN_SECONDS, TILE,
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
import { GOLD_REWARDS, addGold, getGold, getUnlockedCars, isCarUnlocked, unlockCar, UNLOCK_COST } from './currency.js';
import { initRenderer, render as renderScene, getScene, getCamera, updateSunPosition } from './renderer3d.js';
import { initChaseCamera, updateChaseCamera, triggerShake, resetChaseCamera } from './camera3d.js';
import { buildTrack as buildTrack3D, disposeTrack } from './track-builder.js';
import { buildCarModel, updateCarModel, CAR_STYLE_NAMES } from './car-models.js';
import { initEffects, updateEffects, updateSpeedLines, spawnSmoke, spawnSparks, addSkidmark, clearEffects } from './effects3d.js';
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
let cl = null;               // { lengths, total } from computeCenterLineLengths
let track = null;

// Respawn
let respawnTimer = 0;

// Previous countdown number — used to detect ticks for beep SFX
let prevCountdown = COUNTDOWN_SECONDS;

// Previous laps completed per car — for lap-change SFX
let prevLaps = [];

// Accumulator for fixed timestep
let accumulator = 0;
let lastTime = 0;

// Car colors
const CAR_COLORS = [0x2266dd, 0xdd3333, 0x33bb33, 0xddaa22];

// Minimap
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const MINIMAP_DOT_COLORS = ['#44f', '#f44', '#4f4', '#ff4'];

// UI state
let selectedStyle = 0;
let currentTrackIndex = 0;
let earnedGold = 0;
let finishShownTimeout = null;

// Best times persistence
const BEST_TIMES_KEY = 'mini-gt-3d:best-times';

function getBestTime(trackIndex) {
  try {
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const t = obj[trackIndex];
    return (typeof t === 'number' && t > 0) ? t : null;
  } catch (_) { return null; }
}

function saveBestTime(trackIndex, time) {
  try {
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const prev = obj[trackIndex];
    if (prev === undefined || prev === null || time < prev) {
      obj[trackIndex] = time;
      localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(obj));
      return true; // new record
    }
    return false;
  } catch (_) { return false; }
}

// ── Time formatting ─────────────────────────────────────────────────────────

function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const hundredths = Math.floor((totalSec % 1) * 100);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

// ── Screen management ───────────────────────────────────────────────────────

const SCREEN_IDS = ['screen-title', 'screen-carselect', 'screen-trackselect', 'screen-countdown', 'screen-respawn', 'screen-finished', 'screen-pause'];

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
  // Hide HUD when showing menu screens (not countdown/respawn)
  if (name === 'title' || name === 'carselect' || name === 'trackselect' || name === 'finished' || name === 'pause') {
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
  // Dispose previous 3D geometry and effects
  disposeTrack();
  disposeScenery();
  clearEffects();

  // Generate 2D track
  track = generateTrack(seed);
  centerLine = buildTrackPath(track);
  walls = buildWallPaths(centerLine);
  cl = computeCenterLineLengths(centerLine);

  // Create physics world (no gravity for top-down racing)
  world = new World({ gravity: new Vec2(0, 0), fixedDt: FIXED_DT });

  // Wire collision callback for car-wall interactions
  world.onCollision = (bodyA, bodyB, contact) => {
    const udA = bodyA.userData;
    const udB = bodyB.userData;
    if (!udA || !udB) return;

    let carBody = null;
    if (udA.type === 'car' && udB.type === 'wall') carBody = bodyA;
    else if (udB.type === 'car' && udA.type === 'wall') carBody = bodyB;

    if (carBody) {
      // Find the Car instance owning this body
      const car = cars.find(c => c.body === carBody);
      if (car) {
        const wasCrashed = car.crashed;
        car.onWallCollision(contact);
        // If this collision caused a crash (was not crashed before)
        if (!wasCrashed && car.crashed) {
          spawnSparks(car.x, car.y);
          if (car === cars[0]) {
            playCrash();
            hapticThump();
            triggerShake(0.4);
            respawnTimer = RESPAWN_DELAY_SEC;
          }
        } else if (!car.crashed) {
          // Glancing hit — bump sound
          playBumpSound();
        }
      }
    }
  };

  // Create wall physics bodies
  createWallBodies(world, walls);

  // Build 3D track
  buildTrack3D(getScene(), centerLine, track);

  // Build scenery (trees, etc.)
  buildScenery(getScene(), centerLine);
}

// ── Car spawning ────────────────────────────────────────────────────────────

function spawnCars() {
  const scene = getScene();

  // Remove old car models from scene
  for (const model of carModels) {
    if (model && model.parent) model.parent.remove(model);
  }
  cars = [];
  carModels = [];
  aiControllers = [];

  // Compute spawn positions at waypoint index 2 (start line)
  const spawnIdx = 2;
  const p = centerLine[spawnIdx];
  const pNext = centerLine[(spawnIdx + 1) % centerLine.length];

  // Track direction at spawn
  const dx = pNext.x - p.x;
  const dy = pNext.y - p.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const fwdX = dx / len;
  const fwdY = dy / len;

  // Perpendicular (left of forward)
  const perpX = -fwdY;
  const perpY = fwdX;

  // Visual angle: atan2(fwdX, -fwdY) gives the angle where 0 = north (-Y)
  const spawnAngle = Math.atan2(fwdX, -fwdY);

  // 2x2 grid: across offsets ±80px, along offsets 0 and -200px
  const acrossOffsets = [-80, 80];
  const alongOffsets = [0, -200];

  const spawnPositions = [];
  for (const along of alongOffsets) {
    for (const across of acrossOffsets) {
      spawnPositions.push({
        x: p.x + fwdX * along + perpX * across,
        y: p.y + fwdY * along + perpY * across,
      });
    }
  }

  // AI car styles — rotate through styles excluding the player's selected style
  const aiStyles = [];
  for (let s = 0; s < CAR_STYLE_NAMES.length; s++) {
    if (s !== selectedStyle) aiStyles.push(s);
  }

  // Create cars
  for (let i = 0; i < NUM_CARS; i++) {
    const car = new Car(world);
    car.spawn(spawnPositions[i].x, spawnPositions[i].y, spawnAngle);

    // Init race tracking fields on the car
    car.currentWaypointIdx = spawnIdx;
    car.lapsCompleted = 0;
    car.halfwayReached = false;
    car.seenLowerQuarter = false;
    car.bestLap = null;
    car.currentLapStartMs = 0;
    car.finished = false;

    cars.push(car);

    // Build 3D model — player uses selectedStyle, AI cars rotate through other styles
    const style = i === 0 ? selectedStyle : aiStyles[(i - 1) % aiStyles.length];
    const model = buildCarModel(style, CAR_COLORS[i]);
    model.castShadow = true;
    scene.add(model);
    carModels.push(model);
  }

  // Create AI controllers for cars 1-3
  for (let i = 0; i < AI_SKILLS.length; i++) {
    const ai = new AIController(cars[i + 1], walls, AI_SKILLS[i], cars);
    aiControllers.push(ai);
  }

  // Init Race tracker (finish line at waypoint 2)
  race = new Race(cars, centerLine, 2);

  // Previous laps tracking
  prevLaps = cars.map(() => 0);

  // Reset camera
  resetChaseCamera();
  initChaseCamera(getCamera());

  // Reset respawn
  respawnTimer = 0;
}

// ── Respawn ─────────────────────────────────────────────────────────────────

function respawnPlayer() {
  const car = cars[0];
  if (!car || !car.body) return;

  const idx = car.currentWaypointIdx;
  const pt = centerLine[idx];
  const nextPt = centerLine[(idx + 1) % centerLine.length];

  // Compute angle at this waypoint
  const dx = nextPt.x - pt.x;
  const dy = nextPt.y - pt.y;
  const angle = Math.atan2(dx, -dy); // visual angle

  // Teleport
  car.body.position.set(pt.x, pt.y);
  car.body.velocity.set(0, 0);
  car.body.angularVelocity = 0;
  // Convert visual angle to capsule convention
  car.body.angle = angle - Math.PI / 2;
  car.body._aabbDirty = true;
  car.speed = 0;
  car.crashed = false;
  car._bounceTimer = 0;
}

// ── HUD update ──────────────────────────────────────────────────────────────

function updateHUD() {
  const state = gameState.state;

  // Countdown number
  if (state === 'countdown') {
    const num = gameState.countdownNumber;
    const cdEl = document.getElementById('countdown-number');
    if (cdEl) {
      const text = num > 0 ? String(num) : 'GO!';
      if (cdEl.textContent !== text) {
        cdEl.textContent = text;
        // Re-trigger animation
        cdEl.style.animation = 'none';
        cdEl.offsetHeight; // force reflow
        cdEl.style.animation = '';
      }
    }
  }

  // Respawn overlay
  const respawnEl = document.getElementById('screen-respawn');
  if (respawnEl) {
    if (respawnTimer > 0 && (state === 'racing' || state === 'finishing')) {
      respawnEl.classList.remove('hidden');
    } else {
      respawnEl.classList.add('hidden');
    }
  }

  if (state === 'racing' || state === 'finishing') {
    // Lap
    const laps = Math.min((cars[0].lapsCompleted || 0) + 1, NUM_LAPS);
    const lapEl = document.getElementById('hud-lap');
    if (lapEl) lapEl.textContent = `LAP ${laps}/${NUM_LAPS}`;

    // Timer
    const timeEl = document.getElementById('hud-time');
    if (timeEl) timeEl.textContent = formatTime(gameState.raceTime);

    // Best time
    const bestEl = document.getElementById('hud-best');
    if (bestEl) {
      const best = getBestTime(currentTrackIndex);
      bestEl.textContent = best !== null ? `BEST ${formatTime(best)}` : 'BEST --:--.--';
    }

    // Speed (approximate km/h: speed * 0.36)
    const speedEl = document.getElementById('hud-speed');
    if (speedEl) {
      const kmh = Math.round(Math.abs(cars[0].speed) * 0.36);
      speedEl.textContent = `${kmh} km/h`;
    }

    // Position
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

// ── Car select ──────────────────────────────────────────────────────────────

function buildCarGrid() {
  const grid = document.getElementById('car-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < CAR_STYLE_NAMES.length; i++) {
    const card = document.createElement('div');
    card.className = 'car-card';
    const unlocked = isCarUnlocked(i);

    if (!unlocked) card.classList.add('locked');
    if (i === selectedStyle) card.classList.add('selected');

    let html = CAR_STYLE_NAMES[i];
    if (!unlocked) {
      html += `<div class="cost">🔒 ${UNLOCK_COST} GOLD</div>`;
    }
    card.innerHTML = html;

    card.addEventListener('click', () => {
      playClick();
      hapticTap();

      if (!isCarUnlocked(i)) {
        // Try to unlock
        if (unlockCar(i)) {
          // Successfully unlocked — refresh grid
          selectedStyle = i;
          buildCarGrid();
          updateGoldDisplay();
        }
        return;
      }
      // Select this car
      selectedStyle = i;
      showTrackSelect();
    });

    grid.appendChild(card);
  }
}

function updateGoldDisplay() {
  const el = document.getElementById('gold-amount');
  if (el) el.textContent = String(getGold());
}

function showCarSelect() {
  showScreen('carselect');
  buildCarGrid();
  updateGoldDisplay();
}

// ── Track select ────────────────────────────────────────────────────────────

function buildTrackGrid() {
  const grid = document.getElementById('track-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < TRACK_SEEDS.length; i++) {
    const card = document.createElement('div');
    card.className = 'track-card';

    const num = String(i + 1).padStart(2, '0');
    let html = `TRACK ${num}`;
    const best = getBestTime(i);
    if (best !== null) {
      html += `<div class="track-best">BEST ${formatTime(best)}</div>`;
    }
    card.innerHTML = html;

    card.addEventListener('click', () => {
      playClick();
      hapticTap();
      currentTrackIndex = i;
      startRace(TRACK_SEEDS[i]);
    });

    grid.appendChild(card);
  }
}

function showTrackSelect() {
  showScreen('trackselect');
  buildTrackGrid();
}

// ── Start race ──────────────────────────────────────────────────────────────

function startRace(seed) {
  if (finishShownTimeout) {
    clearTimeout(finishShownTimeout);
    finishShownTimeout = null;
  }
  earnedGold = 0;
  initTrack(seed);
  spawnCars();
  gameState.startCountdown();
  prevCountdown = COUNTDOWN_SECONDS;

  showScreen('countdown');
  showHUD();

  // Update best time display on HUD
  const bestEl = document.getElementById('hud-best');
  if (bestEl) {
    const best = getBestTime(currentTrackIndex);
    bestEl.textContent = best !== null ? `BEST ${formatTime(best)}` : 'BEST --:--.--';
  }

  lastTime = 0;
  accumulator = 0;
}

// ── Finish handling ─────────────────────────────────────────────────────────

function positionSuffix(pos) {
  if (pos === 1) return '1ST';
  if (pos === 2) return '2ND';
  if (pos === 3) return '3RD';
  return `${pos}TH`;
}

function showFinishScreen(position, gold) {
  const posEl = document.getElementById('finish-position');
  if (posEl) posEl.textContent = positionSuffix(position);

  const timeEl = document.getElementById('finish-time');
  if (timeEl) timeEl.textContent = `TIME: ${formatTime(gameState.raceTime)}`;

  const bestEl = document.getElementById('finish-best');
  if (bestEl) {
    const best = getBestTime(currentTrackIndex);
    bestEl.textContent = best !== null ? `BEST: ${formatTime(best)}` : '';
  }

  const goldEl = document.getElementById('finish-gold');
  if (goldEl) goldEl.textContent = gold > 0 ? `+${gold} GOLD` : '';

  showScreen('finished');
}

// ── Button handlers ─────────────────────────────────────────────────────────

function setupButtons() {
  // Title: RACE
  document.getElementById('btn-race').addEventListener('click', () => {
    playClick();
    hapticTap();
    showCarSelect();
  });

  // Track select: BACK
  document.getElementById('btn-back-car').addEventListener('click', () => {
    playClick();
    hapticTap();
    showCarSelect();
  });

  // HUD: Pause
  document.getElementById('btn-pause').addEventListener('click', () => {
    playClick();
    hapticTap();
    gameState.pause();
    showScreen('pause');
    updateToggles();
  });

  // Pause: Resume
  document.getElementById('btn-resume').addEventListener('click', () => {
    playClick();
    hapticTap();
    gameState.resume();
    showScreen(null);
    showHUD();
  });

  // Pause: Retry
  document.getElementById('btn-retry').addEventListener('click', () => {
    playClick();
    hapticTap();
    startRace(TRACK_SEEDS[currentTrackIndex]);
  });

  // Pause: Quit
  document.getElementById('btn-quit').addEventListener('click', () => {
    playClick();
    hapticTap();
    clearEffects();
    gameState.reset();
    showScreen('title');
  });

  // Finished: Next Race
  document.getElementById('btn-next').addEventListener('click', () => {
    playClick();
    hapticTap();
    currentTrackIndex = (currentTrackIndex + 1) % TRACK_SEEDS.length;
    startRace(TRACK_SEEDS[currentTrackIndex]);
  });

  // Finished: Menu
  document.getElementById('btn-menu').addEventListener('click', () => {
    playClick();
    hapticTap();
    clearEffects();
    gameState.reset();
    showScreen('title');
  });

  // SFX toggle
  document.getElementById('btn-sfx').addEventListener('click', () => {
    const newVal = !getSfxEnabled();
    setSfxEnabled(newVal);
    updateToggles();
    playClick();
    hapticTap();
  });

  // Haptics toggle
  document.getElementById('btn-haptics').addEventListener('click', () => {
    const newVal = !getHapticsEnabled();
    setHapticsEnabled(newVal);
    updateToggles();
    playClick();
    hapticTap();
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

    // Play beep on each countdown number change
    if (gameState.countdownNumber < prevNum && gameState.countdownNumber > 0) {
      playCountdownBeep();
    }

    // GO!
    if (done) {
      playGoBeep();
      showScreen(null);
      showHUD();
    }
    return;
  }

  if (state === 'racing' || state === 'finishing') {
    // Tick race timer
    gameState.tickRace();

    // Player input
    const playerSteering = input.steering;
    cars[0].update(playerSteering);

    // AI controllers
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
      aiCar.update(steering);
    }

    // Step physics (one fixed step, no accumulator — we manage our own)
    world.fixedStep(FIXED_DT);

    // Sync render positions (fixedStep doesn't do interpolation;
    // World.step() does, but we manage our own accumulator so we
    // copy position→renderPosition here for the Car getters).
    for (const body of world.bodies) {
      body.renderPosition.copy(body.position);
      body.renderAngle = body.angle;
    }

    // Post-physics update
    for (const car of cars) {
      car.postPhysicsUpdate();
    }

    // Advance waypoints
    for (const car of cars) {
      car.currentWaypointIdx = advanceWaypoint(
        car, car.currentWaypointIdx, centerLine
      );
    }

    // Update race (lap detection)
    race.update(gameState.raceTime);

    // Check for lap changes — play SFX
    for (let i = 0; i < cars.length; i++) {
      const laps = cars[i].lapsCompleted || 0;
      if (laps > prevLaps[i]) {
        if (i === 0) {
          // Player completed a lap
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

      // Calculate standings position for gold reward
      const standings = rankStandings(cars, (car) =>
        computeProgress(
          { x: car.physX, y: car.physY },
          car.currentWaypointIdx,
          centerLine, cl, car.lapsCompleted || 0
        )
      );
      const playerStanding = standings.find(s => s.idx === 0);
      const position = playerStanding ? playerStanding.position : 4;
      const gold = GOLD_REWARDS[position - 1] || 0;
      earnedGold = gold;
      if (gold > 0) addGold(gold);

      // Save best time
      const previousBest = getBestTime(currentTrackIndex);
      const isNew = saveBestTime(currentTrackIndex, gameState.raceTime);
      gameState.isNewRecord = isNew;

      // Finish the game state
      gameState.finish(previousBest);

      // Show finish screen after ~2 second delay
      finishShownTimeout = setTimeout(() => {
        showFinishScreen(position, earnedGold);
        finishShownTimeout = null;
      }, 2000);
    }

    // Handle respawn timer
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

  const w = minimapCanvas.width;   // 120
  const h = minimapCanvas.height;  // 120
  const pad = 10;

  minimapCtx.clearRect(0, 0, w, h);

  // Find track bounds
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

  // Draw track outline
  minimapCtx.beginPath();
  minimapCtx.moveTo(toMiniX(centerLine[0].x), toMiniY(centerLine[0].y));
  for (let i = 1; i < centerLine.length; i++) {
    minimapCtx.lineTo(toMiniX(centerLine[i].x), toMiniY(centerLine[i].y));
  }
  minimapCtx.closePath();
  minimapCtx.strokeStyle = '#666';
  minimapCtx.lineWidth = 3;
  minimapCtx.stroke();

  // Draw car dots (AI first so player is on top)
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

// ── Render frame ────────────────────────────────────────────────────────────

function renderFrame(dt) {
  // Update 3D car model positions from 2D car state
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const model = carModels[i];
    if (!car || !model) continue;

    const steering = i === 0 ? input.steering : 0;
    updateCarModel(model, car.x, car.y, car.angle, car.speed, steering, dt);
  }

  // Effects
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const steer = (i === 0) ? input.steering : 0;
    if (Math.abs(steer) > 0.5 && car.speed > MAX_SPEED * 0.3) {
      spawnSmoke(car.x, car.y, car.angle);
    }
    if (i === 0 && car.speed > 50) {
      addSkidmark(car.x, car.y, car.angle, steer);
    }
  }
  updateEffects(dt);
  updateSpeedLines(getCamera(), cars[0]?.speed || 0, dt);

  // Update chase camera following player car
  if (cars[0]) {
    updateChaseCamera(cars[0].x, cars[0].y, cars[0].angle, cars[0].speed);
    updateSunPosition(cars[0].x * PX_TO_WORLD, cars[0].y * PX_TO_WORLD);
  }

  // Render the 3D scene
  renderScene();

  // Update HUD
  updateHUD();

  // Minimap
  const st = gameState.state;
  if (st === 'racing' || st === 'finishing') {
    drawMinimap();
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
  // Set version text
  const versionEl = document.getElementById('version-text');
  if (versionEl) versionEl.textContent = VERSION;

  // Setup button handlers
  setupButtons();

  // Show title screen
  showScreen('title');

  // Start game loop (renders even on title for background scene)
  lastTime = 0;
  accumulator = 0;
  requestAnimationFrame(gameLoop);
}

boot();
