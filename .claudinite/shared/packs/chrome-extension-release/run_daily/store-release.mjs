// chrome-extension-release pack maintenance task: chrome-store-release. Proves the
// pack-task seam — a task contributed by a pack, active only where that pack is
// declared. Detects an unreleased version bump (the manifest version has advanced past
// the latest published release) entirely in code, so smarts is 'none': the orchestrator
// runs the worker as a direct action, no agent. The actual Chrome Web Store dispatch is
// a workflow_dispatch-only Action the worker triggers — never scheduled (see the
// scheduling contract); publishing stays gated behind that.

const MANIFEST_PATHS = ['manifest.json', 'src/manifest.json', 'public/manifest.json', 'dist/manifest.json'];
const norm = (v) => String(v ?? '').replace(/^v/, '').trim();

async function readJson(gh, fullName, path) {
  const { status, json } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status !== 200 || !json?.content) return null;
  try { return JSON.parse(Buffer.from(json.content, 'base64').toString('utf8')); } catch { return null; }
}

export default {
  id: 'chrome-store-release',
  worker: 'packs/chrome-extension-release/run_daily/store-release.worker.md',
  full_sweep_supported: true,
  smarts: 'none', // the whole decision is code — no agent judgment

  async gate(repo, signals, gh) {
    let manifest = null;
    for (const p of MANIFEST_PATHS) {
      manifest = await readJson(gh, repo.fullName, p);
      if (manifest?.version) break;
    }
    const shipped = norm(manifest?.version);
    if (!shipped) return { run: false }; // no manifest version found → nothing to judge

    const { status, json } = await gh(`/repos/${repo.fullName}/releases/latest`);
    const released = status === 200 ? norm(json?.tag_name) : ''; // 404 → no release yet
    if (shipped === released) return { run: false };

    return {
      run: true,
      targets: { unreleasedVersion: shipped, lastReleased: released || null },
      reason: released ? `manifest ${shipped} is ahead of released ${released}` : `manifest ${shipped}, no release yet`,
    };
  },
};
