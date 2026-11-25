import type { ChartAssemblyInput } from '../core/types';
import { mountChartWith } from './mount';
import type { BuildInteractiveChartOptions, InteractiveChartSurface } from './types';

export * from './exports';

/**
 * Mounts a chart with Plotly only, so a bundler resolves no other backend: the app installs
 * plotly.js-dist-min and nothing else. Another backend draws where `options.renderers` gives its factory.
 */
export function mountChart(
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    return mountChartWith(
        { plotly: () => import('../plotly/interactive').then((m) => m.createPlotlyInteractiveRenderer) },
        container, input, options,
    );
}

/** The former name of `mountChart`. */
export const buildInteractiveChart = mountChart;
