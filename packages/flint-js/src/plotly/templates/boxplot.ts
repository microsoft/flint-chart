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
import { planBandDodge } from '../../core/band-dodge';

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
        // `showPoints` overlays every raw observation on the box; that makes the
        // separate outlier marks redundant, since those points are drawn too.
        const showPoints = chartProperties?.showPoints === true;
        const showOutliers = chartProperties?.showOutliers !== false;
        const boxpoints = showPoints ? 'all' : (showOutliers ? 'outliers' : false);
        const palette = getPlotlyPalette(ctx, 'color');

        const makeTrace = (name: string | undefined, rows: any[], colorIdx: number) => {
            const cats = rows.map((r: any) => String(r[catField] ?? ''));
            const vals = rows.map((r: any) => Number(r[valField]));
            const seriesColor = getSeriesColor(palette, colorIdx);
            return {
                type: 'box',
                ...(name != null ? { name } : {}),
                ...(isHorizontal ? { y: cats, x: vals } : { x: cats, y: vals }),
                boxpoints,
                // Drawing the sample inverts the visual hierarchy: the sample
                // becomes the figure and the box demotes to scaffolding over it.
                // So the box goes hollow and keeps only its outline, and the
                // group colour lives on the points — fill *and* point colour
                // would encode the group twice. `pointpos: 0` centres the cloud
                // on the box instead of parking it alongside.
                ...(showPoints
                    ? { jitter: 0.6, pointpos: 0, fillcolor: 'rgba(0,0,0,0)' }
                    : {}),
                marker: showPoints
                    ? { color: seriesColor, size: 4, opacity: 0.7, line: { color: '#ffffff', width: 0.5 } }
                    : { color: seriesColor, size: 3 },
                line: { color: seriesColor, ...(showPoints ? { width: 1.5 } : {}) },
            };
        };

        const traces: any[] = [];
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) { traces.push(makeTrace(name, rows, i)); i++; }
        } else {
            traces.push(makeTrace(undefined, table, 0));
        }

        // Degenerate color (color re-encodes the category axis, or a 1:1 /
        // sparse mapping where every band holds at most one colour) must NOT
        // dodge into per-lane slivers with a redundant legend — collapse to
        // one full-width box per band. `boxmode: 'group'` reserves a lane per
        // trace, so drop it (default overlay) and hide the redundant legend;
        // the boxes stay colour-coded but sit one per band. Genuine sub-group
        // colour (maxPerBand > 1) keeps the native grouped dodge.
        const redundantColor = !!colorField
            && planBandDodge(table, catField, colorField).maxPerBand <= 1;
        // Collapsed boxes sit one per band, so widen them to fill the band
        // (Plotly's default overlay box is only ~40% of the band).
        if (redundantColor) for (const t of traces) t.width = 0.8;

        const catAxisSpec = { type: 'category' as const, categoryorder: 'array' as const, categoryarray: categories, title: { text: catField } };
        const valAxisSpec = { title: { text: valField }, zeroline: false };

        Object.assign(spec, {
            data: traces,
            layout: {
                boxmode: (colorField && !redundantColor) ? 'group' : undefined,
                ...(isHorizontal ? { yaxis: catAxisSpec, xaxis: valAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField && !redundantColor,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false,
            // Jitter needs a band to scatter within, so this is only meaningful
            // once one position axis is discrete.
            check: (ctx) => ({
                applicable: isDiscreteType(ctx.channelSemantics?.x?.type)
                    || isDiscreteType(ctx.channelSemantics?.y?.type),
            }),
        } as ChartPropertyDef,
        {
            key: 'showOutliers', label: 'Outliers', type: 'binary', defaultValue: true,
            // Once every observation is drawn, the outlier marks are duplicates.
            check: (ctx) => ({ applicable: ctx.chartProperties?.showPoints !== true }),
        } as ChartPropertyDef,
    ],
};
