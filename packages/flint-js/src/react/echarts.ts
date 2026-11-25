import { createFlintChart } from './chart';

export * from './chart';

/**
 * `FlintChart` with ECharts only, so a bundler resolves no other backend: the app installs
 * echarts and nothing else. Another backend draws where the `renderers` prop gives its factory.
 */
export const FlintChart = createFlintChart({
    echarts: () => import('../echarts/interactive').then((m) => m.createEChartsInteractiveRenderer),
});
