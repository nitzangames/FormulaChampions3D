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

// Skidmarks
const MAX_SKIDMARKS = 200;
const skidmarks = []; // { mesh }

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
      opacity: 0.6,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.scale.set(0.2, 0.2, 0.2);
    smokeGroup.add(sprite);
    smokeSprites.push(sprite);
    smokeState.push({ vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.5 });
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

  // --- Skidmark group ---
  skidGroup = new THREE.Group();
  skidGroup.name = 'effects_skidmarks';
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
    sprite.material.opacity = 0.6 * (1 - t);
    const scl = 0.2 + (0.8 - 0.2) * t;
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
// addSkidmark
// ---------------------------------------------------------------------------

export function addSkidmark(x2d, y2d, angle, steering) {
  if (Math.abs(steering) < 0.15) return;

  for (let side = -1; side <= 1; side += 2) {
    // Car forward in 3D = (sin(angle), 0, -cos(angle))
    // Right of car = (cos(angle), 0, sin(angle))
    // Position = car + Right*side*0.4 - Forward*backDist
    const backDist = 0.8;
    const sideDist = 0.4;
    const wx = x2d * PX_TO_WORLD + side * sideDist * Math.cos(angle) - backDist * Math.sin(angle);
    const wz = y2d * PX_TO_WORLD + side * sideDist * Math.sin(angle) + backDist * Math.cos(angle);

    const geo = new THREE.PlaneGeometry(0.06, 0.3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Flat on road
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -angle;
    mesh.position.set(wx, 0.015, wz);

    skidGroup.add(mesh);
    skidmarks.push({ mesh, geo, mat });

    // Enforce max
    if (skidmarks.length > MAX_SKIDMARKS) {
      const old = skidmarks.shift();
      skidGroup.remove(old.mesh);
      old.geo.dispose();
      old.mat.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
// clearSkidmarks
// ---------------------------------------------------------------------------

export function clearSkidmarks() {
  for (const sm of skidmarks) {
    skidGroup.remove(sm.mesh);
    sm.geo.dispose();
    sm.mat.dispose();
  }
  skidmarks.length = 0;
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
