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
 * @param {THREE.Scene} scene
 * @param {Array<{x:number, y:number}>} centerLine - pixel coordinates forming a closed loop
 * @param {object} track - track object from generateTrack
 * @returns {THREE.Group}
 */
export function buildTrack(scene, centerLine, track) {
  // Dispose previous if any
  disposeTrack();

  trackGroup = new THREE.Group();

  const n = centerLine.length;

  // Precompute 3D positions and direction data for each centerline point
  const positions = []; // {x, z} in world coords
  const directions = []; // {dx, dz} normalized direction to next point
  const perpendiculars = []; // {px, pz} perpendicular (left) vector

  for (let i = 0; i < n; i++) {
    positions.push({
      x: centerLine[i].x * PX_TO_WORLD,
      z: centerLine[i].y * PX_TO_WORLD,
    });
  }

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = positions[next].x - positions[i].x;
    const dz = positions[next].z - positions[i].z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0) {
      directions.push({ dx: dx / len, dz: dz / len });
      // Perpendicular left: rotate direction 90 degrees CCW in XZ plane
      // direction (dx, dz) -> perp (-dz, dx)
      perpendiculars.push({ px: -dz / len, pz: dx / len });
    } else {
      directions.push({ dx: 0, dz: 1 });
      perpendiculars.push({ px: -1, pz: 0 });
    }
  }

  // 1. Road Surface
  buildRoadSurface(positions, perpendiculars, n);

  // 2. Dashed Center Line
  buildCenterDashes(positions, directions, n);

  // 3. Walls/Barriers
  buildWalls(positions, directions, perpendiculars, n);

  // 4. Start/Finish Line
  buildStartFinishLine(positions, directions, perpendiculars);

  scene.add(trackGroup);
  return trackGroup;
}

function buildRoadSurface(positions, perpendiculars, n) {
  const geo = new THREE.BufferGeometry();
  const vertices = [];
  const indices = [];

  for (let i = 0; i < n; i++) {
    const p = positions[i];
    const perp = perpendiculars[i];

    // Left edge vertex
    vertices.push(
      p.x + perp.px * ROAD_HALF_WIDTH,
      0.01,
      p.z + perp.pz * ROAD_HALF_WIDTH
    );
    // Right edge vertex
    vertices.push(
      p.x - perp.px * ROAD_HALF_WIDTH,
      0.01,
      p.z - perp.pz * ROAD_HALF_WIDTH
    );
  }

  // Stitch into triangles
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const i0 = i * 2;     // current left
    const i1 = i * 2 + 1; // current right
    const i2 = next * 2;     // next left
    const i3 = next * 2 + 1; // next right

    // Two triangles per segment
    indices.push(i0, i2, i1);
    indices.push(i1, i2, i3);
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  trackGroup.add(mesh);
}

function buildCenterDashes(positions, directions, n) {
  const dashLength = 0.8;
  const dashWidth = 0.08;
  const gapLength = 0.8;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  let inDash = true;
  let remaining = dashLength;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = positions[next].x - positions[i].x;
    const dz = positions[next].z - positions[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    let walked = 0;
    while (walked < segLen) {
      const canWalk = Math.min(remaining, segLen - walked);
      if (inDash) {
        // Place a dash at the midpoint of the portion we're about to walk
        const startT = walked / segLen;
        const endT = (walked + canWalk) / segLen;
        const midT = (startT + endT) / 2;

        const mx = positions[i].x + dx * midT;
        const mz = positions[i].z + dz * midT;

        const geo = new THREE.PlaneGeometry(dashWidth, canWalk);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;

        // Rotate to face track direction
        const angle = Math.atan2(dx, dz);
        mesh.rotation.z = -angle;

        mesh.position.set(mx, 0.02, mz);
        trackGroup.add(mesh);
      }

      walked += canWalk;
      remaining -= canWalk;

      if (remaining <= 0.001) {
        inDash = !inDash;
        remaining = inDash ? dashLength : gapLength;
      }
    }

  }
}

function buildWalls(positions, directions, perpendiculars, n) {
  const redMat = new THREE.MeshLambertMaterial({ color: 0xee3333 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wallOffset = ROAD_HALF_WIDTH + 0.15;
  const blockGeo = new THREE.BoxGeometry(0.3, WALL_HEIGHT, WALL_BLOCK_LENGTH * 0.95);

  let blockIndex = 0;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = positions[next].x - positions[i].x;
    const dz = positions[next].z - positions[i].z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;

    let walked = 0;
    while (walked + WALL_BLOCK_LENGTH <= segLen + 0.001) {
      const t = (walked + WALL_BLOCK_LENGTH / 2) / segLen;
      if (t > 1) break;

      const cx = positions[i].x + dx * t;
      const cz = positions[i].z + dz * t;

      const perp = perpendiculars[i];

      const angle = Math.atan2(dx, dz);
      const mat = blockIndex % 2 === 0 ? redMat : whiteMat;

      // Left wall
      const leftMesh = new THREE.Mesh(blockGeo, mat);
      leftMesh.position.set(
        cx + perp.px * wallOffset,
        WALL_HEIGHT / 2,
        cz + perp.pz * wallOffset
      );
      leftMesh.rotation.y = Math.PI - angle;
      leftMesh.castShadow = true;
      trackGroup.add(leftMesh);

      // Right wall
      const rightMesh = new THREE.Mesh(blockGeo, mat);
      rightMesh.position.set(
        cx - perp.px * wallOffset,
        WALL_HEIGHT / 2,
        cz - perp.pz * wallOffset
      );
      rightMesh.rotation.y = Math.PI - angle;
      rightMesh.castShadow = true;
      trackGroup.add(rightMesh);

      walked += WALL_BLOCK_LENGTH;
      blockIndex++;
    }
  }
}

function buildStartFinishLine(positions, directions, perpendiculars) {
  // Place at waypoint index 2
  const idx = 2;
  if (idx >= positions.length) return;

  const p = positions[idx];
  const dir = directions[idx];
  const perp = perpendiculars[idx];

  const totalWidth = ROAD_HALF_WIDTH * 2;
  const cols = 8;
  const rows = 2;
  const cellW = totalWidth / cols;
  const cellH = totalWidth / cols; // square cells
  const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

  const angle = Math.atan2(dir.dx, dir.dz);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBlack = (r + c) % 2 === 0;
      const mat = isBlack ? blackMat : whiteMat;
      const geo = new THREE.PlaneGeometry(cellW, cellH);
      const mesh = new THREE.Mesh(geo, mat);

      // Position relative to center of the start line
      // Perpendicular direction = across the road (columns)
      // Forward direction = along the road (rows)
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
