// WHERE A PERSON'S PACK LIVES, and whether this session may go and get it. Two questions,
// one module, because three readers have to answer them identically: the step that copies
// the pack in, the step that explains why nothing was copied, and the conformance rules that
// judge a store this repo holds.
//
// THE ADDRESS, from this pack's own entry in `.claudinite-settings.json`:
//
//   { "id": "claude-code-web-users-support", "config": { "repo": "owner/name", "path": "preferences" } }
//
// `repo` is required, because what a person carries belongs to them rather than to any one
// project, and a repository is the smallest thing that can hold it for a whole fleet without
// living inside any member of it. `path` is where the people sit in that repository and
// defaults to `preferences`. One directory per person, named for their exact identity:
// `<path>/<email>/`, an ordinary pack directory.
//
// THE PERMISSION is a separate question with the same answer shape. A session that has no
// identity, no store, or no person watching has nowhere to copy from and no one to copy for,
// and every reader needs the same list of reasons: one to stop, the other to say why.
//
// Dependency-free and pure. The caller supplies the parsed config and the environment, so
// this module touches neither disk nor network and is testable standalone.

export const DEFAULT_PATH = 'preferences';

// `{ repo, path }` when the config names a usable store, else null. Null covers both
// "nothing declared" and "declared but unusable" deliberately: every caller's next move is
// the same either way, and the difference is reported once, by the rule that exists to
// report it.
export function resolveStore(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return null;
  if (typeof config.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(config.repo)) return null;
  if (config.path !== undefined && (typeof config.path !== 'string' || config.path.includes('..') || config.path.startsWith('/'))) return null;
  const path = (config.path ?? DEFAULT_PATH).replace(/^\.\/+|\/+$/g, '');
  return { repo: config.repo, path: path || DEFAULT_PATH };
}

// Where one person's pack sits inside the store, as a repo-relative directory path. An
// address only: whether it is read from a working tree or cloned is the caller's business.
export function packDirFor(store, email) {
  return `${store.path}/${email}`;
}

// Is this string usable as the name of a person's pack? It becomes a path segment and an
// argument to git, so an implausible one is refused rather than traversed with: `../../x` as
// an "email" would address an arbitrary directory.
export const isUsableIdentity = (email) => typeof email === 'string'
  && /^[^\s/\\]+@[^\s/\\]+$/.test(email)
  && !email.includes('..');

// Why this session gets no personal pack, in the reader's own words, or null when it should
// get one. Pure, so the step that says this and the step that acts on it cannot disagree,
// and so the saying costs no second look at the world.
//
// Attendedness is one of the reasons: a routine fired under a person's account carries their
// identity but not their presence, and a pack written for a present person (a popup for every
// decision, a callout closing every turn) misdirects a run nobody is watching. Only an
// explicit "not attended" declines, so an older harness that sets nothing still copies.
export function declineReason(config, env) {
  const tidy = (s) => String(s).replace(/["\\]/g, '');
  if (!resolveStore(config)) {
    return 'this project declares no store for personal packs (the pack entry\'s "config": { "repo": … })';
  }
  if (env.CLAUDE_CODE_SESSION_ATTENDED === '0') {
    return 'the session is unattended (CLAUDE_CODE_SESSION_ATTENDED=0) and a personal pack is for a present person';
  }
  const email = env.CLAUDE_CODE_USER_EMAIL || '';
  if (!email) return 'CLAUDE_CODE_USER_EMAIL is not set';
  if (!isUsableIdentity(email)) return `CLAUDE_CODE_USER_EMAIL (${tidy(email)}) is not a usable directory name`;
  return null;
}
