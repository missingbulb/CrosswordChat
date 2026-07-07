import { describe, test, expect } from 'vitest';
import { parseClueHtml, decodeEntities } from '../../extension/src/page-adapter/clue-html.js';

describe('clue HTML parsing', () => {
  test('REQ-PAGE-003: italic spans become italic runs, adjacent styles merge', () => {
    expect(parseClueHtml('Little <i>house</i>')).toEqual([
      { text: 'Little ', italic: false },
      { text: 'house', italic: true },
    ]);
    expect(parseClueHtml('<em>All italic</em>')).toEqual([{ text: 'All italic', italic: true }]);
    expect(parseClueHtml('a<i>b</i><i>c</i>d')).toEqual([
      { text: 'a', italic: false },
      { text: 'bc', italic: true },
      { text: 'd', italic: false },
    ]);
  });

  test('REQ-READ-007: entities decode (named, numeric, hex); unknown tags strip but keep text', () => {
    expect(parseClueHtml('Tom &amp; Jerry')).toEqual([{ text: 'Tom & Jerry', italic: false }]);
    expect(parseClueHtml('&ldquo;The ___ of the Matter&rdquo;'))
      .toEqual([{ text: '“The ___ of the Matter”', italic: false }]);
    expect(decodeEntities('caf&#233; caf&#xE9; don&#x27;t')).toBe('café café don\'t');
    expect(parseClueHtml('Dying <b>fire</b> bit')).toEqual([{ text: 'Dying fire bit', italic: false }]);
  });

  test('nested and unbalanced italics do not break parsing', () => {
    expect(parseClueHtml('<i>a<em>b</em>c</i>')).toEqual([{ text: 'abc', italic: true }]);
    expect(parseClueHtml('closing only</i> text')).toEqual([{ text: 'closing only text', italic: false }]);
  });

  test('empty and plain inputs', () => {
    expect(parseClueHtml('')).toEqual([]);
    expect(parseClueHtml('Plain clue')).toEqual([{ text: 'Plain clue', italic: false }]);
  });
});
