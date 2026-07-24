// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Violin Plot template.
 *
 * Native `violin` trace: pass raw y-values per category and Plotly computes
 * the KDE + box overlay itself (matching Vega-Lite's `mark: "violin"` /
 * density transform, unlike ECharts which has no native violin and needs a
 * custom render item).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { isDiscreteType, extractCategories, groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { detectBandedAxisForceDiscrete } from '../../core/axis-detection';

export const plViolinPlotDef: ChartTemplateDef = {
    chart: 'Violin Plot',
    template: { mark: 'violin', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: (cs, table) => {
        if (!cs.x?.field || !cs.y?.field) return {};
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        if (!result) return {};
        return {
            axisFlags: { [result.axis]: { banded: true } },
            resolvedTypes: result.resolvedTypes,
            paramOverrides: { defaultBandSize: 40 },
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
        const showBox = chartProperties?.showBox !== false;
        const showPoints = chartProperties?.showPoints === true;
        const palette = getPlotlyPalette(ctx, 'color');

        const makeTrace = (name: string | undefined, rows: any[], colorIdx: number) => {
            const cats = rows.map((r: any) => String(r[catField] ?? ''));
            const vals = rows.map((r: any) => Number(r[valField]));
            const color = getSeriesColor(palette, colorIdx);
            return {
                type: 'violin',
                ...(name != null ? { name } : {}),
                ...(isHorizontal ? { y: cats, x: vals } : { x: cats, y: vals }),
                orientation: isHorizontal ? 'h' as const : 'v' as const,
                box: { visible: showBox },
                meanline: { visible: true },
                points: showPoints ? 'all' as const : false,
                line: { color },
                fillcolor: color,
                opacity: 0.6,
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
                violinmode: colorField ? 'group' : undefined,
                ...(isHorizontal ? { yaxis: catAxisSpec, xaxis: valAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'showBox', label: 'Inner box', type: 'binary', defaultValue: true } as ChartPropertyDef,
        { key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
};
