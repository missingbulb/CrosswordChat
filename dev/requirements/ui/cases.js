// Loads the UI snapshot CASES. A case is a self-contained module under cases/
// exporting { name, description, req, render() } — its data lives only in the case
// file (never in production code), and render() returns the PNG bytes produced by
// the SHIPPED code for that state (the brand-mark SVG via resvg, or the real
// injected button in the toolbar fixture via satori). The committed golden sits
// beside it at cases/<name>.png. See dev/docs/REQUIREMENTS.md and the pack
// spec-driven-product §7 (the owner reviews the product surface).

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = join(HERE, 'cases');

/** All cases in stable (filename) order. */
export async function loadCases() {
  const files = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.case.js'))
    .sort();
  const cases = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(CASES_DIR, f)).href);
    cases.push(mod.default);
  }
  return cases;
}

/** Absolute path to a case's committed golden PNG. */
export function snapshotPath(name) {
  return join(CASES_DIR, `${name}.png`);
}
