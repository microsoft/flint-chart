import type { AxisTitleFit } from './axis-title-fit';
import { format as formatNumber } from 'd3-format';
import type { AxisLabelPlan } from './axis-labels';
import type { FurniturePlan } from './furniture-plan';
import type { TextMeasurer } from './legend-layout';
import type { LegendPlan } from './legend-plan';
import type { MeasureDomain } from './measure-domain';
import { niceDomain, type AxisRuler } from './ruler';
import type { ChartStructure } from './structure';
import type { DesignDecisions } from './theme/types';
import type { TitlePlan } from './title-plan';
import type { ChannelSemantics, LayoutResult } from './types';

/** What a chart draws around its plot that takes room from it. */
export type ReservePart =
    | 'yLabels' | 'yTitle' | 'sideKeys' | 'seriesEnd'
    | 'xLabels' | 'xTitle' | 'title' | 'flatYTitle' | 'stackedKeys' | 'facetHeaders';

/** The room a chart's furniture takes beside and above or below its plot, in px. */
export interface FurnitureReserve {
    width: number;
    height: number;
    /** What each part takes. */
    parts: Partial<Record<ReservePart, number>>;
    /** Parts the chart draws that the plan cannot measure; they reserve nothing. */
    unmeasured?: ReservePart[];
}

/** The room the backend sets around text where the theme states none, in px. */
export interface FurnitureSpacing {
    tickSize: number;
    labelPadding: number;
    axisTitlePadding: number;
    keyOffset: number;
    titleOffset: number;
    deckPadding: number;
}

export const NO_RESERVE: FurnitureReserve = { width: 0, height: 0, parts: {} };

export interface ReserveInputs {
    /** The dimensions to measure: the ones a fitted axis runs along. */
    along: { width: boolean; height: boolean };
    structure: ChartStructure;
    design: DesignDecisions;
    themed: boolean;
    layout: LayoutResult;
    channelSemantics: Record<string, ChannelSemantics>;
    axisLabels: Record<'x' | 'y', AxisLabelPlan>;
    axisTitles: Record<'x' | 'y', string | null | undefined>;
    /** How a title longer than its axis is wrapped, where the plan fitted it: a second line takes its depth. */
    axisTitleFit?: Partial<Record<'x' | 'y', AxisTitleFit>>;
    domains: Partial<Record<'x' | 'y', MeasureDomain>>;
    rulers: Partial<Record<'x' | 'y', AxisRuler>>;
    furniture: FurniturePlan;
    legend: LegendPlan;
    /** The headline and deck the chart prints, and how they were fitted where the plan fitted them. */
    title?: { text: string; subtitle?: string[] };
    titlePlan?: TitlePlan;
    /**
     * Whether a deck printed with no headline — axis titles a theme moves above the plot — counts its
     * line. The plot is sized without it; what the drawing measures against a stated canvas counts it.
     */
    deckAlone?: boolean;
    rows: any[];
    spacing: FurnitureSpacing;
    measure: TextMeasurer;
}

const SIDES = new Set(['left', 'right']);
const ROWS = new Set(['top', 'bottom']);

/**
 * The widest tick label an axis prints: its category names, cut to the label limit, or the ends
 * of its measured ruler, else of its extent rounded as the backend rounds it. Undefined where the
 * plan does not know the values, such as dates or a backend aggregate.
 */
function widestTick(channel: 'x' | 'y', inputs: ReserveInputs): number | undefined {
    const { structure, channelSemantics, axisLabels, domains, rulers, design, rows, measure } = inputs;
    const axis = structure[channel];
    const labels = axisLabels[channel];
    const widthOf = measure(labels.fontSize, labels.font ?? design.font ?? 'sans-serif', 'normal', 'normal');
    const cs = channelSemantics[channel];
    const cut = (width: number) => (labels.limit ? Math.min(width, labels.limit) : width);
    if (axis?.type === 'nominal' || axis?.type === 'ordinal') {
        const field = cs?.field;
        if (!field) return undefined;
        let widest = 0;
        for (const name of new Set(rows.map((row) => row?.[field]))) {
            if (name != null) widest = Math.max(widest, widthOf(String(name)));
        }
        return cut(widest);
    }
    if (axis?.type !== 'quantitative') return undefined;
    const extent = rulers[channel]?.values ?? domains[channel]?.extent;
    if (!extent?.length) return undefined;
    const ends = rulers[channel] ? extent : niceDomain(Math.min(...extent), Math.max(...extent), design.axes[channel]?.tickCount ?? 5);
    const print = formatNumber(cs?.format?.pattern ?? ',.12~g');
    const text = (value: number) => `${cs?.format?.prefix ?? ''}${print(value)}${cs?.format?.suffix ?? ''}`;
    return cut(Math.max(...ends.map((value) => widthOf(text(value)))));
}

type AxisDecided = NonNullable<DesignDecisions['axes']['x']>;

/** How far a measure axis's grid runs on past the plot to end under its label, where the theme draws no ticks. */
export function gridOvershoot(axis: AxisDecided): number {
    return Math.max(4, Math.round((axis.label.padding ?? 4) * 0.75));
}

/**
 * Whether a faceted chart's y axis drops its ticks: where it draws no axis line, its ticks only carry
 * the grid on to the labels, and beside facet panels Vega sets the axis apart from the grid's ends.
 */
export function facetDropsTicks(axis: AxisDecided): boolean {
    return !axis.domain.show;
}

/** The tick a themed axis draws: its own, or its grid carried past the plot to the label. */
export function drawnTickSize(axis: AxisDecided, facetY = false): number {
    if (facetY && facetDropsTicks(axis)) return 0;
    if (axis.ticks.show) return axis.ticks.size;
    return axis.grid.show && axis.role === 'measure' && axis.label.show !== false ? gridOvershoot(axis) : 0;
}

/** The tick, its padding and the labels' depth across an axis. */
function tickDepth(channel: 'x' | 'y', inputs: ReserveInputs, labelDepth: number): number {
    const { design, themed, spacing } = inputs;
    const axis = themed ? design.axes[channel] : undefined;
    const tick = axis ? drawnTickSize(axis, channel === 'y' && Boolean(inputs.layout.facet)) : spacing.tickSize;
    return tick + (axis?.label.padding ?? spacing.labelPadding) + labelDepth;
}

/** The line a turned axis title takes across its axis; none where the theme lays it flat, moves it or hides it. */
function axisTitleDepth(channel: 'x' | 'y', inputs: ReserveInputs): number {
    const { design, themed, axisTitles, layout, spacing } = inputs;
    if (typeof axisTitles[channel] !== 'string' || !axisTitles[channel]) return 0;
    const fit = inputs.axisTitleFit?.[channel];
    const extra = fit ? (fit.lines.length - 1) * fit.lineHeight : 0;
    if (!themed) return layout.titleFontSize + spacing.axisTitlePadding + extra;
    const title = design.axes[channel]?.title;
    if (!title?.show || (title.placement && title.placement !== 'rotated')) return 0;
    return (title.fontSize ?? layout.titleFontSize) + (title.gap ?? spacing.axisTitlePadding) + extra;
}

/** The keys' room at each edge, the edge's offset from the plot included. */
function keyRoom(inputs: ReserveInputs, edges: Set<string>, dimension: 'width' | 'height'): number {
    const room = inputs.legend.layout?.footprint ?? [];
    return room.filter((edge) => edges.has(edge.orient))
        .reduce((sum, edge) => sum + edge[dimension] + (inputs.legend.layout?.offsets?.[edge.orient as 'top'] ?? inputs.spacing.keyOffset), 0);
}

/** The names a series-end placement sets past the runs' ends: the widest, at the size and offset it is set with. */
function seriesEndWidth(inputs: ReserveInputs): number {
    const { design, structure, channelSemantics, rows, measure } = inputs;
    const field = structure.series?.field ?? channelSemantics.color?.field ?? channelSemantics.detail?.field;
    if (!field) return 0;
    const text = design.legend.label;
    const widthOf = measure(Math.max(9, (text.fontSize ?? 11) - 1), text.font ?? design.font ?? 'sans-serif', text.fontWeight ?? 'normal', text.fontStyle ?? 'normal');
    let widest = 0;
    for (const name of new Set(rows.map((row) => row?.[field]))) {
        if (name != null) widest = Math.max(widest, widthOf(String(name)));
    }
    return widest ? widest + 5 : 0;
}

/**
 * The headline's and deck's first lines and their gaps; the lines a fit breaks them onto already
 * come out of the plot.
 */
function titleHeight(inputs: ReserveInputs): number {
    const { title, titlePlan, design, themed, layout, spacing } = inputs;
    const deck = titlePlan?.deck ?? title?.subtitle?.join(' ');
    if (!title?.text && !(inputs.deckAlone && deck)) return 0;
    const headline = !title?.text ? 0 : titlePlan?.headline?.fontSize ?? (themed ? design.title.headline.fontSize : undefined) ?? layout.titleFontSize;
    const deckSize = (themed ? design.title.deck.fontSize : undefined) ?? Math.round(layout.titleFontSize * 0.85);
    const deckRoom = deck ? (headline ? (themed ? design.title.deckPadding : spacing.deckPadding) : 0) + deckSize : 0;
    // Over keys above the plot the title stands at the header's inner gap; its own gap is the keys'.
    return headline + deckRoom + (inputs.legend.layout?.headerGap ?? (themed ? design.title.offset : spacing.titleOffset));
}

/**
 * The room a chart's furniture takes, measured from what the plan decided: beside the plot, the
 * y tick labels and a turned y title, keys at a side and series-end names; above and below, the x
 * tick labels (their turned depth where they turn), a turned x title, the headline and deck, a flat
 * y title and keys above or below. Only the dimensions asked for are measured.
 */
export function measureReserve(inputs: ReserveInputs): FurnitureReserve {
    const { along, structure, design, layout, axisLabels, legend, furniture } = inputs;
    const parts: Partial<Record<ReservePart, number>> = {};
    const unmeasured: ReservePart[] = [];
    const shown = (channel: 'x' | 'y') => Boolean(structure[channel]) && design.axes[channel]?.label.show !== false;

    if (along.width) {
        if (shown('y')) {
            const widest = widestTick('y', inputs);
            if (widest === undefined) unmeasured.push('yLabels');
            else parts.yLabels = tickDepth('y', inputs, widest);
        }
        const yTitle = axisTitleDepth('y', inputs);
        if (yTitle) parts.yTitle = yTitle;
        if (legend.placement === 'seriesEnd' && !legend.ownNames) {
            const names = seriesEndWidth(inputs);
            if (names) parts.seriesEnd = names;
        }
        const keys = keyRoom(inputs, SIDES, 'width');
        if (keys) parts.sideKeys = keys;
    }
    if (along.height) {
        if (shown('x')) {
            const labels = axisLabels.x;
            const lines = Math.max(1, ...(layout.xLabel.labelLines ?? []).map((line) => line.length));
            const straight = labels.fontSize + (lines - 1) * (labels.lineHeight ?? labels.fontSize);
            const radians = ((labels.angle ?? 0) * Math.PI) / 180;
            if (radians) {
                const widest = widestTick('x', inputs);
                if (widest === undefined) unmeasured.push('xLabels');
                else parts.xLabels = tickDepth('x', inputs, Math.ceil(Math.abs(widest * Math.sin(radians)) + Math.abs(labels.fontSize * Math.cos(radians))));
            } else {
                parts.xLabels = tickDepth('x', inputs, straight);
            }
        }
        const xTitle = axisTitleDepth('x', inputs);
        if (xTitle) parts.xTitle = xTitle;
        const title = titleHeight(inputs);
        if (title) parts.title = title;
        if (furniture.yTitle?.top) parts.flatYTitle = furniture.yTitle.top;
        const keys = keyRoom(inputs, ROWS, 'height');
        if (keys) parts.stackedKeys = keys;
        if (layout.facet && inputs.channelSemantics.column?.field && design.facets.header.show !== false) {
            parts.facetHeaders = Math.round((design.facets.header.fontSize ?? 11) * 1.7);
        }
    }
    if (legend.keys.length && !legend.layout) {
        if (along.width) unmeasured.push('sideKeys');
        if (along.height) unmeasured.push('stackedKeys');
    }

    const sum = (names: ReservePart[]) => names.reduce((total, name) => total + (parts[name] ?? 0), 0);
    return {
        width: Math.ceil(sum(['yLabels', 'yTitle', 'sideKeys', 'seriesEnd'])),
        height: Math.ceil(sum(['xLabels', 'xTitle', 'title', 'flatYTitle', 'stackedKeys', 'facetHeaders'])),
        parts,
        ...(unmeasured.length ? { unmeasured } : {}),
    };
}
