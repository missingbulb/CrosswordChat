// Red-first fixtures for the host-page-adaptation pack's checks.
//
// Every rule is exercised three ways: it must FIRE on a violating source, stay
// QUIET on a clean one, and stay quiet on the repo's real extension/src/ tree.
// The third case is what makes the pack shippable — a check that only ever saw
// its own fixtures is a check nobody has confronted with real code.
//
// Runs in the project's own vitest (see the .claudinite/local/packs include in
// vitest.config.js) and imports nothing from the gitignored canon mount, so it
// works in CI exactly as it does locally.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import pack from './pack.mjs';
import { isSource } from './lib.mjs';
import pageObserversDisconnected from './page-observers-disconnected.mjs';
import syntheticInputEventsBubble from './synthetic-input-events-bubble.mjs';
import syntheticInputEventsTargetAppNode from './synthetic-input-events-target-app-node.mjs';

// A check context over a literal file map — the same {files, read} surface the
// engine's runner passes, with nothing else the rules are allowed to touch.
const ctxOf = (files) => ({
  files: Object.keys(files),
  read: (f) => (f in files ? files[f] : null),
});

const run = (rule, files) => rule.run(ctxOf(files));

describe('host-page-adaptation pack manifest', () => {
  test('is a hand-declared local pack whose rules are all wired', () => {
    expect(pack.id).toBe('host-page-adaptation'); // must equal the directory name
    expect(pack.detect).toBeNull();
    expect(pack.marker).toBeNull();
    expect(pack.prose).toBe('RULES.md');
    expect(pack.worldRules.map((r) => r.id).sort()).toEqual([
      'page-observers-disconnected',
      'synthetic-input-events-bubble',
      'synthetic-input-events-target-app-node',
    ]);
  });
});

// The scan must be repo-shape agnostic: a rule that only ever looks under one
// project's source root matches nothing — and passes vacuously green — in a repo
// laid out differently, which is exactly the bug these cases exist to prevent.
describe('source scope', () => {
  test('accepts browser source under any layout, in JS and TS alike', () => {
    for (const file of [
      'extension/src/page-adapter/writer.js',
      'src/adapter.ts',
      'app/lib/host.tsx',
      'packages/web/inject.mjs',
      'userscript.cjs',
    ]) expect(isSource(file), file).toBe(true);
  });

  test('rejects test scaffolding, fixtures and vendored code wherever they sit', () => {
    for (const file of [
      'extension-test/integration/page-adapter.test.js',
      'extension-test/fixtures/fake-nyt/fake-app.js',
      'src/adapter.spec.ts',
      'test/host.js',
      'node_modules/x/index.js',
      'dist/content.js',
      'README.md',
    ]) expect(isSource(file), file).toBe(false);
  });
});

describe('page-observers-disconnected', () => {
  test('fires on an observer started and never disconnected', () => {
    const found = run(pageObserversDisconnected, {
      'src/mount.js': `
        export function watch(document, onChange) {
          const observer = new MutationObserver(onChange);
          observer.observe(document.body, { childList: true, subtree: true });
        }
      `,
    });
    expect(found.map((f) => f.rule)).toEqual(['page-observers-disconnected']);
    expect(found[0].file).toBe('src/mount.js');
    expect(found[0].severity).toBe('blocking');
  });

  test('fires on an IntersectionObserver and a ResizeObserver too', () => {
    for (const cls of ['IntersectionObserver', 'ResizeObserver']) {
      const found = run(pageObserversDisconnected, {
        'app/host.ts': `const o = new ${cls}(cb); o.observe(el);`,
      });
      expect(found.length, cls).toBe(1);
    }
  });

  test('fires when the observer is constructed off a window reference', () => {
    const found = run(pageObserversDisconnected, {
      'src/mount.js': `
        const view = document.defaultView;
        const observer = new view.MutationObserver(schedule);
        observer.observe(document.documentElement, { subtree: true, childList: true });
      `,
    });
    expect(found.length).toBe(1);
  });

  test('quiet when the observer disconnects (one-shot mount)', () => {
    const found = run(pageObserversDisconnected, {
      'src/mount.js': `
        export function mountWhenReady(document, place) {
          const observer = new MutationObserver(() => {
            const host = document.querySelector('[class*="toolbar"]');
            if (!host) return;
            observer.disconnect();
            place(host);
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
      `,
    });
    expect(found).toEqual([]);
  });

  test('quiet when an observer is constructed but never started', () => {
    const found = run(pageObserversDisconnected, {
      'src/factory.js': 'export const makeObserver = (cb) => new MutationObserver(cb);',
    });
    expect(found).toEqual([]);
  });

  test('quiet on a comment that merely names the trap', () => {
    const found = run(pageObserversDisconnected, {
      'src/notes.js': `
        // A MutationObserver started here would need observer.observe(...) and
        // an observer.disconnect() in teardown.
        export const nothing = 1;
      `,
    });
    expect(found).toEqual([]);
  });

  test('quiet in test scaffolding that leaves its observer to the runner', () => {
    const found = run(pageObserversDisconnected, {
      'test/watch.test.js': 'const o = new MutationObserver(cb); o.observe(document.body, {});',
    });
    expect(found).toEqual([]);
  });
});

describe('synthetic-input-events-bubble', () => {
  test('fires on an input event dispatched with no init at all', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "el.dispatchEvent(new MouseEvent('click'));",
    });
    expect(found.map((f) => f.rule)).toEqual(['synthetic-input-events-bubble']);
    expect(found[0].what).toContain('MouseEvent');
  });

  test('fires on an init that omits bubbles', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "target.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', keyCode: 65, which: 65 }));",
    });
    expect(found.length).toBe(1);
  });

  test('fires on an explicit bubbles: false', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: false, cancelable: true }));",
    });
    expect(found.length).toBe(1);
  });

  test('fires through a one-hop constructor alias — the generic fire() helper', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': `
        function fire(el, type, init) {
          const Ctor = type.startsWith('key') ? window.KeyboardEvent : window.MouseEvent;
          el.dispatchEvent(new Ctor(type, { cancelable: true, composed: true }));
        }
      `,
    });
    expect(found.length).toBe(1);
  });

  test('fires through one variable hop — built into a local, dispatched by name', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "const ev = new MouseEvent('click', { cancelable: true });\nel.dispatchEvent(ev);",
    });
    expect(found.length).toBe(1);
    expect(found[0].line).toBe(1); // the construction, where the fix goes
  });

  test('quiet when the locally built event sets bubbles: true', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });\nel.dispatchEvent(ev);",
    });
    expect(found).toEqual([]);
  });

  test('quiet when the dispatched local is built by a call the check cannot read', () => {
    const found = run(syntheticInputEventsBubble, {
      // `ev` constructs nothing readable; `template` is constructed but never dispatched.
      'src/drive.js': "const ev = makeEvent('click');\nel.dispatchEvent(ev);\nconst template = new MouseEvent('click');",
    });
    expect(found).toEqual([]);
  });

  test('quiet when bubbles: true is set', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));",
    });
    expect(found).toEqual([]);
  });

  test('quiet on an aliased constructor whose init spreads the caller\'s fields', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': `
        function fire(el, type, init) {
          const Ctor = type.startsWith('key') ? view.KeyboardEvent : view.MouseEvent;
          el.dispatchEvent(new Ctor(type, { ...init }));
        }
      `,
    });
    expect(found).toEqual([]);
  });

  test('quiet on a CustomEvent — your own signal has no fidelity contract', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "el.dispatchEvent(new CustomEvent('cc:ready', { detail: { ok: true } }));",
    });
    expect(found).toEqual([]);
  });

  test('quiet on an event that is constructed but never dispatched', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/drive.js': "const probe = new MouseEvent('click'); export const supported = Boolean(probe); el.dispatchEvent(new CustomEvent('x'));",
    });
    expect(found).toEqual([]);
  });

  test('quiet on a comment describing the trap', () => {
    const found = run(syntheticInputEventsBubble, {
      'src/notes.js': `
        // Do not write el.dispatchEvent(new MouseEvent('click')) — bubbles defaults to false.
        export const nothing = 1;
      `,
    });
    expect(found).toEqual([]);
  });
});

describe('synthetic-input-events-target-app-node', () => {
  test('fires on an input event dispatched directly at document', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': "document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'A' }));",
    });
    expect(found.map((f) => f.rule)).toEqual(['synthetic-input-events-target-app-node']);
    expect(found[0].what).toContain('document');
  });

  test('fires on an input event dispatched at document.body', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': "document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));",
    });
    expect(found.length).toBe(1);
    expect(found[0].what).toContain('document.body');
  });

  test('fires through a one-hop alias to document.body', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': `
        const root = document.body;
        root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      `,
    });
    expect(found.length).toBe(1);
  });

  test('fires through one variable hop on the dispatched event too', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': "const ev = new KeyboardEvent('keydown', { bubbles: true });\ndocument.dispatchEvent(ev);",
    });
    expect(found.length).toBe(1);
  });

  test('quiet when the same event is dispatched at a real element', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': "cellEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'A' }));",
    });
    expect(found).toEqual([]);
  });

  test('quiet on a CustomEvent dispatched at document — your own signal has no delegation contract', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': "document.dispatchEvent(new CustomEvent('cc:ready', { detail: { ok: true } }));",
    });
    expect(found).toEqual([]);
  });

  test('quiet when document.dispatchEvent carries no readable input-event construction', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/drive.js': "const ev = makeEvent('keydown');\ndocument.dispatchEvent(ev);",
    });
    expect(found).toEqual([]);
  });

  test('quiet on a comment describing the trap', () => {
    const found = run(syntheticInputEventsTargetAppNode, {
      'src/notes.js': `
        // Do not write document.dispatchEvent(new KeyboardEvent('keydown')) — it
        // bubbles past the app's delegated listener.
        export const nothing = 1;
      `,
    });
    expect(found).toEqual([]);
  });
});

// The parsing each rule does has to be shown NECESSARY, not just correct: run the
// quiet fixtures against the naive alternative the parsing exists to avoid and
// confirm they would wrongly fire. That is what earns the complexity.
describe('the parsing earns its keep', () => {
  const NAIVE_BUBBLES = /new\s+\w*Event\s*\(/;

  test('a whole-file grep for an event construction would false-alarm on the quiet cases', () => {
    for (const src of [
      "el.dispatchEvent(new CustomEvent('cc:ready', { detail: { ok: true } }));",
      "const probe = new MouseEvent('click'); el.dispatchEvent(new CustomEvent('x'));",
      "el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));",
    ]) {
      expect(NAIVE_BUBBLES.test(src), src).toBe(true); // the naive rule fires...
    }
    // ...and the real rule stays quiet on all three.
    expect(run(syntheticInputEventsBubble, {
      'src/a.js': "el.dispatchEvent(new CustomEvent('cc:ready', { detail: { ok: true } }));",
      'src/b.js': "const probe = new MouseEvent('click'); el.dispatchEvent(new CustomEvent('x'));",
      'src/c.js': "el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));",
    })).toEqual([]);
  });
});

// The corpus case: every rule must be silent on the shipped extension source. A
// pack that goes red on the code it was distilled from is not shippable, and this
// is the only fixture nobody wrote to make a check pass.
describe('the repo\'s real extension source', () => {
  const ROOT = process.cwd();
  const SRC = join(ROOT, 'extension/src');

  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };

  const files = Object.fromEntries(
    walk(SRC).map((p) => [relative(ROOT, p).split(sep).join('/'), readFileSync(p, 'utf8')]),
  );

  test('the corpus is real (the adapter and its dispatch site are in it)', () => {
    expect(files['extension/src/page-adapter/writer.js']).toContain('dispatchEvent');
    expect(files['extension/src/page-adapter/watcher.js']).toContain('MutationObserver');
  });

  for (const rule of pack.worldRules) {
    test(`${rule.id} is quiet on extension/src`, () => {
      expect(run(rule, files)).toEqual([]);
    });
  }
});
