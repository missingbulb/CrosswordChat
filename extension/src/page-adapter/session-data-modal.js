// The in-page "Send session data" dialog (REQ-DIAG-001). Opened from the toolbar split
// button's menu, it shows every voice session run on THIS page load — spoken lines, heard
// n-best, and the settings in force (including the biasing experiment) — held only in memory
// and gone on reload. It offers "Copy log" (local clipboard) and "Open a GitHub issue" (a
// link the user clicks, reviews, edits, and submits). The extension makes no network request
// of its own (REQ-NFR-001): the log is never persisted (REQ-NFR-002) and never sent by us.
//
// This is a deliberate, user-invoked diagnostics surface — distinct from the always-on
// caption panel forbidden by REQ-SPCH-007. It borrows the settings modal's centred-card look
// (settings-modal.js). Transcript text is injected via textContent only — heard speech is
// untrusted, so it must never become markup.

import { formatSessions, formatSessionsWithin } from '../shared/session-log.js';
import { buildIssueUrl } from '../shared/urls.js';

export const SESSION_DATA_MODAL_ID = 'cc-session-data-modal';

export const SESSION_DATA_CSS = `
#${SESSION_DATA_MODAL_ID} {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  font-family: nyt-franklin, "Libre Franklin", system-ui, -apple-system, sans-serif;
  color: #121212; line-height: 1.4;
}
#${SESSION_DATA_MODAL_ID} * { box-sizing: border-box; }
#${SESSION_DATA_MODAL_ID} .cc-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
#${SESSION_DATA_MODAL_ID} .cc-body {
  position: relative; background: #fff; border-radius: 3px;
  width: min(92vw, 640px); max-height: 90vh; overflow: hidden;
  display: flex; flex-direction: column;
  padding: 28px 32px 24px; box-shadow: 0 8px 28px rgba(0,0,0,.28); outline: none;
}
#${SESSION_DATA_MODAL_ID} .cc-close {
  position: absolute; top: 12px; right: 12px; width: 32px; height: 32px;
  border: 0; background: transparent; font-size: 20px; line-height: 1; color: #757575;
  cursor: pointer; border-radius: 50%;
}
#${SESSION_DATA_MODAL_ID} .cc-close:hover { background: #f0f0f0; color: #121212; }
#${SESSION_DATA_MODAL_ID} .cc-title {
  font-family: karnak, "nyt-karnak", Georgia, serif; font-size: 26px; font-weight: 700; margin: 0 0 6px;
}
#${SESSION_DATA_MODAL_ID} .cc-sub { font-size: 13px; color: #666; margin: 0 0 14px; }
#${SESSION_DATA_MODAL_ID} .cc-log {
  flex: 1 1 auto; overflow: auto; margin: 0; padding: 12px 14px;
  background: #f7f7f7; border: 1px solid #e6e6e6; border-radius: 4px;
  font: 12px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  white-space: pre-wrap; word-break: break-word; min-height: 120px;
}
#${SESSION_DATA_MODAL_ID} .cc-btns {
  display: flex; justify-content: flex-end; gap: 12px; align-items: center;
  margin-top: 18px; padding-top: 16px; border-top: 1px solid #e6e6e6; flex-wrap: wrap;
}
#${SESSION_DATA_MODAL_ID} .cc-note { margin-right: auto; font-size: 12px; color: #757575; }
#${SESSION_DATA_MODAL_ID} .cc-btn {
  font: inherit; font-weight: 700; border-radius: 40px; padding: 10px 22px;
  cursor: pointer; min-width: 120px; text-align: center; text-decoration: none;
}
#${SESSION_DATA_MODAL_ID} .cc-primary { background: #121212; border: 1px solid #121212; color: #fff; }
#${SESSION_DATA_MODAL_ID} .cc-primary:hover { background: #333; }
#${SESSION_DATA_MODAL_ID} .cc-secondary { background: #fff; border: 1px solid #121212; color: #121212; }
#${SESSION_DATA_MODAL_ID} .cc-secondary:hover { background: #f3f3f3; }
`;

const ISSUE_TITLE = 'CrosswordChat session data';

/**
 * Mount the Session data dialog (one at a time). Reads the log via getSessions() at open time.
 * @param {Document} document
 * @param {{getSessions?: () => Array<object>, onClose?: () => void}} [handlers]
 * @returns {{close: () => void}}
 */
export function mountSessionDataModal(document, { getSessions = () => [], onClose } = {}) {
  const existing = document.getElementById(SESSION_DATA_MODAL_ID);
  if (existing) {
    existing.querySelector('[data-cc-role="body"]')?.focus();
    return { close() { existing.remove(); } };
  }

  const view = document.defaultView ?? globalThis;
  const sessions = getSessions() ?? [];
  const logText = formatSessions(sessions);

  const host = document.createElement('div');
  host.dataset.ccRole = 'session-data-host';
  const style = document.createElement('style');
  style.textContent = SESSION_DATA_CSS;

  const dialog = document.createElement('div');
  dialog.id = SESSION_DATA_MODAL_ID;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'CrosswordChat session data');

  const overlay = document.createElement('div');
  overlay.className = 'cc-overlay';
  overlay.dataset.ccRole = 'overlay';

  const body = document.createElement('div');
  body.className = 'cc-body';
  body.tabIndex = -1;
  body.dataset.ccRole = 'body';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cc-close';
  closeBtn.setAttribute('aria-label', 'close');
  closeBtn.textContent = '✕';

  const title = document.createElement('h1');
  title.className = 'cc-title';
  title.textContent = 'Session data';

  const sub = document.createElement('p');
  sub.className = 'cc-sub';
  sub.textContent = 'Everything said and heard on this page, held in memory only — it is gone when '
    + 'you reload, and the extension never stores or sends it. Review and edit before you submit.';

  const pre = document.createElement('pre');
  pre.className = 'cc-log';
  pre.dataset.ccRole = 'log';
  pre.textContent = logText; // textContent, never innerHTML — heard speech is untrusted

  const btns = document.createElement('div');
  btns.className = 'cc-btns';

  const note = document.createElement('span');
  note.className = 'cc-note';
  note.dataset.ccRole = 'note';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'cc-btn cc-secondary';
  copyBtn.dataset.ccRole = 'copy';
  copyBtn.textContent = 'Copy log';

  const issueLink = document.createElement('a');
  issueLink.className = 'cc-btn cc-primary';
  issueLink.dataset.ccRole = 'issue';
  issueLink.textContent = 'Open a GitHub issue';
  // Over-budget logs re-render through the format-aware trimmer (whole events only,
  // newest tail kept — REQ-DIAG-001) instead of being chopped mid-line.
  issueLink.href = buildIssueUrl({
    title: ISSUE_TITLE,
    body: logText,
    trim: (fits) => formatSessionsWithin(sessions, fits),
  });
  issueLink.target = '_blank';
  issueLink.rel = 'noopener noreferrer';

  btns.append(note, copyBtn, issueLink);
  body.append(closeBtn, title, sub, pre, btns);
  dialog.append(overlay, body);
  host.append(style, dialog);
  document.body.appendChild(host);

  let removed = false;
  const close = () => {
    if (removed) return;
    removed = true;
    view.document.removeEventListener('keydown', onKeydown, true);
    host.remove();
    onClose?.();
  };
  function onKeydown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    close();
  }

  copyBtn.addEventListener('click', async () => {
    try {
      await view.navigator?.clipboard?.writeText(logText);
      note.textContent = 'Copied to clipboard.';
    } catch {
      note.textContent = 'Copy failed — select the text above and copy manually.';
    }
  });
  // The issue link is ordinary navigation the user performs; close the dialog after they click.
  issueLink.addEventListener('click', () => close());
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  view.document.addEventListener('keydown', onKeydown, true);

  body.focus();
  return { close };
}
