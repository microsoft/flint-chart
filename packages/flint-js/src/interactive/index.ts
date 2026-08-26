import type { ChartAssemblyInput } from '../core/types';
import { normalizeInteractions } from './interactions';
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
export type {
    AnnotationRenderPlan,
    ChartUpdate,
    ChartUpdateProcessor,
    BrushOptions,
    AngularBrushOptions,
    ClickAnnotateOptions,
    ClickGroupHighlightOptions,
    ClickHighlightOptions,
    ElementInteractionEvent,
    ExternalInteractionEvent,
    FlintInteractionEventDetail,
    InteractionInput,
    InteractionPhase,
    InteractionContext,
    InteractionDef,
    InteractionModifiers,
    NavigateOptions,
    NavigationAxes,
    NavigationDomainGuard,
    NavigationInteractionEvent,
    NavigationOperation,
    PlotPoint,
    PlotAngularSector,
    PlotPolygon,
    PlotRect,
    RegionAxis,
    RegionOperation,
    RenderHit,
    SelectOptions,
    SelectionMode,
    SemanticElement,
    SemanticInteractionEvent,
    SemanticTarget,
    NormalizedInteractionEvent,
    UpdateOp,
} from './interactions';
export { brushAngle, brushX, brushY, clickAnnotate, clickGroupHighlight, clickHighlight, navigate, select } from './interactions';
export type { InteractionEventSource, InteractionEventSourceContext } from './triggers';
export {
    axisBrushTrigger,
    angularBrushTrigger,
    clickTrigger,
    externalTrigger,
    hoverTrigger,
    navigationTrigger,
    rectangleTrigger,
    xBrushTrigger,
    yBrushTrigger,
} from './triggers';
export {
    AngularBrushInteraction,
    BrushInteraction,
    ClickAnnotateInteraction,
    ClickGroupHighlightInteraction,
    ClickHighlightInteraction,
    NavigateInteraction,
    SelectInteraction,
} from './presets';
export { clampViewportStart, mountInteractiveChartSurface } from './surface';

export function buildInteractiveChart(
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    const { backend, renderer, focusOnClick, expressionInterpreter, background, className, ariaLabel, chartId } = options;
    const interactions = normalizeInteractions(options.interactions, focusOnClick);
    if (backend !== 'vegalite' && interactions.length > 0) {
        return mountInteractiveChartSurface(
            container,
            input,
            {
                async mount() {
                    throw new Error(`Semantic interactions are not supported by backend "${backend}".`);
                },
            },
            { className, ariaLabel, chartId },
        );
    }
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
                            interactions,
                            expressionInterpreter,
                            background,
                        }).mount(chartContainer, chartInput);
                    },
                },
                { className, ariaLabel, chartId },
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
                { className, ariaLabel, chartId },
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
                { className, ariaLabel, chartId },
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
                { className, ariaLabel, chartId },
            );
    }
}