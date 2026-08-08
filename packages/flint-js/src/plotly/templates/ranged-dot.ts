// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Ranged Dot Plot template.
 *
 * A thin connector line per category plus colored point markers — typically
 * used for min/max-style ranges (e.g. one line per country spanning its
 * lowest to highest reading, with markers colored by reading type). Mirrors
 * `ecRangedDotPlotDef`.
 */

import { ChartTemplateDef } from '../../core/types';
import { isDiscreteType, extractCategories, groupBy, getPlotlyPalette, getSeriesColor } from './utils';

export const plRangedDotPlotDef: ChartTemplateDef = {
    chart: 'Ranged Dot Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        if (!xField || !yField) return;

        const xIsDiscrete = isDiscreteType(channelSemantics.x?.type);
        const yIsDiscrete = isDiscreteType(channelSemantics.y?.type);
        // The categorical axis carries one connector segment; the continuous
        // axis carries the range extent.
        const catAxis: 'x' | 'y' = yIsDiscrete ? 'y' : xIsDiscrete ? 'x' : 'y';
        const catField = catAxis === 'y' ? yField : xField;
        const contField = catAxis === 'y' ? xField : yField;

        const categories = extractCategories(table, catField, channelSemantics[catAxis]?.ordinalSortOrder);
        const byCat = groupBy(table, catField);

        // Connector segments: one [min, max] line per category, drawn behind the points.
        const segX: (number | string | null)[] = [];
        const segY: (number | string | null)[] = [];
        for (const cat of categories) {
            const rows = byCat.get(cat) ?? [];
            const vals = rows.map((r: any) => Number(r[contField])).filter((v: number) => isFinite(v));
            if (vals.length === 0) continue;
            const lo = Math.min(...vals);
            const hi = Math.max(...vals);
            if (catAxis === 'y') { segX.push(lo, hi, null); segY.push(cat, cat, null); }
            else { segX.push(cat, cat, null); segY.push(lo, hi, null); }
        }

        const traces: any[] = [{
            type: 'scatter', mode: 'lines', name: '', showlegend: false,
            x: segX, y: segY,
            line: { color: '#999', width: 2 },
            hoverinfo: 'skip',
        }];

        const palette = getPlotlyPalette(ctx, 'color');
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                traces.push({
                    type: 'scatter', mode: 'markers', name,
                    x: catAxis === 'y' ? rows.map((r: any) => r[contField]) : rows.map((r: any) => r[catField]),
                    y: catAxis === 'y' ? rows.map((r: any) => r[catField]) : rows.map((r: any) => r[contField]),
                    marker: { color: getSeriesColor(palette, i), size: 9 },
                });
                i++;
            }
        } else {
            traces.push({
                type: 'scatter', mode: 'markers', showlegend: false,
                x: catAxis === 'y' ? table.map((r: any) => r[contField]) : table.map((r: any) => r[catField]),
                y: catAxis === 'y' ? table.map((r: any) => r[catField]) : table.map((r: any) => r[contField]),
                marker: { color: getSeriesColor(palette, 0), size: 9 },
            });
        }

        const catAxisSpec = {
            type: 'category' as const,
            categoryorder: 'array' as const,
            categoryarray: categories,
            ...(catAxis === 'y' ? { autorange: 'reversed' as const } : {}),
            title: { text: catField },
        };
        const contAxisSpec = { title: { text: contField } };

        Object.assign(spec, {
            data: traces,
            layout: {
                ...(catAxis === 'y' ? { yaxis: catAxisSpec, xaxis: contAxisSpec } : { xaxis: catAxisSpec, yaxis: contAxisSpec }),
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
