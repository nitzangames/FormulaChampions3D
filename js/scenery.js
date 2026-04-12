import { PX_TO_WORLD } from './constants.js';

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
 * @param {THREE.Scene} scene
 * @param {{x:number,y:number}[]} centerLine - 2D pixel centerline
 * @param {{left:{x:number,y:number}[], right:{x:number,y:number}[]}} walls
 */
export function buildScenery(scene, centerLine, walls) {
  if (sceneryGroup) disposeScenery();

  sceneryGroup = new THREE.Group();
  scene.add(sceneryGroup);

  const n = centerLine.length;

  // Place trees using the wall path positions, offset outward from the track.
  // This guarantees trees are always outside the walls, even on curves.
  const step = 8;
  for (let i = 0; i < n; i += step) {
    if (Math.random() > 0.6) continue;

    // Get wall positions (wall paths may have an extra closing point)
    const li = Math.min(i, walls.left.length - 1);
    const ri = Math.min(i, walls.right.length - 1);
    const ci = centerLine[i];

    const lw = walls.left[li];
    const rw = walls.right[ri];

    // Direction from center to left wall = outward direction for left side
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

    // Place tree on left side — start from wall position, offset further out
    const extraDist = 2 + Math.random() * 6;
    const leftTree = buildTree();
    leftTree.position.x = lw.x * PX_TO_WORLD + lNx * extraDist;
    leftTree.position.z = lw.y * PX_TO_WORLD + lNz * extraDist;
    leftTree.rotation.y = Math.random() * Math.PI * 2;
    const s1 = 0.8 + Math.random() * 0.6;
    leftTree.scale.set(s1, s1, s1);
    sceneryGroup.add(leftTree);

    // Place tree on right side
    const rightTree = buildTree();
    const extraDist2 = 2 + Math.random() * 6;
    rightTree.position.x = rw.x * PX_TO_WORLD + rNx * extraDist2;
    rightTree.position.z = rw.y * PX_TO_WORLD + rNz * extraDist2;
    rightTree.rotation.y = Math.random() * Math.PI * 2;
    const s2 = 0.8 + Math.random() * 0.6;
    rightTree.scale.set(s2, s2, s2);
    sceneryGroup.add(rightTree);
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
