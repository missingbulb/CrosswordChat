// The evaluator the usage review's rules are read by - the ONE piece of code that
// turns a declaration in usage-rules.json into a finding. It knows the grammar and
// nothing else: not what a counter means, not where a figure comes from, not what
// a subject is. The caller supplies those as three functions, which is what keeps a
// rule reviewable as a sentence rather than as code (usage-review DESIGN §3).
//
// THE GRAMMAR, whole:
//
//   <when> := <term> ('>=' | '<=' | '=') <term>
//   <term> := <atom> | <atom> '/' <atom>
//   <atom> := ['previous.'] ['median('] <name> [')']  |  <number>
//
// Four shapes fall out of it - `a / b >= n`, `a / b <= n`, `a = 0`, `a >= n` - and
// nothing else parses. A rule that needs more than this is not a rule; it is code,
// and the design has none.
//
// UNKNOWN PROPAGATES. A figure the record does not carry is `null`, never 0, and a
// comparison touching one is *not recorded* rather than false: a week frozen before
// a counter existed must not read as a week in which nothing happened.

const RE_ATOM = /^(previous\.)?(?:(median)\()?([A-Za-z][A-Za-z0-9]*)\)?$/;

// One atom → { name, previous, median }, or { value } for a literal number.
function parseAtom(text) {
  const raw = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { value: Number(raw) };
  const m = RE_ATOM.exec(raw);
  if (!m) throw new Error(`not a figure: ${raw}`);
  return { name: m[3], previous: Boolean(m[1]), median: m[2] === 'median' };
}

const parseTerm = (text) => text.split('/').map(parseAtom);

// `when` (or an `and` that is a comparison) → { left, op, right }, each side a list
// of one or two atoms. Throws on anything outside the grammar, which is what makes a
// malformed rule a loud failure at evaluation rather than a rule that never fires.
export function parseComparison(expr) {
  const m = /^(.*?)\s*(>=|<=|=)\s*(.*)$/.exec(String(expr ?? '').trim());
  if (!m) throw new Error(`not a comparison: ${expr}`);
  return { left: parseTerm(m[1]), op: m[2], right: parseTerm(m[3]) };
}

// An atom's value through the caller's reader. A literal is itself.
const atomValue = (atom, read) => (atom.value !== undefined
  ? atom.value
  : read(atom.name, { previous: atom.previous, median: atom.median }));

// A term's value: one atom, or a quotient. A null anywhere is a null throughout -
// and so is a zero denominator, which is a ratio nobody can state rather than an
// infinite one.
function termValue(atoms, read) {
  const values = atoms.map((a) => atomValue(a, read));
  if (values.some((v) => v === null || v === undefined || !Number.isFinite(v))) return null;
  if (values.length === 1) return values[0];
  return values[1] === 0 ? null : values[0] / values[1];
}

const compare = (left, op, right) => (op === '>=' ? left >= right : op === '<=' ? left <= right : left === right);

// Does this comparison hold? `true`, `false`, or `null` where a figure it reads is
// not recorded.
export function holds(comparison, read) {
  const left = termValue(comparison.left, read);
  const right = termValue(comparison.right, read);
  if (left === null || right === null) return null;
  return compare(left, comparison.op, right);
}

// The figures a rule's floor demands, each against the count the floor names. Returns
// the first one that is under - `{ name, need, have }` - or null where all of them
// hold. A floor figure that is not recorded is under the floor by construction: a
// rule cannot be judged on a window that does not carry what it reads.
export function underFloor(floor, read) {
  for (const [name, need] of Object.entries(floor ?? {})) {
    const atom = parseAtom(name);
    const have = atomValue(atom, read);
    if (have === null || have === undefined || have < need) return { name, need, have: have ?? null };
  }
  return null;
}

// The sentence a rule's fields spell, for the report and for a reader checking that
// a declaration says what its author meant.
export function ruleSentence(rule) {
  const floor = Object.entries(rule.floor ?? {}).map(([k, v]) => `${k} ≥ ${v}`).join(' and ');
  return [
    `over every ${rule.over}${rule.expect ? ` expecting ${rule.expect}` : ''}`,
    rule.window === 'now' ? 'as the tree stands' : `in the ${rule.window} window`,
    floor ? `where ${floor}` : 'with no floor',
    `flag ${rule.when}${rule.and ? ` and ${rule.and.startsWith('!') ? `not ${rule.and.slice(1)}` : rule.and}` : ''}`,
    `- cause ${rule.cause}`,
  ].join(', ');
}

// Evaluate every rule over every subject.
//
//   subjectsOf(rule)       the subjects this rule judges, [{ id, pack, … }]
//   figureOf(subject, name, { previous, median, window })   a number, or null
//   predicateOf(subject, name)                              a boolean, or null
//
// Returns `{ findings, notEvaluated }`. `notEvaluated` is as much of the result as
// `findings` is: *no findings* means something only when nothing was skipped for
// want of a floor, which is the difference between a clean window and a young one.
export function evaluateRules(rules, { subjectsOf, figureOf, predicateOf }) {
  const findings = [];
  const notEvaluated = [];
  for (const rule of rules) {
    const when = parseComparison(rule.when);
    // `and` is either one more comparison, the name of a live predicate, or a
    // predicate name prefixed `!` for "and this is NOT true of the subject" - which
    // is how two rules reading one record half split the subjects between them
    // instead of both claiming all of them. Parsed once per rule so a malformed one
    // fails on the rule rather than per subject.
    const andComparison = rule.and && /(>=|<=|=)/.test(rule.and) ? parseComparison(rule.and) : null;
    for (const subject of subjectsOf(rule)) {
      const read = (name, opts) => figureOf(subject, name, { ...opts, window: rule.window });
      const short = underFloor(rule.floor, read);
      if (short) {
        notEvaluated.push({ rule: rule.id, subject: subject.id, pack: subject.pack ?? null, ...short });
        continue;
      }
      const hit = holds(when, read);
      if (hit === null) {
        notEvaluated.push({ rule: rule.id, subject: subject.id, pack: subject.pack ?? null, name: rule.when, need: null, have: null });
        continue;
      }
      if (!hit) continue;
      if (rule.and) {
        const negated = !andComparison && rule.and.startsWith('!');
        const raw = andComparison
          ? holds(andComparison, read)
          : predicateOf(subject, negated ? rule.and.slice(1) : rule.and);
        // Unknown survives the negation: a predicate that could not be read is
        // still unread when the rule asked for its absence.
        const also = negated && raw !== null ? !raw : raw;
        // A live half that cannot be read is not a finding and not a silence: the
        // record's half held, and the review says the pair could not be judged.
        if (also === null) {
          notEvaluated.push({ rule: rule.id, subject: subject.id, pack: subject.pack ?? null, name: rule.and, need: null, have: null });
          continue;
        }
        if (!also) continue;
      }
      findings.push({
        rule: rule.id,
        subject: subject.id,
        pack: subject.pack ?? null,
        cause: rule.cause,
        causes: rule.causes,
        open: rule.open,
        finding: rule.finding,
        recommendation: rule.recommendation,
        figures: figuresOf(rule, read),
      });
    }
  }
  return { findings, notEvaluated };
}

// Every figure the rule's own expressions named, both windows where it asked for
// both - the evidence the finding carries, so a reader never goes back to the file
// the number came from.
function figuresOf(rule, read) {
  const out = {};
  const atoms = [
    ...parseComparison(rule.when).left, ...parseComparison(rule.when).right,
    ...(rule.and && /(>=|<=|=)/.test(rule.and)
      ? [...parseComparison(rule.and).left, ...parseComparison(rule.and).right] : []),
    ...Object.keys(rule.floor ?? {}).map(parseAtom),
  ];
  for (const atom of atoms) {
    if (atom.value !== undefined) continue;
    const label = `${atom.previous ? 'previous.' : ''}${atom.median ? `median(${atom.name})` : atom.name}`;
    out[label] = atomValue(atom, read);
  }
  return out;
}
