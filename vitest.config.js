import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['extension-test/**/*.test.js', 'dev/requirements/**/*.test.js'],
    environment: 'node',
  },
});
