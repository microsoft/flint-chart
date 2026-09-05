import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// Use a relative base by default so the same build works for both
// public Pages (`microsoft.github.io/flint-chart/`) and private Pages
// (`<random>.pages.github.io/` at the host root).
// Override with VITE_BASE_PATH if hosting at a specific absolute path.
const base = process.env.VITE_BASE_PATH ?? './';

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    // NOTE: order matters — longer aliases must come first so 'flint-chart/test-data'
    // is matched before the bare 'flint-chart' substring alias.
    alias: [
      {
        find: 'flint-chart/interactive',
        replacement: path.resolve(__dirname, '../packages/flint-js/src/interactive/index.ts'),
      },
      {
        find: 'flint-chart/test-data',
        replacement: path.resolve(__dirname, '../packages/flint-js/src/test-data/index.ts'),
      },
      {
        find: 'flint-chart',
        replacement: path.resolve(__dirname, '../packages/flint-js/src/index.ts'),
      },
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    // Bind to all interfaces so the dev server is reachable when running on a
    // remote server (via SSH port-forward or direct host access), not just
    // from localhost on that machine.
    host: true,
    port: 5274,
    strictPort: true,
    // Allow access via any Host header (e.g. when reaching the server through
    // its hostname or a reverse proxy). Vite 7 otherwise blocks unknown hosts.
    allowedHosts: true,
    // Don't try to launch a browser on a headless server.
    open: false,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
});
