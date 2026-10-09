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
        kind: 'mark' | 'path' | 'region' | 'widget' | 'handle' | 'legend' | 'axis' | 'chart' | 'title' | 'header';
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

/** Names a region of a multi-level projected chart by the row fields that identify it. */
export interface UpdateRegionSelector {
    key: Record<string, unknown>;
}

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

/**
 * A retained visual projected through an existing plot's scales. A rule with
 * only `x` or only `y`, and a rect with only `x`/`x2` or only `y`/`y2`, span
 * the plot along the other axis.
 */
export interface ChartOverlaySpec {
    mark: OverlayMark;
    data: { values: readonly Record<string, unknown>[] };
    encodings: {
        x?: OverlayFieldEncoding;
        y?: OverlayFieldEncoding;
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

export interface FreeformOverlayTransform {
    translate?: { x: number; y: number };
    scale?: number | { x: number; y: number };
    rotate?: number;
}

/** SVG markup is serializable; SVGElement supports local application components. */
export interface FreeformSvgBody {
    type: 'svg';
    content: string | SVGElement;
    transform?: FreeformOverlayTransform;
}

export interface FreeformCloneBody {
    type: 'clone';
    targets: readonly UpdateTarget[];
    transform?: FreeformOverlayTransform;
    opacity?: number;
}

export type FreeformOverlayBody =
    | FreeformSvgBody
    | FreeformCloneBody;

/** Named renderer-space presentation, separate from data/scale overlays. */
export interface FreeformOverlaySpec {
    coordinateSpace: 'plot' | 'renderer';
    body: readonly FreeformOverlayBody[];
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
        /** A box on each axis, or a region of a multi-level projected chart to frame. */
        value: { x?: UpdateDomain; y?: UpdateDomain; region?: UpdateRegionSelector };
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
        op: 'set-freeform-overlay';
        name: string;
        value: FreeformOverlaySpec | null;
    }
    | {
        op: 'set-data';
        source: 'main';
        value: { rows: readonly Record<string, unknown>[] };
    };

export const CHART_UPDATE_OPS = [
    'set-style',
    'set-annotation',
    'set-viewport',
    'set-order',
    'set-overlay',
    'set-freeform-overlay',
    'set-data',
] as const satisfies readonly ChartUpdateOp['op'][];

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

export type DomainCoordinate =
    | { kind: 'value'; value: unknown }
    | { kind: 'interval'; start: unknown; end: unknown };

export interface DomainPoint {
    x?: unknown;
    y?: unknown;
}

export interface DomainGeometry {
    x?: DomainCoordinate;
    y?: DomainCoordinate;
    points?: readonly DomainPoint[];
    /** The detail level a multi-level projected chart draws for this viewport. */
    level?: string;
    /**
     * On a multi-level projected chart, the coarsest-level region under the
     * plot centre: its feature id and properties plus the joined row fields.
     */
    focus?: Record<string, unknown>;
}

/** The marks one retained or preview update emphasizes. */
export interface ChartStateEntry {
    readonly layer: 'retained' | 'preview';
    readonly elements: readonly SemanticElement[];
}

/** A legend value a toggle hides. */
export interface ChartHiddenValue {
    readonly channel: string;
    readonly value: unknown;
}

/** The slice of a category axis a rail shows. */
export interface ChartCategoryWindow {
    readonly start: number;
    readonly count: number;
    readonly total: number;
}

/** A note an update places on the chart, by the id of that update. */
export interface ChartAnnotation {
    readonly id: string;
    readonly target: UpdateTarget;
    readonly text?: string;
}

/**
 * One field's filter: the values a reader keeps (`in`), or an inclusive range (`range`)
 * whose ends compare as numbers or dates.
 */
export type FilterValue =
    | { readonly in: readonly unknown[] }
    | { readonly range: readonly [unknown, unknown] };

/** What the chart shows now, in semantic terms. A host reads it; a preset reads its superset. */
export interface ChartState {
    readonly chartType: string;
    /** The marks the chart emphasizes or focuses now, previews included. */
    readonly selected: readonly SemanticElement[];
    /** The emphasized marks of each update, by update id; `selected` is their union. */
    readonly entries?: ReadonlyMap<string, ChartStateEntry>;
    /** The legend values a toggle hides now. */
    readonly hidden?: readonly ChartHiddenValue[];
    /** The domain the plot shows now, when the chart navigates. */
    readonly viewport?: DomainGeometry;
    /** The category window of each rail. */
    readonly windows?: Partial<Record<'x' | 'y', ChartCategoryWindow>>;
    readonly categoryOrder?: readonly unknown[];
    /** The notes the chart shows now, previews included. */
    readonly annotations?: readonly ChartAnnotation[];
    /** The active filter of each field, set by filter controls; absent fields show every value. */
    readonly filters?: Readonly<Record<string, FilterValue>>;
}

export interface InteractionContext extends ChartState {
    /** Every drawn mark; the scene is scanned on first read. */
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