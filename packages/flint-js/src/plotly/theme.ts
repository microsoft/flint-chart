// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * STAGE 3: THEME REALIZATION — Plotly backend
 * =============================================================================
 *
 * Takes the backend-neutral {@link DesignDecisions} produced by stage 2
 * (`core/theme/ground.ts`) and writes them into a Plotly figure
 * (`{ data: trace[], layout }`).
 *
 * The stage boundary is the same one the Vega-Lite realizer obeys
 * (design-docs/04-experiment.md §2): this file may *realize* or *approximate*
 * what stage 2 decided, and must report every approximation; it may not decide
 * anything itself. Any `if (chartType === …)` here would be a bug in stage 2.
 *
 * What is different about Plotly, and therefore what this file has to fake:
 *
 *   - There is no `config` and no scale/mark separation. Style lives on each
 *     trace, so a decision about "the series" is a walk over `figure.data`.
 *   - Bars are sized by `layout.bargap`, not by a mark width, so band occupancy
 *     is one number for the whole figure rather than per mark.
 *   - Text on marks is a trace property (`text` + `textposition`), and Plotly
 *     places inside/outside labels itself — the geometry stage 2 computed
 *     (`insideMinValue`) is handed over as `textposition:
 *     'auto'` rather than realized as two filtered layers.
 *   - A figure may hold several subplot axis pairs (`xaxis2`, `yaxis3`, …) for
 *     facets and composites. Every axis pass walks all of them.
 * =============================================================================
 */

import { cutToWidth, planTitleBlock } from '../core/backend-frame';
import { alreadyNamed, tickUnitOf } from '../core/title-plan';
import { PLOTLY_FONT, plAxisTitleRoom, plDateLabelRows, plDropEmptyTitles, plFitRowKey, plTickRun, plKeyBlock, plLabelDepth, plYTickTexts } from './frame';
import { PLOTLY_PROFILE } from './profile';
import type { KeyBlock } from '../core/backend-profile';
import { plotHeightAfter } from '../core/title-fit';
import { groupPadding } from '../core/group-gaps';
import { applyTextCase } from '../core/text-case';
import { chooseLabelStep, DEFAULT_LABEL_OVERFLOW, TURNED_LABEL_LIMIT } from '../core/axis-labels';
import { fitTwoLineLabels } from '../core/decisions';
import { tableTextMeasurer } from '../core/text-width';
import type { LabelFitStep } from '../core/theme/types';
import type {
    DesignDecisions,
    PointShape,
    ThemeReport,
    ReportDeparture,
    ResolvedAxis,
    ResolvedText,
} from '../core/theme/types';
import { parseColor, toHex, mixHex, isDarkSurface, contrastingInk, sampleRamp } from '../core/theme/presence';
import { pieCategoryPercentTemplates } from './pie-labels';

// ---------------------------------------------------------------------------
// Facts read off the figure (never styles — see the stage boundary above)
// ---------------------------------------------------------------------------

/** Plotly trace types that carry data values (as opposed to chrome). */
const CHROME_TRACES = new Set(['table']);

/**
 * The mark family a Plotly trace belongs to, named in the vocabulary stage 2
 * speaks (`bar`, `line`, `point`, `area`, `arc`, `rect`, `boxplot`, `text`).
 *
 * Grounding reasons about mark *families* — whether the chart draws a
 * connected path, whether a mark has an inside a label could sit in. Plotly
 * says `scatter` for four different families and distinguishes them by `mode`,
 * so the family is reconstructed here.
 */
export function markFamilies(trace: any): string[] {
    const t = String(trace?.type ?? 'scatter');
    const out: string[] = [];
    switch (t) {
        case 'bar':
        case 'histogram':
        case 'funnel':
        case 'waterfall':
            out.push('bar');
            break;
        case 'pie':
            out.push('arc');
            break;
        case 'heatmap':
        case 'histogram2d':
        case 'contour':
            out.push('rect');
            break;
        case 'box':
            out.push('boxplot');
            break;
        case 'violin':
            out.push('boxplot', 'area');
            break;
        case 'choropleth':
        case 'choroplethmapbox':
            out.push('geoshape');
            break;
        case 'indicator':
            out.push('text');
            break;
        case 'scatter':
        case 'scattergl':
        case 'scatterpolar':
        case 'scattergeo':
        case 'barpolar': {
            if (t === 'barpolar') {
                out.push('arc');
                break;
            }
            const mode = String(trace?.mode ?? 'lines');
            // A trace in a `stackgroup` is filled by Plotly whether or not it
            // says so — `fill` defaults to `tonexty` inside a stack. Reading
            // only the explicit key types a stacked area as a bare line, and
            // then nothing that paints an area ever reaches it.
            const stackFilled = trace?.stackgroup != null && trace?.fill !== 'none';
            const filled = (trace?.fill && trace.fill !== 'none') || stackFilled;
            if (filled) out.push('area');
            if (mode.includes('lines')) out.push('line');
            if (mode.includes('markers')) out.push('point');
            if (mode.includes('text')) out.push('text');
            if (!out.length) out.push('line');
            break;
        }
        default:
            out.push(t);
    }
    return out;
}

/** Every mark family present anywhere in the figure. Used to ground before realizing. */
export function plCollectMarkTypes(figure: any): string[] {
    const seen = new Set<string>();
    for (const trace of figure?.data ?? []) {
        if (CHROME_TRACES.has(String(trace?.type))) continue;
        for (const m of markFamilies(trace)) seen.add(m);
    }
    return [...seen];
}

/** Plotly axis `type` → the encoding type stage 2 reasons about. */
function axisEncodingType(type: string | undefined): string | undefined {
    switch (type) {
        case 'category':
            return 'nominal';
        case 'date':
            return 'temporal';
        case 'linear':
        case 'log':
            return 'quantitative';
        default:
            return undefined;
    }
}

/**
 * The facts about position and series that stage 2 is allowed to consult.
 *
 * Templates are free to name their semantic channels anything (a candlestick
 * has no `y`), so `channelSemantics` can be silent about the axes a reader
 * will actually see. The axis `type` and the field its title names are facts
 * about the chart, not style choices.
 */
export function plCollectPositional(
    figure: any,
    channelSemantics: Record<string, any> = {},
): {
    x?: { type?: string; field?: string };
    y?: { type?: string; field?: string };
    color?: { type?: string; field?: string };
    stacked?: boolean;
} {
    const layout = figure?.layout ?? {};
    const out: any = {};
    for (const ch of ['x', 'y'] as const) {
        const axis = layout[`${ch}axis`];
        const type = axisEncodingType(axis?.type)
            ?? (channelSemantics[ch]?.type as string | undefined);
        const field = channelSemantics[ch]?.field
            ?? (typeof axis?.title?.text === 'string' ? axis.title.text : undefined);
        if (type || field) out[ch] = { type, field };
    }
    const colorCS = channelSemantics.color;
    if (colorCS?.field) out.color = { type: colorCS.type, field: colorCS.field };

    const barmode = String(layout.barmode ?? '');
    out.stacked = barmode === 'stack' || barmode === 'relative'
        || (figure?.data ?? []).some((t: any) => t?.stackgroup != null);
    return out;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function axisKeys(layout: any, ch: 'x' | 'y'): string[] {
    return Object.keys(layout ?? {}).filter((k) => new RegExp(`^${ch}axis\\d*$`).test(k));
}

function fontOf(t: ResolvedText | undefined, fallbackFamily?: string): any {
    if (!t) return undefined;
    const f: any = {};
    if (t.font ?? fallbackFamily) f.family = t.font ?? fallbackFamily;
    if (t.fontSize != null) f.size = t.fontSize;
    if (t.color) f.color = t.color;
    // Plotly has no font-weight/style on most font objects (2.x); bold and
    // italic are carried as markup on the string instead — see `styleText`.
    return f;
}

/** True when this text role asks for weight or slope Plotly cannot set as a property. */

function needsMarkup(t: ResolvedText | undefined): { bold: boolean; italic: boolean } {
    const w = t?.fontWeight;
    const bold = w === 'bold' || (typeof w === 'number' && w >= 600);
    return { bold, italic: t?.fontStyle === 'italic' };
}

function styleText(s: string, t: ResolvedText | undefined): string {
    const { bold, italic } = needsMarkup(t);
    // Case the words, never the markup between them (`<br>`).
    let out = t?.textCase ? s.split(/(<[^<>]+>)/).map((part) => (part.startsWith('<') ? part : applyTextCase(part, t.textCase))).join('') : s;
    if (bold) out = `<b>${out}</b>`;
    if (italic) out = `<i>${out}</i>`;
    return out;
}

/** A key's title in the house's `keyTitle` role: its face as a font, its weight and slope as markup, its words as written. */
function keyTitle(title: any, role: ResolvedText, family: string | undefined): any {
    const text = typeof title === 'string' ? title : title?.text;
    const asWritten = { ...role, textCase: undefined };
    return {
        ...(title && typeof title === 'object' ? title : {}),
        ...(typeof text === 'string' && text && !/^<[bi]>/.test(text) ? { text: styleText(text, asWritten) } : {}),
        font: fontOf(asWritten, family),
    };
}

/** A dash array in px → Plotly's `dash` string. */
function dashOf(dash: number[] | undefined): string | undefined {
    if (!dash || !dash.length) return undefined;
    return dash.map((n) => `${n}px`).join(',');
}

function isLiteralColor(v: unknown): v is string {
    return typeof v === 'string' && /^(#|rgb|hsl)/i.test(v.trim());
}

/** Distinct values a field takes in the rows behind the chart. */
function distinctCount(table: any[], field: string | undefined): number {
    if (!field) return 0;
    const seen = new Set<unknown>();
    for (const row of table) if (row?.[field] != null) seen.add(row[field]);
    return seen.size;
}

/**
 * Traces that draw the data, as opposed to context the template hard-coded.
 *
 * A trace whose colour is a literal the template chose *beside* colour-encoded
 * traces is context — a band, a target, a reference — and it keeps its role
 * (gap 22 in the Vega-Lite log). Here the same test is cruder because Plotly
 * has no encodings: a trace is context when the template said so by naming it
 * outside the legend (`showlegend: false` on a figure that has a legend) *and*
 * it carries no name.
 */
function isContextTrace(trace: any): boolean {
    return trace?._role === 'context' || trace?.hoverinfo === 'skip' && !trace?.name;
}

/** A reference mark states a target or a threshold: furniture, not a series. */
function isReferenceTrace(trace: any): boolean {
    return trace?._role === 'reference';
}

function isLegendProxy(trace: any): boolean {
    return typeof trace?._themeRole === 'string'
        && trace._themeRole.endsWith('legend-proxy');
}

function dataTraces(figure: any): any[] {
    return (figure?.data ?? []).filter(
        (t: any) => t && !CHROME_TRACES.has(String(t.type))
            && !isContextTrace(t) && !isReferenceTrace(t) && !isLegendProxy(t),
    );
}

/**
 * Bands of context and reference ticks are drawn in fixed greys and blacks by
 * the templates, which reads as a stack of light bars on a dark card. Each is
 * restated against the house surface, keeping its relative weight.
 */
function applyFurnitureTraces(figure: any, d: DesignDecisions): void {
    const surface = d.surface.plot ?? d.surface.canvas;
    for (const shape of figure.layout?.shapes ?? []) {
        if (shape?._role === 'series') shape.fillcolor = d.series.single;
        if (shape?._role === 'context') {
            shape.fillcolor = mixHex(surface, d.text.primary, 0.12);
        }
    }
    for (const trace of figure.data ?? []) {
        if (isReferenceTrace(trace)) {
            const line = trace.marker?.line;
            if (line) trace.marker = { ...trace.marker, line: { ...line, color: d.text.primary } };
            else if (trace.marker) trace.marker = { ...trace.marker, color: d.text.primary };
            // A rule is read against the marks, not with them: it takes the
            // weight of a grid line rather than the weight of a series.
            if (trace.line) {
                trace.line = {
                    ...trace.line,
                    color: trace.line.dash ? mixHex(surface, d.text.primary, 0.45) : d.text.primary,
                };
            }
            continue;
        }
        if (!isContextTrace(trace)) continue;
        const colour = trace.marker?.color;
        if (typeof colour !== 'string') continue;
        const rgb = parseColor(colour);
        if (!rgb) continue;
        const l = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        const weight = Math.min(0.25, Math.max(0.04, (1 - l) * 1.6));
        trace.marker = { ...trace.marker, color: mixHex(surface, d.text.primary, weight) };
    }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function realizeThemePlotly(figure: any, d: DesignDecisions, table: any[] = []): ThemeReport[] {
    const report: ThemeReport[] = [];
    const say: ReportDeparture = (path, code, message) => report.push({ stage: 'realize', path, code, message });
    if (!figure) return report;
    figure.layout ??= {};

    applySurface(figure, d);
    applyGeoSurface(figure, d);
    applyFurnitureTraces(figure, d);
    const footBefore = xFootDepth(figure, d);
    moveAxisTitlesToSubtitle(figure, d);
    // The axes first: the title, set from the chart's left, is broken to the width it has from there.
    applyAxes(figure, d, table, say);
    plDropEmptyTitles(figure.layout);
    if (figure._plot) {
        // A figure the frame laid out takes the margins its axes need as the house draws them.
        fitAxisMargins(figure, d);
    } else {
        refitFoot(figure.layout, xFootDepth(figure, d) - footBefore);
    }
    applyMarks(figure, d, table, say);
    applySeriesInk(figure, d, table, say);
    applyLegend(figure, d, say);
    // Where the key stands is settled: the value axis may take the right-hand side.
    sideYAxis(figure.layout, d);
    const titleH = applyTypography(figure, d);
    applyFacetChrome(figure, d);
    applyDataLabels(figure, d, table, say);
    alignToChartLeft(figure, d);
    delete figure._facetTicked;
    // The margins are settled: a key above the plot is measured as Plotly will wrap it there.
    // A key in a row sets its names for the row, not for the column the frame planned beside the plot.
    plFitRowKey(figure);
    const key = figure.layout.showlegend !== false && figure.layout.legend?.y > 1 ? plKeyBlock(figure) : undefined;
    layoutTopChrome(figure, d, titleH, key);
    // A key in rows under the plot stands below the x labels and title, in room of its own.
    layoutFootKey(figure);

    return report;
}

/**
 * Print the value labels, and nothing else.
 *
 * The mirror of `realizeValueLabelsVegaLite`: value labels belong to Flint, not
 * to a house, so an untheme'd Plotly chart still gets its numbers without also
 * getting somebody's ink and type.
 */
export function realizeValueLabelsPlotly(figure: any, d: DesignDecisions, table: any[] = []): ThemeReport[] {
    const report: ThemeReport[] = [];
    const say: ReportDeparture = (path, code, message) => report.push({ stage: 'realize', path, code, message });
    if (!figure) return report;
    applyDataLabels(figure, d, table, say);
    return report;
}

// ---------------------------------------------------------------------------
// Surface & typography
// ---------------------------------------------------------------------------

function applySurface(figure: any, d: DesignDecisions): void {
    const layout = figure.layout;
    layout.paper_bgcolor = d.surface.canvas;
    layout.plot_bgcolor = d.surface.plot ?? d.surface.canvas;

    // Plotly draws no view border; a frame is the four axis lines mirrored.
    if (d.frame.show) {
        for (const ch of ['x', 'y'] as const) {
            for (const key of axisKeys(layout, ch)) {
                const ax = (layout[key] ??= {});
                ax.showline = true;
                ax.linecolor = d.frame.color;
                ax.linewidth = d.frame.width;
                ax.mirror = true;
            }
        }
    }
}

/**
 * Type, and the title block.
 *
 * Returns the height the title block needs, in px. Plotly does not wrap a
 * title and does not reserve room for one that overruns the figure, so both
 * are done here: the headline is broken to the width it has, and the height
 * that costs is handed to {@link layoutTopChrome}.
 */
/**
 * A card's delta is a verdict, so it takes the house's status inks. Plotly's
 * stock green and red are stated for a white card and go muddy on a dark one,
 * so a house that names no status inks gets them lifted until they read.
 */
function applyDeltaInk(trace: any, d: DesignDecisions): void {
    if (!trace.delta) return;
    const bg = d.surface.plot ?? d.surface.canvas;
    const lift = (ink: string) => (isDarkSurface(bg) ? mixHex(ink, '#ffffff', 0.35) : ink);
    const up = d.series.status?.positive ?? lift('#2f8f4e');
    const down = d.series.status?.negative ?? lift('#c0392b');
    trace.delta = {
        ...trace.delta,
        increasing: { ...(trace.delta.increasing ?? {}), color: up },
        decreasing: { ...(trace.delta.decreasing ?? {}), color: down },
        font: { ...(trace.delta.font ?? {}), ...(d.font ? { family: d.font } : {}) },
    };
}

function moveAxisTitlesToSubtitle(figure: any, decisions: DesignDecisions): void {
    const layout = figure.layout;
    if (layout.title === null) return;
    const titles = new Map<string, Set<string>>();
    const head = typeof layout.title === 'string' ? layout.title : layout.title?.text;
    const said = (deckOnly: boolean) => [deckOnly ? undefined : head, layout.title?._deck].filter((t) => typeof t === 'string').join(' ');
    for (const channel of ['x', 'y'] as const) {
        const resolved = decisions.axes[channel]?.title;
        if (resolved?.placement !== 'subtitle') continue;
        for (const key of axisKeys(layout, channel)) {
            const axis = layout[key];
            const text = typeof axis.title === 'string' ? axis.title : axis.title?.text;
            if (typeof text !== 'string' || !text.trim()) continue;
            const label = resolved.unit && !text.includes(`(${resolved.unit})`)
                ? `${text} (${resolved.unit})` : text;
            axis.title = { ...(typeof axis.title === 'object' ? axis.title : {}), text: '' };
            // A title the headline or deck already names is not said again (the house's `unlessNamed`).
            const unlessNamed = resolved.unlessNamed;
            if (unlessNamed && alreadyNamed(text, said(unlessNamed === 'deck'), tickUnitOf(decisions.axes[channel]))) continue;
            if (!titles.has(channel)) titles.set(channel, new Set());
            titles.get(channel)!.add(label);
        }
    }
    if (!titles.size) return;
    const labels = [...titles].map(([channel, names]) =>
        `${titles.size > 1 ? `${channel.toUpperCase()}: ` : ''}${[...names].join(', ')}`);
    const title = typeof layout.title === 'string' ? { text: layout.title } : layout.title ?? { text: '' };
    layout.title = { ...title, _deck: [title._deck, ...labels].filter(Boolean).join('; ') };
}

function applyTypography(figure: any, d: DesignDecisions): number {
    const layout = figure.layout;
    layout.font = {
        ...(layout.font ?? {}),
        ...(d.font ? { family: d.font } : {}),
        color: d.text.primary,
    };

    // A card states its own caption and number inside the trace.
    for (const trace of figure.data ?? []) {
        if (trace?.type !== 'indicator') continue;
        trace.title = { ...(trace.title ?? {}), font: { ...(trace.title?.font ?? {}), ...(d.font ? { family: d.font } : {}), color: d.text.secondary } };
        trace.number = { ...(trace.number ?? {}), font: { ...(trace.number?.font ?? {}), ...(d.font ? { family: d.font } : {}), color: d.text.primary } };
        applyDeltaInk(trace, d);
    }

    restateNeutralAnnotations(layout, d);

    const title = layout.title;
    const headlineText = typeof title === 'string' ? title : title?.text;
    const deckText = (title as any)?._deck as string | undefined;
    if (!headlineText && !deckText) return 0;

    // Plotly 2.x has no `title.subtitle`, so a deck is carried as a second line
    // of the title with its own inline type.
    const h = d.title.headline;
    const deck = d.title.deck;
    let figureWidth = Number(layout.width) || 400;
    // A title set from the start stands where the chart does (see {@link chartLeft}).
    const left = d.title.anchor === 'start' ? chartLeft(figure, d) : 4;
    // A narrow chart's title may run as wide as its box allows: broken to the chart's own width it
    // stacks into many lines and makes the drawing tall and thin. The figure then widens to hold it.
    const room = Math.max(figureWidth, titleRoomOf(figure));
    const width = room - left + 4;

    // Broken to full lines with no widow, as every backend breaks a title ({@link planTitleBlock}),
    // measured in the case it is drawn in.
    const block = planTitleBlock(
        {
            title: headlineText ? applyTextCase(String(headlineText).replace(/<br>/g, ' '), h.textCase) : undefined,
            subtitle: deckText ? applyTextCase(deckText, deck.textCase) : undefined,
        },
        width - 8,
        {
            headline: { fontSize: h.fontSize ?? 16, fontWeight: needsMarkup(h).bold ? 'bold' : 'normal', font: h.font ?? d.font ?? PLOTLY_FONT },
            deck: { fontSize: deck.fontSize ?? 12, fontWeight: needsMarkup(deck).bold ? 'bold' : 'normal', font: deck.font ?? d.font ?? PLOTLY_FONT },
            gap: d.title.deckPadding,
        },
    );
    const headlineSize = block?.headline?.fontSize ?? h.fontSize ?? 16;
    figureWidth = widenForTitle(layout, block ? (d.title.anchor === 'middle' ? 2 * Math.max(left, 4) : left + 4) + block.width : 0, figureWidth);
    const headLines = block?.headline?.lines ?? [];
    const lines = headLines.length ? [styleText(headLines.join('<br>'), h)] : [];

    // Plotly sets headline and deck as one block of lines; the block is as tall as its lines.
    let height = 8 + (headLines.length ? titleBlockHeight(headLines.length, headlineSize) : 0);
    if (deckText) {
        const size = deck.fontSize ?? 12;
        const color = deck.color ?? d.text.secondary;
        const deckLines = block?.deck?.lines ?? [deckText];
        const style = [
            `font-size:${size}px`,
            `color:${color}`,
            ...(deck.font ? [`font-family:${deck.font}`] : []),
        ].join(';');
        lines.push(`<span style="${style}">${styleText(deckLines.join('<br>'), deck)}</span>`);
        height += titleBlockHeight(deckLines.length, size);
    }

    const anchor = d.title.anchor;
    layout.title = {
        text: lines.join('<br>'),
        font: { ...fontOf(h, d.font), size: headlineSize },
        x: anchor === 'start' ? left / figureWidth : anchor === 'end' ? 0.995 : 0.5,
        xanchor: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
        xref: 'container',
        y: titleY(layout, headLines.length + (deckText ? 1 : 0), headlineSize),
        yanchor: 'top',
        yref: 'container',
    };
    return height + d.title.offset;
}

/** The width the box gives a title, set by the assembler (`_titleRoom`); 0 where none is known. */
function titleRoomOf(figure: any): number {
    return Number(figure?._titleRoom) || 0;
}

/**
 * Widen a figure to hold its title where the title runs past it: the margins are held in px, so
 * the plot takes the width (Plotly fills a banded axis), and the drawing grows wider rather than
 * taller. Returns the figure's width.
 */
function widenForTitle(layout: any, need: number, width: number): number {
    const want = Math.ceil(need + 4);
    if (!(want > width)) return width;
    layout.width = want;
    return want;
}

/**
 * Restate the template's own grey text in the house's inks.
 *
 * A bar table writes its category names, headers and totals as annotations in
 * fixed greys, which are invisible on a dark house. A *grey* is furniture — it
 * was chosen to be quiet, not to mean something — so it is re-read as a text
 * role by its lightness and rewritten. A coloured annotation is data and is
 * left alone.
 */
function restateNeutralAnnotations(layout: any, d: DesignDecisions): void {
    for (const a of layout.annotations ?? []) {
        const hex = a?.font?.color;
        if (!hex) continue;
        const c = parseColor(String(hex));
        if (!c) continue;
        const grey = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 40;
        if (!grey) continue;
        const light = (c.r + c.g + c.b) / 765;
        a.font = {
            ...a.font,
            ...(d.font ? { family: d.font } : {}),
            color: light < 0.3 ? d.text.primary : light < 0.62 ? d.text.secondary : d.text.muted,
        };
    }
}

/**
 * Where to hang the title block so its first line starts 8px down.
 *
 * `yanchor: 'top'` on a `yref: 'container'` title does not put the block's top
 * at `y`. Measured against the real renderer across three font sizes and one
 * to four lines, Plotly puts the block top `0.30em` below `y` for a single
 * line and `1.00em` below it for two or more — a step, not a slope, and
 * independent of the line count after that. The old expression grew with the
 * line count instead, so a four-line headline landed 57px too low and ran into
 * whatever was under it.
 */
function titleY(layout: any, lines: number, fontSize: number): number {
    const height = Number(layout.height) || 300;
    const lead = fontSize * (Math.max(1, lines) > 1 ? 1 : 0.3);
    return 1 - (8 + lead) / height;
}

/** What a title block of this many lines actually occupies. Measured: 1.29em. */
function titleBlockHeight(lines: number, fontSize: number): number {
    return Math.max(1, lines) * fontSize * 1.3;
}

function titleLineCount(title: any): number {
    const text = typeof title === 'object' ? title?.text : title;
    return Math.max(1, String(text ?? '').split('<br>').length);
}


/**
 * Give the title and any legend above the plot room of their own.
 *
 * Plotly's `automargin` grows the margin *into* the plot, so a chart with a
 * two-line headline and a key above it loses that much of its plotting
 * rectangle. The chart was already sized to fit; the chrome the theme adds is
 * therefore paid for in figure height, not taken out of the plot.
 */
/**
 * A key the house sets in rows under the plot: measured as Plotly will wrap it ({@link plKeyBlock}),
 * hung a gap below what the x axis takes (its labels and title), with the figure grown by its height
 * so the plot keeps its size. Without this Plotly's automargin pushes the foot out by the key and
 * takes the room from the plot.
 */
function layoutFootKey(figure: any): void {
    const layout = figure.layout;
    const legend = layout?.legend;
    if (layout?.showlegend === false || !legend || legend.orientation !== 'h' || legend.yref === 'container') return;
    if (!(typeof legend.y === 'number' && legend.y < 0)) return;
    const key = plKeyBlock(figure);
    const margin = layout.margin;
    if (!key || !margin || !Number(layout.height)) return;
    const before = margin.b ?? 0;
    // What the x axis takes under the plot, without the edge the margin keeps past it.
    const foot = Math.max(0, before - PLOTLY_PROFILE.axisPad);
    margin.b = Math.ceil(foot + FOOT_KEY_GAP + key.height + PLOTLY_PROFILE.edge);
    layout.height = Math.round(layout.height + margin.b - before);
    const plotH = Math.max(1, layout.height - (margin.t ?? 0) - margin.b);
    legend.yanchor = 'top';
    legend.y = -(foot + FOOT_KEY_GAP) / plotH;
}

/** Px between the x axis's labels (or title) and a key in rows under them. */
const FOOT_KEY_GAP = 12;

/** Px kept between a title's estimated last line and a key hung under it. */
const TITLE_KEY_SLACK = 4;

function layoutTopChrome(figure: any, d: DesignDecisions, titleH: number, key: KeyBlock | undefined): void {
    const layout = figure.layout;
    const legendH = key?.height ?? 0;
    // The canvas fit weighs a key above the plot apart from the title (see `assemblePlotly`).
    if (legendH > 0) figure._topKey = legendH;
    // Plotly pads a key's box inside its edge; the house's gaps are between what is drawn.
    const inset = titleH > 0 && key ? key.inset : 0;
    // A few px between the title's last line and the key: the title's drawn block is estimated.
    const need = titleH + legendH - inset + (legendH > 0 ? TITLE_KEY_SLACK : 0);
    if (need <= 0) return;
    const margin = (layout.margin ??= { t: 24, r: 32, b: 56, l: 64 });
    const before = margin.t ?? 0;
    margin.t = Math.max(before, need);
    const grew = margin.t - before;
    if (grew > 0 && Number(layout.height)) layout.height = Math.round(layout.height + grew);
    if (layout.title && typeof layout.title === 'object') {
        layout.title.y = titleY(
            layout,
            titleLineCount(layout.title),
            Number(layout.title.font?.size) || d.title.headline.fontSize || 17,
        );
    }

    // The key sits between the title and the plot, in the room just made. It
    // hangs from just under the title rather than standing on the plot: a key
    // measured a row short then runs into the plot, which reads, where running
    // into the headline does not.
    if (legendH > 0 && layout.legend && layout.legend.y > 1) {
        const plotH = Math.max(1, (Number(layout.height) || 300) - margin.t - (margin.b ?? 0));
        layout.legend.yanchor = 'top';
        layout.legend.y = 1 + Math.max(8, margin.t - titleH - TITLE_KEY_SLACK + inset) / plotH;
    }
    void d;
}

/** How many lines the x axis's names stand on: the most `<br>` breaks a tick text holds, plus one. */
function xLabelRows(layout: any): number {
    const ax = layout?.xaxis;
    if (!ax || Math.abs(Number(ax.tickangle) || 0) > 0) return 1;
    const texts = Array.isArray(ax.ticktext) ? ax.ticktext : [];
    return Math.max(1, ...texts.map((t: unknown) => String(t).split('<br>').length));
}

/** The x axis's names as Plotly prints them: its tick texts, its category order, or the traces' own names. */
function xTickNames(figure: any): string[] {
    const ax = figure.layout?.xaxis;
    if (Array.isArray(ax?.ticktext)) return ax.ticktext.map(String);
    if (Array.isArray(ax?.categoryarray)) return ax.categoryarray.map(String);
    const names = new Set<string>();
    for (const trace of figure.data ?? []) {
        if ((trace?.xaxis ?? 'x') !== 'x' || trace?.orientation === 'h') continue;
        for (const v of trace?.x ?? []) if (typeof v === 'string') names.add(v);
    }
    return [...names];
}

/**
 * The room under the plot the x axis's names and title take as they stand: turned names by their
 * measured reach, flat ones by their rows, and the title by its lines.
 */
function xFootDepth(figure: any, d: DesignDecisions): number {
    const ax = figure.layout?.xaxis;
    if (!ax || ax.visible === false) return 0;
    const fontSize = Number(ax.tickfont?.size) || 12;
    let labels = 0;
    if (ax.showticklabels !== false) {
        const angle = Math.abs(Number(ax.tickangle) || 0) * Math.PI / 180;
        if (angle > 0) {
            const widthOf = tableTextMeasurer(fontSize, ax.tickfont?.family ?? d.font ?? PLOTLY_FONT, 'normal', 'normal');
            const widest = Math.max(0, ...xTickNames(figure).flatMap((t) => t.split('<br>')).map(widthOf));
            labels = widest * Math.sin(angle) + fontSize * Math.cos(angle);
        } else {
            labels = plLabelDepth(Math.max(xLabelRows(figure.layout), plDateLabelRows(figure, 'x')), fontSize);
        }
        labels += plTickRun(ax);
    }
    // Measured as the frame reserves it (`reserveCartesianMargins`).
    const titled = plAxisTitleRoom(ax);
    return Math.ceil(labels + titled);
}

/**
 * The foot follows what the house did to the x axis: names it wrapped onto more lines take their
 * room below the plot rather than out of it, and room kept for names it laid flat, or for a title it
 * moved into the deck, is given back. The figure grows or shrinks with it; the plot keeps its size.
 */
function refitFoot(layout: any, change: number): void {
    const margin = layout?.margin;
    if (!change || !margin) return;
    const before = margin.b ?? 0;
    margin.b = Math.max(Math.min(before, 24), before + change);
    if (Number(layout.height)) layout.height = Math.round(layout.height + margin.b - before);
}

/**
 * The room left of the plot the y axis takes as it stands: its widest label in its own font, the
 * tick run before it, and its title.
 */
function yGutterWidth(figure: any, d: DesignDecisions): number {
    const ax = figure.layout?.yaxis;
    if (!ax || ax.visible === false || ax.side === 'right') return 0;
    let width = 0;
    if (ax.showticklabels !== false) {
        const widthOf = tableTextMeasurer(Number(ax.tickfont?.size) || 12, ax.tickfont?.family ?? d.font ?? PLOTLY_FONT, 'normal', 'normal');
        width = Math.max(0, ...plYTickTexts(figure).map(widthOf)) + plTickRun(ax);
    }
    width += plAxisTitleRoom(ax);
    return Math.ceil(width);
}

/**
 * The margins a frame-laid figure's axes take, as the house draws them: below the plot the x labels,
 * their tick run and title, and a key at the foot; left of it the y gutter; the canvas's edge past
 * both. The figure grows or shrinks with them; the plot keeps its size. Measured as the frame reserves
 * them before the house (`reserveCartesianMargins`), so Plotly's automargin has nothing left to grow.
 */
function fitAxisMargins(figure: any, d: DesignDecisions): void {
    const layout = figure.layout;
    const margin = layout?.margin;
    if (!margin) return;
    const pad = PLOTLY_PROFILE.axisPad;
    if (layout.xaxis) {
        const before = margin.b ?? 0;
        margin.b = pad + xFootDepth(figure, d) + (figure._legendRoom?.bottom ?? 0);
        if (Number(layout.height)) layout.height = Math.round(layout.height + margin.b - before);
    }
    if (layout.yaxis && layout.yaxis.side !== 'right') {
        const before = margin.l ?? 0;
        margin.l = pad + yGutterWidth(figure, d);
        if (Number(layout.width)) layout.width = Math.round(layout.width + margin.l - before);
    }
}


/**
 * A house that stands the value axis on the right (`axes.y.orient`) has it drawn there; the room its
 * labels took on the left moves to the right with them, so the plot keeps its width. Not where a
 * legend stands beside the plot on the right, which that side's room is kept for.
 */
function sideYAxis(layout: any, d: DesignDecisions): void {
    const orient = (d.axes.y as { orient?: string } | undefined)?.orient;
    const ax = layout?.yaxis;
    if (orient !== 'right' || !ax || ax.side === 'right' || layout.yaxis2) return;
    const legend = layout.legend;
    if (layout.showlegend !== false && legend && legend.orientation !== 'h' && (legend.x ?? 1.02) >= 1) return;
    ax.side = 'right';
    const m = layout.margin;
    if (!m) return;
    const left = m.l ?? 64;
    const right = m.r ?? 32;
    m.r = Math.max(right, left);
    m.l = Math.max(16, left + right - m.r);
}


/**
 * Where the chart's left edge stands, in px from the figure's: the left of the y axis's labels, or
 * the plot's left edge where the axis stands on the right. A title and key set from the start stand
 * there, as Vega-Lite anchors them to the chart's group, rather than at the figure's edge.
 */
function chartLeft(figure: any, d: DesignDecisions): number {
    const layout = figure.layout;
    const ax = layout?.yaxis;
    let left = layout?.margin?.l ?? 0;
    if (ax && ax.side !== 'right' && ax.showticklabels !== false) {
        const widthOf = tableTextMeasurer(ax.tickfont?.size ?? 12, ax.tickfont?.family ?? d.font ?? PLOTLY_FONT, 'normal', 'normal');
        const labels = plYTickTexts(figure);
        const run = labels.length ? Math.max(...labels.map(widthOf)) + (ax.ticklabelstandoff ?? 0) + (ax.ticklen ?? 0) : 0;
        left -= run;
    }
    return Math.max(4, Math.round(left));
}

/** A key in a row above or below the plot, set from the start, stands where the title does. */
function alignToChartLeft(figure: any, d: DesignDecisions): void {
    const layout = figure.layout;
    const width = Number(layout?.width);
    if (!(width > 0) || !layout.margin || d.title.anchor !== 'start') return;
    const legend = layout.legend;
    if (legend && legend.orientation === 'h' && legend.xanchor === 'left' && legend.xref !== 'container') {
        // In paper units, from the plot's left: a container-anchored row is wrapped by Plotly as a column.
        const plotWidth = Math.max(1, width - (layout.margin.l ?? 0) - (layout.margin.r ?? 0));
        legend.x = (chartLeft(figure, d) - (layout.margin.l ?? 0)) / plotWidth;
    }
}

/**
 * A map has its own canvas, land and borders, none of which are axes.
 *
 * Left alone they stay Plotly's white-and-grey, which puts a white card in the
 * middle of a dark house.
 */
function applyGeoSurface(figure: any, d: DesignDecisions): void {
    const layout = figure?.layout ?? {};
    const plot = d.surface.plot ?? d.surface.canvas;
    for (const key of Object.keys(layout)) {
        if (!/^geo\d*$/.test(key)) continue;
        const geo = layout[key];
        if (!geo || typeof geo !== 'object') continue;
        const land = mixHex(plot, d.text.primary, 0.1);
        const border = mixHex(plot, d.text.primary, 0.28);
        Object.assign(geo, {
            bgcolor: plot,
            landcolor: land,
            oceancolor: plot,
            lakecolor: plot,
            subunitcolor: border,
            countrycolor: border,
            coastlinecolor: border,
            framecolor: border,
        });
    }
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

function applyAxes(figure: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    const layout = figure.layout;
    for (const ch of ['x', 'y'] as const) {
        const decided = d.axes[ch];
        if (!decided) continue;
        for (const key of axisKeys(layout, ch)) {
            applyAxis(
                layout[key] ?? (layout[key] = {}),
                decided,
                d,
                say,
                key,
                Math.max(80, (Number(layout.width) || 400) - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0)),
                axisCategories(figure, layout[key], key, ch),
                axisSpanDecades(figure, layout[key], key, ch),
            );
        }
    }
    pinSparseTicks(figure, d);
    thinDenseCategoryTicks(figure, d, say);
    applyPolarAxes(figure, d, say);
    dedupeBoundaryZeroLines(figure, say);
    applyUnits(figure, d, say);
    applyTickLabels(figure, d, table);
}

/** Thin dense categorical x labels without removing any bars or categories. */
function thinDenseCategoryTicks(figure: any, d: DesignDecisions, say: ReportDeparture): void {
    const layout = figure.layout ?? {};
    const plotWidth = Math.max(
        80,
        (Number(layout.width) || Number(figure._width) || 400)
            - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0),
    );
    const fontSize = d.axes.x?.label.fontSize ?? 11;
    for (const key of axisKeys(layout, 'x')) {
        const ax = layout[key];
        const categories = Array.isArray(ax?.categoryarray) ? ax.categoryarray : [];
        if (ax?.type !== 'category' || categories.length < 2) continue;
        // Names the house already set (wrapped, cut) were fitted to their band: none is dropped.
        if (Array.isArray(ax.ticktext)) continue;
        const domain = Array.isArray(ax.domain) && ax.domain.length === 2
            ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
            : 1;
        const band = plotWidth * (Number.isFinite(domain) ? domain : 1);
        const widthOf = tableTextMeasurer(fontSize, d.axes.x?.label.font ?? d.font ?? PLOTLY_FONT, 'normal', 'normal');
        const widest = Math.min(18 * fontSize * 0.58, Math.max(3 * fontSize * 0.58, ...categories.map((c: any) => widthOf(String(c)))));
        // A turned label takes its line height along the axis, not its length.
        const footprint = (degrees: number): number => degrees > 0
            ? fontSize * 1.2 / Math.sin(degrees * Math.PI / 180) + 2
            : widest + 8;
        const fitsAt = (degrees: number): number => Math.max(2, Math.floor(band / footprint(degrees)));
        let degrees = Math.abs(Number(ax.tickangle) || 0);
        if (categories.length <= fitsAt(degrees)) continue;
        // In the house's type, turned names may crowd again: stand them on end before dropping any.
        if (degrees > 0 && degrees < 90) {
            degrees = degrees < 45 && categories.length <= fitsAt(45) ? 45 : 90;
            ax.tickangle = -degrees;
            say('axes.label.angle', 'labels-turned', `\`${key}\` turns its names to ${degrees}° — at the house's size they crowd at less`);
            if (categories.length <= fitsAt(degrees)) continue;
        }
        if (ax.tickvals != null) continue;
        const fits = fitsAt(degrees);
        const step = (categories.length - 1) / (fits - 1);
        const picked = [...new Set(Array.from(
            { length: fits },
            (_v, i) => categories[Math.round(i * step)],
        ))];
        ax.tickmode = 'array';
        ax.tickvals = picked;
        ax.ticktext = picked.map(String);
        say('axes.tickCount', 'labels-thinned', `\`${key}\` labels ${picked.length} of ${categories.length} dense categories`);
    }
}

/**
 * A positive-only axis puts its zero rule on (or immediately beside) the
 * perpendicular domain line. Plotly otherwise draws both strokes a few pixels
 * apart because autorange pads zero, producing a doubled scatter baseline.
 */
function dedupeBoundaryZeroLines(figure: any, say: ReportDeparture): void {
    const layout = figure.layout ?? {};
    for (const ch of ['x', 'y'] as const) {
        for (const key of axisKeys(layout, ch)) {
            const ax = layout[key];
            if (!ax?.zeroline) continue;
            const suffix = key.replace(`${ch}axis`, '');
            const perpendicular = layout[`${ch === 'x' ? 'y' : 'x'}axis${suffix}`];
            if (!perpendicular?.showline) continue;
            const ref = `${ch}${suffix}`;
            const values: number[] = [];
            for (const trace of figure.data ?? []) {
                if (String(trace?.[`${ch}axis`] ?? ch) !== ref) continue;
                for (const value of trace?.[ch] ?? []) {
                    const n = Number(value);
                    if (Number.isFinite(n)) values.push(n);
                }
            }
            if (values.length && Math.min(...values) >= 0) {
                ax.zeroline = false;
                say('axes.zeroRule', 'zero-rule-not-drawn', `${key} zero coincides with the perpendicular domain — duplicate stroke omitted`);
            }
        }
    }
}

/**
 * The line along the index axis is a base only where the value scale starts at zero. Where the value
 * scale floats (its floor is not zero) and the house rules its values with a grid rather than an axis
 * line (`floating: 'omit'`, or unset with a gridded, unruled value axis), that line would claim a base
 * the chart does not have: it is left off, and zero, where the data crosses it, carries the base — as
 * Vega-Lite's realization decides. Run once the value axis's range is final.
 */
export function plFloatingFloor(figure: any, d: DesignDecisions): void {
    const layout = figure?.layout;
    if (!layout) return;
    const index = (['x', 'y'] as const).find((channel) => d.axes[channel]?.indexing);
    if (!index) return;
    const valueAxis = d.axes[index === 'x' ? 'y' : 'x'];
    const floating = d.floating ?? (valueAxis && !valueAxis.domain.show && valueAxis.grid.show ? 'omit' : 'keep');
    if (floating !== 'omit') return;
    const valueKey = index === 'x' ? 'yaxis' : 'xaxis';
    const indexKey = `${index}axis`;
    const ax = layout[valueKey];
    const line = layout[indexKey];
    if (!ax || !line?.showline || ax.type === 'category' || ax.type === 'log' || ax.type === 'date') return;
    let floor: number | undefined;
    if (Array.isArray(ax.range)) floor = Math.min(Number(ax.range[0]), Number(ax.range[1]));
    else {
        const channel = index === 'x' ? 'y' : 'x';
        const values: number[] = [];
        for (const trace of figure.data ?? []) {
            if ((trace?.[`${channel}axis`] ?? channel) !== channel) continue;
            for (const v of trace?.[channel] ?? []) { const n = Number(v); if (v != null && Number.isFinite(n)) values.push(n); }
        }
        if (!values.length) return;
        const lo = Math.min(...values);
        floor = ax.rangemode === 'tozero' && lo >= 0 ? 0 : lo;
    }
    // A floor at zero is the base, and a floor over the data's own positive values is not one the
    // reader takes for a base: only a floor below zero, under a zero the data crosses, claims a base
    // the chart does not have — there zero carries it.
    if (floor === undefined || !Number.isFinite(floor) || floor >= 0) return;
    line.showline = false;
}

/** A rank-like run: every integer between the ends is present. */
function isContiguousIntegers(seen: Set<any>): boolean {
    const nums = [...seen].map(Number);
    if (nums.some((n) => !Number.isInteger(n))) return false;
    return Math.max(...nums) - Math.min(...nums) + 1 === nums.length;
}

/**
 * Name the values the chart actually holds, when there are few of them.
 *
 * Plotly picks its own round numbers for a continuous axis. On four Olympic
 * years that gives "2015, 2020, 2025" — three labels, none of which is a games
 * and none of which sits under a data point. Vega-Lite does not do this
 * because it is told the domain. Where an axis carries only a handful of
 * distinct values, those values *are* the sequence, so they are pinned.
 */
function pinSparseTicks(figure: any, d: DesignDecisions): void {
    const layout = figure.layout;
    const MAX = 8;
    for (const ch of ['x', 'y'] as const) {
        const a = d.axes[ch];
        if (!a) continue;
        // A measure axis normally wants round numbers — naming the seven values
        // a short series happens to hold ("1, 16, 29, 43, 51, 67") reads as
        // noise. The exception is a rank-like axis, whose values are a
        // contiguous run of integers and *are* the scale.
        const measure = d.bound.measureChannels.includes(ch);
        for (const key of axisKeys(layout, ch)) {
            const ax = layout[key];
            if (!ax || ax.type === 'category' || ax.type === 'log') continue;
            if (ax.tickvals != null || !ax.showticklabels || ax.dtick != null || figure._facetTicked) continue;
            const want = key.replace('axis', '');
            const seen = new Set<any>();
            for (const trace of figure.data ?? []) {
                if (CHROME_TRACES.has(String(trace?.type))) continue;
                if (String(trace?.[`${ch}axis`] ?? ch) !== want) continue;
                for (const v of trace?.[ch] ?? []) if (v != null) seen.add(v);
            }
            if (seen.size < 2 || seen.size > MAX) continue;
            if (measure && !isContiguousIntegers(seen)) continue;
            const sorted = [...seen].sort((p, q) => (
                ax.type === 'date'
                    ? new Date(p).getTime() - new Date(q).getTime()
                    : Number(p) - Number(q)
            ));
            const picked = fitTicksToBand(figure, ax, sorted, a.label.fontSize ?? 11);
            if (!picked.length) continue;
            if (ax.type === 'date' && !ax.tickformat) {
                ax.tickformat = dateFormatFor(picked);
                ax.tickangle = 0;
            }
            ax.tickmode = 'array';
            ax.tickvals = picked;
            delete ax.nticks;
        }
    }
}

/**
 * A polar plot keeps its scales inside `layout.polar`, out of reach of the
 * cartesian pass. Its radial labels sit in the middle of the plot, where
 * Plotly turns them on their side as soon as the circle gets small, so they
 * are held straight and their count is kept low.
 */
function applyPolarAxes(figure: any, d: DesignDecisions, say: ReportDeparture): void {
    const layout = figure.layout;
    let saidRose = false;
    const polarKeys = new Set(
        Object.keys(layout ?? {}).filter(key => /^polar\d*$/.test(key)),
    );
    // Plotly implicitly creates the default `polar` subplot when a trace does
    // not declare one. Materialize it so themed furniture also reaches polar
    // traces that passed through a generic figure combiner.
    if ((figure.data ?? []).some((trace: any) =>
        (trace?.type === 'barpolar' || trace?.type === 'scatterpolar')
        && String(trace?.subplot ?? 'polar') === 'polar')) {
        polarKeys.add('polar');
        layout.polar ??= {};
    }
    for (const key of polarKeys) {
        if (!/^polar\d*$/.test(key)) continue;
        const polar = layout[key];
        if (!polar || typeof polar !== 'object') continue;
        const plot = d.surface.plot ?? d.surface.canvas;
        const subplot = key === 'polar' ? 'polar' : key;
        const subplotTraces = (figure.data ?? []).filter((trace: any) =>
            String(trace?.subplot ?? 'polar') === subplot);
        const radar = subplotTraces.some((trace: any) =>
            trace?.type === 'scatterpolar'
            && trace?.fill === 'toself');
        const rose = subplotTraces.some((trace: any) => trace?.type === 'barpolar');
        polar.bgcolor = plot;
        for (const [name, a] of [['radialaxis', d.axes.y], ['angularaxis', d.axes.x]] as const) {
            if (!a) continue;
            const ax = polar[name] ?? (polar[name] = {});
            if (rose) {
                // A rose has no empty axis gutter: the radial ray, its ticks,
                // and its numbers would be drawn through the wedges. Replace
                // that cartesian furniture with quiet rings below the marks.
                // Month labels already locate the angular bands, so spokes and
                // little rim ticks only repeat boundaries the wedges provide.
                ax.ticks = '';
                ax.ticklen = 0;
                ax.showline = false;
                if (name === 'radialaxis') {
                    ax.showgrid = true;
                    ax.gridcolor = mixHex(plot, d.text.secondary, 0.28);
                    ax.gridwidth = 0.8;
                    ax.layer = 'below traces';
                    ax.showticklabels = false;
                    ax.nticks = 4;
                } else {
                    ax.showgrid = false;
                }
                if (!saidRose) {
                    say(
                        'structure.axis.polar', 'polar-axis-replaced',
                        'the rose uses quiet concentric guides and fitted values at wedge tips instead of an axis ray through the data',
                    );
                    saidRose = true;
                }
            } else if (radar) {
                // Rings and spokes are the radar's coordinate system, not
                // optional cartesian reference lines. Keep them present but
                // quiet so they locate a vertex without competing with it.
                const strength = name === 'radialaxis' ? 0.18 : 0.24;
                ax.showgrid = true;
                ax.gridcolor = mixHex(plot, a.grid.color ?? d.text.secondary, strength);
                ax.gridwidth = Math.min(1, a.grid.width ?? 1);
                ax.showline = true;
                ax.linecolor = mixHex(plot, a.domain.color ?? d.text.secondary, 0.42);
                ax.linewidth = Math.min(1, a.domain.width ?? 1);
            } else {
                ax.showgrid = a.grid.show;
                if (a.grid.show) {
                    ax.gridcolor = a.grid.color;
                    ax.gridwidth = a.grid.width;
                }
                ax.showline = a.domain.show;
                if (a.domain.show) {
                    ax.linecolor = a.domain.color;
                    ax.linewidth = a.domain.width;
                }
            }
            if (a.label.show !== false) {
                ax.tickfont = { ...(ax.tickfont ?? {}), ...fontOf(a.label, d.font) };
                if (name === 'radialaxis') {
                    ax.tickangle = 0;
                    if (!rose && ax.tickmode !== 'array') ax.nticks = Math.min(a.tickCount ?? 4, 4);
                }
            }
        }
        if (rose) addRoseValueLabels(figure, key, subplotTraces, d);
    }
}

/** Put a total near each rose tip, omitting labels whose wedge cannot hold it. */
function addRoseValueLabels(
    figure: any,
    subplot: string,
    traces: any[],
    d: DesignDecisions,
): void {
    figure.data = (figure.data ?? []).filter((trace: any) =>
        !(trace?._themeRole === 'rose-value-labels' && String(trace?.subplot ?? 'polar') === subplot));

    const totals = new Map<string, { theta: any; value: number }>();
    for (const trace of traces) {
        if (trace?.type !== 'barpolar') continue;
        for (let i = 0; i < Math.min(trace.theta?.length ?? 0, trace.r?.length ?? 0); i++) {
            const value = Number(trace.r[i]);
            if (!Number.isFinite(value) || value <= 0) continue;
            const key = String(trace.theta[i]);
            const current = totals.get(key);
            if (current) current.value += value;
            else totals.set(key, { theta: trace.theta[i], value });
        }
    }
    if (!totals.size) return;

    const layout = figure.layout ?? {};
    const margin = layout.margin ?? {};
    const plotW = (Number(layout.width) || Number(figure._width) || 400)
        - (margin.l ?? 0) - (margin.r ?? 0);
    const plotH = (Number(layout.height) || Number(figure._height) || 320)
        - (margin.t ?? 0) - (margin.b ?? 0);
    const radius = Math.max(40, Math.min(plotW, plotH) / 2);
    const fontSize = d.axes.y?.label.fontSize ?? 11;
    const max = Math.max(...[...totals.values()].map(item => item.value));
    const count = totals.size;
    const tipPad = (max * fontSize * 0.7) / radius;
    const theta: any[] = [];
    const r: number[] = [];
    const text: string[] = [];

    for (const item of totals.values()) {
        const label = Number.isInteger(item.value)
            ? String(item.value)
            : String(Number(item.value.toPrecision(3)));
        const radialPx = (item.value / max) * radius;
        const arcPx = (2 * Math.PI * radialPx / count) * 0.65;
        const labelPx = label.length * fontSize * 0.58;
        if (radialPx < fontSize * 1.6 || arcPx < labelPx) continue;
        theta.push(item.theta);
        r.push(item.value + tipPad);
        text.push(label);
    }
    if (!text.length) return;

    const radialAxis = figure.layout?.[subplot]?.radialaxis
        ?? (figure.layout[subplot].radialaxis = {});
    const currentMin = Array.isArray(radialAxis.range) ? Number(radialAxis.range[0]) : 0;
    const currentMax = Array.isArray(radialAxis.range) ? Number(radialAxis.range[1]) : 0;
    radialAxis.range = [
        Number.isFinite(currentMin) ? currentMin : 0,
        Math.max(Number.isFinite(currentMax) ? currentMax : 0, max + tipPad * 2.5),
    ];
    delete radialAxis.rangemode;

    figure.data.push({
        type: 'scatterpolar',
        subplot,
        mode: 'text',
        theta,
        r,
        text,
        textposition: 'middle center',
        textfont: {
            ...fontOf(d.axes.y?.label ?? d.dataLabels.text, d.font),
            color: d.text.primary,
        },
        hoverinfo: 'skip',
        showlegend: false,
        _role: 'context',
        _themeRole: 'rose-value-labels',
    });
}

/**
 * The names a banded axis carries: what the layout declares, or what the
 * traces bound to that axis actually plot.
 */
function axisCategories(figure: any, ax: any, key: string, ch: 'x' | 'y'): any[] {
    if (Array.isArray(ax?.categoryarray) && ax.categoryarray.length) return ax.categoryarray;
    if (ax?.type !== 'category') return [];
    const short = key.replace('axis', '');
    const seen = new Set<string>();
    for (const t of figure.data ?? []) {
        if (String(t?.[`${ch}axis`] ?? ch) !== short) continue;
        for (const v of t?.[ch] ?? []) seen.add(String(v));
    }
    return [...seen];
}

/**
 * Would this axis's names read straight in the width it actually has?
 *
 * Only answerable for a banded axis, where the band width is the width divided
 * by the number of names. Anything else is left to the house.
 */
/** How wide a tick label runs, measured in the face and size the house sets labels in. */
function labelWidthOf(a: ResolvedAxis, d: DesignDecisions): (text: string) => number {
    const label = a.label as ResolvedAxis['label'] & { fontWeight?: string | number };
    return tableTextMeasurer(label.fontSize ?? 11, label.font ?? d.font ?? PLOTLY_FONT, label.fontWeight ?? 'normal', 'normal');
}

/** The air kept between neighbouring names, so 'JanFebMar' does not read as one word. */
const NAME_GAP = 5;

function labelsFitStraight(ax: any, key: string, a: ResolvedAxis, width: number, cats: any[], widthOf: (text: string) => number): boolean {
    if (!key.startsWith('x')) return true;
    if ((a.label.angle ?? 0) !== 0) return true;
    if (!Array.isArray(cats) || !cats.length) return true;
    const span = Array.isArray(ax.domain) && ax.domain.length === 2
        ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
        : 1;
    const band = (width * (Number.isFinite(span) ? span : 1)) / cats.length;
    // Wrapped names are as wide as their widest line.
    const printed = Array.isArray(ax.ticktext) ? ax.ticktext.flatMap((t: any) => String(t).split('<br>')) : cats;
    return Math.max(...printed.map((c: any) => widthOf(String(c)))) + NAME_GAP <= band;
}

/**
 * Straight names wider than their band, along the house's path: turned, trimmed to the band with
 * an ellipsis (`wrap`, which a panel cannot re-break), or on an ordered axis every nth label shown so
 * the rest stand clear (`skip`). Returns the step taken.
 */
function fitOverflowingLabels(ax: any, a: ResolvedAxis, width: number, cats: any[], widthOf: (text: string) => number): LabelFitStep {
    const span = Array.isArray(ax.domain) && ax.domain.length === 2
        ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
        : 1;
    const band = (width * (Number.isFinite(span) ? span : 1)) / cats.length;
    const fontSize = a.label.fontSize ?? 11;
    const printed: string[] = Array.isArray(ax.ticktext) ? ax.ticktext.map(String) : cats.map(String);
    const widest = Math.max(...printed.flatMap((t) => t.split('<br>')).map(widthOf));
    const named = ax.type === undefined || ax.type === 'category' || ax.type === '-';
    const path = a.label.overflow ?? DEFAULT_LABEL_OVERFLOW;
    // Names that break at a space onto two lines, each within its band, stand flat and whole there,
    // as Vega-Lite sets them: the house's first step, before any cut or turn.
    if (named && path[0] === 'wrap') {
        const names = printed.map((t) => t.replace(/<br>/g, ' '));
        const two = fitTwoLineLabels(names, fontSize, band - NAME_GAP, false, widthOf);
        if (two && two.lines.every((lines) => lines.length <= 2)) {
            if (!Array.isArray(ax.tickvals)) {
                ax.tickmode = 'array';
                ax.tickvals = cats;
            }
            ax.ticktext = two.lines.map((lines) => lines.join('<br>'));
            ax.tickangle = 0;
            return 'wrap';
        }
    }
    const { step } = chooseLabelStep(path, {
        band, widest, fontSize,
        turnLimit: a.label.limit === 0 ? Infinity : a.label.limit ?? TURNED_LABEL_LIMIT, noTrim: a.label.limit === 0 || !named,
        // Names left out can be read from their neighbours only on an ordered axis (dates, ranks).
        ordered: a.label.ordered === true || !named || ax.type === 'date',
    });
    if (step === 'rotate45' || step === 'rotate90') {
        ax.tickangle = step === 'rotate45' ? -45 : -90;
        return step;
    }
    if (step === 'wrap') {
        const cut = (t: string) => t.split('<br>').map((line) => cutToWidth(line, band - NAME_GAP, widthOf)).join('<br>');
        if (!Array.isArray(ax.tickvals)) {
            ax.tickmode = 'array';
            ax.tickvals = cats;
        }
        ax.ticktext = printed.map(cut);
        return step;
    }
    ax.ticklabelstep = Math.max(2, Math.ceil((widest + NAME_GAP) / band));
    return 'skip';
}

/**
 * How many powers of ten the values bound to this axis cover. Only meaningful
 * on a log axis, and only used to decide whether its minors need naming.
 */
function axisSpanDecades(figure: any, ax: any, key: string, ch: 'x' | 'y'): number {
    if (Array.isArray(ax?.range) && ax.range.length === 2) {
        return Math.abs(Number(ax.range[1]) - Number(ax.range[0]));
    }
    const want = key.replace('axis', '');
    const values: number[] = [];
    for (const trace of figure?.data ?? []) {
        if (String(trace?.[`${ch}axis`] ?? ch) !== want) continue;
        for (const v of trace?.[ch] ?? []) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) values.push(n);
        }
    }
    if (values.length < 2) return 0;
    return Math.log10(Math.max(...values)) - Math.log10(Math.min(...values));
}

function applyAxis(
    ax: any,
    a: ResolvedAxis,
    d: DesignDecisions,
    say: ReportDeparture,
    key: string,
    width: number,
    cats: any[],
    decades: number,
): void {
    // Grid
    ax.showgrid = a.grid.show;
    if (a.grid.show) {
        ax.gridcolor = a.grid.color;
        ax.gridwidth = a.grid.width;
        const dash = dashOf(a.grid.dash);
        if (dash) ax.griddash = dash;
    }

    // Zero — Plotly draws one by default, which is a decision the house owns.
    if (a.zeroRule?.show) {
        ax.zeroline = true;
        ax.zerolinecolor = a.zeroRule.color;
        ax.zerolinewidth = a.zeroRule.width;
    } else {
        ax.zeroline = false;
    }

    // Domain line
    ax.showline = a.domain.show;
    if (a.domain.show) {
        ax.linecolor = a.domain.color;
        ax.linewidth = a.domain.width;
    }

    // Ticks
    if (a.ticks.show) {
        ax.ticks = 'outside';
        ax.ticklen = a.ticks.size;
        ax.tickcolor = a.ticks.color;
        ax.tickwidth = a.ticks.width;
    } else {
        ax.ticks = '';
        ax.ticklen = 0;
    }

    // Tick labels. A facet grid hides the labels on every panel but the
    // outermost, which is a fact about the layout, not a house preference —
    // turning them back on prints the same scale four times.
    ax.showticklabels = a.label.show !== false && ax.showticklabels !== false;
    if (ax.showticklabels) {
        ax.tickfont = { ...(ax.tickfont ?? {}), ...fontOf(a.label, d.font) };
        // A straight label angle was decided against the whole axis. A facet
        // panel holds a fraction of it, and names that read straight across a
        // full width run into each other across a quarter of one — so they are
        // measured again against the panel.
        if (a.label.angle != null) {
            ax.tickangle = a.label.angle;
            const widthOf = labelWidthOf(a, d);
            if (!labelsFitStraight(ax, key, a, width, cats, widthOf)) {
                // Names too wide for the panel take the first workable step of the house's overflow.
                const step = fitOverflowingLabels(ax, a, width, cats, widthOf);
                say('axes.label.overflow', 'labels-overflow', `\`${key}\`'s labels do not fit the panel straight — overflow step \`${step}\``);
            }
        }
        if (a.label.padding != null) ax.ticklabelstandoff = a.label.padding;
    }

    // Title
    const titleText = typeof ax.title === 'string' ? ax.title : ax.title?.text;
    if (!a.title.show) {
        ax.title = { text: '' };
    } else if (titleText) {
        const text = a.title.unit && !titleText.includes(a.title.unit)
            ? `${titleText} (${a.title.unit})`
            : titleText;
        ax.title = {
            text: styleText(text, a.title),
            font: fontOf(a.title, d.font),
            standoff: (ax.title?.standoff ?? 16),
        };
        if (a.title.placement === 'flatAboveAxis' && key.startsWith('y')) {
            // A y title set flat above the axis is an annotation in Plotly, not
            // a title property. Approximated as a rotated title for now.
            say('annotation.axisTitlePlacement', 'axis-title-placement-fallback', 'flat axis title not realized on a y axis — kept rotated');
        }
    }

    // A tick budget is stated for a whole axis. A facet panel holds a fraction
    // of the width, so it gets that fraction of the budget — otherwise the
    // last tick of one panel prints on top of the first tick of the next.
    // A log axis is ticked by decade. Asking it for a number of ticks makes
    // Plotly name every minor as well — 2, 3, 4 … 9 between each power.
    // A facet grid's frame ticked its panels from their own size (`plLayoutFacetGrid`): the house's
    // count, shared out over the panels, would leave each a tick or two.
    const framed = ax._framedTicks === true;
    delete ax._framedTicks;
    if (!framed && a.tickCount != null && ax.type !== 'category' && ax.type !== 'log') {
        const dom = Array.isArray(ax.domain) && ax.domain.length === 2
            ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
            : 1;
        ax.nticks = Math.max(2, Math.round(a.tickCount * (Number.isFinite(dom) ? dom : 1)));
    }

    // Plotly names the minors of a log axis on its own once the range is short
    // enough — "2, 5, 10k, 2, 5, 100k" reads as a broken sequence, because the
    // numbers repeat and nothing on the axis says they are decades apart.
    // Naming the powers alone is what every reference chart does.
    if (ax.type === 'log' && ax.dtick == null) {
        if (decades >= 1.5) ax.dtick = 1;
    }

    // A budget in *numbers* is not a budget in *room*. Sixteen panels across
    // one page leave 50px each, which holds one year, not four — and Plotly
    // will print all four on top of each other rather than drop any.
    if (!framed && key.startsWith('x') && ax.type !== 'category' && ax.type !== 'log' && ax.showticklabels) {
        const dom = Array.isArray(ax.domain) && ax.domain.length === 2
            ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
            : 1;
        const span = Number.isFinite(dom) ? dom : 1;
        const each = tickLabelChars(ax) * (a.label.fontSize ?? 11) * 0.58 + 8;
        const band = width * span - (span < 0.99 ? each * 1.5 : 0);
        const fits = Math.max(1, Math.floor(band / each));
        if (fits < (ax.nticks ?? 6)) {
            ax.nticks = Math.max(2, fits);
            if (a.tickCount != null) say('axes.tickCount', 'ticks-reduced', `\`${key}\` holds ${fits} label(s) in the room it has, not ${a.tickCount}`);
        }
    }
}

/**
 * Keep only as many of these ticks as the panel has room to print. Plotly
 * prints every value in `tickvals`, however narrow the panel, so a grid of
 * sixteen facets writes four years on top of each other.
 */
function fitTicksToBand(figure: any, ax: any, picked: any[], fontSize: number): any[] {
    const layout = figure.layout ?? {};
    const width = Math.max(80, (Number(layout.width) || 400) - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0));
    const dom = Array.isArray(ax.domain) && ax.domain.length === 2
        ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
        : 1;
    // A panel's end labels hang over its edges, so a facet has to leave a
    // label's width of air or its last tick lands on its neighbour's first.
    const span = Number.isFinite(dom) ? dom : 1;
    const each = tickLabelChars(ax) * fontSize * 0.58 + 8;
    const band = width * span - (span < 0.99 ? each * 1.5 : 0);
    const fits = Math.max(1, Math.floor(band / each));
    // Panels sit edge to edge, so a tick at the right edge of one prints on
    // the tick at the left edge of the next. Every panel but the last gives
    // up its final label.
    const trimmed = span < 0.99 && Number(ax.domain?.[1]) < 0.99 && picked.length > 1
        ? picked.slice(0, -1)
        : picked;
    picked = trimmed;
    if (fits < 2) return [picked[0]];
    if (picked.length > fits) {
        // Keep the ends and spread the rest, so the range still reads.
        const step = (picked.length - 1) / (fits - 1);
        const out: any[] = [];
        for (let i = 0; i < fits; i++) out.push(picked[Math.round(i * step)]);
        picked = [...new Set(out)];
    }
    return spaceOutTicks(picked, each, band, ax);
}

/**
 * Drop ticks that land on top of one another.
 *
 * Thinning by index assumes the values are evenly spaced, and observed values
 * are not — a series sampled at 1995, 2000 … 2015, 2018, 2020, 2023 keeps
 * every fourth entry and still prints "2018" against "2020". So the survivors
 * are walked in *position* and any that falls within a label's width of the
 * one before it is dropped. The last tick is kept in preference to its
 * neighbour: it carries the end of the range.
 */
function spaceOutTicks(picked: any[], each: number, band: number, ax: any): any[] {
    if (picked.length < 3) return picked;
    const at = (v: any) => (ax.type === 'date' ? new Date(v).getTime() : Number(v));
    const nums = picked.map(at);
    if (nums.some((n) => !Number.isFinite(n))) return picked;
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    if (!(hi > lo)) return picked;
    const px = (v: number) => ((v - lo) / (hi - lo)) * band;
    const kept: any[] = [picked[0]];
    let lastPx = px(nums[0]);
    for (let i = 1; i < picked.length - 1; i++) {
        if (px(nums[i]) - lastPx < each) continue;
        kept.push(picked[i]);
        lastPx = px(nums[i]);
    }
    const endPx = px(nums[nums.length - 1]);
    while (kept.length > 1 && endPx - px(at(kept[kept.length - 1])) < each) kept.pop();
    kept.push(picked[picked.length - 1]);
    return kept;
}

/** How wide a tick label on this axis reads, in characters. */
function tickLabelChars(ax: any): number {
    const fmt = typeof ax.tickformat === 'string' ? ax.tickformat : '';
    if (fmt.includes('%')) {
        if (/%d/.test(fmt) || /%b/.test(fmt)) return fmt.replace(/%./g, 'xxx').length;
        return 4;
    }
    if (Array.isArray(ax.ticktext) && ax.ticktext.length) {
        return Math.max(...ax.ticktext.map((t: any) => String(t).length));
    }
    return ax.type === 'date' ? 4 : 5;
}

/**
 * The unit the measure carries, written onto the ticks.
 *
 * Plotly states where a suffix appears with `showticksuffix` — all, first or
 * last — which is the same vocabulary the house uses. Only `firstAndLast` has
 * no counterpart, and it is approximated with every tick.
 */
function applyUnits(figure: any, d: DesignDecisions, say: ReportDeparture): void {
    const layout = figure.layout;
    // An axis showing a normalized stack plots a share, not the measure, so the
    // measure's unit would be a lie on it. The template has already written the
    // right suffix there.
    const normalized = new Set<string>();
    for (const t of figure.data ?? []) {
        if (t?.groupnorm === 'percent') normalized.add((t.yaxis ?? 'y').replace('y', 'yaxis'));
    }
    for (const ch of ['x', 'y'] as const) {
        const unit = d.axes[ch]?.unit;
        if (!unit || unit.where === 'never' || !unit.text) continue;
        const prefix = /^[$£€¥]$/.test(unit.text);
        const where = unit.where === 'firstTick' ? 'first'
            : unit.where === 'lastTick' ? 'last'
                : 'all';
        for (const key of axisKeys(layout, ch)) {
            const ax = layout[key];
            if (ax.type === 'category') continue;
            if (normalized.has(key)) {
                say('axes.unit', 'unit-not-drawn', `${key} shows a share of the whole — the measure's unit left off`);
                continue;
            }
            if (prefix) {
                ax.tickprefix = unit.text;
                ax.showtickprefix = where;
            } else {
                // A word set flush against the number reads as one token —
                // "400ppm". A symbol does not: "50%" is right and "50 %" is
                // not. So the space goes in for words and stays out for signs.
                ax.ticksuffix = /^[A-Za-z]/.test(unit.text) ? ` ${unit.text}` : unit.text;
                ax.showticksuffix = where;
            }
        }
        if (unit.where === 'firstAndLast') {
            say('annotation.unit', 'unit-placement-fallback', 'unit written on every tick — Plotly states first, last or all, not both ends');
        }
    }
}

/** Which ticks carry a label: the values the data holds, thinned or cut to the ends. */
function applyTickLabels(figure: any, d: DesignDecisions, table: any[]): void {
    const layout = figure.layout;
    for (const ch of ['x', 'y'] as const) {
        const a = d.axes[ch];
        if (!a?.tickLabels || a.tickLabels === 'all') continue;
        const field = ch === 'x' ? d.bound.categoryField : undefined;
        for (const key of axisKeys(layout, ch)) {
            const ax = layout[key];
            // A category axis already labels exactly what it holds, and Plotly
            // reads `tickvals` there as *positions*, not as names — stating a
            // year on one collapses the whole scale onto the first band.
            if (ax.type === 'category') continue;
            const values = observedValues(ax, table, field);
            if (!values.length) continue;
            let picked = thin(values, a.tickLabels, key);
            if (!picked?.length) continue;
            if (ax.type === 'date' && !ax.tickformat) {
                ax.tickformat = dateFormatFor(picked);
                ax.tickangle = 0;
            }
            if (ch === 'x') picked = fitTicksToBand(figure, ax, picked, a.label.fontSize ?? 11);
            ax.tickmode = 'array';
            ax.tickvals = picked;
        }
    }
}

/** The span the ticks cover decides how much of a date needs writing. */
function dateFormatFor(values: any[]): string {
    const times = values.map((v) => new Date(v).getTime()).filter((n) => Number.isFinite(n));
    if (times.length < 2) return '%Y';
    const days = (Math.max(...times) - Math.min(...times)) / 86_400_000;
    // What matters is not the span but the *step*: eight ticks across three
    // years written as years print "2020 2020 2021 2021" — the same label
    // twice, which reads as a mistake.
    const step = days / (times.length - 1);
    if (days > 900 && step > 300) return '%Y';
    if (days > 60 && step > 20) return '%b %Y';
    return '%d %b';
}

/** The values this axis actually holds, in order. */
function observedValues(ax: any, table: any[], field: string | undefined): any[] {
    if (Array.isArray(ax?.categoryarray)) return ax.categoryarray;
    if (Array.isArray(ax?.tickvals)) return ax.tickvals;
    if (field) {
        const seen = new Set<any>();
        for (const row of table) if (row?.[field] != null) seen.add(row[field]);
        return [...seen];
    }
    return [];
}

/**
 * Thin a run of observed values to what the axis can label.
 *
 * The last value is always kept — it is the reading the chart ends on — and
 * the one before it is dropped where the two would collide.
 */
function thin(values: any[], mode: string, key: string): any[] | null {
    if (values.length < 2) return values;
    if (mode === 'endpoints') return [values[0], values[values.length - 1]];
    if (mode === 'observed') return values;
    if (mode !== 'sparse') return null;

    const span = key.startsWith('x') ? 6 : 5;
    const step = Math.max(1, Math.ceil(values.length / span));
    const picked = values.filter((_, i) => i % step === 0);
    const last = values[values.length - 1];
    if (picked[picked.length - 1] !== last) {
        // Two ticks a fraction of a step apart print on top of each other.
        const lastIndex = values.indexOf(picked[picked.length - 1]);
        // Two ticks less than a step apart print on top of each other; the
        // last value is the one that has to be named, so the other goes.
        if (values.length - 1 - lastIndex < step) picked.pop();
        picked.push(last);
    }
    return picked;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/** VL states a point's *area* in px²; Plotly states its diameter in px. */
function diameterOf(area: number): number {
    return Math.max(2, Math.round(2 * Math.sqrt(area / Math.PI)));
}

/** Keep Plotly's default in step with the Vega-Lite countability heuristic. */
const MAX_DOTTED_READINGS = 12;

/**
 * How wide a dot on a line may be, or 0 when it should not be drawn.
 *
 * A dot on a line is not a mark in its own right — it is a reading aid that
 * says "a value was measured here". Two things bound it. It must not outweigh
 * the line it sits on, so it is capped against the stroke; and it must not
 * touch its neighbours, so it is capped against the gap between points. Where
 * the points are packed tighter than a dot is wide, the aid has become a
 * smear and is better left off.
 */
function dotDiameter(trace: any, figure: any, wanted: number, strokeWidth: number): number {
    const xValues: any[] = Array.isArray(trace.x) ? trace.x : [];
    const layout = figure.layout ?? {};
    const xRef = String(trace.xaxis ?? 'x');
    const axis = layout[xRef === 'x' ? 'xaxis' : `xaxis${xRef.slice(1)}`] ?? layout.xaxis ?? {};
    const renderableX = (value: any): boolean => {
        if (value == null) return false;
        if (axis.type === 'category') return true;
        return Number.isFinite(axis.type === 'date' ? Date.parse(String(value)) : Number(value));
    };
    const observedIndices = xValues
        .map((_value, index) => index)
        .filter(index =>
            renderableX(xValues[index])
            && (!Array.isArray(trace.y) || trace.y[index] != null));
    if (observedIndices.length < 2) return wanted;
    if (observedIndices.length > MAX_DOTTED_READINGS) return 0;
    const figurePlotW = Math.max(
        40,
        (Number(layout.width) || 400) - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0),
    );
    const domain = Array.isArray(axis.domain) ? axis.domain : [0, 1];
    const rawDomainSpan = Math.abs(Number(domain[1]) - Number(domain[0]));
    const plotW = figurePlotW * (Number.isFinite(rawDomainSpan) && rawDomainSpan > 0 ? rawDomainSpan : 1);

    let relativeGap: number;
    if (axis.type === 'category') {
        const gaps = observedIndices.slice(1).map((index, i) => index - observedIndices[i]);
        relativeGap = Math.min(...gaps) / Math.max(1, xValues.length - 1);
    } else {
        const positions = observedIndices.map(index => {
            const value = xValues[index];
            return axis.type === 'date' ? Date.parse(String(value)) : Number(value);
        });
        if (positions.every(Number.isFinite)) {
            positions.sort((a, b) => a - b);
            const span = positions[positions.length - 1] - positions[0];
            const gaps = positions.slice(1).map((value, i) => value - positions[i]);
            relativeGap = span > 0 ? Math.min(...gaps) / span : 0;
        } else {
            relativeGap = 1 / (observedIndices.length - 1);
        }
    }

    const spacing = plotW * relativeGap;
    if (spacing < 6) return 0;
    return Math.max(2, Math.round(Math.min(wanted, strokeWidth * 3.5, spacing * 0.55)));
}

/** One bar's drawn width: its band less the gap, shared among the bars grouped in it. */
function drawnBarWidth(figure: any, bars: any[]): number {
    if (!bars.length) return Infinity;
    const layout = figure.layout ?? {};
    const horizontal = bars[0].orientation === 'h';
    const ax = layout[horizontal ? 'yaxis' : 'xaxis'] ?? {};
    const bands = Array.isArray(ax.categoryarray) && ax.categoryarray.length
        ? ax.categoryarray.length
        : new Set(bars.flatMap((t: any) => t[horizontal ? 'y' : 'x'] ?? []).map(String)).size;
    const margin = layout.margin ?? {};
    const span = horizontal
        ? (Number(layout.height) || 300) - (margin.t ?? 0) - (margin.b ?? 0)
        : (Number(layout.width) || 400) - (margin.l ?? 0) - (margin.r ?? 0);
    const domain = Array.isArray(ax.domain) && ax.domain.length === 2 ? Math.abs(ax.domain[1] - ax.domain[0]) : 1;
    const grouped = (layout.barmode ?? 'group') === 'group'
        ? bars.filter((t: any) => (t.xaxis ?? 'x') === (bars[0].xaxis ?? 'x')).length
        : 1;
    return span * domain / Math.max(1, bands) * (1 - (layout.bargap ?? 0.2))
        / Math.max(1, grouped) * (grouped > 1 ? 1 - (layout.bargroupgap ?? 0) : 1);
}

/** Plotly's marker symbols for the house's glyphs. */
const PLOTLY_POINT_SHAPE: Record<PointShape, string> = {
    circle: 'circle', square: 'square', diamond: 'diamond', triangle: 'triangle-up', cross: 'cross',
};

function applyMarks(figure: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    const layout = figure.layout;
    const m = d.marks;

    // Band occupancy is one number for the whole figure: Plotly sizes bars by
    // the gap left between them, not by a mark width.
    // A trace another trace fills down to is the floor of a band, not a line
    // of its own.
    const traces: any[] = figure.data ?? [];
    const floors = new Set<number>();
    traces.forEach((t, i) => { if (t?.fill === 'tonexty' && i > 0) floors.add(i - 1); });

    const bars = traces.filter((t: any) => markFamilies(t).includes('bar'));
    if (bars.length) {
        layout.bargap = Math.max(0, Math.min(0.9, 1 - m.bandFraction));
        if (layout.barmode === 'group' && bars.length > 1) {
            // The house's group rule (G1): the space between groups as Plotly's bargap, the gap
            // between bars as its bargroupgap — each a share of what it divides, as in Vega-Lite.
            const group = groupPadding(m.group, m.bandFraction, bars.length);
            layout.bargap = group.inner;
            layout.bargroupgap = group.lane;
        }
    }
    const barWidth = drawnBarWidth(figure, bars);
    let saidThinOutline = false;

    for (const [index, trace] of traces.entries()) {
        if (CHROME_TRACES.has(String(trace?.type))) continue;
        // Furniture keeps the weight `applyFurnitureTraces` gave it.
        if (isContextTrace(trace) || isReferenceTrace(trace)) continue;
        if (isLegendProxy(trace)) continue;
        let fams = markFamilies(trace);
        const filled = fams.includes('area')
            || (trace.fill != null && trace.fill !== 'none')
            || floors.has(index);
        let preventThemePoints = figure._suppressLinePoints === true;

        if (fams.includes('line') && fams.includes('point') && !filled
            && (preventThemePoints || figure._themeDefaultLinePoints === true)) {
            const secondaryArea = m.point?.secondarySize ?? Math.min(m.point?.size ?? 40, 25);
            const dot = dotDiameter(trace, figure, diameterOf(secondaryArea), m.strokeWidth ?? 2);
            if (preventThemePoints || dot === 0) {
                trace.mode = String(trace.mode ?? 'lines')
                    .split('+')
                    .filter((part: string) => part !== 'markers')
                    .join('+') || 'lines';
                fams = markFamilies(trace);
                preventThemePoints = true;
                if (dot === 0) {
                    say('marks.point.show', 'dots-stand-down', 'theme-default dots left off — the line is too dense');
                }
            } else {
                trace.marker = { ...(trace.marker ?? {}), size: dot };
            }
        }

        if (fams.includes('bar') || fams.includes('arc')) {
            if (m.outline && !isContextTrace(trace)) {
                if (trace.type === 'bar' && barWidth < 2 * m.outline.width) {
                    if (!saidThinOutline) {
                        say('marks.outline', 'outline-not-applied',
                            `bars are ${barWidth.toFixed(1)}px — too thin to hold a ${m.outline.width}px outline, which would paint over them; left unbordered`);
                        saidThinOutline = true;
                    }
                } else {
                    trace.marker = {
                        ...(trace.marker ?? {}),
                        line: { color: m.outline.color, width: m.outline.width },
                    };
                }
            }
            if (m.cornerRadius != null && trace.type === 'bar' && trace.marker?.cornerradius == null) {
                trace.marker = { ...(trace.marker ?? {}), cornerradius: m.cornerRadius };
            }
        }

        if (fams.includes('arc') && m.slice) {
            // A wedge gap is drawn as a stroke in the surface colour: Plotly has
            // no gap between slices.
            trace.marker = {
                ...(trace.marker ?? {}),
                line: { color: m.slice.color || d.surface.canvas, width: m.slice.gap },
            };
        }

        if (fams.includes('rect') && m.tile) {
            trace.xgap = m.tile.gap;
            trace.ygap = m.tile.gap;
        }

        if (fams.includes('line')) {
            const areaEdge = trace.type === 'scatter' && fams.includes('area');
            const radarEdge = trace.type === 'scatterpolar' && fams.includes('area');
            // A house that states its area edge (M1) gets that width; otherwise a hairline.
            const width = areaEdge
                ? m.areaEdge?.width ?? Math.min(1, m.strokeWidth)
                : radarEdge ? Math.min(2.5, m.strokeWidth) : m.strokeWidth;
            trace.line = { ...(trace.line ?? {}), width };
            // Only a shape the chart left unset: a template sets one when the chart asked for a curve,
            // `linear` included, and that choice outranks the house's.
            if (m.interpolate && !trace._preserveLineShape && !trace.line.shape) {
                const shape = plotlyLineShape(m.interpolate);
                if (shape) trace.line.shape = shape;
                else say('marks.line.interpolate', 'interpolate-unsupported', `\`${m.interpolate}\` has no Plotly line shape — left straight`);
            }
        }

        // A bar's own opacity (M2), on the fill only.
        if (trace.type === 'bar' && m.barOpacity != null) {
            trace.marker = { ...(trace.marker ?? {}), opacity: m.barOpacity };
        }

        if (fams.includes('area') && m.fillOpacity != null && trace.fillcolor == null) {
            trace.opacity = m.fillOpacity;
        }

        if (fams.includes('point')) {
            const secondary = trace?._markerRole === 'secondary';
            const size = secondary ? m.point?.secondarySize : m.point?.size;
            if (size != null && (secondary || trace.marker?.size == null)) {
                trace.marker = { ...(trace.marker ?? {}), size: diameterOf(size) };
            }
            // A shape the trace already carries is the chart's own encoding, and stands.
            if (m.point?.shape && trace.marker?.symbol == null) {
                trace.marker = { ...(trace.marker ?? {}), symbol: PLOTLY_POINT_SHAPE[m.point.shape] };
            }
            if (m.point?.opacity != null && trace.marker?.opacity == null) {
                trace.marker = { ...(trace.marker ?? {}), opacity: m.point.opacity };
            }
            if (m.point?.haloColor && m.point.haloWidth) {
                trace.marker = {
                    ...(trace.marker ?? {}),
                    line: { color: m.point.haloColor, width: m.point.haloWidth },
                };
            } else if (m.outline && !isContextTrace(trace) && trace.type !== 'bar') {
                // A house that outlines every filled shape outlines its dots too, as Vega-Lite does.
                trace.marker = {
                    ...(trace.marker ?? {}),
                    line: { color: m.outline.color, width: m.outline.width },
                };
            }
        }

        if (fams.includes('boxplot') && m.summary) {
            if (m.summary.fill === false) trace.fillcolor = 'rgba(0,0,0,0)';
            if (m.summary.widthFraction != null) trace.width = undefined;
        }

        // A house that dots its lines says so through the chart's own options
        // where the template offers one; where it does not, the dots are added
        // here.
        // A filled band has no line to dot — its edge is the top of an area,
        // and dotting it reads as data points that are not there.
        if (m.point?.show && fams.includes('line') && !fams.includes('point')
            && !filled && !preventThemePoints) {
            const secondaryArea = m.point.secondarySize ?? Math.min(m.point.size ?? 40, 25);
            const dot = dotDiameter(trace, figure, diameterOf(secondaryArea), m.strokeWidth ?? 2);
            if (dot > 0) {
                trace.mode = String(trace.mode ?? 'lines').includes('markers')
                    ? trace.mode
                    : `${trace.mode ?? 'lines'}+markers`;
                trace.marker = {
                    ...(trace.marker ?? {}), size: dot,
                    ...(m.point.shape && trace.marker?.symbol == null ? { symbol: PLOTLY_POINT_SHAPE[m.point.shape] } : {}),
                };
            } else {
                say('marks.point.show', 'dots-stand-down', 'dots left off — the points sit closer together than a dot is wide');
            }
        }
    }

    // A sized mark's range. `marker.size` has already been mapped to pixel
    // diameters by the template, so the house's range is imposed by rescaling
    // those diameters — going through `sizeref` instead would treat drawn
    // pixels as data and flatten the differences under its square root.
    if (m.sizeRange) {
        const [lo, hi] = m.sizeRange;
        const floor = m.minSize != null ? Math.max(lo, m.minSize) : lo;
        // A bubble the house has scaled down to two pixels is a speck: it is neither a readable value
        // nor visibly a mark. Four pixels is the floor at which a dot still reads as one.
        const MIN_DIAMETER = 4;
        const sized = (figure.data ?? []).filter((trace: any) => Array.isArray(trace?.marker?.size));
        // One scale over every trace, as Vega-Lite's size scale is one scale over the field: from zero
        // to the largest value, onto the house's areas. Scaled trace by trace, each series' largest
        // value would draw at the largest area, whatever it is.
        const raw = sized.every((trace: any) => Array.isArray(trace._sizeValues));
        if (raw) {
            const top = Math.max(0, ...sized.flatMap((trace: any) => trace._sizeValues.filter((v: number) => Number.isFinite(v))));
            for (const trace of sized) {
                trace.marker.size = trace._sizeValues.map((v: number) => {
                    if (!Number.isFinite(v) || !(top > 0)) return Math.max(MIN_DIAMETER, diameterOf(floor));
                    return Math.max(MIN_DIAMETER, diameterOf(floor + Math.max(0, v) / top * (hi - floor)));
                });
            }
        } else {
            const areaOf = (dm: any) => Math.PI * (Number(dm) / 2) ** 2;
            const finite = sized.flatMap((trace: any) => trace.marker.size.map(areaOf)).filter((a: number) => Number.isFinite(a) && a > 0);
            if (finite.length) {
                const min = Math.min(...finite);
                const max = Math.max(...finite);
                for (const trace of sized) {
                    trace.marker.size = trace.marker.size.map((dm: any) => {
                        const a = areaOf(dm);
                        if (!Number.isFinite(a)) return Math.max(MIN_DIAMETER, diameterOf(floor));
                        const t = max > min ? (a - min) / (max - min) : 1;
                        return Math.max(MIN_DIAMETER, diameterOf(floor + t * (hi - floor)));
                    });
                }
            }
        }
    }

    void table;
}

function plotlyLineShape(interpolate: string): string | undefined {
    switch (interpolate) {
        case 'monotone':
        case 'basis':
        case 'cardinal':
        case 'catmull-rom':
        case 'natural':
            return 'spline';
        case 'step':
        case 'step-after':
            return 'hv';
        case 'step-before':
            return 'vh';
        case 'linear':
            return 'linear';
        default:
            return undefined;
    }
}

// ---------------------------------------------------------------------------
// Series ink
// ---------------------------------------------------------------------------

/**
 * Repaint what the template painted.
 *
 * The template chose its colours from Flint's own palette against a white page.
 * Everything the house has an opinion about is re-stated here; a trace that
 * carries per-point colours (a status waterfall, a colour-mapped scatter) is
 * re-stated value by value.
 */
/**
 * Paint the direction blocks of a waterfall, candlestick or OHLC trace.
 *
 * Where the house names no status inks the template's colours stand: an
 * arbitrary indexed ink on "down" would say the wrong thing.
 */
function paintDirectional(trace: any, d: DesignDecisions): void {
    const status = d.series.status;
    let positive = status?.positive;
    let negative = status?.negative;
    let neutral = status?.neutral;

    if (!positive && !negative && !neutral) {
        // A candlestick's red and green are a convention its readers rely on,
        // so without status inks it is left alone. A waterfall's up and down
        // are only contributions, and can take the indexed set.
        if (trace.type !== 'waterfall') {
            return;
        }
        const inks = d.series.categorical ?? [];
        if (!inks.length) return;
        positive = inks[0];
        negative = inks[1] ?? inks[0];
        neutral = mixHex(d.text.primary, d.surface.plot ?? d.surface.canvas, 0.45);
    }

    const blocks: Array<[string, string | undefined]> = [
        ['increasing', positive],
        ['decreasing', negative ?? positive],
        ['totals', neutral ?? positive],
    ];
    for (const [key, ink] of blocks) {
        const block = trace[key];
        if (!block || !ink) continue;
        if (block.marker) block.marker = { ...block.marker, color: ink };
        else if (block.line) block.line = { ...block.line, color: ink };
        else trace[key] = { ...block, marker: { color: ink } };
        if (block.fillcolor != null) block.fillcolor = ink;
    }
}

function applySeriesInk(figure: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    const s = d.series;
    const traces = dataTraces(figure);
    if (!traces.length) return;

    // A pie is one Plotly trace with one label/value pair per slice. When the
    // house has an overflow ink, match Vega-Lite's part-to-whole policy: the
    // largest K shares keep the indexed colours and the remaining shares sum
    // into one explicit Others slice. Cycling the palette would make unrelated
    // wedges look identical while still pretending they were distinguishable.
    const foldedPies = new Set<any>();
    if (s.overflowTail && s.overflow && s.categorical.length) {
        for (const trace of traces) {
            if (trace?.type !== 'pie' || !Array.isArray(trace.labels) || !Array.isArray(trace.values)) continue;
            const count = Math.min(trace.labels.length, trace.values.length);
            const keep = s.categorical.length;
            if (count <= keep) continue;
            const ranked = Array.from({ length: count }, (_, i) => ({
                i,
                label: trace.labels[i],
                value: Number(trace.values[i]) || 0,
            })).sort((a, b) => (Math.abs(b.value) - Math.abs(a.value)) || (a.i - b.i));
            const head = ranked.slice(0, keep);
            const tail = ranked.slice(keep);
            // A tail of one keeps its own name, as the Vega-Lite fold does.
            const othersLabel = tail.length === 1 ? String(tail[0].label) : `Others (${tail.length})`;
            trace.labels = [...head.map((d) => d.label), othersLabel];
            trace.values = [...head.map((d) => d.value), tail.reduce((sum, d) => sum + d.value, 0)];
            trace.marker = {
                ...(trace.marker ?? {}),
                colors: [...s.categorical.slice(0, keep), s.overflow],
            };
            foldedPies.add(trace);
            say(
                'ink.series.categorical', 'colours-folded',
                `${count} series past ${keep} inks — the ${keep} largest keep a colour, the rest sum into one "${othersLabel}" slice`,
            );
        }
    }

    // Unlike pie slices, scatter categories must not be merged: each point is
    // still an observation. Keep the largest K categories distinct, paint the
    // tail with the overflow ink, and collapse only its legend entries.
    const pointOverflowInks = new Map<any, string>();
    let pointOverflowHandled = false;
    if (s.overflowTail && s.overflow && s.categorical.length) {
        const points = traces.filter((trace) => {
            const families = markFamilies(trace);
            return trace?.name
                && families.includes('point')
                && !families.includes('line')
                && !families.includes('area')
                && !Array.isArray(trace.marker?.color);
        });
        if (points.length > s.categorical.length) {
            const ranked = points
                .map((trace, index) => ({
                    trace,
                    index,
                    count: Math.max(trace.x?.length ?? 0, trace.y?.length ?? 0),
                }))
                .sort((a, b) => (b.count - a.count) || (a.index - b.index));
            const keep = s.categorical.length;
            ranked.slice(0, keep).forEach(({ trace }, index) => {
                pointOverflowInks.set(trace, s.categorical[index]);
                trace.showlegend = true;
            });
            const tail = ranked.slice(keep);
            for (const { trace } of tail) {
                pointOverflowInks.set(trace, s.overflow);
                trace.showlegend = false;
            }
            figure.data.push({
                type: 'scatter',
                mode: 'markers',
                name: tail.length === 1 ? String(tail[0].trace.name ?? 'Other') : `Others (${tail.length})`,
                x: [null],
                y: [null],
                marker: { color: s.overflow },
                hoverinfo: 'skip',
                showlegend: true,
                _themeRole: 'overflow-legend-proxy',
            });
            pointOverflowHandled = true;
            say(
                'ink.series.categorical', 'series-overflow-ink',
                `${points.length} point categories past ${keep} inks — observations stay separate while the legend tail shares one "Others (${tail.length})" ink`,
            );
        }
    }

    if (s.exhausted && !pointOverflowHandled) {
        say('ink.series', 'palette-exhausted', 'more series than the house names inks for — template palette kept');
        return;
    }

    // A continuous colour channel: the ramp goes on the colorscale, not on a
    // per-trace colour.
    const ramped = traces.filter((t) => t.colorscale != null || t.marker?.colorscale != null);
    if (ramped.length && (s.mode === 'sequential' || s.mode === 'diverging' || s.ramp)) {
        const stops = s.range ?? s.ramp?.stops;
        if (stops?.length) {
            const scale = stops.map((c, i) => [stops.length === 1 ? 0 : i / (stops.length - 1), c] as [number, string]);
            for (const t of ramped) {
                if (t.colorscale != null) t.colorscale = scale;
                if (t.marker?.colorscale != null) t.marker.colorscale = scale;
            }
        }
    }

    // Per-series inks. One trace per series is the common Plotly shape; a
    // single trace with an array of colours (a bar chart coloured by category)
    // is the other.
    const inks = s.mode === 'single' ? [s.single] : s.categorical;
    if (!inks?.length) return;

    const recoloured = new Map<string, string>();
    let seriesIndex = 0;
    const bound = (name: unknown): string | undefined =>
        (s.byValue && name != null ? s.byValue[String(name).trim().toLowerCase()] : undefined);
    for (const trace of traces) {
        if (trace.colorscale != null || trace.marker?.colorscale != null) continue;
        const overflowInk = pointOverflowInks.get(trace);
        if (overflowInk) {
            trace.marker = { ...(trace.marker ?? {}), color: overflowInk };
            continue;
        }
        const fams = markFamilies(trace);

        // A pie states one colour per slice on `marker.colors` — the whole
        // series lives in one trace.
        if (Array.isArray(trace.marker?.colors)) {
            if (foldedPies.has(trace)) continue;
            let next = 0;
            trace.marker.colors = (trace.marker.colors as any[]).map(
                (c: any, i: number) => (isLiteralColor(c) ? bound(trace.labels?.[i]) ?? inks[(s.byValue ? next++ : i) % inks.length] : c),
            );
            continue;
        }

        // A waterfall or a candlestick states its colours by *direction*, in
        // `increasing`/`decreasing`/`totals` blocks. Direction is not a series,
        // so the categorical set says nothing about it — the house's status
        // inks do.
        if (trace.increasing || trace.decreasing || trace.totals) {
            paintDirectional(trace, d);
            continue;
        }

        const perPoint = Array.isArray(trace.marker?.color)
            ? (trace.marker.color as unknown[]).filter(isLiteralColor)
            : null;
        if (perPoint && perPoint.length) {
            // One trace, many colours: keep the mapping the template made, but
            // restate each distinct colour in the house's set, in the order the
            // template introduced them.
            const seen = new Map<string, string>();
            trace.marker.color = (trace.marker.color as any[]).map((c: any) => {
                if (!isLiteralColor(c)) return c;
                if (!seen.has(c)) seen.set(c, inks[seen.size % inks.length]);
                return seen.get(c);
            });
            continue;
        }

        // The wedge between funnel stages is furniture, not data: it takes a
        // quiet mix of the surface and the text, like a grid line would.
        if (trace.connector) {
            const quiet = mixHex(d.surface.plot ?? d.surface.canvas, d.text.primary, 0.25);
            if (trace.connector.fillcolor != null) trace.connector.fillcolor = quiet;
            if (trace.connector.line) trace.connector.line = { ...trace.connector.line, color: quiet };
        }

        const declaredIndex = Number(trace?._seriesIndex);
        const inkIndex = Number.isInteger(declaredIndex) && declaredIndex >= 0
            ? declaredIndex
            : seriesIndex;
        const ink = bound(trace.name) ?? inks[inkIndex % inks.length];
        const was = trace.line?.color ?? trace.marker?.color;
        if (typeof was === 'string' && isLiteralColor(was)) recoloured.set(was.toLowerCase(), ink);
        if (fams.includes('bar') || fams.includes('arc') || fams.includes('boxplot')) {
            trace.marker = { ...(trace.marker ?? {}), color: ink };
            if (trace.type === 'violin' || trace.type === 'box') trace.line = { ...(trace.line ?? {}), color: ink };
        }
        if (fams.includes('line')) {
            trace.line = { ...(trace.line ?? {}), color: ink };
        }
        if (fams.includes('point')) {
            trace.marker = { ...(trace.marker ?? {}), color: ink };
        }
        if (fams.includes('area')) {
            // Bands in a stack sit side by side, not on top of one another, so
            // there is nothing behind them to see; translucency there only
            // muddies two colours into a third the house never chose.
            const alpha = trace.type === 'scatterpolar' && trace.fill === 'toself'
                ? Math.min(0.16, d.marks.fillOpacity ?? 0.16)
                : trace.stackgroup != null ? 1 : d.marks.fillOpacity ?? 0.8;
            trace.fillcolor = withAlpha(ink, alpha);
        }
        seriesIndex++;
    }

    // Plotly's built-in label+percent formatter always stacks the two lines.
    // Re-evaluate after overflow folding, because that pass can replace both
    // labels and values (including a newly named Others slice).
    for (const trace of traces) {
        const parts = typeof trace?.textinfo === 'string' ? trace.textinfo.split('+') : [];
        if (trace?.type !== 'pie'
            || !Array.isArray(trace.labels)
            || !parts.includes('label')
            || !parts.includes('percent')) continue;
        trace.texttemplate = pieCategoryPercentTemplates(
            trace.labels,
            Number(figure.layout?.width) || Number(figure._width) || 400,
            d.dataLabels.text.fontSize ?? 11,
        );
    }

    restateSeriesAnnotations(figure, recoloured);

    void table;
    void distinctCount;
}

/**
 * An annotation printed in a series' colour — the number at the end of a
 * sparkline row — is naming that series. When the series changes ink, so does
 * the annotation, or the row says one thing in two colours.
 */
function restateSeriesAnnotations(figure: any, recoloured: Map<string, string>): void {
    if (!recoloured.size) return;
    for (const note of figure.layout?.annotations ?? []) {
        const colour = note?.font?.color;
        if (typeof colour !== 'string') continue;
        const ink = recoloured.get(colour.toLowerCase());
        if (!ink || ink.toLowerCase() === colour.toLowerCase()) continue;
        note.font = { ...note.font, color: ink };
    }
}

function withAlpha(hex: string, alpha: number): string {
    const c = parseColor(hex);
    if (!c) return hex;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const LEGEND_ANCHORS: Record<string, { x: number; y: number; xanchor: string; yanchor: string; orientation: 'h' | 'v' }> = {
    top: { x: 0, y: 1.12, xanchor: 'left', yanchor: 'bottom', orientation: 'h' },
    bottom: { x: 0, y: -0.2, xanchor: 'left', yanchor: 'top', orientation: 'h' },
    right: { x: 1.02, y: 1, xanchor: 'left', yanchor: 'top', orientation: 'v' },
    left: { x: -0.2, y: 1, xanchor: 'right', yanchor: 'top', orientation: 'v' },
    'top-left': { x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top', orientation: 'v' },
    'top-right': { x: 0.98, y: 0.98, xanchor: 'right', yanchor: 'top', orientation: 'v' },
    'bottom-left': { x: 0.02, y: 0.02, xanchor: 'left', yanchor: 'bottom', orientation: 'v' },
    'bottom-right': { x: 0.98, y: 0.02, xanchor: 'right', yanchor: 'bottom', orientation: 'v' },
};

function addWaterfallLegendProxies(figure: any): void {
    if ((figure.data ?? []).some((trace: any) => trace?._themeRole === 'waterfall-legend-proxy')) return;
    const waterfall = (figure.data ?? []).find((trace: any) => trace?.type === 'waterfall');
    if (!waterfall) return;
    const roles = [
        ['Total', waterfall.totals?.marker?.color],
        ['Increase', waterfall.increasing?.marker?.color],
        ['Decrease', waterfall.decreasing?.marker?.color],
    ];
    for (const [name, color] of roles) {
        if (!color) continue;
        figure.data.push({
            type: 'scatter',
            mode: 'markers',
            name,
            x: [null],
            y: [null],
            marker: { color, symbol: 'square', size: 9 },
            hoverinfo: 'skip',
            showlegend: true,
            _themeRole: 'waterfall-legend-proxy',
        });
    }
}

function addFactoredLineLegendProxies(figure: any, d: DesignDecisions): void {
    const traces = (figure.data ?? []).filter((trace: any) =>
        trace?._colorLegendValue && trace?._dashLegendValue
            && trace?._themeRole !== 'factored-line-legend-proxy');
    const colors = new Map<string, string>();
    const dashes = new Map<string, string>();
    for (const trace of traces) {
        if (!colors.has(trace._colorLegendValue)) {
            colors.set(trace._colorLegendValue, trace.line?.color);
        }
        if (!dashes.has(trace._dashLegendValue)) {
            dashes.set(trace._dashLegendValue, trace.line?.dash ?? 'solid');
        }
    }
    for (const trace of traces) trace.showlegend = false;
    const existing = (figure.data ?? []).filter((trace: any) =>
        trace?._themeRole === 'factored-line-legend-proxy');
    if (existing.length) {
        for (const trace of existing) {
            if (trace._colorLegendValue && colors.has(trace._colorLegendValue)) {
                trace.line = { ...trace.line, color: colors.get(trace._colorLegendValue) };
            } else if (trace._dashLegendValue) {
                trace.line = { ...trace.line, color: d.text.secondary ?? d.text.primary };
            }
        }
        return;
    }
    if (colors.size < 2 || dashes.size < 2) return;
    const proxy = (name: string, color: string, dash: string) => ({
        type: 'scatter',
        mode: 'lines',
        name,
        x: [null],
        y: [null],
        line: { color, dash, width: 2.5 },
        hoverinfo: 'skip',
        showlegend: true,
        _themeRole: 'factored-line-legend-proxy',
    });
    for (const [name, color] of colors) {
        figure.data.push(proxy(name, color, 'solid'));
    }
    for (const [name, dash] of dashes) {
        figure.data.push(proxy(name, d.text.secondary ?? d.text.primary, dash));
    }
}

function applyLegend(figure: any, d: DesignDecisions, say: ReportDeparture): void {
    const layout = figure.layout;
    const l = d.legend;

    if (!l.show) {
        layout.showlegend = false;
        for (const trace of figure.data ?? []) {
            if (trace?.marker?.colorbar) trace.marker.showscale = false;
            if (trace?.colorbar) trace.showscale = false;
            if (trace?.showscale) trace.showscale = false;
        }
        return;
    }

    // Plotly draws each entry from its trace's own marker or line; it has no symbol of its own to set.
    if (l.swatch) say('legend.swatch', 'swatch-unsupported', `Plotly draws each key entry from its trace — the \`${l.swatch}\` swatch is not drawn`);

    addWaterfallLegendProxies(figure);
    addFactoredLineLegendProxies(figure, d);

    const visiblePies = (figure.data ?? []).filter((trace: any) =>
        trace?.type === 'pie' && trace?.visible !== false);
    const legendBearingTraces = (figure.data ?? []).filter((trace: any) =>
        trace?.visible !== false
        && trace?.showlegend !== false
        && (Array.isArray(trace?.labels) || trace?.name));
    const everyPieSliceNamed = visiblePies.length > 0
        && legendBearingTraces.every((trace: any) => trace?.type === 'pie')
        && visiblePies.every((trace: any) =>
            Array.isArray(trace.labels)
            && trace.labels.length > 0
            && trace.labels.every((label: any) => String(label).trim().length > 0)
            && typeof trace.textinfo === 'string'
            && trace.textinfo.split('+').includes('label'));
    if (everyPieSliceNamed) {
        layout.showlegend = false;
        say(
            'legend.show', 'legend-not-drawn',
            'legend omitted — every pie slice is already named on the chart, so a second copy would compete with its callout',
        );
        return;
    }

    // `seriesEnd` names each series at the end of its own line. Realized as
    // annotations where there is a line to end; otherwise the house's own
    // fallback is taken rather than a placement invented here.
    let placement: string = l.placement;
    if (placement === 'seriesEnd') {
        if (labelSeriesEnds(figure, d)) {
            layout.showlegend = false;
            return;
        }
        placement = (l.fallbacks ?? []).find((p) => p !== 'seriesEnd') ?? 'right';
        say('legend.placement', 'legend-placement-fallback', `no series with an end to name — fell back to \`${placement}\``);
    }
    if (!LEGEND_ANCHORS[placement]) {
        const next = (l.fallbacks ?? []).find((p) => LEGEND_ANCHORS[p]) ?? 'right';
        say('legend.placement', 'legend-placement-fallback', `\`${placement}\` is not a Plotly placement — fell back to \`${next}\``);
        placement = next;
    }

    const anchor = LEGEND_ANCHORS[l.orient ?? placement] ?? LEGEND_ANCHORS[placement] ?? LEGEND_ANCHORS.right;
    layout.showlegend = true;
    layout.legend = {
        ...(layout.legend ?? {}),
        ...anchor,
        ...(l.direction ? { orientation: l.direction === 'horizontal' ? 'h' : 'v' } : {}),
        // Plotly turns a stacked chart's key upside down on its own, so a
        // likert row running "a great deal → none at all" gets a key that
        // reads "none at all → a great deal". The key names a scale, and a
        // scale has one order: the one the traces are in.
        traceorder: 'normal',
        font: fontOf(l.label, d.font),
        bgcolor: 'rgba(0,0,0,0)',
        borderwidth: 0,
        title: l.title ? keyTitle(layout.legend?.title, l.titleText, d.font) : { text: '' },
    };

    // A key to values is a colorbar, not a swatch list.
    for (const trace of figure.data ?? []) {
        const bar = trace?.marker?.colorbar ?? trace?.colorbar;
        if (!bar) continue;
        Object.assign(bar, {
            outlinewidth: 0,
            tickfont: fontOf(l.label, d.font),
            ...(l.gradientLength ? { len: l.gradientLength, lenmode: 'pixels' } : {}),
            title: l.title ? keyTitle(bar.title, l.titleText, d.font) : { text: '' },
        });
    }

    // A key above the plot is chrome the figure has to pay for, however it is stacked: it is measured
    // once the margins it wraps in are settled (see {@link layoutTopChrome}).
    if (layout.legend.y > 1) return;
    // A key beside the plot is paid for in width, for the same reason.
    if (layout.legend.orientation === 'v' && layout.legend.x >= 1) {
        const block = plKeyBlock(figure, 'vertical');
        if (block) {
            const margin = (layout.margin ??= {});
            const plotWidth = Math.max(1, (Number(layout.width) || 0) - (margin.l ?? 0) - (margin.r ?? 0) - (figure._legendRoom?.right ?? 0));
            // The key hangs `x` past the plot's right edge, its box and a gap after its text, clear of the canvas edge.
            const need = Math.ceil(plotWidth * (layout.legend.x - 1) + block.width + PLOTLY_PROFILE.key.gap + PLOTLY_PROFILE.edge);
            const before = margin.r ?? 0;
            // The width already held the room the frame kept for the key; the margin now holds the key itself.
            const held = figure._legendRoom?.right ?? 0;
            margin.r = Math.max(before, need);
            if (figure._legendRoom) figure._legendRoom = { ...figure._legendRoom, right: 0 };
            if (Number(layout.width)) layout.width = Math.round(layout.width + margin.r - before - held);
        }
    }

    // A column of keys taller than the plot is simply cut off at the bottom,
    // so the figure grows to hold it.
    if (layout.legend.orientation !== 'h') {
        const block = plKeyBlock(figure, 'vertical');
        const need = block ? block.height : 0;
        const have = (Number(layout.height) || 0) - (layout.margin?.t ?? 0) - (layout.margin?.b ?? 0);
        if (block && have > 0 && need > have) {
            layout.height = Math.round(Number(layout.height) + (need - have));
            say('legend.placement', 'legend-figure-grown', `the figure grew ${Math.round(need - have)}px to hold a column of ${block.rows} keys`);
        }
    }
}



/**
 * Where an annotation must sit to land on this value.
 *
 * A category axis is numbered from zero in the order the categories appear, so
 * an annotation naming one has to state its serial number.
 */
function categoryPosition(ax: any, value: any): any {
    if (ax?.type !== 'category') return value;
    const cats = Array.isArray(ax.categoryarray) ? ax.categoryarray : null;
    const i = cats ? cats.findIndex((c: any) => String(c) === String(value)) : -1;
    return i >= 0 ? i : value;
}

/**
 * Push a stack of end-of-line names apart so none sits on another.
 *
 * Series that finish close together would otherwise print their names on the
 * same few pixels. The names are nudged in data units — the annotation still
 * points at the line's real last value, it is only shifted enough to be read.
 */
function dodgeVertically(notes: any[], figure: any, fontSize: number, plotted: number[]): void {
    if (notes.length < 2) return;
    const layout = figure.layout;
    const values = notes.map((a) => Number(a.y)).filter((v) => Number.isFinite(v));
    if (values.length !== notes.length) return;

    // A text line is worth a share of the *axis*, not of the band the names
    // happen to fall in: measuring against the names alone under-counts the
    // gap several times over on a chart whose scale starts at zero.
    const ax = layout[(notes[0].yref ?? 'y').replace('y', 'yaxis')] ?? {};
    const all = plotted.filter((v) => Number.isFinite(v));
    let span: number;
    if (Array.isArray(ax.range) && ax.range.length === 2) span = Math.abs(Number(ax.range[1]) - Number(ax.range[0]));
    else if (all.length) span = Math.max(...all, ax.rangemode === 'tozero' ? 0 : -Infinity) - Math.min(...all, 0);
    else span = Math.max(...values) - Math.min(...values);
    if (!span || !Number.isFinite(span)) return;
    const plotH = Math.max(
        40,
        (Number(layout.height) || 300) - (layout.margin?.t ?? 0) - (layout.margin?.b ?? 0),
    );
    // The whole axis is taller than the band the names occupy, so this is a
    // conservative (over-)estimate of how many data units a text line is worth.
    const gap = (fontSize * 1.25 * span) / plotH;
    const order = notes.slice().sort((a, b) => a.y - b.y);
    for (let i = 1; i < order.length; i++) {
        const below = Number(order[i - 1].y);
        if (Number(order[i].y) - below < gap) order[i].y = below + gap;
    }
}

/**
 * Where each trace is actually *drawn*, in the coordinates the axis shows.
 *
 * A stacked trace is not drawn at its own value: Plotly lifts it onto the ones
 * before it in its `stackgroup`, and normalizes the whole group to 100 when the
 * first trace in that group says `groupnorm: 'percent'`. Reading a stacked
 * series' position off `t.y` therefore names a number the chart never plots —
 * and since an annotation takes part in the autorange, it drags the scale out
 * with it. Filled bands are named at their middle, bare lines at their top.
 */
function plottedPositions(traces: any[]): Map<any, number[]> {
    const out = new Map<any, number[]>();
    const groups = new Map<string, any[]>();
    for (const t of traces) {
        if (t.stackgroup == null) {
            out.set(t, (t.y ?? []).map((v: any) => Number(v)));
            continue;
        }
        const key = `${t.xaxis ?? 'x'}|${t.yaxis ?? 'y'}|${t.stackgroup}`;
        const bucket = groups.get(key);
        if (bucket) bucket.push(t);
        else groups.set(key, [t]);
    }
    for (const group of groups.values()) {
        const norm = group.some((t) => t.groupnorm === 'percent');
        const n = Math.max(0, ...group.map((t) => (t.y ?? []).length));
        const totals: number[] = [];
        for (let i = 0; i < n; i++) {
            totals[i] = group.reduce((sum, t) => sum + (Number(t.y?.[i]) || 0), 0);
        }
        const running = new Array<number>(n).fill(0);
        for (const t of group) {
            const banded = t.fill !== 'none' && markFamilies(t).includes('area');
            const at: number[] = [];
            for (let i = 0; i < n; i++) {
                const v = Number(t.y?.[i]) || 0;
                const point = banded ? running[i] + v / 2 : running[i] + v;
                running[i] += v;
                at[i] = norm ? (totals[i] ? (point / totals[i]) * 100 : 0) : point;
            }
            out.set(t, at);
        }
    }
    return out;
}

/**
 * Name each series at the end of its own line.
 *
 * Returns false where nothing on the chart has an end to name — a bar chart
 * has no last point — so the caller can take the house's next placement.
 */
function labelSeriesEnds(figure: any, d: DesignDecisions): boolean {
    let lines = dataTraces(figure).filter((t) => {
        const fams = markFamilies(t);
        return (fams.includes('line') || fams.includes('area')) && Array.isArray(t.x) && Array.isArray(t.y) && t.name;
    });
    const factored = lines.filter(t => t._colorLegendValue && t._dashLegendValue);
    if (factored.length) {
        const lastByColor = new Map<string, any>();
        const endpointRank = (trace: any): number => {
            const values = trace.x ?? [];
            let value: any;
            for (let i = values.length - 1; i >= 0; i--) {
                if (values[i] != null) { value = values[i]; break; }
            }
            const axisKey = String(trace.xaxis ?? 'x').replace('x', 'xaxis');
            const axis = figure.layout?.[axisKey];
            if (axis?.type === 'category') return categoryPosition(axis, value);
            if (axis?.type === 'date') return new Date(value).getTime();
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : values.length;
        };
        for (const trace of factored) {
            const prior = lastByColor.get(trace._colorLegendValue);
            if (!prior || endpointRank(trace) >= endpointRank(prior)) {
                lastByColor.set(trace._colorLegendValue, trace);
            }
        }
        lines = [
            ...lines.filter(t => !(t._colorLegendValue && t._dashLegendValue)),
            ...lastByColor.values(),
        ];
    }
    if (lines.length < 1) return false;

    const layout = figure.layout;
    const annotations = (layout.annotations ??= []);
    const drawnAt = plottedPositions(lines);
    const placed: any[] = [];
    for (const t of lines) {
        const n = t.x.length;
        if (!n) continue;
        const axisKey = (t.xaxis ?? 'x').replace('x', 'xaxis');
        const drawn = drawnAt.get(t) ?? [];
        placed.push({
            // On a category axis Plotly reads an annotation's `x` as the
            // category's *serial number*, not its name — naming the category
            // there pushes the annotation thousands of bands to the right and
            // drags the scale with it.
            x: categoryPosition(layout[axisKey], t.x[n - 1]),
            y: drawn[n - 1] ?? t.y[n - 1],
            xref: t.xaxis ?? 'x',
            yref: t.yaxis ?? 'y',
            text: styleText(String(t._colorLegendValue ?? t.name), d.legend.label),
            showarrow: false,
            xanchor: 'left',
            xshift: 6,
            font: {
                ...fontOf(d.legend.label, d.font),
                color: t.line?.color ?? t.marker?.color ?? d.legend.label.color,
            },
        });
    }
    const spanValues: number[] = [];
    for (const t of lines) for (const v of drawnAt.get(t) ?? []) if (Number.isFinite(v)) spanValues.push(v);
    dodgeVertically(placed, figure, d.legend.label.fontSize ?? 11, spanValues);
    annotations.push(...placed);

    // The names sit outside the plotting rectangle; make room for them.
    const longest = Math.max(...lines.map((t) => String(t._colorLegendValue ?? t.name).length));
    const pad = Math.ceil(longest * (d.legend.label.fontSize ?? 11) * 0.55) + 12;
    layout.margin = { ...(layout.margin ?? {}), r: Math.max(layout.margin?.r ?? 0, pad) };
    return true;
}

// ---------------------------------------------------------------------------
// Facet chrome
// ---------------------------------------------------------------------------

/**
 * Is this annotation a panel's name?
 *
 * Templates that emit a facet grid mark the header for us; the rest are
 * recognised by where they sit — pinned to the top of the paper, over a panel,
 * with no arrow. Getting this wrong only means a caption is typed as a header.
 */
function isFacetHeader(a: any): boolean {
    if (a?._role === 'facet-header') return true;
    return a?.xref === 'paper' && a?.yref === 'paper' && a?.showarrow === false
        && a?.xanchor === 'center' && a?.yanchor === 'top';
}

function applyFacetChrome(figure: any, d: DesignDecisions): void {
    const f = d.facets.header;
    for (const a of figure.layout?.annotations ?? []) {
        if (!isFacetHeader(a)) continue;
        if (!f.show) {
            a.text = '';
            continue;
        }
        a.font = { ...(a.font ?? {}), ...fontOf(f, d.font) };
        a.text = styleText(String(a.text ?? '').replace(/^.*?: /, f.fieldTitle ? '$&' : ''), f);
    }
}

// ---------------------------------------------------------------------------
// Data labels
// ---------------------------------------------------------------------------

/** Is there a key on this figure that already names the slices of a pie? */
function legendNamesSlices(figure: any, d: DesignDecisions): boolean {
    if (d.legend.placement === 'seriesEnd') return false;
    return figure?.layout?.showlegend !== false;
}

/**
 * Does this axis show unsigned labels for signed values?
 *
 * That is how a mirrored chart — a pyramid, a diverging bar — is built: one
 * side is negative and the axis relabels it. It is a fact about the compiled
 * chart, readable without knowing which chart type made it.
 */
function isMirroredAxis(ax: any): boolean {
    const vals = ax?.tickvals;
    const text = ax?.ticktext;
    if (!Array.isArray(vals) || !Array.isArray(text) || vals.length !== text.length) return false;
    return vals.some((v: any, i: number) => Number(v) < 0 && !String(text[i]).includes('-')
        && !String(text[i]).includes('\u2212'));
}

/**
 * Blank the labels of segments too thin to hold one.
 *
 * `texttemplate` takes an array, one entry per point, so a per-segment
 * decision is expressible. Returns how many were dropped.
 */
function blankSmallSegments(trace: any, figure: any, measure: 'x' | 'y', fontSize: number): number {
    const values = trace[measure];
    if (!Array.isArray(values)) return 0;
    const layout = figure.layout ?? {};
    const across = measure === 'y'
        ? (Number(layout.height) || 300) - (layout.margin?.t ?? 0) - (layout.margin?.b ?? 0)
        : (Number(layout.width) || 400) - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0);

    // The stack, not the trace, sets the scale: sum what every trace of the
    // same orientation contributes to each band.
    const totals: number[] = [];
    for (const t of figure.data ?? []) {
        const v = t?.[measure];
        if (!Array.isArray(v) || String(t.type ?? '') !== 'bar') continue;
        v.forEach((n: any, i: number) => {
            totals[i] = (totals[i] ?? 0) + Math.abs(Number(n) || 0);
        });
    }
    const span = Math.max(...totals.filter(Number.isFinite), 0);
    if (!span || !Number.isFinite(across) || across <= 0) return 0;

    const min = (span * fontSize * 1.8) / across;
    const template = String(trace.texttemplate);
    let dropped = 0;
    trace.texttemplate = values.map((v: any) => {
        if (Math.abs(Number(v) || 0) >= min) return template;
        dropped++;
        return '';
    });
    return dropped;
}

/** Trace families that can print a number on the mark. */
const LABELABLE = new Set(['bar', 'arc', 'point', 'line']);

function applyDataLabels(figure: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    const dl = d.dataLabels;
    if (!dl.show) return;

    const traces = dataTraces(figure).filter((t) => markFamilies(t).some((m) => LABELABLE.has(m)));
    if (!traces.length) {
        say('dataLabels.show', 'value-labels-not-drawn', 'nothing on this chart can carry a printed value');
        return;
    }

    const fmt = dl.format ? `:${dl.format}` : '';
    const unitText = dl.unit ?? '';
    // A currency sign leads the number; a word unit trails it after a space.
    const unitPrefix = /^[$£€¥]$/.test(unitText) ? unitText : '';
    const unit = unitPrefix ? ''
        : /^[A-Za-z]/.test(unitText) ? ` ${unitText}`
        : unitText;
    let printed = 0;

    for (const trace of traces) {
        const fams = markFamilies(trace);
        // A trace with no numbers in it has nothing to print. A legend proxy
        // — one empty bar standing in for a colour — is the usual case, and
        // labelling it writes NaN on the axis.
        if (!fams.includes('arc') && !numericChannel(trace)) continue;
        if (trace.text != null || trace.texttemplate != null || trace.textinfo != null) {
            // The template prints its own numbers. The theme may not change
            // *what* is written — that was the template's decision — but the
            // type it is written in is the house's.
            trace.textfont = { ...(trace.textfont ?? {}), ...fontOf(dl.text, d.font) };
            if (dl.inkMode === 'contrastWithMark' && trace.textfont) delete trace.textfont.color;
            // Except for one thing the template could not know: whether the
            // slice's name is also in a key. Printing it twice is what makes a
            // 5-per-cent wedge unreadable, and the second copy is in the
            // smaller, more crowded place.
            if (fams.includes('arc') && legendNamesSlices(figure, d)
                && typeof trace.textinfo === 'string' && /\blabel\b/.test(trace.textinfo)) {
                const rest = trace.textinfo.split('+').filter((part: string) => part !== 'label');
                if (rest.length) {
                    trace.textinfo = rest.join('+');
                    say('label.text', 'slice-names-not-drawn', 'slice names left to the key — printed on the wedge as well, they crowd it out');
                }
            }
            printed++;
            continue;
        }
        if (fams.includes('arc')) {
            trace.textinfo = 'value';
            trace.texttemplate = `${unitPrefix}%{value${fmt}}${unit}`;
            trace.textposition = dl.placement === 'outsideMark' ? 'outside' : 'inside';
            trace.textfont = fontOf(dl.text, d.font);
            if (dl.inkMode === 'contrastWithMark') delete trace.textfont.color;
            printed++;
            continue;
        }

        if (fams.includes('bar')) {
            const measure = trace.orientation === 'h' ? 'x' : (numericChannel(trace) ?? 'y');
            const normalized = figure.layout?.barnorm === 'percent';
            if (normalized) {
                const barTraces = dataTraces(figure).filter((t) =>
                    markFamilies(t).includes('bar')
                    && Array.isArray(t[measure])
                    && String(t[`${measure}axis`] ?? measure) === String(trace[`${measure}axis`] ?? measure)
                    && String(t.offsetgroup ?? '') === String(trace.offsetgroup ?? ''));
                const values = Array.isArray(trace[measure]) ? trace[measure] : [];
                trace.customdata = values.map((value: any, index: number) => {
                    const denominator = barTraces.reduce(
                        (sum, t) => sum + (Number(t[measure]?.[index]) || 0),
                        0,
                    );
                    return denominator ? (Number(value) || 0) / Math.abs(denominator) * 100 : null;
                });
                const percentMatch = dl.format?.match(/^\.(\d+)%$/);
                const normalizedFmt = percentMatch ? `:.${percentMatch[1]}f` : fmt;
                trace.texttemplate = `%{customdata${normalizedFmt}}%`;
            } else {
                trace.texttemplate = `${unitPrefix}%{${measure}${fmt}}${unit}`;
            }
            // Plotly places the label inside where it fits and outside where it
            // does not, which is exactly the geometry stage 2 computed with
            // `insideMinValue`. `auto` hands that decision to
            // the renderer, which can measure the drawn bar; `outside` is
            // honoured literally because it is a house habit, not a fit.
            // A segment of a stack has no outside — "outside" is the middle of
            // the neighbouring segment — so a label that will not fit inside is
            // dropped instead of moved, and it is never turned on its side.
            const stacked = /^(stack|relative)$/.test(String(figure.layout?.barmode ?? ''));
            // A population pyramid states one side of the split as negative
            // numbers and then hides the sign on the axis. The label has to
            // tell the same story the axis does.
            const axKey = measure === 'x'
                ? String(trace.xaxis ?? 'x').replace('x', 'xaxis')
                : String(trace.yaxis ?? 'y').replace('y', 'yaxis');
            const mirrored = isMirroredAxis(figure.layout?.[axKey]);
            if (mirrored) {
                const abs = (trace[measure] as any[]).map((v) => Math.abs(Number(v) || 0));
                const cd = trace.customdata;
                // The template may already be carrying the unsigned value for
                // its own tooltip; reuse it rather than trample it.
                const reusable = Array.isArray(cd) && cd.length === abs.length
                    && cd.every((v: any, i: number) => Number(v) === abs[i]);
                if (cd == null || reusable) {
                    if (cd == null) trace.customdata = abs;
                    trace.texttemplate = `${unitPrefix}%{customdata${fmt}}${unit}`;
                }
            }
            trace.textposition = stacked || mirrored
                ? 'inside'
                : dl.placement === 'outsideMark' ? 'outside' : 'auto';
            trace.textangle = 0;
            if (stacked) {
                trace.insidetextanchor = 'middle';
                trace.constraintext = 'both';
                // Left to itself Plotly shrinks a label until it fits its
                // segment, which puts three type sizes on one chart. A segment
                // too thin for the house's size loses its label instead.
                const dropped = blankSmallSegments(trace, figure, measure, dl.text.fontSize ?? 11);
                if (dropped) {
                    say(
                        'dataLabels.show', 'value-labels-hidden',
                        `${dropped} stacked segment(s) too thin to hold a label at the house's size`,
                    );
                }
                if (dl.placement === 'outsideMark') say('dataLabels.placement', 'value-labels-placement-changed', 'stacked segments keep their labels inside, or drop them');
            }
            trace.cliponaxis = false;
            trace.textfont = fontOf(dl.text, d.font);
            if (dl.inkMode === 'contrastWithMark') {
                // Plotly picks a contrasting ink itself when none is stated
                // *inside* the bar, and uses `outsidetextfont` beyond it.
                delete trace.textfont.color;
                trace.outsidetextfont = fontOf(dl.text, d.font);
            }
            printed++;
            continue;
        }

        if (fams.includes('point') || fams.includes('line')) {
            // A point series is usually measured up the page, but not always:
            // labelling a category with `%{y}` prints NaN.
            const measure = numericChannel(trace);
            if (!measure) continue;
            trace.mode = String(trace.mode ?? 'lines').includes('text')
                ? trace.mode
                : `${trace.mode ?? 'lines'}+text`;
            trace.texttemplate = `${unitPrefix}%{${measure}${fmt}}${unit}`;
            trace.textposition = 'top center';
            trace.textfont = fontOf(dl.text, d.font);
            trace.cliponaxis = false;
            printed++;
        }
    }

    if (!printed) say('dataLabels.show', 'value-labels-not-drawn', 'every mark already prints its own text — theme labels stood down');
    void table;
    void mixHex;
    void toHex;
    void isDarkSurface;
    void contrastingInk;
    void sampleRamp;
}

/** Which of a trace's two channels carries the number worth printing. */
function numericChannel(trace: any): 'x' | 'y' | null {
    const numeric = (v: any) => Array.isArray(v) && v.some((n) => typeof n === 'number' && Number.isFinite(n));
    if (numeric(trace?.y)) return 'y';
    if (numeric(trace?.x)) return 'x';
    return null;
}

/**
 * Break a Plotly title to the width it has, with no house in sight.
 *
 * Plotly neither wraps a title nor reserves room for one, so a headline longer
 * than the figure is simply cut off at both ends. That is Flint's own bug, not
 * a theme's, so it is fixed on the untheme'd path too.
 */
export function fitPlotlyTitle(figure: any): void {
    const layout = figure?.layout;
    const title = layout?.title;
    const text = typeof title === 'string' ? title : title?.text;
    const deck = title?._deck as string | undefined;
    if (!text && !deck) return;
    const size = title?.font?.size ?? 17;
    const width = Math.max(Number(layout.width) || 400, titleRoomOf(figure));
    // Plotly's own title: 17 px over the container's centre; the deck a second, smaller line.
    const block = planTitleBlock({ title: text ? String(text).replace(/<br>/g, ' ') : undefined, subtitle: deck }, width - 16, {
        headline: { fontSize: size, font: PLOTLY_FONT },
        deck: { fontSize: Math.round(size * 0.75), font: PLOTLY_FONT },
        gap: 0,
    });
    if (!block) return;
    widenForTitle(layout, block.width + 16, Number(layout.width) || 400);
    const headSize = block.headline?.fontSize ?? size;
    const headLines = block.headline?.lines ?? [];
    const deckLines = block.deck?.lines ?? [];
    const all = headLines.length + deckLines.length;
    const deckHtml = deckLines.length ? `<span style="font-size:${Math.round(size * 0.75)}px">${deckLines.join('<br>')}</span>` : '';
    layout.title = {
        ...(typeof title === 'object' ? title : {}),
        text: [headLines.join('<br>'), deckHtml].filter(Boolean).join('<br>'),
        ...(headSize !== size ? { font: { ...(title?.font ?? {}), size: headSize } } : {}),
        x: 0.5,
        xanchor: 'center',
        xref: 'container',
        y: titleY(layout, all, headSize),
        yanchor: 'top',
        yref: 'container',
    };
    delete layout.title._deck;
    const need = 8 + titleBlockHeight(all, headSize) + 14;
    const margin = (layout.margin ??= {});
    const before = margin.t ?? 0;
    margin.t = Math.max(before, need);
    let grew = margin.t - before;
    // The lines a broken title adds come out of a continuous plot, as they do in the plan; the
    // canvas grows only by the one line each part takes.
    const yaxis = layout.yaxis;
    const plotHeight = Number(layout.height) - margin.t - (margin.b ?? 0);
    if (grew > 0 && block.broken > 0 && yaxis && yaxis.type !== 'category' && plotHeight > 0) {
        grew -= Math.min(block.broken, plotHeight + grew - plotHeightAfter(plotHeight + grew, block.broken));
    }
    if (grew > 0 && Number(layout.height)) layout.height = Math.round(layout.height + grew);
    layout.title.y = titleY(layout, all, headSize);
}
