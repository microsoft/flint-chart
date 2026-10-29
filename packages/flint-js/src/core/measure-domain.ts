import { percentRepresentation, snapToBoundHeuristic, type DomainConstraint } from './field-semantics';
import type { AxisDescription } from './structure';
import type { ChannelSemantics } from './types';

/** What decides the extent of one quantitative channel. Backend-neutral. */
export interface MeasureDomainInputs {
    channel: string;
    field: string;
    /** Whether the channel shows sums of stacked segments rather than single values (a normalized stack does not). */
    summed: boolean;
    /** Whether the chart draws lengths (bars, areas, rects), which keep zero. */
    lengthMark: boolean;
    channelSemantics: Record<string, ChannelSemantics>;
    rows: any[];
}

/** The extent Flint gives one quantitative channel. */
export interface MeasureDomain {
    /** Whether the scale includes zero; undefined leaves it to the backend. */
    zero?: boolean;
    /** The semantic bounds the scale keeps: both fix the domain; one fixes that end and the other is rounded. */
    bounds?: DomainConstraint;
    /** Whether a zero the scale was given gives way to the fixed bounds. */
    dropZero: boolean;
    /** The clean tick a positive summed stack ends on, pinned so rounding cannot add an empty interval. */
    stackTop?: number;
    /** The values the axis must show, before rounding; undefined where the backend computes them. */
    extent?: [number, number];
}

/** What the extent of a measure axis is read from. */
export interface ExtentInputs {
    axis: AxisDescription;
    /** The axis the marks stand on, whose bands group a stack. */
    other?: AxisDescription;
    /** How the axis stacks: summed segments, shares of a whole, centred, or not at all. */
    stack: 'summed' | 'normalized' | 'centered' | 'none';
    facets: string[];
    /** Whether the marks are lengths along this axis, which they read from zero. */
    lengthMark: boolean;
    domain: MeasureDomain;
    rows: any[];
}

/**
 * The values a measure axis must show, before rounding: its fields' values, or a stack's totals
 * from zero; a share of a whole spans 0 to 1; a measure the template computes spans what it states.
 * Semantic bounds replace the ends they fix. Zero is included where the axis reads from it: as the
 * template states, else by Flint's zero decision, and always for lengths along the axis they stack
 * on. Counts, densities, fitted curves and centred stacks are left to the backend.
 */
export function measureExtent(inputs: ExtentInputs): [number, number] | undefined {
    const { axis, other, stack, facets, lengthMark, domain, rows } = inputs;
    let lo = Infinity;
    let hi = -Infinity;
    const take = (value: number) => {
        if (Number.isFinite(value)) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
    };
    if (axis.extent) return axis.extent;
    if (axis.fitted) return undefined;
    if (axis.derived === 'cumulative-share' || stack === 'normalized') { take(0); take(1); }
    else if (axis.derived || stack === 'centered') return undefined;
    else if (stack === 'summed') {
        const band = other?.derived ? undefined : other?.fields[0];
        const pos = new Map<string, number>();
        const neg = new Map<string, number>();
        for (const row of rows) {
            const value = Number(row?.[axis.fields[0]]);
            if (!Number.isFinite(value)) continue;
            const key = JSON.stringify([band === undefined ? null : row?.[band], ...facets.map((field) => row?.[field])]);
            const totals = value >= 0 ? pos : neg;
            totals.set(key, (totals.get(key) ?? 0) + value);
        }
        take(0);
        for (const total of [...pos.values(), ...neg.values()]) take(total);
    } else for (const field of axis.fields) for (const row of rows) take(Number(row?.[field]));
    if (!Number.isFinite(lo)) return undefined;

    if (domain.stackTop !== undefined && domain.bounds?.max === undefined) hi = domain.stackTop;
    const zero = axis.baseline === 'zero' ? true : axis.baseline === 'data' ? false : (domain.zero ?? true) || lengthMark;
    const { min, max } = domain.bounds ?? {};
    if (min !== undefined && max !== undefined) {
        lo = min;
        hi = max;
        if (lengthMark) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    } else {
        if (min !== undefined) lo = min;
        if (max !== undefined) hi = max;
        if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    }
    return [lo, hi];
}

/**
 * The span a banded continuous axis draws: its data's ends and half a band past each, so the bands
 * at the edges show whole. Dates are read as epoch milliseconds. Undefined where the data has one
 * value or none.
 */
export function continuousBandSpan(rows: any[], field: string, temporal: boolean, bands: number): [number, number] | undefined {
    const values = rows.map((row) => {
        const raw = row?.[field];
        if (raw == null) return NaN;
        return temporal ? +new Date(raw) : +raw;
    }).filter((value) => !isNaN(value));
    if (values.length <= 1) return undefined;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return undefined;
    const pad = (max - min) / (bands - 1) / 2;
    return [min - pad, max + pad];
}

/**
 * The headroom value labels may take past bar ends: only at an end neither the semantic bounds nor
 * the stack's clean top fix.
 */
export function freeHeadroom(domain: MeasureDomain, headroom: { min?: number; max?: number }): { min?: number; max?: number } | undefined {
    const { min, max } = domain.bounds ?? {};
    const fixed = min !== undefined && max !== undefined;
    const out = {
        ...(headroom.max !== undefined && !fixed && max === undefined && domain.stackTop === undefined ? { max: headroom.max } : {}),
        ...(headroom.min !== undefined && !fixed && min === undefined && domain.stackTop === undefined ? { min: headroom.min } : {}),
    };
    return out.max !== undefined || out.min !== undefined ? out : undefined;
}

/**
 * The positive and negative stacked extremes of a measure: the largest positive and the most
 * negative group sum, grouped by the other positional field and any facet fields. Positive and
 * negative contributions stack separately, so each side is summed on its own.
 */
function stackedExtremes(
    rows: any[],
    measureField: string,
    measureChannel: string,
    channelSemantics: Record<string, ChannelSemantics>,
): { maxPos: number; minNeg: number } | undefined {
    if (!rows || rows.length === 0) return undefined;
    const groupField = channelSemantics[measureChannel === 'y' ? 'x' : 'y']?.field;
    if (!groupField) return undefined;
    const facetFields = ['row', 'column'].map((ch) => channelSemantics[ch]?.field).filter(Boolean) as string[];
    const posTotals = new Map<string, number>();
    const negTotals = new Map<string, number>();
    for (const row of rows) {
        const val = row[measureField];
        if (typeof val !== 'number' || isNaN(val)) continue;
        const key = [String(row[groupField]), ...facetFields.map((field) => String(row[field]))].join('|||');
        if (val >= 0) posTotals.set(key, (posTotals.get(key) ?? 0) + val);
        else negTotals.set(key, (negTotals.get(key) ?? 0) + val);
    }
    if (posTotals.size === 0 && negTotals.size === 0) return undefined;
    const maxPos = posTotals.size > 0 ? Math.max(...posTotals.values()) : 0;
    const minNeg = negTotals.size > 0 ? Math.min(...negTotals.values()) : 0;
    return { maxPos, minNeg };
}

/**
 * The intrinsic domain of a field: the annotated one, else the one its semantic type implies
 * (latitude, longitude, correlation, and percentage on a 0–1 or 0–100 scale by its values).
 */
function intrinsicDomain(cs: ChannelSemantics, rows: any[], field: string): [number, number] | undefined {
    if (cs.semanticAnnotation?.intrinsicDomain) return cs.semanticAnnotation.intrinsicDomain;
    const semanticType = cs.semanticAnnotation?.semanticType;
    if (!semanticType) return undefined;
    if (semanticType === 'Latitude') return [-90, 90];
    if (semanticType === 'Longitude') return [-180, 180];
    if (semanticType === 'Correlation') return [-1, 1];
    if (semanticType === 'Percentage') {
        const nums = rows.map((r) => r[field]).filter((v: any) => typeof v === 'number' && !isNaN(v));
        if (nums.length > 0) {
            return percentRepresentation(cs.semanticAnnotation, nums) === '0-1' ? [0, 1] : [0, 100];
        }
    }
    return undefined;
}

/**
 * The extent of a quantitative channel from its field's semantics.
 *
 * A channel that sums a stack is judged by its stacked totals: totals past the intrinsic bound
 * drop the constraint so no segment is clipped, and totals near it snap to it. A normalized stack
 * keeps the constraint. A size or colour channel with an annotated intrinsic domain keeps it, so
 * new rows never re-normalize the scale. Where zero is not wanted, a zero lower bound is a floor,
 * not a semantic minimum, and gives way, except on length marks.
 */
export function measureDomain(inputs: MeasureDomainInputs): MeasureDomain {
    const { channel, field, summed, lengthMark, channelSemantics, rows } = inputs;
    const cs = channelSemantics[channel];
    const extremes = summed ? stackedExtremes(rows, field, channel, channelSemantics) : undefined;

    const declared = channel === 'size' || channel === 'color' ? cs.semanticAnnotation?.intrinsicDomain : undefined;
    let bounds: DomainConstraint | undefined = declared ? { min: declared[0], max: declared[1], clamp: true } : cs.domainConstraint;
    if (summed) {
        const intrinsic = intrinsicDomain(cs, rows, field);
        if (intrinsic) {
            if (extremes !== undefined) {
                const { maxPos, minNeg } = extremes;
                const epsilon = (intrinsic[1] - intrinsic[0]) * 1e-6;
                if (maxPos > intrinsic[1] + epsilon || minNeg < intrinsic[0] - epsilon) {
                    if (cs.domainConstraint) bounds = undefined;
                } else {
                    const snap = snapToBoundHeuristic(intrinsic, [maxPos, minNeg]);
                    if (snap) {
                        bounds = cs.domainConstraint
                            ? {
                                min: cs.domainConstraint.min ?? snap.min,
                                max: cs.domainConstraint.max ?? snap.max,
                                clamp: cs.domainConstraint.clamp || snap.clamp,
                            }
                            : snap;
                    }
                }
            }
        } else if (cs.domainConstraint) bounds = undefined;
    }

    const noZero = cs.zero?.zero === false;
    if (bounds && !lengthMark && noZero && bounds.min === 0) bounds = { ...bounds, min: undefined };
    const fixed = bounds?.min !== undefined && bounds?.max !== undefined;
    return {
        ...(cs.zero ? { zero: cs.zero.zero } : {}),
        ...(bounds ? { bounds } : {}),
        dropZero: fixed && !lengthMark && !noZero,
        ...(extremes && cleanStackTop(extremes) !== undefined ? { stackTop: cleanStackTop(extremes) } : {}),
    };
}

const NICE_E10 = Math.sqrt(50);
const NICE_E5 = Math.sqrt(10);
const NICE_E2 = Math.SQRT2;

/** The span `nice` rounds [start, stop] to at about `count` ticks. */
function niceSpan(start: number, stop: number, count: number): [number, number] {
    let lo = start;
    let hi = stop;
    let previousStep: number | undefined;
    for (let index = 0; index < 32; index += 1) {
        const rawStep = (hi - lo) / Math.max(1, count);
        const power = Math.floor(Math.log10(rawStep));
        const error = rawStep / 10 ** power;
        const factor = error >= NICE_E10 ? 10 : error >= NICE_E5 ? 5 : error >= NICE_E2 ? 2 : 1;
        const step = power >= 0 ? factor * 10 ** power : -(10 ** -power) / factor;
        if (step === previousStep || step === 0 || !Number.isFinite(step)) break;
        if (step > 0) {
            lo = Math.floor(lo / step) * step;
            hi = Math.ceil(hi / step) * step;
        } else {
            lo = Math.ceil(lo * step) / step;
            hi = Math.floor(hi * step) / step;
        }
        previousStep = step;
    }
    return [lo, hi];
}

/**
 * The clean tick a positive stack already ends on, if any. Stored shares can total
 * 99.9999999999, and post-stack arithmetic may cross the tick by a rounding bit and add a whole
 * empty interval; a meaningful excess is left to rounding.
 */
function cleanStackTop(extremes: { maxPos: number; minNeg: number }, count = 10): number | undefined {
    if (extremes.minNeg < 0 || !(extremes.maxPos > 0)) return undefined;
    const tolerance = Math.max(1, Math.abs(extremes.maxPos)) * 1e-9;
    const [, cleanMax] = niceSpan(0, extremes.maxPos - tolerance, count);
    return Math.abs(cleanMax - extremes.maxPos) > tolerance ? undefined : cleanMax;
}
