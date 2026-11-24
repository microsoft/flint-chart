// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Network template (graphType 'Network'). CanvasXpress-exclusive.
 *
 * A node-link graph from edge rows. CanvasXpress uses its own data form:
 *   data.nodes = [{ id, name }]
 *   data.edges = [{ id1, id2, value }]
 * Nodes are derived from the distinct endpoints of the edges (the `source` and
 * `target` domain channels); `size` weights the edges.
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

const NODE_COLORS = [
    '#5369ff', '#fe6969', '#fed385', '#47db0a', '#9e0adb', '#ff7d00', '#1abc9c', '#e84393',
];

export const cxNetworkDef: ChartTemplateDef = {
    chart: 'Network Graph',
    template: { graphType: 'Network', data: {}, config: {} },
    channels: ['source', 'target', 'color', 'size'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const sourceField = channelSemantics.source?.field ?? encodingField((encodings as any)?.source);
        const targetField = channelSemantics.target?.field ?? encodingField((encodings as any)?.target);
        const colorField = channelSemantics.color?.field ?? encodingField((encodings as any)?.color);
        const sizeField = channelSemantics.size?.field ?? encodingField((encodings as any)?.size);
        if (!sourceField || !targetField) return;

        // Each row is a node: `target` = its id, `source` = its parent ('' for the
        // root). Its colour/size/name ride on the same row.
        const isColorLiteral = (v: any) => typeof v === 'string' && /^(rgb|rgba|#)/i.test(v);
        const attrOf = new Map<string, { color?: any; size?: number; name?: string }>();
        const nodeIds = new Set<string>();
        const edges: Array<{ id1: string; id2: string; value: number }> = [];
        for (const row of table) {
            const id = String(row[targetField]);
            const parent = sourceField ? String(row[sourceField] ?? '') : '';
            if (!id) continue;
            nodeIds.add(id);
            if (parent) {
                nodeIds.add(parent);
                edges.push({ id1: parent, id2: id, value: 1 });
            }
            attrOf.set(id, {
                color: colorField ? row[colorField] : undefined,
                size: sizeField ? Number(row[sizeField]) : undefined,
                name: row.name != null ? String(row.name) : undefined,
            });
        }

        // Colour: use an explicit rgb/hex value as-is; otherwise map a group label to
        // a stable palette entry.
        const groups: string[] = [];
        for (const a of attrOf.values()) {
            const g = a.color;
            if (g != null && !isColorLiteral(g) && groups.indexOf(String(g)) < 0) groups.push(String(g));
        }
        const colorOf = (c?: any) => {
            if (c == null) return '#bbbbbb';
            if (isColorLiteral(c)) return c;
            return NODE_COLORS[groups.indexOf(String(c)) % NODE_COLORS.length];
        };

        const nodes = Array.from(nodeIds).map((id) => {
            const a = attrOf.get(id) || {};
            const d = a.size != null && !Number.isNaN(a.size) ? a.size : 14;
            return { id, name: a.name || id, color: colorOf(a.color), width: d, height: d };
        });

        spec.graphType = 'Network';
        spec.data = { nodes, edges };
        spec.config = {
            ...spec.config,
            graphType: 'Network',
            networkLayoutType: 'forceDirected',
            nodeFontSize: 7,
            showLegend: false,
        };
    },
};
