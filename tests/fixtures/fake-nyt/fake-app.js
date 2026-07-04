// A faithful miniature of the NYT crossword page: same class names as
// extension/src/page-adapter/selectors.js, same interaction model (click to select,
// document-level keyboard input, congrats modal on correct completion).
// It is the integration-test target AND an offline rehearsal stage (npm run fixture).
// Deliberately self-contained: it must NOT import extension code.

const CELL = 40;

function entriesFromGrid(rows, cols, isBlock) {
  // Standard crossword numbering (duplicated from the model on purpose — the fixture
  // must not depend on the code under test).
  const entries = [];
  let num = 0;
  const open = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && !isBlock(r, c);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!open(r, c)) continue;
      const startsAcross = !open(r, c - 1) && open(r, c + 1);
      const startsDown = !open(r - 1, c) && open(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      num++;
      if (startsAcross) {
        const cells = [];
        for (let cc = c; open(r, cc); cc++) cells.push(r * cols + cc);
        entries.push({ id: `A${num}`, number: num, direction: 'across', cells });
      }
      if (startsDown) {
        const cells = [];
        for (let rr = r; open(rr, c); rr++) cells.push(rr * cols + c);
        entries.push({ id: `D${num}`, number: num, direction: 'down', cells });
      }
    }
  }
  return entries;
}

/**
 * Build the fake page inside `document.body` and wire up its behavior.
 * @param {Document} document
 * @param {object} puzzle  see puzzle.js
 * @param {{swallowKeys?: boolean, renderDelayMs?: number, legacyKeysOnly?: boolean}} [opts]
 *   swallowKeys — page ignores ALL keyboard input (REQ-PAGE-007 / REQ-ANS-013 failure paths).
 *   renderDelayMs — DOM repaints lag state changes by this long, like the live React app.
 *   legacyKeysOnly — key handler ignores events whose legacy keyCode is 0, like handlers
 *     that read event.keyCode/which (bare synthetic {key} events construct those as 0).
 */
export function initFakeNyt(document, puzzle, { swallowKeys = false, renderDelayMs = 0, legacyKeysOnly = false } = {}) {
  const { rows, cols, solution } = puzzle;
  const isBlock = (r, c) => solution[r][c] === '#';
  const entries = entriesFromGrid(rows, cols, isBlock);
  const numberAt = new Map();
  for (const e of entries) {
    if (!numberAt.has(e.cells[0])) numberAt.set(e.cells[0], e.number);
  }

  const state = {
    letters: Array.from({ length: rows * cols }, () => ''),
    selCell: entries[0]?.cells[0] ?? 0,
    selDir: 'across',
    solved: false,
  };

  const SVG = 'http://www.w3.org/2000/svg';
  document.body.innerHTML = '';
  const main = document.createElement('main');

  const boardWrap = document.createElement('div');
  boardWrap.className = 'xwd__board';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
  svg.setAttribute('width', String(cols * CELL));

  const cellEls = [];
  const letterEls = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', `xwd__cell${isBlock(r, c) ? ' xwd__cell--block' : ''}`);
      const rect = document.createElementNS(SVG, 'rect');
      rect.setAttribute('x', String(c * CELL));
      rect.setAttribute('y', String(r * CELL));
      rect.setAttribute('width', String(CELL));
      rect.setAttribute('height', String(CELL));
      g.append(rect);
      if (!isBlock(r, c)) {
        if (numberAt.has(i)) {
          const num = document.createElementNS(SVG, 'text');
          num.setAttribute('class', 'xwd__cell-number');
          num.setAttribute('x', String(c * CELL + 4));
          num.setAttribute('y', String(r * CELL + 12));
          num.textContent = String(numberAt.get(i));
          g.append(num);
        }
        const letter = document.createElementNS(SVG, 'text');
        letter.setAttribute('class', 'xwd__cell-letter');
        letter.setAttribute('x', String(c * CELL + CELL / 2));
        letter.setAttribute('y', String(r * CELL + CELL - 10));
        letter.setAttribute('text-anchor', 'middle');
        g.append(letter);
        letterEls[i] = letter;
      }
      svg.append(g);
      cellEls[i] = g;
    }
  }
  boardWrap.append(svg);
  main.append(boardWrap);

  const clueItemEls = new Map(); // id → li
  for (const [direction, list] of [['across', puzzle.across], ['down', puzzle.down]]) {
    const wrapper = document.createElement('section');
    wrapper.className = 'xwd__clue-list--wrapper';
    const title = document.createElement('h3');
    title.className = 'xwd__clue-list--title';
    title.textContent = direction === 'across' ? 'Across' : 'Down';
    const ol = document.createElement('ol');
    ol.className = 'xwd__clue-list--list';
    for (const clue of list) {
      const li = document.createElement('li');
      li.className = 'xwd__clue--li';
      const label = document.createElement('span');
      label.className = 'xwd__clue--label';
      label.textContent = String(clue.number);
      const text = document.createElement('span');
      text.className = 'xwd__clue--text';
      text.innerHTML = clue.html;
      li.append(label, text);
      ol.append(li);
      clueItemEls.set(`${direction === 'across' ? 'A' : 'D'}${clue.number}`, li);
    }
    wrapper.append(title, ol);
    main.append(wrapper);
  }
  document.body.append(main);

  const entryAt = (cellIndex, dir) =>
    entries.find((e) => e.direction === dir && e.cells.includes(cellIndex))
      ?? entries.find((e) => e.cells.includes(cellIndex));

  function selectedEntry() {
    return entryAt(state.selCell, state.selDir);
  }

  function render() {
    if (renderDelayMs > 0) {
      setTimeout(paint, renderDelayMs); // state is current; the DOM catches up later
    } else {
      paint();
    }
  }

  function paint() {
    state.letters.forEach((letter, i) => {
      if (letterEls[i]) letterEls[i].textContent = letter;
    });
    const entry = selectedEntry();
    cellEls.forEach((g, i) => {
      const base = `xwd__cell${g.getAttribute('class').includes('--block') ? ' xwd__cell--block' : ''}`;
      g.setAttribute('class', i === state.selCell ? `${base} xwd__cell--selected` : base);
    });
    for (const [id, li] of clueItemEls) {
      li.className = entry && id === entry.id ? 'xwd__clue--li xwd__clue--selected' : 'xwd__clue--li';
    }
  }

  function checkSolved() {
    const target = solution.join('').replace(/#/g, '');
    const current = state.letters.filter((_, i) => {
      const r = Math.floor(i / cols);
      return !isBlock(r, i % cols);
    }).join('');
    if (!state.solved && current === target) {
      state.solved = true;
      const modal = document.createElement('div');
      modal.className = 'xwd__congrats-modal';
      modal.textContent = 'Congratulations!';
      document.body.append(modal);
    }
  }

  function advanceWithin(entry) {
    const pos = entry.cells.indexOf(state.selCell);
    if (pos >= 0 && pos < entry.cells.length - 1) state.selCell = entry.cells[pos + 1];
  }

  document.addEventListener('keydown', (event) => {
    if (swallowKeys) return;
    if (legacyKeysOnly && !event.keyCode) return;
    const { key } = event;
    if (/^[a-zA-Z]$/.test(key)) {
      state.letters[state.selCell] = key.toUpperCase();
      advanceWithin(selectedEntry());
      render();
      checkSolved();
    } else if (key === 'Backspace') {
      const entry = selectedEntry();
      if (state.letters[state.selCell]) {
        state.letters[state.selCell] = '';
      } else {
        const pos = entry.cells.indexOf(state.selCell);
        if (pos > 0) {
          state.selCell = entry.cells[pos - 1];
          state.letters[state.selCell] = '';
        }
      }
      render();
    }
  });

  cellEls.forEach((g, i) => {
    if (g.getAttribute('class').includes('--block')) return;
    g.addEventListener('click', () => {
      if (state.selCell === i) {
        state.selDir = state.selDir === 'across' ? 'down' : 'across'; // NYT: re-click toggles
      } else {
        state.selCell = i;
      }
      render();
    });
  });

  for (const [id, li] of clueItemEls) {
    li.addEventListener('click', () => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      state.selDir = entry.direction;
      state.selCell = entry.cells[0];
      render();
    });
  }

  render();
  return {
    state,
    entries,
    /** Test helper: type a string through the same code path as real key events. */
    typeAt(cellIndex, dir, word) {
      state.selCell = cellIndex;
      state.selDir = dir;
      render();
      for (const ch of word) {
        document.dispatchEvent(new (document.defaultView.KeyboardEvent)('keydown', {
          key: ch,
          keyCode: ch.toUpperCase().charCodeAt(0),
          bubbles: true,
        }));
      }
    },
  };
}
