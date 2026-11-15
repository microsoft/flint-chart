// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * What the layout decides around the plot for a backend that draws its own furniture — ECharts,
 * Chart.js, Plotly. Vega-Lite runs the full plan ({@link planLayout}); these backends keep their own
 * renderer's look (title placement, legend idiom, axis defaults) and take from the plan only the
 * decisions that do not depend on how Vega draws: where a title breaks, how long names wrap, what a
 * chart's furniture costs its box. Each backend measures its furniture in its own fonts and asks the
 * same questions here, so a decision is made once.
 */

import { fitDeckText, fitHeadlineText, type TitleMeasure } from './title-fit';
import { tableTextMeasurer } from './text-width';
import type { KeyGeometry } from './backend-profile';
import { judgeCanvas, plotFitScale, PLOT_SCALE_FLOOR, type CanvasFitEstimate } from './canvas-fit';
import { niceTicks } from './ruler';
import { DEFAULT_MAX_STRETCH, resolveBaseSize } from './compute-layout';
import type { TextMeasurer } from './legend-layout';
import type { ReservePart } from './furniture-reserve';
import type { CanvasTreatment } from './types';

/**
 * The least size band labels shrink to on a backend whose labels stand at 12 px (ECharts, Chart.js,
 * Plotly): names shrink a size or two, then wrap or turn, rather than run at three-quarters size.
 */
export const BACKEND_MIN_LABEL_SIZE = 10;

/** How a backend sets one kind of text: its size, weight and family, and its line height in em. */
export interface BackendTextStyle {
    fontSize: number;
    fontWeight?: string | number;
    font?: string;
    /** Line height as a multiple of the size; 1.2 where unset. */
    lineHeight?: number;
}

/** A measure of text in px, as a backend's renderer sets it, in one style. */
export function measureIn(style: BackendTextStyle, measure: TextMeasurer = tableTextMeasurer): (text: string) => number {
    return measure(style.fontSize, style.font ?? 'sans-serif', style.fontWeight ?? 'normal', 'normal');
}

/** The height of one line in a style, in px. */
export function lineHeightOf(style: BackendTextStyle): number {
    return Math.ceil(style.fontSize * (style.lineHeight ?? 1.2));
}

export interface TitleBlockLines {
    text: string;
    lines: string[];
    fontSize: number;
    lineHeight: number;
    /** The widest line, in px. */
    width: number;
}

/** A headline and deck broken to the block they sit over. */
export interface TitleBlock {
    headline?: TitleBlockLines;
    deck?: TitleBlockLines;
    /** The height the lines take, with the gap between headline and deck; no outer padding. */
    height: number;
    /** The height the block takes past one line of each: the lines that broke. */
    broken: number;
    /** The widest line of either, in px. */
    width: number;
}

/**
 * Break a chart's headline and deck to a block `width` px wide, in the backend's type: the headline
 * set a size down where that brings it onto one line, else broken to full lines with no widow
 * ({@link fitHeadlineText}); the deck broken, never set smaller ({@link fitDeckText}). The same rule
 * Vega-Lite's plan applies, measured in the backend's fonts. Undefined where there is no text.
 */
export function planTitleBlock(
    text: { title?: string; subtitle?: string },
    width: number,
    style: { headline: BackendTextStyle; deck: BackendTextStyle; gap: number },
    measure: TextMeasurer = tableTextMeasurer,
): TitleBlock | undefined {
    const headlineText = text.title?.trim();
    const deckText = text.subtitle?.trim();
    if (!headlineText && !deckText) return undefined;
    const titleMeasure = (s: BackendTextStyle): TitleMeasure =>
        (value, fontSize) => measure(fontSize, s.font ?? 'sans-serif', s.fontWeight ?? 'normal', 'normal')(value);
    const block = Math.max(40, width);
    let headline: TitleBlockLines | undefined;
    if (headlineText) {
        const m = titleMeasure(style.headline);
        const fit = fitHeadlineText(headlineText, block, style.headline.fontSize, style.deck.fontSize, m);
        const fontSize = fit?.fontSize ?? style.headline.fontSize;
        const lines = fit?.lines ?? [headlineText];
        headline = {
            text: headlineText, lines, fontSize,
            lineHeight: lineHeightOf({ ...style.headline, fontSize }),
            width: Math.max(...lines.map((line) => m(line, fontSize))),
        };
    }
    let deck: TitleBlockLines | undefined;
    if (deckText) {
        const m = titleMeasure(style.deck);
        const fit = fitDeckText(deckText, block, style.deck.fontSize, m);
        const lines = fit?.lines ?? [deckText];
        deck = {
            text: deckText, lines, fontSize: style.deck.fontSize,
            lineHeight: lineHeightOf(style.deck),
            width: Math.max(...lines.map((line) => m(line, style.deck.fontSize))),
        };
    }
    const linesHeight = (part: TitleBlockLines | undefined) => part ? part.lines.length * part.lineHeight : 0;
    const height = linesHeight(headline) + linesHeight(deck) + (headline && deck ? style.gap : 0);
    const broken = (headline ? (headline.lines.length - 1) * headline.lineHeight : 0)
        + (deck ? (deck.lines.length - 1) * deck.lineHeight : 0);
    return { headline, deck, height, broken, width: Math.max(headline?.width ?? 0, deck?.width ?? 0) };
}

/** The widest line of a set of labels, each one or more lines, in px. */
export function widestLine(labels: ReadonlyArray<string | readonly string[]>, widthOf: (text: string) => number): number {
    let widest = 0;
    for (const label of labels) {
        for (const line of typeof label === 'string' ? [label] : label) widest = Math.max(widest, widthOf(line));
    }
    return widest;
}

/**
 * How many rows items of these widths take when a renderer flows them across `room` px, `gap` px
 * apart, as ECharts, Chart.js and Plotly set a legend in rows.
 */
export function flowRows(widths: readonly number[], room: number, gap: number): number {
    if (!widths.length) return 0;
    let rows = 1;
    let run = 0;
    for (const width of widths) {
        if (run > 0 && run + gap + width > room) { rows += 1; run = width; } else run += (run > 0 ? gap : 0) + width;
    }
    return rows;
}

/** Cut a line to `limit` px with an ellipsis, measured; whole where it fits or no limit is set. */
export function cutToWidth(text: string, limit: number | undefined, widthOf: (text: string) => number): string {
    if (!(limit && limit > 0) || widthOf(text) <= limit) return text;
    let end = text.length;
    while (end > 1 && widthOf(`${text.slice(0, end).trimEnd()}…`) > limit) end--;
    return `${text.slice(0, end).trimEnd()}…`;
}

/** Whether a value stands on one of the renderer's round ticks over a domain, as an axis end must to be labelled. */
export function onNiceTick(value: number, domain: [number, number], count = 5): boolean {
    const [lo, hi] = domain;
    if (!Number.isFinite(value) || !(hi > lo)) return true;
    return niceTicks(lo, hi, count).some((tick) => Math.abs(tick - value) <= (hi - lo) * 1e-9);
}

/** The tick labels a value axis over `domain` is likely to print, as the renderer's own nice ticks would. */
export function valueTickLabels(domain: [number, number], count = 5, format: (value: number) => string = (v) => v.toLocaleString('en-US')): string[] {
    const [lo, hi] = domain;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
    if (lo === hi) return [format(lo)];
    return niceTicks(Math.min(lo, hi), Math.max(lo, hi), count).map(format);
}

/** The box a chart is fitted to: the canvas the host states, else the ceiling the base may stretch to. */
export function fitBox(
    baseSize: { width: number; height: number }, canvasSize: { width: number; height: number } | undefined, maxStretch?: number,
): { width: number; height: number } {
    const stretch = maxStretch ?? DEFAULT_MAX_STRETCH;
    return canvasSize ?? { width: baseSize.width * stretch, height: baseSize.height * stretch };
}

/** What a backend measured around one plot, in px. */
export interface BackendChrome {
    plot: { width: number; height: number };
    /** The plot as designed, before a broken title took height from it. */
    designed?: { width: number; height: number };
    /** Facet grid, where the chart draws panels; one panel where unset. */
    grid?: { columns: number; rows: number; gapX: number; gapY: number };
    /** Each part's room: y labels and title beside the plot, x labels and title below, the title block, keys. */
    parts: Partial<Record<ReservePart, number>>;
    /** Chrome above and below the chart area the parts do not name. */
    chrome?: { top: number; bottom: number };
    keyRowWidth?: number;
    padding?: number;
    box: { width: number; height: number };
    base: { width: number; height: number };
}

/**
 * Judge a backend's drawing against its box, as the plan judges Vega-Lite's ({@link judgeCanvas}),
 * and the share of its base the plot should be laid out at where the host would otherwise shrink
 * the drawing past legibility ({@link plotFitScale}).
 */
export function judgeBackendCanvas(chrome: BackendChrome): { estimate: CanvasFitEstimate; plotScale?: number; stackedKeys: boolean; box: { width: number; height: number } } {
    const parts = chrome.parts;
    const width = Object.entries(parts).filter(([k]) => ['yLabels', 'yTitle', 'sideKeys', 'seriesEnd'].includes(k)).reduce((s, [, v]) => s + (v ?? 0), 0);
    const height = Object.entries(parts).filter(([k]) => !['yLabels', 'yTitle', 'sideKeys', 'seriesEnd'].includes(k)).reduce((s, [, v]) => s + (v ?? 0), 0);
    const estimate = judgeCanvas({
        panel: chrome.plot,
        ...(chrome.designed ? { designed: chrome.designed } : {}),
        grid: chrome.grid ?? { columns: 1, rows: 1, gapX: 0, gapY: 0 },
        reserve: { width, height, parts },
        chrome: chrome.chrome ?? { top: 0, bottom: 0 },
        ...(chrome.keyRowWidth !== undefined ? { keyRowWidth: chrome.keyRowWidth } : {}),
        ...(chrome.padding !== undefined ? { padding: chrome.padding } : {}),
        box: chrome.box,
        base: chrome.base,
    });
    return { estimate, plotScale: plotFitScale(estimate, chrome.box), stackedKeys: (parts.stackedKeys ?? 0) > 0, box: chrome.box };
}

/** What a backend's canvas fit found and did, carried on the spec as `_canvasFit` for tools that inspect it. */
export interface BackendCanvasFit {
    box: { width: number; height: number };
    drawing: { width: number; height: number };
    /** What the host shrinks the drawing by to show it in its box. */
    scale: number;
    flags: string[];
    /** How far past the limits the drawing is, summed: 0 where it reads well. */
    excess: number;
    /** The share of its base the plot was laid out at, where the fit shrank it. */
    plotScale?: number;
    /** The plan's treatment the fit took, where it took one. */
    treatment?: CanvasTreatment;
}

export function canvasFitSummary(estimate: CanvasFitEstimate, box: { width: number; height: number }, treatment?: CanvasTreatment): BackendCanvasFit {
    return {
        box,
        drawing: { width: Math.round(estimate.drawing.width), height: Math.round(estimate.drawing.height) },
        scale: Math.round(estimate.scale * 100) / 100,
        flags: estimate.flags,
        excess: Math.round(estimate.excess * 1000) / 1000,
        ...(treatment?.plotScale !== undefined ? { plotScale: treatment.plotScale } : {}),
        ...(treatment ? { treatment } : {}),
    };
}

/** How much less past the limits a treatment must leave the drawing to be taken. */
const REFIT_MARGIN = 0.01;

/** How short the canvas fit keeps long key names beside the plot: 120 px, wrapped before cut, as the plan does. */
export const SHORT_KEY_NAMES = { keyWidth: 120 };
/** Narrower still, with the key's text a size smaller, where the drawing is held well inside its box. */
export const SHORTER_KEY_NAMES = { keyWidth: 90 };

/**
 * The least a backend's drawing should be shrunk by its host before the canvas fit lays it out
 * again. Vega-Lite's plan fits its box as it plans, so its fit acts only past legibility
 * (`CANVAS_FIT_LIMITS.scale`); a backend keeps the planned plot and grows its canvas around the
 * library's own furniture, so it is held to a closer fit.
 */
export const HOST_SCALE_TARGET = 0.9;

/**
 * The share of its base the plot is laid out at for a backend's drawing to enter its box, the
 * furniture kept as it stands; undefined where the host shrinks it no further than
 * {@link HOST_SCALE_TARGET} or the plot would have to go below {@link PLOT_SCALE_FLOOR}'s share.
 */
export function hostFitScale(estimate: CanvasFitEstimate, box: { width: number; height: number }): number | undefined {
    if (estimate.scale >= HOST_SCALE_TARGET) return undefined;
    const furniture = { width: estimate.drawing.width - estimate.area.width, height: estimate.drawing.height - estimate.area.height };
    const scale = Math.min((box.width - furniture.width) / estimate.area.width, (box.height - furniture.height) / estimate.area.height) * 0.97;
    if (!(scale < 0.97)) return undefined;
    return Math.max(PLOT_SCALE_FLOOR, Math.round(scale * 100) / 100);
}

/** How a backend's drawing reads in its box: past the canvas fit's limits, and shrunk by its host past the target. */
function fitScore(fit: { excess: number; scale: number }): number {
    return fit.excess + Math.max(0, HOST_SCALE_TARGET - fit.scale);
}

/**
 * Assemble the chart again under each treatment that may help and keep the one that reads best:
 * keys in rows stood beside the plot, key names held short, keys at the foot, key text a size
 * smaller, and — past legibility only — the plot laid out smaller. A treatment is kept only where it
 * reads clearly better than the chart as planned, by its flags and how far its host would shrink it
 * ({@link fitScore}); so the key gives way to a drawing its host would shrink below
 * {@link HOST_SCALE_TARGET}, the plot only to one past legibility.
 */
export function refitCanvas<S extends { _canvasFit?: BackendCanvasFit }>(
    judged: { estimate: CanvasFitEstimate; plotScale?: number; stackedKeys?: boolean; box?: { width: number; height: number } },
    options: { canvasFit?: string; canvasTreatment?: CanvasTreatment } | undefined,
    reassemble: (treatment: CanvasTreatment) => S,
): S | undefined {
    if (options?.canvasFit === 'off' || options?.canvasTreatment) return undefined;
    const kinds = judged.estimate.kinds;
    const held = judged.estimate.scale < HOST_SCALE_TARGET;
    const keysWide = held || kinds.includes('width') || kinds.includes('wider') || kinds.includes('shrunk');
    // Keys in rows above or below the plot that make the drawing tall may stand beside it instead.
    const keysTall = judged.stackedKeys === true && (held || kinds.includes('height') || kinds.includes('taller') || kinds.includes('shrunk'));
    // The plot gives way only past legibility: a smaller plot beside an unchanged key leaves the key
    // taller than the plot (Plotly scrolls it) and the marks small, which reads worse than a drawing
    // its host shrinks a little.
    const plotScale = judged.plotScale;
    // Key text a size or two smaller, after the names are wrapped and the key moved: the library's own
    // size gives way before the plot does.
    const smaller = { keyScale: KEY_SCALE };
    // All the type a size down: the library's own sizes give way, to a legible floor, before the plot.
    const smallType = { keyScale: KEY_SCALE, labelScale: LABEL_SCALE, titleScale: TITLE_SCALE };
    const short = { names: SHORT_KEY_NAMES };
    const tries: CanvasTreatment[] = [
        ...(keysTall ? [{ keys: 'side' as const }, { keys: 'side' as const, ...short }, { keys: 'side' as const, ...short, ...smaller }] : []),
        ...(keysTall && held ? [{ keys: 'side' as const, names: SHORTER_KEY_NAMES, ...smaller }] : []),
        ...(keysWide ? [short, { keys: 'bottom' as const }, { ...short, ...smaller }] : []),
        ...(keysWide && held ? [{ names: SHORTER_KEY_NAMES, ...smaller }, { ...short, ...smallType }] : []),
        ...(keysTall && held ? [{ keys: 'side' as const, ...short, ...smallType }] : []),
        ...(held && !keysWide && !keysTall ? [smallType] : []),
        ...(plotScale ? [{ plotScale }] : []),
        ...(keysWide && plotScale ? [{ ...short, plotScale }, { keys: 'bottom' as const, plotScale }] : []),
    ];
    let best: S | undefined;
    // A treatment must read clearly better: the reported excess is rounded, and a change too small to see is no change.
    let bestScore = fitScore(judged.estimate) - REFIT_MARGIN;
    for (const treatment of tries) {
        const refit = reassemble(treatment);
        const fit = refit?._canvasFit;
        if (!fit) continue;
        // Smaller type pays only where the host then shrinks the drawing less, by enough that the
        // labels read at least as large on screen: 10 px drawn at 84% is smaller than 12 px at 83%.
        if (treatment.labelScale && fit.scale * treatment.labelScale < judged.estimate.scale - 0.005) continue;
        const score = fitScore(fit) + treatmentPenalty(treatment);
        if (score < bestScore) { best = refit; bestScore = score - REFIT_MARGIN; }
    }
    return best;
}

/** The share of its size key text steps down to under the canvas fit (12 px → 10 px). */
export const KEY_SCALE = 0.84;
/** The share axis labels and titles step down to under the canvas fit (12 px → 10 px, 14 px → 12 px). */
export const LABEL_SCALE = 0.84;
/** The share the headline and deck step down to under the canvas fit (17 px → 14 px). */
export const TITLE_SCALE = 0.85;
/** The least a backend's headline and deck are set at by the canvas fit, as the plan's floor. */
export const BACKEND_TITLE_FLOOR = { headline: 13, deck: 11 };

/** A text size at a canvas-fit share, never below `floor`, and never larger than it was. */
export function scaledTypeSize(size: number, scale: number | undefined, floor: number): number {
    if (!scale) return size;
    return Math.max(Math.min(size, floor), Math.min(size, Math.round(size * scale * 2) / 2));
}

/**
 * How much a treatment costs in reading, beside the room it wins: smaller text and shorter names are
 * fixes a reader notices, so one is taken only where it wins clearly more than it costs.
 */
function treatmentPenalty(t: CanvasTreatment): number {
    return (t.keyScale ? 0.01 : 0) + (t.labelScale ? 0.03 : 0) + (t.titleScale ? 0.02 : 0)
        + (t.names ? (t.names.keyWidth < 120 ? 0.02 : 0.005) : 0) + (t.plotScale ? 0.02 : 0);
}

/** A key's text size under a canvas-fit treatment: the library's size at the treated share, never below the floor. */
export function treatedKeyFontSize(size: number, options: { canvasTreatment?: CanvasTreatment } | undefined): number {
    const scale = options?.canvasTreatment?.keyScale;
    return scale ? Math.max(BACKEND_MIN_LABEL_SIZE, Math.min(size, Math.round(size * scale * 2) / 2)) : size;
}

/**
 * Re-run a backend's assembler under a canvas-fit treatment, once: the plot laid out at `plotScale` of
 * its base (the box kept), key names held short. The pass is marked by `options.canvasTreatment`, so a
 * second pass never runs.
 */
export function withTreatment<T extends { chart_spec: any; options?: any }>(input: T, treatment: CanvasTreatment, box: { width: number; height: number }): T {
    const base = resolveBaseSize(input.chart_spec.baseSize, input.chart_spec.canvasSize);
    const scale = treatment.plotScale;
    return {
        ...input,
        chart_spec: {
            ...input.chart_spec,
            ...(scale ? { baseSize: { width: Math.round(base.width * scale), height: Math.round(base.height * scale) }, canvasSize: box } : {}),
        },
        options: { ...(input.options ?? {}), canvasTreatment: { ...(input.options?.canvasTreatment ?? {}), ...treatment } },
    };
}

/** The edge a canvas-fit treatment holds the keys to, off the side; undefined leaves every edge open. */
export function treatedKeyEdge(options: { canvasTreatment?: CanvasTreatment } | undefined): 'top' | 'bottom' | undefined {
    const keys = options?.canvasTreatment?.keys;
    return keys === 'top' || keys === 'bottom' ? keys : undefined;
}

/**
 * The widest a key beside the plot may run under a canvas-fit treatment, for {@link planKeyLayout}'s
 * `sideWidth`: the names' width the treatment gives, and the room the library sets before and around
 * them ({@link KeyGeometry}), so names are held to the same width whatever the library's symbol.
 */
export function treatedKeySide(options: { canvasTreatment?: CanvasTreatment } | undefined, key: KeyGeometry): number | undefined {
    const names = options?.canvasTreatment?.names?.keyWidth;
    return names === undefined ? undefined : names + key.lead + 2 * key.pad.x;
}

/** The widest a key beside the plot may run under a canvas-fit treatment, for {@link planKeyLayout}'s `sideWidth`. */
export function treatedKeyWidth(options: { canvasTreatment?: CanvasTreatment } | undefined): number | undefined {
    return options?.canvasTreatment?.names?.keyWidth;
}
