import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // The renderers import the bundled boundaries by the package's own name; read them from source.
      { find: /^flint-chart\/geo\/lazy\/([\w-]+)$/, replacement: fileURLToPath(new URL('./src/geo/lazy/$1.js', import.meta.url)) },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'examples', 'agents', 'df-reference'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test-data/**',
        'src/**/index.ts',
      ],
    },
  },
});
