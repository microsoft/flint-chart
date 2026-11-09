// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import type { CompactPrint, CompactRule, CompactStyle } from '../number-compact';

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
import type { GapSize, GroupSpacing } from '../group-gaps.js';

export type Presence = 'omit' | 'hairline' | 'quiet' | 'full' | 'emphasised';

export type Frequency = 'never' | 'whenNeeded' | 'always';

/**
 * A rule the house draws — a gridline, the zero rule, the baseline: a presence, or the presence
 * with its own style. An object states a drawn rule: without `presence` it is `quiet`.
 */
export type RuleSpec = Presence | {
    presence?: Presence;
    style?: 'solid' | 'dashed' | 'dotted';
    /** The dash rhythm in px, `[dash, gap]`; overrides `style`'s default. */
    dash?: number[];
    /** Stroke width in px before the presence scales it (`emphasised` is 1.5×). */
    weight?: number;
    /** This rule's own ink, in place of the role's (`ink.structure.grid`, `.zero`, `.axis`); the presence still tones it. */
    color?: string;
    /** A grid only: drawn over the marks (`front`) or under them; unset takes `grid.layer`. Vega-Lite only. */
    layer?: 'behind' | 'front';
};

/** The finer lines between a grid's labelled lines. */
export type MinorGridSpec = Presence | (Exclude<RuleSpec, Presence> & {
    /** Intervals each major interval is cut into: 2 draws one line halfway. Default 2. */
    divisions?: number;
    /** Which grids carry them. Default both, each only where its major grid is drawn. */
    on?: Array<'measure' | 'category'>;
});

/** A design-token size reference (`text.100`, `text.hero900`) or a raw px number. */
export type SizeToken = string | number;

/** A named weight, or the CSS number (100–900). */
export type TypeWeight =
    | 'thin' | 'extralight' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black'
    | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface TypeRole {
    family?: string;
    size?: SizeToken;
    /** The full CSS scale: `thin` (100) … `regular` (400) … `black` (900), or the number itself. */
    weight?: TypeWeight;
    /** Journals set decks and captions in italic; it is a role, not an accident. */
    style?: 'normal' | 'italic';
    /**
     * `upper`, `lower`, `title` (each word capitalised, short joining words kept lower-case) or
     * `sentence` (first letter capitalised, the rest as written). Applied where the text is measured,
     * so a wider upper-case headline is fitted as it will be drawn.
     */
    case?: 'asIs' | 'upper' | 'lower' | 'title' | 'sentence';
    color?: string;
}

export interface AxisRole {
    line?: Presence;
    /** Stroke width of the axis rule in px. Presence still decides whether it is drawn. */
    lineWeight?: number;
    /** The rule's and ticks' own ink, in place of `ink.structure.axis`; the presence still tones it (AX1). */
    color?: string;
    ticks?: Presence;
    tickLength?: 'short' | 'medium' | 'long';
    tickDirection?: 'outward' | 'inward';
    /**
     * Distance from the axis rule to its labels in px. For outward ticks, the
     * tick occupies the first part of this distance.
     */
    labelGap?: number;
    /**
     * Which side of the plot the axis sits on (AX1):
     * - `opposite` — the far side, whichever way the axis runs (top for x, right for y);
     * - `leading` / `trailing` — the start or end of the reading direction: a vertical axis on the
     *   left or right; a horizontal axis keeps the bottom;
     * - `top` / `bottom` / `left` / `right` — a screen side, applied only when the axis runs that
     *   way (`top` moves a horizontal value axis and leaves a vertical one where it is).
     */
    placement?: 'default' | 'opposite' | 'leading' | 'trailing' | 'top' | 'bottom' | 'left' | 'right';
    tickLabels?: 'all' | 'observed' | 'endpoints' | 'sparse';
    /**
     * How finely a *measure* ruler is graduated: one gradation per 60 / 45 / 30px
     * of axis, floored at three. A hint — the renderer still rounds to its own
     * 1/2/5/10 step, so a dense ask on a short axis can land on half units.
     */
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
        /**
         * The ink each categorical entry takes when it is *written* rather than filled — a series
         * name at a line's end, a value in the series' colour. Parallel to {@link categorical} (then
         * {@link categoricalExtended}): entry *i* is the text variant of ink *i*. Where a house gives
         * none, a series ink too light to read on the surface is darkened in its own hue until it
         * reaches 3:1.
         */
        categoricalText?: string[];
        /**
         * The least contrast a series ink keeps against the plot surface. A fill below `fill`
         * (default 1.25:1) is drawn with a 1px edge in a darker shade of its hue; a line below
         * `stroke` (default 1.6:1) is darkened in its hue until it passes. Inks that pass are
         * untouched.
         */
        minContrast?: { fill?: number; stroke?: number };
        /**
         * A set written for an exact number of series, keyed by that number (`{ 2: [...], 3: [...] }`).
         * A chart with that many series takes its set instead of the first inks of `categorical`. A
         * chart with more series than `categorical` names may also reach a larger set here, the way it
         * reaches `categoricalExtended`. One series keeps `single`.
         */
        categoricalByCount?: Record<number, string[]>;
        /**
         * Past the last ink, start the palette again instead of folding the rest into the overflow
         * ink: for houses whose guide says colours repeat after the *n*th series.
         */
        repeat?: boolean;
        /**
         * Inks for values that play a role, whatever their position: `other` (Other, Others, Rest of
         * world …), `total` (Total, Grand total) and `missing` (Missing, Unknown, No data, N/A …).
         * A value with a role takes its ink and no other series in the chart wears it. `other` is
         * also the overflow ink when the house names none. Colours for particular values (a party,
         * an asset class) belong to the chart: the field annotation `colors`, which wins over these.
         */
        roles?: { other?: string; total?: string; missing?: string };
        /**
         * Inks for one family of marks, keyed by mark: `line`, `area`, `bar` (bars and cells),
         * `arc` (pies and donuts) or `point`. A chart whose series are drawn by one family takes that
         * family's `single` and `categorical` in place of the general ones; a chart mixing families
         * (bars with a line) keeps the general set, so a series has one colour throughout.
         */
        byMark?: Partial<Record<SeriesMarkFamily, { single?: string; categorical?: string[] }>>;
        overflow?: string;
        /**
         * The ramp for ordered series (Gold, Silver, Bronze; Strongly agree … Strongly disagree), its
         * stops listed in the order the categories take them. Unset ⇒ ordered series sample
         * `sequential`.
         */
        ordinal?: Ramp;
        sequential?: Ramp;
        diverging?: Ramp;
        status?: { positive?: string; negative?: string; neutral?: string };
        selection?: {
            partToWhole?: 'categorical' | 'sequentialRamp';
            /**
             * How a signed series is coloured. Applies only when the coloured field itself carries
             * the sign: a continuous colour whose values cross zero, or categories that split by
             * sign (increase / decrease, regions netting a gain or a loss). A measure on an axis
             * that dips below zero leaves the series' colour to the ordinal and categorical rules.
             */
            signed?: 'categorical' | 'status' | 'diverging' | 'sequential';
            redundantWithFacet?: 'single' | 'categorical';
            statusUse?: 'anySigned' | 'thresholdOnly' | 'never';
            /**
             * A nominal series whose order the chart declares (the field annotation's `sortOrder`):
             * `ramp` reads it as ordered and samples the ordinal ramp; `categorical` (default) keeps
             * distinct hues. A sequence Flint infers on its own (months, compass points) is not
             * declared and keeps distinct hues.
             */
            ordered?: 'ramp' | 'categorical';
        };
    };
    accent?: string;
}

/** The families of marks a house can give their own series inks. */
export type SeriesMarkFamily = 'line' | 'area' | 'bar' | 'arc' | 'point';

export interface ThemeType {
    minSize?: number;
    headline?: TypeRole;
    deck?: TypeRole;
    axisLabel?: TypeRole;
    axisTitle?: TypeRole;
    valueLabel?: TypeRole;
    keyLabel?: TypeRole;
    /**
     * A key's title ("Population (M)"). It names a field as an axis title does, so unset parts follow
     * `axisTitle`'s family, slope and ink, at the key labels' size; with neither stated, the labels'
     * family and the secondary text ink. Its weight is bold, or heavier where `axisTitle` is, lighter
     * only where this role says so: the weight is what tells a title from its entries. Its `case` is
     * not applied: the title is the field's name as written.
     */
    keyTitle?: TypeRole;
    annotation?: TypeRole;
    footnote?: TypeRole;
    /** The line above the headline: a figure label (“FIGURE 2”) or a newsroom kicker, from `chart_spec.label`. */
    kicker?: TypeRole;
    /** The KPI big-number role — data, not chrome. */
    display?: TypeRole;
}

export interface ThemeStructure {
    axis?: {
        /** The axis the chart is indexed by, wherever it is drawn. */
        categorical?: AxisRole;
        /** The axis values are read off, wherever it is drawn. */
        measure?: AxisRole;
        /**
         * The axis drawn along the bottom or top (x), whatever it carries: its settings override
         * the role's (AX1). A house that styles its axes by side — a 2px rule along the bottom on
         * every chart — states it here rather than by role.
         */
        x?: AxisRole;
        /** The axis drawn up the left or right (y), whatever it carries; overrides the role's. */
        y?: AxisRole;
        /**
         * What the axis lines are where the value scale floats — does not start at zero, as a line
         * or scatter at 45–90 does. `omit`: the line along the floor is a base, and a base there
         * would claim a zero the chart does not have, so it is not drawn; the value grid marks the
         * floor where a tick stands, and the line's ticks go with it. `keep`: the lines frame the
         * window, wherever it starts. `rangeFrame`: the lines span only the data, set off from the
         * plot (Tufte's range frame), so the frame stays and says where the data runs. Unset, a
         * house that rules its value axis keeps the frame; one that grids its values instead omits
         * the line. Bars and areas start at zero, so a floor under them is always a base.
         * `rangeFrame` is drawn by Vega-Lite only.
         */
        floating?: 'omit' | 'keep' | 'rangeFrame';
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
        /** The grid across the value axis: a presence, or the presence with its own style, dash, weight and ink. */
        measure?: RuleSpec;
        /** The grid across the axis the chart is indexed by; styled on its own, as `measure`. */
        category?: RuleSpec;
        /** The style both grids take unless one states its own. */
        style?: 'solid' | 'dashed' | 'dotted';
        /**
         * The dash rhythm in px, `[dash, gap]`. `style` only names a family and
         * picks a default; the length of the dash is its own decision, and a
         * long dash reads as a guide where a short one reads as a dotted rule.
         */
        dash?: number[];
        /** Stroke width of visible gridlines in px. */
        weight?: number;
        /**
         * A separate rule where the value axis crosses zero. `omit` leaves
         * zero as an ordinary gridline; anything else draws it in its own
         * weight, or the weight, dash and ink it states. Only ever drawn when
         * zero is inside the domain.
         */
        zero?: RuleSpec;
        /** Fainter lines between the labelled ones, on continuous axes. Vega-Lite only. */
        minor?: MinorGridSpec;
        /** `front` draws both grids over the marks (white rules cutting the bars); default `behind`. A grid may state its own. Vega-Lite only. */
        layer?: 'behind' | 'front';
    };
    /**
     * The rule round the plot: a presence, or one with its own weight, dash and ink, so a house
     * whose frame is as heavy as its grid can say so. Dashes are drawn by Vega-Lite only.
     */
    frame?: RuleSpec;
    /** The rule the marks stand on (A7): a presence, or one with its own weight, dash and ink. */
    baseline?: RuleSpec;
}

export interface ThemeMarks {
    bandFraction?: number;
    /** How a group of bars shares its step (`geometry.band.group`). */
    group?: { gap?: GapSize; spacing?: GapSize };
    /** The line along the top of each area (`geometry.area.edge`), in the area's own ink; never an outline on other marks. */
    areaEdge?: { presence?: Presence; width?: number };
    /** How opaque a bar's fill is (`geometry.band.opacity`), 0–1; areas keep `fillOpacity`. */
    barOpacity?: number;
    /** The least length, px, of a non-zero bar (`geometry.band.minLength`). */
    barMinLength?: number;
    /** Gradient fills: an area that fades to its baseline, a wash under each line. */
    gradient?: { area?: 'solid' | 'fade'; lineWash?: 'none' | 'tint' | 'fade'; washOpacity?: number };
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
     * A stroke drawn around every filled mark — a bar, wedge, or point: the
     * "sticker" / flat-illustration edge. It is not a `separator` (which cuts
     * *between* adjacent pieces) nor a `frame` (which bounds the plot): it
     * bounds each mark on its own, so a lone bar carries it too. A bar's
     * outline stands down where the bar is too thin to hold it (so a dense bar
     * chart keeps its fill); a grid cell is a field, held apart by a `tile`
     * gap, not an outline. Large points keep the outline while dense point
     * clouds may shrink the whole dot so the border does not turn the plot
     * into a solid field. `ink` draws it in the house's dark structural ink;
     * `surface` draws it in the page. A house that says nothing leaves its
     * marks unbordered.
     */
    /** `series` draws each mark's border in its own series ink, at full strength. */
    outline?: { presence?: Presence; weight?: number; source?: 'ink' | 'surface' | 'series' };
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
    /** Wedge order, start angle and hole (`geometry.arc`). */
    arc?: { order?: 'data' | 'largestFirst'; startAngle?: number; hole?: number };
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
         * How big a primary dot this house draws, as an area in px² — the way
         * the renderer states a point's size and the way the size channel is
         * read. This covers marks whose point is itself the reading: a scatter,
         * a dot plot, or the ends of a dumbbell.
         *
         * Where the house says nothing the renderer's default stands. The
         * layout remains free to shrink it when the plot runs short of room.
         */
        size?: number;
        /**
         * How big a supporting vertex is, as an area in px². A radar vertex or
         * a sampled point on a connected shape confirms the path's position;
         * it is not the primary mark and must not obscure that path or its
         * grid. Defaults to the smaller of `size` and 25px².
         */
        secondarySize?: number;
        fill?: 'solid' | 'hollow';
        /** The glyph every dot is drawn as; see {@link PointShape}. */
        shape?: PointShape;
        /** How opaque a dot is, 0–1; unset, the renderer's own. */
        opacity?: number;
        /**
         * The ink of a line's vertex dots: the series' own ink (the default), the house's text ink
         * (dark dots on coloured lines), or a colour the house names. A scatter's dots are the
         * series and always take its ink.
         */
        ink?: 'series' | 'text' | string;
        /**
         * Which lines keep the dots (M5): `countable` (default) — lines of up to 12 readings; `all` —
         * every line, the dots shrinking to fit; `sparse` — only where readings stand 20px apart or more.
         */
        density?: 'countable' | 'all' | 'sparse';
        /**
         * A ring in the plot's surface colour around each dot, so dots that overlap, or sit on a line,
         * stay countable. A line's dots get one wherever lines can cross unless this says `omit`; a
         * scatter's dots get one only where it is declared. An `outline` takes its place (a dot has
         * one stroke). A halo and an opacity below 1 are not combined: ringed dots are solid.
         */
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
    /**
     * How the `texture` channel is drawn on filled marks (bars, wedges, areas): `vary` (default)
     * gives each series its own pattern — diagonal, the other diagonal, horizontal, vertical, cross,
     * dots — so series differ without colour; `hatch` gives every series the same diagonal hatch in
     * its own ink. `patterns` names the house's own sequence instead, in palette order (`solid`
     * leaves that series a flat fill). The lines are a darker shade of the fill (`ink: "darker"`) or white.
     */
    texture?: { pattern?: 'vary' | 'hatch'; patterns?: TexturePattern[]; ink?: 'darker' | 'white'; spacing?: number };
}

/**
 * The glyph a house draws a dot as — a scatter's points, a line's vertices, a dumbbell's ends —
 * wherever the chart does not encode shape itself. Where it does, the house's shape is the first
 * the shape scale hands out. Unset, a dot is a circle.
 */
export type PointShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross';

/** A fill pattern the texture channel draws; `solid` is a plain fill in the series ink. */
export type TexturePattern = 'solid' | 'diagonal' | 'antidiagonal' | 'horizontal' | 'vertical' | 'cross' | 'dots';

/** A step category names may take when they do not fit their band (`labels.overflow`). */
export type LabelFitStep = 'wrap' | 'skip' | 'rotate45' | 'rotate90';

/** The thresholds category names are set against (`labels.fit`). */
export interface ThemeLabelFit {
    /** Characters a cut name keeps before its ellipsis; a cut that keeps fewer is not taken. Default 4. */
    minChars?: number;
    /** The widest a turned name runs before it is cut: px, or a share of the plot's height (`"40%"`, the default). */
    turnedLimit?: number | `${number}%`;
    /** Space two straight names keep between them, in em. Default half an em, at least 6px. */
    gap?: number;
    /** The widest a row name down y runs before it wraps or is cut: px, or a share of the chart's width. Default a quarter of it, at least 180px. */
    rowLimit?: number | `${number}%`;
}

export interface ThemeLabels {
    truncation?: 'never' | 'ellipsis' | 'wrap';
    /**
     * Where the names of horizontal bars stand. `beside` (the default): down the y axis, left of the
     * bars. `above`: each on its own line over its bar, the full width of the chart theirs — the
     * bands take twice their room, by the same stretch, and where the canvas cannot hold that the
     * names stand beside. `auto`: above only where, beside, a name would be cut or wrapped. One bar
     * to a band only: grouped bars and small multiples keep their names beside.
     */
    rowNames?: 'beside' | 'above' | 'auto';
    flush?: boolean;
    /**
     * The path category names along x take when they do not stand flat and whole. Names that fit
     * are always flat — a theme never forces a turn. Leave it unset for the general path:
     * - a row of names: `["wrap", "rotate90"]`;
     * - a sequence that explains itself (times, dates, months, years, decades, ranks, by semantic
     *   type): `["wrap", "skip", "rotate90"]`.
     * Add `"rotate45"` before `"rotate90"` where the house turns labels 45°. Steps: `wrap` (two
     * lines, or one in wider bands), `skip` (only the round values, sequences only), `rotate45`,
     * `rotate90`. Trimming is not a step: any step may trim its names (an ellipsis at the band or
     * at `fit.turnedLimit`) unless `truncation` is `"never"`. The path's order binds; within it,
     * every step is weighed at every size down to the floor and the cheapest taken. A chart can
     * state its own path in `chartProperties.labelOverflow`.
     */
    overflow?: LabelFitStep | LabelFitStep[];
    /** The thresholds the names are set against; each has a default. */
    fit?: ThemeLabelFit;
}

export type LegendPlacement =
    | 'seriesEnd' | 'inline' | 'top' | 'right' | 'bottom' | 'left' | 'inside';

export interface ThemeLegend {
    show?: 'always' | 'never';
    placement?: LegendPlacement[];
    direction?: 'horizontal' | 'vertical';
    /**
     * Whether a key carries its field's name. `always`; or `whenAmbiguous` (the default), which
     * leaves it off only on proof the reader does not need it: the headline, deck or an axis on the
     * same field already names it, the chart makes the key itself, or every value proves one closed
     * kind (months, years, countries…) under a field name that says no more. A semantic type is not
     * proof. An author who wants no title says so on the encoding. `omit` is read as `whenAmbiguous`.
     */
    title?: 'whenAmbiguous' | 'always' | /** @deprecated read as `whenAmbiguous` */ 'omit';
    gradientLength?: number;
    /**
     * The most entries a key to *values* may spend. A legend that names ten
     * bubble sizes is a table, not a key. Unset, a size key lists round values
     * as its edge has room for — one for every 80 px of the plot's side it
     * stands on, from three to five — each symbol clearly larger than the last.
     */
    maxSwatches?: number;
    /**
     * The symbol beside each name in a key to categories: `auto` (default) takes it from the mark —
     * a square for bars, a stroke for lines, the dot's own shape for points; `square`, `circle` or
     * `line` (a short stroke) draw that symbol for every mark. A key whose entries are shapes (a
     * shape channel) or sizes keeps its own symbols. Vega-Lite only.
     */
    swatch?: 'auto' | 'square' | 'circle' | 'line';
    /** Several keys above or below the plot: side by side, or one above another. A preference: it gives way where the keys would overflow. */
    arrangement?: 'row' | 'stack';
    /** A key's title above its entries, or before them on their line, above or below the plot. A preference. */
    titlePosition?: 'above' | 'inline';
    /** Where keys stand along their edge: from its start, centred, at its end, or spread across it. */
    align?: 'start' | 'center' | 'end' | 'spread';
    /**
     * The air around keys, in em of their labels — so it keeps its proportion to the type — and
     * eased smoothly with the plot's size (0.7 on a small tile to 1.3 on a large chart).
     * `title`: the title block to keys standing under it; `stack`: between keys one above another;
     * `row`: between keys side by side, and keys one above another beside the plot; `plot`: a key to
     * the plot. Unset: the header grouped by its gaps — 0.6 em for `stack`, an em for `title`, 2.25 em
     * for `row`; an em for `plot`, by `layout.density`.
     */
    gaps?: { title?: number; stack?: number; row?: number; plot?: number };
    /** The legend restates the categorical axis — delete it. */
    suppressWhenAxisNames?: boolean;
    /** The legend restates a number already printed in every mark — delete it. */
    suppressWhenValuesPrinted?: boolean;
    /**
     * Names at the line ends also say where each line ends — "Japan 84.5" — in the value labels'
     * number format. They follow the rows the chart draws, so a chart whose rows are replaced
     * (re-indexed, filtered) keeps its names honest.
     */
    endValue?: boolean;
}

export interface ThemeDataLabels {
    show?: 'always' | 'whenTheyFit' | 'never';
    placement?: 'atMark' | 'outsideMark' | 'column';
    inkMode?: 'fixed' | 'matchSeries' | 'contrastWithMark';
    /**
     * Where a label printed inside a bar sits along it: at the value `end` (default), at the bar's
     * `start` (its base, so the numbers read as one column), or in the `middle`.
     */
    anchor?: 'end' | 'start' | 'middle';
    /**
     * When some bars are too short to hold their label inside: `perMark` (default) prints just those
     * past their end; `allOutside` prints every label past its bar's end, so they read alike.
     */
    fallback?: 'perMark' | 'allOutside';
    /** The contrast (x:1) a label printed on a mark keeps with it under `contrastWithMark`; default 3. */
    minContrast?: number;
}

export interface ThemeAnnotation {
    unit?: 'never' | 'firstTick' | 'lastTick' | 'firstAndLast' | 'everyTick';
    /**
     * `whenAmbiguous` asks the same question of each axis: `Jan Feb Mar` names
     * its own kind and needs no title over it, `26 20 14` names nothing until
     * one is written. Ranks and binned ranges count as numbers.
    * `omit` moves required titles and declared units to the end of the
    * subtitle rather than relying on the author's prose to name the axes.
     */
    axisTitles?: 'omit' | 'whenAmbiguous' | 'always';
    /**
     * Where a still-needed axis title sits. `flatAboveAxis` lays it straight
     * at the head of its own ruler, beside the values it names.
     */
    axisTitlePlacement?: 'rotated' | 'flatAboveAxis' | 'inline';
    /**
     * Distance in px from an axis title to the plot-side edge it labels.
     * Realization maps this to native title padding or, for a flat y title,
     * to its offset above the plot.
     */
    axisTitleGap?: number;
    unitsInAxisTitle?: boolean;
    numberFormat?: {
        precision?: 'auto' | 'integer' | 'one' | 'two';
        signed?: boolean;
        thousands?: 'none' | 'separator' | 'suffix';
        ordinal?: boolean;
        /**
         * Number compaction (1,250,000 → 1.25M). The theme says whether, how and where; the field
         * says whether it may be — by its semantic type (`types`) and its unit (a value already in
         * millions, `Population (m)`, is never compacted again). Unset, `thousands: "suffix"`
         * compacts value labels value by value, as before; otherwise nothing is compacted.
         */
        compact?: {
            /** `auto` (the default once `compact` is stated) compacts where the largest value reaches `threshold`. */
            show?: 'auto' | 'never';
            /** `short` k/M/B/T (default), `upper` K/M/B/T (BI), `lower` k/m/b/t, `editorial` k/m/bn/tn, `si` k/M/G/T. */
            style?: CompactStyle;
            /** `scale` (default): one unit for a whole ruler or label set, from its largest value; `value`: each its own. */
            per?: 'scale' | 'value';
            /** The least largest value that is compacted. Default 10,000. */
            threshold?: number;
            /** Where: measure-axis ticks, value labels, or both (default). Tooltips always print the full value. */
            on?: Array<'axis' | 'labels'>;
            /** The semantic types (or families) compacted. Default Amount, Price, Profit, Count, Number, Quantity. */
            types?: string[];
        };
    };
    pointEmphasis?: 'never' | 'endpoints' | 'latest' | 'extremes';
    pointLabels?: 'never' | 'endpoints' | 'all';
    statistics?: { show?: string[]; placement?: 'panel' | 'caption' };
}

/**
 * Where a piece of header furniture sits, top to bottom:
 * - `canvasTop` — on the canvas's top edge (y = 0), above everything, outside the margin;
 * - `aboveTitle` — a line between the edge and the headline (a figure label, a wordmark, a logo); it
 *   pushes the title down;
 * - `besideTitle` — level with the headline, at its start or end; it takes width from the title,
 *   which is fitted to what is left;
 * - `belowTitle` — between the title block and the plot (a rule).
 */
export type FurnitureZone = 'canvasTop' | 'aboveTitle' | 'besideTitle' | 'belowTitle';

/**
 * What `align` and a full-width span are measured against:
 * - `canvas` — the exported graphic's outer edges;
 * - `content` — the canvas inside its margin, where the headline starts;
 * - `block` — the plot with its axes and labels (only a `belowTitle` rule spans it).
 */
export type FurnitureFrame = 'canvas' | 'content' | 'block';

export interface ThemeFurniture {
    /**
     * `rule` — a line across its frame; `band` — a filled strip across its frame; `tab` — a short
     * block (the Economist's red tab); `text` — a wordmark or credit; `image` — a logo, from inline
     * `svg` or an image `src`. `mastheadTab`, `headerRule` and `footerRule` are the earlier names:
     * a tab above the title at the content's start, a rule below the title across the block, and a
     * rule below the plot.
     */
    kind: 'rule' | 'band' | 'tab' | 'text' | 'image' | 'mastheadTab' | 'headerRule' | 'footerRule';
    /** Where it sits. Defaults: `canvasTop` for rules, bands and tabs; `aboveTitle` for text and images. */
    at?: FurnitureZone;
    /** What it is aligned to or spans. Defaults: `canvas` for a rule or band on the edge, else `content`. */
    frame?: FurnitureFrame;
    /** Which end of its frame it sits at. Default `start`. Rules and bands span the frame. */
    align?: 'start' | 'end';
    /** The earlier corner placement, read by `mastheadTab`, `headerRule` and `footerRule`. */
    anchor?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
    color?: string;
    /** px. A tab's or image's width; a rule or band spans its frame unless given one. */
    width?: number;
    /** px. A rule's weight, a band's or tab's or image's height. */
    height?: number;
    /** The words of a `text` item, set in `type` (else the deck's type). */
    text?: string;
    type?: TypeRole;
    /** Inline SVG markup for an `image` item. */
    svg?: string;
    /** An image URL or data URI for an `image` item. */
    src?: string;
    /** Where the item links to, when it is clicked. */
    href?: string;
    /** The image's text alternative. */
    alt?: string;
}

/**
 * The source line (S1). The chart says what the source is (`chart_spec.source`); the house says how
 * it reads: a lead-in, where it sits, a rule above it, a credit of its own. Set in `type.footnote`.
 */
export interface ThemeSource {
    /** `whenGiven` (default) draws the chart's source; `never` leaves it to the host page. */
    show?: 'whenGiven' | 'never';
    /** The words before the source; default `"Source:"`, `""` for none. */
    leadIn?: string;
    /** The lead-in's weight, slope and case, where they differ from the source's. */
    leadInWeight?: TypeWeight;
    leadInStyle?: 'normal' | 'italic';
    leadInCase?: 'upper' | 'lower' | 'title' | 'sentence';
    /** Which end of the frame the line sits at; default `start`. */
    align?: 'start' | 'end';
    /** `content` (default): inside the margin, with the headline; `canvas`: the graphic's outer edges. */
    frame?: 'content' | 'canvas';
    /** A rule across the frame above the source line. */
    rule?: { presence?: Presence; width?: number; color?: string; dash?: number[] };
    /**
     * The house's own credit: `inline` after the source (with `separator`), at the frame's other
     * `end`, or on the `nextLine`.
     */
    credit?: {
        text: string; placement?: 'inline' | 'end' | 'nextLine'; separator?: string; weight?: TypeWeight;
        /**
         * A logo in place of the credit's words, at the frame's other end, level with the source
         * (`placement: "end"` only; `text` stays its alternative text): inline `svg` or a `src` URL
         * or data URI (PNG works), drawn `width`×`height` px.
         */
        image?: { svg?: string; src?: string; width: number; height: number };
    };
    /** px between the chart and the source line (or its rule); default 8. */
    gap?: number;
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
    /**
     * Air around the plot: the canvas padding, and a key's gap to the plot (0.8, 1 or 1.4 em of its
     * labels, unless `legend.gaps.plot` says). Not the ruler's gradations — those are `tickDensity`.
     */
    density?: 'compact' | 'normal' | 'airy';
    targetWidth?: number;
    titleBlock?: {
        anchor?: 'start' | 'middle' | 'end';
        /** Place the semantic title above the chart or as a caption below it. */
        position?: 'top' | 'bottom';
        /**
         * The vertical gap between the title block and the chart below it — a
         * house's whitespace personality reaching the headline. `tight` packs
         * the chart up under the title (a dense figure, a dashboard tile);
         * `loose` gives an action title room to breathe (a slide exhibit). Keys above the plot join
         * the block: the title stands an em over them (`legend.gaps.title`), and this gap
         * stands below them.
         */
        gap?: 'tight' | 'normal' | 'loose';
        /** The vertical gap between the headline and its deck (subtitle). */
        deckGap?: 'tight' | 'normal' | 'loose';
        /**
         * The edge the title block starts from: `content` (default) — the canvas inside its margin,
         * past the category labels; `plot` — the plot's own left edge, so the headline lines up with
         * the start of the x axis.
         */
        frame?: 'content' | 'plot';
    };
    bandStep?: number;
    /**
     * How strongly category pitch follows the available discrete-axis span.
        * On sparse one-banded axes, `0` preserves `bandStep`, `1` fills the span,
        * and intermediate values linearly blend the two. Under pressure normal
        * elasticity applies to `bandStep`. A grid's cells (both axes banded) are not bars: they keep
        * their reading target, and grow past it toward the size that fills the base by this share, to
        * twice the target at most.
     */
    bandStepFit?: number;
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
    then: Partial<Omit<ThemeSpec, 'extends' | 'id' | 'label' | 'ink' | 'type' | 'variants'>>;
    /** Required: a variant without a stated reason is an inconsistency. */
    because?: string;
}

/**
 * The geometries a chart can be built out of, named by what the reader does
 * with the shape rather than by the renderer's mark.
 *
 * `band` and `cell` are the reason this list exists and is not just a list of
 * mark types: Vega-Lite draws both with `rect`, but a bar in a row and a tile
 * in a grid take opposite answers to the same question. A gap between bars is
 * rhythm; a gap between cells cuts a continuous field into a table.
 */
export type GeometryKind = 'line' | 'point' | 'area' | 'band' | 'arc' | 'cell';

export interface LineGeometry {
    width?: number;
    opacity?: number;
    cap?: 'butt' | 'round' | 'square';
    join?: 'miter' | 'round' | 'bevel';
    interpolation?: 'linear' | 'monotone' | 'step';
    /**
     * A wash under each line, down to the baseline, in the line's own ink: `tint` is a flat pale
     * fill, `fade` runs from the ink at the line to clear at the baseline. Default `none`.
     */
    wash?: 'none' | 'tint' | 'fade';
    /** How strong the wash is where it meets the line, 0–1 (default 0.12 for `tint`, 0.3 for `fade`). */
    washOpacity?: number;
}

export interface PointGeometry {
    /** Whether a line carries a dot at each reading. A scatter's dots are the chart, not this. */
    presence?: Presence;
    /** Area in px², the way both the renderer and the size channel state a dot. */
    size?: number;
    /**
     * The area a dot takes when it is a *vertex* on a path rather than the
     * reading itself. McKinsey draws a 30px² dot on its line and a 90px² one on
     * a dumbbell, where the dot is the measurement; one number cannot say both.
     * Falls back to {@link size}.
     */
    vertexSize?: number;
    fill?: 'solid' | 'hollow';
    /** The glyph every dot is drawn as: `circle` (default), `square`, `diamond`, `triangle` or `cross`. */
    shape?: PointShape;
    /**
     * How opaque a dot is, 0–1. Unset, the renderer's own: Vega-Lite draws a scatter's dots at 0.7
     * so overlaps show through. A house whose marks are flat planes states 1. Dots a full plot shrinks
     * rise toward solid, holding diameter × opacity. A chart's own
     * `opacity` property still wins.
     */
    opacity?: number;
    /** The ink of a line's vertex dots: `series` (default), `text`, or a colour. */
    ink?: 'series' | 'text' | string;
    outlineWidth?: number;
    /**
     * A ring in the plot's colour around each dot, so overlapping dots stay countable. A line's dots
     * get one wherever lines can cross unless this says `omit`; a scatter's dots only where it is
     * declared. A quarter of the dot's radius, at most `width`; a scatter's dots under 28px² get
     * none. An outline takes its place. Not combined with an `opacity` below 1: ringed dots are solid.
     */
    halo?: { presence?: Presence; width?: number };
    /**
     * Which lines keep the dots (M5): `countable` (default) — lines of up to 12 readings; `all` —
     * every line, the dots shrinking to fit; `sparse` — only where readings stand 20px apart or more.
     */
    density?: 'countable' | 'all' | 'sparse';
}

export interface AreaGeometry {
    opacity?: number;
    /** The line along the top of the fill: an area that keeps its edge reads as a line with a wash. */
    edge?: Presence;
    edgeWidth?: number;
    interpolation?: 'linear' | 'monotone' | 'step';
    /**
     * `fade` runs the fill from the area's ink at its top to clear at the baseline. Stacked bands
     * keep a solid fill: each sits on the next, and a fade would melt one into the other.
     */
    fill?: 'solid' | 'fade';
}

export interface BandGeometry {
    /** How much of its step the bar fills, 0–1. The rest is the gap. */
    fraction?: number;
    /**
     * Grouped (dodged) bars: `gap` between the bars in a group and `spacing` between groups, each a
     * share of a bar's width (`0` touching, `1` a bar's width) or px (`"2px"`); the bars take what is
     * left of the step: the bar's width is derived, and the step is a guideline. Unset `spacing`
     * keeps `fraction` for the group as a whole, but never less than half a bar or three gaps, so
     * groups read as groups; unset `gap` is a twentieth of a bar, at least 1px.
     */
    group?: { gap?: GapSize; spacing?: GapSize };
    /** Rounding at the *value* end only, so a stack still reads as one column. */
    cornerRadius?: number;
    opacity?: number;
    outline?: Presence;
    outlineWidth?: number;
    /** The ink of the outline: the structure ink (default), the surface, or each bar's own series ink. */
    outlineInk?: 'ink' | 'surface' | 'series';
    /**
     * The least length, px, a bar with a non-zero value is drawn (M6): a near-zero bar shows as a
     * stub at the baseline rather than vanishing into it. Zero stays empty.
     */
    minLength?: number;
}

export interface ArcGeometry {
    cornerRadius?: number;
    /** How far neighbouring wedges stand apart, in px. */
    gap?: number;
    /** `rule` paints the shared edge; `pad` swings the wedges apart. */
    gapStyle?: 'rule' | 'pad';
    /**
     * The order wedges run clockwise from the start (M4): the data's order (default), or largest
     * first. A chart that sorts its own slices keeps its sort.
     */
    order?: 'data' | 'largestFirst';
    /** Where the first wedge starts, in degrees clockwise from 12 o'clock (default 0). */
    startAngle?: number;
    /** The hole as a share of the outer radius, 0–0.9, for every donut the house draws. */
    hole?: number;
}

export interface CellGeometry {
    /** Cut between tiles, in px. Zero keeps the grid a continuous field. */
    gap?: number;
    cornerRadius?: number;
    opacity?: number;
}

/**
 * Geometry the house states once and every chart built from that shape reads.
 *
 * Measured against the theme lab: `line.width`, `point.presence` and
 * `point.size` all split inside a replicated cluster — one chart, many
 * languages, different answers — so they are house decisions and belong here.
 * `point.fill` did not split, which is why nothing here asks a house to state it.
 *
 * There is deliberately no per-chart-type sibling to this block. The lab was
 * asked for one and refused: of the twelve (house, chart type) groups holding
 * more than one chart, eight disagree with themselves, so a rule keyed by chart
 * type could not have carried them anyway. What the disagreements track is
 * series count and faceting — NYT, the Economist and Power BI all thin their
 * line to exactly 2px for the four-series chart and run 2.2–2.5px for a lone
 * one, and Power BI drops its dots only on the sixteen-panel facet. Those are
 * `variants`, over signals the compiler already resolves, and a variant may
 * carry a `geometry` block.
 */
export interface ThemeGeometry {
    line?: LineGeometry;
    point?: PointGeometry;
    area?: AreaGeometry;
    band?: BandGeometry;
    arc?: ArcGeometry;
    cell?: CellGeometry;
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
 * dropped. So is a key that changes how the data is read rather than how the
 * chart looks: axis type, zero baseline, log scale, transform, encoding actions.
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

export interface ThemeInteraction {
    tooltipFormat?: string;
    /** Paint for the exterior of a contiguous semantic selection. */
    selectionBoundary?: {
        color?: string;
        width?: number;
        opacity?: number;
        haloColor?: string;
        /** Set to zero to disable the contrast halo. */
        haloWidth?: number;
        haloOpacity?: number;
    };
}

/**
 * Level 1. One JSON document per design language.
 *
 * Every field is optional, including the ink and the type. A house that states
 * nothing is not an error — it is the neutral house, and grounding it yields
 * Flint's own defaults. That matters beyond tidiness: it is what lets the
 * compiler reason about a chart's design (can it carry value labels? at this
 * density?) when the caller named no house at all, without having to invent a
 * second, parallel set of rules for the untheme'd case.
 */
export interface ThemeSpec {
    /**
     * Start from a theme Flint ships, then override only the fields this
     * specification states. Nested objects merge; arrays and scalar values
     * replace the preset value.
     */
    extends?: string;
    id?: string;
    label?: string;
    ink?: ThemeInk;
    type?: ThemeType;
    structure?: ThemeStructure;
    marks?: ThemeMarks;
    labels?: ThemeLabels;
    legend?: ThemeLegend;
    dataLabels?: ThemeDataLabels;
    annotation?: ThemeAnnotation;
    furniture?: ThemeFurniture[];
    /** How a chart's source line is drawn, when the chart gives one (`chart_spec.source`). */
    source?: ThemeSource;
    facets?: ThemeFacets;
    layout?: ThemeLayout;
    geometry?: ThemeGeometry;
    chartDefaults?: ThemeChartDefaults;
    compileDefaults?: ThemeCompileDefaults;
    interaction?: ThemeInteraction;
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
    /**
     * A 16px SVG standing in for the house in a picker, as a complete document
     * so a caller can drop it straight into an `<img>` or inline it.
     *
     * It is drawn from the house's own decisions rather than invented: the tile
     * is its canvas, the bars are the first three of its categorical set, and
     * the one thing left over says what the house does that the others do not —
     * the Economist's red tab, Swiss's structural black rules, McKinsey's
     * horizontal bars, Nature's bare axis, cartoon's rounded tops. At this size
     * that is all a reader can take in, and it is enough to recognise the house
     * once they have seen one chart in it.
     */
    icon: string;
    spec: ThemeSpec;
}

// ---------------------------------------------------------------------------
// Level 2 — grounded DesignDecisions
// ---------------------------------------------------------------------------

/**
 * A downgrade or approximation. Silent fallbacks are indistinguishable from
 * bugs, so every one of these is surfaced on `spec._theme.report`.
 */
/**
 * Where a chart departs from what its theme or author stated, or where a stated option cannot apply
 * to this chart, and why. A setting applied as stated is not reported.
 */
export interface ThemeReport {
    stage: 'ground' | 'realize';
    /** Dotted ThemeSpec path this concerns, e.g. `legend.placement`. */
    path: string;
    /** What kind of departure, in kebab case, e.g. `straight-refused`: stable for code and tests to read. */
    code: string;
    message: string;
}

/** Records a departure: the ThemeSpec path it concerns, its code, and a message saying why. */
export type ReportDeparture = (path: string, code: string, message: string) => void;

export interface ResolvedSource {
    show: boolean;
    text: ResolvedText;
    leadIn: string;
    leadInWeight?: 'normal' | 'bold' | number;
    leadInStyle?: 'normal' | 'italic';
    leadInCase?: 'upper' | 'lower' | 'title' | 'sentence';
    align: 'start' | 'end';
    frame: 'content' | 'canvas';
    rule?: { width: number; color: string; dash?: number[] };
    credit?: { text: string; placement: 'inline' | 'end' | 'nextLine'; separator: string; weight?: 'normal' | 'bold' | number; image?: { src: string; width: number; height: number } };
    gap: number;
}

/**
 * The house's say in an annotation's colours and words: its `ink.accent` and categorical hues for a
 * region's wash, its `type.annotation` role for a note's words, and the primary text ink a note is
 * set in otherwise.
 */
export interface AnnotationDesign {
    accent?: string;
    /** The house's categorical hues, the first a region's wash is chosen from. */
    palette?: readonly string[];
    text?: ResolvedText;
    ink: string;
    /** The page an annotation is read on: the plot's own surface, else the canvas. */
    background: string;
}

export interface ResolvedText {
    font?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold' | number;
    fontStyle?: 'normal' | 'italic';
    color?: string;
    /** The case the role asks for; unset when the text is drawn as written. */
    textCase?: 'upper' | 'lower' | 'title' | 'sentence';
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
    label: ResolvedText & { show?: boolean; limit?: number; padding: number; flush?: boolean; angle?: number; overflow?: LabelFitStep[]; ordered?: boolean };
    title: {
        show: boolean;
        placement?: 'rotated' | 'flatAboveAxis' | 'inline' | 'subtitle';
        gap?: number;
        unit?: string;
        /**
         * In the deck only where it is not already named: `true` checks the headline and the deck (a
         * title whose ruler printed values replaced); `'deck'` checks the author's deck alone (a house
         * that keeps every axis title in the deck, whose headline is free to say something else).
         */
        unlessNamed?: boolean | 'deck';
    } & ResolvedText;
    /** Preferred tick count; undefined = let the renderer choose. */
    tickCount?: number;
    /** The px between labels a measure axis is graduated at. */
    tickSpacing?: number;
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
    /** How the ticks of a measure the theme compacts are shortened; the unit is chosen from the ticks. */
    compact?: CompactRule;
    /** Fainter lines between the labelled gridlines, where this axis's grid carries them. */
    minorGrid?: ResolvedRule & { divisions: number };
    /** The grid drawn over the marks rather than behind them. */
    gridFront?: boolean;
}

export interface ResolvedSeriesInk {
    mode: 'single' | 'categorical' | 'sequential' | 'diverging' | 'status';
    single: string;
    categorical: string[];
    /** The house's text variants, parallel to the categorical tiers. */
    categoricalText?: string[];
    /**
     * Series inks too faint against the plot surface, and what is drawn instead: `stroke` is the
     * darker ink a line takes, `outline` the edge a filled mark gains. Keyed by lower-case ink.
     */
    visibility?: { stroke: Record<string, string>; outline: Record<string, string> };
    /**
     * Inks bound to the values present in this chart — the chart's own colours, else the house's role
     * inks — keyed by the value trimmed and lower-cased.
     */
    byValue?: Record<string, string>;
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
    /**
     * One series of bars whose measure crosses zero, in a house that colours signed values by
     * status: each bar takes `status.positive` or `status.negative` by the sign of its own value.
     */
    signedStatus?: boolean;
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
    /** Whether the house titles every key, or only those whose labels do not say what they are. */
    titlePolicy?: 'always' | 'whenAmbiguous';
    label: ResolvedText;
    /** How a key's title is set: the house's `type.keyTitle`, else the labels' face in bold and the secondary ink. */
    titleText: ResolvedText;
    gradientLength?: number;
    /** The most entries a key to values may spend. */
    maxSwatches?: number;
    /** A symbol the house states for every entry of a key to categories; unset, the mark's own. */
    swatch?: 'square' | 'circle' | 'line';
    /** How several keys stand, as the theme prefers; unset leaves it to the plan. */
    arrangement?: ThemeLegend['arrangement'];
    titlePosition?: ThemeLegend['titlePosition'];
    align?: ThemeLegend['align'];
    /** Series-end names carry the series' last value. */
    endValue?: boolean;
    gaps?: ThemeLegend['gaps'];
}

export interface ResolvedDataLabels {
    show: boolean;
    placement: 'atMark' | 'outsideMark' | 'column';
    inkMode: 'fixed' | 'matchSeries' | 'contrastWithMark';
    /** Where an inside label sits along its bar. */
    anchor: 'end' | 'start' | 'middle';
    fallback: 'perMark' | 'allOutside';
    minContrast: number;
    text: ResolvedText;
    /** d3-format string derived from `annotation.numberFormat` + channel semantics. */
    format?: string;
    /** How the labels are compacted, where the theme compacts them; `format` stays the fallback. */
    compact?: CompactPrint;
    /**
     * The unit each printed value carries: a compact unit the field declares
     * (`%`, `$`, `°C`) unless the format already writes it, else `%` on
     * part-to-whole values that sum to 100.
     */
    unit?: string;
    /**
     * Below this magnitude the mark is shorter than its own label, so an
     * inside label would overrun it. Grounding owns this because it is a
     * question about space, not about style.
     */
    insideMinValue?: number;
    /**
     * The smallest share of the measure axis a stacked segment may occupy and
     * still be labelled — a line of text over the plot's extent along that
     * axis. Segments below it get no number: it would not fit between the
     * segment's edges and would read as its neighbour's.
     *
     * A share rather than a value because the two stack modes divide by
     * different totals — the tallest stack when the bars are summed, each
     * bar's own total when they are normalized. Grounding owns it because
     * only grounding knows the plot's size; by the time a spec is assembled
     * the height may be a step or a container, not a number.
     */
    segmentMinShare?: number;
    /**
     * `segmentMinShare` as a value on a summed stack: the share of the tallest
     * stack. Absent on a normalized stack, whose segments divide by their own
     * bar's total.
     */
    segmentMinValue?: number;
    /**
     * The band step (px, along the categorical axis, per group where bars are grouped) the labels
     * need where the band is too narrow for them; the plan widens into the canvas's spare room (L3).
     */
    bandNeed?: { channel: 'x' | 'y'; step: number };
    /**
     * The signal a live layout re-plans the labels through. Set when the
     * visible rows can change after compile: the label layer is built even
     * where these rows do not print it, and the signal decides whether it shows.
     */
    liveSignal?: string;
    /**
     * Whether this chart could carry value labels *at all* — structurally
     * labelable, and not so dense that the numbers would be unreadable however
     * firmly they were asked for.
     *
     * `show` is what the house decided; this is what the chart permits. A host
     * reads it to know whether offering the reader a labels control is
     * meaningful: where it is false the control can do nothing, so it is not
     * shown rather than shown broken.
     */
    possible: boolean;
}

export interface ResolvedMarks {
    bandFraction: number;
    /** How grouped bars share their step. */
    group: GroupSpacing;
    /** Set only when the house asks for one. */
    gradient?: { area?: 'fade'; lineWash?: { style: 'tint' | 'fade'; opacity: number } };
    strokeWidth: number;
    strokeCap?: string;
    strokeJoin?: string;
    interpolate?: string;
    fillOpacity?: number;
    /** Corner radius for the value end of a bar, and a wedge's corners, in px. */
    cornerRadius?: number;
    /** A stroke around each filled bar/wedge/point: the sticker edge (thin bars skip it). `series`: in each mark's own ink. */
    outline?: { color: string; width: number; series?: boolean };
    /** How opaque a bar's fill is, where the house says. */
    barOpacity?: number;
    /** The least length, px, of a non-zero bar. */
    barMinLength?: number;
    /** The line along the top of each area, in its own ink (stacked bands included). */
    areaEdge?: { width: number };
    point?: {
        show: boolean;
        size?: number;
        secondarySize: number;
        /** Set only where the house sized path vertices apart from its primary dots. */
        vertexSize?: number;
        filled?: boolean;
        /** Set only where the house named a glyph other than the circle. */
        shape?: PointShape;
        /** Set only where the house stated how opaque its dots are. */
        opacity?: number;
        /** A fixed ink for a line's vertex dots; unset, they take the series' ink. */
        ink?: string;
        /** Which lines keep their dots. */
        density: 'countable' | 'all' | 'sparse';
        haloColor?: string;
        haloWidth?: number;
        /** Set where the house declared a halo: standalone dots (a scatter's) carry it too, not only a line's. */
        haloDots?: boolean;
    };
    /** The area a sized mark may take, smallest to largest, in px². */
    sizeRange?: [number, number];
    /** The area below which a sized mark stops being a mark. */
    minSize?: number;
    /** Whether the rows behind a summary mark are drawn alongside it. */
    observations?: { expose: 'never' | 'whenSparse' | 'always'; maxRows: number };
    separator?: { show: boolean; color: string; width: number };
    /** How far apart neighbouring wedges of a pie or donut stand, in px. */
    slice?: { gap: number; style: 'rule' | 'pad'; color: string };
    /** Wedge order, start angle and hole, where the house says. */
    arc?: { order?: 'data' | 'largestFirst'; startAngle?: number; hole?: number };
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
    redundant: {
        shape: boolean;
        dash: boolean;
        /** Pattern fills on filled marks, when the house asks for the texture channel. */
        texture?: { patterns: TexturePattern[]; ink: 'darker' | 'white'; spacing: number };
    };
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
        position: 'top' | 'bottom';
        headline: ResolvedText;
        deck: ResolvedText;
        /** The figure label or kicker above the headline. */
        kicker: ResolvedText;
        /** The edge the title block starts from. */
        frame: 'content' | 'plot';
        /** Gap from the title block to the chart, in px. */
        offset: number;
        /** Gap between the headline and its deck, in px. */
        deckPadding: number;
    };
    /** Bound axes, keyed by screen channel. */
    axes: { x?: ResolvedAxis; y?: ResolvedAxis };
    frame: ResolvedRule;
    /**
     * The rule the marks stand on. `anyFloor`: the house states it strongly — emphasised, or with
     * its own ink or weight — so it is drawn along the axis's floor even where that is not zero.
     */
    baseline: ResolvedRule & { anyFloor?: boolean };
    /** What the axis lines are where the value scale floats (`structure.axis.floating`); unset, inferred from the axes. */
    floating?: 'omit' | 'keep' | 'rangeFrame';
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
    interaction: {
        continuousColorFocus: {
            mutedFill: string;
            boundaryWidth: number;
            boundaryOpacity: number;
            haloWidth: number;
            haloOpacity: number;
        };
        selectionBoundary: {
            color: string;
            width: number;
            opacity: number;
            haloColor: string;
            haloWidth: number;
            haloOpacity: number;
        };
        /** How the house sets the notes, regions and enclosures an update draws. */
        annotation: AnnotationDesign;
    };
    facets: {
        header: { show: boolean; fieldTitle: boolean } & ResolvedText;
        panelFrame: boolean;
        axisRepetition: 'everyPanel' | 'edgeOnly';
        spacing?: number;
        preferredColumns?: number;
    };
    /** Plot dimensions and step are what layout settled, so realization can test whether annotations fit. */
    layout: {
        padding: number;
        density: 'compact' | 'normal' | 'airy';
        plotWidth?: number;
        plotHeight?: number;
        xStep?: number;
        /** The graphic the caller asked for. Wider than `plotWidth` by the axis gutter. */
        canvasWidth?: number;
    };
    /**
     * What the house prints alongside a fit: the quantities it expects to see
     * stated, and where. Only meaningful where the chart actually fits
     * something — stage 3 knows that, stage 2 does not.
     */
    statistics?: { show: string[]; placement: 'panel' | 'caption' } & ResolvedText;
    /** The KPI's big number, when the house states the display role; its size stays fitted to the tile. */
    display?: ResolvedText;
    /**
     * A chart read as a table: headings in the axis-title role and cells in the axis-label role at
     * the theme's own sizes, since a table takes the room it needs, and the rules under the
     * headings and between rows.
     */
    table: { header: ResolvedText; cell: ResolvedText; headerRule: string; rule: string };
    /** How a source line is drawn, when the chart gives one. */
    source: ResolvedSource;
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
