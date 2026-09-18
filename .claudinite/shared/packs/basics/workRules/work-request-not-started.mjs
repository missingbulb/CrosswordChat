import { finding } from '../../../engine/checks/helpers/findings.mjs';

// A session that told the owner their comment was work, and then called nothing.
//
// The failure this exists for: a first reply can satisfy every instruction
// governing it — the session-start summary line, the `Comment class:` line —
// while containing no work at all, because each of those instructions says what
// the reply must OPEN WITH and none says that it continues. Both announcements
// land, the model reads its obligations as discharged, and the turn ends. The
// owner sees the classification line and nothing after it.
//
// The gate is the DECLARED CLASS, not the reply's length. `correction`,
// `feature` and `process-change` each name work the session has undertaken to
// do; `other` is the class the rule gives to questions, approvals and command
// phrases, which are answered rather than acted on and legitimately need no
// tool. So a reply that names a work class and then reaches for nothing has
// contradicted itself, and that reading needs no threshold to make — a length
// heuristic would have to strip the announcements first, which would mean
// copying the summary's wording into this pack to recognise it.
//
// "No tool call at all" is the session-wide count, subagent calls included, and
// it is what makes the rule safe: across the 692 captured sessions on the
// conversation-logs branch, not one ran to Stop having called nothing. A
// session that did any work whatsoever is invisible here.
//
// BLOCKING, where comment-classification (the check that once demanded the line
// this one reads) could not be: that rule fired at Stop on an append-only
// transcript, so its finding named something no edit could retract and every
// cycle re-spent on it. This one names work that has not happened yet, and the
// session clears it by doing the work.
const WORK_CLASSES = ['correction', 'feature', 'process-change'];

const rule = {
  id: 'work-request-not-started',
  severity: 'blocking',
  description: 'A reply that classified the owner\'s comment as work must be followed by work — a session ending with no tool call at all has not started it',
  doc: 'packs/basics/RULES.md',
  scope: 'work',
  why: 'the instructions governing a reply say what it opens with and none says it continues, so a turn can satisfy all of them, contain no work, and end',

  run(work) {
    const turn = work.conversation().ownerTurns().last();
    if (!turn.exists) return [];

    const declared = WORK_CLASSES.filter((c) => turn.classes().has(c));
    if (!declared.length) return []; // `other` or unclassified — answered, not acted on

    if (work.toolCalls().length) return [];

    return [finding(rule, {
      file: '(conversation)',
      what: `the reply classified this comment ${declared.map((c) => `\`${c}\``).join(', ')} and the session then called no tool at all`,
      fix: 'the classification line is the opening of a reply, not the reply — do the work it names now, in this turn. If the comment actually needed answering rather than acting on, its class is `other`',
    })];
  },
};

export default rule;
