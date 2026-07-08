// The single visual-comparison engine for every pixel-asserted UI requirement.
// Each case (dev/requirements/ui/cases/*.case.js) renders the SHIPPED code for one
// UI state to a PNG; the result is compared pixel-by-pixel (pixelmatch) against the
// committed golden beside it (cases/<name>.png). So the goldens track the shipped
// code directly — there is no hand-maintained copy of the button art or the toolbar
// markup. Run `npm run refresh:ui` to regenerate after an intentional UI change and
// commit the PNGs, so a reviewer sees the before/after in the diff.
//
// The satori/resvg cases are deterministic (bundled fonts, no browser), so they must
// match EXACTLY — any differing pixel is a real change. The Playwright page/popup
// cases are real browser screenshots and carry minor cross-environment antialiasing
// variance, so each declares a small `maxDiffRatio`; a case without one demands 0.

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { loadCases, snapshotPath } from './cases.js';
import { artifactPath } from './render/artifacts-dir.js';
import { applyGallery, REQ_DOC } from './build-gallery.mjs';
import { chromiumAvailable } from './render/page-to-png.js';

const cases = await loadCases();
const hasBrowser = chromiumAvailable();

describe('UI visual snapshots', () => {
  test('there is at least one UI case', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  // Any text in a golden (the toolbar labels) is rendered from the bundled font at
  // the runtime's locale. The goldens are authored under the CI/sandbox default
  // (en-US); guard it so a maintainer on a non-English shell gets an actionable
  // message instead of a baffling text-only pixel diff.
  test('the environment resolves to the en-US locale the goldens assume', () => {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    expect(
      locale,
      `UI goldens are authored in en-US, but this environment resolves to "${locale}". ` +
        'Unset LANG/LC_ALL (or set LANG=C.UTF-8) when running/regenerating the UI snapshots.',
    ).toBe('en-US');
  });

  // §7: the requirements doc embeds these goldens under managed markers. It's derived
  // output — fail if it drifts from the generator (run `npm run refresh:ui` to fix).
  test('the requirements-doc UI gallery is up to date', () => {
    const doc = readFileSync(REQ_DOC, 'utf8');
    expect(applyGallery(doc, cases), 'dev/docs/REQUIREMENTS.md UI gallery is stale — run "npm run refresh:ui"').toBe(doc);
  });

  for (const testCase of cases) {
    // A browser case self-skips where no Chromium is present (a CI runner without it),
    // so the satori/resvg cases still gate and the run stays green.
    const skip = testCase.engine === 'browser' && !hasBrowser;
    test.skipIf(skip)(`${testCase.name} (${testCase.description}) matches its golden`, async () => {
      const pngBuffer = await testCase.render();
      const snapPath = snapshotPath(testCase.name);
      const actualPath = artifactPath(`${testCase.name}.actual.png`);
      const diffPath = artifactPath(`${testCase.name}.diff.png`);

      expect(existsSync(snapPath), `No golden at ${snapPath}; run "npm run refresh:ui" to create one.`).toBe(true);

      const actual = PNG.sync.read(pngBuffer);
      const expected = PNG.sync.read(readFileSync(snapPath));

      if (actual.width !== expected.width || actual.height !== expected.height) {
        writeFileSync(actualPath, pngBuffer);
        expect.fail(
          `${testCase.name}: render size changed: expected ${expected.width}x${expected.height}, ` +
            `got ${actual.width}x${actual.height}. See ${actualPath}, or run "npm run refresh:ui" if intentional.`,
        );
      }

      const { width, height } = actual;
      const diff = new PNG({ width, height });
      const diffPixels = pixelmatch(actual.data, expected.data, diff.data, width, height, { threshold: 0.1 });
      const ratio = diffPixels / (width * height);
      const maxRatio = testCase.maxDiffRatio ?? 0;

      if (ratio > maxRatio) {
        writeFileSync(actualPath, pngBuffer);
        writeFileSync(diffPath, PNG.sync.write(diff));
        expect.fail(
          `${testCase.name}: UI changed: ${diffPixels} of ${width * height} pixels differ ` +
            `(${(ratio * 100).toFixed(2)}%). See ${actualPath} and ${diffPath}, ` +
            'or run "npm run refresh:ui" if intentional.',
        );
      }
      for (const p of [actualPath, diffPath]) if (existsSync(p)) unlinkSync(p);
    });
  }
});
