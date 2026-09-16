import type {
    ChartUpdate,
    InteractionContext,
    NavigationDomainGuard,
    SemanticElement,
    SemanticTargetSelector,
} from '../core/interaction-contracts';
import type { InteractionEventSource, NavigationResetGesture } from './triggers';
export type { NavigationResetGesture } from './triggers';
import { NAVIGATION_RESET, NO_RESET, SELECTION_RESET, normalizeResetGestures, type InteractionResetGesture } from './reset';
import type { InteractionPresetType } from '../core/interaction-spec';
import type { InspectIndexShow, InspectMode } from './triggers';
import type { InspectGuideOptions, RegionGuideOptions } from './guides';
import type { InteractionAffordance } from './affordances';
import type {
    NavigationAxes,
} from './language/events';
import {
    createBrushInteraction,
    createBrushZoomInteraction,
    createAngularBrushInteraction,
    createAxisHighlightInteraction,
    createClickAnnotateInteraction,
    createClickGroupFocusInteraction,
    createClickHighlightInteraction,
    createContextActivateInteraction,
    createDoubleActivateInteraction,
    createInspectInteraction,
    createInspectIndexInteraction,
    createLongPressInteraction,
    createLassoSelectInteraction,
    createLegendToggleInteraction,
    createSelectInteraction,
    createNavigateInteraction,
    createDragReorderInteraction,
    createLinkedBrushInteraction,
    createHoverGroupFocusInteraction,
} from './presets';
import type { CanvasInteractionEvent } from './language/events';
export type {
    ChartUpdatePresenter,
    InteractionContext,
    NavigationDomainGuard,
    NavigationRequest,
    NavigationUpdate,
    RenderHit,
    SemanticElement,
    SemanticTarget,
} from '../core/interaction-contracts';

export interface FlintInteractionEventDetail {
    chartId: string;
    interactionId: string;
    timestamp: number;
    transactionId?: string;
    event: CanvasInteractionEvent;
}

export type {
    AxisProjection,
    CanvasInteractionAction,
    CanvasInteractionEvent,
    DomainCoordinate,
    DomainGeometry,
    PlotGeometry,
} from './language/events';

export type {
    ElementInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    NavigationAxes,
    NavigationInteractionEvent,
    NavigationOperation,
    PlotPoint,
    PlotAngularSector,
    PlotPolygon,
    PlotRect,
    RegionAxis,
    RegionOperation,
    RegionInteractionEvent,
    SemanticInteractionEvent,
} from './language/events';

export type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationConnectorAnchor,
    AnnotationSpec,
    ChartOverlaySpec,
    ChartUpdate,
    ChartUpdateOp,
    OverlayFieldEncoding,
    OverlayMark,
    OverlayStyleSpec,
    StyleSpec,
    SemanticTargetRef,
    SemanticTargetSelector,
    UpdateDomain,
    UpdateTarget,
} from './language/updates';

export interface CanvasInteractionDef {
    readonly id: string;
    /** Set by the spec resolver. A definition made in code has no origin. */
    readonly origin?: 'spec';
    /** The preset that made this definition; admission reads its requirements from the registry. */
    readonly preset?: InteractionPresetType;
    /** Gestures that return this interaction to its neutral state, normalised by the factory. Absent on presets that retain nothing. */
    readonly reset?: readonly InteractionResetGesture[];
    /** Drops state the preset keeps outside the chart's retained updates, when a reset gesture fires. */
    onReset?(): void;
    readonly eventSource: InteractionEventSource;
    readonly affordances?: readonly InteractionAffordance[];
    /** Retained updates from interactions in the same group replace one another. */
    readonly retainedStateGroup?: string;
    readonly navigationDomainGuard?: NavigationDomainGuard;
    /** A reset gesture on this interaction tweens home over this duration. */
    readonly navigationResetTransition?: NavigationTransition;
    /** Claims legend activations exclusively, so a legend click never also reads as an element click. */
    readonly claimsLegendActivation?: boolean;
    /** Claims native axis tick activations instead of treating them as mark activations. */
    readonly claimsAxisActivation?: boolean;
    handle?(event: CanvasInteractionEvent, context: InteractionContext): ChartUpdate | null;
}

export interface ExternalInteractionDef<TPayload = unknown> {
    readonly id: string;
    readonly external: true;
    handle(payload: TPayload, context: InteractionContext): ChartUpdate | null;
}

export type InteractionDef = CanvasInteractionDef | ExternalInteractionDef<unknown>;

export function externalInteraction<TPayload>(definition: {
    id: string;
    handle(payload: TPayload, context: InteractionContext): ChartUpdate | null;
}): ExternalInteractionDef<TPayload> {
    return { ...definition, external: true };
}

export function isCanvasInteraction(interaction: InteractionDef): interaction is CanvasInteractionDef {
    return !('external' in interaction);
}

export function isExternalInteraction(interaction: InteractionDef): interaction is ExternalInteractionDef<unknown> {
    return 'external' in interaction;
}

export type GroupBy =
    | string
    | readonly string[];

export interface AxisHighlightOptions {
    id?: string;
    axis?: 'x' | 'y';
    event?: 'hover' | 'click';
    dimOpacity?: number;
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

export type ClickHighlightTarget = 'mark' | 'legend' | 'discreteAxis';

export interface ClickHighlightOptions {
    id?: string;
    dimOpacity?: number;
    /** Semantic surfaces activated by this preset. Defaults to all three targets. */
    targets?: readonly ClickHighlightTarget[];
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

export interface ClickGroupFocusOptions {
    id?: string;
    dimOpacity?: number;
    groupBy?: GroupBy;
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

export interface ClickAnnotateOptions {
    id?: string;
    dimOpacity?: number;
    format?: (element: SemanticElement, context: InteractionContext) => string;
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

export interface LinkedBrushOptions extends SelectOptions {
    groupBy: GroupBy;
    brush?: 'rectangle' | 'lasso';
}

export interface HoverGroupFocusOptions {
    id?: string;
    groupBy: string | readonly string[];
    dimOpacity?: number;
    /** Nearest-mark hover radius in renderer pixels. Defaults to 8. */
    tolerance?: number;
}

export interface SelectOptions {
    id?: string;
    match?: 'intersect' | 'contain';
    dimOpacity?: number;
    /** Transient region shown during the gesture; false disables visual feedback. */
    guide?: RegionGuideOptions | false;
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

export interface BrushOptions extends SelectOptions {
    mode?: 'ephemeral' | 'stateful';
}

export type AngularBrushOptions = SelectOptions & { mode?: 'ephemeral' | 'stateful' };

export type LassoSelectOptions = SelectOptions;

export interface LegendToggleOptions {
    id?: string;
    mutedOpacity?: number;
    /** Hidden series are a setting, so nothing resets them unless this list says so. */
    reset?: readonly InteractionResetGesture[];
}

export interface ContextActivateOptions {
    id?: string;
}

export interface InspectOptions {
    id?: string;
    mode?: InspectMode;
    /** Ordered modes cycled by wheel or context-menu gestures; mode is included automatically. */
    cycle?: readonly InspectMode[];
    /** Hit tolerance as a plot-size fraction. Defaults to 0.02 for XY and 0.01 otherwise. */
    tolerance?: number;
    /** Transient guide shown while inspecting; false disables visual feedback. */
    guide?: InspectGuideOptions | false;
    selector?: SemanticTargetSelector;
    dimOpacity?: number;
}

export interface InspectIndexOptions {
    id?: string;
    /** Independent chart axis used to acquire one index slice. */
    axis?: 'x' | 'y';
    /** Near-axis acquisition radius as a plot-size fraction. Defaults to 0.01. */
    tolerance?: number;
    /** Which series to present: all, the first series, or a preferred initial series. */
    show?: InspectIndexShow;
    /** Record field identifying a series; single-series policies switch through the legend. */
    seriesBy?: string;
    guide?: InspectGuideOptions | false;
    selector?: SemanticTargetSelector;
    /** Releases a locked series. Defaults to ['escape']. */
    reset?: readonly InteractionResetGesture[];
}

export interface BrushZoomOptions {
    id?: string;
    axes?: 'x' | 'y' | 'xy';
    guide?: RegionGuideOptions | false;
    /** Returns the viewport to the full frame. Defaults to ['double-click']. */
    reset?: readonly InteractionResetGesture[];
}

export interface LongPressOptions {
    id?: string;
    holdMs?: number;
    dimOpacity?: number;
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

export interface DoubleActivateOptions {
    id?: string;
    dimOpacity?: number;
    /** Gestures that return this interaction to its neutral state. */
    reset?: readonly InteractionResetGesture[];
}

/** How long a gesture-driven viewport change animates, in milliseconds. */
export interface NavigationTransition {
    duration: number;
}

export interface NavigateOptions {
    id?: string;
    axes?: NavigationAxes | 'available';
    pan?: boolean;
    zoom?: boolean;
    wheelSensitivity?: number;
    domainGuard?: Partial<NavigationDomainGuard>;
    /** Returns the viewport to the full frame. Defaults to ['double-click']. */
    reset?: readonly NavigationResetGesture[];
    resetTransition?: NavigationTransition;
}

export interface DragReorderOptions {
    id?: string;
    /** The order is a setting, so nothing resets it unless this list says so. */
    reset?: readonly InteractionResetGesture[];
}

function asPreset(type: InteractionPresetType, definition: CanvasInteractionDef): CanvasInteractionDef {
    return { ...definition, preset: type };
}

/** Attaches the normalised reset list; presets that retain nothing never pass through here. */
function withReset(
    definition: CanvasInteractionDef,
    reset: readonly InteractionResetGesture[] | undefined,
    fallback: readonly InteractionResetGesture[],
): CanvasInteractionDef {
    return { ...definition, reset: normalizeResetGestures(reset, fallback) };
}

export function clickHighlight(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    return asPreset('click-highlight', withReset(createClickHighlightInteraction(options), options.reset, SELECTION_RESET));
}

export function axisHighlight(options: AxisHighlightOptions = {}): CanvasInteractionDef {
    return asPreset('axis-highlight', withReset(createAxisHighlightInteraction(options), options.reset, SELECTION_RESET));
}

export function clickGroupFocus(options: ClickGroupFocusOptions = {}): CanvasInteractionDef {
    return asPreset('click-group-focus', withReset(createClickGroupFocusInteraction({
        id: options.id ?? 'click-group-focus',
        dimOpacity: options.dimOpacity,
        groupBy: options.groupBy,
    }), options.reset, SELECTION_RESET));
}

export function clickAnnotate(options: ClickAnnotateOptions = {}): CanvasInteractionDef {
    return asPreset('click-annotate', withReset(createClickAnnotateInteraction(options), options.reset, SELECTION_RESET));
}

export function linkedBrush(options: LinkedBrushOptions): CanvasInteractionDef {
    return asPreset('linked-brush', withReset(createLinkedBrushInteraction(options), options.reset, SELECTION_RESET));
}

export function hoverGroupFocus(options: HoverGroupFocusOptions): CanvasInteractionDef {
    return asPreset('hover-group-focus', createHoverGroupFocusInteraction({ ...options, id: options.id ?? 'hover-group-focus' }));
}

export function select(options: SelectOptions = {}): CanvasInteractionDef {
    return asPreset('select', withReset(createSelectInteraction(options), options.reset, SELECTION_RESET));
}

export function lassoSelect(options: LassoSelectOptions = {}): CanvasInteractionDef {
    return asPreset('lasso-select', withReset(createLassoSelectInteraction(options), options.reset, SELECTION_RESET));
}

export function legendToggle(options: LegendToggleOptions = {}): CanvasInteractionDef {
    return asPreset('legend-toggle', withReset(createLegendToggleInteraction(options), options.reset, NO_RESET));
}

export function contextActivate(options: ContextActivateOptions = {}): CanvasInteractionDef {
    return asPreset('context-activate', createContextActivateInteraction(options));
}

export function inspect(options: InspectOptions = {}): CanvasInteractionDef {
    return asPreset('inspect', createInspectInteraction(options));
}

export function inspectIndex(options: InspectIndexOptions = {}): CanvasInteractionDef {
    return asPreset('inspect-index', withReset(createInspectIndexInteraction(options), options.reset, ['escape']));
}

export function brushZoom(options: BrushZoomOptions = {}): CanvasInteractionDef {
    return asPreset('brush-zoom', withReset(createBrushZoomInteraction(options), options.reset, ['double-click', 'escape']));
}

export function longPress(options: LongPressOptions = {}): CanvasInteractionDef {
    return asPreset('long-press', withReset(createLongPressInteraction(options), options.reset, SELECTION_RESET));
}

export function doubleActivate(options: DoubleActivateOptions = {}): CanvasInteractionDef {
    return asPreset('double-activate', withReset(createDoubleActivateInteraction(options), options.reset, SELECTION_RESET));
}

export function brushX(options: BrushOptions = {}): CanvasInteractionDef {
    return asPreset('brush-x', withReset(createBrushInteraction('x', options), options.reset, SELECTION_RESET));
}

export function brushY(options: BrushOptions = {}): CanvasInteractionDef {
    return asPreset('brush-y', withReset(createBrushInteraction('y', options), options.reset, SELECTION_RESET));
}

/** Select an angular interval on a polar chart. */
export function brushAngle(options: AngularBrushOptions = {}): CanvasInteractionDef {
    return asPreset('brush-angle', withReset(createAngularBrushInteraction(options), options.reset, SELECTION_RESET));
}

export function navigate(options: NavigateOptions = {}): CanvasInteractionDef {
    const definition = createNavigateInteraction(options);
    // Mirrors the trigger's normalised list.
    return asPreset('navigate', { ...definition, reset: definition.eventSource.reset ?? NAVIGATION_RESET });
}

export function dragReorder(options: DragReorderOptions = {}): CanvasInteractionDef {
    return asPreset('drag-reorder', withReset(createDragReorderInteraction(options), options.reset, NO_RESET));
}

export function normalizeInteractions(
    interactions: readonly InteractionDef[] | undefined,
): readonly InteractionDef[] {
    const normalized = [...(interactions ?? [])];
    const ids = new Set<string>();
    for (const interaction of normalized) {
        if (ids.has(interaction.id)) throw new Error(`Duplicate interaction id: "${interaction.id}".`);
        ids.add(interaction.id);
    }
    return normalized;
}