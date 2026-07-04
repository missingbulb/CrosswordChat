#!/usr/bin/env node
// Bundle the MV3 extension into dist/ with esbuild (no config, no framework).
// --dev additionally matches the local fake page (http://localhost:8787) so the whole
// voice loop can be rehearsed without an NYT subscription (MT-23).

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'extension/src');
const DIST = join(ROOT, 'dist');
const dev = process.argv.includes('--dev');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const entries = [
  { in: join(SRC, 'background/service-worker.js'), out: join(DIST, 'background.js') },
  { in: join(SRC, 'content/content-script.js'), out: join(DIST, 'content.js') },
  { in: join(SRC, 'content/main-world.js'), out: join(DIST, 'main-world.js') },
  { in: join(SRC, 'options/options.js'), out: join(DIST, 'options.js') },
];

for (const { in: input, out } of entries) {
  await build({
    entryPoints: [input],
    outfile: out,
    bundle: true,
    format: 'iife',
    target: 'chrome116',
    sourcemap: dev ? 'inline' : false,
    minify: !dev,
  });
}

copyFileSync(join(SRC, 'options/options.html'), join(DIST, 'options.html'));

const manifest = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8'));
if (dev) {
  const devMatch = 'http://localhost:8787/*';
  for (const cs of manifest.content_scripts) cs.matches.push(devMatch);
  manifest.host_permissions.push(devMatch);
  manifest.name += ' (dev)';
}
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Built ${dev ? 'dev' : 'production'} bundle → dist/  (load via chrome://extensions → Load unpacked)`);
