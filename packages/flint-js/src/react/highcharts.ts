import { createFlintChart } from './chart';

export * from './chart';

/**
 * `FlintChart` with Highcharts only, so a bundler resolves no other backend: the app installs
 * highcharts and nothing else. Another backend draws where the `renderers` prop gives its factory.
 */
export const FlintChart = createFlintChart({
    highcharts: () => import('../highcharts/interactive').then((m) => m.createHighchartsInteractiveRenderer),
});
