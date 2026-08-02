import {
  finding, stripComments, isSource, lineOf,
  inputEventCtors, eventConstructions, hasSpread,
} from './lib.mjs';

// `keyCode`, `which` and `charCode` are deprecated, and the browser fills them in
// on every real keystroke anyway. On a synthetic one it does not: they are plain
// init fields that default to 0, so `new KeyboardEvent('keydown', { key: 'A' })`
// arrives at the page as a keystroke whose keyCode is 0.
//
// Deprecated is not the same as unread. Host apps — especially anything with a
// long-lived key-handling layer, or a framework version predating `key` support —
// still branch on the legacy fields, and a 0 matches nothing: the event is
// received, the handler runs, and nothing happens. You cannot fix that by asking
// the host to modernise, and you cannot see it from your side except as "the page
// ignored my keystroke". The only cost of setting all three is three properties;
// the cost of omitting them is a fidelity bug that looks like a permissions one.
//
// Judged only where the init is READABLE: an init that spreads (`{ ...init }`)
// may well carry the fields from its caller, and a check that guessed there would
// false-alarm on exactly the well-factored helper that centralises this. Named
// classes and one alias hop both count as the constructor (lib.mjs
// inputEventCtors), so a `fire()` helper picking KeyboardEvent by feature is in
// scope for the day someone hand-writes its init.

const KEY_FIELD = /\bkey\s*:/;
const LEGACY = /\b(?:keyCode|which|charCode)\s*:/;

const rule = {
  id: 'synthetic-key-events-legacy-fields',
  severity: 'blocking',
  description: 'A synthetic KeyboardEvent init carries keyCode/which',
  doc: '.claudinite/local/packs/host-page-adaptation/RULES.md',
  why: 'the legacy key fields are filled in by the browser on a real keystroke and default to 0 on a synthetic one, so a host handler that still branches on keyCode matches nothing and silently does nothing',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('KeyboardEvent')) continue;
      const src = stripComments(raw);
      // Only constructors that can be a KeyboardEvent — a MouseEvent has no key
      // fields to be missing, so the alias set is narrowed to this one class.
      const ctors = inputEventCtors(src);
      for (const name of [...ctors]) {
        if (name !== 'KeyboardEvent' && !aliasOfKeyboardEvent(src, name)) ctors.delete(name);
      }

      for (const { init, index } of eventConstructions(src, ctors)) {
        if (init === null) continue; // no init at all is the bubbles rule's finding, not this one
        if (!KEY_FIELD.test(init)) continue; // not describing a keystroke by name
        if (LEGACY.test(init)) continue;
        if (hasSpread(init)) continue; // unreadable: the caller may carry them
        out.push(finding(rule, {
          file,
          line: lineOf(src, index),
          what: 'builds a synthetic key event with `key` but no keyCode/which, so both arrive as 0',
          fix: "set keyCode and which alongside key (and charCode on keypress) — e.g. { key: 'A', code: 'KeyA', keyCode: 65, which: 65 } — so the event matches what the browser produces for a real keystroke",
        }));
      }
    }
    return out;
  },
};

// An alias counts for THIS rule only when its right-hand side can yield a
// KeyboardEvent: `const Ctor = isKey ? view.KeyboardEvent : view.MouseEvent` can,
// `const Ctor = view.MouseEvent` cannot.
function aliasOfKeyboardEvent(src, name) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*([^;\\n]*)`);
  const m = re.exec(src);
  return Boolean(m && /\bKeyboardEvent\b/.test(m[1]));
}

export default rule;
