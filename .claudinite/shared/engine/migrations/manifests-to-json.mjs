#!/usr/bin/env node
// Convert a pack's `pack.mjs` manifest into the `pack.json` the loader prefers. The
// module is evaluated and its default export written back as data, key order kept, so
// the JSON loads to exactly what the module did. A `relevanceDetector` pattern becomes
// its source string, or `{ source, flags }` where it carries a flag. A value JSON cannot
// carry - a function, a module that imports a sibling - leaves the manifest a module,
// which the loader still reads, and says why. Comments do not survive.
//
// Two callers. The `pack-json-manifests` migration record runs this against a member's
// OWN local packs on its nightly update, through the registry's io, evaluating each
// manifest from its text; and the CLI below converts a checkout by hand, evaluating each
// file where it sits, so a manifest importing a sibling still resolves:
//
//   node engine/migrations/manifests-to-json.mjs [--root <repo>] [<pack dir>…]

import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANIFEST_JSON, MANIFEST_MODULE } from '../pack_loader/pack-conventions.mjs';
import { LOCAL_PACK_ROOT } from './task-declarations-to-json.mjs';

const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

function toData(value, at) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (value instanceof RegExp) return value.flags ? { source: value.source, flags: value.flags } : value.source;
  if (typeof value === 'function') throw new Error(`${at} is a function`);
  if (Array.isArray(value)) return value.map((v, i) => toData(v, `${at}[${i}]`));
  if (!isPlainObject(value)) throw new Error(`${at} is not plain data`);
  const out = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = toData(v, at ? `${at}.${k}` : k);
  return out;
}

// `{ json }` for a manifest that converts, `{ why }` for one that stays a module. `url`
// is where the module is evaluated from; its text alone by default.
export async function manifestToJson(source, { url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}` } = {}) {
  let mod;
  try {
    mod = (await import(url)).default;
  } catch (e) {
    return { why: `it does not evaluate on its own: ${e.message}` };
  }
  if (!isPlainObject(mod)) return { why: 'its default export is not an object' };
  try {
    return { json: `${JSON.stringify(toData(mod, ''), null, 2)}\n` };
  } catch (e) {
    return { why: e.message };
  }
}

// Every pack directory under `root` still carrying only a module manifest, converted
// through `io` (read, write, listDir, remove). One line per pack touched.
export async function manifestsToJson(root, io) {
  const done = [];
  for (const name of (io.listDir(root) ?? []).sort()) {
    const dir = `${root}/${name}`;
    const module = `${dir}/${MANIFEST_MODULE}`;
    if (!io.exists(module) || io.exists(`${dir}/${MANIFEST_JSON}`)) continue;
    const { json, why } = await manifestToJson(await io.read(module));
    if (!json) { done.push(`${module}: kept as ${MANIFEST_MODULE} - ${why}`); continue; }
    await io.write(`${dir}/${MANIFEST_JSON}`, json);
    await io.remove(module);
    done.push(`${module} -> ${MANIFEST_JSON}`);
  }
  return done;
}

async function main(argv) {
  const at = argv.indexOf('--root');
  const root = resolve(at === -1 ? process.cwd() : argv[at + 1]);
  const named = argv.filter((a, i) => a !== '--root' && argv[i - 1] !== '--root');
  const localRoot = join(root, LOCAL_PACK_ROOT);
  const dirs = named.length
    ? named.map((d) => resolve(root, d))
    : (existsSync(localRoot) ? readdirSync(localRoot).map((n) => join(localRoot, n)) : []);
  for (const dir of dirs) {
    const module = join(dir, MANIFEST_MODULE);
    if (!existsSync(module) || existsSync(join(dir, MANIFEST_JSON))) continue;
    const { json, why } = await manifestToJson(readFileSync(module, 'utf8'), { url: pathToFileURL(module).href });
    // A manifest that stays a module is still read, so it is reported, not a failure.
    if (!json) { console.log(`${module}: kept as ${MANIFEST_MODULE} - ${why}`); continue; }
    writeFileSync(join(dir, MANIFEST_JSON), json);
    rmSync(module);
    console.log(`${module} -> ${MANIFEST_JSON}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
