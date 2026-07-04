// Clue innerHTML → styled runs [{text, italic}] (REQ-PAGE-003, REQ-READ-007).
// Tiny tag/entity tokenizer — no DOM dependency, so it unit-tests in plain node.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', oacute: 'ó', uacute: 'ú',
  iacute: 'í', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä',
};

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * @param {string} html  clue markup as found in the clue list / gameData
 * @returns {Array<{text: string, italic: boolean}>}  adjacent same-style runs merged;
 *   <i>/<em> toggle italic, all other tags are stripped (text kept).
 */
export function parseClueHtml(html) {
  const runs = [];
  let italicDepth = 0;
  let last = 0;
  const src = String(html ?? '');
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;

  const pushText = (raw) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    const italic = italicDepth > 0;
    const prev = runs[runs.length - 1];
    if (prev && prev.italic === italic) prev.text += text;
    else runs.push({ text, italic });
  };

  let m;
  while ((m = tagRe.exec(src)) !== null) {
    pushText(src.slice(last, m.index));
    last = tagRe.lastIndex;
    const tag = m[1].toLowerCase();
    if (tag === 'i' || tag === 'em') {
      if (m[0][1] === '/') italicDepth = Math.max(0, italicDepth - 1);
      else italicDepth++;
    }
  }
  pushText(src.slice(last));
  return runs;
}
