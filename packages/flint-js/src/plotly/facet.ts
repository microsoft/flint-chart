// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly facet grid assembly.
 *
 * Combines per-panel figures (one template instantiation per column/row cell)
 * into a single Plotly figure using per-panel axis pairs (`xaxis`/`xaxis2`/…)
 * with explicit domains — the Plotly-native equivalent of the Chart.js
 * backend's facet panel grid (chartjs/assemble.ts), mirroring its decisions:
 *   - shared, nice-rounded y-domain across all panels
 *   - only the leftmost column draws y tick labels and the y-axis title
 *   - column-only facets wrap into a 2D grid using the shared facet budget
 *   - column headers above panels, row headers rotated on the left
 *   - one legend entry per series (deduped across panels via legendgroup)
 */

/** One instantiated facet cell. */
export interface PlotlyFacetPanel {
    rowIndex: number;
    colIndex: number;
    rowHeader?: string;
    colHeader?: string;
    /** The per-panel figure produced by template.instantiate ({ data, layout }). */
    figure: any;
}

/**
 * Round a [min, max] interval outward to "nice" round numbers so the shared
 * facet axis lands its endpoints on clean tick values (same rule as the
 * Chart.js backend / Vega-Lite `nice: true`).
 */
export function niceBounds(min: number, max: number, targetTicks = 5): { min: number; max: number } {
    if (!(Number.isFinite(min) && Number.isFinite(max)) || max <= min) {
        return { min, max };
    }
    const niceNum = (range: number, round: boolean): number => {
        const exp = Math.floor(Math.log10(range));
        const frac = range / 10 ** exp;
        let niceFrac: number;
        if (round) {
            niceFrac = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
        } else {
            niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
        }
        return niceFrac * 10 ** exp;
    };
    const step = niceNum(niceNum(max - min, false) / Math.max(1, targetTicks - 1), true);
    return {
        min: Math.floor(min / step) * step,
        max: Math.ceil(max / step) * step,
    };
}

const FACET_GAP_PX = 16;
const COL_HEADER_H = 22;
const ROW_HEADER_W = 28;
const MARGIN = { l: 64, r: 24, t: 16, b: 48 };
const LEGEND_GUTTER = 96;

/**
 * Combine instantiated facet panels into one Plotly figure.
 *
 * Each panel's own `layout.xaxis` / `layout.yaxis` (category arrays, titles,
 * range modes) is copied onto that panel's axis pair; traces are re-pointed at
 * the pair. Domains are computed from the designed pixel grid so the figure
 * scales exactly like the other backends' facet output.
 */
export function plCombineFacetPanels(
    panels: PlotlyFacetPanel[],
    opts: {
        rows: number;
        cols: number;
        panelWidth: number;
        panelHeight: number;
        sharedYDomain?: { min: number; max: number };
        hasColHeader: boolean;
        hasRowHeader: boolean;
        /** Wrapped column-only facets repeat the header band above every row. */
        colHeaderPerRow: boolean;
        showLegend: boolean;
    },
): any {
    const {
        rows, cols, panelWidth, panelHeight, sharedYDomain,
        hasColHeader, hasRowHeader, colHeaderPerRow, showLegend,
    } = opts;

    // Row headers sit on the RIGHT (Vega-Lite style): the left edge is already
    // occupied by y tick labels + the y-axis title, so a left-side header would
    // collide with them in a single combined figure.
    const rowHeaderW = hasRowHeader ? ROW_HEADER_W : 0;
    const headerBands = colHeaderPerRow ? rows : (hasColHeader ? 1 : 0);

    const plotW = cols * panelWidth + (cols - 1) * FACET_GAP_PX;
    const plotH = rows * panelHeight + (rows - 1) * FACET_GAP_PX
        + headerBands * COL_HEADER_H;
    const totalW = MARGIN.l + plotW + rowHeaderW + MARGIN.r + (showLegend ? LEGEND_GUTTER : 0);
    const totalH = MARGIN.t + plotH + MARGIN.b;

    // Paper-fraction geometry (Plotly domains live inside the margins).
    const paperW = plotW + rowHeaderW;
    const paperH = plotH;
    const xFrac = (px: number) => px / paperW;
    const yFrac = (px: number) => px / paperH;

    const colX0 = (ci: number) => ci * (panelWidth + FACET_GAP_PX);
    // Row band top (px from paper top), accounting for header bands.
    const rowY0 = (ri: number) => (colHeaderPerRow
        ? ri * (COL_HEADER_H + panelHeight + FACET_GAP_PX) + COL_HEADER_H
        : (hasColHeader ? COL_HEADER_H : 0) + ri * (panelHeight + FACET_GAP_PX));

    const figure: any = {
        data: [],
        layout: {
            margin: { ...MARGIN },
            showlegend: showLegend,
            annotations: [],
        },
        _facet: true,
        _facetRows: rows,
        _facetCols: cols,
        _width: totalW,
        _height: totalH,
    };
    figure.layout.width = totalW;
    figure.layout.height = totalH;

    const seenLegend = new Set<string>();
    let seenColorScale = false;
    let scaleMin = Infinity;
    let scaleMax = -Infinity;
    for (const panel of panels) {
        for (const trace of panel.figure?.data ?? []) {
            const markerColors = Array.isArray(trace?.marker?.color) ? trace.marker.color : [];
            const zValues = Array.isArray(trace?.z) ? trace.z.flat(Infinity) : [];
            for (const values of [markerColors, zValues]) {
                for (const value of values) {
                    if (value == null) continue;
                    const number = Number(value);
                    if (!Number.isFinite(number)) continue;
                    scaleMin = Math.min(scaleMin, number);
                    scaleMax = Math.max(scaleMax, number);
                }
            }
        }
    }
    const globalScale = Number.isFinite(scaleMin) && Number.isFinite(scaleMax)
        ? { min: scaleMin, max: scaleMax }
        : null;

    for (const panel of panels) {
        const { rowIndex: ri, colIndex: ci } = panel;
        const n = ri * cols + ci + 1;
        const xName = n === 1 ? 'xaxis' : `xaxis${n}`;
        const yName = n === 1 ? 'yaxis' : `yaxis${n}`;
        const xRef = n === 1 ? 'x' : `x${n}`;
        const yRef = n === 1 ? 'y' : `y${n}`;

        const x0 = xFrac(colX0(ci));
        const x1 = xFrac(colX0(ci) + panelWidth);
        // Plotly y-domain runs bottom-up; our rows run top-down.
        const yTopPx = rowY0(ri);
        const y1 = 1 - yFrac(yTopPx);
        const y0 = 1 - yFrac(yTopPx + panelHeight);

        const panelLayout = panel.figure?.layout ?? {};
        for (const key of ['barmode', 'barnorm'] as const) {
            if (panelLayout[key] != null && figure.layout[key] == null) {
                figure.layout[key] = panelLayout[key];
            }
        }
        const polarPanel = (panel.figure?.data ?? []).some((trace: any) =>
            trace?.type === 'barpolar' || trace?.type === 'scatterpolar');
        const polarName = n === 1 ? 'polar' : `polar${n}`;
        if (polarPanel) {
            figure.layout[polarName] = {
                ...(panelLayout.polar ?? {}),
                domain: { x: [x0, x1], y: [y0, y1] },
            };
        } else {
            const xAxis: any = { ...(panelLayout.xaxis ?? {}), domain: [x0, x1], anchor: yRef };
            const yAxis: any = { ...(panelLayout.yaxis ?? {}), domain: [y0, y1], anchor: xRef };

            if (sharedYDomain) {
                yAxis.range = [sharedYDomain.min, sharedYDomain.max];
                delete yAxis.rangemode;
            }
            if (ci > 0) {
                yAxis.showticklabels = false;
                delete yAxis.title;
            }
            if (ri < rows - 1) delete xAxis.title;

            figure.layout[xName] = xAxis;
            figure.layout[yName] = yAxis;
        }

        for (const trace of panel.figure?.data ?? []) {
            const placed: any = polarPanel
                ? { ...trace, subplot: polarName }
                : { ...trace, xaxis: xRef, yaxis: yRef };
            if (globalScale && Array.isArray(placed.marker?.color)) {
                placed.marker = {
                    ...placed.marker,
                    cmin: globalScale.min,
                    cmax: globalScale.max,
                };
            }
            if (globalScale && Array.isArray(placed.z)) {
                placed.zmin = globalScale.min;
                placed.zmax = globalScale.max;
            }
            const carriesScale = placed.marker?.showscale === true
                || placed.showscale === true
                || (placed.type === 'heatmap' && placed.showscale !== false);
            if (carriesScale) {
                if (seenColorScale) {
                    if (placed.marker?.showscale === true) placed.marker = { ...placed.marker, showscale: false };
                    if (placed.showscale === true || placed.type === 'heatmap') placed.showscale = false;
                } else {
                    seenColorScale = true;
                }
            }
            const legendKey = String(placed.name ?? '');
            if (legendKey) {
                const dimension = placed._themeRole === 'factored-line-legend-proxy'
                    ? placed._colorLegendValue ? 'color' : 'dash'
                    : '';
                const dedupeKey = dimension ? `${dimension}:${legendKey}` : legendKey;
                placed.legendgroup = dedupeKey;
                placed.showlegend = placed.showlegend === false
                    ? false
                    : !seenLegend.has(dedupeKey);
                seenLegend.add(dedupeKey);
            } else {
                placed.showlegend = false;
            }
            figure.data.push(placed);
        }

        // Column header annotation (per wrapped row, or once on the top row).
        if (panel.colHeader != null && (colHeaderPerRow || ri === 0)) {
            figure.layout.annotations.push({
                text: String(panel.colHeader),
                showarrow: false,
                xref: 'paper', yref: 'paper',
                x: (x0 + x1) / 2,
                y: 1 - yFrac(yTopPx - COL_HEADER_H / 2),
                xanchor: 'center', yanchor: 'middle',
                font: { size: 12 },
            });
        }

        // Row header annotation (rightmost side, Vega-Lite style), rotated.
        if (panel.rowHeader != null && ci === cols - 1) {
            figure.layout.annotations.push({
                text: String(panel.rowHeader),
                showarrow: false,
                textangle: 90,
                xref: 'paper', yref: 'paper',
                x: xFrac(plotW + rowHeaderW / 2),
                y: (y0 + y1) / 2,
                xanchor: 'center', yanchor: 'middle',
                font: { size: 12 },
            });
        }
    }

    if (!showLegend) {
        figure.layout.showlegend = false;
    }

    return figure;
}
