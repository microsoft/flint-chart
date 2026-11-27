// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress hierarchical Tree template (graphType 'Tree'). CanvasXpress-
 * exclusive: a collapsible node-link tree (dendrogram), modelled on the
 * CanvasXpress "Collapsible Tree" gallery example (tree-1/tree-3).
 *
 * The leaves are the `smps`; the grouping columns become the `hierarchy`
 * (outermost → innermost), each riding as a per-leaf `x` annotation. `xAxis`
 * points at an `Order` row (the leaf sequence) that fixes the leaf order. This
 * draws a real branching tree — NOT a packed-circle layout (that is the Bubble
 * chart); the first `hierarchy` level drives the colour.
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

export const cxTreeDef: ChartTemplateDef = {
    chart: 'Tree',
    template: { graphType: 'Tree', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        if (!table.length) return;
        const encs = (encodings as any) || {};
        const leafField = channelSemantics.x?.field ?? encodingField(encs.x);
        const colorField = channelSemantics.color?.field ?? encodingField(encs.color);
        if (!leafField) return;

        // The grouping levels are the table's other string columns, outermost first;
        // the leaf itself is NOT a hierarchy level — it is the terminal node (smps).
        const groupLevels = Object.keys(table[0]).filter(
            (k) => k !== leafField && typeof table[0][k] === 'string',
        );
        if (!groupLevels.length) return;

        const smps = table.map((r: any) => String(r[leafField]));
        // Order fixes the leaf sequence down the tree (the gallery example's xAxis).
        const order = table.map((_: any, i: number) => i + 1);
        const x: Record<string, (string | number)[]> = {};
        for (const level of groupLevels) x[level] = table.map((r: any) => String(r[level]));

        spec.graphType = 'Tree';
        spec.data = { y: { vars: ['Order'], smps, data: [order] }, x };
        spec.config = {
            ...spec.config,
            graphType: 'Tree',
            graphOrientation: 'horizontal',
            hierarchy: groupLevels,
            xAxis: ['Order'],
            treeLabelAlign: 'left',
            showTransition: true,
            colorBy: colorField || groupLevels[0],
            showLegend: true,
        };
    },
};
