import type {
    ChartUpdate,
    InteractionContext,
    NavigationDomainGuard,
    SemanticElement,
} from '../core/interaction-contracts';
import type { InteractionEventSource } from './triggers';
import type {
    NavigationAxes,
} from './language/events';
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
    PresentationSpec,
    SemanticTargetRef,
    SemanticTargetSelector,
    UpdateDomain,
    UpdateTarget,
} from './language/updates';

export interface CanvasInteractionDef {
    readonly id: string;
    readonly eventSource: InteractionEventSource;
    readonly navigationDomainGuard?: NavigationDomainGuard;
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

export function clickHighlight(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    return createClickHighlightInteraction(options);
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