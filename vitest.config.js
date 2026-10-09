import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'extension-test/**/*.test.js',
      'dev/requirements/**/*.test.js',
    ],
    environment: 'node',
    // A UI render launches a cold Chromium per case, which can outrun the 5s default.
    testTimeout: 20000,
  },
});
