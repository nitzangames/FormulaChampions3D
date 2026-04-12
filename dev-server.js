import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8084;
const ROOT = __dirname;
const LOG_FILE = path.join(ROOT, 'error.log');

// Clear log on start
fs.writeFileSync(LOG_FILE, '');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // Error logging endpoint
  if (req.method === 'POST' && req.url === '/__log_error') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(LOG_FILE, `[${timestamp}] ${body}\n`);
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
    });
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' });
    res.end();
    return;
  }

  // Static file serving — strip query string
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}`);
  console.log(`Error log: ${LOG_FILE}`);
});
