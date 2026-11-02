import { convertTemporalData } from '../../core/resolve-semantics';
import { positionOf } from '../../core/window';
import type { ChartAssemblyInput } from '../../core/types';
import { AXIS_LABEL_LIMIT } from '../../core/compute-layout';
import type { AxisLabelPlan } from '../../core/axis-labels';
import type { DesignDecisions } from '../../core/theme/types';
import { plannedTemporalTicks, temporalAxisPlanInputs, type TemporalAxisPlanInputs } from '../instantiate-spec';

export const TEMPORAL_TICKS_FUNCTION = 'flintTemporalTicks';
export const LIVE_LAYOUT_SIGNAL = '__flint_live_layout';
/** How far past the viewport, in scale units, a bar's centre may sit while part of it still shows. */
const LIVE_MARGIN_SIGNAL = '__flint_live_margin';

export const navigationDomainSignal = (axis: 'x' | 'y'): string => `__flint_navigation_${axis}_domain`;

/** Flint's layout decisions for the rows a navigated x viewport shows. */
export interface LiveLayout {
    x: { fontSize: number; angle: number; align: string; baseline: string; limit: number; separation: number };
    y: { fontSize: number; limit: number; separation: number };
    /** Bar width as a share of the data step. */
    barFill: number | null;
    /** Whether value labels print, the smallest stacked segment that keeps its number, and the number format. */
    labels: { show: boolean; minValue: number; format: string };
}

export interface LiveLayoutPlanner {
    /** Median distance between adjacent x values, in scale units. */
    step: number;
    /** How far past the viewport a bar's centre may sit while part of the bar still shows. */
    margin: number;
    initial: LiveLayout;
    /** The layout Flint plans for the rows inside `domain`; the same object while the visible rows stay the same. */
    layoutFor(domain: unknown): LiveLayout | undefined;
}

type Node = Record<string, any>;

function walkSpec(node: unknown, visit: (node: Node) => void): void {
    if (!node || typeof node !== 'object') return;
    const record = node as Node;
    visit(record);
    if (record.spec) walkSpec(record.spec, visit);
    for (const child of [...(record.layer ?? []), ...(record.vconcat ?? []), ...(record.hconcat ?? []), ...(record.concat ?? [])]) {
        walkSpec(child, visit);
    }
}

export function walkVegaGroups(group: Node, visit: (group: Node) => void): void {
    visit(group);
    for (const mark of group.marks ?? []) if (mark.type === 'group') walkVegaGroups(mark, visit);
}

const DEFAULT_LABEL_FONT_SIZE = 10;

function barFillOf(vlSpec: Node, xField: string): number | null {
    let size: number | undefined;
    walkSpec(vlSpec, (node) => {
        const mark = node.mark;
        if (size === undefined && mark?.type === 'bar' && typeof mark.size === 'number'
            && node.encoding?.x?.field === xField) size = mark.size;
    });
    const width = vlSpec._width;
    const count = new Set((vlSpec.data?.values ?? []).map((row: Node) => row[xField])).size;
    return size !== undefined && typeof width === 'number' && width > 0 && count > 0 ? size * count / width : null;
}

/**
 * The axis label settings live layout carries, by plan field: the Vega axis property each one
 * sets, and its value where the plan states none.
 */
const LIVE_AXIS_LABELS = {
    x: {
        fontSize: ['labelFontSize', DEFAULT_LABEL_FONT_SIZE],
        angle: ['labelAngle', 0],
        align: ['labelAlign', 'center'],
        baseline: ['labelBaseline', 'top'],
        limit: ['labelLimit', AXIS_LABEL_LIMIT],
        separation: ['labelSeparation', 0],
    },
    y: {
        fontSize: ['labelFontSize', DEFAULT_LABEL_FONT_SIZE],
        limit: ['labelLimit', AXIS_LABEL_LIMIT],
        separation: ['labelSeparation', 0],
    },
} as const;

function liveAxisLabels<C extends 'x' | 'y'>(channel: C, planned: AxisLabelPlan): LiveLayout[C] {
    const out: Record<string, unknown> = {};
    for (const [field, [, fallback]] of Object.entries(LIVE_AXIS_LABELS[channel])) {
        out[field] = planned[field as keyof AxisLabelPlan] ?? fallback;
    }
    return out as LiveLayout[C];
}

/** The live layout an assembled chart was planned with. */
export function liveLayoutOf(
    vlSpec: Node, xField: string, axisLabels: Record<'x' | 'y', AxisLabelPlan>, dataLabels: DesignDecisions['dataLabels'] | undefined,
): LiveLayout {
    return {
        x: liveAxisLabels('x', axisLabels.x),
        y: liveAxisLabels('y', axisLabels.y),
        barFill: barFillOf(vlSpec, xField),
        labels: {
            show: Boolean(dataLabels?.show),
            minValue: dataLabels?.segmentMinValue ?? 0,
            format: dataLabels?.format ?? '',
        },
    };
}

/**
 * Plans the live layout for each x window: `replan` lays the chart out again for the rows a
 * window keeps, with the plot held at its mounted size, from the analysis of the whole data.
 */
export function liveLayoutPlanner(
    input: ChartAssemblyInput,
    xField: string,
    initial: LiveLayout,
    replan: (change: { window: { x: readonly [number, number] }; pinPlot: boolean }) => {
        spec: Node; axisLabels: Record<'x' | 'y', AxisLabelPlan>; dataLabels: DesignDecisions['dataLabels'];
    },
): LiveLayoutPlanner {
    const rows = input.data.values ?? [];
    const positions = convertTemporalData([...rows], input.semantic_types ?? {})
        .map((row: Node) => positionOf(row[xField]));
    const distinct = [...new Set(positions.filter(Number.isFinite))].sort((a, b) => a - b);
    const gaps = distinct.slice(1).map((value, index) => value - distinct[index]).sort((a, b) => a - b);
    const step = gaps.length > 0 ? gaps[gaps.length >> 1] : 1;
    const margin = (initial.barFill ?? 1) * step / 2;
    const cache = new Map<string, LiveLayout>([[`${distinct[0]}:${distinct[distinct.length - 1]}`, initial]]);
    return {
        step,
        margin,
        initial,
        layoutFor(domain) {
            const bounds = Array.isArray(domain) ? domain.map(positionOf) : [];
            const lo = bounds.length === 2 ? Math.min(...bounds) - margin : -Infinity;
            const hi = bounds.length === 2 ? Math.max(...bounds) + margin : Infinity;
            const visible = rows.filter((_, index) => positions[index] >= lo && positions[index] <= hi);
            if (visible.length === 0) return undefined;
            const shown = positions.filter((position) => position >= lo && position <= hi);
            const key = `${Math.min(...shown)}:${Math.max(...shown)}`;
            let layout = cache.get(key);
            if (!layout) {
                const replanned = replan({ window: { x: [lo, hi] }, pinPlot: true });
                layout = liveLayoutOf(replanned.spec, xField, replanned.axisLabels, replanned.dataLabels);
                cache.set(key, layout);
            }
            return layout;
        },
    };
}

/**
 * Binds the planned layout to a navigated chart: axis label settings read the live layout
 * signal, a bar centred on the x scale keeps its share of the live step, and the rows
 * outside the viewport leave the data every mark and scale derives from, so the y domain
 * and the value labels follow the rows in view. Whole x values leave together, so no stack
 * is cut. Returns false when the chart has no such bar.
 */
export function bindLiveLayout(vegaSpec: Node, xScale: string, yScale: string | undefined, planner: LiveLayoutPlanner): boolean {
    const { step, margin, initial } = planner;
    const live = LIVE_LAYOUT_SIGNAL;
    const bars: Node[] = [];
    walkVegaGroups(vegaSpec, (group) => {
        for (const mark of group.marks ?? []) {
            const update = mark.encode?.update;
            // A stacked bar with rounded corners is a group per stack; its rects fill the group's width.
            if ((mark.type === 'rect' || mark.type === 'group') && update?.xc?.scale === xScale
                && typeof update.width?.value === 'number') bars.push(mark);
        }
    });
    if (bars.length === 0 || initial.barFill === null) return false;

    const declared = (vegaSpec.signals ?? []).find((signal: Node) => signal.name === live);
    if (declared) declared.value = initial;
    else vegaSpec.signals = [{ name: live, value: initial }, ...(vegaSpec.signals ?? [])];
    vegaSpec.signals.push({ name: LIVE_MARGIN_SIGNAL, value: margin });
    // Live label sizes change the axes' extent, so the view sizes itself again on each update.
    const autosize = vegaSpec.autosize;
    vegaSpec.autosize = { ...(autosize && typeof autosize === 'object' ? autosize : { type: autosize ?? 'pad' }), resize: true };
    const scale = JSON.stringify(xScale);
    for (const bar of bars) {
        bar.encode.update.width = { signal: `max(1, (scale(${scale}, ${step}) - scale(${scale}, 0)) * ${live}.barFill)` };
    }
    walkVegaGroups(vegaSpec, (group) => {
        for (const axis of group.axes ?? []) {
            if (axis.labels === false) continue;
            const channel = axis.scale === xScale ? 'x' : axis.scale === yScale ? 'y' : undefined;
            if (!channel) continue;
            for (const [field, [property]] of Object.entries(LIVE_AXIS_LABELS[channel])) {
                axis[property] = { signal: `${live}.${channel}.${field}` };
            }
        }
    });

    const datasets = new Map<string, Node>((vegaSpec.data ?? []).map((dataset: Node) => [dataset.name, dataset]));
    let shared = datasets.get(bars[0].from?.data ?? bars[0].from?.facet?.data);
    while (shared?.source && datasets.get(shared.source)?.source) shared = datasets.get(shared.source);
    const xField = bars[0].encode.update.xc.field;
    if (shared && typeof xField === 'string') {
        const navigation = navigationDomainSignal('x');
        const position = `time(toDate(datum[${JSON.stringify(xField)}]))`;
        const edge = (pick: 'min' | 'max') => `${pick}(time(toDate(${navigation}[0])), time(toDate(${navigation}[1])))`;
        shared.transform = [...(shared.transform ?? []), {
            type: 'filter',
            expr: `!${navigation} || (${position} >= ${edge('min')} - ${LIVE_MARGIN_SIGNAL} && ${position} <= ${edge('max')} + ${LIVE_MARGIN_SIGNAL})`,
        }];
    }
    return true;
}

/** The planner inputs of each temporal axis Flint planned in a Vega-Lite spec, by channel. */
export function vegaLiteTemporalAxisPlans(
    vlSpec: Record<string, any>,
): Partial<Record<'x' | 'y', TemporalAxisPlanInputs>> {
    const result: Partial<Record<'x' | 'y', TemporalAxisPlanInputs>> = {};
    walkSpec(vlSpec, (node) => {
        for (const channel of ['x', 'y'] as const) {
            const encoding = node.encoding?.[channel];
            const inputs = encoding && typeof encoding === 'object' ? temporalAxisPlanInputs(encoding) : undefined;
            if (inputs && !result[channel]) result[channel] = inputs;
        }
    });
    return result;
}

/** The calendar ticks each axis of a Vega-Lite spec draws as its plan placed them, by channel. */
export function vegaLitePlannedTemporalTicks(vlSpec: Record<string, any>): Partial<Record<'x' | 'y', { values: number[]; labels: Record<string, string> }>> {
    const result: Partial<Record<'x' | 'y', { values: number[]; labels: Record<string, string> }>> = {};
    walkSpec(vlSpec, (node) => {
        for (const channel of ['x', 'y'] as const) {
            const encoding = node.encoding?.[channel];
            const ticks = encoding && typeof encoding === 'object' ? plannedTemporalTicks(encoding) : undefined;
            if (ticks && !result[channel]) result[channel] = ticks;
        }
    });
    return result;
}

/**
 * A calendar axis holds the ticks and label text its plan placed in a signal, so the plan for
 * another room sets them in place: the axis reads its values and each label's text from it.
 */
export function holdTemporalAxisTicks(
    vegaSpec: Record<string, any>,
    channel: 'x' | 'y',
    scale: Record<string, any>,
    ticks: { values: number[]; labels: Record<string, string> },
): void {
    const signal = `__flint_planned_ticks_${channel}`;
    vegaSpec.signals = [...(vegaSpec.signals ?? []), { name: signal, value: ticks }];
    walkVegaGroups(vegaSpec, (group) => {
        for (const axis of group.axes ?? []) {
            if (axis.scale !== scale.name) continue;
            axis.values = { signal: `${signal}.values` };
            axis.tickCount = { signal: `length(${signal}.values)` };
            const text = axis.encode?.labels?.update?.text;
            if (text && typeof text === 'object' && 'signal' in text) {
                text.signal = `${signal}.labels[toString(toNumber(datum.value))] || ''`;
            }
        }
    });
}

/**
 * A navigated temporal axis keeps Flint's calendar tick plan, re-planned from the live
 * domain: a signal calls the planner whenever the scale domain changes, and the axis
 * reads its tick values and label text from that signal. Under a live layout, the
 * planner measures labels at the live font size, angle, label limit and separation.
 */
export function bindTemporalAxisTicks(
    vegaSpec: Record<string, any>,
    channel: 'x' | 'y',
    scale: Record<string, any>,
    inputs: TemporalAxisPlanInputs,
): void {
    const signal = `__flint_temporal_ticks_${channel}`;
    const inputSignal = `__flint_temporal_inputs_${channel}`;
    const name = JSON.stringify(scale.name);
    const span = `abs(range(${name})[1] - range(${name})[0])`;
    const live = channel === 'x' && (vegaSpec.signals ?? []).some((entry: Node) => entry.name === LIVE_LAYOUT_SIGNAL);
    const liveSettings = Object.entries(LIVE_AXIS_LABELS.x)
        .filter(([field]) => field !== 'fontSize')
        .map(([field, [property]]) => `${property}: ${LIVE_LAYOUT_SIGNAL}.x.${field}`)
        .join(', ');
    const planned = live
        ? `merge(${inputSignal}, {fontSize: ${LIVE_LAYOUT_SIGNAL}.x.fontSize, `
            + `settings: merge(${inputSignal}.settings, {${liveSettings}})})`
        : inputSignal;
    vegaSpec.signals = [...(vegaSpec.signals ?? []), { name: inputSignal, value: inputs }, {
        name: signal,
        update: `${TEMPORAL_TICKS_FUNCTION}(domain(${name}), ${span}, ${planned})`,
    }];
    walkVegaGroups(vegaSpec, (group) => {
        for (const axis of group.axes ?? []) {
            if (axis.scale !== scale.name) continue;
            axis.values = { signal: `${signal}.values` };
            // The plan owns the tick values; a tick count would thin them again.
            delete axis.tickCount;
            const text = axis.encode?.labels?.update?.text;
            if (text && typeof text === 'object' && 'signal' in text) {
                text.signal = `${signal}.labels[toString(toNumber(datum.value))] || ''`;
            }
        }
    });
}
