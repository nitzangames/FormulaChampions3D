import { CAR_W, CAR_H, PX_TO_WORLD } from './constants.js';

// Physics debug: draw the 2D capsule outline of each car in 3D.
// Renders on top of the car at a slight y-offset so it's visible.

const debugLines = [];     // one Line per car
let debugGroup = null;

function buildCapsuleOutline(color) {
  // Capsule dims (match car.js): radius = CAR_W/2, length = CAR_H - 2*radius
  const radius = (CAR_W * 0.5) * PX_TO_WORLD;
  const length = (CAR_H - CAR_W) * PX_TO_WORLD;
  const halfLen = length * 0.5;

  // Build perimeter points. Capsule aligned with +Z as forward (long axis),
  // so in local XZ plane: two semicircles at z = ±halfLen, connected by
  // straight lines at x = ±radius.
  const pts = [];
  const segs = 12; // semicircle segments

  // Right straight (from back-right to front-right)
  pts.push(new THREE.Vector3(radius, 0, -halfLen));
  pts.push(new THREE.Vector3(radius, 0, halfLen));

  // Front semicircle (from right, sweeping around to left)
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const a = -Math.PI / 2 + t * Math.PI; // -90° → +90°
    pts.push(new THREE.Vector3(
      radius * Math.cos(a),
      0,
      halfLen + radius * Math.sin(a),
    ));
  }

  // Left straight (front-left to back-left)
  pts.push(new THREE.Vector3(-radius, 0, -halfLen));

  // Back semicircle (from left, sweeping to right)
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const a = Math.PI / 2 + t * Math.PI;
    pts.push(new THREE.Vector3(
      radius * Math.cos(a),
      0,
      -halfLen + radius * Math.sin(a),
    ));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geo, mat);
}

export function initPhysicsDebug(scene, count) {
  if (debugGroup) disposePhysicsDebug();
  debugGroup = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const color = i === 0 ? 0x00ff00 : 0xff00ff; // green player, magenta AI
    const line = buildCapsuleOutline(color);
    debugGroup.add(line);
    debugLines.push(line);
  }
  scene.add(debugGroup);
}

/**
 * Update the debug outlines to match physics positions.
 * @param {Car[]} cars - array of Car instances
 */
export function updatePhysicsDebug(cars) {
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const line = debugLines[i];
    if (!car || !line) continue;
    // Use physX/physY (actual physics position, not interpolated render)
    line.position.x = car.physX * PX_TO_WORLD;
    line.position.z = car.physY * PX_TO_WORLD;
    line.position.y = 0.25; // above the road so it's visible
    // Rotate to match the car's visual angle
    line.rotation.y = -car.angle;
  }
}

export function disposePhysicsDebug() {
  if (!debugGroup) return;
  for (const line of debugLines) {
    if (line.geometry) line.geometry.dispose();
    if (line.material) line.material.dispose();
  }
  debugLines.length = 0;
  if (debugGroup.parent) debugGroup.parent.remove(debugGroup);
  debugGroup = null;
}
