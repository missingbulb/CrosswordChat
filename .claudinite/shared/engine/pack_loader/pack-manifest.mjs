import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { relevanceDetectorFromData } from './relevance-detector.mjs';

// READING A PACK'S MANIFEST, either spelling (pack-conventions.mjs names them). A
// module manifest is imported; a JSON one is parsed, and the fields JSON cannot spell
// natively are rebuilt: each `relevanceDetector` pattern, written as a string or as
// `{ source, flags }`. A module manifest may already carry RegExp objects, which pass
// through untouched. A pattern that does not compile throws, and the loader reports it
// as the pack failing to load.
export function hydrateManifest(mod) {
  if (mod === null || typeof mod !== 'object' || Array.isArray(mod)) return mod;
  if (!mod.relevanceDetector) return mod;
  return { ...mod, relevanceDetector: relevanceDetectorFromData(mod.relevanceDetector) };
}

export async function readManifest(file) {
  const raw = file.endsWith('.json')
    ? JSON.parse(readFileSync(file, 'utf8'))
    : (await import(pathToFileURL(file).href)).default;
  return hydrateManifest(raw);
}
