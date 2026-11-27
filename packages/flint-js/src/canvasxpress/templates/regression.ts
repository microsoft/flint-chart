// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Regression template.
 *
 * A Scatter2D (vars = point ids, smps = [x, y]) with a fitted curve. The fit is
 * NOT always linear:
 *   - the default (and any colour-grouped) fit is CanvasXpress's own least-squares
 *     line via `showRegressionFit` (`true` → one global line + equation + band;
 *     an annotation name → one line PER colour group);
 *   - a non-linear method (log / quadratic / polynomial / exponential / power,
 *     from `chartProperties.regressionMethod`) is drawn with a `decorations`
 *     fit layer, since `showRegressionFit` only ever fits a straight line.
 * A column/row facet puts each subset in its own panel; a `size` channel scales
 * the points.
 */

import { ChartTemplateDef } from '../../core/types';
import { encodingField, facetLayoutTopology } from './channel-kind';

/**
 * Map a flint `regressionMethod` to the CanvasXpress `decorations` fit key (and,
 * for polynomials, the degree). `linear` / undefined return null — the linear path
 * uses `showRegressionFit`, which also carries the equation and confidence band.
 * @private
 */
function resolveFitMethod(method: string | undefined, polyOrder: number | undefined):
    { key: string; order?: number } | null {
    switch (method) {
        case 'log': return { key: 'logarithmic' };
        case 'exp': return { key: 'exponential' };
        case 'pow': return { key: 'power' };
        case 'quad': return { key: 'polynomial', order: 2 };
        case 'poly': return { key: 'polynomial', order: polyOrder || 2 };
        default: return null; // linear / unknown → showRegressionFit
    }
}

const toNum = (raw: any): number | null => {
    const n = raw == null || raw === '' ? null : Number(raw);
    return Number.isNaN(n as number) ? null : n;
};

export const cxRegressionDef: ChartTemplateDef = {
    chart: 'Regression',
    template: { graphType: 'Scatter2D', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color', 'column', 'row', 'size'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, chartProperties, encodings } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;
        const encs = (encodings as any) || {};
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;

        // Points: [x, y] per observation, with colour/facet (string) and size (numeric)
        // carried as per-variable `z` annotations.
        const vars: string[] = [];
        const data: (number | null)[][] = [];
        const z: Record<string, (string | number | null)[]> = {};
        // Colour/facet are string annotations; the size field is numeric and handled
        // separately below. Exclude size here (and dedupe) so a field shared between
        // size and colour/facet is populated exactly once — as a number — rather than
        // appended twice (which doubled the annotation length and broke alignment).
        const strAnno = [colorField, facetField].filter(
            (f, i, a) => f && a.indexOf(f) === i && f !== sizeField,
        ) as string[];
        for (const f of strAnno) z[f] = [];
        if (sizeField) z[sizeField] = [];
        for (let i = 0; i < table.length; i++) {
            vars.push('p' + (i + 1));
            data.push([toNum(table[i][xField]), toNum(table[i][yField])]);
            for (const f of strAnno) z[f].push(String(table[i][f]));
            if (sizeField) z[sizeField].push(toNum(table[i][sizeField]));
        }

        const y = { vars, smps: [xField, yField], data };
        spec.graphType = 'Scatter2D';
        spec.data = Object.keys(z).length ? { y, z } : { y };

        const config: Record<string, any> = {
            ...spec.config,
            graphType: 'Scatter2D',
            xAxis: [xField],
            yAxis: [yField],
            xAxisTitle: xField,
            yAxisTitle: yField,
            showLegend: !!colorField,
            // Just the fit line(s) by default — not the shaded confidence band.
            showConfidenceIntervals: false,
        };
        if (colorField) config.colorBy = colorField;
        if (sizeField) config.sizeBy = sizeField;

        const fit = resolveFitMethod(
            (chartProperties as any)?.regressionMethod,
            (chartProperties as any)?.polyOrder,
        );
        if (fit) {
            // Non-linear fit: a decorations layer draws the curve (showRegressionFit is
            // linear-only). A red curve reads clearly over any point palette.
            config.decorations = { [fit.key]: [{ color: 'rgb(220,40,30)' }] };
            config.showDecorations = true;
            if (fit.order != null) config.regressionOrder = fit.order;
        } else {
            // Linear: one line per colour group (annotation name) or one global line
            // (true) — both carry the equation and confidence band.
            config.showRegressionFit = colorField || true;
        }

        // A column/row facet splits the fit into one panel per value.
        if (facetField) {
            const nGroups = new Set(table.map((row: any) => String(row[facetField]))).size;
            config.segregateVariablesBy = [facetField];
            config.layoutTopology = facetLayoutTopology(nGroups, !!colFacet, (chartProperties as any)?.facetColumns);
            config.layoutAdjust = false;
            config.stripTextColor = 'rgb(0,0,0)';
            config.stripBackgroundColor = 'rgb(255,255,255)';
        }

        spec.config = config;
    },
};
