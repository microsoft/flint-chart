// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Rose Chart (Nightingale / Coxcomb) template.
 *
 * Contrast with VL:
 *   VL: mark = "arc" with theta (angular extent fixed per slice) + radius (value)
 *   EC: series type = 'bar' with coordinateSystem = 'polar',
 *       angleAxis (categorical — directions/categories) +
 *       radiusAxis (value — the measure mapped to wedge radius).
 *
 * Data model (long format):
 *   x (nominal): angular category (direction, month, etc.)
 *   y (quantitative): value mapped to wedge radius
 *   color (nominal, optional): stack / group variable — stacked rose (one series per group).
 *   Without color: single polar bar series with one data item per category (each item named for
 *   legend). Multiple series would be grouped by ECharts and shrink each petal — wrong geometry.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy, computeCircumferencePressure } from './utils';

/**
 * Invisible pie series: polar `bar` has no `legendVisualProvider`, so ECharts would draw zero
 * legend rows (see LegendView.renderInner). Slices are not shown (radius 0); only names/colors
 * feed the legend. Must match `ecApplyLayoutToSpec` / facet polar merge.
 */
export const EC_ROSE_LEGEND_BRIDGE_SERIES_NAME = '__dfRoseLegendBridge__';

/**
 * Map a raw measure to a wedge radius so that wedge AREA (not radius) is
 * proportional to the value. ECharts' polar `radiusAxis` is linear (there is no
 * `sqrt` axis type), so — unlike Vega-Lite which sets `radius.scale.type = 'sqrt'`
 * — we transform the data itself. The true value is preserved on each data item
 * (`_rawValue`) for the tooltip. Guards against negatives (sqrt(NaN)).
 */
function roseRadius(value: number): number {
    return Math.sqrt(Math.max(0, value));
}

export const ecRoseChartDef: ChartTemplateDef = {
    chart: 'Rose Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const catField = channelSemantics.x?.field;   // angular categories
        const valField = channelSemantics.y?.field;    // wedge radius value
        const colorField = channelSemantics.color?.field; // stack groups

        if (!catField || !valField) return;

        // Extract unique angular categories (directions, months, etc.)
        const categories = extractCategories(table, catField, channelSemantics.x?.ordinalSortOrder);
        if (categories.length === 0) return;

        // Slice ordering (design choice): default keeps the category order;
        // sorting by value reorders the angular wedges by their radius sum.
        const sortSlices = ctx.chartProperties?.sortSlices;
        if (sortSlices === 'descending' || sortSlices === 'ascending') {
            const totals = new Map<string, number>();
            for (const c of categories) totals.set(c, 0);
            for (const row of table) {
                const c = String(row[catField] ?? '');
                if (totals.has(c)) totals.set(c, totals.get(c)! + (Number(row[valField]) || 0));
            }
            categories.sort((a, b) =>
                sortSlices === 'descending'
                    ? (totals.get(b) ?? 0) - (totals.get(a) ?? 0)
                    : (totals.get(a) ?? 0) - (totals.get(b) ?? 0),
            );
        }

        // Build series data
        const seriesArr: any[] = [];
        const legendData: string[] = [];

        if (colorField) {
            // Stacked rose: one series per color group. ECharts stacks by SUMMING
            // data values, so to make each segment's AREA proportional to its value
            // we feed the incremental radius sqrt(cumsum) - sqrt(prevCumsum). The
            // outer edge of each segment then sits at sqrt(total-so-far), mirroring
            // Vega-Lite's stacked sqrt radius scale.
            const groups = groupBy(table, colorField);
            const cumSum = categories.map(() => 0);

            for (const [name, rows] of groups) {
                legendData.push(name);

                // Aggregate: sum per category
                const catAgg = new Map<string, number>();
                for (const row of rows) {
                    const cat = String(row[catField] ?? '');
                    const val = Number(row[valField]) || 0;
                    catAgg.set(cat, (catAgg.get(cat) ?? 0) + val);
                }

                const data = categories.map((c, i) => {
                    const val = catAgg.get(c) ?? 0;
                    const prev = cumSum[i];
                    const next = prev + val;
                    cumSum[i] = next;
                    // Incremental radius so the stacked outer edge lands at sqrt(next).
                    return { value: roseRadius(next) - roseRadius(prev), _rawValue: val };
                });

                seriesArr.push({
                    type: 'bar',
                    name,
                    data,
                    coordinateSystem: 'polar',
                    stack: 'rose',
                    emphasis: { focus: 'series' },
                });
            }
        } else {
            // No color channel: one series, one value per angle — full wedge width. Per-item colors
            // + legend are applied in ecApplyLayoutToSpec (multi-series would trigger grouped barWidth).
            const catAgg = new Map<string, number>();
            for (const row of table) {
                const cat = String(row[catField] ?? '');
                const val = Number(row[valField]) || 0;
                catAgg.set(cat, (catAgg.get(cat) ?? 0) + val);
            }

            const values = categories.map(c => catAgg.get(c) ?? 0);
            for (const c of categories) {
                legendData.push(String(c));
            }

            seriesArr.push({
                type: 'bar',
                data: categories.map((c, i) => ({
                    value: roseRadius(values[i]),
                    name: String(c),
                    _rawValue: values[i],
                })),
                coordinateSystem: 'polar',
                emphasis: { focus: 'series' },
            });
            // Legend binding (bar alone does not implement legendVisualProvider in ECharts).
            seriesArr.push({
                type: 'pie',
                name: EC_ROSE_LEGEND_BRIDGE_SERIES_NAME,
                z: -10,
                silent: true,
                tooltip: { show: false },
                radius: 0,
                center: ['50%', '50%'],
                label: { show: false },
                labelLine: { show: false },
                emphasis: { disabled: true },
                data: categories.map(c => ({
                    name: String(c),
                    value: 1,
                    label: { show: false },
                    labelLine: { show: false },
                })),
            });
        }

        // Alignment: 'center' puts wedge center at 12 o'clock,
        // 'left' puts wedge left edge at 12 o'clock.
        const alignment = ctx.chartProperties?.alignment ?? 'left';
        const n = categories.length;
        // ECharts angleAxis: startAngle is where the first wedge's LEFT edge begins,
        // and categories proceed clockwise (decreasing angle).
        // Left alignment: startAngle=90 → left edge at top.
        // Center alignment: shift forward (increase) by half a wedge so the center lands at top.
        const startAngle = alignment === 'center' && n > 0
            ? 90 + 180 / n
            : 90;

        const hasLegend = legendData.length > 0;

        // Estimate legend width from label text
        const maxLabelLen = hasLegend ? Math.max(...legendData.map(d => d.length), 3) : 0;
        const estimatedLegendWidth = hasLegend ? Math.min(150, maxLabelLen * 7 + 40) : 0;

        // ── Circumference-pressure sizing (spring model) ──────────────
        // Rose: uniform angular width — each petal is one "bar".
        const { radius: pressureRadius, canvasW: rawCanvasW, canvasH }
            = computeCircumferencePressure(categories.length, ctx.canvasSize, {
                minArcPx: 45,
                minRadius: 80,
                maxStretch: ctx.assembleOptions?.maxStretch,
                maxStretchX: ctx.assembleOptions?.maxStretchX,
                maxStretchY: ctx.assembleOptions?.maxStretchY,
            });

        // Canvas size — grow width to fit legend without squeezing the chart
        const canvasW = rawCanvasW + (hasLegend ? estimatedLegendWidth : 0);

        // Shrink polar radius and shift center left to leave room for legend
        const polarRadius = hasLegend
            ? Math.min(pressureRadius, (canvasW - estimatedLegendWidth - 40) / 2, (canvasH - 40) / 2)
            : pressureRadius;
        const polarCenter = hasLegend
            ? [`${Math.round((canvasW - estimatedLegendWidth) / 2)}px`, '50%']
            : undefined;

        const option: any = {
            tooltip: {
                trigger: 'item',
                // Radii are sqrt-transformed for area-truth; show the true value
                // (stashed on each data item as `_rawValue`) instead of the radius.
                formatter: (params: any) => {
                    const raw = params?.data?._rawValue;
                    const shown = raw != null ? raw : params?.value;
                    const cat = params?.name != null && params.name !== '' ? String(params.name) : '';
                    const series = params?.seriesName;
                    const head = series && series !== cat
                        ? (cat ? `${cat} · ${series}` : String(series))
                        : cat;
                    const marker = params?.marker ?? '';
                    return `${marker}${head}: <b>${shown}</b>`;
                },
            },
            angleAxis: {
                type: 'category',
                data: categories,
                startAngle,
            },
            radiusAxis: {
                // hide axis line for cleaner look
                axisLine: { show: false },
                axisTick: { show: false },
                // Radii encode sqrt(value); showing the raw sqrt tick numbers would
                // misrepresent the scale, so suppress them (values live in tooltips).
                axisLabel: { show: false },
            },
            polar: {
                radius: polarRadius,
                ...(polarCenter != null ? { center: polarCenter } : {}),
            },
            series: seriesArr,
            // 颜色调色板由 color-decisions / ecApplyLayoutToSpec 注入到 option.color
            // Canvas size
            _width: canvasW,
            _height: canvasH,
        };

        if (hasLegend) {
            option.legend = {
                data: legendData,
                type: legendData.length > 8 ? 'scroll' : 'plain',
                orient: 'vertical',
                right: 10,
                top: 'middle',
                textStyle: { fontSize: 11 },
            };
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'alignment', label: 'Alignment', type: 'discrete', options: [
                { value: 'left', label: 'Left (default)' },
                { value: 'center', label: 'Center' },
            ],
        } as ChartPropertyDef,
        {
            key: 'sortSlices', label: 'Sort slices', type: 'discrete', options: [
                { value: 'none', label: 'Data order' },
                { value: 'descending', label: 'Largest first' },
                { value: 'ascending', label: 'Smallest first' },
            ],
            defaultValue: 'none',
        } as ChartPropertyDef,
    ],
};
