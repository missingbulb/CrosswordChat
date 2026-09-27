// Who this session is on GitHub: the login `GET /user` returns for the session's token,
// `GH_TOKEN` then `GITHUB_TOKEN`. The harness names the person only by email, and the store is
// keyed by login (user_pack_address.mjs). Never throws: `{ login, via }` or `{ error }`.
//
// In a web session the tokens are placeholders the agent proxy swaps for the real credential,
// and Node's fetch bypasses the proxy unless NODE_USE_ENV_PROXY=1 was set at startup, so
// `readGithubLoginThroughProxy` runs the read in a child started with it.
// `CLAUDINITE_GITHUB_USER_URL` replaces the endpoint for tests.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isUsableIdentity } from './user_pack_address.mjs';

const TIMEOUT_MS = 10_000;
const TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN'];

export async function readGithubLogin(env) {
  const url = env.CLAUDINITE_GITHUB_USER_URL || 'https://api.github.com/user';
  const held = TOKENS.filter((name) => env[name]);
  if (!held.length) return { error: 'neither GH_TOKEN nor GITHUB_TOKEN is set' };
  const misses = [];
  for (const name of held) {
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${env[name]}`, accept: 'application/vnd.github+json', 'user-agent': 'claudinite' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) { misses.push(`${name}: HTTP ${res.status}`); continue; }
      const { login } = await res.json();
      if (typeof login !== 'string' || !isUsableIdentity(login.toLowerCase())) {
        return { error: `${name} read back ${JSON.stringify(String(login)).replace(/\\/g, '')}, which is not a usable GitHub login` };
      }
      return { login, via: name };
    } catch (e) {
      misses.push(`${name}: ${e.cause?.code || e.name || e.message}`);
    }
  }
  return { error: `GET /user answered no login (${misses.join('; ')})` };
}

export async function readGithubLoginThroughProxy(env) {
  if (!env.HTTPS_PROXY || env.NODE_USE_ENV_PROXY === '1') return readGithubLogin(env);
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...env, NODE_USE_ENV_PROXY: '1' },
    encoding: 'utf8',
    timeout: TOKENS.length * TIMEOUT_MS + 5_000,
  });
  try { return JSON.parse(child.stdout); } catch {
    return { error: `the login read exited ${child.status ?? child.signal} with no answer` };
  }
}

// Run directly, it is that child: one read, its answer as JSON on stdout.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  readGithubLogin(process.env).then((r) => process.stdout.write(JSON.stringify(r)));
}
