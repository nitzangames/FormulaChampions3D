const puppeteer = require('/usr/local/lib/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const SIZE = 512;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="${SIZE}" height="${SIZE}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a1530"/>
    <stop offset="1" stop-color="#0a0815"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff5a8"/>
    <stop offset="0.5" stop-color="#ffb800"/>
    <stop offset="1" stop-color="#a06600"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.4" r="0.6">
    <stop offset="0" stop-color="#ffd700" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#ffd700" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2a2030"/>
    <stop offset="1" stop-color="#0a0510"/>
  </linearGradient>
  <linearGradient id="bodyRed" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff4544"/>
    <stop offset="0.5" stop-color="#e30613"/>
    <stop offset="1" stop-color="#8a0008"/>
  </linearGradient>
</defs>
<rect width="400" height="400" fill="url(#bg)"/>
<rect y="320" width="400" height="80" fill="url(#floor)"/>
<ellipse cx="200" cy="170" rx="170" ry="100" fill="url(#glow)"/>
<g opacity="0.85">
  <rect x="50" y="40" width="6" height="10" fill="#ffeb3b" transform="rotate(20 53 45)"/>
  <rect x="120" y="70" width="6" height="10" fill="#e30613" transform="rotate(-15 123 75)"/>
  <rect x="280" y="55" width="6" height="10" fill="#1f4ea3" transform="rotate(40 283 60)"/>
  <rect x="340" y="95" width="6" height="10" fill="#ffeb3b" transform="rotate(-30 343 100)"/>
  <rect x="80" y="125" width="6" height="10" fill="#e30613" transform="rotate(60 83 130)"/>
  <rect x="320" y="145" width="6" height="10" fill="#1f4ea3" transform="rotate(-45 323 150)"/>
  <rect x="200" y="50" width="6" height="10" fill="#ffeb3b" transform="rotate(10 203 55)"/>
  <rect x="40" y="180" width="6" height="10" fill="#e30613" transform="rotate(25 43 185)"/>
  <rect x="360" y="200" width="6" height="10" fill="#ffeb3b" transform="rotate(-50 363 205)"/>
</g>
<g opacity="0.18">
  <rect x="0" y="320" width="20" height="14" fill="#fff"/>
  <rect x="40" y="320" width="20" height="14" fill="#fff"/>
  <rect x="80" y="320" width="20" height="14" fill="#fff"/>
  <rect x="120" y="320" width="20" height="14" fill="#fff"/>
  <rect x="160" y="320" width="20" height="14" fill="#fff"/>
  <rect x="200" y="320" width="20" height="14" fill="#fff"/>
  <rect x="240" y="320" width="20" height="14" fill="#fff"/>
  <rect x="280" y="320" width="20" height="14" fill="#fff"/>
  <rect x="320" y="320" width="20" height="14" fill="#fff"/>
  <rect x="360" y="320" width="20" height="14" fill="#fff"/>
  <rect x="20" y="334" width="20" height="14" fill="#fff"/>
  <rect x="60" y="334" width="20" height="14" fill="#fff"/>
  <rect x="100" y="334" width="20" height="14" fill="#fff"/>
  <rect x="140" y="334" width="20" height="14" fill="#fff"/>
  <rect x="180" y="334" width="20" height="14" fill="#fff"/>
  <rect x="220" y="334" width="20" height="14" fill="#fff"/>
  <rect x="260" y="334" width="20" height="14" fill="#fff"/>
  <rect x="300" y="334" width="20" height="14" fill="#fff"/>
  <rect x="340" y="334" width="20" height="14" fill="#fff"/>
</g>
<text x="200" y="50" text-anchor="middle" font-family="Arial Black, sans-serif" font-weight="900" font-size="36" fill="url(#gold)" stroke="#000" stroke-width="3" paint-order="stroke">FORMULA</text>
<text x="200" y="88" text-anchor="middle" font-family="Arial Black, sans-serif" font-weight="900" font-size="28" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">CHAMPIONS 3D</text>
<g transform="translate(200,150)">
  <path d="M -32,-12 Q -46,-10 -46,8 Q -46,22 -32,22" fill="none" stroke="url(#gold)" stroke-width="5"/>
  <path d="M 32,-12 Q 46,-10 46,8 Q 46,22 32,22" fill="none" stroke="url(#gold)" stroke-width="5"/>
  <path d="M -36,-34 L 36,-34 L 32,22 Q 0,32 -32,22 Z" fill="url(#gold)" stroke="#8a5500" stroke-width="2"/>
  <path d="M -28,-30 L -24,-30 L -20,10 L -28,10 Z" fill="#fff" opacity="0.5"/>
  <text x="0" y="6" text-anchor="middle" font-family="Arial Black" font-size="28" fill="#a06600">1</text>
  <rect x="-7" y="22" width="14" height="14" fill="url(#gold)"/>
  <rect x="-26" y="36" width="52" height="9" fill="url(#gold)" stroke="#8a5500" stroke-width="2"/>
  <rect x="-32" y="44" width="64" height="5" fill="#a06600"/>
</g>
<ellipse cx="220" cy="362" rx="160" ry="6" fill="#000" opacity="0.55"/>
<polygon points="178,295 79,275 79,333 178,333" fill="#1a1a1a"/>
<polygon points="178,295 79,275 79,278 175,295" fill="#000" opacity="0.4"/>
<polygon points="184,298 184,267 151,276 151,300" fill="#222"/>
<polygon points="184,267 174,265 151,276" fill="#000" opacity="0.4"/>
<path d="M 101,295 L 211,298 L 321,320 L 349,331 L 371,337 L 371,340 L 349,337 L 321,339 L 211,342 L 101,342 Z" fill="url(#bodyRed)"/>
<path d="M 105,295 L 211,298 L 321,320 L 349,331 L 371,337 L 371,339 L 349,333 L 321,322 L 211,300 L 105,297 Z" fill="#ff8a8a" opacity="0.6"/>
<polygon points="255,324 222,327 134,327 123,324 123,344 255,344" fill="#c00510"/>
<polygon points="255,324 222,327 134,327 123,324 130,328 248,328" fill="#ff5544" opacity="0.5"/>
<ellipse cx="248" cy="332" rx="6" ry="5" fill="#0a0a0a"/>
<line x1="180" y1="330" x2="220" y2="330" stroke="#000" stroke-width="1" opacity="0.6"/>
<ellipse cx="205" cy="298" rx="20" ry="5" fill="#0a0a0a"/>
<circle cx="211" cy="283" r="14" fill="#fafafa"/>
<path d="M 199,281 Q 211,275 223,281 L 222,287 Q 211,283 200,287 Z" fill="#1a1a1a"/>
<rect x="197" y="277" width="28" height="2.5" fill="#ffd700"/>
<path d="M 195,295 Q 211,283 227,295" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>
<rect x="65" y="275" width="28" height="33" fill="#1a1a1a" stroke="#000" stroke-width="1"/>
<rect x="65" y="275" width="28" height="3" fill="#fff" opacity="0.3"/>
<rect x="62" y="270" width="34" height="6" fill="#0a0a0a"/>
<rect x="62" y="270" width="34" height="2" fill="#444"/>
<line x1="64" y1="273" x2="94" y2="273" stroke="#fff" stroke-width="0.5" opacity="0.4"/>
<rect x="362" y="336" width="17" height="5" fill="#0a0a0a"/>
<rect x="362" y="336" width="17" height="1.5" fill="#fff" opacity="0.6"/>
<rect x="360" y="328" width="22" height="14" fill="#1a1a1a"/>
<circle cx="240" cy="318" r="9" fill="#fff"/>
<text x="240" y="322" text-anchor="middle" font-family="Arial Black" font-size="12" fill="#e30613">1</text>
<circle cx="107" cy="326" r="33" fill="#0a0a0a"/>
<circle cx="107" cy="326" r="32" fill="none" stroke="#222" stroke-width="1"/>
<circle cx="107" cy="326" r="17" fill="#3a3a3a"/>
<g stroke="#888" stroke-width="2.5" stroke-linecap="round">
  <line x1="107" y1="326" x2="107" y2="312"/>
  <line x1="107" y1="326" x2="120" y2="332"/>
  <line x1="107" y1="326" x2="115" y2="339"/>
  <line x1="107" y1="326" x2="99" y2="339"/>
  <line x1="107" y1="326" x2="94" y2="332"/>
</g>
<circle cx="107" cy="326" r="5" fill="#aaa"/>
<circle cx="107" cy="326" r="2" fill="#222"/>
<circle cx="332" cy="331" r="29" fill="#0a0a0a"/>
<circle cx="332" cy="331" r="28" fill="none" stroke="#222" stroke-width="1"/>
<circle cx="332" cy="331" r="15" fill="#3a3a3a"/>
<g stroke="#888" stroke-width="2.5" stroke-linecap="round">
  <line x1="332" y1="331" x2="332" y2="319"/>
  <line x1="332" y1="331" x2="343" y2="337"/>
  <line x1="332" y1="331" x2="338" y2="343"/>
  <line x1="332" y1="331" x2="326" y2="343"/>
  <line x1="332" y1="331" x2="321" y2="337"/>
</g>
<circle cx="332" cy="331" r="4" fill="#aaa"/>
<circle cx="332" cy="331" r="1.5" fill="#222"/>
</svg>`;

const HTML = `<!doctype html><html><head><style>
  html, body { margin: 0; padding: 0; background: #0a0815; }
  body { width: ${SIZE}px; height: ${SIZE}px; }
  svg { display: block; }
</style></head><body>${SVG}</body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(__dirname, 'thumbnail.png'), omitBackground: false });
  await browser.close();
  console.log('Wrote thumbnail.png (' + SIZE + 'x' + SIZE + ')');
})();
