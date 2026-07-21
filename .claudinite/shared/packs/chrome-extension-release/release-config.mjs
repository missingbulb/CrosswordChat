import { finding } from '../../engine/checks/helpers/findings.mjs';

// `.github/release.config` is REQUIRED and fully explicit — every extension repo
// declares its release values, there are no silent defaults (a default that
// "happens to match" a repo's layout is a drift risk: change the default, or the
// thing it assumed, and the repo ships the wrong artifact with no signal). This
// check enforces the file's presence, that exactly the required keys are set,
// and that no unknown (typo'd) key sneaks in. Keep REQUIRED_KEYS in sync with
// .github/actions/read-release-config/read-config.mjs. Two things are NOT keys —
// they are forced-uniform structure, not a per-repo choice: the build is always
// `npm run build`, and the zip lives at `dist/<kebab repo name>.zip` (so both
// `zip_path` and `zip_name` are derived, not configured).
const REQUIRED_KEYS = [
  'manifest_path',
  'package_json_path',
  'setup_command',
  'test_command',
  'ship_paths',
];

const rule = {
  id: 'cer/release-config',
  severity: 'blocking',
  description: '.github/release.config exists and sets exactly the required release keys',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the release config is explicit with no defaults — a missing/typo\'d key would ship the wrong thing with no signal',

  run(ctx) {
    const path = '.github/release.config';
    const text = ctx.read(path);
    if (text === null) {
      return [finding(rule, {
        file: path,
        what: 'missing — the release config is required and fully explicit (no defaults)',
        fix: `create it with the required keys: ${REQUIRED_KEYS.join(', ')}`,
      })];
    }

    const out = [];
    const seen = new Set();
    text.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq === -1) {
        out.push(finding(rule, {
          file: path, line: i + 1,
          what: `line is not KEY=value or a # comment: "${line}"`,
          fix: 'use dotenv syntax — KEY=value, one per line',
        }));
        return;
      }
      const key = line.slice(0, eq).trim();
      if (!REQUIRED_KEYS.includes(key)) {
        out.push(finding(rule, {
          file: path, line: i + 1,
          what: `unknown key "${key}"`,
          fix: `valid keys: ${REQUIRED_KEYS.join(', ')}`,
        }));
      }
      seen.add(key);
    });

    for (const key of REQUIRED_KEYS) {
      if (!seen.has(key)) {
        out.push(finding(rule, {
          file: path,
          what: `missing required key "${key}"`,
          fix: `add "${key}=..." (every key is explicit; "setup_command=" may be empty to mean no install)`,
        }));
      }
    }
    return out;
  },
};

export default rule;
