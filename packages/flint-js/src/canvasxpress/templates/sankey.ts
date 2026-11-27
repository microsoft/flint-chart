// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Sankey template (graphType 'Sankey'). CanvasXpress-exclusive.
 *
 * A multi-stage alluvial flow. Each row is one combination of category values
 * across the ordered stages, with a flow weight. CanvasXpress reads the weight as
 * the single variable, the combinations as samples, the per-stage category values
 * as sample annotations in `data.x`, and the stage order from `sankeyAxes`:
 *   data.y.vars = [weightField]
 *   data.y.smps = [row id…]
 *   data.y.data = [[weight…]]
 *   data.x[stage] = [value per row]
 *   config.sankeyAxes = [stage…], xAxis = [weightField]
 *
 * Encodings: `stage0…stageN` (ordered flow axes), `size` = weight, `color` = the
 * grouping that tints the ribbons.
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

export const cxSankeyDef: ChartTemplateDef = {
    chart: 'Sankey Diagram',
    template: { graphType: 'Sankey', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'size', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { table, encodings } = ctx;
        if (!table.length) return;

        const stages = Object.keys(encodings || {})
            .filter((k) => /^stage\d+$/.test(k))
            .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
            .map((k) => encodingField((encodings as any)[k]))
            .filter((f): f is string => !!f);
        const weightField = encodingField((encodings as any)?.size);
        const colorField = encodingField((encodings as any)?.color);
        if (stages.length < 2 || !weightField) return;

        const smps = table.map((_: any, i: number) => 'flow' + (i + 1));
        const weights = table.map((r: any) => {
            const n = Number(r[weightField]);
            return Number.isNaN(n) ? 0 : n;
        });
        const x: Record<string, unknown[]> = {};
        for (const stage of stages) x[stage] = table.map((r: any) => r[stage]);
        // The colour grouping may reference a field that is NOT one of the stages;
        // carry it as a per-sample annotation too, otherwise config.colorBy names a
        // field absent from the data and the ribbon colour legend can't resolve.
        if (colorField && !x[colorField]) x[colorField] = table.map((r: any) => r[colorField]);

        spec.graphType = 'Sankey';
        spec.data = { y: { vars: [weightField], smps, data: [weights] }, x };
        spec.config = {
            ...spec.config,
            graphType: 'Sankey',
            sankeyAxes: stages,
            sankeyType: 'aligned',
            xAxis: [weightField],
            // White node boxes so the coloured flow ribbons carry the colour, not the nodes.
            sankeyNodesColor: 'rgb(255,255,255)',
            ...(colorField ? { colorBy: colorField } : {}),
            showLegend: !!colorField,
        };
    },
};
