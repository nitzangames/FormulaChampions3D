const puppeteer = require('/usr/local/lib/node_modules/puppeteer');
const fs = require('fs');

// Capture 5 gameplay screenshots at different moments on the same track.
// Same seed so track/scenery is consistent; varied delay = different "places"
// along the track. Capture times chosen to land on straights + turn exits.
//
// Rough timeline: ~1.5s page load, 3s countdown, then racing.
const SHOTS = [
  { seed: 0, delayMs: 3300,  label: '1-go',       note: 'Lights out — cars on the grid, GO fires.' },
  { seed: 0, delayMs: 5000,  label: '2-launch',   note: 'Just after start — pack accelerating on the straight.' },
  { seed: 0, delayMs: 7000,  label: '3-straight', note: 'Hurtling down the opening straight.' },
  { seed: 2, delayMs: 10000, label: '4-turn',     note: 'Through the first corner, new track ahead.' },
  { seed: 4, delayMs: 15000, label: '5-midrace',  note: 'Settled into the race, on a different track + scenery.' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  for (const shot of SHOTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    const url = `http://localhost:8084/?screenshot=1&seed=${shot.seed}`;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, shot.delayMs));
    await page.screenshot({ path: `screenshot-${shot.label}.png` });
    console.log(`captured ${shot.label} at t=${shot.delayMs}ms on seed ${shot.seed}`);
    await page.close();
  }
  await browser.close();

  // Write preview HTML
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Gameplay Screenshots</title>
<style>
  html, body { margin: 0; padding: 0; background: #0f0f14; color: #eee;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }
  h1 { margin: 0 0 6px; font-weight: 800; letter-spacing: 1px; }
  p.sub { margin: 0 0 24px; color: #888; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 18px; }
  .card { background: #1a1a24; border: 1px solid #2a2a38; border-radius: 10px;
    overflow: hidden; }
  .card img { width: 100%; display: block; }
  .meta { padding: 12px 14px; font-size: 13px; }
  .meta .label { color: #4ecdc4; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; font-size: 11px; margin-bottom: 4px; }
  .meta .note { color: #bbb; line-height: 1.4; }
</style></head>
<body><div class="wrap">
<h1>Gameplay Screenshots</h1>
<p class="sub">Five moments across the first ~15 seconds of a race. Seed varies for different tracks + scenery themes.</p>
<div class="grid">
${SHOTS.map(s => `<div class="card">
  <img src="screenshot-${s.label}.png" alt="${s.label}">
  <div class="meta"><div class="label">${s.label.replace(/^\d+-/, '')} · seed ${s.seed} · t=${s.delayMs}ms</div>
  <div class="note">${s.note}</div></div>
</div>`).join('\n')}
</div></div></body></html>`;
  fs.writeFileSync('screenshot-preview.html', html);
  console.log('wrote screenshot-preview.html');
})();
