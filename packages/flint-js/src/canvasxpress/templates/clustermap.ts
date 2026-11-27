// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Clustered Heatmap template — CanvasXpress's flagship scientific
 * view: a heatmap with hierarchical dendrograms on both axes that reorder rows
 * and columns so co-expressed features and similar samples cluster together.
 *
 * Same native matrix as Heatmap (x→columns, y→rows, color→cell), with the
 * clustering flags turned on. The dendrogram reordering is the whole point and
 * is not something the generic grammar or the other backends offer.
 */

import { ChartTemplateDef } from '../../core/types';

/** @private */
function distinct(table: any[], field: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of table) {
        const key = String(row[field]);
        if (!seen.has(key)) { seen.add(key); out.push(key); }
    }
    return out;
}

export const cxClusteredHeatmapDef: ChartTemplateDef = {
    chart: 'Clustered Heatmap',
    template: { graphType: 'Heatmap', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'color',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table } = ctx;
        const colField = channelSemantics.x?.field;
        const rowField = channelSemantics.y?.field;
        const valueField = channelSemantics.color?.field;
        if (!colField || !rowField || !valueField) return;

        // CanvasXpress Heatmap draws y.vars on the X-axis and y.smps on the Y-axis,
        // so the x field becomes vars and the y field becomes smps (transposed from
        // naive rows=y/cols=x) to match the Vega-Lite orientation.
        const xCats = distinct(table, colField);
        const yCats = distinct(table, rowField);
        const cell = new Map<string, number | null>();
        for (const r of table) {
            const raw = r[valueField];
            const n = raw == null || raw === '' ? null : Number(raw);
            cell.set(String(r[rowField]) + '\u0000' + String(r[colField]),
                Number.isNaN(n as number) ? null : n);
        }
        // y.data is [var][smp] = [xCat][yCat].
        const data = xCats.map((xv) => yCats.map((yv) => cell.get(yv + '\u0000' + xv) ?? null));

        spec.graphType = 'Heatmap';
        spec.data = { y: { vars: xCats, smps: yCats, data } };
        spec.config = {
            ...spec.config,
            graphType: 'Heatmap',
            // Hierarchical clustering + dendrograms on both axes — the flagship bit.
            samplesClustered: true,
            variablesClustered: true,
            showSmpDendrogram: true,
            showVarDendrogram: true,
            showLegend: true,
        };
    },
};
