import { initRenderer, render } from './renderer3d.js';

const canvas = document.getElementById('game-canvas');
initRenderer(canvas);

function loop() {
  requestAnimationFrame(loop);
  render();
}
loop();
