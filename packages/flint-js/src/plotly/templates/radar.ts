// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Radar Chart template.
 *
 * Native `scatterpolar` trace with `fill: 'toself'` — Plotly handles the
 * polar projection, axis spokes, and grid rings natively (no manual trig
 * like the Vega-Lite template needs).
 *
 * Data model (long format): x = metric name, y = value, color = entity/group.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy, getPlotlyPalette, getSeriesColor, fillColor, niceMax } from './utils';
import { computeCircumferencePressure } from '../../core/decisions';

export const plRadarChartDef: ChartTemplateDef = {
    chart: 'Radar Chart',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'position',
    // Radar is POLAR, not cartesian. The generic facet combiner (facet.ts)
    // only stitches cartesian xaxis/yaxis panels, so it collapses every
    // facet's `scatterpolar` traces into the single default `polar` subplot
    // (all regions overlaid in one radar). Opt out and lay one polar subplot
    // per facet cell out internally — mirrors the Gauge template.
    selfManagesFacets: true,
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const axisField = channelSemantics.x?.field;
        const valueField = channelSemantics.y?.field;
        const groupField = channelSemantics.color?.field;
        const columnField = channelSemantics.column?.field;
        const rowField = channelSemantics.row?.field;
        if (!axisField || !valueField) return;

        const metrics = extractCategories(table, axisField, channelSemantics.x?.ordinalSortOrder);
        if (metrics.length < 2) return;

        // Each metric is measured in its own units — grams of fat against
        // milligrams of sodium against a percentage. Sharing one radial scale
        // buries every small metric at the centre, so each axis is normalised
        // to its own nice ceiling and that ceiling is written into the spoke
        // label. This is what the Vega-Lite radar does.
        const axisMax: Record<string, number> = {};
        for (const m of metrics) {
            const vals = table
                .filter((r: any) => String(r[axisField] ?? '') === m)
                .map((r: any) => Number(r[valueField]))
                .filter((v: number) => isFinite(v));
            axisMax[m] = niceMax(vals.length > 0 ? Math.max(...vals) : 1);
        }
        const uniformScale = new Set(Object.values(axisMax)).size === 1;
        const showMax = (m: string) => {
            const mx = axisMax[m];
            return mx % 1 === 0 ? String(mx) : mx.toFixed(1);
        };
        // When every metric already shares a ceiling there is nothing to
        // reconcile: one radial scale reads for all of them, and repeating
        // "(100)" on every spoke is noise.
        const spokeLabel = (m: string) => (uniformScale ? m : `${m} (${showMax(m)})`);

        // Close the loop: repeat the first metric at the end so the polygon closes.
        const closedMetrics = [...metrics, metrics[0]].map(spokeLabel);

        const meanPerMetric = (rows: any[]) => {
            const sums = new Map<string, { sum: number; count: number }>();
            for (const row of rows) {
                const m = String(row[axisField] ?? '');
                const v = Number(row[valueField]) || 0;
                const e = sums.get(m) ?? { sum: 0, count: 0 };
                e.sum += v; e.count++;
                sums.set(m, e);
            }
            return metrics.map(m => {
                const e = sums.get(m);
                return e ? Math.round((e.sum / e.count) * 100) / 100 : 0;
            });
        };

        const filled = chartProperties?.filled !== false;
        const fillOpacity = Number(chartProperties?.fillOpacity ?? 0.3);
        const palette = getPlotlyPalette(ctx, 'color');

        // With a shared ceiling the radius stays in data units; otherwise each
        // axis is normalised to its own ceiling and the radius is a fraction.
        const radialMax = uniformScale ? axisMax[metrics[0]] : 1;

        // Consistent color per group across every facet cell.
        const groupOrder = groupField
            ? extractCategories(table, groupField, channelSemantics.color?.ordinalSortOrder)
            : [];
        const groupIdx = (name: string) => {
            const k = groupOrder.indexOf(name);
            return k >= 0 ? k : 0;
        };

        const makeTrace = (
            name: string | undefined, rows: any[], idx: number,
            polarKey: string, showlegend: boolean,
        ) => {
            const values = meanPerMetric(rows);
            const norm = uniformScale
                ? values
                : values.map((v, i) => (axisMax[metrics[i]] > 0 ? v / axisMax[metrics[i]] : 0));
            const closedValues = [...norm, norm[0]];
            const closedRaw = [...values, values[0]];
            const color = getSeriesColor(palette, idx);
            return {
                type: 'scatterpolar',
                mode: 'lines+markers',
                ...(name != null ? { name, legendgroup: name } : {}),
                showlegend,
                r: closedValues,
                theta: closedMetrics,
                customdata: closedRaw,
                hovertemplate: `%{theta}: %{customdata}${name != null ? `<br>${name}` : ''}<extra></extra>`,
                subplot: polarKey,
                _markerRole: 'secondary',
                line: { color },
                marker: { color, size: 5 },
                fill: filled ? ('toself' as const) : undefined,
                fillcolor: filled ? fillColor(color, fillOpacity) : undefined,
            };
        };

        // ── Facet grid ────────────────────────────────────────────────
        const colCats = columnField
            ? extractCategories(table, columnField, channelSemantics.column?.ordinalSortOrder)
            : [''];
        const rowCats = rowField
            ? extractCategories(table, rowField, channelSemantics.row?.ordinalSortOrder)
            : [''];
        const faceted = !!(columnField || rowField);
        const cols = Math.max(1, colCats.length);
        const gridRows = Math.max(1, rowCats.length);

        const traces: any[] = [];
        const annotations: any[] = [];
        // A polar plot carries no cartesian axis furniture, so the default
        // margins — room for a y-axis title, tick labels and an x-axis strip —
        // are 96px of width and 80px of height spent on nothing. Plotly honours
        // `margin` for a polar domain, so every pixel of it comes straight off
        // the radius.
        const layout: any = {
            showlegend: !!groupField,
            margin: { t: 12, r: 24, b: 16, l: 24 },
        };

        // The spoke labels sit outside the circle, so their width is not part
        // of the plot — it is chrome, and it has to be *reserved* rather than
        // taken out of the radius. Measure the widest one first, then make sure
        // the canvas is wide enough to hold two of them either side of a
        // legible circle.
        const MIN_RADIUS = 80;
        const widestSpokePx = Math.min(
            220,
            8 + Math.max(...metrics.map((m) => spokeLabel(m).length)) * 6.2,
        );

        let width: number;
        let height: number;
        if (faceted) {
            // One radar per cell; grow the canvas so each stays legible.
            width = Math.max(ctx.canvasSize.width, cols * 240);
            height = Math.max(ctx.canvasSize.height, gridRows * 250);
        } else {
            const p = computeCircumferencePressure(metrics.length, ctx.canvasSize, {
                minArcPx: 60,
                minRadius: MIN_RADIUS,
                maxStretch: ctx.assembleOptions?.maxStretch,
                maxStretchX: ctx.assembleOptions?.maxStretchX,
                maxStretchY: ctx.assembleOptions?.maxStretchY,
            });
            width = Math.max(p.canvasW, 2 * widestSpokePx + 2 * MIN_RADIUS + 48);
            height = p.canvasH;
        }

        const gapFrac = faceted ? 0.05 : 0;
        const cellW = (1 - gapFrac * (cols - 1)) / cols;
        const cellH = (1 - gapFrac * (gridRows - 1)) / gridRows;
        const titlePad = faceted ? 26 / height : 0;
        // Inset the polar domain by that reserved strip, so a side label stays
        // inside its own cell instead of running off the canvas or into the
        // neighbouring radar. In a facet grid the canvas is not grown per cell,
        // so there the strip is capped at a fifth of the cell or the radar
        // itself vanishes.
        const sideLabelPx = faceted
            ? Math.min(widestSpokePx, cellW * width * 0.2)
            : widestSpokePx;
        const insetXFrac = sideLabelPx / width;
        const insetYFrac = (faceted ? 16 : 14) / height;

        const legendShown = new Set<string>();
        let cellIndex = 0;
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < cols; c++) {
                const x0 = c * (cellW + gapFrac);
                const x1 = x0 + cellW;
                const yTop = 1 - r * (cellH + gapFrac);
                const y0 = yTop - cellH;
                const polarKey = cellIndex === 0 ? 'polar' : `polar${cellIndex + 1}`;

                const cellRows = table.filter((row: any) => {
                    if (columnField && String(row[columnField] ?? '') !== colCats[c]) return false;
                    if (rowField && String(row[rowField] ?? '') !== rowCats[r]) return false;
                    return true;
                });

                if (faceted) {
                    const label = [columnField ? colCats[c] : null, rowField ? rowCats[r] : null]
                        .filter(Boolean).join(' · ');
                    annotations.push({
                        text: label, xref: 'paper', yref: 'paper',
                        x: (x0 + x1) / 2, y: yTop, xanchor: 'center', yanchor: 'top',
                        showarrow: false, font: { size: 12, color: '#374151' },
                    });
                }

                layout[polarKey] = {
                    domain: {
                        x: [x0 + insetXFrac, x1 - insetXFrac],
                        y: [y0 + insetYFrac, yTop - titlePad - insetYFrac],
                    },
                    radialaxis: {
                        visible: true, range: [0, radialMax],
                        tickmode: 'array',
                        tickvals: [0.25, 0.5, 0.75, 1].map((level) => level * radialMax),
                        ticktext: uniformScale ? ['', '', '', showMax(metrics[0])] : undefined,
                        // Where each axis has its own ceiling the radius is a
                        // fraction and a number on it would name nothing — the
                        // spoke labels carry the scale instead.
                        showticklabels: uniformScale && !faceted, tickfont: { size: 9 },
                    },
                    angularaxis: {
                        rotation: 90, direction: 'clockwise',
                        tickfont: { size: faceted ? 10 : 12 },
                    },
                };

                if (groupField) {
                    for (const [name, rows] of groupBy(cellRows, groupField)) {
                        const show = !legendShown.has(name);
                        legendShown.add(name);
                        traces.push(makeTrace(name, rows, groupIdx(name), polarKey, show));
                    }
                } else {
                    traces.push(makeTrace(undefined, cellRows, 0, polarKey, false));
                }
                cellIndex++;
            }
        }

        if (faceted) layout.annotations = annotations;

        Object.assign(spec, {
            data: traces,
            layout,
            _width: width,
            _height: height,
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'filled', label: 'Fill', type: 'discrete', options: [
                { value: true, label: 'Filled (default)' },
                { value: false, label: 'Outline only' },
            ],
        } as ChartPropertyDef,
        { key: 'fillOpacity', label: 'Opacity', type: 'continuous', min: 0.05, max: 0.8, step: 0.05, defaultValue: 0.3 } as ChartPropertyDef,
    ],
};
