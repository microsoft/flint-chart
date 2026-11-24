// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Chord template (graphType 'Chord'). CanvasXpress-exclusive.
 *
 * Entities sit around a circle; ribbons connect pairs with width proportional to
 * the flow. Built from directed `source → target → value` rows folded into the
 * square relationship matrix the engine draws:
 *   data.y.vars = data.y.smps = [entity…]
 *   data.y.data[i][j] = flow from entity i to entity j
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

export const cxChordDef: ChartTemplateDef = {
    chart: 'Chord Diagram',
    template: { graphType: 'Chord', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['source', 'target', 'size'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const sourceField = channelSemantics.source?.field ?? encodingField((encodings as any)?.source);
        const targetField = channelSemantics.target?.field ?? encodingField((encodings as any)?.target);
        const valueField = channelSemantics.size?.field ?? encodingField((encodings as any)?.size);
        if (!sourceField || !targetField) return;

        // Entity list in first-seen order.
        const entities: string[] = [];
        const index = new Map<string, number>();
        const see = (e: string) => { if (!index.has(e)) { index.set(e, entities.length); entities.push(e); } };
        for (const r of table) { see(String(r[sourceField])); see(String(r[targetField])); }

        const matrix = entities.map(() => entities.map(() => 0));
        for (const r of table) {
            const i = index.get(String(r[sourceField]))!;
            const j = index.get(String(r[targetField]))!;
            const v = valueField != null ? Number(r[valueField]) : 1;
            matrix[i][j] += Number.isNaN(v) ? 0 : v;
        }

        spec.graphType = 'Chord';
        spec.data = { y: { vars: entities, smps: entities, data: matrix } };
        spec.config = {
            ...spec.config,
            graphType: 'Chord',
            showLegend: true,
        };
    },
};
