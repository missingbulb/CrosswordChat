#!/usr/bin/env node
// Generate all Chrome Web Store graphics from code — icons, screenshots, promo tiles.
// Everything is drawn as inline SVG/HTML and rasterized with headless Chromium, so the
// assets are reproducible: edit this file, re-run, commit the PNGs.
//
//   node tools/make-store-assets.mjs
//
// Outputs:
//   extension/icons/icon-{16,32,48,128}.png              — manifest icons (transparent corners)
//   dev/build/store-assets/screenshot-{1,2}-1280x800.png — store screenshots
//   dev/build/store-assets/promo-small-440x280.png       — small promo tile
//   dev/build/store-assets/promo-marquee-1400x560.png    — marquee promo tile
//
// Chromium: uses Playwright's managed browser (PLAYWRIGHT_BROWSERS_PATH) when present;
// set CHROME_BIN to point at any Chromium/Chrome binary otherwise.

import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ICONS = join(ROOT, 'extension/icons');
const STORE = join(ROOT, 'dev/build/store-assets');
mkdirSync(ICONS, { recursive: true });
mkdirSync(STORE, { recursive: true });

// ---------------------------------------------------------------- palette ---

const GOLD = '#F2C53D';       // crossword gold
const GOLD_SOFT = '#F8DE8D';
const INK = '#191919';        // near-black
const PAPER = '#FAF6EC';      // warm off-white page
const CARD = '#FFFFFF';
const SERIF = "'Bitstream Charter', 'Liberation Serif', Georgia, serif";
const SANS = "'Liberation Sans', Arial, sans-serif";

// ------------------------------------------------------------------- icon ---
// A speech bubble that is itself a crossword grid: 3×2 cells, one black square.

const BUBBLE = 'M34 20 h60 a12 12 0 0 1 12 12 v48 a12 12 0 0 1 -12 12 H62 L40 110 V92 '
  + 'h-6 a12 12 0 0 1 -12 -12 V32 a12 12 0 0 1 12 -12 z';

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="27" fill="${GOLD}"/>
  <defs><clipPath id="b"><path d="${BUBBLE}"/></clipPath></defs>
  <path d="${BUBBLE}" fill="#FFFFFF"/>
  <g clip-path="url(#b)">
    <rect x="78" y="20" width="30" height="36" fill="${INK}"/>
    <path d="M50 20 V92 M78 20 V92 M22 56 H108" stroke="${INK}" stroke-width="6"/>
  </g>
  <path d="${BUBBLE}" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
</svg>`;

const iconPage = (px) => `<!doctype html><html><head><style>
  html,body{margin:0;padding:0;background:transparent}
  svg{display:block;width:${px}px;height:${px}px}
</style></head><body>${iconSvg}</body></html>`;

// ------------------------------------------------------- shared page bits ---

const baseCss = `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden}
  body{background:${PAPER};font-family:${SANS};color:${INK};
       display:flex;flex-direction:column}
  .serif{font-family:${SERIF}}
`;

const brandRow = (size) => `
  <div style="display:flex;align-items:center;gap:${size * 0.35}px">
    <div style="width:${size}px;height:${size}px;flex:none">${iconSvg}</div>
    <div class="serif" style="font-size:${size * 0.62}px;font-weight:bold">CrosswordChat</div>
  </div>`;

// A decorative mini crossword grid. `cells` is an array of row strings:
// '#' = black square, letter = filled, '.' = empty, lowercase = active (gold) cell.
function gridHtml(cells, cellPx) {
  const rows = cells.map((row) => [...row].map((ch) => {
    const black = ch === '#';
    const active = ch >= 'a' && ch <= 'z';
    const letter = ch === '.' || black ? '' : ch.toUpperCase();
    return `<div style="width:${cellPx}px;height:${cellPx}px;border:1.5px solid ${INK};
      margin:-0.75px;display:flex;align-items:center;justify-content:center;
      background:${black ? INK : active ? GOLD_SOFT : CARD};
      font-family:${SERIF};font-weight:bold;font-size:${cellPx * 0.58}px">${letter}</div>`;
  }).join('')).join('</div><div style="display:flex">');
  return `<div style="display:inline-block;border:3px solid ${INK};background:${CARD}">
    <div style="display:flex">${rows}</div></div>`;
}

function bubble(text, { user = false, size = 26 } = {}) {
  return `<div style="align-self:${user ? 'flex-end' : 'flex-start'};max-width:82%;
    background:${user ? GOLD : CARD};border:2px solid ${INK};border-radius:16px;
    border-${user ? 'bottom-right' : 'bottom-left'}-radius:4px;
    padding:${size * 0.55}px ${size * 0.8}px;font-size:${size}px;line-height:1.35;
    box-shadow:3px 3px 0 rgba(25,25,25,.12)">
    <span style="font-size:${size * 0.85}px">${user ? '🎤' : '🔊'}</span>&nbsp; ${text}</div>`;
}

// ----------------------------------------------------------- screenshot 1 ---
// Hero: the conversation next to the grid it is filling in.

const GRID1 = [
  'chalet',
  'O#A#A#',
  'ZEBRAS',
  'Y#R#E#',
  '#ROE##',
  'ADS###',
];

const screenshot1 = `<!doctype html><html><head><style>${baseCss}</style></head><body>
  <div style="display:flex;align-items:center;justify-content:space-between;
              padding:34px 56px 0">
    ${brandRow(56)}
    <div style="font-size:21px;background:${CARD};border:2px solid ${INK};
                border-radius:999px;padding:9px 22px">for the New York Times crossword</div>
  </div>
  <div style="flex:1;display:flex;align-items:center;gap:64px;padding:0 72px">
    <div style="flex:1.05">
      <h1 class="serif" style="font-size:50px;line-height:1.12;margin-bottom:14px">
        Solve the crossword with your&nbsp;voice.</h1>
      <p style="font-size:22px;line-height:1.4;color:#3d3d3d;margin-bottom:24px">
        It reads each clue aloud. You just say the answer — it checks lengths,
        homophones and crossings, types it into the grid, and moves on.</p>
      ${gridHtml(GRID1, 54)}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;gap:20px">
      ${bubble("Let's solve. Little house. 6 letters.")}
      ${bubble('chalet', { user: true })}
      ${bubble('Fits! Sushi topper. 3 letters.')}
      ${bubble('roe', { user: true })}
      ${bubble('R, O, E — fits!')}
    </div>
  </div>
  <div style="display:flex;gap:18px;padding:0 72px 38px">
    ${['🔒 No servers — fully client-side', '🧩 Checks crossing letters for you',
       '🙌 Completely hands-free'].map((t) => `
      <div style="background:${CARD};border:2px solid ${INK};border-radius:12px;
                  padding:13px 22px;font-size:20px">${t}</div>`).join('')}
  </div>
</body></html>`;

// ----------------------------------------------------------- screenshot 2 ---
// Command reference + the privacy story.

const CMD_GROUPS = [
  ['Get around', [['“next” / “pass”', 'skip to another clue'],
    ['“back”', 'return to the previous clue'],
    ['“flip”', 'switch between Across and Down']]],
  ['When it mishears', [['“undo”', 'take the last answer back'],
    ['“I said …” ', 'correct what it heard'],
    ['“spell it”', 'give the answer letter by letter']]],
  ['Ask for help', [['“repeat”', 'hear the clue again'],
    ['“hint”', 'hear the letters already in place'],
    ['“help”', 'list what you can say']]],
];

const screenshot2 = `<!doctype html><html><head><style>${baseCss}</style></head><body>
  <div style="padding:40px 64px 0">${brandRow(48)}</div>
  <div style="padding:18px 64px 0">
    <h1 class="serif" style="font-size:50px">Say it like you’d say it to a friend.</h1>
    <p style="font-size:23px;color:#3d3d3d;margin-top:10px">
      Click the toolbar icon to start a session. Say <b>“goodbye”</b> when you’re done.</p>
  </div>
  <div style="flex:1;display:flex;gap:26px;padding:30px 64px 0">
    ${CMD_GROUPS.map(([title, rows]) => `
      <div style="flex:1;background:${CARD};border:2.5px solid ${INK};border-radius:18px;
                  padding:26px 28px;box-shadow:4px 4px 0 rgba(25,25,25,.12)">
        <div class="serif" style="font-size:27px;font-weight:bold;border-bottom:2.5px solid ${INK};
                    padding-bottom:12px;margin-bottom:16px">${title}</div>
        ${rows.map(([cmd, what]) => `
          <div style="margin-bottom:15px">
            <div style="display:inline-block;background:${GOLD_SOFT};border:1.5px solid ${INK};
                        border-radius:8px;padding:3px 10px;font-size:20px;font-weight:bold">
              ${cmd}</div>
            <div style="font-size:19px;color:#3d3d3d;margin-top:5px">${what}</div>
          </div>`).join('')}
      </div>`).join('')}
  </div>
  <div style="margin:30px 64px 38px;background:${INK};color:${PAPER};border-radius:18px;
              padding:24px 30px;display:flex;align-items:center;gap:24px">
    <div style="font-size:40px">🔒</div>
    <div>
      <div class="serif" style="font-size:26px;font-weight:bold;color:${GOLD}">
        Private by design</div>
      <div style="font-size:20px;line-height:1.4;margin-top:4px">
        No servers, no accounts, no analytics. Speech stays in Chrome’s built-in engine,
        and nothing about your puzzle is ever recorded or stored.</div>
    </div>
  </div>
</body></html>`;

// ------------------------------------------------------------ promo tiles ---

const promoSmall = `<!doctype html><html><head><style>${baseCss}</style></head><body
  style="background:${GOLD};align-items:center;justify-content:center;gap:10px">
  <div style="display:flex;align-items:center;gap:20px">
    <div style="width:84px;height:84px">${iconSvg}</div>
    <div class="serif" style="font-size:44px;font-weight:bold">CrosswordChat</div>
  </div>
  <div style="font-size:22px;background:${INK};color:${GOLD};border-radius:999px;
              padding:8px 24px">The crossword you can talk to</div>
</body></html>`;

const GRID_M = [
  '#voice',
  '.#.#A#',
  'chat#.',
];

const promoMarquee = `<!doctype html><html><head><style>${baseCss}</style></head><body
  style="background:${GOLD};flex-direction:row;align-items:center;padding:0 80px;gap:70px">
  <div style="flex:1.2">
    ${brandRow(92)}
    <div class="serif" style="font-size:42px;line-height:1.2;margin-top:26px">
      The New York Times crossword,<br>read aloud and solved out loud.</div>
    <div style="font-size:24px;margin-top:20px;color:#3a3010">
      Hands-free · homophone-smart · nothing stored, ever</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:26px">
    ${gridHtml(GRID_M, 74)}
    ${bubble('Fits! Next: Sushi topper. 3 letters.', { size: 24 })}
  </div>
</body></html>`;

// ------------------------------------------------------------------ render ---

const chromiumPath = () => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return join(root, dir, 'chrome-linux/chrome');
  }
  return undefined; // let playwright-core resolve its own registry
};

const browser = await chromium.launch({ executablePath: chromiumPath() });

async function shoot(html, { width, height, out, transparent = false }) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  writeFileSync(out, await page.screenshot({ omitBackground: transparent }));
  await page.close();
  console.log('wrote', out.replace(ROOT, ''));
}

for (const px of [16, 32, 48, 128]) {
  await shoot(iconPage(px), {
    width: px, height: px, transparent: true,
    out: join(ICONS, `icon-${px}.png`),
  });
}
await shoot(screenshot1, { width: 1280, height: 800, out: join(STORE, 'screenshot-1-1280x800.png') });
await shoot(screenshot2, { width: 1280, height: 800, out: join(STORE, 'screenshot-2-1280x800.png') });
await shoot(promoSmall, { width: 440, height: 280, out: join(STORE, 'promo-small-440x280.png') });
await shoot(promoMarquee, { width: 1400, height: 560, out: join(STORE, 'promo-marquee-1400x560.png') });

await browser.close();
