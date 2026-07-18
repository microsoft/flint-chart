import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'vegalite/index': 'src/vegalite/index.ts',
    'echarts/index': 'src/echarts/index.ts',
    'chartjs/index': 'src/chartjs/index.ts',
    'plotly/index': 'src/plotly/index.ts',
    'test-data/index': 'src/test-data/index.ts',
    'gallery/index': 'src/gallery/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2020',
  external: ['vega', 'vega-lite', 'echarts', 'chart.js', 'plotly.js'],
});
