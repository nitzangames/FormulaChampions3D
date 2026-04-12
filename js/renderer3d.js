import { CHASE_CAM_FOV } from './constants.js';

let renderer, scene, camera, sunLight;

const ASPECT = 9 / 16; // portrait 9:16

export function initRenderer(canvas) {
  // WebGL renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x87ceeb); // sky blue
  renderer.shadowMap.enabled = true;
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
    // viewport is narrower than 9:16 — fit width
    w = vw;
    h = vw / ASPECT;
  } else {
    // viewport is wider than 9:16 — fit height
    h = vh;
    w = vh * ASPECT;
  }

  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
