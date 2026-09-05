// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef, ChartEncoding } from '../../core/types';
import type { FormatSpec } from '../../core/field-semantics';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    resolveSeriesTarget,
} from '../../core/interaction-semantics';
import { formatSpecToVegaExpr } from '../format';
import { interpolateConfigProperty, applyInterpolate } from './line';
import {
    annotationCandidates,
    presentAnnotationUpdate,
    transitionAnnotationText,
} from '../../interactive/presentation/annotation';

/**
 * Sparkline — a "sparkline table" / small-multiples strip layout.
 *
 * Renders a compact 3-column data table, modeled on the Bar Table:
 *
 *     ┌──────────┬─────────────────────┬──────────┐
 *     │ Category │  Trend              │ Average  │   ← aligned column headers
 *     ├──────────┼─────────────────────┼──────────┤
 *     │ US       │  ╴╴╴/\╴╴╴╴╴_╴╴╴╴    │     66.2 │   ← one row per series
 *     │ China    │  ╴╴╴╴╴___/‾‾‾‾‾╴╴    │     48.8 │
 *     │ India    │  ╴╴╴╴___─────────    │     31.4 │
 *     └──────────┴─────────────────────┴──────────┘
 *
 * Each row is one series: its name (left), a sparkline with a dashed reference
 * line (middle), and a value label (right). This is Tufte's "dataword" idea —
 * the precise quantitative scale is dropped in favor of shape-at-a-glance, so
 * dozens of series fit in the space a single Line Chart would use.
 *
 * Structure (`instantiate`): the table is an `hconcat` of three FACETED panels
 * sharing one row order and a shared y scale, exactly like the Bar Table's
 * three columns. The trends genuinely need faceting (each series has its own
 * continuous mini-axis, so they can't be flattened into one banded panel), and
 * splitting Category / Trend / Average into separate `hconcat` panels lets each
 * carry its own top-level title — so the column headers align on one row (a
 * single faceted view can only put a header on the side, not the top).
 *
 * The series field (`color`, or `detail` when no color is bound) is remapped
 * onto the `row` facet channel by `normalizeEncodings`. When it came from
 * `color`, the lines AND value labels are hued by series (line-chart color
 * semantics, e.g. US vs China); a `detail` series stays monochrome.
 */

/**
 * Per-row reference line. Like a bar table's gridline anchor, each strip can
 * carry a faint dashed rule the trace is read against:
 *   - `mean`   (default) the series average — "is today above or below normal?"
 *   - `zero`   a true zero baseline — for signed / change series
 *   - `median` a robust center, less swayed by spikes
 *   - `none`   no reference line
 *
 * The right-hand value column follows the reference: it shows the median when
 * the reference is the median, otherwise the mean (for mean / zero / none).
 */
const baselineProperty: ChartPropertyDef = {
    key: 'baseline', label: 'Reference line', type: 'discrete',
    defaultValue: 'mean',
    options: [
        { value: 'mean', label: 'Average' },
        { value: 'zero', label: 'Zero' },
        { value: 'median', label: 'Median' },
        { value: 'none', label: 'None' },
    ],
};

/**
 * Width (px) of the Trend (sparkline) column. Defaults to a compact base width
 * so the strip stays small (Tufte's "dataword") and the Average column sits
 * right beside it rather than floating off to the canvas edge. The value is
 * clamped to whatever base width is actually available, and users can raise it
 * (up to a near-full strip) to give the trend more room.
 */
const DEFAULT_TREND_W = 240;
const trendWidthProperty: ChartPropertyDef = {
    key: 'trendWidth', label: 'Sparkline width', type: 'continuous',
    min: 80, max: 600, step: 10, defaultValue: DEFAULT_TREND_W,
};

const HEADER_STYLE = { fontSize: 11, fontWeight: 'normal' as const, color: '#999', offset: 6 };
const CHAR_PX = 6.6;          // approx advance width at fontSize 11
const MONO_LINE = '#555';     // line color when no color field is bound
const MONO_VALUE = '#333';    // value-label color when monochrome

const isCJK = (ch: string): boolean =>
    /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch);
const textWidth = (s: unknown): number =>
    [...String(s ?? '')].reduce((a, ch) => a + (isCJK(ch) ? 2 : 1), 0);
const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a: number[]): number => {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
// Compact stringification used ONLY to budget the value column's width; the
// actual on-canvas formatting is d3's `.3~s` (set on the text encoding).
const approxNum = (v: number): string => {
    if (!Number.isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(Math.round(v * 10) / 10);
};
const approxFormattedNum = (v: number, fmt?: FormatSpec): string =>
    `${fmt?.prefix ?? ''}${approxNum(v)}${fmt?.suffix ?? ''}${fmt?.pattern ? '0' : ''}`;

export const sparklineDef: ChartTemplateDef = {
    chart: 'Sparkline',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail', 'row', 'column'],
    navigation: { axes: ['x'] },
    markCognitiveChannel: 'position',
    semanticInteractions: ({ resolvedEncodings }) => {
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['row', 'color', 'detail']);
        const valueField = resolvedEncodings.y?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'row', 'color', 'detail']),
            categoryField: seriesField,
            seriesField,
            selectableMarks: ['line'],
            renderHoverStyles: { line: { strokeWidth: 3 } },
            renderSelectionStyles: { line: { strokeWidthMultiplier: 1.2 } },
            resolve: (event, context) => resolveSeriesTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('segment-midpoint', 'right', 'left', 'top', 'bottom'),
                transitionAnnotationText(valueField),
            ),
        };
    },

    // Remap the series field onto `row` so each series becomes its own table
    // row. The series is the bound `color` field if present, else `detail`.
    // When it came from `color` we KEEP the color encoding (same field) so each
    // row's line/value is hued by its series — matching line-chart color
    // semantics (e.g. US vs China). `detail` series stay monochrome. An
    // explicit `row` binding wins.
    normalizeEncodings: (encodings: Record<string, ChartEncoding>) => {
        if (encodings.row?.field) return encodings;
        const fromColor = !!encodings.color?.field;
        const seriesEnc = fromColor
            ? encodings.color
            : (encodings.detail?.field ? encodings.detail : undefined);
        if (!seriesEnc) return encodings;
        const next: Record<string, ChartEncoding> = { ...encodings, row: { ...seriesEnc } };
        // Keep `color` (it doubles as the hue); drop `detail` (monochrome).
        if (!fromColor) delete next.detail;
        return next;
    },

    // The grid lays itself out manually (see `instantiate`), but the shared
    // pipeline still runs its facet-budget pass over the `row` channel. A low
    // `minSubplotSize` floor raises the row capacity so a normal sparkline
    // table (many short strips) doesn't trip a spurious "rows omitted" overflow
    // warning. The other knobs keep strips short and wide.
    declareLayoutMode: () => ({
        paramOverrides: {
            minSubplotSize: 24,
            continuousMarkCrossSection: { x: 100, y: 0, seriesCountAxis: 'auto' },
            facetAspectRatioResistance: 0.3,
        },
    }),

    instantiate: (spec, ctx) => {
        const enc = ctx.resolvedEncodings;
        const regionField = enc.row?.field as string | undefined;
        const xField = enc.x?.field as string | undefined;
        const yField = enc.y?.field as string | undefined;
        const hasColor = !!enc.color?.field;
        const baseline = (ctx.chartProperties?.baseline as string) ?? 'mean';
        const useMedian = baseline === 'median';

        // Guard: without both position fields there is no trend to draw; leave
        // a valid single-line spec so assembly still succeeds.
        if (!xField || !yField) {
            spec.encoding = {
                ...(xField ? { x: { ...enc.x } } : {}),
                ...(yField ? { y: { ...enc.y } } : {}),
            };
            return;
        }

        const table = (ctx.fullTable ?? ctx.table ?? []) as Array<Record<string, any>>;

        // A synthetic single-row facet when there is no series field, so the
        // grid machinery below is uniform (one table row, blank category cell).
        const facetField = regionField ?? 'flintSparkSeries';
        const trendData = regionField ? table : table.map(r => ({ ...r, [facetField]: '' }));

        // Row order = first appearance, kept stable across all three panels.
        const regions: any[] = [];
        const seen = new Set<any>();
        for (const r of trendData) {
            const v = r[facetField];
            if (!seen.has(v)) { seen.add(v); regions.push(v); }
        }

        // Per-series central tendency for the value column (and width budget).
        const groups = new Map<any, number[]>();
        for (const r of trendData) {
            const v = Number(r[yField]);
            if (!Number.isFinite(v)) continue;
            const k = r[facetField];
            const arr = groups.get(k);
            if (arr) arr.push(v); else groups.set(k, [v]);
        }
        const aggOf = (k: any): number => {
            const a = groups.get(k) ?? [];
            return useMedian ? median(a) : mean(a);
        };

        const categoryTitle = String(enc.row?.title ?? regionField ?? '');
        const trendTitle = String(enc.y?.title ?? yField ?? '');
        const avgTitle = useMedian ? 'Median' : 'Average';

        const catData = regions.map(r => ({ [facetField]: r }));
        const avgData = regions.map(r => ({ [facetField]: r, flintSparkAvg: aggOf(r) }));
        const valueFmt = ctx.channelSemantics?.y?.format;
        const avgTransforms: any[] = [];
        let avgTextEncoding: any = { field: 'flintSparkAvg', type: 'quantitative', format: '.3~s' };
        const valueExpr = valueFmt
            ? formatSpecToVegaExpr(valueFmt, 'datum.flintSparkAvg')
            : null;
        if (valueExpr) {
            avgTransforms.push({
                calculate: valueExpr,
                as: 'flintSparkAvgFormatted',
            });
            avgTextEncoding = { field: 'flintSparkAvgFormatted', type: 'nominal' };
        }

        // ── Sizing (manual, like the Bar Table — the layout engine's faceted
        // sizing doesn't apply to a hand-built hconcat). Column widths follow
        // their longest text; the trend takes the rest. Strips divide the
        // height and pack tighter as the series count grows.
        const canvas = ctx.canvasSize ?? { width: 480, height: 320 };
        const N = Math.max(1, regions.length);
        const HEADER_H = 18;
        const STRIP_GAP = 6;
        const INTER_GAP = 8;
        const stripH = Math.min(64, Math.max(16,
            Math.floor((canvas.height - HEADER_H - (N - 1) * STRIP_GAP) / N)));
        const maxCatChars = Math.max(textWidth(categoryTitle), 4,
            ...regions.map(r => textWidth(r)));
        const maxAvgChars = Math.max(textWidth(avgTitle), 4,
            ...avgData.map(d => textWidth(approxFormattedNum(d.flintSparkAvg, valueFmt))));
        const catW = Math.min(200, Math.max(40, Math.round(maxCatChars * CHAR_PX) + 10));
        const avgW = Math.min(96, Math.max(34, Math.round(maxAvgChars * CHAR_PX) + 8));
        // Compact by default (DEFAULT_TREND_W), tunable via `trendWidth`, and
        // always clamped to the base width left after the two text columns.
        const avail = canvas.width - catW - avgW - 2 * INTER_GAP;
        const tunedTrendW = Number(ctx.chartProperties?.trendWidth) || DEFAULT_TREND_W;
        const trendW = Math.max(90, Math.min(tunedTrendW, avail));

        const facetRow = { field: facetField, type: 'nominal', sort: regions, header: null };
        const lineMark = applyInterpolate({ type: 'line', strokeWidth: 1.5 }, ctx.chartProperties);

        // Inset the trace's y range a couple px inside the strip. A faceted
        // cell uses Vega `bounds: full`, so a line touching the top/bottom edge
        // (plus its stroke) makes the cell render ~4px taller than its declared
        // `height`. The text columns have no such overflow, so over many rows
        // the trend column would drift out of step with its labels. Keeping the
        // trace off the edges holds every column on the same row pitch.
        const Y_INSET = 2;
        const trendYScale = { range: [stripH - Y_INSET, Y_INSET] };

        // ── Trend panel layers: the line plus an optional dashed reference.
        const layers: any[] = [{
            mark: lineMark,
            encoding: {
                x: { ...enc.x, axis: null },
                y: { ...enc.y, axis: null, scale: { ...(enc.y as any).scale, ...trendYScale } },
                ...(hasColor
                    ? { color: { field: facetField, type: 'nominal', legend: null } }
                    : { color: { value: MONO_LINE } }),
            },
        }];
        if (baseline !== 'none') {
            // `zero` pins a true 0 datum; `mean`/`median` aggregate per row.
            const ruleY = baseline === 'zero'
                ? { datum: 0, type: 'quantitative', axis: null }
                : { field: yField, aggregate: baseline, type: 'quantitative', axis: null };
            layers.push({
                mark: { type: 'rule', strokeDash: [3, 2], stroke: '#9a9a9a', strokeWidth: 1, opacity: 0.7 },
                encoding: { y: ruleY },
            });
        }

        // ── Three faceted columns. Category/Average are single-mark text
        // panels (one row each, vertically centered at the strip midpoint);
        // the Trend is the layered line. All share the row order, strip height,
        // and y scale, so their rows line up; each panel's own `title` gives
        // the aligned column header.
        const catPanel = {
            data: { values: catData },
            facet: { row: facetRow },
            spec: {
                width: catW, height: stripH,
                mark: { type: 'text', align: 'left', baseline: 'middle', fontSize: 11 },
                encoding: {
                    y: { value: stripH / 2 },
                    x: { value: 0 },
                    text: { field: facetField, type: 'nominal' },
                },
            },
            title: { text: categoryTitle, anchor: 'start', ...HEADER_STYLE },
        };
        const trendPanel = {
            data: { values: trendData },
            facet: { row: facetRow },
            spec: { width: trendW, height: stripH, layer: layers },
            resolve: { scale: { y: 'independent' } },
            title: { text: trendTitle, anchor: 'middle', ...HEADER_STYLE },
        };
        const avgPanel = {
            data: { values: avgData },
            facet: { row: facetRow },
            spec: {
                width: avgW, height: stripH,
                ...(avgTransforms.length ? { transform: avgTransforms } : {}),
                mark: { type: 'text', align: 'right', baseline: 'middle', fontSize: 11, fontWeight: 600 },
                encoding: {
                    y: { value: stripH / 2 },
                    x: { value: avgW },
                    text: avgTextEncoding,
                    ...(hasColor
                        ? { color: { field: facetField, type: 'nominal', legend: null } }
                        : { color: { value: MONO_VALUE } }),
                },
            },
            title: { text: avgTitle, anchor: 'end', ...HEADER_STYLE },
        };

        delete spec.mark;
        delete spec.encoding;
        spec.hconcat = [catPanel, trendPanel, avgPanel];
        spec.spacing = INTER_GAP;
        // Trend owns the only real y scale; its per-row resolution is set on the
        // panel above. At the hconcat level keep y independent so VL never tries
        // to unify the trend's faceted scale with the text columns' value-y.
        spec.resolve = { scale: { y: 'independent', color: 'shared' } };
        spec.config = {
            view: { stroke: null },
            axis: { grid: false, domain: false, ticks: false },
            facet: { spacing: STRIP_GAP },
        };
    },

    properties: [interpolateConfigProperty, baselineProperty, trendWidthProperty],
};
