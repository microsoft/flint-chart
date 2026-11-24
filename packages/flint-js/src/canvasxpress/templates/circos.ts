// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Circos template (graphType 'Circular'). CanvasXpress-exclusive: a
 * circular layout with grouped segments, concentric data tracks and centre
 * connection ribbons — modelled on the CanvasXpress "Circle Plot" gallery example.
 *
 * Each row is a sample placed around the ring; a `color`/group channel splits the
 * ring into segments (`segregateSamplesBy`), and every NUMERIC column becomes a
 * concentric data track (`data.y.vars`, one ring each). A handful of cross-segment
 * connection ribbons (`circularConnections` = `[color, sampleA, sampleB]`) are
 * synthesised deterministically so the plot reads as a relationship diagram.
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

const RIBBON_COLORS = [
    'rgba(31,119,180,0.45)', 'rgba(214,39,40,0.45)', 'rgba(44,160,44,0.45)',
    'rgba(148,103,189,0.45)', 'rgba(255,127,14,0.45)', 'rgba(23,190,207,0.45)',
];

export const cxCircosDef: ChartTemplateDef = {
    chart: 'Circos Plot',
    template: { graphType: 'Circular', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        if (!table.length) return;
        const encs = (encodings as any) || {};
        const sampleField = channelSemantics.x?.field ?? encodingField(encs.x);
        const groupField = channelSemantics.color?.field ?? encodingField(encs.color);
        if (!sampleField) return;

        // Every numeric column is a concentric data track; the group is a per-sample
        // segment annotation.
        const trackFields = Object.keys(table[0]).filter(
            (k) => k !== sampleField && k !== groupField && typeof table[0][k] === 'number',
        );
        if (!trackFields.length) return;

        const smps = table.map((r: any) => String(r[sampleField]));
        const data = trackFields.map((t) => table.map((r: any) => toNum(r[t])));
        const x: Record<string, string[]> = {};
        if (groupField) x[groupField] = table.map((r: any) => String(r[groupField]));

        // Deterministic cross-segment ribbons: link samples a fixed stride apart.
        const connections: Array<[string, string, string]> = [];
        if (smps.length > 3) {
            const n = Math.min(6, Math.floor(smps.length / 4));
            const stride = Math.max(1, Math.floor(smps.length / (n + 1)));
            for (let i = 0; i < n; i++) {
                const a = smps[(i * stride) % smps.length];
                const b = smps[(i * stride + Math.floor(smps.length / 2) + i) % smps.length];
                if (a !== b) connections.push([RIBBON_COLORS[i % RIBBON_COLORS.length], a, b]);
            }
        }

        spec.graphType = 'Circular';
        spec.data = groupField
            ? { y: { vars: trackFields, smps, data }, x }
            : { y: { vars: trackFields, smps, data } };
        spec.config = {
            ...spec.config,
            graphType: 'Circular',
            circularTrackGraphType: trackFields.map(() => 'bar'),
            ...(groupField ? { segregateSamplesBy: [groupField], colorBy: groupField } : {}),
            ...(connections.length ? { circularConnections: connections, showCircularConnections: true } : {}),
            showLegend: true,
        };
    },
};
