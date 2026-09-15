// THE PICK ORDER over the open queue — which ready item a worker takes next, and
// which ones it must skip. It sits with the items rather than with either caller
// because BOTH stages ask it: the executor to choose what to claim, and the
// scheduler run to count what is pickable before it spends an executor invocation
// on an empty queue.
//
// The order (docs/PRINCIPLES.md): urgent first, then RANDOM among the ready, with
// two skip rules read live at pick time. Random rather than oldest-first because
// nothing leans on FIFO aging — the stale-ready escalation is period-scale — while
// a deterministic order lets one unlucky head dominate every run of a chain.
//
//  - SAME-TITLE MUTEX (S15/F6): skip an item whose exact title has another open
//    item executing or handed to an agent — one task, one execution at a time,
//    while a fan-out's distinct qualifiers still parallelize.
//  - THE `after` YIELD (S23): skip a scheduled item whose task declares `after:
//    [T]` while T's standing item is live THIS CYCLE (ready / executing / agent).
//    A declined upstream holds nothing back — it has no item at all (a no files
//    nothing, PRINCIPLES.md) — and neither does one sitting `needs-human`: a broken
//    upstream must not halt its dependents indefinitely.

import {
  URGENT, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT, isStatus,
  parseWorkItemTitle, parseWorkItemBody, isStandingItem, hasLabel,
} from './work-item.mjs';

export const titleOf = (item) => (item.title ?? '').trim();
// An item somebody is executing — the executor holds it, or the agent it handed to
// does. Decoded, never a literal label test: the item may wear any engine's spelling.
export const running = (item) => isStatus(item, STATUS_RUNNING_EXECUTOR) || isStatus(item, STATUS_RUNNING_AGENT);
// WHICH TASK AN ITEM NAMES. A filed `[claudinite-work]` item says so in its title;
// a marked issue (PRINCIPLES.md) keeps its own human title and names its task in the
// machine block's first line, so the id comes from the task whose worker path that
// is. `pathTo` is that lookup, injected because only the run holds the task set.
export const taskIdOf = (item, pathTo = () => null) => {
  const p = parseWorkItemTitle(item.title);
  if (p) return `${p.pack}/${p.task}`;
  return pathTo(parseWorkItemBody(item.body).taskPath) ?? null;
};

// The pick order (PRINCIPLES.md): urgent first, then RANDOM among the ready, with
// two skip rules read live at pick time. Random rather than oldest-first because
// nothing leans on FIFO aging — the stale-ready escalation is period-scale — while
// a deterministic order lets one unlucky head dominate every run of a chain
// (PRINCIPLES.md).
//
//  - SAME-TITLE MUTEX (S15/F6): skip an item whose exact title has another open
//    item executing or handed to an agent — one task, one execution at a time,
//    while a fan-out's distinct qualifiers still parallelize.
//  - THE `after` YIELD (S23): skip a scheduled item whose task declares `after:
//    [T]` while T's standing item is live THIS CYCLE (ready / executing / agent).
//    A declined upstream holds nothing back — it has no item at all (a no files
//    nothing, PRINCIPLES.md) — and neither does one sitting `needs-human`: a broken
//    upstream must not halt its dependents indefinitely.
//
// `open` is every open work item; `taskAfter(id)` gives a task's declared
// upstreams as `<pack>/<task>` ids, and `scheduledOf(id)` whether that task is
// asked by the scheduler at HEAD (`isScheduledTask`; null where the repo no longer
// carries it) — which is half of what says whether an item is a standing
// occurrence or an ad-hoc run (PRINCIPLES.md). `random` is the tie-break draw, injected
// so a test can pin an order the production call deliberately does not have.
export function pickOrder(open = [], { taskAfter = () => [], scheduledOf = () => null, random = Math.random, pathTo = () => null } = {}) {
  const idOf = (item) => taskIdOf(item, pathTo);
  const live = (item) => [STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT].some((s) => isStatus(item, s));
  const standing = (item) => isStandingItem(item, scheduledOf(idOf(item)));
  const liveUpstream = (upstreamId) => open.some((o) =>
    idOf(o) === upstreamId && standing(o) && live(o));
  // One draw per item, taken once: a comparator that called `random()` per
  // comparison would not be a consistent ordering, and `Array.sort` on one is
  // free to produce anything at all.
  const draw = new Map(open.map((i) => [i.number, random()]));

  return open
    .filter((i) => isStatus(i, STATUS_READY))
    .filter((i) => !open.some((o) => o.number !== i.number && titleOf(o) === titleOf(i)
      && running(o)))
    .filter((i) => {
      if (!standing(i)) return true;
      return !taskAfter(idOf(i)).some(liveUpstream);
    })
    .sort((a, b) =>
      (hasLabel(b, URGENT) ? 1 : 0) - (hasLabel(a, URGENT) ? 1 : 0)
      || draw.get(a.number) - draw.get(b.number));
}
