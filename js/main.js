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
} from './audio.js';
import { GOLD_REWARDS, addGold } from './currency.js';
import { initRenderer, render as renderScene, getScene, getCamera } from './renderer3d.js';
import { initChaseCamera, updateChaseCamera, triggerShake, resetChaseCamera } from './camera3d.js';
import { buildTrack as buildTrack3D, disposeTrack } from './track-builder.js';
import { buildCarModel, updateCarModel } from './car-models.js';

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

// ── Init renderer ───────────────────────────────────────────────────────────

initRenderer(canvas);
initAudio();

// ── Track setup ─────────────────────────────────────────────────────────────

function initTrack(seed) {
  // Dispose previous 3D geometry
  disposeTrack();

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

    // Build 3D model (all use style 0 for now, different colors)
    const model = buildCarModel(0, CAR_COLORS[i]);
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

// ── HUD (no-op placeholder for Task 9) ────────────────────────────────────

function updateHUD() {
  // Will be implemented in Task 9
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
      if (gold > 0) addGold(gold);

      // Finish the game state
      gameState.finish(null);
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

  // Update chase camera following player car
  if (cars[0]) {
    updateChaseCamera(cars[0].x, cars[0].y, cars[0].angle, cars[0].speed);
  }

  // Render the 3D scene
  renderScene();

  // Update HUD
  updateHUD();
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

// ── Start test race (skip menus for now) ────────────────────────────────────

function startTestRace() {
  initTrack(TRACK_SEEDS[0]);
  spawnCars();
  gameState.startCountdown();
  prevCountdown = COUNTDOWN_SECONDS;
  lastTime = 0;
  accumulator = 0;
  requestAnimationFrame(gameLoop);
}

startTestRace();
