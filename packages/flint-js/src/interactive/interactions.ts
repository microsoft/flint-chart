import type { SemanticElement, SemanticTarget } from '../core/interaction-semantics';
import type { InteractionEventSource } from './triggers';
import type {
    InteractionPhase,
    NavigationAxes,
    PlotPoint,
} from './triggers/events';
import {
    createBrushInteraction,
    createAngularBrushInteraction,
    createClickAnnotateInteraction,
    createClickGroupHighlightInteraction,
    createClickHighlightInteraction,
    createSelectInteraction,
    createNavigateInteraction,
    createDragReorderInteraction,
} from './presets';
import type { CanvasInteractionEvent } from './canvas-interaction';
export type { RenderHit, SemanticElement, SemanticTarget } from '../core/interaction-semantics';
export type ChartUpdateRequest = import('./updates/request').ChartUpdateRequest;

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
} from './canvas-interaction';

export type {
    ElementInteractionEvent,
    ExternalInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    NavigationAxes,
    NavigationInteractionEvent,
    NavigationOperation,
    NormalizedInteractionEvent,
    PlotPoint,
    PlotAngularSector,
    PlotPolygon,
    PlotRect,
    RegionAxis,
    RegionOperation,
    RegionInteractionEvent,
    SemanticInteractionEvent,
} from './triggers/events';

export type SelectionMode = 'replace' | 'toggle';

export type AnnotationConnection =
    | 'center'
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | 'value-end'
    | 'value-side'
    | 'segment-midpoint'
    | 'radial-midpoint'
    | 'outer-radial';

export interface AnnotationCandidate {
    connection: AnnotationConnection;
    valueAxis?: 'x' | 'y';
    crossSide?: 'start' | 'end';
    valueInset?: number;
    anglePreference?: 'normal' | 'oblique';
    textAlign?: 'left' | 'center' | 'right';
    connector?: 'line' | 'none';
    maxWidth?: number;
    maxDistance?: number;
    priority?: number;
}

export interface AnnotationRenderPlan {
    text: string;
    candidates: readonly AnnotationCandidate[];
    subject?: Partial<SemanticTarget['visual']>;
    markType?: string;
}

export interface NavigationDomainGuard {
    minVisibleFraction: number;
    maxVisibleFraction: number;
    overscrollFraction: number;
}

export type UpdateOp =
    | { op: 'emphasize'; elements: readonly SemanticElement[]; mode: SelectionMode; dimOpacity: number }
    | { op: 'annotate'; element: SemanticElement; visual?: Partial<SemanticTarget['visual']>; text?: string }
    | { op: 'render-annotation'; element: SemanticElement; annotation: AnnotationRenderPlan }
    | { op: 'clear-annotation' }
    | {
        op: 'navigate-viewport';
        phase: InteractionPhase;
        operation: import('./triggers/events').NavigationOperation;
        axes: NavigationAxes;
        delta?: PlotPoint;
        factor?: number;
        anchor?: PlotPoint;
        domainGuard: NavigationDomainGuard;
    }
    | { op: 'reorder-category'; axis: 'x' | 'y'; field: string; orderedValues: readonly unknown[] }
    | { op: 'reset' };

export interface ChartUpdate {
    phase?: InteractionPhase;
    ops: readonly UpdateOp[];
}

export type ChartUpdatePresenter = (
    update: ChartUpdate,
    context: InteractionContext,
) => ChartUpdate;

export interface InteractionContext {
    readonly chartType: string;
    readonly selected: readonly SemanticElement[];
    readonly available?: readonly SemanticElement[];
    readonly categoryField?: string;
    readonly seriesField?: string;
    readonly categoryAxis?: 'x' | 'y';
    /** Current rendered order for the active category axis. */
    readonly categoryOrder?: readonly unknown[];
    readonly reorderAxes?: readonly {
        axis: 'x' | 'y';
        field: string;
        order: readonly unknown[];
    }[];
}

export interface InteractionDef {
    readonly id: string;
    readonly eventSource: InteractionEventSource;
    handle?(event: CanvasInteractionEvent, context: InteractionContext): ChartUpdateRequest | null;
}

export interface ClickHighlightOptions {
    id?: string;
    dimOpacity?: number;
}

export interface ClickGroupHighlightOptions extends ClickHighlightOptions {
    groupBy?: string | ((element: SemanticElement, context: InteractionContext) => unknown);
}

export interface ClickAnnotateOptions extends ClickHighlightOptions {
    format?: (element: SemanticElement, context: InteractionContext) => string;
}

export interface SelectOptions {
    id?: string;
    match?: 'intersect' | 'contain';
    dimOpacity?: number;
}

export interface BrushOptions extends SelectOptions {
    mode?: 'ephemeral' | 'stateful';
}

export type AngularBrushOptions = SelectOptions;

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

export function clickHighlight(options: ClickHighlightOptions = {}): InteractionDef {
    return createClickHighlightInteraction(options);
}

export function clickGroupHighlight(options: ClickGroupHighlightOptions = {}): InteractionDef {
    return createClickGroupHighlightInteraction(options);
}

export function clickAnnotate(options: ClickAnnotateOptions = {}): InteractionDef {
    return createClickAnnotateInteraction(options);
}

export function select(options: SelectOptions = {}): InteractionDef {
    return createSelectInteraction(options);
}

export function brushX(options: BrushOptions = {}): InteractionDef {
    return createBrushInteraction('x', options);
}

export function brushY(options: BrushOptions = {}): InteractionDef {
    return createBrushInteraction('y', options);
}

export function brushAngle(options: AngularBrushOptions = {}): InteractionDef {
    return createAngularBrushInteraction(options);
}

export function navigate(options: NavigateOptions = {}): InteractionDef {
    return createNavigateInteraction(options);
}

export function dragReorder(options: DragReorderOptions = {}): InteractionDef {
    return createDragReorderInteraction(options);
}

export function normalizeInteractions(
    interactions: readonly InteractionDef[] | undefined,
    focusOnClick: boolean | undefined,
): readonly InteractionDef[] {
    const normalized = [...(interactions ?? [])];
    if (focusOnClick === true && !normalized.some((interaction) => interaction.id === 'click-highlight')) {
        normalized.push(clickHighlight());
    }
    const ids = new Set<string>();
    for (const interaction of normalized) {
        if (ids.has(interaction.id)) throw new Error(`Duplicate interaction id: "${interaction.id}".`);
        ids.add(interaction.id);
    }
    return normalized;
}