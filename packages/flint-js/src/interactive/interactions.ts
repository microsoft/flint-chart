import type {
    ChartUpdate,
    InteractionContext,
    NavigationDomainGuard,
    SemanticElement,
    SemanticTargetSelector,
} from '../core/interaction-contracts';
import type { InteractionEventSource } from './triggers';
import type { InspectMode } from './triggers';
import type { InspectGuideOptions, RegionGuideOptions } from './guides';
import type {
    NavigationAxes,
} from './language/events';
import {
    createBrushInteraction,
    createBrushZoomInteraction,
    createAngularBrushInteraction,
    createAxisHighlightInteraction,
    createClickAnnotateInteraction,
    createClickGroupHighlightInteraction,
    createClickHighlightInteraction,
    createContextActivateInteraction,
    createDoubleActivateInteraction,
    createInspectInteraction,
    createLongPressInteraction,
    createLassoSelectInteraction,
    createLegendToggleInteraction,
    createSelectInteraction,
    createNavigateInteraction,
    createDragReorderInteraction,
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
    ChartUpdate,
    ChartUpdateOp,
    StyleSpec,
    SemanticTargetRef,
    SemanticTargetSelector,
    UpdateDomain,
    UpdateTarget,
} from './language/updates';

export interface CanvasInteractionDef {
    readonly id: string;
    readonly eventSource: InteractionEventSource;
    readonly navigationDomainGuard?: NavigationDomainGuard;
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

export interface ClickHighlightOptions {
    id?: string;
    dimOpacity?: number;
    /** Whether legend activation focuses the represented series. Defaults to true. */
    legend?: boolean;
}

export interface AxisHighlightOptions {
    id?: string;
    axis?: 'x' | 'y';
    event?: 'hover' | 'click';
    dimOpacity?: number;
}

export interface ClickGroupHighlightOptions extends ClickHighlightOptions {
    groupBy?: string | ((element: SemanticElement, context: InteractionContext) => unknown);
}

export interface ClickAnnotateOptions {
    id?: string;
    dimOpacity?: number;
    format?: (element: SemanticElement, context: InteractionContext) => string;
}

export interface SelectOptions {
    id?: string;
    match?: 'intersect' | 'contain';
    dimOpacity?: number;
    /** Transient region shown during the gesture; false disables visual feedback. */
    guide?: RegionGuideOptions | false;
}

export interface BrushOptions extends SelectOptions {
    mode?: 'ephemeral' | 'stateful';
}

export type AngularBrushOptions = SelectOptions & { mode?: 'ephemeral' | 'stateful' };

export type LassoSelectOptions = SelectOptions;

export interface LegendToggleOptions {
    id?: string;
    mutedOpacity?: number;
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

export interface BrushZoomOptions {
    id?: string;
    axes?: 'x' | 'y' | 'xy';
    guide?: RegionGuideOptions | false;
}

export interface LongPressOptions {
    id?: string;
    holdMs?: number;
    dimOpacity?: number;
}

export interface DoubleActivateOptions {
    id?: string;
    dimOpacity?: number;
}

export interface NavigateOptions {
    id?: string;
    axes?: NavigationAxes | 'available';
    pan?: boolean;
    zoom?: boolean;
    wheelSensitivity?: number;
    domainGuard?: Partial<NavigationDomainGuard>;
}

export interface DragReorderOptions {
    id?: string;
}

export function clickHighlight(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    return createClickHighlightInteraction(options);
}

export function axisHighlight(options: AxisHighlightOptions = {}): CanvasInteractionDef {
    return createAxisHighlightInteraction(options);
}

export function clickGroupHighlight(options: ClickGroupHighlightOptions = {}): CanvasInteractionDef {
    return createClickGroupHighlightInteraction(options);
}

export function clickAnnotate(options: ClickAnnotateOptions = {}): CanvasInteractionDef {
    return createClickAnnotateInteraction(options);
}

export function select(options: SelectOptions = {}): CanvasInteractionDef {
    return createSelectInteraction(options);
}

export function lassoSelect(options: LassoSelectOptions = {}): CanvasInteractionDef {
    return createLassoSelectInteraction(options);
}

export function legendToggle(options: LegendToggleOptions = {}): CanvasInteractionDef {
    return createLegendToggleInteraction(options);
}

export function contextActivate(options: ContextActivateOptions = {}): CanvasInteractionDef {
    return createContextActivateInteraction(options);
}

export function inspect(options: InspectOptions = {}): CanvasInteractionDef {
    return createInspectInteraction(options);
}

export function brushZoom(options: BrushZoomOptions = {}): CanvasInteractionDef {
    return createBrushZoomInteraction(options);
}

export function longPress(options: LongPressOptions = {}): CanvasInteractionDef {
    return createLongPressInteraction(options);
}

export function doubleActivate(options: DoubleActivateOptions = {}): CanvasInteractionDef {
    return createDoubleActivateInteraction(options);
}

export function brushX(options: BrushOptions = {}): CanvasInteractionDef {
    return createBrushInteraction('x', options);
}

export function brushY(options: BrushOptions = {}): CanvasInteractionDef {
    return createBrushInteraction('y', options);
}

export function brushAngle(options: AngularBrushOptions = {}): CanvasInteractionDef {
    return createAngularBrushInteraction(options);
}

export function navigate(options: NavigateOptions = {}): CanvasInteractionDef {
    return createNavigateInteraction(options);
}

export function dragReorder(options: DragReorderOptions = {}): CanvasInteractionDef {
    return createDragReorderInteraction(options);
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