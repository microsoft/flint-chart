// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Image-Charts chart assembly — a hosted-image-URL backend.
 *
 * Unlike the other backends, Image-Charts does not emit a spec object that a
 * local renderer draws: it emits a single permanent `https://image-charts.com`
 * URL that renders the chart server-side. That URL is embeddable anywhere an
 * `<img>` works (email, PDF, Slack, no-code tools) with no runtime JavaScript.
 *
 * Contract:
 *   - PURE. No network I/O, no crypto, no npm dependencies. `assembleImageCharts`
 *     only builds a string; the data reaches Image-Charts only if something later
 *     loads the `<img>` — an explicit choice by the caller, exactly as choosing
 *     the Excel backend chooses Office.js.
 *   - FREE TIER ONLY. Unsigned URLs (no `icac`/`ichm` account/HMAC pair, no
 *     `chof` output override). Signed enterprise URLs need a server-side secret
 *     that has no place in a pure, offline compiler function.
 *
 * Reuses the SAME core analysis pipeline as the other backends (Phase 0 semantic
 * resolution + banded-axis overflow filtering), then serializes the resolved
 * channel semantics, category/series roles, and values into the Image-Charts
 * query grammar (`cht`, `chd=a:`, `chs`, `chxt`/`chxl`, `chco`, `chdl`, `chm`,
 * `chtt`). Like the Excel backend it does the work inline rather than through a
 * template registry, and it gates chart types to the ones with a faithful `cht`.
 */

import type { ChartAssemblyInput, ChartEncoding, SemanticResult } from '../core/types';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { detectBandedAxisFromSemantics } from '../core/axis-detection';
import { computeChannelBudgets, deriveStretchCaps, resolveBaseSize } from '../core/compute-layout';
import { filterOverflow } from '../core/filter-overflow';
import { normalizeChartEncodingAliases } from '../core/static-series';
import type { LayoutDeclaration } from '../core/types';
import { IMAGE_CHARTS_TYPE_MAP } from './chart-types';

/** A backend-native Image-Charts artifact: a permanent hosted-image URL. */
export interface ImageChartsArtifact {
    type: 'image-charts';
    url: string;
}

type Cell = string | number;

/** Image-Charts base endpoint (public free tier). */
const IMAGE_CHARTS_ENDPOINT = 'https://image-charts.com/chart?';

/** Free-tier size ceilings: each side ≤ 999px and area ≤ 998001px². */
const MAX_SIDE = 999;
const MAX_AREA = 998001;

/** Default target size when the spec provides no `baseSize`. */
const DEFAULT_SIZE = { width: 700, height: 400 };

/**
 * Categorical palette (hex, no `#`) used for `chco`. Emitted only when color is
 * meaningful (multiple series, pie slices, area fill, scatter markers); a single
 * plain series keeps Image-Charts' own default color.
 */
const SERIES_COLORS = [
    '4472C4', 'ED7D31', '70AD47', 'FFC000', '5B9BD5',
    'A5A5A5', '264478', '9E480E', '636363', '997300',
];

/** Normalize shorthand (`"x": "field"`) to `{ field }`. */
function normalizeEncodings(raw: Record<string, unknown>): Record<string, ChartEncoding> {
    const out: Record<string, ChartEncoding> = {};
    for (const [ch, v] of Object.entries(raw ?? {})) {
        if (v == null) continue;
        out[ch] = typeof v === 'string' ? { field: v } : (v as ChartEncoding);
    }
    return out;
}

/** Clamp a target size to the free-tier ceilings (side ≤ 999, area ≤ 998001). */
function clampChartSize(width: number, height: number): { width: number; height: number } {
    let w = Math.min(MAX_SIDE, Math.max(1, Math.round(width)));
    let h = Math.min(MAX_SIDE, Math.max(1, Math.round(height)));
    if (w * h > MAX_AREA) {
        const scale = Math.sqrt(MAX_AREA / (w * h));
        w = Math.max(1, Math.floor(w * scale));
        h = Math.max(1, Math.floor(h * scale));
    }
    return { width: w, height: h };
}

/**
 * Encode one label/title/legend segment: keep ASCII alphanumerics, map spaces to
 * `+`, percent-encode everything else (UTF-8). Structural separators (`|`, `,`,
 * `:`) are added by the caller between segments and never pass through here, so
 * a label that literally contains them stays escaped and cannot break parsing.
 */
function encodeSegment(text: string): string {
    let out = '';
    for (const ch of text) {
        if (/[0-9A-Za-z]/.test(ch)) out += ch;
        else if (ch === ' ') out += '+';
        else out += encodeURIComponent(ch);
    }
    return out;
}

/** Format one datum for the `a:` (awesome) encoding; `_` marks a gap/null. */
function formatValue(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '_';
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(4)));
}

function finiteNumber(value: unknown): number | null {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function cellKey(value: unknown): string {
    return `${typeof value}:${String(value)}`;
}

function pairKey(first: unknown, second: unknown): string {
    return JSON.stringify([cellKey(first), cellKey(second)]);
}

/** Distinct values of a field in first-seen order (nulls skipped). */
function distinct(rows: any[], field: string): Cell[] {
    const seen = new Set<unknown>();
    const out: Cell[] = [];
    for (const r of rows) {
        const v = r[field];
        if (v == null) continue;
        if (!seen.has(v)) { seen.add(v); out.push(v as Cell); }
    }
    return out;
}

/**
 * Aggregate the long/tidy rows into a per-series × per-category value matrix,
 * summing (or averaging) duplicates. `seriesField` undefined ⇒ one implicit
 * series holding the whole measure column.
 */
function pivotValues(
    rows: any[],
    catField: string,
    measField: string,
    seriesField: string | undefined,
    categories: Cell[],
    seriesKeys: Cell[],
    aggregate: 'sum' | 'average',
): (number | null)[][] {
    const SINGLE = '__single__';
    const acc = new Map<string, { sum: number; count: number }>();
    for (const r of rows) {
        const cv = r[catField];
        if (cv == null) continue;
        const sv = seriesField ? r[seriesField] : SINGLE;
        const num = finiteNumber(r[measField]);
        if (num == null) continue;
        const key = pairKey(cv, sv);
        const e = acc.get(key) ?? { sum: 0, count: 0 };
        e.sum += num; e.count += 1; acc.set(key, e);
    }
    const valueAt = (cv: Cell, sv: Cell): number | null => {
        const e = acc.get(pairKey(cv, seriesField ? sv : SINGLE));
        if (!e) return null;
        return aggregate === 'average' ? e.sum / e.count : e.sum;
    };
    return seriesKeys.map((sv) => categories.map((cv) => valueAt(cv, sv)));
}

/**
 * Assemble an {@link ImageChartsArtifact} (a permanent hosted-image URL) from a
 * {@link ChartAssemblyInput}.
 *
 * @throws if the chart type has no faithful Image-Charts `cht` equivalent
 *         (e.g. Boxplot, Sankey, Heatmap) or its roles cannot be resolved.
 */
export function assembleImageCharts(input: ChartAssemblyInput): ImageChartsArtifact {
    const flintType = input.chart_spec.chartType;
    const mapping = IMAGE_CHARTS_TYPE_MAP[flintType];
    if (!mapping) {
        throw new Error(`Image-Charts backend does not support chart type "${flintType}".`);
    }

    const semanticTypes = input.semantic_types ?? {};
    const rawData: any[] = input.data.values ?? [];
    const encodings = normalizeChartEncodingAliases(
        flintType,
        normalizeEncodings(input.chart_spec.encodings),
    );

    if (encodings.column?.field || encodings.row?.field) {
        throw new Error(`Image-Charts backend does not support faceting in one chart: "${flintType}".`);
    }

    // ── Phase 0 (reused core): resolve per-channel semantics ────────────────
    let table = convertTemporalData(rawData, semanticTypes);
    const sem: SemanticResult = resolveChannelSemantics(encodings, rawData, semanticTypes, table);
    const typeOf = (ch: string) => sem[ch]?.type;
    const isMeasure = (ch: string) => typeOf(ch) === 'quantitative';
    const fieldOf = (ch: string) => encodings[ch]?.field;

    // A categorical color/group binding becomes the series (legend) dimension;
    // a quantitative color is not a series and is ignored on this tier.
    const seriesCh = encodings.group?.field
        ? 'group'
        : encodings.color?.field && !isMeasure('color')
            ? 'color'
            : undefined;
    const seriesField = seriesCh ? fieldOf(seriesCh) : undefined;

    // ── Overflow filtering for banded (bar) families, so URLs stay bounded ──
    const keptCategoryOrder = new Map<string, Cell[]>();
    if (mapping.cht === 'bvg' || mapping.cht === 'bhg' || mapping.cht === 'bvs' || mapping.cht === 'bhs') {
        const detected = detectBandedAxisFromSemantics(sem, table, { preferAxis: 'x' });
        const declaration: LayoutDeclaration = {
            axisFlags: detected ? { [detected.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: detected?.resolvedTypes,
        };
        const baseSize = resolveBaseSize(input.chart_spec.baseSize, input.chart_spec.canvasSize);
        const options = {
            facetFixedPadding: { width: 50, height: 40 },
            facetGap: 10,
            targetBandAR: 10,
            ...deriveStretchCaps(baseSize, input.chart_spec.canvasSize, {}),
        };
        const budgets = computeChannelBudgets(sem, declaration, table, baseSize, options);
        const overflow = filterOverflow(sem, declaration, encodings, table, budgets, new Set(['bar']));
        table = overflow.filteredData;
        overflow.truncations.forEach((t) => keptCategoryOrder.set(t.field, t.keptValues as Cell[]));
    }

    const params: string[] = [];
    const size = clampChartSize(
        input.chart_spec.baseSize?.width ?? DEFAULT_SIZE.width,
        input.chart_spec.baseSize?.height ?? DEFAULT_SIZE.height,
    );

    if (mapping.noAxes) {
        buildPartToWhole(params, mapping.cht, sem, table, fieldOf);
    } else if (mapping.xy) {
        buildScatter(params, table, fieldOf, isMeasure, seriesField, flintType);
    } else {
        buildAxes(
            params, mapping, flintType, sem, table,
            fieldOf, typeOf, isMeasure, seriesField, keptCategoryOrder,
        );
    }

    params.push(`chs=${size.width}x${size.height}`);
    const title = input.chart_spec.title?.trim();
    if (title) params.push(`chtt=${encodeSegment(title)}`);

    return { type: 'image-charts', url: IMAGE_CHARTS_ENDPOINT + params.join('&') };
}

/** Pie / doughnut: one series of slices, each with its own label and color. */
function buildPartToWhole(
    params: string[],
    cht: string,
    sem: SemanticResult,
    table: any[],
    fieldOf: (ch: string) => string | undefined,
): void {
    const catField = fieldOf('color') ?? fieldOf('x');
    const measField = fieldOf('size') ?? fieldOf('theta') ?? fieldOf('y');
    if (!catField || !measField) {
        throw new Error(`Image-Charts backend could not resolve slice/value fields for a part-to-whole chart (category=${catField}, value=${measField}).`);
    }
    const slices = distinct(table, catField);
    const measCh = fieldOf('size') === measField ? 'size' : fieldOf('theta') === measField ? 'theta' : 'y';
    const aggregate = sem[measCh]?.aggregationDefault ?? 'sum';
    const [values] = pivotValues(table, catField, measField, undefined, slices, ['__single__'], aggregate);

    params.push(`cht=${cht}`);
    params.push(`chd=a:${values.map(formatValue).join(',')}`);
    params.push(`chl=${slices.map((s) => encodeSegment(String(s))).join('|')}`);
    params.push(`chco=${slices.map((_s, i) => SERIES_COLORS[i % SERIES_COLORS.length]).join('|')}`);
}

/** Scatter: `lxy` with one (x-set, y-set) pair per series, drawn as markers. */
function buildScatter(
    params: string[],
    table: any[],
    fieldOf: (ch: string) => string | undefined,
    isMeasure: (ch: string) => boolean,
    seriesField: string | undefined,
    flintType: string,
): void {
    const xField = fieldOf('x');
    const yField = fieldOf('y');
    if (!xField || !yField || !isMeasure('x') || !isMeasure('y')) {
        throw new Error(`Image-Charts backend requires quantitative x and y fields for "${flintType}".`);
    }
    const seriesKeys = seriesField ? distinct(table, seriesField) : ['__single__'];
    const datasets: string[] = [];
    const markers: string[] = [];
    const colors: string[] = [];
    seriesKeys.forEach((key, index) => {
        const rows = seriesField ? table.filter((r) => r[seriesField] === key) : table;
        const xs = rows.map((r) => finiteNumber(r[xField]));
        const ys = rows.map((r) => finiteNumber(r[yField]));
        datasets.push(xs.map(formatValue).join(','));
        datasets.push(ys.map(formatValue).join(','));
        const color = SERIES_COLORS[index % SERIES_COLORS.length];
        colors.push(color);
        markers.push(`s,${color},${index},-1,6`);
    });

    params.push('cht=lxy');
    params.push(`chd=a:${datasets.join('|')}`);
    params.push(`chco=${colors.join(',')}`);
    params.push(`chm=${markers.join('|')}`);
    if (seriesField && seriesKeys.length > 1) {
        params.push(`chdl=${seriesKeys.map((s) => encodeSegment(String(s))).join('|')}`);
    }
}

/** Bar / line / area / radar: a category axis plus one measure per series. */
function buildAxes(
    params: string[],
    mapping: { cht: string; horizontal?: string; radar?: boolean; area?: boolean },
    flintType: string,
    sem: SemanticResult,
    table: any[],
    fieldOf: (ch: string) => string | undefined,
    typeOf: (ch: string) => string | undefined,
    isMeasure: (ch: string) => boolean,
    seriesField: string | undefined,
    keptCategoryOrder: Map<string, Cell[]>,
): void {
    // Horizontal bar when the measure sits on x and the category on y.
    const horizontal = Boolean(mapping.horizontal) && isMeasure('x') && !isMeasure('y');
    const catCh = horizontal ? 'y' : 'x';
    const measCh = horizontal ? 'x' : 'y';
    const catField = fieldOf(catCh);
    const measField = fieldOf(measCh);
    if (!catField || !measField) {
        throw new Error(`Image-Charts backend could not resolve category/measure for "${flintType}" (category=${catField}, measure=${measField}).`);
    }

    let categories = keptCategoryOrder.get(catField) ?? distinct(table, catField);
    // Ordered domains (line / area over time or a numeric axis) sort ascending.
    if (!mapping.radar && (flintType === 'Line Chart' || flintType === 'Area Chart' || flintType === 'Sparkline')) {
        if (typeOf(catCh) === 'temporal') {
            categories = [...categories].sort((a, b) => new Date(String(a)).getTime() - new Date(String(b)).getTime());
        } else if (typeOf(catCh) === 'quantitative') {
            categories = [...categories].sort((a, b) => Number(a) - Number(b));
        }
    }

    const seriesKeys = seriesField ? distinct(table, seriesField) : [measField];
    const aggregate = sem[measCh]?.aggregationDefault ?? 'sum';
    const seriesValues = pivotValues(table, catField, measField, seriesField, categories, seriesKeys, aggregate);

    const cht = horizontal ? (mapping.horizontal as string) : mapping.cht;
    params.push(`cht=${cht}`);
    params.push(`chd=a:${seriesValues.map((vals) => vals.map(formatValue).join(',')).join('|')}`);

    // Category axis: index 0 (x) for vertical/radar, index 1 (y) for horizontal.
    const categoryLabels = categories.map((c) => encodeSegment(String(c))).join('|');
    if (mapping.radar) {
        params.push('chxt=r');
        params.push(`chxl=0:|${categoryLabels}`);
    } else {
        params.push('chxt=x,y');
        params.push(`chxl=${horizontal ? 1 : 0}:|${categoryLabels}`);
    }

    const seriesColors = seriesKeys.map((_k, i) => SERIES_COLORS[i % SERIES_COLORS.length]);
    if (seriesKeys.length > 1 || mapping.area) {
        params.push(`chco=${seriesColors.join(',')}`);
    }
    if (mapping.area) {
        params.push(`chm=${seriesColors.map((c, i) => `B,${c},${i},0,0`).join('|')}`);
    }
    if (seriesField && seriesKeys.length > 1) {
        params.push(`chdl=${seriesKeys.map((s) => encodeSegment(String(s))).join('|')}`);
    }
}
