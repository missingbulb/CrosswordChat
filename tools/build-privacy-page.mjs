#!/usr/bin/env node
// Render the privacy policy (dev/build/store-assets/PRIVACY.md) as a small static site
// for GitHub Pages: dist-pages/privacy.html plus an index.html redirect. Published by
// .github/workflows/pages.yml on every change to the policy; permalink:
//
//   https://missingbulb.github.io/CrosswordChat/privacy.html

import { marked } from 'marked';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist-pages');
mkdirSync(OUT, { recursive: true });

const md = readFileSync(join(ROOT, 'dev/build/store-assets/PRIVACY.md'), 'utf8');
const body = marked.parse(md, { gfm: true });

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CrosswordChat Privacy Policy</title>
<link rel="canonical" href="https://missingbulb.github.io/CrosswordChat/privacy.html">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #FAF6EC; color: #191919;
         font: 17px/1.6 Georgia, 'Times New Roman', serif; }
  header { background: #F2C53D; border-bottom: 3px solid #191919; padding: 28px 20px; }
  header .inner, main { max-width: 720px; margin: 0 auto; }
  header a { color: inherit; text-decoration: none; font-weight: bold; font-size: 24px; }
  main { padding: 12px 20px 64px; }
  h1 { font-size: 34px; line-height: 1.2; }
  h2 { font-size: 24px; margin-top: 2em; border-bottom: 2px solid #191919; padding-bottom: 6px; }
  a { color: #7a5c00; }
  table { border-collapse: collapse; width: 100%; font-size: 15.5px;
          font-family: 'Helvetica Neue', Arial, sans-serif; }
  th, td { border: 1.5px solid #191919; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #F8DE8D; }
  blockquote { margin: 0; padding: 2px 18px; border-left: 4px solid #F2C53D; }
  footer { max-width: 720px; margin: 0 auto; padding: 0 20px 40px;
           font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; color: #555; }
</style>
</head>
<body>
<header><div class="inner"><a href="https://github.com/missingbulb/CrosswordChat">🧩 CrosswordChat</a></div></header>
<main>
${body}
</main>
<footer>This page is generated from
  <a href="https://github.com/missingbulb/CrosswordChat/blob/main/dev/build/store-assets/PRIVACY.md">PRIVACY.md</a>
  in the public repository — its full change history is auditable there.</footer>
</body>
</html>
`;

writeFileSync(join(OUT, 'privacy.html'), page);
writeFileSync(join(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=privacy.html">
<title>CrosswordChat</title>
<link rel="canonical" href="https://missingbulb.github.io/CrosswordChat/privacy.html">
</head><body><a href="privacy.html">CrosswordChat privacy policy</a></body></html>
`);

console.log('wrote dist-pages/privacy.html and dist-pages/index.html');
