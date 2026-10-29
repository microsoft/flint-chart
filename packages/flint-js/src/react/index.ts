import { createFlintChart } from './chart';

export * from './chart';

/**
 * Draws a Flint spec on any backend, loading its renderer on first draw. A bundler resolves every
 * backend this can load; an app that installs only some imports `flint-chart/react/<backend>`.
 */
export const FlintChart = createFlintChart({
    vegalite: () => import('../vegalite/interactive').then((m) => m.createVegaInteractiveRenderer),
    echarts: () => import('../echarts/interactive').then((m) => m.createEChartsInteractiveRenderer),
    chartjs: () => import('../chartjs/interactive').then((m) => m.createChartjsInteractiveRenderer),
    plotly: () => import('../plotly/interactive').then((m) => m.createPlotlyInteractiveRenderer),
});
