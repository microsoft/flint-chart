// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The frame around a Chart.js chart: its title and subtitle, the room its scales' labels and titles
 * take, and its legend, measured the way the layout measures Vega-Lite's but drawn in Chart.js' own
 * idiom: the title and subtitle plugins centred over the canvas in Chart.js' type (12 px, bold over
 * normal), lines given as arrays, a legend whose long names stand on lines in a column beside the plot
 * or, where they will not, a row at the foot with the names cut.
 *
 * Chart.js lays its boxes out inside the canvas it is given, so the plot keeps the size the layout
 * planned only if the canvas (`_width`, `_height`) is the plot plus what Chart.js will set around it;
 * that is what this measures.
 */

import type { InstantiateContext } from '../core/types';
import type { LabelSizingDecision } from '../core/decisions';
import type { ReservePart } from '../core/furniture-reserve';
import { tableTextMeasurer } from '../core/text-width';
import { fitAxisTitle } from '../core/axis-title-fit';
import { planKeyLayout, type KeyToLayout } from '../core/legend-layout';
import { plotHeightAfter } from '../core/title-fit';
import { denseLineWidth, linesPerPanel } from '../core/line-density';
import { keyBlock, keyPlanStyle } from '../core/backend-profile';
import { CJS_FONT, cjsKeyGeometry } from './profile';
import { cutToWidth, onNiceTick, planTitleBlock, treatedKeyEdge, treatedKeyFontSize, treatedKeySide, valueTickLabels, widestLine, type BackendTextStyle, type TitleBlock } from '../core/backend-frame';

export { CJS_FONT };
const FONT = CJS_FONT;

/** Chart.js' own title plugins: a 12 px bold headline over a 12 px deck, both centred, 10 px around. */
export const CJS_TITLE = {
    padding: 10,
    gap: 4,
    headline: { fontSize: 12, fontWeight: 'bold', font: FONT, lineHeight: 1.2 } as BackendTextStyle,
    deck: { fontSize: 12, fontWeight: 'normal', font: FONT, lineHeight: 1.2 } as BackendTextStyle,
};

/** Chart.js' tick length and the padding between a tick and its label. */
const TICK = 8;
const TICK_PADDING = 3;
/** Chart.js' padding around a scale title, above and below. */
const SCALE_TITLE_PADDING = 8;
/** Room at the plot's far end for the last tick label's overhang. */
const END_ROOM = 12;
/** The gutter kept for a legend the template writes itself, as the layout pass keeps it. */
const STATED_LEGEND = 96;
/** Chart.js' line width, which a line dataset draws where it sets none. */
const CJS_LINE_WIDTH = 3;

export interface CJSFrame {
    plot: { width: number; height: number };
    designed: { width: number; height: number };
    parts: Partial<Record<ReservePart, number>>;
    title?: TitleBlock;
}

const measure = (fontSize: number, weight: string | number = 'normal') => tableTextMeasurer(fontSize, FONT, weight, 'normal');

const fontSizeOf = (font: any, fallback = 12): number => (typeof font?.size === 'number' ? font.size : fallback);

/** The scale that runs names in bands (Chart.js' category scale), and the values it names. */
function categoryValues(config: any, scale: any, channel: 'x' | 'y'): string[] | undefined {
    const type = scale?.type ?? (channel === (config.options?.indexAxis === 'y' ? 'y' : 'x') ? 'category' : 'linear');
    if (type !== 'category') return undefined;
    const labels = scale.labels ?? config.data?.labels;
    return Array.isArray(labels) ? labels.map((label: unknown) => String(label)) : undefined;
}

/** Each category's lines as the scale prints them, from the layout's decision, cut at its limit. */
function bandTexts(values: string[], sizing: LabelSizingDecision, fontSize: number): Map<string, string[]> {
    const widthOf = measure(fontSize);
    const lines = new Map((sizing.labelValues ?? []).map((value, index) => [value, sizing.labelLines?.[index]]));
    const limit = sizing.labelLimit > 0 && sizing.labelForm !== 'calendar' ? sizing.labelLimit : undefined;
    return new Map(values.map((value) => [value, (lines.get(value) ?? [value]).map((line) => cutToWidth(line, limit, widthOf))]));
}

/** Write the layout's band-label decision in Chart.js' terms: a tick callback giving lines, the rotation pinned. */
function realizeBandLabels(config: any, scale: any, channel: 'x' | 'y', sizing: LabelSizingDecision): void {
    const values = categoryValues(config, scale, channel);
    if (!values) return;
    const ticks = (scale.ticks ??= {});
    if (sizing.fontSize) ticks.font = { ...(ticks.font ?? {}), size: sizing.fontSize };
    const texts = bandTexts(values, sizing, fontSizeOf(ticks.font));
    const shown = channel === 'x' && sizing.overflow?.step === 'skip' && sizing.overflow.shown ? new Set(sizing.overflow.shown) : undefined;
    // A callback only where the names print otherwise than as written, so a plain config stays JSON.
    const rewritten = Boolean(shown) || [...texts].some(([value, lines]) => lines.length !== 1 || lines[0] !== value);
    if (rewritten) {
        ticks.callback = function (this: any, value: number | string) {
            const label = typeof this?.getLabelForValue === 'function' ? String(this.getLabelForValue(value)) : String(value);
            if (shown && !shown.has(label)) return null;
            const lines = texts.get(label) ?? [label];
            return lines.length > 1 ? lines : lines[0];
        };
    } else if (ticks.callback?._flintCalendar) {
        delete ticks.callback;
        ticks.minRotation = 0;
        ticks.maxRotation = 0;
    }
    ticks.autoSkip = false;
    if (channel === 'x') {
        const angle = Math.abs(sizing.labelAngle ?? 0);
        ticks.minRotation = angle;
        ticks.maxRotation = angle;
    }
}

/** The numbers a value scale spans, from its datasets: stacked datasets summed. */
function datasetExtent(config: any, channel: 'x' | 'y', stacked: boolean): [number, number] | undefined {
    let lo = Infinity;
    let hi = -Infinity;
    const sums: number[] = [];
    for (const dataset of config.data?.datasets ?? []) {
        (dataset?.data ?? []).forEach((item: any, i: number) => {
            const raw = item && typeof item === 'object' ? item[channel] : item;
            const value = Array.isArray(raw) ? raw[1] : raw;
            if (typeof value !== 'number' || !Number.isFinite(value)) return;
            lo = Math.min(lo, value);
            hi = Math.max(hi, value);
            if (stacked) sums[i] = (sums[i] ?? 0) + value;
        });
    }
    for (const sum of sums) if (sum !== undefined) { lo = Math.min(lo, sum); hi = Math.max(hi, sum); }
    return Number.isFinite(lo) ? [lo, hi] : undefined;
}

/** The labels a scale prints, as lines, for measuring. */
function printedLabels(config: any, scale: any, channel: 'x' | 'y'): string[][] {
    if (!scale || scale.display === false || scale.ticks?.display === false) return [];
    const callback = scale.ticks?.callback;
    const format = (value: unknown, index = 0): string[] => {
        if (typeof callback === 'function') {
            try {
                const out = callback.call({ getLabelForValue: (v: unknown) => v }, value, index, []);
                if (out == null) return [];
                return Array.isArray(out) ? out.map(String) : [String(out)];
            } catch { /* measured as written */ }
        }
        return [typeof value === 'number' ? value.toLocaleString('en-US') : String(value)];
    };
    const values = categoryValues(config, scale, channel);
    if (values) return values.map((value, index) => format(value, index)).filter((lines) => lines.length);
    if (scale.type === 'time' || scale.type === 'timeseries') return [['Sep 2024']];
    const extent = datasetExtent(config, channel, Boolean(scale.stacked));
    if (!extent) return [];
    const min = typeof scale.min === 'number' ? scale.min : scale.beginAtZero === false ? extent[0] : Math.min(0, extent[0]);
    const max = typeof scale.max === 'number' ? scale.max : Math.max(0, extent[1]);
    return valueTickLabels([min, max]).map((text) => format(Number(text.replace(/,/g, ''))));
}

/** How far a scale's labels run from its line, in px. */
function labelRun(config: any, scale: any, channel: 'x' | 'y'): number {
    const labels = printedLabels(config, scale, channel);
    if (!labels.length) return 0;
    const fontSize = fontSizeOf(scale.ticks?.font);
    const widest = widestLine(labels, measure(fontSize));
    const lineHeight = Math.ceil(fontSize * 1.2);
    const lines = Math.max(1, ...labels.map((l) => l.length));
    const angle = (Number(scale.ticks?.minRotation) || 0) * Math.PI / 180;
    if (channel === 'y') return Math.ceil(widest);
    return angle ? Math.ceil(Math.sin(angle) * widest + Math.cos(angle) * lines * lineHeight) : lines * lineHeight;
}

/** Fit a scale's title to the scale's length, two lines where longer; the room it takes across. */
function fitScaleTitle(scale: any, length: number): number {
    const title = scale?.title;
    if (!title?.display || !title.text) return 0;
    const text = Array.isArray(title.text) ? title.text.join(' ') : String(title.text);
    const fontSize = fontSizeOf(title.font);
    const widthOf = measure(fontSize);
    const fit = fitAxisTitle(text, length, widthOf, fontSize);
    if (fit) title.text = fit.lines.map((line) => cutToWidth(line, fit.limit, widthOf));
    const lines = fit?.lines.length ?? 1;
    return Math.ceil(lines * fontSize * 1.2) + SCALE_TITLE_PADDING;
}

/** A padded value scale's ends are not round ticks: Chart.js would label them, crowding their neighbours. */
function hidePaddedEnds(scale: any): void {
    if (!scale || typeof scale.min !== 'number' || typeof scale.max !== 'number') return;
    if (onNiceTick(scale.min, [scale.min, scale.max]) && onNiceTick(scale.max, [scale.min, scale.max])) return;
    const ticks = (scale.ticks ??= {});
    if (ticks.includeBounds == null) ticks.includeBounds = false;
}

/** The legend, where Chart.js would show one. */
function shownLegend(config: any): any | undefined {
    const legend = config.options?.plugins?.legend;
    if (!legend || legend.display === false) return undefined;
    if (legend.display !== true && (config.data?.datasets?.length ?? 0) < 2 && !['pie', 'doughnut', 'polarArea'].includes(config.type)) return undefined;
    return legend;
}

/** The names the legend lists. */
function legendNames(config: any): string[] {
    const pie = ['pie', 'doughnut', 'polarArea'].includes(config.type);
    const names = pie ? config.data?.labels ?? [] : (config.data?.datasets ?? []).map((d: any) => d?.label);
    return names.map((name: unknown) => String(name ?? '')).filter(Boolean);
}

/**
 * Lay the legend out as the layout lays Vega-Lite's keys ({@link planKeyLayout}): a column beside the
 * plot whose long names stand on lines, or a row at the foot whose names are cut, as Chart.js can only
 * set one line an entry in a row. Returns the room it takes beside and below the plot.
 */
function placeLegend(config: any, plot: { width: number; height: number }, canvasWidth: number, sideHeight: number, sideWidth: number, sideCap: number, moveTo?: 'top' | 'bottom'): { right?: number; bottom?: number } | undefined {
    const legend = shownLegend(config);
    if (!legend || (legend.position && legend.position !== 'right')) return undefined;
    // A legend the template writes itself (a ramp's stops, a filter) keeps the gutter the layout pass gave it.
    if (legend.labels?.generateLabels || legend.labels?.filter) return { right: STATED_LEGEND };
    const names = legendNames(config);
    if (!names.length) return undefined;
    const labels = (legend.labels ??= {});
    const fontSize = fontSizeOf(labels.font);
    const geometry = cjsKeyGeometry(labels, fontSize);
    const box = labels.boxWidth ?? 40;
    const padding = geometry.pad.x;
    const key: KeyToLayout = {
        gradient: false,
        labels: names,
        count: names.length,
        title: legend.title?.display && legend.title.text ? String(legend.title.text) : null,
        style: {
            labelFont: FONT, labelFontSize: fontSize, labelFontWeight: 'normal', labelFontStyle: 'normal',
            titleFont: FONT, titleFontSize: fontSizeOf(legend.title?.font, fontSize), titleFontWeight: 'bold', titleFontStyle: 'normal',
            // Chart.js wraps a side legend into more columns, as the planner does by default.
            ...keyPlanStyle(geometry),
            titlePadding: 4,
        },
        orient: 'right',
        edges: ['right', 'bottom'],
        fixed: false,
        fixedTitle: true,
        ...(moveTo ? { moveTo: 'bottom' } : {}),
    };
    const laid = planKeyLayout([key], plot, tableTextMeasurer, Number.isFinite(sideWidth) ? { sideWidth } : {}).keys[0];
    if (!laid) return undefined;
    const widthOf = measure(fontSize);
    const bottom = laid.orient === 'bottom' || laid.orient === 'top';
    const lines = new Map(names.map((name, index) => [name, laid.labelLines?.[index] ?? [name]]));
    // Chart.js clips a side legend at its width cap rather than cut its names: they are cut first.
    const room = sideWidth - box - fontSize / 2 - 2 * padding;
    const limit = Math.min(laid.labelLimit > 0 ? laid.labelLimit : Infinity, bottom ? Infinity : room);
    const textOf = (name: string): string | string[] => {
        const own = lines.get(name) ?? [name];
        if (bottom) return cutToWidth(own.join(' '), Number.isFinite(limit) ? limit : Math.max(...own.map(widthOf)) + 1, widthOf);
        const cut = own.map((line) => cutToWidth(line, Number.isFinite(limit) ? limit : undefined, widthOf));
        return cut.length > 1 ? cut : cut[0];
    };
    const changes = names.some((name) => {
        const text = textOf(name);
        return Array.isArray(text) || text !== name;
    });
    if (changes) {
        const stated = labels.generateLabels;
        labels.generateLabels = function (this: any, chart: any) {
            const Chart = chart?.constructor;
            const base = stated
                ?? Chart?.overrides?.[chart?.config?.type]?.plugins?.legend?.labels?.generateLabels
                ?? Chart?.defaults?.plugins?.legend?.labels?.generateLabels;
            const items: any[] = base ? base.call(this, chart) : [];
            return items.map((item) => ({ ...item, text: textOf(String(item.text)) }));
        };
    }
    if (bottom) {
        // Chart.js flows a legend at the foot in rows across the canvas, an entry a line each.
        legend.position = 'bottom';
        const block = keyBlock(geometry, {
            entries: names.map((name) => [String(textOf(name))]), fontSize, widthOf, orientation: 'horizontal', room: canvasWidth,
        });
        return { bottom: block.height };
    }
    // A column beside the plot, as Chart.js fits it: each entry its swatch, half an em, and its widest
    // line; entries a line (or their lines) tall, `padding` apart, more columns where they overrun the height.
    legend.position = 'right';
    const itemHeight = geometry.entryHeight(fontSize, 1);
    const entries = names.map((name) => {
        const text = textOf(name);
        const lines = Array.isArray(text) ? text : [text];
        return { width: geometry.lead + Math.max(...lines.map(widthOf)), height: geometry.entryHeight(fontSize, lines.length) };
    });
    const titleHeight = legend.title?.display ? Math.ceil(fontSizeOf(legend.title.font, fontSize) * 1.2) + 2 * (legend.title.padding ?? 0) : 0;
    const columnRoom = Math.max(itemHeight, sideHeight - titleHeight);
    let width = padding;
    let used = 0;
    let column = 0;
    entries.forEach((entry, index) => {
        if (index > 0 && used + entry.height + 2 * padding > columnRoom) { width += column + padding; used = 0; column = 0; }
        used += entry.height + padding;
        column = Math.max(column, entry.width);
    });
    width += column + 10;
    // Chart.js holds a box beside the chart area to a quarter of the canvas, whatever its entries ask.
    return { right: Math.ceil(Math.min(width, sideCap)) };
}

/** Write the title block in Chart.js' title and subtitle plugins. */
function writeTitle(config: any, block: TitleBlock): void {
    const plugins = ((config.options ??= {}).plugins ??= {});
    const lines = (part: { lines: string[] }) => (part.lines.length > 1 ? part.lines : part.lines[0]);
    if (block.headline) {
        plugins.title = {
            ...(plugins.title ?? {}),
            display: true,
            text: lines(block.headline),
            font: { ...(plugins.title?.font ?? {}), size: block.headline.fontSize, weight: 'bold', lineHeight: CJS_TITLE.headline.lineHeight },
            padding: { top: CJS_TITLE.padding, bottom: block.deck ? CJS_TITLE.gap : CJS_TITLE.padding },
        };
    }
    if (block.deck) {
        plugins.subtitle = {
            ...(plugins.subtitle ?? {}),
            display: true,
            text: lines(block.deck),
            font: { ...(plugins.subtitle?.font ?? {}), size: block.deck.fontSize, lineHeight: CJS_TITLE.deck.lineHeight },
            padding: { top: block.headline ? 0 : CJS_TITLE.padding, bottom: CJS_TITLE.padding },
        };
    }
}

/** The height Chart.js gives the title block: its lines and the plugins' padding. */
function titleRoom(block: TitleBlock): number {
    return block.height - (block.headline && block.deck ? CJS_TITLE.gap : 0)
        + (block.headline ? CJS_TITLE.padding + (block.deck ? CJS_TITLE.gap : CJS_TITLE.padding) : 0)
        + (block.deck ? (block.headline ? 0 : CJS_TITLE.padding) + CJS_TITLE.padding : 0);
}

/** Thin a chart's lines where many share the plot, from Chart.js' 3 px. */
function thinLines(config: any, context: InstantiateContext, plotHeight: number): void {
    const lines = (config.data?.datasets ?? []).filter((d: any) => (d?.type ?? config.type) === 'line');
    if (lines.length < 2) return;
    const width = denseLineWidth(CJS_LINE_WIDTH, Math.max(lines.length, linesPerPanel(context.table, context.channelSemantics)), plotHeight);
    if (width === undefined) return;
    for (const dataset of lines) {
        if (dataset.borderWidth != null && dataset.borderWidth !== CJS_LINE_WIDTH) continue;
        dataset.borderWidth = width;
    }
}

/**
 * Measure and set the frame of a finished config: band labels as the layout decided them, scale
 * gutters measured, scale titles fitted, the legend placed, the title broken over its block, and the
 * canvas the plot plus all that. Returns what it measured for the canvas fit.
 */
export function cjsFitFrame(
    config: any, context: InstantiateContext, text: { title?: string; subtitle?: string }, planned: { x: boolean; y: boolean },
    titleWidth = 0,
): CJSFrame {
    const { layout } = context;
    const scales = config.options?.scales;
    const x = scales?.x;
    const y = scales?.y;
    const cartesian = Boolean(x && y && config._plot && config.type !== 'radar' && config.type !== 'polarArea');
    const parts: Partial<Record<ReservePart, number>> = {};
    const width0 = Number(config._width) || context.canvasSize.width;
    const height0 = Number(config._height) || context.canvasSize.height;

    if (!cartesian) {
        const block = planTitleBlock(text, width0 - 2 * CJS_TITLE.padding, CJS_TITLE);
        if (block) {
            writeTitle(config, block);
            const room = titleRoom(block);
            config._height = Math.round(height0 + room);
            parts.title = room;
        }
        delete config._plot;
        const plot = { width: width0, height: height0 };
        return { plot, designed: plot, parts, ...(block ? { title: block } : {}) };
    }

    const plot = { width: Number(config._plot.width), height: Number(config._plot.height) };
    delete config._plot;
    const designed = { ...plot };
    if (planned.x) realizeBandLabels(config, x, 'x', layout.xLabel);
    if (planned.y) realizeBandLabels(config, y, 'y', layout.yLabel);
    hidePaddedEnds(x);
    hidePaddedEnds(y);

    const yLabels = labelRun(config, y, 'y') + TICK_PADDING + TICK;
    const yTitle = fitScaleTitle(y, plot.height);
    const xLabels = labelRun(config, x, 'x') + TICK_PADDING + TICK;
    const xTitle = fitScaleTitle(x, plot.width);
    // Chart.js gives a box beside the chart area at most half the canvas over the boxes beside it (the
    // legend and the y scale): a quarter of the canvas, so a third of the rest.
    const capped = (plot.width + yLabels + yTitle) / 3;
    // A canvas fit that sets the key's text smaller does so before the key is measured.
    const shown = shownLegend(config);
    if (shown && context.assembleOptions?.canvasTreatment?.keyScale) {
        const labels = (shown.labels ??= {});
        labels.font = { ...(labels.font ?? {}), size: treatedKeyFontSize(fontSizeOf(labels.font), context.assembleOptions) };
    }
    const legend = placeLegend(config, plot, plot.width + yLabels + yTitle + END_ROOM, plot.height + xLabels + xTitle, Math.min(capped, treatedKeySide(context.assembleOptions, cjsKeyGeometry(shown?.labels ?? {}, fontSizeOf(shown?.labels?.font))) ?? Infinity), capped, treatedKeyEdge(context.assembleOptions));
    const right = legend?.right ?? END_ROOM;
    const foot = legend?.bottom ?? 0;
    const left = yLabels + yTitle;
    // A narrow chart's title may run as wide as its box allows rather than stack into many lines; the
    // chart area takes the width the title needs, so the drawing grows wider rather than taller.
    const block = planTitleBlock(text, Math.max(plot.width + left + right, titleWidth) - 2 * CJS_TITLE.padding, CJS_TITLE);
    if (block) plot.width = Math.max(plot.width, Math.ceil(block.width + 2 * CJS_TITLE.padding - left - right));
    const width = plot.width + left + right;

    let top = END_ROOM;
    if (block) {
        writeTitle(config, block);
        top = titleRoom(block) + END_ROOM / 2;
        // A broken title takes its extra lines from a continuous plot, not from the canvas.
        if (!categoryValues(config, y, 'y') && block.broken > 0) plot.height = plotHeightAfter(plot.height, block.broken);
    }

    thinLines(config, context, plot.height);

    config._width = Math.round(width);
    config._height = Math.round(plot.height + top + xLabels + xTitle + foot);
    // The plot the frame planned, for tools that compare it with what Chart.js draws.
    config._planned = { plot: { width: Math.round(plot.width), height: Math.round(plot.height) }, left: Math.round(left), right: Math.round(right), top: Math.round(top), bottom: Math.round(xLabels + xTitle + foot) };
    Object.assign(parts, {
        yLabels, ...(yTitle ? { yTitle } : {}),
        xLabels, ...(xTitle ? { xTitle } : {}),
        title: top, sideKeys: right,
        ...(foot ? { stackedKeys: foot } : {}),
    });
    return { plot, designed, parts, ...(block ? { title: block } : {}) };
}
