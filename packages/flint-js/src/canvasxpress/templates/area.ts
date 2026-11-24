// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Area templates: Area Chart and Streamgraph.
 *
 * Identical data shape to the Line template (y-matrix: ordered axis → smps,
 * measure → matrix, color/group → vars). Area uses graphType 'Area' (a bound
 * color channel stacks the bands, matching the VL/EC stacked-area default);
 * Streamgraph uses graphType 'Streamgraph' (a wiggle-stacked area that needs the
 * multi-series color channel).
 */

import { ChartTemplateDef } from '../../core/types';
import { buildYMatrix, distinctValues } from '../spec';
import { encodingField, facetLayoutTopology } from './channel-kind';

/** @private */
function isDiscrete(type?: string): boolean {
    return type === 'nominal' || type === 'ordinal';
}

/**
 * Build the data + config for a Streamgraph.
 *
 * CanvasXpress's `Streamgraph` is NOT an area y-matrix — the engine rewrites it to
 * `graphType: 'Scatter2D'` + `scatterType: 'stream'` (see canvasXpress.config.js),
 * which reads LONG-format scatter data: one `vars` row per observation, the two
 * measured columns (`[xField, yField]`) as `smps`, the `[x, y]` pair per row as the
 * data, and the group as a per-variable `z` annotation picked up by `colorBy`. The
 * wiggle-stacked bands are laid out by the engine. Feeding it the wide y-matrix (as
 * the Area path does) renders a blank canvas with transposed axes.
 *
 * The x column must be numeric: a temporal (date-string) axis is parsed to epoch
 * milliseconds with `xAxisTime` so the engine prints date ticks; an already-numeric
 * axis (years, quantities) is kept as-is; a categorical axis falls back to ordinal
 * index positions.
 * @private
 */
function buildStreamData(
    table: any[],
    xField: string,
    yField: string,
    groupField: string | undefined,
    xIsTemporal: boolean,
): { data: any; config: Record<string, any> } {
    const toNum = (raw: any) => {
        const n = raw == null || raw === '' ? null : Number(raw);
        return Number.isNaN(n as number) ? null : n;
    };
    const rawX = table.map((row) => row[xField]);
    const isBlank = (v: any) => v == null || v === '';
    const numericX = rawX.every((v) => isBlank(v) || typeof v === 'number'
        || (String(v).trim() !== '' && !Number.isNaN(Number(v))));
    const firstX = rawX.find((v) => !isBlank(v));
    const dateParsable = firstX != null && !Number.isNaN(Date.parse(String(firstX)));

    let xConv: (v: any) => number | null;
    let xAxisTime = false;
    if (numericX) {
        // Years / quantities: keep the real numbers (clean 1950, 1960 … ticks).
        xConv = (v) => toNum(v);
    } else if (xIsTemporal || dateParsable) {
        // Date strings → epoch ms, with date-formatted ticks.
        xConv = (v) => (isBlank(v) ? null : Date.parse(String(v)));
        xAxisTime = true;
    } else {
        // Categorical x → ordinal positions.
        const order = distinctValues(table, xField);
        const idx = new Map(order.map((v, i) => [v, i]));
        xConv = (v) => (idx.has(String(v)) ? (idx.get(String(v)) as number) : null);
    }

    // Long rows: [x, y] per observation, with the group kept alongside.
    let rows = table
        .map((row) => ({ x: xConv(row[xField]), y: toNum(row[yField]), g: groupField ? String(row[groupField]) : '' }))
        .filter((r) => r.x != null) as { x: number; y: number | null; g: string }[];

    // The engine snaps points onto a uniform grid and ZERO-pads empty nodes before
    // smoothing (geomStream.js). When the real x values are few and widely spaced
    // (e.g. 5 decade snapshots across 70 years), most grid nodes are zero and the
    // bands taper to nothing between points. Densify sparse data by LINEAR
    // interpolation per group onto a fine uniform grid so adjacent nodes are filled
    // and the stream stays continuous — dense data (already filling the grid) is left
    // untouched.
    rows = densifyStreamRows(rows);

    const vars = rows.map((_r, i) => String(i + 1));
    const smps = [xField, yField];
    const data = rows.map((r) => [r.x, r.y]);
    const z: Record<string, string[]> = {};
    if (groupField) z[groupField] = rows.map((r) => r.g);

    const config: Record<string, any> = {
        graphType: 'Streamgraph',
        scatterType: 'stream',
        xAxis: [xField],
        yAxis: [yField],
        showLegend: !!groupField,
    };
    if (groupField) config.colorBy = groupField;
    if (xAxisTime) config.xAxisTime = true;

    return { data: { y: { vars, smps, data }, z }, config };
}

/** How many uniform grid steps the widest gap may span before we densify. @private */
const STREAM_MAX_GAP_STEPS = 40;
/** Target resolution (points across the x-range, per group) when densifying. @private */
const STREAM_DENSIFY_POINTS = 100;

/**
 * Resample sparse stream rows so the engine's smoothing grid has no large zero-padded
 * gaps. Only acts when the widest gap between consecutive distinct x values exceeds
 * `1/STREAM_MAX_GAP_STEPS` of the x-range (i.e. the data is too sparse for the grid);
 * otherwise the rows are returned unchanged. Each group is linearly interpolated onto
 * a shared uniform grid of `STREAM_DENSIFY_POINTS` positions, holding the end values
 * flat beyond a group's own range.
 * @private
 */
function densifyStreamRows(
    rows: { x: number; y: number | null; g: string }[],
): { x: number; y: number | null; g: string }[] {
    if (rows.length < 2) return rows;
    const xsSorted = Array.from(new Set(rows.map((r) => r.x))).sort((a, b) => a - b);
    const minX = xsSorted[0];
    const maxX = xsSorted[xsSorted.length - 1];
    const range = maxX - minX;
    if (range <= 0 || xsSorted.length >= STREAM_DENSIFY_POINTS) return rows;

    let widestGap = 0;
    for (let i = 1; i < xsSorted.length; i++) widestGap = Math.max(widestGap, xsSorted[i] - xsSorted[i - 1]);
    // Dense enough that the grid is well filled — leave it alone.
    if (widestGap <= range / STREAM_MAX_GAP_STEPS) return rows;

    const byGroup = new Map<string, { x: number; y: number }[]>();
    for (const r of rows) {
        if (r.y == null) continue;
        if (!byGroup.has(r.g)) byGroup.set(r.g, []);
        byGroup.get(r.g)!.push({ x: r.x, y: r.y });
    }

    const step = range / (STREAM_DENSIFY_POINTS - 1);
    const out: { x: number; y: number | null; g: string }[] = [];
    for (const [g, ptsRaw] of byGroup) {
        const pts = ptsRaw.slice().sort((a, b) => a.x - b.x);
        for (let k = 0; k < STREAM_DENSIFY_POINTS; k++) {
            const x = minX + k * step;
            out.push({ x, y: interpolateAt(pts, x), g });
        }
    }
    return out;
}

/** Linear interpolation of a sorted (x, y) series at `x`, holding end values flat. @private */
function interpolateAt(pts: { x: number; y: number }[], x: number): number {
    if (x <= pts[0].x) return pts[0].y;
    const last = pts[pts.length - 1];
    if (x >= last.x) return last.y;
    for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j];
        const b = pts[j + 1];
        if (x >= a.x && x <= b.x) {
            const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
            return a.y + t * (b.y - a.y);
        }
    }
    return last.y;
}

/**
 * Build faceted-area data (small multiples): one panel per facet value. Like the
 * bar facet, the ordered x-axis becomes repeated sample labels and the facet
 * field rides as an `x` annotation that `segregateSamplesBy` splits into panels.
 * @private
 */
function buildAreaFacet(
    table: any[],
    categoryField: string,
    valueField: string,
    facetField: string,
    isColumn: boolean,
    facetColumns: number | undefined,
    graphType: 'Area' | 'Streamgraph',
): { data: any; config: Record<string, any> } {
    const toNum = (raw: any) => {
        const n = raw == null || raw === '' ? null : Number(raw);
        return Number.isNaN(n as number) ? null : n;
    };
    const smps = table.map((row) => String(row[categoryField]));
    const values = table.map((row) => toNum(row[valueField]));
    const facets = table.map((row) => String(row[facetField]));
    const nGroups = new Set(facets).size;
    return {
        data: { y: { vars: [valueField], smps, data: [values] }, x: { [facetField]: facets } },
        config: {
            graphType,
            graphOrientation: 'vertical',
            segregateSamplesBy: [facetField],
            layoutTopology: facetLayoutTopology(nGroups, isColumn, facetColumns),
            // Shared axis scales across panels (ggplot facet default), not per-panel
            // recalculated ranges.
            layoutAdjust: false,
            // Keep the facet strip, with a legible dark label on a white band —
            // the engine's themed default is near-white text on mid-grey, which
            // is almost invisible.
            stripTextColor: 'rgb(0,0,0)',
            stripBackgroundColor: 'rgb(255,255,255)',
            smpTitle: categoryField,
            xAxisTitle: valueField,
            showLegend: false,
            showVariableLegend: false,
            connectNullData: true,
            ...(graphType === 'Area' ? { areaType: 'normal' } : {}),
        },
    };
}

const areaLayoutMode = (channelSemantics: Record<string, any>) => {
    const bandOnX = isDiscrete(channelSemantics.x?.type);
    return { axisFlags: bandOnX ? { x: { banded: true } } : {} };
};

/**
 * Shared area/stream instantiate. `graphType` selects the fill style; `areaType`
 * is applied for 'Area' only (Streamgraph manages its own wiggle layout).
 * @private
 */
function buildAreaInstantiate(graphType: 'Area' | 'Streamgraph') {
    return (spec: any, ctx: any) => {
        const { channelSemantics, table, chartProperties, encodings } = ctx;

        // Area/stream is x-ordered + y-measure; horizontal area is not supported.
        const categoryField = channelSemantics.x?.field;
        const valueField = channelSemantics.y?.field;
        if (!categoryField || !valueField) return;

        const colorField = channelSemantics.color?.field;

        // Temporal (Date) x-axis: proportional time scale (points at real dates) +
        // nice-date-label selection + horizontal labels. A quantitative x-axis (Q×Q)
        // gets the numeric twin (smpValueScale: proportional value positions + nice
        // round ticks). Both match line.ts.
        const isTemporalCategory = channelSemantics.x?.type === 'temporal';
        const isQuantitativeCategory = channelSemantics.x?.type === 'quantitative';
        const temporalLabels = isTemporalCategory
            ? { smpTimeScale: true, smpLabelTimeAuto: true, smpTextRotate: 90 }
            : isQuantitativeCategory
                ? { smpValueScale: true, smpTextRotate: 90 }
                : {};

        // Streamgraph is a different engine shape entirely (Scatter2D + scatterType
        // 'stream', long-format data) — not the area y-matrix. Build it directly.
        if (graphType === 'Streamgraph') {
            const stream = buildStreamData(table, categoryField, valueField, colorField, isTemporalCategory);
            spec.graphType = 'Streamgraph';
            spec.data = stream.data;
            spec.config = { ...spec.config, ...stream.config };
            return;
        }

        // Faceting: a column/row channel splits the area into one panel per value.
        const encs = (encodings as any) || {};
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;
        if (facetField && !colorField) {
            const facet = buildAreaFacet(
                table, categoryField, valueField, facetField,
                !!colFacet, chartProperties?.facetColumns, graphType,
            );
            spec.graphType = graphType;
            spec.data = facet.data;
            spec.config = { ...spec.config, ...facet.config, ...temporalLabels };
            return;
        }

        spec.graphType = graphType;
        spec.data = buildYMatrix(table, categoryField, valueField, colorField);

        spec.config = {
            ...spec.config,
            graphType,
            graphOrientation: 'vertical',
            // See bar.ts: CanvasXpress 1D titling — smpTitle = category axis,
            // xAxisTitle = value axis; yAxisTitle is not a real key.
            smpTitle: categoryField,
            xAxisTitle: valueField,
            showLegend: !!colorField,
            // A single band (no colour series) needs no variable legend.
            ...(colorField ? {} : { showVariableLegend: false }),
            // Multiple bands stack by default (stacked area); one band fills to baseline.
            ...(graphType === 'Area' ? { areaType: colorField ? 'stacked' : 'normal' } : {}),
            // Connect across missing values (interpolate) like the SVG backends, so
            // the area does not drop to the baseline at each gap (sawtooth).
            connectNullData: true,
            ...temporalLabels,
        };
    };
}

export const cxAreaChartDef: ChartTemplateDef = {
    chart: 'Area Chart',
    template: { graphType: 'Area', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: areaLayoutMode,
    instantiate: buildAreaInstantiate('Area'),
};

/** Wiggle-stacked area over an ordered axis — CanvasXpress graphType 'Streamgraph'. */
export const cxStreamgraphDef: ChartTemplateDef = {
    chart: 'Streamgraph',
    template: { graphType: 'Streamgraph', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'area',
    declareLayoutMode: areaLayoutMode,
    instantiate: buildAreaInstantiate('Streamgraph'),
};
