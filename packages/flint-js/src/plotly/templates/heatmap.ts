// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Heatmap template.
 *
 * Native `heatmap` trace: pass `x`, `y` category arrays and a `z` matrix and
 * Plotly draws the grid + colorbar itself — no manual index-mapping like the
 * ECharts template (`data: [[xIdx, yIdx, value], ...]`) needs.
 */

import { ChartTemplateDef, EncodingActionDef } from '../../core/types';
import { extractCategories } from './utils';

const SCHEME_COLORSCALES: Record<string, string> = {
    viridis: 'Viridis', inferno: 'Hot', magma: 'Magma', plasma: 'Plasma', turbo: 'Turbo',
    blues: 'Blues', reds: 'Reds', greens: 'Greens', oranges: 'Oranges', purples: 'Purples', greys: 'Greys',
    blueorange: 'RdBu', redblue: 'RdBu',
};
const DEFAULT_SCHEME = 'Blues';

export const plHeatmapDef: ChartTemplateDef = {
    chart: 'Heatmap',
    template: { mark: 'rect', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'color',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true }, y: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, colorDecisions, encodings } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        if (!xField || !yField) return;

        const xCategories = extractCategories(table, xField, channelSemantics.x?.ordinalSortOrder);
        const yCategories = extractCategories(table, yField, channelSemantics.y?.ordinalSortOrder);

        const cellMap = new Map<string, number>();
        for (const row of table) {
            const key = `${row[xField]}\u0000${row[yField]}`;
            const val = colorField ? (Number(row[colorField]) || 0) : 1;
            cellMap.set(key, (cellMap.get(key) ?? 0) + val);
        }
        const z = yCategories.map(yc => xCategories.map(xc => {
            const v = cellMap.get(`${xc}\u0000${yc}`);
            return v ?? null;
        }));

        const encScheme = (encodings?.color as any)?.scheme;
        const userScheme = (encScheme && encScheme !== 'default') ? encScheme : undefined;
        const decision = colorDecisions?.color ?? colorDecisions?.group;
        const semanticIsDiverging = decision?.schemeType === 'diverging';
        const schemeName = userScheme || (semanticIsDiverging ? 'redblue' : DEFAULT_SCHEME.toLowerCase());
        const colorscale = SCHEME_COLORSCALES[schemeName] ?? DEFAULT_SCHEME;

        Object.assign(spec, {
            data: [{
                type: 'heatmap',
                x: xCategories, y: yCategories, z,
                colorscale,
                hoverongaps: false,
                colorbar: { title: { text: colorField ?? 'Value' } },
            }],
            layout: {
                xaxis: { type: 'category', categoryorder: 'array', categoryarray: xCategories, title: { text: xField } },
                yaxis: { type: 'category', categoryorder: 'array', categoryarray: yCategories, title: { text: yField } },
                showlegend: false,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    encodingActions: [
        {
            key: 'colorScheme',
            label: 'Scheme',
            isApplicable: (c) => !!c.encodings.color?.field,
            dependencies: ['color'],
            control: {
                type: 'discrete', options: [
                    { value: undefined, label: 'Default (Blues)' },
                    { value: 'viridis', label: 'Viridis' },
                    { value: 'inferno', label: 'Inferno' },
                    { value: 'magma', label: 'Magma' },
                    { value: 'plasma', label: 'Plasma' },
                    { value: 'turbo', label: 'Turbo' },
                    { value: 'blues', label: 'Blues' },
                    { value: 'reds', label: 'Reds' },
                    { value: 'greens', label: 'Greens' },
                    { value: 'oranges', label: 'Oranges' },
                    { value: 'purples', label: 'Purples' },
                    { value: 'greys', label: 'Greys' },
                    { value: 'blueorange', label: 'Blue-Orange (diverging)' },
                    { value: 'redblue', label: 'Red-Blue (diverging)' },
                ],
            },
            get: (enc) => (enc.color as any)?.scheme,
            set: (enc, value) => ({ ...enc, color: { ...(enc.color as any), scheme: value } }),
        },
    ] as EncodingActionDef[],
};
