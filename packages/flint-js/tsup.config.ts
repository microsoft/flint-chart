import { defineConfig, type Options } from 'tsup';

/** The boundaries the renderers import on a map's first draw: one ES module each, split off by the host's bundler. */
const LAZY_TOPOLOGIES = ['world-bank-coarse', 'world-bank-medium', 'world-110m', 'states-10m', 'counties-albers-10m'];

const library: Options = {
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'vegalite/index': 'src/vegalite/index.ts',
    'echarts/index': 'src/echarts/index.ts',
    'chartjs/index': 'src/chartjs/index.ts',
    'plotly/index': 'src/plotly/index.ts',
    'excel/index': 'src/excel/index.ts',
    'image-charts/index': 'src/image-charts/index.ts',
    'validate/index': 'src/validate/index.ts',
    'validate/links': 'src/validate/links.ts',
    'interactive/index': 'src/interactive/index.ts',
    'render/index': 'src/render/index.ts',
    'geo/index': 'src/geo/index.ts',
    'react/index': 'src/react/index.ts',
    'react/vegalite': 'src/react/vegalite.ts',
    'react/echarts': 'src/react/echarts.ts',
    'react/chartjs': 'src/react/chartjs.ts',
    'react/plotly': 'src/react/plotly.ts',
    'interactive/vegalite': 'src/interactive/vegalite.ts',
    'interactive/echarts': 'src/interactive/echarts.ts',
    'interactive/chartjs': 'src/interactive/chartjs.ts',
    'interactive/plotly': 'src/interactive/plotly.ts',
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
    'vega', 'vega-lite', 'vega-tooltip', 'echarts', 'chart.js', 'plotly.js', 'plotly.js-dist-min', 'react',
    '../vegalite/interactive', '../echarts/interactive', '../chartjs/interactive', '../plotly/interactive',
    '../validate/links',
    // The bundled boundaries, imported by the package's own name (see src/vegalite/boundary-loader.ts).
    /^flint-chart\/geo\/lazy\//,
  ],
};

const lazyGeo: Options = {
  entry: Object.fromEntries(LAZY_TOPOLOGIES.map((name) => [`geo/lazy/${name}`, `src/geo/lazy/${name}.js`])),
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: false,
  splitting: false,
  target: 'es2020',
};

// tsup runs the ESM, CJS and declaration builds at once, and together they outgrow an 8 GB build
// agent. `npm run build` runs the bundles first, then `tsup --dts-only` for the declarations.
export default defineConfig((cli) => {
  if (cli.watch) return [library, lazyGeo];
  if (typeof cli.dts === 'object' && cli.dts.only) return { ...library, clean: false };
  return [{ ...library, dts: false }, lazyGeo];
});
