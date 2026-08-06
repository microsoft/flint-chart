// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Round-2 theme corpus.
 *
 * The theme lab's dev set has one case per chart type, all at a comfortable
 * cardinality, all looked at while the compiler was being written. This file
 * names a second corpus drawn from the gallery — charts written for entirely
 * other purposes — chosen to vary the three things the lab holds constant:
 * cardinality, data type, and chart shape.
 *
 * A case is a *reference* into `packages/flint-js/src/test-data`, not a copy of
 * it: `(gen, index)` into `TEST_GENERATORS`. The gallery's own titles are
 * shape descriptions ("N(5)×Q (5 pts)"), which tell a theme's typography
 * nothing, so each case carries a plausible headline instead.
 *
 * `probe` says what the case is here to test. A case that stops probing
 * anything should be removed, not kept for the count.
 */

import { TEST_GENERATORS, type TestCase } from 'flint-chart/test-data';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';

export interface R2Case {
    /** Stable slug: file name of the audit sheet, key of a gap note. */
    id: string;
    /** `TEST_GENERATORS` key. */
    gen: string;
    /** Index into that generator's cases. */
    index: number;
    title: string;
    subtitle?: string;
    /** What this case is here to test. */
    probe: string;
    family: R2Family;
}

export type R2Family =
    | 'Bars & ranking'
    | 'Points & correlation'
    | 'Distributions'
    | 'Time & trends'
    | 'Parts & radial'
    | 'Maps & matrices'
    | 'Single value & schedule';

export const R2_FAMILY_ORDER: R2Family[] = [
    'Bars & ranking',
    'Points & correlation',
    'Distributions',
    'Time & trends',
    'Parts & radial',
    'Maps & matrices',
    'Single value & schedule',
];

export const R2_CASES: R2Case[] = [
    // ── Bars & ranking ────────────────────────────────────────────────────
    { id: 'bar-n5', gen: 'Bar Chart', index: 0, family: 'Bars & ranking', title: 'Revenue by segment', subtitle: 'Fiscal 2024, $m', probe: 'lowest useful bar count — a house that prints values has room for all of them' },
    { id: 'bar-n30', gen: 'Bar Chart', index: 2, family: 'Bars & ranking', title: 'Orders by product line', probe: '30 bands: label rotation, printed values, band occupancy' },
    { id: 'bar-n100', gen: 'Bar Chart', index: 3, family: 'Bars & ranking', title: 'Sessions by page', subtitle: 'Top 100 pages by traffic', probe: '100 bands, overflow and cutoff — every per-mark rule at its limit' },
    { id: 'bar-horizontal', gen: 'Bar Chart', index: 6, family: 'Bars & ranking', title: 'Downloads by platform', probe: 'horizontal bars: which axis is the index, which the measure' },
    { id: 'bar-temporal', gen: 'Bar Chart', index: 9, family: 'Bars & ranking', title: 'Monthly shipments', subtitle: 'Units, 2022–2023', probe: 'temporal band axis — tick policy on a bar chart' },
    { id: 'bar-temporal-color', gen: 'Bar Chart', index: 11, family: 'Bars & ranking', title: 'Shipments by region', subtitle: 'Units per month', probe: 'temporal bands with a nominal series on colour' },
    { id: 'bar-grid', gen: 'Bar Chart', index: 16, family: 'Bars & ranking', title: 'Category by tier', probe: 'two discrete positional channels on a bar template' },
    { id: 'stacked-n15', gen: 'Stacked Bar Chart', index: 1, family: 'Bars & ranking', title: 'Spend by department', subtitle: 'Five cost centres across fifteen teams', probe: '15 bands × 5 series: legend, printed values, stack order' },
    { id: 'stacked-numeric-color', gen: 'Stacked Bar Chart', index: 3, family: 'Bars & ranking', title: 'Responses by cohort', probe: 'numeric series values on colour — ordered, not nominal' },
    { id: 'stacked-horizontal-temporal', gen: 'Stacked Bar Chart', index: 9, family: 'Bars & ranking', title: 'Weekly hours by activity', probe: 'horizontal stack on a temporal index axis' },
    { id: 'grouped-numeric-color', gen: 'Grouped Bar Chart', index: 3, family: 'Bars & ranking', title: 'Scores by quarter', probe: 'grouped bars whose group field is numeric' },
    { id: 'grouped-sparse', gen: 'Grouped Bar Chart', index: 12, family: 'Bars & ranking', title: 'Sales by region and channel', subtitle: 'Not every channel operates in every region', probe: 'sparse cross-product: local dodge, lanes, legend' },
    { id: 'grouped-color-continuous', gen: 'Grouped Bar Chart', index: 8, family: 'Bars & ranking', title: 'Throughput by node', probe: '50 numeric groups — a ramp where a house expects a set' },
    { id: 'lollipop-color', gen: 'Lollipop Chart', index: 1, family: 'Bars & ranking', title: 'Adoption by market', probe: 'stem-and-dot marks with a colour series' },
    { id: 'lollipop-facet', gen: 'Lollipop Chart', index: 3, family: 'Bars & ranking', title: 'Adoption by market and tier', probe: 'lollipop inside small multiples' },
    { id: 'pyramid-12', gen: 'Pyramid Chart', index: 3, family: 'Bars & ranking', title: 'Households by income bracket', probe: '12 mirrored bands — two panels, two directions' },
    { id: 'pyramid-20', gen: 'Pyramid Chart', index: 6, family: 'Bars & ranking', title: 'Population by age band', subtitle: 'Twenty five-year bands', probe: 'pyramid past its comfortable height' },
    { id: 'bartable-diverging', gen: 'Bar Table', index: 4, family: 'Bars & ranking', title: 'Budget variance by team', probe: 'signed measure in a table — diverging ink, zero rule' },
    { id: 'bartable-long-labels', gen: 'Bar Table', index: 8, family: 'Bars & ranking', title: 'Programme spend', probe: 'category names wider than the gutter a theme leaves them' },
    { id: 'bartable-stacked', gen: 'Bar Table', index: 15, family: 'Bars & ranking', title: 'Views by month and channel', probe: 'a stacked bar inside a table row' },
    { id: 'bartable-facet-wrap', gen: 'Bar Table', index: 17, family: 'Bars & ranking', title: 'Leaders by market', probe: 'seven wrapped table panels' },
    { id: 'waterfall-typed', gen: 'Waterfall Chart', index: 1, family: 'Bars & ranking', title: 'Cash bridge', subtitle: 'Opening to closing balance, $m', probe: 'explicit step types — a three-role palette' },
    { id: 'waterfall-14', gen: 'Waterfall Chart', index: 3, family: 'Bars & ranking', title: 'Monthly cash flow', probe: '14 steps: connector, band width, printed values' },

    // ── Points & correlation ──────────────────────────────────────────────
    { id: 'scatter-color-n3', gen: 'Scatter Plot', index: 1, family: 'Points & correlation', title: 'Yield against temperature', subtitle: 'Three process lines', probe: 'the ordinary scatter: three series, one key' },
    { id: 'scatter-color-n50', gen: 'Scatter Plot', index: 12, family: 'Points & correlation', title: 'Latency against load', subtitle: 'By service', probe: '50 series — more categories than any house owns inks' },
    { id: 'scatter-shape', gen: 'Scatter Plot', index: 25, family: 'Points & correlation', title: 'Weight against economy', probe: 'series carried by shape, not colour' },
    { id: 'scatter-500', gen: 'Scatter Plot', index: 10, family: 'Points & correlation', title: 'Sensor readings', probe: '500 overlapping points — mark size and opacity' },
    { id: 'scatter-facet', gen: 'Scatter Plot', index: 28, family: 'Points & correlation', title: 'Height against weight', subtitle: 'By group', probe: 'faceted scatter' },
    { id: 'regression-6', gen: 'Regression', index: 3, family: 'Points & correlation', title: 'Cost against volume', subtitle: 'Six product families', probe: 'six fits at once — the statistics caption cannot speak' },
    { id: 'regression-quad', gen: 'Regression', index: 6, family: 'Points & correlation', title: 'Response against dose', probe: 'a non-linear fit' },
    { id: 'connected-3', gen: 'Connected Scatter Plot', index: 1, family: 'Points & correlation', title: 'Growth against inflation', subtitle: 'Three economies', probe: 'three trajectories, ordered by time' },
    { id: 'connected-spiral', gen: 'Connected Scatter Plot', index: 6, family: 'Points & correlation', title: 'Drift against noise', probe: 'a path that crosses itself 36 times' },
    { id: 'rangeddot', gen: 'Ranged Dot Plot', index: 0, family: 'Points & correlation', title: 'Before and after', subtitle: 'Eight sites', probe: 'two dots and a connector per row' },
    { id: 'strip-color', gen: 'Strip Plot', index: 1, family: 'Points & correlation', title: 'Trial scores by arm', probe: 'jittered sample with a colour series' },

    // ── Distributions ─────────────────────────────────────────────────────
    { id: 'hist-color', gen: 'Histogram', index: 1, family: 'Distributions', title: 'Age at diagnosis', subtitle: 'By sex', probe: 'two overlaid histograms' },
    { id: 'hist-1000', gen: 'Histogram', index: 2, family: 'Distributions', title: 'Part widths', probe: '1000 observations, many bins' },
    { id: 'density-3', gen: 'Density Plot', index: 1, family: 'Distributions', title: 'Latency by region', probe: 'three overlapping densities' },
    { id: 'density-facet', gen: 'Density Plot', index: 3, family: 'Distributions', title: 'Latency by region and site', probe: 'density inside small multiples' },
    { id: 'box-12', gen: 'Boxplot', index: 2, family: 'Distributions', title: 'Response time by service', probe: '12 boxes — band width against house preference' },
    { id: 'box-6x4', gen: 'Boxplot', index: 4, family: 'Distributions', title: 'Salary by department and level', probe: 'grouped boxes, six bands of four' },
    { id: 'box-sparse', gen: 'Boxplot', index: 7, family: 'Distributions', title: 'Salary by department and grade', subtitle: 'Not every grade exists in every department', probe: 'sparse box lanes' },
    { id: 'violin-zero', gen: 'Violin Plot', index: 3, family: 'Distributions', title: 'Daily returns by asset', probe: 'a distribution that crosses zero' },
    { id: 'violin-grid', gen: 'Violin Plot', index: 9, family: 'Distributions', title: 'Salary by department and level', probe: 'violins promoted to a grid' },
    { id: 'ecdf-2', gen: 'ECDF Plot', index: 1, family: 'Distributions', title: 'Test scores', subtitle: 'Control against treatment', probe: 'two cumulative curves' },
    { id: 'ecdf-facet', gen: 'ECDF Plot', index: 7, family: 'Distributions', title: 'Exam scores by subject', probe: 'faceted ECDF' },

    // ── Time & trends ─────────────────────────────────────────────────────
    { id: 'line-8', gen: 'Line Chart', index: 2, family: 'Time & trends', title: 'Traffic by channel', subtitle: 'Eight channels, daily', probe: 'eight series — more lines than a house names at the end' },
    { id: 'line-sparse', gen: 'Line Chart', index: 4, family: 'Time & trends', title: 'Coverage by cohort', probe: 'series with holes in them' },
    { id: 'line-continuous-color', gen: 'Line Chart', index: 5, family: 'Time & trends', title: 'Temperature over time', probe: 'a line whose colour carries a quantity' },
    { id: 'line-ordinal-30', gen: 'Line Chart', index: 8, family: 'Time & trends', title: 'Score by round', probe: '30 ordinal steps on the index axis' },
    { id: 'line-forecast', gen: 'Line Chart', index: 17, family: 'Time & trends', title: 'Demand, actual and forecast', subtitle: 'Three regions', probe: 'a dash that carries meaning, three times over' },
    { id: 'line-facet', gen: 'Line Chart', index: 20, family: 'Time & trends', title: 'Monthly revenue by region', probe: 'ten wrapped line panels' },
    { id: 'area-color-n4', gen: 'Area Chart', index: 1, family: 'Time & trends', title: 'Storage by tier', subtitle: 'Four tiers, monthly', probe: 'a four-band stack over time' },
    { id: 'area-ordinal', gen: 'Area Chart', index: 7, family: 'Time & trends', title: 'Visits by channel', probe: 'a stack over an ordinal index' },
    { id: 'area-facet', gen: 'Area Chart', index: 13, family: 'Time & trends', title: 'Monthly visits by channel', probe: 'faceted area' },
    { id: 'stream-5', gen: 'Streamgraph', index: 0, family: 'Time & trends', title: 'Attention by topic', probe: 'five wiggling bands and their names' },
    { id: 'rangearea-2', gen: 'Range Area Chart', index: 1, family: 'Time & trends', title: 'Monthly temperature range', subtitle: 'Two cities', probe: 'two bands over one index' },
    { id: 'rangearea-zero', gen: 'Range Area Chart', index: 4, family: 'Time & trends', title: 'Temperature anomaly band', probe: 'a band straddling zero' },
    { id: 'rangearea-facet', gen: 'Range Area Chart', index: 7, family: 'Time & trends', title: 'Daily temperature range by city', probe: 'faceted band' },
    { id: 'sparkline-3', gen: 'Sparkline', index: 1, family: 'Time & trends', title: 'Key metrics', probe: 'a table of trends — theme against a concatenation' },
    { id: 'sparkline-15', gen: 'Sparkline', index: 3, family: 'Time & trends', title: 'Metrics by service', probe: '15 rows of sparkline' },
    { id: 'bump-many', gen: 'Bump Chart', index: 2, family: 'Time & trends', title: 'Rank by quarter', subtitle: 'Twelve competitors', probe: 'twelve ranked series' },
    { id: 'bump-single', gen: 'Bump Chart', index: 4, family: 'Time & trends', title: 'Rank over four rounds', probe: 'a bump chart with one series and no key' },
    { id: 'slope-crossings', gen: 'Slope Chart', index: 1, family: 'Time & trends', title: 'Share, 2019 against 2024', subtitle: 'Eight companies', probe: 'eight slopes that cross' },
    { id: 'slope-negative', gen: 'Slope Chart', index: 3, family: 'Time & trends', title: 'Margin, before and after', probe: 'slopes across zero' },
    { id: 'slope-detail', gen: 'Slope Chart', index: 8, family: 'Time & trends', title: 'Units, before and after', probe: 'series carried by detail — no colour, no key' },
    { id: 'candle-90', gen: 'Candlestick Chart', index: 1, family: 'Time & trends', title: 'Daily price', subtitle: '90 sessions', probe: 'a dense composite mark' },
    { id: 'candle-facet', gen: 'Candlestick Chart', index: 3, family: 'Time & trends', title: 'Daily price by ticker', probe: 'faceted OHLC' },

    // ── Parts & radial ────────────────────────────────────────────────────
    { id: 'pie-10', gen: 'Pie Chart', index: 1, family: 'Parts & radial', title: 'Share by vendor', probe: 'ten slices — more than a pie reads, which is the point' },
    { id: 'pie-25', gen: 'Pie Chart', index: 2, family: 'Parts & radial', title: 'Share by vendor', subtitle: 'Twenty-five vendors', probe: 'a pie past legibility' },
    { id: 'pie-skewed', gen: 'Pie Chart', index: 3, family: 'Parts & radial', title: 'Share by tier', probe: 'one slice at 80 per cent, five slivers' },
    { id: 'donut-4', gen: 'Donut Chart', index: 0, family: 'Parts & radial', title: 'Traffic by source', probe: 'the hole in the middle' },
    { id: 'rose-stacked', gen: 'Rose Chart', index: 1, family: 'Parts & radial', title: 'Wind by direction and season', probe: 'stacked petals' },
    { id: 'rose-months', gen: 'Rose Chart', index: 4, family: 'Parts & radial', title: 'Rainfall by month', probe: 'a cyclic ordinal index with an inner radius' },
    { id: 'rose-facet', gen: 'Rose Chart', index: 6, family: 'Parts & radial', title: 'Wind by direction and site', probe: 'faceted rose' },
    { id: 'radar-2', gen: 'Radar Chart', index: 1, family: 'Parts & radial', title: 'Team profile', subtitle: 'Two squads across six measures', probe: 'two overlaid polygons' },
    { id: 'radar-facet', gen: 'Radar Chart', index: 3, family: 'Parts & radial', title: 'Profile by region', probe: 'faceted radar' },
    { id: 'radar-12', gen: 'Radar Chart', index: 6, family: 'Parts & radial', title: 'Product profile', subtitle: 'Twelve measures', probe: 'twelve spokes and their names' },

    // ── Maps & matrices ───────────────────────────────────────────────────
    { id: 'heat-ordinal', gen: 'Heatmap', index: 3, family: 'Maps & matrices', title: 'Activity by month and cohort', probe: 'an ordinal axis against a nominal one' },
    { id: 'heat-temporal', gen: 'Heatmap', index: 5, family: 'Maps & matrices', title: 'Activity by site and day', probe: '80 temporal columns' },
    { id: 'heat-wide', gen: 'Heatmap', index: 7, family: 'Maps & matrices', title: 'Coverage by test and suite', probe: 'a grid 80 wide and 5 tall' },
    { id: 'map-us', gen: 'Map', index: 0, family: 'Maps & matrices', title: 'US metro areas', probe: 'a projection: no axes, no bands' },
    { id: 'choropleth-us', gen: 'Choropleth', index: 0, family: 'Maps & matrices', title: 'Rate by state', probe: 'a ramp over geography' },

    // ── Single value & schedule ───────────────────────────────────────────
    { id: 'gantt-project', gen: 'Gantt Chart', index: 0, family: 'Single value & schedule', title: 'Project schedule', probe: 'a temporal range per row' },
    { id: 'gantt-ci', gen: 'Gantt Chart', index: 1, family: 'Single value & schedule', title: 'Pipeline run', subtitle: 'Seconds from start', probe: 'a numeric range per row' },
    { id: 'bullet-12', gen: 'Bullet Chart', index: 1, family: 'Single value & schedule', title: 'Revenue against target', subtitle: 'Twelve stores', probe: 'twelve rows of measure, target and bands' },
    { id: 'kpi-verdicts', gen: 'KPI Card', index: 0, family: 'Single value & schedule', title: 'Quarterly KPIs', subtitle: 'Against goal', probe: 'a chart drawn entirely in pixels — whether the house reaches its progress bar, and whether accent, met and missed stay three distinguishable inks' },
    { id: 'kpi-pair', gen: 'KPI Card', index: 1, family: 'Single value & schedule', title: 'Adoption against plan', probe: 'two wide tiles — the big number at its largest, and card furniture re-toned to the house surface' },
];

/** The base canvas every R2 case is designed at, so sheets are comparable. */
export const R2_BASE_SIZE = { width: 300, height: 300 };

/** A generous square stretch ceiling. Each house starts from its own
 *  `compileDefaults.baseSize` (aspect ratio + footprint) and may grow up to
 *  this when the data needs the room, so the shape is the house's, not ours. */
export const R2_CANVAS_SIZE = { width: 800, height: 800 };

const CASE_CACHE = new Map<string, TestCase>();

export function r2TestCase(c: R2Case): TestCase {
    const key = `${c.gen}#${c.index}`;
    const hit = CASE_CACHE.get(key);
    if (hit) return hit;
    const gen = TEST_GENERATORS[c.gen];
    if (!gen) throw new Error(`R2 case ${c.id}: no generator \`${c.gen}\``);
    const cases = gen();
    const t = cases[c.index];
    if (!t) throw new Error(`R2 case ${c.id}: ${c.gen}[${c.index}] of ${cases.length}`);
    CASE_CACHE.set(key, t);
    return t;
}

/**
 * The assembly input for a case. Identical for all seven columns — the only
 * difference between them is whether a ThemeSpec is attached.
 */
export function r2Input(c: R2Case): any {
    const t = r2TestCase(c);
    const input = testCaseToAssemblyInput(t, R2_BASE_SIZE);
    // Let each house's own `compileDefaults.baseSize` drive its aspect ratio
    // and footprint: dropping the caller's baseSize lets the theme's win
    // (flint, with no theme, falls back to flint's neutral default). A single
    // generous square ceiling lets every house stretch when the data needs it
    // without dictating the shape it starts from.
    delete input.chart_spec.baseSize;
    input.chart_spec.canvasSize = R2_CANVAS_SIZE;
    input.chart_spec.title = c.title;
    if (c.subtitle) input.chart_spec.subtitle = c.subtitle;
    return input;
}
