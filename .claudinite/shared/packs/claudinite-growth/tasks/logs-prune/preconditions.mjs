import { resolveRetentionDays } from './prune-logs.mjs';

// logs-prune's own precondition term. What it reads is a CLOCK crossing a boundary
// — the oldest capture aged past this repo's retention — and no built-in movement
// condition can say that: the repos holding logs old enough to expire are exactly
// the ones that went quiet, so repo movement is the wrong signal here.

export const terms = {
  'log-past-retention': {
    signals: ['conversationLogs'],
    holds(signals) {
      // NO READING IS NOT A DECLINE. Nothing asks this task, so its item exists only
      // because a person created one, and a decline closes that item unrun — a term
      // that cannot hold on a bare item is a lever that cannot be pulled. The worker
      // reads the branch and the declaration first-hand, so it decides here.
      const logs = signals.conversationLogs;
      if (logs === undefined || logs === null) {
        return { holds: true, reason: 'no conversation-logs reading — the worker decides what is deletable' };
      }
      if (logs.present !== true) {
        return { holds: false, reason: 'no conversation-logs branch — nothing captured yet' };
      }
      // The signal reports what the declaration SAYS (null when nothing declares a
      // numeric `retention_days`) and knows nothing about this pack's policy — it is
      // keyed by the parameter rather than by the pack, deliberately. So the default
      // and the opt-out are applied here, through the same resolver the worker uses,
      // and a repo that declared itself out is declined before it costs an item.
      const retention = resolveRetentionDays(logs.retentionDays);
      if (retention === null) {
        return { holds: false, reason: `retention_days is ${logs.retentionDays} — capture-only by this repo's own choice, so the prune deletes nothing` };
      }
      const oldest = logs.oldestLogAgeDays;
      // An unreadable branch tree leaves `oldestLogAgeDays` null, which is unknown
      // rather than expired — and the safe reading of unknown is "delete nothing".
      if (!(typeof oldest === 'number' && oldest > retention)) {
        return { holds: false, reason: `no log older than retention ${retention}d — nothing to prune` };
      }
      return { holds: true, reason: `oldest log ${oldest.toFixed(1)}d old vs retention ${retention}d` };
    },
  },
};
