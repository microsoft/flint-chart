// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Tree template.
 *
 * Unique to ECharts — no Vega-Lite equivalent.
 * Renders a hierarchy as an orthogonal node-link tree (dendrogram). Good for
 * showing parent → child structure where containment/area (treemap) or radial
 * nesting (sunburst) would obscure the branching itself.
 *
 * Data model:
 *   color  (nominal): first-level category (root's children)
 *   detail (nominal, optional): second-level category (leaves)
 *   size   (quantitative, optional): leaf value (defaults to a count)
 *
 * color only            → two levels: root → categories.
 * color + detail        → three levels: root → categories → sub-categories.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, DEFAULT_COLORS } from './utils';
import { getPaletteForScheme } from '../colormap';

export const ecTreeDef: ChartTemplateDef = {
    chart: 'Tree',
    template: { mark: 'point', encoding: {} },
    channels: ['color', 'detail', 'size'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, colorDecisions } = ctx;
        const catField = channelSemantics.color?.field;
        const subCatField = channelSemantics.detail?.field;
        const valField = channelSemantics.size?.field;
        if (!catField) return;

        const categories = extractCategories(table, catField, channelSemantics.color?.ordinalSortOrder);
        if (categories.length === 0) return;

        // ── Palette ───────────────────────────────────────────────────────
        const decision = colorDecisions?.color ?? colorDecisions?.group;
        let palette: string[] | undefined;
        if (decision?.schemeId) {
            const fromRegistry = getPaletteForScheme(decision.schemeId);
            if (fromRegistry && fromRegistry.length > 0) palette = fromRegistry;
        }
        if (!palette || palette.length === 0) {
            palette = getPaletteForScheme(categories.length > 10 ? 'cat20' : 'cat10') ?? DEFAULT_COLORS;
        }

        // ── Build the hierarchy ───────────────────────────────────────────
        let leafCount = 0;
        const children = categories.map((cat, catIdx) => {
            const catRows = table.filter((r) => String(r[catField]) === cat);
            const color = palette![catIdx % palette!.length];
            if (subCatField) {
                const subCats = extractCategories(catRows, subCatField);
                const subChildren = subCats.map((sub) => {
                    const subRows = catRows.filter((r) => String(r[subCatField]) === sub);
                    const value = valField
                        ? subRows.reduce((s, r) => s + (Number(r[valField]) || 0), 0)
                        : subRows.length;
                    leafCount++;
                    return { name: sub, value, lineStyle: { color }, itemStyle: { color } };
                });
                return { name: cat, children: subChildren, lineStyle: { color }, itemStyle: { color } };
            }
            const value = valField
                ? catRows.reduce((s, r) => s + (Number(r[valField]) || 0), 0)
                : catRows.length;
            leafCount++;
            return { name: cat, value, lineStyle: { color }, itemStyle: { color } };
        });

        const rootName = chartProperties?.rootLabel ?? 'All';
        const treeData = [{ name: rootName, children }];

        const depth = subCatField ? 3 : 2;
        const orient = chartProperties?.orient === 'TB' ? 'TB' : 'LR';

        // ── Layout: depth drives width (LR), leaf count drives height ─────────
        const canvasW = Math.max(ctx.canvasSize.width, 340 + (depth - 1) * 210);
        const canvasH = Math.max(ctx.canvasSize.height, Math.min(1400, Math.max(300, leafCount * 26)));

        const option: any = {
            tooltip: {
                trigger: 'item',
                triggerOn: 'mousemove',
                formatter: (params: any) => {
                    const v = params.value;
                    return v != null && v !== ''
                        ? `${params.name}<br/>Value: ${v}`
                        : params.name;
                },
            },
            series: [{
                type: 'tree',
                data: treeData,
                layout: 'orthogonal',
                orient,
                top: 24,
                bottom: 24,
                left: orient === 'LR' ? 40 : 24,
                right: orient === 'LR' ? 140 : 24,
                symbol: 'circle',
                symbolSize: 8,
                initialTreeDepth: -1,
                expandAndCollapse: false,
                roam: false,
                lineStyle: { width: 1.2, curveness: 0.5, color: '#bbb' },
                label: {
                    show: true,
                    position: orient === 'LR' ? 'left' : 'top',
                    verticalAlign: 'middle',
                    align: orient === 'LR' ? 'right' : 'center',
                    fontSize: 11,
                    color: '#333',
                },
                leaves: {
                    label: {
                        position: orient === 'LR' ? 'right' : 'bottom',
                        verticalAlign: 'middle',
                        align: orient === 'LR' ? 'left' : 'center',
                    },
                },
                emphasis: { focus: 'descendant' },
            }],
            color: palette ?? DEFAULT_COLORS,
            _width: canvasW,
            _height: canvasH,
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'orient', label: 'Orient', type: 'discrete', options: [
                { value: 'LR', label: 'Left → Right (default)' },
                { value: 'TB', label: 'Top → Bottom' },
            ],
        } as ChartPropertyDef,
    ],
};
