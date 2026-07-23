// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Boxplot template.
 *
 * Native `box` trace: pass raw y-values with a matching category `x` array
 * and Plotly computes the five-number summary (quartiles, whiskers, outliers)
 * itself — like Vega-Lite's `mark: "boxplot"`, unlike ECharts/Chart.js which
 * must precompute the summary client-side.
 *
 * Grouped boxplots (a `color` field subdividing the category axis) use
 * `layout.boxmode: 'group'` — Plotly's native per-category dodge, the
 * equivalent of the other backends' manual band-dodge planner.
 *
 * NOTE: Plotly's box trace does not expose a native "extend whiskers to
 * min/max" mode (only its quartile-computation algorithm is configurable);
 * unlike the Vega-Lite/ECharts boxplot templates this template always uses
 * Tukey (1.5×IQR) whiskers. `showOutliers` toggles the outlier points.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { isDiscreteType, extractCategories, groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { detectBandedAxisForceDiscrete } from '../../core/axis-detection';

export const plBoxplotDef: ChartTemplateDef = {
    chart: 'Boxplot',
    template: { mark: 'boxplot', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: (cs, table) => {
        if (!cs.x?.field || !cs.y?.field) return {};
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        if (!result) return {};
        return {
            axisFlags: { [result.axis]: { banded: true } },
            resolvedTypes: result.resolvedTypes,
            paramOverrides: { defaultBandSize: 28 },
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        if (!xCS?.field || !yCS?.field) return;

        const xIsDiscrete = isDiscreteType(xCS.type);
        const yIsDiscrete = isDiscreteType(yCS.type);
        const catAxis: 'x' | 'y' = (yIsDiscrete && !xIsDiscrete) ? 'y' : 'x';
        const valAxis: 'x' | 'y' = catAxis === 'x' ? 'y' : 'x';
        const catField = channelSemantics[catAxis]!.field!;
        const valField = channelSemantics[valAxis]!.field!;
        const isHorizontal = catAxis === 'y';

        const categories = extractCategories(table, catField, channelSemantics[catAxis]?.ordinalSortOrder);
        const showOutliers = chartProperties?.showOutliers !== false;
        const boxpoints = showOutliers ? 'outliers' : false;
        const palette = getPlotlyPalette(ctx, 'color');

        const makeTrace = (name: string | undefined, rows: any[], colorIdx: number) => {
            const cats = rows.map((r: any) => String(r[catField] ?? ''));
            const vals = rows.map((r: any) => Number(r[valField]));
            return {
                type: 'box',
                ...(name != null ? { name } : {}),
                ...(isHorizontal ? { y: cats, x: vals } : { x: cats, y: vals }),
                boxpoints,
                marker: { color: getSeriesColor(palette, colorIdx), size: 3 },
                line: { color: getSeriesColor(palette, colorIdx) },
            };
        };

        const traces: any[] = [];
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) { traces.push(makeTrace(name, rows, i)); i++; }
        } else {
            traces.push(makeTrace(undefined, table, 0));
        }

        const catAxisSpec = { type: 'category' as const, categoryorder: 'array' as const, categoryarray: categories, title: { text: catField } };
        const valAxisSpec = { title: { text: valField }, zeroline: false };

        Object.assign(spec, {
            data: traces,
            layout: {
                boxmode: colorField ? 'group' : undefined,
                ...(isHorizontal ? { yaxis: catAxisSpec, xaxis: valAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'showOutliers', label: 'Outliers', type: 'binary', defaultValue: true } as ChartPropertyDef,
    ],
};
