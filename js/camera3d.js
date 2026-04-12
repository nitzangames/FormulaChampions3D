import {
  CHASE_CAM_DISTANCE,
  CHASE_CAM_HEIGHT,
  CHASE_CAM_LOOK_AHEAD,
  CHASE_CAM_LERP,
  CHASE_CAM_FOV,
  CHASE_CAM_FOV_SPEED_BONUS,
  PX_TO_WORLD,
  MAX_SPEED,
} from './constants.js';

let cam = null;
let currentAngle = 0;
let shakeIntensity = 0;

export function initChaseCamera(camera) {
  cam = camera;
  cam.fov = CHASE_CAM_FOV;
  cam.updateProjectionMatrix();
  currentAngle = 0;
  shakeIntensity = 0;
}

export function updateChaseCamera(x2d, y2d, angle, speed) {
  if (!cam) return;

  // 1. Convert 2D pixel position to 3D world
  const wx = x2d * PX_TO_WORLD;
  const wz = y2d * PX_TO_WORLD;

  // 2. Smooth angle tracking with wrapping
  let angleDiff = angle - currentAngle;
  // Wrap to [-PI, PI]
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  currentAngle += angleDiff * CHASE_CAM_LERP;

  // 3. Car forward direction in 3D (2D angle 0 = north/-Y = -Z in 3D)
  const fwdX = -Math.sin(currentAngle);
  const fwdZ = -Math.cos(currentAngle);

  // 4. Camera position: behind car by CHASE_CAM_DISTANCE, above by CHASE_CAM_HEIGHT
  let camX = wx - fwdX * CHASE_CAM_DISTANCE;
  let camY = CHASE_CAM_HEIGHT;
  let camZ = wz - fwdZ * CHASE_CAM_DISTANCE;

  // Apply shake offset
  if (shakeIntensity >= 0.01) {
    camX += (Math.random() - 0.5) * shakeIntensity;
    camY += (Math.random() - 0.5) * shakeIntensity;
    camZ += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.9;
    if (shakeIntensity < 0.01) shakeIntensity = 0;
  }

  cam.position.set(camX, camY, camZ);

  // 5. Look-at: point ahead of car by CHASE_CAM_LOOK_AHEAD, at y=0.5
  const lookX = wx + fwdX * CHASE_CAM_LOOK_AHEAD;
  const lookY = 0.5;
  const lookZ = wz + fwdZ * CHASE_CAM_LOOK_AHEAD;
  cam.lookAt(lookX, lookY, lookZ);

  // 6. FOV: base FOV + speedRatio * FOV_SPEED_BONUS
  const speedRatio = Math.min(Math.abs(speed) / MAX_SPEED, 1);
  cam.fov = CHASE_CAM_FOV + speedRatio * CHASE_CAM_FOV_SPEED_BONUS;
  cam.updateProjectionMatrix();
}

export function triggerShake(intensity = 0.3) {
  shakeIntensity = intensity;
}

export function resetChaseCamera() {
  currentAngle = 0;
  shakeIntensity = 0;
}
