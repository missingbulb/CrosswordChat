import { finding } from '../../engine/checks/helpers/findings.mjs';

// The testable slice of the engineering-practices "earn each dependency" rule:
// only the event — a package.json gains a dependency it did not carry at the
// scoping base — has a signature; the judgment half stays in the skill this
// finding points to. Fires once, on the branch that adds the name, then
// converges; a group move or version bump is not an addition.

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// Root or one directory down — the node pack's own marker scope, so a nested
// fixture/example manifest never counts.
const nearRoot = (f) => {
  const parts = f.split('/');
  return parts[parts.length - 1] === 'package.json' && parts.length <= 2;
};

function depNames(pkg) {
  const names = new Set();
  for (const key of DEP_KEYS) {
    for (const name of Object.keys(pkg?.[key] ?? {})) names.add(name);
  }
  return names;
}

const rule = {
  id: 'node/earn-each-dependency',
  severity: 'advisory',
  description: 'A newly added package.json dependency should be earned — prefer a built-in or a few lines for a narrow job',
  doc: 'skills/engineering-practices/SKILL.md',
  scope: 'work',
  why: 'every dependency is standing surface area and supply-chain weight; a built-in or a few lines often covers a narrow job with none of it',

  run(work) {
    const out = [];
    for (const file of work.changedFiles.filter(nearRoot)) {
      const { head, base } = work.jsonPair(file);
      if (!head) continue;
      const carried = depNames(base);
      for (const key of DEP_KEYS) {
        for (const name of Object.keys(head[key] ?? {})) {
          if (carried.has(name)) continue;
          out.push(finding(rule, {
            file,
            what: `"${name}" added to ${key}`,
            fix: 'confirm it earns its place — a built-in or a few lines often does a narrow job with no dependency; if it is warranted this advisory needs no change',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
