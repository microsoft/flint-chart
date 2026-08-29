export interface RenderHit {
    datum: Record<string, unknown>;
    endDatum?: Record<string, unknown>;
    source: 'mark' | 'legend-item';
    markType?: string;
    markName?: string;
    layerRole?: string;
}

export interface SemanticElement {
    key: Record<string, unknown>;
    value?: Record<string, unknown>;
    records?: readonly Record<string, unknown>[];
}

export interface SemanticTarget {
    visual: {
        kind: 'mark' | 'path' | 'region' | 'widget' | 'handle';
        role: string;
    };
    elements: readonly SemanticElement[];
}

export interface SemanticResolveEvent {
    gesture: 'click' | 'hover' | 'rectangle' | 'angular';
    role: string;
    hits: readonly RenderHit[];
    legendValue?: unknown;
    legendField?: string;
}

export interface SemanticResolveContext {
    allHits: readonly RenderHit[];
    keyField: string;
    categoryField?: string;
    seriesField?: string;
}

export type ChartInteractionResolver = (
    event: SemanticResolveEvent,
    context: SemanticResolveContext,
) => SemanticTarget | null;

export type UpdateDomain = readonly [unknown, unknown];

export interface SemanticTargetRef {
    visual: SemanticTarget['visual'];
    elements: readonly SemanticElement[];
}

export interface SemanticTargetSelector {
    select: {
        key: Record<string, unknown>;
        visual?: Partial<SemanticTarget['visual']>;
    };
}

export type UpdateTarget = SemanticTargetRef | SemanticTargetSelector;

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

export interface AnnotationConnectorAnchor {
    role: string;
    connection: AnnotationConnection;
    valueAxis?: 'x' | 'y';
}

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
    connectorAnchors?: readonly AnnotationConnectorAnchor[];
}

export interface AnnotationSpec {
    text?: string;
    candidates?: readonly AnnotationCandidate[];
    subject?: Partial<SemanticTarget['visual']>;
}

export interface PresentationSpec {
    visible?: boolean;
    opacity?: number;
    stroke?: string;
    strokeWidth?: number;
    state?: 'normal' | 'focused' | 'emphasized' | 'muted';
    mutedOpacity?: number;
}

export type ChartUpdateOp =
    | {
        op: 'set-presentation';
        targets: readonly UpdateTarget[];
        value: PresentationSpec;
    }
    | {
        op: 'set-annotation';
        target: UpdateTarget;
        value: AnnotationSpec | null;
    }
    | {
        op: 'set-viewport';
        axes: 'x' | 'y' | 'xy';
        value: { x?: UpdateDomain; y?: UpdateDomain };
    }
    | {
        op: 'set-order';
        scope: 'category' | 'series' | 'facet';
        field: string;
        values: readonly unknown[];
    };

export interface ChartUpdate {
    id: string;
    ops: readonly ChartUpdateOp[];
}

export interface NavigationDomainGuard {
    minVisibleFraction: number;
    maxVisibleFraction: number;
    overscrollFraction: number;
}

export interface NavigationRequest {
    type?: 'navigation';
    phase: 'start' | 'preview' | 'commit' | 'cancel';
    operation: 'pan' | 'zoom' | 'reset';
    axes: 'x' | 'y' | 'xy';
    delta?: { x: number; y: number };
    factor?: number;
    anchor?: { x: number; y: number };
}

export type NavigationUpdate = Extract<ChartUpdateOp, { op: 'set-viewport' }>;

export interface InteractionContext {
    readonly chartType: string;
    readonly selected: readonly SemanticElement[];
    readonly available?: readonly SemanticElement[];
    readonly resolveGroupValue?: (element: SemanticElement) => unknown;
    readonly resolveNavigation?: (
        request: NavigationRequest,
        guard: NavigationDomainGuard,
    ) => NavigationUpdate | null;
    readonly categoryField?: string;
    readonly seriesField?: string;
    readonly categoryAxis?: 'x' | 'y';
    readonly categoryOrder?: readonly unknown[];
    readonly reorderAxes?: readonly {
        axis: 'x' | 'y';
        field: string;
        order: readonly unknown[];
    }[];
}

export type ChartUpdatePresenter = (
    update: ChartUpdate,
    context: InteractionContext,
) => ChartUpdate;