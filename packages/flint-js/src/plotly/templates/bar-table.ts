// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Bar Table template.
 *
 * A ranked horizontal "data bar table" (category | gradient bar | % share |
 * value), matching the Vega-Lite Bar Table's visual pattern — common in
 * Chinese BI dashboards (FineBI, Quick BI) and Excel/Power BI conditional-
 * formatting "Data Bars".
 *
 * Composite layout, built directly on the Plotly figure rather than forced
 * through the generic column/row facet combiner (`../facet.ts`, which only
 * supports one cartesian axis pair per panel): each facet cell (or the whole
 * table, when unfaceted) gets its own hidden-margin axis pair whose `xaxis`
 * domain is narrowed to just the bar column; the category name comes for
 * free from the axis's own (native) y tick labels, and the %/value columns
 * are `layout.annotations` anchored to that SAME y-axis (so they line up
 * with each bar's row) at a fixed paper-x position — the same domain-grid +
 * mixed paper/data-axis annotation technique `sparkline.ts` and `kpi-card.ts`
 * use for their own composite grids. `selfManagesFacets` keeps the assembler
 * from pre-splitting this template by `column`/`row` (see `../assemble.ts`);
 * facets are instead built as additional cells in the same hand-rolled grid.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { getRegistryEntry } from '../../core/type-registry';

const HEADER_H = 16;
const FACET_HEADER_H = 20;
const INTER_GAP = 8;
const CELL_GAP_X = 28;
const CELL_GAP_Y = 20;
const OTHERS_GRAY = '#bdbdbd';

const isCJK = (ch: string): boolean =>
    /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch);
const textWidth = (s: unknown): number =>
    [...String(s ?? '')].reduce((a, ch) => a + (isCJK(ch) ? 2 : 1), 0);

/**
 * Truncate to an ellipsis so the text fits within `maxUnits` character-width
 * units (see `textWidth` — a CJK character counts as 2). Mirrors the effect
 * of the Vega-Lite template's `axis.labelLimit`, which Plotly's category axis
 * has no equivalent for — an over-length native tick label would otherwise
 * overflow past the figure's own left edge instead of ellipsizing.
 */
function truncateToWidth(s: string, maxUnits: number): string {
    if (textWidth(s) <= maxUnits) return s;
    const chars = [...s];
    let out = '';
    let w = 1; // reserve 1 unit for the ellipsis
    for (const ch of chars) {
        const cw = isCJK(ch) ? 2 : 1;
        if (w + cw > maxUnits) break;
        out += ch;
        w += cw;
    }
    return out.replace(/\s+$/, '') + '…';
}

/** Compact approximate number format — mirrors the Vega-Lite template's sizing/display helper. */
function approxFormat(v: number, pctPattern?: string): string {
    if (!Number.isFinite(v)) return '';
    if (pctPattern) return `${(v * 100).toFixed(1)}%`;
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    if (Number.isInteger(v)) return String(v);
    if (a > 0 && a < 1) {
        // Adaptive precision for sub-1 magnitudes — a fixed 2-decimal round
        // (e.g. toward "0.00") would silently collapse a genuinely tiny but
        // meaningful value (0.0004) down to "0". Show enough significant
        // digits to keep the value distinguishable from zero.
        const decimals = Math.min(6, Math.max(2, -Math.floor(Math.log10(a)) + 1));
        return v.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
    }
    return (Math.round(v * 100) / 100).toLocaleString('en-US');
}

/** Linear interpolation between two hex colors (sequential gradient-by-value). */
function lerpHex(c0: string, c1: string, t: number): string {
    const hex = (h: string) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
        const v = m ? parseInt(m[1], 16) : 0;
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    };
    const [r0, g0, b0] = hex(c0);
    const [r1, g1, b1] = hex(c1);
    const clamp = Math.max(0, Math.min(1, t));
    const r = Math.round(r0 + (r1 - r0) * clamp);
    const g = Math.round(g0 + (g1 - g0) * clamp);
    const b = Math.round(b0 + (b1 - b0) * clamp);
    return `rgb(${r}, ${g}, ${b})`;
}
const SEQ_LOW = '#cdebd3', SEQ_HIGH = '#41a25f';
const DIV_LOW = '#c0392b', DIV_MID = '#f2f2f2', DIV_HIGH = '#2e7d46';

/** One aggregated row: category, its ranked value, and (optional) per-color-group breakdown. */
interface AggRow {
    cat: string;
    value: number;
    isOthers: boolean;
    byColor?: Map<string, number>;
}

/** Aggregate raw rows into ranked-and-topN'd category rows for one facet scope. */
function buildScopeRows(
    rows: any[], yField: string, xField: string, colorField: string | undefined,
    useMean: boolean, maxRows: number, reversed: boolean,
): AggRow[] {
    const byCat = new Map<string, { sum: number; n: number; byColor: Map<string, number> }>();
    for (const r of rows) {
        const v = Number(r[xField]);
        if (!Number.isFinite(v)) continue;
        const cat = String(r[yField] ?? '');
        const g = byCat.get(cat) ?? { sum: 0, n: 0, byColor: new Map() };
        g.sum += v; g.n += 1;
        if (colorField) {
            const cv = String(r[colorField] ?? '');
            g.byColor.set(cv, (g.byColor.get(cv) ?? 0) + v);
        }
        byCat.set(cat, g);
    }
    const agg = (g: { sum: number; n: number }) => useMean ? g.sum / Math.max(1, g.n) : g.sum;
    const ranked = Array.from(byCat.entries())
        .map(([cat, g]) => ({ cat, value: agg(g), byColor: colorField ? g.byColor : undefined }))
        .sort((a, b) => reversed ? a.value - b.value : b.value - a.value);

    if (maxRows <= 0 || ranked.length <= maxRows) {
        return ranked.map(r => ({ ...r, isOthers: false }));
    }
    const keepN = Math.max(1, maxRows - 1);
    const kept = ranked.slice(0, keepN).map(r => ({ ...r, isOthers: false }));
    const rest = ranked.slice(keepN);
    const restSum = rest.reduce((s, r) => s + r.value, 0);
    const restValue = useMean && rest.length > 0 ? restSum / rest.length : restSum;
    const restByColor = new Map<string, number>();
    if (colorField) {
        for (const r of rest) {
            for (const [cv, v] of (r.byColor ?? new Map())) {
                restByColor.set(cv, (restByColor.get(cv) ?? 0) + v);
            }
        }
    }
    kept.push({
        cat: `Others (+${rest.length})`, value: restValue, isOthers: true,
        byColor: colorField ? restByColor : undefined,
    });
    return kept;
}

export const plBarTableDef: ChartTemplateDef = {
    chart: 'Bar Table',
    template: { mark: 'bar', encoding: {} },
    channels: ['y', 'x', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    // See file docstring — a hand-built per-cell axis-pair grid (bar + %/value
    // annotation columns), not a single cartesian panel the generic facet
    // combiner could safely split/recombine; column/row facets are built as
    // additional cells in this template's own grid instead.
    selfManagesFacets: true,
    instantiate: (spec, ctx) => {
        const { channelSemantics, chartProperties, canvasSize } = ctx;
        const yField = channelSemantics.y?.field;
        const xField = channelSemantics.x?.field;
        const colorField = channelSemantics.color?.field;
        const colField = channelSemantics.column?.field;
        const rowField = channelSemantics.row?.field;
        if (!yField || !xField) return;

        const table = (ctx.fullTable ?? ctx.table ?? []) as any[];
        if (table.length === 0) return;

        const maxRows = Math.max(0, Number(chartProperties?.maxRows ?? 20));
        const showPercent = chartProperties?.showPercent === true;
        const useMean = channelSemantics.x?.aggregationDefault === 'average';
        const reversed = !!channelSemantics.y?.reversed;

        const xEntry = getRegistryEntry(channelSemantics.x?.semanticAnnotation?.semanticType ?? 'Unknown');
        let hasNegative = false, hasPositive = false;
        for (const r of table) {
            const v = Number(r[xField]);
            if (Number.isFinite(v)) { if (v < 0) hasNegative = true; else if (v > 0) hasPositive = true; }
        }
        const isDiverging = !colorField && (
            xEntry.diverging === 'inherent'
            || (xEntry.diverging === 'conditional' && hasNegative && hasPositive)
        );

        // ── Facet grid: column/row values in first-appearance order. ─────
        //
        // Column-only facets wrap into a 2D grid when there are more panels
        // than comfortably fit at this template's own (wider-than-usual,
        // 3-sub-column) minimum panel width — the shared layout engine's
        // facet-grid decision assumes a much narrower single-axis panel, so
        // it under-wraps for this template; we make the wrap call ourselves
        // from our own minimum-width estimate instead.
        const colValues = colField ? [...new Set(table.map(r => String(r[colField])))] : [''];
        const rowValues = rowField ? [...new Set(table.map(r => String(r[rowField])))] : [''];
        const MIN_CELL_W = showPercent ? 280 : 230;
        const maxStretchW = (canvasSize ?? { width: 480 }).width * 3;
        const maxColsFit = Math.max(1, Math.floor(maxStretchW / MIN_CELL_W));
        const gridColsWanted = colField
            ? (colValues.length <= maxColsFit
                ? colValues.length
                : Math.ceil(colValues.length / Math.ceil(colValues.length / maxColsFit)))
            : 1;
        const wrapColumnOnly = !!colField && !rowField && gridColsWanted < colValues.length;

        type Cell = { colVal: string; rowVal: string; rows: any[] };
        const cells: Cell[][] = [];
        if (wrapColumnOnly) {
            for (let i = 0; i < colValues.length; i += gridColsWanted) {
                cells.push(colValues.slice(i, i + gridColsWanted).map(cv => ({
                    colVal: cv, rowVal: '',
                    rows: table.filter(r => String(r[colField!]) === cv),
                })));
            }
        } else {
            for (const rv of rowValues) {
                cells.push(colValues.map(cv => ({
                    colVal: cv, rowVal: rv,
                    rows: table.filter(r =>
                        (!colField || String(r[colField]) === cv) && (!rowField || String(r[rowField]) === rv)),
                })));
            }
        }
        const gridRows = cells.length;
        const gridCols = Math.max(1, ...cells.map(r => r.length));
        const hasFacet = gridRows > 1 || gridCols > 1;

        // ── Per-cell aggregation (Top-N rollup within each facet scope). ──
        const scoped = cells.map(row => row.map(cell =>
            buildScopeRows(cell.rows, yField, xField, colorField, useMean, maxRows, reversed)));

        const allColorValues = colorField
            ? [...new Set(scoped.flat().flatMap(sr => sr.filter(r => !r.isOthers).flatMap(r => [...(r.byColor?.keys() ?? [])])))]
            : [];

        // ── Sizing (manual — mirrors the Vega-Lite template's hand-rolled
        // panel sizing; the shared layout engine's faceted sizing doesn't
        // apply to a hand-built multi-axis grid). ─────────────────────────
        const canvas = canvasSize ?? { width: 480, height: 320 };
        const maxRowsPerCell = Math.max(1, ...scoped.flat().map(sr => sr.length));
        const density = Math.min(1, Math.max(0, (maxRowsPerCell - 12) / 40));
        const lerp = (a: number, b: number) => Math.round(a + (b - a) * density);
        const fontSize = Math.max(9, lerp(12, 10) - (hasFacet ? 2 : 0));
        const barPx = Math.max(6, lerp(16, 8));
        const gapPx = Math.max(2, Math.round(barPx * 0.2));
        const rowStep = barPx + gapPx;

        const allAggValues = scoped.flat().flatMap(sr => sr.map(r => r.value));
        const pctValuesForSizing = scoped.flat().flatMap(sr => {
            const total = sr.reduce((s, r) => s + r.value, 0);
            return Math.abs(total) > 1e-9 ? sr.map(r => r.value / total) : [];
        });
        const pctPattern = showPercent ? '%' : undefined;
        const measure = (strs: string[], minPx: number, maxPx: number) => {
            const maxChars = strs.reduce((m, s) => Math.max(m, s.length), 0);
            return Math.min(maxPx, Math.max(minPx, Math.round(maxChars * fontSize * 0.62 + 12)));
        };
        const catW = Math.min(180, Math.max(50, Math.round(
            Math.max(4, textWidth(yField), ...scoped.flat().flatMap(sr => sr.map(r => textWidth(r.cat)))) * fontSize * 0.6 + 12)));
        const catMaxUnits = Math.max(4, Math.floor((catW - 12) / (fontSize * 0.6)));
        const valW = measure([...allAggValues.map(v => approxFormat(v)), xField], 40, 110);
        const pctW = showPercent ? measure([...pctValuesForSizing.map(v => approxFormat(v, pctPattern)), '%'], 40, 70) : 0;
        const barMinW = 90;
        const cellContentW = Math.max(
            catW + barMinW + INTER_GAP + valW + (showPercent ? pctW + INTER_GAP : 0),
            Math.round((canvas.width - (gridCols - 1) * CELL_GAP_X) / gridCols),
        );
        const cellW = cellContentW;
        const barW = Math.max(barMinW, cellW - catW - valW - (showPercent ? pctW + INTER_GAP : 0) - INTER_GAP);

        const facetColHeaderBand = colField ? FACET_HEADER_H : 0;
        const facetRowHeaderW = rowField ? 18 : 0;
        const cellHeights = cells.map((row, ri) => Math.max(1, ...row.map((_, ci) => {
            const sr = scoped[ri][ci];
            return HEADER_H + (sr?.length ?? 1) * rowStep;
        })));
        const rowTotalHeights = cellHeights.map(h => h + facetColHeaderBand);
        const totalW = gridCols * cellW + (gridCols - 1) * CELL_GAP_X + facetRowHeaderW;
        // Floor the figure height so a very small row count (e.g. a single
        // row) still leaves enough vertical room for the header band and the
        // row to render legibly — otherwise the (fixed-size) header/row text
        // can visually collide in an unrealistically short image.
        const MIN_TOTAL_H = 70;
        const totalH = Math.max(
            MIN_TOTAL_H,
            rowTotalHeights.reduce((s, h) => s + h, 0) + (gridRows - 1) * CELL_GAP_Y,
        );

        const palette: string[] = ['#4C78A8', '#F58518', '#54A24B', '#B279A2', '#E45756', '#72B7B2', '#EECA3B', '#9D755D'];
        const colorIdx = new Map(allColorValues.map((v, i) => [v, i]));

        const traces: any[] = [];
        const annotations: any[] = [];
        const layout: any = { showlegend: !!colorField, margin: { t: 8, b: 8, l: 8, r: 8 } };
        const legendSeen = new Set<string>();

        let yTop = 0;
        for (let ri = 0; ri < gridRows; ri++) {
            const row = cells[ri];
            const cellTop = yTop + facetColHeaderBand;
            for (let ci = 0; ci < row.length; ci++) {
                const cell = row[ci];
                const sr = scoped[ri][ci];
                const n = ri * gridCols + ci + 1;
                const xName = n === 1 ? 'xaxis' : `xaxis${n}`;
                const yName = n === 1 ? 'yaxis' : `yaxis${n}`;
                const xRef = n === 1 ? 'x' : `x${n}`;
                const yRef = n === 1 ? 'y' : `y${n}`;

                const cellLeft = ci * (cellW + CELL_GAP_X);
                const barX0 = cellLeft + catW;
                const barX1 = barX0 + barW;
                const catNames = sr.map(r => r.cat);
                const yDomainTop = cellTop + HEADER_H;
                const yDomainBottom = yDomainTop + sr.length * rowStep;

                layout[xName] = {
                    domain: [barX0 / totalW, barX1 / totalW],
                    anchor: yRef,
                    rangemode: isDiverging ? 'normal' : 'tozero',
                    zeroline: true, zerolinecolor: '#ddd',
                    showgrid: false, showticklabels: false,
                };
                layout[yName] = {
                    domain: [1 - yDomainBottom / totalH, 1 - yDomainTop / totalH],
                    anchor: xRef,
                    type: 'category',
                    categoryorder: 'array', categoryarray: catNames,
                    autorange: 'reversed',
                    showgrid: false,
                    tickfont: { size: fontSize },
                    // Category names render as our OWN annotations (below),
                    // not native tick labels: Plotly's category axis has no
                    // `labelLimit`-style truncation, so a name longer than
                    // `catW` would just overflow past the figure's own left
                    // edge (clipped by the canvas) instead of ellipsizing —
                    // annotations let us truncate deterministically to fit.
                    showticklabels: false,
                    automargin: false,
                    ticklen: 0,
                };

                if (colorField && allColorValues.length > 0) {
                    for (const cv of allColorValues) {
                        const xs = sr.map(r => r.isOthers ? 0 : (r.byColor?.get(cv) ?? 0));
                        if (xs.every(v => v === 0)) continue;
                        traces.push({
                            type: 'bar', orientation: 'h',
                            xaxis: xRef, yaxis: yRef,
                            name: cv,
                            legendgroup: cv,
                            showlegend: !legendSeen.has(cv),
                            x: xs, y: catNames,
                            marker: { color: palette[(colorIdx.get(cv) ?? 0) % palette.length] },
                            hovertemplate: `%{y}<br>${cv}: %{x}<extra></extra>`,
                        });
                        legendSeen.add(cv);
                    }
                    const othersXs = sr.map(r => r.isOthers ? r.value : 0);
                    if (othersXs.some(v => v !== 0)) {
                        traces.push({
                            type: 'bar', orientation: 'h',
                            xaxis: xRef, yaxis: yRef,
                            name: 'Others', legendgroup: 'Others', showlegend: false,
                            x: othersXs, y: catNames,
                            marker: { color: OTHERS_GRAY },
                            hoverinfo: 'skip',
                        });
                    }
                } else {
                    const vals = sr.map(r => r.value);
                    const finite = vals.filter(Number.isFinite);
                    const vmin = finite.length ? Math.min(...finite, 0) : 0;
                    const vmax = finite.length ? Math.max(...finite) : 1;
                    const colors = sr.map(r => {
                        if (r.isOthers) return OTHERS_GRAY;
                        if (isDiverging) {
                            const span = Math.max(Math.abs(vmin), Math.abs(vmax)) || 1;
                            const t = r.value / span; // -1..1
                            return t >= 0 ? lerpHex(DIV_MID, DIV_HIGH, t) : lerpHex(DIV_MID, DIV_LOW, -t);
                        }
                        const t = (r.value - vmin) / ((vmax - vmin) || 1);
                        return lerpHex(SEQ_LOW, SEQ_HIGH, t);
                    });
                    traces.push({
                        type: 'bar', orientation: 'h',
                        xaxis: xRef, yaxis: yRef,
                        showlegend: false,
                        x: vals, y: catNames,
                        marker: { color: colors },
                        hovertemplate: `%{y}<br>${xField}: %{x}<extra></extra>`,
                    });
                }

                // ── Category / %/value text columns (annotations anchored
                // to this cell's own category axis so each row lines up with
                // its bar; see the `showticklabels: false` note above for
                // why the category name is an annotation too). ──
                const total = sr.reduce((s, r) => s + r.value, 0);
                sr.forEach((r) => {
                    const color = r.isOthers ? OTHERS_GRAY : '#666';
                    annotations.push({
                        text: truncateToWidth(r.cat, catMaxUnits),
                        x: cellLeft / totalW, y: r.cat,
                        xref: 'paper', yref: yRef,
                        xanchor: 'left', yanchor: 'middle', showarrow: false,
                        font: { size: fontSize, color: r.isOthers ? OTHERS_GRAY : '#333' },
                    });
                    if (showPercent) {
                        const pct = Math.abs(total) > 1e-9 ? r.value / total : NaN;
                        annotations.push({
                            text: Number.isFinite(pct) ? approxFormat(pct, '%') : '',
                            x: (barX1 + INTER_GAP + pctW) / totalW, y: r.cat,
                            xref: 'paper', yref: yRef,
                            xanchor: 'right', yanchor: 'middle', showarrow: false,
                            font: { size: fontSize, color: r.isOthers ? OTHERS_GRAY : '#41a25f' },
                        });
                    }
                    const valueX = showPercent ? barX1 + INTER_GAP + pctW + INTER_GAP + valW : barX1 + INTER_GAP + valW;
                    annotations.push({
                        text: approxFormat(r.value),
                        x: valueX / totalW, y: r.cat,
                        xref: 'paper', yref: yRef,
                        xanchor: 'right', yanchor: 'middle', showarrow: false,
                        font: { size: fontSize, color },
                    });
                });

                // Sub-column headers (Category / % / Value), repeated per
                // cell. `yanchor: 'top'` renders the label DOWNWARD from the
                // cell's own top edge (into the reserved `HEADER_H` band) —
                // `yanchor: 'bottom'` at the same y would need headroom above
                // the plot area itself, clipping the very first row's headers
                // against the image's top edge.
                const headerY = 1 - cellTop / totalH;
                annotations.push({
                    text: yField, x: cellLeft / totalW, y: headerY,
                    xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'top', showarrow: false,
                    font: { size: 10, color: '#999' },
                });
                if (showPercent) {
                    annotations.push({
                        text: '%', x: (barX1 + INTER_GAP + pctW) / totalW, y: headerY,
                        xref: 'paper', yref: 'paper', xanchor: 'right', yanchor: 'top', showarrow: false,
                        font: { size: 10, color: '#999' },
                    });
                }
                annotations.push({
                    text: xField,
                    x: (showPercent ? barX1 + INTER_GAP + pctW + INTER_GAP + valW : barX1 + INTER_GAP + valW) / totalW,
                    y: headerY,
                    xref: 'paper', yref: 'paper', xanchor: 'right', yanchor: 'top', showarrow: false,
                    font: { size: 10, color: '#999' },
                });

                // Facet column header (top row of each grid row only).
                if (colField && cell.colVal !== '') {
                    annotations.push({
                        text: cell.colVal,
                        x: (cellLeft + cellW / 2) / totalW, y: 1 - yTop / totalH,
                        xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'top', showarrow: false,
                        font: { size: 12, color: '#333' },
                    });
                }
                // Facet row header (rightmost cell in the row).
                if (rowField && ci === row.length - 1 && cell.rowVal !== '') {
                    annotations.push({
                        text: cell.rowVal,
                        x: (totalW - facetRowHeaderW / 2) / totalW, y: 1 - (cellTop + (yDomainBottom - yDomainTop) / 2) / totalH,
                        xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'middle', textangle: 90, showarrow: false,
                        font: { size: 12, color: '#333' },
                    });
                }
            }
            yTop += rowTotalHeights[ri] + CELL_GAP_Y;
        }

        Object.assign(spec, {
            data: traces,
            layout: { ...layout, annotations, barmode: colorField ? 'stack' : undefined },
            _width: Math.round(totalW),
            _height: Math.round(totalH),
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'maxRows', label: 'Max Rows', type: 'continuous', min: 5, max: 100, step: 1, defaultValue: 20 } as ChartPropertyDef,
        {
            key: 'showPercent', label: '% of total', type: 'binary', defaultValue: false,
            check: (ctx) => {
                const mcs = ctx.channelSemantics?.x;
                if (!mcs?.field || mcs.type !== 'quantitative' || mcs.aggregationDefault === 'average') {
                    return { applicable: false };
                }
                let sum = 0, hasNeg = false, hasPos = false, count = 0;
                for (const row of ctx.data ?? []) {
                    const v = row[mcs.field];
                    if (typeof v !== 'number' || !isFinite(v)) continue;
                    count++;
                    if (v < 0) hasNeg = true; else if (v > 0) hasPos = true;
                    sum += v;
                }
                return { applicable: count > 0 && !(hasNeg && hasPos) && Math.abs(sum) > 0 };
            },
        } as ChartPropertyDef,
    ],
};
