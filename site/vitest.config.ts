import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'flint-chart/interactive',
        replacement: fileURLToPath(new URL('../packages/flint-js/src/interactive/index.ts', import.meta.url)),
      },
      {
        find: 'flint-chart',
        replacement: fileURLToPath(new URL('../packages/flint-js/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
