// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ThemeSpec — level 1 (authored) and level 2 (grounded) types.
 *
 * See `design-docs/03-themeSpec-abstract-design.md` and
 * `design-docs/themespec/fields.md` for the argument behind every field.
 *
 * The invariant this file encodes:
 *
 *   LEVEL 1 (`ThemeSpec`) never names a chart type, a positional channel,
 *   a mark type, a field, or a backend property.
 *
 *   LEVEL 2 (`DesignDecisions`) has bound every role to a concrete part of
 *   *this* chart and resolved every policy against the space actually
 *   available — but is still backend-neutral.
 *
 * Level 3 (realization) lives in each backend, e.g. `vegalite/theme.ts`.
 */

import type { AssembleOptions } from '../types.js';

// ---------------------------------------------------------------------------
// Level 1 — the authored ThemeSpec
// ---------------------------------------------------------------------------

/** The presence ordinal. Grounding may step DOWN it, and must report. */
export type Presence = 'omit' | 'hairline' | 'quiet' | 'full' | 'emphasised';

export type Frequency = 'never' | 'whenNeeded' | 'always';

/** A design-token size reference (`text.100`, `text.hero900`) or a raw px number. */
export type SizeToken = string | number;

export interface TypeRole {
    family?: string;
    size?: SizeToken;
    weight?: 'regular' | 'medium' | 'semibold' | 'bold';
    /** Journals set decks and captions in italic; it is a role, not an accident. */
    style?: 'normal' | 'italic';
    case?: 'asIs' | 'upper' | 'lower' | 'title';
    color?: string;
}

export interface AxisRole {
    line?: Presence;
    ticks?: Presence;
    tickLength?: 'short' | 'medium' | 'long';
    tickDirection?: 'outward' | 'inward';
    /** `opposite` = the far side of the plot (top for x, right for y). */
    placement?: 'default' | 'opposite';
    tickLabels?: 'all' | 'observed' | 'endpoints' | 'sparse';
    tickDensity?: 'sparse' | 'normal' | 'dense';
    /**
     * Drop the axis entirely when every mark already prints its own value.
     * The scale is then carried by the numbers, not by a ruler beside them.
     * Mirrors `legend.suppressWhenValuesPrinted`.
     */
    suppressWhenValuesPrinted?: boolean;
}

/**
 * Control points of an interpolator — NOT an indexed set.
 * Length is resolution, not capacity, so `overflow` does not apply.
 */
export interface Ramp {
    stops: string[];
    /** Diverging only: the ink at the pivot. */
    neutral?: string;
    space?: 'rgb' | 'lab' | 'hcl';
    /** Forbid the ramp endpoints colliding with the canvas. */
    endpointsAgainstSurface?: boolean;
    consumption?: 'interpolate' | 'quantize' | 'sampleCategorical';
    quantizeCount?: number;
}

export interface ThemeInk {
    surface?: {
        source?: 'host' | 'house';
        canvas?: string;
        plot?: string;
        panel?: string;
    };
    text?: {
        primary?: string;
        secondary?: string;
        muted?: string;
        inverse?: string;
    };
    /** The ink the presence ordinal scales against. */
    structure?: {
        axis?: string;
        grid?: string;
        frame?: string;
        rule?: string;
        /**
         * The zero line, when the house makes it more than one gridline among
         * the rest. The Economist strokes zero in its signature red so every
         * length is read from a line the eye cannot miss. It borrows `rule`
         * (then `axis`) where the house says nothing, so a house that draws an
         * ordinary zero needs to state nothing.
         */
        zero?: string;
        /**
         * The stem of a lollipop, the bridge of a dumbbell. It borrows `rule`
         * where the house says nothing, but the two are not the same job: a
         * gridline is read *through*, so it sits at the bottom of the ordinal,
         * while a connector is part of the mark and has to hold its shape at
         * a hairline's width. A house whose gridlines are already pale has no
         * room left below them, and states this ink instead.
         */
        connector?: string;
    };
    series?: {
        single?: string;
        categorical?: string[];
        /**
         * A larger indexed set the house reaches for when a chart has more
         * series than its core {@link categorical} palette can name, in the
         * spirit of Tableau's 10→20 step. The core set carries the house's
         * identity at low cardinality (a handful of well-known inks); the
         * extended set trades a little of that identity for the capacity to
         * keep every series distinct up to its length. Grounding picks the
         * smallest set whose length covers the series count; past the extended
         * set's length the {@link overflow} ink takes the tail.
         *
         * Must contain the core set's inks as a prefix is *not* required — but
         * ordering the shared hues first keeps a chart's colours stable as it
         * grows. Unset ⇒ the house has only its core palette.
         */
        categoricalExtended?: string[];
        overflow?: string;
        sequential?: Ramp;
        diverging?: Ramp;
        status?: { positive?: string; negative?: string; neutral?: string };
        selection?: {
            partToWhole?: 'categorical' | 'sequentialRamp';
            signed?: 'categorical' | 'status' | 'diverging' | 'sequential';
            redundantWithFacet?: 'single' | 'categorical';
            statusUse?: 'anySigned' | 'thresholdOnly' | 'never';
        };
    };
    accent?: string;
}

export interface ThemeType {
    minSize?: number;
    headline?: TypeRole;
    deck?: TypeRole;
    axisLabel?: TypeRole;
    axisTitle?: TypeRole;
    valueLabel?: TypeRole;
    keyLabel?: TypeRole;
    annotation?: TypeRole;
    footnote?: TypeRole;
    /** The KPI big-number role — data, not chrome. */
    display?: TypeRole;
}

export interface ThemeStructure {
    axis?: {
        categorical?: AxisRole;
        measure?: AxisRole;
    };
    /**
     * Gridlines, bound by what the axis *does*, not by what it holds.
     *
     * `measure` is the grid the reader reads values off — the lines that run
     * across the value axis. `category` is the grid across the axis the chart
     * is indexed by, which on a scatter is the horizontal one even though it
     * carries a number. Houses that rule only horizontally are asking for
     * `measure` on and `category` off, whatever the two axes happen to hold.
     */
    grid?: {
        measure?: Presence;
        category?: Presence;
        style?: 'solid' | 'dashed' | 'dotted';
        /**
         * A separate rule where the value axis crosses zero. `omit` leaves
         * zero as an ordinary gridline; anything else draws it in its own
         * weight. Only ever drawn when zero is inside the domain.
         */
        zero?: Presence;
    };
    frame?: Presence;
    baseline?: Presence;
}

export interface ThemeMarks {
    bandFraction?: number;
    strokeWeight?: number;
    strokeCap?: 'butt' | 'round' | 'square';
    strokeJoin?: 'miter' | 'round' | 'bevel';
    interpolation?: 'linear' | 'monotone' | 'step';
    fillOpacity?: number;
    /**
     * How far the *value* end of a bar is rounded, in px — the top of a
     * column, the right of a horizontal bar — and, on a wedge, its corners.
     * Only the value end of a bar moves; the baseline stays a clean edge, so a
     * stack still reads as one column. A house that says nothing keeps square
     * corners; a friendlier, less clinical house rounds them.
     */
    cornerRadius?: number;
    /**
     * A stroke drawn around every filled mark — a bar or a wedge: the
     * "sticker" / flat-illustration edge. It is not a `separator` (which cuts
     * *between* adjacent pieces) nor a `frame` (which bounds the plot): it
     * bounds each mark on its own, so a lone bar carries it too. A bar's
     * outline stands down where the bar is too thin to hold it (so a dense bar
     * chart keeps its fill); a grid cell is a field, held apart by a `tile`
     * gap, not an outline. `ink` draws it in the house's dark structural ink;
     * `surface` draws it in the page. A house that says nothing leaves its
     * marks unbordered.
     */
    outline?: { presence?: Presence; weight?: number; source?: 'ink' | 'surface' };
    sizeRange?: [number, number];
    minSize?: number;
    zOrder?: 'summaryOverData' | 'summaryUnderData';
    separator?: { presence?: Presence; width?: number; source?: 'surface' | 'structure' };
    /**
     * A wedge sits in no band, so how far apart neighbouring wedges stand is
     * its own question. A house may rule its stacked bars with a half-pixel
     * hairline and still want a clean cut between the pieces of a pie: two
     * arcs of the same size at different orientations are hard enough to
     * compare without also having to find where one ends. Where the house
     * says nothing, wedges are held apart the way its bars are.
     *
     * `rule` paints the shared edge in the separator's ink, which reads as a
     * gap of constant width. `pad` swings the wedges apart instead, so the
     * gap opens at the rim and closes to nothing at the centre.
     */
    slice?: { gap?: number; gapStyle?: 'rule' | 'pad' };
    /**
     * How far apart the cells of a grid stand — a heatmap, a calendar, a
     * matrix. A cell is not a bar: it has no band to give back, its two
     * neighbours are on two axes, and its colour is the reading, so a gap
     * between cells has to be cut out of the shape the way a wedge's is.
     *
     * Whether to cut at all is a real difference between houses and not a
     * detail. Flush cells read as a continuous field — the eye follows the
     * gradient across a row and sees a season. Cut cells read as a table of
     * separate readings, which is what a house wants when it prints the number
     * inside each one. Where the house says nothing, cells are held apart the
     * way its bars are.
     *
     * The gap is painted, not spaced, and it takes the surface unless the
     * house asks for structure: on a grid whose colour *is* the value, an edge
     * in any other ink reads as data.
     */
    tile?: { gap?: number; source?: 'surface' | 'structure' };
    point?: {
        /**
         * Whether a *line* carries a dot at each of its vertices. This is a
         * question about lines, not about dots: a scatter's dots are drawn
         * because the chart is a scatter, and no house presence turns them off.
         */
        presence?: Presence;
        /**
         * How big a dot this house draws, as an area in px² — the way the
         * renderer states a point's size and the way the size channel is read.
         * One number, wherever a dot appears: at a line's vertex, on a scatter,
         * at the ends of a dumbbell. A house that wanted its scatter dots and
         * its vertex dots at different sizes would be saying that the same ink
         * means two things, and the eye does not read them that way.
         *
         * Where the house says nothing the renderer's default stands. The
         * layout remains free to shrink it when the plot runs short of room.
         */
        size?: number;
        fill?: 'solid' | 'hollow';
        halo?: { presence?: Presence; width?: number };
    };
    connector?: {
        presence?: Presence;
        /**
         * The weight of a connector that runs from a mark to the baseline — a
         * lollipop's stem. It restates nothing: the dot's position already
         * carries the value and the stem only leads the eye down to the axis,
         * so it is drawn as structure.
         */
        weight?: number;
        /**
         * The weight of a connector that runs between two marks — a dumbbell's
         * bridge. This one is not redundant: the *distance* it draws is the
         * reading, and a hairline asks the eye to measure a gap it can barely
         * see. It keeps structure's ink and takes a mark's weight.
         *
         * Where the house says nothing, a bridge is drawn at the weight the
         * house gives its lines: it is a mark, so it takes a mark's weight.
         */
        spanWeight?: number;
        style?: 'solid' | 'dashed' | 'dotted';
    };
    trailingFill?: { presence?: Presence; opacity?: number };
    interval?: { fillOpacity?: number; edge?: Presence; inkSource?: 'sameAsCentral' | 'structure' };
    summary?: {
        fill?: Presence;
        outline?: Presence;
        centralRule?: Presence;
        widthFraction?: number;
    };
    observations?: { expose?: 'never' | 'whenSparse' | 'always'; maxRows?: number };
    reference?: { presence?: Presence; style?: 'tick' | 'line' | 'dashed'; weight?: number; label?: boolean };
    redundantEncoding?: Frequency;
    redundantChannels?: Array<'shape' | 'dash' | 'texture' | 'lightness'>;
}

export interface ThemeLabels {
    truncation?: 'never' | 'ellipsis' | 'wrap';
    flush?: boolean;
    angle?: 'auto' | 'horizontal' | 'rotated';
}

export type LegendPlacement =
    | 'seriesEnd' | 'inline' | 'top' | 'right' | 'bottom' | 'left' | 'inside';

export interface ThemeLegend {
    show?: 'always' | 'never';
    placement?: LegendPlacement[];
    direction?: 'horizontal' | 'vertical';
    /**
     * `whenAmbiguous` asks whether the key's labels say what they are: a list
     * of names (`Chrome`, `Cairo`) does, and a ramp of numbers does not.
     */
    title?: 'omit' | 'whenAmbiguous' | 'always';
    gradientLength?: number;
    /**
     * The most entries a key to *values* may spend. A legend that names ten
     * bubble sizes is a table, not a key: three well-chosen sizes tell the
     * reader the scale and leave the chart the room.
     */
    maxSwatches?: number;
    swatch?: 'auto';
    /** The legend restates the categorical axis — delete it. */
    suppressWhenAxisNames?: boolean;
    /** The legend restates a number already printed in every mark — delete it. */
    suppressWhenValuesPrinted?: boolean;
}

export interface ThemeDataLabels {
    show?: 'always' | 'whenTheyFit' | 'never';
    placement?: 'atMark' | 'outsideMark' | 'column';
    inkMode?: 'fixed' | 'matchSeries' | 'contrastWithMark';
}

export interface ThemeAnnotation {
    unit?: 'never' | 'firstTick' | 'lastTick' | 'firstAndLast' | 'everyTick';
    /**
     * `whenAmbiguous` asks the same question of each axis: `Jan Feb Mar` names
     * its own kind and needs no title over it, `26 20 14` names nothing until
     * one is written. Ranks and binned ranges count as numbers.
     */
    axisTitles?: 'omit' | 'whenAmbiguous' | 'always';
    axisTitlePlacement?: 'rotated' | 'flatAboveAxis' | 'inline';
    unitsInAxisTitle?: boolean;
    numberFormat?: {
        precision?: 'auto' | 'integer' | 'one' | 'two';
        signed?: boolean;
        thousands?: 'none' | 'separator' | 'suffix';
        ordinal?: boolean;
    };
    pointEmphasis?: 'never' | 'endpoints' | 'latest' | 'extremes';
    pointLabels?: 'never' | 'endpoints' | 'all';
    statistics?: { show?: string[]; placement?: 'panel' | 'caption' };
}

export interface ThemeFurniture {
    kind: 'mastheadTab' | 'footerRule' | 'headerRule';
    anchor?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
    color?: string;
    width?: number;
    height?: number;
}

export interface ThemeFacets {
    header?: { presence?: Presence; style?: 'flushLabel' | 'boxedLabel'; fieldTitle?: 'omit' | 'always' };
    panelFrame?: Presence;
    axisRepetition?: 'everyPanel' | 'edgeOnly';
    spacing?: 'compact' | 'normal' | 'airy';
    preferredColumns?: number;
    sharedScale?: 'always' | 'whenComparable' | 'never';
}

export interface ThemeLayout {
    density?: 'compact' | 'normal' | 'airy';
    targetWidth?: number;
    titleBlock?: {
        anchor?: 'start' | 'middle' | 'end';
        /**
         * The vertical gap between the title block and the chart below it — a
         * house's whitespace personality reaching the headline. `tight` packs
         * the chart up under the title (a dense figure, a dashboard tile);
         * `loose` gives an action title room to breathe (a slide exhibit).
         */
        gap?: 'tight' | 'normal' | 'loose';
        /** The vertical gap between the headline and its deck (subtitle). */
        deckGap?: 'tight' | 'normal' | 'loose';
    };
    bandStep?: number;
}

/** A predicate over signals the compiler already resolves. Deliberately closed. */
export interface ThemeGuard {
    markChannel?: 'length' | 'position' | 'area' | 'angle' | 'color' | 'text';
    hasBandedAxis?: boolean;
    seriesCount?: NumericGuard;
    categoryCount?: NumericGuard;
    isPartToWhole?: boolean;
    isSigned?: boolean;
    isTemporal?: boolean;
    isFaceted?: boolean;
    isSummarised?: boolean;
    canvasWidth?: NumericGuard;
}

export interface NumericGuard {
    lt?: number; lte?: number; gt?: number; gte?: number; eq?: number;
}

export interface ThemeVariant {
    when: ThemeGuard;
    /** Policy blocks only — `ink` and `type` may not vary. */
    then: Partial<Omit<ThemeSpec, 'id' | 'label' | 'ink' | 'type' | 'variants'>>;
    /** Required: a variant without a stated reason is an inconsistency. */
    because?: string;
}

/**
 * The one block that is allowed to name a chart type.
 *
 * Everything else at level 1 is a policy the compiler binds to whatever chart
 * it is handed. This is different in kind: it is the house's list of settings
 * for charts it has an opinion about — the Times puts a dot on every reading
 * of a line, and a bump chart it prints is never smoothed. Those are not
 * consequences of a design language, they are house rules, and there is no
 * honest way to derive them from ink and type.
 *
 * Keyed by chart type id, or `*` for every chart. Values are chart-property
 * keys the template already declares. It is a *default*: anything the caller
 * set explicitly wins, and a key the template does not offer is reported and
 * dropped.
 */
export interface ThemeChartDefaults {
    [chartType: string]: Record<string, unknown>;
}

/**
 * Compiler settings the house prefers — the size it draws at, how far a chart
 * may stretch, how much air a facet gets. These are not style: they decide how
 * much room the chart has before a single colour is chosen, which is why they
 * cannot be applied after the fact like ink.
 *
 * Three levels, in order: what the caller put in the chart spec, then this,
 * then flint's own defaults. A house sets the middle one.
 */
export interface ThemeCompileDefaults extends Partial<AssembleOptions> {
    baseSize?: { width: number; height: number };
    canvasSize?: { width: number; height: number };
}

/** Level 1. One JSON document per design language. */
export interface ThemeSpec {
    id: string;
    label?: string;
    ink: ThemeInk;
    type: ThemeType;
    structure?: ThemeStructure;
    marks?: ThemeMarks;
    labels?: ThemeLabels;
    legend?: ThemeLegend;
    dataLabels?: ThemeDataLabels;
    annotation?: ThemeAnnotation;
    furniture?: ThemeFurniture[];
    facets?: ThemeFacets;
    layout?: ThemeLayout;
    chartDefaults?: ThemeChartDefaults;
    compileDefaults?: ThemeCompileDefaults;
    interaction?: { tooltipFormat?: string };
    variants?: ThemeVariant[];
}

/**
 * A house Flint ships, ready to name by id: `theme_spec: 'economist'`.
 *
 * Three parts, and they answer different questions. `spec` is what the
 * compiler reads. `description` is how a caller chooses between houses.
 * `guidance` is the house talking upstream.
 *
 * That last one needs saying, because the boundary is easy to blur. A theme
 * governs the visual: ink, type, furniture, spacing. It does not choose the
 * fields, the aggregation or the sort — the chart spec does, and it is written
 * first. So where a house depends on something only the spec can give, it says
 * so: which words it needs written, which annotations it reads, how many
 * categories its colour can name. Facts and requests, not instructions — what
 * to do about a tail of thirty categories is the author's call, and a house
 * that starts prescribing transformations is overreaching. Hence a few lines.
 */
export interface ThemePreset {
    id: string;
    label: string;
    /** One line: what this house is for. */
    description: string;
    /** A few markdown bullets: what this house needs the chart spec to do. */
    guidance: string;
    spec: ThemeSpec;
}

// ---------------------------------------------------------------------------
// Level 2 — grounded DesignDecisions
// ---------------------------------------------------------------------------

/**
 * A downgrade or approximation. Silent fallbacks are indistinguishable from
 * bugs, so every one of these is surfaced on `spec._theme.report`.
 */
export interface ThemeReport {
    stage: 'ground' | 'realize';
    /** Dotted ThemeSpec path this concerns, e.g. `legend.placement`. */
    path: string;
    message: string;
}

export interface ResolvedText {
    font?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold' | number;
    fontStyle?: 'normal' | 'italic';
    color?: string;
}

export interface ResolvedRule {
    show: boolean;
    color: string;
    width: number;
    dash?: number[];
}

/** One axis, already bound to a screen channel. */
export interface ResolvedAxis {
    role: 'categorical' | 'measure';
    /** `top`/`bottom` for x, `left`/`right` for y. */
    orient: 'top' | 'bottom' | 'left' | 'right';
    domain: ResolvedRule;
    ticks: ResolvedRule & { size: number; offset: number };
    grid: ResolvedRule;
    label: ResolvedText & { show?: boolean; limit?: number; padding: number; flush?: boolean; angle?: number };
    title: { show: boolean; placement?: 'rotated' | 'flatAboveAxis' | 'inline'; unit?: string } & ResolvedText;
    /** Preferred tick count; undefined = let the renderer choose. */
    tickCount?: number;
    /**
     * Which ticks carry a label. `all` leaves the choice to the renderer's own
     * scale; the rest ask for the values the data actually holds, thinned or
     * cut to the two ends.
     */
    tickLabels?: 'all' | 'observed' | 'endpoints' | 'sparse';
    /** True when this axis carries what the reader indexes the chart by. */
    indexing?: boolean;
    /** A rule at zero, drawn only where the value axis crosses it. */
    zeroRule?: ResolvedRule;
    /** Suffix/prefix policy for the measure this axis carries. */
    unit?: { text: string; where: 'never' | 'firstTick' | 'lastTick' | 'firstAndLast' | 'everyTick' };
}

export interface ResolvedSeriesInk {
    mode: 'single' | 'categorical' | 'sequential' | 'diverging' | 'status';
    single: string;
    categorical: string[];
    overflow?: string;
    /**
     * The data needs more inks than the house named, and the house named no
     * overflow ink either. Colour can no longer tell the series apart, so the
     * house set is not imposed — what is on the chart already was chosen for
     * the count.
     */
    exhausted?: boolean;
    /**
     * More series than even the extended palette holds, but the house *does*
     * name an {@link overflow} ink. The top {@link categorical}.length series
     * by prominence take the indexed inks; every remaining ("other") series
     * takes the one overflow ink. Realization orders the colour domain by
     * share so it is the *smallest* series that fold into the overflow tail,
     * not an arbitrary slice of the domain.
     */
    overflowTail?: boolean;
    ramp?: Ramp;
    status?: { positive?: string; negative?: string; neutral?: string };
    /** Concrete range to hand a continuous colour scale (already sampled). */
    range?: string[];
    /** Set when the ramp is consumed as discrete bands. */
    quantize?: number;
}

export interface ResolvedLegend {
    show: boolean;
    /** The placement that actually survived grounding. */
    placement: LegendPlacement;
    /**
     * The rest of the house's ranked list, after the one that survived.
     *
     * Grounding cannot see everything: whether a name fits inside the band it
     * names is a question of pixels and text, and it is answered in realize.
     * When the answer comes back no, the house has already said what it would
     * rather have — so the fallback is read from here rather than invented.
     */
    fallbacks?: LegendPlacement[];
    orient?: 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
    direction?: 'horizontal' | 'vertical';
    title: boolean;
    label: ResolvedText;
    gradientLength?: number;
    /** The most entries a key to values may spend. */
    maxSwatches?: number;
}

export interface ResolvedDataLabels {
    show: boolean;
    placement: 'atMark' | 'outsideMark' | 'column';
    inkMode: 'fixed' | 'matchSeries' | 'contrastWithMark';
    text: ResolvedText;
    /** d3-format string derived from `annotation.numberFormat` + channel semantics. */
    format?: string;
    /**
     * The unit each printed value carries. Set only where the house asks for
     * a unit and no axis is left to state it — a pie has no ruler at all.
     */
    unit?: string;
    /**
     * Below this magnitude the mark is shorter than its own label, so an
     * inside label would overrun it. Grounding owns this because it is a
     * question about space, not about style.
     */
    insideMinValue?: number;
    /**
     * Above this magnitude the mark reaches the end of the scale, so an
     * outside label would fall off the plot. The mirror of `insideMinValue`.
     */
    outsideMaxValue?: number;
}

export interface ResolvedMarks {
    bandFraction: number;
    strokeWidth: number;
    strokeCap?: string;
    strokeJoin?: string;
    interpolate?: string;
    fillOpacity?: number;
    /** Corner radius for the value end of a bar, and a wedge's corners, in px. */
    cornerRadius?: number;
    /** A stroke around each filled bar/wedge: the sticker edge (thin bars skip it). */
    outline?: { color: string; width: number };
    point?: { show: boolean; size?: number; filled?: boolean; haloColor?: string; haloWidth?: number };
    /** The area a sized mark may take, smallest to largest, in px². */
    sizeRange?: [number, number];
    /** The area below which a sized mark stops being a mark. */
    minSize?: number;
    /** Whether the rows behind a summary mark are drawn alongside it. */
    observations?: { expose: 'never' | 'whenSparse' | 'always'; maxRows: number };
    separator?: { show: boolean; color: string; width: number };
    /** How far apart neighbouring wedges of a pie or donut stand, in px. */
    slice?: { gap: number; style: 'rule' | 'pad'; color: string };
    /** How far apart the cells of a heatmap or matrix stand, in px. */
    tile?: { gap: number; color: string };
    /**
     * `width` is the stem — a connector to the baseline. `spanWidth` is the
     * bridge — a connector between two marks, which draws a distance that is
     * itself the reading. Both are painted in `color`.
     */
    connector?: { show: boolean; color?: string; width: number; spanWidth: number; dash?: number[] };
    interval?: { fillOpacity?: number; edge: boolean };
    summary?: { fill: boolean; outline: boolean; centralRule: boolean; widthFraction?: number };
    reference?: { show: boolean; width: number; style?: string; label: boolean };
    zOrder: 'summaryOverData' | 'summaryUnderData';
    redundantChannels: Array<'shape' | 'dash' | 'texture' | 'lightness'>;
    redundantEncoding: Frequency;
    /**
     * The redundant channels grounding decided this chart actually gets, after
     * weighing `redundantEncoding` against how hard the series are to tell
     * apart by colour alone.
     */
    redundant: { shape: boolean; dash: boolean };
}

/** Level 2 output. Backend-neutral, but every role is bound to this chart. */
export interface DesignDecisions {
    themeId: string;
    surface: { canvas: string; plot?: string; panel?: string };
    /** Default text ink, for anything not otherwise specified. */
    text: { primary: string; secondary: string; muted: string; inverse: string };
    /** Base font family for the chart body. */
    font?: string;
    title: {
        anchor: 'start' | 'middle' | 'end';
        headline: ResolvedText;
        deck: ResolvedText;
        /** Gap from the title block to the chart, in px. */
        offset: number;
        /** Gap between the headline and its deck, in px. */
        deckPadding: number;
    };
    /** Bound axes, keyed by screen channel. */
    axes: { x?: ResolvedAxis; y?: ResolvedAxis };
    frame: ResolvedRule;
    baseline: ResolvedRule;
    series: ResolvedSeriesInk;
    legend: ResolvedLegend;
    dataLabels: ResolvedDataLabels;
    /**
     * Which points on a line the house dots, and whether it writes the value
     * there. Only meaningful where the chart draws a line through its data —
     * stage 3 knows that, stage 2 does not.
     */
    pointEmphasis?: {
        where: 'endpoints' | 'latest' | 'extremes';
        labels: 'never' | 'endpoints' | 'all';
        size: number;
    };
    marks: ResolvedMarks;
    facets: {
        header: { show: boolean; fieldTitle: boolean } & ResolvedText;
        panelFrame: boolean;
        axisRepetition: 'everyPanel' | 'edgeOnly';
        spacing?: number;
        preferredColumns?: number;
    };
    layout: { padding: number; density: 'compact' | 'normal' | 'airy' };
    /**
     * What the house prints alongside a fit: the quantities it expects to see
     * stated, and where. Only meaningful where the chart actually fits
     * something — stage 3 knows that, stage 2 does not.
     */
    statistics?: { show: string[]; placement: 'panel' | 'caption' } & ResolvedText;
    furniture: ThemeFurniture[];
    /** Chart facts stage 3 is allowed to consult (it may not re-derive them). */
    bound: {
        measureChannels: Array<'x' | 'y'>;
        categoricalChannel?: 'x' | 'y';
        seriesChannel?: string;
        /** The field the series is keyed on, and the one the categorical axis names. */
        seriesField?: string;
        categoryField?: string;
        seriesCount: number;
        categoryCount: number;
        isFaceted: boolean;
        isPartToWhole: boolean;
        isSigned: boolean;
        /** The mark family, for realizers that must fake a missing primitive. */
        markChannel: string;
    };
    report: ThemeReport[];
}
