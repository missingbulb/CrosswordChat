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
    expect(button().querySelector('svg [data-cc-bubble]')).toBeTruthy(); // the speech bubble
  });

  test('REQ-LIFE-012: clicks reach the toggle callback; active state fills the bubble', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const onToggle = vi.fn();
    const handle = mountSessionButton(document, onToggle);

    button().click();
    expect(onToggle).toHaveBeenCalledTimes(1);

    handle.setActive(true); // session started
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().getAttribute('aria-label')).toContain('stop');
    expect(button().querySelector('[data-cc-bubble]').getAttribute('fill')).not.toBe('none');

    handle.setActive(false); // session ended
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().querySelector('[data-cc-bubble]').getAttribute('fill')).toBe('none');

    button().click(); // still clickable after a session
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

  test('REQ-LIFE-012/REQ-NFR-004: no pencil toggle → no button, no errors, clean give-up', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { noPencilToggle: true });
    const handle = mountSessionButton(document, () => {}, { waitMs: 30 });
    handle.setActive(true); // must be safe with nothing mounted
    await sleep(60); // give-up timeout passed
    initFakeNyt(document, FIXTURE_PUZZLE); // toolbar appears AFTER the give-up…
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
