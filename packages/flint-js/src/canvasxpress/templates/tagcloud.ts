// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Tag Cloud template (graphType 'TagCloud'). CanvasXpress-exclusive:
 * words laid out with each word sized by its weight.
 *
 * One `vars` row (the weight) across one `smps` column per word; the engine sizes
 * and packs the word labels from those weights.
 */

import { ChartTemplateDef } from '../../core/types';

/** @private */
function encodingField(encoding: unknown): string | undefined {
    if (typeof encoding === 'string') return encoding;
    if (encoding && typeof encoding === 'object' && 'field' in (encoding as any)) {
        return (encoding as any).field;
    }
    return undefined;
}

const toNum = (raw: any): number | null => {
    const n = raw == null || raw === '' ? null : Number(raw);
    return Number.isNaN(n as number) ? null : n;
};

export const cxTagCloudDef: ChartTemplateDef = {
    chart: 'Tag Cloud',
    template: { graphType: 'TagCloud', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'size'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const encs = (encodings as any) || {};
        const wordField = channelSemantics.x?.field ?? encodingField(encs.x);
        const weightField = channelSemantics.size?.field ?? encodingField(encs.size);
        if (!wordField || !weightField) return;

        const smps = table.map((r: any) => String(r[wordField]));
        const data = [table.map((r: any) => toNum(r[weightField]))];

        spec.graphType = 'TagCloud';
        spec.data = { y: { vars: [weightField], smps, data } };
        spec.config = { ...spec.config, graphType: 'TagCloud', showLegend: false };
    },
};
