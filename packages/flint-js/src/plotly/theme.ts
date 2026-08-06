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

import type { DesignDecisions, ThemeReport, ResolvedAxis, ResolvedText } from '../core/theme/types';
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
            const filled = trace?.fill && trace.fill !== 'none';
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

function dataTraces(figure: any): any[] {
    return (figure?.data ?? []).filter(
        (t: any) => t && !CHROME_TRACES.has(String(t.type)) && !isContextTrace(t),
    );
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
function applyTypography(figure: any, d: DesignDecisions): number {
    const layout = figure.layout;
    layout.font = {
        ...(layout.font ?? {}),
        ...(d.font ? { family: d.font } : {}),
        color: d.text.primary,
    };

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

    let height = headLines.length * headlineSize * 1.35 + 10;
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
        height += deckLines.length * size * 1.35 + d.title.deckPadding;
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
 * Where the title block has to be anchored to sit clear of the top edge.
 *
 * A multi-line Plotly title grows *upward* from its anchor, so a two-line
 * headline anchored at the container top has its first line off the page. The
 * anchor drops by the lines above it.
 */
function titleY(layout: any, lines: number, fontSize: number): number {
    const height = Number(layout.height) || 300;
    return 1 - (8 + Math.max(0, lines - 1) * fontSize * 1.35) / height;
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

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

function applyAxes(figure: any, d: DesignDecisions, table: any[], say: Say): void {
    const layout = figure.layout;
    for (const ch of ['x', 'y'] as const) {
        const decided = d.axes[ch];
        if (!decided) continue;
        for (const key of axisKeys(layout, ch)) {
            applyAxis(layout[key] ?? (layout[key] = {}), decided, d, say, key);
        }
    }
    applyUnits(figure, d, say);
    applyTickLabels(figure, d, table, say);
}

function applyAxis(ax: any, a: ResolvedAxis, d: DesignDecisions, say: Say, key: string): void {
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

    // Tick labels
    ax.showticklabels = a.label.show !== false;
    if (ax.showticklabels) {
        ax.tickfont = { ...(ax.tickfont ?? {}), ...fontOf(a.label, d.font) };
        if (a.label.angle != null) ax.tickangle = a.label.angle;
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

    if (a.tickCount != null && ax.type !== 'category') ax.nticks = a.tickCount;
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
            if (prefix) {
                ax.tickprefix = unit.text;
                ax.showtickprefix = where;
            } else {
                ax.ticksuffix = unit.text;
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
            const picked = thin(values, a.tickLabels, key);
            if (!picked?.length) continue;
            ax.tickmode = 'array';
            ax.tickvals = picked;
            if (ax.type === 'date' && !ax.tickformat) {
                ax.tickformat = dateFormatFor(picked);
                ax.tickangle = 0;
            }
            say('structure.axis.tickLabels', `${key} ticked at ${picked.length} observed values (${a.tickLabels})`);
        }
    }
}

/** The span the ticks cover decides how much of a date needs writing. */
function dateFormatFor(values: any[]): string {
    const times = values.map((v) => new Date(v).getTime()).filter((n) => Number.isFinite(n));
    if (times.length < 2) return '%Y';
    const days = (Math.max(...times) - Math.min(...times)) / 86_400_000;
    if (days > 900) return '%Y';
    if (days > 60) return '%b %Y';
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
        if (values.length - 1 - lastIndex < step / 2) picked.pop();
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

function applyMarks(figure: any, d: DesignDecisions, table: any[], say: Say): void {
    const layout = figure.layout;
    const m = d.marks;

    // Band occupancy is one number for the whole figure: Plotly sizes bars by
    // the gap left between them, not by a mark width.
    const bars = (figure.data ?? []).filter((t: any) => markFamilies(t).includes('bar'));
    if (bars.length) {
        layout.bargap = Math.max(0, Math.min(0.9, 1 - m.bandFraction));
        if (layout.barmode === 'group' && bars.length > 1) layout.bargroupgap = 0.05;
    }

    for (const trace of figure.data ?? []) {
        if (CHROME_TRACES.has(String(trace?.type))) continue;
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
            const size = m.point?.size;
            if (size != null && !Array.isArray(trace.marker?.size)) {
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
        if (m.point?.show && fams.includes('line') && !fams.includes('point')) {
            trace.mode = String(trace.mode ?? 'lines').includes('markers')
                ? trace.mode
                : `${trace.mode ?? 'lines'}+markers`;
            trace.marker = {
                ...(trace.marker ?? {}),
                size: diameterOf(m.point.size ?? 40),
            };
        }
    }

    // A sized mark's range: Plotly sizes by `sizeref` against the largest datum.
    if (m.sizeRange) {
        for (const trace of figure.data ?? []) {
            const sizes = trace?.marker?.size;
            if (!Array.isArray(sizes)) continue;
            const max = Math.max(...sizes.filter((s: any) => Number.isFinite(s)));
            if (!(max > 0)) continue;
            trace.marker.sizemode = 'area';
            trace.marker.sizeref = (2 * max) / (m.sizeRange[1] || 400);
            trace.marker.sizemin = m.minSize ? diameterOf(m.minSize) : 3;
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

        const ink = inks[seriesIndex % inks.length];
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
            trace.fillcolor = withAlpha(ink, d.marks.fillOpacity ?? 0.8);
        }
        seriesIndex++;
    }

    void table;
    void distinctCount;
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

    // A horizontal key above the plot is chrome the figure has to pay for.
    if (layout.legend.orientation === 'h' && layout.legend.y > 1) {
        return horizontalLegendHeight(figure, l.label.fontSize ?? 11, needsMarkup(l.label).bold);
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
    const width = Number(figure.layout?.width) || 400;
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
function dodgeVertically(notes: any[], figure: any, fontSize: number, traces: any[]): void {
    if (notes.length < 2) return;
    const layout = figure.layout;
    const values = notes.map((a) => Number(a.y)).filter((v) => Number.isFinite(v));
    if (values.length !== notes.length) return;

    // A text line is worth a share of the *axis*, not of the band the names
    // happen to fall in: measuring against the names alone under-counts the
    // gap several times over on a chart whose scale starts at zero.
    const ax = layout[(notes[0].yref ?? 'y').replace('y', 'yaxis')] ?? {};
    const all: number[] = [];
    for (const t of traces) for (const v of t.y ?? []) if (Number.isFinite(Number(v))) all.push(Number(v));
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
    const placed: any[] = [];
    for (const t of lines) {
        const n = t.x.length;
        if (!n) continue;
        const axisKey = (t.xaxis ?? 'x').replace('x', 'xaxis');
        placed.push({
            // On a category axis Plotly reads an annotation's `x` as the
            // category's *serial number*, not its name — naming the category
            // there pushes the annotation thousands of bands to the right and
            // drags the scale with it.
            x: categoryPosition(layout[axisKey], t.x[n - 1]),
            y: t.y[n - 1],
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
    dodgeVertically(placed, figure, d.legend.label.fontSize ?? 11, lines);
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

function applyFacetChrome(figure: any, d: DesignDecisions): void {
    const f = d.facets.header;
    for (const a of figure.layout?.annotations ?? []) {
        if (a?._role !== 'facet-header') continue;
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
    const unit = dl.unit ?? '';
    let printed = 0;

    for (const trace of traces) {
        const fams = markFamilies(trace);
        if (trace.text != null || trace.texttemplate != null || trace.textinfo != null) {
            // The template prints its own numbers. The theme may not change
            // *what* is written — that was the template's decision — but the
            // type it is written in is the house's.
            trace.textfont = { ...(trace.textfont ?? {}), ...fontOf(dl.text, d.font) };
            if (dl.inkMode === 'contrastWithMark' && trace.textfont) delete trace.textfont.color;
            printed++;
            continue;
        }
        if (fams.includes('arc')) {
            trace.textinfo = 'value';
            trace.texttemplate = `%{value${fmt}}${unit}`;
            trace.textposition = dl.placement === 'outsideMark' ? 'outside' : 'inside';
            trace.textfont = fontOf(dl.text, d.font);
            if (dl.inkMode === 'contrastWithMark') delete trace.textfont.color;
            printed++;
            continue;
        }

        if (fams.includes('bar')) {
            const measure = trace.orientation === 'h' ? 'x' : 'y';
            trace.texttemplate = `%{${measure}${fmt}}${unit}`;
            // Plotly places the label inside where it fits and outside where it
            // does not, which is exactly the geometry stage 2 computed with
            // `insideMinValue`/`outsideMaxValue`. `auto` hands that decision to
            // the renderer, which can measure the drawn bar; `outside` is
            // honoured literally because it is a house habit, not a fit.
            trace.textposition = dl.placement === 'outsideMark' ? 'outside' : 'auto';
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
            const measure = 'y';
            trace.mode = String(trace.mode ?? 'lines').includes('text')
                ? trace.mode
                : `${trace.mode ?? 'lines'}+text`;
            trace.texttemplate = `%{${measure}${fmt}}${unit}`;
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
    const need = all.length * size * 1.35 + 16;
    const margin = (layout.margin ??= {});
    const before = margin.t ?? 0;
    margin.t = Math.max(before, need);
    const grew = margin.t - before;
    if (grew > 0 && Number(layout.height)) layout.height = Math.round(layout.height + grew);
}
