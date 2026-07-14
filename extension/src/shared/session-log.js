// Render the in-memory diagnostics log (REQ-DIAG-001/002) as compact text for the "Send
// session data" dialog — shown in the dialog, copied to the clipboard, and used as the
// prefilled GitHub-issue body. Pure text; no DOM, no browser APIs, so it is unit-testable
// directly.
//
// The format (tag `CWC1`) is deliberately dense: the issue link's ~6000 URL-encoded
// characters are the binding budget, so heard transcripts stay plain text (they are the
// data) and everything else — timestamps, spoken lines, errors — is short codes built from
// characters encodeURIComponent leaves unescaped. The grammar and a worked example live in
// dev/docs/SESSION-LOG.md; a drift-guard in session-log.test.js keeps doc and formatter equal.
//
// A session record is:
//   { startedAt, version?, puzzle?, onDevice?, aec?,
//     settings:{strategy,rate,biasing,echoMode}, entries:[...] }
// where each entry is one of:
//   { t, kind:'said',  say:{kind,...} }   the machine's say payload (never rendered text)
//   { t, kind:'heard', mode, alternatives:[{transcript,confidence}], bargeIn? }
//   { t, kind:'stt-error', code }
//   { t, kind:'typed', clueId?, word?, cells? }   out-of-band grid edit (REQ-DIAG-002)
//   { t, kind:'end',   reason }
// The log lives only in the content script's memory and dies with the page (never persisted).

export const FORMAT_TAG = 'CWC1';
export const NO_SESSIONS = 'No voice sessions recorded on this page yet.';

const STRATEGY_CODES = { 'most-filled': 'mf', 'list-order': 'lo' };
const ERROR_CODES = {
  'no-speech': 'n',
  reset: 'r',
  aborted: 'a',
  'not-allowed': 'd',
  network: 'w',
  'audio-capture': 'c',
  other: 'o',
};
const MODE_CODES = {
  normal: '',
  spelling: 's',
  disambiguating: 'd',
  'goto-number': 'g',
};

// `!` separates events and `*`/`~` structure heard alternatives, so they can never be
// allowed inside a transcript; everything else passes through as the recognizer gave it.
const sanitize = (text) => String(text ?? '').replace(/[!*~]/g, ' ').replace(/\s+/g, ' ').trim();

const confOf = (c) => (typeof c === 'number' && c > 0 ? `~${Math.min(99, Math.round(c * 100))}` : '');

// '5 Across' / 'A5' → '5A'; anything unrecognized passes through sanitized.
function compactLabel(labelOrId) {
  const s = String(labelOrId ?? '');
  let m = s.match(/^(\d+)\s+(Across|Down)$/i);
  if (m) return `${m[1]}${m[2][0].toUpperCase()}`;
  m = s.match(/^([AD])(\d+)$/);
  if (m) return `${m[2]}${m[1]}`;
  return sanitize(s);
}

const dotted = (pattern) => (pattern ?? []).map((l) => (l ? String(l).toLowerCase() : '.')).join('');

// One say payload → its compact body. Codes exist only for the frequent kinds; anything
// else renders as `(kind)` so a new say kind is never silently dropped.
function fmtSay(say = {}) {
  switch (say.kind) {
    case 'clue':
      return `>${compactLabel(say.label)}${say.len != null ? `.${say.len}` : ''}`;
    case 'fit':
      return say.spelledDifferently && say.word ? `+${sanitize(say.word).toLowerCase()}` : '+';
    case 'override':
      return say.spelledDifferently && say.word ? `++${sanitize(say.word).toLowerCase()}` : '++';
    case 'length-mismatch': {
      const lens = (say.variants ?? []).map((v) => v.len).join('.');
      return `L${lens}n${say.needed}${say.open ? `o${say.open}` : ''}`;
    }
    case 'collision': {
      const [first, ...rest] = say.collisions ?? [];
      if (!first) return 'x';
      return `x${first.pos + 1}${rest.length ? `.${rest.length}` : ''}`;
    }
    case 'ambiguous':
      return `a${say.words?.length ?? 0}`;
    case 'didnt-catch':
      return '?';
    case 'goto-didnt-catch':
      return '?g';
    case 'hint':
      return `H${dotted(say.pattern)}`;
    case 'spell-start':
      return `sp${say.open ?? 0}.${say.length ?? 0}`;
    case 'spell-progress':
      return `sl ${(say.letters ?? []).join('').toLowerCase()}`;
    case 'grid-full-wrong':
      return 'G';
    case 'celebration':
      return 'W';
    case 'goodbye':
      return 'B';
    case 'noise-hint':
      return 'N';
    default:
      return `(${sanitize(say.kind ?? '?')})`;
  }
}

function fmtHeard(entry) {
  const alts = (entry.alternatives ?? [])
    .map((a) => `${sanitize(a.transcript)}${confOf(a.confidence)}`)
    .join('*');
  const tag = `h${entry.bargeIn ? 'b' : ''}${MODE_CODES[entry.mode] ?? MODE_CODES.normal}`;
  return `${tag} ${alts || '()'}`;
}

function fmtTyped(entry) {
  if (entry.clueId == null) return `t *${entry.cells ?? 0}`;
  return `t ${compactLabel(entry.clueId)} ${sanitize(entry.word ?? '').toLowerCase()}`;
}

function fmtBody(entry) {
  if (entry.kind === 'said') return fmtSay(entry.say);
  if (entry.kind === 'heard') return fmtHeard(entry);
  if (entry.kind === 'stt-error') return `e${ERROR_CODES[entry.code] ?? `(${sanitize(entry.code)})`}`;
  if (entry.kind === 'typed') return fmtTyped(entry);
  if (entry.kind === 'end') return `z ${sanitize(entry.reason ?? '?')}`;
  return `(${sanitize(entry.kind ?? '?')})`;
}

// Delta seconds from the previous event (integer; omitted when 0) + the event body.
function fmtEvents(entries, startedAt) {
  let prev = startedAt;
  return entries.map((entry) => {
    const dt = Math.max(0, Math.round(((entry.t ?? prev) - prev) / 1000));
    prev = entry.t ?? prev;
    return `${dt || ''}${fmtBody(entry)}`;
  });
}

function fmtFlag(name, value) {
  return typeof value === 'boolean' ? ` ${name}${value ? 1 : 0}` : '';
}

function fmtHeader(session, i) {
  const s = session.settings ?? {};
  const strategy = STRATEGY_CODES[s.strategy] ?? sanitize(s.strategy ?? '?');
  const biasing = String(s.biasing ?? 'off')[0];
  const echo = String(s.echoMode ?? 'guard')[0];
  const turns = session.entries?.length ?? 0;
  return `S${i + 1} ${strategy} ${s.rate ?? '?'} b${biasing} e${echo}`
    + `${fmtFlag('od', session.onDevice)}${fmtFlag('aec', session.aec)} (${turns})`;
}

function preamble(sessions) {
  const src = sessions.find((s) => s.version || s.puzzle) ?? {};
  return [FORMAT_TAG, src.version ? `v${src.version}` : null, src.puzzle || null]
    .filter(Boolean).join(' ');
}

const fence = (text) => `\`\`\`\n${text}\n\`\`\``;

// Assemble the final text from per-session {header, events, omitted, omittedHead} parts.
function assemble(sessions, parts) {
  const blocks = parts.map((p) => {
    const marks = [];
    if (p.omitted) marks.push(`(${p.omitted} events omitted)`);
    if (p.omittedHead) marks.push(`(${p.omittedHead} earlier events omitted)`);
    const stream = [...marks, ...p.events].join('!');
    return stream ? `${p.header}\n${stream}` : p.header;
  });
  return fence(`${preamble(sessions)}\n\n${blocks.join('\n\n')}`);
}

/**
 * Full log text — the modal preview and "Copy log" payload.
 * @param {Array<object>} sessions  session records, oldest first
 * @returns {string}
 */
export function formatSessions(sessions = []) {
  if (!sessions.length) return NO_SESSIONS;
  const parts = sessions.map((session, i) => ({
    header: fmtHeader(session, i),
    events: fmtEvents(session.entries ?? [], session.startedAt),
    omitted: 0,
    omittedHead: 0,
  }));
  return assemble(sessions, parts);
}

/**
 * Largest log text that satisfies `fits`, trimming whole events only (REQ-DIAG-001):
 * older sessions collapse to an omission marker first, then the newest session trims from
 * its HEAD — its tail (how the session ended) is the last thing ever dropped. May still
 * return an over-budget text when even the headers alone overflow; the caller's hard cap
 * (buildIssueUrl) is the backstop.
 * @param {Array<object>} sessions  session records, oldest first
 * @param {(text: string) => boolean} fits
 * @returns {string}
 */
export function formatSessionsWithin(sessions = [], fits = () => true) {
  if (!sessions.length) return NO_SESSIONS;
  const parts = sessions.map((session, i) => ({
    header: fmtHeader(session, i),
    events: fmtEvents(session.entries ?? [], session.startedAt),
    omitted: 0,
    omittedHead: 0,
  }));
  let text = assemble(sessions, parts);
  // Oldest sessions first: collapse each event stream entirely before touching a newer one.
  for (let i = 0; i < parts.length - 1 && !fits(text); i++) {
    if (!parts[i].events.length) continue;
    parts[i] = { ...parts[i], omitted: parts[i].events.length, events: [] };
    text = assemble(sessions, parts);
  }
  if (fits(text)) return text;
  // Newest session: binary-search the largest kept TAIL of its events.
  const last = parts.length - 1;
  const events = parts[last].events;
  const render = (keep) => assemble(sessions, parts.map((p, i) => (i === last
    ? { ...p, omittedHead: events.length - keep, events: events.slice(events.length - keep) }
    : p)));
  let lo = 0; // keeping `lo` events is known to fit (or is the floor)
  let hi = events.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(render(mid))) lo = mid;
    else hi = mid - 1;
  }
  return render(lo);
}
