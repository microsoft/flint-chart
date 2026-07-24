// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Density Contour (2D density) template.
 *
 * Native `histogram2dcontour` trace: bins two raw numeric arrays (`x`, `y`) and
 * draws smoothed density contour lines. Vega-Lite has **no** contour mark, so
 * this is a Plotly-only statistical chart. See design-docs/plotly-stats-charts.md.
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';

const SCHEME_COLORSCALES: Record<string, string> = {
    viridis: 'Viridis', inferno: 'Hot', magma: 'Magma', plasma: 'Plasma', turbo: 'Turbo',
    blues: 'Blues', reds: 'Reds', greens: 'Greens', oranges: 'Oranges', purples: 'Purples', greys: 'Greys',
};
const DEFAULT_SCHEME = 'Blues';

export const plDensityContourDef: ChartTemplateDef = {
    chart: 'Density Contour',
    template: { mark: 'rect', encoding: {} },
    channels: ['x', 'y', 'column', 'row'],
    markCognitiveChannel: 'color',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, encodings } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const binCount = (chartProperties?.binCount as number) || 20;
        const showPoints = chartProperties?.showPoints !== false;
        const encScheme = (encodings?.color as any)?.scheme;
        const userScheme = (encScheme && encScheme !== 'default') ? encScheme : undefined;
        const colorscale = SCHEME_COLORSCALES[userScheme ?? DEFAULT_SCHEME.toLowerCase()] ?? DEFAULT_SCHEME;

        const xs: number[] = [];
        const ys: number[] = [];
        for (const r of table) {
            const xv = Number(r[xField]);
            const yv = Number(r[yField]);
            if (isFinite(xv) && isFinite(yv)) { xs.push(xv); ys.push(yv); }
        }

        const data: any[] = [{
            type: 'histogram2dcontour',
            x: xs, y: ys,
            nbinsx: binCount, nbinsy: binCount,
            colorscale,
            contours: { coloring: 'fill' },
            colorbar: { title: { text: 'Density' } },
            line: { width: 0.5 },
        }];
        if (showPoints) {
            data.push({
                type: 'scatter', mode: 'markers',
                x: xs, y: ys,
                marker: { color: 'rgba(0,0,0,0.35)', size: 3 },
                hoverinfo: 'skip', showlegend: false,
            });
        }

        Object.assign(spec, {
            data,
            layout: {
                xaxis: { title: { text: xField } },
                yaxis: { title: { text: yField } },
                showlegend: false,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'binCount', label: 'Bins', type: 'continuous', min: 5, max: 50, step: 1, defaultValue: 20 } as ChartPropertyDef,
        { key: 'showPoints', label: 'Show points', type: 'binary', defaultValue: true } as ChartPropertyDef,
    ],
    encodingActions: [
        {
            key: 'colorScheme',
            label: 'Scheme',
            isApplicable: () => true,
            dependencies: [],
            control: {
                type: 'discrete', options: [
                    { value: undefined, label: 'Default (Blues)' },
                    { value: 'viridis', label: 'Viridis' },
                    { value: 'inferno', label: 'Inferno' },
                    { value: 'magma', label: 'Magma' },
                    { value: 'plasma', label: 'Plasma' },
                    { value: 'turbo', label: 'Turbo' },
                    { value: 'greens', label: 'Greens' },
                    { value: 'reds', label: 'Reds' },
                ],
            },
            get: (enc) => (enc.color as any)?.scheme,
            set: (enc, value) => ({ ...enc, color: { ...(enc.color as any), scheme: value } }),
        },
    ] as EncodingActionDef[],
};
