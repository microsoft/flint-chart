// Everything `flint-chart/interactive` exports but `mountChart`, which each entry binds to the
// backends it loads (see ./index.ts and ./vegalite.ts, ./echarts.ts, ./chartjs.ts, ./plotly.ts).
export { mountChartWith } from './mount';
import type { BuildInteractiveChartOptions } from './types';

export type {
    AssistedTargetingOptions,
    TargetDetailsOptions,
    TargetFeedbackOptions,
    BuildInteractiveChartOptions,
    InteractiveRenderers,
    InteractiveRendererLoaders,
    ChartChange,
    ChartLayout,
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
    AxisTargetValue,
    ChartAnnotation,
    ChartCategoryWindow,
    ChartHiddenValue,
    ChartState,
    ChartStateEntry,
    DomainPoint,
    DomainValue,
    LegendDomain,
    LegendTargetValue,
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
export { HOST_SOURCE, LINK_LAYER, conditionUpdates, createLinkState, gestureParts, linkCharts, linkInput, loadLinks, selectionParts, selectionTuples, shownFields } from './link';
export type { ChartLink, ChartsLink, LinkChartsOptions, LinkCondition, LinkGesture, LinkPart, LinkSnapshot, LinkSpec, LinkState, LinkedChart } from './link';
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
export { contextMenu, isContextMenu } from './context-menu';
export type { ContextMenuDef, ContextMenuGesture, ContextMenuItem, ContextMenuOptions } from './context-menu';
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

export type MountChartOptions = BuildInteractiveChartOptions;
