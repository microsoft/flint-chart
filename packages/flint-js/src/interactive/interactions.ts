import type { RenderHit, SemanticElement, SemanticTarget } from '../core/interaction-semantics';
import type { InteractionEventSource } from './triggers';
import type {
    ExternalInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    PlotPoint,
    SemanticInteractionEvent,
} from './triggers/events';
import {
    ClickAnnotateInteraction,
    ClickGroupHighlightInteraction,
    ClickHighlightInteraction,
    SelectInteraction,
} from './presets';
export type { RenderHit, SemanticElement, SemanticTarget } from '../core/interaction-semantics';

export type InteractionInput<TPayload = unknown> =
    | SemanticInteractionEvent
    | ExternalInteractionEvent<TPayload>;

export interface FlintInteractionEventDetail {
    chartId: string;
    interactionId: string;
    timestamp: number;
    transactionId?: string;
    event: SemanticInteractionEvent;
}

export type {
    ElementInteractionEvent,
    ExternalInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    NormalizedInteractionEvent,
    PlotPoint,
    PlotPolygon,
    PlotRect,
    RegionInteractionEvent,
    SemanticInteractionEvent,
} from './triggers/events';

export type SelectionMode = 'replace' | 'toggle';

export interface AnnotationRenderPlan {
    text: string;
    placement?: 'auto' | 'above' | 'below' | 'left' | 'right';
    anchor?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'mark-end' | 'arc-centroid';
}

export type UpdateOp =
    | { op: 'emphasize'; elements: readonly SemanticElement[]; mode: SelectionMode; dimOpacity: number }
    | { op: 'annotate'; element: SemanticElement; text: string; point?: PlotPoint }
    | { op: 'render-annotation'; element: SemanticElement; point?: PlotPoint; annotation: AnnotationRenderPlan }
    | { op: 'clear-annotation' }
    | { op: 'reset' };

export interface ChartUpdate {
    phase?: InteractionPhase;
    ops: readonly UpdateOp[];
}

export type ChartUpdateProcessor = (
    update: ChartUpdate,
    context: InteractionContext,
) => ChartUpdate;

export interface InteractionContext {
    readonly chartType: string;
    readonly selected: readonly SemanticElement[];
    readonly available?: readonly SemanticElement[];
    readonly categoryField?: string;
    readonly seriesField?: string;
}

export interface InteractionDef<TPayload = unknown> {
    readonly id: string;
    readonly eventSource: InteractionEventSource;
    actOn?(target: SemanticTarget | null, context: InteractionContext): SemanticTarget | null;
    update(event: InteractionInput<TPayload>, context: InteractionContext): ChartUpdate | null;
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

export function clickHighlight(options: ClickHighlightOptions = {}): InteractionDef {
    return new ClickHighlightInteraction(options);
}

export function clickGroupHighlight(options: ClickGroupHighlightOptions = {}): InteractionDef {
    return new ClickGroupHighlightInteraction(options);
}

export function clickAnnotate(options: ClickAnnotateOptions = {}): InteractionDef {
    return new ClickAnnotateInteraction(options);
}

export function select(options: SelectOptions = {}): InteractionDef {
    return new SelectInteraction(options);
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