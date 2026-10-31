import type { ChartAssemblyInput } from '../core/types';
import { isCanvasInteraction } from './interactions';
import { composeInteractiveOptions } from './spec/compose';
import { mountInteractiveChartSurface } from './surface';
import type {
    BuildInteractiveChartOptions,
    InteractiveBackend,
    InteractiveChartSurface,
    InteractiveRendererLoaders,
    InteractiveRenderers,
} from './types';

const FACTORY_NAMES: Record<InteractiveBackend, string> = {
    vegalite: 'createVegaInteractiveRenderer',
    echarts: 'createEChartsInteractiveRenderer',
    chartjs: 'createChartjsInteractiveRenderer',
    plotly: 'createPlotlyInteractiveRenderer',
};

function missingRenderer(backend: InteractiveBackend): string {
    return `Flint: this entry does not load the ${backend} renderer. Import { ${FACTORY_NAMES[backend]} } from `
        + `'flint-chart/${backend}/interactive' and pass it as renderers.${backend}, or import from `
        + `'flint-chart/react/${backend}' (or 'flint-chart/interactive/${backend}').`;
}

/** A backend's renderer factory: the host's first, then the entry's own loader; an error names the fix. */
export async function rendererFactory<B extends InteractiveBackend>(
    loaders: InteractiveRendererLoaders, given: InteractiveRenderers | undefined, backend: B,
): Promise<NonNullable<InteractiveRenderers[B]>> {
    const own = given?.[backend];
    if (own) return own as NonNullable<InteractiveRenderers[B]>;
    const load = loaders[backend];
    if (load) return load() as Promise<NonNullable<InteractiveRenderers[B]>>;
    throw new Error(missingRenderer(backend));
}

/**
 * Mounts a chart with the renderer factories `loaders` reach, and those `options.renderers` gives.
 * No backend is imported here: an entry names the backends it loads, so a bundler resolves only those.
 */
export function mountChartWith(
    loaders: InteractiveRendererLoaders,
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    const { backend, renderer, expressionInterpreter, background, className, ariaLabel, chartId, availableSize } = options;
    const factory = <B extends InteractiveBackend>(name: B) => rendererFactory(loaders, options.renderers, name);
    // Loaded with the renderer: it reads the theme, which the mount entry does not bundle.
    const sized = async (chartInput: ChartAssemblyInput): Promise<ChartAssemblyInput> => {
        if (!availableSize) return chartInput;
        const { withCanvasSize } = await import('../core/compute-layout');
        return withCanvasSize(chartInput, availableSize);
    };
    // The spec and the code are two sources of one configuration; the spec comes first.
    const { interactions, updates, assistedTargeting, keyboardTargeting, transition, warnings } =
        composeInteractiveOptions(input, options);
    const canvasInteractions = interactions.filter(isCanvasInteraction);
    const hoverTolerance = Math.max(0, ...canvasInteractions
        .filter((interaction) => interaction.eventSource.gesture === 'hover')
        .map((interaction) => interaction.eventSource.targetTolerance ?? 0));
    switch (backend) {
        case 'vegalite':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const createVegaInteractiveRenderer = await factory('vegalite');
                        return createVegaInteractiveRenderer({
                            renderer,
                            // External definitions too: the renderer reports their state (filters).
                            interactions,
                            enableSemanticUpdates: (options.semanticUpdates ?? true)
                                || interactions.length > 0
                                || (updates?.length ?? 0) > 0,
                            expressionInterpreter,
                            background,
                            assistDistance: assistedTargeting === false
                                ? 0
                                : typeof assistedTargeting === 'object'
                                    && assistedTargeting.maxDistance !== undefined
                                    ? Math.max(0, assistedTargeting.maxDistance)
                                    : undefined,
                            hoverTolerance,
                            targetFeedback: {
                                assisted: typeof assistedTargeting === 'object' ? assistedTargeting : assistedTargeting ? {} : false,
                                keyboard: keyboardTargeting ? {} : false,
                            },
                            keyboardTargeting,
                            transition,
                            liveValues: availableSize !== undefined,
                        }).mount(chartContainer, await sized(chartInput));
                    },
                },
                { className, ariaLabel, chartId, updates, interactions, warnings },
            );
        case 'echarts':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const createEChartsInteractiveRenderer = await factory('echarts');
                        return createEChartsInteractiveRenderer({ renderer }).mount(chartContainer, await sized(chartInput));
                    },
                },
                { className, ariaLabel, chartId, updates, interactions, warnings },
            );
        case 'chartjs':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const createChartjsInteractiveRenderer = await factory('chartjs');
                        return createChartjsInteractiveRenderer().mount(chartContainer, await sized(chartInput));
                    },
                },
                { className, ariaLabel, chartId, updates, interactions, warnings },
            );
        case 'plotly':
            return mountInteractiveChartSurface(
                container,
                input,
                {
                    async mount(chartContainer, chartInput) {
                        const createPlotlyInteractiveRenderer = await factory('plotly');
                        return createPlotlyInteractiveRenderer().mount(chartContainer, await sized(chartInput));
                    },
                },
                { className, ariaLabel, chartId, updates, interactions, warnings },
            );
    }
}

