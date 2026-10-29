// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(root, '../package.json'), 'utf8')) as {
  version: string;
};

// The view mounts every chart on Vega-Lite and imports flint-chart's Vega-Lite entries
// (`flint-chart/react/vegalite`, `flint-chart/interactive/vegalite`), so no other backend's
// surface is bundled: the view is sent as one MCP message, which stdio clients cap at 10 MB.

// Bundle the entire app (React + Flint + Vega) into one self-contained HTML so
// the MCP App resource needs no network access and renders fully client-side.
export default defineConfig({
  root,
  plugins: [react(), viteSingleFile()],
  define: {
    __FLINT_MCP_VERSION__: JSON.stringify(packageJson.version),
  },
  // The ext-apps React hooks (useApp) and the app share one React instance.
  // Without deduping, the bundle pulls in a second React copy whose hook
  // dispatcher is never set, so useState() throws at runtime.
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    outDir: resolve(root, '../assets'),
    emptyOutDir: false,
    cssMinify: true,
    minify: true,
    rollupOptions: {
      input: resolve(root, 'flint-app.html'),
    },
  },
});
