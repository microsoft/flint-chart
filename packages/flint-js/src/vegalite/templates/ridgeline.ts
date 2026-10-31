// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { schemeName } from '../../core/color-controls';
import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef, InstantiateContext } from '../../core/types';
import type { ChartStructure } from '../../core/structure';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    resolveSeriesTarget,
} from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate, transitionAnnotationText } from '../../interactive/presentation/annotation';
import { mixHex } from '../../core/theme/presence';
import { estimateBandwidth } from './density';
import { rangeAreaChartDef, interpolateConfigProperty } from './range-area';

/**
 * Ridgeline Plot — one distribution per series, each raised on its own baseline so the ridges
 * stand one above another and may overlap, in the manner of ggridges. Two readings share the
 * template:
 *
 *   x + color        — each series' kernel density of `x`.
 *   x + y + color    — each series' measured `y` over `x`, as layered curves.
 *
 * A discrete `y` names the ridges instead of `color`. Every ridge is drawn to a common height
 * scale: the tallest peak reaches `overlap` baselines up, so heights stay comparable. Each ridge
 * is a band from its baseline to its curve, styled as the Range Area Chart styles a band; a light
 * rule at every baseline and the series names on the left read as the y axis. Ridges are drawn
 * top to bottom, so a lower ridge paints over the one above it.
 *
 * Options: `order` sorts the ridges by their mean, or reverses them; `tailCut` trims a ridge to
 * where its density is at least that share of its peak. Named ridges carry their names beside
 * them, so by default they share the house's single ink; `colorBy: 'series'` gives each its own
 * colour, and `colorBy: 'x'` fills each ridge with a ramp along x; `skew` shifts the ridges
 * behind the front one leftwards for a perspective look,
 * where the x axis reads true for the front ridge only. `perspective: true` plans the skew, tilt
 * and overlap it is not given from the ridge count, so the depth keeps its share of the plot. In
 * perspective a value axis stands at the back-left corner, to `valueMax` where set, and the depth
 * axis carries the series' title.
 * `markAt: true` marks each ridge's value at the x ticks, or `markAt: [x, …]` at those x: a dot
 * labelled with the value, and a dashed line joining the dots at one x across the ridges.
 *
 * A quantitative series stands as a y axis would: the lowest at the front. A quantitative
 * colour keeps its continuous scale and shows it as a gradient legend.
 */

const RIDGE_TOP = '__ridge_top';
const RIDGE_BASE = '__ridge_base';
const RIDGE_X = '__ridge_x';
const DENSITY = 'density';
const KDE_STEPS = 120;
const DEFAULT_OVERLAP = 1.8;
const X_RAMP = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];

function gaussianKde(values: number[], bandwidth: number, lo: number, hi: number, steps: number): Array<{ x: number; density: number }> {
    const out: Array<{ x: number; density: number }> = [];
    const n = values.length;
    const norm = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI));
    for (let s = 0; s <= steps; s++) {
        const x = lo + ((hi - lo) * s) / steps;
        let sum = 0;
        for (const v of values) {
            const u = (x - v) / bandwidth;
            sum += Math.exp(-0.5 * u * u);
        }
        out.push({ x, density: sum * norm });
    }
    return out;
}

function toNumber(v: unknown): number {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : Date.parse(String(v));
}

/** Whether an encoding names categories rather than measures. */
function discrete(encoding: { type?: string } | undefined): boolean {
    return encoding?.type === 'nominal' || encoding?.type === 'ordinal';
}

/** The x values `markAt` names, as numbers; a single value stands for a list of one. */
function markPositions(properties: Record<string, any> | undefined): number[] {
    const raw = properties?.markAt;
    if (typeof raw === 'boolean') return [];
    const list = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
    return list.map(toNumber).filter(Number.isFinite);
}

/**
 * Whether the chart marks values: at the x `markAt` names, or with `markAt: true` at the x ticks,
 * which a numeric x has (a temporal one ticks by the calendar, which the template does not choose).
 */
function marksValues(properties: Record<string, any> | undefined, xType: string | undefined, skew: number): boolean {
    return markPositions(properties).length > 0 || (properties?.markAt === true && (xType !== 'temporal' || skew > 0));
}

/** A curve's value at x, read between its two nearest points; undefined outside its span. */
function valueAt(curve: Array<{ x: number; v: number }>, x: number): number | undefined {
    if (!curve.length || x < curve[0].x || x > curve[curve.length - 1].x) return undefined;
    for (let i = 0; i < curve.length; i++) {
        const right = curve[i];
        if (right.x === x) return right.v;
        if (right.x > x) {
            const left = curve[i - 1];
            return left.v + ((right.v - left.v) * (x - left.x)) / (right.x - left.x || 1);
        }
    }
    return undefined;
}

/** A formatter that shows about two significant digits of values up to `top`. */
function valueFormat(top: number): (value: number) => string {
    const decimals = top > 0 ? Math.max(0, Math.min(4, 2 - Math.ceil(Math.log10(top)))) : 2;
    return (value) => value.toFixed(decimals);
}

/** The perspective's three measures where there is no depth to plan: a single ridge. */
const PERSPECTIVE = { skew: 0.2, tilt: 2.5, overlap: 6 };
/** The share of the plot's width the depth takes in a planned perspective. */
const DEPTH_SHARE = 0.4;

/**
 * The share of the plot's height the depth takes: `DEPTH_SHARE` for a few ridges, more for many,
 * so a long run of ridges stands far enough apart for each to show over the one in front.
 */
function depthHeightShare(count: number): number {
    return Math.min(0.65, Math.max(DEPTH_SHARE, 0.3 + 0.03 * (count - 1)));
}
/** How far the front edge rises across x, as a share of the depth's rise. */
const EDGE_RISE = 0.3;
/** The size the perspective's labels are measured and set at. */
const LABEL_SIZE = 11;
const LINE_HEIGHT = LABEL_SIZE + 3;

/**
 * The perspective's three measures. Each one set stays as set; `perspective: true` plans the rest
 * for `count` ridges so the depth takes `DEPTH_SHARE` of the plot's width and `depthHeightShare`
 * of its height.
 */
function perspectiveOf(properties: Record<string, any> | undefined, count = 0): { skew: number; tilt: number; overlap: number } {
    const positive = (key: string) => {
        const value = Number(properties?.[key]);
        return Number.isFinite(value) && value > 0 ? value : 0;
    };
    const preset = properties?.perspective === true;
    const steps = count - 1;
    if (!preset || steps < 1) {
        return {
            skew: positive('skew') || (preset ? PERSPECTIVE.skew : 0),
            tilt: positive('tilt') || (preset ? PERSPECTIVE.tilt : 0),
            overlap: positive('overlap') || (preset ? PERSPECTIVE.overlap : DEFAULT_OVERLAP),
        };
    }
    // Depth spans `steps` baselines up and `steps · skew` x ranges left; the rest of each axis is
    // the ridges' own height and the x range itself.
    const share = depthHeightShare(count);
    const rest = (steps * (1 - share)) / share;
    const tilt = positive('tilt') || EDGE_RISE * steps;
    return {
        skew: positive('skew') || DEPTH_SHARE / (1 - DEPTH_SHARE) / steps,
        tilt,
        overlap: positive('overlap') || Math.max(1, rest - tilt),
    };
}

/** How many ridges the rows draw: one per series. */
function ridgeCount(table: any[], seriesField: string | undefined): number {
    return seriesField ? new Set(table.map((row) => String(row?.[seriesField]))).size : 1;
}

/** A colour from the x ramp at a share of the way along it. */
function rampAt(t: number): string {
    const clamped = Math.max(0, Math.min(1, t));
    const position = clamped * (X_RAMP.length - 1);
    const index = Math.min(X_RAMP.length - 2, Math.floor(position));
    return mixHex(X_RAMP[index], X_RAMP[index + 1], position - index);
}

interface RidgeInputs {
    xField: string;
    yField?: string;
    seriesField?: string;
    /** The order the series stand in, top to bottom, where their field has one. */
    order?: string[];
    overlap: number;
    skew: number;
    /** How many baselines the x axis rises across its range, in perspective. */
    tilt: number;
    bandwidth: number;
    tailCut: number;
    byMean: boolean;
    reverse: boolean;
    /** A quantitative series stands in numeric order. */
    quantitativeSeries: boolean;
    /** The value a ridge's full height stands for, where set; else the tallest peak. */
    valueMax: number;
}

/**
 * The fields a ridgeline reads: `x` runs along every ridge; a discrete `y` names the ridges
 * (each one the density of `x`), else `y` is the measure each ridge draws and `color` names them.
 */
function ridgeInputs(encodings: Record<string, any>, properties: Record<string, any> | undefined, table: any[]): RidgeInputs | undefined {
    const xField = encodings.x?.field;
    if (!xField) return undefined;
    const positive = (key: string) => {
        const value = Number(properties?.[key]);
        return Number.isFinite(value) && value > 0 ? value : 0;
    };
    const ySeries = discrete(encodings.y);
    const series = ySeries ? encodings.y : encodings.color;
    const { skew, tilt, overlap } = perspectiveOf(properties, ridgeCount(table, series?.field));
    return {
        xField,
        yField: ySeries ? undefined : encodings.y?.field,
        seriesField: series?.field,
        order: Array.isArray(series?.sort) ? series.sort.map(String) : undefined,
        overlap,
        skew,
        tilt,
        bandwidth: positive('bandwidth'),
        tailCut: Math.min(0.5, positive('tailCut')),
        byMean: properties?.order === 'mean',
        reverse: properties?.order === 'reverse',
        quantitativeSeries: series?.type === 'quantitative',
        valueMax: skew > 0 || tilt > 0 ? positive('valueMax') : 0,
    };
}

interface Ridge {
    name: string;
    /** The ridge's baseline on the working scale; the front (bottom) ridge sits at 0. */
    baseline: number;
    /** The shift along x the ridge takes in perspective. */
    shift: number;
    /** The x the ridge's drawn points span. */
    span: [number, number];
    rows: any[];
    /** The ridge's values along x, before they are scaled, as drawn. */
    curve: Array<{ x: number; v: number }>;
}

interface RidgeLayout {
    ridges: Ridge[];
    /** The x the data spans. */
    extent: [number, number];
    /** The x domain, widened to the left in perspective. */
    domain: [number, number] | undefined;
    /** Baselines per unit of value: every ridge's height is its value times this. */
    scale: number;
    /** The value a ridge's full `overlap` height stands for. */
    top: number;
    /** How many baselines the tallest ridge rises, which `valueMax` may set above `overlap`. */
    reach: number;
}

/**
 * The ridges, top to bottom: per series, the KDE grid or the measured points, each with its
 * baseline and top on the working scale, trimmed to its tails where asked.
 */
function layoutRidges(table: any[], inputs: RidgeInputs): RidgeLayout {
    const { xField, yField, seriesField, order, overlap, skew, tilt, bandwidth, tailCut, byMean, reverse, valueMax, quantitativeSeries } = inputs;
    const groups = new Map<string, any[]>();
    for (const row of table) {
        const key = seriesField ? String(row[seriesField]) : '';
        const arr = groups.get(key);
        if (arr) arr.push(row);
        else groups.set(key, [row]);
    }
    let names = [...groups.keys()];
    if (order) {
        const rank = new Map(order.map((name, index) => [name, index]));
        names.sort((a, b) => (rank.get(a) ?? order.length) - (rank.get(b) ?? order.length));
    } else if (quantitativeSeries) {
        // The first ridge stands at the top (the back), so the highest number goes first.
        names.sort((a, b) => Number(b) - Number(a));
    }

    const xs: number[] = [];
    for (const row of table) {
        const v = toNumber(row[xField]);
        if (Number.isFinite(v)) xs.push(v);
    }
    if (!xs.length) return { ridges: [], extent: [0, 1], domain: undefined, scale: 0, top: 0, reach: 0 };
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const range = hi - lo || 1;

    // Each series' curve before it is scaled: KDE points or the measured rows.
    const curves = new Map<string, { points: any[]; mean: number }>();
    for (const name of names) {
        const rows = groups.get(name)!;
        if (yField) {
            const points = rows
                .filter((row) => Number.isFinite(toNumber(row[xField])) && Number.isFinite(Number(row[yField])))
                .sort((a, b) => toNumber(a[xField]) - toNumber(b[xField]))
                .map((row) => ({ ...row, __v: Number(row[yField]) }));
            const mean = points.reduce((sum, p) => sum + p.__v, 0) / (points.length || 1);
            curves.set(name, { points, mean });
        } else {
            const values = rows.map((row) => toNumber(row[xField])).filter(Number.isFinite);
            const bw = (bandwidth || 1) * estimateBandwidth(values);
            const points = gaussianKde(values, bw, lo, hi, KDE_STEPS).map((p) => ({
                ...(seriesField ? { [seriesField]: rows[0][seriesField] } : {}),
                [xField]: p.x,
                [DENSITY]: p.density,
                __v: p.density,
            }));
            const mean = values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
            curves.set(name, { points, mean });
        }
    }
    if (byMean) names = [...names].sort((a, b) => curves.get(b)!.mean - curves.get(a)!.mean);
    if (reverse) names = [...names].reverse();

    const peak = Math.max(0, ...[...curves.values()].flatMap((c) => c.points.map((p) => p.__v)));
    const top = valueMax || peak;
    const scale = top > 0 ? overlap / top : 0;
    const n = names.length;

    const ridges: Ridge[] = names.map((name, index) => {
        const depth = n - 1 - index;
        const shift = -depth * skew * range;
        let points = curves.get(name)!.points;
        if (tailCut > 0) {
            const own = Math.max(0, ...points.map((p) => p.__v));
            const floor = tailCut * own;
            let first = points.findIndex((p) => p.__v >= floor);
            let last = points.length - 1;
            while (last > first && points[last].__v < floor) last--;
            if (first < 0) first = 0;
            points = points.slice(first, last + 1);
        }
        // In perspective the x axis may rise across its range, lifting every point by its x.
        const rows = points.map((p) => {
            const { __v, ...rest } = p;
            const x = toNumber(p[xField]);
            const base = depth + tilt * ((x - lo) / range);
            const row: any = { ...rest, [RIDGE_BASE]: base, [RIDGE_TOP]: base + Math.max(0, __v) * scale };
            if (skew > 0 || tilt > 0) row[RIDGE_X] = x + shift;
            return row;
        });
        const drawn = points.map((p) => toNumber(p[xField]) + shift);
        const curve = points.map((p) => ({ x: toNumber(p[xField]), v: Math.max(0, p.__v) }));
        return { name, baseline: depth, shift, span: [Math.min(...drawn), Math.max(...drawn)], rows, curve };
    });
    const domain: [number, number] | undefined = skew > 0 || tilt > 0 ? [lo - (n - 1) * skew * range, hi] : undefined;
    return { ridges, extent: [lo, hi], domain, scale, top, reach: peak * scale };
}

/** About `count` round tick values over an extent. */
function niceTicks([lo, hi]: [number, number], count = 5): number[] {
    const span = hi - lo || 1;
    const rough = span / count;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
}

type Measure = (text: string, bold?: boolean) => number;

function measureOf(measureText: InstantiateContext['measureText']): Measure {
    return (text, bold = false) => measureText ? measureText(text, LABEL_SIZE, bold ? 'bold' : 'normal') : text.length * LABEL_SIZE * 0.6;
}

/** Round ticks over an extent: the most of them, from five down, whose labels `fit` the room between them. */
function spacedTicks(extent: [number, number], fit: (ticks: number[]) => boolean): number[] {
    for (const count of [5, 4, 3, 2]) {
        const ticks = niceTicks(extent, count);
        if (ticks.length < 2 || fit(ticks)) return ticks;
    }
    return niceTicks(extent, 1);
}

interface PerspectiveLabels {
    pxPerX: number;
    pxPerY: number;
    /** The front edge's screen angle and the depth axis's, clockwise from x. */
    axisAngle: number;
    depthAngle: number;
    /** The names lie along the depth axis where they fit, else level; `stride` keeps every n-th. */
    names: { along: boolean; stride: number; widest: number };
    /** How far the names reach past the depth axis, at right angles to it. */
    nameReach: number;
    edgeTicks: number[];
    valueTicks: number[];
    valueFormat: (value: number) => string;
}

/**
 * Where the perspective's labels go at the planned plot: each set is measured against the room its
 * axis gives it, and gives way in steps (along the axis, then level, then every n-th) before any
 * two labels touch.
 */
function perspectiveLabels(
    plot: { width: number; height: number },
    layout: RidgeLayout,
    inputs: RidgeInputs,
    measure: Measure,
): PerspectiveLabels {
    const { ridges, extent, domain, scale, top, reach } = layout;
    const { skew, tilt, overlap } = inputs;
    const n = Math.max(1, ridges.length);
    const height = Math.max(overlap, reach);
    const range = extent[1] - extent[0] || 1;
    const pxPerX = plot.width / ((domain ?? extent)[1] - (domain ?? extent)[0] || 1);
    const pxPerY = plot.height / (n - 1 + height + tilt);
    const axisAngle = Math.atan2(-tilt * pxPerY, range * pxPerX);
    const depthAngle = skew > 0 ? Math.atan2(pxPerY, skew * range * pxPerX) : 0;

    // One ridge back is `stepX` px left and `pxPerY` px up. A name along the axis needs its own
    // length of the step; a level one needs a line of height.
    const widest = Math.max(0, ...ridges.map((ridge) => measure(ridge.name, true)));
    const stepX = skew * range * pxPerX;
    const along = skew > 0 && Math.hypot(stepX, pxPerY) >= widest + 4;
    const stride = along ? 1 : Math.max(1, Math.ceil(LINE_HEIGHT / (pxPerY || 1)));
    const nameReach = 10 + (along ? LINE_HEIGHT : (widest + 8) * Math.sin(depthAngle) + (LINE_HEIGHT / 2) * Math.cos(depthAngle));

    // Front-edge ticks stand their labels' width apart along the rising edge.
    const edgeTicks = spacedTicks(extent, (ticks) => {
        const apart = ((ticks[1] - ticks[0]) * pxPerX) / Math.cos(axisAngle);
        return apart >= Math.max(...ticks.map((tick) => measure(String(tick)))) + 8;
    });
    // Value ticks stand a line apart up the back corner.
    const format = valueFormat(top);
    const valueTicks = scale > 0
        ? spacedTicks([0, top], (ticks) => (ticks[1] - ticks[0]) * scale * pxPerY >= LINE_HEIGHT + 2)
            .filter((tick) => tick > 0 && tick * scale <= height + 1e-9)
        : [];
    return { pxPerX, pxPerY, axisAngle, depthAngle, names: { along, stride, widest }, nameReach, edgeTicks, valueTicks, valueFormat: format };
}

/** A fill that runs the x ramp across one ridge's span, as Vega-Lite's gradient takes it: in the mark's own box. */
function rampFill(ridge: Ridge, extent: [number, number]): any {
    const [lo, hi] = ridge.span;
    const width = hi - lo || 1;
    const range = extent[1] - extent[0] || 1;
    const stops = Array.from({ length: 9 }, (_, index) => {
        const offset = index / 8;
        return { offset, color: rampAt((lo + offset * width - ridge.shift - extent[0]) / range) };
    });
    return { gradient: 'linear', x1: 0, x2: 1, y1: 0, y2: 0, stops };
}

export const ridgelinePlotDef: ChartTemplateDef = {
    chart: 'Ridgeline Plot',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'color'],
    structure: (ctx) => {
        const x = ctx.channelSemantics.x;
        const series = discrete(ctx.channelSemantics.y) ? ctx.channelSemantics.y : ctx.channelSemantics.color;
        const { skew, tilt } = perspectiveOf(ctx.chartProperties);
        const skewed = skew > 0 || tilt > 0;
        const seriesTitle = series?.field ? ctx.displayNames?.[series.field] ?? series.field : null;
        const marked = marksValues(ctx.chartProperties, x?.type, skew);
        // A quantitative colour keeps its scale, and its gradient is the chart's one key.
        const graded = series?.field && series.type === 'quantitative' && ctx.chartProperties?.colorBy !== 'x';
        // Named ridges carry their names beside them, so colour does not name them again unless asked.
        const oneInk = Boolean(series?.field) && discrete(series) && ctx.chartProperties?.colorBy !== 'series';
        const structure: ChartStructure = {
            marks: [...(skewed ? ['rule', 'area', 'text'] : ['area']), ...(marked ? ['rule', 'point', 'text'] : []), ...(graded ? ['point'] : [])],
            ...(x?.field
                ? { x: skewed
                    ? { type: 'quantitative', fields: [], derived: 'skewed', baseline: 'data', ownScale: true, rounded: true }
                    : { type: x.type ?? 'quantitative', fields: [x.field], baseline: 'data' } }
                : {}),
            y: { type: 'quantitative', fields: [], derived: 'ridge', baseline: 'zero', ownScale: true },
            ...(series?.field ? { series: { field: series.field, type: series.type, ...(oneInk ? { oneInk } : {}) } } : {}),
            stacking: 'none',
            keys: graded ? [{ channel: 'color', field: series.field!, type: 'quantitative' }] : [],
            // The names on the left stand for the series field. In perspective the chart draws its own
            // frame: x is titled along the floor's front edge, and neither flat axis is drawn.
            axisTitles: {
                y: skewed ? null : seriesTitle,
                ...(skewed && x?.field ? { x: null } : {}),
            },
        };
        return structure;
    },
    // A `y` that names categories names the ridges: it moves to `color` before the pipeline sizes
    // the chart, so the layout sees one quantitative y of baselines rather than a banded axis.
    normalizeEncodings: (encodings, table) => {
        const y = encodings.y;
        if (!y?.field || encodings.color?.field) return encodings;
        const named = table.some((row) => row?.[y.field!] !== undefined && row[y.field!] !== null && !Number.isFinite(Number(row[y.field!])));
        if (!named) return encodings;
        const { y: _y, ...rest } = encodings;
        return { ...rest, color: y };
    },
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: { axes: ['x'] },
        index: true,
    },
    markCognitiveChannel: 'area',
    geometryKinds: ['area'],
    semanticInteractions: ({ resolvedEncodings }) => {
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['y', 'color']);
        const measure = discrete(resolvedEncodings.y) ? DENSITY : resolvedEncodings.y?.field ?? DENSITY;
        return {
            fields: [...new Set([...fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'color']), measure])],
            identityFields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'color']).filter((field) => field !== measure),
            seriesField,
            selectableMarks: ['area'],
            renderHoverStyles: { area: { opacity: 'spotlight' } },
            resolve: (event, context) => resolveSeriesTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('segment-midpoint'),
                transitionAnnotationText(measure),
            ),
        };
    },
    // Each ridge asks for its height in the plot. In perspective the depth takes its share of the
    // height, and each ridge's step back along it holds a line of its name.
    declareLayoutMode: (channelSemantics, table, chartProperties) => {
        const { skew, tilt } = perspectiveOf(chartProperties);
        const series = discrete(channelSemantics.y) ? channelSemantics.y : channelSemantics.color;
        const perRidge = skew > 0 || tilt > 0 ? Math.ceil(LINE_HEIGHT / depthHeightShare(ridgeCount(table, series?.field))) : 20;
        return {
            paramOverrides: { continuousMarkCrossSection: { x: 100, y: perRidge, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
        };
    },
    // In perspective the names, the value axis and the front edge's labels stand outside the plot,
    // and a marked value's label may stand over the back ridge's top.
    planOverhang: (ctx, plot) => {
        const inputs = ridgeInputs(ctx.channelSemantics, ctx.chartProperties, ctx.table);
        if (!inputs) return undefined;
        const marked = marksValues(ctx.chartProperties, ctx.channelSemantics.x?.type, inputs.skew);
        const top = marked ? LINE_HEIGHT + 3 : 0;
        if (!(inputs.skew > 0 || inputs.tilt > 0)) return top ? { left: 0, right: 0, top, bottom: 0 } : undefined;
        const measure = measureOf(ctx.measureText);
        const layout = layoutRidges(ctx.table, inputs);
        const labels = perspectiveLabels(plot, layout, inputs, measure);
        const { along, widest } = labels.names;
        const theta = labels.depthAngle;
        const names = along ? 10 * Math.sin(theta) + widest * Math.cos(theta) : 8 + widest;
        const values = labels.valueTicks.length
            ? 13 + Math.max(...labels.valueTicks.map((tick) => measure(labels.valueFormat(tick)))) + 16 + LINE_HEIGHT
            : 0;
        return {
            left: Math.ceil(Math.max(names, values)),
            right: 0,
            top,
            bottom: 24 + LINE_HEIGHT,
        };
    },
    instantiate: (spec, ctx) => {
        const inputs = ridgeInputs(ctx.resolvedEncodings, ctx.chartProperties, ctx.table);
        if (!inputs) return;
        const { xField, yField, seriesField, overlap, skew, tilt } = inputs;
        const { ridges, extent, domain, scale, top, reach } = layoutRidges(ctx.table, inputs);
        const height = Math.max(overlap, reach);
        const n = Math.max(1, ridges.length);
        const perspective = skew > 0 || tilt > 0;
        spec.data = { values: ridges.flatMap((ridge) => ridge.rows) };

        const x = ctx.resolvedEncodings.x;
        const xType = x?.type === 'temporal' && skew === 0 ? 'temporal' : 'quantitative';
        const encoding: any = {
            x: {
                ...x,
                field: perspective ? RIDGE_X : xField,
                type: xType,
                title: x?.title ?? xField,
                scale: { ...(x?.scale ?? {}), zero: false, ...(domain ? { domain, nice: false } : {}) },
            },
            y: {
                field: RIDGE_TOP,
                type: 'quantitative',
                stack: null,
                scale: { domain: [0, n - 1 + height + tilt], nice: false, zero: true },
                axis: {
                    values: ridges.map((ridge) => ridge.baseline),
                    labelExpr: `${JSON.stringify(ridges.map((ridge) => ridge.name).reverse())}[round(datum.value)]`,
                    ticks: false,
                    domain: false,
                    // The names are the ridges' only key, so none is thinned out: Vega drops every
                    // other value while there are more than a house's tickCount.
                    tickCount: ridges.length,
                    labelOverlap: false,
                },
            },
            y2: { field: RIDGE_BASE },
        };
        let graded = false;
        if (seriesField) {
            const source = (discrete(ctx.resolvedEncodings.y) ? ctx.resolvedEncodings.y : ctx.resolvedEncodings.color) ?? {};
            const type = source.type ?? 'nominal';
            // A quantitative colour reads off its gradient; categories read off the names by each ridge.
            graded = type === 'quantitative' && ctx.chartProperties?.colorBy !== 'x';
            if (discrete({ type }) && ctx.chartProperties?.colorBy !== 'series') {
                // The names stand by each ridge, so the ridges share one ink: the series only keeps
                // each ridge its own area.
                encoding.detail = { field: seriesField, type };
            } else {
                encoding.color = { ...source, field: seriesField, type, legend: null };
                if (!graded && !('sort' in encoding.color)) encoding.color.sort = null;
                delete encoding.color.axis;
            }
        }
        // The x ticks `markAt: true` marks at: the perspective's edge ticks, set below, or on a
        // flat x the round values whose labels fit, which the axis then shows.
        let markTicks: number[] = [];
        // The ends of x stand on the axes' own edges, where the names and the value axis are.
        const inner = (ticks: number[]) => ticks.filter((tick) => tick > extent[0] && tick < extent[1]);
        if (!perspective && ctx.chartProperties?.markAt === true && xType === 'quantitative') {
            const plotWidth = ctx.plot?.width ?? ctx.layout.subplotWidth;
            const pxPerX = plotWidth / (extent[1] - extent[0] || 1);
            const measure = measureOf(ctx.measureText);
            const ticks = spacedTicks(extent, (values) =>
                (values[1] - values[0]) * pxPerX >= Math.max(...values.map((tick) => measure(String(tick)))) + 8);
            encoding.x.axis = { ...(encoding.x.axis ?? {}), values: ticks };
            markTicks = inner(ticks);
        }

        // A ridge is a band from its baseline to its curve, drawn as the Range Area Chart draws
        // one: translucent, its top edge lined in its own colour. In perspective the ridges stand
        // solid, each hiding the one behind it, unless an opacity is set.
        const config = ctx.chartProperties;
        const mark: any = { ...rangeAreaChartDef.template.mark };
        if (config?.interpolate) mark.interpolate = config.interpolate;
        const opacity = Number(config?.opacity);
        if (Number.isFinite(opacity) && opacity > 0 && opacity < 1) mark.opacity = opacity;
        else if (perspective) mark.opacity = 1;

        const layers: any[] = [];
        const ramp = ctx.chartProperties?.colorBy === 'x';
        if (seriesField && (ramp || perspective)) {
            // One layer per ridge, back to front, so each ridge's top line goes under the ridges
            // in front of it. A ramp fills each ridge over its own span; the series colour scale
            // stays declared, unused, so the chart keeps its key to the series.
            const { color: _color, ...uncoloured } = encoding;
            for (const ridge of ridges) {
                layers.push({
                    transform: [{ filter: { field: seriesField, equal: ridge.rows[0]?.[seriesField] ?? ridge.name } }],
                    mark: ramp ? { ...mark, color: rampFill(ridge, extent) } : mark,
                    encoding: ramp ? uncoloured : encoding,
                });
            }
        } else {
            layers.push({ mark, encoding });
        }
        if (perspective) {
            // The ridges stand on a floor seen in perspective: a grid line runs back from each x
            // tick, a depth axis runs back from the front-left corner, and each ridge keeps a rule
            // along its own baseline. The floor goes under the ridges; the names stand at each foot.
            // A tilted x axis rises across its range, and carries its own tick labels.
            const [lo, hi] = extent;
            const range = hi - lo || 1;
            const back = (n - 1) * skew * range;
            const depth = n - 1;
            const rise = (x: number) => tilt * ((x - lo) / range);
            const line = (x: number, y: number, x2: number, y2: number, edge = false) => ({ [RIDGE_X]: x, [RIDGE_BASE]: y, __x2: x2, __y2: y2, __edge: edge });
            const plot = { width: ctx.plot?.width ?? ctx.layout.subplotWidth, height: ctx.plot?.height ?? ctx.layout.subplotHeight };
            const labels = perspectiveLabels(plot, { ridges, extent, domain, scale, top, reach }, inputs, measureOf(ctx.measureText));
            const { axisAngle, depthAngle } = labels;
            const ticks = labels.edgeTicks;
            if (ctx.chartProperties?.markAt === true) markTicks = inner(ticks);
            const floor = [
                ...ticks.map((tick) => line(tick, rise(tick), tick - back, depth + rise(tick))),
                ...ridges.map((ridge) => line(ridge.span[0], ridge.baseline + rise(ridge.span[0] - ridge.shift), ridge.span[1], ridge.baseline + rise(ridge.span[1] - ridge.shift))),
                line(lo, 0, hi, rise(hi), true),
                line(lo, 0, lo - back, depth, true),
            ];
            // Labels are set off from the axis they belong to at right angles. Vega-Lite's text angle
            // turns clockwise, y down.
            const degrees = (radians: number) => Math.round((radians * 180) / Math.PI * 10) / 10;
            // Vega offsets a text in its own turned frame, so a label turned to lie along a line
            // stands off it, on the far side, by `dy` alone.
            const offFrom = (distance: number) => ({ dy: distance });
            const labelLayer = (values: any[], mark: Record<string, unknown>) => ({
                data: { values },
                mark: { type: 'text', fontSize: LABEL_SIZE, ...mark },
                encoding: {
                    x: { field: RIDGE_X, type: 'quantitative' },
                    y: { field: RIDGE_BASE, type: 'quantitative' },
                    text: { field: 'label', type: 'nominal' },
                },
            });
            const { along: alongAxis, stride, widest: widestName } = labels.names;
            const feet = ridges
                .filter((ridge) => ridge.baseline % stride === 0)
                .map((ridge) => ({ label: ridge.name, [RIDGE_X]: ridge.span[0], [RIDGE_BASE]: ridge.baseline }));
            layers.push(labelLayer(feet, alongAxis
                ? { angle: degrees(depthAngle), align: 'right', baseline: 'middle', fontWeight: 'bold', ...offFrom(10) }
                : { align: 'right', baseline: 'middle', fontWeight: 'bold', dx: -8 }));
            // The depth axis carries the series' title, set off beyond the names along it.
            const seriesTitle = seriesField ? encoding.color?.title ?? seriesField : undefined;
            if (seriesTitle && n > 1) {
                const title = { label: seriesTitle, [RIDGE_X]: lo - back / 2, [RIDGE_BASE]: depth / 2 };
                layers.push(labelLayer([title], skew > 0
                    ? { angle: degrees(depthAngle), align: 'center', baseline: 'top', fontWeight: 'bold', ...offFrom(labels.nameReach + 4) }
                    : { angle: 270, align: 'center', baseline: 'bottom', fontWeight: 'bold', dy: -(16 + widestName) }));
            }
            // A value axis stands at the back-left corner, on the back ridge's baseline: every ridge
            // shares its height scale, so its ticks read for all of them. The floor stands for 0.
            if (scale > 0) {
                const cornerX = lo - back;
                const { valueTicks, valueFormat: format } = labels;
                const tickLength = 5 / (labels.pxPerX || 1);
                const axisRules = [
                    line(cornerX, depth, cornerX, depth + height, true),
                    ...valueTicks.map((tick) => line(cornerX - tickLength, depth + tick * scale, cornerX, depth + tick * scale, true)),
                ];
                layers.push({
                    data: { values: axisRules },
                    mark: { type: 'rule', strokeWidth: 1 },
                    encoding: {
                        x: { field: RIDGE_X, type: 'quantitative' },
                        y: { field: RIDGE_BASE, type: 'quantitative' },
                        x2: { field: '__x2' },
                        y2: { field: '__y2' },
                        strokeOpacity: { value: 0.6 },
                    },
                });
                const tickLabels = valueTicks.map((tick) => ({ label: format(tick), [RIDGE_X]: cornerX, [RIDGE_BASE]: depth + tick * scale }));
                layers.push(labelLayer(tickLabels, { align: 'right', baseline: 'middle', dx: -8 }));
                const valueTitle = yField ? ctx.resolvedEncodings.y?.title ?? yField : DENSITY;
                const widest = Math.max(0, ...tickLabels.map((tick) => measureOf(ctx.measureText)(tick.label)));
                layers.push(labelLayer([{ label: valueTitle, [RIDGE_X]: cornerX, [RIDGE_BASE]: depth + height / 2 }],
                    { angle: 270, align: 'center', baseline: 'bottom', fontWeight: 'bold', dy: -(16 + widest) }));
            }
            {
                // The tick labels and the title follow the front edge, rising where it is tilted.
                const title = encoding.x.title;
                const mid = (lo + hi) / 2;
                const along = { angle: degrees(axisAngle), align: 'center', baseline: 'top' };
                layers.push(labelLayer(ticks.map((tick) => ({ label: String(tick), [RIDGE_X]: tick, [RIDGE_BASE]: rise(tick) })), { ...along, ...offFrom(6) }));
                if (title) layers.push(labelLayer([{ label: title, [RIDGE_X]: mid, [RIDGE_BASE]: rise(mid) }], { ...along, fontWeight: 'bold', ...offFrom(24) }));
            }
            layers.unshift({
                data: { values: floor },
                mark: { type: 'rule', strokeWidth: 1 },
                encoding: {
                    x: { field: RIDGE_X, type: 'quantitative' },
                    y: { field: RIDGE_BASE, type: 'quantitative' },
                    x2: { field: '__x2' },
                    y2: { field: '__y2' },
                    strokeOpacity: { condition: { test: 'datum.__edge', value: 0.9 }, value: 0.35 },
                },
            });
        }
        if (graded && seriesField) {
            // The gradient key. A ridge's colour paints both its fill and its top line, and Vega
            // draws a key over two such channels as symbols; so the key comes from points that
            // are filled only and drawn at no size, one per series, on the ridges' colour scale.
            const source = ctx.resolvedEncodings.color ?? {};
            layers.push({
                data: { values: ridges.map((ridge) => ridge.rows[0]).filter(Boolean) },
                mark: { type: 'point', filled: true, size: 0, opacity: 1 },
                encoding: {
                    x: { field: encoding.x.field, type: encoding.x.type },
                    y: { field: RIDGE_TOP, type: 'quantitative' },
                    color: { ...encoding.color, legend: { ...(source.legend ?? {}), title: source.title ?? seriesField } },
                },
            });
        }
        const named = markPositions(config);
        const marks = named.length ? named : markTicks;
        if (marks.length) {
            // Each ridge's value at every marked x: a dot on its curve with the value beside it,
            // and dashed segments joining the dots at one x, front to back, to show the trend
            // across the series. They go over the ridges, so no ridge hides them. The segments are
            // rules, not a line, so a house's dots for a line's ends stay off them.
            const [lo, hi] = extent;
            const range = hi - lo || 1;
            const xKey = perspective ? RIDGE_X : xField;
            const format = valueFormat(top);
            const points = marks.flatMap((at, index) => ridges.flatMap((ridge) => {
                const value = valueAt(ridge.curve, at);
                if (value === undefined) return [];
                const base = ridge.baseline + tilt * ((at - lo) / range);
                // A label near the right end of x reads to the left of its dot, inside the plot.
                const end = (hi - at) / range < 0.1;
                return [{ [xKey]: perspective ? at + ridge.shift : at, [RIDGE_TOP]: base + value * scale, __mark: index, __depth: ridge.baseline, __end: end, label: format(value) }];
            }));
            const segments = points.flatMap((point, index) => {
                const next = points[index + 1];
                return next && next.__mark === point.__mark ? [{ ...point, __x2: next[xKey], __y2: next[RIDGE_TOP] }] : [];
            });
            const at = { x: { field: xKey, type: encoding.x.type }, y: { field: RIDGE_TOP, type: 'quantitative' } };
            const label = (end: boolean) => ({
                data: { values: points.filter((point) => point.__end === end) },
                mark: { type: 'text', align: end ? 'right' : 'left', baseline: 'bottom', dx: end ? -4 : 4, dy: -3, fontSize: 10 },
                encoding: { ...at, text: { field: 'label', type: 'nominal' } },
            });
            layers.push(
                {
                    data: { values: segments },
                    mark: { type: 'rule', strokeDash: [4, 3], strokeWidth: 1, opacity: 0.8 },
                    encoding: { ...at, x2: { field: '__x2' }, y2: { field: '__y2' } },
                },
                {
                    data: { values: points },
                    mark: { type: 'point', filled: true, size: 36, opacity: 1 },
                    encoding: at,
                },
                ...[false, true].map(label).filter((layer) => layer.data.values.length),
            );
        }
        if (perspective) {
            // The floor, its edges and their labels are the chart's whole frame. The flat axes would
            // read against nothing in it, and a house that rules its axes would draw them anyway:
            // `grid`, `domain` and `ticks` are the house's to set, but an axis that is absent stays so.
            for (const layer of layers) {
                for (const channel of ['x', 'y'] as const) {
                    if (layer.encoding?.[channel]) layer.encoding[channel] = { ...layer.encoding[channel], axis: null };
                }
            }
        }
        if (layers.length === 1) {
            spec.mark = layers[0].mark;
            spec.encoding = layers[0].encoding;
        } else {
            delete spec.mark;
            delete spec.encoding;
            spec.layer = layers;
            // The ridges withhold their key and the key layer draws it, so each layer keeps its own.
            if (graded) spec.resolve = { ...(spec.resolve ?? {}), legend: { ...(spec.resolve?.legend ?? {}), color: 'independent' } };
        }
    },
    properties: [
        { key: 'overlap', label: 'Overlap', type: 'continuous', min: 0.5, max: 4, step: 0.1, defaultValue: DEFAULT_OVERLAP },
        interpolateConfigProperty,
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.1, defaultValue: rangeAreaChartDef.template.mark.opacity },
        { key: 'order', label: 'Order', type: 'discrete', options: [
            { value: undefined, label: 'As given' },
            { value: 'mean', label: 'By mean (highest on top)' },
            { value: 'reverse', label: 'Reversed' },
        ] },
        { key: 'tailCut', label: 'Trim tails', type: 'continuous', min: 0, max: 0.2, step: 0.01, defaultValue: 0 },
        { key: 'colorBy', label: 'Fill', type: 'discrete', options: [
            { value: undefined, label: 'One colour' },
            { value: 'series', label: 'By series' },
            { value: 'x', label: 'By x value' },
        ] },
        { key: 'perspective', label: 'Perspective', type: 'binary', defaultValue: false },
        { key: 'skew', label: 'Skew', type: 'continuous', min: 0, max: 0.4, step: 0.01, defaultValue: 0 },
        { key: 'tilt', label: 'Tilt', type: 'continuous', min: 0, max: 6, step: 0.1, defaultValue: 0 },
        // On, it marks the x ticks; an agent may name its own x values instead, as a list.
        { key: 'markAt', label: 'Mark values', type: 'binary', defaultValue: false },
        { key: 'valueMax', label: 'Value max', type: 'continuous', min: 0, max: 1000, step: 0.1, defaultValue: 0,
          check: (ctx) => ({ applicable: perspectiveOf(ctx.chartProperties).skew > 0 || perspectiveOf(ctx.chartProperties).tilt > 0 }) },
        { key: 'bandwidth', label: 'Bandwidth', type: 'continuous', min: 0.05, max: 2, step: 0.05, defaultValue: 0,
          check: (ctx) => ({ applicable: !ctx.encodings.y?.field || discrete(ctx.channelSemantics?.y) }) },
    ] as ChartPropertyDef[],
    // The colour scheme is an encoding-level edit, as on the bar charts: a numeric series reads
    // well on a sequential or diverging scheme.
    encodingActions: [
        {
            key: 'colorScheme',
            label: 'Scheme',
            // Only where the series is coloured: by default named ridges share one ink.
            isApplicable: (ctx) => !!ctx.encodings.color?.field
                && (ctx.chartProperties?.colorBy === 'series' || (ctx.channelSemantics?.color != null && !discrete(ctx.channelSemantics.color))),
            dependencies: ['color'],
            control: {
                type: 'discrete', options: [
                    { value: undefined, label: 'Default' },
                    { value: 'viridis', label: 'Viridis' },
                    { value: 'blues', label: 'Blues' },
                    { value: 'oranges', label: 'Oranges' },
                    { value: 'tealblues', label: 'Teal-Blues' },
                    { value: 'blueorange', label: 'Blue-Orange (diverging)' },
                    { value: 'redblue', label: 'Red-Blue (diverging)' },
                ],
            },
            get: (encodings) => schemeName(encodings.color?.scheme),
            set: (encodings, value) => ({ ...encodings, color: { ...encodings.color, scheme: value } }),
        },
    ] as EncodingActionDef[],
};
