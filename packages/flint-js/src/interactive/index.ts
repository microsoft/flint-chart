import type { ChartAssemblyInput } from '../core/types';
import { isCanvasInteraction } from './interactions';
import { composeInteractiveOptions } from './spec/compose';
import { mountInteractiveChartSurface } from './surface';
import type { BuildInteractiveChartOptions, InteractiveChartSurface } from './types';

export type {
    AssistedTargetingOptions,
    TargetDetailsOptions,
    TargetFeedbackOptions,
    BuildInteractiveChartOptions,
    ChartChange,
    ChartChangePhase,
    ChartChangeSource,
    ChartStateFacet,
    ChartUpdateApplyOptions,
    ChartUpdateTransition,
    ChartUpdateComposition,
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
    ChartAnnotation,
    ChartCategoryWindow,
    ChartHiddenValue,
    ChartState,
    ChartStateEntry,
} from '../core/interaction-contracts';
export type {
    GestureGuideController,
    GestureGuideOptions,
    AreaGestureGuideStyle,
    InspectGuideOptions,
    LineGestureGuideStyle,
    RegionGuideOptions,
} from './guides';
export type {
    InteractionAffordance,
    InteractionAffordances,
    InteractionAffordanceTarget,
    InteractionCursor,
    InteractionHoverEffect,
    ResolvedInteractionAffordance,
} from './affordances';
export { DRAW_CURSOR, affordanceCursor, affordsTarget, resolveInteractionAffordance } from './affordances';
export type {
    AccessibleNavigationOptions,
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationSpec,
    ChartOverlaySpec,
    ChartUpdate,
    ChartUpdateOp,
    ChartUpdatePresenter,
    BrushOptions,
    BrushZoomOptions,
    AngularBrushOptions,
    AxisHighlightOptions,
    ClickAnnotateOptions,
    ClickHighlightOptions,
    ClickHighlightTarget,
    ClickGroupFocusOptions,
    ContextActivateOptions,
    DoubleActivateOptions,
    DragReorderOptions,
    LegendToggleOptions,
    LongPressOptions,
    LinkedBrushOptions,
    HoverGroupFocusOptions,
    GroupBy,
    ElementInteractionEvent,
    FlintInteractionEventDetail,
    InteractionPhase,
    InteractionContext,
    InteractionDef,
    CanvasInteractionDef,
    ExternalInteractionDef,
    InteractionModifiers,
    InspectOptions,
    InspectIndexOptions,
    LassoSelectOptions,
    NavigateOptions,
    NavigationTransition,
    NavigationAxes,
    NavigationDomainGuard,
    NavigationInteractionEvent,
    NavigationOperation,
    PlotPoint,
    PlotAngularSector,
    PlotPolygon,
    PlotRect,
    OverlayFieldEncoding,
    OverlayMark,
    OverlayStyleSpec,
    RegionAxis,
    RegionOperation,
    RenderHit,
    SelectOptions,
    SemanticElement,
    SemanticInteractionEvent,
    SemanticTarget,
    StyleSpec,
    UpdateDomain,
    UpdateTarget,
} from './interactions';
export type {
    AccessibleElementDescription,
    CanvasInteractionAction,
    CanvasInteractionEvent,
    DomainCoordinate,
    DomainGeometry,
    PathProjection,
    PlotGeometry,
} from './language/events';
export { toCanvasInteractionEvent } from './canvas-interaction';
export type {
    ChartUpdateResult,
    FreeformOverlayBody,
    FreeformCloneBody,
    FreeformOverlaySpec,
    FreeformOverlayTransform,
    FreeformSvgBody,
    SemanticTargetRef,
    SemanticTargetSelector,
} from './language/updates';
export { matchesSemanticTargetSelector, selectionUpdate, viewportUpdate } from './language/updates';
export { accessibleNavigation, axisHighlight, brushAngle, brushX, brushY, brushZoom, clickAnnotate, clickGroupFocus, clickHighlight, contextActivate, doubleActivate, dragReorder, externalInteraction, hoverGroupFocus, inspect, inspectIndex, isCanvasInteraction, isExternalInteraction, lassoSelect, legendToggle, linkedBrush, longPress, navigate, select } from './interactions';
export type {
    AccessibleNavigationSection,
    AccessibleNavigationSettings,
    InspectIndexShow,
    InteractionEventSource,
} from './triggers';
export {
    ACCESSIBLE_NAVIGATION_SECTIONS,
    accessibleNavigationTrigger,
    axisBrushTrigger,
    angularBrushTrigger,
    dragTrigger,
    brushZoomTrigger,
    clickTrigger,
    contextTrigger,
    doubleActivateTrigger,
    hoverTrigger,
    inspectTrigger,
    inspectIndexTrigger,
    keyboardTrigger,
    lassoTrigger,
    longPressTrigger,
    navigationTrigger,
    rectangleTrigger,
    xBrushTrigger,
    yBrushTrigger,
} from './triggers';
export { clampViewportStart, mountInteractiveChartSurface } from './surface';
export { filterControls, isFilterControls, rowMatchesFilters, valueMatchesFilter } from './filter-controls';
export type {
    FilterControlsDef,
    FilterControlsOptions,
    FilterControlsPayload,
    FilterFieldOptions,
    FilterPlacement,
    FilterValue,
    FilterWidget,
} from './filter-controls';
export { INTERACTION_PRESET_TYPES } from '../core/interaction-spec';
export type {
    InteractionEntry,
    InteractionPresetType,
    InteractionSpec,
} from '../core/interaction-spec';
export type { InteractionPresetOptions, InteractionPresetSpec } from './spec/types';
export { INTERACTION_PRESETS, listInteractionPresets } from './spec/registry';
export { INTERACTION_PRESET_OPTIONS } from './spec/preset-options';
export type { InteractionPresetOption } from './spec/preset-options';
export type {
    InteractionCapability,
    InteractionGestureFamily,
    InteractionPresetDefinition,
    InteractionPresetSummary,
} from './spec/registry';
export { resolveInteractionSpec } from './spec/resolve';
export { INTERACTION_RESET_GESTURES, interactionsToReset, normalizeResetGestures } from './reset';
export type { InteractionResetGesture } from './reset';
export { admitInteractions } from './spec/admission';
export { composeInteractiveOptions } from './spec/compose';
export type { ComposedInteractiveOptions } from './spec/compose';
export type { InteractionAdmission, InteractionAdmissionPlan } from './spec/admission';
export type { ResolvedInteractionSpec } from './spec/resolve';

export function mountChart(
    container: HTMLElement,
    input: ChartAssemblyInput,
    options: BuildInteractiveChartOptions,
): InteractiveChartSurface {
    const { backend, renderer, expressionInterpreter, background, className, ariaLabel, chartId, availableSize } = options;
    // Loaded with the renderer: it reads the theme, which the mount entry does not bundle.
    const sized = async (chartInput: ChartAssemblyInput): Promise<ChartAssemblyInput> => {
        if (!availableSize) return chartInput;
        const { withCanvasSize } = await import('../core/compute-layout');
        return withCanvasSize(chartInput, availableSize);
    };
    // The spec and the code are two sources of one configuration; the spec comes first.
    const { interactions, updates, assistedTargeting, keyboardTargeting, warnings } =
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
                        const { createVegaInteractiveRenderer } = await import('../vegalite/interactive');
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
                        const { createEChartsInteractiveRenderer } = await import('../echarts/interactive');
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
                        const { createChartjsInteractiveRenderer } = await import('../chartjs/interactive');
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
                        const { createPlotlyInteractiveRenderer } = await import('../plotly/interactive');
                        return createPlotlyInteractiveRenderer().mount(chartContainer, await sized(chartInput));
                    },
                },
                { className, ariaLabel, chartId, updates, interactions, warnings },
            );
    }
}

/** The former name of `mountChart`. */
export const buildInteractiveChart = mountChart;
export type MountChartOptions = BuildInteractiveChartOptions;