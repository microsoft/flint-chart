import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Resolve the library from source so tests don't depend on a prior build.
    // The longer alias comes first, so the bare name does not swallow it.
    alias: [
      { find: 'flint-chart/interactive', replacement: fileURLToPath(new URL('../flint-js/src/interactive/index.ts', import.meta.url)) },
      { find: 'flint-chart', replacement: fileURLToPath(new URL('../flint-js/src/index.ts', import.meta.url)) },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
