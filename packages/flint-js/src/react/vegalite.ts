import { createFlintChart } from './chart';

export * from './chart';

/**
 * `FlintChart` with Vega-Lite only, so a bundler resolves no other backend: the app installs
 * vega, vega-lite and vega-tooltip and nothing else. Another backend draws where the `renderers` prop gives its factory.
 */
export const FlintChart = createFlintChart({
    vegalite: () => import('../vegalite/interactive').then((m) => m.createVegaInteractiveRenderer),
});
