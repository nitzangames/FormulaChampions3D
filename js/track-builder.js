import { PX_TO_WORLD, WALL_HEIGHT, WALL_BLOCK_LENGTH } from './constants.js';

let trackGroup = null;

export function disposeTrack() {
  if (!trackGroup) return;
  trackGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  if (trackGroup.parent) trackGroup.parent.remove(trackGroup);
  trackGroup = null;
}

/**
 * Build 3D track from the 2D centerline and wall paths.
 * Uses the actual wall paths (left/right) from track.js so the visuals
 * match the physics collision geometry exactly.
 *
 * @param {THREE.Scene} scene
 * @param {{x:number,y:number}[]} centerLine - 2D pixel waypoints (closed loop)
 * @param {{left:{x:number,y:number}[], right:{x:number,y:number}[]}} walls - from buildWallPaths
 * @param {object} track - track data (unused for now, reserved)
 */
export function buildTrack(scene, centerLine, walls, track) {
  disposeTrack();
  trackGroup = new THREE.Group();

  // Convert all paths to 3D world coords once
  const center = centerLine.map(p => ({ x: p.x * PX_TO_WORLD, z: p.y * PX_TO_WORLD }));
  const left = walls.left.map(p => ({ x: p.x * PX_TO_WORLD, z: p.y * PX_TO_WORLD }));
  const right = walls.right.map(p => ({ x: p.x * PX_TO_WORLD, z: p.y * PX_TO_WORLD }));

  buildRoadSurface(left, right);
  buildCenterDashes(center);
  buildWallBlocks(left, right);
  buildStartFinishLine(center);

  scene.add(trackGroup);
  return trackGroup;
}

// ── Road Surface ──────────────────────────────────────────────────────────────
// Build from actual left/right wall paths so the road matches collision exactly.

function buildRoadSurface(left, right) {
  // left and right should have the same length (both derived from centerLine)
  const n = Math.min(left.length, right.length);
  const vertices = [];
  const indices = [];

  for (let i = 0; i < n; i++) {
    vertices.push(left[i].x, 0.01, left[i].z);
    vertices.push(right[i].x, 0.01, right[i].z);
  }

  // The wall paths include a closing duplicate point, so n-1 segments
  for (let i = 0; i < n - 1; i++) {
    const i0 = i * 2, i1 = i * 2 + 1;
    const i2 = (i + 1) * 2, i3 = (i + 1) * 2 + 1;
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

// ── Center Dashes ─────────────────────────────────────────────────────────────

function buildCenterDashes(center) {
  const dashLen = 0.8;
  const gapLen = 0.8;
  const dashWidth = 0.08;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  let inDash = true;
  let remaining = dashLen;
  const n = center.length;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = center[next].x - center[i].x;
    const dz = center[next].z - center[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    let walked = 0;
    while (walked < segLen) {
      const step = Math.min(remaining, segLen - walked);
      if (inDash && step > 0.05) {
        const midT = (walked + step / 2) / segLen;
        const mx = center[i].x + dx * midT;
        const mz = center[i].z + dz * midT;
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

// ── Wall Blocks ───────────────────────────────────────────────────────────────
// Place red/white alternating blocks along the actual wall paths.

function buildWallBlocks(left, right) {
  const redMat = new THREE.MeshLambertMaterial({ color: 0xee3333 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  placeBlocksAlongPath(left, redMat, whiteMat, 0);
  placeBlocksAlongPath(right, redMat, whiteMat, 0);
}

function placeBlocksAlongPath(path, redMat, whiteMat, startIndex) {
  const n = path.length;
  let accumulated = 0;
  let blockIndex = startIndex;

  for (let i = 0; i < n - 1; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dz = path[i + 1].z - path[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    let walked = 0;
    while (walked < segLen) {
      const distToNext = WALL_BLOCK_LENGTH - accumulated;
      const remaining = segLen - walked;

      if (remaining >= distToNext) {
        walked += distToNext;
        accumulated = 0;

        const t = walked / segLen;
        const bx = path[i].x + dx * t;
        const bz = path[i].z + dz * t;
        const angle = Math.atan2(dx, dz);

        const blockMat = blockIndex % 2 === 0 ? redMat : whiteMat;
        const geo = new THREE.BoxGeometry(0.2, WALL_HEIGHT, WALL_BLOCK_LENGTH * 0.92);
        const mesh = new THREE.Mesh(geo, blockMat);
        mesh.position.set(bx, WALL_HEIGHT / 2, bz);
        mesh.rotation.y = Math.PI - angle;
        mesh.castShadow = true;
        trackGroup.add(mesh);

        blockIndex++;
      } else {
        accumulated += remaining;
        break;
      }
    }
  }
}

// ── Start / Finish Line ───────────────────────────────────────────────────────

function buildStartFinishLine(center) {
  const idx = 2;
  if (idx + 1 >= center.length) return;

  const p = center[idx];
  const next = center[idx + 1];
  const dx = next.x - p.x;
  const dz = next.z - p.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const dirX = dx / len;
  const dirZ = dz / len;
  // Perpendicular
  const perpX = -dirZ;
  const perpZ = dirX;

  const angle = Math.atan2(dx, dz);

  // Measure actual road width at this point — use a generous width
  // based on the wall path offset (TILE/2 in pixels)
  const halfWidth = 256 * PX_TO_WORLD; // TILE/2 in world units
  const totalWidth = halfWidth * 2;
  const cols = 8;
  const rows = 2;
  const cellW = totalWidth / cols;
  const cellH = cellW;
  const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBlack = (r + c) % 2 === 0;
      const geo = new THREE.PlaneGeometry(cellW, cellH);
      const mesh = new THREE.Mesh(geo, isBlack ? blackMat : whiteMat);

      const perpOffset = (c - (cols - 1) / 2) * cellW;
      const fwdOffset = (r - (rows - 1) / 2) * cellH;

      mesh.position.set(
        p.x + perpX * perpOffset + dirX * fwdOffset,
        0.025,
        p.z + perpZ * perpOffset + dirZ * fwdOffset
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -angle;
      trackGroup.add(mesh);
    }
  }
}
