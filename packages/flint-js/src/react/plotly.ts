import { createFlintChart } from './chart';

export * from './chart';

/**
 * `FlintChart` with Plotly only, so a bundler resolves no other backend: the app installs
 * plotly.js-dist-min and nothing else. Another backend draws where the `renderers` prop gives its factory.
 */
export const FlintChart = createFlintChart({
    plotly: () => import('../plotly/interactive').then((m) => m.createPlotlyInteractiveRenderer),
});
