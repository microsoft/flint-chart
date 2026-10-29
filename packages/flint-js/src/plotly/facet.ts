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

import { PLOTLY_PROFILE, AXIS_TITLE_STANDOFF } from './profile';
import { cutToWidth } from '../core/backend-frame';
import { tableTextMeasurer } from '../core/text-width';
import { PLOTLY_FONT } from './profile';
import { PLOTLY_FACET_GAP, plAxisTitleRoom, plKeyBlock, plLabelDepth, plTickRun, plYTickTexts } from './frame';

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

const FACET_GAP_PX = PLOTLY_FACET_GAP;
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

    const cells: FacetCell[] = [];
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
            // A panel with another below it in its column leaves the x labels and title to that one,
            // where the axis runs continuous and so can share its range.
            const below = panels.some((p) => p.colIndex === ci && p.rowIndex === ri + 1);
            const banded = xAxis.type === 'category' || Array.isArray(xAxis.categoryarray);
            if (below) {
                delete xAxis.title;
                if (!banded) xAxis.showticklabels = false;
            }
            if (!banded && n > 1) xAxis.matches = 'x';
            cells.push({ ri, ci, xName, yName, below, banded });

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
                _facetHeader: { kind: 'column', ri, ci },
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
                _facetHeader: { kind: 'row', ri, ci },
            });
        }
    }

    if (!showLegend) {
        figure.layout.showlegend = false;
    }

    // Stacked rows share one y title, as one measure runs down them all: repeated, each would run
    // past its own panel into the next.
    if (rows > 1) {
        const first = cells.find((c) => c.ci === 0);
        const yTitle = first ? figure.layout[first.yName]?.title : undefined;
        const text = typeof yTitle === 'string' ? yTitle : yTitle?.text;
        for (const cell of cells) delete figure.layout[cell.yName]?.title;
        if (text && String(text).trim()) {
            figure.layout.annotations.push({
                text: String(text), showarrow: false, textangle: -90,
                xref: 'paper', yref: 'paper', x: 0, y: 0.5, xanchor: 'center', yanchor: 'middle',
                font: { size: (typeof yTitle === 'object' && yTitle?.font?.size) || 14 },
                _facetAxisTitle: 'y',
            });
        }
    }
    // Columns side by side share one x title, centred under the grid: repeated, a title longer
    // than its panel runs into the next one's.
    if (cols > 1) {
        const last = cells.find((c) => !c.below && layoutTitleText(figure.layout[c.xName]?.title));
        const xTitle = last ? figure.layout[last.xName].title : undefined;
        for (const cell of cells) delete figure.layout[cell.xName]?.title;
        if (xTitle) {
            figure.layout.annotations.push({
                text: layoutTitleText(xTitle), showarrow: false,
                xref: 'paper', yref: 'paper', x: 0.5, y: 0, xanchor: 'center', yanchor: 'top',
                font: { size: (typeof xTitle === 'object' && xTitle?.font?.size) || 14 },
                _facetAxisTitle: 'x',
            });
        }
    }
    figure._facetGrid = { rows, cols, panelWidth, panelHeight, cells, hasColHeader, hasRowHeader, colHeaderPerRow, showLegend } satisfies FacetGrid;
    return figure;
}

function layoutTitleText(title: any): string {
    const text = typeof title === 'string' ? title : title?.text;
    return typeof text === 'string' ? text.trim() : '';
}

interface FacetCell { ri: number; ci: number; xName: string; yName: string; below: boolean; banded: boolean }
interface FacetGrid {
    rows: number; cols: number; panelWidth: number; panelHeight: number; cells: FacetCell[];
    hasColHeader: boolean; hasRowHeader: boolean; colHeaderPerRow: boolean; showLegend: boolean;
}

/**
 * Lay the grid out around what it draws, once its labels are set ({@link PLOTLY_PROFILE}): the y
 * labels, their tick run and the shared title left of the first column; the x labels and title under
 * each column's last panel; a header band over each row of headers; rows apart by the x labels a row
 * shows (a banded axis names every panel's bands) and the gap; columns apart by the gap; row headers
 * and the key on the right. Times along x are thinned to round, flat ticks the panel's width holds.
 * Panels keep their planned size; the figure is the grid and its margins.
 */
export function plLayoutFacetGrid(figure: any, measure: (fontSize: number) => (text: string) => number): void {
    const grid: FacetGrid | undefined = figure?._facetGrid;
    const layout = figure?.layout;
    if (!grid || !layout) return;
    delete figure._facetGrid;
    figure._facetTicked = true;
    const { rows, cols, panelWidth, panelHeight, cells } = grid;
    const pad = PLOTLY_PROFILE.axisPad;
    // Rows keep apart the y labels that stand at their panels' ends, half a line past each.
    const firstY = layout[cells.find((c) => c.ci === 0)?.yName ?? 'yaxis'];
    const rowGap = Math.max(FACET_GAP_PX, Math.ceil((Number(firstY?.tickfont?.size) || 12) * PLOTLY_PROFILE.labelBoxHeight) + 4);

    // Values down y: as many round ticks as a panel's height holds, shared by every panel, the range
    // rounded out to the step so it starts and ends on a labelled tick, as Vega-Lite's nice domain does.
    const yKeys = cells.map((c) => c.yName).filter((k) => layout[k] && layout[k].type !== 'category' && layout[k].type !== 'log');
    const yValues: number[] = [];
    for (const trace of figure.data ?? []) {
        if (trace?.orientation === 'h') continue;
        for (const v of trace?.y ?? []) { const n = Number(v); if (v != null && v !== '' && Number.isFinite(n)) yValues.push(n); }
    }
    if (yKeys.length && yValues.length > 1) {
        const first = layout[yKeys[0]];
        const fontSize = Number(first.tickfont?.size) || 12;
        const stated = Array.isArray(first.range) ? first.range.map(Number) : undefined;
        const lo = Math.min(...yValues, ...(stated && stated[0] <= 0 ? [stated[0]] : []));
        const hi = Math.max(...yValues);
        if (hi > lo) {
            const count = Math.max(2, Math.min(8, Math.floor(panelHeight / Math.max(28, fontSize * 2.6))));
            const step = niceStep(lo, hi, count);
            const range = [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
            for (const k of yKeys) {
                Object.assign(layout[k], { range, autorange: false, tick0: 0, dtick: step, _framedTicks: true });
                delete layout[k].nticks;
            }
        }
    }

    // Times along x: as many round ticks as the panel holds flat.
    let overhang = 0;
    for (const cell of cells) {
        const ax = layout[cell.xName];
        if (!ax || cell.banded) continue;
        const size = Number(ax.tickfont?.size) || 12;
        const sample = measure(size)('2000');
        if (ax.type === 'date' || isDateAxis(figure, cell)) {
            // Provisional: the ticks are set from the panel's drawn width once the figure's width is
            // final ({@link plFacetTimeTicks}).
            ax.nticks = Math.max(2, Math.floor(panelWidth / (sample * 2.2)));
            ax.tickangle = 0;
            ax._framedTicks = true;
        }
        // A continuous axis may label its ends, half a label past each edge of the panel.
        if (ax.showticklabels !== false) overhang = Math.max(overhang, sample);
    }
    // Panels side by side that both label their ends keep those labels apart.
    const gap = cols > 1 && overhang > 0 ? Math.max(FACET_GAP_PX, Math.ceil(overhang) + 6) : FACET_GAP_PX;

    const headerFont = (kind: 'column' | 'row') => Number((layout.annotations ?? []).find((a: any) => a?._facetHeader?.kind === kind)?.font?.size) || 12;
    const headerBand = grid.hasColHeader ? Math.ceil(headerFont('column') * PLOTLY_PROFILE.labelBoxHeight) + 6 : 0;
    const rowHeaderWidth = grid.hasRowHeader ? Math.ceil(headerFont('row') * PLOTLY_PROFILE.labelBoxHeight) + 8 : 0;
    const xDepth = (cell: FacetCell): number => {
        const ax = layout[cell.xName];
        if (!ax || ax.showticklabels === false) return 0;
        const size = Number(ax.tickfont?.size) || 12;
        const texts: string[] = Array.isArray(ax.ticktext) ? ax.ticktext.map(String) : Array.isArray(ax.categoryarray) ? ax.categoryarray.map(String) : ['2000'];
        const angle = Math.abs(Number(ax.tickangle) || 0) * Math.PI / 180;
        const labels = angle > 0
            ? Math.max(0, ...texts.flatMap((t) => t.split('<br>')).map(measure(size))) * Math.sin(angle) + size * Math.cos(angle)
            : plLabelDepth(Math.max(1, ...texts.map((t) => t.split('<br>').length)), size);
        return Math.ceil(labels + plTickRun(ax));
    };
    // The labels a row shows under its panels, and the title under a column's last panel.
    const rowFoot = (ri: number) => Math.max(0, ...cells.filter((c) => c.ri === ri && c.below).map(xDepth));
    const sharedX = (layout.annotations ?? []).find((a: any) => a?._facetAxisTitle === 'x');
    const sharedXRoom = sharedX ? Math.ceil(AXIS_TITLE_STANDOFF + (Number(sharedX.font?.size) || 14) * 1.2) : 0;
    const bottomFoot = Math.max(0, ...cells.filter((c) => !c.below).map((c) => xDepth(c) + (sharedX ? sharedXRoom : plAxisTitleRoom(layout[c.xName]))));
    const lastLabels = Math.max(0, ...cells.filter((c) => !c.below).map(xDepth));

    // Rows top-down, in px from the grid's top.
    const headerRows = grid.colHeaderPerRow ? rows : grid.hasColHeader ? 1 : 0;
    const rowTop: number[] = [];
    let y = 0;
    for (let ri = 0; ri < rows; ri++) {
        if (grid.colHeaderPerRow || (grid.hasColHeader && ri === 0)) y += headerBand;
        rowTop.push(y);
        y += panelHeight + (ri < rows - 1 ? rowFoot(ri) + rowGap : 0);
    }
    const gridHeight = y;
    void headerRows;
    const gridWidth = cols * panelWidth + (cols - 1) * gap;

    // Left of the first column: the widest y labels, their run and the shared or own title.
    const first = layout[cells.find((c) => c.ci === 0)?.yName ?? 'yaxis'];
    const ySize = Number(first?.tickfont?.size) || 12;
    const yLabels = first && first.showticklabels !== false
        ? Math.max(0, ...plYTickTexts({ ...figure, layout: { ...layout, yaxis: first } }).map(measure(ySize))) + plTickRun(first)
        : 0;
    const sharedTitle = (layout.annotations ?? []).find((a: any) => a?._facetAxisTitle === 'y');
    const titleSize = Number(sharedTitle?.font?.size) || 14;
    const yTitle = sharedTitle ? Math.ceil(AXIS_TITLE_STANDOFF + titleSize * 0.7) : plAxisTitleRoom(first);
    const left = Math.ceil(pad + yLabels + yTitle);
    const right = Math.max(2 * PLOTLY_PROFILE.edge, rowHeaderWidth + PLOTLY_PROFILE.edge);
    const bottom = Math.ceil(pad + bottomFoot);
    const paperW = gridWidth + rowHeaderWidth;
    const top = layout.margin?.t ?? 16;

    for (const cell of cells) {
        const x0 = cell.ci * (panelWidth + gap);
        const domainX: [number, number] = [x0 / paperW, (x0 + panelWidth) / paperW];
        const yTop = rowTop[cell.ri];
        const domainY: [number, number] = [1 - (yTop + panelHeight) / gridHeight, 1 - yTop / gridHeight];
        if (layout[cell.xName]) layout[cell.xName].domain = domainX;
        if (layout[cell.yName]) layout[cell.yName].domain = domainY;
    }
    for (const a of layout.annotations ?? []) {
        const h = a?._facetHeader;
        if (h?.kind === 'column') {
            const x0 = h.ci * (panelWidth + gap);
            a.x = (x0 + panelWidth / 2) / paperW;
            a.y = 1 - (rowTop[h.ri] - headerBand / 2) / gridHeight;
        } else if (h?.kind === 'row') {
            a.x = (gridWidth + rowHeaderWidth / 2) / paperW;
            a.y = 1 - (rowTop[h.ri] + panelHeight / 2) / gridHeight;
        }
        if (a?._facetAxisTitle === 'x') {
            a.x = gridWidth / 2 / paperW;
            a.y = -(lastLabels + AXIS_TITLE_STANDOFF) / gridHeight;
        }
        // A header longer than its panel is cut there, as Vega-Lite cuts it at its label limit.
        if (h) {
            const size = Number(a.font?.size) || 12;
            a.text = cutToWidth(String(a.text ?? ''), h.kind === 'row' ? panelHeight : panelWidth + gap - 4, measure(size));
        }
        if (a?._facetAxisTitle === 'y') {
            // Centred on the grid's rows, its baseline the standoff past the labels.
            a.x = -(yLabels + AXIS_TITLE_STANDOFF + titleSize * 0.35) / paperW;
            a.y = 1 - (rowTop[0] + (rowTop[rows - 1] + panelHeight - rowTop[0]) / 2) / gridHeight;
        }
    }
    for (const a of layout.annotations ?? []) { delete a._facetHeader; delete a._facetAxisTitle; }

    const key = grid.showLegend ? plKeyBlock({ ...figure, layout: { ...layout, legend: { ...(layout.legend ?? {}), orientation: 'v' } } }, 'vertical') : undefined;
    const keyRoom = key ? key.width + PLOTLY_PROFILE.key.gap + 16 : 0;
    layout.margin = { ...(layout.margin ?? {}), l: left, r: right, b: bottom, t: top };
    layout.width = Math.ceil(left + paperW + right + keyRoom);
    layout.height = Math.ceil(top + gridHeight + bottom);
    figure._width = layout.width;
    figure._height = layout.height;
}

/** The step d3 and Vega tick a span with about `count` ticks: 1, 2 or 5 times a power of ten. */
function niceStep(lo: number, hi: number, count: number): number {
    const raw = (hi - lo) / Math.max(1, count);
    const power = 10 ** Math.floor(Math.log10(raw));
    const error = raw / power;
    return power * (error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1);
}

/**
 * The year ticks of each facet panel's time axis, set from the panel's drawn width once the figure's
 * width is final (a title may have widened it past the plan). The rule is Vega-Lite's temporal tick
 * plan (`planTemporalTicks`): the finest calendar step at which every label stands apart from the next
 * by half of each one's width and a separation of 0.6 em, measured in the face the labels are drawn
 * in. Spans under two years keep Plotly's own date ticks.
 */
export function plFacetTimeTicks(figure: any): void {
    const layout = figure?.layout;
    if (!figure?._facet || !layout) return;
    const width = Number(layout.width) || 0;
    const margin = layout.margin ?? {};
    const paper = width - (margin.l ?? 0) - (margin.r ?? 0);
    for (const [key, ax] of Object.entries<any>(layout)) {
        const match = /^xaxis(\d*)$/.exec(key);
        if (!match || !ax || ax.type === 'category' || ax.tickvals != null && !ax._yearTicks) continue;
        const ref = `x${match[1]}`;
        const times: number[] = [];
        for (const trace of figure.data ?? []) {
            if ((trace?.xaxis ?? 'x') !== ref) continue;
            for (const v of trace?.x ?? []) {
                const t = typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? Date.parse(v) : v instanceof Date ? v.getTime() : NaN;
                if (Number.isFinite(t)) times.push(t);
            }
        }
        if (times.length < 2) continue;
        const start = Math.min(...times);
        const end = Math.max(...times);
        const y0 = new Date(start).getUTCFullYear();
        const y1 = new Date(end).getUTCFullYear();
        if (y1 - y0 < 2) continue;
        const domain = Array.isArray(ax.domain) ? Math.abs(ax.domain[1] - ax.domain[0]) : 1;
        const span = paper * domain;
        const fontSize = Number(ax.tickfont?.size ?? layout.font?.size) || 12;
        const widthOf = tableTextMeasurer(fontSize, ax.tickfont?.family ?? layout.font?.family ?? PLOTLY_FONT, 'normal', 'normal');
        const gap = Math.round(fontSize * 0.6);
        const at = (year: number) => (Date.UTC(year, 0, 1) - start) / (end - start) * span;
        let chosen: number[] | undefined;
        for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) {
            const years: number[] = [];
            for (let y = Math.ceil(y0 / step) * step; Date.UTC(y, 0, 1) <= end; y += step) if (Date.UTC(y, 0, 1) >= start) years.push(y);
            if (!years.length) continue;
            const fits = years.every((y, i) => i === 0 || at(y) - at(years[i - 1]) >= (widthOf(String(y)) + widthOf(String(years[i - 1]))) / 2 + gap);
            if (fits) { chosen = years; break; }
        }
        if (!chosen) continue;
        Object.assign(ax, {
            tickmode: 'array',
            tickvals: chosen.map((y) => `${y}-01-01`),
            ticktext: chosen.map(String),
            tickangle: 0,
            _yearTicks: true,
        });
        delete ax.nticks;
    }
}

/** Whether a panel's x axis carries times (a date axis Plotly infers from its traces' values). */
function isDateAxis(figure: any, cell: FacetCell): boolean {
    const ref = cell.xName.replace('axis', '');
    const trace = (figure.data ?? []).find((t: any) => (t?.xaxis ?? 'x') === ref);
    const first = trace?.x?.find?.((v: unknown) => v != null);
    return typeof first === 'string' && /^\d{4}-\d{2}(-\d{2})?/.test(first) || first instanceof Date;
}
