// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Channel semantic-kind classifier shared by the CanvasXpress templates.
 *
 * Flint already resolves each channel's encoding type (`channelSemantics[ch].type`
 * = quantitative | nominal | ordinal | temporal). Templates that assume a channel
 * is numeric — e.g. plotting it on a value axis — silently mis-render when the
 * bound field is actually categorical (CanvasXpress even date-parses category
 * strings, producing a blank `0-01-01` axis). Branching on the kind lets a
 * template pick the right native CanvasXpress shape instead.
 *
 * This is the systematic version of the per-template data-reshaping the backend
 * contract calls for: read the semantics, don't assume the axis is a number.
 */

import { InstantiateContext } from '../../core/types';

/** A coarse kind used to choose the native CanvasXpress treatment for a channel. */
export type ChannelKind = 'numeric' | 'categorical' | 'temporal';

/**
 * Classify the field bound to `channel` into a coarse kind, or `undefined` when
 * the channel is not bound.
 *
 * @param ctx     The template instantiate context.
 * @param channel The channel name (e.g. 'x', 'y', 'size').
 * @returns 'numeric' (quantitative), 'temporal', 'categorical' (nominal/ordinal), or undefined.
 * @public
 */
export function channelKind(ctx: InstantiateContext, channel: string): ChannelKind | undefined {
    const type = ctx.channelSemantics?.[channel]?.type;
    if (!type) return undefined;
    if (type === 'quantitative') return 'numeric';
    if (type === 'temporal') return 'temporal';
    return 'categorical'; // nominal | ordinal
}

/**
 * True when the channel is bound to a categorical (nominal/ordinal) field.
 *
 * @param ctx     The template instantiate context.
 * @param channel The channel name.
 * @returns Whether the bound field is categorical.
 * @public
 */
export function isCategorical(ctx: InstantiateContext, channel: string): boolean {
    return channelKind(ctx, channel) === 'categorical';
}

/** Resolve a channel's field name from a raw encoding (string or { field }). @public */
export function encodingField(encoding: unknown): string | undefined {
    if (typeof encoding === 'string') return encoding;
    if (encoding && typeof encoding === 'object' && 'field' in (encoding as any)) {
        return (encoding as any).field;
    }
    return undefined;
}

/**
 * Compute a CanvasXpress `layoutTopology` ("ROWSxCOLS") for a facet with
 * `nGroups` panels. A column facet lays panels out in a near-square grid (a
 * single row only when it stays small), a row facet stacks them in one column;
 * an explicit `facetColumns` overrides the column count.
 *
 * @param nGroups      Number of facet panels.
 * @param isColumn     True for a column (horizontal) facet, false for a row facet.
 * @param facetColumns Optional explicit column count.
 * @returns A `layoutTopology` string such as "2X3".
 * @public
 */
export function facetLayoutTopology(nGroups: number, isColumn: boolean, facetColumns?: number): string {
    const cols = facetColumns
        || (isColumn ? (nGroups <= 4 ? nGroups : Math.ceil(Math.sqrt(nGroups))) : 1);
    const rows = Math.max(1, Math.ceil(nGroups / Math.max(1, cols)));
    return rows + 'X' + cols;
}

/**
 * Choose a continuous colour spectrum by the sign of the data, a general rule for
 * any CanvasXpress chart with a continuous colour/value scale (lines, bars, scatter,
 * heatmaps…): a one-directional range (all ≥ 0, or all ≤ 0) uses a SEQUENTIAL
 * light-grey→single-colour ramp, while a range that spans zero has a meaningful
 * centre and uses a DIVERGING scheme. Returns a config patch: `colorSpectrum` for
 * the sequential case, or `{}` for the diverging case so the engine's diverging
 * default (or an explicitly supplied diverging spectrum) applies.
 *
 * The single-colour ramp runs from light grey to `firstColor` — the first entry of
 * CanvasXpress's `colors` parameter (its default `#0ab0db` when the chart does not
 * override it), so the sequential scale shares the chart's primary hue.
 *
 * @param colorValues The continuous values driving the colour scale (nulls ignored).
 * @param diverging   Optional diverging spectrum to use when the range spans zero
 *                    (defaults to `{}` = the engine's diverging default).
 * @param firstColor  The high end of the sequential ramp (the first `colors` entry;
 *                    defaults to CanvasXpress's default first colour `#0ab0db`).
 * @returns A config patch, e.g. `{ colorSpectrum: [...] }` or `{}`.
 * @public
 */
export function continuousColorSpectrum(
    colorValues: Array<number | null | undefined>,
    diverging?: string[],
    firstColor?: string,
): Record<string, unknown> {
    const nums = colorValues.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const spansZero = nums.some((v) => v < 0) && nums.some((v) => v > 0);
    if (spansZero) {
        return diverging ? { colorSpectrum: diverging } : {};
    }
    // Sequential light-grey → first colour for one-directional data.
    return { colorSpectrum: ['#d3d3d3', firstColor || '#0ab0db'] };
}
