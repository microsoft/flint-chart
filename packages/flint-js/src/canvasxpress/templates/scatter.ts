// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Scatter template (graphType 'Scatter2D').
 *
 * Scatter does NOT use the Bar/Line/Area y-matrix. CanvasXpress models a 2-D
 * scatter as:
 *   data.y.vars  — one id per point (one per data row)
 *   data.y.smps  — the two axis variables, [xField, yField]
 *   data.y.data  — one [x, y] pair per point (vars × smps matrix)
 *   data.z       — per-point (per-var) annotations: the color / size / shape
 *                  factors, each an array aligned to vars
 *   config       — xAxis/yAxis name the plotted variables; colorBy/sizeBy/
 *                  shapeBy name the z annotations driving those channels.
 *
 * This is why scatter gets its own data builder rather than buildYMatrix.
 */

import { ChartTemplateDef } from '../../core/types';
import { CanvasXpressData } from '../spec';
import { isCategorical, encodingField, facetLayoutTopology, continuousColorSpectrum } from './channel-kind';

/** Scatter data: a y-matrix of [x,y] points plus z annotations for the legend channels. */
interface ScatterData extends CanvasXpressData {
    z?: Record<string, (string | number)[]>;
}

/** Distinct values of a field, in first-seen order. @private */
function distinct(table: any[], field: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of table) {
        const key = String(row[field]);
        if (!seen.has(key)) { seen.add(key); out.push(key); }
    }
    return out;
}

/**
 * Build the native CanvasXpress grid (Heatmap) form for a categorical×categorical
 * scatter: a size-driven bubble grid, or a colour-filled grid.
 *
 * A numeric Scatter2D can't place two categorical axes (CanvasXpress date-parses
 * the category strings and draws nothing). The engine's native equivalent is a
 * Heatmap. With a `size` channel the cells become sized bubbles (sizeBy a
 * parallel matrix); with only a `color` channel the cells are filled by the
 * colour value; with neither, the per-cell count drives bubble size.
 *
 * CanvasXpress Heatmap draws y.vars on the X-axis and y.smps on the Y-axis, so
 * the x field becomes vars and the y field becomes smps to match Vega-Lite.
 *
 * @param table      Data rows (one per point).
 * @param xField     Categorical x-channel field → matrix vars (the X axis).
 * @param yField     Categorical y-channel field → matrix smps (the Y axis).
 * @param sizeField  Quantitative field driving bubble size, if any.
 * @param colorField Quantitative field driving cell colour when there is no size, if any.
 * @returns A spec patch: graphType 'Heatmap', the pivoted data, and the channel config.
 * @private
 */
function buildCategoricalGrid(
    table: any[],
    xField: string,
    yField: string,
    sizeField: string | undefined,
    colorField: string | undefined,
    sizeIsNumeric: boolean,
    colorIsNumeric: boolean,
    facetField?: string,
    facetIsColumn?: boolean,
    facetColumns?: number,
): { data: ScatterData; config: Record<string, any> } {
    const xCats = distinct(table, xField);
    // Size wins the cell value (bubble grid); otherwise colour fills the cell.
    const valueField = sizeField || colorField;
    const sized = !!sizeField || !valueField; // bubbles for size or bare count

    // Samples are the y categories, or — when faceting — the distinct (yCat, facet)
    // pairs so each facet becomes its own panel of the grid (segregateSamplesBy).
    // Keying the grid only on (x, y) merged rows from different facets into one grid.
    const sampleKeys: string[] = [];        // the key used to look cells up
    const smps: string[] = [];              // display label = the y category
    const facetAnno: string[] = [];         // facet value per sample
    const seenSample = new Set<string>();
    for (const row of table) {
        const yv = String(row[yField]);
        const fac = facetField ? String(row[facetField]) : '';
        const key = yv + '\u0000' + fac;
        if (!seenSample.has(key)) {
            seenSample.add(key);
            sampleKeys.push(key);
            smps.push(yv);
            facetAnno.push(fac);
        }
    }

    const agg = new Map<string, number>();
    for (const row of table) {
        const fac = facetField ? String(row[facetField]) : '';
        const key = String(row[xField]) + '\u0000' + String(row[yField]) + '\u0000' + fac;
        const raw = valueField ? Number(row[valueField]) : 1;
        const add = Number.isNaN(raw) ? 0 : raw;
        agg.set(key, (agg.get(key) || 0) + add);
    }
    const empty = valueField && !sized ? null : 0;
    // y.data is [var][smp] = [xCat][(yCat,facet)].
    const matrix = xCats.map((xv) => sampleKeys.map((sk) => agg.get(xv + '\u0000' + sk) ?? empty));

    const data: any = { y: { vars: xCats, smps, data: matrix } };
    if (facetField) data.x = { [facetField]: facetAnno };
    // This grid is a categorical×categorical SCATTER rendered through Heatmap, so
    // draw the cells as circles (a dot grid), not filled square tiles: oval cell
    // shape and no cell box. The size case is already circular (sizeBy bubbles);
    // this makes the colour and bare-count cases match.
    const config: Record<string, any> = {
        graphType: 'Heatmap',
        showLegend: true,
        shapeByShape: 'oval',
        heatmapCellBox: false,
    };
    // Faceting: segregate the (yCat, facet) samples into one panel per facet value.
    if (facetField) {
        const nGroups = new Set(facetAnno).size;
        config.segregateSamplesBy = [facetField];
        config.layoutTopology = facetLayoutTopology(nGroups, !!facetIsColumn, facetColumns);
        config.layoutAdjust = false;
        config.stripTextColor = 'rgb(0,0,0)';
        config.stripBackgroundColor = 'rgb(255,255,255)';
    }
    if (sized) {
        // `data2` is the parallel matrix `sizeByData` reads; it isn't part of
        // Flint's structural y type, so the object is `any`.
        data.y.data2 = matrix;
        config.sizeBy = sizeField || 'Count';
        config.sizeByData = 'data2';
        // A numeric sizeBy legend reads best as nested concentric rings; a
        // categorical size field keeps the flat legend. (The bare-count case has
        // no size field and is numeric by construction.)
        config.sizeLegendNested = sizeField ? sizeIsNumeric : true;
    }
    // When size is the ONLY encoding (no colour channel), size alone should carry
    // the meaning: draw uniform-coloured circles and drop the colour indicator,
    // rather than double-encoding the same value as both size and fill.
    if (sizeField && !colorField) {
        config.colorSpectrum = ['rgb(49,130,189)', 'rgb(49,130,189)'];
        config.showHeatmapIndicator = false;
    } else if (colorField && !sizeField && colorIsNumeric) {
        // Continuous colour fills the cells: apply the sign-aware spectrum (light-grey
        // → first colour for one-directional data, diverging when it spans zero), the
        // same rule as the other continuous-colour charts, over the cell values.
        Object.assign(
            config,
            continuousColorSpectrum(
                ([] as any[]).concat(...matrix).map((v) => (typeof v === 'number' ? v : null)),
            ),
        );
    }
    return { data: data as ScatterData, config };
}

/**
 * Build the native CanvasXpress Dotplot (strip plot) for a scatter with exactly
 * one categorical axis and one continuous axis.
 *
 * A numeric Scatter2D mis-renders a categorical axis (date-parsed → blank). The
 * engine's native equivalent is a Dotplot: a single value variable whose points
 * are grouped into bands by the categorical field (`groupingFactors`). The
 * category lands on the position axis, the value on the other — the same strip
 * Vega-Lite draws. `graphOrientation` flips it so the categorical axis matches
 * the channel it was bound to (x vs y).
 *
 * @param table      Data rows (one per point).
 * @param catField   The categorical channel's field (the grouping / category axis).
 * @param valField   The continuous channel's field (the value axis).
 * @param catOnY     True when the categorical field was the y channel (horizontal strip).
 * @param colorField Optional colour channel field.
 * @param sizeField  Optional size channel field.
 * @param idField    Optional point-id field; defaults to a positional id.
 * @returns A spec patch: graphType 'Dotplot', the data, and the channel config.
 * @private
 */
function buildDotplotStrip(
    table: any[],
    catField: string,
    valField: string,
    catOnY: boolean,
    colorField: string | undefined,
    sizeField: string | undefined,
    idField: string | undefined,
    sizeIsNumeric: boolean,
    colorIsNumeric: boolean,
    facetField?: string,
    facetIsColumn?: boolean,
    facetColumns?: number,
): { data: ScatterData; config: Record<string, any> } {
    const toNum = (raw: any) => {
        const n = raw == null || raw === '' ? null : Number(raw);
        return Number.isNaN(n as number) ? null : n;
    };
    const smps = table.map((row, i) => (idField != null ? String(row[idField]) : 'p' + i));
    const values = table.map((row) => toNum(row[valField]));

    // Sample annotations: the category (for groupingFactors) plus any colour/size.
    const x: Record<string, any[]> = { [catField]: table.map((row) => String(row[catField])) };
    if (colorField && colorField !== catField) x[colorField] = table.map((row) => row[colorField]);
    if (sizeField && sizeField !== catField) x[sizeField] = table.map((row) => toNum(row[sizeField]));
    // Faceting: carry the facet field as a sample annotation so panels can segregate
    // by it (otherwise row/column facets were merged into a single strip).
    if (facetField && facetField !== catField) x[facetField] = table.map((row) => String(row[facetField]));

    const config: Record<string, any> = {
        graphType: 'Dotplot',
        groupingFactors: [catField],
        xAxis: [valField],
        // CanvasXpress shows per-group mean/CI error bars by default; a strip plot
        // reads as raw points, so suppress them.
        showErrorBars: false,
    };
    // Default Dotplot puts the grouping on the X-axis (value on Y); when the
    // category was the y channel, flip to a horizontal strip.
    if (catOnY) config.graphOrientation = 'horizontal';
    // A column/row facet splits the strip into one panel per value.
    if (facetField) {
        const nGroups = new Set(table.map((row) => String(row[facetField]))).size;
        config.segregateSamplesBy = [facetField];
        config.layoutTopology = facetLayoutTopology(nGroups, !!facetIsColumn, facetColumns);
        config.layoutAdjust = false;
        config.stripTextColor = 'rgb(0,0,0)';
        config.stripBackgroundColor = 'rgb(255,255,255)';
    }
    if (colorField) {
        config.colorBy = colorField;
        // A continuous colour channel gets the sign-aware spectrum (light-grey →
        // first colour for one-directional data, diverging when it spans zero),
        // the same rule as Scatter2D; categorical colour keeps the qualitative palette.
        if (colorIsNumeric) {
            Object.assign(config, continuousColorSpectrum(table.map((row) => Number(row[colorField]))));
        }
    }
    if (sizeField) {
        config.sizeBy = sizeField;
        // Nested concentric legend only for a numeric size scale.
        config.sizeLegendNested = sizeIsNumeric;
    }

    const data: any = { y: { vars: [valField], smps, data: [values] }, x };
    return { data: data as ScatterData, config };
}

/**
 * Build CanvasXpress Scatter2D data from tabular rows.
 *
 * @param table      Post-overflow data rows (ctx.table).
 * @param xField     Field plotted on the x axis (quantitative).
 * @param yField     Field plotted on the y axis (quantitative).
 * @param annotations Map of z-annotation name → source field, for color/size/shape.
 * @param idField    Optional field to use as the point id; defaults to the row index.
 * @param xIsTemporal True when the x axis is a date axis (coordinates parsed to epoch ms).
 * @param yIsTemporal True when the y axis is a date axis (coordinates parsed to epoch ms).
 * @returns ScatterData with y.vars (point ids), y.smps ([xField,yField]), y.data ([x,y] rows), and z annotations.
 * @private
 */
function buildScatterData(
    table: any[],
    xField: string,
    yField: string,
    annotations: Record<string, string>,
    idField?: string,
    xIsTemporal?: boolean,
    yIsTemporal?: boolean,
): ScatterData {
    const vars: string[] = [];
    const data: (number | null)[][] = [];
    const z: Record<string, (string | number)[]> = {};
    for (const name of Object.keys(annotations)) z[name] = [];

    // A temporal axis arrives as normalized date strings (convertTemporalData), which
    // Number() turns to NaN; parse those to epoch ms so the points plot and the engine
    // prints date ticks (xAxisTime/yAxisTime), mirroring the streamgraph builder. A
    // numeric axis keeps its real numbers.
    const makeCoord = (isTemporal?: boolean) => (raw: any): number | null => {
        if (raw == null || raw === '') return null;
        if (isTemporal && typeof raw !== 'number') {
            const t = Date.parse(String(raw));
            return Number.isNaN(t) ? null : t;
        }
        const n = Number(raw);
        return Number.isNaN(n) ? null : n;
    };
    const xCoord = makeCoord(xIsTemporal);
    const yCoord = makeCoord(yIsTemporal);

    for (let i = 0; i < table.length; i++) {
        const row = table[i];
        vars.push(idField != null ? String(row[idField]) : String(i + 1));

        data.push([xCoord(row[xField]), yCoord(row[yField])]);

        for (const [name, field] of Object.entries(annotations)) {
            z[name].push(row[field]);
        }
    }

    const out: ScatterData = { y: { vars, smps: [xField, yField], data } };
    if (Object.keys(z).length > 0) out.z = z;
    return out;
}

export const cxScatterPlotDef: ChartTemplateDef = {
    chart: 'Scatter Plot',
    template: { graphType: 'Scatter2D', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    // Scatter supports the legend channels CanvasXpress maps via colorBy/sizeBy/shapeBy.
    channels: ['x', 'y', 'color', 'size', 'shape', 'column', 'row'],
    markCognitiveChannel: 'position',

    // Both axes are continuous — no banded axis for a scatter.
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings, chartProperties } = ctx;

        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const sizeFieldEarly = channelSemantics.size?.field;
        // A nested (concentric-ring) size legend only reads correctly for a
        // numeric size scale; a categorical size field should use the flat legend.
        const sizeIsNumeric = channelSemantics.size?.type === 'quantitative';
        const colorFieldEarly = channelSemantics.color?.field;

        const xCat = isCategorical(ctx, 'x');
        const yCat = isCategorical(ctx, 'y');

        // Faceting: a column/row channel segregates the points into one panel per
        // value. Resolved up front so the native-grid and Dotplot branches below can
        // preserve the facet dimension too, not just the Scatter2D path.
        const encsEarly = (encodings as any) || {};
        const colFacetEarly = channelSemantics.column?.field ?? encodingField(encsEarly.column);
        const rowFacetEarly = channelSemantics.row?.field ?? encodingField(encsEarly.row);
        const facetFieldEarly = colFacetEarly || rowFacetEarly;

        // Both axes categorical → a numeric Scatter2D can't render it (CanvasXpress
        // date-parses the category strings → blank). Emit the native Heatmap grid
        // (sized bubbles for size, colour-filled cells for colour, count otherwise).
        if (xCat && yCat) {
            const grid = buildCategoricalGrid(
                table, xField, yField, sizeFieldEarly, colorFieldEarly, sizeIsNumeric,
                channelSemantics.color?.type === 'quantitative',
                facetFieldEarly, !!colFacetEarly, (chartProperties as any)?.facetColumns,
            );
            spec.graphType = 'Heatmap';
            spec.data = grid.data;
            spec.config = { ...spec.config, ...grid.config };
            return;
        }

        // Exactly one axis categorical → a Dotplot strip, not a Scatter2D (whose
        // categorical axis would be date-parsed to blank). Rule: no two continuous
        // values ⇒ Dotplot.
        if (xCat !== yCat) {
            const catField = xCat ? xField : yField;
            const valField = xCat ? yField : xField;
            const strip = buildDotplotStrip(
                table, catField, valField, /* catOnY */ yCat,
                colorFieldEarly, sizeFieldEarly, channelSemantics.id?.field, sizeIsNumeric,
                channelSemantics.color?.type === 'quantitative',
                facetFieldEarly, !!colFacetEarly, (chartProperties as any)?.facetColumns,
            );
            spec.graphType = 'Dotplot';
            spec.data = strip.data;
            spec.config = { ...spec.config, ...strip.config };
            return;
        }

        // Collect the legend channels that are actually bound, as z annotations.
        const annotations: Record<string, string> = {};
        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;
        const shapeField = channelSemantics.shape?.field;
        if (colorField) annotations[colorField] = colorField;
        if (sizeField && sizeField !== colorField) annotations[sizeField] = sizeField;
        if (shapeField && shapeField !== colorField && shapeField !== sizeField) {
            annotations[shapeField] = shapeField;
        }

        // Faceting (small multiples): a column/row channel segregates the points
        // into one panel per value. CanvasXpress keys points on y.vars, so the
        // facet field must ride along as a per-point z annotation.
        const encs = (encodings as any) || {};
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;
        if (facetField && !annotations[facetField]) annotations[facetField] = facetField;

        // Use an explicit id channel as point ids when present (CanvasXpress keys
        // tooltips/selection off vars); otherwise fall back to a positional id.
        const idField = channelSemantics.id?.field;

        // A continuous axis may be temporal (Date); its coordinates are parsed to
        // epoch ms and the engine is told to print date ticks (xAxisTime/yAxisTime).
        const xIsTemporal = channelSemantics.x?.type === 'temporal';
        const yIsTemporal = channelSemantics.y?.type === 'temporal';

        spec.graphType = 'Scatter2D';
        spec.data = buildScatterData(table, xField, yField, annotations, idField, xIsTemporal, yIsTemporal);

        spec.config = {
            ...spec.config,
            graphType: 'Scatter2D',
            xAxis: [xField],
            yAxis: [yField],
            xAxisTitle: xField,
            yAxisTitle: yField,
            showLegend: !!(colorField || sizeField || shapeField),
        };
        if (xIsTemporal) spec.config.xAxisTime = true;
        if (yIsTemporal) spec.config.yAxisTime = true;
        if (colorField) {
            spec.config.colorBy = colorField;
            // Continuous colour: sequential spectrum for one-directional data,
            // diverging when it spans zero (shared rule across continuous-colour charts).
            if (channelSemantics.color?.type === 'quantitative') {
                Object.assign(
                    spec.config,
                    continuousColorSpectrum(table.map((row: any) => Number(row[colorField]))),
                );
            }
        }
        if (sizeField) {
            spec.config.sizeBy = sizeField;
            // Nested concentric size legend only for a numeric size scale; a
            // categorical size field uses the flat legend.
            spec.config.sizeLegendNested = sizeIsNumeric;
        }
        if (shapeField) spec.config.shapeBy = shapeField;

        // Axis log transforms (chart_spec.chartProperties.logScale_x / _y).
        const props = (chartProperties as any) || {};
        if (props.logScale_x) { spec.config.xAxisTransform = 'log10'; spec.config.xAxisTransformTicks = true; }
        if (props.logScale_y) { spec.config.yAxisTransform = 'log10'; spec.config.yAxisTransformTicks = true; }

        // Faceting layout: segregate the points into panels. A column facet lays
        // the panels out side-by-side (1 × N); a row facet stacks them (N × 1);
        // an explicit facetColumns sets the grid width.
        if (facetField) {
            spec.config.segregateVariablesBy = [facetField];
            const nGroups = new Set(table.map((row) => String(row[facetField]))).size;
            spec.config.layoutTopology = facetLayoutTopology(nGroups, !!colFacet, props.facetColumns);
            // Shared axis scales across panels (ggplot facet default).
            spec.config.layoutAdjust = false;
            // Keep the facet strip, with a legible dark label on a white band
            // (the engine's themed default is near-white text on mid-grey).
            spec.config.stripTextColor = 'rgb(0,0,0)';
            spec.config.stripBackgroundColor = 'rgb(255,255,255)';
        }
    },
};
