// A faithful miniature of the NYT crossword page, mirroring a saved live Mini dump
// (2026-07): same class names as extension/src/page-adapter/selectors.js, cell state
// classes on the <rect> (not the <g>), number/letter as unclassed direct-child <text>
// elements each nesting a hidden aria-live <text>, and keyboard input handled by a
// listener on the app root container (React-style delegation — NOT document level,
// so events dispatched on <body> never arrive, exactly like the live page).
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
 * @param {{swallowKeys?: boolean, renderDelayMs?: number, legacyKeysOnly?: boolean,
 *          noPencilToggle?: boolean, pencilMarkup?: 'aria' | 'icon',
 *          toolbarWithoutPencil?: boolean}} [opts]
 *   swallowKeys — page ignores ALL keyboard input (REQ-PAGE-007 / REQ-ANS-013 failure paths).
 *   renderDelayMs — DOM repaints lag state changes by this long, like the live React app.
 *   legacyKeysOnly — key handler ignores events whose legacy keyCode is 0, like handlers
 *     that read event.keyCode/which (bare synthetic {key} events construct those as 0).
 *   noPencilToggle — render no toolbar at all, like a page without one (REQ-PAGE-012
 *     degradation path).
 *   pencilMarkup — how the pencil button announces itself: 'aria' (default) carries
 *     aria-label="Pencil" like the markup we verified; 'icon' carries NO accessible
 *     name, only an icon child with a pencil-flavored class — the shape the live page
 *     is suspected to use (findPencilToggle()'s fallback net).
 *   toolbarWithoutPencil — render the toolbar with other tool buttons but no pencil,
 *     like a redesigned toolbar (session button falls back to the end of the row).
 *   splash — cover the app with the pre-puzzle "Ready to start solving?" modal
 *     (REQ-LIFE-016); its Play button removes it. 'stuck' renders a Play button
 *     that ignores clicks, like a page that only honors trusted input.
 *   paused — start behind the auto-pause veil ("Your puzzle is paused" + Resume,
 *     REQ-LIFE-017); Resume lifts it. Also reachable at runtime via app.showPause().
 */
export function initFakeNyt(document, puzzle, { swallowKeys = false, renderDelayMs = 0, legacyKeysOnly = false, noPencilToggle = false, pencilMarkup = 'aria', toolbarWithoutPencil = false, splash = false, paused = false } = {}) {
  const { rows, cols, solution } = puzzle;
  const isBlock = (r, c) => solution[r][c] === '#';
  const entries = entriesFromGrid(rows, cols, isBlock);
  const numberAt = new Map();
  for (const e of entries) {
    if (!numberAt.has(e.cells[0])) numberAt.set(e.cells[0], e.number);
  }

  const state = {
    letters: Array.from({ length: rows * cols }, () => ''),
    // Pencil mode, like the live toolbar toggle: letters typed while ON render penciled.
    penciled: Array.from({ length: rows * cols }, () => false),
    pencilMode: false,
    selCell: entries[0]?.cells[0] ?? 0,
    selDir: 'across',
    solved: false,
    // Auto-pause (REQ-LIFE-017): while paused the games shell veils the board and blanks
    // the entries, exactly what a naive reader would misread as the user erasing the grid.
    paused: false,
  };

  const SVG = 'http://www.w3.org/2000/svg';
  document.body.innerHTML = '';
  const main = document.createElement('main');

  // Toolbar, mirroring the live page's shape (captured 2026-07):
  //   <div class="xwd__toolbar--wrapper"><ul class="xwd__toolbar--tools">
  //     <li class="xwd__tool--button"><button aria-label="Rebus">Rebus</button></li> …
  //     <li class="xwd__tool--button"><button><i class="xwd__toolbar_icon--pencil"/></button></li>
  let pencilBtn = null;
  if (!noPencilToggle) {
    const toolbar = document.createElement('div');
    toolbar.className = 'xwd__toolbar--wrapper';
    const tools = document.createElement('ul');
    tools.className = 'xwd__toolbar--tools';
    toolbar.append(tools);
    const addTool = (child) => {
      const li = document.createElement('li');
      li.className = 'xwd__tool--button';
      li.append(child);
      tools.append(li);
      return child;
    };
    // Neighboring tools, so the no-pencil fallback (mount after the LAST toolbar
    // button) has a row to land in.
    for (const label of ['Rebus', 'Check']) {
      const b = document.createElement('button');
      b.setAttribute('aria-label', label);
      addTool(b);
    }
    if (!toolbarWithoutPencil) {
      pencilBtn = document.createElement('button');
      pencilBtn.setAttribute('type', 'button');
      if (pencilMarkup === 'icon') {
        // The LIVE markup: no aria-label, no aria-pressed, no class change on toggle —
        // the button's state is completely unreadable from the DOM.
        const icon = document.createElement('i');
        icon.className = 'xwd__toolbar_icon--pencil';
        icon.setAttribute('data-testid', 'tool-icon');
        pencilBtn.append(icon);
      } else {
        pencilBtn.setAttribute('aria-label', 'Pencil');
        pencilBtn.setAttribute('aria-pressed', 'false');
      }
      pencilBtn.addEventListener('click', () => {
        state.pencilMode = !state.pencilMode;
        if (pencilMarkup !== 'icon') {
          pencilBtn.setAttribute('aria-pressed', String(state.pencilMode));
        }
      });
      addTool(pencilBtn);
    }
    main.append(toolbar);
  }

  const boardWrap = document.createElement('div');
  boardWrap.className = 'xwd__board';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
  svg.setAttribute('width', String(cols * CELL));

  // Live cell shape: <g class="xwd__cell"><rect class="xwd__cell--cell xwd__cell--nested" …/>
  //   <text data-testid="cell-text"><text class="xwd__cell--hidden" aria-live="polite"/>1</text>
  //   <text data-testid="cell-text"><text class="xwd__cell--hidden" aria-live="polite"/>A</text></g>
  const cellEls = [];
  const rectEls = [];
  const letterNodes = []; // the visible letter Text node per cell
  const letterTextEls = []; // the letter <text> element per cell (carries the pencil class)
  const letterHiddenEls = []; // the nested aria-live copy per cell
  function cellText(x, y, anchor) {
    const t = document.createElementNS(SVG, 'text');
    t.setAttribute('data-testid', 'cell-text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', anchor);
    const hidden = document.createElementNS(SVG, 'text');
    hidden.setAttribute('class', 'xwd__cell--hidden');
    hidden.setAttribute('aria-live', 'polite');
    t.append(hidden);
    return { t, hidden };
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'xwd__cell');
      const rect = document.createElementNS(SVG, 'rect');
      rect.setAttribute('role', 'cell');
      rect.setAttribute('tabindex', '-1');
      rect.setAttribute('class', isBlock(r, c) ? 'xwd__cell--block xwd__cell--nested' : 'xwd__cell--cell xwd__cell--nested');
      rect.setAttribute('x', String(c * CELL));
      rect.setAttribute('y', String(r * CELL));
      rect.setAttribute('width', String(CELL));
      rect.setAttribute('height', String(CELL));
      g.append(rect);
      if (!isBlock(r, c)) {
        if (numberAt.has(i)) {
          const { t } = cellText(c * CELL + 4, r * CELL + 12, 'start');
          t.append(String(numberAt.get(i)));
          g.append(t);
        }
        const { t, hidden } = cellText(c * CELL + CELL / 2, r * CELL + CELL - 10, 'middle');
        const visible = document.createTextNode('');
        t.append(visible);
        g.append(t);
        letterNodes[i] = visible;
        letterTextEls[i] = t;
        letterHiddenEls[i] = hidden;
      }
      svg.append(g);
      cellEls[i] = g;
      rectEls[i] = rect;
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
      text.className = 'xwd__clue--text xwd__clue-format';
      text.innerHTML = clue.html;
      li.append(label, text);
      ol.append(li);
      clueItemEls.set(`${direction === 'across' ? 'A' : 'D'}${clue.number}`, li);
    }
    wrapper.append(title, ol);
    main.append(wrapper);
  }
  document.body.append(main);

  // Pre-puzzle splash (REQ-LIFE-016): the live "Ready to start solving?" moment is
  // rendered by the NYT games shell in the pz-moment class family (NOT xwd__ — that
  // mismatch was the v0.11.2 "splash not recognized" bug). Shape mirrors a live
  // capture (2026-07-05): the TITLE is the puzzle's name, the headline copy sits in
  // pz-moment__description, and the Play button's classes are build-hashed CSS-module
  // names — no stable class hook, so splash.js matches it by TEXT. Play removes the
  // moment — unless it's 'stuck'.
  if (splash) {
    const veil = document.createElement('div');
    veil.className = 'pz-moment__content SequenceAnimation-module_in__QL6mR';
    veil.innerHTML = [
      '<div class="pz-moment__icon medium mini" data-testid="moment-icon"></div>',
      '<h2 class="pz-moment__title large karnak">The Mini</h2>',
      '<h3 class="pz-moment__description default karnak">Ready to start solving?</h3>',
      '<div class="pz-moment__button-group"><div class="pz-moment__button-wrapper vertical">',
      '<button type="button" class="_momentButton_e4jbe_2 _primary_e4jbe_37">Play</button>',
      '</div></div>',
    ].join('');
    if (splash !== 'stuck') {
      veil.querySelector('button').addEventListener('click', () => veil.remove());
    }
    document.body.append(veil);
  }

  // Auto-pause veil (REQ-LIFE-017): the games shell moment shown after a stretch with no
  // keystrokes — "Your puzzle is paused" over the (blanked) board, with a Resume button
  // that lifts it. Same moment class family as the splash; pause.js tells them apart by
  // the word "paused". showPause() re-mounts it on demand for the mid-session case.
  function showPause() {
    if (state.paused) return;
    state.paused = true;
    const veil = document.createElement('div');
    veil.className = 'pz-moment__content xwd__modal--pause';
    veil.setAttribute('data-testid', 'pause-moment');
    veil.innerHTML = [
      '<h2 class="pz-moment__title large karnak">Your puzzle is paused</h2>',
      '<div class="pz-moment__button-group"><div class="pz-moment__button-wrapper vertical">',
      '<button type="button" class="_momentButton_e4jbe_2 _primary_e4jbe_37">Resume</button>',
      '</div></div>',
    ].join('');
    veil.querySelector('button').addEventListener('click', () => {
      state.paused = false;
      veil.remove();
      paint(); // entries reappear
    });
    document.body.append(veil);
    paint(); // blank the entries behind the veil
  }

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
      if (!letterNodes[i]) return;
      // Paused: the shell veils the board and shows blanks — the entries are still in
      // state, just not on screen (REQ-LIFE-017).
      const shown = state.paused ? '' : letter;
      letterNodes[i].textContent = shown;
      // The live page mirrors state into the hidden aria-live copy; readers that use
      // textContent instead of own text nodes would see the letter doubled.
      letterHiddenEls[i].textContent = shown;
    });
    const entry = selectedEntry();
    rectEls.forEach((rect, i) => {
      const block = rect.getAttribute('class').includes('--block');
      // Penciled letters render grayed; verified live (2026-07-05): the marker rides
      // the <rect> — class="xwd__cell--cell xwd__cell--penciled xwd__cell--nested".
      const pencil = !block && state.letters[i] && state.penciled[i] ? ' xwd__cell--penciled' : '';
      const base = block
        ? 'xwd__cell--block xwd__cell--nested'
        : `xwd__cell--cell${pencil} xwd__cell--nested`;
      const selected = !block && i === state.selCell;
      rect.setAttribute('class', selected ? `xwd__cell--selected xwd__cell--highlighted ${base}` : base);
      rect.setAttribute('tabindex', selected ? '0' : '-1');
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

  // Like the live app, keys are handled by delegation on the app root container —
  // a DESCENDANT of <body>. Events dispatched on <body>/document never pass through
  // here; they must be dispatched on (or inside) the board.
  main.addEventListener('keydown', (event) => {
    if (swallowKeys) return;
    if (legacyKeysOnly && !event.keyCode) return;
    const { key } = event;
    if (/^[a-zA-Z]$/.test(key)) {
      state.letters[state.selCell] = key.toUpperCase();
      // Like the live app (verified 2026-07): the active toggle decides pen vs pencil,
      // and retyping the letter a cell already shows converts it in place.
      state.penciled[state.selCell] = state.pencilMode;
      advanceWithin(selectedEntry());
      render();
      checkSolved();
    } else if (key === 'Backspace') {
      const entry = selectedEntry();
      if (state.letters[state.selCell]) {
        state.letters[state.selCell] = '';
        state.penciled[state.selCell] = false;
      } else {
        const pos = entry.cells.indexOf(state.selCell);
        if (pos > 0) {
          state.selCell = entry.cells[pos - 1];
          state.letters[state.selCell] = '';
          state.penciled[state.selCell] = false;
        }
      }
      render();
    }
  });

  cellEls.forEach((g, i) => {
    if (rectEls[i].getAttribute('class').includes('--block')) return;
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
  if (paused) showPause(); // after paint()/entryAt are live, so the veil blanks a real grid
  return {
    state,
    entries,
    /** Test helper: raise the auto-pause veil mid-session (REQ-LIFE-017). */
    showPause,
    /** Test helper: type a string through the same code path as real key events. */
    typeAt(cellIndex, dir, word) {
      state.selCell = cellIndex;
      state.selDir = dir;
      render();
      for (const ch of word) {
        // Dispatched on the selected cell so it bubbles through the app root,
        // exactly like a real keystroke on the focused rect.
        cellEls[state.selCell].dispatchEvent(new (document.defaultView.KeyboardEvent)('keydown', {
          key: ch,
          keyCode: ch.toUpperCase().charCodeAt(0),
          bubbles: true,
        }));
      }
    },
  };
}
