// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress SPLOM template (graphType 'SPLOM'). CanvasXpress-exclusive.
 *
 * A scatter-plot matrix: every pair of numeric variables as a panel in a grid.
 * CanvasXpress plots the SAMPLES (columns), so — like Correlation — the variables
 * must be the COLUMNS: `vars`=observations (rows), `smps`=variables. The variables
 * come from the `var0…varN` domain channels (falling back to numeric columns).
 */

import { ChartTemplateDef } from '../../core/types';

/** Resolve a channel's field name from the raw encoding (string or { field }). */
function encodingField(encoding: unknown): string | undefined {
    if (typeof encoding === 'string') return encoding;
    if (encoding && typeof encoding === 'object' && 'field' in (encoding as any)) {
        return (encoding as any).field;
    }
    return undefined;
}

export const cxSplomDef: ChartTemplateDef = {
    chart: 'SPLOM',
    template: { graphType: 'SPLOM', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['var0', 'var1', 'var2', 'var3', 'var4', 'var5', 'var6', 'var7', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings, chartProperties } = ctx;
        if (!table.length) return;

        const colorField = channelSemantics.color?.field ?? encodingField((encodings as any)?.color);

        let variables = Object.keys(encodings || {})
            .filter((k) => /^var\d+$/.test(k))
            .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
            .map((k) => encodingField((encodings as any)[k]))
            .filter((f): f is string => !!f);
        if (variables.length === 0) {
            variables = Object.keys(table[0]).filter(
                (k) => k !== colorField && typeof table[0][k] === 'number',
            );
        }
        if (variables.length < 2) return;

        const observations = table.map((_: any, i: number) => 'obs' + (i + 1));
        const data = table.map((r: any) => variables.map((v) => {
            const n = r[v] == null || r[v] === '' ? null : Number(r[v]);
            return Number.isNaN(n as number) ? null : n;
        }));

        // The group is a per-observation (variable) annotation; with it the matrix
        // uses the "complete layout" (scatter + density diagonal + per-group
        // correlation + boxplots), matching the splom-7 example.
        const y = { vars: observations, smps: variables, data };
        const z = colorField ? { [colorField]: table.map((r: any) => String(r[colorField])) } : undefined;

        // A SPLOM is a Scatter2D in scatter-plot-matrix mode, NOT graphType
        // 'SPLOM': the engine's 'SPLOM' case rewrites graphType to 'Scatter2D'
        // and forces scatterPlotMatrix = true, which throws away the grouping
        // variable and so collapses the per-group correlation/density matrix to
        // a plain all-vs-all grid. Emitting 'Scatter2D' directly (as the splom-6
        // gallery example does) keeps scatterPlotMatrix naming the group.
        spec.graphType = 'Scatter2D';
        spec.data = z ? { y, z } : { y };
        spec.config = {
            ...spec.config,
            graphType: 'Scatter2D',
            // xAxis lists the variables (the smps) to cross into panels; without
            // it the matrix has no axes.
            xAxis: variables,
            // Name the grouping variable when coloured so the panels show the
            // per-group correlations/densities; a bare matrix otherwise.
            scatterPlotMatrix: colorField || true,
            scatterPlotMatrixType: (chartProperties as any)?.splomType || 'correlationDensity',
            broadcast: true,
            layoutAdjust: true,
            showLegend: !!colorField,
            ...(colorField ? {
                colorBy: colorField,
                // Bottom legend keeps the square matrix horizontally centred (a
                // right-side legend offsets it — see bubble.ts / tree.ts).
                legendPosition: 'bottom',
                showLegendTitle: false,
            } : {}),
        };
    },
};
