import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'vegalite/index': 'src/vegalite/index.ts',
    'echarts/index': 'src/echarts/index.ts',
    'chartjs/index': 'src/chartjs/index.ts',
    'plotly/index': 'src/plotly/index.ts',
    'excel/index': 'src/excel/index.ts',
    'image-charts/index': 'src/image-charts/index.ts',
    'interactive/index': 'src/interactive/index.ts',
    'vegalite/interactive': 'src/vegalite/interactive.ts',
    'echarts/interactive': 'src/echarts/interactive.ts',
    'chartjs/interactive': 'src/chartjs/interactive.ts',
    'plotly/interactive': 'src/plotly/interactive.ts',
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
  external: [
    'vega', 'vega-lite', 'vega-tooltip', 'echarts', 'chart.js', 'plotly.js', 'plotly.js-dist-min',
    '../vegalite/interactive', '../echarts/interactive', '../chartjs/interactive', '../plotly/interactive',
  ],
});
