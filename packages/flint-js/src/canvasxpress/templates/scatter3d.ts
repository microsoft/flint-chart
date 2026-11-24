// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress 3D Scatter template (graphType 'Scatter3D'). CanvasXpress-exclusive:
 * the generic grammar has no rotatable 3D scatter.
 *
 * Long-format scatter data (like SPLOM/Streamgraph): one `vars` row per
 * observation, the three measured columns as `smps`, each `[x, y, z]` triple as a
 * row, and `xAxis`/`yAxis`/`zAxis` naming which column is which axis. A bound
 * `color` field rides as a per-variable `z` annotation picked up by `colorBy`.
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

export const cxScatter3DDef: ChartTemplateDef = {
    chart: 'Scatter 3D',
    template: { graphType: 'Scatter3D', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'z', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const encs = (encodings as any) || {};
        const xField = channelSemantics.x?.field ?? encodingField(encs.x);
        const yField = channelSemantics.y?.field ?? encodingField(encs.y);
        const zField = channelSemantics.z?.field ?? encodingField(encs.z);
        const colorField = channelSemantics.color?.field ?? encodingField(encs.color);
        if (!xField || !yField || !zField) return;

        const vars = table.map((_: any, i: number) => 'obs' + (i + 1));
        const smps = [xField, yField, zField];
        const data = table.map((r: any) => [toNum(r[xField]), toNum(r[yField]), toNum(r[zField])]);
        const z: Record<string, string[]> = {};
        if (colorField) z[colorField] = table.map((r: any) => String(r[colorField]));

        spec.graphType = 'Scatter3D';
        spec.data = colorField ? { y: { vars, smps, data }, z } : { y: { vars, smps, data } };
        spec.config = {
            ...spec.config,
            graphType: 'Scatter3D',
            xAxis: [xField],
            yAxis: [yField],
            zAxis: [zField],
            showLegend: !!colorField,
            ...(colorField ? { colorBy: colorField } : {}),
        };
    },
};
