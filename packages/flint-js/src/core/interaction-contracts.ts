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
    /** The entry's value on a reader's hit; read `domain`, which every legend target carries. */
    value?: unknown;
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

/**
 * Marks named by their values. `key` names one combination, each field equal to its value;
 * `where` describes a set, each field `in` a list or within a `range`, and every field must hold.
 * Ops that act on one mark (a note, an order) take a key; set-style takes either.
 */
export type SemanticTargetSelector =
    | { select: { key: Record<string, unknown>; visual?: Partial<SemanticTarget['visual']> } }
    | { select: { where: Record<string, FilterValue>; visual?: Partial<SemanticTarget['visual']> } };

export type UpdateTarget = SemanticTargetRef | SemanticTargetSelector;

/**
 * Where on its mark a template's note may name it: the centre, a side, a bar's value end or side, the
 * middle of a stretch of a line or area, a slice's middle or rim. A template offers these through
 * {@link AnnotationCandidate}s; the caption is placed from the first one.
 */
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

/** @deprecated Ignored: a note names one mark, and its caption draws one leader. */
export interface AnnotationConnectorAnchor {
    role: string;
    connection: AnnotationConnection;
    valueAxis?: 'x' | 'y';
}

/** How a template's notes connect to its marks, set by its presenter rather than by an update. */
export interface AnnotationCandidate {
    connection: AnnotationConnection;
    valueAxis?: 'x' | 'y';
    crossSide?: 'start' | 'end';
    valueInset?: number;
    /** `'none'` never draws a leader. */
    connector?: 'line' | 'none';
    /** The width the caption wraps to, in px. */
    maxWidth?: number;
    /** @deprecated Ignored since notes are set as captions: the placer weighs every side. */
    anglePreference?: 'normal' | 'oblique';
    /** @deprecated Ignored: a caption's lines align toward its mark. */
    textAlign?: 'left' | 'center' | 'right';
    /** @deprecated Ignored: the placer weighs how far a caption stands from its mark. */
    maxDistance?: number;
    /** @deprecated Ignored: the caption is placed from the first candidate. */
    priority?: number;
    /** @deprecated Ignored: a note names one mark, and its caption draws one leader. */
    connectorAnchors?: readonly AnnotationConnectorAnchor[];
}

/**
 * A caption on one mark, after Blabber's `text`: words beside the mark, haloed in the page, with a
 * leader only where the caption is not plainly beside it. A card, a callout box or any other
 * styled note is a `set-overlay` or `set-freeform-overlay`.
 */
export interface AnnotationSpec {
    text?: string;
    /**
     * On a line or area, `segment` (the default) marks the segment that starts
     * at the row; `point` marks the row's own point. The last point of a line
     * starts no segment and is always marked at its point.
     */
    anchor?: 'segment' | 'point';
    /**
     * How a note marks what it names: `'none'` leaves it as drawn; `'light'` (the default) lifts a
     * dot above its neighbours with a halo, draws a stretch of a line or area again in its ink, and
     * faintly outlines a bar, a cell or a slice; `'strong'` adds a ring round a dot and a full
     * outline; `'exclusive'` is strong and recedes every other mark, as `set-style` `emphasized` does.
     */
    highlight?: 'none' | 'light' | 'strong' | 'exclusive';
    /**
     * The caption's type, over the theme's: size in px, weight, ink. Omitted, a note takes the
     * theme's `type.annotation` role, else the axis labels' face and weight a size up in the primary ink.
     */
    style?: NoteTextStyle;
    /** The ring or outline's paint for this note, over the theme's `interaction.highlight`. */
    highlightStyle?: HighlightStyle;
}

/** A ring's or an outline's paint where one update sets its own. */
export interface HighlightStyle {
    color?: string;
    /** Stroke width in px of the strong ring or outline; the light one is drawn a little thinner. */
    width?: number;
}

/** A caption's type where one note sets its own. */
export interface NoteTextStyle {
    fontSize?: number;
    fontWeight?: number | 'normal' | 'bold';
    color?: string;
}

/**
 * A note as a template's presenter hands it to the renderer: the update's {@link AnnotationSpec},
 * with where on the mark it may connect and what kind of mark it names. Not part of an update.
 */
export interface PresentedAnnotationSpec extends AnnotationSpec {
    candidates?: readonly AnnotationCandidate[];
    subject?: Partial<SemanticTarget['visual']>;
}

/**
 * A shaded stretch of the plot, after Blabber's `region`. One axis shades a band across the plot,
 * both a box. On a continuous axis a stretch is two bounds, either of which may be `null` (open: the
 * plot's end on that side); on a banded axis it is the categories it covers, which must be next to
 * each other. The caption is set on the stretch it names, inside where it fits clear of the data,
 * else outside it with a leader.
 */
export interface RegionAnnotationSpec {
    x?: readonly unknown[];
    y?: readonly unknown[];
    /**
     * On a map, the region's box in degrees, `[west, east]` and `[south, north]`, in place of `x`
     * and `y`: its edges follow the meridians and parallels as the map's projection draws them.
     * Both are needed; a west edge east of the east edge runs across the antimeridian.
     */
    longitude?: readonly [number, number];
    latitude?: readonly [number, number];
    text?: string;
    /** The wash's colour; by default a muted one distinct from the marks and the other regions. */
    color?: string;
    /** The wash's opacity; 0.16 by default, 0.18 over an area chart. */
    opacity?: number;
    /** `under` (the default) reads beneath the marks; `over` washes over them, as on an area chart. */
    layer?: 'under' | 'over';
    /**
     * Where the caption stands: `top`, `bottom`, `left`, `right`, `center` within the region, `above`
     * or `below` it, just past its edge (past the plot for a stretch of x, which spans the plot's
     * height). A region too small for its caption where asked has it placed where it fits. Left out,
     * the clearest place is chosen.
     */
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'above' | 'below';
}

/**
 * An outline round sets of marks, after Blabber's `enclose`. Each target is one group, outlined on
 * its own; all of them share the caption. Bars, cells and stacks default to a `rect`, other marks to
 * a `hull`.
 */
export interface EnclosureAnnotationSpec {
    targets: readonly UpdateTarget[];
    text?: string;
    shape?: 'hull' | 'rect' | 'ellipse' | 'circle';
    /**
     * Leaders from the shared caption to the outlines: `auto` (the default) draws one to each of two
     * or three outlines and none for one or more than three; `all` and `none` say so outright.
     */
    connect?: 'auto' | 'all' | 'none';
    /** The outline's, its caption's and its leaders' colour; by default the theme's `interaction.highlight`, else one that reads on the marks and the page. */
    color?: string;
    /** The outline's stroke width in px; by default the theme's, else 1.5. */
    width?: number;
}

export interface StyleSpec {
    visible?: boolean;
    opacity?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    /**
     * `emphasized` and `focused` recede everything else; `emphasis` says how far. `highlighted` gives
     * the targets their mark's hover cue and leaves the rest as drawn.
     */
    state?: 'normal' | 'focused' | 'emphasized' | 'highlighted' | 'muted';
    /**
     * How far the rest recede when the targets are emphasized, as a note's `highlight`: `'light'`
     * (the default; the rest keep 0.6 of their opacity and stay readable), `'strong'` (0.35) or
     * `'exclusive'` (0.2, only the targets read). Their value labels stay legible: they recede less
     * and take the page's ink. `mutedOpacity` states the receded opacity outright.
     */
    emphasis?: 'light' | 'strong' | 'exclusive';
    mutedOpacity?: number;
}

/** The opacity each emphasis level recedes the other marks to. */
export const EMPHASIS_OPACITY = { light: 0.6, strong: 0.35, exclusive: 0.2 } as const;

export interface OverlayStyleSpec {
    fill?: string;
    fillOpacity?: number;
    /** On text, the halo behind the glyphs: the chart's background by default, `'none'` for no halo. */
    stroke?: string;
    strokeWidth?: number;
    /** Dash and gap lengths in px, or a word: `'dash'` (`'dashed'`) or `'dot'` (`'dotted'`). */
    strokeDash?: readonly number[] | 'dash' | 'dashed' | 'dot' | 'dotted';
    opacity?: number;
    pointRadius?: number;
    fontSize?: number;
    fontWeight?: number | 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
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
 *
 * On a map, `longitude` and `latitude` place it through the map's projection
 * instead, as it is panned, zoomed or turned: a point or a text at a place, a
 * line through places in order along great circles, a rule from one place
 * (`longitude`, `latitude`) to another (`longitude2`, `latitude2`), a rect over
 * the box between them, its edges along meridians and parallels.
 */
export interface ChartOverlaySpec {
    mark: OverlayMark;
    data: { values: readonly Record<string, unknown>[] };
    encodings: {
        x?: OverlayFieldEncoding;
        y?: OverlayFieldEncoding;
        x2?: OverlayFieldEncoding;
        y2?: OverlayFieldEncoding;
        longitude?: OverlayFieldEncoding;
        latitude?: OverlayFieldEncoding;
        longitude2?: OverlayFieldEncoding;
        latitude2?: OverlayFieldEncoding;
        order?: OverlayFieldEncoding;
        color?: OverlayFieldEncoding;
        text?: OverlayFieldEncoding;
    };
    role: string;
    interactive?: boolean;
    projectable?: boolean;
    style?: OverlayStyleSpec;
    /**
     * `over` (the default) draws the overlay above the chart's marks; `under` reads beneath them: a map
     * line or rule is cut away wherever the chart draws a mark (a route, its heads, a stop) on it, so a
     * reference — the direct way home beside the route taken — stays in the background. Under needs the
     * SVG renderer; on canvas it is drawn over.
     */
    layer?: 'under' | 'over';
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
        /** A caption on one mark, after Blabber's `text`. */
        op: 'annotate-text';
        target: UpdateTarget;
        value: AnnotationSpec | null;
    }
    | {
        /**
         * @deprecated Use `annotate-text`, which this older name means. Still read in 1.x, with a
         * validation warning; removed in 2.0.
         */
        op: 'set-annotation';
        target: UpdateTarget;
        value: AnnotationSpec | null;
    }
    | {
        op: 'annotate-region';
        /** Names the region, so several stand together and each clears on its own (`value: null`). */
        name: string;
        value: RegionAnnotationSpec | null;
    }
    | {
        op: 'annotate-enclosure';
        /** Names the enclosure, so several stand together and each clears on its own (`value: null`). */
        name: string;
        value: EnclosureAnnotationSpec | null;
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

/** The ops a chart update may name. */
export const CHART_UPDATE_OPS = [
    'set-style',
    'annotate-text',
    'annotate-region',
    'annotate-enclosure',
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

/**
 * Older op names still read, each with the op it means. Each is accepted with a warning and will be
 * removed in the next major version.
 */
export const DEPRECATED_UPDATE_OPS = {
    'set-annotation': 'annotate-text',
} as const satisfies Partial<Record<ChartUpdateOp['op'], ChartUpdateOp['op']>>;

/** Whether an op name is one of {@link DEPRECATED_UPDATE_OPS}. */
export function isDeprecatedUpdateOp(name: string): name is keyof typeof DEPRECATED_UPDATE_OPS {
    return Object.prototype.hasOwnProperty.call(DEPRECATED_UPDATE_OPS, name);
}

export type TextAnnotationOp = Extract<ChartUpdateOp, { op: 'annotate-text' }>;

let warnedDeprecatedOp = false;

/**
 * An op as the runtime reads it: `set-annotation` is `annotate-text` by its deprecated name. The
 * first deprecated op a page reads is reported once on the console.
 */
export function canonicalUpdateOp(op: ChartUpdateOp): ChartUpdateOp {
    if (op.op !== 'set-annotation') return op;
    if (!warnedDeprecatedOp && typeof console !== 'undefined') {
        warnedDeprecatedOp = true;
        console.warn('[flint] The ChartUpdate op "set-annotation" is deprecated and will be removed in 2.0; write "annotate-text", which it means.');
    }
    return { ...op, op: 'annotate-text' };
}

/** Whether an op is a caption on one mark, by either name. */
export function isTextAnnotationOp(op: ChartUpdateOp): op is Extract<ChartUpdateOp, { op: 'annotate-text' | 'set-annotation' }> {
    return op.op === 'annotate-text' || op.op === 'set-annotation';
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

/** A data value read back from the plot's scales: a number, a Date on a time axis, a category on a discrete one. */
export type DomainValue = number | Date | string;

export type DomainCoordinate =
    | { kind: 'value'; value: DomainValue }
    | { kind: 'interval'; start: DomainValue; end: DomainValue };

export interface DomainPoint {
    x?: DomainValue;
    y?: DomainValue;
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
    /**
     * False while the note's target is outside the plot's current view, so the chart holds the
     * note but does not draw it; absent until the chart has drawn the note.
     */
    readonly inView?: boolean;
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
    /** The notes the chart holds now, previews included; `inView` tells which ones it draws. */
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
    /**
     * How a hovered group best stands out in this chart: 'highlight' where its own cue carries it
     * (a line drawn wider), 'spotlight' where the rest must recede (points, bars, slices).
     */
    readonly groupHoverEmphasis?: 'highlight' | 'spotlight';
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