import { finding } from '../../../engine/checks/helpers/findings.mjs';
// Namespace-imported and guarded for the same reason legacy-shape-in-use is: a
// member's pack lane and engine lane converge on separate cycles, and this pack
// can sit beside a task-contract that predates either export.
import * as contract from '../src/contract/task-contract.mjs';
import * as calendar from '../src/contract/calendar.mjs';
import * as declarationText from '../src/contract/task-declaration-text.mjs';

// THE ADVISORY HALF OF THE TASK CONTRACT'S FIELD TOLERANCES. `normalizeTaskDeclaration`
// accepts two generations of field names, the retired one-word outcome ceilings and
// the retired `frequency` field (which reads as the cadence term it always meant,
// docs/PRINCIPLES.md), so a task declared in the oldest vocabulary runs exactly like
// one declared today — and nothing told its author that the acceptance ends a
// convergence window after this advisory ships (#1642, #1725).
//
// Every finding here is a SPELLING this pack still accepts. An absent `trigger` is no
// longer one of them: it fails the contract outright, which `task-declaration-shape`
// is what says at the line an author edits.
//
// It reads the declaration SOURCE rather than the normalized object, because by
// the time anything holds a task declaration the legacy spelling is gone: the
// door normalizes at load, which is what makes the tolerance invisible.
// Matching is therefore textual and deliberately conservative — a top-level key
// line in a task declaration — so the finding always points at a line an author
// can edit. The key is quoted and the value quote is whichever the file uses.
//
// ADVISORY: the old spelling works, and a task file is a member's own content.
const TASK_FILE = /(^|\/)tasks\/[^/]+\/task\.json$/;
const isTaskFile = (path) =>
  (typeof declarationText.isTaskDeclarationPath === 'function'
    ? declarationText.isTaskDeclarationPath(path)
    : TASK_FILE.test(path));

const rule = {
  id: 'legacy-task-fields',
  severity: 'advisory',
  since: '2026-09-03',
  description: 'Task declarations name their fields and outcome in the current vocabulary',
  why: 'the contract accepts two retired generations of field names, two retired generations of outcome ceilings and the retired frequency field for one convergence window after this advisory ships (#1642, #1725) — nothing counts who is still on them, so a declaration not brought up to the vocabulary inside that window simply stops being read',

  run(ctx) {
    const fields = contract.LEGACY_FIELDS ?? {};
    const outcomes = contract.LEGACY_OUTCOMES ?? {};
    const ceilings = contract.LEGACY_CEILINGS ?? {};
    const names = Object.keys(fields);
    if (names.length === 0 && Object.keys(outcomes).length === 0 && Object.keys(ceilings).length === 0) return [];

    const fieldRe = names.length ? new RegExp(`^\\s*"?(${names.join('|')})"?\\s*:`) : null;
    const outcomeRe = /^\s*"?expected_outcome"?\s*:\s*['"]([^'"]+)['"]/;
    // The cadence field, retired into the expression. Guarded on the engine
    // exporting the term spelling: beside an older calendar the field is not a
    // tolerance yet, and reporting it would ask for an edit that engine rejects.
    const frequencyRe = typeof calendar.cadenceTermFor === 'function' ? /^\s*"?frequency"?\s*:\s*['"]([^'"]+)['"]/ : null;

    const out = [];
    for (const file of ctx.files.filter(isTaskFile)) {
      const text = ctx.read(file);
      if (text === null) continue;
      text.split('\n').forEach((text_line, i) => {
        const field = fieldRe?.exec(text_line);
        if (field) {
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: `declares the retired field \`${field[1]}\``,
            fix: `rename it to \`${fields[field[1]]}\` — the contract maps every retired spelling straight to today's name, so this is a one-line edit with no behaviour change`,
          }));
        }
        const frequency = frequencyRe?.exec(text_line);
        if (frequency) {
          const term = (calendar.ACCEPTED_FREQUENCIES ?? []).includes(frequency[1]) ? calendar.cadenceTermFor(frequency[1]) : 'due:<daily|weekly|monthly>';
          const fix = term === null
            ? 'write `"trigger": "request"` and drop the field, and a `"none"` beside it: `"manual"` meant no schedule at all, which a declaration now says outright; the nightly update rewrites a member\'s own task files'
            : `write it as the first condition — \`"preconditions": ["${term}", …]\` — with \`"trigger": "schedule"\` beside it, and drop a \`"none"\`; the field reads as exactly that today, and the nightly update rewrites a member's own task files`;
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: 'declares the retired field `frequency`',
            fix,
          }));
        }
        const outcome = outcomeRe.exec(text_line);
        if (outcome && Object.hasOwn(outcomes, outcome[1])) {
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: `declares the retired outcome ceiling \`${outcome[1]}\``,
            fix: `write \`expected_outcome: 'fresh_pr'\` with \`automerge: '${outcomes[outcome[1]]}'\` beside it — the one word always meant that pair, and spelling it out is what lets the policy be narrowed later`,
          }));
        } else if (outcome && Object.hasOwn(ceilings, outcome[1])) {
          out.push(finding(rule, {
            file,
            line: i + 1,
            what: `declares the retired outcome ceiling \`${outcome[1]}\``,
            fix: `write \`expected_outcome: '${ceilings[outcome[1]]}'\` — the word it became, in the vocabulary that also says amend_existing_or_create_new_pr and supersede_existing_pr`,
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
