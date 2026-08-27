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
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationRenderPlan,
    ChartUpdate,
    ChartUpdatePresenter,
    BrushOptions,
    AngularBrushOptions,
    ClickAnnotateOptions,
    ClickGroupHighlightOptions,
    ClickHighlightOptions,
    ElementInteractionEvent,
    ExternalInteractionEvent,
    FlintInteractionEventDetail,
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
export type {
    CanvasInteractionAction,
    CanvasInteractionEvent,
    DomainCoordinate,
    DomainGeometry,
    PlotGeometry,
} from './canvas-interaction';
export { toCanvasInteractionEvent } from './canvas-interaction';
export type {
    ChartUpdateRequest,
    ChartUpdateRequestOp,
    ChartUpdateResult,
    SemanticTargetRef,
    SemanticTargetSelector,
    UpdateTarget,
} from './updates/request';
export {
    annotate,
    clearAnnotation,
    emphasize,
    navigateViewport,
    resetUpdate,
} from './updates/request';
export { brushAngle, brushX, brushY, clickAnnotate, clickGroupHighlight, clickHighlight, dragReorder, navigate, select } from './interactions';
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