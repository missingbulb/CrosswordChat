// The command reference page (REQ-CMD-007): a self-contained static page — no scripts,
// no network — that names every command group, so the shipped help stays in sync with the
// lexicon it documents.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HTML = readFileSync(join(process.cwd(), 'extension/src/help/help.html'), 'utf8');

describe('help page', () => {
  test('REQ-CMD-007: names every command group and the core verbs', () => {
    for (const heading of ['Answering', 'Getting around', 'Fixing the grid', 'Spelling', 'Ending the session']) {
      expect(HTML).toContain(heading);
    }
    // A representative verb from each command family in the lexicon (REQ-CMD-001).
    for (const verb of ['next', 'back', 'flip', 'go to', 'repeat', 'undo', 'clear',
      'pencil', 'pen', 'spell', 'hint', 'help', 'anyway', 'stop']) {
      expect(HTML.toLowerCase()).toContain(verb);
    }
  });

  test('REQ-CMD-007/REQ-NFR-001: pure static HTML — no scripts, no remote resources', () => {
    expect(HTML).not.toMatch(/<script/i);
    expect(HTML).not.toMatch(/fetch\s*\(|XMLHttpRequest/);
    // No remotely loaded assets: src/href to http(s) are out; only the mailto link remains.
    expect(HTML).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
  });
});
