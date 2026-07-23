// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Range Area Chart (band / high–low ribbon) template.
 *
 * A filled band between a lower (`y`) and upper (`y2`) bound at each x.
 * Plotly's native `fill: 'tonexty'` fills the region between two
 * consecutive traces sharing the same x — the idiomatic Plotly ribbon,
 * simpler than the other backends' transparent-base + delta-stack trick.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { isDiscreteType, extractCategories, groupBy, coerceIsoDateForPlotly, getPlotlyPalette, getSeriesColor, fillColor } from './utils';

export const plRangeAreaChartDef: ChartTemplateDef = {
    chart: 'Range Area Chart',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'y2', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const y2CS = channelSemantics.y2;
        const colorField = channelSemantics.color?.field;
        if (!xCS?.field || !yCS?.field || !y2CS?.field) return;

        const xField = xCS.field;
        const lowField = yCS.field;
        const highField = y2CS.field;
        const xIsDiscrete = isDiscreteType(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';
        const mapX = (raw: unknown) => (xIsTemporal ? coerceIsoDateForPlotly(raw) : raw);

        const opacity = Number(chartProperties?.opacity ?? 0.35);
        const palette = getPlotlyPalette(ctx, 'color');

        // Sort each group by x so the polygon traces a clean band (unsorted
        // data would zig-zag the fill).
        const sortRows = (rows: any[]) => xIsDiscrete ? rows : [...rows].sort((a, b) => {
            const av = xIsTemporal ? new Date(a[xField]).getTime() : Number(a[xField]);
            const bv = xIsTemporal ? new Date(b[xField]).getTime() : Number(b[xField]);
            return av - bv;
        });

        const makeBand = (name: string | undefined, rows: any[], idx: number) => {
            const sorted = sortRows(rows);
            const xs = xIsDiscrete ? sorted.map((r: any) => r[xField]) : sorted.map((r: any) => mapX(r[xField]));
            const color = getSeriesColor(palette, idx);
            return [
                {
                    type: 'scatter', mode: 'lines', showlegend: false,
                    name: name != null ? `${name} (low)` : 'low',
                    x: xs, y: sorted.map((r: any) => r[lowField]),
                    line: { width: 0, color },
                    hoverinfo: 'skip' as const,
                },
                {
                    type: 'scatter', mode: 'lines',
                    ...(name != null ? { name } : {}),
                    x: xs, y: sorted.map((r: any) => r[highField]),
                    line: { width: 1.5, color },
                    fill: 'tonexty' as const,
                    fillcolor: fillColor(color, opacity),
                },
            ];
        };

        const traces: any[] = [];
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) { traces.push(...makeBand(name, rows, i)); i++; }
        } else {
            traces.push(...makeBand(undefined, table, 0));
        }

        const xAxisSpec: any = { title: { text: xField } };
        if (xIsDiscrete) {
            xAxisSpec.type = 'category';
            xAxisSpec.categoryorder = 'array';
            xAxisSpec.categoryarray = extractCategories(table, xField, xCS.ordinalSortOrder);
        } else if (xIsTemporal) {
            xAxisSpec.type = 'date';
        }
        const valueTitle = lowField === highField ? lowField : `${lowField}, ${highField}`;

        Object.assign(spec, {
            data: traces,
            layout: { xaxis: xAxisSpec, yaxis: { title: { text: valueTitle } }, showlegend: !!colorField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.05, defaultValue: 0.35 } as ChartPropertyDef,
    ],
};
