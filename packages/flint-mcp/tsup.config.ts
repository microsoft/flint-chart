import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    'flint-chart': 'src/flint-chart.ts',
    server: 'src/server.ts',
    'render/index': 'src/render/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'node18',
  platform: 'node',
  // Keep native + heavy render libs external; they are runtime dependencies
  // resolved from node_modules, not bundled into the output.
  external: [
    '@modelcontextprotocol/sdk',
    '@napi-rs/canvas',
    '@resvg/resvg-js',
    'echarts',
    'chart.js',
    'vega',
    'vega-lite',
    'flint-chart',
    'zod',
  ],
  banner: { js: '#!/usr/bin/env node' },
});
