import { CHASE_CAM_FOV } from './constants.js';
import {
  getShadowsEnabled, getAntialiasEnabled, getPixelRatio,
} from './graphics-settings.js';

let renderer, scene, camera, sunLight;
let cachedCanvas = null;

const ASPECT = 9 / 16; // portrait 9:16

export function initRenderer(canvas) {
  cachedCanvas = canvas;

  // WebGL renderer. `antialias` is baked into the context at creation — if
  // the user toggles it, we rebuild the renderer (see rebuildRenderer()).
  renderer = new THREE.WebGLRenderer({ canvas, antialias: getAntialiasEnabled() });
  renderer.setClearColor(0x87ceeb); // sky blue
  renderer.shadowMap.enabled = getShadowsEnabled();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Scene with fog
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

  // Camera
  camera = new THREE.PerspectiveCamera(CHASE_CAM_FOV, ASPECT, 0.1, 300);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);

  // Directional light with shadows
  sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
  sunLight.position.set(10, 20, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Ambient light
  const ambLight = new THREE.AmbientLight(0x6688aa, 0.5);
  scene.add(ambLight);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(500, 500);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a9e4a });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Initial sizing
  handleResize();
  window.addEventListener('resize', handleResize);
}

function handleResize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let w, h;
  if (vw / vh < ASPECT) {
    w = vw;
    h = vw / ASPECT;
  } else {
    h = vh;
    w = vh * ASPECT;
  }

  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, getPixelRatio()));
  camera.aspect = ASPECT;
  camera.updateProjectionMatrix();
}

export function render() {
  renderer.render(scene, camera);
}

export function updateSunPosition(x, z) {
  if (!sunLight) return;
  sunLight.position.set(x + 10, 20, z + 10);
  sunLight.target.position.set(x, 0, z);
  sunLight.target.updateMatrixWorld();
}

// Apply runtime-togglable graphics settings. Shadows and pixel ratio can
// change without rebuilding. Antialias is a WebGL context attribute so it
// requires a renderer rebuild; the caller should pass `rebuild=true` when
// AA changes, which is disruptive mid-race so we warn in the UI.
export function applyGraphicsSettings() {
  if (!renderer) return;
  renderer.shadowMap.enabled = getShadowsEnabled();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, getPixelRatio()));
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
