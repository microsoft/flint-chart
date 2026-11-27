// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Bar templates: Bar Chart, Grouped Bar Chart, Stacked Bar Chart.
 *
 * All three emit a y-matrix. The grouped/stacked distinction is a CanvasXpress
 * graphType, verified empirically against the engine:
 *   • graphType 'Bar'     → multiple `vars` render GROUPED (side-by-side).
 *   • graphType 'Stacked' → multiple `vars` render STACKED.
 * (The `stacked` config key is a no-op for bars and is not used.)
 *
 * A bound `color`/`group` channel produces one `vars` row per group; a bare
 * measure produces a single row.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { buildYMatrix, resolveMatrixReduce } from '../spec';
import { encodingField, facetLayoutTopology, continuousColorSpectrum } from './channel-kind';

/**
 * Build CanvasXpress faceted-bar data (small multiples): one panel per value of
 * the facet field. CanvasXpress bars are samples (smps), so the facet field
 * rides as a per-sample `x` annotation and `segregateSamplesBy` splits the bars
 * into panels — a different shape from the pivoted y-matrix (which would dedup
 * the categories and drop the facet). Verified against the engine.
 *
 * @param table         Data rows.
 * @param categoryField The bar category field → sample labels within each panel.
 * @param valueField    The measure field → bar height.
 * @param facetField    The column/row facet field → one panel per value.
 * @param isColumn      True for a column facet (grid), false for a row facet (stacked).
 * @param facetColumns  Optional explicit facet column count.
 * @param graphType     'Bar' or 'Stacked'.
 * @returns A spec patch: data (long-form y + x annotation) and the segregate config.
 * @private
 */
function buildBarFacet(
    table: any[],
    categoryField: string,
    valueField: string,
    facetField: string,
    isColumn: boolean,
    facetColumns: number | undefined,
    graphType: 'Bar' | 'Stacked',
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
        },
    };
}

/**
 * Build bars for a CONTINUOUS colour channel. A continuous colour has no
 * discrete series to pivot into `vars` (doing so makes one bogus series per
 * distinct value). Instead keep every row as its own bar, labelled by the
 * category (CanvasXpress clusters adjacent same-named bars under one category
 * tick) and coloured by the continuous value via `colorBy` — the gradient bar
 * group Vega-Lite draws. Verified against the engine.
 *
 * @param table         Data rows.
 * @param categoryField The category field → repeated sample labels (bar clusters).
 * @param valueField    The measure field → bar height.
 * @param colorField    The continuous colour field → per-bar gradient colour.
 * @param isHorizontal  True when the category axis is y.
 * @returns A spec patch: long-form data + colour config.
 * @private
 */
function buildBarContinuousColor(
    table: any[],
    categoryField: string,
    valueField: string,
    colorField: string,
    isHorizontal: boolean,
): { data: any; config: Record<string, any> } {
    const toNum = (raw: any) => {
        const n = raw == null || raw === '' ? null : Number(raw);
        return Number.isNaN(n as number) ? null : n;
    };
    const smps = table.map((row) => String(row[categoryField]));
    const values = table.map((row) => toNum(row[valueField]));
    const colors = table.map((row) => toNum(row[colorField]));
    return {
        data: { y: { vars: [valueField], smps, data: [values] }, x: { [colorField]: colors } },
        config: {
            graphType: 'Bar',
            graphOrientation: isHorizontal ? 'horizontal' : 'vertical',
            xAxis: [valueField],
            colorBy: colorField,
            smpTitle: categoryField,
            xAxisTitle: valueField,
            showLegend: true,
            // The single measure is the only variable; its name needs no legend
            // (the colour gradient legend stays).
            showVariableLegend: false,
            // Sequential spectrum for one-directional colour data, diverging when it
            // spans zero (shared rule across continuous-colour charts).
            ...continuousColorSpectrum(colors),
        },
    };
}

/**
 * Pick the banded (category) axis and the measure axis from the resolved
 * channel semantics. Bars are vertical when x is the banded axis, horizontal
 * when y is — mirroring the ECharts backend's detectAxes.
 *
 * A TEMPORAL axis bands like a categorical one here (a time-series bar puts the
 * dates on the band axis and the measure on the value axis), so for Q×T the
 * dates become the category and the quantity the bar height — not the reverse,
 * which plots an unparseable date as the value and renders blank.
 * @private
 */
function detectAxes(
    channelSemantics: Record<string, any>,
): { categoryAxis: 'x' | 'y'; valueAxis: 'x' | 'y' } {
    // Horizontal bar: the measure is on x, the band (category/time) on y.
    if (!isBandAxis(channelSemantics.x?.type) && isBandAxis(channelSemantics.y?.type)) {
        return { categoryAxis: 'y', valueAxis: 'x' };
    }
    return { categoryAxis: 'x', valueAxis: 'y' };
}

/** A bar's band axis is categorical OR temporal (both label discrete bars). @private */
function isBandAxis(type?: string): boolean {
    return isDiscrete(type) || type === 'temporal';
}

/** @private */
function isDiscrete(type?: string): boolean {
    return type === 'nominal' || type === 'ordinal';
}

/** Distinct values of a field, in first-seen order. @private */
function distinctValues(table: any[], field: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of table) {
        const key = String(row[field]);
        if (!seen.has(key)) { seen.add(key); out.push(key); }
    }
    return out;
}

// Blue→white→red diverging spectrum of the gallery heatmap examples (heatmap-22
// discrete / heatmap-23 continuous), drawn as separated tiles.
const HEATMAP_SPECTRUM = [
    'rgb(33,102,172)', 'rgb(103,169,207)', 'rgb(247,247,247)', 'rgb(239,138,98)', 'rgb(178,24,43)',
];
// CanvasXpress's default first series colour (config `colors[0]`). A bare count
// grid carries no colour scale, so every defined cell is painted this one colour.
const FIRST_COLOR = '#0ab0db';

/**
 * Index permutation that puts series `vars` in rank order, or undefined when the
 * order can't be determined. Numeric ranks sort ascending by value; string ranks
 * follow the declared ordinal order — the channel's explicit sort values or the
 * semantic annotation's `sortOrder` (e.g. Low < Medium < High < Critical).
 * @private
 */
function rankOrder(vars: any[], annotation: any, channelSemantic: any): number[] | undefined {
    const indices = vars.map((_, i) => i);
    const allNumeric = vars.every((v) => v !== '' && v != null && !Number.isNaN(Number(v)));
    if (allNumeric) {
        return indices.sort((a, b) => Number(vars[a]) - Number(vars[b]));
    }
    const declared: string[] | undefined =
        (channelSemantic?.sort?.kind === 'values' && Array.isArray(channelSemantic.sort.values)
            ? channelSemantic.sort.values
            : undefined)
        ?? (annotation && typeof annotation === 'object' && Array.isArray(annotation.sortOrder)
            ? annotation.sortOrder
            : undefined);
    if (declared && declared.length) {
        const rankOf = new Map(declared.map((v, i) => [String(v), i]));
        const LAST = Number.MAX_SAFE_INTEGER;
        return indices.sort((a, b) =>
            (rankOf.get(String(vars[a])) ?? LAST) - (rankOf.get(String(vars[b])) ?? LAST));
    }
    return undefined;
}

/**
 * The series ("colour") column is a Rank: colour it with the sequential Viridis
 * scheme, assigned in rank order. Reorders the y-matrix vars (and their data
 * rows) in place so Viridis runs low→high across the series.
 * @private
 */
function applyRankColorScheme(spec: any, annotation: any, channelSemantic: any): void {
    const y = spec?.data?.y;
    const vars: any[] = y?.vars;
    if (Array.isArray(vars) && vars.length > 1) {
        const order = rankOrder(vars, annotation, channelSemantic);
        if (order) {
            y.vars = order.map((i) => vars[i]);
            y.data = order.map((i) => y.data[i]);
        }
    }
    spec.config.colorScheme = 'Viridis';
}

/**
 * Build a Heatmap for a bar whose BOTH axes are categorical (or temporal). A bar
 * needs one quantitative axis; with two band axes the natural view is a tiled
 * heatmap, styled like the gallery examples (separated tiles, blue→white→red
 * spectrum). CanvasXpress Heatmap draws y.vars on the X-axis and y.smps on the
 * Y-axis, so x→vars and y→smps matches Vega-Lite.
 *
 * The cell value and colour mode follow the bound colour "column":
 *   • no colour       → per-cell COUNT, continuous gradient (heatmap-23).
 *   • continuous colour→ per-cell mean of the measure, continuous (heatmap-23).
 *   • categorical colour→ the category per cell, discrete binned tiles (heatmap-22).
 * @private
 */
function buildCountHeatmap(
    table: any[],
    xField: string,
    yField: string,
    colorField?: string,
    colorIsCategorical?: boolean,
    xIsTemporal?: boolean,
    yIsTemporal?: boolean,
): { data: any; config: Record<string, any> } {
    const xCats = distinctValues(table, xField);
    const yCats = distinctValues(table, yField);
    const cellKey = (row: any) => String(row[xField]) + '\u0000' + String(row[yField]);
    const categorical = !!(colorField && colorIsCategorical);
    const cell = new Map<string, number | string>();
    let missing: number | null = 0;

    if (colorField && colorIsCategorical) {
        // Categorical colour: put the raw category STRING in each cell. CanvasXpress
        // natively detects an all-string Heatmap matrix and draws it as discrete
        // categories (one qualitative colour per level + a named legend) — the
        // three real colours Vega-Lite shows, not a numeric spectrum.
        for (const row of table) cell.set(cellKey(row), String(row[colorField]));
        missing = null;
    } else if (colorField) {
        // Continuous colour: mean of the measure per cell.
        const sum = new Map<string, number>();
        const n = new Map<string, number>();
        for (const row of table) {
            const v = Number(row[colorField]);
            if (Number.isNaN(v)) continue;
            const k = cellKey(row);
            sum.set(k, (sum.get(k) || 0) + v);
            n.set(k, (n.get(k) || 0) + 1);
        }
        for (const k of sum.keys()) cell.set(k, sum.get(k)! / n.get(k)!);
        missing = null;
    } else {
        // No colour: per-cell count. Unobserved cells are undefined (not a real
        // zero) so they stay blank rather than taking the low end of the scale.
        for (const row of table) {
            const k = cellKey(row);
            cell.set(k, (Number(cell.get(k)) || 0) + 1);
        }
        missing = null;
    }

    const data = xCats.map((xv) => yCats.map((yv) => cell.get(xv + '\u0000' + yv) ?? missing));

    // A TEMPORAL heatmap axis gets the same hierarchical date labelling the bars use
    // (year at first occurrence, short month otherwise), thinned so a dozen show and
    // drawn FLAT. vars = the x field → columns (the engine's inverted convention makes
    // flat = varTextRotate 90); smps = the y field → rows, already flat.
    // Detect dates from the axis VALUES (what the engine relabels), not only the channel
    // semantic type: flint can type the same Date field as discrete on the y channel, so
    // the semantic flag alone misses N×T. ISO-ish date strings are the signal.
    const looksDate = (vals: string[]): boolean =>
        vals.length > 1 && vals.every((v) => /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(String(v)));
    const varsAreDates = xIsTemporal || looksDate(xCats as string[]);
    const smpsAreDates = yIsTemporal || looksDate(yCats as string[]);
    const dateAxisConfig: Record<string, unknown> = {
        ...(varsAreDates
            ? {
                varLabelDateAuto: true,
                varLabelInterval: Math.max(1, Math.ceil(xCats.length / 12)),
                varTextRotate: 90,
                varTextRotateAuto: false,
            }
            : {}),
        ...(smpsAreDates
            ? {
                smpLabelDateAuto: true,
                smpLabelInterval: Math.max(1, Math.ceil(yCats.length / 12)),
            }
            : {}),
    };

    return {
        data: { y: { vars: xCats, smps: yCats, data } },
        config: {
            graphType: 'Heatmap',
            showLegend: true,
            ...dateAxisConfig,
            // Tiled look of the gallery heatmap examples.
            heatmapCellSpace: 8,
            heatmapCellBox: false,
            ...(categorical
                // Categorical colour column: the matrix holds strings, so the engine
                // auto-detects a categorical heatmap — discrete qualitative colours
                // with a named legend (heatmap-22-style). Undefined cells stay white.
                ? {
                    missingDataColor: 'rgb(255,255,255)',
                }
                : colorField
                    // Continuous colour + indicator. Sequential spectrum for one-
                    // directional data, the diverging HEATMAP_SPECTRUM when it spans
                    // zero (shared rule across continuous-colour charts).
                    ? {
                        ...continuousColorSpectrum(
                            ([] as any[]).concat(...data).map((v) => (typeof v === 'number' ? v : null)),
                            HEATMAP_SPECTRUM,
                        ),
                        showHeatmapIndicator: true,
                    }
                    // Bare count: no colour scale. Defined cells are the single first
                    // colour; undefined cells stay white (the graph background). No
                    // colour indicator, since there is nothing to key.
                    : {
                        colorSpectrum: [FIRST_COLOR, FIRST_COLOR],
                        showHeatmapIndicator: false,
                        missingDataColor: 'rgb(255,255,255)',
                    }),
        },
    };
}

/**
 * Shared bar instantiate. `mode` selects the multi-series rendering:
 *   • 'Bar'     → grouped (side-by-side).
 *   • 'Stacked' → stacked.
 *   • 'auto'    → the plain Bar Chart: stacked when a colour/group channel
 *                 produces multiple series (matching Vega-Lite's default for a
 *                 coloured bar), plain 'Bar' for a single series.
 * @private
 */
function buildBarInstantiate(mode: 'Bar' | 'Stacked' | 'auto') {
    return (spec: any, ctx: any) => {
        const { channelSemantics, table, chartProperties, encodings } = ctx;

        // No quantitative axis (both are band axes — categorical or temporal) →
        // there is no measure for bar height; render a per-cell count Heatmap
        // instead (what a "grid" of two band axes means), matching the Vega-Lite
        // rect/heatmap. Covers N×N, N×T, T×N and T×T.
        const xField0 = channelSemantics.x?.field;
        const yField0 = channelSemantics.y?.field;
        if (xField0 && yField0
            && isBandAxis(channelSemantics.x?.type) && isBandAxis(channelSemantics.y?.type)) {
            // The bound colour "column" picks the heatmap colour mode (discrete
            // tiles for a categorical colour, continuous gradient otherwise).
            const gridColorField = channelSemantics.color?.field ?? encodingField((encodings as any)?.color);
            const gridColorType = channelSemantics.color?.type;
            const gridColorCategorical = gridColorType === 'nominal' || gridColorType === 'ordinal';
            const grid = buildCountHeatmap(
                table, xField0, yField0, gridColorField, gridColorCategorical,
                channelSemantics.x?.type === 'temporal', channelSemantics.y?.type === 'temporal',
            );
            spec.graphType = 'Heatmap';
            spec.data = grid.data;
            spec.config = { ...spec.config, ...grid.config };
            return;
        }

        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const categoryField = channelSemantics[categoryAxis]?.field;
        const valueField = channelSemantics[valueAxis]?.field;
        if (!categoryField || !valueField) return;
        // How duplicate (series, category) cells combine: additive measures sum,
        // intensive ones (rates/ratios) average. See resolveMatrixReduce.
        const valueReduce = resolveMatrixReduce(channelSemantics[valueAxis], (encodings as any)?.[valueAxis]);

        // A TEMPORAL (Date) band axis: thin the date labels so they never collide.
        // UNLIKE Line/Area (which snap labels to nice calendar boundaries via
        // smpLabelTimeAuto), bars keep each shown label on its own bar and simply draw
        // one every N bars (smpLabelInterval) — about a dozen labels across the axis.
        // Vertical bars rotate the long date labels upright; a HORIZONTAL bar reads its
        // labels left-to-right down the axis, so it is NOT rotated.
        let scaleConfig: Record<string, unknown> = {};
        if (channelSemantics[categoryAxis]?.type === 'temporal') {
            const nBars = new Set(table.map((row: any) => String(row[categoryField]))).size;
            const labelInterval = Math.max(1, Math.ceil(nBars / 12));
            // smpLabelDateAuto relabels each shown bar's date hierarchically (year at its
            // first appearance, else short month) — Vega-Lite's reading — while keeping
            // the every-n-th placement. The short year/month labels read FLAT in both
            // orientations (as Vega-Lite draws them). smpTextRotateAuto off pins the
            // angle; the engine's per-orientation convention is inverted, so flat text is
            // smpTextRotate 90 on a VERTICAL bar and smpTextRotate 0 on a HORIZONTAL one.
            scaleConfig = {
                smpLabelInterval: labelInterval,
                smpLabelDateAuto: true,
                smpTextRotate: categoryAxis === 'y' ? 0 : 90,
                smpTextRotateAuto: false,
            };
        }

        // The multi-series split. Bar/Stacked bind it to the `color` channel;
        // Grouped Bar binds it to `group` (see bar-tests barMatrixToTestCase). Read
        // both so the series isn't dropped (which collapses to a single bar).
        const encs = (encodings as any) || {};
        const seriesField = channelSemantics.color?.field
            ?? channelSemantics.group?.field
            ?? encodingField(encs.group);

        const seriesType = channelSemantics.color?.field
            ? channelSemantics.color?.type
            : channelSemantics.group?.type;
        const seriesIsContinuous = seriesType === 'quantitative' || seriesType === 'temporal';

        // 'auto' (plain Bar Chart) stacks the series when there is one, like Vega-Lite.
        const graphType: 'Bar' | 'Stacked' = mode === 'auto'
            ? (seriesField ? 'Stacked' : 'Bar')
            : mode;

        // A CONTINUOUS colour on a GROUPED/plain bar has no discrete series to
        // pivot — render gradient-coloured clustered bars (colorBy). But when the
        // chart is STACKED, Vega-Lite stacks the rows into one gradient segment per
        // value, so keep the pivot-into-series path below (and colour the resulting
        // numeric series sequentially, further down).
        if (seriesField && seriesIsContinuous && graphType !== 'Stacked') {
            const cont = buildBarContinuousColor(
                table, categoryField, valueField, seriesField, categoryAxis === 'y',
            );
            spec.graphType = 'Bar';
            spec.data = cont.data;
            spec.config = { ...spec.config, ...cont.config, ...scaleConfig };
            return;
        }

        // Faceting (small multiples): a column/row channel segregates the bars into
        // one panel per value — a different data shape than the pivoted y-matrix.
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;
        if (facetField && !seriesField) {
            const facet = buildBarFacet(
                table, categoryField, valueField, facetField,
                /* isColumn */ !!colFacet, chartProperties?.facetColumns, graphType,
            );
            spec.graphType = graphType;
            spec.data = facet.data;
            spec.config = { ...spec.config, ...facet.config, ...scaleConfig };
            return;
        }

        spec.graphType = graphType;
        spec.data = buildYMatrix(table, categoryField, valueField, seriesField, valueReduce);

        const isHorizontal = categoryAxis === 'y';
        spec.config = {
            ...spec.config,
            graphType,
            graphOrientation: isHorizontal ? 'horizontal' : 'vertical',
            // CanvasXpress 1D-plot axis titling (verified empirically against the
            // engine): `smpTitle` titles the CATEGORY (sample) axis and `xAxisTitle`
            // titles the VALUE axis — both orientation-INDEPENDENT; graphOrientation
            // moves which physical side each lands on. `yAxisTitle` is not a real
            // CanvasXpress key (it is silently ignored).
            smpTitle: categoryField,
            xAxisTitle: valueField,
            // The legend labels the series (vars) dimension; only shown when a
            // color/group channel produced more than one series. A single
            // variable (no series) needs no variable legend.
            showLegend: !!seriesField,
            ...(seriesField ? {} : { showVariableLegend: false }),
            ...scaleConfig,
        };

        // A Rank series column is ordinal: colour it with the sequential Viridis
        // scheme, with colours assigned in rank order (numeric ascending, or the
        // declared order for strings like Low < Medium < High < Critical).
        if (seriesField) {
            const ann = (ctx.semanticTypes as any)?.[seriesField];
            const semType = typeof ann === 'string' ? ann : ann?.semanticType;
            // A continuous colour pivoted into STACKED series has numeric var names:
            // sort them ascending and colour sequentially so the stack reads as the
            // gradient Vega-Lite draws (same ordering as an explicit Rank column).
            if (semType === 'Rank' || (graphType === 'Stacked' && seriesIsContinuous)) {
                const seriesChannel = channelSemantics.color?.field
                    ? channelSemantics.color
                    : channelSemantics.group;
                applyRankColorScheme(spec, ann, seriesChannel);
            }
        }

        // Many series (vars) exhaust the default qualitative palette (~16 colours),
        // which then repeats and makes series indistinguishable. With no explicit
        // colour scheme, fall back to the continuous ColorSpectrum so every series
        // still gets a distinct colour.
        const varCount = (spec.data as any)?.y?.vars?.length ?? 0;
        if (varCount > 16 && !spec.config.colorScheme) {
            spec.config.colorScheme = 'ColorSpectrum';
        }

        // Carry a single discrete property through to the engine.
        if (chartProperties?.cornerRadius != null) {
            spec.config.barLineWidth = chartProperties.cornerRadius;
        }
    };
}

const barProperties: ChartPropertyDef[] = [
    // Mirrors the ECharts bar 'Corners' property surface.
    { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 15, step: 1, defaultValue: 0 },
];

/** Bars want a banded category axis; default to x unless y is the band (categorical/temporal) one. */
const barLayoutMode = (channelSemantics: Record<string, any>) => {
    const bandOnY = !isBandAxis(channelSemantics.x?.type) && isBandAxis(channelSemantics.y?.type);
    return { axisFlags: bandOnY ? { y: { banded: true } } : { x: { banded: true } } };
};

export const cxBarChartDef: ChartTemplateDef = {
    chart: 'Bar Chart',
    template: { graphType: 'Bar', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color', 'group', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: barLayoutMode,
    // Plain Bar Chart: stacks when a colour channel yields multiple series
    // (Vega-Lite's default), otherwise a single-series bar.
    instantiate: buildBarInstantiate('auto'),
    properties: barProperties,
};

/** Grouped (dodged) multi-series bars — CanvasXpress graphType 'Bar'. */
export const cxGroupedBarChartDef: ChartTemplateDef = {
    chart: 'Grouped Bar Chart',
    template: { graphType: 'Bar', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color', 'group', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: barLayoutMode,
    instantiate: buildBarInstantiate('Bar'),
    properties: barProperties,
};

/** Stacked multi-series bars — CanvasXpress graphType 'Stacked'. */
export const cxStackedBarChartDef: ChartTemplateDef = {
    chart: 'Stacked Bar Chart',
    template: { graphType: 'Stacked', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color', 'group', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: barLayoutMode,
    instantiate: buildBarInstantiate('Stacked'),
    properties: barProperties,
};
