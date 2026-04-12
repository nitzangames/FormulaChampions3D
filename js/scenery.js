import { PX_TO_WORLD, TILE } from './constants.js';

let sceneryGroup = null;

function buildTree() {
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x228833 });

  const bottomGeo = new THREE.ConeGeometry(0.9, 1.2, 5);
  const bottom = new THREE.Mesh(bottomGeo, foliageMat);
  bottom.position.y = 1.6;
  bottom.castShadow = true;
  group.add(bottom);

  const topGeo = new THREE.ConeGeometry(0.6, 0.9, 5);
  const top = new THREE.Mesh(topGeo, foliageMat);
  top.position.y = 2.4;
  top.castShadow = true;
  group.add(top);

  return group;
}

/**
 * Place trees along both sides of the track, offset from the actual wall paths.
 * Skips any position that falls inside a track tile (prevents trees on
 * adjacent track sections).
 * @param {THREE.Scene} scene
 * @param {{x:number,y:number}[]} centerLine - 2D pixel centerline
 * @param {{left:{x:number,y:number}[], right:{x:number,y:number}[]}} walls
 * @param {object} track - track data with tiles array (for tile occupancy check)
 */
export function buildScenery(scene, centerLine, walls, track) {
  if (sceneryGroup) disposeScenery();

  sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);

  // Build a set of occupied grid cells for fast lookup
  const occupied = new Set();
  if (track && track.tiles) {
    for (const tile of track.tiles) {
      if (tile.cells) {
        for (const cell of tile.cells) {
          occupied.add(cell.x + ',' + cell.y);
        }
      }
    }
  }

  // Convert a world-unit position back to grid cell coordinates
  function worldToGridCell(wx, wz) {
    const px = wx / PX_TO_WORLD;
    const py = wz / PX_TO_WORLD;
    // Tile grid: each cell is TILE pixels. Tiles center at (gx*TILE + TILE/2, gy*TILE + TILE/2)
    // So cell gx = floor(px / TILE), gy = floor(py / TILE)
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
  }

  function isInTrack(wx, wz) {
    const cell = worldToGridCell(wx, wz);
    return occupied.has(cell.x + ',' + cell.y);
  }

  function tryPlaceTree(wx, wz) {
    if (isInTrack(wx, wz)) return;
    const tree = buildTree();
    tree.position.x = wx;
    tree.position.z = wz;
    tree.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.6;
    tree.scale.set(s, s, s);
    sceneryGroup.add(tree);
  }

  const n = centerLine.length;
  const step = 8;
  for (let i = 0; i < n; i += step) {
    if (Math.random() > 0.6) continue;

    const li = Math.min(i, walls.left.length - 1);
    const ri = Math.min(i, walls.right.length - 1);
    const ci = centerLine[i];

    const lw = walls.left[li];
    const rw = walls.right[ri];

    // Outward direction from centerline to left wall (normalized)
    const ldx = (lw.x - ci.x) * PX_TO_WORLD;
    const ldz = (lw.y - ci.y) * PX_TO_WORLD;
    const lLen = Math.sqrt(ldx * ldx + ldz * ldz) || 1;
    const lNx = ldx / lLen;
    const lNz = ldz / lLen;

    const rdx = (rw.x - ci.x) * PX_TO_WORLD;
    const rdz = (rw.y - ci.y) * PX_TO_WORLD;
    const rLen = Math.sqrt(rdx * rdx + rdz * rdz) || 1;
    const rNx = rdx / rLen;
    const rNz = rdz / rLen;

    // Left-side tree
    const d1 = 2 + Math.random() * 6;
    const lx = lw.x * PX_TO_WORLD + lNx * d1;
    const lz = lw.y * PX_TO_WORLD + lNz * d1;
    tryPlaceTree(lx, lz);

    // Right-side tree
    const d2 = 2 + Math.random() * 6;
    const rx = rw.x * PX_TO_WORLD + rNx * d2;
    const rz = rw.y * PX_TO_WORLD + rNz * d2;
    tryPlaceTree(rx, rz);
  }
}

export function disposeScenery() {
  if (!sceneryGroup) return;
  sceneryGroup.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  });
  if (sceneryGroup.parent) sceneryGroup.parent.remove(sceneryGroup);
  sceneryGroup = null;
}
