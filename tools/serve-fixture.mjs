#!/usr/bin/env node
// Serve the fake NYT page at http://localhost:8787 for offline rehearsal (MT-23).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../extension-test/fixtures/fake-nyt', import.meta.url).pathname;
const PORT = 8787;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = readFileSync(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => {
  console.log(`Fake NYT crossword → http://localhost:${PORT} (Ctrl-C to stop)`);
});
