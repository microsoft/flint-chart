// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Venn template (graphType 'Venn'). CanvasXpress-exclusive.
 *
 * CanvasXpress Venn uses its own data form — NOT a y-matrix:
 *   data.venn = { data: { A, B, AB, ABC, … }, legend: { A: 'Set A', … } }
 * where each key is a region (single letter = a base set, multiple = an
 * intersection) and the value is the size of that exact region.
 *
 * Encodings: `detail` = region, `size` = count, `color` = set label (on the
 * single-letter base-set rows).
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

export const cxVennDef: ChartTemplateDef = {
    chart: 'Venn Diagram',
    template: { graphType: 'Venn', data: {}, config: {} },
    channels: ['detail', 'size', 'color'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const regionField = channelSemantics.detail?.field ?? encodingField((encodings as any)?.detail);
        const countField = channelSemantics.size?.field ?? encodingField((encodings as any)?.size);
        const labelField = channelSemantics.color?.field ?? encodingField((encodings as any)?.color);
        if (!regionField || !countField) return;

        const data: Record<string, number> = {};
        const legend: Record<string, string> = {};
        for (const row of table) {
            const region = String(row[regionField]);
            const count = Number(row[countField]);
            if (!region) continue;
            data[region] = Number.isNaN(count) ? 0 : count;
            // A single-letter region is a base set; its row carries the set label.
            if (region.length === 1 && labelField && row[labelField]) {
                legend[region] = String(row[labelField]);
            }
        }
        const baseSets = Object.keys(data).filter((k) => k.length === 1).length;

        spec.graphType = 'Venn';
        spec.data = { venn: { data, ...(Object.keys(legend).length ? { legend } : {}) } };
        spec.config = {
            ...spec.config,
            graphType: 'Venn',
            vennGroups: baseSets,
            showLegend: true,
        };
    },
};
