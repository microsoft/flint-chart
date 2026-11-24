// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Packed-Bubble template (graphType 'Circular', circularType 'bubble').
 * CanvasXpress-exclusive: a packed-circle chart where each item is a circle sized
 * by its value and coloured by a category, laid out by the engine's circle packer.
 *
 * One `vars` row (the measured value) across one `smps` column per item; the
 * category rides as a per-sample `x` annotation picked up by `colorBy`.
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

export const cxBubbleDef: ChartTemplateDef = {
    chart: 'Bubble Chart',
    template: { graphType: 'Circular', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'size', 'color', 'group'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const encs = (encodings as any) || {};
        const itemField = channelSemantics.x?.field ?? encodingField(encs.x);
        const valueField = channelSemantics.size?.field ?? encodingField(encs.size);
        const colorField = channelSemantics.color?.field ?? encodingField(encs.color);
        // A `group` channel clusters the circles into one packed group per value
        // (CanvasXpress's `hierarchy`), instead of one flat packed mass.
        const groupField = channelSemantics.group?.field ?? encodingField(encs.group);
        if (!itemField || !valueField) return;

        const smps = table.map((r: any) => String(r[itemField]));
        const data = [table.map((r: any) => toNum(r[valueField]))];
        const annotations = [colorField, groupField].filter(
            (f, i, a): f is string => !!f && a.indexOf(f) === i,
        );
        const x: Record<string, string[]> = {};
        for (const f of annotations) x[f] = table.map((r: any) => String(r[f]));

        spec.graphType = 'Circular';
        spec.data = annotations.length
            ? { y: { vars: [valueField], smps, data }, x }
            : { y: { vars: [valueField], smps, data } };
        spec.config = {
            ...spec.config,
            graphType: 'Circular',
            circularType: 'bubble',
            showLegend: !!colorField,
            ...(colorField ? { colorBy: colorField } : {}),
            ...(groupField ? { hierarchy: [groupField] } : {}),
            // Bottom legend keeps the packed circle horizontally centred (a right-side
            // legend offsets it on a near-square panel — see tree.ts).
            ...(colorField ? { legendPosition: 'bottom' } : {}),
        };
    },
};
