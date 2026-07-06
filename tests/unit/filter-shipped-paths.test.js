// tools/filter-shipped-paths.mjs is the daily auto-release's "did anything deployable
// change?" gate. It's exercised as a child process (stdin -> stdout), the same way the
// workflow pipes `git diff --name-only` through it.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../tools/filter-shipped-paths.mjs', import.meta.url));

const run = (input) => execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', input });

describe('filter-shipped-paths', () => {
  it('keeps only paths under extension/', () => {
    const out = run(
      [
        'extension/manifest.json',
        'extension/src/content/content-script.js',
        'extension/icons/icon-16.png',
        'tools/build.mjs',
        'tests/unit/arch.test.js',
        'docs/REQUIREMENTS.md',
        '.github/workflows/release.yml',
        'README.md',
      ].join('\n'),
    );
    expect(out.split('\n').filter(Boolean)).toEqual([
      'extension/manifest.json',
      'extension/src/content/content-script.js',
      'extension/icons/icon-16.png',
    ]);
  });

  it('a prefix look-alike outside extension/ does not match', () => {
    expect(run('extensions/other.js\nextension.md\n')).toBe('');
  });

  it('empty input produces empty output and exit 0', () => {
    expect(run('')).toBe('');
  });
});
