# MiniGT 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D arcade GT racing game by forking MiniGT's 2D simulation and replacing the visual layer with Three.js rendering, a chase camera, and HTML/CSS UI.

**Architecture:** The 2D game simulation (physics, AI, race logic, track generation) is the source of truth, kept from MiniGT largely unchanged. A new Three.js renderer reads car positions, track data, and game state each frame and draws the 3D scene. All UI (menus, HUD) is HTML/CSS overlaid on the Three.js canvas.

**Tech Stack:** Vanilla JS (ES modules), Three.js r128 (CDN), Physics2D engine, HTML/CSS for UI, Node.js dev server.

**Source game:** `/Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT`
**Target project:** `/Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D`

**Design spec:** `docs/superpowers/specs/2026-04-11-minigt3d-design.md`

---

## File Structure

### Files copied from MiniGT (unchanged or minor edits)
- `js/car.js` — 2D car physics (unchanged)
- `js/ai-controller.js` — AI ray-cast steering (unchanged)
- `js/race.js` — lap counting, ranking (unchanged)
- `js/track.js` — tile-based track generation (unchanged)
- `js/input.js` — drag-to-steer (minor: remove canvas ref from constructor, pass canvas later)
- `js/audio.js` — procedural SFX + haptics (update localStorage key prefix)
- `js/game.js` — state machine (unchanged)
- `js/currency.js` — gold/unlock system (update localStorage key prefix)
- `physics2d/` — entire engine directory (unchanged)

### Files forked with significant changes
- `js/main.js` — game loop rewritten: remove 2D canvas/renderer calls, wire up Three.js renderer, HTML UI event handlers, connect game state to 3D scene
- `js/constants.js` — new VERSION, new TRACK_SEEDS, adjusted road width, port number, new 3D-specific constants (camera offset, FOV, etc.)

### New files
- `index.html` — Three.js canvas + HTML UI overlay structure
- `css/ui.css` — all menu and HUD styling
- `js/renderer3d.js` — Three.js scene setup, lighting, per-frame render loop
- `js/camera3d.js` — chase cam behind player car
- `js/track-builder.js` — converts 2D tile centerline → 3D road mesh, walls, curbs, start line
- `js/car-models.js` — 6 procedural low-poly 3D car builders
- `js/effects3d.js` — tire smoke particles, skidmarks, crash sparks, speed lines, screen shake
- `js/scenery.js` — low-poly trees, extensible
- `meta.json` — platform metadata (slug: mini-gt-3d)
- `dev-server.js` — local dev server on port 8084
- `check-errors.js` — headless error checking
- `.zipignore` — deploy exclusions
- `CLAUDE.md` — project guidance

### Files NOT carried over (replaced by new modules)
- `js/renderer.js` → replaced by `js/renderer3d.js`
- `js/camera.js` → replaced by `js/camera3d.js`
- `js/effects.js` → replaced by `js/effects3d.js`
- `js/skidmarks.js` → folded into `js/effects3d.js`
- `js/car-styles.js` → replaced by `js/car-models.js`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `dev-server.js`, `check-errors.js`, `.zipignore`, `CLAUDE.md`, `meta.json`
- Copy: `physics2d/` directory, `js/car.js`, `js/ai-controller.js`, `js/race.js`, `js/track.js`, `js/game.js`, `js/input.js`, `js/audio.js`, `js/currency.js`, `js/constants.js`

- [ ] **Step 1: Copy Physics2D engine**

```bash
cp -r /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/physics2d /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/physics2d
```

- [ ] **Step 2: Copy unchanged game logic modules**

```bash
mkdir -p /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/car.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/ai-controller.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/race.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/track.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/game.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/input.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/audio.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/currency.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
cp /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT/js/constants.js /Users/nitzanwilnai/Programming/Claude/JSGames/MiniGT3D/js/
```

- [ ] **Step 3: Update constants.js**

Change VERSION, port reference, localStorage prefix. Add 3D-specific constants. Replace TRACK_SEEDS with placeholder (new seeds will be tuned later). Key changes:

```javascript
export const VERSION = 'v0.1.0';

// 3D Camera
export const CHASE_CAM_DISTANCE = 5;   // units behind car
export const CHASE_CAM_HEIGHT = 3;     // units above car
export const CHASE_CAM_LOOK_AHEAD = 2; // units ahead of car for look-at target
export const CHASE_CAM_LERP = 0.06;    // rotation smoothing factor
export const CHASE_CAM_FOV = 60;       // base FOV degrees
export const CHASE_CAM_FOV_SPEED_BONUS = 5; // FOV increase at max speed

// 3D Scale: convert 2D pixel coords to 3D world units
// MiniGT uses TILE=512px grid cells. In 3D, 1 tile = 1 unit would be too small.
// Use SCALE = 1/TILE so 1 tile = 1 world unit, then road width in world units.
export const PX_TO_WORLD = 1 / 100; // 100 pixels = 1 world unit
export const ROAD_HALF_WIDTH = 3;    // world units (half-width of road surface)
export const WALL_HEIGHT = 0.5;      // world units
export const WALL_BLOCK_LENGTH = 0.6; // world units per barrier block

// Track seeds — 10 tracks, 5 difficulty buckets of 2
// These will be tuned for 3D chase cam feel
export const TRACK_SEEDS = [
  3239390802, 1985302798,   // bucket 1 (easy)
  987654321, 123456789,     // bucket 2
  555888111, 777222333,     // bucket 3
  444999666, 111333555,     // bucket 4
  888111444, 222666999,     // bucket 5 (hard)
];
```

- [ ] **Step 4: Update audio.js localStorage key prefix**

Change `'mini-gt:audio'` to `'mini-gt-3d:audio'` in the settings getter/setter (if it uses one) or wherever localStorage keys are referenced.

- [ ] **Step 5: Update currency.js localStorage key prefix**

Change `GOLD_KEY` from `'mini-gt:gold'` to `'mini-gt-3d:gold'` and `UNLOCKED_KEY` from `'mini-gt:unlocked-cars'` to `'mini-gt-3d:unlocked-cars'`.

- [ ] **Step 6: Create dev-server.js**

```javascript
import { createServer } from 'http';
import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8084;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' });
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/__log_error') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const line = `[${new Date().toISOString()}] ${body}\n`;
      appendFileSync(join(__dirname, 'error.log'), line);
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
    });
    return;
  }
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const file = join(__dirname, url);
  if (!existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const ext = extname(file);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`MiniGT 3D dev server: http://localhost:${PORT}`));
```

- [ ] **Step 7: Create check-errors.js**

```javascript
const puppeteer = require('/usr/local/lib/node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8084', { waitUntil: 'networkidle0', timeout: 10000 });
  await new Promise(r => setTimeout(r, 3000));
  if (errors.length === 0) {
    console.log('NO ERRORS - Game loaded successfully');
  } else {
    console.log('ERRORS FOUND:');
    errors.forEach(e => console.log('  ' + e));
  }
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
```

- [ ] **Step 8: Create .zipignore**

```
.git/*
.superpowers/*
docs/*
tests/*
error.log
dev-server.js
check-errors.js
screenshot.js
screenshot-*.png
ss-*.png
thumb-*.png
CLAUDE.md
.zipignore
```

- [ ] **Step 9: Create meta.json**

```json
{
  "slug": "mini-gt-3d",
  "title": "Mini GT 3D",
  "description": "3D arcade GT racing. Battle 3 AI opponents over 3 laps in low-poly 3D.",
  "tags": ["racing", "arcade", "3d", "gt"],
  "author": "Nitzan Wilnai",
  "thumbnail": "thumbnail.png"
}
```

- [ ] **Step 10: Create CLAUDE.md**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

**Mini GT 3D** — a 3D arcade GT racing game. 4 cars (player + 3 AI), 3 laps, across 10 tracks grouped into 5 difficulty buckets. Built with Three.js for 3D rendering on top of a 2D physics simulation using the Physics2D engine. Forked from MiniGT (2D version). Target platform: play.nitzan.games.

## Development

- `node dev-server.js` — starts dev server on port 8084
- `node check-errors.js` — runs headless Chrome to check for JS errors
- No build step or package manager required. ES modules throughout.
- Three.js loaded from CDN via script tag.

## Architecture

2D game simulation is the source of truth. Three.js renderer is a pure view layer.

### Key Files
- `js/main.js` — entry point, game loop, state coordination
- `js/constants.js` — all tuning values including `VERSION`
- `js/renderer3d.js` — Three.js scene setup, lighting, per-frame render
- `js/camera3d.js` — chase cam behind player car
- `js/track-builder.js` — converts 2D tile data into 3D geometry
- `js/car-models.js` — 6 procedural low-poly 3D car builders
- `js/effects3d.js` — particles, skidmarks, sparks, speed lines
- `js/scenery.js` — trees and environment objects
- `js/car.js` — 2D car physics (from MiniGT)
- `js/ai-controller.js` — ray-cast AI (from MiniGT)
- `js/race.js` — lap counting, ranking (from MiniGT)
- `js/track.js` — tile-based track generation (from MiniGT)
- `js/input.js` — drag-to-steer pointer handling
- `js/audio.js` — procedural SFX + haptics
- `js/game.js` — state machine
- `js/currency.js` — gold/unlock system
- `physics2d/` — physics engine

### Race flow
title → carselect → trackselect → countdown → racing → finished

### Coordinate mapping
2D simulation uses pixel coordinates (TILE=512px grid). 3D world uses:
- x3d = x2d * PX_TO_WORLD
- z3d = y2d * PX_TO_WORLD (2D Y maps to 3D Z)
- y3d = 0 (flat ground)
- rotation: car3d.rotation.y = -(car2d.angle)
```

- [ ] **Step 11: Commit scaffolding**

```bash
git add -A
git commit -m "scaffold: copy MiniGT game logic and create project files"
```

---

## Task 2: Minimal index.html + Three.js Scene

**Files:**
- Create: `index.html`, `css/ui.css`, `js/renderer3d.js`

- [ ] **Step 1: Create css/ui.css with base styles**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  background: #000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}

#game-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

#ui {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
}

#ui > * {
  pointer-events: auto;
}

.hidden { display: none !important; }

#err {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: #a00;
  color: #fff;
  font: 12px monospace;
  padding: 4px 8px;
  display: none;
  z-index: 9999;
}
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Mini GT 3D</title>
  <link rel="stylesheet" href="css/ui.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <div id="ui"></div>
  <div id="err"></div>
  <script>
    window.onerror = function(msg, src, line, col, err) {
      const el = document.getElementById('err');
      el.style.display = 'block';
      el.textContent = msg;
      fetch('/__log_error', { method: 'POST', body: msg + ' at ' + src + ':' + line });
    };
    window.addEventListener('unhandledrejection', function(e) {
      const el = document.getElementById('err');
      el.style.display = 'block';
      el.textContent = e.reason;
      fetch('/__log_error', { method: 'POST', body: String(e.reason) });
    });
  </script>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create js/renderer3d.js with minimal scene**

```javascript
import { CHASE_CAM_FOV } from './constants.js';

let renderer, scene, camera;
let groundMesh;

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x87ceeb); // sky blue
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

  camera = new THREE.PerspectiveCamera(CHASE_CAM_FOV, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);

  // Lighting
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(10, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  scene.add(new THREE.AmbientLight(0x6688aa, 0.5));

  // Ground plane
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshLambertMaterial({ color: 0x4a9e4a })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Maintain portrait aspect ratio 9:16
  const targetAspect = 9 / 16;
  let canvasW, canvasH;
  if (w / h > targetAspect) {
    canvasH = h;
    canvasW = h * targetAspect;
  } else {
    canvasW = w;
    canvasH = w / targetAspect;
  }
  renderer.setSize(canvasW, canvasH, false);
  renderer.domElement.style.width = canvasW + 'px';
  renderer.domElement.style.height = canvasH + 'px';
  camera.aspect = canvasW / canvasH;
  camera.updateProjectionMatrix();
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }

export function render() {
  renderer.render(scene, camera);
}
```

- [ ] **Step 4: Create a temporary minimal main.js to verify setup**

```javascript
import { initRenderer, render } from './renderer3d.js';

const canvas = document.getElementById('game-canvas');
initRenderer(canvas);

function loop() {
  requestAnimationFrame(loop);
  render();
}
loop();
```

- [ ] **Step 5: Start dev server and verify green ground + sky renders**

```bash
node dev-server.js &
```

Open http://localhost:8084 in browser. Verify: sky blue background, green ground plane visible, no console errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: minimal Three.js scene with ground plane and sky"
```

---

## Task 3: Track Builder — Road Mesh

**Files:**
- Create: `js/track-builder.js`

This converts the 2D centerline (array of {x, y} pixel coordinates) into a 3D road surface mesh.

- [ ] **Step 1: Create js/track-builder.js with road mesh generation**

```javascript
import { PX_TO_WORLD, ROAD_HALF_WIDTH, WALL_HEIGHT, WALL_BLOCK_LENGTH } from './constants.js';

let trackGroup = null;

/**
 * Build 3D track geometry from 2D centerline and track data.
 * @param {THREE.Scene} scene
 * @param {{x:number, y:number}[]} centerLine - 2D pixel waypoints
 * @param {object} track - track object from track.js
 * @returns {THREE.Group}
 */
export function buildTrack(scene, centerLine, track) {
  // Remove previous track if any
  if (trackGroup) {
    scene.remove(trackGroup);
    trackGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  trackGroup = new THREE.Group();

  buildRoadSurface(trackGroup, centerLine);
  buildCenterLine(trackGroup, centerLine);
  buildWalls(trackGroup, centerLine);
  buildStartFinishLine(trackGroup, centerLine);

  scene.add(trackGroup);
  return trackGroup;
}

function toWorld(px, py) {
  return { x: px * PX_TO_WORLD, z: py * PX_TO_WORLD };
}

function buildRoadSurface(group, centerLine) {
  const n = centerLine.length;
  const verts = [];
  const indices = [];

  for (let i = 0; i < n; i++) {
    const curr = toWorld(centerLine[i].x, centerLine[i].y);
    const next = toWorld(centerLine[(i + 1) % n].x, centerLine[(i + 1) % n].y);

    // Direction vector
    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    // Perpendicular (left-hand normal for road width)
    const nx = -dz / len;
    const nz = dx / len;

    // Left and right edge vertices
    verts.push(
      curr.x + nx * ROAD_HALF_WIDTH, 0.01, curr.z + nz * ROAD_HALF_WIDTH, // left
      curr.x - nx * ROAD_HALF_WIDTH, 0.01, curr.z - nz * ROAD_HALF_WIDTH  // right
    );

    // Two triangles per quad segment
    if (i < n - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  // Close the loop: last segment connects back to first
  const last = (n - 1) * 2;
  indices.push(last, 0, last + 1);
  indices.push(last + 1, 0, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildCenterLine(group, centerLine) {
  const n = centerLine.length;
  const dashLen = 0.8;
  const gapLen = 0.8;
  const dashWidth = 0.08;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

  let accumulated = 0;
  let drawing = true;

  for (let i = 0; i < n; i++) {
    const curr = toWorld(centerLine[i].x, centerLine[i].y);
    const next = toWorld(centerLine[(i + 1) % n].x, centerLine[(i + 1) % n].y);

    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);

    accumulated += segLen;

    if (drawing && accumulated >= dashLen) {
      // Place a dash at this position
      const angle = Math.atan2(dx, dz);
      const geo = new THREE.PlaneGeometry(dashWidth, dashLen);
      const mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -angle;
      mesh.position.set(curr.x, 0.02, curr.z);
      group.add(mesh);

      accumulated = 0;
      drawing = false;
    } else if (!drawing && accumulated >= gapLen) {
      accumulated = 0;
      drawing = true;
    }
  }
}

function buildWalls(group, centerLine) {
  const n = centerLine.length;
  const redMat = new THREE.MeshLambertMaterial({ color: 0xee3333 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  let accumulated = 0;
  let blockIndex = 0;

  for (let i = 0; i < n; i++) {
    const curr = toWorld(centerLine[i].x, centerLine[i].y);
    const next = toWorld(centerLine[(i + 1) % n].x, centerLine[(i + 1) % n].y);

    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / (segLen || 1);
    const dirZ = dz / (segLen || 1);

    // Perpendicular
    const nx = -dirZ;
    const nz = dirX;

    accumulated += segLen;

    if (accumulated >= WALL_BLOCK_LENGTH) {
      accumulated = 0;
      const mat = (blockIndex % 2 === 0) ? redMat : whiteMat;
      const geo = new THREE.BoxGeometry(0.3, WALL_HEIGHT, WALL_BLOCK_LENGTH * 0.95);
      const angle = Math.atan2(dx, dz);

      // Left wall
      const leftWall = new THREE.Mesh(geo, mat);
      leftWall.position.set(
        curr.x + nx * (ROAD_HALF_WIDTH + 0.15),
        WALL_HEIGHT / 2,
        curr.z + nz * (ROAD_HALF_WIDTH + 0.15)
      );
      leftWall.rotation.y = angle;
      leftWall.castShadow = true;
      group.add(leftWall);

      // Right wall
      const rightWall = new THREE.Mesh(geo, mat);
      rightWall.position.set(
        curr.x - nx * (ROAD_HALF_WIDTH + 0.15),
        WALL_HEIGHT / 2,
        curr.z - nz * (ROAD_HALF_WIDTH + 0.15)
      );
      rightWall.rotation.y = angle;
      rightWall.castShadow = true;
      group.add(rightWall);

      blockIndex++;
    }
  }
}

function buildStartFinishLine(group, centerLine) {
  // Start/finish at waypoint index 2 (exit of start tile)
  const idx = Math.min(2, centerLine.length - 1);
  const p = toWorld(centerLine[idx].x, centerLine[idx].y);
  const next = toWorld(centerLine[(idx + 1) % centerLine.length].x, centerLine[(idx + 1) % centerLine.length].y);

  const dx = next.x - p.x;
  const dz = next.z - p.z;
  const angle = Math.atan2(dx, dz);

  // Checkerboard pattern — 8x2 grid of small quads
  const cellSize = ROAD_HALF_WIDTH * 2 / 8;
  const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 2; row++) {
      const mat = ((col + row) % 2 === 0) ? blackMat : whiteMat;
      const geo = new THREE.PlaneGeometry(cellSize, cellSize);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;

      // Local offset from center of finish line
      const localX = (col - 3.5) * cellSize;
      const localZ = (row - 0.5) * cellSize;

      // Rotate into track direction
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      mesh.position.set(
        p.x + localX * cosA - localZ * sinA,
        0.025,
        p.z + localX * sinA + localZ * cosA
      );
      mesh.rotation.z = -angle;
      group.add(mesh);
    }
  }
}

export function disposeTrack() {
  if (trackGroup) {
    trackGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    trackGroup.parent?.remove(trackGroup);
    trackGroup = null;
  }
}
```

- [ ] **Step 2: Test by generating a track and rendering it**

Temporarily modify main.js to generate a track and call buildTrack:

```javascript
import { initRenderer, render, getScene, getCamera } from './renderer3d.js';
import { generateTrack, buildTrackPath } from './track.js';
import { buildTrack as buildTrack3D } from './track-builder.js';
import { TRACK_SEEDS, PX_TO_WORLD } from './constants.js';

const canvas = document.getElementById('game-canvas');
initRenderer(canvas);

const track = generateTrack(TRACK_SEEDS[0]);
const centerLine = buildTrackPath(track);

buildTrack3D(getScene(), centerLine, track);

// Position camera above track center
const mid = centerLine[Math.floor(centerLine.length / 2)];
const cam = getCamera();
cam.position.set(mid.x * PX_TO_WORLD, 30, mid.y * PX_TO_WORLD);
cam.lookAt(mid.x * PX_TO_WORLD, 0, mid.y * PX_TO_WORLD);

function loop() {
  requestAnimationFrame(loop);
  render();
}
loop();
```

Open browser, verify: grey road surface on green ground, red/white walls along edges, checkered start line, dashed center line. Track should form a closed loop.

- [ ] **Step 3: Iterate on visual quality**

Adjust ROAD_HALF_WIDTH, WALL_BLOCK_LENGTH, wall spacing in constants.js until the track looks good from above. The values will be refined further once the chase cam is working.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: track builder converts 2D centerline to 3D road, walls, and start line"
```

---

## Task 4: Chase Camera

**Files:**
- Create: `js/camera3d.js`

- [ ] **Step 1: Create js/camera3d.js**

```javascript
import {
  CHASE_CAM_DISTANCE, CHASE_CAM_HEIGHT, CHASE_CAM_LOOK_AHEAD,
  CHASE_CAM_LERP, CHASE_CAM_FOV, CHASE_CAM_FOV_SPEED_BONUS,
  PX_TO_WORLD, MAX_SPEED
} from './constants.js';

let camera = null;
let currentAngle = 0;
let shakeX = 0, shakeY = 0, shakeZ = 0;
let shakeIntensity = 0;
const SHAKE_DECAY = 0.9;

export function initChaseCamera(cam) {
  camera = cam;
  camera.fov = CHASE_CAM_FOV;
  camera.updateProjectionMatrix();
  currentAngle = 0;
  shakeIntensity = 0;
}

/**
 * Update chase camera to follow a car.
 * @param {number} x2d - car x position in 2D pixels
 * @param {number} y2d - car y position in 2D pixels
 * @param {number} angle - car visual angle in radians (0 = north/-Y)
 * @param {number} speed - car speed in px/s
 */
export function updateChaseCamera(x2d, y2d, angle, speed) {
  if (!camera) return;

  // Convert 2D to 3D world coords
  const wx = x2d * PX_TO_WORLD;
  const wz = y2d * PX_TO_WORLD;

  // Smooth angle tracking
  // Handle angle wrapping
  let angleDiff = angle - currentAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  currentAngle += angleDiff * CHASE_CAM_LERP;

  // Car forward direction in 3D (2D angle 0 = -Y = -Z in 3D)
  const fwdX = -Math.sin(currentAngle);
  const fwdZ = -Math.cos(currentAngle);

  // Camera position: behind and above the car
  camera.position.set(
    wx - fwdX * CHASE_CAM_DISTANCE + shakeX,
    CHASE_CAM_HEIGHT + shakeY,
    wz - fwdZ * CHASE_CAM_DISTANCE + shakeZ
  );

  // Look at point ahead of car
  camera.lookAt(
    wx + fwdX * CHASE_CAM_LOOK_AHEAD,
    0.5,
    wz + fwdZ * CHASE_CAM_LOOK_AHEAD
  );

  // Speed-based FOV
  const speedRatio = Math.min(speed / MAX_SPEED, 1);
  camera.fov = CHASE_CAM_FOV + speedRatio * CHASE_CAM_FOV_SPEED_BONUS;
  camera.updateProjectionMatrix();

  // Decay shake
  if (shakeIntensity > 0.01) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity * 0.5;
    shakeZ = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= SHAKE_DECAY;
  } else {
    shakeX = shakeY = shakeZ = 0;
    shakeIntensity = 0;
  }
}

export function triggerShake(intensity = 0.3) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

export function resetChaseCamera() {
  currentAngle = 0;
  shakeIntensity = 0;
  shakeX = shakeY = shakeZ = 0;
}
```

- [ ] **Step 2: Test chase camera with a dummy moving car**

Update temporary main.js: generate a track, place a "car" that moves along the centerline, and follow with chase cam. Verify: camera smoothly follows the car around the track, road ahead is visible, no jittering on turns.

- [ ] **Step 3: Commit**

```bash
git add js/camera3d.js
git commit -m "feat: chase camera with smooth follow, FOV scaling, and screen shake"
```

---

## Task 5: Car Models

**Files:**
- Create: `js/car-models.js`

- [ ] **Step 1: Create js/car-models.js with all 6 car style builders**

Each function returns a `THREE.Group`. Cars are built pointing along -Z (forward), centered at origin. Body color is passed as a parameter. Wheels are stored in the group's `userData.wheels` array for spin animation.

```javascript
/**
 * Procedural low-poly 3D car models for MiniGT 3D.
 * Each builder returns a THREE.Group centered at origin, facing -Z.
 * Group userData.wheels = THREE.Mesh[] for spin animation.
 */

const CAR_BUILDERS = [
  buildGT3Classic,
  buildMuscleGT,
  buildRallyGT,
  buildLMP,
  buildJDMStreet,
  buildRetroGT,
];

export const CAR_STYLE_NAMES = [
  'GT3 Classic', 'Muscle GT', 'Rally GT', 'LMP', 'JDM Street', 'Retro GT'
];

/**
 * Build a 3D car model.
 * @param {number} styleIndex - 0-5
 * @param {number} color - hex color for body (e.g., 0x2266dd)
 * @returns {THREE.Group}
 */
export function buildCarModel(styleIndex, color) {
  return CAR_BUILDERS[styleIndex](color);
}

function makeWheel(x, y, z) {
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  );
  tire.rotation.z = Math.PI / 2;
  tire.position.set(x, y, z);
  return tire;
}

function addWheels(group, halfW, wheelY, frontZ, rearZ) {
  const wheels = [];
  for (const x of [-halfW, halfW]) {
    for (const z of [frontZ, rearZ]) {
      const w = makeWheel(x, wheelY, z);
      group.add(w);
      wheels.push(w);
    }
  }
  group.userData.wheels = wheels;
}

// --- GT3 Classic: Porsche 911 inspired ---
function buildGT3Classic(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbff });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 2.4), mat);
  body.position.y = 0.35;
  body.castShadow = true;
  group.add(body);

  // Rear haunches (wider rear)
  const haunchL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.9), mat);
  haunchL.position.set(-0.75, 0.33, 0.5);
  group.add(haunchL);
  const haunchR = haunchL.clone();
  haunchR.position.x = 0.75;
  group.add(haunchR);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), glassMat);
  cabin.position.set(0, 0.6, 0.1);
  group.add(cabin);

  // Ducktail spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), mat);
  spoiler.position.set(0, 0.55, 1.0);
  group.add(spoiler);

  // Headlights (round-ish)
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffcc });
  for (const x of [-0.4, 0.4]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), lightMat);
    light.position.set(x, 0.38, -1.2);
    group.add(light);
  }

  addWheels(group, 0.65, 0.18, -0.75, 0.75);
  return group;
}

// --- Muscle GT: Mustang/Camaro ---
function buildMuscleGT(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbff });

  // Wide body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.6), mat);
  body.position.y = 0.32;
  body.castShadow = true;
  group.add(body);

  // Hood scoop
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.5), mat);
  scoop.position.set(0, 0.55, -0.5);
  group.add(scoop);

  // Cabin (set back)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.9), glassMat);
  cabin.position.set(0, 0.56, 0.3);
  group.add(cabin);

  // Racing stripe
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 2.6), stripeMat);
  stripe.position.set(0, 0.51, 0);
  group.add(stripe);

  // Rectangular headlights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffcc });
  for (const x of [-0.5, 0.5]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.05), lightMat);
    light.position.set(x, 0.35, -1.3);
    group.add(light);
  }

  addWheels(group, 0.72, 0.18, -0.8, 0.8);
  return group;
}

// --- Rally GT: WRX/Group-B ---
function buildRallyGT(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbff });

  // Boxy body (taller)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 2.3), mat);
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  // Flared fenders
  for (const x of [-0.75, 0.75]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.6), mat);
    fender.position.set(x, 0.38, -0.6);
    group.add(fender);
    const rFender = fender.clone();
    rFender.position.z = 0.6;
    group.add(rFender);
  }

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.9), glassMat);
  cabin.position.set(0, 0.7, 0.05);
  group.add(cabin);

  // Roof scoop
  const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.25), mat);
  roofScoop.position.set(0, 0.88, -0.2);
  group.add(roofScoop);

  // Tall rear wing with endplates
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.25), wingMat);
  wing.position.set(0, 0.9, 1.0);
  group.add(wing);
  for (const x of [-0.6, 0.6]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.25), wingMat);
    endplate.position.set(x, 0.82, 1.0);
    group.add(endplate);
  }

  // Fog lights
  const fogMat = new THREE.MeshLambertMaterial({ color: 0xffff88 });
  for (const x of [-0.4, 0.4]) {
    const fog = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), fogMat);
    fog.position.set(x, 0.28, -1.15);
    group.add(fog);
  }

  addWheels(group, 0.68, 0.2, -0.7, 0.7);
  return group;
}

// --- LMP: Le Mans Prototype ---
function buildLMP(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbff, transparent: true, opacity: 0.7 });

  // Long flat body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 3.0), mat);
  body.position.y = 0.28;
  body.castShadow = true;
  group.add(body);

  // Narrow canopy cockpit
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.6), glassMat);
  canopy.position.set(0, 0.5, 0.1);
  group.add(canopy);

  // Front splitter
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.2), mat);
  splitter.position.set(0, 0.15, -1.5);
  group.add(splitter);

  // Huge rear wing on stanchions
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.3), wingMat);
  wing.position.set(0, 0.8, 1.3);
  group.add(wing);
  for (const x of [-0.5, 0.5]) {
    const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.06), wingMat);
    stanchion.position.set(x, 0.55, 1.3);
    group.add(stanchion);
  }

  addWheels(group, 0.72, 0.16, -0.95, 0.95);
  return group;
}

// --- JDM Street: GT-R/Supra ---
function buildJDMStreet(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbff });

  // Compact body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 2.2), mat);
  body.position.y = 0.32;
  body.castShadow = true;
  group.add(body);

  // Hood crease
  const crease = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.8), mat);
  crease.position.set(0, 0.52, -0.4);
  group.add(crease);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 0.85), glassMat);
  cabin.position.set(0, 0.56, 0.15);
  group.add(cabin);

  // Rear lip spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.15), mat);
  spoiler.position.set(0, 0.52, 1.05);
  group.add(spoiler);

  // LED slit headlights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const x of [-0.45, 0.45]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), lightMat);
    led.position.set(x, 0.38, -1.1);
    group.add(led);
  }

  // High rear wing
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.2), wingMat);
  wing.position.set(0, 0.7, 1.0);
  group.add(wing);
  for (const x of [-0.5, 0.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), wingMat);
    post.position.set(x, 0.6, 1.0);
    group.add(post);
  }

  addWheels(group, 0.65, 0.18, -0.7, 0.7);
  return group;
}

// --- Retro GT: 250 GTO / BMW 3.0 CSL ---
function buildRetroGT(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbff });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });

  // Rounded body (elongated hood)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.35, 2.5), mat);
  body.position.y = 0.35;
  body.castShadow = true;
  group.add(body);

  // Rounded nose (narrower front)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.4), mat);
  nose.position.set(0, 0.32, -1.2);
  group.add(nose);

  // Cabin (fastback style, set back)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.8), glassMat);
  cabin.position.set(0, 0.58, 0.3);
  group.add(cabin);

  // Oval grille
  const grille = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.04, 8),
    chromeMat
  );
  grille.rotation.x = Math.PI / 2;
  grille.position.set(0, 0.3, -1.4);
  group.add(grille);

  // Chrome bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), chromeMat);
  frontBumper.position.set(0, 0.2, -1.25);
  group.add(frontBumper);

  // Subtle trunk spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.1), mat);
  spoiler.position.set(0, 0.54, 1.15);
  group.add(spoiler);

  // Round headlights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffcc });
  for (const x of [-0.35, 0.35]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), lightMat);
    light.position.set(x, 0.35, -1.35);
    group.add(light);
  }

  addWheels(group, 0.62, 0.18, -0.8, 0.8);
  return group;
}

/**
 * Update car model position/rotation from 2D sim state.
 * @param {THREE.Group} model - car 3D model
 * @param {number} x2d - 2D x position (pixels)
 * @param {number} y2d - 2D y position (pixels)
 * @param {number} angle - 2D visual angle (0 = north/-Y)
 * @param {number} speed - car speed (px/s)
 * @param {number} steering - steering input [-1, 1]
 * @param {number} dt - frame delta time (seconds)
 */
export function updateCarModel(model, x2d, y2d, angle, speed, steering, dt) {
  model.position.x = x2d * PX_TO_WORLD;
  model.position.z = y2d * PX_TO_WORLD;
  model.position.y = 0;
  model.rotation.y = -angle;

  // Cosmetic body roll on turns (~3 degrees max)
  model.rotation.z = steering * 0.05;

  // Spin wheels
  if (model.userData.wheels) {
    const spinSpeed = speed * PX_TO_WORLD * dt * 10;
    for (const wheel of model.userData.wheels) {
      wheel.rotation.x += spinSpeed;
    }
  }
}

import { PX_TO_WORLD } from './constants.js';
```

Note: The `import { PX_TO_WORLD }` at the bottom should be moved to the top with the other imports. The final file should have all imports at the top.

- [ ] **Step 2: Verify models visually**

Update temp main.js to display all 6 car models side by side on the ground plane. Check each model looks distinct and recognizable. Adjust geometry dimensions as needed.

- [ ] **Step 3: Commit**

```bash
git add js/car-models.js
git commit -m "feat: 6 procedural low-poly car models (GT3, Muscle, Rally, LMP, JDM, Retro)"
```

---

## Task 6: Wire Up Game Loop

**Files:**
- Create: `js/main.js` (full rewrite from MiniGT's main.js)

This is the core wiring — connecting the 2D simulation to the 3D renderer and HTML UI. This task creates the main.js that runs the full game loop.

- [ ] **Step 1: Write js/main.js**

This is the largest single file. It follows MiniGT's main.js structure (gameLoop → fixedUpdate → render) but replaces all 2D rendering calls with 3D renderer updates.

```javascript
import { World, Vec2, Body } from '../physics2d/index.js';
import { GameState } from './game.js';
import { Input } from './input.js';
import {
  VERSION, GAME_W, GAME_H, FIXED_DT, NUM_CARS, NUM_LAPS,
  MAX_SPEED, ACCELERATION, TURN_RATE, TURN_SPEED_PENALTY,
  CAR_W, CAR_H, CAR_MASS, CAR_RESTITUTION, CAR_FRICTION,
  LINEAR_DAMPING, CRASH_IMPACT_THRESHOLD, COUNTDOWN_SECONDS,
  RESPAWN_DELAY_SEC, TILE, TRACK_SEEDS, PX_TO_WORLD,
  AI_SKILLS
} from './constants.js';
import { Car } from './car.js';
import { generateTrack, buildTrackPath, buildWallPaths, createWallBodies } from './track.js';
import { Race, computeCenterLineLengths, rankStandings, advanceWaypoint, computeProgress } from './race.js';
import { AIController } from './ai-controller.js';
import { initAudio, playCountdownBeep, playGoBeep, playCrash, playLapFinish, playLapBoundary, playClick, playBumpSound, hapticTap, hapticThump } from './audio.js';
import { GOLD_REWARDS, addGold, getGold, getUnlockedCars, isCarUnlocked, unlockCar, UNLOCK_COST } from './currency.js';

import { initRenderer, render as renderScene, getScene, getCamera } from './renderer3d.js';
import { initChaseCamera, updateChaseCamera, triggerShake, resetChaseCamera } from './camera3d.js';
import { buildTrack as buildTrack3D, disposeTrack } from './track-builder.js';
import { buildCarModel, updateCarModel, CAR_STYLE_NAMES } from './car-models.js';

// ---- Initialization ----
const canvas = document.getElementById('game-canvas');
const input = new Input(canvas);

initRenderer(canvas);
initChaseCamera(getCamera());

const gameState = new GameState();
let world = null;
let cars = [];
let carModels = [];
let race = null;
let aiControllers = [];
let track = null;
let centerLine = null;
let walls = null;
let wallBodies = [];
let currentTrackIndex = 0;
let currentSeed = TRACK_SEEDS[0];
let carFinishTimes = [];
let earnedGold = 0;
let respawnTimer = 0;
let waypointIndices = [];
let selectedStyle = 0;
let selectedHue = 210; // default blue

// Car colors for the 4 racers
const CAR_COLORS = [0x2266dd, 0xdd3333, 0x33bb33, 0xddaa22];

// ---- Game Loop ----
let lastTime = 0;
let accumulator = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  input.update();

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    fixedUpdate();
    accumulator -= FIXED_DT;
  }

  renderFrame(dt);
}

function fixedUpdate() {
  const state = gameState.state;

  if (state === 'countdown') {
    if (gameState.tickCountdown()) {
      // Countdown finished — GO
      playGoBeep();
    } else if (gameState.countdownNumber >= 1) {
      // Beep on each second
    }
  }

  if (state === 'racing' || state === 'finishing') {
    gameState.tickRace();

    // Player input
    if (state === 'racing' && !cars[0].crashed && !cars[0].finished) {
      cars[0].update(input.steering);
    }

    // AI
    const playerProgress = race ? computeProgress(
      { x: cars[0].physX, y: cars[0].physY },
      waypointIndices[0], centerLine, race._cl, cars[0].lapsCompleted
    ) : 0;

    for (let i = 1; i < NUM_CARS; i++) {
      if (cars[i].finished) continue;
      const aiProgress = race ? computeProgress(
        { x: cars[i].physX, y: cars[i].physY },
        waypointIndices[i], centerLine, race._cl, cars[i].lapsCompleted
      ) : 0;
      const steering = aiControllers[i].tick(playerProgress, aiProgress);
      cars[i].update(steering);
    }

    // Physics step
    world.step();

    // Post-physics
    for (let i = 0; i < NUM_CARS; i++) {
      cars[i].postPhysicsUpdate();
      waypointIndices[i] = advanceWaypoint(
        { x: cars[i].physX, y: cars[i].physY },
        waypointIndices[i], centerLine
      );
    }

    // Lap detection
    if (race) {
      race.update(gameState.raceTime);

      // Check for race end (player)
      if (cars[0].lapsCompleted >= NUM_LAPS && !cars[0].finished) {
        cars[0].finished = true;
        carFinishTimes[0] = gameState.raceTime;
        const standings = rankStandings(cars, (car, idx) =>
          computeProgress({ x: car.physX, y: car.physY },
            waypointIndices[idx], centerLine, race._cl, car.lapsCompleted)
        );
        const pos = standings.findIndex(s => s.idx === 0) + 1;
        earnedGold = GOLD_REWARDS[pos - 1] || 0;
        addGold(earnedGold);
        gameState.state = 'finishing';
      }
    }

    // Respawn timer
    if (respawnTimer > 0) {
      respawnTimer -= FIXED_DT;
      if (respawnTimer <= 0) {
        respawnPlayer();
      }
    }
  }
}

function renderFrame(dt) {
  // Update 3D car positions
  for (let i = 0; i < carModels.length; i++) {
    if (cars[i]) {
      const steering = (i === 0) ? input.steering : 0;
      updateCarModel(carModels[i], cars[i].x, cars[i].y, cars[i].angle, cars[i].speed, steering, dt);
    }
  }

  // Update chase camera (follow player car)
  if (cars[0]) {
    updateChaseCamera(cars[0].x, cars[0].y, cars[0].angle, cars[0].speed);
  }

  // Update HTML HUD
  updateHUD();

  renderScene();
}

// ---- Track & Car Setup ----
function initTrack(seed) {
  currentSeed = seed;
  track = generateTrack(seed);
  centerLine = buildTrackPath(track);
  walls = buildWallPaths(centerLine);

  // Physics world
  world = new World();
  wallBodies = createWallBodies(world, walls);

  // 3D track
  buildTrack3D(getScene(), centerLine, track);
}

function spawnCars() {
  cars = [];
  carModels.forEach(m => getScene().remove(m));
  carModels = [];
  aiControllers = [];
  waypointIndices = [];
  carFinishTimes = new Array(NUM_CARS).fill(null);
  earnedGold = 0;
  respawnTimer = 0;

  // Spawn positions along the start line
  const startIdx = Math.min(2, centerLine.length - 1);
  const startPt = centerLine[startIdx];
  const nextPt = centerLine[(startIdx + 1) % centerLine.length];
  const angle = Math.atan2(nextPt.y - startPt.y, nextPt.x - startPt.x) - Math.PI / 2;

  const offsets = [
    { across: -80, along: 0 },
    { across: 80, along: 0 },
    { across: -80, along: -200 },
    { across: 80, along: -200 },
  ];

  const dx = Math.cos(angle + Math.PI / 2);
  const dy = Math.sin(angle + Math.PI / 2);
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);

  for (let i = 0; i < NUM_CARS; i++) {
    const car = new Car(world);
    const ox = startPt.x + offsets[i].across * dx + offsets[i].along * fx;
    const oy = startPt.y + offsets[i].across * dy + offsets[i].along * fy;
    car.spawn(ox, oy, angle);
    cars.push(car);

    // 3D model
    const styleIdx = (i === 0) ? selectedStyle : (i % CAR_STYLE_NAMES.length);
    const model = buildCarModel(styleIdx, CAR_COLORS[i]);
    getScene().add(model);
    carModels.push(model);

    waypointIndices.push(startIdx);

    // AI controller (index 0 is player — no AI)
    if (i === 0) {
      aiControllers.push(null);
    } else {
      aiControllers.push(new AIController(car, walls, AI_SKILLS[i - 1], cars));
    }
  }

  // Race tracking
  const cl = computeCenterLineLengths(centerLine);
  race = new Race(cars, centerLine, 2); // finishLineIdx = 2
  race._cl = cl;

  resetChaseCamera();
}

function respawnPlayer() {
  const idx = waypointIndices[0];
  const pt = centerLine[idx];
  const nextPt = centerLine[(idx + 1) % centerLine.length];
  const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) - Math.PI / 2;
  cars[0].spawn(pt.x, pt.y, angle);
  cars[0].crashed = false;
  respawnTimer = 0;
}

// ---- HUD Updates ----
function updateHUD() {
  // This will be fully implemented in Task 8 (HTML UI)
  // For now, just ensure the function exists
}

// ---- UI Event Handlers ----
// These will be implemented in Task 8 (HTML UI)
// For now, start directly into racing for testing

function startTestRace() {
  initTrack(TRACK_SEEDS[currentTrackIndex]);
  spawnCars();
  gameState.startCountdown();
}

// ---- Boot ----
initAudio();
startTestRace();
requestAnimationFrame(gameLoop);
```

**Important notes:**
- This is a working skeleton. The UI event handlers (title screen clicks, car select, track select, pause) will be added in Task 8.
- The `startTestRace()` call at the bottom skips menus and goes straight to racing for testing purposes. This will be removed in Task 8.
- The Race class `_cl` property assignment is a temporary bridge — check if MiniGT stores this differently and adapt.

- [ ] **Step 2: Verify the game loop works**

Start dev server, open browser. Expected: cars spawn on track, player car can be steered by dragging, AI cars race, chase camera follows player. No menus yet — goes straight to racing.

Debug any issues: check console for import errors, verify coordinate mapping (2D → 3D), ensure physics collisions work with walls.

- [ ] **Step 3: Fix coordinate mapping issues**

The biggest risk is the 2D→3D coordinate transform. If cars appear off-track or walls don't align:
- Check that `PX_TO_WORLD` correctly maps between track.js pixel coordinates and Three.js world units
- Verify the angle convention: 2D visual angle (0 = -Y) should map to `rotation.y = -angle` in 3D
- Check wall collision still works (physics is in 2D pixel space, only rendering is in 3D)

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: game loop wiring - 2D sim connected to 3D renderer"
```

---

## Task 7: Effects

**Files:**
- Create: `js/effects3d.js`

- [ ] **Step 1: Create js/effects3d.js**

```javascript
import { PX_TO_WORLD, MAX_SPEED } from './constants.js';

// ---- Tire Smoke ----
const SMOKE_POOL_SIZE = 30;
let smokeParticles = [];
let smokeGroup = null;

export function initSmoke(scene) {
  smokeGroup = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    color: 0xcccccc,
    transparent: true,
    opacity: 0.6,
  });
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    const sprite = new THREE.Sprite(mat.clone());
    sprite.visible = false;
    sprite.scale.set(0.2, 0.2, 1);
    smokeGroup.add(sprite);
    smokeParticles.push({
      sprite,
      life: 0,
      maxLife: 0.5,
      vx: 0, vy: 0, vz: 0,
    });
  }
  scene.add(smokeGroup);
}

export function spawnSmoke(x2d, y2d, angle) {
  const wx = x2d * PX_TO_WORLD;
  const wz = y2d * PX_TO_WORLD;

  for (let i = 0; i < 2; i++) {
    // Find dead particle
    const p = smokeParticles.find(p => p.life <= 0);
    if (!p) break;

    // Spawn behind car (rear wheels)
    const rearOffset = 0.8;
    const sideOffset = (i === 0 ? -0.4 : 0.4);
    const fwdX = -Math.sin(angle);
    const fwdZ = -Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);

    p.sprite.position.set(
      wx + fwdX * rearOffset + rightX * sideOffset,
      0.15,
      wz + fwdZ * rearOffset + rightZ * sideOffset
    );
    p.sprite.visible = true;
    p.sprite.material.opacity = 0.6;
    p.sprite.scale.set(0.2, 0.2, 1);
    p.life = p.maxLife;
    p.vx = (Math.random() - 0.5) * 0.3;
    p.vy = 0.3 + Math.random() * 0.2;
    p.vz = (Math.random() - 0.5) * 0.3;
  }
}

export function updateSmoke(dt) {
  for (const p of smokeParticles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.sprite.visible = false;
      continue;
    }
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.y += p.vy * dt;
    p.sprite.position.z += p.vz * dt;
    const t = 1 - (p.life / p.maxLife);
    p.sprite.material.opacity = 0.6 * (1 - t);
    const scale = 0.2 + t * 0.6;
    p.sprite.scale.set(scale, scale, 1);
  }
}

// ---- Impact Sparks ----
const SPARK_POOL_SIZE = 15;
let sparkParticles = [];
let sparkGroup = null;

export function initSparks(scene) {
  sparkGroup = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 1.0,
  });
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    const sprite = new THREE.Sprite(mat.clone());
    sprite.visible = false;
    sprite.scale.set(0.08, 0.08, 1);
    sparkGroup.add(sprite);
    sparkParticles.push({
      sprite,
      life: 0,
      maxLife: 0.3,
      vx: 0, vy: 0, vz: 0,
    });
  }
  scene.add(sparkGroup);
}

export function spawnSparks(x2d, y2d) {
  const wx = x2d * PX_TO_WORLD;
  const wz = y2d * PX_TO_WORLD;

  for (let i = 0; i < 5; i++) {
    const p = sparkParticles.find(p => p.life <= 0);
    if (!p) break;

    p.sprite.position.set(wx, 0.3, wz);
    p.sprite.visible = true;
    p.sprite.material.opacity = 1.0;
    p.life = p.maxLife;
    p.vx = (Math.random() - 0.5) * 4;
    p.vy = 1 + Math.random() * 2;
    p.vz = (Math.random() - 0.5) * 4;
  }
}

export function updateSparks(dt) {
  for (const p of sparkParticles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.sprite.visible = false;
      continue;
    }
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.y += p.vy * dt;
    p.vy -= 9.8 * dt; // gravity
    p.sprite.position.z += p.vz * dt;
    p.sprite.material.opacity = p.life / p.maxLife;
  }
}

// ---- Skidmarks ----
const MAX_SKIDMARKS = 200;
let skidmarkSegments = [];
let skidmarkGroup = null;
const skidMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.4 });

export function initSkidmarks(scene) {
  skidmarkGroup = new THREE.Group();
  scene.add(skidmarkGroup);
}

export function addSkidmark(x2d, y2d, angle, steering) {
  if (Math.abs(steering) < 0.15) return;

  const wx = x2d * PX_TO_WORLD;
  const wz = y2d * PX_TO_WORLD;

  // Two tire marks (left and right rear)
  for (const side of [-0.4, 0.4]) {
    const fwdX = -Math.sin(angle);
    const fwdZ = -Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);

    const tx = wx + fwdX * 0.8 + rightX * side;
    const tz = wz + fwdZ * 0.8 + rightZ * side;

    const geo = new THREE.PlaneGeometry(0.06, 0.3);
    const mesh = new THREE.Mesh(geo, skidMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -angle;
    mesh.position.set(tx, 0.015, tz);
    skidmarkGroup.add(mesh);
    skidmarkSegments.push(mesh);

    // Remove oldest if over limit
    if (skidmarkSegments.length > MAX_SKIDMARKS) {
      const old = skidmarkSegments.shift();
      skidmarkGroup.remove(old);
      old.geometry.dispose();
    }
  }
}

export function clearSkidmarks() {
  for (const m of skidmarkSegments) {
    skidmarkGroup.remove(m);
    m.geometry.dispose();
  }
  skidmarkSegments.length = 0;
}

// ---- Speed Lines ----
const SPEED_LINE_COUNT = 12;
let speedLines = [];
let speedLineGroup = null;

export function initSpeedLines(scene, camera) {
  speedLineGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });

  for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    const geo = new THREE.PlaneGeometry(0.02, 1.5);
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.visible = false;
    speedLineGroup.add(mesh);
    speedLines.push({
      mesh,
      angle: (i / SPEED_LINE_COUNT) * Math.PI * 2,
      offset: Math.random(),
    });
  }
  scene.add(speedLineGroup);
}

export function updateSpeedLines(camera, speed, dt) {
  const speedRatio = speed / MAX_SPEED;
  if (speedRatio < 0.6) {
    speedLines.forEach(l => l.mesh.visible = false);
    return;
  }

  const opacity = (speedRatio - 0.6) * 2.5; // 0 at 60%, 1 at 100%

  for (const line of speedLines) {
    line.mesh.visible = true;
    line.offset += dt * 3;
    if (line.offset > 1) line.offset -= 1;

    // Position around camera edges
    const radius = 2;
    const a = line.angle;
    line.mesh.position.copy(camera.position);
    line.mesh.position.x += Math.cos(a) * radius;
    line.mesh.position.z += Math.sin(a) * radius;
    line.mesh.position.y += (line.offset - 0.5) * 4;
    line.mesh.lookAt(camera.position);
    line.mesh.material.opacity = opacity * (1 - Math.abs(line.offset - 0.5) * 2);
  }
}

// ---- Master init/update ----
export function initEffects(scene, camera) {
  initSmoke(scene);
  initSparks(scene);
  initSkidmarks(scene);
  initSpeedLines(scene, camera);
}

export function updateEffects(dt) {
  updateSmoke(dt);
  updateSparks(dt);
}

export function clearEffects() {
  clearSkidmarks();
  smokeParticles.forEach(p => { p.life = 0; p.sprite.visible = false; });
  sparkParticles.forEach(p => { p.life = 0; p.sprite.visible = false; });
  speedLines.forEach(l => l.mesh.visible = false);
}
```

- [ ] **Step 2: Integrate effects into main.js**

Add imports and calls:
- `initEffects(getScene(), getCamera())` at boot
- `spawnSmoke()` when car is braking hard or turning sharply
- `spawnSparks()` on wall collision
- `addSkidmark()` per frame when steering hard
- `updateEffects(dt)` and `updateSpeedLines()` in renderFrame
- `clearEffects()` on race reset

- [ ] **Step 3: Verify effects visually**

Start a race, steer hard — verify tire smoke appears behind wheels. Hit a wall — verify orange sparks. Drive fast — verify speed lines at screen edges. Check skidmarks accumulate on road surface.

- [ ] **Step 4: Commit**

```bash
git add js/effects3d.js
git commit -m "feat: 3D effects - tire smoke, sparks, skidmarks, speed lines"
```

---

## Task 8: Scenery

**Files:**
- Create: `js/scenery.js`

- [ ] **Step 1: Create js/scenery.js**

```javascript
import { PX_TO_WORLD, ROAD_HALF_WIDTH } from './constants.js';

let sceneryGroup = null;

/**
 * Place trees around the track.
 * @param {THREE.Scene} scene
 * @param {{x:number, y:number}[]} centerLine - 2D pixel waypoints
 */
export function buildScenery(scene, centerLine) {
  if (sceneryGroup) {
    scene.remove(sceneryGroup);
    sceneryGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  sceneryGroup = new THREE.Group();

  // Place trees at intervals along the track, offset to the sides
  const spacing = 8; // every N waypoints
  const minDist = ROAD_HALF_WIDTH + 3; // minimum distance from road center
  const maxDist = ROAD_HALF_WIDTH + 12;

  for (let i = 0; i < centerLine.length; i += spacing) {
    const p = centerLine[i];
    const next = centerLine[(i + 1) % centerLine.length];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // Place tree on each side (with some randomness)
    for (const side of [-1, 1]) {
      if (Math.random() > 0.6) continue; // skip some for variety

      const dist = minDist + Math.random() * (maxDist - minDist);
      const tx = (p.x + nx * dist * side) * PX_TO_WORLD;
      const tz = (p.y + ny * dist * side) * PX_TO_WORLD;

      const tree = buildTree();
      tree.position.set(tx, 0, tz);
      tree.rotation.y = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 0.6;
      tree.scale.set(s, s, s);
      sceneryGroup.add(tree);
    }
  }

  scene.add(sceneryGroup);
}

function buildTree() {
  const group = new THREE.Group();

  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5),
    new THREE.MeshLambertMaterial({ color: 0x8B6914 })
  );
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  group.add(trunk);

  // Foliage — stacked cones for low-poly look
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x228833 });

  const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 5), leafMat);
  bottom.position.y = 1.6;
  bottom.castShadow = true;
  group.add(bottom);

  const top = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 5), leafMat);
  top.position.y = 2.4;
  top.castShadow = true;
  group.add(top);

  return group;
}

export function disposeScenery() {
  if (sceneryGroup) {
    sceneryGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    sceneryGroup.parent?.remove(sceneryGroup);
    sceneryGroup = null;
  }
}
```

- [ ] **Step 2: Integrate into main.js**

Call `buildScenery(getScene(), centerLine)` after `buildTrack3D()` in `initTrack()`.

- [ ] **Step 3: Verify trees appear along track sides**

Open browser, verify low-poly trees scattered alongside the road, varying sizes, not blocking the road.

- [ ] **Step 4: Commit**

```bash
git add js/scenery.js
git commit -m "feat: low-poly tree scenery along track edges"
```

---

## Task 9: HTML UI — Menus and HUD

**Files:**
- Modify: `index.html`, `css/ui.css`, `js/main.js`

This is the largest UI task. All game screens become HTML/CSS overlays.

- [ ] **Step 1: Add HTML UI structure to index.html**

Add inside the `#ui` div:

```html
<div id="ui">
  <!-- Title Screen -->
  <div id="screen-title" class="screen">
    <h1 class="game-title">MINI GT 3D</h1>
    <button id="btn-race" class="btn-primary">RACE</button>
    <div class="version" id="version-text"></div>
  </div>

  <!-- Car Select -->
  <div id="screen-carselect" class="screen hidden">
    <h2>SELECT CAR</h2>
    <div id="car-grid" class="car-grid"></div>
    <div class="gold-display">
      <span id="gold-amount">0</span> GOLD
    </div>
  </div>

  <!-- Track Select -->
  <div id="screen-trackselect" class="screen hidden">
    <h2>SELECT TRACK</h2>
    <div id="track-grid" class="track-grid"></div>
    <button id="btn-back-car" class="btn-secondary">BACK</button>
  </div>

  <!-- Racing HUD -->
  <div id="hud" class="hidden">
    <div class="hud-top">
      <div class="hud-left">
        <div id="hud-lap" class="hud-text">LAP 1/3</div>
      </div>
      <div class="hud-center">
        <div id="hud-time" class="hud-text">00:00.00</div>
        <div id="hud-best" class="hud-text-small">BEST --:--.--</div>
      </div>
      <div class="hud-right">
        <button id="btn-pause" class="btn-icon">II</button>
      </div>
    </div>
    <div id="hud-pos" class="hud-position">POS 1/4</div>
    <div class="hud-bottom">
      <div id="hud-speed" class="hud-speed">0 km/h</div>
    </div>
  </div>

  <!-- Countdown -->
  <div id="screen-countdown" class="screen hidden">
    <div id="countdown-number" class="countdown-text">3</div>
  </div>

  <!-- Respawn -->
  <div id="screen-respawn" class="screen hidden">
    <div class="respawn-text">RESPAWNING</div>
  </div>

  <!-- Finished -->
  <div id="screen-finished" class="screen hidden">
    <h2>RACE COMPLETE</h2>
    <div id="finish-position" class="finish-pos">1ST</div>
    <div id="finish-time" class="finish-detail"></div>
    <div id="finish-best" class="finish-detail"></div>
    <div id="finish-gold" class="finish-detail"></div>
    <button id="btn-next" class="btn-primary">NEXT RACE</button>
    <button id="btn-menu" class="btn-secondary">MENU</button>
  </div>

  <!-- Pause -->
  <div id="screen-pause" class="screen hidden">
    <h2>PAUSED</h2>
    <button id="btn-resume" class="btn-primary">RESUME</button>
    <button id="btn-retry" class="btn-secondary">RETRY</button>
    <button id="btn-quit" class="btn-secondary">QUIT</button>
    <div class="toggle-row">
      <label>SFX</label>
      <button id="btn-sfx" class="btn-toggle">ON</button>
    </div>
    <div class="toggle-row">
      <label>HAPTICS</label>
      <button id="btn-haptics" class="btn-toggle">ON</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add UI styles to css/ui.css**

```css
/* Screens */
.screen {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.game-title {
  font-size: 64px;
  font-weight: 900;
  letter-spacing: 4px;
  text-shadow: 0 4px 8px rgba(0,0,0,0.5);
}

.btn-primary {
  background: #e63946;
  color: #fff;
  border: none;
  padding: 16px 48px;
  font-size: 24px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  letter-spacing: 2px;
}
.btn-primary:active { transform: scale(0.95); }

.btn-secondary {
  background: rgba(255,255,255,0.15);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 12px 32px;
  font-size: 18px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
}

.btn-icon {
  background: rgba(0,0,0,0.4);
  color: #fff;
  border: none;
  width: 40px;
  height: 40px;
  font-size: 18px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
}

.version {
  position: absolute;
  bottom: 16px;
  font-size: 12px;
  opacity: 0.5;
}

/* Car Select */
.car-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 20px;
  max-width: 400px;
}

.car-card {
  background: rgba(255,255,255,0.1);
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.car-card.selected { border-color: #4ecdc4; background: rgba(78,205,196,0.15); }
.car-card.locked { opacity: 0.5; }
.car-card .cost { font-size: 12px; color: #ffaa00; margin-top: 4px; }

.gold-display {
  font-size: 18px;
  color: #ffaa00;
  font-weight: 700;
}

/* Track Select */
.track-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 0 20px;
  max-width: 400px;
  max-height: 60vh;
  overflow-y: auto;
}

.track-card {
  background: rgba(255,255,255,0.1);
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
}
.track-card:active { border-color: #4ecdc4; }
.track-card .track-best { font-size: 11px; color: #aaa; margin-top: 4px; }

/* HUD */
.hud-top {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
}
.hud-left, .hud-center, .hud-right {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hud-text {
  font-size: 20px;
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}
.hud-text-small {
  font-size: 13px;
  color: #4ecdc4;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.hud-position {
  position: absolute;
  top: 60px;
  width: 100%;
  text-align: center;
  font-size: 28px;
  font-weight: 900;
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
.hud-bottom {
  position: absolute;
  bottom: 20px;
  right: 20px;
}
.hud-speed {
  font-size: 22px;
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}

/* Countdown */
.countdown-text {
  font-size: 120px;
  font-weight: 900;
  text-shadow: 0 4px 12px rgba(0,0,0,0.5);
  animation: countPulse 0.5s ease-out;
}
@keyframes countPulse {
  from { transform: scale(1.5); opacity: 0.5; }
  to { transform: scale(1); opacity: 1; }
}

/* Respawn */
.respawn-text {
  font-size: 32px;
  font-weight: 700;
  color: #ff6b6b;
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
  animation: blink 0.5s ease-in-out infinite alternate;
}
@keyframes blink {
  from { opacity: 0.4; }
  to { opacity: 1; }
}

/* Finished */
.finish-pos {
  font-size: 64px;
  font-weight: 900;
  text-shadow: 0 4px 8px rgba(0,0,0,0.5);
}
.finish-detail {
  font-size: 16px;
  color: #ccc;
}

/* Pause */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
}
.btn-toggle {
  background: rgba(255,255,255,0.2);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 6px 16px;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  min-width: 50px;
}
.btn-toggle.active { background: #4ecdc4; color: #000; }
```

- [ ] **Step 3: Update main.js with full UI logic**

Replace the temporary `startTestRace()` and `updateHUD()` functions with proper screen management:

```javascript
// ---- Screen Management ----
const screens = {
  title: document.getElementById('screen-title'),
  carselect: document.getElementById('screen-carselect'),
  trackselect: document.getElementById('screen-trackselect'),
  hud: document.getElementById('hud'),
  countdown: document.getElementById('screen-countdown'),
  respawn: document.getElementById('screen-respawn'),
  finished: document.getElementById('screen-finished'),
  pause: document.getElementById('screen-pause'),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (key === name) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }
}

function showHUD() {
  screens.hud.classList.remove('hidden');
}

function hideHUD() {
  screens.hud.classList.add('hidden');
}

// ---- UI Updates ----
function updateHUD() {
  if (gameState.state === 'racing' || gameState.state === 'finishing') {
    const t = gameState.raceTime;
    document.getElementById('hud-time').textContent = formatTime(t);
    document.getElementById('hud-lap').textContent =
      `LAP ${Math.min((cars[0].lapsCompleted || 0) + 1, NUM_LAPS)}/${NUM_LAPS}`;
    document.getElementById('hud-speed').textContent =
      `${Math.round(cars[0].speed * 0.36)} km/h`;

    // Position
    if (race) {
      const standings = rankStandings(cars, (car, idx) =>
        computeProgress({ x: car.physX, y: car.physY },
          waypointIndices[idx], centerLine, race._cl, car.lapsCompleted)
      );
      const pos = standings.findIndex(s => s.idx === 0) + 1;
      document.getElementById('hud-pos').textContent = `POS ${pos}/${NUM_CARS}`;
    }

    // Best lap
    if (cars[0].bestLap < Infinity) {
      document.getElementById('hud-best').textContent =
        `BEST ${formatTime(cars[0].bestLap)}`;
    }
  }

  // Countdown overlay
  if (gameState.state === 'countdown') {
    const n = gameState.countdownNumber;
    document.getElementById('countdown-number').textContent = n <= 0 ? 'GO' : n;
  }

  // Respawn overlay
  if (respawnTimer > 0) {
    screens.respawn.classList.remove('hidden');
  } else {
    screens.respawn.classList.add('hidden');
  }
}

function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const hundredths = Math.floor((totalSec % 1) * 100);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Wire up button event handlers in main.js**

```javascript
// Title
document.getElementById('version-text').textContent = VERSION;
document.getElementById('btn-race').addEventListener('click', () => {
  playClick();
  hapticTap();
  showCarSelect();
});

// Car select
function showCarSelect() {
  gameState.state = 'carselect';
  showScreen('carselect');
  document.getElementById('gold-amount').textContent = getGold();
  buildCarSelectGrid();
}

function buildCarSelectGrid() {
  const grid = document.getElementById('car-grid');
  grid.innerHTML = '';
  const unlocked = getUnlockedCars();
  for (let i = 0; i < CAR_STYLE_NAMES.length; i++) {
    const card = document.createElement('div');
    card.className = 'car-card' + (i === selectedStyle ? ' selected' : '') +
      (!unlocked.includes(i) ? ' locked' : '');
    card.textContent = CAR_STYLE_NAMES[i];
    if (!unlocked.includes(i)) {
      const cost = document.createElement('div');
      cost.className = 'cost';
      cost.textContent = `${UNLOCK_COST} GOLD`;
      card.appendChild(cost);
    }
    card.addEventListener('click', () => {
      if (!unlocked.includes(i)) {
        if (unlockCar(i)) {
          playClick();
          document.getElementById('gold-amount').textContent = getGold();
          buildCarSelectGrid();
        }
        return;
      }
      selectedStyle = i;
      playClick();
      hapticTap();
      showTrackSelect();
    });
    grid.appendChild(card);
  }
}

// Track select
function showTrackSelect() {
  gameState.state = 'trackselect';
  showScreen('trackselect');
  buildTrackSelectGrid();
}

function buildTrackSelectGrid() {
  const grid = document.getElementById('track-grid');
  grid.innerHTML = '';
  for (let i = 0; i < TRACK_SEEDS.length; i++) {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.innerHTML = `TRACK ${String(i + 1).padStart(2, '0')}`;
    const best = getBestTime(i);
    if (best < Infinity) {
      const bestDiv = document.createElement('div');
      bestDiv.className = 'track-best';
      bestDiv.textContent = formatTime(best);
      card.appendChild(bestDiv);
    }
    card.addEventListener('click', () => {
      currentTrackIndex = i;
      playClick();
      hapticTap();
      startRace(TRACK_SEEDS[i]);
    });
    grid.appendChild(card);
  }
}

document.getElementById('btn-back-car').addEventListener('click', () => {
  playClick();
  showCarSelect();
});

// Race start
function startRace(seed) {
  initTrack(seed);
  spawnCars();
  gameState.startCountdown();
  showScreen('countdown');
  showHUD();
}

// Pause
document.getElementById('btn-pause').addEventListener('click', () => {
  playClick();
  gameState.pause();
  showScreen('pause');
});

document.getElementById('btn-resume').addEventListener('click', () => {
  playClick();
  gameState.resume();
  showScreen(null); // hide all overlays
  showHUD();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  playClick();
  startRace(currentSeed);
});

document.getElementById('btn-quit').addEventListener('click', () => {
  playClick();
  gameState.reset();
  showScreen('title');
  hideHUD();
});

// Finished
document.getElementById('btn-next').addEventListener('click', () => {
  playClick();
  currentTrackIndex = (currentTrackIndex + 1) % TRACK_SEEDS.length;
  startRace(TRACK_SEEDS[currentTrackIndex]);
});

document.getElementById('btn-menu').addEventListener('click', () => {
  playClick();
  gameState.reset();
  showScreen('title');
  hideHUD();
});

// SFX / Haptics toggles
document.getElementById('btn-sfx').addEventListener('click', () => {
  const on = !getSfxEnabled();
  setSfxEnabled(on);
  document.getElementById('btn-sfx').textContent = on ? 'ON' : 'OFF';
  document.getElementById('btn-sfx').classList.toggle('active', on);
});

document.getElementById('btn-haptics').addEventListener('click', () => {
  const on = !getHapticsEnabled();
  setHapticsEnabled(on);
  document.getElementById('btn-haptics').textContent = on ? 'ON' : 'OFF';
  document.getElementById('btn-haptics').classList.toggle('active', on);
});

// Best time persistence
const BEST_TIMES_KEY = 'mini-gt-3d:best-times';
function getBestTime(trackIndex) {
  try {
    const data = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '{}');
    return data[trackIndex] ?? Infinity;
  } catch (_) { return Infinity; }
}
function saveBestTime(trackIndex, time) {
  try {
    const data = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '{}');
    if (time < (data[trackIndex] ?? Infinity)) {
      data[trackIndex] = time;
      localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(data));
    }
  } catch (_) {}
}

// Import SFX toggle getters
import { getSfxEnabled, setSfxEnabled, getHapticsEnabled, setHapticsEnabled } from './audio.js';
```

- [ ] **Step 5: Update main.js boot sequence**

Replace the temporary `startTestRace()` at the bottom with:

```javascript
// ---- Boot ----
initAudio();
showScreen('title');
requestAnimationFrame(gameLoop);
```

- [ ] **Step 6: Update fixedUpdate for state transitions**

Make sure the countdown → racing transition shows/hides the right screens:

```javascript
// In fixedUpdate, after countdown finishes:
if (state === 'countdown') {
  if (gameState.tickCountdown()) {
    playGoBeep();
    screens.countdown.classList.add('hidden');
  } else {
    document.getElementById('countdown-number').textContent =
      gameState.countdownNumber <= 0 ? 'GO' : gameState.countdownNumber;
  }
}

// When player finishes:
if (cars[0].lapsCompleted >= NUM_LAPS && !cars[0].finished) {
  // ... existing finish logic ...
  const posStr = ['1ST', '2ND', '3RD', '4TH'][pos - 1];
  document.getElementById('finish-position').textContent = posStr;
  document.getElementById('finish-time').textContent = `TIME: ${formatTime(gameState.raceTime)}`;
  document.getElementById('finish-best').textContent = `BEST LAP: ${formatTime(cars[0].bestLap)}`;
  document.getElementById('finish-gold').textContent = `+${earnedGold} GOLD`;
  saveBestTime(currentTrackIndex, gameState.raceTime);
  setTimeout(() => {
    showScreen('finished');
  }, 2000); // 2 second delay before showing results
}
```

- [ ] **Step 7: Test full game flow**

Verify: Title screen → RACE → Car select (6 cards, locked ones show cost) → Track select (10 tracks) → Countdown (3-2-1-GO) → Racing (HUD updates live) → Finish (results show) → Next Race / Menu. Test Pause menu with SFX/Haptics toggles.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: complete HTML/CSS UI - menus, HUD, countdown, results, pause"
```

---

## Task 10: Polish & Final Integration

**Files:**
- Modify: `js/main.js`, `js/constants.js`, `js/renderer3d.js`

- [ ] **Step 1: Handle wall collision events for effects + audio**

In main.js, add collision handling in `fixedUpdate()`. MiniGT's `car.onWallCollision()` handles physics; we need to trigger 3D effects on top:

```javascript
// After world.step(), check for car-wall collisions:
// The car.js onWallCollision already handles physics.
// Hook into car.crashed flag changes to trigger effects:
for (let i = 0; i < NUM_CARS; i++) {
  if (cars[i].crashed && !cars[i]._wasCrashedLastFrame) {
    // Just crashed
    playCrash();
    hapticThump();
    triggerShake(0.4);
    spawnSparks(cars[i].x, cars[i].y);
    if (i === 0) {
      respawnTimer = RESPAWN_DELAY_SEC;
    }
  }
  cars[i]._wasCrashedLastFrame = cars[i].crashed;
}
```

- [ ] **Step 2: Add smoke and skidmark triggers in renderFrame**

```javascript
// In renderFrame, after updating car models:
for (let i = 0; i < cars.length; i++) {
  const car = cars[i];
  const steering = (i === 0) ? input.steering : 0;

  // Tire smoke on hard turns
  if (Math.abs(steering) > 0.5 && car.speed > MAX_SPEED * 0.3) {
    spawnSmoke(car.x, car.y, car.angle);
  }

  // Skidmarks
  if (i === 0 && car.speed > 50) {
    addSkidmark(car.x, car.y, car.angle, steering);
  }
}

updateEffects(dt);
updateSpeedLines(getCamera(), cars[0]?.speed || 0, dt);
```

- [ ] **Step 3: Add lap completion audio triggers**

In fixedUpdate, after `race.update()`, check for lap completions and play sounds:

```javascript
// Track lap completions for audio
for (let i = 0; i < NUM_CARS; i++) {
  if (cars[i]._lastLapCount === undefined) cars[i]._lastLapCount = 0;
  if (cars[i].lapsCompleted > cars[i]._lastLapCount) {
    cars[i]._lastLapCount = cars[i].lapsCompleted;
    if (i === 0) {
      if (cars[i].lapsCompleted >= NUM_LAPS) {
        playLapFinish();
      } else {
        playLapBoundary();
      }
      hapticTap();
    }
  }
}
```

- [ ] **Step 4: Tune track seeds for 3D**

Generate several tracks, view them from the chase cam, and select 10 seeds that look good in 3D. Criteria:
- Tracks should have a mix of straights and curves
- No extremely tight hairpins that look bad from the chase cam
- Good variety across difficulty buckets

Update `TRACK_SEEDS` in constants.js with the final 10 seeds.

- [ ] **Step 5: Add shadow for the sun to follow the player**

In renderer3d.js, export a function to update the directional light's shadow camera to follow the player, keeping shadows visible around the car:

```javascript
let sunLight = null;

// In initRenderer, save reference:
sunLight = sun;

export function updateSunPosition(x, z) {
  if (!sunLight) return;
  sunLight.position.set(x + 10, 20, z + 10);
  sunLight.target.position.set(x, 0, z);
  sunLight.target.updateMatrixWorld();
}
```

Call `updateSunPosition(cars[0].x * PX_TO_WORLD, cars[0].y * PX_TO_WORLD)` in renderFrame.

- [ ] **Step 6: Final full playtest**

Play through at least 3 complete races:
- Verify smooth chase cam with no jitter
- Verify all 6 car models render correctly
- Verify AI cars race properly
- Verify wall collisions trigger sparks + crash + respawn
- Verify HUD updates (lap, position, time, speed)
- Verify menus work (title → car select → track select → race → finish → next/menu)
- Verify audio (countdown beeps, crash, lap complete)
- Verify effects (smoke, sparks, skidmarks, speed lines)
- Check for console errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: polish - collision effects, audio triggers, sun shadows, track tuning"
```

---

## Task 11: Minimap

**Files:**
- Modify: `index.html`, `css/ui.css`

The minimap is a small 2D canvas in the HTML overlay that shows the track outline and car positions, like MiniGT's minimap.

- [ ] **Step 1: Add minimap canvas to HTML**

In the HUD section of index.html:

```html
<canvas id="minimap" width="120" height="120"></canvas>
```

- [ ] **Step 2: Style the minimap**

```css
#minimap {
  position: absolute;
  bottom: 60px;
  right: 16px;
  width: 100px;
  height: 100px;
  border-radius: 8px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.2);
}
```

- [ ] **Step 3: Draw minimap in renderFrame**

Add a `drawMinimap()` function in main.js that uses the minimap canvas 2D context to draw a scaled-down track centerline and car dots:

```javascript
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

function drawMinimap() {
  if (!centerLine || !cars.length) return;
  const ctx = minimapCtx;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // Find track bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of centerLine) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = 10;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY);
  const offX = (w - rangeX * scale) / 2;
  const offY = (h - rangeY * scale) / 2;

  const toMX = x => (x - minX) * scale + offX;
  const toMY = y => (y - minY) * scale + offY;

  // Draw track path
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(toMX(centerLine[0].x), toMY(centerLine[0].y));
  for (let i = 1; i < centerLine.length; i++) {
    ctx.lineTo(toMX(centerLine[i].x), toMY(centerLine[i].y));
  }
  ctx.closePath();
  ctx.stroke();

  // Draw cars
  const colors = ['#44f', '#f44', '#4f4', '#ff4'];
  for (let i = 0; i < cars.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(toMX(cars[i].x), toMY(cars[i].y), i === 0 ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

Call `drawMinimap()` at the end of `renderFrame()` when in racing/finishing state.

- [ ] **Step 4: Verify minimap shows track and moving car dots**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: minimap showing track outline and car positions"
```

---

## Task 12: Screenshot Script & Final Cleanup

**Files:**
- Create: `screenshot.js`
- Verify: all files working, no console errors

- [ ] **Step 1: Create screenshot.js**

```javascript
const puppeteer = require('/usr/local/lib/node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8084', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'screenshot-title.png' });
  console.log('Saved screenshot-title.png');
  await browser.close();
})();
```

- [ ] **Step 2: Run check-errors.js to verify no JS errors**

```bash
node check-errors.js
```

Expected: `NO ERRORS - Game loaded successfully`

- [ ] **Step 3: Take a screenshot of the title screen**

```bash
node screenshot.js
```

Read the screenshot to verify it looks correct.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: screenshot script and final cleanup"
```

---

## Summary of commits

1. `scaffold: copy MiniGT game logic and create project files`
2. `feat: minimal Three.js scene with ground plane and sky`
3. `feat: track builder converts 2D centerline to 3D road, walls, and start line`
4. `feat: chase camera with smooth follow, FOV scaling, and screen shake`
5. `feat: 6 procedural low-poly car models (GT3, Muscle, Rally, LMP, JDM, Retro)`
6. `feat: game loop wiring - 2D sim connected to 3D renderer`
7. `feat: 3D effects - tire smoke, sparks, skidmarks, speed lines`
8. `feat: low-poly tree scenery along track edges`
9. `feat: complete HTML/CSS UI - menus, HUD, countdown, results, pause`
10. `feat: polish - collision effects, audio triggers, sun shadows, track tuning`
11. `feat: minimap showing track outline and car positions`
12. `feat: screenshot script and final cleanup`
