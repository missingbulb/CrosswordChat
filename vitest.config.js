import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'extension-test/**/*.test.js',
      'dev/requirements/**/*.test.js',
      // This repo's own Claudinite packs: each local check ships with a red-first
      // fixture (see .claudinite/local/packs/*/pack.test.mjs), and the project's
      // suite is what runs it — the checks engine's mount is gitignored, so CI
      // would otherwise never see these tests fail.
      '.claudinite/local/packs/**/*.test.mjs',
    ],
    environment: 'node',
  },
});
