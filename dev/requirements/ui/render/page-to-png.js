// Rasterize a shipped extension PAGE or POPUP to PNG with headless Chromium
// (Playwright). This is the engine for surfaces satori CANNOT render — full HTML
// documents that use CSS grid, custom properties (var()), @media, emoji, or native
// form widgets (a range slider, radio buttons). help.html (grid + vars + emoji) and
// options.html (form widgets) are both such surfaces; the satori/resvg path only
// works for the inline-styled button/toolbar.
//
// Trade-off vs. satori: a real browser renders faithfully but its screenshots carry
// minor cross-environment antialiasing variance, so these goldens compare with a
// small per-case tolerance (maxDiffRatio), not diff-ratio 0. Chromium is
// pre-installed here (PLAYWRIGHT_BROWSERS_PATH); we never download it.

import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

// playwright-core downloads nothing here; use the image's pre-installed Chromium (its
// build number needn't match playwright-core's pinned one). CHROMIUM_PATH overrides;
// otherwise find the `chromium-<n>/chrome-linux/chrome` under PLAYWRIGHT_BROWSERS_PATH.
function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const dir of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort()) {
    const p = join(base, dir, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined; // fall back to playwright's own resolution
}

// Is a usable Chromium present? The browser cases self-skip where one isn't (e.g. a
// CI runner without it), so the satori/resvg cases still gate and CI stays green;
// the goldens remain committed and reviewable. Regenerate them where Chromium is.
export const chromiumAvailable = () => Boolean(chromiumExecutable());

/**
 * @param {string} relHtmlPath  repo-relative path to the shipped .html
 * @param {{width: number, height?: number, fullPage?: boolean,
 *          prep?: () => void, prepArg?: any}} opts
 *   width/height — viewport; fullPage — capture the whole document (for a tall page);
 *   prep — a function run in the page to set a representative state (the scripts that
 *   need the extension runtime are stripped first, so populate the form here).
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function pageToPng(relHtmlPath, { width, height, fullPage = false, prep, prepArg } = {}) {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable() });
  try {
    const page = await browser.newPage({ viewport: { width, height: height ?? 720 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(ROOT, relHtmlPath)).href, { waitUntil: 'load' });
    // Drop scripts that need chrome.* (they'd throw and populate nothing); the case's
    // prep sets the state a user would see instead.
    await page.evaluate(() => { for (const s of document.querySelectorAll('script')) s.remove(); });
    if (prep) await page.evaluate(prep, prepArg);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    return await page.screenshot({ fullPage });
  } finally {
    await browser.close();
  }
}
