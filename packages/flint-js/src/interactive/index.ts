import type { ChartAssemblyInput } from '../core/types';
import { mountChartWith } from './mount';
import type { BuildInteractiveChartOptions, InteractiveChartSurface, InteractiveRendererLoaders } from './types';

export * from './exports';

/** Every backend, each loaded when a chart first draws with it. */
const ALL_RENDERERS: InteractiveRendererLoaders = {
    vegalite: () => import('../vegalite/interactive').then((m) => m.createVegaInteractiveRenderer),
    echarts: () => import('../echarts/interactive').then((m) => m.createEChartsInteractiveRenderer),
    chartjs: () => import('../chartjs/interactive').then((m) => m.createChartjsInteractiveRenderer),
    plotly: () => import('../plotly/interactive').then((m) => m.createPlotlyInteractiveRenderer),
};

/**
 * Mounts a chart on any backend, loading its renderer on first draw. A bundler resolves every
 * backend this can load; an app that installs only some imports `flint-chart/interactive/<backend>`
 * instead, or passes `options.renderers`.
 */
export function mountChart(
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    return mountChartWith(ALL_RENDERERS, container, input, options);
}

/** The former name of `mountChart`. */
export const buildInteractiveChart = mountChart;
export type MountChartOptions = BuildInteractiveChartOptions;
