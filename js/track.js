import { TILE, MIN_TRACK_TILES, MAX_TRACK_TILES, WALL_SEGMENTS_PER_CURVE } from './constants.js';
import { Vec2 } from '../physics2d/index.js';
import { Body } from '../physics2d/src/body.js';
import { Edge } from '../physics2d/src/shapes.js';

// Directions: 0=N(up), 1=E(right), 2=S(down), 3=W(left)
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;

// Direction vectors (Y increases downward)
export const DIR_VEC = [
  { x: 0, y: -1 }, // N
  { x: 1, y: 0 },  // E
  { x: 0, y: 1 },  // S
  { x: -1, y: 0 }, // W
];

export function turnLeft(dir) {
  return (dir + 3) % 4; // N->W->S->E->N
}

export function turnRight(dir) {
  return (dir + 1) % 4; // N->E->S->W->N
}

// --- Seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Tile placement helpers ---

// Get the perpendicular-left direction vector for a given facing direction
function perpLeft(dir) {
  return DIR_VEC[turnLeft(dir)];
}

// Get the perpendicular-right direction vector for a given facing direction
function perpRight(dir) {
  return DIR_VEC[turnRight(dir)];
}

/**
 * Compute the grid cells occupied by a curve tile.
 *
 * For a curve of size NxN entering at (gx, gy) heading in `dir` and turning by `sign`:
 *   sign = +1 means turn left, sign = -1 means turn right.
 *
 * The occupied cells form an NxN block. The entry cell is at one corner
 * of this block. The block extends:
 *   - (size-1) cells in the forward direction from the entry cell
 *   - (size-1) cells in the lateral direction of the turn from the entry cell
 */
function curveCells(gx, gy, dir, sign, size) {
  const fwd = DIR_VEC[dir];
  const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
  const cells = [];
  for (let f = 0; f < size; f++) {
    for (let l = 0; l < size; l++) {
      cells.push({
        x: gx + fwd.x * f + lat.x * l,
        y: gy + fwd.y * f + lat.y * l,
      });
    }
  }
  return cells;
}

/**
 * Compute exit position and direction for a curve.
 * The exit is at the far corner of the NxN block, one cell beyond in the turned direction.
 */
function curveExit(gx, gy, dir, sign, size) {
  const fwd = DIR_VEC[dir];
  const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
  const exitDir = sign === 1 ? turnLeft(dir) : turnRight(dir);
  const exitDirVec = DIR_VEC[exitDir];
  // Far corner cell of the NxN block
  const farX = gx + fwd.x * (size - 1) + lat.x * (size - 1);
  const farY = gy + fwd.y * (size - 1) + lat.y * (size - 1);
  // Exit cell is one step beyond in the exit (turned) direction
  const exitGx = farX + exitDirVec.x;
  const exitGy = farY + exitDirVec.y;
  return { gx: exitGx, gy: exitGy, dir: exitDir };
}

/**
 * Create a tile descriptor.
 */
function makeTile(type, gx, gy, dir, cells, exitGx, exitGy, exitDir, sign, size) {
  return { type, gx, gy, dir, cells, exitGx, exitGy, exitDir, sign, size };
}

function makeStraight(gx, gy, dir) {
  const fwd = DIR_VEC[dir];
  return makeTile(
    'straight', gx, gy, dir,
    [{ x: gx, y: gy }],
    gx + fwd.x, gy + fwd.y, dir,
    0, 1
  );
}

function makeCurve(type, gx, gy, dir, sign, size) {
  const cells = curveCells(gx, gy, dir, sign, size);
  const exit = curveExit(gx, gy, dir, sign, size);
  return makeTile(type, gx, gy, dir, cells, exit.gx, exit.gy, exit.dir, sign, size);
}

// --- Track generation ---

export function generateTrack(seed) {
  // Tile type definitions with weights
  const tileTypes = [
    { type: 'straight', weight: 55, size: 1 },
    { type: 'medium', weight: 30, size: 2 },
    { type: 'gentle', weight: 15, size: 3 },
  ];
  const totalWeight = tileTypes.reduce((s, t) => s + t.weight, 0);

  // All candidate tile builders for return-home phase
  const allTileBuilders = [
    (gx, gy, dir) => makeStraight(gx, gy, dir),
    (gx, gy, dir) => makeCurve('medium', gx, gy, dir, 1, 2),
    (gx, gy, dir) => makeCurve('medium', gx, gy, dir, -1, 2),
    (gx, gy, dir) => makeCurve('gentle', gx, gy, dir, 1, 3),
    (gx, gy, dir) => makeCurve('gentle', gx, gy, dir, -1, 3),
  ];

  // Retry with different sub-seeds if track gets stuck
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = mulberry32(seed + attempt * 997);
    const targetLen = MIN_TRACK_TILES + Math.floor(rng() * (MAX_TRACK_TILES - MIN_TRACK_TILES + 1));
    const returnBudget = 15; // max tiles for return-home phase
    const freeGenTarget = Math.max(targetLen - returnBudget, targetLen * 0.6);
    const occupied = new Set();
    const tiles = [];

    function cellKey(x, y) { return `${x},${y}`; }
    function isOccupied(x, y) { return occupied.has(cellKey(x, y)); }
    function markCells(cells) { for (const c of cells) occupied.add(cellKey(c.x, c.y)); }

    function canPlace(cells, exitGx, exitGy) {
      for (const c of cells) { if (isOccupied(c.x, c.y)) return false; }
      if (isOccupied(exitGx, exitGy)) return false;
      return true;
    }

    // Can place cells without checking exit (for loop-closing tile)
    function canPlaceCells(cells) {
      for (const c of cells) { if (isOccupied(c.x, c.y)) return false; }
      return true;
    }

    // --- Place grid (P1) tile then start/finish tile, heading South ---
    const gridTile = makeStraight(0, 0, DIR_S);
    gridTile.type = 'grid';
    tiles.push(gridTile);
    markCells(gridTile.cells);

    const startTile = makeStraight(gridTile.exitGx, gridTile.exitGy, DIR_S);
    startTile.type = 'start';
    tiles.push(startTile);
    markCells(startTile.cells);

    // Loop target: last tile must exit at grid tile entry = (0, 0) heading DIR_S
    const targetGx = 0;
    const targetGy = 0;
    const targetDir = DIR_S;

    let cx = startTile.exitGx;
    let cy = startTile.exitGy;
    let cdir = startTile.exitDir;

    let consecutiveStraights = 0;
    const maxIter = 500;
    let iter = 0;

    // --- Phase 1: Free generation ---
    while (tiles.length < freeGenTarget && iter < maxIter) {
      iter++;

      let r = rng() * totalWeight;
      let chosen = tileTypes[0];
      for (const tt of tileTypes) {
        r -= tt.weight;
        if (r <= 0) { chosen = tt; break; }
      }

      if (chosen.type === 'straight' && consecutiveStraights >= 4) continue;

      let tile = null;
      if (chosen.type === 'straight') {
        const t = makeStraight(cx, cy, cdir);
        if (canPlace(t.cells, t.exitGx, t.exitGy)) tile = t;
      } else {
        const sign = rng() < 0.5 ? 1 : -1;
        const t1 = makeCurve(chosen.type, cx, cy, cdir, sign, chosen.size);
        if (canPlace(t1.cells, t1.exitGx, t1.exitGy)) {
          tile = t1;
        } else {
          const t2 = makeCurve(chosen.type, cx, cy, cdir, -sign, chosen.size);
          if (canPlace(t2.cells, t2.exitGx, t2.exitGy)) tile = t2;
        }
      }

      if (!tile) continue;

      tiles.push(tile);
      markCells(tile.cells);
      cx = tile.exitGx;
      cy = tile.exitGy;
      cdir = tile.exitDir;
      consecutiveStraights = tile.type === 'straight' ? consecutiveStraights + 1 : 0;
    }

    // --- Phase 2: Return home (greedy pathfinding) ---
    // Score = Manhattan distance to target + direction penalty
    function score(gx, gy, dir) {
      const dist = Math.abs(gx - targetGx) + Math.abs(gy - targetGy);
      // Bonus if direction faces toward target
      const dx = targetGx - gx;
      const dy = targetGy - gy;
      const fwd = DIR_VEC[dir];
      const dot = fwd.x * Math.sign(dx || 0) + fwd.y * Math.sign(dy || 0);
      // Penalty if wrong direction
      const dirPenalty = dir === targetDir ? 0 : (dot > 0 ? 1 : 3);
      return dist + dirPenalty;
    }

    let loopClosed = false;
    for (let ri = 0; ri < returnBudget; ri++) {
      // Only allow closing the loop if we have enough tiles
      let closingTile = null;
      if (tiles.length >= MIN_TRACK_TILES - 2) {
        for (const builder of allTileBuilders) {
          const t = builder(cx, cy, cdir);
          if (t.exitGx === targetGx && t.exitGy === targetGy && t.exitDir === targetDir) {
            if (canPlaceCells(t.cells)) {
              closingTile = t;
              break;
            }
          }
        }
      }

      if (closingTile) {
        tiles.push(closingTile);
        markCells(closingTile.cells);
        loopClosed = true;
        break;
      }

      // Otherwise, pick the tile that gets us closest
      let bestTile = null;
      let bestScore = Infinity;
      for (const builder of allTileBuilders) {
        const t = builder(cx, cy, cdir);
        if (!canPlace(t.cells, t.exitGx, t.exitGy)) continue;
        const s = score(t.exitGx, t.exitGy, t.exitDir);
        if (s < bestScore) {
          bestScore = s;
          bestTile = t;
        }
      }

      if (!bestTile) break; // stuck

      tiles.push(bestTile);
      markCells(bestTile.cells);
      cx = bestTile.exitGx;
      cy = bestTile.exitGy;
      cdir = bestTile.exitDir;
    }

    if (!loopClosed) continue; // retry with different seed

    // --- Compute grid bounds ---
    let minGx = Infinity, minGy = Infinity;
    let maxGx = -Infinity, maxGy = -Infinity;
    for (const tile of tiles) {
      for (const c of tile.cells) {
        if (c.x < minGx) minGx = c.x;
        if (c.y < minGy) minGy = c.y;
        if (c.x > maxGx) maxGx = c.x;
        if (c.y > maxGy) maxGy = c.y;
      }
    }

    return {
      seed,
      tiles,
      isLoop: true,
      minGx,
      minGy,
      gridWidth: maxGx - minGx + 1,
      gridHeight: maxGy - minGy + 1,
    };
  }

  // Fallback: try a completely different seed
  return generateTrack(seed + 7919);
}

// --- Center-line path ---

export function buildTrackPath(track) {
  const points = [];
  const T = TILE;

  for (const tile of track.tiles) {
    const { gx, gy, dir, type, sign, size } = tile;

    if (type === 'straight' || type === 'grid' || type === 'start' || type === 'finish' || type === 'runoff') {
      // Straight: entry center and exit center
      const fwd = DIR_VEC[dir];
      const entryX = (gx + 0.5) * T - fwd.x * T * 0.5;
      const entryY = (gy + 0.5) * T - fwd.y * T * 0.5;
      const exitX = (gx + 0.5) * T + fwd.x * T * 0.5;
      const exitY = (gy + 0.5) * T + fwd.y * T * 0.5;

      // Only add entry point for first tile to avoid duplicates
      if (points.length === 0) {
        points.push({ x: entryX, y: entryY });
      }
      points.push({ x: exitX, y: exitY });
    } else {
      // Curve tile: generate arc points
      const fwd = DIR_VEC[dir];
      const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
      const R = (size - 0.5) * T;

      // Entry point: center of entry edge of entry cell
      const entryX = (gx + 0.5) * T - fwd.x * T * 0.5;
      const entryY = (gy + 0.5) * T - fwd.y * T * 0.5;

      // Arc center: offset from entry point by R in the lateral (inside) direction
      const acx = entryX + lat.x * R;
      const acy = entryY + lat.y * R;

      // Start angle: from arc center toward entry point
      const startAngle = Math.atan2(entryY - acy, entryX - acx);

      // Sweep is always 90 degrees
      // sign=+1 (left turn): CW in screen coords = negative angular sweep
      // sign=-1 (right turn): CCW in screen coords = positive angular sweep
      const sweep = sign === 1 ? -Math.PI / 2 : Math.PI / 2;

      const segs = WALL_SEGMENTS_PER_CURVE;
      for (let i = 0; i <= segs; i++) {
        // Skip the first point if we already have points, to avoid duplicates
        if (i === 0 && points.length > 0) continue;
        const t = i / segs;
        const angle = startAngle + sweep * t;
        points.push({
          x: acx + R * Math.cos(angle),
          y: acy + R * Math.sin(angle),
        });
      }
    }
  }

  return points;
}

// --- Curb data for curve insides ---

/**
 * Build curb arc data for rendering red/white curbs on curve insides.
 * Returns array of { cx, cy, innerR, outerR, startAngle, sweep } for each curve tile.
 */
export function buildCurbArcs(track) {
  const T = TILE;
  const curbs = [];

  for (const tile of track.tiles) {
    const { gx, gy, dir, type, sign, size } = tile;
    if (type === 'straight' || type === 'grid' || type === 'start' || type === 'finish' || type === 'runoff') continue;

    const fwd = DIR_VEC[dir];
    const lat = sign === 1 ? perpLeft(dir) : perpRight(dir);
    const R = (size - 0.5) * T;

    // Entry point
    const entryX = (gx + 0.5) * T - fwd.x * T * 0.5;
    const entryY = (gy + 0.5) * T - fwd.y * T * 0.5;

    // Arc center
    const cx = entryX + lat.x * R;
    const cy = entryY + lat.y * R;

    // Inner wall radius = R - TILE/2, curb sits just inside the inner wall
    const innerR = R - T / 2;
    const curbWidth = T * 0.12;
    const outerR = innerR + curbWidth;

    const startAngle = Math.atan2(entryY - cy, entryX - cx);
    const sweep = sign === 1 ? -Math.PI / 2 : Math.PI / 2;

    curbs.push({ cx, cy, innerR, outerR, startAngle, sweep });
  }

  return curbs;
}

// --- Brake markers ---

/**
 * Find straights before curves and place brake marker tiles on the grid
 * adjacent to them, on the opposite side of the upcoming turn.
 * Left curve → marker tile to the left of the straight.
 * Right curve → marker tile to the right of the straight.
 * Returns array of { gx, gy, dir, side } — grid cells that should render as brake zones.
 */
export function buildBrakeMarkers(track) {
  const markers = [];
  const tiles = track.tiles;

  // Build set of all occupied cells
  const occupied = new Set();
  for (const tile of tiles) {
    for (const c of tile.cells) {
      occupied.add(`${c.x},${c.y}`);
    }
  }

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    // Only look at curve tiles
    if (tile.type === 'straight' || tile.type === 'grid' || tile.type === 'start' || tile.type === 'finish' || tile.type === 'runoff') continue;

    // Count consecutive straights before this curve
    const straightsBefore = [];
    for (let j = i - 1; j >= 0; j--) {
      if (tiles[j].type === 'straight') {
        straightsBefore.unshift(j);
      } else {
        break;
      }
    }

    if (straightsBefore.length >= 2) {
      const markerTile = tiles[straightsBefore[straightsBefore.length - 2]];
      // Curve sign: +1 = left turn, -1 = right turn
      // Place marker on the OPPOSITE side: right turn → left, left turn → right
      const sideDir = tile.sign > 0 ? turnRight(markerTile.dir) : turnLeft(markerTile.dir);
      const offset = DIR_VEC[sideDir];
      const mgx = markerTile.gx + offset.x;
      const mgy = markerTile.gy + offset.y;

      // Only place if that cell is empty (grass)
      if (!occupied.has(`${mgx},${mgy}`)) {
        occupied.add(`${mgx},${mgy}`);
        markers.push({
          gx: mgx,
          gy: mgy,
          dir: markerTile.dir,
          side: tile.sign > 0 ? 'left' : 'right',
        });
      }
    }
  }

  return markers;
}

// --- Wall paths ---

export function buildWallPaths(centerLine) {
  const halfWidth = TILE / 2;
  const left = [];
  const right = [];

  const n = centerLine.length;
  // Check if the path is a closed loop (first and last points are the same)
  const isLoop = n > 2 &&
    Math.abs(centerLine[0].x - centerLine[n - 1].x) < 1 &&
    Math.abs(centerLine[0].y - centerLine[n - 1].y) < 1;

  for (let i = 0; i < n; i++) {
    // Compute tangent direction at this point
    let tx, ty;
    if (isLoop) {
      // For closed loops, wrap around at endpoints
      const prev = (i - 1 + n) % n;
      const next = (i + 1) % n;
      tx = centerLine[next].x - centerLine[prev].x;
      ty = centerLine[next].y - centerLine[prev].y;
    } else if (i === 0) {
      tx = centerLine[1].x - centerLine[0].x;
      ty = centerLine[1].y - centerLine[0].y;
    } else if (i === n - 1) {
      tx = centerLine[i].x - centerLine[i - 1].x;
      ty = centerLine[i].y - centerLine[i - 1].y;
    } else {
      tx = centerLine[i + 1].x - centerLine[i - 1].x;
      ty = centerLine[i + 1].y - centerLine[i - 1].y;
    }

    // Normalize tangent
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len > 0) {
      tx /= len;
      ty /= len;
    }

    // Perpendicular: left of forward direction
    // In screen coords (Y down), left of (tx,ty) is (-ty, tx)
    const nx = -ty;
    const ny = tx;

    const p = centerLine[i];
    left.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth });
    right.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth });
  }

  // For closed loops, close the wall paths by appending the first point
  if (isLoop) {
    left.push({ x: left[0].x, y: left[0].y });
    right.push({ x: right[0].x, y: right[0].y });
  }

  return { left, right };
}

// --- Wall physics bodies ---

export function createWallBodies(world, walls) {
  const bodies = [];

  function addWallSegments(path) {
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i];
      const p1 = path[i + 1];

      // Skip zero-length segments (e.g. duplicate closing point)
      const segDx = p1.x - p0.x;
      const segDy = p1.y - p0.y;
      if (segDx * segDx + segDy * segDy < 1) continue;

      // Midpoint becomes body position
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;

      // Edge start/end relative to midpoint
      const start = new Vec2(p0.x - mx, p0.y - my);
      const end = new Vec2(p1.x - mx, p1.y - my);

      const shape = new Edge(start, end);
      const body = new Body({
        shape,
        position: { x: mx, y: my },
        isStatic: true,
        userData: { type: 'wall' },
      });

      world.addBody(body);
      bodies.push(body);
    }
  }

  addWallSegments(walls.left);
  addWallSegments(walls.right);

  return bodies;
}
