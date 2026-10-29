// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The frame around a Plotly figure, measured as the layout measures Vega-Lite's but drawn in Plotly's
 * idiom: a legend beside the plot (Plotly's default) whose long names stand on lines (`<br>`), or a
 * horizontal legend at the foot where it will not stand beside it; axis titles longer than their axes
 * on two lines; many lines thinned. The figure keeps the plot the layout planned; its margins hold
 * what is measured around it.
 */

import type { InstantiateContext } from '../core/types';
import { tableTextMeasurer } from '../core/text-width';
import { fitAxisTitle } from '../core/axis-title-fit';
import { planKeyLayout, type KeyToLayout } from '../core/legend-layout';
import { denseLineWidth, linesPerPanel } from '../core/line-density';
import { cutToWidth, valueTickLabels } from '../core/backend-frame';
import { planSource } from '../core/source-plan';
import { planHeader } from '../core/header-plan';
import { roundSample, sizeKeySwatches, SIZE_KEY_SWATCHES } from '../core/legend-plan';
import { keyBlock, keyPlanStyle, type KeyBlock } from '../core/backend-profile';
import type { DesignDecisions } from '../core/theme/types';

import { AXIS_TITLE_STANDOFF, PLOTLY_FONT, PLOTLY_PROFILE } from './profile';

export { PLOTLY_FONT };
/** Plotly's line width, which a trace draws where it sets none. */
const PLOTLY_LINE_WIDTH = 2;
/** Room Plotly keeps between the plot and a legend beside it, and around the legend. */
const LEGEND_ROOM = 16;
/** The right margin the layout pass keeps on a cartesian figure without a colour bar. */
const RIGHT_MARGIN = 2 * PLOTLY_PROFILE.edge;

export const plMeasure = (fontSize: number, weight: string | number = 'normal') => tableTextMeasurer(fontSize, PLOTLY_FONT, weight, 'normal');

/** The traces the legend lists, by Plotly's rule: those that do not opt out, with a name, where the figure shows a legend. */
function legendTraces(figure: any): any[] {
    if (figure.layout?.showlegend === false) return [];
    const traces = (figure.data ?? []).filter((t: any) => t && t.showlegend !== false && t.name != null && String(t.name) !== '' && t.type !== 'indicator');
    const pie = (figure.data ?? []).some((t: any) => t?.type === 'pie');
    if (pie) return [];
    if (figure.layout?.showlegend !== true && traces.length < 2) return [];
    // One entry per legend group.
    const seen = new Set<string>();
    return traces.filter((t: any) => {
        const key = t.legendgroup ? `g:${t.legendgroup}` : `n:${t.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** The y axis's tick labels as Plotly prints them, for measuring: names as printed, numbers as its ticks fall. */
export function plYTickTexts(figure: any): string[] {
    const ax = figure.layout?.yaxis;
    if (!ax || ax.showticklabels === false) return [];
    if (Array.isArray(ax.ticktext)) return ax.ticktext.flatMap((t: unknown) => String(t).split('<br>'));
    if (Array.isArray(ax.categoryarray)) return ax.categoryarray.map(String);
    const dates = plDateTickTexts(figure, 'y');
    if (dates) return dates;
    const stacked = ['stack', 'relative'].includes(figure.layout?.barmode);
    const sums = new Map<string, number>();
    let lo = Infinity;
    let hi = -Infinity;
    for (const trace of figure.data ?? []) {
        if ((trace?.yaxis ?? 'y') !== 'y' || trace?.orientation === 'h') continue;
        (trace?.y ?? []).forEach((v: unknown, i: number) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            lo = Math.min(lo, n);
            hi = Math.max(hi, n);
            if (stacked) {
                const key = String(trace.x?.[i]);
                const sum = (sums.get(key) ?? 0) + n;
                sums.set(key, sum);
                hi = Math.max(hi, sum);
            }
        });
    }
    if (!Number.isFinite(lo)) return [];
    const range = Array.isArray(ax.range) ? ax.range.map(Number) : [ax.rangemode === 'tozero' ? Math.min(0, lo) : lo, hi];
    const fmt = (v: number) => (Math.abs(v) >= 10000 ? `${v / 1000}k` : String(Number(v.toPrecision(6))));
    return valueTickLabels([range[0], range[1]], 6, fmt);
}

/** How deep a row of x labels stands: its first line's box and each further line. */
export function plLabelDepth(rows: number, fontSize: number): number {
    return fontSize * (PLOTLY_PROFILE.labelBoxHeight + Math.max(0, rows - 1) * PLOTLY_PROFILE.labelLineHeight);
}

/** The room past an axis's labels its title takes: Plotly's standoff, 0.7 em for the first line, a line for each other. */
export function plAxisTitleRoom(ax: any): number {
    const text = typeof ax?.title === 'string' ? ax.title : ax?.title?.text;
    if (typeof text !== 'string' || !text.trim()) return 0;
    const size = Number(ax.title?.font?.size) || 14;
    const lines = text.split('<br>').length;
    return Math.ceil(Number(ax.title?.standoff ?? AXIS_TITLE_STANDOFF) + size * (0.7 + (lines - 1) * PLOTLY_PROFILE.labelLineHeight));
}

/**
 * An axis whose title was taken away (moved into the deck, hidden) loses the title itself: Plotly's
 * automargin keeps a line for a title whose text is empty, and its standoff besides, which grows the
 * margin past what was planned and shrinks the plot under everything hung from it.
 */
export function plDropEmptyTitles(layout: any): void {
    for (const [key, axis] of Object.entries<any>(layout ?? {})) {
        if (!/^[xy]axis\d*$/.test(key) || !axis || axis.title == null) continue;
        const text = typeof axis.title === 'string' ? axis.title : axis.title.text;
        if (!String(text ?? '').trim()) delete axis.title;
    }
}

/** The px between an axis line and its labels: a drawn tick (Plotly keeps 2.4 px past its length) and the standoff. */
export function plTickRun(ax: any): number {
    return (ax?.ticks ? Number(ax.ticklen ?? 5) + 2.4 : 0) + Number(ax?.ticklabelstandoff ?? 0);
}

/** The gap between facet panels. */
export const PLOTLY_FACET_GAP = 16;

/**
 * The room a facet grid keeps around its panels, from the profile: three-figure y labels, their run
 * and a title on the left; a line of x labels, their run and a title below.
 */
export function plFacetFurniture(labelSize: number, titleSize: number): { width: number; height: number } {
    const p = PLOTLY_PROFILE;
    const title = AXIS_TITLE_STANDOFF + titleSize * 0.7;
    return {
        width: Math.ceil(p.axisPad + p.tickLabelGap + plMeasure(labelSize)('100') + title),
        height: Math.ceil(p.axisPad + p.tickLabelGap + labelSize * p.labelBoxHeight + title),
    };
}

/** Break a name onto lines no wider than `width`, word by word; undefined where it takes more than `most` lines or a word runs past. */
function wrapName(name: string, width: number, widthOf: (text: string) => number, most = 2): string[] | undefined {
    const lines: string[] = [];
    let line = '';
    for (const word of name.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (widthOf(next) <= width) { line = next; continue; }
        if (!line || widthOf(word) > width) return undefined;
        lines.push(line);
        line = word;
    }
    if (line) lines.push(line);
    return lines.length <= most ? lines : undefined;
}

/**
 * Set a key that stands in a row (above or below the plot) for the row: its names as written, or
 * broken onto two lines at the width that lets more of them share a row, whichever makes the key
 * shortest as Plotly wraps it ({@link plKeyBlock}); fewer lines where two read the same. Names broken
 * for a column beside the plot (`plFitLegend`) are set again from the names as written.
 */
export function plFitRowKey(figure: any): void {
    const layout = figure?.layout;
    const legend = layout?.legend;
    if (!legend || legend.orientation !== 'h' || layout.showlegend === false) return;
    // Measured as Plotly will set it: each entry in a group of its own, so the rows flow.
    plFlowRowKey(figure);
    const original = (name: string) => figure._keyNames?.[name] ?? name.replace(/<br>/g, ' ');
    const traces = (figure.data ?? []).filter((t: any) => t && t.showlegend !== false && t.visible !== false && t.name != null && String(t.name) !== '' && t.type !== 'pie');
    const names = [...new Set(traces.map((t: any) => String(t.name)))] as string[];
    if (names.length < 2) return;
    const written = names.map(original);
    const fontSize = Number(legend.font?.size) || 12;
    const widthOf = tableTextMeasurer(fontSize, legend.font?.family ?? PLOTLY_FONT, 'normal', 'normal');
    const width = Number(layout.width) || 0;
    const margin = layout.margin ?? {};
    const plotWidth = Math.max(1, width - (margin.l ?? 0) - (margin.r ?? 0));
    const hungLeft = typeof legend.x === 'number' && legend.x < 0 && legend.xref !== 'container';
    const room = legend.xref === 'container' ? width : plotWidth + (hungLeft ? margin.l ?? 0 : 0);
    const { lead, gap } = PLOTLY_PROFILE.key;
    // The names as written, and at the width that lets k entries share a row, for each k.
    const candidates: string[][][] = [written.map((n) => [n])];
    for (let k = 2; k <= names.length; k++) {
        const each = Math.floor((room - (k - 1) * gap) / k) - lead;
        if (each < fontSize * 4) break;
        const wrapped = written.map((n) => wrapName(n, each, widthOf));
        if (wrapped.every(Boolean)) candidates.push(wrapped as string[][]);
    }
    let best: { lines: string[][]; height: number; count: number } | undefined;
    for (const lines of candidates) {
        const block = keyBlock(PLOTLY_PROFILE.key, { entries: lines, fontSize, widthOf, orientation: 'horizontal', room });
        const count = lines.reduce((sum, l) => sum + l.length, 0);
        if (!best || block.height < best.height - 2 || (block.height <= best.height + 2 && count < best.count)) best = { lines, height: block.height, count };
    }
    if (!best) return;
    const set = new Map(names.map((name, i) => [name, best!.lines[i].join('<br>')]));
    for (const trace of figure.data ?? []) {
        const now = set.get(String(trace?.name));
        if (now === undefined || now === trace.name) continue;
        trace.hoverlabel = { ...(trace.hoverlabel ?? {}), namelength: -1 };
        trace.name = now;
    }
}

/** The step d3 and Vega tick a span with about `count` ticks: 1, 2 or 5 times a power of ten. */
function tickStep(lo: number, hi: number, count: number): number {
    const raw = (hi - lo) / Math.max(1, count);
    const power = 10 ** Math.floor(Math.log10(raw));
    const error = raw / power;
    return power * (error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1);
}

/** A trace's marker radius at each point, in px, as Plotly sizes it (`sizemode`, `sizeref`). */
function markerRadii(trace: any, count: number): number[] {
    const mode = String(trace?.mode ?? 'markers');
    if (!mode.includes('markers')) return new Array(count).fill(trace?.line?.width ? trace.line.width / 2 : 1);
    const marker = trace?.marker ?? {};
    const ref = Number(marker.sizeref) || 1;
    const radius = (v: unknown) => {
        const size = Number(v);
        if (!Number.isFinite(size) || size <= 0) return 3;
        return (marker.sizemode === 'area' ? Math.sqrt(size / (2 * ref)) : size / (2 * ref)) + (Number(marker.line?.width) || 0);
    };
    return Array.from({ length: count }, (_, i) => radius(Array.isArray(marker.size) ? marker.size[i] : marker.size ?? 6));
}

/** Plotly's own short number form for a log axis's labels (2k, 50k, 1M), for measuring them. */
const siLabel = (v: number) => {
    const units: Array<[number, string]> = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
    for (const [n, u] of units) if (Math.abs(v) >= n) return `${Number((v / n).toPrecision(3))}${u}`;
    return String(Number(v.toPrecision(3)));
};

/**
 * Start and end each continuous axis on a labelled tick, as Vega-Lite's `nice` domain does: a linear
 * axis Plotly would autorange past its data, to a range rounded out to its tick step (one step more
 * where a bubble at the edge would run past it), ticked at that step; a log axis over few decades,
 * labelled at 1·2·5 or 1·3 of each decade where those labels fit apart, rather than at the powers
 * alone, which can leave its start and end unnamed. Axes a template or house ranged or ticked, banded
 * and time axes, and axes bars or areas stand on are left to Plotly.
 */
export function plNiceAxes(figure: any): void {
    const layout = figure?.layout;
    if (!layout || figure._facet) return;
    const width = Number(layout.width) || 0;
    const height = Number(layout.height) || 0;
    const margin = layout.margin ?? {};
    for (const [key, channel] of [['xaxis', 'x'], ['yaxis', 'y']] as const) {
        const ax = layout[key];
        if (!ax || ax.range != null || ax.autorange === 'reversed' || ax.tickvals != null || ax.matches || ax.visible === false) continue;
        if (ax.type === 'category' || ax.type === 'date' || ax.type === 'multicategory') continue;
        const ref = channel;
        const traces = (figure.data ?? []).filter((t: any) => (t?.[`${channel}axis`] ?? ref) === ref && t?.visible !== false);
        if (!traces.length || traces.some((t: any) => !['scatter', 'scattergl'].includes(t?.type ?? 'scatter') || t.fill && t.fill !== 'none' || t.stackgroup)) continue;
        const points: Array<{ v: number; r: number }> = [];
        let numeric = true;
        for (const trace of traces) {
            const values: unknown[] = Array.isArray(trace[channel]) ? trace[channel] : [];
            const radii = markerRadii(trace, values.length);
            values.forEach((value, i) => {
                if (value == null || value === '') return;
                const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : NaN;
                if (!Number.isFinite(n)) { numeric = false; return; }
                points.push({ v: n, r: radii[i] });
            });
        }
        if (!numeric || points.length < 2) continue;
        const span = channel === 'x' ? width - (margin.l ?? 0) - (margin.r ?? 0) : height - (margin.t ?? 0) - (margin.b ?? 0);
        if (!(span > 40)) continue;
        const fontSize = Number(ax.tickfont?.size) || 12;
        const widthOf = plMeasure(fontSize);

        if (ax.type === 'log') {
            const positive = points.filter((p) => p.v > 0);
            if (positive.length < 2) continue;
            const lo = Math.min(...positive.map((p) => p.v));
            const hi = Math.max(...positive.map((p) => p.v));
            const decades = Math.log10(hi / lo);
            if (!(decades > 0.3) || decades > 3) continue;
            // Plotly pads a log range as it pads a linear one; the decades the axis shows, a little wider.
            const perDecade = span / (decades * 1.1);
            const label = (v: number) => (channel === 'x' ? widthOf(siLabel(v)) : fontSize * 1.2) + 10;
            for (const steps of [[1, 2, 5], [1, 3]]) {
                const values: number[] = [];
                for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
                    for (const m of steps) {
                        const v = m * 10 ** e;
                        if (v >= lo / 1.05 && v <= hi * 1.05) values.push(v);
                    }
                }
                const fits = values.every((v, i) => i === 0 || Math.log10(v / values[i - 1]) * perDecade >= (label(v) + label(values[i - 1])) / 2);
                if (values.length >= 3 && fits) {
                    ax.tickmode = 'array';
                    ax.tickvals = values;
                    ax.ticktext = values.map(siLabel);
                    delete ax.dtick;
                    break;
                }
            }
            continue;
        }

        const lo0 = Math.min(...points.map((p) => p.v));
        const hi0 = Math.max(...points.map((p) => p.v));
        const lo = ax.rangemode === 'tozero' ? Math.min(0, lo0) : lo0;
        const hi = ax.rangemode === 'tozero' ? Math.max(0, hi0) : hi0;
        if (!(hi > lo)) continue;
        // As many ticks as the axis holds apart: a label's height down y, its width (and a gap) along x.
        const each = channel === 'y' ? Math.max(36, fontSize * 3) : Math.max(...[lo, hi].map((v) => widthOf(String(v)))) + 24;
        const count = Math.max(3, Math.min(10, Math.floor(span / each)));
        let step = tickStep(lo, hi, count);
        let start = Math.floor(lo / step) * step;
        let end = Math.ceil(hi / step) * step;
        // A bubble at an edge keeps its whole disc in the plot: the range goes a step further.
        for (let pass = 0; pass < 3; pass++) {
            const perUnit = span / (end - start);
            const under = points.some((p) => (p.v - start) * perUnit < p.r);
            const over = points.some((p) => (end - p.v) * perUnit < p.r);
            if (!under && !over) break;
            if (under && !(ax.rangemode === 'tozero' && start === 0 && lo0 >= 0)) start -= step;
            if (over && !(ax.rangemode === 'tozero' && end === 0 && hi0 <= 0)) end += step;
        }
        // Too many ticks after widening: a step twice as wide, rounded out again.
        if ((end - start) / step > count + 2) {
            step *= 2;
            start = Math.floor(start / step) * step;
            end = Math.ceil(end / step) * step;
        }
        ax.range = [start, end];
        ax.autorange = false;
        ax.tick0 = 0;
        ax.dtick = step;
        delete ax.nticks;
    }
}

/** The smallest a pie is drawn across when it gives its key room. */
const PIE_FLOOR = 200;

/**
 * A pie whose slice names run long beside its radius: standing outside the pie, Plotly's callouts
 * push the margins until the pie is a small disc among its names. The names move to a key beside
 * the pie (long ones on two lines) and the slices print their share inside, as the plan sets a pie
 * with long names. Returns whether it did.
 */
export function plFitPie(
    figure: any, box?: { width: number; height: number },
    options: { anchored?: boolean; row?: boolean; sliceNames?: string } = {},
): 'side' | 'row' | false {
    const layout = figure?.layout;
    const pies = (figure?.data ?? []).filter((t: any) => t?.type === 'pie' && Array.isArray(t.labels) && t.labels.length > 1);
    if (pies.length !== 1 || !layout) return false;
    const pie = pies[0];
    const parts = typeof pie.textinfo === 'string' ? pie.textinfo.split('+') : [];
    if (!parts.includes('label') || options.sliceNames === 'onSlices') return false;
    const width = Number(layout.width ?? figure._width) || 0;
    const height = Number(layout.height ?? figure._height) || 0;
    const margin = layout.margin ?? {};
    const radius = Math.min(width - (margin.l ?? 0) - (margin.r ?? 0), height - (margin.t ?? 0) - (margin.b ?? 0)) / 2;
    if (!(radius > 0)) return false;
    const fontSize = Number(pie.textfont?.size ?? layout.font?.size) || 12;
    const widthOf = plMeasure(fontSize);
    // A name's callout is set on two lines where it runs long: the room it takes is half its width or so.
    const twoLine = Math.max(...pie.labels.map((label: unknown) => {
        const text = String(label);
        const lines = wrapName(text, widthOf(text) / 2 + fontSize * 2, widthOf);
        return Math.max(...(lines ?? [text]).map(widthOf));
    }));
    // A few callouts, or short ones, stand round the pie; many long ones squeeze it to a disc among them.
    const crowded = pie.labels.length >= 5 && twoLine > radius * 0.5;
    // A figure that hangs furniture from the plot area (a house's tab or rule, a source line) cannot
    // let a callout outside the pie grow the margins under it: Plotly would move the plot, and the
    // furniture with it, after it was placed.
    const asked = options.sliceNames === 'key';
    if (!asked && !crowded && !(options.anchored && someCalloutOutside(pie, radius, widthOf))) return false;
    pie.textinfo = parts.filter((part: string) => part !== 'label').join('+') || 'percent';
    delete pie.texttemplate;
    pie.textposition = 'inside';
    pie.automargin = false;
    // A share too long for its slice is hidden rather than shrunk past reading.
    layout.uniformtext = { minsize: Math.max(9, fontSize - 2), mode: 'hide' };
    const written = [...pie.labels];
    // Each name whole on one line, or on two at the key's width.
    const keyWidth = 120;
    const keyWidthOf = plMeasure(Number(layout.legend?.font?.size) || 12);
    pie.labels = pie.labels.map((label: unknown) => {
        const text = String(label);
        if (keyWidthOf(text) <= keyWidth) return text;
        // A key beside the pie has the height for a third line where a name needs one.
        const lines = wrapName(text, keyWidth, keyWidthOf, 3);
        return lines ? lines.join('<br>') : text;
    });
    pie.hovertemplate ??= '%{label}<br>%{percent}<extra></extra>';
    layout.showlegend = true;
    // A house that keys in a row keeps its row where the names stand in one or two rows across the
    // pie: a square pie under a short row stays near square.
    if (options.row) {
        // In a row the names are set for the row (`plFitRowKey`), from the names as written.
        const wrapped = pie.labels;
        pie.labels = written;
        layout.legend = { ...(layout.legend ?? {}), orientation: 'h' };
        const row = plKeyBlock({ ...figure, layout: { ...layout, margin: { ...margin, l: 0, r: 0 } } }, 'horizontal');
        if (row && row.rows <= 2) {
            if (figure._width != null) figure._width = width;
            return 'row';
        }
        pie.labels = wrapped;
    }
    layout.legend = { ...(layout.legend ?? {}), orientation: 'v', x: 1.02, xanchor: 'left', y: 1, yanchor: 'top' };
    // The pie draws in a square: width past its height is room only the key can use. The key beside
    // it takes its own room from there.
    const area = { width: width - (margin.l ?? 0) - (margin.r ?? 0), height: height - (margin.t ?? 0) - (margin.b ?? 0) };
    const spare = Math.max(0, area.width - area.height);
    const block = plKeyBlock(figure, 'vertical');
    const room = block ? block.width + PLOTLY_PROFILE.key.gap + PLOTLY_PROFILE.edge : 0;
    layout.margin = { ...margin, r: Math.max(margin.r ?? 0, room) };
    const grow = (layout.margin.r ?? 0) - (margin.r ?? 0) - spare;
    layout.width = Math.round(width + grow);
    // Past its box, the pie gives the key its room: smaller, still square, never below a legible disc.
    const side = Math.min(area.width, area.height);
    const over = box ? layout.width - box.width : 0;
    const shrink = Math.max(0, Math.min(over, side - PIE_FLOOR));
    if (shrink > 0) {
        layout.width -= shrink;
        layout.height = Math.round(height - shrink);
        if (figure._height != null) figure._height = layout.height;
    }
    if (figure._width != null) figure._width = layout.width;
    return 'side';
}

/**
 * Whether any slice's name and share would stand outside the pie, as Plotly sets text that will not
 * fit inside its slice: measured against the slice's width a little inside its rim, on one line or two.
 */
function someCalloutOutside(pie: any, radius: number, widthOf: (text: string) => number): boolean {
    const values = (pie.values ?? []).map((v: unknown) => Math.max(0, Number(v) || 0));
    const total = values.reduce((sum: number, v: number) => sum + v, 0);
    if (!(total > 0)) return false;
    return pie.labels.some((label: unknown, i: number) => {
        const share = values[i] / total;
        const pct = `${(share * 100).toFixed(1)}%`;
        const name = String(label);
        const need = Math.min(widthOf(`${name} ${pct}`), Math.max(widthOf(name), widthOf(pct)));
        const room = share >= 0.5 ? 1.2 * radius : 2 * 0.62 * radius * Math.sin(Math.PI * share);
        return need > room;
    });
}

/**
 * Let a key set in rows (above or below the plot) flow, each entry its own width, rather than stand
 * as Plotly's grid at the widest entry's width, where one long name leaves one entry a row. Plotly
 * flows a horizontal key whose entries are grouped (`traceorder: 'grouped'`), each group as wide as
 * its own entries: each entry is put in a group of its own, with no gap between the groups' rows.
 * A key whose groups already hold several entries, or a pie's, is left as it is.
 */
export function plFlowRowKey(figure: any): void {
    const layout = figure?.layout;
    const legend = layout?.legend;
    if (!legend || legend.orientation !== 'h' || layout.showlegend === false) return;
    const traces: any[] = figure.data ?? [];
    if (traces.some((t) => t?.type === 'pie')) return;
    const shown = traces.filter((t) => t && t.showlegend !== false && t.visible !== false && t.name != null && String(t.name) !== '');
    if (shown.length < 2) return;
    const perGroup = new Map<string, number>();
    for (const t of shown) if (t.legendgroup) perGroup.set(t.legendgroup, (perGroup.get(t.legendgroup) ?? 0) + 1);
    if ([...perGroup.values()].some((n) => n > 1)) return;
    shown.forEach((t, i) => { t.legendgroup ??= `flint-key-${i}`; });
    legend.traceorder = 'grouped';
    legend.tracegroupgap = 0;
}

/** The first and last instant a channel's values hold where they are dates, and the axis is a time axis. */
function dateSpan(figure: any, channel: 'x' | 'y'): [number, number] | undefined {
    const ax = figure?.layout?.[`${channel}axis`];
    if (!ax || ax.type === 'category' || ax.type === 'linear' || ax.type === 'log' || ax.tickvals != null) return undefined;
    let lo = Infinity;
    let hi = -Infinity;
    for (const trace of figure.data ?? []) {
        if ((trace?.[`${channel}axis`] ?? channel) !== channel) continue;
        for (const v of trace?.[channel] ?? []) {
            const t = typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? Date.parse(v) : v instanceof Date ? v.getTime() : NaN;
            if (!Number.isFinite(t)) { if (v != null && typeof v !== 'string') return undefined; continue; }
            lo = Math.min(lo, t);
            hi = Math.max(hi, t);
        }
    }
    return hi > lo ? [lo, hi] : undefined;
}

const DAY = 86_400_000;

/**
 * The widest labels Plotly prints on a time axis, by the span it covers: years ("2024") over a few
 * years, months with their year ("Jan 2024") over months, days ("Feb 28") over weeks, times
 * ("12:00") within a day; the year (or date) under a day's or time's tick stands on a second line.
 * Undefined where the axis is not a time axis.
 */
export function plDateTickTexts(figure: any, channel: 'x' | 'y'): string[] | undefined {
    const span = dateSpan(figure, channel);
    if (!span) return undefined;
    const days = (span[1] - span[0]) / DAY;
    if (days > 3 * 365) return ['2024'];
    if (days > 90) return ['Sep 2024'];
    if (days > 2) return ['Sep 28', '2024'];
    return ['12:00', 'Sep 28, 2024'];
}

/** How many lines a time axis's labels stand on: two where Plotly sets the year or date under days and times. */
export function plDateLabelRows(figure: any, channel: 'x' | 'y'): number {
    const texts = plDateTickTexts(figure, channel);
    return texts && texts.length > 1 ? 2 : 1;
}

/** Px between a size key's swatches, and between a swatch and its value. */
const SIZE_KEY_GAP = 12;
const SIZE_KEY_LABEL_GAP = 4;

/**
 * Plotly draws no key to a size channel, and its legend caps a symbol at 16 px, so the key is drawn:
 * a few round values ({@link roundSample}, as many as the edge holds, {@link sizeKeySwatches}) as
 * circles at the size the chart draws them — the drawn diameters fitted back to the values they
 * carry, area against value — with their numbers and the field's name, in the house's key type. It
 * stands where the chart's other key does: in a row under a key set in rows (above or below the
 * plot), else beside the plot under the colour key. The figure grows by its room, so the plot keeps
 * its size. Pixel-sized shapes hung from paper coordinates, so the circles stay round.
 */
export function plSizeKey(figure: any, title: string | undefined): void {
    const layout = figure?.layout;
    if (!layout || figure._facet) return;
    const traces = (figure.data ?? []).filter((t: any) => Array.isArray(t?._sizeValues) && Array.isArray(t?.marker?.size));
    if (!traces.length) return;
    // The drawn diameters against the values they carry: area runs straight with value.
    const pairs: Array<[number, number]> = [];
    for (const t of traces) t._sizeValues.forEach((v: number, i: number) => {
        const d = Number(t.marker.size[i]);
        if (Number.isFinite(v) && Number.isFinite(d) && d > 0) pairs.push([v, Math.PI * (d / 2) ** 2]);
    });
    if (pairs.length < 2) return;
    const lo = pairs.reduce((a, b) => (b[0] < a[0] ? b : a));
    const hi = pairs.reduce((a, b) => (b[0] > a[0] ? b : a));
    if (!(hi[0] > lo[0])) return;
    const slope = (hi[1] - lo[1]) / (hi[0] - lo[0]);
    const diameterAt = (v: number) => 2 * Math.sqrt(Math.max(4 * Math.PI, lo[1] + (v - lo[0]) * slope) / Math.PI);

    const width = Number(layout.width) || 0;
    const height = Number(layout.height) || 0;
    const margin = (layout.margin ??= {});
    // The width kept beside the plot for a key Plotly hangs in its right margin is not the plot's.
    const keyRoom = Number(figure._legendRoom?.right) || 0;
    const plot = { width: Math.max(1, width - (margin.l ?? 0) - (margin.r ?? 0) - keyRoom), height: Math.max(1, height - (margin.t ?? 0) - (margin.b ?? 0)) };
    const legend = layout.showlegend === false ? undefined : layout.legend;
    // A key at the canvas's foot (`yref: 'container'`) stands in rows too.
    const atFoot = legend?.orientation === 'h' && legend.yref === 'container';
    const inRows = atFoot || (legend?.orientation === 'h' && typeof legend.y === 'number' && (legend.y > 1 || legend.y < 0));
    const rows = pairs.map(([v]) => ({ v }));
    const field = traces[0]._sizeField as string;
    const values = roundSample(rows, 'v', sizeKeySwatches(inRows ? 'top' : 'right', plot));
    if (!values) return;

    const fontSize = Number(legend?.font?.size ?? layout.font?.size) || 12;
    const family = legend?.font?.family ?? layout.font?.family ?? PLOTLY_FONT;
    const color = legend?.font?.color ?? layout.font?.color ?? '#444';
    const widthOf = tableTextMeasurer(fontSize, family, 'normal', 'normal');
    const titleOf = tableTextMeasurer(fontSize, family, 'bold', 'normal');
    const name = title ?? field;
    const format = (v: number) => v.toLocaleString('en-US');
    const ink = traces[0].marker?.line;
    const outline = ink && Number(ink.width) >= 1 && String(ink.color).toLowerCase() !== '#ffffff' ? { color: ink.color, width: ink.width } : { width: 0 };
    const swatch = { fillcolor: 'rgba(128,128,128,0.5)', line: outline };
    const lineH = Math.ceil(fontSize * 1.3);
    const shapes = (layout.shapes ??= []);
    const notes = (layout.annotations ??= []);
    const px = (x: number) => (x - (margin.l ?? 0)) / plot.width;
    const circle = (cx: number, cy: number, d: number) => shapes.push({
        type: 'circle', xref: 'paper', yref: 'paper', xsizemode: 'pixel', ysizemode: 'pixel',
        xanchor: px(cx), yanchor: cy, x0: -d / 2, x1: d / 2, y0: -d / 2, y1: d / 2, layer: 'above', ...swatch,
    });
    const text = (x: number, y: number, t: string, bold = false, yanchor: 'middle' | 'top' = 'middle') => notes.push({
        text: bold ? `<b>${t}</b>` : t, showarrow: false, xref: 'paper', yref: 'paper', x: px(x), y, xanchor: 'left', yanchor,
        font: { family, size: fontSize, color },
    });
    // The title holds its place in px from the top as the figure grows.
    const holdTitle = (before: number) => {
        const t = layout.title;
        if (t && typeof t === 'object' && t.yref === 'container' && Number.isFinite(Number(t.y))) {
            t.y = 1 - (1 - Number(t.y)) * before / layout.height;
        }
    };

    if (inRows) {
        // A row under the key in rows: the field's name, then each value's circle and number.
        const diam = values.map(diameterAt);
        const rowH = Math.ceil(Math.max(...diam, lineH)) + 6;
        const centred = legend.xanchor === 'center';
        const start = (margin.l ?? 0) + Number(legend.x ?? 0) * plot.width + PLOTLY_PROFILE.key.pad.x;
        const room = centred ? width - 2 * PLOTLY_PROFILE.edge : width - start - PLOTLY_PROFILE.edge;
        let shown = values;
        const runOf = (vs: number[]) => titleOf(name) + 10 + vs.reduce((sum, v) => sum + diameterAt(v) + SIZE_KEY_LABEL_GAP + widthOf(format(v)) + SIZE_KEY_GAP, 0) - SIZE_KEY_GAP;
        while (shown.length > 2 && runOf(shown) > room) shown = shown.filter((_, i) => i !== Math.floor(shown.length / 2));
        // A key centred under the plot has its row centred with it.
        const left = centred ? Math.max(PLOTLY_PROFILE.edge, (margin.l ?? 0) + Number(legend.x ?? 0.5) * plot.width - runOf(shown) / 2) : start;
        const key = plKeyBlock(figure);
        const keyH = key?.height ?? 0;
        const gap = 6;
        const before = layout.height;
        let centre: number;
        if (legend.y > 1) {
            const above = (legend.y - 1) * plot.height;
            margin.t = (margin.t ?? 0) + rowH + gap;
            layout.height = Math.round(before + rowH + gap);
            holdTitle(before);
            legend.y = 1 + (above + rowH + gap) / plot.height;
            centre = 1 + (above - keyH + rowH / 2) / plot.height;
        } else if (atFoot) {
            // Over the key, which stands on the canvas's foot: the foot grows by the row.
            margin.b = (margin.b ?? 0) + rowH + gap;
            layout.height = Math.round(before + rowH + gap);
            centre = -((margin.b ?? 0) - (keyH + gap + rowH / 2)) / plot.height;
        } else {
            const below = -legend.y * plot.height;
            margin.b = (margin.b ?? 0) + rowH + gap;
            layout.height = Math.round(before + rowH + gap);
            centre = -(below + keyH + gap + rowH / 2) / plot.height;
        }
        let x = left;
        text(x, centre, name, true);
        x += titleOf(name) + 10;
        for (const v of shown) {
            const d = diameterAt(v);
            circle(x + d / 2, centre, d);
            text(x + d + SIZE_KEY_LABEL_GAP, centre, format(v));
            x += d + SIZE_KEY_LABEL_GAP + widthOf(format(v)) + SIZE_KEY_GAP;
        }
        return;
    }

    // Beside the plot, under the colour key: the name, then a column of circles and their numbers.
    const key = legend ? plKeyBlock(figure, 'vertical') : undefined;
    const keyX = typeof legend?.x === 'number' && legend.x >= 1 ? legend.x : 1.02;
    const plotRight = (margin.l ?? 0) + plot.width;
    const startTop = key ? key.height + 14 : 0;
    const columnHeight = (vs: number[]) => lineH + 4 + vs.reduce((sum, v) => sum + Math.max(diameterAt(v), lineH) + 6, 0) - 6;
    // As many values as stand in the height the colour key leaves beside the plot, from the field's
    // own round sample; never fewer than the three that tell a reader the scale.
    let shown = values;
    for (let count = values.length - 1; count >= SIZE_KEY_SWATCHES && startTop + columnHeight(shown) > plot.height; count--) {
        shown = roundSample(rows, 'v', count) ?? shown.filter((_, i) => i !== Math.floor(shown.length / 2));
    }
    // A column that still runs below the plot's foot passes the x axis's labels there: it starts
    // clear of the last label's overhang past the plot's right edge.
    const runsBelow = startTop + columnHeight(shown) > plot.height;
    const overhang = runsBelow ? plXEndOverhang(figure) : 0;
    const left = Math.max(plotRight + plot.width * (keyX - 1) + PLOTLY_PROFILE.key.pad.x, plotRight + overhang + (overhang ? SIZE_KEY_GAP : 0));
    const diam = shown.map(diameterAt);
    const largest = Math.max(...diam);
    // The circles centre where the colour key's swatches do (its symbol room's middle), and the
    // numbers start where its names start, so the two keys read as one column.
    const swatchCentre = Math.max(left + PLOTLY_PROFILE.key.gap + 15, left + largest / 2);
    const textStart = Math.max(left + PLOTLY_PROFILE.key.lead - 3, swatchCentre + largest / 2 + SIZE_KEY_LABEL_GAP);
    let top = startTop;
    text(left, 1 - top / plot.height, name, true, 'top');
    top += lineH + 4;
    shown.forEach((v, i) => {
        const h = Math.max(diam[i], lineH);
        const cy = 1 - (top + h / 2) / plot.height;
        circle(swatchCentre, cy, diam[i]);
        text(textStart, cy, format(v));
        top += h + 6;
    });
    const columnW = Math.max(titleOf(name), textStart - left + Math.max(...shown.map((v) => widthOf(format(v)))));
    // Right of the plot: the room kept for the colour key, widened where the size key runs past it.
    const reserved = (margin.r ?? 0) + keyRoom;
    const need = Math.ceil(left + columnW + PLOTLY_PROFILE.edge - ((margin.l ?? 0) + plot.width));
    const right = Math.max(reserved, need);
    margin.r = right;
    if (figure._legendRoom) figure._legendRoom = { ...figure._legendRoom, right: 0 };
    layout.width = Math.round((margin.l ?? 0) + plot.width + right);
    // A column that runs past the plot's foot takes the room it needs below it.
    const past = top - plot.height - (margin.b ?? 0) + PLOTLY_PROFILE.edge;
    if (past > 0) {
        margin.b = (margin.b ?? 0) + Math.ceil(past);
        layout.height = Math.round(layout.height + Math.ceil(past));
    }
}

/**
 * How far the x axis's last label runs past the plot's right edge, in px: half its width, where the
 * axis labels its end (a range rounded to its ticks, or Plotly's own ticks over the data); 0 where
 * the axis prints no labels or ends on a band.
 */
export function plXEndOverhang(figure: any): number {
    const ax = figure?.layout?.xaxis;
    if (!ax || ax.visible === false || ax.showticklabels === false || ax.type === 'category') return 0;
    const size = Number(ax.tickfont?.size ?? figure.layout?.font?.size) || 12;
    const widthOf = tableTextMeasurer(size, ax.tickfont?.family ?? figure.layout?.font?.family ?? PLOTLY_FONT, 'normal', 'normal');
    let last: string | undefined;
    if (Array.isArray(ax.ticktext) && ax.ticktext.length) last = String(ax.ticktext[ax.ticktext.length - 1]);
    else if (Array.isArray(ax.range) && ax.dtick != null && ax.type !== 'log' && ax.type !== 'date') last = Number(ax.range[1]).toLocaleString('en-US');
    else {
        let hi = -Infinity;
        for (const t of figure.data ?? []) for (const v of t?.x ?? []) { const n = Number(v); if (Number.isFinite(n)) hi = Math.max(hi, n); }
        if (Number.isFinite(hi)) last = valueTickLabels([0, hi], 5).slice(-1)[0];
    }
    return last ? Math.ceil(widthOf(last.replace(/<[^>]+>/g, '')) / 2) : 0;
}

/**
 * Draw bubbles largest first, so a small one laid over a large one stays in sight: each sized trace's
 * points sorted by size, descending, and the traces drawn in order of their largest bubble. Plotly
 * draws whole traces in order, so a series of large bubbles drawn last would bury another series'
 * small ones. The key keeps the series' order (`legendrank`).
 */
export function plDrawLargestFirst(figure: any): void {
    const traces: any[] = figure?.data ?? [];
    const sized = traces.filter((t) => Array.isArray(t?._sizeValues) && Array.isArray(t?.x));
    if (!sized.length) return;
    for (const t of sized) {
        const n = t.x.length;
        const order = Array.from({ length: n }, (_, i) => i)
            .sort((a, b) => (Number(t._sizeValues[b]) || 0) - (Number(t._sizeValues[a]) || 0));
        const permute = (arr: unknown) => (Array.isArray(arr) && arr.length === n ? order.map((i) => arr[i]) : arr);
        for (const key of ['x', 'y', 'text', 'hovertext', 'customdata', 'ids', '_sizeValues'] as const) {
            if (Array.isArray(t[key])) t[key] = permute(t[key]);
        }
        if (t.marker) {
            for (const key of ['size', 'color', 'symbol', 'opacity'] as const) {
                if (Array.isArray(t.marker[key])) t.marker[key] = permute(t.marker[key]);
            }
        }
    }
    if (sized.length < 2) return;
    traces.forEach((t, i) => { if (t && t.legendrank == null) t.legendrank = 1000 + i; });
    const largest = (t: any) => Math.max(0, ...(t._sizeValues ?? []).map((v: unknown) => Number(v) || 0));
    const rest = traces.filter((t) => !sized.includes(t));
    figure.data = [...[...sized].sort((a, b) => largest(b) - largest(a)), ...rest];
}

const stripTags = (text: string) => text.replace(/<[^>]+>/g, '');

/**
 * The key's box as Plotly will draw it ({@link keyBlock} with {@link PLOTLY_PROFILE}): its entries as
 * the figure names them (lines at `<br>`), in its own font, wrapped across the width Plotly gives a row
 * where the key's position puts it — the plot's width, or the plot and its left margin for a row hung
 * from the left of the plot. Undefined where the figure shows no key.
 */
export function plKeyBlock(figure: any, orientation?: 'horizontal' | 'vertical'): KeyBlock | undefined {
    const layout = figure?.layout ?? {};
    if (layout.showlegend === false) return undefined;
    const legend = layout.legend ?? {};
    const names: string[] = [];
    const seen = new Set<string>();
    for (const t of figure.data ?? []) {
        if (!t || t.showlegend === false || t.visible === false) continue;
        if (t.type === 'pie' && Array.isArray(t.labels)) { names.push(...t.labels.map(String)); continue; }
        if (t.name == null || String(t.name) === '') continue;
        const id = t.legendgroup ? `g:${t.legendgroup}` : `n:${t.name}`;
        if (seen.has(id)) continue;
        seen.add(id);
        names.push(String(t.name));
    }
    if (!names.length) return undefined;
    const fontSize = Number(legend.font?.size) || 12;
    const family = legend.font?.family ?? PLOTLY_FONT;
    const widthOf = tableTextMeasurer(fontSize, family, 'normal', 'normal');
    const entries = names.map((name) => name.split('<br>').map((line) => stripTags(line)));
    const titleText = typeof legend.title === 'string' ? legend.title : legend.title?.text;
    const titleSize = Number(legend.title?.font?.size) || fontSize;
    const title = titleText && stripTags(String(titleText)).trim()
        ? {
            lines: String(titleText).split('<br>').map(stripTags),
            fontSize: titleSize,
            widthOf: tableTextMeasurer(titleSize, legend.title?.font?.family ?? family, /<b>/.test(String(titleText)) ? 'bold' : 'normal', 'normal'),
        }
        : undefined;
    const width = Number(layout.width) || 0;
    const margin = layout.margin ?? {};
    const plotWidth = Math.max(1, width - (margin.l ?? 0) - (margin.r ?? 0));
    const x = typeof legend.x === 'number' ? legend.x : 1.02;
    const hungLeft = x < 0 && (legend.xanchor ?? 'left') === 'left' && legend.xref !== 'container';
    const room = legend.xref === 'container' ? width : plotWidth + (hungLeft ? margin.l ?? 0 : 0);
    return keyBlock(PLOTLY_PROFILE.key, {
        entries, fontSize, widthOf, orientation: orientation ?? (legend.orientation === 'h' ? 'horizontal' : 'vertical'), room,
        ...(title ? { title } : {}),
    });
}

/**
 * Lay the legend out as the layout lays Vega-Lite's keys ({@link planKeyLayout}): beside the plot, as
 * Plotly sets it, its long names on lines, or in a row at the foot where it will not stand beside it.
 * Returns the room it takes beside or below the plot, or undefined where the figure shows no legend.
 */
export function plFitLegend(figure: any, plot: { width: number; height: number }, sideWidth?: number, moveTo?: 'top' | 'bottom', drawnSize = 12): { right: number; bottom: number } | undefined {
    const traces = legendTraces(figure);
    if (!traces.length) return undefined;
    const legend = (figure.layout.legend ??= {});
    if (legend.orientation === 'h' || (typeof legend.x === 'number' && legend.x < 1)) return undefined;
    const fontSize = legend.font?.size ?? drawnSize;
    const names: string[] = traces.map((t: any) => String(t.name));
    const title = legend.title?.text ? String(legend.title.text) : null;
    const key: KeyToLayout = {
        gradient: false,
        labels: names,
        count: names.length,
        title,
        style: {
            labelFont: PLOTLY_FONT, labelFontSize: fontSize, labelFontWeight: 'normal', labelFontStyle: 'normal',
            titleFont: PLOTLY_FONT, titleFontSize: legend.title?.font?.size ?? fontSize, titleFontWeight: 'normal', titleFontStyle: 'normal',
            // Plotly's entry, and its side legend in one column, scrolling past its height.
            ...keyPlanStyle(PLOTLY_PROFILE.key),
            titlePadding: 4,
        },
        orient: 'right',
        edges: ['right', 'bottom'],
        fixed: false,
        fixedTitle: true,
        ...(moveTo ? { moveTo: 'bottom' } : {}),
    };
    const laid = planKeyLayout([key], plot, tableTextMeasurer, sideWidth !== undefined ? { sideWidth } : {}).keys[0];
    if (!laid) return undefined;
    const widthOf = plMeasure(fontSize);
    const limit = laid.labelLimit > 0 ? laid.labelLimit : undefined;
    const bottom = laid.orient === 'bottom' || laid.orient === 'top';
    names.forEach((name, index) => {
        const lines = laid.labelLines?.[index] ?? [name];
        // In a row at the foot a name stands on one line, cut only where it would run past the figure.
        const text = bottom ? cutToWidth(name, plot.width + 40, widthOf) : lines.map((line) => cutToWidth(line, limit, widthOf)).join('<br>');
        if (text === name) return;
        // Every trace of the entry's group carries the name the legend prints; the hover still names it.
        for (const trace of figure.data ?? []) {
            if (String(trace?.name) !== name) continue;
            trace.hoverlabel = { ...(trace.hoverlabel ?? {}), namelength: -1 };
            trace.name = text;
            // The name as written, should the key later stand in a row and need its names set again.
            (figure._keyNames ??= {})[text] = name;
        }
    });
    if (bottom) {
        // A horizontal legend at the figure's foot, in rows across the plot's width as Plotly wraps them.
        figure.layout.legend = { ...legend, orientation: 'h', x: 0.5, xanchor: 'center', yref: 'container', y: 0, yanchor: 'bottom' };
        const block = keyBlock(PLOTLY_PROFILE.key, {
            entries: traces.map((t: any) => String(t.name).split('<br>')), fontSize, widthOf, orientation: 'horizontal', room: plot.width,
        });
        return { right: 0, bottom: block.height + LEGEND_ROOM };
    }
    // Plotly sets a legend beside the plot in one column (it scrolls past the plot's height), each entry
    // 40 px of item before its widest line, and hangs it in the figure's right margin, which keeps its own room.
    const box = keyBlock(PLOTLY_PROFILE.key, {
        entries: traces.map((t: any) => String(t.name).split('<br>')), fontSize, widthOf, orientation: 'vertical',
        ...(title ? { title: { lines: [title], fontSize: legend.title?.font?.size ?? fontSize, widthOf } } : {}),
    });
    // Plotly keeps a gap after each entry's text; the key hangs in the right margin, which keeps its own room.
    return { right: Math.max(0, box.width + PLOTLY_PROFILE.key.gap + 10 + LEGEND_ROOM - RIGHT_MARGIN), bottom: 0 };
}

/**
 * Fit each axis title to its axis: longer ones on two lines (`<br>`), the second cut where two will
 * not hold it. Returns the extra px each side's titles take past one line.
 */
export function plFitAxisTitles(figure: any, plot: { width: number; height: number }): { x: number; y: number } {
    const extra = { x: 0, y: 0 };
    for (const [key, axis] of Object.entries<any>(figure.layout ?? {})) {
        const match = /^([xy])axis\d*$/.exec(key);
        if (!match || !axis?.title) continue;
        const title = typeof axis.title === 'string' ? { text: axis.title } : axis.title;
        const text = typeof title.text === 'string' ? title.text.replace(/<br>/g, ' ') : '';
        if (!text.trim()) continue;
        const channel = match[1] as 'x' | 'y';
        const fontSize = title.font?.size ?? 14;
        const widthOf = plMeasure(fontSize);
        const fit = fitAxisTitle(text, channel === 'x' ? plot.width : plot.height, widthOf, fontSize);
        if (!fit) continue;
        axis.title = { ...title, text: fit.lines.map((line) => cutToWidth(line, fit.limit, widthOf)).join('<br>') };
        extra[channel] = Math.max(extra[channel], (fit.lines.length - 1) * fit.lineHeight);
    }
    return extra;
}

/** Thin a figure's lines where many share the plot, from Plotly's 2 px. */
export function plThinLines(figure: any, context: InstantiateContext, plotHeight: number): void {
    const lines = (figure.data ?? []).filter((t: any) => (t?.type === 'scatter' || t?.type === 'scattergl') && String(t.mode ?? 'lines').includes('lines'));
    if (lines.length < 2) return;
    const width = denseLineWidth(PLOTLY_LINE_WIDTH, Math.max(lines.length, linesPerPanel(context.table, context.channelSemantics)), plotHeight);
    if (width === undefined) return;
    for (const trace of lines) {
        if (trace.line?.width != null && trace.line.width !== PLOTLY_LINE_WIDTH) continue;
        trace.line = { ...(trace.line ?? {}), width };
    }
}

/**
 * The source line under the chart, as the house sets it ({@link planSource}): its lead-in, words and
 * credit as runs, broken to the figure's width, standing from the chart's left (where the title
 * starts) or its right edge. Written as annotations in the figure's foot; the figure grows by the
 * room the footer takes.
 */
export function plWriteSource(figure: any, design: DesignDecisions, source: string | { text: string; href?: string } | undefined): void {
    const layout = figure?.layout;
    const width = Number(layout?.width);
    const height = Number(layout?.height);
    if (!source || !(width > 0) || !(height > 0)) return;
    const titleX = typeof layout.title === 'object' && layout.title?.xref === 'container' && layout.title.xanchor === 'left' ? Number(layout.title.x) : undefined;
    const left = titleX !== undefined && Number.isFinite(titleX) ? titleX * width : 8;
    const plan = planSource({ design, source, block: width - left - 8, measure: tableTextMeasurer });
    if (!plan) return;
    const margin = (layout.margin ??= {});
    margin.b = (margin.b ?? 0) + plan.room;
    layout.height = Math.round(height + plan.room);
    const font = { family: plan.font ?? design.font ?? PLOTLY_FONT, size: plan.fontSize, ...(plan.color ? { color: plan.color } : {}) };
    const annotations = layout.annotations ?? [];
    for (const line of plan.lines) {
        const text = line.runs.map((run) => {
            let t = run.text;
            if (run.fontWeight === 'bold' || (typeof run.fontWeight === 'number' && run.fontWeight >= 600)) t = `<b>${t}</b>`;
            if (run.fontStyle === 'italic') t = `<i>${t}</i>`;
            return t;
        }).join(' ');
        const start = line.align === 'start';
        annotations.push({
            text: line.href ? `<a href="${line.href}">${text}</a>` : text,
            showarrow: false,
            xref: 'paper', yref: 'paper',
            // Positioned in px from the figure's corners, as the plan measures them.
            x: (start ? left - (margin.l ?? 0) : width - 8 - (margin.l ?? 0)) / Math.max(1, width - (margin.l ?? 0) - (margin.r ?? 0)),
            xanchor: start ? 'left' : 'right',
            y: -((margin.b ?? 0) - line.bottom - plan.lineHeight) / Math.max(1, layout.height - (margin.t ?? 0) - (margin.b ?? 0)),
            yanchor: 'top',
            align: start ? 'left' : 'right',
            font,
        });
    }
    layout.annotations = annotations;
}

/**
 * The house's header, as the core plans it ({@link planHeader}): tabs, bands and rules on the canvas's
 * top edge and pieces on the line above the headline, drawn as shapes and annotations; the figure
 * grows by their room and the title moves down under them.
 */
export function plWriteHeader(figure: any, design: DesignDecisions, label: string | undefined): void {
    const layout = figure?.layout;
    const width = Number(layout?.width);
    const height = Number(layout?.height);
    if (!(width > 0) || !(height > 0)) return;
    const title = typeof layout.title === 'object' ? layout.title : undefined;
    const anchor: 'start' | 'middle' | 'end' = title?.xanchor === 'left' ? 'start' : title?.xanchor === 'right' ? 'end' : 'middle';
    const left = anchor === 'start' && Number.isFinite(Number(title?.x)) ? Number(title.x) * width : 8;
    const header = planHeader({ design, ...(label ? { label } : {}), block: width - left - 8, titleAnchor: anchor, measure: tableTextMeasurer });
    if (!header || !header.pieces.length) return;
    const extra = header.edge + header.line;
    const margin = (layout.margin ??= {});
    const titleTop = title && Number.isFinite(Number(title.y)) ? (1 - Number(title.y)) * height : 8;
    margin.t = (margin.t ?? 0) + extra;
    layout.height = Math.round(height + extra);
    if (title) title.y = 1 - (titleTop + extra) / layout.height;
    const plotWidth = Math.max(1, width - (margin.l ?? 0) - (margin.r ?? 0));
    const plotHeight = Math.max(1, layout.height - margin.t - (margin.b ?? 0));
    const px = (x: number) => (x - (margin.l ?? 0)) / plotWidth;
    const py = (y: number) => 1 + (margin.t - y) / plotHeight;
    const shapes = layout.shapes ?? [];
    const annotations = layout.annotations ?? [];
    for (const piece of header.pieces) {
        const frameStart = piece.frame === 'canvas' ? 0 : left;
        const frameEnd = piece.frame === 'canvas' ? width : width - 8;
        const zoneTop = piece.zone === 'canvasTop' ? 0 : header.edge;
        const top = zoneTop + piece.dy;
        const w = piece.align === 'span' ? frameEnd - frameStart : piece.width ?? 0;
        const x0 = piece.align === 'end' ? frameEnd - piece.offset - w
            : piece.align === 'middle' ? (frameStart + frameEnd - w) / 2 : frameStart + piece.offset;
        if (piece.kind === 'rect') {
            shapes.push({ type: 'rect', xref: 'paper', yref: 'paper', x0: px(x0), x1: px(x0 + w), y0: py(top + piece.height), y1: py(top), fillcolor: piece.color ?? '#000', line: { width: 0 }, layer: 'above' });
        } else if (piece.kind === 'text' && piece.text) {
            const bold = piece.fontWeight === 'bold' || Number(piece.fontWeight) >= 600;
            annotations.push({
                text: bold ? `<b>${piece.text}</b>` : piece.text, showarrow: false, xref: 'paper', yref: 'paper',
                x: px(x0), xanchor: 'left', y: py(top), yanchor: 'top',
                font: { family: piece.font ?? design.font ?? PLOTLY_FONT, size: piece.fontSize ?? 11, ...(piece.color ? { color: piece.color } : {}) },
            });
        }
    }
    layout.shapes = shapes;
    layout.annotations = annotations;
}
