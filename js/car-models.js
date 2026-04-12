import { PX_TO_WORLD } from './constants.js';

// Single F1-style car model (Trapezoidal/v7 from brainstorm session).
// All cars on the grid use this builder with different body colors.

export const CAR_STYLE_NAMES = ['Formula'];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmat(color) {
  return new THREE.MeshPhongMaterial({
    color, flatShading: true, shininess: 20, side: THREE.DoubleSide,
  });
}

function buildCustomGeo(vertices, faces) {
  const geo = new THREE.BufferGeometry();
  const verts = [];
  for (const f of faces) for (const i of f) verts.push(...vertices[i]);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

function addMesh(g, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

// ── F1 Car Model ───────────────────────────────────────────────────────────

function buildFormula(color) {
  const g = new THREE.Group();
  const body = fmat(color);
  const dark = fmat(0x222222);
  const white = fmat(0xeeeeee);
  const silver = fmat(0x888888);

  // Cross-section parameters along Z (rear at +Z, nose at -Z)
  const rearTop = 0.55, rearBot = 0.12, rearHT = 0.2, rearHB = 0.4;
  const midTop = 0.52, midBot = 0.12, midHT = 0.22, midHB = 0.44;
  const nbTop = 0.32, nbBot = 0.15, nbHT = 0.2, nbHB = 0.3;
  const nmTop = 0.22, nmBot = 0.16, nmHT = 0.1, nmHB = 0.14;
  const neTop = 0.16, neBot = 0.14, neHT = 0.05, neHB = 0.07;

  const verts = [
    // Rear (0-3)
    [-rearHT, rearTop, 0.9], [rearHT, rearTop, 0.9],
    [rearHB, rearBot, 0.9], [-rearHB, rearBot, 0.9],
    // Mid (4-7)
    [-midHT, midTop, -0.1], [midHT, midTop, -0.1],
    [midHB, midBot, -0.1], [-midHB, midBot, -0.1],
    // Nose base (8-11)
    [-nbHT, nbTop, -1.1], [nbHT, nbTop, -1.1],
    [nbHB, nbBot, -1.1], [-nbHB, nbBot, -1.1],
    // Nose mid (12-15)
    [-nmHT, nmTop, -1.35], [nmHT, nmTop, -1.35],
    [nmHB, nmBot, -1.35], [-nmHB, nmBot, -1.35],
    // Nose end at front wing (16-19)
    [-neHT, neTop, -1.55], [neHT, neTop, -1.55],
    [neHB, neBot, -1.55], [-neHB, neBot, -1.55],
  ];
  const faces = [
    // Rear → mid
    [0, 4, 5], [0, 5, 1],
    [1, 5, 6], [1, 6, 2],
    [2, 6, 7], [2, 7, 3],
    [3, 7, 4], [3, 4, 0],
    // Mid → nose base
    [4, 8, 9], [4, 9, 5],
    [5, 9, 10], [5, 10, 6],
    [6, 10, 11], [6, 11, 7],
    [7, 11, 8], [7, 8, 4],
    // Nose base → nose mid
    [8, 12, 13], [8, 13, 9],
    [9, 13, 14], [9, 14, 10],
    [10, 14, 15], [10, 15, 11],
    [11, 15, 12], [11, 12, 8],
    // Nose mid → nose end
    [12, 16, 17], [12, 17, 13],
    [13, 17, 18], [13, 18, 14],
    [14, 18, 19], [14, 19, 15],
    [15, 19, 16], [15, 16, 12],
    // End cap
    [16, 17, 18], [16, 18, 19],
    // Rear cap
    [0, 1, 2], [0, 2, 3],
  ];
  addMesh(g, buildCustomGeo(verts, faces), body, 0, 0, 0);

  // Side pods (left and right)
  for (const side of [-1, 1]) {
    const pv = [
      [side * 0.25, 0.1, -0.5],
      [side * 0.6, 0.1, -0.2],
      [side * 0.25, 0.28, -0.5],
      [side * 0.6, 0.25, -0.2],
      [side * 0.25, 0.1, 0.7],
      [side * 0.55, 0.1, 0.6],
      [side * 0.25, 0.28, 0.7],
      [side * 0.55, 0.25, 0.6],
    ];
    const pf = [
      [0, 2, 3], [0, 3, 1],
      [4, 5, 7], [4, 7, 6],
      [0, 4, 6], [0, 6, 2],
      [1, 3, 7], [1, 7, 5],
      [2, 6, 7], [2, 7, 3],
      [0, 1, 5], [0, 5, 4],
    ];
    if (side === -1) pf.forEach(f => f.reverse());
    addMesh(g, buildCustomGeo(pv, pf), body, 0, 0, 0);
  }

  // Driver helmet
  addMesh(g, new THREE.IcosahedronGeometry(0.13, 0), white, 0, 0.65, -0.1);

  // Airbox (wedge behind driver)
  const abv = [
    [-0.13, 0.52, 0.15], [0.13, 0.52, 0.15], [0, 0.8, 0.1],
    [-0.13, 0.5, 0.45], [0.13, 0.5, 0.45], [0, 0.72, 0.45],
  ];
  const abf = [
    [0, 2, 1], [3, 4, 5],
    [0, 1, 4], [0, 4, 3],
    [1, 2, 5], [1, 5, 4],
    [2, 0, 3], [2, 3, 5],
  ];
  addMesh(g, buildCustomGeo(abv, abf), dark, 0, 0, 0);

  // Central pylon: body → rear wing underside (shark fin style)
  const cpv = [
    [-0.05, 0.2, 0.2], [0.05, 0.2, 0.2],
    [-0.05, 0.2, 1.0], [0.05, 0.2, 1.0],
    [-0.04, 0.55, 0.2], [0.04, 0.55, 0.2],
    [-0.04, 0.73, 1.1], [0.04, 0.73, 1.1],
  ];
  const cpf = [
    [0, 4, 6], [0, 6, 2],    // left face
    [1, 3, 7], [1, 7, 5],    // right face
    [4, 5, 7], [4, 7, 6],    // top
    [0, 2, 3], [0, 3, 1],    // bottom
    [0, 1, 5], [0, 5, 4],    // front cap
    [2, 6, 7], [2, 7, 3],    // rear cap
  ];
  addMesh(g, buildCustomGeo(cpv, cpf), dark, 0, 0, 0);

  // Rear wing
  addMesh(g, new THREE.BoxGeometry(1.0, 0.04, 0.2), dark, 0, 0.75, 1.1);
  addMesh(g, new THREE.BoxGeometry(0.03, 0.3, 0.25), dark, -0.5, 0.58, 1.1);
  addMesh(g, new THREE.BoxGeometry(0.03, 0.3, 0.25), dark, 0.5, 0.58, 1.1);

  // Front wing (close to front wheels)
  addMesh(g, new THREE.BoxGeometry(0.9, 0.04, 0.15), dark, 0, 0.15, -1.55);
  addMesh(g, new THREE.BoxGeometry(0.03, 0.12, 0.2), dark, -0.44, 0.18, -1.55);
  addMesh(g, new THREE.BoxGeometry(0.03, 0.12, 0.2), dark, 0.44, 0.18, -1.55);

  // Axles (silver cylinders connecting the wheels)
  const frontAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), silver,
  );
  frontAxle.rotation.z = Math.PI / 2;
  frontAxle.position.set(0, 0.22, -1.2);
  frontAxle.castShadow = true;
  g.add(frontAxle);

  const rearAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.56, 8), silver,
  );
  rearAxle.rotation.z = Math.PI / 2;
  rearAxle.position.set(0, 0.26, 0.85);
  rearAxle.castShadow = true;
  g.add(rearAxle);

  // Wheels — store references for spin animation
  const wheels = [];
  function addWheel(x, y, z, r) {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.18, 8), fmat(0x1a1a1a),
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, y, z);
    tire.castShadow = true;
    g.add(tire);
    wheels.push(tire);
  }
  addWheel(-0.7, 0.22, -1.2, 0.26);
  addWheel(0.7, 0.22, -1.2, 0.26);
  addWheel(-0.78, 0.26, 0.85, 0.3);
  addWheel(0.78, 0.26, 0.85, 0.3);
  g.userData.wheels = wheels;

  return g;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function buildCarModel(styleIndex, color) {
  // styleIndex is unused — all cars are Formula now
  const model = buildFormula(color);
  // Scale to match 2D physics capsule (CAR_H=141px, PX_TO_WORLD=0.01 → 1.41 world units)
  model.scale.set(0.45, 0.45, 0.45);
  return model;
}

export function updateCarModel(model, x2d, y2d, angle, speed, steering, dt) {
  model.position.x = x2d * PX_TO_WORLD;
  model.position.z = y2d * PX_TO_WORLD;
  model.position.y = 0;
  model.rotation.y = -angle;

  const wheels = model.userData.wheels;
  if (wheels) {
    const spinDelta = speed * PX_TO_WORLD * dt * 10;
    for (const wheel of wheels) {
      wheel.rotation.x += spinDelta;
    }
  }
}
