import type { ChartAssemblyInput } from '../core/types';
import { mountInteractiveChartSurface } from './surface';
import type { BuildInteractiveChartOptions, InteractiveChartSurface } from './types';

export type {
    BuildInteractiveChartOptions,
    InteractiveBackend,
    InteractiveChartSurface,
    InteractiveChartSurfaceOptions,
    InteractiveRenderer,
    InteractiveRendererAdapter,
    ViewportChannel,
    ViewportGeometry,
    ViewportState,
} from './types';
export { clampViewportStart, mountInteractiveChartSurface } from './surface';

export function buildInteractiveChart(
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    const { backend, renderer, focusOnClick, expressionInterpreter, background, className, ariaLabel } = options;
    switch (backend) {
        case 'vegalite':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const { createVegaInteractiveRenderer } = await import('../vegalite/interactive');
                        return createVegaInteractiveRenderer({
                            renderer,
                            focusOnClick,
                            expressionInterpreter,
                            background,
                        }).mount(chartContainer, chartInput);
                    },
                },
                { className, ariaLabel },
            );
        case 'echarts':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const { createEChartsInteractiveRenderer } = await import('../echarts/interactive');
                        return createEChartsInteractiveRenderer({ renderer }).mount(chartContainer, chartInput);
                    },
                },
                { className, ariaLabel },
            );
        case 'chartjs':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const { createChartjsInteractiveRenderer } = await import('../chartjs/interactive');
                        return createChartjsInteractiveRenderer().mount(chartContainer, chartInput);
                    },
                },
                { className, ariaLabel },
            );
        case 'plotly':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const { createPlotlyInteractiveRenderer } = await import('../plotly/interactive');
                        return createPlotlyInteractiveRenderer().mount(chartContainer, chartInput);
                    },
                },
                { className, ariaLabel },
            );
    }
}