import type { ChartAssemblyInput } from '../core/types';
import { isCanvasInteraction, normalizeInteractions } from './interactions';
import { mountInteractiveChartSurface } from './surface';
import type { BuildInteractiveChartOptions, InteractiveChartSurface } from './types';

export type {
    AssistedTargetingOptions,
    BuildInteractiveChartOptions,
    ChartUpdateApplyOptions,
    ChartUpdateComposition,
    InteractiveBackend,
    InteractiveChartSurface,
    InteractiveChartSurfaceOptions,
    InteractionDismissPolicy,
    InteractiveRenderer,
    InteractiveRendererAdapter,
    ViewportChannel,
    ViewportGeometry,
    ViewportState,
} from './types';
export type {
    GestureGuideController,
    GestureGuideOptions,
    AreaGestureGuideStyle,
    InspectGuideOptions,
    LineGestureGuideStyle,
    RegionGuideOptions,
} from './guides';
export type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationSpec,
    ChartUpdate,
    ChartUpdateOp,
    ChartUpdatePresenter,
    BrushOptions,
    BrushZoomOptions,
    AngularBrushOptions,
    ClickAnnotateOptions,
    ClickGroupHighlightOptions,
    ClickHighlightOptions,
    ElementInteractionEvent,
    FlintInteractionEventDetail,
    InteractionPhase,
    InteractionContext,
    InteractionDef,
    CanvasInteractionDef,
    ExternalInteractionDef,
    InteractionModifiers,
    InspectOptions,
    LassoSelectOptions,
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
    SemanticElement,
    SemanticInteractionEvent,
    SemanticTarget,
    PresentationSpec,
    UpdateDomain,
    UpdateTarget,
} from './interactions';
export type {
    CanvasInteractionAction,
    CanvasInteractionEvent,
    DomainCoordinate,
    DomainGeometry,
    PlotGeometry,
} from './language/events';
export { toCanvasInteractionEvent } from './canvas-interaction';
export type {
    ChartUpdateResult,
    SemanticTargetRef,
    SemanticTargetSelector,
} from './language/updates';
export { matchesSemanticTargetSelector } from './language/updates';
export { brushAngle, brushX, brushY, brushZoom, clickAnnotate, clickGroupHighlight, clickHighlight, contextActivate, doubleActivate, dragReorder, externalInteraction, inspect, isCanvasInteraction, isExternalInteraction, lassoSelect, legendToggle, longPress, navigate, select } from './interactions';
export type { InteractionEventSource } from './triggers';
export {
    axisBrushTrigger,
    angularBrushTrigger,
    brushZoomTrigger,
    clickTrigger,
    contextTrigger,
    doubleActivateTrigger,
    hoverTrigger,
    inspectTrigger,
    keyboardTrigger,
    lassoTrigger,
    longPressTrigger,
    navigationTrigger,
    rectangleTrigger,
    xBrushTrigger,
    yBrushTrigger,
} from './triggers';
export { clampViewportStart, mountInteractiveChartSurface } from './surface';

/** Snap radius in renderer units when assisted targeting is enabled without a distance. */
const DEFAULT_ASSIST_DISTANCE = 12;

export function buildInteractiveChart(
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    const {
        backend, renderer, expressionInterpreter, background,
        className, ariaLabel, chartId, updates, assistedTargeting, keyboardTargeting, dismiss,
    } = options;
    const interactions = normalizeInteractions(options.interactions);
    const canvasInteractions = interactions.filter(isCanvasInteraction);
    if (backend !== 'vegalite' && interactions.length > 0) {
        return mountInteractiveChartSurface(
            container,
            input,
            {
                async mount() {
                    throw new Error(`Semantic interactions are not supported by backend "${backend}".`);
                },
            },
            { className, ariaLabel, chartId, updates },
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
                            interactions: canvasInteractions,
                            enableSemanticUpdates: canvasInteractions.length < interactions.length
                                || (updates?.length ?? 0) > 0,
                            expressionInterpreter,
                            background,
                            assistDistance: assistedTargeting
                                ? (typeof assistedTargeting === 'object' ? assistedTargeting.maxDistance : undefined)
                                    ?? DEFAULT_ASSIST_DISTANCE
                                : 0,
                            keyboardTargeting,
                            dismiss,
                        }).mount(chartContainer, chartInput);
                    },
                },
                { className, ariaLabel, chartId, updates, interactions },
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
                { className, ariaLabel, chartId, updates, interactions },
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
                { className, ariaLabel, chartId, updates, interactions },
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
                { className, ariaLabel, chartId, updates, interactions },
            );
    }
}