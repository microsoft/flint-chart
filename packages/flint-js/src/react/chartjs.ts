import { createFlintChart } from './chart';

export * from './chart';

/**
 * `FlintChart` with Chart.js only, so a bundler resolves no other backend: the app installs
 * chart.js and nothing else. Another backend draws where the `renderers` prop gives its factory.
 */
export const FlintChart = createFlintChart({
    chartjs: () => import('../chartjs/interactive').then((m) => m.createChartjsInteractiveRenderer),
});
