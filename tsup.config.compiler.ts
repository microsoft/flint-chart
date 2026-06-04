import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/compiler-index.ts',
    'core/index': 'src/core/index.ts',
    'vegalite/index': 'src/vegalite/index.ts',
  },
  outDir: 'dist-compiler',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2020',
  external: ['vega', 'vega-lite'],
});
