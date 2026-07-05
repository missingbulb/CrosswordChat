// @vitest-environment jsdom
// The in-page session toggle button (REQ-LIFE-012) vs. the fake NYT page: injected
// right of the pencil toggle, reflects session state, waits out a late-rendering
// toolbar, and stays away from pages without one (REQ-NFR-004).

import { describe, test, expect, vi } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { mountSessionButton, BUTTON_ID } from '../../extension/src/page-adapter/session-button.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const button = () => document.getElementById(BUTTON_ID);
const pencil = () => document.querySelector('button[aria-label="Pencil"]');

describe('session button', () => {
  test('REQ-LIFE-012: mounts immediately right of the pencil toggle, labeled and unpressed', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    mountSessionButton(document, () => {});
    expect(button()).toBeTruthy();
    expect(pencil().nextElementSibling).toBe(button()); // right of the pencil
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().getAttribute('aria-label')).toContain('CrosswordChat');
    // Wears the brand mark: the extension icon's tile + crossword speech bubble.
    expect(button().querySelector('svg [data-cc-bg]')).toBeTruthy();
    expect(button().querySelector('svg [data-cc-bubble]')).toBeTruthy();
    // Hardened against the host page: paints are duplicated into inline styles (page
    // CSS outranks presentation attributes, but not these), and no url(#…) references
    // (a rewritten base URL would silently erase them).
    expect(button().querySelector('[data-cc-bg]').style.fill).toBeTruthy();
    expect(button().innerHTML).not.toMatch(/clip|url\(/);
  });

  test('REQ-LIFE-012: finds a pencil that has no accessible name, only an icon class', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { pencilMarkup: 'icon' });
    mountSessionButton(document, () => {});
    expect(button()).toBeTruthy();
    const iconPencil = document.querySelector('.xwd__toolbar_icon--pencil').closest('button');
    expect(iconPencil.nextElementSibling).toBe(button());
  });

  test('REQ-LIFE-012: toolbar without a findable pencil → mounts at the end of the tool row', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { toolbarWithoutPencil: true });
    mountSessionButton(document, () => {});
    expect(button()).toBeTruthy();
    const toolbarButtons = document.querySelectorAll('[class*="xwd__toolbar"] button');
    expect(toolbarButtons[toolbarButtons.length - 1]).toBe(button()); // after the last tool
  });

  test('REQ-LIFE-012: clicks reach the toggle callback; active state inverts the tile', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const onToggle = vi.fn();
    const handle = mountSessionButton(document, onToggle);
    const tileFill = () => button().querySelector('[data-cc-bg]').getAttribute('fill');
    const bubbleFill = () => button().querySelector('[data-cc-bubble]').getAttribute('fill');

    button().click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    const idle = { tile: tileFill(), bubble: bubbleFill() };

    handle.setActive(true); // session started → inverted tile
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().getAttribute('aria-label')).toContain('stop');
    expect(tileFill()).not.toBe(idle.tile);
    expect(bubbleFill()).not.toBe(idle.bubble);

    handle.setActive(false); // session ended → back to the idle mark
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(tileFill()).toBe(idle.tile);
    expect(bubbleFill()).toBe(idle.bubble);

    button().click(); // still clickable after a session (and after icon swaps)
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  test('REQ-LIFE-012: waits for a toolbar that renders after the content script loads', async () => {
    document.body.innerHTML = '<p>loading…</p>'; // the NYT shell, pre-React
    const handle = mountSessionButton(document, () => {});
    handle.setActive(true); // state arrives before the toolbar exists (icon-started session)
    expect(button()).toBeNull();

    initFakeNyt(document, FIXTURE_PUZZLE); // the app renders late
    await sleep(20); // MutationObserver delivery is async
    expect(button()).toBeTruthy();
    expect(button().getAttribute('aria-pressed')).toBe('true'); // remembered state applied
  });

  test('REQ-LIFE-012: board but no findable toolbar → floats the button over the page', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { noPencilToggle: true }); // board, no toolbar at all
    const handle = mountSessionButton(document, () => {}, { waitMs: 1000, floatAfterMs: 20 });
    expect(button()).toBeNull(); // still hunting for a toolbar anchor
    await sleep(60); // floatAfterMs passed with a visible board
    expect(button()).toBeTruthy();
    expect(button().style.position).toBe('fixed'); // floating, not inline in a toolbar
    expect(button().querySelector('svg [data-cc-bg]')).toBeTruthy(); // wears the mark
    handle.remove();
    expect(button()).toBeNull();
  });

  test('REQ-LIFE-012: app markup but no toolbar (splash screen) → keeps waiting past waitMs', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { noPencilToggle: true }); // board, no toolbar yet
    const handle = mountSessionButton(document, () => {}, { waitMs: 30 });
    handle.setActive(true); // must be safe with nothing mounted
    await sleep(60); // waitMs passed — but the crossword app IS here, so no give-up
    expect(button()).toBeNull();
    initFakeNyt(document, FIXTURE_PUZZLE); // the toolbar finally renders (splash cleared)
    await sleep(20);
    expect(button()).toBeTruthy(); // …and the button still lands
    expect(button().getAttribute('aria-pressed')).toBe('true');
    handle.remove();
  });

  test('REQ-LIFE-012/REQ-NFR-004: page without crossword markup → no button, clean give-up', async () => {
    document.body.innerHTML = '<p>an archive page, no xwd anything</p>';
    const handle = mountSessionButton(document, () => {}, { waitMs: 30 });
    handle.setActive(true); // must be safe with nothing mounted
    await sleep(60); // give-up timeout passed on a non-app page
    initFakeNyt(document, FIXTURE_PUZZLE); // the app appears AFTER the give-up…
    await sleep(20);
    expect(button()).toBeNull(); // …and is left alone: the observer is gone
    handle.remove(); // idempotent cleanup
  });

  test('REQ-LIFE-012: a duplicate mount never yields a second button', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    mountSessionButton(document, () => {});
    mountSessionButton(document, () => {});
    expect(document.querySelectorAll(`#${BUTTON_ID}`)).toHaveLength(1);
  });

  test('REQ-LIFE-012: remove() takes the button out and stops a pending wait', async () => {
    document.body.innerHTML = '';
    const handle = mountSessionButton(document, () => {});
    handle.remove(); // removed while still waiting for the toolbar
    initFakeNyt(document, FIXTURE_PUZZLE);
    await sleep(20);
    expect(button()).toBeNull();

    const mounted = mountSessionButton(document, () => {});
    expect(button()).toBeTruthy();
    mounted.remove();
    expect(button()).toBeNull();
  });
});
