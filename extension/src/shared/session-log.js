// Render the in-memory diagnostics log (REQ-DIAG-001) as plain text for the "Send session
// data" dialog — shown in the dialog, copied to the clipboard, and used as the prefilled
// GitHub-issue body. Pure text; no DOM, no browser APIs, so it is unit-testable directly.
//
// A session record is { startedAt, settings:{strategy,rate,biasing}, entries:[...] } where
// each entry is one of:
//   { t, kind:'said',  text, sayKind }
//   { t, kind:'heard', mode, alternatives:[{transcript,confidence}], bargeIn? }
//   { t, kind:'stt-error', code }
// The log lives only in the content script's memory and dies with the page (never persisted).

function fmtSettings(s = {}) {
  return `strategy=${s.strategy ?? '?'}, rate=${s.rate ?? '?'}, biasing=${s.biasing ?? 'off'}`;
}

function fmtHeard(entry) {
  const alts = (entry.alternatives ?? []).map((a) => {
    const conf = typeof a.confidence === 'number' && a.confidence > 0 ? ` (${a.confidence.toFixed(2)})` : '';
    return `"${a.transcript}"${conf}`;
  });
  const tag = `HEARD${entry.bargeIn ? ' (barge-in)' : ''} [${entry.mode ?? 'normal'}]`;
  return `${tag}: ${alts.length ? alts.join(' | ') : '(nothing)'}`;
}

function fmtEntry(entry, startedAt) {
  const at = startedAt ? `[+${((entry.t - startedAt) / 1000).toFixed(1)}s] ` : '';
  if (entry.kind === 'said') return `${at}SAID${entry.sayKind ? ` (${entry.sayKind})` : ''}: ${JSON.stringify(entry.text ?? '')}`;
  if (entry.kind === 'heard') return `${at}${fmtHeard(entry)}`;
  if (entry.kind === 'stt-error') return `${at}ERROR: ${entry.code}`;
  return `${at}${entry.kind ?? '?'}`;
}

/**
 * @param {Array<object>} sessions  session records, oldest first
 * @returns {string}
 */
export function formatSessions(sessions = []) {
  if (!sessions.length) return 'No voice sessions recorded on this page yet.';
  return sessions
    .map((session, i) => {
      const turns = session.entries?.length ?? 0;
      const header = `## Session ${i + 1} (${turns} turn${turns === 1 ? '' : 's'})\n`
        + `Settings: ${fmtSettings(session.settings)}`;
      const body = (session.entries ?? []).map((e) => fmtEntry(e, session.startedAt)).join('\n');
      return body ? `${header}\n${body}` : header;
    })
    .join('\n\n');
}
