// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The frame around an ECharts chart: its title block, the room its axes' labels and names take, and
 * where its key stands, measured the way the layout measures Vega-Lite's — but drawn in ECharts' own
 * idiom: the title centred over the canvas in ECharts' type, names wrapped with `\n`, a key that will
 * not fit beside the plot moved to the foot, where ECharts sets its legend by default.
 *
 * Runs after the template and `ecApplyLayoutToSpec`, on a finished option. The plot keeps the size the
 * layout gave it; what is around it is measured, and the canvas (`_width`, `_height`) is the plot plus
 * that. A headline or deck that breaks takes its extra lines out of a continuous plot's height, as the
 * plan takes them in Vega-Lite.
 */

import type { InstantiateContext } from '../core/types';
import type { LabelSizingDecision } from '../core/decisions';
import type { ReservePart } from '../core/furniture-reserve';
import { tableTextMeasurer } from '../core/text-width';
import { fitAxisTitle } from '../core/axis-title-fit';
import { planKeyLayout, type KeyToLayout } from '../core/legend-layout';
import { plotHeightAfter } from '../core/title-fit';
import { denseLineWidth, linesPerPanel } from '../core/line-density';
import { EC_LEGEND_TITLE_ID, EC_SIZE_KEY_ID } from './graphic-ids';
import { keyBlock, keyPlanStyle } from '../core/backend-profile';
import { ECHARTS_FONT, ecKeyGeometry } from './profile';
import {
    cutToWidth, onNiceTick, planTitleBlock, treatedKeyEdge, treatedKeyFontSize, treatedKeySide, valueTickLabels, widestLine, type BackendTextStyle, type TitleBlock,
} from '../core/backend-frame';

const FONT = ECHARTS_FONT;

/** ECharts' own title: centred 15 px from the top, 5 px padding, an 18 px bold headline over a 12 px deck 10 px below it. */
export const EC_TITLE = {
    top: 15,
    padding: 5,
    gap: 10,
    headline: { fontSize: 18, fontWeight: 'bold', font: FONT, lineHeight: 1.25 } as BackendTextStyle,
    deck: { fontSize: 12, fontWeight: 'normal', font: FONT, lineHeight: 1.4 } as BackendTextStyle,
};

/** Room kept at the canvas edge, as the layout pass keeps it (see `ecApplyLayoutToSpec`). */
const CANVAS_BUFFER = 16;
/** ECharts' gap between the axis line and its labels (`axisLabel.margin`). */
const LABEL_MARGIN = 8;
/** The gap between an axis's labels and its name. */
const NAME_GAP = 10;
/** The gap between the plot and a key beside it. */
const KEY_GAP = 12;
/** The gap between the title block and what stands below it. */
const TITLE_GAP = 8;
/** The room a legend in one row at the canvas's foot takes, as the layout pass reserves it. */
const FOOT_LEGEND = 30;
/** The gap between what stands at the canvas's foot (keys, a ramp) and the x name above it. */
const FOOT_GAP = 8;
/** The room over the plot's top edge for the top tick label's overhang. */
const TOP_OVERHANG = 12;
/** ECharts' line width, which a chart draws where it sets none. */
const EC_LINE_WIDTH = 2;

/** What the frame measured, for the canvas fit. */
export { EC_LEGEND_TITLE_ID };

export interface ECFrame {
    plot: { width: number; height: number };
    designed: { width: number; height: number };
    parts: Partial<Record<ReservePart, number>>;
    title?: TitleBlock;
}

const measure = (fontSize: number, weight: string | number = 'normal') => tableTextMeasurer(fontSize, FONT, weight, 'normal');

const one = (value: any) => (Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value);

/** The option's one grid with one x and one y axis, where it has exactly that. */
function singleGrid(option: any): { grid: any; xAxis: any; yAxis: any } | undefined {
    const grid = one(option.grid);
    const xAxis = one(option.xAxis);
    const yAxis = one(option.yAxis);
    if (!grid || !xAxis || !yAxis || typeof grid.left !== 'number' || typeof grid.top !== 'number') return undefined;
    if (!(Number(option._width) > 0) || !(Number(option._height) > 0)) return undefined;
    return { grid, xAxis, yAxis };
}

/** Each category's text as the axis prints it, from the layout's decision: its lines, cut at the limit. */
function bandTexts(axis: any, sizing: LabelSizingDecision): Map<string, string[]> | undefined {
    if (axis?.type !== 'category' || !Array.isArray(axis.data)) return undefined;
    const values: string[] = axis.data.map((d: any) => String(d?.value ?? d));
    const fontSize = axis.axisLabel?.fontSize ?? sizing.fontSize ?? 12;
    const widthOf = measure(fontSize);
    const lines = new Map((sizing.labelValues ?? []).map((value, index) => [value, sizing.labelLines?.[index]]));
    const limit = sizing.labelLimit > 0 && sizing.labelForm !== 'calendar' ? sizing.labelLimit : undefined;
    return new Map(values.map((value) => [value, (lines.get(value) ?? [value]).map((line) => cutToWidth(line, limit, widthOf))]));
}

/**
 * Write the layout's band-label decision onto a category axis in ECharts' terms: the names on their
 * lines (`\n`), turned (`rotate`), cut, every one shown (`interval: 0`) or only those the layout keeps.
 */
function realizeBandLabels(axis: any, channel: 'x' | 'y', sizing: LabelSizingDecision): void {
    const texts = bandTexts(axis, sizing);
    if (!texts) return;
    const label = (axis.axisLabel ??= {});
    if (sizing.fontSize) label.fontSize = sizing.fontSize;
    const fontSize = label.fontSize ?? 12;
    const byValue = new Map([...texts].map(([value, lines]) => [value, lines.join('\n')]));
    if ([...byValue].some(([value, text]) => text !== value)) label.formatter = (value: unknown) => byValue.get(String(value)) ?? String(value);
    // The layout pass's own guesses (calendar names where crowded, a cut by characters) give way to the plan.
    else if (label.formatter?._flintCalendar) delete label.formatter;
    if ([...texts.values()].some((lines) => lines.length > 1)) label.lineHeight = sizing.labelLineHeight ?? Math.ceil(fontSize * 1.2);
    if (channel === 'x') {
        label.rotate = sizing.labelAngle ? -sizing.labelAngle : 0;
        const shown = sizing.overflow?.step === 'skip' && sizing.overflow.shown ? new Set(sizing.overflow.shown) : undefined;
        label.interval = shown ? (_index: number, value: unknown) => shown.has(String(value)) : 0;
    } else {
        label.interval = 0;
    }
}

/** The numbers a value axis spans, from what its series draw: stacked series summed. */
function seriesExtent(option: any, valueChannel: 'x' | 'y'): [number, number] | undefined {
    const index = valueChannel === 'y' ? 1 : 0;
    const stacks = new Map<string, number[]>();
    let lo = Infinity;
    let hi = -Infinity;
    const read = (item: any): number | undefined => {
        const raw = item && typeof item === 'object' && !Array.isArray(item) ? item.value : item;
        const value = Array.isArray(raw) ? raw[index] : raw;
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    };
    for (const series of option.series ?? []) {
        if (!Array.isArray(series?.data)) continue;
        const stack = series.stack != null ? String(series.stack) : undefined;
        series.data.forEach((item: any, i: number) => {
            const value = read(item);
            if (value === undefined) return;
            if (stack) {
                const sums = stacks.get(stack) ?? [];
                sums[i] = (sums[i] ?? 0) + value;
                stacks.set(stack, sums);
            }
            lo = Math.min(lo, value);
            hi = Math.max(hi, value);
        });
    }
    for (const sums of stacks.values()) for (const sum of sums) if (sum !== undefined) { lo = Math.min(lo, sum); hi = Math.max(hi, sum); }
    return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : undefined;
}

/** The labels an axis prints, as lines, for measuring: names as the axis sets them, numbers as its ticks will. */
function printedLabels(option: any, axis: any, channel: 'x' | 'y'): string[][] {
    if (axis?.axisLabel?.show === false) return [];
    const formatter = axis.axisLabel?.formatter;
    const format = (value: unknown): string => {
        if (typeof formatter === 'function') {
            try { return String(formatter(value, 0)); } catch { return String(value); }
        }
        if (typeof formatter === 'string') return formatter.replace('{value}', String(value));
        return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
    };
    if (axis.type === 'category' && Array.isArray(axis.data)) {
        return axis.data.map((d: any) => format(d?.value ?? d).split('\n'));
    }
    if (axis.type === 'value' || axis.type === 'log' || axis.type == null) {
        const extent = seriesExtent(option, channel);
        if (!extent) return [];
        const min = typeof axis.min === 'number' ? axis.min : axis.scale ? extent[0] : Math.min(0, extent[0]);
        const max = typeof axis.max === 'number' ? axis.max : axis.scale ? extent[1] : Math.max(0, extent[1]);
        return valueTickLabels([min, max], 5, (value) => format(value)).map((text) => text.split('\n'));
    }
    // A time axis prints a date or a year; measured as a short date.
    return [['Sep 2024']];
}

/** How deep or wide an axis's labels run away from the axis line, in px. */
function labelRun(option: any, axis: any, channel: 'x' | 'y'): number {
    const labels = printedLabels(option, axis, channel);
    if (!labels.length) return 0;
    const fontSize = axis.axisLabel?.fontSize ?? 12;
    const widest = widestLine(labels, measure(fontSize));
    const lineHeight = axis.axisLabel?.lineHeight ?? Math.ceil(fontSize * 1.2);
    const lines = Math.max(1, ...labels.map((l) => l.length));
    const angle = Math.abs(Number(axis.axisLabel?.rotate) || 0) * Math.PI / 180;
    if (channel === 'y') return angle ? Math.ceil(Math.cos(angle) * widest + Math.sin(angle) * fontSize) : Math.ceil(widest);
    return angle ? Math.ceil(Math.sin(angle) * widest + Math.cos(angle) * lines * lineHeight) : lines * lineHeight;
}

/**
 * A value axis whose ends the layout padded off the round ticks (a scatter's domain) prints its ends
 * as they fall — `11.25`, `41.4` — crowding the round ticks beside them; those ends go unlabelled,
 * as Vega-Lite leaves them.
 */
function hidePaddedEnds(axis: any): void {
    if (axis?.type !== 'value' || typeof axis.min !== 'number' || typeof axis.max !== 'number') return;
    const domain: [number, number] = [axis.min, axis.max];
    const label = (axis.axisLabel ??= {});
    if (!onNiceTick(axis.min, domain) && label.showMinLabel == null) label.showMinLabel = false;
    if (!onNiceTick(axis.max, domain) && label.showMaxLabel == null) label.showMaxLabel = false;
}

/**
 * A time axis the template stood on end stands flat where its labels fit across the plot, as
 * Vega-Lite sets them: a label that fits a sixth of the plot reads flat, and ECharts leaves out any
 * tick label that would collide with its neighbour (`hideOverlap`).
 */
function flattenTimeLabels(axis: any, plotWidth: number): void {
    if (axis?.type !== 'time' || Math.abs(Number(axis.axisLabel?.rotate) || 0) !== 90) return;
    const formatter = axis.axisLabel?.formatter;
    const sampleAt = Date.UTC(2024, 8, 28, 12, 0, 0);
    let sample = 'Sep 2024';
    if (typeof formatter === 'function') {
        try { sample = String(formatter(sampleAt, 0)); } catch { /* measured as a month */ }
    } else if (typeof formatter === 'string') {
        const parts: Record<string, string> = { yyyy: '2024', yy: '24', MMMM: 'September', MMM: 'Sep', MM: '09', M: '9', dd: '28', d: '28', HH: '12', H: '12', hh: '12', mm: '00', ss: '00' };
        sample = formatter.replace(/\{(\w+)\}/g, (_m: string, key: string) => parts[key] ?? key);
    }
    const fontSize = axis.axisLabel?.fontSize ?? 12;
    const widest = Math.max(...sample.split('\n').map(measure(fontSize)));
    if (6 * (widest + 12) > plotWidth) return;
    // ECharts may set more ticks than that: those that would collide it leaves out, as it does by its own rule.
    axis.axisLabel.rotate = 0;
    axis.axisLabel.hideOverlap = true;
}

/** Fit an axis's name to the axis's length, wrapped onto two lines where longer; the height it takes across. */
function fitAxisName(axis: any, length: number): number {
    const name = axis?.name;
    if (typeof name !== 'string' || !name.trim()) return 0;
    const fontSize = axis.nameTextStyle?.fontSize ?? 12;
    const widthOf = measure(fontSize);
    const fit = fitAxisTitle(name.replace(/\n/g, ' '), length, widthOf, fontSize);
    const lineHeight = Math.ceil(fontSize * 1.2);
    if (fit) {
        axis.name = fit.lines.map((line) => cutToWidth(line, fit.limit, widthOf)).join('\n');
        axis.nameTextStyle = { ...(axis.nameTextStyle ?? {}), lineHeight };
    }
    return (fit?.lines.length ?? name.split('\n').length) * lineHeight;
}

/** The legend's title, drawn as a graphic beside or above it. */
function legendTitleGraphic(option: any): any | undefined {
    const graphics = Array.isArray(option.graphic) ? option.graphic : option.graphic ? [option.graphic] : [];
    return graphics.find((g: any) => g?.id === EC_LEGEND_TITLE_ID);
}

/**
 * Lay the one categorical legend out as the layout lays Vega-Lite's keys ({@link planKeyLayout}):
 * beside the plot, its long names wrapped onto lines, or — where it will not stand there — below
 * the plot in rows, where ECharts sets its legend by default. Returns the room it takes at each edge.
 */
function placeLegend(option: any, plot: { width: number; height: number }, canvasWidth: number, sideWidth?: number, moveTo?: 'top' | 'bottom'): { right?: number; bottom?: number } | undefined {
    const legend = one(option.legend);
    if (!legend || option.visualMap || legend.orient !== 'vertical' || legend.right !== CANVAS_BUFFER) return undefined;
    const names: string[] = (Array.isArray(legend.data) ? legend.data : (option.series ?? []).map((s: any) => s?.name))
        .map((d: any) => (typeof d === 'string' ? d : d?.name))
        .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
    if (!names.length) return undefined;
    const fontSize = legend.textStyle?.fontSize ?? 12;
    const titleGraphic = legendTitleGraphic(option);
    const title: string | null = titleGraphic?.style?.text ? String(titleGraphic.style.text) : null;
    const geometry = ecKeyGeometry(legend);
    const itemWidth = legend.itemWidth ?? 25;
    const key: KeyToLayout = {
        gradient: false,
        labels: names,
        count: names.length,
        title,
        style: {
            labelFont: FONT, labelFontSize: fontSize, labelFontWeight: 'normal', labelFontStyle: 'normal',
            titleFont: FONT, titleFontSize: titleGraphic?.style?.fontSize ?? fontSize, titleFontWeight: 'bold', titleFontStyle: 'normal',
            // ECharts sets a key beside the plot in one column, scrolling past its height.
            ...keyPlanStyle(geometry),
            titlePadding: 6,
        },
        orient: 'right',
        edges: ['right', 'bottom'],
        fixed: false,
        fixedTitle: false,
        ...(moveTo ? { moveTo: 'bottom' } : {}),
    };
    const laid = planKeyLayout([key], plot, tableTextMeasurer, sideWidth !== undefined ? { sideWidth } : {}).keys[0];
    if (!laid) return undefined;
    // Each line held to the width the planner gave it; the last takes what did not fit, cut there.
    const cutAt = laid.labelLimit > 0 ? laid.labelLimit : undefined;
    const lineWidthOf = measure(fontSize);
    const lines = new Map(names.map((name, index) => [name, (laid.labelLines?.[index] ?? [name]).map((line) => cutToWidth(line, cutAt, lineWidthOf))]));
    const multiline = [...lines.values()].some((l) => l.length > 1);
    const lineHeight = Math.ceil(fontSize * 1.2);
    const titleLines = laid.titleLines ?? (title ? [title] : []);
    const titleFontSize = key.style.titleFontSize;
    const titleHeight = titleLines.length ? titleLines.length * Math.ceil(titleFontSize * 1.2) + 6 : 0;
    const formatter = (name: string) => (lines.get(name) ?? [name]).join('\n');
    const textStyle = { ...(legend.textStyle ?? {}), ...(multiline ? { lineHeight } : {}) };
    if (laid.orient === 'bottom' || laid.orient === 'top') {
        // At the foot, as ECharts sets its legend by default: names on one line, flowing in rows across
        // the canvas; a name wider than the canvas is cut.
        const { right: _r, top: _t, formatter: _f, ...rest } = legend;
        void _r; void _t; void _f;
        const widthOf = measure(fontSize);
        const room = canvasWidth - 2 * CANVAS_BUFFER - itemWidth - 5;
        const cut = new Map(names.map((name) => [name, cutToWidth(name, room, widthOf)]));
        option.legend = {
            ...rest, orient: 'horizontal', left: 'center', bottom: CANVAS_BUFFER, textStyle: legend.textStyle ?? {},
            ...([...cut].some(([name, text]) => text !== name) ? { formatter: (name: string) => cut.get(name) ?? name } : {}),
        };
        if (titleGraphic) {
            const { right: _gr, top: _gt, ...g } = titleGraphic;
            void _gr; void _gt;
            Object.assign(titleGraphic, { ...g, left: 'center', style: { ...g.style, text: title, textAlign: 'center', width: undefined } });
            delete titleGraphic.right;
            delete titleGraphic.top;
        }
        return { bottom: footRows(option, option.legend, canvasWidth) };
    }
    const top = typeof legend.top === 'number' ? legend.top : 0;
    option.legend = {
        ...legend,
        top: titleHeight ? Math.max(top, 4 + titleHeight) : top,
        formatter,
        textStyle,
        ...(laid.height > plot.height + 24 ? { type: 'scroll' } : {}),
    };
    // The box ECharts draws: each entry its icon, 5 px, and its widest line; the padding around them.
    // The planner's width is a budget, not what is drawn; the plot stands a gap from the box itself.
    const widthOf = measure(fontSize);
    const padding = geometry.pad.x;
    const titleWidthOf = measure(titleFontSize, 'bold');
    const titleWidth = titleLines.length ? Math.max(...titleLines.map(titleWidthOf)) : 0;
    const box = keyBlock(geometry, {
        entries: names.map((name) => lines.get(name) ?? [name]), fontSize, widthOf, orientation: 'vertical',
        ...(titleLines.length ? { title: { lines: titleLines, fontSize: titleFontSize, widthOf: titleWidthOf } } : {}),
    }).width;
    if (titleGraphic) {
        // Pinned by its right edge, as the legend is, so the title starts where the entries do.
        const { width: _w, ...style } = titleGraphic.style ?? {};
        void _w;
        titleGraphic.style = { ...style, text: titleLines.join('\n'), textAlign: 'left', ...(titleLines.length > 1 ? { lineHeight: Math.ceil(titleFontSize * 1.2) } : {}) };
        titleGraphic.right = CANVAS_BUFFER + Math.max(0, box - padding - Math.ceil(titleWidth));
    }
    return { right: box + KEY_GAP };
}

/**
 * The room a legend set in rows at the canvas's foot takes, measured as ECharts wraps it across the
 * canvas, with its title (a graphic) set just above the rows. Returns the height from the canvas's
 * foot to the top of the title.
 */
function footRows(option: any, legend: any, canvasWidth: number): number {
    const names: string[] = (Array.isArray(legend.data) ? legend.data : (option.series ?? []).map((s: any) => s?.name))
        .map((d: any) => (typeof d === 'string' ? d : d?.name))
        .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
    if (!names.length) return FOOT_LEGEND;
    const fontSize = legend.textStyle?.fontSize ?? 12;
    // ECharts flows a horizontal legend in rows across the canvas, each entry its own width.
    const rowsHeight = keyBlock(ecKeyGeometry(legend), {
        entries: names.map((name) => [String(legend.formatter?.(name) ?? name)]),
        fontSize, widthOf: measure(fontSize), orientation: 'horizontal', room: canvasWidth,
    }).height;
    const bottom = typeof legend.bottom === 'number' ? legend.bottom : 0;
    const title = legendTitleGraphic(option);
    if (title) {
        title.bottom = bottom + rowsHeight + 2;
        return bottom + rowsHeight + 2 + Math.ceil((title.style?.fontSize ?? fontSize) * 1.2) + 4;
    }
    return bottom + rowsHeight + 4;
}

/**
 * Stand the ramps a template sets beside the plot (vertical continuous visual maps, each with its title
 * as a graphic) from the plot's top: the title centred over its bar, the bar and its end values under
 * it. Titles that would run into one another push the ramp further from the edge. Returns the right
 * margin they need so no title reaches into the plot.
 */
function placeSideRamps(option: any, graphics: any[], plotTop: number): number {
    const maps = (Array.isArray(option.visualMap) ? option.visualMap : option.visualMap ? [option.visualMap] : [])
        .filter((m: any) => m && m.show !== false && m.type !== 'piecewise' && m.orient === 'vertical'
            && typeof m.id === 'string' && m.id.startsWith('flint-ramp:') && typeof m.right === 'number')
        .sort((a: any, b: any) => a.right - b.right);
    let needed = 0;
    let leftmost = -Infinity;
    for (const map of maps) {
        const itemWidth = map.itemWidth ?? 20;
        const title = graphics.find((g: any) => g?.id === map.id.replace('flint-ramp:', 'flint-ramp-title:'));
        const fontSize = title?.style?.fontSize ?? 11;
        const titleWidth = title?.style?.text ? measure(fontSize, 'bold')(String(title.style.text)) : 0;
        // The bar's centre stands where the title, centred on it, clears the ramp to its right.
        let centre = map.right + itemWidth / 2;
        if (titleWidth && centre - titleWidth / 2 < leftmost + 8) {
            centre = leftmost + 8 + titleWidth / 2;
            map.right = Math.round(centre - itemWidth / 2);
        }
        const titleRight = Math.max(4, Math.round(centre - titleWidth / 2));
        const titleHeight = titleWidth ? Math.ceil(fontSize * 1.2) + 4 : 0;
        if (title) {
            title.right = titleRight;
            title.top = plotTop;
            title.style = { ...title.style, textAlign: 'left' };
        }
        map.top = plotTop + titleHeight;
        delete map.bottom;
        leftmost = Math.max(titleRight + titleWidth, map.right + itemWidth + 6);
        needed = Math.max(needed, Math.ceil(leftmost) + KEY_GAP);
    }
    return needed;
}

/**
 * The room ramps set across the canvas's foot take (a horizontal `visualMap` anchored at the bottom):
 * the bar or the row of pieces, the values a calculable bar shows over its handles, and the padding.
 * Returns the height from the canvas's foot to the ramp's top; 0 where there is none.
 */
function footRamps(option: any, canvasWidth: number): number {
    const maps = Array.isArray(option.visualMap) ? option.visualMap : option.visualMap ? [option.visualMap] : [];
    let foot = 0;
    for (const map of maps) {
        if (!map || map.show === false || map.orient !== 'horizontal' || map.top != null) continue;
        const bottom = typeof map.bottom === 'number' ? map.bottom : 0;
        const fontSize = map.textStyle?.fontSize ?? 12;
        const padding = typeof map.padding === 'number' ? map.padding : 5;
        let block: number;
        if (map.type === 'piecewise') {
            const count = Array.isArray(map.pieces) ? map.pieces.length : Array.isArray(map.categories) ? map.categories.length : map.splitNumber ?? 5;
            const labels: string[] = Array.isArray(map.pieces) && map.pieces.every((p: any) => p?.label)
                ? map.pieces.map((p: any) => String(p.label))
                : new Array(count).fill(`${Math.round(Number(map.min) || 0)} - ${Math.round(Number(map.max) || 0)}`);
            // The pieces flow in rows as a legend's entries do; the map's padding is added below.
            block = keyBlock(ecKeyGeometry(map, { itemWidth: 20 }), {
                entries: labels.map((label) => [label]), fontSize, widthOf: measure(fontSize), orientation: 'horizontal', room: canvasWidth,
            }).height - 2 * padding;
        } else {
            block = (map.itemWidth ?? 20) + (map.calculable ? Math.ceil(fontSize * 1.2) + 8 : 0);
        }
        foot = Math.max(foot, bottom + block + 2 * padding);
    }
    return foot;
}

/**
 * How far below the canvas's top an axis-less chart's content starts, where it is only pies or
 * sunbursts placed by centre and radius (their outside labels counted), and keys pinned from the top.
 * Undefined where something else stands there, which is moved down by the whole title.
 */
function contentTop(option: any, width: number, height: number): number | undefined {
    const px = (value: unknown, of: number): number | undefined => typeof value === 'number' ? value
        : typeof value === 'string' && value.endsWith('%') ? (parseFloat(value) / 100) * of
            : typeof value === 'string' && value.endsWith('px') ? parseFloat(value) : undefined;
    let top = Infinity;
    for (const series of option.series ?? []) {
        if (series?.type !== 'pie' && series?.type !== 'sunburst') return undefined;
        const [, cy] = Array.isArray(series.center) ? series.center : ['50%', '50%'];
        const radius = Array.isArray(series.radius) ? series.radius[series.radius.length - 1] : series.radius ?? '75%';
        const y = px(cy, height);
        const r = px(radius, Math.min(width, height) / 2);
        if (y === undefined || r === undefined) return undefined;
        const outside = series.type === 'pie' && series.label?.show !== false && series.label?.position !== 'inside' && series.label?.position !== 'center';
        const labels = outside ? (series.labelLine?.length ?? 15) + 2 * Math.ceil((series.label?.fontSize ?? 12) * 1.2) : 0;
        top = Math.min(top, y - r - labels);
    }
    for (const key of ['legend', 'visualMap', 'graphic', 'polar', 'radar', 'singleAxis', 'calendar', 'parallel', 'geo']) {
        const value = option[key];
        for (const component of Array.isArray(value) ? value : value ? [value] : []) {
            if (key === 'graphic' || key === 'legend' || key === 'visualMap') {
                if (component?.show === false) continue;
                if (typeof component?.top === 'number') { top = Math.min(top, component.top); continue; }
                if (component?.top == null && component?.bottom != null) continue;
            }
            return undefined;
        }
    }
    return Number.isFinite(top) ? Math.max(0, Math.floor(top)) : undefined;
}

/** Move every positioned component down by `by` px, for a title block above them. */
function shiftDown(option: any, by: number, oldHeight: number, oldWidth: number): void {
    if (!(by > 0)) return;
    const shift = (component: any) => {
        if (!component || typeof component !== 'object') return;
        // Percentages are of the canvas, which the title makes taller: held in px of the canvas as it was.
        const pct = (value: unknown) => (typeof value === 'string' && value.endsWith('%') ? (parseFloat(value) / 100) * oldHeight : undefined);
        if (typeof component.top === 'number') component.top += by;
        else if (pct(component.top) !== undefined) component.top = pct(component.top)! + by;
        if (pct(component.bottom) !== undefined) component.bottom = pct(component.bottom);
        if (Array.isArray(component.center) && component.center.length === 2) {
            const [cx, cy] = component.center;
            const y = typeof cy === 'string' && cy.endsWith('%') ? (parseFloat(cy) / 100) * oldHeight
                : typeof cy === 'string' && cy.endsWith('px') ? parseFloat(cy)
                    : typeof cy === 'number' ? cy : undefined;
            if (y !== undefined) component.center = [cx, y + by];
            // A radius in percent is of the canvas's smaller side, which the title would change.
            const r = component.radius;
            const toPx = (v: unknown) => (typeof v === 'string' && v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(oldWidth, oldHeight) / 2 : v);
            if (Array.isArray(r)) component.radius = r.map(toPx);
            else if (r !== undefined) component.radius = toPx(r);
        }
    };
    for (const key of ['grid', 'legend', 'visualMap', 'graphic', 'polar', 'radar', 'singleAxis', 'calendar', 'parallel', 'series', 'geo', 'matrix']) {
        const value = option[key];
        for (const component of Array.isArray(value) ? value : [value]) {
            // A series on a grid has no position of its own; a pie, funnel or tree has.
            if (key === 'series' && component?.coordinateSystem && component.coordinateSystem !== 'none' && component.type !== 'pie') continue;
            shift(component);
        }
    }
}

/** Write the title block in ECharts' own title component. */
function writeTitle(option: any, block: TitleBlock): void {
    const existing = typeof option.title === 'object' && !Array.isArray(option.title) ? option.title : {};
    option.title = {
        ...existing,
        left: 'center',
        top: EC_TITLE.top,
        itemGap: EC_TITLE.gap,
        ...(block.headline ? {
            text: block.headline.lines.join('\n'),
            textStyle: { ...(existing.textStyle ?? {}), fontSize: block.headline.fontSize, lineHeight: block.headline.lineHeight },
        } : { text: '' }),
        ...(block.deck ? {
            subtext: block.deck.lines.join('\n'),
            subtextStyle: { ...(existing.subtextStyle ?? {}), fontSize: block.deck.fontSize, lineHeight: block.deck.lineHeight },
        } : {}),
    };
}

/** Thin a chart's lines where many share the plot, from ECharts' 2 px. */
function thinLines(option: any, context: InstantiateContext, plotHeight: number): void {
    const lines = (option.series ?? []).filter((s: any) => s?.type === 'line' && !s._companion);
    if (lines.length < 2) return;
    const width = denseLineWidth(EC_LINE_WIDTH, Math.max(lines.length, linesPerPanel(context.table, context.channelSemantics)), plotHeight);
    if (width === undefined) return;
    for (const series of lines) {
        if (series.lineStyle?.width != null && series.lineStyle.width !== EC_LINE_WIDTH) continue;
        series.lineStyle = { ...(series.lineStyle ?? {}), width };
    }
}

/**
 * Measure and set the frame of a finished option: band labels as the layout decided them, axis
 * gutters measured, names fitted, the key placed, the title broken over its block. Returns what it
 * measured for the canvas fit.
 */
export function ecFitFrame(
    option: any, context: InstantiateContext, text: { title?: string; subtitle?: string }, planned: { x: boolean; y: boolean },
    titleRoom = 0,
): ECFrame {
    const { layout } = context;
    const single = singleGrid(option);
    const parts: Partial<Record<ReservePart, number>> = {};
    if (!single) {
        const width = Number(option._width) || context.canvasSize.width;
        const height = Number(option._height) || context.canvasSize.height;
        const block = planTitleBlock(text, width - 2 * (EC_TITLE.padding + CANVAS_BUFFER), EC_TITLE);
        let titleRoom = 0;
        if (block) {
            titleRoom = EC_TITLE.top + 2 * EC_TITLE.padding + block.height + TITLE_GAP;
            // Where the content already stands clear of the top (a pie in its own margin), it moves down
            // only by what the title needs past that, so the title sits over it rather than above a gap.
            const top = contentTop(option, width, height);
            const by = top === undefined ? titleRoom : Math.max(0, titleRoom - top);
            shiftDown(option, by, height, width);
            writeTitle(option, block);
            option._width = width;
            option._height = height + by;
            parts.title = titleRoom;
        }
        const plot = { width, height };
        return { plot, designed: plot, parts, ...(block ? { title: block } : {}) };
    }

    const { grid, xAxis, yAxis } = single;
    const plot = {
        width: Math.max(1, option._width - grid.left - grid.right),
        height: Math.max(1, option._height - grid.top - grid.bottom),
    };
    const designed = { ...plot };
    if (planned.x) realizeBandLabels(xAxis, 'x', layout.xLabel);
    if (planned.y) realizeBandLabels(yAxis, 'y', layout.yLabel);
    hidePaddedEnds(xAxis);
    hidePaddedEnds(yAxis);
    flattenTimeLabels(xAxis, plot.width);

    // Beside the plot: the y labels, then the y name across from them.
    const yLeft = yAxis.position !== 'right';
    const yRun = labelRun(option, yAxis, 'y');
    const yName = fitAxisName(yAxis, plot.height);
    if (yName) yAxis.nameGap = LABEL_MARGIN + yRun + NAME_GAP;
    const yRoom = CANVAS_BUFFER + LABEL_MARGIN + yRun;
    const yNameRoom = yName ? NAME_GAP + yName : 0;
    if (yLeft) grid.left = Math.max(CANVAS_BUFFER + 24, yRoom + yNameRoom);

    // Below the plot: the x labels, then the x name under them.
    const xRun = labelRun(option, xAxis, 'x');
    const xName = fitAxisName(xAxis, plot.width);
    if (xName) xAxis.nameGap = LABEL_MARGIN + xRun + NAME_GAP;
    const xRoom = CANVAS_BUFFER + LABEL_MARGIN + xRun;
    const xNameRoom = xName ? NAME_GAP + xName : 0;

    // The key, beside the plot or at its foot.
    // A canvas fit that sets the key's text smaller does so before the key is measured.
    const shown = one(option.legend);
    if (shown && context.assembleOptions?.canvasTreatment?.keyScale) {
        shown.textStyle = { ...(shown.textStyle ?? {}), fontSize: treatedKeyFontSize(shown.textStyle?.fontSize ?? 12, context.assembleOptions) };
    }
    const legend = placeLegend(option, plot, plot.width + grid.left + CANVAS_BUFFER + 22, treatedKeySide(context.assembleOptions, ecKeyGeometry(shown ?? {})), treatedKeyEdge(context.assembleOptions));
    if (legend?.right !== undefined) grid.right = CANVAS_BUFFER + legend.right;
    else if (legend?.bottom !== undefined) grid.right = Math.min(grid.right, CANVAS_BUFFER + 22);
    const footKeys = legend?.bottom ?? 0;
    // A key already set at the foot (a colour legend under a ramp, or one a template placed) keeps the room the layout pass gave it.
    const footLegend = one(option.legend);
    const keptFoot = !legend && footLegend && footLegend.orient === 'horizontal' && footLegend.bottom != null
        ? footRows(option, footLegend, plot.width + grid.left + grid.right) : 0;
    // A colour ramp at the foot, as ECharts sets a heatmap's, takes its own room under the x name.
    const rampFoot = footRamps(option, plot.width + grid.left + grid.right);
    const foot = Math.max(footKeys, keptFoot, rampFoot);
    grid.bottom = xRoom + xNameRoom + (foot ? Math.max(0, foot + FOOT_GAP - CANVAS_BUFFER) : 0);

    // The title block, over the drawing's width; its broken lines come out of a continuous plot.
    // A narrow chart's title may run as wide as its box allows rather than stack into many lines; the
    // plot takes the width the title needs, so the drawing grows wider rather than taller.
    const width = plot.width + grid.left + grid.right;
    const pad = 2 * (EC_TITLE.padding + CANVAS_BUFFER);
    const block = planTitleBlock(text, Math.max(width, titleRoom) - pad, EC_TITLE);
    if (block && block.width + pad > width) plot.width += Math.ceil(block.width + pad - width);
    if (block) {
        const room = EC_TITLE.top + 2 * EC_TITLE.padding + block.height + TITLE_GAP;
        const continuousY = yAxis.type !== 'category';
        if (continuousY && block.broken > 0) plot.height = plotHeightAfter(plot.height, block.broken);
        const by = Math.max(0, room + TOP_OVERHANG - grid.top);
        shiftDown(option, by, option._height, option._width);
        // A key beside the plot starts under the title, which spans the canvas.
        const sideLegend = one(option.legend);
        if (legend?.right !== undefined && sideLegend && typeof sideLegend.top === 'number') {
            const titleGraphic = legendTitleGraphic(option);
            const topmost = typeof titleGraphic?.top === 'number' ? titleGraphic.top : sideLegend.top;
            const under = Math.max(0, room - topmost);
            sideLegend.top += under;
            if (titleGraphic && typeof titleGraphic.top === 'number') titleGraphic.top += under;
        }
        writeTitle(option, block);
    }

    thinLines(option, context, plot.height);

    // A size key the template drew as circles stands beside the plot, from its top.
    const graphics = Array.isArray(option.graphic) ? option.graphic : option.graphic ? [option.graphic] : [];
    const sizeKey = graphics.find((g: any) => g?.id === EC_SIZE_KEY_ID);
    if (sizeKey) sizeKey.top = grid.top;
    grid.right = Math.max(grid.right, placeSideRamps(option, graphics, grid.top));

    option._width = Math.round(plot.width + grid.left + grid.right);
    option._height = Math.round(plot.height + grid.top + grid.bottom);
    // The plot the frame planned, for tools that compare it with what ECharts draws.
    option._planned = { plot: { width: Math.round(plot.width), height: Math.round(plot.height) }, left: grid.left, right: grid.right, top: grid.top, bottom: grid.bottom };
    Object.assign(parts, {
        yLabels: yRoom, ...(yNameRoom ? { yTitle: yNameRoom } : {}),
        xLabels: xRoom, ...(xNameRoom ? { xTitle: xNameRoom } : {}),
        title: grid.top, sideKeys: grid.right,
        ...(footKeys || keptFoot ? { stackedKeys: Math.max(footKeys, keptFoot) } : {}),
    });
    return { plot, designed, parts, ...(block ? { title: block } : {}) };
}
