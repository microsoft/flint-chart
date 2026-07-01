// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Bubble Chart template.
 *
 * Contrast with VL / Scatter:
 *   VL: encoding.x + encoding.y + encoding.size (quantitative) → point area
 *   CJS: native type 'bubble' with data = [{x, y, r}, ...] where `r` is a
 *        per-point pixel radius derived (area-proportionally) from the size
 *        channel. Optional color channel groups points into datasets.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
} from './utils';

/**
 * Build an area-proportional value → pixel-radius mapper for the size channel.
 * Returns a constant-radius mapper when there is no usable size field.
 */
function makeRadiusScale(
    values: number[],
    rMin: number,
    rMax: number,
): (v: number) => number {
    const finite = values.filter((v) => typeof v === 'number' && isFinite(v));
    if (finite.length === 0) {
        const mid = Math.round((rMin + rMax) / 2);
        return () => mid;
    }
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    if (min === max) {
        const mid = Math.round((rMin + rMax) / 2);
        return () => mid;
    }
    // Area-proportional: interpolate area (r^2) linearly, then take sqrt.
    const aMin = rMin * rMin;
    const aMax = rMax * rMax;
    return (v: number) => {
        if (typeof v !== 'number' || !isFinite(v)) return rMin;
        const t = (v - min) / (max - min);
        const area = aMin + t * (aMax - aMin);
        return Math.max(rMin, Math.sqrt(area));
    };
}

export const cjsBubbleChartDef: ChartTemplateDef = {
    chart: 'Bubble Chart',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'size', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const sizeField = channelSemantics.size?.field;
        const colorField = channelSemantics.color?.field;

        if (!xField || !yField) return;

        const opacity = chartProperties?.opacity ?? 0.6;
        const palette = getChartJsPalette(ctx, 'color');

        // Radius scale spans the whole dataset so groups stay comparable.
        // Treat null/empty cells as missing (NaN) rather than coercing to 0.
        const num = (raw: any): number => (raw == null || raw === '' ? NaN : Number(raw));
        const sizeValues = sizeField
            ? table.map((row) => num(row[sizeField]))
            : [];
        // Provisional radius range; postProcess refines rMax to canvas size.
        const radiusScale = makeRadiusScale(sizeValues, 5, 24);

        const toPoint = (row: any) => {
            const x = num(row[xField]);
            const y = num(row[yField]);
            // Drop points with a missing/non-numeric x or y so null values don't
            // collapse to phantom bubbles at the origin (0, 0).
            if (!isFinite(x) || !isFinite(y)) return null;
            const v = sizeField ? num(row[sizeField]) : NaN;
            return {
                x,
                y,
                r: sizeField ? radiusScale(v) : 8,
                // Raw size value retained so postProcess can rescale to canvas.
                _v: v,
            };
        };

        const config: any = {
            type: 'bubble',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    // Bubble charts scale to the data extent (not a zero
                    // baseline) and pad both ends with `grace` so large bubbles
                    // sitting at the min/max aren't clipped by the plot edge.
                    x: { type: 'linear', grace: '10%', title: { display: true, text: xField } },
                    y: { type: 'linear', grace: '10%', title: { display: true, text: yField } },
                },
                plugins: {
                    tooltip: { enabled: true },
                },
            },
        };

        if (colorField) {
            const groups = new Map<string, any[]>();
            for (const row of table) {
                const point = toPoint(row);
                if (!point) continue;
                const key = String(row[colorField] ?? '');
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(point);
            }
            let colorIdx = 0;
            for (const [name, data] of groups) {
                config.data.datasets.push({
                    label: name,
                    data,
                    backgroundColor: getSeriesBackgroundColor(palette, colorIdx, opacity),
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    borderWidth: 1,
                });
                colorIdx++;
            }
            config.options.plugins.legend = { display: true };
        } else {
            config.data.datasets.push({
                data: table.map(toPoint).filter((p) => p !== null),
                backgroundColor: getSeriesBackgroundColor(palette, 0, opacity),
                borderColor: getSeriesBorderColor(palette, 0),
                borderWidth: 1,
            });
            config.options.plugins.legend = { display: false };
        }

        // Stash size metadata so postProcess can rescale radii to the final canvas.
        config._sizeField = sizeField ?? null;

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.05, defaultValue: 0.6 },
    ],
    postProcess: (option, ctx) => {
        if (!option.data?.datasets) return;
        const sizeField: string | null = option._sizeField ?? null;
        delete option._sizeField;
        if (!sizeField) {
            // Strip helper field even when no size channel is present.
            for (const ds of option.data.datasets) for (const pt of ds.data) delete pt._v;
            return;
        }

        // Collect all raw size values to build a dataset-wide radius scale.
        const allValues: number[] = [];
        for (const ds of option.data.datasets) {
            for (const pt of ds.data) allValues.push(pt._v);
        }

        // Scale the max bubble radius to the canvas AND point density so dense
        // plots don't turn into a blob.
        const w = option._width || ctx.canvasSize.width;
        const h = option._height || ctx.canvasSize.height;
        const minDim = Math.min(w, h);
        const count = Math.max(1, allValues.length);
        const rMaxByDensity = Math.sqrt((w * h) / count * 0.08);
        const rMax = Math.max(8, Math.min(34, Math.round(Math.min(minDim * 0.09, rMaxByDensity))));
        const rMin = Math.max(3, Math.round(rMax * 0.22));
        const radiusScale = makeRadiusScale(allValues, rMin, rMax);

        for (const ds of option.data.datasets) {
            for (const pt of ds.data) {
                const v = pt._v;
                if (typeof v === 'number' && isFinite(v)) pt.r = radiusScale(v);
                delete pt._v;
            }
        }
    },
};
