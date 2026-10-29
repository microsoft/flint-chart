import type { ChartAnalysis } from './analyze';
import type { AssembleOptions, CanvasTreatment, ChannelSemantics, ChartEncoding, ChartWarning, LayoutDeclaration, LayoutResult, OverflowResult, PlanStage, PlotPlanContext } from './types';
import type { DesignDecisions, ThemeReport, ThemeSpec } from './theme/types';
import { computeChannelBudgets, computeLayout, DEFAULT_MAX_STRETCH, deriveStretchCaps, planBandLabels, resolveFacetColumnsOption } from './compute-layout';
import { fontWeightOf, groundTheme, headlineText, resolveBandFraction, resolvedGroupSpacing, resolveThemeFontSize, resolveValueLabelChoice, themeBodyFamily } from './theme/ground';
import { filterOverflow } from './filter-overflow';
import { axisRoles, type AxisFieldFacts } from './axis-roles';
import { applyTextCase } from './text-case';
import { planHeader, type HeaderPlan } from './header-plan';
import { axisTitles, chartDisplayNames, chartStructure, segmentedBands, stackedAxis, type ChartStructure } from './structure';
import { continuousBandSpan, freeHeadroom, measureDomain, measureExtent, type MeasureDomain } from './measure-domain';
import { groupPadding } from './group-gaps';
import { planSource, type SourcePlan } from './source-plan';
import { fitInsideLabels, planValueLabels, someLabelsOverrun, type ValueLabelPlan } from './value-label-plan';
import { fitArcLabels } from './arc-label-fit';
import { niceDomain, spacingRuler, type AxisRuler } from './ruler';
import { planFurniture, rulerOverhang, type FurniturePlan } from './furniture-plan';
import { categoryOrder, encodedType, sizeRange, type CategoryOrder } from './channel-decisions';
import { planLegendPlacement, type RunValueScale } from './series-end';
import { keysToLayout, planLegend, type LegendPlan } from './legend-plan';
import { familyMeasure, hostTextMeasurer, measuresDrawnFace, tableTextMeasurer } from './text-width';
import { valueLabelMeasurer } from './value-label-measure';
import { planKeyLayout, type KeyToLayout, type TextMeasurer } from './legend-layout';
import { fitAxisTitle, type AxisTitleFit } from './axis-title-fit';
import { keyGaps } from './header-gaps';
import { FALLBACK_WIDEN, naturalAspectRange, widenRange } from './natural-shape';
import { encodingTitle } from './structure';
import { format as formatNumber } from 'd3-format';
import { chartBlock, fittedTitleWidth, heightAfterTitle, keysBesideWidth, nearestCentredShift, planTitle, type TitlePlan } from './title-plan';
import { planRules, withRules, type ClosingRule } from './rule-plan';
import { plotHeightAfter } from './title-fit';
import { planAxisLabels, resolveLabelOverflow, type AxisLabelPlan } from './axis-labels';
import { sequenceKindOf } from './label-sequence';
import { LAYOUT_COSTS } from './layout-costs';
import { CANVAS_FIT_LIMITS, LEGIBILITY_MARGIN, describeTreatment, plotFitScale, judgeCanvas, readingCost, treatmentCost, type CanvasFitEstimate, type CanvasFitResult, type CanvasParts } from './canvas-fit';
import { measureReserve, NO_RESERVE, type FurnitureReserve, type FurnitureSpacing } from './furniture-reserve';
import { facetViews, gapOf, shortenViews, viewsExtent, type ViewNode } from './views';
import { denseLineWidth, linesPerPanel, panelCount } from './line-density';

/** The layout options a backend lays out with when neither the caller, the theme, nor the template sets them. */
export interface BackendLayoutProfile {
    /** Under the caller's options and the template's overrides. */
    defaults: AssembleOptions;
    /** Filled in after the theme's band step is settled, wherever the option is still unset. */
    fallbacks: AssembleOptions;
    /** Padding, in steps, of a band axis whose offset channel nests marks within each band. */
    nestedBandPadding: { inner: number; outer: number };
    /** How the backend spells a data field in its spec. */
    spellField: (name: string) => string;
    /** How the backend measures text it sets; unset reads the width table. */
    measureText?: TextMeasurer;
    /** The room the backend sets around text where the theme states none. */
    spacing: FurnitureSpacing;
    /** The sizes the backend draws a headline and deck at where no theme sets them. */
    titleSizes?: { headline: number; deck: number };
}

/** The size a chart is planned into. */
export interface LayoutSize {
    /** The target size, clamped to `canvasSize`. */
    baseSize: { width: number; height: number };
    /** The hard ceiling, when the spec or the theme sets one. */
    canvasSize?: { width: number; height: number };
}

export interface LayoutPlan {
    /** The plot the chart draws: a banded axis spans its step times its count. One panel's, when composite. */
    plot: { width: number; height: number };
    /** Whether the chart draws several views (facets, or a composite template), so it has no single plot. */
    composite: boolean;
    /** The views the chart draws and how they stand; undefined where a template has not stated them. */
    views?: ViewNode;
    /** The views as laid out, before a broken title and a theme's rules take height from the plot; a template draws these. */
    laidOutViews?: ViewNode;
    /** The rules a theme closes the chart's block with, and whether their room came out of the plot. */
    rules?: { rules: ClosingRule[]; room: number; fromPlot: boolean };
    /** What the chart draws on its canvas's top edge, above its headline and beside it. */
    header?: HeaderPlan;
    /** The names down y set each on its own line above its bar, and where in each band they and the bar stand. */
    rowNames?: RowNamesAbove;
    /** The source line at the chart's foot, where the chart gives one. */
    source?: SourcePlan;
    layout: LayoutResult;
    /** The theme's axis label size at this plot size; undefined without a theme. */
    axisLabelFontSize: number | undefined;
    /** The tick labels each axis draws. */
    axisLabels: Record<'x' | 'y', AxisLabelPlan>;
    /** What the chart draws. */
    structure: ChartStructure;
    /** The theme's decisions for this chart. */
    design: DesignDecisions;
    /** The title each axis prints; null leaves it untitled, undefined leaves it to the backend. */
    axisTitles: Record<'x' | 'y', string | null | undefined>;
    /** Axis titles longer than their axes, wrapped onto two lines at the axis's length, a second line past it cut. */
    axisTitleFit?: Partial<Record<'x' | 'y', AxisTitleFit>>;
    /** The extent Flint gives each quantitative axis that shows a field. */
    domains: Partial<Record<'x' | 'y', MeasureDomain>>;
    /** What the chart draws around its plot, as far as it takes room. */
    furniture: FurniturePlan;
    /** The room kept for the furniture where a banded axis fits its steps to the room; undefined where none does. */
    reserve?: FurnitureReserve;
    /** What the canvas-fit pass found and did, where it ran. */
    canvasFit?: CanvasFitResult;
    /** The order each channel's categories stand in, where Flint sets one. */
    orders: Partial<Record<string, CategoryOrder>>;
    /** The areas a size channel spans, in px², and whether it reads a quantity. */
    sizes?: { range: [number, number]; quantitative: boolean };
    /** Where the chart names its series and the keys it draws. */
    legend: LegendPlan;
    /** The area the theme's dots are drawn at, in px²: its size, less where dots would ink more than 12% of a panel. */
    pointSize?: number;
    /** Where many dots touch another at the size drawn: their share, their number, and that size in px². Noted, not acted on. */
    crowding?: { share: number; points: number; size: number };
    /** The width lines are drawn at, in px, where their number thins them below the house's (or Vega-Lite's) weight. */
    lineWidth?: number;
    /** The px each dot scale opens past its ends so the outermost dot shows whole: the dot's radius, on the axes of dots nothing anchors. */
    /** The dots' outer radius, the axes it opens, and each axis's planned length in px. */
    points?: { radius: number; channels: Array<'x' | 'y'>; lengths?: { x: number; y: number } };
    /** The span each banded continuous axis draws, half a band past its data at each end; dates in epoch ms. */
    bandSpans: Partial<Record<'x' | 'y', { span: [number, number]; temporal: boolean }>>;
    /** The ruler each themed measure axis draws, where Flint owns it. */
    rulers: Partial<Record<'x' | 'y', AxisRuler>>;
    /** The value labels the chart prints, or why it prints none; undefined when none are asked for. */
    valueLabels?: ValueLabelPlan | { refused: string };
    /** How a single-view chart's title is fitted; the plot gives up the height its extra lines take. */
    title?: TitlePlan;
    declaration: LayoutDeclaration;
    /** The options the plan was made with. */
    options: AssembleOptions;
    facetGrid: ReturnType<typeof computeChannelBudgets>['facetGrid'];
    /** The rows that fit, after overflow truncation. */
    rows: any[];
    nominalCounts: OverflowResult['nominalCounts'];
    viewports: OverflowResult['viewports'];
    warnings: ChartWarning[];
    report: ThemeReport[];
    /** Why each part of the plan is as it is: the rules it passed through, in order, and what they read. */
    reasons: PlanReason[];
}

/** Why one part of the plan is as it is. */
export interface PlanReason {
    part: 'canvas' | 'rows' | 'facets' | 'step' | 'plot' | 'labels' | 'title' | 'legend' | 'rules' | 'values' | 'reserve';
    /** The axis or dimension the part belongs to, where it has one. */
    channel?: 'x' | 'y' | 'width' | 'height';
    /** What was decided, with the numbers in. */
    decision: string;
    /** The rules the value passed through, in order. */
    chain: PlanStage[];
}

const LENGTH_MARKS = new Set(['bar', 'area', 'rect']);

/**
 * The extent of each quantitative axis that shows a field, from the field's semantics and how the
 * chart stacks; an axis whose template states its baseline reads zero from it.
 */
function measureDomains(
    structure: ChartStructure, segmented: boolean, channelSemantics: Record<string, ChannelSemantics>, rows: any[],
): Partial<Record<'x' | 'y', MeasureDomain>> {
    const lengthMark = structure.marks.some((mark) => LENGTH_MARKS.has(mark));
    const summed = segmented && structure.stacking !== 'normalized' ? stackedAxis(structure) : undefined;
    const out: Partial<Record<'x' | 'y', MeasureDomain>> = {};
    for (const channel of ['x', 'y'] as const) {
        const axis = structure[channel];
        if (!axis || axis.type !== 'quantitative') continue;
        const field = channelSemantics[channel]?.field;
        const governed = Boolean(field && !axis.derived && !axis.extent && axis.fields.includes(field));
        const measured: MeasureDomain = governed
            ? measureDomain({ channel, field: field!, summed: summed === channel, lengthMark, channelSemantics, rows })
            : { dropZero: false };
        const domain: MeasureDomain = axis.baseline ? { ...measured, zero: axis.baseline === 'zero' } : measured;
        const stacks = stackedAxis(structure) === channel;
        const extent = measureExtent({
            axis,
            other: structure[channel === 'x' ? 'y' : 'x'],
            stack: stacks && structure.stacking === 'normalized' ? 'normalized'
                : stacks && structure.stacking === 'centered' ? 'centered'
                : summed === channel ? 'summed' : 'none',
            facets: [channelSemantics.column?.field, channelSemantics.row?.field].filter((f): f is string => Boolean(f)),
            lengthMark: lengthMark && stacks,
            domain,
            rows,
        });
        if (governed || extent) out[channel] = extent ? { ...domain, extent } : domain;
    }
    return out;
}

/** The drawn length of each axis: the plot, less the lines a fitted title takes and the room value labels keep past bar ends. */
function drawnLengths(
    plot: { width: number; height: number }, title: TitlePlan | undefined, valueLabels: ValueLabelPlan | { refused: string } | undefined,
): Record<'x' | 'y', number> {
    const inset = valueLabels && !('refused' in valueLabels) ? valueLabels.inset ?? 0 : 0;
    const insets = inset && valueLabels && !('refused' in valueLabels) && valueLabels.negative ? 2 : 1;
    return { x: plot.width - inset * insets, y: heightAfterTitle(plot.height, title) };
}

const ANCHORED_MARKS = new Set(['bar', 'area', 'rect', 'rule', 'arc']);
const DOT_MARKS = new Set(['point', 'circle', 'square']);

/** The smallest step a d3 format can tell apart from its neighbour: what its precision prints. */
function formatResolution(pattern: string | undefined): number {
    const match = pattern?.match(/\.(\d+)([f%])/);
    if (!match) return 0;
    return 10 ** -(Number(match[1]) + (match[2] === '%' ? 2 : 0));
}

/**
 * Whether the chart draws dots nothing anchors: no bar, area, rule or arc, and no zero rule the
 * theme draws where the data crosses zero. Realization pads such dots off the plot's edge.
 */
function unanchoredDots(structure: ChartStructure, design: DesignDecisions, rows: any[]): boolean {
    const crossesZero = (field: string | undefined) => Boolean(field)
        && rows.some((row) => Number(row?.[field!]) < 0) && rows.some((row) => Number(row?.[field!]) > 0);
    const zeroRuled = (['x', 'y'] as const).some((channel) => design.axes[channel]?.zeroRule?.show
        && !structure[channel]?.derived && crossesZero(structure[channel]?.fields[0]));
    return structure.marks.some((mark) => DOT_MARKS.has(mark)) && !structure.marks.some((mark) => ANCHORED_MARKS.has(mark)) && !zeroRuled;
}

/** The least a dense chart takes a dot down to, in px²: about 6 px across, still a dot to see and point at. */
const MIN_DENSE_POINT_SIZE = 30;
/** The least share of the house's dot a dense chart keeps, by area, so its dot keeps its character. */
const MIN_DENSE_POINT_SHARE = 0.5;
/** The share of a panel a chart's dots may ink between them. */
const DOT_INK_SHARE = 0.12;
/** The share of dots touching another past which the chart notes the crowding. */
const CROWDED_SHARE = 0.4;
/** The fewest dots worth a note about crowding. */
const CROWDED_MIN_POINTS = 50;
/** The most dots the overlap count reads; past it, an even sample stands for the rest. */
const OVERLAP_SAMPLE = 2000;
/** Vega-Lite's own dot area, which a chart without a house's size draws. */
const VEGA_DOT_SIZE = 30;


/** A field's values as numbers along a continuous axis: dates as epoch ms, a log axis by its logarithm. */
function axisPositions(rows: any[], field: string, temporal: boolean, log: boolean): (number | undefined)[] {
    return rows.map((row) => {
        const raw = row?.[field];
        const value = temporal ? (raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : Date.parse(String(raw))) : Number(raw);
        if (raw == null || raw === '' || !Number.isFinite(value) || (log && value <= 0)) return undefined;
        return log ? Math.log(value) : value;
    });
}

/**
 * The share of dots that touch another at `size` px², placed by their own extent on the panel. The
 * extent fills the panel, so the count errs low, never high. Undefined where the dots are not placed
 * on two continuous axes.
 */
function dotTouchShare(
    rows: any[], plot: { width: number; height: number }, size: number, channelSemantics: Record<string, ChannelSemantics>,
    typeOf: (channel: 'x' | 'y') => string | undefined,
): { share: number; points: number } | undefined {
    const axes = (['x', 'y'] as const).map((channel) => {
        const field = channelSemantics[channel]?.field;
        const type = typeOf(channel);
        if (!field || (type !== 'quantitative' && type !== 'temporal')) return undefined;
        return axisPositions(rows, field, type === 'temporal', channelSemantics[channel]?.scaleType === 'log');
    });
    const [xs, ys] = axes;
    if (!xs || !ys) return undefined;
    const placed: [number, number][] = [];
    for (let index = 0; index < rows.length; index++) {
        if (xs[index] !== undefined && ys[index] !== undefined) placed.push([xs[index]!, ys[index]!]);
    }
    if (placed.length < 2) return undefined;
    const step = Math.max(1, Math.floor(placed.length / OVERLAP_SAMPLE));
    const sample = step > 1 ? placed.filter((_, index) => index % step === 0) : placed;
    const extent = (pick: 0 | 1) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const point of sample) { lo = Math.min(lo, point[pick]); hi = Math.max(hi, point[pick]); }
        return { lo, span: hi - lo || 1 };
    };
    const ex = extent(0);
    const ey = extent(1);
    const px = sample.map(([x, y]) => [((x - ex.lo) / ex.span) * plot.width, ((y - ey.lo) / ey.span) * plot.height] as const);
    const diameter = 2 * Math.sqrt(size / Math.PI);
    const grid = new Map<string, number[]>();
    const key = (cx: number, cy: number) => `${cx},${cy}`;
    px.forEach(([x, y], index) => {
        const cell = key(Math.floor(x / diameter), Math.floor(y / diameter));
        const list = grid.get(cell);
        if (list) list.push(index); else grid.set(cell, [index]);
    });
    let touching = 0;
    px.forEach(([x, y], index) => {
        const cx = Math.floor(x / diameter);
        const cy = Math.floor(y / diameter);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const hit = grid.get(key(cx + dx, cy + dy))?.some((other) => other !== index
                    && (px[other][0] - x) ** 2 + (px[other][1] - y) ** 2 < diameter * diameter);
                if (hit) { touching++; return; }
            }
        }
    });
    return { share: touching / px.length, points: placed.length };
}

/**
 * The area a theme's dots are drawn at: its size, shrunk where the chart's dots would ink more than
 * 12% of the panel they are drawn in between them, to no less than 30 px² or half the house's dot.
 * Size answers how full the plot is as a whole. Dots that pile up in one place are not separated by
 * smaller dots (ties never are) and every other dot pays for it, so crowding is noted, not shrunk.
 */
function planPointSize(
    design: DesignDecisions, structure: ChartStructure, rows: any[], plot: { width: number; height: number },
    channelSemantics: Record<string, ChannelSemantics>, report: ThemeReport[],
): number | undefined {
    const house = design.marks.point?.size;
    if (house == null) return undefined;
    const perPanel = rows.length / panelCount(rows, channelSemantics);
    const cloud = rows.length > 0 && structure.marks.some((mark) => DOT_MARKS.has(mark));
    if (!cloud) return house;
    const floor = Math.min(house, Math.max(MIN_DENSE_POINT_SIZE, Math.round(house * MIN_DENSE_POINT_SHARE)));
    const size = Math.min(house, Math.max(floor, Math.floor((plot.width * plot.height * DOT_INK_SHARE) / perPanel)));
    if (size !== house) {
        report.push({
            stage: 'ground',
            path: 'marks.point.size',
            code: 'dots-shrunk',
            message: `${Math.round(perPanel)} points would cover too much of the ${Math.round(plot.width)}×${Math.round(plot.height)}px plot at ${house}px² each, so the dots shrink to ${size}px²`,
        });
    }
    return size;
}

/**
 * How crowded a single panel's dots are at the size they are drawn: noted where more than 40% of 50 or
 * more dots touch another, so an author can choose what shows the pile-up (an opacity, a halo).
 * Undefined where the chart sets its own opacity, or the dots are not on two continuous axes.
 */
function planCrowding(
    structure: ChartStructure, rows: any[], plot: { width: number; height: number }, size: number,
    channelSemantics: Record<string, ChannelSemantics>, typeOf: (channel: 'x' | 'y') => string | undefined,
    chartProperties: Record<string, any> | undefined,
): LayoutPlan['crowding'] {
    if (!structure.marks.some((mark) => DOT_MARKS.has(mark)) || rows.length < CROWDED_MIN_POINTS) return undefined;
    if (chartProperties?.opacity != null || panelCount(rows, channelSemantics) > 1) return undefined;
    const touch = dotTouchShare(rows, plot, size, channelSemantics, typeOf);
    if (!touch || touch.points < CROWDED_MIN_POINTS || touch.share <= CROWDED_SHARE) return undefined;
    return { share: Math.round(touch.share * 100) / 100, points: touch.points, size };
}

/** Vega-Lite's own line width, which an unthemed chart draws. */
const DEFAULT_STROKE = 2;

/**
 * The width a chart's lines are drawn at: the house's weight (Vega-Lite's 2 px without one), thinned
 * where the series would ink more than 15% of the panel between them, to no less than 0.75 px. A
 * line runs the panel's width, so its ink is its width against the panel's height; 7 series at 2 px
 * stay as they are, 30 thin to 1.5 px, 160 to the floor. Undefined where nothing changes.
 */
function planLineWidth(
    design: DesignDecisions | undefined, structure: ChartStructure, rows: any[], plot: { width: number; height: number },
    channelSemantics: Record<string, ChannelSemantics>, report: ThemeReport[],
): number | undefined {
    if (!structure.marks.includes('line') || rows.length === 0 || plot.height <= 0) return undefined;
    const base = design?.marks.strokeWidth ?? DEFAULT_STROKE;
    const perPanel = linesPerPanel(rows, channelSemantics);
    const width = denseLineWidth(base, perPanel, plot.height);
    if (width === undefined) return undefined;
    report.push({
        stage: 'ground',
        path: 'marks.strokeWeight',
        code: 'lines-thinned',
        message: `${Math.round(perPanel)} lines share the ${Math.round(plot.height)}px-tall plot: at ${base}px they would ink too much of it, so they thin to ${width}px`,
    });
    return width;
}

/** A halo's share of its dot's radius: enough to cut one dot from the next without eating it. */
export const HALO_RADIUS_SHARE = 0.25;
/** An outline's share of its dot's radius: the house's drawn edge, heavier than a halo. */
export const OUTLINE_RADIUS_SHARE = 0.35;
/** The thinnest outline drawn; below it a ring renders as a blur. */
export const MIN_OUTLINE_WIDTH = 0.6;
/** The smallest scatter dot (px², about 6 px across) that keeps a halo; on less the ring is most of the dot. */
export const MIN_HALO_DOT = 28;

/** A ring for a dot of `size` px²: `share` of the radius, at least `floor`, never more than the house's width. */
export function ringWidth(size: number, share: number, houseWidth: number, floor = 0): number {
    const radius = Math.sqrt(size / Math.PI);
    return Math.min(houseWidth, Math.max(floor, Number((radius * share).toFixed(2))));
}

/** The halo a theme's dots are drawn with: a quarter of the radius, at most the house's width. */
export function pointHaloWidth(design: DesignDecisions, size: number | undefined): number {
    const house = design.marks.point?.haloWidth ?? 1;
    return size != null ? ringWidth(size, HALO_RADIUS_SHARE, house) : house;
}

/** The outline a theme's dots are drawn with: thinner on small dots, so the ring does not fill them. */
export function pointOutlineWidth(design: DesignDecisions, size: number | undefined): number | undefined {
    const outline = design.marks.outline;
    return outline && size != null ? ringWidth(size, OUTLINE_RADIUS_SHARE, outline.width, MIN_OUTLINE_WIDTH) : outline?.width;
}

/**
 * The opacity a fading house's dots take once the plan has shrunk them. A smaller dot at the same
 * opacity inks less, and a lone dot fades out; holding diameter × opacity raises the opacity with the
 * lost diameter, so a lone dot stays readable while a pile still darkens. Holding area × opacity
 * would undo the fade outright at half size.
 */
export function coupledPointOpacity(opacity: number, houseSize: number | undefined, size: number | undefined): number {
    if (opacity >= 1 || houseSize == null || size == null || size >= houseSize) return opacity;
    return Math.min(1, Number((opacity * Math.sqrt(houseSize / size)).toFixed(2)));
}

/**
 * Where a theme's dots open their scales: by the drawn dot's outer radius, on each continuous axis
 * of dots nothing anchors, unless the axis holds zero or a domain set at both ends.
 */
function pointPadding(
    structure: ChartStructure, design: DesignDecisions, rows: any[], size: number | undefined,
    domains: Partial<Record<'x' | 'y', MeasureDomain>>, bandSpans: LayoutPlan['bandSpans'],
    typeOf: (channel: 'x' | 'y') => string | undefined, channelSemantics: Record<string, ChannelSemantics>,
    plot: { width: number; height: number },
): LayoutPlan['points'] {
    if (!unanchoredDots(structure, design, rows)) return undefined;
    const radius = Math.ceil(Math.sqrt((size ?? 30) / Math.PI) + (pointOutlineWidth(design, size) ?? 0) / 2);
    const channels = (['x', 'y'] as const).filter((channel) => {
        const type = typeOf(channel);
        const bounds = domains[channel]?.bounds;
        return Boolean(channelSemantics[channel]?.field) && (type === 'quantitative' || type === 'temporal')
            && domains[channel]?.zero !== true && !bandSpans[channel] && !(bounds?.min !== undefined && bounds.max !== undefined);
    });
    return radius > 0 && channels.length ? { radius, channels, lengths: { x: plot.width, y: plot.height } } : undefined;
}

interface RulerContext {
    structure: ChartStructure;
    design: DesignDecisions;
    domains: Partial<Record<'x' | 'y', MeasureDomain>>;
    channelSemantics: Record<string, ChannelSemantics>;
    encodings: Record<string, any>;
    axisLabels: Record<'x' | 'y', AxisLabelPlan>;
    valueLabels: ValueLabelPlan | { refused: string } | undefined;
    /** The axes' drawn lengths, in px. */
    length: Record<'x' | 'y', number>;
    /** How the backend measures text it sets. */
    measure: TextMeasurer;
    points?: LayoutPlan['points'];
}

/**
 * The ruler of each themed measure axis Flint can draw: one with a planned extent, read on a
 * linear scale from rows as they are, not aggregated, binned, held to set ticks, ticked at
 * observed values, or ruled by the template itself. A gridded axis rounds its free ends to the
 * step. An ungridded one rounds as the backend's default does, except at an end value labels
 * extend (unless a single semantic bound asks for rounding) and on dots that nothing anchors (no
 * bar, area, rule or zero rule), which the realization pads instead. An axis the structure keeps
 * unrounded keeps the data's span, as does a field whose semantics turn rounding off; dots tick
 * into the padding that opens round the outermost dot. Labels stand no closer than the widest one
 * plus its separation along x (measured as the backend measures text, the end labels counting whole, as the
 * backend flushes them inside the plot), or a line of text plus that separation along y (a line
 * and a half where the theme flushes the end labels too), and the step is never finer than the
 * axis can name.
 */
function measureRulers(context: RulerContext): Partial<Record<'x' | 'y', AxisRuler>> {
    const { structure, design, domains, channelSemantics, encodings, axisLabels, valueLabels, length, measure, points } = context;
    const out: Partial<Record<'x' | 'y', AxisRuler>> = {};
    for (const channel of ['x', 'y'] as const) {
        const axis = structure[channel];
        const decided = design.axes[channel];
        const domain = domains[channel];
        const cs = channelSemantics[channel];
        if (!axis || axis.type !== 'quantitative' || axis.ownScale || !domain?.extent) continue;
        if (decided?.role !== 'measure' || decided.tickSpacing == null) continue;
        if (decided.indexing && decided.tickLabels && decided.tickLabels !== 'all') continue;
        if (encodings[channel]?.aggregate || encodings[channel]?.bin || cs?.tickConstraint?.exactTicks) continue;
        if (cs?.scaleType && cs.scaleType !== 'linear') continue;
        const grid = decided.grid.show;
        const headroom = valueLabels && !('refused' in valueLabels) && valueLabels.channel === channel ? valueLabels.headroom : undefined;
        const padded = points?.channels.includes(channel) === true;
        const tight = axis.rounded === false || (axis.rounded === undefined && cs?.nice === false) || (padded && !grid);
        const roundsThrough = grid || (domain.bounds !== undefined && (domain.bounds.min === undefined) !== (domain.bounds.max === undefined));
        const fixed = {
            min: tight || domain.bounds?.min !== undefined || (!roundsThrough && headroom?.min !== undefined),
            max: tight || domain.bounds?.max !== undefined || domain.stackTop !== undefined || (!roundsThrough && headroom?.max !== undefined),
        };
        const labels = axisLabels[channel];
        const pattern = cs?.format?.pattern;
        const print = formatNumber(pattern ?? ',.12~g');
        const separation = labels.separation ?? Math.round(labels.fontSize * 0.6);
        const text = (value: number) => `${cs?.format?.prefix ?? ''}${print(value)}${cs?.format?.suffix ?? ''}`;
        const minSpacing = channel === 'x'
            ? (values: number[]) => {
                const widths = values.map((value) => measure(labels.fontSize, labels.font ?? 'sans-serif', 'normal', 'normal')(text(value)));
                let need = 0;
                for (let index = 0; index + 1 < widths.length; index += 1) {
                    const first = index === 0;
                    const last = index + 2 === widths.length;
                    const span = (first ? widths[index] : widths[index] / 2) + (last ? widths[index + 1] : widths[index + 1] / 2);
                    need = Math.max(need, span + separation);
                }
                return need;
            }
            : () => Math.ceil(labels.fontSize * 1.2) * (decided.label.flush ? 1.5 : 1) + separation;
        const minStep = Math.max(cs?.tickConstraint?.integersOnly ? cs.tickConstraint.minStep ?? 1 : 0, formatResolution(pattern));
        const [lo, hi] = domain.extent;
        const radius = points?.radius ?? 0;
        const overhang = padded && (fixed.min || fixed.max) && length[channel] > 2 * radius
            ? (radius * (hi - lo)) / (length[channel] - 2 * radius) : 0;
        const ruler = spacingRuler({
            extent: domain.extent, fixed, toStep: grid, length: length[channel], spacing: decided.tickSpacing, minSpacing, minStep, overhang,
        });
        if (ruler) out[channel] = ruler;
    }
    return out;
}

/**
 * The value scale runs are read against, as the plan draws it: the ruler's domain, else the
 * semantic bounds and the stack's clean top, including zero unless the axis or Flint fits it to
 * the data; a template that rules its own axis reads its extent, and themed dots on a gridded axis
 * the plan leaves to the backend read their data rounded to the theme's tick count.
 */
function runValueScale(
    structure: ChartStructure,
    domains: Partial<Record<'x' | 'y', MeasureDomain>>,
    rulers: Partial<Record<'x' | 'y', AxisRuler>>,
    cs: ChannelSemantics | undefined,
    design: DesignDecisions,
    rows: any[],
    themed: boolean,
): RunValueScale {
    const axis = structure.y;
    const domain = domains.y;
    const reverse = axis?.reversed === true || (cs?.reversed === true && axis?.type === 'quantitative');
    const linear = !cs?.scaleType || cs.scaleType === 'linear';
    const ruler = rulers.y;
    const bounds = domain?.bounds;
    const fixed = bounds?.min !== undefined && bounds?.max !== undefined;
    const zero = axis?.baseline === 'zero' ? true : axis?.baseline === 'data' ? false
        : fixed && domain?.dropZero ? true : domain?.zero ?? true;
    if (ruler) return { min: ruler.domain[0], max: ruler.domain[1], zero, reverse, linear };
    if (axis?.ownScale && domain?.extent) return { min: domain.extent[0], max: domain.extent[1], zero, reverse, linear };
    const decided = design.axes.y;
    const field = axis && !axis.derived ? axis.fields[0] : undefined;
    if (themed && field && !bounds && domain?.zero !== true && decided?.grid.show && decided.tickCount != null
        && unanchoredDots(structure, design, rows)) {
        const values = rows.map((row) => row?.[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        if (values.length && hi > lo) {
            const [min, max] = niceDomain(lo, hi, decided.tickCount);
            return { min, max, zero, reverse, linear };
        }
    }
    return { min: bounds?.min, max: bounds?.max ?? domain?.stackTop, zero, reverse, linear };
}

/** The order of each channel's categories the template draws, faceting included. */
function categoryOrders(
    template: { channels?: string[] },
    structure: ChartStructure,
    encodings: Record<string, ChartEncoding>,
    channelSemantics: Record<string, ChannelSemantics>,
    data: any[],
    semanticTypes: PlanContext['semanticTypes'],
): Partial<Record<string, CategoryOrder>> {
    const drawn = new Set([...(template.channels ?? []), 'column', 'row']);
    const out: Partial<Record<string, CategoryOrder>> = {};
    for (const [channel, encoding] of Object.entries(encodings)) {
        if (!drawn.has(channel)) continue;
        const own = categoryOrder({ channel, encoding, encodings, cs: channelSemantics[channel], data, semanticTypes: semanticTypes ?? {} });
        const stated = channel === 'x' || channel === 'y' ? structure[channel]?.order : undefined;
        const order = stated && (stated.fixed || !own || own.by === 'data') ? stated.order : own;
        if (order) out[channel] = order;
    }
    return out;
}

/** The positional channels a template's skeleton draws whatever the data names, such as a histogram's count. */
function skeletonChannels(skeleton: any): Set<string> {
    const channels = new Set<string>();
    const walk = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        for (const channel of ['x', 'y']) if (node.encoding?.[channel]) channels.add(channel);
        for (const child of [...(node.layer ?? []), ...(node.vconcat ?? []), ...(node.hconcat ?? []), ...(node.concat ?? [])]) walk(child);
        if (node.spec) walk(node.spec);
    };
    walk(skeleton);
    return channels;
}

/**
 * Whether value labels may print. A template that presents values in a column of its own takes
 * them off. The label layer prints one value per mark, read from the data, so a measure axis must
 * read a single field (or count rows); a range, or a measure the chart computes, prints only where
 * the template prints its own values and the author asked.
 */
function valueLabelChoice(
    template: { suppressValueLabels?: boolean; ownsValueLabels?: boolean },
    structure: ChartStructure,
    asked: 'on' | 'off' | undefined,
): 'on' | 'off' | undefined {
    if (template.suppressValueLabels) return 'off';
    const printable = (axis: ChartStructure['x']) => !axis || axis.type !== 'quantitative'
        || (axis.derived === undefined && !axis.range && axis.fields.length > 0) || axis.derived === 'count';
    if (printable(structure.x) && printable(structure.y)) return asked;
    return template.ownsValueLabels && asked === 'on' ? 'on' : 'off';
}

/**
 * An axis's tick labels with pinned values in place of the planned ones. A pinned angle brings
 * its own anchoring; the plan's crowding and overflow notes no longer apply to what was pinned.
 */
function pinAxisLabels(planned: AxisLabelPlan, pin: { fontSize?: number; angle?: number }): AxisLabelPlan {
    const { crowdedFrom, overflowFit, ...rest } = planned;
    const next: AxisLabelPlan = { ...rest };
    if (pin.fontSize !== undefined) next.fontSize = pin.fontSize;
    else if (crowdedFrom !== undefined) next.crowdedFrom = crowdedFrom;
    if (pin.angle !== undefined) {
        next.angle = pin.angle;
        next.align = pin.angle === 0 ? 'center' : 'right';
        next.baseline = Math.abs(pin.angle) >= 90 ? 'middle' : 'top';
        // Names cut to their band were cut for standing straight; turned, they keep their length.
        // A flat trim (wrapped or skipped names cut to their band) does not apply once the names turn.
        if (overflowFit?.trimmed && (overflowFit.step === 'wrap' || overflowFit.step === 'skip') && pin.angle !== 0) {
            if (overflowFit.uncutLimit !== undefined) next.limit = overflowFit.uncutLimit;
            else delete next.limit;
            delete next.lineHeight;
        }
    } else if (overflowFit) {
        next.overflowFit = overflowFit;
    }
    return next;
}

/** Semantic types whose values are codes: read whole or not at all. */
const IDENTIFIER_TYPES = new Set(['ID', 'ZipCode']);

/** The ways x names may take, whether they run as a sequence, and the theme's thresholds; every backend's band labels are planned with these. */
export function xLabelOverflow(theme: ThemeSpec | undefined, chartProperties: Record<string, any> | undefined, channelSemantics: Record<string, any>) {
    const semanticType = channelSemantics.x?.semanticAnnotation?.semanticType;
    const sequence = sequenceKindOf(semanticType);
    // An identifier cut short names nothing: codes are never truncated, whatever the theme allows.
    const code = IDENTIFIER_TYPES.has(semanticType);
    // Dates read as snapshots are each a separate observation: every one keeps its name.
    const overflow = resolveLabelOverflow(theme?.labels, chartProperties?.labelOverflow, sequence ? 'sequence' : 'names')
        .filter((step) => !(channelSemantics.x?.snapshots && step === 'skip'));
    return {
        overflow,
        ...(sequence ? { sequence } : {}),
        ...(theme?.labels?.truncation === 'never' || code ? { noLimit: true } : {}),
        ...(code ? { codes: true } : {}),
        ...(IDENTIFIER_TYPES.has(channelSemantics.y?.semanticAnnotation?.semanticType) ? { rowCodes: true } : {}),
        ...(theme?.labels?.fit ? { fit: theme.labels.fit } : {}),
    };
}

/** Everything a plan reads besides the analysis. */
export interface PlanContext {
    /** Chart properties after the theme's chart defaults. */
    chartProperties: Record<string, any> | undefined;
    /** Chart properties as the spec states them. */
    authoredProperties: Record<string, any> | undefined;
    /** The spec's semantic types, as it states them. */
    semanticTypes: PlotPlanContext['semanticTypes'];
    /** Compile options after the theme's compile defaults. */
    options: AssembleOptions;
    size: LayoutSize;
    /** The headline and deck the author wrote, as a title. */
    title?: { text: string; subtitle?: string[] };
    /** The figure label or kicker the author wrote, above the headline. */
    label?: string;
    /** Where the data comes from, as the author wrote it: the source line. */
    source?: string | { text: string; href?: string };
    /** The names the author gave fields. */
    fieldDisplayNames?: Record<string, string>;
    /** The chart type the spec names. */
    chartType: string;
    /** The rows in view when a window or a filter narrows them: a subset of the analysis rows. */
    rows?: any[];
    /** Decisions held at the values given. */
    pins?: {
        plot?: { width: number; height: number };
        title?: TitlePlan;
        /** Tick label decisions held at the values given, however crowded the axis. */
        axisLabels?: Partial<Record<'x' | 'y', { fontSize?: number; angle?: number }>>;
        /** The room kept for the furniture, so the rows in view do not move the fitted steps through it. */
        reserve?: FurnitureReserve;
        /** The canvas-fit treatment the chart was opened with, held so a change of rows does not undo it. */
        treatment?: CanvasTreatment;
    };
    /** The theme the chart is drawn in. */
    theme: ThemeSpec | undefined;
    profile: BackendLayoutProfile;
    /**
     * Whether names on a banded axis may wrap onto two lines, widening the band to hold them;
     * `skip` leaves an axis whose labels the template states itself.
     */
    bandLabels?: { skip: (channel: 'x' | 'y') => boolean };
}

/** The marks a template draws, as its static spec states them. */
function templateMarks(template: ChartAnalysis['template']): Set<string> {
    const marks = new Set<string>();
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        const mark = typeof node.mark === 'string' ? node.mark : node.mark?.type;
        if (mark) marks.add(mark);
        for (const child of [...(node.layer ?? []), node.spec].filter(Boolean)) visit(child);
    };
    visit(template.template);
    return marks;
}

type PlanAnalysis = Pick<ChartAnalysis, 'channelSemantics' | 'data' | 'convertedData' | 'encodings' | 'template' | 'templateMarkType' | 'staticSeries'>;

/** The headline and deck the chart prints: the author's, else the one its structure states. */
function printedTitle(context: PlanContext, structure: ChartStructure): { text: string; subtitle?: string[] } | undefined {
    return context.title ?? (structure.title !== undefined ? { text: structure.title } : undefined);
}

/**
 * The layout plan: planned once, then, where the chart will not read well in its canvas, planned
 * again under the canvas-fit treatments (see {@link fitToCanvas}).
 */
export function planLayout(analysis: PlanAnalysis, context: PlanContext): LayoutPlan {
    const held = context.pins?.treatment;
    if (held) return placeTitle(planLayoutOnce(analysis, withTreatment(context, held, boxOf(context))), analysis, context);
    const plan = planLayoutOnce(analysis, context);
    return placeTitle(fitToCanvas(plan, analysis, context), analysis, context);
}

/**
 * Where a title centred over the plot sits: centred, or, where centred it would run past the
 * drawing's edge — over y labels on one side, keys on the other — the nearest place to centred that
 * keeps it within the drawing, so it adds no width the chart does not have. A title anchored to the
 * start or end, or over several views, is placed by its anchor.
 */
function placeTitle(plan: LayoutPlan, analysis: PlanAnalysis, context: PlanContext): LayoutPlan {
    const title = plan.title;
    const anchor = context.theme ? plan.design.title.anchor : 'middle';
    if (!title || anchor !== 'middle' || plan.composite || plan.layout.facet) return plan;
    const headline = printedTitle(context, plan.structure)?.text;
    const width = fittedTitleWidth(title, headline, plan.design, context.theme ? undefined : context.profile.titleSizes);
    if (!width) return plan;
    const { parts } = measureReserve({
        along: { width: true, height: false },
        structure: plan.structure, design: plan.design, themed: Boolean(context.theme), layout: plan.layout,
        channelSemantics: analysis.channelSemantics, axisLabels: plan.axisLabels, axisTitles: plan.axisTitles, axisTitleFit: plan.axisTitleFit,
        domains: plan.domains, rulers: plan.rulers, furniture: plan.furniture, legend: plan.legend,
        title: printedTitle(context, plan.structure), titlePlan: title, rows: plan.rows,
        spacing: context.profile.spacing, measure: context.profile.measureText ?? tableTextMeasurer,
    });
    const footprint = plan.legend.layout?.footprint ?? [];
    const keysAt = (orient: string) => keysBesideWidth(footprint.filter((edge) => edge.orient === orient), plan.legend.layout?.offsets?.right ?? context.profile.spacing.keyOffset);
    const shift = nearestCentredShift(width, {
        left: (parts.yLabels ?? 0) + (parts.yTitle ?? 0) + keysAt('left'),
        plot: plan.plot.width,
        right: keysAt('right') + (parts.seriesEnd ?? 0),
    });
    return shift ? { ...plan, title: { ...title, shift } } : plan;
}

/** The box a chart is fitted to: the canvas the host states, else the ceiling the base may stretch to. */
function boxOf(context: PlanContext): { width: number; height: number } {
    const stretch = context.options?.maxStretch ?? DEFAULT_MAX_STRETCH;
    return context.size.canvasSize ?? { width: context.size.baseSize.width * stretch, height: context.size.baseSize.height * stretch };
}

/** The context a treatment lays the chart out under; a smaller plot keeps the box it is fitted to. */
function withTreatment(context: PlanContext, treatment: CanvasTreatment, box: { width: number; height: number }): PlanContext {
    const options = { ...context.options, canvasTreatment: treatment };
    const scale = treatment.plotScale ?? 1;
    if (scale === 1) return { ...context, options };
    const base = context.size.baseSize;
    return { ...context, options, size: {
        baseSize: { width: Math.round(base.width * scale), height: Math.round(base.height * scale) },
        canvasSize: box,
    } };
}

/** Whether a row of keys above or below the plot runs wider than the chart it spans. */
function rowOverruns(plan: LayoutPlan): boolean {
    return (plan.legend.layout?.overflow ?? []).some((edge) => (edge.orient === 'top' || edge.orient === 'bottom') && edge.width > edge.widthBudget + 1);
}

/** How far a treatment may change the chart area's own shape, as a ratio of aspects. */
const CHART_SHAPE_TOLERANCE = 1.15;

/** The headline and deck shares a canvas-fit pass sets them at: one size down, then a second where one is not enough. */
const TITLE_SCALE = 0.85;
const TITLE_SCALE_DEEP = 0.72;

/** The smallest the axis labels are set: the house's least size, and never under three-quarters of its own. */
function axisLabelFloor(size: number, minSize: number | undefined): number {
    return Math.max(minSize ?? 8, size * 0.75);
}

/** The axis labels at a share of the house's size, to the half px, never past the floor. */
function scaledAxisLabelSize(size: number, scale: number, floor: number): number {
    return Math.max(floor, Math.round(size * scale * 2) / 2);
}

/** The most sizes down a canvas fit tries for axis labels, one px each. */
const LABEL_STEPS = 3;
/**
 * How short a canvas-fit pass keeps long key names: 120 px a column, wrapped onto lines before they
 * are cut. Names down a y axis keep their readable gutter: a cut row name names nothing.
 */
const SHORT_NAMES = { keyWidth: 120 };

/**
 * The canvas-fit pass, for charts that will not read well in their box. Three goals, judged on the
 * plan before anything is drawn ({@link judgeCanvas}): the drawing fits its box, legibly; the parts
 * are in balance — the title, keys and chrome do not take the chart area's room, nor labels a
 * panel's; and nothing around the chart bends the drawing badly out of its box's shape (a title and
 * a row of keys above a plot are the theme's design, and are allowed for).
 *
 * A chart that meets them as planned is returned as it is. One that does not is mended with the
 * least edit to it a reader would notice ({@link culpritEdits}): each problem is put down to the
 * parts that cause it, and only their edits are tried — keys in a row on their edge, names wrapped,
 * the title a size down, keys to another edge, the title two sizes down, names wrapped down the y
 * axis set a size or two smaller — one at a time before any
 * two together. Of those that clear, the one that costs least wins: its edit, priced on the
 * planner's one scale ({@link LAYOUT_COSTS}), and what its result still costs in reading, which
 * tells edits alike apart. Where the box cannot hold the chart legibly, the plot comes down,
 * keeping its shape. Where nothing clears it, the edit that helps most, if it reads better for it
 * than it costs. Nothing is cut, no edit shrinks text past legibility, and the chart's own shape is
 * never changed. The pass never lays a chart out larger for the host to shrink: a chart that still
 * overflows its box is drawn at its size, for the reader to scroll or the host to scale.
 */
function fitToCanvas(plan: LayoutPlan, analysis: PlanAnalysis, context: PlanContext): LayoutPlan {
    const strategy = context.options?.canvasFit ?? 'auto';
    const box = boxOf(context);
    // A change of rows holds the frame it was opened with; the fit was weighed for the frame.
    const holding = Boolean(context.pins?.plot || context.pins?.title || context.pins?.reserve);
    if (strategy === 'off' || holding || (plan.composite && !plan.layout.facet)) return plan;
    const judge = (planned: LayoutPlan) => judgeCanvas(canvasParts(planned, analysis.channelSemantics, context, box));
    const before = judge(plan);
    const result: CanvasFitResult = { strategy, before, tried: [] };
    // A chart that reads well but is drawn a little larger than its box — the host shrinks it, not
    // past legibility — is mended only by the gentlest edits, and only where they bring it inside.
    const overflowing = !before.flags.length && before.scale < SOFT_FIT_SCALE;
    if (!before.flags.length && !overflowing) return { ...plan, canvasFit: result };

    const keyed = Boolean(plan.legend.layout?.keys.some(Boolean));
    const named = keyed;
    const titled = Boolean(plan.title?.headline || plan.title?.deck);
    const edge = plan.legend.layout?.keys.find(Boolean)?.orient;
    type Tried = { treatment: CanvasTreatment; plan: LayoutPlan; estimate: CanvasFitEstimate; cost: number };
    const tries: Tried[] = [];
    // A treatment may not trade a squeeze for text too small to read.
    const legible = before.scale >= CANVAS_FIT_LIMITS.scale;
    const attempt = (treatment: CanvasTreatment): Tried => {
        const planned = planLayoutOnce(analysis, withTreatment(context, treatment, box));
        const estimate = judge(planned);
        const tried = { treatment, plan: planned, estimate, cost: treatmentCost(treatment, edge) };
        // A smaller plot is worth it only where it leaves the text legible; and no treatment may cut a
        // key name the chart as planned kept whole, nor set a row of keys wider than the chart.
        const readable = estimate.scale >= CANVAS_FIT_LIMITS.scale + LEGIBILITY_MARGIN;
        // Names wrapped leave every key where it stood: one moved to another edge is a larger edit.
        const edgeOf = (p: LayoutPlan) => (p.legend.layout?.keys ?? []).map((key) => key?.orient).join('|');
        const moved = Boolean((treatment.names || treatment.rowNames) && !treatment.keys && !treatment.oneKey) && edgeOf(planned) !== edgeOf(plan);
        // One key moved leaves the others where they stood.
        const others = (p: LayoutPlan) => (p.legend.layout?.keys ?? []).map((key, i) => (i === treatment.oneKey?.index ? '' : key?.orient)).join('|');
        const strayed = Boolean(treatment.oneKey) && others(planned) !== others(plan);
        const cuts = (cutsKeyNames(planned) && !cutsKeyNames(plan)) || (rowOverruns(planned) && !rowOverruns(plan)) || moved || strayed;
        // Nor change the chart's own shape: the fit rebalances what is around the chart, not the chart.
        // Labels set smaller shorten the rows they wrapped in, and that is the edit's whole point.
        const shapeOf = (e: CanvasFitEstimate) => e.designed.width / (e.designed.height || 1);
        const reshaped = !treatment.labelScale && Math.abs(Math.log(shapeOf(estimate) / shapeOf(before))) > Math.log(CHART_SHAPE_TOLERANCE);
        // Nor, where the text is already too small, make it smaller still: a flag cleared for smaller text is no mend.
        const smaller = !legible && estimate.scale < before.scale - 0.005;
        if (!cuts && !reshaped && !smaller && ((!legible && !treatment.plotScale) || readable)) tries.push(tried);
        result.tried.push({ treatment, label: describeTreatment(treatment), excess: estimate.excess, cost: tried.cost, flags: estimate.flags });
        return tried;
    };
    const score = (tried: { estimate: CanvasFitEstimate; cost: number }) => tried.estimate.excess * 10 + tried.cost;
    const best = () => [...tries].sort((a, b) => score(a) - score(b))[0];
    // Clear: nothing around the chart squeezes it, and the plot's own shape is no worse for it.
    const clears = (tried: Tried) => !tried.estimate.flags.length && tried.estimate.plotExcess <= before.plotExcess + 0.01 && tries.includes(tried);

    /**
     * The plot laid out again in the room the box leaves it, at the scale the drawing is shown at,
     * once what is around the chart is settled: a continuous side grows into that room (never
     * shrinks — a smaller plot is the fit's own edit), never past its stretch cap (the box's side),
     * and so long as the chart area stays within the looser range of the shapes its base takes on
     * its own. Kept where the text is no smaller, no new
     * kind of problem comes, and the chart reads better: less past its limits, or nearer its box's
     * shape and balance.
     */
    const refitPlot = (from: Tried | undefined): Tried | undefined => {
        const settled = from?.plan ?? plan;
        const estimate = from?.estimate ?? before;
        if (settled.layout.facet || settled.composite || !estimate.flags.length && !(from && estimate.scale < 1)) return undefined;
        const s = Math.min(1, estimate.scale || 1);
        const around = { width: estimate.drawing.width - estimate.area.width, height: estimate.drawing.height - estimate.area.height };
        const labels = { width: estimate.area.width - estimate.panel.width, height: estimate.area.height - estimate.panel.height };
        const base = context.size.baseSize;
        const looser = widenRange(naturalAspectRange(base, { x: box.width / base.width, y: box.height / base.height }), FALLBACK_WIDEN);
        const layout = settled.layout;
        const free = {
            width: layout.xNominalCount === 0 && !layout.xContinuousAsDiscrete,
            height: layout.yNominalCount === 0 && !layout.yContinuousAsDiscrete,
        };
        // The room, in the drawing's own px, the box leaves the plot.
        let width = free.width ? box.width / s - around.width - labels.width : estimate.panel.width;
        let height = free.height ? box.height / s - around.height - labels.height : estimate.panel.height;
        // Never past what the side may stretch to on its own: its base times the box's allowance.
        width = Math.min(width, box.width);
        height = Math.min(height, box.height);
        width = Math.min(Math.max(width, estimate.panel.width), looser.hi * (labels.height + height) - labels.width);
        height = Math.min(Math.max(height, estimate.panel.height), (labels.width + width) / looser.lo - labels.height);
        const grows = (to: number, from: number) => to - from >= Math.max(REFIT_MIN_GROWTH, from * REFIT_MIN_SHARE);
        const plotSpace = {
            ...(free.width && grows(width, estimate.panel.width) ? { width: Math.floor(width) } : {}),
            // A title that breaks takes its lines out of the plot again: the room is the plot's before it does.
            ...(free.height && grows(height, estimate.panel.height) ? { height: Math.floor(height + estimate.designed.height - estimate.panel.height) } : {}),
        };
        if (!plotSpace.width && !plotSpace.height) return undefined;
        // Judged against the chart's own plot: what is around it is weighed against the shape the
        // chart gave itself, so a plot grown to balance it reads as balancing it.
        const lay = (space: { width?: number; height?: number }) => {
            const treatment: CanvasTreatment = { ...(from?.treatment ?? {}), plotSpace: space };
            const planned = planLayoutOnce(analysis, withTreatment(context, treatment, box));
            const after = judgeCanvas({ ...canvasParts(planned, analysis.channelSemantics, context, box), ownPanel: estimate.panel });
            return { treatment, planned, after };
        };
        let laid = lay(plotSpace);
        // Labels set at a size the plot's own size decides may grow with it and overrun the room:
        // the side gives back what they took, once.
        const over = { width: laid.after.drawing.width - box.width / s, height: laid.after.drawing.height - box.height / s };
        if ((plotSpace.width && over.width > 2) || (plotSpace.height && over.height > 2)) {
            laid = lay({
                ...(plotSpace.width ? { width: Math.max(estimate.panel.width, plotSpace.width - Math.max(0, Math.ceil(over.width))) } : {}),
                ...(plotSpace.height ? { height: Math.max(estimate.designed.height, plotSpace.height - Math.max(0, Math.ceil(over.height))) } : {}),
            });
        }
        const { treatment, planned, after } = laid;
        const tried: Tried = { treatment, plan: planned, estimate: after, cost: treatmentCost(treatment, edge) };
        result.tried.push({ treatment, label: describeTreatment(treatment), excess: after.excess, cost: tried.cost, flags: after.flags });
        const noSmaller = after.scale >= estimate.scale - 0.005;
        const nothingNew = after.kinds.every((kind) => estimate.kinds.includes(kind)) && after.plotExcess <= estimate.plotExcess + 0.01;
        const better = after.excess < estimate.excess - 1e-3 || (after.excess <= estimate.excess + 1e-9 && readingCost(after) < readingCost(estimate) - 0.01);
        return noSmaller && nothingNew && better ? tried : undefined;
    };

    let chosen: Tried | undefined;
    // The edits that answer what is wrong, nearest to the chart as planned first: each problem is
    // put down to the parts that cause it, and only their edits are tried — one at a time before any
    // two together. A title is not set smaller for keys that take the width.
    const laid = plan.legend.layout?.keys ?? [];
    const keyList = (plan.legend.keyInputs ?? []).map((key, index) => (key && laid[index] && !key.fixed
        ? { index, orient: laid[index]!.orient, width: laid[index]!.width, height: laid[index]!.height, ...(key.title ? { title: key.title } : {}) }
        : undefined)).filter((key): key is NonNullable<typeof key> => Boolean(key));
    const yType = analysis.channelSemantics.y?.type;
    // Names above their bars have the chart's width: there is no gutter to give them.
    const rowNamed = plan.layout.yNominalCount > 0 && (yType === 'nominal' || yType === 'ordinal') && !plan.rowNames;
    // The air in the header is no part's: blame is weighed on the title's and the keys' own height.
    const layout = plan.legend.layout;
    const headerAir = {
        title: layout?.headerGap ?? 0,
        keys: (layout?.footprint ?? []).filter((edge) => edge.orient === 'top' || edge.orient === 'bottom')
            .reduce((sum, edge) => sum + (layout?.offsets?.[edge.orient as 'top' | 'bottom'] ?? 0), 0),
    };
    // Names down y wrapped onto two lines take rows tall enough for both: smaller, the rows come down with them.
    const houseLabels = plan.axisLabelFontSize;
    const rowsWrapped = rowNamed && houseLabels !== undefined
        && Boolean(plan.layout.yLabel.labelLines?.some((lines) => lines.length > 1));
    const labelSizes = rowsWrapped
        ? { size: houseLabels!, floor: axisLabelFloor(houseLabels!, (context.theme as ThemeSpec | undefined)?.type?.minSize) }
        : undefined;
    const edits = culpritEdits(before, canvasParts(plan, analysis.channelSemantics, context, box), box, {
        keyed, titled, named, edge, keys: keyList, rowNamed, headerAir, labelSizes,
    });
    // Of the edits that clear, the one that costs least: its edit, and what its result still costs
    // in reading — weighed so the result tells apart edits alike, and never makes a larger edit win
    // over a gentler one. Every single edit is weighed; two together only where none clears alone.
    const settle = (treatments: CanvasTreatment[]): Tried | undefined => {
        const rank = (tried: Tried) => tried.cost + LAYOUT_COSTS.reading * readingCost(tried.estimate);
        let pick: Tried | undefined;
        for (const treatment of treatments) {
            const tried = attempt(treatment);
            if (clears(tried) && (!pick || rank(tried) < rank(pick))) pick = tried;
        }
        return pick;
    };
    if (overflowing) {
        // Keys in a row on their edge, or names wrapped: of those that take the drawing nearer its box
        // with nothing going wrong, one that brings it inside first, then the cheapest. Anything larger
        // is not worth a chart that reads.
        const rank = (tried: Tried) => tried.cost + LAYOUT_COSTS.reading * readingCost(tried.estimate);
        const inside = (tried: Tried) => tried.estimate.scale >= SOFT_FIT_SCALE;
        const better = (tried: Tried, than: Tried) => inside(tried) !== inside(than) ? inside(tried) : rank(tried) < rank(than);
        for (const treatment of edits.single.filter((edit) => treatmentCost(edit, edge) <= GENTLE_EDIT_COST)) {
            const tried = attempt(treatment);
            if (clears(tried) && tried.estimate.scale >= before.scale + SOFT_FIT_GAIN && (!chosen || better(tried, chosen))) chosen = tried;
        }
        if (!chosen) return { ...plan, canvasFit: result };
    } else chosen = settle(edits.single) ?? settle(edits.paired);
    // Where the box cannot hold the chart legibly as it is, the plot comes down, keeping its shape.
    if (!chosen) {
        const plotScale = plotFitScale(before, box);
        if (plotScale) {
            const tried = attempt({ plotScale });
            if (clears(tried)) chosen = tried;
        }
        // Names that wrap leave the plot more of the box: it comes down less.
        const rowEdit = edits.single.find((treatment) => treatment.rowNames);
        const wrapped = !chosen && rowEdit ? attempt(rowEdit) : undefined;
        const lesser = wrapped ? plotFitScale(wrapped.estimate, box) : undefined;
        if (!chosen && rowEdit && lesser) {
            const tried = attempt({ rowNames: rowEdit.rowNames, plotScale: lesser });
            if (clears(tried)) chosen = tried;
        }
    }
    // Nothing reads well even so: the one that helps most for its cost, if any helps enough.
    chosen ??= best();
    // A treatment that clears every flag is kept; one that only helps, where the chart reads better
    // for it than it costs, and brings no new kind of problem — a drawing too wide made too tall is a
    // trade, not a mend.
    const partial = chosen && (chosen.estimate.flags.length || chosen.estimate.plotExcess > before.plotExcess + 0.01);
    const trades = Boolean(chosen?.estimate.kinds.some((kind) => !before.kinds.includes(kind)));
    const kept = !chosen || (partial && (trades || score(chosen) >= before.excess * 10)) ? undefined : chosen;
    // What is around the chart now settled, the plot is laid out once more in the room the box
    // leaves it — once, never again — and kept only where the chart reads better for it.
    const refit = context.options?.canvasRefit === false ? undefined : refitPlot(kept);
    chosen = refit ?? kept;
    if (!chosen) return { ...plan, canvasFit: result };
    result.treatment = chosen.treatment;
    result.after = chosen.estimate;
    const report: ThemeReport = {
        stage: 'realize', path: 'layout.canvasFit', code: 'canvas-fit',
        message: `the chart did not read well in its ${Math.round(box.width)} × ${Math.round(box.height)} canvas (${before.flags.length ? before.flags.join('; ') : `drawn larger than it, to be shown at ${Math.round(before.scale * 100)}%`}) — laid out with ${describeTreatment(chosen.treatment)}${chosen.estimate.flags.length ? `, which helps but does not clear it (${chosen.estimate.flags.join('; ')})` : ''}`,
    };
    return { ...chosen.plan, canvasFit: result, report: [...chosen.plan.report, report] };
}

/** What a plan draws, for the canvas-fit judge: its panels, the furniture measured both ways, its chrome. */
function canvasParts(plan: LayoutPlan, channelSemantics: Record<string, ChannelSemantics>, context: PlanContext, box: { width: number; height: number }): CanvasParts {
    const reserve = measureReserve({
        along: { width: true, height: true },
        structure: plan.structure,
        design: plan.design,
        themed: Boolean(context.theme),
        layout: plan.layout,
        channelSemantics,
        axisLabels: plan.axisLabels,
        axisTitles: plan.axisTitles, axisTitleFit: plan.axisTitleFit,
        domains: plan.domains,
        rulers: plan.rulers,
        furniture: plan.furniture,
        legend: plan.legend,
        title: printedTitle(context, plan.structure),
        titlePlan: plan.title,
        rows: plan.rows,
        spacing: context.profile.spacing,
        measure: context.profile.measureText ?? tableTextMeasurer,
    });
    // The lines a broken title takes, and the chrome, are the drawing's whether or not the plot gives them.
    const brokenTitle = (plan.title?.headline?.lines ? plan.title.headline.taken : 0) + (plan.title?.deckFit?.taken ?? 0);
    const headerRoom = plan.header ? plan.header.edge + plan.header.line : 0;
    const rulesRoom = plan.rules?.room ?? 0;
    const sourceRoom = plan.source?.room ?? 0;
    // Where the plot gives its height to them, the plot drawn is shorter by it.
    const gives = plan.rules?.fromPlot ?? !(plan.layout.yNominalCount > 0);
    const facet = plan.layout.facet;
    const gap = plan.layout.effectiveFacetGap ?? 10;
    return {
        panel: {
            width: plan.plot.width,
            height: gives && !facet ? Math.max(1, plan.plot.height - brokenTitle - rulesRoom - headerRoom - sourceRoom) : plan.plot.height,
        },
        designed: { width: plan.plot.width, height: plan.plot.height },
        grid: { columns: facet?.columns ?? 1, rows: facet?.rows ?? 1, gapX: gap, gapY: gap },
        reserve,
        chrome: { top: brokenTitle + headerRoom + rulesRoom, bottom: sourceRoom },
        keyRowWidth: Math.max(0, ...(plan.legend.layout?.footprint ?? []).filter((edge) => edge.orient === 'top' || edge.orient === 'bottom').map((edge) => edge.width)),
        padding: plan.design.layout?.padding,
        box,
        base: context.size.baseSize,
    };
}

/**
 * The layout plan, as planned once, before the canvas-fit pass. Where a banded axis fits its steps to the room the canvas leaves, the room is
 * the canvas less what the chart draws around its plot: the plan is laid out with none kept, the
 * furniture it decides is measured, and the plot is laid out again with that room kept. One pass
 * of it: steps the kept room narrows may turn their labels, and the turn is not measured again.
 */
function planLayoutOnce(analysis: PlanAnalysis, context: PlanContext): LayoutPlan {
    const { channelSemantics, data, convertedData, encodings, template, templateMarkType } = analysis;
    const { chartProperties, authoredProperties, options, size, theme, profile } = context;
    const report: ThemeReport[] = [];
    const rowsInView = context.rows ?? convertedData;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0a: declareLayoutMode (VL-free template hook)
    // ═══════════════════════════════════════════════════════════════════════

    const declaration: LayoutDeclaration = template.declareLayoutMode
        ? template.declareLayoutMode(channelSemantics, data, chartProperties)
        : {};

    // Auto-detect binnedAxes from template encoding if not declared
    if (!declaration.binnedAxes) {
        const templateEnc = template.template?.encoding;
        if (templateEnc) {
            const binnedAxes: Record<string, boolean | { maxbins?: number }> = {};
            for (const axis of ['x', 'y']) {
                if (templateEnc[axis]?.bin) {
                    // Use chartProperties.binCount (the maxbins cap) when the user
                    // has set one so layout sizing matches the rendered bins; a
                    // value of 0/undefined means "auto" (Vega's default ~10 cap).
                    const propBins = chartProperties?.binCount;
                    if (propBins) {
                        binnedAxes[axis] = { maxbins: propBins };
                    } else if (typeof templateEnc[axis].bin === 'object' && templateEnc[axis].bin.maxbins) {
                        binnedAxes[axis] = templateEnc[axis].bin;
                    } else {
                        binnedAxes[axis] = { maxbins: 10 };
                    }
                }
            }
            if (Object.keys(binnedAxes).length > 0) {
                declaration.binnedAxes = binnedAxes;
            }
        }
    }

    // Merge paramOverrides into effective options
    const effectiveOptions: AssembleOptions = {
        ...profile.defaults,
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    // How much room one category gets is a house decision — a journal that
    // prints three wide boxes and a dashboard that prints thirty thin bars are
    // both right about their own page. A template's band size is a guess made
    // without knowing the house, so the house's number replaces it; a caller
    // who states one outranks both.
    //
    // But a band step is a statement about bar thickness, and where *both* axes
    // are banded there are no bars: the marks are cells, and a cell's size is
    // fixed by the two counts and the room they share. A house that asks for
    // A bar-sized category step would print a grid of stripes. That one the
    // layout keeps.
    const houseBandStep = theme?.layout?.bandStep;
    const houseBandStepFit = theme?.layout?.bandStepFit;
    const cellGrid = declaration.axisFlags?.x?.banded === true
        && declaration.axisFlags?.y?.banded === true;
    // A template may state a floor its read cannot go below (a slopegraph needs
    // its two columns spread wide however compact the house). The house sets
    // the band step, but not below that floor.
    const minBandStep = (declaration.paramOverrides as AssembleOptions | undefined)?.minBandStep;
    if (houseBandStepFit != null && options.bandStepFit == null && !cellGrid) {
        effectiveOptions.bandStepFit = Math.max(0, Math.min(1, houseBandStepFit));
    }
    // A grid's cells are not bars, but a house that lets bands grow into spare room lets them grow a little too.
    if (houseBandStepFit != null && options.cellGrowth == null && cellGrid) {
        effectiveOptions.cellGrowth = Math.max(0, Math.min(1, houseBandStepFit));
    }
    const fitsToRoom = (effectiveOptions.bandStepFit ?? 0) > 0;
    if (houseBandStep && options.defaultBandSize == null && !cellGrid) {
        const step = minBandStep ? Math.max(houseBandStep, minBandStep) : houseBandStep;
        effectiveOptions.defaultBandSize = step;
        // A house that also fits its sparse bands to the room has to be able to
        // pass its own base pitch; the layout's sparse ceiling holds it in.
        if (!fitsToRoom) {
            effectiveOptions.maxBandSize = Math.max(step, effectiveOptions.maxBandSize ?? 0);
        }
        if (minBandStep && step > houseBandStep) {
            report.push({
                stage: 'ground',
                path: 'layout.bandStep',
                code: 'band-step-raised',
                message: `the house gives each category ${houseBandStep}px, but this chart reads only above ${minBandStep}px — held to ${step}px`,
            });
        }
    } else if (houseBandStep && cellGrid) {
        report.push({
            stage: 'ground',
            path: 'layout.bandStep',
            code: 'band-step-not-applied',
            message: `the house asks for ${houseBandStep}px categories, but both axes are banded — the marks are cells, whose size the grid settles, not the house`,
        });
    }

    for (const [key, value] of Object.entries(profile.fallbacks)) {
        const options = effectiveOptions as Record<string, unknown>;
        if (options[key] == null) options[key] = structuredClone(value);
    }

    // Resolve the optional canvasSize ceiling into per-dimension stretch caps
    // (βx, βy) so single plots AND facet grids honor the same budget. Falls
    // back to maxStretch when no ceiling is set.
    const caps = deriveStretchCaps(size.baseSize, size.canvasSize, effectiveOptions);
    effectiveOptions.maxStretchX = caps.maxStretchX;
    effectiveOptions.maxStretchY = caps.maxStretchY;
    effectiveOptions.facetColumns = resolveFacetColumnsOption(authoredProperties);

    const reasons: PlanReason[] = [];
    const ceiling = size.canvasSize;
    const r1 = (value: number) => Math.round(value * 10) / 10;
    reasons.push({
        part: 'canvas',
        decision: `${size.baseSize.width} × ${size.baseSize.height} base${ceiling ? `, ${ceiling.width} × ${ceiling.height} ceiling` : ''}`,
        chain: [
            { rule: 'base size', value: `${size.baseSize.width} × ${size.baseSize.height}`, note: 'the size the chart is planned toward: the spec\'s, else the theme\'s, clamped to the ceiling' },
            ceiling
                ? { rule: 'canvas ceiling', value: `${ceiling.width} × ${ceiling.height}`, read: { stretchCapX: r1(caps.maxStretchX), stretchCapY: r1(caps.maxStretchY) }, note: 'the plot may stretch past the base only up to the ceiling: the caps are ceiling over base' }
                : { rule: 'no ceiling', value: `stretch cap ${r1(caps.maxStretchX)}`, note: 'the plot may stretch past the base up to the default cap' },
            { rule: 'fixed allowance', value: `${effectiveOptions.facetFixedPadding?.width ?? 0} + ${effectiveOptions.facetGap ?? 0} wide, ${effectiveOptions.facetFixedPadding?.height ?? 0} + ${effectiveOptions.facetGap ?? 0} tall`, read: { ...(effectiveOptions.facetFixedPadding ?? {}), gap: effectiveOptions.facetGap }, note: 'a constant kept out of the stretch budget for labels and titles; never measured' },
            ...(houseBandStep && !cellGrid ? [{ rule: 'house band', value: effectiveOptions.defaultBandSize ?? houseBandStep, read: { bandStepFit: effectiveOptions.bandStepFit ?? 0 }, note: 'the theme says how much room one category gets' } satisfies PlanStage] : []),
        ],
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0b: filterOverflow (VL-free)
    // ═══════════════════════════════════════════════════════════════════════

    // Collect mark types for sort strategy
    const allMarkTypes = new Set<string>();
    if (templateMarkType) allMarkTypes.add(templateMarkType);
    if (Array.isArray(template.template?.layer)) {
        for (const layer of template.template.layer) {
            const lm = typeof layer.mark === 'string' ? layer.mark : layer.mark?.type;
            if (lm) allMarkTypes.add(lm);
        }
    }

    // ── Channel budgets (shared, in layout module) ─────────────────────
    // Computes per-channel max-to-keep using the most conservative
    // assumptions (minStep, maxStretch).  Also decides facet grid.
    const budgets = computeChannelBudgets(
        channelSemantics, declaration, rowsInView, size.baseSize, effectiveOptions,
    );

    const overflowResult = filterOverflow(
        channelSemantics, declaration, encodings, rowsInView,
        budgets, allMarkTypes,
    );

    for (const truncation of overflowResult.truncations) {
        reasons.push({
            part: 'rows',
            decision: `${truncation.keptValues.length} of ${truncation.keptValues.length + truncation.omittedCount} ${truncation.field} values kept`,
            chain: [{ rule: 'overflow', value: `${truncation.keptValues.length} kept, ${truncation.omittedCount} cut`, read: { channel: truncation.channel, minStep: effectiveOptions.minStep ?? 8 }, note: 'more values than the stretched span can give a readable step each: the rest are cut, and a banded axis adds a placeholder band that names them' }],
        });
    }
    if (budgets.facetGrid) {
        reasons.push({
            part: 'facets',
            decision: `${budgets.facetGrid.columns} × ${budgets.facetGrid.rows} panels`,
            chain: [{ rule: 'facet grid', value: `${budgets.facetGrid.columns} × ${budgets.facetGrid.rows}`, read: { columns: budgets.facetGrid.columns, rows: budgets.facetGrid.rows, asked: effectiveOptions.facetColumns }, note: 'wrapped so each panel keeps a readable width within the stretch budget' }],
        });
    }
    let prepared: PreparedPlan = { analysis, context, declaration, options: effectiveOptions, facetGrid: budgets.facetGrid, overflow: overflowResult, report, reasons };
    const pinned = context.pins?.reserve;
    let first = planAroundPlot(prepared, pinned ?? NO_RESERVE);
    // Panels are laid out once more for the gap the plan draws between them, which it then keeps.
    if (first.layout.facet) {
        const drawn = gapOf(first.furniture.facets.spacing, 0);
        const sized = prepared.options.facetGap ?? 0;
        if (drawn.column !== sized || drawn.row !== sized) {
            prepared = {
                ...prepared,
                facetSpacing: first.furniture.facets.spacing,
                options: { ...prepared.options, facetGapColumn: drawn.column, facetGapRow: drawn.row },
            };
            first = planAroundPlot(prepared, pinned ?? NO_RESERVE);
        }
    }
    // A house that sets the names of horizontal bars above them tries it once the names beside are
    // known: where the bands can take twice their room within the stretch, the names stand above.
    const above = rowNamesAboveTrial(first, prepared, pinned);
    if (above) ({ prepared, first } = above);
    // Labels too wide for their band widen the bands, into the room the canvas has (L3). A label
    // whose type grows with the plot can need a little more once the plot is wider; a few passes settle it.
    const unwidened = { prepared, first };
    for (let pass = 0; pass < 3; pass++) {
        const labelBands = widenBandsForLabels(first, prepared, context);
        if (!labelBands) break;
        prepared = labelBands;
        first = planAroundPlot(prepared, pinned ?? NO_RESERVE);
    }
    // Wider bands that still do not print their labels buy nothing: the chart keeps its bands.
    if (prepared !== unwidened.prepared && !first.design.dataLabels.show) {
        ({ prepared, first } = unwidened);
        first.report.push({ stage: 'realize', path: 'dataLabels', code: 'value-labels-band-full',
            message: 'widening the bands into the canvas\'s spare room was not enough for the labels — the bands are kept, and the labels withheld' });
    }
    const reserveReason = (chain: PlanStage[], decision: string): PlanReason => ({ part: 'reserve', decision, chain });
    const along = { width: first.layout.xStepFitted === true, height: first.layout.yStepFitted === true };
    if (pinned) {
        return { ...first, reserve: pinned, reasons: [...first.reasons, reserveReason([{ rule: 'pinned', value: `${Math.round(pinned.width)} × ${Math.round(pinned.height)}`, note: 'the room kept for the furniture is held from the plan the chart was opened with' }], 'held')] };
    }
    if (!along.width && !along.height) {
        return { ...first, reasons: [...first.reasons, reserveReason([{ rule: 'no fitted step', value: 'skipped', read: { bandStepFit: first.options.bandStepFit ?? 0 }, note: 'the furniture is measured only where a banded axis fitted its step to the room: a sparse axis, whose span per band exceeds the house band, under a theme that fits bands; no axis did' }], 'skipped')] };
    }
    const reserve = measureReserve({
        along,
        structure: first.structure,
        design: first.design,
        themed: Boolean(theme),
        layout: first.layout,
        channelSemantics,
        axisLabels: first.axisLabels,
        axisTitles: first.axisTitles, axisTitleFit: first.axisTitleFit,
        domains: first.domains,
        rulers: first.rulers,
        furniture: first.furniture,
        legend: first.legend,
        title: printedTitle(context, first.structure),
        titlePlan: first.title,
        rows: first.rows,
        spacing: profile.spacing,
        measure: profile.measureText ?? tableTextMeasurer,
    });
    const second = planAroundPlot(prepared, reserve);
    return {
        ...second,
        reserve,
        reasons: [...second.reasons, reserveReason([
            { rule: 'fitted step', value: along.width && along.height ? 'both axes' : along.width ? 'x' : 'y', note: 'a banded axis fitted its step to the room, so the room is measured' },
            { rule: 'measured', value: `${Math.round(reserve.width)} wide, ${Math.round(reserve.height)} tall`, read: Object.fromEntries(Object.entries(reserve.parts).map(([part, px]) => [part, Math.round(px)])), note: `the furniture beside and above or below the plot, as the text measures${reserve.unmeasured?.length ? `; not measured: ${reserve.unmeasured.join(', ')}` : ''}` },
            { rule: 'laid out again', value: `${Math.round(second.plot.width)} × ${Math.round(second.plot.height)}`, note: 'the plot is planned once more into the canvas less that room, capped at 40% of it; one pass' },
        ], `${Math.round(reserve.width)} × ${Math.round(reserve.height)} kept`)],
    };
}

/** The names down y on their own line above each bar, and where in each band they and the bar stand, in px from the band's top. */
export interface RowNamesAbove {
    /** The band each name and its bar share. */
    step: number;
    fontSize: number;
    /** The name's height, under `top`. */
    line: number;
    /** Between the name and its bar. */
    gap: number;
    /** The bar's thickness. */
    bar: number;
    /** The air above the name: all the band has to spare, after the bar and a gap under it. */
    top: number;
    /** The width a name may run: the plot's. */
    width: number;
}

/** The least a bar under its name is thick, in px. */
const ROW_NAME_MIN_BAR = 6;
/** The y band a name above its bar takes: twice the house band, by the same stretch. */
const ROW_NAMES_ABOVE_SCALE = 2;

/** A name's height, its gap to its bar, and the least air between a bar and the next name. */
function rowNameRoom(fontSize: number): { line: number; gap: number; air: number } {
    const gap = Math.max(2, Math.round(fontSize * 0.2));
    // The air between one bar and the next name is at least twice a name's gap to its own bar
    // (with the gap under the bar, three), so each name reads with the bar under it.
    return { line: Math.ceil(fontSize), gap, air: 3 * gap };
}

/** The least band a name above its bar takes: the name, its gap, a readable bar and the air before the next. */
export function rowNamesLeastStep(fontSize: number): number {
    const { line, gap, air } = rowNameRoom(fontSize);
    return line + gap + ROW_NAME_MIN_BAR + air;
}

/**
 * A band holding a name over its bar, from its top: air, the name, a small gap, the bar as thick as
 * the house makes a bar in half the band, and a gap. All the band has to spare is air over the name,
 * so each name stands nearer its own bar than the one before. Undefined where the band cannot hold
 * a name and a readable bar.
 */
export function rowNamesGeometry(step: number, fontSize: number, fraction: number, width: number): RowNamesAbove | undefined {
    if (step < rowNamesLeastStep(fontSize)) return undefined;
    const { line, gap, air } = rowNameRoom(fontSize);
    const bar = Math.max(ROW_NAME_MIN_BAR, Math.min(step - line - gap - air, Math.round((step / ROW_NAMES_ABOVE_SCALE) * fraction)));
    const top = step - line - gap - bar - gap;
    return { step, fontSize, line, gap, bar, top, width: Math.round(width) };
}

/**
 * Names above their bars, where the house sets them there and the chart is one bar to a band down
 * y: the plan laid out again with each band twice its room, kept where the bands hold it within the
 * stretch and each band a line and a readable bar. `auto` asks only where the names beside were cut
 * or wrapped. Otherwise the plan with the names beside stands.
 */
function rowNamesAboveTrial(first: LayoutPlan, prepared: PreparedPlan, pinned: FurnitureReserve | undefined): { prepared: PreparedPlan; first: LayoutPlan } | undefined {
    const theme = prepared.context.theme as ThemeSpec | undefined;
    const ask = theme?.labels?.rowNames;
    if (!ask || ask === 'beside' || prepared.options.rowNamesAbove) return undefined;
    const { layout, structure } = first;
    const yType = prepared.analysis.channelSemantics.y?.type;
    const oneBarToABand = !first.composite && !layout.facet && layout.yNominalCount > 0 && layout.xNominalCount === 0
        && layout.yStepUnit !== 'group' && (yType === 'nominal' || yType === 'ordinal')
        && structure.marks.length > 0 && structure.marks.every((mark) => mark === 'bar')
        && prepared.declaration.axisFlags?.y?.banded === true && prepared.declaration.axisFlags?.x?.banded !== true;
    if (!oneBarToABand) return undefined;
    const sizing = layout.yLabel;
    const long = Boolean(sizing.labelCut) || (sizing.labelLines ?? []).some((lines) => lines.length > 1);
    if (ask === 'auto' && !long) return undefined;
    const fontSize = first.design.axes.y?.label.fontSize ?? first.axisLabelFontSize ?? 11;
    const say = (code: string, message: string): ThemeReport => ({ stage: 'realize', path: 'labels.rowNames', code, message });
    // The note goes with the plan it explains, so every pass laid out from it keeps it.
    const noted = (plan: PreparedPlan, note: ThemeReport): PreparedPlan => ({ ...plan, report: [...plan.report, note] });
    const trial = noted({ ...prepared, options: { ...prepared.options, rowNamesAbove: { scale: ROW_NAMES_ABOVE_SCALE, minStep: rowNamesLeastStep(fontSize) } } },
        say('row-names-above', `each name stands on its own line above its bar, the full width of the chart its own${long ? ' — beside, the longest would have been cut or wrapped' : ''}`));
    const laid = planAroundPlot(trial, pinned ?? NO_RESERVE);
    if (!laid.layout.rowNamesAboveFit || !laid.rowNames) {
        const note = say('row-names-beside', `the names stand beside their bars: above them, each band needs twice its room, which the canvas's stretch cannot give ${layout.yNominalCount} of them`);
        return { prepared: noted(prepared, note), first: { ...first, report: [...first.report, note] } };
    }
    // The bands hold within the stretch, but the title, keys and axis stand in the same box: names
    // above are kept where the whole drawing fits it, or is shrunk no more than with the names beside.
    const box = boxOf(prepared.context);
    const scaleOf = (plan: LayoutPlan) => judgeCanvas(canvasParts(plan, prepared.analysis.channelSemantics, prepared.context, box)).scale;
    const aboveScale = scaleOf(laid);
    if (aboveScale < SOFT_FIT_SCALE && aboveScale < scaleOf(first) - 0.005) {
        const note = say('row-names-beside', `the names stand beside their bars: above them, the chart would be drawn larger than its ${Math.round(box.width)} × ${Math.round(box.height)} canvas, to be shown at ${Math.round(aboveScale * 100)}%`);
        return { prepared: noted(prepared, note), first: { ...first, report: [...first.report, note] } };
    }
    return { prepared: trial, first: laid };
}

/**
 * The second remedy for value labels wider than their band (L3): the band widens to what the labels
 * need, where the canvas less its furniture holds the wider plot. Grounding states the need; when
 * the canvas cannot hold it the labels stay withheld, and the report says how wide the bands would
 * have to be. Panels and a template's own composite keep their bands.
 */
function widenBandsForLabels(first: LayoutPlan, prepared: PreparedPlan, context: PlanContext): PreparedPlan | undefined {
    const need = first.design.dataLabels.bandNeed;
    if (!need || first.layout.facet || prepared.analysis.template.composite) return undefined;
    const axis = need.channel;
    const step = axis === 'x' ? first.layout.xStep : first.layout.yStep;
    if (!(step > 0) || need.step <= step) return undefined;
    const reserve = measureReserve({
        along: { width: axis === 'x', height: axis === 'y' },
        structure: first.structure,
        design: first.design,
        themed: Boolean(context.theme),
        layout: first.layout,
        channelSemantics: prepared.analysis.channelSemantics,
        axisLabels: first.axisLabels,
        axisTitles: first.axisTitles, axisTitleFit: first.axisTitleFit,
        domains: first.domains,
        rulers: first.rulers,
        furniture: first.furniture,
        legend: first.legend,
        title: printedTitle(context, first.structure),
        titlePlan: first.title,
        rows: first.rows,
        spacing: context.profile.spacing,
        measure: context.profile.measureText ?? tableTextMeasurer,
    });
    const ceiling = context.size.canvasSize ?? context.size.baseSize;
    const room = axis === 'x' ? ceiling.width - reserve.width : ceiling.height - reserve.height;
    const plot = axis === 'x' ? first.plot.width : first.plot.height;
    const widened = Math.ceil((plot * need.step) / step);
    const say = (code: string, message: string): ThemeReport => ({ stage: 'realize', path: 'dataLabels', code, message });
    if (widened > room) {
        first.report.push(say('value-labels-band-full',
            `the labels need ${need.step}px bands (a ${widened}px plot); the canvas has room for ${Math.max(0, Math.floor(room))}px — they are withheld rather than overlapped`));
        return undefined;
    }
    const from = prepared.labelBandsFrom ?? { step: Math.round(step), plot: Math.round(plot) };
    return {
        ...prepared,
        labelBandsFrom: from,
        options: { ...prepared.options, labelStep: { [axis]: need.step } },
        report: [...prepared.report.filter((r) => r.code !== 'band-widened-for-labels'), say('band-widened-for-labels',
            `the bands widen from ${from.step}px to ${need.step}px so each value label fits its band, into the canvas's spare room (the plot ${from.plot} → ${widened}px)`)],
    };
}

/** What a plan settles before it lays out the plot: its options, the facet grid and the rows that fit. */
interface PreparedPlan {
    analysis: PlanAnalysis;
    context: PlanContext;
    declaration: LayoutDeclaration;
    options: AssembleOptions;
    facetGrid: ReturnType<typeof computeChannelBudgets>['facetGrid'];
    overflow: ReturnType<typeof filterOverflow>;
    report: ThemeReport[];
    reasons: PlanReason[];
    /** The gap between facet panels the plan laid them out for and draws. */
    facetSpacing?: FurniturePlan['facets']['spacing'];
    /** The band step and plot before the bands widened for their value labels. */
    labelBandsFrom?: { step: number; plot: number };
}

/**
 * The plan from the plot outward, the banded axes fitting their steps to the canvas less the room
 * kept for the furniture. Furniture may take a chart's margins, never most of its plot.
 */
function planAroundPlot(prepared: PreparedPlan, reserve: FurnitureReserve): LayoutPlan {
    const { analysis, context, declaration, overflow: overflowResult, facetGrid: facetGridResult } = prepared;
    const report = [...prepared.report];
    const reasons = [...prepared.reasons];
    const { channelSemantics, data, convertedData, encodings, template, templateMarkType } = analysis;
    const { chartProperties, options, size, theme, profile } = context;
    const measureText = profile.measureText ?? tableTextMeasurer;
    const ceiling = size.canvasSize ?? size.baseSize;
    const effectiveOptions: AssembleOptions = {
        ...prepared.options,
        bandStepFitCapacityX: Math.max(ceiling.width * 0.6, ceiling.width - reserve.width),
        bandStepFitCapacityY: Math.max(ceiling.height * 0.6, ceiling.height - reserve.height),
        // Small multiples shrink their tick labels no further than the theme lets type go.
        ...(theme && prepared.options.minLabelFontSize === undefined
            ? { minLabelFontSize: (theme as ThemeSpec).type?.minSize ?? 8 }
            : {}),
    };
    const values = overflowResult.filteredData;
    const nominalCounts = overflowResult.nominalCounts;
    const treatment = prepared.options.canvasTreatment;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Compute Layout (VL-free)
    // ═══════════════════════════════════════════════════════════════════════

    const layoutResult = computeLayout(
        channelSemantics,
        declaration,
        values,  // post-overflow filtered data
        size.baseSize,
        effectiveOptions,
        facetGridResult,
        context.pins?.plot,
    );

    // Attach overflow truncations from filterOverflow
    layoutResult.truncations = overflowResult.truncations;

    // A banded axis spans its step times its bands. A truncated axis draws one more band, for the
    // placeholder that names what was omitted; a group-unit step spans one category. A plain band
    // spans exactly its bands; a point scale and a nested band add their padding at the ends.
    const themeFillsBars = !!theme && [...templateMarks(template)].some((mark) => mark === 'bar' || mark === 'rect' || mark === 'boxplot');
    const bandSpan = (channel: 'x' | 'y'): number => {
        const step = channel === 'x' ? layoutResult.xStep : layoutResult.yStep;
        const grouped = (channel === 'x' ? layoutResult.xStepUnit : layoutResult.yStepUnit) === 'group';
        const placeholder = layoutResult.truncations.some((truncation) => truncation.channel === channel) ? 1 : 0;
        const bands = (grouped ? nominalCounts[channel] : (channel === 'x' ? layoutResult.xNominalCount : layoutResult.yNominalCount)) + placeholder;
        const shape = declaration.bandAxes?.[channel] ?? { scale: 'band', nested: grouped };
        if (shape.scale === 'point') return step * (bands - 1 + 2 * shape.padding);
        if (!shape.nested) return step * bands;
        // A themed group is spaced by the house's group rule (G1), the same answer realization draws.
        const lanes = declaration.groupLaneCount ?? nominalCounts.group ?? 1;
        const themedGroup = themeFillsBars ? resolvedGroupSpacing(theme as ThemeSpec, context.chartType, template.geometryKinds) : undefined;
        const inner = themeFillsBars
            ? groupPadding(themedGroup!, resolveBandFraction(theme as ThemeSpec, context.chartType, template.geometryKinds, layoutResult.stepPadding), lanes, step).inner
            : profile.nestedBandPadding.inner;
        return step * (bands - inner + 2 * profile.nestedBandPadding.outer);
    };
    const houseLabelFontSize = theme
        ? resolveThemeFontSize(theme as ThemeSpec, theme.type?.axisLabel?.size, 10, layoutResult.subplotWidth || size.baseSize.width)
        : undefined;
    const labelFloor = theme ? axisLabelFloor(houseLabelFontSize ?? 10, (theme as ThemeSpec).type?.minSize) : undefined;
    // A canvas fit may set the labels on both axes a size or two down, never past the floor.
    const axisLabelFontSize = houseLabelFontSize !== undefined && treatment?.labelScale
        ? scaledAxisLabelSize(houseLabelFontSize, treatment.labelScale, labelFloor!)
        : houseLabelFontSize;
    if (context.bandLabels) {
        planBandLabels(
            { layout: layoutResult, canvasSize: size.baseSize, channelSemantics, assembleOptions: effectiveOptions, table: values },
            {
                fontSize: axisLabelFontSize,
                textCase: (theme as ThemeSpec | undefined)?.type?.axisLabel?.case,
                // A themed chart's names are measured in the face they are drawn in, as its value labels are.
                ...(theme ? { minFontSize: labelFloor } : {}),
                ...(theme ? { measure: bandLabelMeasure(theme as ThemeSpec) } : {}),
                // How x names that do not stand flat may be set, weighed by cost: the chart's ways, else the theme's, else the rule.
                ...xLabelOverflow(theme as ThemeSpec | undefined, chartProperties, channelSemantics),
                skip: (channel) => context.bandLabels!.skip(channel) || declaration.axisLabels?.[channel] !== undefined
                    || (channel === 'y' && Boolean(effectiveOptions.rowNamesAbove)),
            },
        );
    }

    const plotContext: PlotPlanContext = {
        layout: layoutResult,
        canvasSize: size.baseSize,
        assembleOptions: effectiveOptions,
        channelSemantics,
        table: values,
        fullTable: convertedData,
        semanticTypes: context.semanticTypes,
        chartProperties,
        measureText: familyMeasure(measureText, theme ? themeBodyFamily(theme) ?? 'sans-serif' : 'sans-serif'),
    };
    const plot = template.planPlot?.(plotContext) ?? {
        width: layoutResult.xNominalCount > 0 ? bandSpan('x') : layoutResult.subplotWidth,
        height: layoutResult.yNominalCount > 0 ? bandSpan('y') : layoutResult.subplotHeight,
    };

    const composite = Boolean(template.composite || layoutResult.facet);
    // What the chart draws past its plot — a radar's spoke labels — which keys beside it stand clear of.
    const overhang = composite ? undefined : template.planOverhang?.(plotContext, plot);

    const trace = layoutResult.trace;
    const px = (value: number) => Math.round(value);
    for (const channel of ['x', 'y'] as const) {
        const count = channel === 'x' ? layoutResult.xNominalCount : layoutResult.yNominalCount;
        const banded = count > 0 || (channel === 'x' ? layoutResult.xContinuousAsDiscrete : layoutResult.yContinuousAsDiscrete) > 0;
        const step = channel === 'x' ? layoutResult.xStep : layoutResult.yStep;
        if (!banded) continue;
        reasons.push({ part: 'step', channel, decision: `${step % 1 ? step.toFixed(1) : step} px per band`, chain: trace?.[channel === 'x' ? 'xStep' : 'yStep'] ?? [] });
    }
    for (const dimension of ['width', 'height'] as const) {
        const channel = dimension === 'width' ? 'x' : 'y';
        const value = plot[dimension];
        const count = channel === 'x' ? layoutResult.xNominalCount : layoutResult.yNominalCount;
        const own = Boolean(template.planPlot);
        const chain: PlanStage[] = own
            ? [{ rule: 'template plot', value: px(value), note: 'the template sizes its own plot from the room and the rows' }]
            : count > 0
                ? [{ rule: 'bands × step', value: px(value), read: { bands: count + (layoutResult.truncations.some((t) => t.channel === channel) ? 1 : 0), step: Math.round((channel === 'x' ? layoutResult.xStep : layoutResult.yStep) * 10) / 10, unit: channel === 'x' ? layoutResult.xStepUnit ?? 'item' : layoutResult.yStepUnit ?? 'item' }, note: 'a banded axis spans its step times its bands, plus one for a placeholder where rows were cut; the canvas does not size it' }]
                : trace?.[dimension] ?? [];
        reasons.push({ part: 'plot', channel: dimension, decision: `${px(value)} px`, chain });
    }

    const typeOf = (channel: 'x' | 'y') => declaration.resolvedTypes?.[channel] ?? channelSemantics[channel]?.type;
    const drawn = skeletonChannels(template.template);
    const present = { x: Boolean(channelSemantics.x) || drawn.has('x'), y: Boolean(channelSemantics.y) || drawn.has('y') };
    const fieldFacts = (channel: 'x' | 'y'): AxisFieldFacts => ({
        present: present[channel],
        type: typeOf(channel),
        banded: declaration.axisFlags?.[channel]?.banded === true,
    });
    const categoryChannel = axisRoles({ x: fieldFacts('x'), y: fieldFacts('y') }).categoricalChannel;
    const xNamed = typeOf('x') === 'nominal' || typeOf('x') === 'ordinal';
    const xField = channelSemantics.x?.field;
    const structure = chartStructure(template, {
        channelSemantics,
        resolvedTypes: declaration.resolvedTypes as Record<string, string> | undefined,
        table: values,
        data,
        fullTable: convertedData,
        chartProperties,
        templateMarkType,
        channels: template.channels,
        steps: { x: layoutResult.xStep, y: layoutResult.yStep },
        encodings,
        displayNames: chartDisplayNames(context.fieldDisplayNames, analysis.staticSeries ?? undefined),
        spellField: profile.spellField,
    });

    const segmented = segmentedBands(structure, values, [channelSemantics.column?.field, channelSemantics.row?.field]);
    const title = printedTitle(context, structure);
    // Grounding runs whether or not a theme was named, with the neutral one when it was not: some
    // design questions are Flint's own, such as whether this chart can carry its values at this density.
    const design = groundTheme(theme ?? {}, {
        chartType: context.chartType,
        measureText,
        markChannel: template.markCognitiveChannel,
        markTypes: structure.marks,
        namesOnMarks: chartProperties?.showSeriesInLabel === true,
        seriesOneInk: structure.series?.oneInk === true,
        channelSemantics,
        resolvedTypes: declaration.resolvedTypes as Record<string, string> | undefined,
        axisFlags: declaration.axisFlags,
        positional: {
            ...(structure.x ? { x: { type: structure.x.type, field: structure.x.derived ? undefined : structure.x.fields[0] } } : {}),
            ...(structure.y ? { y: { type: structure.y.type, field: structure.y.derived ? undefined : structure.y.fields[0] } } : {}),
            ...(structure.series?.field ? { color: { field: structure.series.field, type: structure.series.type } }
                : structure.series?.derived ? { color: { field: structure.series.derived, type: structure.series.type, derived: true } } : {}),
            ...(segmented ? { stacked: true } : {}),
        },
        layout: layoutResult,
        table: values,
        canvasSize: size.baseSize,
        stacked: structure.stacking === 'normalized' ? 'normalize' : segmented,
        partToWhole: structure.marks.includes('arc'),
        titled: Boolean(title),
        headline: headlineText(title),
        hostSurface: (options as Record<string, any>).background,
        valueLabels: valueLabelChoice(template, structure, resolveValueLabelChoice(chartProperties)),
        labelOverflow: chartProperties?.labelOverflow,
        geometryKinds: template.geometryKinds,
        liveLayoutSignal: options.liveLayoutSignal,
    });
    // Names above their bars are drawn by their own layer: the axis prints none, and keeps no room for them.
    const rowNames = effectiveOptions.rowNamesAbove && design.axes.y
        ? rowNamesGeometry(layoutResult.yStep, design.axes.y.label.fontSize ?? axisLabelFontSize ?? 11, design.marks.bandFraction, plot.width)
        : undefined;
    if (rowNames && design.axes.y) design.axes.y = { ...design.axes.y, label: { ...design.axes.y.label, show: false } };
    // A canvas-fit pass may set the headline and deck smaller, never below a legible floor.
    if (treatment?.titleScale) {
        const scaled = (size: number | undefined, floor: number) => (size === undefined ? undefined : Math.max(Math.min(size, floor), Math.round(size * treatment.titleScale!)));
        design.title = {
            ...design.title,
            headline: { ...design.title.headline, fontSize: scaled(design.title.headline.fontSize, TITLE_FLOOR.headline) },
            deck: { ...design.title.deck, fontSize: scaled(design.title.deck.fontSize, TITLE_FLOOR.deck) },
        };
        layoutResult.titleFontSize = scaled(layoutResult.titleFontSize, TITLE_FLOOR.headline)!;
    }
    if (treatment?.labelScale && axisLabelFontSize !== undefined) {
        for (const channel of ['x', 'y'] as const) {
            const axis = design.axes[channel];
            if (axis && (axis.label.fontSize ?? 0) > axisLabelFontSize) design.axes[channel] = { ...axis, label: { ...axis.label, fontSize: axisLabelFontSize } };
        }
    }

    const axisLabels = planAxisLabels(layoutResult, declaration, axisLabelFontSize === undefined ? undefined : {
        fontSize: axisLabelFontSize,
        noLimit: theme?.labels?.truncation === 'never',
        font: theme ? themeBodyFamily(theme) : undefined,
    }, {
        present,
        xRuler: typeOf('x') === 'temporal' || typeOf('x') === 'quantitative',
    });
    for (const channel of ['x', 'y'] as const) {
        const pin = { ...declaration.axisLabels?.[channel], ...context.pins?.axisLabels?.[channel] };
        if (Object.keys(pin).length) axisLabels[channel] = pinAxisLabels(axisLabels[channel], pin);
    }
    for (const channel of ['x', 'y'] as const) {
        if (!present[channel]) continue;
        const sizing = channel === 'x' ? layoutResult.xLabel : layoutResult.yLabel;
        const label = axisLabels[channel];
        const resolvedType = declaration.resolvedTypes?.[channel];
        const bandedAxis = (channel === 'x' ? layoutResult.xNominalCount : layoutResult.yNominalCount) > 0 || resolvedType === 'nominal' || resolvedType === 'ordinal';
        const chain: PlanStage[] = [
            { rule: 'fitted to the band', value: `${sizing.fontSize}px${sizing.labelAngle ? `, ${sizing.labelAngle}°` : ''}`, read: { step: Math.round((channel === 'x' ? layoutResult.xStep : layoutResult.yStep) * 10) / 10, limit: sizing.labelLimit }, note: 'the size ladder descends as bands tighten, and both axes share the smaller size; narrow bands turn their names' },
        ];
        if (axisLabelFontSize !== undefined) {
            chain.push({ rule: 'theme size', value: `${label.fontSize}px`, read: { asked: axisLabelFontSize, crowdedFrom: label.crowdedFrom }, note: label.crowdedFrom ? 'the theme\'s size would crowd the bands, so the fitted size holds' : 'the theme\'s size holds' });
        }
        const fit = channel === 'x' ? sizing.overflow : undefined;
        if (channel === 'x' && bandedAxis && fit) {
            // The names did not stand flat and whole: the overflow path chose the cheapest step.
            chain.push({
                rule: 'overflow step',
                value: `${fit.step}${fit.trimmed ? ' + trim' : ''}`,
                read: { needed: Math.round(fit.needed), band: Math.round(fit.band), ...(fit.shown ? { shown: fit.shown.length } : {}) },
                note: fit.step === 'wrap' ? 'the names break onto two lines to fit their band'
                    : fit.step === 'skip' ? 'a sequence that explains itself keeps only its round values, flat'
                        : `the names turn ${fit.step === 'rotate45' ? '−45°' : 'upright'}: the cheapest step the path allows${fit.trimmed ? ', each trimmed to its limit' : ''}`,
            });
        } else if (channel === 'x' && bandedAxis) {
            chain.push({ rule: 'overflow step', value: 'none', note: 'the names stand flat and whole in their band' });
        } else if (channel === 'x') {
            chain.push({ rule: 'angle', value: '0°', note: 'a continuous axis spaces its ticks by the ruler, so its labels never turn' });
        } else if (label.angle !== undefined) {
            chain.push({ rule: 'angle', value: `${label.angle}°`, note: 'as the pin asks' });
        }
        if (context.pins?.axisLabels?.[channel]) chain.push({ rule: 'pinned', value: `${label.fontSize}px, ${label.angle ?? 0}°`, read: { ...context.pins.axisLabels[channel] }, note: 'held at the pinned values, however crowded' });
        reasons.push({ part: 'labels', channel, decision: `${label.fontSize}px${label.angle ? `, turned ${label.angle}°` : ', straight'}`, chain });
    }
    const titles = axisTitles(structure, {
        encodings, channelSemantics, displayNames: chartDisplayNames(context.fieldDisplayNames, analysis.staticSeries ?? undefined), spellField: profile.spellField,
    });
    // An axis title is cased once, here, so it is measured, moved into a deck and drawn the same.
    for (const channel of ['x', 'y'] as const) {
        const title = titles[channel];
        const textCase = design.axes[channel]?.title.textCase;
        if (typeof title === 'string' && textCase) titles[channel] = applyTextCase(title, textCase);
    }
    // A title longer than its axis wraps onto two lines at the axis's length, a second line past it
    // cut, rather than run past the plot and stretch the drawing to hold it. One view's axes only.
    const axisTitleFit: Partial<Record<'x' | 'y', AxisTitleFit>> = {};
    if (!composite && !layoutResult.facet) {
        for (const channel of ['x', 'y'] as const) {
            const text = titles[channel];
            const title = design.axes[channel]?.title;
            if (typeof text !== 'string' || !text || (theme && (!title?.show || (title.placement && title.placement !== 'rotated')))) continue;
            const fontSize = (theme ? title?.fontSize : undefined) ?? layoutResult.titleFontSize;
            const widthOf = (profile.measureText ?? tableTextMeasurer)(fontSize, title?.font ?? design.font ?? 'sans-serif', title?.fontWeight ?? 'bold', 'normal');
            const fit = fitAxisTitle(text, channel === 'x' ? plot.width : plot.height, widthOf, fontSize);
            if (fit) axisTitleFit[channel] = fit;
        }
    }
    const titleInputs = {
        structure, design, layout: layoutResult, axisLabels, axisTitles: titles, plot, rows: values,
        title: context.title, rowFacet: channelSemantics.row?.field, themed: Boolean(theme),
    };
    // The header is planned before the title: its edge band and the line above push the title down,
    // and what sits beside the headline is taken from the width the title is fitted to.
    const header = planHeader({
        design, label: context.label, block: chartBlock(titleInputs) ?? size.baseSize.width, measure: tableTextMeasurer,
        titleAnchor: theme ? design.title.anchor : 'middle',
    });
    if (header?.moved) report.push({ stage: 'realize', path: 'furniture', code: 'header-moved-above-title', message: header.moved });
    if (header && (header.beside.start || header.beside.end)) Object.assign(titleInputs, { beside: header.beside });
    let titlePlan = composite ? undefined : context.pins?.title ?? planTitle(titleInputs);

    const labelLengths = drawnLengths(plot, titlePlan, undefined);
    let valueLabels = planValueLabels({ design, structure, segmented, channelSemantics, rows: values, lengths: labelLengths });
    // A house that would rather every label read alike prints them all past the bar's end once one
    // bar is too short for its own (L4).
    if (valueLabels && !('refused' in valueLabels) && design.dataLabels.fallback === 'allOutside'
        && (valueLabels.channel === 'x' || valueLabels.channel === 'y')
        && someLabelsOverrun(valueLabels, design, values, labelLengths[valueLabels.channel])) {
        valueLabels = planValueLabels({ design, structure, segmented, channelSemantics, rows: values, lengths: labelLengths, outside: true });
        report.push({ stage: 'realize', path: 'dataLabels.fallback', code: 'value-labels-all-outside',
            message: 'some bars are too short to hold their own label, so every label is printed past its bar’s end, as the house asks' });
    }
    const domains = measureDomains(structure, segmented, channelSemantics, values);
    if (valueLabels && !('refused' in valueLabels) && valueLabels.headroom && valueLabels.channel === 'y') {
        const { headroom: asked, ...rest } = valueLabels;
        const headroom = domains.y ? freeHeadroom(domains.y, asked) : asked;
        valueLabels = headroom ? { ...rest, headroom } : rest;
        const extent = domains.y?.extent;
        if (extent && headroom) domains.y = { ...domains.y!, extent: [headroom.min ?? extent[0], headroom.max ?? extent[1]] };
    }
    // A whole pie with its numbers outside is sized by where they fall, and its plot comes in to
    // the drawing: the title's lines stay taken out of it.
    if (valueLabels && !('refused' in valueLabels) && valueLabels.form === 'radial' && !valueLabels.inside && !composite) {
        const room = { width: plot.width, height: labelLengths.y };
        const sort = chartProperties?.sortSlices;
        const arc = fitArcLabels({
            design, rows: values, field: valueLabels.field, seriesField: channelSemantics.color?.field,
            sort: sort === 'ascending' || sort === 'descending' ? sort : 'none',
            plot: room, radius: Math.floor(Math.min(room.width, room.height) / 2) - 4,
        });
        if (arc) {
            valueLabels = { ...valueLabels, arc };
            plot.height -= room.height - arc.height;
        }
    }
    if (valueLabels) {
        reasons.push('refused' in valueLabels
            ? { part: 'values', decision: 'none', chain: [{ rule: 'value labels', value: 'refused', read: { asked: design.dataLabels.show, placement: design.dataLabels.placement }, note: valueLabels.refused }] }
            : { part: 'values', decision: `${valueLabels.form}${valueLabels.inside ? ', inside' : ''}`, chain: [
                { rule: 'theme asks', value: String(design.dataLabels.show), read: { placement: design.dataLabels.placement }, note: 'the theme prints values where they fit' },
                { rule: 'form', value: valueLabels.form, read: { channel: valueLabels.channel, field: valueLabels.field, inside: valueLabels.inside, body: valueLabels.body }, note: 'in each cell, along each slice, mid-segment, or at each mark\'s end, as the mark allows' },
                ...(valueLabels.inset || valueLabels.headroom ? [{ rule: 'room past the ends', value: valueLabels.inset ? `${valueLabels.inset} px inset` : `headroom ${JSON.stringify(valueLabels.headroom)}`, note: 'labels past bar ends keep room on the value scale so they stay in the plot' } satisfies PlanStage] : []),
            ] });
    }
    const bandSpans: LayoutPlan['bandSpans'] = {};
    for (const channel of ['x', 'y'] as const) {
        const bands = channel === 'x' ? layoutResult.xContinuousAsDiscrete : layoutResult.yContinuousAsDiscrete;
        const type = typeOf(channel);
        const field = channelSemantics[channel]?.field;
        if (bands <= 1 || !field || (type !== 'quantitative' && type !== 'temporal')) continue;
        if (declaration.binnedAxes?.[channel]) continue;
        const bounds = domains[channel]?.bounds;
        if (bounds?.min !== undefined && bounds.max !== undefined) continue;
        const span = continuousBandSpan(values, field, type === 'temporal', bands);
        if (!span) continue;
        bandSpans[channel] = { span, temporal: type === 'temporal' };
        if (type === 'quantitative') domains[channel] = { ...(domains[channel] ?? { dropZero: false }), zero: false, extent: span };
    }

    const orders = categoryOrders(template, structure, encodings, channelSemantics, data, context.semanticTypes);
    const sizeType = encodings.size && template.channels?.includes('size') ? encodedType('size', encodings.size, channelSemantics.size) : undefined;
    const sizes = encodings.size && template.channels?.includes('size')
        ? {
            range: sizeRange(sizeType === 'quantitative' || sizeType === 'temporal', size.baseSize, data.length, theme && sizeType === 'quantitative' ? design.marks : undefined),
            quantitative: sizeType === 'quantitative' || sizeType === 'temporal',
        }
        : undefined;
    const pointSize = theme ? planPointSize(design, structure, values, plot, channelSemantics, report) : undefined;
    // A house that already fades its dots shows the pile-up; the note is for charts that do not.
    const fadedByHouse = theme && (design.marks.point?.opacity ?? 1) < 1;
    const crowding = fadedByHouse ? undefined : planCrowding(structure, values, plot, pointSize ?? VEGA_DOT_SIZE, channelSemantics, typeOf, chartProperties);
    const lineWidth = planLineWidth(theme ? design : undefined, structure, values, plot, channelSemantics, report);
    const points = theme ? pointPadding(structure, design, values, pointSize, domains, bandSpans, typeOf, channelSemantics, plot) : undefined;
    const furniture = planFurniture({
        structure, design: theme ? design : undefined, channelSemantics, declaration, layout: layoutResult,
        options: effectiveOptions, rows: values, data, canvas: size.baseSize, chartProperties,
        ...(prepared.facetSpacing !== undefined ? { spacing: prepared.facetSpacing } : {}),
    });
    // Facet panels share their scales, so each panel draws the ruler a single plot of its size would;
    // a template's own composite, and a y each wrapped panel scales for itself, keep theirs.
    const measured = theme && !template.composite && !options.liveLayoutSignal ? measureRulers({
        structure, design, domains, channelSemantics, encodings, axisLabels, valueLabels,
        length: drawnLengths(plot, titlePlan, valueLabels), measure: measureText, points,
    }) : {};
    const rulers: typeof measured = furniture.facets.independentY ? { ...(measured.x ? { x: measured.x } : {}) } : measured;
    // Inside labels are checked one by one against the axis as it will be drawn.
    if (valueLabels && !('refused' in valueLabels) && valueLabels.inside && (valueLabels.channel === 'x' || valueLabels.channel === 'y')) {
        const along = valueLabels.channel;
        valueLabels = fitInsideLabels(valueLabels, design, values, { length: drawnLengths(plot, titlePlan, valueLabels)[along], domain: rulers[along]?.domain });
    }
    const displayNames = chartDisplayNames(context.fieldDisplayNames, analysis.staticSeries ?? undefined);
    const channelTitles: Partial<Record<string, string>> = {};
    for (const [channel, encoding] of Object.entries(encodings)) {
        if (!encoding) continue;
        const { title } = encodingTitle(channel, encoding, channelSemantics[channel], displayNames, profile.spellField);
        if (typeof title === 'string') channelTitles[channel] = title;
    }
    const facetColumns = facetGridResult?.columns ?? (nominalCounts.column || 1);
    const views = template.planViews
        ? template.planViews({ ...plotContext, plot, spacing: furniture.facets.spacing, titles: channelTitles, facetColumns, rulerOverhang: rulerOverhang(structure, theme ? design : undefined) })
        : template.composite ? undefined : facetViews(
            plot,
            { column: channelSemantics.column?.field, row: channelSemantics.row?.field, wrapColumns: facetColumns },
            values,
            furniture.facets.spacing,
        );
    // A chart of several views is titled and keyed across all of them.
    const extent = composite && views ? viewsExtent(views) : undefined;
    if (extent) titlePlan = context.pins?.title ?? planTitle({ ...titleInputs, viewsWidth: extent.width });
    // The rules a theme closes the block with, and the height they and a broken title take from
    // the plot, where its height is stated rather than counted in bands.
    const rules = theme ? planRules({
        design, structure, views,
        block: chartBlock({ ...titleInputs, ...(extent ? { viewsWidth: extent.width } : {}) }, false) ?? 0,
    }) : undefined;
    if (rules && 'refused' in rules) report.push({ stage: 'realize', path: 'furniture', code: rules.refused, message: rules.message });
    const bandedY = (type: string | undefined) => type === 'nominal' || type === 'ordinal';
    const plotGives = Boolean(template.planViews) || !(bandedY(structure.y?.type) || bandedY(typeOf('y')) || layoutResult.yNominalCount > 0);
    const ruled = rules && 'rules' in rules ? rules : undefined;
    // The header's edge band and the line above the headline come out of the plot too, and so does
    // the source line at the foot.
    const sourcePlan = planSource({
        design, source: context.source, block: chartBlock({ ...titleInputs, ...(extent ? { viewsWidth: extent.width } : {}) }) ?? size.baseSize.width,
        measure: tableTextMeasurer,
    });
    const headerRoom = (header ? header.edge + header.line : 0) + (sourcePlan?.room ?? 0);
    const drawViews = (title: TitlePlan | undefined) => {
        const drawn = views && (ruled || title || headerRoom) && plotGives
            ? shortenViews(views, (height) => {
                const titled = heightAfterTitle(height, title);
                const closed = ruled ? plotHeightAfter(titled, ruled.room) : titled;
                return headerRoom ? plotHeightAfter(closed, headerRoom) : closed;
            })
            : views;
        return drawn && ruled ? withRules(drawn, ruled.rules) : drawn;
    };
    let viewsDrawn = drawViews(titlePlan);
    const legend = planLegend({
        placement: planLegendPlacement({
            design, structure, channelSemantics, orders, rows: values,
            value: runValueScale(structure, domains, rulers, channelSemantics.y, design, values, Boolean(theme)),
            ...(composite ? {} : { plot }),
            ...(overhang?.fills ? { fills: true } : {}),
        }),
        structure, design: theme ? design : undefined, channelSemantics, orders, rows: values,
        layout: layoutResult, plot, composite, flatYTitle: (furniture.yTitle?.top ?? 0) > 0, axisTitles: titles,
        ...(furniture.yTitle ? { flatYTitleLift: furniture.yTitle.lift } : {}),
        ...(extent ? { viewsWidth: extent.width } : {}),
    });
    reasons.push({
        part: 'legend',
        decision: legend.keys.length ? `${legend.placement}${legend.orient ? `, ${legend.orient}` : ''}` : 'no key',
        chain: [
            { rule: 'theme placement', value: design.legend.placement, read: { show: design.legend.show, fallbacks: design.legend.fallbacks?.join(' › ') }, note: !design.legend.show ? 'the theme shows no key' : !legend.keys.length ? 'nothing to key: no channel names a series' : 'the house\'s ranked placements; the first the chart can draw' },
            ...(legend.demoted ? [{ rule: 'demoted', value: legend.placement, note: legend.demoted } satisfies PlanStage] : []),
            ...(legend.layout?.notes ?? []).map((note) => ({ rule: note.code, value: 'gave way', note: note.message }) satisfies PlanStage),
            ...(legend.layout?.footprint ?? []).map((foot) => ({ rule: 'footprint', value: `${px(foot.width)} × ${px(foot.height)} at ${foot.orient}`, read: { plotWidth: px(legend.layout!.plot.width), plotHeight: px(legend.layout!.plot.height) }, note: 'the keys laid out at their edge, measured; not taken from the canvas' }) satisfies PlanStage),
        ],
    });
    if (theme) {
        const asked = design.furniture.filter((item) => item.kind === 'headerRule' || item.kind === 'footerRule');
        reasons.push({
            part: 'rules',
            decision: ruled ? `${ruled.rules.length} rule${ruled.rules.length === 1 ? '' : 's'}, ${px(ruled.room)} px${plotGives ? ' from the plot' : ''}` : 'none',
            chain: !asked.length
                ? [{ rule: 'theme furniture', value: 'none', note: 'the theme closes the chart with no rule' }]
                : rules && 'refused' in rules
                    ? [{ rule: 'theme furniture', value: `${asked.length} asked` }, { rule: rules.refused, value: 'none', note: rules.message }]
                    : [
                        { rule: 'theme furniture', value: `${asked.length} asked`, read: { edges: asked.map((item) => ((item.anchor ?? 'topLeft').startsWith('top') ? 'top' : 'bottom')).join(', ') } },
                        { rule: 'block', value: px(ruled?.rules[0]?.width ?? 0), read: { plot: px(extent?.width ?? plot.width) }, note: 'a rule runs the width of the block the title spans: the plot widened a little for its axes, plus the category labels beside it' },
                        { rule: 'room', value: px(ruled?.room ?? 0), read: { fromPlot: plotGives }, note: plotGives ? 'each rule and its gap are taken out of the plot\'s height' : 'a banded y counts its height in bands, so the rules add to it instead' },
                    ],
        });
    }
    const keyTitles: Partial<Record<string, string | null>> = {};
    for (const key of legend.keys) {
        const encoding = encodings[key.channel];
        if (!encoding) continue;
        const { title, field } = encodingTitle(key.channel, encoding, channelSemantics[key.channel], displayNames, profile.spellField);
        // `null` is the author's: the key prints no title.
        const name = title !== undefined ? title : encoding.aggregate ? undefined : field;
        if (name !== undefined) keyTitles[key.channel] = name;
    }
    const columns = layoutResult.facet?.columns ?? 1;
    const facetRows = layoutResult.facet?.rows ?? 1;
    const gap = layoutResult.effectiveFacetGap ?? 10;
    const authored: Partial<Record<string, { orient?: string; titleOrient?: string }>> = {};
    for (const key of legend.keys) {
        const pinned = (encodings[key.channel] as { legend?: { orient?: string; titleOrient?: string } } | undefined)?.legend;
        if (pinned) authored[key.channel] = { ...(pinned.orient ? { orient: pinned.orient } : {}), ...(pinned.titleOrient ? { titleOrient: pinned.titleOrient } : {}) };
    }
    legend.keyInputs = keysToLayout(legend, { rows: values, authored, design: theme ? design : undefined, structure, layout: layoutResult, titles: keyTitles, sizes, themed: Boolean(theme), placements: theme?.legend?.placement });
    if (theme) {
        const { arrangement, titlePosition, align, gaps } = design.legend;
        legend.preferences = { ...(arrangement ? { arrangement } : {}), ...(titlePosition ? { titlePosition } : {}), ...(align ? { align } : {}), ...(gaps ? { gaps } : {}) };
    }
    if (treatment?.keys || treatment?.oneKey || treatment?.names) {
        legend.keyInputs = moveKeys(legend.keyInputs ?? [], treatment);
        legend.preferences = {
            ...legend.preferences,
            ...(treatment.keys === 'top' || treatment.keys === 'bottom' ? { arrangement: 'row' as const } : {}),
            ...(treatment.names ? { sideWidth: treatment.names.keyWidth } : {}),
        };
    }
    if (legend.keyInputs?.some((key) => key && (key.orient === 'top' || key.orient === 'bottom' || key.moveTo === 'top' || key.moveTo === 'bottom' || !key.fixed))) {
        // The y labels and title beside the plot: a row of keys above or below it may run over them, as the title does.
        const { parts } = measureReserve({
            along: { width: true, height: false },
            structure, design, themed: Boolean(theme), layout: layoutResult, channelSemantics, axisLabels, axisTitles: titles, axisTitleFit,
            domains, rulers, furniture, legend, title: context.title, titlePlan, rows: values,
            spacing: profile.spacing, measure: measureText,
        });
        legend.preferences = { ...legend.preferences, besidePlot: { start: (parts.yLabels ?? 0) + (parts.yTitle ?? 0), end: 0 } };
    }
    if (extent || !template.composite) {
        legend.layout = planKeyLayout(
            legend.keyInputs,
            extent ?? { width: plot.width * columns + Math.max(0, columns - 1) * gap, height: plot.height * facetRows + Math.max(0, facetRows - 1) * gap },
            measureText,
            legend.preferences,
        );
        for (const note of legend.layout.notes) report.push({ stage: 'ground', ...note });
        // The keys' air to the plot, in em of their type; a title over keys above the plot makes one
        // header block with them, its gap moved below the keys.
        const labelFontSize = Math.max(0, ...legend.layout.keys.map((key) => key?.labelFontSize ?? 0)) || 11;
        const titled = Boolean(printedTitle(context, structure)?.text) && (!theme || design.title.position !== 'bottom');
        const gaps = keyGaps({
            labelFontSize,
            density: theme?.layout?.density,
            plotSide: Math.min(legend.layout.plot.width, legend.layout.plot.height),
            spec: legend.preferences?.gaps,
            titled,
            topKeys: legend.layout.footprint.some((edge) => edge.orient === 'top'),
            titleGap: theme ? design.title.offset : profile.spacing.titleOffset,
            // A top key standing clear of a flat y title stays where it stood.
            ...(legend.titleClearance !== undefined ? { atLeast: { top: profile.spacing.keyOffset + legend.titleClearance } } : {}),
        });
        // A key beside the plot stands its gap past what the chart draws outside it.
        if (overhang) for (const edge of ['left', 'right', 'top', 'bottom'] as const) gaps.offsets[edge] += overhang[edge];
        legend.layout.offsets = gaps.offsets;
        if (gaps.headerGap !== undefined) legend.layout.headerGap = gaps.headerGap;
    }
    // The title spans the whole drawing: where keys stand beside the plot, it may run over them too.
    const keysBeside = keysBesideWidth(legend.layout?.footprint, legend.layout?.offsets?.right ?? profile.spacing.keyOffset);
    if (titlePlan && keysBeside > 0 && !context.pins?.title) {
        titlePlan = planTitle({ ...titleInputs, ...(extent ? { viewsWidth: extent.width } : {}), keysBeside }) ?? titlePlan;
        viewsDrawn = drawViews(titlePlan);
    }
    if (titlePlan) {
        const h = titlePlan.headline;
        reasons.push({
            part: 'title',
            decision: `${px(titlePlan.block)} px block${h?.lines ? `, ${h.lines.length} headline lines` : h?.fontSize ? `, headline ${h.fontSize}px` : ''}${titlePlan.deckFit ? `, ${titlePlan.deckFit.lines.length} deck lines` : ''}`,
            chain: [
                { rule: 'block', value: px(titlePlan.block), read: { plot: px(extent?.width ?? plot.width), canvas: px(size.baseSize.width) }, note: 'the plot widened a little for its axes, plus the category labels beside it, and never narrower than the canvas less the theme\'s padding' },
                { rule: 'headline', value: h?.lines ? `${h.lines.length} lines` : h?.fontSize ? `set down to ${h.fontSize}px` : 'one line', read: { size: design.title.headline.fontSize, taken: h?.lines ? h.taken : 0 }, note: h?.lines ? 'too wide for the block at the smaller size too, so it breaks over balanced lines and the extra lines come out of the plot' : h?.fontSize ? 'too wide at the theme\'s size, so it is set one size down, which fits' : 'fits the block at the theme\'s size' },
                ...(titlePlan.deck !== undefined ? [{ rule: 'deck', value: titlePlan.deckFit ? `${titlePlan.deckFit.lines.length} lines` : 'one line', read: { size: design.title.deck.fontSize, taken: titlePlan.deckFit?.taken ?? 0 }, note: 'the author\'s subtitle, then the axis titles the theme moves into the deck' } satisfies PlanStage] : []),
                ...(context.pins?.title ? [{ rule: 'pinned', value: 'held', note: 'the title fit is kept from the plan the chart was opened with' } satisfies PlanStage] : []),
            ],
        });
    }

    return {
        plot,
        composite,
        ...(viewsDrawn ? { views: viewsDrawn } : {}),
        ...(views ? { laidOutViews: views } : {}),
        ...(ruled ? { rules: { ...ruled, fromPlot: plotGives } } : {}),
        ...(header ? { header } : {}),
        ...(rowNames ? { rowNames } : {}),
        ...(sourcePlan ? { source: sourcePlan } : {}),
        structure,
        design,
        axisTitles: titles,
        ...(Object.keys(axisTitleFit).length ? { axisTitleFit } : {}),
        domains,
        bandSpans,
        ...(pointSize !== undefined ? { pointSize } : {}),
        ...(lineWidth !== undefined ? { lineWidth } : {}),
        ...(crowding ? { crowding } : {}),
        ...(points ? { points } : {}),
        orders,
        ...(sizes ? { sizes } : {}),
        furniture,
        rulers,
        legend,
        valueLabels,
        ...(titlePlan ? { title: titlePlan } : {}),
        layout: layoutResult,
        axisLabelFontSize,
        axisLabels,
        declaration,
        options: effectiveOptions,
        facetGrid: facetGridResult,
        rows: values,
        nominalCounts,
        viewports: overflowResult.viewports,
        warnings: overflowResult.warnings,
        report,
        reasons,
    };
}

/**
 * How a themed chart's category names are measured for their bands: in the face they are drawn in,
 * as its value labels are. A face the width table does not know is measured as the fallback it
 * knows, with room for running up to a tenth wider.
 */
/**
 * The options a themed chart's band labels are planned with (`planBandLabels`): the house's size at
 * this plot width, its floor, its case, its face, and the overflow path. Shared by every backend
 * that draws a house, so a chart's names are wrapped, shrunk or turned the same way in each.
 */
export function themedBandLabelOptions(
    theme: ThemeSpec, chartProperties: Record<string, any> | undefined, channelSemantics: Record<string, any>, plotWidth: number,
) {
    const fontSize = resolveThemeFontSize(theme, theme.type?.axisLabel?.size, 10, plotWidth);
    return {
        fontSize,
        textCase: theme.type?.axisLabel?.case,
        minFontSize: axisLabelFloor(fontSize, theme.type?.minSize),
        measure: bandLabelMeasure(theme),
        ...xLabelOverflow(theme, chartProperties, channelSemantics),
    };
}

function bandLabelMeasure(theme: ThemeSpec): (fontSize: number) => (text: string) => number {
    const family = themeBodyFamily(theme) ?? 'sans-serif';
    const weight = theme.type?.axisLabel?.weight !== undefined ? fontWeightOf(theme.type.axisLabel.weight) ?? 'normal' : 'normal';
    const margin = hostTextMeasurer() || measuresDrawnFace(family) ? 1 : 1.1;
    return (fontSize) => {
        const measure = valueLabelMeasurer()(fontSize, family, weight, 'normal');
        return (text) => measure(text) * margin;
    };
}

/** The smallest a canvas-fit pass sets the headline and the deck, in px. */
const TITLE_FLOOR = { headline: 13, deck: 11 };

/**
 * The keys as a canvas-fit treatment sets them: every key the author did not place moved to one
 * edge — beside the plot, standing as a column, or above or below it, in a row.
 */
function moveKeys(keys: Array<KeyToLayout | undefined>, treatment: CanvasTreatment): Array<KeyToLayout | undefined> {
    const edgeOf = (to: 'side' | 'top' | 'bottom') => (to === 'side' ? 'right' : to);
    if (treatment.oneKey) {
        const { index, to } = treatment.oneKey;
        return keys.map((key, i) => (!key || key.fixed || i !== index ? key : { ...key, moveTo: edgeOf(to) }));
    }
    if (!treatment.keys) return keys;
    const orient = edgeOf(treatment.keys);
    return keys.map((key) => (!key || key.fixed ? key : { ...key, moveTo: orient }));
}

/**
 * The edits that answer what is wrong with a chart in its box, put down to the parts that cause it,
 * nearest to the chart as planned first.
 *
 * Too wide — the keys beside the plot take the width, stretch the drawing wider than its box, or
 * overflow it: the key names wrap to the width the box leaves (the keys stay); else the keys stand in
 * a row above or below. Too tall — the title, keys and chrome take the height, stretch the drawing
 * taller, or overflow it: keys stacked above or below stand in one row on their edge, else beside
 * the plot; a title that is most of what is above sets down a size, then two. A part that is not to
 * blame is left as it is. Single edits first; pairs only of the edits found.
 */
function culpritEdits(
    before: CanvasFitEstimate, parts: CanvasParts, box: { width: number; height: number },
    has: {
        keyed: boolean; titled: boolean; named: boolean; edge?: string;
        /** The keys the fit may move, where they stand as planned. */
        keys?: Array<{ index: number; orient: string; width: number; height: number; title?: string }>;
        /** Whether names run down the y axis, which may wrap. */
        rowNamed?: boolean;
        /** The gaps under the title and beside keys above or below the plot, which no part is to blame for. */
        headerAir?: { title: number; keys: number };
        /** The axis labels' house size and floor, where names down y wrap onto two lines and so set the rows' height. */
        labelSizes?: { size: number; floor: number };
    },
): { single: CanvasTreatment[]; paired: CanvasTreatment[] } {
    const p = parts.reserve.parts;
    const padding = 10;
    const L = CANVAS_FIT_LIMITS;
    const wide = before.around.width > L.around * 0.95 || before.stretch > 1 + (L.stretch - 1) * 0.95 || before.drawing.width > box.width;
    const tall = before.around.height > L.around * 0.95 || before.stretch < 1 / (1 + (L.stretch - 1) * 0.95) || before.drawing.height > box.height;
    const beside = has.edge === 'right' || has.edge === 'left';
    const rowEdge = has.edge === 'top' || has.edge === 'bottom' ? has.edge : undefined;
    // Blame is weighed on what is drawn — the title's lines, the keys, a flat y title — not on the air
    // between them or the chrome round them, which stay whichever part is edited.
    const title = Math.max(0, (p.title ?? 0) - (has.headerAir?.title ?? 0));
    const above = title + Math.max(0, (p.stackedKeys ?? 0) - (has.headerAir?.keys ?? 0)) + (p.flatYTitle ?? 0);
    const titleToBlame = has.titled && above > 0 && title / above >= TITLE_BLAME;
    const keysToBlame = has.keyed && (p.stackedKeys ?? 0) > 0;
    const single: CanvasTreatment[] = [];
    const add = (treatment: CanvasTreatment) => { if (Object.keys(treatment).length) single.push(treatment); };
    const keys = has.keys ?? [];
    const besideKeys = keys.filter((key) => key.orient === 'left' || key.orient === 'right');
    const stackedKeys = keys.filter((key) => key.orient === 'top' || key.orient === 'bottom');
    const oneKey = (key: (typeof keys)[number], to: 'side' | 'top' | 'bottom') => add({ oneKey: { index: key.index, to, ...(key.title ? { title: key.title } : {}) } });
    if (wide && has.keyed && beside) {
        const room = Math.round(box.width - padding - before.area.width - (p.seriesEnd ?? 0));
        if (has.named) add({ names: { keyWidth: Math.max(BALANCE_KEY_FLOOR, Math.min(room, SHORT_NAMES.keyWidth * 2)) } });
        if (has.named && room > SHORT_NAMES.keyWidth) add({ names: SHORT_NAMES });
        // Several keys beside the plot: one may stand in a row below or above it, the rest staying.
        if (besideKeys.length > 1) for (const key of [...besideKeys].sort((a, b) => b.width - a.width)) { oneKey(key, 'bottom'); oneKey(key, 'top'); }
        add({ keys: 'top' });
        add({ keys: 'bottom' });
    }
    if (tall) {
        if (keysToBlame && rowEdge) add({ keys: rowEdge });
        if (titleToBlame) add({ titleScale: TITLE_SCALE });
        // Several keys stacked above or below: one may stand beside the plot, the rest staying.
        if (keysToBlame && stackedKeys.length > 1) for (const key of [...stackedKeys].sort((a, b) => b.height - a.height)) oneKey(key, 'side');
        if (keysToBlame) add({ keys: 'side' });
        if (titleToBlame) add({ titleScale: TITLE_SCALE_DEEP });
        // Rows of wrapped names: the labels a px down at a time, never past their floor, whole on their lines.
        const labels = has.labelSizes;
        for (let step = 1; labels && step <= LABEL_STEPS && labels.size - step >= labels.floor - 1e-9; step++) {
            add({ labelScale: Math.round(((labels.size - step) / labels.size) * 1000) / 1000 });
        }
    }
    // The chart area itself too wide for its box, or its names taking the plot's room: the names down
    // the y axis wrap, so the chart takes the width the box leaves it. Its plot is not touched.
    const rowNames = p.yLabels ?? 0;
    const areaTooWide = before.area.width > box.width - padding;
    if (has.rowNamed && rowNames > ROW_NAMES_FLOOR && (areaTooWide || before.kinds.includes('yLabels') || (wide && before.scale < 1))) {
        add({ rowNames: Math.round(Math.max(ROW_NAMES_FLOOR, rowNames * ROW_NAMES_SHARE)) });
    }
    // Pairs, only of the edits found: the gentlest of each part, together.
    const paired: CanvasTreatment[] = [];
    const keyEdit = single.find((treatment) => treatment.keys);
    const nameEdit = single.find((treatment) => treatment.names);
    const titleEdit = single.find((treatment) => treatment.titleScale);
    const oneKeyEdit = single.find((treatment) => treatment.oneKey);
    const rowEdit = single.find((treatment) => treatment.rowNames);
    const labelEdit = single.find((treatment) => treatment.labelScale);
    if (keyEdit && titleEdit) paired.push({ ...keyEdit, ...titleEdit });
    if (labelEdit && titleEdit) paired.push({ ...labelEdit, ...titleEdit });
    if (keyEdit?.keys === 'side' && has.named) paired.push({ keys: 'side', names: SHORT_NAMES });
    if (nameEdit && titleEdit) paired.push({ ...nameEdit, ...titleEdit });
    if (oneKeyEdit && titleEdit) paired.push({ ...oneKeyEdit, ...titleEdit });
    if (rowEdit) {
        for (const edit of single) if (edit.keys || edit.oneKey) paired.push({ ...edit, rowNames: rowEdit.rowNames });
        if (titleEdit) paired.push({ ...rowEdit, ...titleEdit });
    }
    return { single, paired };
}

/** The scale under which a drawing that reads well is still worth mending, and the costliest edit spent on it: names wrapped. */
const SOFT_FIT_SCALE = 0.97;
/** The least a gentle edit must bring a drawing nearer its box, as a share of its scale, to be kept. */
const SOFT_FIT_GAIN = 0.03;
const GENTLE_EDIT_COST = LAYOUT_COSTS.edit.names + LAYOUT_COSTS.edit.namesNarrow;

/** The least a refit grows a plot side by to be worth laying out again: px, and a share of the side. */
const REFIT_MIN_GROWTH = 12;
const REFIT_MIN_SHARE = 0.05;

/** The narrowest the fit wraps names down the y axis to, in px, and the share of their width it aims for: about two lines. */
const ROW_NAMES_FLOOR = 60;
const ROW_NAMES_SHARE = 0.6;

/** A title is to blame for a tall header only where it is at least this share of what stands above and below the chart. */
const TITLE_BLAME = 0.45;

/** The narrowest column the fit gives key names, in px. */
const BALANCE_KEY_FLOOR = 90;

/** Whether a plan cuts any key's names short rather than set them whole. */
function cutsKeyNames(plan: LayoutPlan): boolean {
    return Boolean(plan.legend.layout?.keys.some((key) => key?.labelsFitted && key.labelLimit > 0));
}
