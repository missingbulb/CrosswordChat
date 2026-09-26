// What a check does when it fails: `block` fails the run (and denies the call, for
// an action guard), `advise` reports and lets it through. A project's per-rule
// override in settings takes these two values or `off`.
export const ON_FAIL = Object.freeze(['block', 'advise']);

// The field's previous spelling, `severity: "blocking" | "advisory"`, read on a
// rule, a declaration, a finding and a settings override alike. A member's own
// local packs and settings still hold it until it acts on `legacy-shape-in-use`,
// and a canon pack version predating the rename runs beside this engine for the
// window between the engine's update and that pack's.
// @legacy-tolerance advisory:legacy-shape-in-use retire:#2319
export const LEGACY_ON_FAIL = Object.freeze({ blocking: 'block', advisory: 'advise' });

// The on_fail a rule, declaration, finding or override value means, or undefined
// when it says neither - unknown is left unknown rather than defaulted.
export function onFailOf(x) {
  if (typeof x === 'string') return ON_FAIL.includes(x) ? x : LEGACY_ON_FAIL[x];
  if (ON_FAIL.includes(x?.on_fail)) return x.on_fail;
  return LEGACY_ON_FAIL[x?.severity];
}

// A finding also carries its on_fail in the old spelling, because a member's own
// tests may read `finding.severity` and would break on the engine update rather than
// on anything the member did; it comes out with the rest of the tolerance.
// @legacy-tolerance advisory:none retire:#2319
const LEGACY_SEVERITY_MIRROR = Object.freeze({ block: 'blocking', advise: 'advisory' });

// The finding failing as `onFail`, in both spellings.
export const failingAs = (f, onFail) => ({ ...f, on_fail: onFail, severity: LEGACY_SEVERITY_MIRROR[onFail] });

// A finding in the current shape, whichever spelling it was built with.
const normalized = (f) => failingAs(f, onFailOf(f));

// The words a report prints for each value: a finding still reads as blocking or
// advisory, and the usage fold counts findings by those words.
const REPORT_LABEL = { block: 'BLOCKING', advise: 'ADVISORY' };

export function finding(rule, { file, line = null, what, fix, why = null, on_fail = null, severity = null }) {
  return failingAs({
    rule: rule.id,
    file,
    line,
    what,
    why: why || rule.why,
    fix,
    doc: rule.doc,
    // The rule's declared creation date, carried onto every finding so the grace
    // window below can be applied by the scope-blind reporter, which never sees
    // the rules themselves. Undefined on a rule that declared none — see `applyGrace`.
    since: rule.since,
  }, onFailOf(on_fail ?? severity ?? '') ?? onFailOf(rule));
}

// HOW LONG A NEW BLOCKING CHECK IS ONLY ADVISORY. A check lands against a tree it
// did not grow up with, so its first findings are usually a backlog rather than a
// regression — and the run that authored it (a growth capture run, above all) has
// neither the scope nor the review to clear that backlog in the same commit.
// Without a grace window the only check such a run can land is one the tree already
// satisfies, which is the check that proves least; the lesson then lands as prose,
// which is the outcome the growth ladder exists to avoid.
//
// Two weeks is the span in which the backlog is either cleared, the check is
// tightened, or the check is deleted as a bad idea — after it, the check bites.
export const GRACE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// The instant a rule created on `since` starts blocking, or null when it declared
// no date or an unparseable one. A rule with no date has no grace: the whole
// standing corpus predates this field, and absence must mean "mature", never
// "newborn".
export function graceUntil(since) {
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  const start = Date.parse(`${since}T00:00:00Z`);
  return Number.isNaN(start) ? null : new Date(start + GRACE_DAYS * DAY_MS);
}

// Demote a `block` finding to `advise` while its rule is inside its grace window,
// recording the date it starts biting so the output says why it did not fail the
// build. Runs BEFORE the project's own overrides, so a project that has
// explicitly set a rule to `block` gets what it asked for from day one.
//
// A `since` in the FUTURE grants nothing: were it honoured, any date far enough out
// would disable a blocking check permanently, which is a suppression wearing a
// creation date.
export function applyGrace(findings, { now = new Date() } = {}) {
  return findings.map((raw) => {
    const f = normalized(raw);
    if (f.on_fail !== 'block') return f;
    const until = graceUntil(f.since);
    if (!until) return f;
    const start = Date.parse(`${f.since}T00:00:00Z`);
    if (now < start || now >= until) return f;
    return { ...failingAs(f, 'advise'), graceUntil: until.toISOString().slice(0, 10) };
  });
}

// on_fail overrides then acceptances, in that order, so an acceptance is judged
// against the rule the project actually runs. A reasonless acceptance is itself
// a blocking finding: the reason string is what makes the decision reviewable.
export function applyConfig(findings, config) {
  const out = [];
  for (let f of findings) {
    f = normalized(f);
    const override = onFailOf(config.rules[f.rule] ?? '');
    if (override) f = failingAs(f, override);
    // A path ending in "/" accepts a whole subtree; otherwise the match is exact.
    const acceptance = config.accept.find(
      (a) => a.rule === f.rule &&
        (!a.path || a.path === f.file || (a.path.endsWith('/') && f.file.startsWith(a.path)))
    );
    if (acceptance) {
      if (typeof acceptance.reason === 'string' && acceptance.reason.trim()) continue;
      out.push({
        rule: 'config',
        on_fail: 'block',
        severity: LEGACY_SEVERITY_MIRROR.block,
        file: '.claudinite-settings.json',
        line: null,
        what: `acceptance for ${f.rule}${acceptance.path ? ` on ${acceptance.path}` : ''}${acceptance.pack ? ` (on the "${acceptance.pack}" pack entry)` : ''} has no reason`,
        why: 'the reason string is what makes an accepted violation reviewable',
        fix: 'add a non-empty "reason" to the acceptance entry',
        doc: 'engine/checks/README.md',
      });
    }
    out.push(f);
  }
  return out;
}

export function render(f) {
  const loc = f.line ? `${f.file}:${f.line}` : f.file;
  return [
    `[${REPORT_LABEL[f.on_fail] ?? String(f.on_fail).toUpperCase()}] ${f.rule}  ${loc}`,
    `  ${f.what}`,
    ...(f.why ? [`  Why: ${f.why}`] : []),
    ...(f.graceUntil ? [`  Grace: added ${f.since} — advisory until ${f.graceUntil}, blocking after`] : []),
    `  Fix: ${f.fix}`,
    ...(f.doc ? [`  More: ${f.doc}`] : []),
  ].join('\n');
}
