// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Graph (Network) template.
 *
 * Unique to ECharts — no Vega-Lite equivalent.
 * Renders relationship/edge-list data as a node-link network. Node size
 * encodes degree (number of connections), so hubs stand out.
 *
 * Data model (each row = one edge):
 *   x    (nominal): source node name
 *   y    (nominal): target node name
 *   size (quantitative, optional): edge weight (defaults to 1)
 *
 * Nodes are derived from the union of source/target values. Parallel edges
 * (same source→target pair) are aggregated (summed weight).
 *
 * Layout defaults to `circular` so the render is deterministic (no force
 * simulation needed to settle); a `force` layout is available as a property.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { DEFAULT_COLORS } from './utils';
import { getPaletteForScheme } from '../colormap';

export const ecGraphDef: ChartTemplateDef = {
    chart: 'Network Graph',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'size'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, colorDecisions } = ctx;
        const sourceField = channelSemantics.x?.field;
        const targetField = channelSemantics.y?.field;
        const weightField = channelSemantics.size?.field;
        if (!sourceField || !targetField) return;

        // Aggregate parallel edges and accumulate per-node degree (weighted).
        const linkAgg = new Map<string, number>();
        const degree = new Map<string, number>();
        for (const row of table) {
            const src = String(row[sourceField] ?? '');
            const tgt = String(row[targetField] ?? '');
            if (!src || !tgt || src === tgt) continue;
            const w = weightField ? (Number(row[weightField]) || 0) : 1;
            const key = `${src}\x00${tgt}`;
            linkAgg.set(key, (linkAgg.get(key) ?? 0) + w);
            degree.set(src, (degree.get(src) ?? 0) + w);
            degree.set(tgt, (degree.get(tgt) ?? 0) + w);
        }

        const links: { source: string; target: string; value: number }[] = [];
        const nodeSet = new Set<string>();
        for (const [key, value] of linkAgg) {
            const [source, target] = key.split('\x00');
            nodeSet.add(source);
            nodeSet.add(target);
            links.push({ source, target, value });
        }
        if (links.length === 0) return;

        const nodeArr = [...nodeSet];

        // ── Palette ───────────────────────────────────────────────────────
        const decision = colorDecisions?.color ?? colorDecisions?.group;
        let palette: string[] | undefined;
        if (decision?.schemeId) {
            const fromRegistry = getPaletteForScheme(decision.schemeId);
            if (fromRegistry && fromRegistry.length > 0) palette = fromRegistry;
        }
        if (!palette || palette.length === 0) {
            palette = getPaletteForScheme(nodeArr.length > 10 ? 'cat20' : 'cat10') ?? DEFAULT_COLORS;
        }

        // ── Node sizing: area-proportional to degree ─────────────────────────
        const degVals = nodeArr.map((n) => degree.get(n) ?? 0);
        const dMin = Math.min(...degVals);
        const dMax = Math.max(...degVals);
        const rMin = 12, rMax = 46;
        const sizeFor = (d: number) => {
            if (dMax === dMin) return (rMin + rMax) / 2;
            const t = (d - dMin) / (dMax - dMin);
            // Interpolate area, then convert back to a diameter.
            const area = rMin * rMin + t * (rMax * rMax - rMin * rMin);
            return Math.sqrt(area);
        };

        const nodes = nodeArr.map((name, i) => ({
            name,
            value: degree.get(name) ?? 0,
            symbolSize: sizeFor(degree.get(name) ?? 0),
            itemStyle: { color: palette![i % palette!.length] },
        }));

        // ── Edge widths scaled to weight ─────────────────────────────────────
        const wVals = links.map((l) => l.value);
        const wMin = Math.min(...wVals);
        const wMax = Math.max(...wVals);
        const widthFor = (v: number) => {
            if (wMax === wMin) return 1.4;
            return 0.8 + ((v - wMin) / (wMax - wMin)) * 3.2;
        };

        const layout = chartProperties?.layout === 'force' ? 'force' : 'circular';

        // Square canvas; grow with node count. Extra padding leaves room for the
        // radial node labels so they don't clip at the canvas edge.
        const side = Math.max(420, Math.min(860, Math.round(Math.sqrt(nodeArr.length) * 155) + 40));
        const pad = 64;

        const option: any = {
            tooltip: {
                trigger: 'item',
                formatter: (params: any) => {
                    if (params.dataType === 'edge') {
                        return `${params.data.source} → ${params.data.target}<br/>Weight: ${params.data.value}`;
                    }
                    return `${params.name}<br/>Degree: ${params.value}`;
                },
            },
            series: [{
                type: 'graph',
                layout,
                data: nodes,
                links: links.map((l) => ({ ...l, lineStyle: { width: widthFor(l.value) } })),
                roam: false,
                label: {
                    show: true,
                    position: 'right',
                    fontSize: 11,
                    color: '#333',
                },
                lineStyle: {
                    color: 'source',
                    opacity: 0.5,
                    curveness: layout === 'circular' ? 0.3 : 0,
                },
                emphasis: {
                    focus: 'adjacency',
                    lineStyle: { width: 4 },
                },
                circular: { rotateLabel: true },
                force: { repulsion: 180, edgeLength: [50, 130], gravity: 0.08 },
                left: pad,
                right: pad,
                top: pad,
                bottom: pad,
            }],
            color: palette ?? DEFAULT_COLORS,
            _width: side,
            _height: side,
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'layout', label: 'Layout', type: 'discrete', options: [
                { value: 'circular', label: 'Circular (default)' },
                { value: 'force', label: 'Force-directed' },
            ],
        } as ChartPropertyDef,
    ],
};
