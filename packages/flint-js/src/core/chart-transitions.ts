// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Central chart-type **transition registry** — the θ graph.
 *
 * This is the single source of truth for which sibling chart types a given chart
 * can re-render as (Control B / `θ` in the two-control transform model). It
 * replaces the per-template, per-backend inline `transitions` arrays: a chart
 * template no longer declares what it can turn into — the compiler looks the
 * edges up here by chart-type display name.
 *
 * Design notes (design-docs/chart-transform-two-axes.md §4, and the "registry"
 * discussion):
 *   - Edges are keyed by the *authored* chart type's display name.
 *   - Each edge is a CANDIDATE. It is still gated at runtime against the live
 *     encoding + data (route feasibility + the declarative gates on
 *     `PivotTransition`: requireOrderedAxis / requireNonNegative /
 *     maxCategoryCardinality / requireNoSeries / requireDiscreteSource /
 *     maxSourceCardinality) AND against backend availability (an edge is hidden
 *     when the target template does not exist in the active backend's registry).
 *   - So "not all mappings make sense" is handled twice: only sensible edges are
 *     declared here (the §4 catalog), and even a declared edge is withheld when
 *     the data / backend does not support it.
 *   - Edges should be *reversible*: if A → B is declared, B → A generally should
 *     be too (verified by tests), so a transform round-trips home.
 *
 * Grouped by data-signature family (design doc §4).
 */

import { PivotTransition } from './types';

export const CHART_TRANSITIONS: Record<string, PivotTransition[]> = {
    // ── Categorical comparison — D × M (§4.1) ──────────────────────────────
    'Bar Chart': [
        // Ordered-axis bridge into the trend family (§4.9). Only when the domain
        // axis is temporal/ordinal — an unordered nominal bar never sprouts a line.
        // orientDomainAxis:'x' re-orients a horizontal bar so time stays horizontal.
        { to: 'Line Chart', label: 'Line', requireOrderedAxis: true, orientDomainAxis: 'x' },
        { to: 'Area Chart', label: 'Area', requireOrderedAxis: true, requireNonNegative: true, orientDomainAxis: 'x' },
        // Same D×M signature, lighter ink.
        { to: 'Lollipop Chart', label: 'Lollipop' },
    ],
    'Lollipop Chart': [
        { to: 'Bar Chart', label: 'Bar' },
    ],
    'Grouped Bar Chart': [
        {
            to: 'Stacked Bar Chart',
            label: 'Stacked',
            route: { from: 'group', to: 'color', mode: 'move' },
            requireDiscreteSource: true,
        },
        // A 2-sided grouped bar reads as a population pyramid (mirrored).
        {
            to: 'Pyramid Chart',
            label: 'Pyramid',
            route: { from: 'group', to: 'color', mode: 'move' },
            requireDiscreteSource: true,
            maxSourceCardinality: 2,
        },
    ],
    'Stacked Bar Chart': [
        {
            to: 'Grouped Bar Chart',
            label: 'Grouped',
            route: { from: 'color', to: 'group', mode: 'move' },
            requireDiscreteSource: true,
            maxSourceCardinality: 12,
        },
    ],
    // Population pyramid = a 2-sided category × measure; its complement is the
    // side-by-side grouped bar (the 2 sides dodged instead of mirrored).
    'Pyramid Chart': [
        {
            to: 'Grouped Bar Chart',
            label: 'Grouped',
            route: { from: 'color', to: 'group', mode: 'move' },
            requireDiscreteSource: true,
        },
    ],

    // ── Trend over an ordered domain — T × M (§4.2) ────────────────────────
    'Line Chart': [
        { to: 'Area Chart', label: 'Area', requireNonNegative: true },
        // Back to discrete-period comparison; only readable with few ticks.
        { to: 'Bar Chart', label: 'Bar', maxCategoryCardinality: 30 },
        // Small-multiple trend strips (one per series) — needs a series. Route
        // the series onto `color` (from wherever it sits — color OR a column/row
        // facet) so the Sparkline template picks it up as its row series.
        { to: 'Sparkline', label: 'Sparklines', requireSeries: true, route: { from: 'series', to: 'color', mode: 'move' } },
    ],
    'Area Chart': [
        { to: 'Line Chart', label: 'Line' },
        { to: 'Bar Chart', label: 'Bar', maxCategoryCardinality: 30 },
        { to: 'Streamgraph', label: 'Stream', requireSeries: true, requireNonNegative: true, route: { from: 'series', to: 'color', mode: 'move' } },
    ],
    // Small-multiple trend table → a single overlaid multi-series line.
    'Sparkline': [
        { to: 'Line Chart', label: 'Line' },
    ],
    // Flowing composition → back to baseline-anchored trend / area. Both reads
    // are safe; note Streamgraph → Line is intentionally *one-directional* (there
    // is no Line → Streamgraph — see the note above).
    'Streamgraph': [
        { to: 'Area Chart', label: 'Area' },
        { to: 'Line Chart', label: 'Line' },
    ],

    // ── Two-measure relationship — M₁ × M₂ (§4.3) ──────────────────────────
    'Scatter Plot': [
        {
            to: 'Strip Plot',
            label: 'Jitter',
            route: { from: 'series', to: 'x', mode: 'swap', spill: 'color' },
        },
        // Add a fitted trend layer over the same cloud — only a clean
        // two-measure scatter (both axes quantitative, no size bubble).
        { to: 'Regression', label: 'Trend', requireBiaxialMeasure: true, requireNoSize: true },
    ],
    'Regression': [
        { to: 'Scatter Plot', label: 'Scatter' },
    ],
    'Strip Plot': [
        {
            to: 'Scatter Plot',
            label: 'Scatter',
            route: { from: 'color', to: 'x', mode: 'swap', spill: 'color' },
        },
        // A strip plot is a per-category distribution: box (summary) + violin
        // (density) are the same {x:category, y:measure} layout, no route.
        { to: 'Boxplot', label: 'Box' },
        { to: 'Violin Plot', label: 'Violin' },
    ],

    // ── Univariate distribution — M (§4.4) ─────────────────────────────────
    'Histogram': [
        { to: 'Density Plot', label: 'Density' },
        { to: 'ECDF Plot', label: 'ECDF' },
    ],
    'Density Plot': [
        { to: 'Histogram', label: 'Histogram' },
        { to: 'ECDF Plot', label: 'ECDF' },
    ],
    'ECDF Plot': [
        { to: 'Histogram', label: 'Histogram' },
        { to: 'Density Plot', label: 'Density' },
    ],
    'Boxplot': [
        { to: 'Violin Plot', label: 'Violin' },
        { to: 'Strip Plot', label: 'Strip' },
    ],
    'Violin Plot': [
        { to: 'Boxplot', label: 'Box' },
        { to: 'Strip Plot', label: 'Strip' },
    ],
};

/**
 * Look up the candidate θ transitions for a chart type (by display name).
 * Returns an empty array when the chart declares none.
 */
export function getChartTransitions(chart: string | undefined): PivotTransition[] {
    if (!chart) return [];
    return CHART_TRANSITIONS[chart] ?? [];
}
