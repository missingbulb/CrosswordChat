// The verify-production code-work (#1530) — the I/O shell around probes.mjs. It
// runs Action-side, which is the whole reason this task exists: an agent session
// has no egress, so a verification whose artifact is a live URL (a Pages site, a
// deployed config) can only be read from here.
//
// Four verdicts, each its own exit:
//   invalid  — the spec is unreadable: the triage marker names every problem and
//              the exit is non-zero, so the item parks with the list.
//   not-live — a liveness probe failed: print the requeue marker with
//              now + Retry-every and exit clean; the executor re-arms the item.
//   pass     — comment the evidence on the item and exit clean; the executor
//              closes it done.
//   fail     — reopen Original-issue with the evidence (the verification did its
//              job by finding the fault, which is now that issue's), link it from
//              the item, and exit clean.

import { humanTextOf } from '../../public/work-item-grammar.mjs';
import { parseVerificationSpec, runProbes, renderResult } from './probes.mjs';
import { getIssue, reopenIssue, comment as ghComment } from '../../src/world/github.mjs';

const FETCH_TIMEOUT_MS = 30_000;
const BODY_CAP = 2 * 1024 * 1024;

// One live fetch: bounded, redirect-following, body capped. A network error is
// retried once — a single blip must not reopen an issue — and the second failure
// is the answer.
export async function fetchOnce(url) {
  const attempt = async () => {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const body = (await res.text()).slice(0, BODY_CAP);
    return { status: res.status, body };
  };
  try { return await attempt(); } catch { return attempt(); }
}

// The whole judgment, injectable for tests: reads the item, parses the spec out
// of the HUMAN half of its body (the machine block is the queue's), runs the
// probes, and lands the verdict's writes. Returns what `worker` turns into the verdict
// and an exit code.
export async function runVerification({ gh, repo, itemNumber, fetchUrl, now = () => new Date(), log = console.log }) {
  const { status, json: item } = await getIssue(gh, repo, itemNumber);
  if (status !== 200) throw new Error(`could not read item #${itemNumber}: ${status}`);
  const spec = parseVerificationSpec(humanTextOf(item.body));
  if (spec.problems.length) return { outcome: 'invalid', problems: spec.problems };

  const live = await runProbes(spec.live, fetchUrl);
  for (const r of live) log(`liveness: ${renderResult(r)}`);
  if (!live.every((r) => r.ok)) {
    const firstFail = live.find((r) => !r.ok);
    return {
      outcome: 'not-live',
      until: new Date(now().getTime() + spec.retryEveryMs).toISOString(),
      reason: `not yet live: ${renderResult(firstFail)}`,
    };
  }

  const verify = await runProbes(spec.verify, fetchUrl);
  for (const r of verify) log(`verify: ${renderResult(r)}`);
  const evidence = verify.map((r) => `- ${renderResult(r)}`).join('\n');
  if (verify.every((r) => r.ok)) {
    await ghComment(gh, repo, itemNumber, `Production verification PASSED. What was read:\n\n${evidence}`);
    return { outcome: 'pass' };
  }

  // The verification did its job by finding the fault — which is now the
  // original issue's, reopened with what was asserted and what was read.
  await reopenIssue(gh, repo, spec.originalIssue);
  await ghComment(gh, repo, spec.originalIssue,
    `The production verification filed for this change (#${itemNumber}) FAILED against the live artifact:\n\n${evidence}\n\n`
    + 'The release is live (every liveness probe passed), so this is a fault in production, not a wait.');
  await ghComment(gh, repo, itemNumber,
    `Verification FAILED — reopened #${spec.originalIssue} with the evidence:\n\n${evidence}`);
  return { outcome: 'fail', originalIssue: spec.originalIssue };
}

export async function worker({ repo, item, gh }) {
  const itemNumber = item.number;
  const verdict = await runVerification({ gh, repo, itemNumber, fetchUrl: fetchOnce });

  if (verdict.outcome === 'invalid') {
    return { triage: { kind: 'action', detail: `this verification's probe spec is unreadable: ${verdict.problems.join('; ')}` } };
  }
  // NOT YET LIVE is the third answer an exit code does not have: the run happened,
  // found nothing wrong, and must come back when the release has landed.
  if (verdict.outcome === 'not-live') {
    return { requeue: { until: verdict.until, reason: verdict.reason } };
  }
  console.log(`verification ${verdict.outcome === 'pass' ? 'passed' : `failed — reopened #${verdict.originalIssue}`}`);
  return undefined;
}
