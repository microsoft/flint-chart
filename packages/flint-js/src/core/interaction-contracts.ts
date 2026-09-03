export interface RenderHit {
    /** Backend render datum used while resolving physical hits; not semantic identity. */
    datum: Record<string, unknown>;
    endDatum?: Record<string, unknown>;
    /** All renderer datums in the same line/area path, when available. */
    pathData?: readonly Record<string, unknown>[];
    source: 'mark' | 'legend-item';
    markType?: string;
    markName?: string;
    layerRole?: string;
}

/**
 * Backend-independent meaning and provenance of one resolved chart element.
 * Consumers should reason from `value` and `records`, never from renderer metadata.
 * Exact render lookup belongs to the backend and may map one element to many primitives.
 */
export interface SemanticElement {
    /** Values represented by the mark's channels, or by a semantic control such as a legend item. */
    value: Record<string, unknown>;
    /** Contributing input records when provenance is available; zero or many may support one value. */
    records?: readonly Record<string, unknown>[];
}

export type LegendDomain =
    | { kind: 'value'; value: unknown }
    | { kind: 'interval'; start?: number; end?: number };

export interface LegendTargetValue extends Record<string, unknown> {
    channel?: string;
    field?: string;
    domain: LegendDomain;
}

    export interface AxisTargetValue extends Record<string, unknown> {
        axis: 'x' | 'y';
        field: string;
        value: unknown;
    }

/** A semantic subject: its visual role plus represented values and provenance. */
export interface SemanticTarget {
    visual: {
        kind: 'mark' | 'path' | 'region' | 'widget' | 'handle' | 'legend' | 'axis';
        role: string;
    };
    elements: readonly SemanticElement[];
}

export interface SemanticResolveEvent {
    gesture: 'click' | 'hover' | 'rectangle' | 'angular';
    role: string;
    hits: readonly RenderHit[];
    legend?: LegendTargetValue;
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

export interface StyleSpec {
    visible?: boolean;
    opacity?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    state?: 'normal' | 'focused' | 'emphasized' | 'muted';
    mutedOpacity?: number;
}

export interface OverlayStyleSpec {
    fill?: string;
    fillOpacity?: number;
    stroke?: string;
    strokeWidth?: number;
    strokeDash?: readonly number[];
    opacity?: number;
    pointRadius?: number;
    fontSize?: number;
    fontWeight?: number | 'normal' | 'bold';
    textAlign?: 'start' | 'middle' | 'end';
    dx?: number;
    dy?: number;
}

export type OverlayMark = 'line' | 'point' | 'rule' | 'rect' | 'text';

export interface OverlayFieldEncoding {
    field: string;
}

/** A retained visual projected through an existing plot's scales. */
export interface ChartOverlaySpec {
    mark: OverlayMark;
    data: { values: readonly Record<string, unknown>[] };
    encodings: {
        x: OverlayFieldEncoding;
        y: OverlayFieldEncoding;
        x2?: OverlayFieldEncoding;
        y2?: OverlayFieldEncoding;
        order?: OverlayFieldEncoding;
        color?: OverlayFieldEncoding;
        text?: OverlayFieldEncoding;
    };
    role: string;
    interactive?: boolean;
    projectable?: boolean;
    style?: OverlayStyleSpec;
}

export type ChartUpdateOp =
    | {
        op: 'set-style';
        targets: readonly UpdateTarget[];
        value: StyleSpec;
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
    }
    | {
        op: 'set-overlay';
        name: string;
        value: ChartOverlaySpec | null;
    }
    | {
        op: 'set-data';
        source: 'main';
        value: { rows: readonly Record<string, unknown>[] };
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
    readonly legendDomains?: Readonly<Record<string, readonly unknown[]>>;
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