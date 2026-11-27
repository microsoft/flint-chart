// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Line templates: Line Chart, Bump Chart, Slope Chart.
 *
 * All emit graphType 'Line' with a y-matrix: the banded/ordered axis supplies
 * `smps` (the points along the line), the measure fills the matrix, and a bound
 * `color`/`group` channel produces one `vars` row per line. Shares buildYMatrix
 * with the Bar template. Bump (ranking lines) and Slope (two-point lines) are
 * the same engine path with different test data.
 */

import { ChartTemplateDef } from '../../core/types';
import { buildYMatrix, distinctValues, resolveMatrixReduce } from '../spec';
import { encodingField, facetLayoutTopology, continuousColorSpectrum } from './channel-kind';

/** @private */
function isDiscrete(type?: string): boolean {
    return type === 'nominal' || type === 'ordinal';
}

/**
 * CanvasXpress's default qualitative palette (the engine's base theme `colors`).
 * Faceted lines set colours explicitly (see buildLineFacet), so reusing this exact
 * sequence keeps a given category the SAME hue it gets in the non-faceted slope.
 * @private
 */
const CX_QUALITATIVE = [
    '#0ab0db', '#fe6969', '#fed385', '#47db0a', '#9e0adb', '#ff7d00', '#ffa2c0', '#a0d7e7',
    '#63b5e5', '#f9a7a7', '#fef0c7', '#83e16f', '#c763e5', '#ffb347', '#ffc1d3', '#bfe2ed',
];

/**
 * Line charts put the ordered/temporal field on x and the measure on y.
 * Falls back to treating x as the category axis when neither is clearly discrete.
 * @private
 */
function detectAxes(
    channelSemantics: Record<string, any>,
): { categoryAxis: 'x' | 'y'; valueAxis: 'x' | 'y' } {
    if (!isDiscrete(channelSemantics.x?.type)
        && channelSemantics.x?.type === 'quantitative'
        && isDiscrete(channelSemantics.y?.type)) {
        return { categoryAxis: 'y', valueAxis: 'x' };
    }
    return { categoryAxis: 'x', valueAxis: 'y' };
}

const toNum = (raw: unknown): number | null => {
    const n = raw == null || raw === '' ? null : Number(raw);
    return Number.isNaN(n as number) ? null : n;
};

/**
 * A CONTINUOUS colour channel (color is quantitative) has no discrete series to
 * pivot into `vars` (doing so makes one bogus flat line per distinct value). Keep
 * a single line and colour each POINT by the continuous value via `colorBy`, shown
 * as filled circles at every sample — the gradient-dotted line Vega-Lite draws.
 * @private
 */
function buildLineContinuousColor(
    table: any[],
    categoryField: string,
    valueField: string,
    colorField: string,
    isHorizontal: boolean,
): { data: any; config: Record<string, any> } {
    const smps = table.map((row) => String(row[categoryField]));
    const values = table.map((row) => toNum(row[valueField]));
    const colors = table.map((row) => toNum(row[colorField]));
    return {
        data: { y: { vars: [valueField], smps, data: [values] }, x: { [colorField]: colors } },
        config: {
            graphType: 'Line',
            graphOrientation: isHorizontal ? 'horizontal' : 'vertical',
            colorBy: colorField,
            smpTitle: categoryField,
            xAxisTitle: valueField,
            showLegend: true,
            showVariableLegend: false,
            // Circles at each point, coloured by the continuous value (like Vega-Lite).
            lineDecoration: 'dot',
            dataPointSize: 20,
            ...continuousColorSpectrum(colors),
        },
    };
}

/**
 * Faceted line (small multiples): one panel per value of the column/row facet
 * field. Each line is a VARIABLE (a `vars` row) and the panels are split with
 * `segregateVariablesBy` — the native shape of CanvasXpress's own faceted-line
 * examples (e.g. timeseries7). The category axis stays the shared `smps` (the two
 * periods, clean labels, NO duplicates — duplicate `smps` under sample
 * segregation hang the engine), and each line's facet/colour values ride as
 * per-variable `z` annotations.
 *
 *   - no colour series → one line per facet value (one line per panel);
 *   - a colour series  → one line per (colour × facet) pair, split into panels by
 *     the facet annotation and tinted by the colour annotation (`colorBy`), so the
 *     legend reads the colour field and same-colour lines share a hue.
 * @private
 */
function buildLineFacet(
    table: any[],
    categoryField: string,
    valueField: string,
    facetField: string,
    colorField: string | undefined,
    isColumn: boolean,
    facetColumns: number | undefined,
): { data: any; config: Record<string, any> } {
    // Shared, unique category axis (the two periods) — identical across panels.
    const smps = distinctValues(table, categoryField);
    const smpIndex = new Map(smps.map((s, i) => [s, i]));

    // One `vars` row per line: a (colour, facet) pair, or just the facet value.
    const lineKey = (row: any) =>
        colorField ? String(row[colorField]) + '\u0001' + String(row[facetField]) : String(row[facetField]);
    const vars: string[] = [];
    const varIndex = new Map<string, number>();
    const facetAnno: string[] = [];
    const colorAnno: string[] = [];
    for (const row of table) {
        const key = lineKey(row);
        if (varIndex.has(key)) continue;
        varIndex.set(key, vars.length);
        // A unique display id per line; the colour legend comes from `colorBy`,
        // not these ids, so a composite id for a repeated colour is fine.
        vars.push(colorField
            ? String(row[colorField]) + ' (' + String(row[facetField]) + ')'
            : String(row[facetField]));
        facetAnno.push(String(row[facetField]));
        if (colorField) colorAnno.push(String(row[colorField]));
    }

    const matrix: (number | null)[][] = vars.map(() => smps.map(() => null));
    for (const row of table) {
        const ri = varIndex.get(lineKey(row));
        const ci = smpIndex.get(String(row[categoryField]));
        if (ri != null && ci != null) matrix[ri][ci] = toNum(row[valueField]);
    }

    const nGroups = new Set(facetAnno).size;
    const z: Record<string, string[]> = { [facetField]: facetAnno };
    if (colorField) z[colorField] = colorAnno;

    // A colour series is bound with `colorBy` on the per-variable annotation: the
    // engine groups the lines by that value, so the legend carries ONE entry per
    // colour (4 products) rather than one per line (4 products x 2 facets = 8), and
    // the hue stays consistent across panels. A bare facet has no colour series, so
    // every line is painted the same flat hue.
    // (This previously hand-painted a per-var `colors` array because `colorBy` on a
    // variable annotation transposed the Line axes — the value landed on x and the
    // category on y. That was a CanvasXpress defect in isLongAndSkinny(), which
    // re-pointed a Line at a Scatter2D whose axes were two of the samples; fixed, so
    // the workaround and its 8-entry legend are no longer needed.)
    const colors: string[] | undefined = colorField ? undefined : vars.map(() => CX_QUALITATIVE[0]);

    const config: Record<string, any> = {
        graphType: 'Line',
        graphOrientation: 'vertical',
        segregateVariablesBy: [facetField],
        layoutTopology: facetLayoutTopology(nGroups, isColumn, facetColumns),
        layoutAdjust: false,
        stripTextColor: 'rgb(0,0,0)',
        stripBackgroundColor: 'rgb(255,255,255)',
        smpTitle: categoryField,
        xAxisTitle: valueField,
        ...(colorField ? { colorBy: colorField } : { colors }),
        // A colour series surfaces the per-line legend; a single line per panel has none.
        showLegend: !!colorField,
        showVariableLegend: !!colorField,
        lineDecoration: false,
        lineThickness: 2.5,
        connectNullData: true,
    };

    return { data: { y: { vars, smps, data: matrix }, z }, config };
}

/**
 * Shared Line instantiate. `extraConfig` lets a variant strip
 * the axis/legend chrome without duplicating the matrix-building logic.
 * @private
 */
function buildLineInstantiate(extraConfig?: Record<string, unknown>) {
    return (spec: any, ctx: any) => {
        const { channelSemantics, table, encodings, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const categoryField = channelSemantics[categoryAxis]?.field;
        const valueField = channelSemantics[valueAxis]?.field;
        if (!categoryField || !valueField) return;

        const colorField = channelSemantics.color?.field;
        const encs = (encodings as any) || {};
        // Duplicate (series, category) cells: additive measures sum, intensive average.
        const valueReduce = resolveMatrixReduce(channelSemantics[valueAxis], encs[valueAxis]);
        const isHorizontalAxis = categoryAxis === 'y';

        // Faceting (small multiples): a column/row channel splits the line into one
        // panel per value — a different data shape than the pivoted y-matrix. A bound
        // colour series pivots into one line per colour WITHIN each panel (row-aligned
        // matrix, see buildLineFacet).
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;
        if (facetField) {
            const facet = buildLineFacet(
                table, categoryField, valueField, facetField, colorField,
                /* isColumn */ !!colFacet, (chartProperties as any)?.facetColumns,
            );
            spec.graphType = 'Line';
            spec.data = facet.data;
            spec.config = { ...spec.config, ...facet.config, ...(extraConfig || {}) };
            return;
        }

        // Category-axis scale config (shared by the normal and continuous-colour paths).
        // A temporal (Date) axis gets a proportional time scale + Vega-style nice-date
        // labels; a quantitative (Q×Q) axis gets the numeric value scale with round
        // ticks; a categorical axis keeps even slots. smpTextRotate 90 lays the labels
        // flat like the SVG backends.
        // A proportional scale needs at least three points to say anything: with only
        // two it spreads "nice round ticks" across the gap and labels positions that
        // hold no data — a slopegraph's 2018 → 2023 grew six year ticks, and its two
        // ISO dates fourteen month ticks. Positioning is unaffected (two points sit at
        // the endpoints either way), so only those phantom labels are lost.
        const isTemporalCategory = channelSemantics[categoryAxis]?.type === 'temporal';
        const isQuantitativeCategory = channelSemantics[categoryAxis]?.type === 'quantitative';
        const useProportionalScale = distinctValues(table, categoryField).length > 2;
        const scaleConfig = useProportionalScale && isTemporalCategory
            ? { smpTimeScale: true, smpLabelTimeAuto: true, smpTextRotate: 90 }
            : useProportionalScale && isQuantitativeCategory
                ? { smpValueScale: true, smpTextRotate: 90 }
                : {};

        // A CONTINUOUS colour channel has no discrete series: render one line with
        // gradient-coloured circles (colorBy), not one flat line per distinct value.
        if (colorField && channelSemantics.color?.type === 'quantitative') {
            const cont = buildLineContinuousColor(
                table, categoryField, valueField, colorField, isHorizontalAxis,
            );
            spec.graphType = 'Line';
            spec.data = cont.data;
            spec.config = {
                ...spec.config, ...cont.config, lineThickness: 2.5, connectNullData: true,
                ...scaleConfig, ...(extraConfig || {}),
            };
            return;
        }

        // A `detail` channel groups the rows into one line per detail value WITHOUT a
        // colour legend (Vega-Lite's detail): pivot it into `vars` exactly like a
        // colour series, then paint every line the same colour and hide the legend.
        const detailField = channelSemantics.detail?.field ?? encodingField(encs.detail);
        if (detailField && !colorField) {
            spec.graphType = 'Line';
            spec.data = buildYMatrix(table, categoryField, valueField, detailField, valueReduce);
            const lineCount = (spec.data as any).y.vars.length;
            spec.config = {
                ...spec.config,
                graphType: 'Line',
                graphOrientation: isHorizontalAxis ? 'horizontal' : 'vertical',
                smpTitle: categoryField,
                xAxisTitle: valueField,
                showLegend: false,
                showVariableLegend: false,
                // One colour for every detail line (Vega-Lite draws them all the same).
                colors: new Array(Math.max(1, lineCount)).fill(CX_QUALITATIVE[0]),
                lineDecoration: false,
                lineThickness: 2.5,
                connectNullData: true,
                ...scaleConfig,
                ...(extraConfig || {}),
            };
            return;
        }

        spec.graphType = 'Line';
        spec.data = buildYMatrix(table, categoryField, valueField, colorField, valueReduce);

        // strokeDash channel → a PER-POINT dash (solid actual / dashed forecast). Bound as a
        // sample annotation (data.x) + patternBy, so the engine dashes each line SEGMENT by
        // that point's value (the per-sample line-dash path), using a solid/dashed palette.
        // Pairs with a colour series (3-product forecast): colour per line, dash per segment.
        const dashField = channelSemantics.strokeDash?.field ?? encodingField(encs.strokeDash);
        let dashConfig: Record<string, unknown> = {};
        if (dashField) {
            const smps: any[] = (spec.data as any)?.y?.smps || [];
            const dashByCategory = new Map<string, any>();
            for (const row of table) {
                const key = String(row[categoryField]);
                if (!dashByCategory.has(key)) dashByCategory.set(key, row[dashField]);
            }
            (spec.data as any).x = {
                ...((spec.data as any).x || {}),
                [dashField]: smps.map((s) => dashByCategory.get(String(s))),
            };
            dashConfig = { patternBy: dashField, linePatterns: ['solid', 'dashed'] };
        }

        const isHorizontal = categoryAxis === 'y';
        spec.config = {
            ...spec.config,
            graphType: 'Line',
            graphOrientation: isHorizontal ? 'horizontal' : 'vertical',
            // See bar.ts: CanvasXpress 1D titling — smpTitle = category axis,
            // xAxisTitle = value axis (both orientation-independent); yAxisTitle
            // is not a real key.
            smpTitle: categoryField,
            xAxisTitle: valueField,
            showLegend: !!colorField || !!dashField,
            // Clean, bold lines. CanvasXpress's config DEFAULT lineDecoration is
            // 'symbol', so a line draws a point marker at every sample unless we
            // disable it — set it false for no markers. lineThickness 2.5 gives the
            // bold stroke (the engine default of 1 reads too thin here).
            lineDecoration: false,
            lineThickness: 2.5,
            // Connect across missing values (interpolate) like the SVG backends,
            // rather than breaking the line at each gap.
            connectNullData: true,
            // Temporal axis → proportional time scale + nice date labels; quantitative
            // axis → numeric value scale with round ticks (see scaleConfig above).
            ...scaleConfig,
            ...dashConfig,
            ...(extraConfig || {}),
        };
    };
}

const lineLayoutMode = (channelSemantics: Record<string, any>) => {
    const bandOnX = isDiscrete(channelSemantics.x?.type);
    return { axisFlags: bandOnX ? { x: { banded: true } } : {} };
};

function lineSeed() {
    return { graphType: 'Line', data: { y: { vars: [], smps: [], data: [] } }, config: {} };
}

export const cxLineChartDef: ChartTemplateDef = {
    chart: 'Line Chart',
    template: lineSeed(),
    channels: ['x', 'y', 'color', 'column', 'row', 'strokeDash', 'detail'],
    markCognitiveChannel: 'position',
    declareLayoutMode: lineLayoutMode,
    instantiate: buildLineInstantiate(),
};

/** Ranking lines over an ordered axis — same engine path, ranked test data. */
export const cxBumpChartDef: ChartTemplateDef = {
    chart: 'Bump Chart',
    template: lineSeed(),
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: lineLayoutMode,
    instantiate: buildLineInstantiate(),
};

/** Two-point before/after lines — same engine path, two-sample test data. */
export const cxSlopeChartDef: ChartTemplateDef = {
    chart: 'Slope Chart',
    template: lineSeed(),
    channels: ['x', 'y', 'color', 'column', 'row', 'detail'],
    markCognitiveChannel: 'position',
    declareLayoutMode: lineLayoutMode,
    instantiate: buildLineInstantiate(),
};
