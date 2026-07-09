// @vitest-environment jsdom
// The in-page session split button (REQ-LIFE-012) vs. the fake NYT page: injected at
// the right end of the toolbar, main half toggles the session, a caret opens the
// Activate/Settings/Voice-commands menu (REQ-CMD-007), reflects session state, waits out
// a late-rendering toolbar, and stays away from pages without one (REQ-NFR-004).

import { describe, test, expect, vi } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { mountSessionButton, BUTTON_ID } from '../../extension/src/page-adapter/session-button.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const button = () => document.getElementById(BUTTON_ID);
const main = () => button()?.querySelector('[data-cc-role="main"]');
const caret = () => button()?.querySelector('[data-cc-role="caret"]');
const menu = () => button()?.querySelector('[data-cc-role="menu"]');
const item = (act) => button()?.querySelector(`[data-cc-act="${act}"]`);
const toolRow = () => document.querySelector('.xwd__toolbar--tools');
const noop = { onToggle() {} };

describe('session button', () => {
  test('REQ-LIFE-012: mounts at the right end of the toolbar tool row, labeled and unpressed', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    mountSessionButton(document, noop);
    expect(button()).toBeTruthy();
    expect(toolRow().lastElementChild).toBe(button()); // the right end of the tool row
    expect(main().getAttribute('aria-pressed')).toBe('false');
    expect(main().getAttribute('aria-label')).toContain('CrosswordChat');
    // Wears the brand mark: the extension icon's tile + crossword speech bubble.
    expect(button().querySelector('svg [data-cc-bg]')).toBeTruthy();
    expect(button().querySelector('svg [data-cc-bubble]')).toBeTruthy();
    // Hardened against the host page: paints are duplicated into inline styles (page
    // CSS outranks presentation attributes, but not these), and no url(#…) references
    // (a rewritten base URL would silently erase them).
    expect(button().querySelector('[data-cc-bg]').style.fill).toBeTruthy();
    expect(main().innerHTML).not.toMatch(/clip|url\(/);
  });

  test('REQ-CMD-007: the caret opens a menu with Activate, Settings, and Voice commands', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const onToggle = vi.fn();
    const onSettings = vi.fn();
    const onHelp = vi.fn();
    mountSessionButton(document, { onToggle, onSettings, onHelp });

    expect(menu().hidden).toBe(true); // closed until asked for
    expect(caret().getAttribute('aria-expanded')).toBe('false');
    expect([...menu().querySelectorAll('[data-cc-act]')].map((el) => el.dataset.ccAct))
      .toEqual(['activate', 'settings', 'help', 'send-data']);

    caret().click();
    expect(menu().hidden).toBe(false);
    expect(caret().getAttribute('aria-expanded')).toBe('true');

    item('settings').click();
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(menu().hidden).toBe(true); // choosing an item closes the menu

    caret().click();
    item('help').click();
    expect(onHelp).toHaveBeenCalledTimes(1);

    caret().click();
    item('activate').click(); // the Activate row shares the main toggle
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('REQ-DIAG-001: the Send session data item invokes onSendData', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const onSendData = vi.fn();
    mountSessionButton(document, { onToggle() {}, onSendData });
    caret().click();
    item('send-data').click();
    expect(onSendData).toHaveBeenCalledTimes(1);
    expect(menu().hidden).toBe(true); // choosing the item closes the menu
  });

  test('REQ-CMD-007: a click outside closes the open menu', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    mountSessionButton(document, noop);
    caret().click();
    expect(menu().hidden).toBe(false);
    document.body.click(); // anywhere off the button
    expect(menu().hidden).toBe(true);
  });

  test('REQ-CMD-007: the Activate row tracks session state', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const handle = mountSessionButton(document, noop);
    expect(item('activate').textContent).toBe('Activate');
    handle.setActive(true);
    expect(item('activate').textContent).toBe('Stop session');
    handle.setActive(false);
    expect(item('activate').textContent).toBe('Activate');
  });

  test('REQ-LIFE-012: lands at the end of the row regardless of which tools precede it', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { toolbarWithoutPencil: true });
    mountSessionButton(document, noop);
    expect(button()).toBeTruthy();
    expect(toolRow().lastElementChild).toBe(button()); // always the last child of the tool row
  });

  test('REQ-LIFE-012: the main half toggles; active state inverts the tile', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const onToggle = vi.fn();
    const handle = mountSessionButton(document, { onToggle });
    const tileFill = () => main().querySelector('[data-cc-bg]').getAttribute('fill');
    const bubbleFill = () => main().querySelector('[data-cc-bubble]').getAttribute('fill');

    main().click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    const idle = { tile: tileFill(), bubble: bubbleFill() };

    handle.setActive(true); // session started → inverted tile
    expect(main().getAttribute('aria-pressed')).toBe('true');
    expect(main().getAttribute('aria-label')).toContain('stop');
    expect(tileFill()).not.toBe(idle.tile);
    expect(bubbleFill()).not.toBe(idle.bubble);

    handle.setActive(false); // session ended → back to the idle mark
    expect(main().getAttribute('aria-pressed')).toBe('false');
    expect(tileFill()).toBe(idle.tile);
    expect(bubbleFill()).toBe(idle.bubble);

    main().click(); // still clickable after a session (and after icon swaps)
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  test('REQ-LIFE-012: waits for a toolbar that renders after the content script loads', async () => {
    document.body.innerHTML = '<p>loading…</p>'; // the NYT shell, pre-React
    const handle = mountSessionButton(document, noop);
    handle.setActive(true); // state arrives before the toolbar exists (icon-started session)
    expect(button()).toBeNull();

    initFakeNyt(document, FIXTURE_PUZZLE); // the app renders late
    await sleep(20); // MutationObserver delivery is async
    expect(button()).toBeTruthy();
    expect(main().getAttribute('aria-pressed')).toBe('true'); // remembered state applied
  });

  test('REQ-LIFE-012: app markup but no toolbar (splash screen) → keeps waiting past waitMs', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { noPencilToggle: true }); // board, no toolbar yet
    const handle = mountSessionButton(document, noop, { waitMs: 30 });
    handle.setActive(true); // must be safe with nothing mounted
    await sleep(60); // waitMs passed — but the crossword app IS here, so no give-up
    expect(button()).toBeNull();
    initFakeNyt(document, FIXTURE_PUZZLE); // the toolbar finally renders (splash cleared)
    await sleep(20);
    expect(button()).toBeTruthy(); // …and the button still lands
    expect(main().getAttribute('aria-pressed')).toBe('true');
    handle.remove();
  });

  test('REQ-LIFE-012/REQ-NFR-004: page without crossword markup → no button, clean give-up', async () => {
    document.body.innerHTML = '<p>an archive page, no xwd anything</p>';
    const handle = mountSessionButton(document, noop, { waitMs: 30 });
    handle.setActive(true); // must be safe with nothing mounted
    await sleep(60); // give-up timeout passed on a non-app page
    initFakeNyt(document, FIXTURE_PUZZLE); // the app appears AFTER the give-up…
    await sleep(20);
    expect(button()).toBeNull(); // …and is left alone: the observer is gone
    handle.remove(); // idempotent cleanup
  });

  test('REQ-LIFE-012: a duplicate mount never yields a second button', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    mountSessionButton(document, noop);
    mountSessionButton(document, noop);
    expect(document.querySelectorAll(`#${BUTTON_ID}`)).toHaveLength(1);
  });

  test('REQ-LIFE-012: remove() takes the button out and stops a pending wait', async () => {
    document.body.innerHTML = '';
    const handle = mountSessionButton(document, noop);
    handle.remove(); // removed while still waiting for the toolbar
    initFakeNyt(document, FIXTURE_PUZZLE);
    await sleep(20);
    expect(button()).toBeNull();

    const mounted = mountSessionButton(document, noop);
    expect(button()).toBeTruthy();
    mounted.remove();
    expect(button()).toBeNull();
  });
});
