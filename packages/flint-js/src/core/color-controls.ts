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

import type { ChartEncoding } from './types';
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
