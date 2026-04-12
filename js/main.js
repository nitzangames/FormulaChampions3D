import { initRenderer, render, getScene, getCamera } from './renderer3d.js';
import { generateTrack, buildTrackPath } from './track.js';
import { buildTrack as buildTrack3D } from './track-builder.js';
import { TRACK_SEEDS, PX_TO_WORLD } from './constants.js';

const canvas = document.getElementById('game-canvas');
initRenderer(canvas);

const track = generateTrack(TRACK_SEEDS[0]);
const centerLine = buildTrackPath(track);
buildTrack3D(getScene(), centerLine, track);

// Position camera above track center
const mid = centerLine[Math.floor(centerLine.length / 2)];
const cam = getCamera();
cam.position.set(mid.x * PX_TO_WORLD, 40, mid.y * PX_TO_WORLD);
cam.lookAt(mid.x * PX_TO_WORLD, 0, mid.y * PX_TO_WORLD);

function loop() {
  requestAnimationFrame(loop);
  render();
}
loop();
