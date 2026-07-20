// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Accessible chart description generation.
 *
 * Builds a short, deterministic, screen-reader-first description of a chart
 * from the resolved channel semantics and the data table. The copy is limited
 * to structural and statistical content (what the chart is and what the data
 * spans) — it never makes perceptual or interpretive claims ("X is trending
 * up"), which a compiler cannot verify.
 *
 * Backends inject the result where their renderer exposes it:
 * Vega-Lite `description`, ECharts `aria.label.description`, and a
 * `_a11y.description` metadata field for Chart.js hosts.
 */

import type { ChannelSemantics } from './types';

/** Channels that carry the measure in priority order. */
const MEASURE_CHANNELS = ['y', 'x', 'size', 'color'];
/** Channels that carry the category/axis dimension in priority order. */
const DIMENSION_CHANNELS = ['x', 'y', 'column', 'row'];
/** Channels that split the data into series. */
const SERIES_CHANNELS = ['color', 'group', 'detail', 'strokeDash'];

const isDiscrete = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

function displayName(
    field: string,
    fieldDisplayNames?: Record<string, string>,
): string {
    return fieldDisplayNames?.[field] ?? field;
}

/** Compact, locale-neutral number formatting for range statements. */
function formatStat(v: number): string {
    if (!Number.isFinite(v)) return String(v);
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${trimTrailingZero(v / 1e9)}B`;
    if (abs >= 1e6) return `${trimTrailingZero(v / 1e6)}M`;
    if (abs >= 1e4) return `${trimTrailingZero(v / 1e3)}K`;
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 100) / 100);
}

function trimTrailingZero(v: number): string {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : String(r);
}

function measureLabel(
    cs: ChannelSemantics,
    fieldDisplayNames?: Record<string, string>,
): string {
    const name = displayName(cs.field, fieldDisplayNames);
    const unit = cs.semanticAnnotation?.unit;
    return unit ? `${name} (${unit})` : name;
}

/**
 * Build a short accessible description for a compiled chart.
 *
 * Structure: "<Chart type> of <measure> by <dimension>[, grouped by <series>].
 * [<n> categories.] [<n> series.] [Range <min>–<max>.]"
 */
export function buildChartDescription(args: {
    chartType: string;
    channelSemantics: Record<string, ChannelSemantics>;
    table: Record<string, unknown>[];
    fieldDisplayNames?: Record<string, string>;
}): string {
    const { chartType, channelSemantics, table, fieldDisplayNames } = args;

    // Resolve the primary measure (first quantitative channel by priority).
    let measure: ChannelSemantics | undefined;
    for (const ch of MEASURE_CHANNELS) {
        const cs = channelSemantics[ch];
        if (cs && cs.type === 'quantitative') { measure = cs; break; }
    }

    // Resolve the primary dimension (first discrete/temporal positional channel
    // that isn't the measure's own channel).
    let dimension: ChannelSemantics | undefined;
    for (const ch of DIMENSION_CHANNELS) {
        const cs = channelSemantics[ch];
        if (cs && cs !== measure && (isDiscrete(cs.type) || cs.type === 'temporal')) {
            dimension = cs;
            break;
        }
    }

    // Resolve the series channel (first discrete series channel distinct from
    // measure and dimension).
    let series: ChannelSemantics | undefined;
    for (const ch of SERIES_CHANNELS) {
        const cs = channelSemantics[ch];
        if (cs && cs !== measure && cs !== dimension && isDiscrete(cs.type)) {
            series = cs;
            break;
        }
    }

    const parts: string[] = [];

    // L1 — structure.
    let head = chartType;
    if (measure) head += ` of ${measureLabel(measure, fieldDisplayNames)}`;
    if (dimension) head += ` by ${displayName(dimension.field, fieldDisplayNames)}`;
    if (series) head += `, grouped by ${displayName(series.field, fieldDisplayNames)}`;
    parts.push(`${head}.`);

    // L2 — cheap statistics from the table.
    if (dimension && isDiscrete(dimension.type)) {
        const n = cardinality(table, dimension.field);
        if (n > 0) parts.push(`${n} categories.`);
    }
    if (series) {
        const n = cardinality(table, series.field);
        if (n > 1) parts.push(`${n} series.`);
    }
    if (measure) {
        const range = valueRange(table, measure.field);
        if (range) parts.push(`Range ${formatStat(range[0])}–${formatStat(range[1])}.`);
    }

    return parts.join(' ');
}

function cardinality(table: Record<string, unknown>[], field: string): number {
    const seen = new Set<string>();
    for (const row of table) {
        const v = row[field];
        if (v != null) seen.add(String(v));
    }
    return seen.size;
}

function valueRange(
    table: Record<string, unknown>[],
    field: string,
): [number, number] | null {
    let min = Infinity;
    let max = -Infinity;
    for (const row of table) {
        const v = Number(row[field]);
        if (Number.isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    return min <= max ? [min, max] : null;
}
