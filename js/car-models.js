import { PX_TO_WORLD } from './constants.js';

export const CAR_STYLE_NAMES = [
  'GT3 Classic',
  'Muscle GT',
  'Rally GT',
  'LMP',
  'JDM Street',
  'Retro GT',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function glassMat() {
  return new THREE.MeshLambertMaterial({ color: 0x88bbff, transparent: true, opacity: 0.6 });
}

function darkMat() {
  return new THREE.MeshLambertMaterial({ color: 0x333333 });
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

function cyl(rTop, rBot, height, seg) {
  return new THREE.CylinderGeometry(rTop, rBot, height, seg || 8);
}

function addMesh(group, geo, material, x, y, z, castShadow) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (castShadow !== false) m.castShadow = true;
  group.add(m);
  return m;
}

/**
 * Add 4 wheels at the given positions and store them in userData.wheels.
 */
function addWheels(group, halfWidth, wheelY, frontZ, rearZ) {
  const wheelGeo = cyl(0.18, 0.18, 0.12, 8);
  const wheelMat = mat(0x1a1a1a);
  const wheels = [];

  const positions = [
    [-halfWidth, wheelY, frontZ],
    [ halfWidth, wheelY, frontZ],
    [-halfWidth, wheelY, rearZ],
    [ halfWidth, wheelY, rearZ],
  ];

  for (const [x, y, z] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  group.userData.wheels = wheels;
}

// ---------------------------------------------------------------------------
// Style 0 — GT3 Classic (Porsche 911 silhouette)
// ---------------------------------------------------------------------------

function buildGT3Classic(color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  const glass = glassMat();

  // Lower body — wide, low slab
  addMesh(g, box(1.2, 0.22, 2.4), bodyMat, 0, 0.2, 0);

  // Hood — slopes down toward the front
  addMesh(g, box(1.1, 0.14, 0.8), bodyMat, 0, 0.32, -0.7);

  // Cabin roof
  addMesh(g, box(0.95, 0.18, 0.7), bodyMat, 0, 0.42, 0.15);

  // Windshield (angled front glass)
  addMesh(g, box(0.9, 0.16, 0.02), glass, 0, 0.38, -0.2);

  // Rear window
  addMesh(g, box(0.85, 0.14, 0.02), glass, 0, 0.38, 0.52);

  // Rear spoiler lip
  addMesh(g, box(1.0, 0.05, 0.12), bodyMat, 0, 0.35, 1.15);

  // Taillights
  addMesh(g, box(0.2, 0.06, 0.04), mat(0xff2200), -0.45, 0.25, 1.22);
  addMesh(g, box(0.2, 0.06, 0.04), mat(0xff2200), 0.45, 0.25, 1.22);

  // Headlights
  addMesh(g, box(0.2, 0.06, 0.04), mat(0xffffcc), -0.35, 0.25, -1.22);
  addMesh(g, box(0.2, 0.06, 0.04), mat(0xffffcc), 0.35, 0.25, -1.22);

  addWheels(g, 0.6, 0.16, -0.75, 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Style 1 — Muscle GT (Mustang / Camaro)
// ---------------------------------------------------------------------------

function buildMuscleGT(color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  const glass = glassMat();
  const stripeMat = mat(0xffffff);

  // Wide body
  addMesh(g, box(1.5, 0.28, 2.6), bodyMat, 0, 0.22, 0);

  // Long hood
  addMesh(g, box(1.4, 0.12, 1.0), bodyMat, 0, 0.38, -0.6);

  // Hood scoop
  addMesh(g, box(0.3, 0.1, 0.4), bodyMat, 0, 0.46, -0.5);

  // Racing stripes (white, 0.2 wide)
  addMesh(g, box(0.2, 0.01, 2.6), stripeMat, 0, 0.37, 0);

  // Cabin — set further back
  addMesh(g, box(1.3, 0.24, 0.7), bodyMat, 0, 0.46, 0.4);

  // Windshield
  addMesh(g, box(1.2, 0.22, 0.02), glass, 0, 0.46, 0.04);
  // Rear window
  addMesh(g, box(1.1, 0.18, 0.02), glass, 0, 0.44, 0.76);
  // Side windows
  addMesh(g, box(0.02, 0.18, 0.55), glass, -0.66, 0.46, 0.4);
  addMesh(g, box(0.02, 0.18, 0.55), glass, 0.66, 0.46, 0.4);

  // Rectangular headlights
  addMesh(g, box(0.25, 0.08, 0.04), mat(0xffffcc), -0.45, 0.28, -1.32);
  addMesh(g, box(0.25, 0.08, 0.04), mat(0xffffcc), 0.45, 0.28, -1.32);

  // Taillights
  addMesh(g, box(0.3, 0.08, 0.04), mat(0xff2200), -0.5, 0.28, 1.32);
  addMesh(g, box(0.3, 0.08, 0.04), mat(0xff2200), 0.5, 0.28, 1.32);

  // Rear bumper
  addMesh(g, box(1.5, 0.1, 0.08), darkMat(), 0, 0.12, 1.34);


  addWheels(g, 0.82, 0.18, -0.85, 0.85);
  return g;
}

// ---------------------------------------------------------------------------
// Style 2 — Rally GT (WRX / Group-B)
// ---------------------------------------------------------------------------

function buildRallyGT(color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  const glass = glassMat();
  const dark = darkMat();

  // Boxy taller body
  addMesh(g, box(1.3, 0.4, 2.2), bodyMat, 0, 0.28, 0);

  // Flared fenders — all 4 corners
  addMesh(g, box(0.2, 0.2, 0.5), bodyMat, -0.72, 0.2, -0.65);
  addMesh(g, box(0.2, 0.2, 0.5), bodyMat, 0.72, 0.2, -0.65);
  addMesh(g, box(0.2, 0.2, 0.5), bodyMat, -0.72, 0.2, 0.65);
  addMesh(g, box(0.2, 0.2, 0.5), bodyMat, 0.72, 0.2, 0.65);

  // Cabin
  addMesh(g, box(1.1, 0.26, 0.8), bodyMat, 0, 0.58, 0.05);

  // Roof scoop
  addMesh(g, box(0.25, 0.1, 0.3), bodyMat, 0, 0.72, -0.1);

  // Windshield
  addMesh(g, box(1.0, 0.24, 0.02), glass, 0, 0.56, -0.36);
  // Rear window
  addMesh(g, box(0.95, 0.2, 0.02), glass, 0, 0.54, 0.46);
  // Side windows
  addMesh(g, box(0.02, 0.2, 0.6), glass, -0.56, 0.56, 0.05);
  addMesh(g, box(0.02, 0.2, 0.6), glass, 0.56, 0.56, 0.05);

  // Tall rear wing
  addMesh(g, box(1.2, 0.04, 0.25), dark, 0, 0.8, 1.0);
  // Wing endplates
  addMesh(g, box(0.04, 0.2, 0.25), dark, -0.6, 0.72, 1.0);
  addMesh(g, box(0.04, 0.2, 0.25), dark, 0.6, 0.72, 1.0);
  // Wing stanchions
  addMesh(g, box(0.04, 0.3, 0.04), dark, -0.4, 0.65, 1.0);
  addMesh(g, box(0.04, 0.3, 0.04), dark, 0.4, 0.65, 1.0);

  // Fog lights
  addMesh(g, box(0.12, 0.08, 0.04), mat(0xffff88), -0.5, 0.2, -1.12);
  addMesh(g, box(0.12, 0.08, 0.04), mat(0xffff88), 0.5, 0.2, -1.12);


  addWheels(g, 0.72, 0.18, -0.7, 0.7);
  return g;
}

// ---------------------------------------------------------------------------
// Style 3 — LMP (Le Mans Prototype)
// ---------------------------------------------------------------------------

function buildLMP(color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  const glass = glassMat();
  const dark = darkMat();

  // Long flat body
  addMesh(g, box(1.3, 0.25, 3.0), bodyMat, 0, 0.2, 0);

  // Front nose — tapered
  addMesh(g, box(0.9, 0.15, 0.5), bodyMat, 0, 0.16, -1.6);

  // Front splitter
  addMesh(g, box(1.4, 0.03, 0.3), dark, 0, 0.06, -1.65);

  // Narrow glass canopy cockpit
  addMesh(g, box(0.7, 0.2, 0.6), glass, 0, 0.4, -0.1);

  // Cockpit surround
  addMesh(g, box(0.8, 0.08, 0.7), bodyMat, 0, 0.35, -0.1);

  // Rear fenders
  addMesh(g, box(0.25, 0.2, 0.8), bodyMat, -0.65, 0.22, 0.8);
  addMesh(g, box(0.25, 0.2, 0.8), bodyMat, 0.65, 0.22, 0.8);

  // Huge rear wing on twin stanchions
  addMesh(g, box(1.4, 0.05, 0.3), dark, 0, 0.65, 1.35);
  // Wing endplates
  addMesh(g, box(0.04, 0.2, 0.3), dark, -0.7, 0.58, 1.35);
  addMesh(g, box(0.04, 0.2, 0.3), dark, 0.7, 0.58, 1.35);
  // Twin stanchions
  addMesh(g, box(0.04, 0.35, 0.04), dark, -0.35, 0.45, 1.35);
  addMesh(g, box(0.04, 0.35, 0.04), dark, 0.35, 0.45, 1.35);

  // Headlights — slim strips
  addMesh(g, box(0.3, 0.04, 0.04), mat(0xffffcc), -0.25, 0.2, -1.87);
  addMesh(g, box(0.3, 0.04, 0.04), mat(0xffffcc), 0.25, 0.2, -1.87);

  // Taillights
  addMesh(g, box(0.2, 0.04, 0.04), mat(0xff2200), -0.55, 0.25, 1.52);
  addMesh(g, box(0.2, 0.04, 0.04), mat(0xff2200), 0.55, 0.25, 1.52);

  // Rear diffuser
  addMesh(g, box(1.0, 0.12, 0.2), dark, 0, 0.08, 1.5);


  addWheels(g, 0.72, 0.18, -1.1, 1.0);
  return g;
}

// ---------------------------------------------------------------------------
// Style 4 — JDM Street (GT-R / Supra)
// ---------------------------------------------------------------------------

function buildJDMStreet(color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  const glass = glassMat();
  const dark = darkMat();

  // Compact body
  addMesh(g, box(1.3, 0.3, 2.2), bodyMat, 0, 0.23, 0);

  // Hood with crease
  addMesh(g, box(1.2, 0.08, 0.8), bodyMat, 0, 0.4, -0.5);
  // Hood crease — thin raised ridge
  addMesh(g, box(0.06, 0.04, 0.7), bodyMat, 0, 0.46, -0.5);

  // Cabin
  addMesh(g, box(1.15, 0.24, 0.7), bodyMat, 0, 0.5, 0.2);

  // Windshield
  addMesh(g, box(1.05, 0.22, 0.02), glass, 0, 0.5, -0.16);
  // Rear window
  addMesh(g, box(1.0, 0.18, 0.02), glass, 0, 0.48, 0.56);
  // Side windows
  addMesh(g, box(0.02, 0.18, 0.55), glass, -0.58, 0.5, 0.2);
  addMesh(g, box(0.02, 0.18, 0.55), glass, 0.58, 0.5, 0.2);

  // LED slit headlights — thin and wide, white
  addMesh(g, box(0.4, 0.03, 0.04), mat(0xffffff), -0.35, 0.3, -1.12);
  addMesh(g, box(0.4, 0.03, 0.04), mat(0xffffff), 0.35, 0.3, -1.12);

  // Rear lip spoiler
  addMesh(g, box(1.1, 0.04, 0.08), bodyMat, 0, 0.42, 1.08);

  // High rear wing on posts
  addMesh(g, box(1.1, 0.04, 0.2), dark, 0, 0.72, 0.95);
  // Wing posts
  addMesh(g, box(0.04, 0.28, 0.04), dark, -0.4, 0.56, 0.95);
  addMesh(g, box(0.04, 0.28, 0.04), dark, 0.4, 0.56, 0.95);

  // Taillights — horizontal strip
  addMesh(g, box(1.0, 0.04, 0.04), mat(0xff2200), 0, 0.32, 1.12);

  // Front bumper / lower intake
  addMesh(g, box(1.1, 0.1, 0.06), dark, 0, 0.1, -1.12);


  addWheels(g, 0.7, 0.18, -0.7, 0.7);
  return g;
}

// ---------------------------------------------------------------------------
// Style 5 — Retro GT (250 GTO / 3.0 CSL)
// ---------------------------------------------------------------------------

function buildRetroGT(color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  const glass = glassMat();
  const chromeMat = mat(0xcccccc);
  const dark = darkMat();

  // Main body — elongated
  addMesh(g, box(1.15, 0.28, 2.4), bodyMat, 0, 0.22, 0);

  // Rounded narrower nose
  addMesh(g, box(0.85, 0.22, 0.5), bodyMat, 0, 0.19, -1.2);

  // Elongated hood
  addMesh(g, box(1.05, 0.08, 1.0), bodyMat, 0, 0.38, -0.6);

  // Fastback cabin — set back
  addMesh(g, box(1.0, 0.24, 0.7), bodyMat, 0, 0.46, 0.3);
  // Fastback slope
  addMesh(g, box(0.95, 0.12, 0.4), bodyMat, 0, 0.42, 0.75);

  // Windshield
  addMesh(g, box(0.9, 0.22, 0.02), glass, 0, 0.46, -0.06);
  // Rear window (small fastback)
  addMesh(g, box(0.85, 0.14, 0.02), glass, 0, 0.42, 0.66);
  // Side windows
  addMesh(g, box(0.02, 0.18, 0.5), glass, -0.51, 0.46, 0.3);
  addMesh(g, box(0.02, 0.18, 0.5), glass, 0.51, 0.46, 0.3);

  // Oval chrome grille (cylinder on its side)
  const grilleGeo = cyl(0.15, 0.15, 0.04, 12);
  const grille = addMesh(g, grilleGeo, chromeMat, 0, 0.2, -1.48);
  grille.rotation.x = Math.PI / 2;

  // Chrome front bumper
  addMesh(g, box(0.9, 0.06, 0.06), chromeMat, 0, 0.12, -1.48);

  // Round headlights (spheres)
  const headGeo = new THREE.SphereGeometry(0.08, 8, 8);
  addMesh(g, headGeo, mat(0xffffcc), -0.32, 0.26, -1.46);
  addMesh(g, headGeo, mat(0xffffcc), 0.32, 0.26, -1.46);

  // Subtle trunk spoiler
  addMesh(g, box(0.9, 0.04, 0.1), bodyMat, 0, 0.38, 1.15);

  // Taillights — round-ish (small spheres)
  const tailGeo = new THREE.SphereGeometry(0.06, 8, 8);
  addMesh(g, tailGeo, mat(0xff2200), -0.4, 0.28, 1.22);
  addMesh(g, tailGeo, mat(0xff2200), 0.4, 0.28, 1.22);


  addWheels(g, 0.64, 0.18, -0.75, 0.75);
  return g;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const BUILDERS = [
  buildGT3Classic,
  buildMuscleGT,
  buildRallyGT,
  buildLMP,
  buildJDMStreet,
  buildRetroGT,
];

export function buildCarModel(styleIndex, color) {
  const idx = Math.max(0, Math.min(styleIndex, BUILDERS.length - 1));
  const model = BUILDERS[idx](color);
  model.scale.set(0.5, 1.0, 0.5);
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
