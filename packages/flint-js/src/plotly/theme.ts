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
 *     (`insideMinValue`/`outsideMaxValue`) is handed over as `textposition:
 *     'auto'` rather than realized as two filtered layers.
 *   - A figure may hold several subplot axis pairs (`xaxis2`, `yaxis3`, …) for
 *     facets and composites. Every axis pass walks all of them.
 * =============================================================================
 */

import type {
    DesignDecisions,
    ThemeReport,
    ResolvedAxis,
    ResolvedText,
    ResolvedSeriesInk,
} from '../core/theme/types';
import { parseColor, toHex, mixHex, isDarkSurface, contrastingInk, sampleRamp } from '../core/theme/presence';

type Say = (path: string, message: string) => void;

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
    let out = s;
    if (bold) out = `<b>${out}</b>`;
    if (italic) out = `<i>${out}</i>`;
    return out;
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

function dataTraces(figure: any): any[] {
    return (figure?.data ?? []).filter(
        (t: any) => t && !CHROME_TRACES.has(String(t.type)) && !isContextTrace(t) && !isReferenceTrace(t),
    );
}

/**
 * Bands of context and reference ticks are drawn in fixed greys and blacks by
 * the templates, which reads as a stack of light bars on a dark card. Each is
 * restated against the house surface, keeping its relative weight.
 */
function applyFurnitureTraces(figure: any, d: DesignDecisions): void {
    const surface = d.surface.plot ?? d.surface.canvas;
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
    const say: Say = (path, message) => report.push({ stage: 'realize', path, message });
    if (!figure) return report;
    figure.layout ??= {};

    applySurface(figure, d);
    applyGeoSurface(figure, d);
    applyFurnitureTraces(figure, d);
    const titleH = applyTypography(figure, d);
    applyAxes(figure, d, table, say);
    applyMarks(figure, d, table, say);
    applySeriesInk(figure, d, table, say);
    const legendH = applyLegend(figure, d, say);
    applyFacetChrome(figure, d);
    applyDataLabels(figure, d, table, say);
    layoutTopChrome(figure, d, titleH, legendH);

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
    const say: Say = (path, message) => report.push({ stage: 'realize', path, message });
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
    if (!headlineText) return 0;

    // Plotly 2.x has no `title.subtitle`, so a deck is carried as a second line
    // of the title with its own inline type.
    const h = d.title.headline;
    const deckText = (title as any)?._deck as string | undefined;
    const deck = d.title.deck;
    const width = Number(layout.width) || 400;

    const headlineSize = h.fontSize ?? 16;
    const headLines = wrapToWidth(
        String(headlineText).replace(/<br>/g, ' '),
        width - 8,
        headlineSize,
        needsMarkup(h).bold,
    );
    const lines = [styleText(headLines.join('<br>'), h)];

    let height = 8 + titleBlockHeight(headLines.length, headlineSize) + 6;
    if (deckText) {
        const size = deck.fontSize ?? 12;
        const color = deck.color ?? d.text.secondary;
        const deckLines = wrapToWidth(deckText, width - 8, size, needsMarkup(deck).bold);
        const style = [
            `font-size:${size}px`,
            `color:${color}`,
            ...(deck.font ? [`font-family:${deck.font}`] : []),
        ].join(';');
        lines.push(`<span style="${style}">${styleText(deckLines.join('<br>'), deck)}</span>`);
        height += titleBlockHeight(deckLines.length, size) + d.title.deckPadding;
    }

    const anchor = d.title.anchor;
    layout.title = {
        text: lines.join('<br>'),
        font: { ...fontOf(h, d.font), size: headlineSize },
        x: anchor === 'start' ? 0.005 : anchor === 'end' ? 0.995 : 0.5,
        xanchor: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
        xref: 'container',
        y: titleY(layout, headLines.length + (deckText ? 1 : 0), headlineSize),
        yanchor: 'top',
        yref: 'container',
    };
    return height + d.title.offset;
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

/** Break a line of text to a pixel width, at word boundaries where it can. */
function wrapToWidth(text: string, width: number, fontSize: number, bold = false): string[] {
    const perChar = fontSize * (bold ? 0.63 : 0.55);
    const max = Math.max(8, Math.floor(width / perChar));
    if (text.length <= max) return [text];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
        if (!line) line = w;
        else if ((line + ' ' + w).length <= max) line += ' ' + w;
        else {
            lines.push(line);
            line = w;
        }
    }
    if (line) lines.push(line);
    return lines;
}

/**
 * Give the title and any legend above the plot room of their own.
 *
 * Plotly's `automargin` grows the margin *into* the plot, so a chart with a
 * two-line headline and a key above it loses that much of its plotting
 * rectangle. The chart was already sized to fit; the chrome the theme adds is
 * therefore paid for in figure height, not taken out of the plot.
 */
function layoutTopChrome(figure: any, d: DesignDecisions, titleH: number, legendH: number): void {
    const layout = figure.layout;
    const need = titleH + legendH;
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
        layout.legend.y = 1 + Math.max(8, margin.t - titleH) / plotH;
    }
    void d;
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

function applyAxes(figure: any, d: DesignDecisions, table: any[], say: Say): void {
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
    pinSparseTicks(figure, d, say);
    applyPolarAxes(figure, d);
    applyUnits(figure, d, say);
    applyTickLabels(figure, d, table, say);
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
function pinSparseTicks(figure: any, d: DesignDecisions, say: Say): void {
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
            if (ax.tickvals != null || !ax.showticklabels) continue;
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
            say('axes.tickCount', `\`${key}\` names the ${picked.length} value(s) it holds, not Plotly's round numbers`);
        }
    }
}

/**
 * A polar plot keeps its scales inside `layout.polar`, out of reach of the
 * cartesian pass. Its radial labels sit in the middle of the plot, where
 * Plotly turns them on their side as soon as the circle gets small, so they
 * are held straight and their count is kept low.
 */
function applyPolarAxes(figure: any, d: DesignDecisions): void {
    const layout = figure.layout;
    for (const key of Object.keys(layout ?? {})) {
        if (!/^polar\d*$/.test(key)) continue;
        const polar = layout[key];
        if (!polar || typeof polar !== 'object') continue;
        const plot = d.surface.plot ?? d.surface.canvas;
        const subplot = key === 'polar' ? 'polar' : key;
        const radar = (figure.data ?? []).some((trace: any) =>
            trace?.type === 'scatterpolar'
            && String(trace?.subplot ?? 'polar') === subplot
            && trace?.fill === 'toself');
        polar.bgcolor = plot;
        for (const [name, a] of [['radialaxis', d.axes.y], ['angularaxis', d.axes.x]] as const) {
            if (!a) continue;
            const ax = polar[name] ?? (polar[name] = {});
            if (radar) {
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
                    if (ax.tickmode !== 'array') ax.nticks = Math.min(a.tickCount ?? 4, 4);
                }
            }
        }
    }
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
function labelsFitStraight(ax: any, key: string, a: ResolvedAxis, width: number, cats: any[]): boolean {
    if (!key.startsWith('x')) return true;
    if ((a.label.angle ?? 0) !== 0) return true;
    if (!Array.isArray(cats) || !cats.length) return true;
    const span = Array.isArray(ax.domain) && ax.domain.length === 2
        ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
        : 1;
    const band = (width * (Number.isFinite(span) ? span : 1)) / cats.length;
    const longest = Math.max(...cats.map((c: any) => String(c).length));
    // Names need air between them, or 'JanFebMar' reads as one word.
    return longest * (a.label.fontSize ?? 11) * 0.58 + 5 <= band;
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
    say: Say,
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
        // full width run into each other across a quarter of one — so the
        // angle the template chose stands where the house's will not fit.
        if (a.label.angle != null) {
            if (labelsFitStraight(ax, key, a, width, cats)) ax.tickangle = a.label.angle;
            else {
                say(
                    'axes.label.angle',
                    `\`${key}\` keeps its turned labels — straight they would not fit the panel`,
                );
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
            say('annotation.axisTitlePlacement', 'flat axis title not realized on a y axis — kept rotated');
        }
    }

    // A tick budget is stated for a whole axis. A facet panel holds a fraction
    // of the width, so it gets that fraction of the budget — otherwise the
    // last tick of one panel prints on top of the first tick of the next.
    // A log axis is ticked by decade. Asking it for a number of ticks makes
    // Plotly name every minor as well — 2, 3, 4 … 9 between each power.
    if (a.tickCount != null && ax.type !== 'category' && ax.type !== 'log') {
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
    if (key.startsWith('x') && ax.type !== 'category' && ax.type !== 'log' && ax.showticklabels) {
        const dom = Array.isArray(ax.domain) && ax.domain.length === 2
            ? Math.abs(Number(ax.domain[1]) - Number(ax.domain[0]))
            : 1;
        const span = Number.isFinite(dom) ? dom : 1;
        const each = tickLabelChars(ax) * (a.label.fontSize ?? 11) * 0.58 + 8;
        const band = width * span - (span < 0.99 ? each * 1.5 : 0);
        const fits = Math.max(1, Math.floor(band / each));
        if (fits < (ax.nticks ?? 6)) {
            ax.nticks = Math.max(2, fits);
            say('axes.tickCount', `\`${key}\` holds ${fits} label(s) in the room it has, not ${a.tickCount}`);
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
function applyUnits(figure: any, d: DesignDecisions, say: Say): void {
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
                say('axes.unit', `${key} shows a share of the whole — the measure's unit left off`);
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
            say('annotation.unit', 'unit written on every tick — Plotly states first, last or all, not both ends');
        }
    }
}

/** Which ticks carry a label: the values the data holds, thinned or cut to the ends. */
function applyTickLabels(figure: any, d: DesignDecisions, table: any[], say: Say): void {
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
            say('structure.axis.tickLabels', `${key} ticked at ${picked.length} observed values (${a.tickLabels})`);
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
    const n = Array.isArray(trace.x) ? trace.x.length : 0;
    if (n < 2) return wanted;
    const layout = figure.layout ?? {};
    const plotW = Math.max(
        40,
        (Number(layout.width) || 400) - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0),
    );
    const spacing = plotW / (n - 1);
    if (spacing < 6) return 0;
    return Math.max(2, Math.round(Math.min(wanted, strokeWidth * 3.5, spacing * 0.55)));
}

function applyMarks(figure: any, d: DesignDecisions, table: any[], say: Say): void {
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
        if (layout.barmode === 'group' && bars.length > 1) layout.bargroupgap = 0.05;
    }

    for (const [index, trace] of traces.entries()) {
        if (CHROME_TRACES.has(String(trace?.type))) continue;
        // Furniture keeps the weight `applyFurnitureTraces` gave it.
        if (isContextTrace(trace) || isReferenceTrace(trace)) continue;
        const fams = markFamilies(trace);

        if (fams.includes('bar') || fams.includes('arc')) {
            if (m.outline && !isContextTrace(trace)) {
                trace.marker = {
                    ...(trace.marker ?? {}),
                    line: { color: m.outline.color, width: m.outline.width },
                };
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
            trace.line = { ...(trace.line ?? {}), width: m.strokeWidth };
            if (m.interpolate) {
                const shape = plotlyLineShape(m.interpolate);
                if (shape) trace.line.shape = shape;
                else say('marks.line.interpolate', `\`${m.interpolate}\` has no Plotly line shape — left straight`);
            }
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
            if (m.point?.haloColor && m.point.haloWidth) {
                trace.marker = {
                    ...(trace.marker ?? {}),
                    line: { color: m.point.haloColor, width: m.point.haloWidth },
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
        const filled = (trace.fill != null && trace.fill !== 'none') || floors.has(index);
        if (m.point?.show && fams.includes('line') && !fams.includes('point') && !filled) {
            const dot = dotDiameter(trace, figure, diameterOf(m.point.size ?? 40), m.strokeWidth ?? 2);
            if (dot > 0) {
                trace.mode = String(trace.mode ?? 'lines').includes('markers')
                    ? trace.mode
                    : `${trace.mode ?? 'lines'}+markers`;
                trace.marker = { ...(trace.marker ?? {}), size: dot };
            } else {
                say('marks.point.show', 'dots left off — the points sit closer together than a dot is wide');
            }
        }
    }

    // A sized mark's range. `marker.size` has already been mapped to pixel
    // diameters by the template, so the house's range is imposed by rescaling
    // those diameters — going through `sizeref` instead would treat drawn
    // pixels as data and flatten the differences under its square root.
    if (m.sizeRange) {
        const [lo, hi] = m.sizeRange;
        for (const trace of figure.data ?? []) {
            const sizes = trace?.marker?.size;
            if (!Array.isArray(sizes)) continue;
            const areas = sizes.map((dm: any) => Math.PI * (Number(dm) / 2) ** 2);
            const finite = areas.filter((a: number) => Number.isFinite(a) && a > 0);
            if (!finite.length) continue;
            const min = Math.min(...finite);
            const max = Math.max(...finite);
            const floor = m.minSize != null ? Math.max(lo, m.minSize) : lo;
            // A bubble the house has scaled down to two pixels is a speck: it
            // is neither a readable value nor visibly a mark. Four pixels is
            // the floor at which a dot still reads as one.
            const MIN_DIAMETER = 4;
            trace.marker.size = areas.map((a: number) => {
                if (!Number.isFinite(a)) return Math.max(MIN_DIAMETER, diameterOf(floor));
                const t = max > min ? (a - min) / (max - min) : 1;
                return Math.max(MIN_DIAMETER, diameterOf(floor + t * (hi - floor)));
            });
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
function paintDirectional(trace: any, d: DesignDecisions, say: Say): void {
    const status = d.series.status;
    let positive = status?.positive;
    let negative = status?.negative;
    let neutral = status?.neutral;

    if (!positive && !negative && !neutral) {
        // A candlestick's red and green are a convention its readers rely on,
        // so without status inks it is left alone. A waterfall's up and down
        // are only contributions, and can take the indexed set.
        if (trace.type !== 'waterfall') {
            say('ink.series', 'rise/fall colours kept — the house names no status inks');
            return;
        }
        const inks = d.series.categorical ?? [];
        if (!inks.length) return;
        positive = inks[0];
        negative = inks[1] ?? inks[0];
        neutral = mixHex(d.text.primary, d.surface.plot ?? d.surface.canvas, 0.45);
        say('ink.series', 'no status inks — the waterfall takes the indexed set, totals a neutral');
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
    say('ink.series', 'rise, fall and total take the house status inks');
}

function applySeriesInk(figure: any, d: DesignDecisions, table: any[], say: Say): void {
    const s = d.series;
    if (s.exhausted) {
        say('ink.series', 'more series than the house names inks for — template palette kept');
        return;
    }

    const traces = dataTraces(figure);
    if (!traces.length) return;

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
    for (const trace of traces) {
        if (trace.colorscale != null || trace.marker?.colorscale != null) continue;
        const fams = markFamilies(trace);

        // A pie states one colour per slice on `marker.colors` — the whole
        // series lives in one trace.
        if (Array.isArray(trace.marker?.colors)) {
            trace.marker.colors = (trace.marker.colors as any[]).map(
                (c: any, i: number) => (isLiteralColor(c) ? inks[i % inks.length] : c),
            );
            continue;
        }

        // A waterfall or a candlestick states its colours by *direction*, in
        // `increasing`/`decreasing`/`totals` blocks. Direction is not a series,
        // so the categorical set says nothing about it — the house's status
        // inks do.
        if (trace.increasing || trace.decreasing || trace.totals) {
            paintDirectional(trace, d, say);
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

        const ink = inks[seriesIndex % inks.length];
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
            const alpha = trace.stackgroup != null ? 1 : d.marks.fillOpacity ?? 0.8;
            trace.fillcolor = withAlpha(ink, alpha);
        }
        seriesIndex++;
    }

    restateSeriesAnnotations(figure, recoloured, say);

    void table;
    void distinctCount;
}

/**
 * An annotation printed in a series' colour — the number at the end of a
 * sparkline row — is naming that series. When the series changes ink, so does
 * the annotation, or the row says one thing in two colours.
 */
function restateSeriesAnnotations(figure: any, recoloured: Map<string, string>, say: Say): void {
    if (!recoloured.size) return;
    let moved = 0;
    for (const note of figure.layout?.annotations ?? []) {
        const colour = note?.font?.color;
        if (typeof colour !== 'string') continue;
        const ink = recoloured.get(colour.toLowerCase());
        if (!ink || ink.toLowerCase() === colour.toLowerCase()) continue;
        note.font = { ...note.font, color: ink };
        moved++;
    }
    if (moved) say('ink.series', `${moved} annotation(s) named a series and followed its ink`);
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

function applyLegend(figure: any, d: DesignDecisions, say: Say): number {
    const layout = figure.layout;
    const l = d.legend;

    if (!l.show) {
        layout.showlegend = false;
        for (const trace of figure.data ?? []) {
            if (trace?.marker?.colorbar) trace.marker.showscale = false;
            if (trace?.colorbar) trace.showscale = false;
            if (trace?.showscale) trace.showscale = false;
        }
        return 0;
    }

    // `seriesEnd` names each series at the end of its own line. Realized as
    // annotations where there is a line to end; otherwise the house's own
    // fallback is taken rather than a placement invented here.
    let placement: string = l.placement;
    if (placement === 'seriesEnd') {
        if (labelSeriesEnds(figure, d, say)) {
            layout.showlegend = false;
            return 0;
        }
        placement = (l.fallbacks ?? []).find((p) => p !== 'seriesEnd') ?? 'right';
        say('legend.placement', `no series with an end to name — fell back to \`${placement}\``);
    }
    if (!LEGEND_ANCHORS[placement]) {
        const next = (l.fallbacks ?? []).find((p) => LEGEND_ANCHORS[p]) ?? 'right';
        say('legend.placement', `\`${placement}\` is not a Plotly placement — fell back to \`${next}\``);
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
        title: l.title ? (layout.legend?.title ?? undefined) : { text: '' },
    };

    // A key to values is a colorbar, not a swatch list.
    for (const trace of figure.data ?? []) {
        const bar = trace?.marker?.colorbar ?? trace?.colorbar;
        if (!bar) continue;
        Object.assign(bar, {
            outlinewidth: 0,
            tickfont: fontOf(l.label, d.font),
            ...(l.gradientLength ? { len: l.gradientLength, lenmode: 'pixels' } : {}),
            ...(l.title ? {} : { title: { text: '' } }),
        });
    }

    // A key above the plot is chrome the figure has to pay for, however it is
    // stacked.
    if (layout.legend.y > 1) {
        if (layout.legend.orientation === 'h') {
            return horizontalLegendHeight(figure, l.label.fontSize ?? 11, needsMarkup(l.label).bold);
        }
        const rows = legendEntries(figure).length;
        return rows ? rows * ((l.label.fontSize ?? 11) + 12) + 8 : 0;
    }
    // A key beside the plot is paid for in width, for the same reason.
    if (layout.legend.orientation === 'v' && layout.legend.x >= 1) {
        const entries = legendEntries(figure);
        if (entries.length) {
            const size = l.label.fontSize ?? 11;
            const need = Math.ceil(Math.max(...entries.map((e) => e.length)) * size * 0.6) + 40;
            const margin = (layout.margin ??= {});
            const before = margin.r ?? 0;
            margin.r = Math.max(before, need);
            const grew = margin.r - before;
            if (grew > 0 && Number(layout.width)) layout.width = Math.round(layout.width + grew);
        }
    }

    // A column of keys taller than the plot is simply cut off at the bottom,
    // so the figure grows to hold it.
    if (layout.legend.orientation !== 'h') {
        const entries = legendEntries(figure);
        const need = entries.length * ((l.label.fontSize ?? 11) + 14) + 20;
        const have = (Number(layout.height) || 0) - (layout.margin?.t ?? 0) - (layout.margin?.b ?? 0);
        if (entries.length && have > 0 && need > have) {
            layout.height = Math.round(Number(layout.height) + (need - have));
            say('legend.placement', `the figure grew ${Math.round(need - have)}px to hold a column of ${entries.length} keys`);
        }
    }
    return 0;
}

/** The names a key will carry: one per trace, or one per slice of a pie. */
function legendEntries(figure: any): string[] {
    const out: string[] = [];
    for (const t of figure.data ?? []) {
        if (t?.showlegend === false) continue;
        if (Array.isArray(t?.labels)) out.push(...t.labels.map(String));
        else if (t?.name) out.push(String(t.name));
    }
    return out;
}

/** How tall a horizontal key stacks once its entries are packed into the width. */
function horizontalLegendHeight(figure: any, fontSize: number, bold = false): number {
    const entries = legendEntries(figure);
    if (!entries.length) return 0;
    // A key above the plot is laid out across the *plot area*, not the paper,
    // so it wraps sooner than the figure width suggests.
    const layout = figure.layout ?? {};
    const width = Math.max(
        120,
        (Number(layout.width) || 400) - (layout.margin?.l ?? 0) - (layout.margin?.r ?? 0),
    );
    const rowHeight = fontSize + 14;
    let rows = 1;
    let used = 0;
    for (const e of entries) {
        const w = e.length * fontSize * (bold ? 0.72 : 0.62) + 46;
        if (used > 0 && used + w > width) {
            rows++;
            used = w;
        } else used += w;
    }
    return rows * rowHeight + 8;
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
function labelSeriesEnds(figure: any, d: DesignDecisions, say: Say): boolean {
    const lines = dataTraces(figure).filter((t) => {
        const fams = markFamilies(t);
        return (fams.includes('line') || fams.includes('area')) && Array.isArray(t.x) && Array.isArray(t.y) && t.name;
    });
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
            text: styleText(String(t.name), d.legend.label),
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
    const longest = Math.max(...lines.map((t) => String(t.name).length));
    const pad = Math.ceil(longest * (d.legend.label.fontSize ?? 11) * 0.55) + 12;
    layout.margin = { ...(layout.margin ?? {}), r: Math.max(layout.margin?.r ?? 0, pad) };
    say('legend.placement', `series named at the end of each line (${lines.length})`);
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

function applyDataLabels(figure: any, d: DesignDecisions, table: any[], say: Say): void {
    const dl = d.dataLabels;
    if (!dl.show) return;

    const traces = dataTraces(figure).filter((t) => markFamilies(t).some((m) => LABELABLE.has(m)));
    if (!traces.length) {
        say('dataLabels.show', 'nothing on this chart can carry a printed value');
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
                    say('label.text', 'slice names left to the key — printed on the wedge as well, they crowd it out');
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
            trace.texttemplate = `${unitPrefix}%{${measure}${fmt}}${unit}`;
            // Plotly places the label inside where it fits and outside where it
            // does not, which is exactly the geometry stage 2 computed with
            // `insideMinValue`/`outsideMaxValue`. `auto` hands that decision to
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
                    say('dataLabels.text', 'a mirrored measure prints its labels unsigned, as its axis does');
                } else {
                    say('dataLabels.text', 'a mirrored measure kept its signed label — the trace needs its own customdata');
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
                        'dataLabels.show',
                        `${dropped} stacked segment(s) too thin to hold a label at the house's size`,
                    );
                }
                say('dataLabels.placement', 'stacked segments keep their labels inside, or drop them');
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

    if (!printed) say('dataLabels.show', 'every mark already prints its own text — theme labels stood down');
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
    if (!text) return;
    const size = title?.font?.size ?? 17;
    const width = Number(layout.width) || 400;
    const lines = wrapToWidth(String(text).replace(/<br>/g, ' '), width - 16, size);
    const deck = title?._deck as string | undefined;
    const all = deck ? [...lines, ...wrapToWidth(deck, width - 16, size * 0.75)] : lines;
    layout.title = {
        ...(typeof title === 'object' ? title : {}),
        text: deck
            ? `${lines.join('<br>')}<br><span style="font-size:${Math.round(size * 0.75)}px">${deck}</span>`
            : lines.join('<br>'),
        x: 0.5,
        xanchor: 'center',
        xref: 'container',
        y: titleY(layout, all.length, size),
        yanchor: 'top',
        yref: 'container',
    };
    const need = 8 + titleBlockHeight(all.length, size) + 14;
    const margin = (layout.margin ??= {});
    const before = margin.t ?? 0;
    margin.t = Math.max(before, need);
    const grew = margin.t - before;
    if (grew > 0 && Number(layout.height)) layout.height = Math.round(layout.height + grew);
    layout.title.y = titleY(layout, all.length, size);
}
