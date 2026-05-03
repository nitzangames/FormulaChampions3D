import { PX_TO_WORLD, MAX_SPEED } from './constants.js';

// ---------------------------------------------------------------------------
// Pools & state
// ---------------------------------------------------------------------------

let scene3d = null;
let camera3d = null;

// Tire smoke
const SMOKE_POOL_SIZE = 30;
const smokeSprites = [];
const smokeState = []; // { vx, vy, vz, life, maxLife }

// Impact sparks
const SPARK_POOL_SIZE = 15;
const sparkSprites = [];
const sparkState = [];

// Skidmarks — single InstancedMesh with a ring-buffer index. One shared
// geometry + one shared material across all 2000 marks; each spawn writes
// a matrix via setMatrixAt into a pre-allocated Matrix4. Zero per-frame
// allocations even at max drift rate.
const MAX_SKIDMARKS = 2000;
let skidInstancedMesh = null;
let skidWriteIndex = 0;
let skidCount = 0;                   // how many slots have been written to (caps at MAX)
const _skidMatrix = (typeof THREE !== 'undefined') ? new THREE.Matrix4() : null;
const _skidQuat = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
const _skidEuler = (typeof THREE !== 'undefined') ? new THREE.Euler() : null;
const _skidPos = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _skidScale = (typeof THREE !== 'undefined') ? new THREE.Vector3(1, 1, 1) : null;
const _skidHidden = (typeof THREE !== 'undefined') ? new THREE.Matrix4().makeScale(0, 0, 0) : null;

// Groups
let smokeGroup = null;
let sparkGroup = null;
let skidGroup = null;

// ---------------------------------------------------------------------------
// initEffects
// ---------------------------------------------------------------------------

export function initEffects(scene, camera) {
  scene3d = scene;
  camera3d = camera;

  // --- Smoke pool ---
  smokeGroup = new THREE.Group();
  smokeGroup.name = 'effects_smoke';
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.scale.set(0.15, 0.15, 0.15);
    smokeGroup.add(sprite);
    smokeSprites.push(sprite);
    smokeState.push({ vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.4 });
  }
  scene.add(smokeGroup);

  // --- Spark pool ---
  sparkGroup = new THREE.Group();
  sparkGroup.name = 'effects_sparks';
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.scale.set(0.08, 0.08, 0.08);
    sparkGroup.add(sprite);
    sparkSprites.push(sprite);
    sparkState.push({ vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.3 });
  }
  scene.add(sparkGroup);

  // --- Skidmarks: InstancedMesh pool ---
  skidGroup = new THREE.Group();
  skidGroup.name = 'effects_skidmarks';
  const skidGeo = new THREE.PlaneGeometry(0.06, 0.3);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a2a,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  skidInstancedMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDMARKS);
  skidInstancedMesh.count = 0;        // nothing rendered until first spawn
  skidInstancedMesh.frustumCulled = false;
  skidWriteIndex = 0;
  skidCount = 0;
  // Hide all slots up front so garbage initial matrices don't show.
  for (let i = 0; i < MAX_SKIDMARKS; i++) {
    skidInstancedMesh.setMatrixAt(i, _skidHidden);
  }
  skidInstancedMesh.instanceMatrix.needsUpdate = true;
  skidGroup.add(skidInstancedMesh);
  scene.add(skidGroup);
}

// ---------------------------------------------------------------------------
// updateEffects — smoke & sparks per-frame
// ---------------------------------------------------------------------------

export function updateEffects(dt) {
  // Smoke
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    const s = smokeState[i];
    if (s.life <= 0) continue;

    s.life -= dt;
    const sprite = smokeSprites[i];

    if (s.life <= 0) {
      sprite.visible = false;
      continue;
    }

    // Move
    sprite.position.x += s.vx * dt;
    sprite.position.y += s.vy * dt;
    sprite.position.z += s.vz * dt;

    // Fade & scale over lifetime
    const t = 1 - s.life / s.maxLife; // 0 -> 1
    sprite.material.opacity = 0.25 * (1 - t);
    const scl = 0.15 + (0.5 - 0.15) * t;
    sprite.scale.set(scl, scl, scl);
  }

  // Sparks
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    const s = sparkState[i];
    if (s.life <= 0) continue;

    s.life -= dt;
    const sprite = sparkSprites[i];

    if (s.life <= 0) {
      sprite.visible = false;
      continue;
    }

    // Gravity
    s.vy -= 9.8 * dt;

    // Move
    sprite.position.x += s.vx * dt;
    sprite.position.y += s.vy * dt;
    sprite.position.z += s.vz * dt;

    // Fade
    const t = 1 - s.life / s.maxLife;
    sprite.material.opacity = 1 - t;
  }
}

// ---------------------------------------------------------------------------
// spawnSmoke — tire smoke behind rear wheels
// ---------------------------------------------------------------------------

let smokeIndex = 0;

export function spawnSmoke(x2d, y2d, angle) {
  // Spawn two puffs (left and right rear tire)
  for (let side = -1; side <= 1; side += 2) {
    const s = smokeState[smokeIndex];
    const sprite = smokeSprites[smokeIndex];
    smokeIndex = (smokeIndex + 1) % SMOKE_POOL_SIZE;

    // Position behind car (0.8 back) and offset to side (±0.4)
    const backDist = 0.8;
    const sideDist = 0.4;
    const wx = x2d * PX_TO_WORLD + side * sideDist * Math.cos(angle) - backDist * Math.sin(angle);
    const wz = y2d * PX_TO_WORLD + side * sideDist * Math.sin(angle) + backDist * Math.cos(angle);

    sprite.position.set(wx, 0.1, wz);
    sprite.visible = true;
    sprite.material.opacity = 0.6;
    sprite.scale.set(0.2, 0.2, 0.2);

    // Slight upward + random spread
    s.vx = (Math.random() - 0.5) * 0.5;
    s.vy = 0.3 + Math.random() * 0.3;
    s.vz = (Math.random() - 0.5) * 0.5;
    s.life = 0.5;
    s.maxLife = 0.5;
  }
}

// ---------------------------------------------------------------------------
// spawnSparks — collision sparks
// ---------------------------------------------------------------------------

let sparkIndex = 0;

export function spawnSparks(x2d, y2d) {
  const count = 5;
  for (let i = 0; i < count; i++) {
    const s = sparkState[sparkIndex];
    const sprite = sparkSprites[sparkIndex];
    sparkIndex = (sparkIndex + 1) % SPARK_POOL_SIZE;

    const wx = x2d * PX_TO_WORLD;
    const wz = y2d * PX_TO_WORLD;

    sprite.position.set(wx, 0.2, wz);
    sprite.visible = true;
    sprite.material.color.setHex(0xff8800);
    sprite.material.opacity = 1;
    sprite.scale.set(0.08, 0.08, 0.08);

    // Random burst
    s.vx = (Math.random() - 0.5) * 8; // sideways ±4
    s.vy = 1 + Math.random() * 2;     // upward 1-3
    s.vz = (Math.random() - 0.5) * 8;
    s.life = 0.3;
    s.maxLife = 0.3;
  }
}

// ---------------------------------------------------------------------------
// spawnImpactBurst — dramatic car-on-car collision flash
//   · bright yellow-white sparks (wider spread + faster than wall sparks)
//   · 3 smoke puffs for a solid impact silhouette
//   · optional intensity scales count + velocity (default 1.0)
// ---------------------------------------------------------------------------

export function spawnImpactBurst(x2d, y2d, intensity = 1) {
  const wx = x2d * PX_TO_WORLD;
  const wz = y2d * PX_TO_WORLD;

  // Sparks — bright yellow-white, high velocity
  const sparkCount = Math.round(8 * intensity);
  for (let i = 0; i < sparkCount; i++) {
    const s = sparkState[sparkIndex];
    const sprite = sparkSprites[sparkIndex];
    sparkIndex = (sparkIndex + 1) % SPARK_POOL_SIZE;

    sprite.position.set(wx, 0.25, wz);
    sprite.visible = true;
    sprite.material.color.setHex(i % 2 === 0 ? 0xffee88 : 0xffffff);
    sprite.material.opacity = 1;
    const scl = 0.01 + Math.random() * 0.004;
    sprite.scale.set(scl, scl, scl);

    const ang = Math.random() * Math.PI * 2;
    const v = (6 + Math.random() * 6) * intensity;
    s.vx = Math.cos(ang) * v;
    s.vz = Math.sin(ang) * v;
    s.vy = 2 + Math.random() * 3;
    s.life = 0.4;
    s.maxLife = 0.4;
  }

  // Smoke puffs — dense grey cloud for impact silhouette
  const smokeCount = 3;
  for (let i = 0; i < smokeCount; i++) {
    const s = smokeState[smokeIndex];
    const sprite = smokeSprites[smokeIndex];
    smokeIndex = (smokeIndex + 1) % SMOKE_POOL_SIZE;

    sprite.position.set(
      wx + (Math.random() - 0.5) * 0.3,
      0.3,
      wz + (Math.random() - 0.5) * 0.3,
    );
    sprite.visible = true;
    sprite.material.opacity = 0.6;
    sprite.scale.set(0.025, 0.025, 0.025);

    s.vx = (Math.random() - 0.5) * 2;
    s.vz = (Math.random() - 0.5) * 2;
    s.vy = 0.8 + Math.random() * 0.6;
    s.life = 0.6;
    s.maxLife = 0.6;
  }
}

// ---------------------------------------------------------------------------
// addSkidmark
// ---------------------------------------------------------------------------

export function addSkidmark(x2d, y2d, angle, steering) {
  if (Math.abs(steering) < 0.15) return;
  if (!skidInstancedMesh) return;

  for (let side = -1; side <= 1; side += 2) {
    // Car forward in 3D = (sin(angle), 0, -cos(angle))
    // Right of car = (cos(angle), 0, sin(angle))
    const backDist = 0.8;
    const sideDist = 0.4;
    const wx = x2d * PX_TO_WORLD + side * sideDist * Math.cos(angle) - backDist * Math.sin(angle);
    const wz = y2d * PX_TO_WORLD + side * sideDist * Math.sin(angle) + backDist * Math.cos(angle);

    // Write matrix in place: rotation.x=-π/2 (flat) composed with rotation.z=-angle
    // is encoded via Euler 'XYZ'. Vector3/Quaternion/Euler/Matrix4 are all
    // module-scope pre-allocated scratches.
    _skidEuler.set(-Math.PI / 2, 0, -angle, 'XYZ');
    _skidQuat.setFromEuler(_skidEuler);
    _skidPos.set(wx, 0.025, wz);
    _skidMatrix.compose(_skidPos, _skidQuat, _skidScale);

    skidInstancedMesh.setMatrixAt(skidWriteIndex, _skidMatrix);
    skidWriteIndex = (skidWriteIndex + 1) % MAX_SKIDMARKS;
    if (skidCount < MAX_SKIDMARKS) skidCount++;
  }

  // Tell Three the instance matrices changed this frame, and expose the
  // filled range. Once the ring wraps, count stays at MAX and old marks
  // get overwritten in place — no disposal, no array shift, no GC.
  skidInstancedMesh.count = skidCount;
  skidInstancedMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// clearSkidmarks — reset the ring buffer without disposing the pool.
// ---------------------------------------------------------------------------

export function clearSkidmarks() {
  if (!skidInstancedMesh) return;
  for (let i = 0; i < MAX_SKIDMARKS; i++) {
    skidInstancedMesh.setMatrixAt(i, _skidHidden);
  }
  skidInstancedMesh.instanceMatrix.needsUpdate = true;
  skidInstancedMesh.count = 0;
  skidWriteIndex = 0;
  skidCount = 0;
}

// ---------------------------------------------------------------------------
// clearEffects — reset everything
// ---------------------------------------------------------------------------

export function clearEffects() {
  // Hide all smoke
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    smokeSprites[i].visible = false;
    smokeState[i].life = 0;
  }

  // Hide all sparks
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    sparkSprites[i].visible = false;
    sparkState[i].life = 0;
  }

  // Clear skidmarks
  clearSkidmarks();

}
