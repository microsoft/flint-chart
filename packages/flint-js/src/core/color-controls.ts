/**
 * Colour controls an author states on the colour encoding, for one chart:
 *
 *   color: { field, scheme: 'redblue' | ['#c00', '#eee', '#06c'], reverse, mid, domain, bins, colors }
 *
 * `colors` and `mid` are chart-local versions of the field annotation's `colors` and
 * `divergingMidpoint`, so they are folded into the annotation and every backend honours them
 * through the usual semantics. `scheme`, `reverse`, `domain` and `bins` shape the scale itself and
 * win over every default and theme ramp: each backend applies {@link authoredColorScale} last.
 */

import type { ChannelSemantics, ChartEncoding } from './types';
import { normalizeAnnotation, type SemanticAnnotation } from './field-semantics';
import { mixHex } from './theme/presence';

/** The channels a colour control applies to. */
export const COLOR_CONTROL_CHANNELS = ['color', 'group'] as const;

type Annotated = Record<string, string | SemanticAnnotation>;

function colorEncoding(encodings: Record<string, unknown> | undefined): ChartEncoding | undefined {
    for (const channel of COLOR_CONTROL_CHANNELS) {
        const enc = encodings?.[channel];
        if (enc && typeof enc === 'object' && !Array.isArray(enc) && (enc as ChartEncoding).field) return enc as ChartEncoding;
    }
    return undefined;
}

/** The semantic types with the colour encoding's `colors` and `mid` folded into its field's annotation. */
export function withEncodingColorAnnotations(
    semanticTypes: Annotated,
    encodings: Record<string, unknown> | undefined,
): Annotated {
    const enc = colorEncoding(encodings);
    if (!enc?.field || (enc.colors === undefined && enc.mid === undefined)) return semanticTypes;
    const base = normalizeAnnotation(semanticTypes[enc.field]);
    const folded: SemanticAnnotation = {
        ...base,
        semanticType: base.semanticType === 'Unknown' ? '' : base.semanticType,
        ...(typeof enc.mid === 'number' ? { divergingMidpoint: enc.mid } : {}),
        ...(enc.colors ? { colors: { ...(base.colors ?? {}), ...enc.colors } } : {}),
    };
    return { ...semanticTypes, [enc.field]: folded };
}

/** What the author's controls make of the colour scale, in backend-neutral terms. */
export interface AuthoredColorScale {
    /** The field the controls belong to. */
    field: string;
    /** A named scheme, when the author named one. */
    scheme?: string;
    /** Explicit stops, in order from the low end; already resampled to `bins` when both are set. */
    stops?: string[];
    reverse?: boolean;
    domain?: [number, number];
    /** Quantize into this many bins; `0` asks for a continuous ramp. */
    bins?: number;
}

/** The scale controls the author set on the colour encoding, or undefined when none were. */
export function authoredColorScale(encodings: Record<string, unknown> | undefined): AuthoredColorScale | undefined {
    const enc = colorEncoding(encodings);
    if (!enc?.field) return undefined;
    const named = typeof enc.scheme === 'string' && enc.scheme !== 'default' ? enc.scheme : undefined;
    const stops = Array.isArray(enc.scheme) && enc.scheme.length >= 2 ? enc.scheme.map(String) : undefined;
    const bins = typeof enc.bins === 'number' && Number.isInteger(enc.bins) && (enc.bins === 0 || enc.bins >= 2) ? enc.bins : undefined;
    const domain = Array.isArray(enc.domain) && enc.domain.length === 2 && enc.domain.every((v) => typeof v === 'number')
        ? [enc.domain[0], enc.domain[1]] as [number, number] : undefined;
    if (!named && !stops && enc.reverse === undefined && !domain && bins === undefined) return undefined;
    return {
        field: enc.field,
        ...(named ? { scheme: named } : {}),
        ...(stops ? { stops: bins ? resampleStops(stops, bins) : stops } : {}),
        ...(enc.reverse !== undefined ? { reverse: Boolean(enc.reverse) } : {}),
        ...(domain ? { domain } : {}),
        ...(bins !== undefined ? { bins } : {}),
    };
}

/** `count` colours evenly spaced along the ramp the stops describe. */
export function resampleStops(stops: string[], count: number): string[] {
    if (count < 2 || stops.length < 2) return stops.slice(0, Math.max(1, count));
    if (stops.length === count) return stops;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const t = (i / (count - 1)) * (stops.length - 1);
        const k = Math.min(stops.length - 2, Math.floor(t));
        out.push(mixHex(stops[k], stops[k + 1], t - k, stops[k]));
    }
    return out;
}

/** The scheme's name when the author named one; a list of stops names none. */
export function schemeName(scheme: unknown): string | undefined {
    return typeof scheme === 'string' ? scheme : undefined;
}

/** The round steps a bin edge takes, of a power of ten. */
const ROUND_STEPS = [1, 2, 2.5, 5];

/**
 * The inner edges that quantize `[min, max]` into `count` bins at round values: `count − 1` edges a
 * round step apart (1, 2, 2.5 or 5 of a power of ten), placed over the data's middle, the outer two
 * bins open-ended. Of the steps that keep every edge inside the data, the one whose outer bins come
 * nearest a step wide. Undefined where none does (too few distinct values, or fewer than two bins).
 */
export function roundBinEdges(min: number, max: number, count: number): number[] | undefined {
    if (!(count >= 2) || !Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return undefined;
    const raw = (max - min) / count;
    let best: { edges: number[]; cost: number } | undefined;
    for (let exp = Math.floor(Math.log10(raw)) - 1; exp <= Math.floor(Math.log10(raw)) + 1; exp++) {
        for (const unit of ROUND_STEPS) {
            const step = unit * 10 ** exp;
            const first = Math.round(((min + max) / 2 - (step * (count - 2)) / 2) / step) * step;
            const edges = Array.from({ length: count - 1 }, (_, i) => Number((first + i * step).toPrecision(12)));
            if (edges[0] <= min || edges[edges.length - 1] >= max) continue;
            const cost = Math.abs(edges[0] - min - step) / step + Math.abs(max - edges[edges.length - 1] - step) / step;
            if (!best || cost < best.cost) best = { edges, cost };
        }
    }
    return best?.edges;
}

/** Stepped colour classes at round values: the breaks between them, where they close, and how they sit about a pivot. */
export interface ColorClasses {
    /** The boundaries between classes, ascending: one fewer than the classes. */
    breaks: number[];
    /** Where the outer classes close: the round value at or past each end of the data; unset where they are open. */
    lo?: number;
    hi?: number;
    /** For a field that crosses its pivot: how many classes lie wholly below it and wholly above it. */
    below?: number;
    above?: number;
    /** Whether one class straddles the pivot, reading as neither side. */
    neutral?: boolean;
}

/**
 * How a diverging field's pivot sits among its classes: `'auto'` gives it a neutral class a step
 * wide, centred on it; a number, a neutral class that far either side of it; unset, the pivot is
 * a break and every class is one side or the other.
 */
export type NeutralBand = number | 'auto' | undefined;

/** Talbot, Lin & Hanrahan's (2010) order of round steps by simplicity, simplest first. */
const SIMPLEST_STEPS = [1, 5, 2, 2.5];
/** The most classes either side of a pivot: past it, neighbouring colours on the longer side blur together. */
export const MAX_CLASSES_PER_SIDE = 4;

/**
 * Classes a round step wide for a stepped colour scale, about as many as asked. The step is the
 * one Talbot, Lin & Hanrahan's (2010) extended labeling scores best — weighing how round it is,
 * how closely the classes cover the data and how near their count comes to the target — from 3 to
 * the target and two more. Every break is a multiple of the step from the pivot, so each side of a
 * field that crosses its pivot takes only the classes its data reaches: a field from −6.7 to 33.5
 * reads 0, 10, 20, 30 rather than a domain made symmetric at ±33.5 and cut at ±6.7 and ±20.1, its
 * darkest cold classes empty. Neither side takes more than {@link MAX_CLASSES_PER_SIDE} where a
 * coarser step can hold it. The pivot is a break, or with a `neutral` band the centre of a class
 * that reads as neither side: ±0.1 and ±0.3 about a correlation's 0. Without a pivot the steps count
 * from zero. `exact` asks for the target count — an author's `bins`: closed classes where a round
 * step gives that many, else that many classes with the outer two open ({@link roundBinEdges} on
 * the pivot's steps). Undefined where the values do not span a range.
 */
export function roundColorClasses(
    values: readonly number[], target: number, pivot?: number, options: { exact?: boolean; neutral?: NeutralBand } = {},
): ColorClasses | undefined {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!(target >= 2) || !(max > min)) return undefined;
    const crosses = pivot !== undefined && Number.isFinite(pivot) && min < pivot && max > pivot;
    const anchor = crosses ? pivot! : 0;
    const band = crosses ? options.neutral : undefined;
    const span = max - min;
    const most = Math.max(3, target + 2);
    const round = (value: number) => Number(value.toPrecision(12));
    let best: { classes: ColorClasses; score: number; capped: boolean } | undefined;
    for (let exp = Math.floor(Math.log10(span / (most + 1))) - 1; exp <= Math.ceil(Math.log10(span)); exp++) {
        for (const unit of ROUND_STEPS) {
            const step = unit * 10 ** exp;
            // A neutral class half a step either side prints round only where half the step is round.
            if (band === 'auto' && unit === 2.5) continue;
            const half = band === undefined ? 0 : band === 'auto' ? step / 2 : band;
            if (!(half >= 0)) continue;
            // Classes past the band on each side, a step each, closing at the round value past the data.
            const reach = (extent: number) => Math.max(0, Math.ceil((extent - half) / step - 1e-9));
            const up = crosses ? reach(max - anchor) : 0;
            const down = crosses ? reach(anchor - min) : 0;
            const lo = crosses ? round(anchor - half - down * step) : round(Math.floor(min / step + 1e-9) * step);
            const hi = crosses ? round(anchor + half + up * step) : round(Math.ceil(max / step - 1e-9) * step);
            // Without a band the two sides meet at the pivot, one break between them.
            const breaks = crosses
                ? [
                    ...Array.from({ length: down }, (_, i) => round(anchor - half - (down - 1 - i) * step)),
                    ...Array.from({ length: up }, (_, i) => round(anchor + half + i * step)),
                ].filter((edge, i, all) => i === 0 || edge !== all[i - 1])
                : Array.from({ length: Math.round((hi - lo) / step) - 1 }, (_, i) => round(lo + (i + 1) * step));
            const count = breaks.length + 1;
            if (count < 3 || count > most) continue;
            if (options.exact && count !== target) continue;
            const simplicity = 1 - SIMPLEST_STEPS.indexOf(unit) / (SIMPLEST_STEPS.length - 1);
            const coverage = 1 - 0.5 * ((max - hi) ** 2 + (min - lo) ** 2) / (0.1 * span) ** 2;
            const density = 2 - Math.max(count / target, target / count);
            const score = 0.25 * simplicity + 0.2 * coverage + 0.5 * density;
            const capped = Math.max(down, up) > MAX_CLASSES_PER_SIDE;
            // Within the cap outranks past it; among equals, the extended-labeling score decides.
            if (best && (capped && !best.capped || capped === best.capped && score <= best.score)) continue;
            best = {
                score, capped,
                classes: {
                    breaks, lo, hi,
                    ...(crosses ? { below: down, above: up, ...(half > 0 ? { neutral: true } : {}) } : {}),
                },
            };
        }
    }
    if (best || !options.exact) return best?.classes;
    // No round step closes exactly that many: the outer two open, the inner edges on the pivot's steps.
    const edges = roundBinEdges(min - anchor, max - anchor, target)?.map((edge) => round(edge + anchor));
    if (!edges) return undefined;
    const at = crosses ? edges.findIndex((edge) => Math.abs(edge - anchor) < 1e-9 * span) : -1;
    return { breaks: edges, ...(at >= 0 ? { below: at + 1, above: target - at - 1 } : {}) };
}

/** The colour a ramp's stops reach at `t`, from 0 at the first stop to 1 at the last. */
function rampAt(stops: string[], t: number): string {
    if (stops.length < 2) return stops[0];
    const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(x));
    return mixHex(stops[k], stops[k + 1], x - k, stops[k]);
}

/**
 * A class break printed short: two significant figures, as a map key reads it (12,000 not
 * 11,873.4). Zero and the data's own ends stay as they are.
 */
function shortBreak(value: number): number {
    return value === 0 ? 0 : Number(value.toPrecision(2));
}

/**
 * Breaks above the data's least value and no higher than its greatest, ascending, in print form;
 * fewer where rounding merges two. A break at the greatest value is a class of the greatest alone.
 */
function tidyBreaks(raw: readonly number[], min: number, max: number): number[] {
    const breaks: number[] = [];
    for (const value of raw.map(shortBreak)) {
        if (value <= min || value > max) continue;
        if (breaks.length && value <= breaks[breaks.length - 1]) continue;
        breaks.push(value);
    }
    return breaks;
}

/**
 * Classes holding about equal numbers of values: the breaks at the quantiles, printed short. The
 * choropleth's default, after Data Formulator's maps: a skewed measure (GDP, population) spread
 * evenly by value leaves most regions in the first class, where quantiles give each class its
 * share of regions. Undefined where the values do not spread into two classes.
 */
export function quantileColorClasses(values: readonly number[], count: number): ColorClasses | undefined {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < 2 || !(count >= 2)) return undefined;
    const [min, max] = [sorted[0], sorted[sorted.length - 1]];
    const at = (q: number) => {
        const position = q * (sorted.length - 1);
        const lower = Math.floor(position);
        return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
    };
    const breaks = tidyBreaks(Array.from({ length: count - 1 }, (_, i) => at((i + 1) / count)), min, max);
    return breaks.length ? { breaks, lo: min, hi: max } : undefined;
}

/** The most values natural breaks weigh; more are sampled evenly, as Data Formulator samples them. */
const JENKS_SAMPLE = 2000;

/**
 * Natural breaks (Jenks): classes that keep each one's values close together and the classes
 * apart, by least squared deviation within classes. Printed short. Undefined where the values do
 * not spread into two classes.
 */
export function jenksColorClasses(values: readonly number[], count: number): ColorClasses | undefined {
    let sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < 2 || !(count >= 2)) return undefined;
    const [min, max] = [sorted[0], sorted[sorted.length - 1]];
    if (sorted.length > JENKS_SAMPLE) {
        const stride = (sorted.length - 1) / (JENKS_SAMPLE - 1);
        sorted = Array.from({ length: JENKS_SAMPLE }, (_, i) => sorted[Math.round(i * stride)]);
    }
    const n = sorted.length;
    const k = Math.min(count, n);
    // cost[j][i]: least within-class deviation for the first i values in j classes; from[j][i]: where the last class starts.
    const prefix = [0];
    const prefixSq = [0];
    for (const value of sorted) {
        prefix.push(prefix[prefix.length - 1] + value);
        prefixSq.push(prefixSq[prefixSq.length - 1] + value * value);
    }
    const deviation = (start: number, end: number) => {
        const size = end - start;
        const sum = prefix[end] - prefix[start];
        return prefixSq[end] - prefixSq[start] - (sum * sum) / size;
    };
    const cost = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const from = Array.from({ length: k + 1 }, () => new Int32Array(n + 1));
    cost[0][0] = 0;
    for (let j = 1; j <= k; j++) {
        for (let i = j; i <= n; i++) {
            for (let start = j - 1; start < i; start++) {
                const candidate = cost[j - 1][start] + deviation(start, i);
                if (candidate < cost[j][i]) { cost[j][i] = candidate; from[j][i] = start; }
            }
        }
    }
    const raw: number[] = [];
    for (let j = k, i = n; j > 1; j--) {
        const start = from[j][i];
        raw.unshift(sorted[start]);
        i = start;
    }
    const breaks = tidyBreaks(raw, min, max);
    return breaks.length ? { breaks, lo: min, hi: max } : undefined;
}

/**
 * One colour per class from a ramp's stops. Classes about a pivot step the ramp out from its centre
 * at one rate on both sides, set by the longer side, so equal distances from the pivot read as equal
 * colours and the shorter side keeps to its pale end. Each class takes the colour at its far edge,
 * so the classes either side of the pivot already show its sign; a neutral class takes the centre.
 */
export function classColors(stops: string[], classes: ColorClasses): string[] {
    const { below, above } = classes;
    if (below === undefined || above === undefined) return resampleStops(stops, classes.breaks.length + 1);
    const side = Math.max(1, below, above);
    return [
        ...Array.from({ length: below }, (_, i) => rampAt(stops, 0.5 - 0.5 * (below - i) / side)),
        ...(classes.neutral ? [rampAt(stops, 0.5)] : []),
        ...Array.from({ length: above }, (_, i) => rampAt(stops, 0.5 + 0.5 * (i + 1) / side)),
    ];
}

/** The neutral band of the diverging colour field a chart steps, from its semantics. */
export function colorNeutralBand(channelSemantics: Partial<Record<string, ChannelSemantics>> | undefined, field?: string): NeutralBand {
    for (const channel of ['color', 'fill', 'stroke', ...COLOR_CONTROL_CHANNELS]) {
        const cs = channelSemantics?.[channel];
        if (cs?.colorScheme?.type === 'diverging' && (!field || cs.field === field)) return cs.colorScheme.neutral;
    }
    return undefined;
}
