// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * PHASE 2: INSTANTIATE SPEC — Plotly backend
 * =============================================================================
 *
 * Translates semantic decisions (Phase 0) and layout dimensions (Phase 1)
 * into Plotly-specific figure properties.
 *
 * Key differences from the other backends:
 *   - PL figures are `{ data: traces[], layout }` and stay pure JSON — axis
 *     tick formatting uses declarative `tickformat`/axis types, never
 *     callback functions
 *   - PL sizing via `layout.width` / `layout.height`
 *   - PL label rotation via `layout.xaxis.tickangle`
 *
 * PL dependency: **Yes — this is where Plotly-specific syntax lives**
 * =============================================================================
 */

import { plAxisTitleRoom, plDateLabelRows, plTickRun, plFitAxisTitles, plFitLegend, plLabelDepth, plMeasure, plThinLines, plYTickTexts } from './frame';
import { cutToWidth, treatedKeyEdge, treatedKeyFontSize, treatedKeySide, valueTickLabels } from '../core/backend-frame';
import type {
    InstantiateContext,
    LayoutResult,
    ChartWarning,
} from '../core/types';

// Plotly places tick labels ~1px from the axis by default — much tighter than the other renderers;
// the profile nudges them out (`ticklabelstandoff`, Plotly ≥ 2.34) and sets the title's standoff.
import { AXIS_TITLE_STANDOFF, PLOTLY_PROFILE, TICK_LABEL_STANDOFF } from './profile';
import { calendarLabels, widestLines } from '../core/calendar-labels';

/** The plot length a banded axis takes: one step per band, as Vega-Lite's `{ step }` width gives it. */
export function bandedSpan(context: InstantiateContext, channel: 'x' | 'y'): number | undefined {
    const { layout } = context;
    const field = context.channelSemantics[channel]?.field;
    const count = (channel === 'x' ? layout.xStepUnit : layout.yStepUnit) === 'group'
        ? (field ? new Set(context.table.map((row) => String(row[field]))).size : 0)
        : (channel === 'x'
            ? layout.xNominalCount || layout.xContinuousAsDiscrete
            : layout.yNominalCount || layout.yContinuousAsDiscrete) || 0;
    return count > 0 ? (channel === 'x' ? layout.xStep : layout.yStep) * count : undefined;
}

function clipLabel(text: string, limit: number, widthOf: (text: string) => number): string {
    if (!(limit > 0) || !Number.isFinite(limit)) return text;
    return cutToWidth(text, limit, widthOf);
}

/**
 * Write the layout's label decision onto every cartesian axis: its font, its angle, and on
 * a banded axis the names wrapped onto their lines and cut at the label limit, as Vega-Lite
 * draws them. Plotly has no label limit, and turns crowded labels on its own unless told.
 */
export function plApplyBandLabels(
    figure: any,
    layout: LayoutResult,
    options: {
        fit?: boolean; temporal?: (channel: 'x' | 'y') => boolean;
        /** How wide a name is in the face it was planned in; Plotly's own face where not given. */
        measure?: (fontSize: number) => (text: string) => number;
    } = {},
): void {
    const measure = options.measure ?? plMeasure;
    for (const [key, ax] of Object.entries<any>(figure.layout ?? {})) {
        const match = /^([xy])axis\d*$/.exec(key);
        if (!match || !ax || typeof ax !== 'object') continue;
        const channel = match[1] as 'x' | 'y';
        const sizing = channel === 'x' ? layout.xLabel : layout.yLabel;
        if (!sizing) continue;
        if (sizing.fontSize) ax.tickfont = { ...(ax.tickfont || {}), size: sizing.fontSize };
        if (options.fit === false) continue;
        // A date cut short no longer names its day.
        const limit = options.temporal?.(channel) ? Infinity : sizing.labelLimit || Infinity;
        const banded = ax.type === 'category' && Array.isArray(ax.categoryarray) && ax.categoryarray.length > 0;
        const fontSize = sizing.fontSize ?? 10;
        let angle = sizing.labelAngle;
        // Names the layout set straight but that overrun their band stand on end.
        if (match[1] === 'x' && banded && !angle && !sizing.labelLines && layout.xStep > 0) {
            const widthOf = measure(fontSize);
            const widest = Math.max(...ax.categoryarray.map((name: unknown) => Math.min(widthOf(String(name)), limit)));
            if (widest + 4 > layout.xStep) angle = -90;
        }
        // Dates in bands are named as a calendar names them (`Jan` over `2025`, `Feb`, …), flat, as
        // Vega-Lite's time axis names them; every few bands where even those will not stand in one.
        // Only where the dates are a regular run the calendar names (months, days), not one-off dates.
        if (match[1] === 'x' && banded && ax.tickvals == null && layout.xStep > 0 && regularRun(ax.categoryarray.map(String))) {
            const named = calendarBandLabels(ax.categoryarray.map(String), layout.xStep, measure(fontSize), fontSize);
            if (named) {
                Object.assign(ax, { tickmode: 'array', tickvals: named.values, ticktext: named.text, tickangle: 0 });
                continue;
            }
        }
        if (match[1] === 'x' && (banded || angle != null)) ax.tickangle = angle ?? 0;
        if (!banded || ax.tickvals != null) continue;
        const lines = new Map((sizing.labelValues ?? []).map((value, index) => [value, sizing.labelLines?.[index]]));
        const names = ax.categoryarray.map(String);
        const text = names.map((name: string) => (lines.get(name) ?? [name])
            .map((line) => clipLabel(line, limit, measure(fontSize))).join('<br>'));
        if (text.every((label: string, index: number) => label === names[index])) continue;
        ax.tickmode = 'array';
        ax.tickvals = ax.categoryarray;
        ax.ticktext = text;
    }
}

/** Whether dates are a sorted run at one step (each month, or each day): a calendar names those in order. */
function regularRun(values: string[]): boolean {
    const times = values.map((v) => Date.parse(v.length === 7 ? `${v}-01` : v));
    if (times.some((t) => !Number.isFinite(t)) || times.length < 3) return false;
    const days = times.slice(1).map((t, i) => (t - times[i]) / 86_400_000);
    if (days.some((d) => d <= 0)) return false;
    const monthly = values.every((v) => /^\d{4}-\d{2}(-01)?$/.test(v));
    if (monthly) return days.every((d) => d >= 28 && d <= 31);
    return days.every((d) => Math.abs(d - days[0]) < 0.5);
}

/**
 * Calendar names for a banded axis of dates whose names as written would not stand flat in their
 * bands ({@link calendarLabels}): each band its month (or day), the first of each year with the year
 * under it. Where those still will not stand in one band, every k-th band is named, k the fewest
 * that hold the widest name and a gap, the bands that open a year named first so every year shows.
 * Undefined where the values are not dates or stand flat as written.
 */
function calendarBandLabels(values: string[], band: number, widthOf: (text: string) => number, fontSize: number): { values: string[]; text: string[] } | undefined {
    const calendar = calendarLabels(values);
    if (!calendar) return undefined;
    const gap = Math.max(6, fontSize / 2);
    if (Math.max(0, ...values.map(widthOf)) + gap <= band) return undefined;
    const widest = widestLines(calendar, widthOf) + gap;
    const stride = Math.max(1, Math.ceil(widest / band));
    const picked: number[] = [];
    calendar.forEach((lines, i) => {
        const opensYear = lines.length > 1;
        const last = picked[picked.length - 1];
        if (last !== undefined && i - last < stride) {
            // A year's opening band takes the place of the band before it, so the year is named.
            if (opensYear && !(calendar[last].length > 1)) picked[picked.length - 1] = i;
            return;
        }
        if (stride === 1 || i % stride === 0 || opensYear) picked.push(i);
    });
    // The first named band of each year states the year.
    let year: string | undefined;
    const text = picked.map((i) => {
        const lines = calendar[i];
        const own = lines.length > 1 ? lines[1] : String(values[i]).slice(0, 4);
        const out = own !== year && lines.length === 1 ? [lines[0], own] : lines;
        year = own;
        return out.join('<br>');
    });
    return { values: picked.map((i) => values[i]), text };
}

/** The widest label line an axis prints, capped at its limit, and how many lines a label takes. */
function labelExtent(ax: any, sizing: LayoutResult['xLabel'] | undefined, measure: (fontSize: number) => (text: string) => number = plMeasure): { width: number; rows: number } | undefined {
    const texts = Array.isArray(ax?.ticktext) ? ax.ticktext : Array.isArray(ax?.categoryarray) ? ax.categoryarray : undefined;
    if (!texts) return undefined;
    const fontSize = sizing?.fontSize ?? 10;
    const lines = texts.map((text: unknown) => String(text).split('<br>'));
    const widthOf = measure(fontSize);
    return {
        width: Math.min(sizing?.labelLimit || Infinity,
            Math.max(0, ...lines.flat().map((line: string) => widthOf(line)))),
        rows: Math.max(1, ...lines.map((parts: string[]) => parts.length)),
    };
}

/**
 * The room a colour bar beside the plot takes: its 30 px bar and padding, its widest tick label, or
 * its title where that is wider. 0 where the figure draws none.
 */
function colorbarRoom(figure: any): number {
    const trace = (figure.data ?? []).find((t: any) => t?.colorbar || t?.marker?.colorbar);
    if (!trace) return 0;
    const bar = trace.colorbar ?? trace.marker?.colorbar ?? {};
    const colors = Array.isArray(trace.marker?.color) ? trace.marker.color : Array.isArray(trace.z) ? trace.z.flat() : [];
    const numbers = colors.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v));
    const lo = typeof trace.cmin === 'number' ? trace.cmin : typeof trace.marker?.cmin === 'number' ? trace.marker.cmin : Math.min(...numbers);
    const hi = typeof trace.cmax === 'number' ? trace.cmax : typeof trace.marker?.cmax === 'number' ? trace.marker.cmax : Math.max(...numbers);
    const fontSize = bar.tickfont?.size ?? 12;
    const ticks = Number.isFinite(lo) && Number.isFinite(hi) ? valueTickLabels([lo, hi]) : ['100'];
    const tickWidth = Math.max(...ticks.map(plMeasure(fontSize)));
    const title = typeof bar.title === 'string' ? bar.title : bar.title?.text;
    const titleWidth = title ? plMeasure(bar.title?.font?.size ?? 14)(String(title)) : 0;
    return Math.ceil(Math.max(30 + 10 + 6 + tickWidth + 16, titleWidth + 24));
}



/**
 * The margins a cartesian figure's axes take, measured as Plotly draws them ({@link PLOTLY_PROFILE}):
 * the widest y label, its tick run and title on the left; the x labels' depth (turned or on lines), tick
 * run and title below; the canvas's edge around all. Plotly's automargin only ever grows a margin, and
 * a margin it grows shrinks the plot under everything hung from it, so each is set to what it will take.
 */
function reserveCartesianMargins(figure: any, context: InstantiateContext): void {
    const { layout } = context;
    const xaxis = figure.layout.xaxis;
    const yaxis = figure.layout.yaxis;
    if (!xaxis && !yaxis) return;
    const edge = PLOTLY_PROFILE.edge;
    const pad = PLOTLY_PROFILE.axisPad;
    const measureText = context.measureText;
    const measure = measureText ? (fontSize: number) => (text: string) => measureText(text, fontSize) : plMeasure;

    let bottom = edge;
    if (xaxis && xaxis.visible !== false) {
        const xFontSize = xaxis.tickfont?.size ?? layout.xLabel?.fontSize ?? 12;
        const x = labelExtent(xaxis, layout.xLabel, measure) ?? { width: 0, rows: 1 };
        const xAngle = Math.abs(xaxis.tickangle ?? 0) * Math.PI / 180;
        const depth = xaxis.showticklabels === false ? 0 : xAngle > 0
            ? x.width * Math.sin(xAngle) + xFontSize * Math.cos(xAngle)
            : plLabelDepth(Math.max(x.rows, plDateLabelRows(figure, 'x')), xFontSize);
        bottom = pad + Math.ceil(depth) + (plTickRun(xaxis) || TICK_LABEL_STANDOFF) + plAxisTitleRoom(xaxis);
    }

    let left = edge;
    if (yaxis && yaxis.visible !== false) {
        const yFontSize = yaxis.tickfont?.size ?? layout.yLabel?.fontSize ?? 12;
        const banded = labelExtent(yaxis, layout.yLabel, measure);
        const width = yaxis.showticklabels === false ? 0
            : banded?.width ?? Math.max(0, ...plYTickTexts(figure).map(measure(yFontSize)));
        left = pad + Math.ceil(width) + (plTickRun(yaxis) || TICK_LABEL_STANDOFF) + plAxisTitleRoom(yaxis);
    }
    const right = Math.max(2 * edge, colorbarRoom(figure));

    figure.layout.margin = { t: 24, r: right, b: bottom, l: left };
}

export function plApplyCartesianAxisSpacing(figure: any): void {
    for (const [key, axis] of Object.entries(figure.layout ?? {})) {
        if (!/^[xy]axis\d*$/.test(key) || !axis || typeof axis !== 'object') continue;
        const cartesianAxis = axis as any;
        cartesianAxis.automargin = true;
        if (cartesianAxis.ticklabelstandoff == null) {
            cartesianAxis.ticklabelstandoff = TICK_LABEL_STANDOFF;
        }
        if (cartesianAxis.title?.text) {
            cartesianAxis.title = { ...cartesianAxis.title, standoff: AXIS_TITLE_STANDOFF };
        }
    }
}

/**
 * Apply the cross-cutting per-axis chart properties (`logScale_x/y`,
 * `includeZero_x/y`) to every cartesian axis of the figure. These are surfaced
 * on many charts by the shared VL option set; implementing them here lets ALL
 * Plotly cartesian charts honor them natively (`axis.type: 'log'`,
 * `axis.rangemode: 'tozero'`). A category axis is skipped (log/zero are
 * meaningless there); a log axis never also forces zero (log 0 is undefined).
 */
export function plApplyAxisProperties(figure: any, context: InstantiateContext): void {
    const cp = context.chartProperties;
    if (!cp || !figure.layout) return;
    const applyAxis = (re: RegExp, logKey: string, zeroKey: string) => {
        const log = cp[logKey];
        const zero = cp[zeroKey];
        if (log == null && zero == null) return;
        for (const [k, ax] of Object.entries(figure.layout)) {
            if (!re.test(k) || !ax || typeof ax !== 'object') continue;
            const a = ax as any;
            if (a.type === 'category') continue;
            if (log === true) {
                a.type = 'log';
                if (a.rangemode === 'tozero') delete a.rangemode;
            } else if (log === false && a.type === 'log') {
                delete a.type;
            }
            if (a.type !== 'log') {
                if (zero === true) a.rangemode = 'tozero';
                else if (zero === false && a.rangemode === 'tozero') a.rangemode = 'normal';
            }
        }
    };
    applyAxis(/^xaxis\d*$/, 'logScale_x', 'includeZero_x');
    applyAxis(/^yaxis\d*$/, 'logScale_y', 'includeZero_y');
}

/**
 * Phase 2: Apply layout and semantic decisions to the Plotly figure.
 *
 * Handles common Plotly plumbing across all templates:
 *   - Figure sizing (_width, _height + layout.width/height)
 *   - Axis label rotation and font sizing
 *   - Overflow truncation warnings
 */
export function plApplyLayoutToSpec(
    figure: any,
    context: InstantiateContext,
    warnings: ChartWarning[],
): void {
    // The key's text size: the layout's, a size or two smaller where the canvas fit says so.
    // Plotly sets its key in the size of its ticks (12 px), not a size over them: the layout's key
    // size follows the axis titles' (14 px), which leaves names larger than the numbers they key.
    // The ticks as the layout fitted them: a small plot sets them below the library's 12 px.
    const tickSize = Number(context.layout.xLabel?.fontSize ?? context.layout.yLabel?.fontSize ?? context.assembleOptions?.baseLabelFontSize) || 12;
    const keyFontSize = treatedKeyFontSize(Math.min(context.layout.legendFontSize ?? tickSize, tickSize), context.assembleOptions);
    const { layout, canvasSize } = context;

    if (!figure.layout) figure.layout = {};

    // ── Figure dimensions ────────────────────────────────────────────────
    let usedDefaultDimensions = false;
    let legendRoom: { right: number; bottom: number } | undefined;
    if (!figure._width) {
        usedDefaultDimensions = true;
        const PADDING = 80; // approximate space for axes, labels

        const xIsDiscrete = layout.xNominalCount > 0 || layout.xContinuousAsDiscrete > 0;
        const yIsDiscrete = layout.yNominalCount > 0 || layout.yContinuousAsDiscrete > 0;

        let plotWidth: number;
        let plotHeight: number;

        if (xIsDiscrete) {
            plotWidth = bandedSpan(context, 'x') ?? (layout.subplotWidth || canvasSize.width);
        } else {
            plotWidth = layout.subplotWidth || canvasSize.width;
        }

        if (yIsDiscrete) {
            plotHeight = bandedSpan(context, 'y') ?? (layout.subplotHeight || canvasSize.height);
        } else {
            plotHeight = layout.subplotHeight || canvasSize.height;
        }

        // The legend beside the plot (or at its foot) takes the room it measures, long names on lines,
        // in the size it is drawn at.
        if (figure.layout.legend) figure.layout.legend.font = { ...(figure.layout.legend.font ?? {}), size: keyFontSize };
        legendRoom = plFitLegend(figure, { width: plotWidth, height: plotHeight }, treatedKeySide(context.assembleOptions, PLOTLY_PROFILE.key), treatedKeyEdge(context.assembleOptions), keyFontSize);
        figure._width = plotWidth + PADDING + (legendRoom?.right ?? 0);
        figure._height = plotHeight + PADDING + (legendRoom?.bottom ?? 0);
        figure._plot = { width: plotWidth, height: plotHeight };
        figure._legendRoom = legendRoom ?? { right: 0, bottom: 0 };
    }

    // ── Tick labels: font, angle, wrapped and cut names ──────────────────
    if (layout.xLabel && !figure.layout.xaxis) figure.layout.xaxis = {};
    if (layout.yLabel?.fontSize && !figure.layout.yaxis) figure.layout.yaxis = {};
    // A bar table lays out its own name column.
    const measureText = context.measureText;
    plApplyBandLabels(figure, layout, {
        fit: context.chartType !== 'Bar Table',
        temporal: (channel) => context.channelSemantics[channel]?.type === 'temporal',
        ...(measureText ? { measure: (fontSize: number) => (text: string) => measureText(text, fontSize) } : {}),
    });

    // ── Axis title + legend fonts — canvas-adaptive header sizes ─────────
    for (const key of Object.keys(figure.layout)) {
        if (!/^[xy]axis\d*$/.test(key)) continue;
        const axis = figure.layout[key];
        if (axis?.title) {
            axis.title = typeof axis.title === 'string' ? { text: axis.title } : axis.title;
            axis.title.font = { ...(axis.title.font || {}), size: layout.titleFontSize };
        }
    }
    if (figure.layout.legend) {
        figure.layout.legend.font = {
            ...(figure.layout.legend.font || {}),
            size: keyFontSize,
        };
    }

    if (figure.layout.margin == null) {
        reserveCartesianMargins(figure, context);
        const margin = figure.layout.margin;
        // A legend set at the foot stands under the x axis, in room of its own.
        if (legendRoom?.bottom) margin.b += legendRoom.bottom;
        // Axis titles longer than their axes take a second line.
        if (figure._plot) {
            const titles = plFitAxisTitles(figure, figure._plot);
            margin.b += titles.x;
            margin.l += titles.y;
        }
        if (usedDefaultDimensions) {
            figure._width += Math.max(0, margin.l + margin.r - 80);
            figure._height += Math.max(0, margin.t + margin.b - 80 - (legendRoom?.bottom ?? 0));
        }
    }
    if (figure._plot) plThinLines(figure, context, figure._plot.height);
    plApplyCartesianAxisSpacing(figure);
    figure.layout.width = figure._width;
    figure.layout.height = figure._height;

    // ── Overflow truncation warnings ─────────────────────────────────────
    if (layout.truncations && layout.truncations.length > 0) {
        for (const trunc of layout.truncations) {
            warnings.push({
                severity: 'warning',
                code: 'overflow',
                message: trunc.message,
                channel: trunc.channel,
                field: trunc.field,
            });
        }
    }
}

/**
 * Apply tooltips to a Plotly figure. Plotly hover is on by default; this
 * pins an explicit unified hover mode so tooltips read across series.
 */
export function plApplyTooltips(figure: any): void {
    if (!figure.layout) figure.layout = {};
    if (figure.layout.hovermode == null) {
        figure.layout.hovermode = 'closest';
    }
}
