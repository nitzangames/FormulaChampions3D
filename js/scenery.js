import { PX_TO_WORLD, ROAD_HALF_WIDTH } from './constants.js';

/* global THREE */

let sceneryGroup = null;

/**
 * Build a single low-poly tree as a THREE.Group.
 */
function buildTree() {
  const group = new THREE.Group();

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  group.add(trunk);

  // Bottom foliage
  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x228833 });

  const bottomGeo = new THREE.ConeGeometry(0.9, 1.2, 5);
  const bottom = new THREE.Mesh(bottomGeo, foliageMat);
  bottom.position.y = 1.6;
  bottom.castShadow = true;
  group.add(bottom);

  // Top foliage
  const topGeo = new THREE.ConeGeometry(0.6, 0.9, 5);
  const top = new THREE.Mesh(topGeo, foliageMat);
  top.position.y = 2.4;
  top.castShadow = true;
  group.add(top);

  return group;
}

/**
 * Place trees along both sides of the track.
 * @param {THREE.Scene} scene
 * @param {Array<{x: number, y: number}>} centerLine - 2D pixel coordinates
 */
export function buildScenery(scene, centerLine) {
  // Dispose previous scenery if any
  if (sceneryGroup) {
    disposeScenery();
  }

  sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);

  const len = centerLine.length;

  for (let i = 0; i < len; i += 8) {
    // Skip ~40% of positions for variety
    if (Math.random() > 0.6) continue;

    const cur = centerLine[i];
    const next = centerLine[(i + 1) % len];

    // Track direction in world coords
    const dx = (next.x - cur.x) * PX_TO_WORLD;
    const dy = (next.y - cur.y) * PX_TO_WORLD;
    const dirLen = Math.sqrt(dx * dx + dy * dy);
    if (dirLen < 0.0001) continue;

    // Perpendicular direction (in XZ plane: swap and negate)
    const perpX = -dy / dirLen;
    const perpZ = dx / dirLen;

    // Center position in world coords
    const cx = cur.x * PX_TO_WORLD;
    const cz = cur.y * PX_TO_WORLD;

    // Place a tree on each side
    for (const side of [-1, 1]) {
      const dist = ROAD_HALF_WIDTH + 3 + Math.random() * 9; // 3 to 12 offset
      const tree = buildTree();

      tree.position.x = cx + perpX * side * dist;
      tree.position.z = cz + perpZ * side * dist;
      tree.position.y = 0;

      tree.rotation.y = Math.random() * Math.PI * 2;

      const s = 0.8 + Math.random() * 0.6; // 0.8 to 1.4
      tree.scale.set(s, s, s);

      sceneryGroup.add(tree);
    }
  }
}

/**
 * Remove and dispose all scenery meshes.
 */
export function disposeScenery() {
  if (!sceneryGroup) return;

  sceneryGroup.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  });

  if (sceneryGroup.parent) {
    sceneryGroup.parent.remove(sceneryGroup);
  }

  sceneryGroup = null;
}
