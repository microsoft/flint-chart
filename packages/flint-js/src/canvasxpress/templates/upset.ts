// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress UpSet template — CanvasXpress-exclusive set-intersection view.
 *
 * UpSet visualises the sizes of all intersections of many sets (where a Venn
 * diagram becomes unreadable past 3-4 sets). CanvasXpress drives it from a
 * Heatmap with a BINARY MEMBERSHIP MATRIX and two switches:
 *   data.y.vars = [item…]          rows = the elements
 *   data.y.smps = [set…]           columns = the sets
 *   data.y.data = [[0|1 …] …]      1 = item belongs to that set
 *   config.graphType   = 'Heatmap'
 *   config.heatmapType = 'upset'
 *   config.xAxis       = [set…]    the sets, in display order
 *
 * The engine derives the intersection bars + the connected-dot matrix itself —
 * no pre-aggregation needed.
 *
 * Encodings (tidy/long form, one row per membership cell): `y` = item,
 * `x` = set, `value` (or `color`) = 0/1 membership.
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

export const cxUpSetDef: ChartTemplateDef = {
    chart: 'UpSet Plot',
    template: { graphType: 'Heatmap', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'value', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table } = ctx;
        const itemField = channelSemantics.y?.field;
        const setField = channelSemantics.x?.field;
        const memberField = channelSemantics.value?.field ?? channelSemantics.color?.field;
        if (!itemField || !setField || !memberField) return;

        const items = distinct(table, itemField);
        const sets = distinct(table, setField);
        const cell = new Map<string, number>();
        for (const r of table) {
            const raw = r[memberField];
            const n = raw === true || raw === 1 || raw === '1' || Number(raw) > 0 ? 1 : 0;
            cell.set(String(r[itemField]) + '\u0000' + String(r[setField]), n);
        }
        const data = items.map((it) => sets.map((s) => cell.get(it + '\u0000' + s) ?? 0));

        spec.graphType = 'Heatmap';
        spec.data = { y: { vars: items, smps: sets, data } };
        spec.config = {
            ...spec.config,
            graphType: 'Heatmap',
            heatmapType: 'upset',
            xAxis: sets,
        };
    },
};
