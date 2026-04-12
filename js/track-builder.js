import { PX_TO_WORLD, ROAD_HALF_WIDTH, WALL_HEIGHT, WALL_BLOCK_LENGTH } from './constants.js';

let trackGroup = null;

/**
 * Remove and dispose all track geometry.
 */
export function disposeTrack() {
  if (!trackGroup) return;
  trackGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
  if (trackGroup.parent) trackGroup.parent.remove(trackGroup);
  trackGroup = null;
}

/**
 * Build all 3D track geometry from a 2D centerline and add to scene.
 */
export function buildTrack(scene, centerLine, track) {
  disposeTrack();
  trackGroup = new THREE.Group();

  const n = centerLine.length;

  // Precompute 3D positions
  const pos = [];
  for (let i = 0; i < n; i++) {
    pos.push({
      x: centerLine[i].x * PX_TO_WORLD,
      z: centerLine[i].y * PX_TO_WORLD,
    });
  }

  // Smoothed perpendiculars — average direction from previous and next segments
  // to avoid sharp kinks at waypoint junctions
  const perps = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;

    // Average of incoming and outgoing direction
    const dx = pos[next].x - pos[prev].x;
    const dz = pos[next].z - pos[prev].z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    // Perpendicular (left of forward): rotate 90 CCW
    perps.push({ px: -dz / len, pz: dx / len });
  }

  // Forward directions per segment (i → i+1)
  const dirs = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = pos[next].x - pos[i].x;
    const dz = pos[next].z - pos[i].z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    dirs.push({ dx: dx / len, dz: dz / len });
  }

  buildRoadSurface(pos, perps, n);
  buildCenterDashes(pos, dirs, n);
  buildWalls(pos, perps, n);
  buildStartFinishLine(pos, dirs, perps);

  scene.add(trackGroup);
  return trackGroup;
}

// ── Road Surface ──────────────────────────────────────────────────────────────

function buildRoadSurface(pos, perps, n) {
  const vertices = [];
  const indices = [];

  for (let i = 0; i < n; i++) {
    const p = pos[i];
    const perp = perps[i];
    vertices.push(
      p.x + perp.px * ROAD_HALF_WIDTH, 0.01, p.z + perp.pz * ROAD_HALF_WIDTH,
      p.x - perp.px * ROAD_HALF_WIDTH, 0.01, p.z - perp.pz * ROAD_HALF_WIDTH
    );
  }

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const i0 = i * 2, i1 = i * 2 + 1;
    const i2 = next * 2, i3 = next * 2 + 1;
    indices.push(i0, i2, i1);
    indices.push(i1, i2, i3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x444444 }));
  mesh.receiveShadow = true;
  trackGroup.add(mesh);
}

// ── Dashed Center Line ────────────────────────────────────────────────────────

function buildCenterDashes(pos, dirs, n) {
  const dashLen = 0.8;
  const gapLen = 0.8;
  const dashWidth = 0.08;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  let inDash = true;
  let remaining = dashLen;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = pos[next].x - pos[i].x;
    const dz = pos[next].z - pos[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    let walked = 0;
    while (walked < segLen) {
      const step = Math.min(remaining, segLen - walked);
      if (inDash) {
        const startT = walked / segLen;
        const endT = (walked + step) / segLen;
        const midT = (startT + endT) / 2;
        const mx = pos[i].x + dx * midT;
        const mz = pos[i].z + dz * midT;
        const angle = Math.atan2(dx, dz);

        const geo = new THREE.PlaneGeometry(dashWidth, step);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -angle;
        mesh.position.set(mx, 0.02, mz);
        trackGroup.add(mesh);
      }
      walked += step;
      remaining -= step;
      if (remaining <= 0.001) {
        inDash = !inDash;
        remaining = inDash ? dashLen : gapLen;
      }
    }
  }
}

// ── Walls / Barriers ──────────────────────────────────────────────────────────

function buildWalls(pos, perps, n) {
  const redMat = new THREE.MeshLambertMaterial({ color: 0xee3333 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wallOffset = ROAD_HALF_WIDTH + 0.2;

  // Walk along the centerline and place wall blocks at regular arc-length intervals.
  // Each block is positioned at a centerline point and oriented by the smoothed
  // perpendicular at that point, so they follow curves correctly.

  let accumulated = 0;
  let blockIndex = 0;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = pos[next].x - pos[i].x;
    const dz = pos[next].z - pos[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    // Walk along this segment
    let walked = 0;
    while (walked < segLen) {
      const distToNext = WALL_BLOCK_LENGTH - accumulated;
      const canWalk = segLen - walked;

      if (canWalk >= distToNext) {
        // Place a block here
        walked += distToNext;
        accumulated = 0;

        const t = walked / segLen;
        const bx = pos[i].x + dx * t;
        const bz = pos[i].z + dz * t;

        // Interpolate perpendicular between current and next waypoint
        const perp = lerpPerp(perps[i], perps[next], t);

        // Block orientation: face along the track
        const angle = Math.atan2(dx, dz);
        const blockMat = blockIndex % 2 === 0 ? redMat : whiteMat;
        const blockGeo = new THREE.BoxGeometry(0.25, WALL_HEIGHT, WALL_BLOCK_LENGTH * 0.92);

        // Left wall
        const left = new THREE.Mesh(blockGeo, blockMat);
        left.position.set(
          bx + perp.px * wallOffset,
          WALL_HEIGHT / 2,
          bz + perp.pz * wallOffset
        );
        left.rotation.y = Math.PI - angle;
        left.castShadow = true;
        trackGroup.add(left);

        // Right wall
        const right = new THREE.Mesh(blockGeo, blockMat);
        right.position.set(
          bx - perp.px * wallOffset,
          WALL_HEIGHT / 2,
          bz - perp.pz * wallOffset
        );
        right.rotation.y = Math.PI - angle;
        right.castShadow = true;
        trackGroup.add(right);

        blockIndex++;
      } else {
        // Not enough distance for next block — accumulate and move on
        accumulated += canWalk;
        break;
      }
    }
  }
}

function lerpPerp(a, b, t) {
  const px = a.px + (b.px - a.px) * t;
  const pz = a.pz + (b.pz - a.pz) * t;
  const len = Math.sqrt(px * px + pz * pz) || 1;
  return { px: px / len, pz: pz / len };
}

// ── Start / Finish Line ───────────────────────────────────────────────────────

function buildStartFinishLine(pos, dirs, perps) {
  const idx = 2;
  if (idx >= pos.length) return;

  const p = pos[idx];
  const dir = dirs[idx];
  const perp = perps[idx];

  const totalWidth = ROAD_HALF_WIDTH * 2;
  const cols = 8;
  const rows = 2;
  const cellW = totalWidth / cols;
  const cellH = cellW;
  const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const angle = Math.atan2(dir.dx, dir.dz);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBlack = (r + c) % 2 === 0;
      const geo = new THREE.PlaneGeometry(cellW, cellH);
      const mesh = new THREE.Mesh(geo, isBlack ? blackMat : whiteMat);

      const perpOffset = (c - (cols - 1) / 2) * cellW;
      const fwdOffset = (r - (rows - 1) / 2) * cellH;

      mesh.position.set(
        p.x + perp.px * perpOffset + dir.dx * fwdOffset,
        0.025,
        p.z + perp.pz * perpOffset + dir.dz * fwdOffset
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -angle;
      trackGroup.add(mesh);
    }
  }
}
