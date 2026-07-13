// STT contextual-biasing phrase sets (REQ-SPCH-011): mode-scoped, drawn only from the
// closed vocabularies we control (commands, the loaded puzzle's real clue labels, the
// spelling alphabet). Never the answer word.

import { describe, test, expect } from 'vitest';
import { phrasesFor, BIASING_MODES } from '../../extension/src/speech/biasing.js';

// A minimal fake puzzle model: three clues, A1's first cell crosses D5.
function fakeModel() {
  const clues = { A1: { cellIndices: [0, 1, 2] }, A12: { cellIndices: [3, 4] }, D5: { cellIndices: [0, 3] } };
  const patterns = { A1: [null, null, null], A12: [null, 'X'], D5: [null, null] };
  return {
    orderedClueIds: ['A1', 'A12', 'D5'],
    clue: (id) => clues[id],
    crossingAt: (id, i) => (id === 'A1' && i === 0 ? { clueId: 'D5' } : null),
    patternFor: (id) => patterns[id],
  };
}
const phrasesOf = (list) => list.map((p) => p.phrase.toLowerCase());
const boostOf = (list, phrase) => list.find((p) => p.phrase.toLowerCase() === phrase)?.boost;

describe('STT contextual biasing (REQ-SPCH-011)', () => {
  test('off (or unknown) → no phrases', () => {
    expect(phrasesFor({ biasing: 'off', mode: 'normal', model: fakeModel(), clueId: 'A1' })).toEqual([]);
    expect(phrasesFor({})).toEqual([]);
    expect(phrasesFor({ biasing: 'bogus' })).toEqual([]);
    expect(BIASING_MODES).toContain('off');
  });

  test('commands mode biases command words and the puzzle’s real clue labels', () => {
    const p = phrasesFor({ biasing: 'commands', mode: 'normal', model: fakeModel(), clueId: 'A1' });
    const words = phrasesOf(p);
    expect(words).toContain('next');
    expect(words).toContain('1 across');
    expect(words).toContain('12 across');
    expect(words).toContain('5 down');
    // The current entry's crossing (D5 → "5 down") is boosted above the far labels.
    expect(boostOf(p, '5 down')).toBeGreaterThan(boostOf(p, '12 across'));
    // No bare letters in commands mode.
    expect(words).not.toContain('a');
  });

  test('spelling mode biases the alphabet: bare letters, NATO, and controls', () => {
    const words = phrasesOf(phrasesFor({ biasing: 'spelling', mode: 'spelling', model: fakeModel(), clueId: 'A1' }));
    expect(words).toContain('a');
    expect(words).toContain('j');
    expect(words).toContain('juliet'); // NATO
    expect(words).toContain('done'); // spelling control
    expect(words).not.toContain('12 across'); // labels aren't the focus while spelling
  });

  test('spelling biasing adds letters in normal mode only on a 1–2 open-square entry', () => {
    const model = fakeModel();
    // A12 has one open square ([null,'X']) → letters included.
    expect(phrasesOf(phrasesFor({ biasing: 'spelling', mode: 'normal', model, clueId: 'A12' }))).toContain('a');
    // A1 has three open squares → too long to be spelled letter-by-letter, so no letters.
    expect(phrasesOf(phrasesFor({ biasing: 'spelling', mode: 'normal', model, clueId: 'A1' }))).not.toContain('a');
  });

  test('REQ-SPCH-011: a struggling user arms the spelling alphabet regardless of open squares', () => {
    const model = fakeModel();
    // Same 3-open-square entry as above: 2+ failed attempts flip the letters on…
    const armed = phrasesOf(phrasesFor({ biasing: 'full', mode: 'normal', model, clueId: 'A1', struggling: true }));
    expect(armed).toContain('a');
    expect(armed).toContain('juliet');
    // …but only where spelling biasing is wanted at all: commands-only mode stays letter-free.
    expect(phrasesOf(phrasesFor({ biasing: 'commands', mode: 'normal', model, clueId: 'A1', struggling: true })))
      .not.toContain('a');
    expect(phrasesFor({ biasing: 'off', mode: 'normal', model, clueId: 'A1', struggling: true })).toEqual([]);
  });

  test('full mode adds the contextual reply words during disambiguation', () => {
    const words = phrasesOf(phrasesFor({ biasing: 'full', mode: 'disambiguating', model: fakeModel(), clueId: 'A1' }));
    expect(words).toContain('first');
    expect(words).toContain('second');
    expect(words).toContain('third');
  });

  test('every boost stays within the Web Speech range (0–10]', () => {
    const p = phrasesFor({ biasing: 'full', mode: 'normal', model: fakeModel(), clueId: 'A1' });
    expect(p.length).toBeGreaterThan(0);
    for (const { boost } of p) {
      expect(boost).toBeGreaterThan(0);
      expect(boost).toBeLessThanOrEqual(10);
    }
  });

  test('phrases are deduped (one entry per phrase)', () => {
    const words = phrasesOf(phrasesFor({ biasing: 'full', mode: 'normal', model: fakeModel(), clueId: 'A1' }));
    expect(new Set(words).size).toBe(words.length);
  });
});
