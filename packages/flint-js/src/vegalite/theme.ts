// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Level 3 — realization, Vega-Lite.
 *
 * Takes backend-neutral `DesignDecisions` and writes Vega-Lite. This file is
 * allowed to *approximate* — to fake a primitive Vega-Lite does not have, such
 * as line-end series labels — and is required to report when it does.
 *
 * It is NOT allowed to decide anything. Any `if (chartType === …)` here is a
 * bug in grounding, not a shortcut.
 *
 * Runs LAST, after `vlApplyLayoutToSpec`, which builds `spec.config` wholesale.
 */

import type { DesignDecisions, ThemeReport } from '../core/theme/types.js';
import { contrastingInk, parseColor, luminance, toHex } from '../core/theme/presence.js';
import { CONTINUOUS_BAR_STEP_FILL } from './templates/utils.js';
import { LOCAL_DODGE_LANE_FILL } from './templates/bar.js';

/** Mark families that carry data values (as opposed to chrome). */
const DATA_MARKS = new Set([
    'bar', 'line', 'area', 'point', 'circle', 'square', 'arc', 'rect',
    'trail', 'tick', 'boxplot', 'errorbar', 'errorband', 'geoshape',
]);

const LINE_MARKS = new Set(['line', 'trail']);

/** Axis properties this realizer owns; anything a template left is overwritten. */
const OWNED_AXIS_KEYS = [
    'grid', 'gridColor', 'gridWidth', 'gridDash', 'gridOpacity',
    'domain', 'domainColor', 'domainWidth',
    'ticks', 'tickColor', 'tickWidth', 'tickSize', 'tickOffset',
    'labelColor', 'labelFont', 'labelFontSize', 'labelFontWeight', 'labelPadding',
    'titleColor', 'titleFont', 'titleFontSize', 'titleFontWeight',
];

export function markTypeOf(mark: any): string | undefined {
    if (!mark) return undefined;
    return typeof mark === 'string' ? mark : mark.type;
}

/** Every mark family present anywhere in the spec. Used to ground before realizing. */
export function collectMarkTypes(spec: any): string[] {
    const found = new Set<string>();
    walk(spec, (node) => {
        const t = markTypeOf(node.mark);
        if (t) found.add(t);
    });
    return [...found];
}

/** Series marks that draw a connected path — folding several onto one colour
 * key would thread a single line through unrelated readings. */
const CONNECTED_MARKS = new Set(['line', 'area', 'trail']);

/** True when any mark at or under this node draws a connected series path. */
function subtreeHasConnectedMark(node: any): boolean {
    let found = false;
    walk(node, (n) => {
        const t = markTypeOf(n.mark);
        if (t && CONNECTED_MARKS.has(t)) found = true;
    });
    return found;
}

/** Part-to-whole marks whose slices are a share of a summed measure — the
 * overflow tail can be summed into a single "Others" slice at the data level. */
const PART_TO_WHOLE_MARKS = new Set(['arc']);

/**
 * The distinct-count at which `assemble` shrinks a colour key's labels to fit
 * the field's full cardinality (see `assemble.ts`, "Legend sizing for
 * high-cardinality nominal color/group"). When the overflow fold collapses the
 * key to a short top-K + Others list, only a handful of rows render, so that
 * shrink is recomputed against the folded count and short lists are handed back
 * to the house's own size. Kept in sync with the literal in `assemble.ts`.
 */
const HIGH_CARDINALITY_LEGEND_MIN = 16;

/** True when the node's own mark is a part-to-whole (share) mark. */
function isPartToWholeMark(node: any): boolean {
    const t = markTypeOf(node.mark);
    return !!t && PART_TO_WHOLE_MARKS.has(t);
}

/**
 * Every field the node's encodings read, minus the colour and angle fields the
 * overflow fold already accounts for. If anything is left, a sum-aggregate
 * would drop it, so the tail is kept as separate wedges rather than merged.
 */
function otherEncodedFields(encoding: any, keep: Set<string>): string[] {
    const out: string[] = [];
    for (const ch of Object.keys(encoding ?? {})) {
        const e = (encoding as any)[ch];
        const list = Array.isArray(e) ? e : [e];
        for (const one of list) {
            const f = one?.field;
            if (typeof f === 'string' && !keep.has(f)) out.push(f);
        }
    }
    return out;
}

/**
 * Sum the angle measure across each colour key. On a part-to-whole chart the
 * top categories keep their own key (one row each, unchanged) and the folded
 * tail — all sharing the "Others (N)" key — collapse into a single summed
 * slice. Prepended after the key `calculate` so the key exists to group on.
 */
function addTailAggregate(node: any, thetaField: string, keyField: string): void {
    const transform = Array.isArray(node.transform) ? node.transform.slice() : [];
    if (transform.some((t: any) => Array.isArray(t?.aggregate) && (t?.groupby ?? []).includes(keyField))) return;
    transform.push({ aggregate: [{ op: 'sum', field: thetaField, as: thetaField }], groupby: [keyField] });
    node.transform = transform;
}

/**
 * What the spec actually put on the two screen axes. A template is free to
 * name its semantic channels `high`/`low`/`open`/`close`; the reader still
 * sees an x and a y, and grounding has to be able to bind them.
 */
export function collectPositional(spec: any): { x?: { type?: string; field?: string }; y?: { type?: string; field?: string }; color?: { type?: string; field?: string } } {
    const out: any = {};
    // The type and the field are collected independently: a layered template
    // states the type once on the shared encoding and the field on each layer.
    walk(spec, (node) => {
        for (const ch of ['x', 'y'] as const) {
            const enc = node.encoding?.[ch];
            if (!enc || typeof enc !== 'object') continue;
            const cur = out[ch] ?? (out[ch] = {});
            if (cur.type == null && enc.type) cur.type = enc.type;
            if (cur.type == null && enc.aggregate) cur.type = 'quantitative';
            if (cur.field == null && enc.field) cur.field = enc.field;
        }
        // The same for colour, which a layered template states on the one
        // layer that needs it. Grounding otherwise concludes "no series" for a
        // chart the reader plainly sees two series in.
        for (const ch of ['color', 'fill', 'stroke'] as const) {
            const enc = node.encoding?.[ch];
            if (!enc?.field || out.color) continue;
            out.color = { field: enc.field, type: enc.type };
        }
    });
    for (const ch of ['x', 'y'] as const) {
        if (out[ch] && out[ch].type == null && out[ch].field == null) delete out[ch];
    }
    // Whether the marks are stacked is a fact about the chart too, and one
    // grounding cannot get from the semantics: Vega-Lite stacks a bar with a
    // colour channel without being asked.
    for (const body of plotBodies(spec)) {
        const units = body.layer ? body.layer : [body];
        for (const unit of units) {
            if (!DATA_MARKS.has(markTypeOf(unit.mark) ?? '')) continue;
            const merged = { ...(body.encoding ?? {}), ...(unit.encoding ?? {}) };
            const probe = { mark: unit.mark, encoding: merged };
            if (isStacked(probe, 'x') || isStacked(probe, 'y')) out.stacked = true;
        }
    }
    return out;
}

function walk(node: any, visit: (n: any) => void): void {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
        if (Array.isArray(node[key])) node[key].forEach((c: any) => walk(c, visit));
    }
    if (node.spec) walk(node.spec, visit);
    if (node.facet && node.facet.spec) walk(node.facet.spec, visit);
}

/**
 * The node that owns the plot body — where layers must be added and where the
 * positional encodings live. For a facet spec that is `spec`, for a concat it
 * is the first child that has marks, otherwise the spec itself.
 */
function plotBody(spec: any): any {
    let node = spec;
    for (let depth = 0; depth < 6; depth++) {
        if (node.mark || node.layer) return node;
        if (node.spec) { node = node.spec; continue; }
        for (const key of ['vconcat', 'hconcat', 'concat']) {
            if (Array.isArray(node[key]) && node[key].length) { node = node[key][0]; break; }
        }
        if (node === spec) break;
    }
    return node.mark || node.layer ? node : spec;
}

/**
 * Every plot body in the spec. A concatenation has one per panel, and each of
 * them is a chart in its own right — the mark-level passes have to visit all
 * of them, not just the first.
 */
function plotBodies(spec: any): any[] {
    const out: any[] = [];
    const visit = (node: any, depth: number): void => {
        if (!node || typeof node !== 'object' || depth > 6) return;
        if (node.mark || node.layer) { out.push(node); return; }
        if (node.spec) return visit(node.spec, depth + 1);
        for (const key of ['vconcat', 'hconcat', 'concat'] as const) {
            if (Array.isArray(node[key])) node[key].forEach((c: any) => visit(c, depth + 1));
        }
    };
    visit(spec, 0);
    return out.length ? out : [plotBody(spec)];
}

/** Merged encoding visible to a unit: node-level plus its own. */
function mergedEncoding(node: any, inherited: any): any {
    return { ...(inherited ?? {}), ...(node.encoding ?? {}) };
}

/** The words Vega-Lite will write on this axis if nobody says otherwise. */
function titleOf(enc: any): string | undefined {
    // An explicit `title: null` is the author saying "this layer carries no
    // title" — a shared-scale helper layer (a waterfall connector, a label
    // series) that must not contribute its field name to the merged axis title.
    if (enc?.title === null) return undefined;
    if (typeof enc?.title === 'string') return enc.title;
    // Internal helper fields (`__wf_connector_y`, …) are plumbing, never a
    // reader-facing title.
    if (typeof enc?.field === 'string' && !enc.field.startsWith('__')) return enc.field;
    return undefined;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function realizeThemeVegaLite(spec: any, d: DesignDecisions, table: any[] = []): ThemeReport[] {
    const report: ThemeReport[] = [];
    const say = (path: string, message: string) => report.push({ stage: 'realize', path, message });

    const config = (spec.config ??= {});

    applySurface(spec, config, d);
    applyTypography(config, d);
    applyAxes(spec, config, d, table, say);
    applyZeroRule(spec, d, table, say);
    applyMarks(spec, d, table, say);
    applySeriesInk(spec, d, table, say);
    applyConnectors(spec, d, say);
    applyRedundantChannels(spec, d, say);
    demoteSeriesEnd(spec, d, say);
    applyLegend(spec, config, d, table, say);
    applyFacetChrome(config, d);
    applyPanelTitles(spec, d, say);
    const valueLayer = applyDataLabels(spec, d, table, say);
    applySeriesEndLabels(spec, d, valueLayer, table, say);
    applyPointEmphasis(spec, d, say);
    applyPrintedUnits(spec, d, say);
    applyStatistics(spec, d, table, say);
    const wrapped = applyFurniture(spec, d, table, say);

    return wrapped ? report : report;
}

// ---------------------------------------------------------------------------
// Surface & typography
// ---------------------------------------------------------------------------

function applySurface(spec: any, config: any, d: DesignDecisions): void {
    spec.background = d.surface.canvas;
    config.background = d.surface.canvas;

    config.view = { ...(config.view ?? {}) };
    config.view.stroke = d.frame.show ? d.frame.color : null;
    if (d.frame.show) config.view.strokeWidth = d.frame.width;
    if (d.surface.plot && d.surface.plot !== d.surface.canvas) config.view.fill = d.surface.plot;

    if (spec.padding == null) spec.padding = d.layout.padding;
}

function applyTypography(config: any, d: DesignDecisions): void {
    if (d.font) config.font = d.font;

    const h = d.title.headline;
    const deck = d.title.deck;
    config.title = {
        ...(config.title ?? {}),
        font: h.font,
        fontSize: h.fontSize,
        fontWeight: h.fontWeight ?? 700,
        ...(h.fontStyle ? { fontStyle: h.fontStyle } : {}),
        color: h.color,
        anchor: d.title.anchor,
        offset: d.title.offset,
        subtitleFont: deck.font,
        subtitleFontSize: deck.fontSize,
        ...(deck.fontStyle ? { subtitleFontStyle: deck.fontStyle } : {}),
        subtitleColor: deck.color,
        subtitlePadding: d.title.deckPadding,
    };
    // A start-anchored headline belongs at the edge of the *graphic*, not at
    // the left edge of the plotting rectangle — otherwise the width of the
    // category labels decides where the title starts.
    if (d.title.anchor !== 'middle') config.title.frame = 'bounds';
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

const NONLINEAR_SCALES = new Set(['log', 'symlog', 'pow', 'sqrt']);

/**
 * Flint's preferred tick-label size for this backend (`baseLabelFontSize` in
 * the assembler). Anything under it is the layout pass reporting that the
 * labels did not fit at the size it wanted.
 */
const BASE_LABEL_FONT_SIZE = 10;

function applyAxes(spec: any, config: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): void {
    for (const channel of ['x', 'y'] as const) {
        const axis = d.axes[channel];
        if (!axis) continue;

        const key = channel === 'x' ? 'axisX' : 'axisY';
        // A rule under the categories is the line the marks stand on, and a
        // chart whose value scale floats does not stand on anything: the
        // slopegraph's 40 is not a base, it is wherever the window happened to
        // start. Drawing a heavy rule there asserts a zero that is not on the
        // page. But this is an argument about *bands*: where the index axis is
        // itself a measure — a scatter's horizontal — its rule is the edge of
        // the window, not a base anything is measured from, and taking it away
        // leaves the plot hanging off a single wall.
        let domainShow = axis.domain.show;
        if (domainShow && axis.indexing && bandedAxis(spec, channel) && floatingValueScale(spec, channel)) {
            domainShow = false;
            say(`axes.${channel}.domain`,
                'the value scale floats — a rule under the categories would claim a base the chart does not have');
        }
        const themed: any = {
            grid: axis.grid.show,
            gridColor: axis.grid.color,
            gridWidth: axis.grid.width,
            domain: domainShow,
            domainColor: axis.domain.color,
            domainWidth: axis.domain.width,
            ticks: axis.ticks.show,
            tickColor: axis.ticks.color,
            tickWidth: axis.ticks.width,
            tickSize: axis.ticks.size,
            labelFont: axis.label.font,
            labelFontSize: axis.label.fontSize,
            labelColor: axis.label.color,
            labelPadding: axis.label.padding,
            titleFont: axis.title.font,
            titleFontSize: axis.title.fontSize,
            titleColor: axis.title.color,
            titleFontWeight: axis.title.fontWeight ?? 'normal',
        };
        if (axis.grid.dash) themed.gridDash = axis.grid.dash;
        if (axis.ticks.offset) themed.tickOffset = axis.ticks.offset;
        if (axis.label.show === false) themed.labels = false;
        if (axis.label.limit != null) themed.labelLimit = axis.label.limit;
        if (axis.label.angle != null) themed.labelAngle = axis.label.angle;
        if (axis.tickCount != null) themed.tickCount = axis.tickCount;

        // Flint's layout pass owns label rotation/anchoring when the theme has
        // no opinion — those are fit decisions, not style ones.
        const existing = config[key] ?? {};

        // How big the tick labels are is a house matter; whether they still
        // read is not. Flint's layout shrinks them below its own base only
        // when the categories crowd — a hundred and twenty bands in a plot
        // six pixels wide apiece — and setting a larger house face on top of
        // that decision does not restyle the axis, it smears it. So the house
        // size holds up to the size fit allows.
        const fitted = existing.labelFontSize;
        if (typeof fitted === 'number' && fitted < BASE_LABEL_FONT_SIZE
            && typeof themed.labelFontSize === 'number' && themed.labelFontSize > fitted) {
            say(`axes.${channel}.label.fontSize`,
                `the axis is crowded — the layout fitted its labels at ${fitted}px and the house's ${themed.labelFontSize}px would not stand in the band`);
            themed.labelFontSize = fitted;
        }

        config[key] = { ...existing, ...themed };
        if (axis.label.angle == null && existing.labelAngle != null) {
            config[key].labelAngle = existing.labelAngle;
        }

        // Encoding-level axis objects outrank config, so anything a template
        // left behind in the keys this file owns has to go.
        let saidGrid = false;
        let saidTicks = false;
        let saidGutter = false;
        let saidUnit = false;
        let flatTitle = false;
        walk(spec, (node) => {
            const enc = node.encoding?.[channel];
            if (!enc || enc.axis === null) return;
            const ax = enc.axis;
            if (ax && typeof ax === 'object') {
                // A few pixels of label padding is styling and this file owns
                // it. A hundred is not padding, it is a *column*: the template
                // reserved a gutter and set the labels flush into it, and
                // trimming it back to four drops the names onto the marks.
                const gutter = typeof ax.labelPadding === 'number'
                    && ax.labelPadding >= (axis.label.padding ?? 4) + 16
                    ? ax.labelPadding
                    : undefined;
                for (const k of OWNED_AXIS_KEYS) delete ax[k];
                if (gutter != null) {
                    ax.labelPadding = gutter;
                    if (!saidGutter) {
                        say(`axes.${channel}.label.padding`,
                            `the template holds a ${gutter}px gutter for its labels — that is layout, not padding, so it stands`);
                        saidGutter = true;
                    }
                }
            }
            if (!axis.title.show) {
                enc.axis = { ...(ax ?? {}), title: null };
            } else {
                // The unit belongs in the title where the house keeps titles —
                // `Weight (lb)`, not `1500 lb`, `2000 lb`, `2500 lb` — unless
                // the field already says it.
                if (axis.title.unit) {
                    const current = enc.axis?.title ?? titleOf(enc);
                    if (typeof current === 'string' && !current.includes(`(${axis.title.unit})`)) {
                        enc.axis = { ...(enc.axis ?? {}), title: `${current} (${axis.title.unit})` };
                        if (!saidUnit) {
                            say(`axes.${channel}.title`,
                                `the unit \`${axis.title.unit}\` is stated once in the axis title, which this house keeps`);
                            saidUnit = true;
                        }
                    }
                }
                // A title lying flat above its own axis reads as a label, not
                // as a caption turned on its side. Only the vertical axis has
                // anything to turn.
                const placement = axis.title.placement;
                if (channel === 'y' && !flatTitle
                    && (placement === 'flatAboveAxis' || placement === 'inline')) {
                    enc.axis = {
                        ...(enc.axis ?? {}),
                        titleAngle: 0,
                        titleAlign: 'left',
                        titleAnchor: placement === 'inline' ? 'end' : 'start',
                        titleX: 0,
                        titleY: -(axis.title.fontSize ?? 11) - 6,
                        titleBaseline: 'bottom',
                    };
                    growPadding(spec, 'top', (axis.title.fontSize ?? 11) + 8);
                    flatTitle = true;
                    say(`axes.${channel}.title.placement`,
                        'the axis title lies flat above the axis, where it reads as a label rather than a caption on its side');
                }
            }
            const defaultOrient = channel === 'x' ? 'bottom' : 'left';
            if (axis.orient !== defaultOrient) {
                enc.axis = { ...(enc.axis ?? {}), orient: axis.orient };
            }
            // A grid line the reader cannot name is not a grid, it is a fence.
            // A log scale offers a line at 2, 3, 4… of every decade, and Vega
            // prunes the *labels* that collide, not the lines under them. Where
            // the house draws a grid on such a scale, the ticks are cut back to
            // the decades — the ones that will still carry a number.
            if (axis.grid.show && NONLINEAR_SCALES.has(enc.scale?.type)
                && (enc.axis?.tickCount ?? enc.axis?.values) == null) {
                const decades = decadeTicks(table, enc.field);
                if (decades) {
                    enc.axis = { ...(enc.axis ?? {}), values: decades };
                    if (!saidGrid) {
                        say(`axes.${channel}.grid`,
                            `the ${enc.scale.type} scale offers a line at every step of every decade — the grid is cut back to the ${decades.length} it can label`);
                        saidGrid = true;
                    }
                }
            }

            // A tick between two observations names a value the chart does not
            // hold: an axis of Olympic years does not have a 2014. Where the
            // house asks for the values the data carries, the axis is stepped
            // by what the data is actually spaced by.
            if (axis.indexing && axis.tickLabels && axis.tickLabels !== 'all'
                && enc.axis?.values == null && enc.axis?.tickCount == null) {
                const size = channel === 'x' ? (node.width ?? spec.width) : (node.height ?? spec.height);
                const span = typeof size === 'number' ? size : (channel === 'x' ? 600 : 300);
                const fontSize = axis.label.fontSize ?? 10;
                if (enc.type === 'temporal') {
                    // Stating dates outright costs the renderer the format it
                    // would have inferred — "1960" becomes "04 PM" — so a
                    // format comes with them. Where the dates are not plain
                    // calendar dates, an interval and a step say the same
                    // thing without risking a timezone.
                    const dates = observedDates(table, enc.field, axis.tickLabels, span, fontSize);
                    if (dates) {
                        enc.axis = { ...(enc.axis ?? {}), values: dates.values, format: dates.format };
                        // The dates were read as UTC; the scale has to agree,
                        // or a tick lands hours off its own observation and
                        // the last one falls outside the domain entirely.
                        enc.scale = { ...(enc.scale ?? {}), type: 'utc' };
                        if (!saidTicks) {
                            say(`axes.${channel}.tickLabels`,
                                `${axis.tickLabels} labels — the axis is ticked at ${dates.values.length} of the dates the data holds, not at round numbers between them`);
                            saidTicks = true;
                        }
                    } else {
                        const every = temporalStep(table, enc.field, span, fontSize);
                        if (every) {
                            enc.axis = { ...(enc.axis ?? {}), tickCount: every };
                            if (!saidTicks) {
                                say(`axes.${channel}.tickLabels`,
                                    `${axis.tickLabels} labels — the axis is stepped every ${every.step} ${every.interval}${every.step === 1 ? '' : 's'}, which is how the data is spaced`);
                                saidTicks = true;
                            }
                        }
                    }
                } else if (enc.type === 'quantitative') {
                    const values = observedTicks(table, enc.field, axis.tickLabels, span, fontSize);
                    if (values) {
                        enc.axis = { ...(enc.axis ?? {}), values };
                        if (!saidTicks) {
                            say(`axes.${channel}.tickLabels`,
                                `${axis.tickLabels} labels — the axis is ticked at the ${values.length} values the data holds, not at round numbers between them`);
                            saidTicks = true;
                        }
                    }
                }
            }

            // The unit has to be written somewhere. A house that drops axis
            // titles has taken away the usual place, so it says where else —
            // on every tick, or once at the end of the ruler.
            const unit = axis.unit;
            if (unit && unit.where !== 'never' && axis.label.show !== false
                && (enc.type === 'quantitative' || enc.axis?.values != null)) {
                const tagged = tagWithUnit(enc.axis?.labelExpr, unit.text, unit.where);
                enc.axis = { ...(enc.axis ?? {}), labelExpr: tagged };
                if (!saidUnit) {
                    say(`axes.${channel}.unit`,
                        unit.where === 'everyTick'
                            ? `every label carries its unit — \`${unit.text}\` — because the house prints no axis title to hold it`
                            : `the unit \`${unit.text}\` rides on the ${unit.where === 'firstTick' ? 'first' : unit.where === 'firstAndLast' ? 'first and last' : 'last'} label, where the ruler ends`);
                    saidUnit = true;
                }
            }
        });
    }
}

/**
 * True when the axis holds discrete positions — names, not numbers. Only such
 * an axis is a floor the marks stand on; a continuous one is a ruler, and its
 * rule is the edge of the window.
 */
function bandedAxis(spec: any, channel: 'x' | 'y'): boolean {
    let banded = false;
    walk(spec, (node) => {
        const enc = node.encoding?.[channel];
        if (!enc?.field) return;
        if (enc.type === 'nominal' || enc.type === 'ordinal') banded = true;
    });
    return banded;
}

/**
 * True when the *other* axis is a window on the data rather than a scale from
 * zero — the template said `zero: false`, or pinned a domain that does not
 * reach it. Nothing on such a chart is measured from the axis line.
 *
 * `zero: false` is not the last word, though: a lollipop turns it off so the
 * dots are not squashed against the top, then hangs every stem from
 * `datum: 0`. A mark that reaches the base *puts* the base on the page,
 * whatever the scale asked for, and the rule under it is the floor those stems
 * land on.
 */
function floatingValueScale(spec: any, indexChannel: 'x' | 'y'): boolean {
    const other = indexChannel === 'x' ? 'y' : 'x';
    let floating = false;
    let seen = false;
    let anchored = false;
    walk(spec, (node) => {
        const enc = node.encoding?.[other];
        const end = node.encoding?.[`${other}2`];
        if (enc?.datum === 0 || end?.datum === 0) anchored = true;
        if (!enc?.field || enc.type === 'nominal' || enc.type === 'ordinal') return;
        seen = true;
        const scale = enc.scale;
        if (scale?.zero === false) floating = true;
        if (Array.isArray(scale?.domain) && typeof scale.domain[0] === 'number' && scale.domain[0] > 0) floating = true;
    });
    return seen && floating && !anchored;
}

/**
 * A rule where the value axis crosses zero.
 *
 * Zero only earns its own line when it is *inside* the plot: on a chart of
 * lengths it sits at the edge and the axis rule already states it, and on a
 * scale that never changes sign it is not a crossing but a corner. So the rule
 * is drawn only where the field runs both ways.
 */
function applyZeroRule(spec: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): void {
    let said = false;
    for (const channel of ['x', 'y'] as const) {
        const axis = d.axes[channel];
        const zero = axis?.zeroRule;
        if (!zero?.show) continue;
        for (const body of plotBodies(spec)) {
            const enc = (body.encoding?.[channel]) ?? body.layer?.[0]?.encoding?.[channel];
            const field = enc?.field;
            if (!field || enc.type === 'nominal' || enc.type === 'ordinal') continue;
            let min = Infinity;
            let max = -Infinity;
            for (const row of table ?? []) {
                const v = Number(row?.[field]);
                if (!Number.isFinite(v)) continue;
                if (v < min) min = v;
                if (v > max) max = v;
            }
            if (!(min < 0 && max > 0)) continue;
            const rule = {
                data: { values: [{}] },
                mark: {
                    type: 'rule',
                    color: zero.color,
                    strokeWidth: zero.width ?? 1,
                    ...(zero.dash ? { strokeDash: zero.dash } : {}),
                },
                encoding: { [channel]: { datum: 0 } },
            };
            // `appendLayer` turns a unit into a layer *and* promotes a
            // `facet`/`row`/`column` split to a real operator wrapping the
            // layer — Vega-Lite drops that split if it is left inside a layer's
            // encoding, which silently un-facets the chart.
            appendLayer(body, rule);
            if (!said) {
                say('structure.grid.zero', 'the measure changes sign inside the plot — zero is drawn as its own rule, not as one gridline among the rest');
                said = true;
            }
        }
    }
}

/**
 * The decades a field spans, for a log axis whose grid must be nameable.
 * Returns `undefined` when the data is not readable from the spec or the span
 * is too short to be worth thinning.
 */
function decadeTicks(table: any[], field: string | undefined): number[] | undefined {
    if (!field || !Array.isArray(table) || table.length === 0) return undefined;
    let min = Infinity;
    let max = -Infinity;
    for (const row of table) {
        const v = Number(row?.[field]);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    const lo = Math.floor(Math.log10(min));
    const hi = Math.ceil(Math.log10(max));
    if (hi - lo < 2) return undefined;
    const out: number[] = [];
    for (let k = lo; k <= hi; k++) out.push(10 ** k);
    return out;
}

/**
 * The values a field actually holds, for an index axis that should be ticked
 * at observations rather than at round numbers between them.
 *
 * Returns `undefined` when there is nothing to improve on: too few values to
 * matter, or so many that stating them all would be a worse fence than the
 * renderer's own choice.
 */
const MAX_OBSERVED_TICKS = 30;

function observedTicks(
    table: any[],
    field: string | undefined,
    mode: 'observed' | 'endpoints' | 'sparse',
    span: number,
    fontSize: number,
): any[] | undefined {
    if (!field || !Array.isArray(table) || table.length === 0) return undefined;
    const seen = new Map<string, any>();
    for (const row of table) {
        const v = row?.[field];
        if (v == null) continue;
        const k = String(v);
        if (!seen.has(k)) seen.set(k, v);
    }
    const values = [...seen.values()];
    if (values.length < 2 || values.length > MAX_OBSERVED_TICKS) return undefined;
    values.sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a) < String(b) ? -1 : 1;
    });
    if (mode === 'endpoints') return [values[0], values[values.length - 1]];

    // Every label needs its own width. Where there is not room for all of
    // them, take every k-th — and keep the last, which is where a reader
    // looks for "now".
    const widest = Math.max(...values.map((v) => String(v).length));
    const room = Math.max(2, Math.floor(span / (widest * fontSize * 0.6 + 10)));
    if (values.length <= room) return values;
    const step = Math.ceil((values.length - 1) / (room - 1));
    if (step <= 1) return values;
    const out: any[] = [];
    for (let i = 0; i < values.length; i += step) out.push(values[i]);
    if (out[out.length - 1] !== values[values.length - 1]) out.push(values[values.length - 1]);
    return out;
}

const DAY_MS = 86400000;
const MONTH_MS = 30.44 * DAY_MS;
const YEAR_MS = 365.25 * DAY_MS;

/** Signs that go before the number rather than after it. */
const PREFIX_UNITS = new Set(['$', '£', '€', '¥', '₹', '₩', 'R$', 'US$', 'A$', 'CA$', 'CHF']);

/**
 * A label expression that writes the unit onto the ticks the house asked for.
 *
 * Builds on whatever expression is already there — flint's own number format
 * may have written one — because that expression *is* the label, and the unit
 * goes outside it.
 */
function tagWithUnit(
    existing: string | undefined,
    unit: string,
    where: 'firstTick' | 'lastTick' | 'firstAndLast' | 'everyTick',
): string {
    const label = existing ? `(${existing})` : 'datum.label';
    // `10%` but `420 ppm` — a symbol sits against the number, a word does not.
    const quoted = JSON.stringify(/^[A-Za-z]/.test(unit) ? ` ${unit}` : unit);
    const tagged = PREFIX_UNITS.has(unit)
        ? `${quoted} + ${label}`
        : `${label} + ${quoted}`;
    if (where === 'everyTick') return tagged;
    const at = where === 'firstTick' ? 'datum.index === 0'
        : where === 'lastTick' ? 'datum.index === 1'
            : 'datum.index === 0 || datum.index === 1';
    return `${at} ? ${tagged} : ${label}`;
}

/** The field a unit-bearing label reads from. */
const UNIT_LABEL_FIELD = '__flintValueWithUnit';

/**
 * Print a value with its unit — `65%`, `$4.2bn`.
 *
 * Vega-Lite can format a number or write a literal, never both, and it takes no
 * expression on a `text` channel. So the label is computed once for the whole
 * plot body and the text layer simply reads the new field.
 */
function printWithUnit(body: any, node: any, field: string, format: string | undefined, unit: string): void {
    const value = `datum[${JSON.stringify(field)}]`;
    const shown = format ? `format(${value}, ${JSON.stringify(format)})` : `${value} + ''`;
    const quoted = JSON.stringify(/^[A-Za-z]/.test(unit) ? ` ${unit}` : unit);
    const calculate = PREFIX_UNITS.has(unit) ? `${quoted} + ${shown}` : `${shown} + ${quoted}`;
    const transform = (body.transform ??= []);
    if (!transform.some((t: any) => t.as === UNIT_LABEL_FIELD)) transform.push({ calculate, as: UNIT_LABEL_FIELD });
    node.encoding.text = { field: UNIT_LABEL_FIELD, type: 'nominal' };
}

/**
 * The unit on values the *template* printed.
 *
 * Where a template already writes a number beside every mark, the theme leaves
 * the label alone — but the house's unit still has nowhere else to go, and a
 * bare `65` beside a slice is not the same statement as `65%`.
 */
function applyPrintedUnits(spec: any, d: DesignDecisions, say: (p: string, m: string) => void): void {
    const unit = d.dataLabels.unit;
    if (!unit) return;
    let said = false;
    for (const body of plotBodies(spec)) {
        for (const node of (body.layer ?? [body])) {
            if (markTypeOf(node.mark) !== 'text') continue;
            const text = node.encoding?.text;
            // Only numbers take a unit: a name printed at the end of a line is
            // already a word, and a label already reading the computed field
            // says what it means.
            if (!text?.field || text.type !== 'quantitative') continue;
            printWithUnit(body, node, text.field, text.format ?? d.dataLabels.format, unit);
            if (!said) {
                say('annotation.unit',
                    `each printed value carries its unit \`${unit}\` — there is no axis left to state it on`);
                said = true;
            }
        }
    }
}

/** `2012`, `2012-07`, `2012-07-27` — a date with no time and no zone in it. */
const CALENDAR_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * The dates the data actually holds, as Vega-Lite `DateTime` objects.
 *
 * Only for fields written as plain calendar dates: those are read as UTC, so
 * the calendar fields can be handed back untouched and cannot drift by an
 * offset — provided the scale is told to keep UTC too, which is why the caller
 * also sets `scale.type`. A format comes with them, because an axis given
 * explicit values loses the one the renderer would have inferred and falls
 * back to clock time.
 */
function observedDates(
    table: any[],
    field: string | undefined,
    mode: 'observed' | 'endpoints' | 'sparse',
    span: number,
    fontSize: number,
): { values: Record<string, number | boolean>[]; format: string } | undefined {
    if (!field || !Array.isArray(table) || table.length === 0) return undefined;
    const seen = new Set<string>();
    for (const row of table) {
        const v = row?.[field];
        if (typeof v !== 'string' || !CALENDAR_DATE.test(v)) return undefined;
        seen.add(v);
    }
    const dates = [...seen].sort();
    if (dates.length < 2 || dates.length > MAX_OBSERVED_TICKS) return undefined;

    const parts = dates.map((s) => s.match(CALENDAR_DATE)!);
    const grain = parts.every((p) => p[2] == null) ? 'year'
        : parts.every((p) => p[3] == null) ? 'month' : 'day';
    const format = grain === 'year' ? '%Y' : grain === 'month' ? '%b %Y' : '%b %-d';
    const width = (grain === 'year' ? 4 : grain === 'month' ? 8 : 6) * fontSize * 0.6 + 10;

    let kept = parts;
    if (mode === 'endpoints') {
        kept = [parts[0], parts[parts.length - 1]];
    } else {
        const room = Math.max(2, Math.floor(span / width));
        if (parts.length > room) {
            const step = Math.ceil((parts.length - 1) / (room - 1));
            kept = parts.filter((_, i) => i % step === 0);
            if (kept[kept.length - 1] !== parts[parts.length - 1]) kept.push(parts[parts.length - 1]);
        }
    }
    const values = kept.map((p) => {
        const dt: Record<string, number | boolean> = { year: Number(p[1]), utc: true };
        if (grain !== 'year') dt.month = Number(p[2]);
        if (grain === 'day') dt.date = Number(p[3]);
        return dt;
    });
    return { values, format };
}

/**
 * How a temporal index axis is spaced, as an interval and a step — Olympic
 * years are every 4 years, a monthly series is every month. Thinned to what
 * the span can label. `undefined` when the dates are not evenly spaced enough
 * for a step to be honest.
 */
function temporalStep(
    table: any[],
    field: string | undefined,
    span: number,
    fontSize: number,
): { interval: 'year' | 'month' | 'day'; step: number } | undefined {
    if (!field || !Array.isArray(table) || table.length === 0) return undefined;
    const stamps = new Set<number>();
    for (const row of table) {
        const v = row?.[field];
        if (v == null) continue;
        const t = v instanceof Date ? v.getTime() : new Date(v as any).getTime();
        if (Number.isFinite(t)) stamps.add(t);
    }
    const sorted = [...stamps].sort((a, b) => a - b);
    if (sorted.length < 3 || sorted.length > MAX_OBSERVED_TICKS) return undefined;

    let gap = Infinity;
    for (let i = 1; i < sorted.length; i++) gap = Math.min(gap, sorted[i] - sorted[i - 1]);
    let interval: 'year' | 'month' | 'day';
    let unit: number;
    if (gap >= YEAR_MS * 0.9) { interval = 'year'; unit = YEAR_MS; }
    else if (gap >= MONTH_MS * 0.9) { interval = 'month'; unit = MONTH_MS; }
    else if (gap >= DAY_MS * 0.9) { interval = 'day'; unit = DAY_MS; }
    else return undefined;
    let step = Math.max(1, Math.round(gap / unit));

    // Labels need their own width; where there is not room for one per
    // observation the step multiplies.
    const width = (interval === 'year' ? 4 : 8) * fontSize * 0.6 + 10;
    const room = Math.max(2, Math.floor(span / width));
    const count = Math.round((sorted[sorted.length - 1] - sorted[0]) / (unit * step)) + 1;
    if (count > room) step *= Math.ceil(count / room);
    return { interval, step };
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
 * A dash that carries a *distinction* — observed against projected — has to
 * survive the house's line style. A rounded cap extends every segment by half
 * the stroke width at each end, so at the widths a display theme likes, the
 * default dash pattern closes up into a solid line. Where `strokeDash` is
 * encoded, the cap goes square and the pattern is scaled to the stroke.
 */
function protectDashEncoding(spec: any, config: any, strokeWidth: number): void {
    let dashed = false;
    walk(spec, (node) => {
        if (node.encoding?.strokeDash?.field) dashed = true;
    });
    if (!dashed) return;
    config.line = { ...config.line, strokeCap: 'butt' };
    const w = Math.max(1, strokeWidth);
    const range = [[1, 0], [w * 3, w * 2], [w * 1.2, w * 1.2], [w * 5, w * 2, w * 1.2, w * 2]];
    walk(spec, (node) => {
        const enc = node.encoding?.strokeDash;
        if (!enc?.field || enc.scale?.range) return;
        enc.scale = { ...(enc.scale ?? {}), range };
    });
}

function applyMarks(spec: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): void {
    const config = spec.config;
    const m = d.marks;

    config.line = { ...(config.line ?? {}), strokeWidth: m.strokeWidth };
    config.trail = { ...(config.trail ?? {}), size: m.strokeWidth };
    if (m.strokeCap) { config.line.strokeCap = m.strokeCap; config.rule = { ...(config.rule ?? {}), strokeCap: m.strokeCap }; }
    if (m.strokeJoin) config.line.strokeJoin = m.strokeJoin;
    if (m.interpolate) config.line.interpolate = m.interpolate;
    if (m.fillOpacity != null) config.area = { ...(config.area ?? {}), fillOpacity: m.fillOpacity };
    protectDashEncoding(spec, config, m.strokeWidth);

    if (m.point?.show) {
        config.line.point = {
            filled: m.point.filled !== false,
            size: m.point.size ?? 24,
            ...(m.point.haloColor ? { stroke: m.point.haloColor, strokeWidth: m.point.haloWidth ?? 1 } : {}),
        };        // A point on a line marks a reading. A fitted line has no readings —
        // it is sampled wherever the fit needs sampling, which for a straight
        // one is the two ends — so a point at each vertex claims two
        // observations that were never made, sitting exactly on the model.
        let saidFit = false;
        walk(spec, (node) => {
            if (!LINE_MARKS.has(markTypeOf(node.mark) ?? '')) return;
            if (!(node.transform ?? []).some((t: any) => t?.regression || t?.loess)) return;
            node.mark = { ...normalizeMark(node.mark), point: false };
            if (!saidFit) {
                say('marks.point', 'the fitted line keeps no vertex points — its vertices are where the fit was sampled, not where anything was measured');
                saidFit = true;
            }
        });

        // Dots are worth drawing while they are still countable. A house that
        // marks its readings means the handful a reader could point at one by
        // one; past that the dots touch, fuse into a beaded rope, and hide the
        // shape of the very line they sit on — a step curve with one vertex
        // per observation is thirty dots along a curve nobody can now follow.
        // A spec that asked for points itself keeps them; this only decides
        // whether the *house* adds them where the chart never asked.
        let saidCrowd = false;
        walk(spec, (node) => {
            if (!LINE_MARKS.has(markTypeOf(node.mark) ?? '')) return;
            const mark = normalizeMark(node.mark);
            if (mark.point !== undefined) return;
            const enc = mergedEncoding(node, spec.encoding);
            const readings = maxReadingsPerSeries(enc, table);
            if (readings <= MAX_DOTTED_READINGS) return;
            node.mark = { ...mark, point: false };
            if (!saidCrowd) {
                say('marks.point',
                    `${readings} readings on one line is past the ${MAX_DOTTED_READINGS} a reader can take one at a time, so the house's dots stand down and the line keeps its shape`);
                saidCrowd = true;
            }
        });
    }

    // The ring of page around a dot is settled in `config.line.point` for the
    // lines the house dotted itself. A chart that asked for its own vertices
    // — a bump, a slope — carries `point: true` on the mark, and a bare
    // `true` takes the renderer's dot and none of the house's, so the ring
    // has to be written onto those marks by hand.
    if (m.point?.haloColor) {
        const dot = m.point;
        walk(spec, (node) => {
            if (!LINE_MARKS.has(markTypeOf(node.mark) ?? '')) return;
            const mark = normalizeMark(node.mark);
            if (!mark.point) return;
            mark.point = {
                ...(typeof mark.point === 'object' ? mark.point : {}),
                ...(dot.filled != null ? { filled: dot.filled } : {}),
                ...(dot.size != null ? { size: dot.size } : {}),
                stroke: dot.haloColor,
                strokeWidth: dot.haloWidth ?? 1,
            };
            node.mark = mark;
        });
    }
    // The same size wherever a dot is drawn — and `config.point` alone does
    // not reach them all: `circle` and `square` are their own mark types with
    // their own config blocks, and most scatters are drawn as one of those, so
    // a house that sized only `point` silently missed every scatter it had.
    if (m.point?.size != null || m.point?.filled != null) {
        for (const family of ['point', 'circle', 'square'] as const) {
            config[family] = {
                ...(config[family] ?? {}),
                ...(m.point.size != null ? { size: m.point.size } : {}),
                filled: m.point.filled !== false,
            };
        }
        if (m.point.size != null) {
            say('marks.point.size',
                `a dot is drawn at ${m.point.size}px² wherever one is drawn — the house's size, not the renderer's, and the layout may still shrink it`);
        }
    }

    // Band occupancy is a scale decision, not a mark size: expressing it as
    // padding keeps grouped and simple bars consistent and leaves the layout
    // engine's step untouched.
    //
    // The positional encoding a mark reads is not always its own — a layered
    // template states the category once on the parent and lets every layer
    // inherit it. The scale lives wherever the encoding was written, so the
    // walk has to carry what it inherited or a house's bar width silently
    // misses every layered chart.
    const paddingInner = clamp(1 - m.bandFraction, 0, 0.9);
    let saidCells = false;
    let saidBand = false;
    const bandWalk = (node: any, inherited: any): void => {
        if (!node || typeof node !== 'object') return;
        const enc = mergedEncoding(node, inherited);
        const mark = markTypeOf(node.mark);
        if (mark === 'bar' || mark === 'rect' || mark === 'boxplot') {
            const discrete = (['x', 'y'] as const).filter((channel) => {
                const t = enc[channel]?.type;
                return enc[channel]?.field && (t === 'nominal' || t === 'ordinal');
            });
            // A rect with a category on *both* axes is a cell in a grid, not a
            // bar in a row: the cell is the band, and a house's bar thickness
            // says nothing about it. Thinning it here opens gaps in what should
            // read as a continuous surface, and how big the cell is was settled
            // by the layout, which is the only pass that knows the room.
            if (mark === 'rect' && discrete.length === 2) {
                if (!saidCells) {
                    say('marks.bandFraction',
                        'the marks are cells in a grid, not bars in a row — band occupancy is a bar rule and does not apply');
                    saidCells = true;
                }
            } else if (mark === 'bar' && discrete.length === 0
                && typeof (node.mark as any)?.size === 'number'
                && continuousBandedBar(enc)) {
                // A bar on a continuous-banded axis (a year, a date) has no band
                // scale to carry `paddingInner`, so the pixel width the layout
                // already cut — `step × CONTINUOUS_BAR_STEP_FILL`, capped so the
                // closest pair never touches — is the only handle. Re-scale it
                // to the house's fill: dividing out the baseline recovers the
                // step, and every house asks for a thinner bar than the
                // baseline, so re-cutting can only widen the gap, never collide.
                const current = (node.mark as any).size as number;
                const resized = Math.max(1, Math.round(current * m.bandFraction / CONTINUOUS_BAR_STEP_FILL));
                if (resized !== current) {
                    node.mark = { ...normalizeMark(node.mark), size: resized };
                    if (!saidBand) {
                        say('marks.bandFraction',
                            `bars on a continuous axis are re-cut to ${Math.round(m.bandFraction * 100)}% of the step`);
                        saidBand = true;
                    }
                }
            } else {
                for (const channel of discrete) {
                    const target = node.encoding?.[channel] ?? inherited?.[channel];
                    if (!target) continue;
                    target.scale = { ...(target.scale ?? {}), paddingInner };
                }
                // Dodged bars carry a second band inside each group — the
                // offset. A house gap that only narrows the group leaves the
                // lanes touching, so the offset has to take the same fill.
                const offset = enc.xOffset ?? enc.yOffset;
                const offsetCh = enc.xOffset?.field ? 'xOffset' : enc.yOffset?.field ? 'yOffset' : undefined;
                const offsetDiscrete = !!offsetCh && (offset?.type === 'nominal' || offset?.type === 'ordinal');
                const offsetLocal = !!offsetCh && offset?.type === 'quantitative';
                const sizedMark = typeof (node.mark as any)?.size === 'number' && mark !== 'boxplot';
                if (offsetDiscrete && mark !== 'boxplot') {
                    // Native dodge: the lanes are a band scale of their own, so
                    // the gap lives on the offset scale, not on any pixel size.
                    const offTarget = node.encoding?.[offsetCh!] ?? inherited?.[offsetCh!];
                    if (offTarget) {
                        offTarget.scale = { ...(offTarget.scale ?? {}), paddingInner };
                        if (!saidBand) {
                            say('marks.bandFraction',
                                `dodged lanes fill ${Math.round(m.bandFraction * 100)}% of their slot`);
                            saidBand = true;
                        }
                    }
                } else if (sizedMark && offsetLocal) {
                    // Local dodge: the template pinned each lane to
                    // LOCAL_DODGE_LANE_FILL of its pitch. Re-scale to the house's
                    // fill — recomputing from the band step would spread one
                    // bar across the whole band and overlap the lanes.
                    const current = (node.mark as any).size as number;
                    const resized = Math.max(1, Math.round(current * m.bandFraction / LOCAL_DODGE_LANE_FILL));
                    if (resized !== current) {
                        node.mark = { ...normalizeMark(node.mark), size: resized };
                        if (!saidBand) {
                            say('marks.bandFraction',
                                `dodged lanes are re-cut to ${Math.round(m.bandFraction * 100)}% of their pitch`);
                            saidBand = true;
                        }
                    }
                } else if (sizedMark && discrete[0]) {
                    // A simple bar pinned to a pixel width fixed the gap along
                    // with it. The house sets the gap, so the width moves too.
                    const step = bandStep(spec, node, enc, discrete[0], table);
                    if (step) {
                        node.mark = { ...normalizeMark(node.mark), size: Math.max(1, Math.round(step * m.bandFraction)) };
                        if (!saidBand) {
                            say('marks.bandFraction',
                                `the template pinned its bars to a pixel width — they are re-cut to ${Math.round(m.bandFraction * 100)}% of the band`);
                            saidBand = true;
                        }
                    }
                }
            }
        }
        // A box is a summary, and how much of its band it fills is a house
        // matter of its own: a wide box reads as a distribution, a narrow one
        // as a marker with error bars.
        if (mark === 'boxplot' && m.summary?.widthFraction != null) {
            const channel = (['x', 'y'] as const)
                .find((c) => enc[c]?.field && (enc[c]?.type === 'nominal' || enc[c]?.type === 'ordinal'));
            const lanes = laneCount(node, enc, table);
            const step = channel ? bandStep(spec, node, enc, channel, table) : undefined;
            if (step) {
                const size = Math.max(3, Math.round((step * m.summary.widthFraction) / lanes));
                node.mark = { ...normalizeMark(node.mark), size };
                say('marks.summary.widthFraction',
                    `the house fills ${Math.round(m.summary.widthFraction * 100)}% of the band with the box — ${size}px of a ${Math.round(step)}px band`);
            }
        }
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
            if (Array.isArray(node[key])) node[key].forEach((c: any) => bandWalk(c, enc));
        }
        if (node.spec) bandWalk(node.spec, enc);
        if (node.facet?.spec) bandWalk(node.facet.spec, enc);
    };
    bandWalk(spec, undefined);

    // A sized mark reads by area, and how much area the largest circle may take
    // is a house matter — a page of small multiples cannot spend what a full
    // page can.
    if (m.sizeRange || m.minSize != null) {
        let saidSize = false;
        walk(spec, (node) => {
            const enc = node.encoding?.size;
            if (!enc?.field || enc.type !== 'quantitative') return;
            enc.scale = {
                ...(enc.scale ?? {}),
                ...(m.sizeRange ? { range: m.sizeRange } : {}),
                ...(m.minSize != null && !m.sizeRange ? { rangeMin: m.minSize } : {}),
            };
            if (!saidSize && m.sizeRange) {
                say('marks.sizeRange',
                    `sized marks run from ${m.sizeRange[0]} to ${m.sizeRange[1]}px² — the house's range, not the renderer's`);
                saidSize = true;
            }
        });
    }

    if (m.separator?.show) {
        const plotW = spec.config?.view?.continuousWidth ?? spec._width ?? 300;
        const plotH = spec.config?.view?.continuousHeight ?? spec._height ?? 300;
        let saidThin = false;
        let sawStroke = false;
        let measureCh: 'x' | 'y' | undefined;
        walk(spec, (node) => {
            const mark = markTypeOf(node.mark);
            if (mark !== 'bar' && mark !== 'rect') return;
            if (isLiteralMark(node)) return;
            // A cell in a grid is not a bar in a row: it adjoins on both axes
            // and its fill is the reading, so how it is held apart is its own
            // decision, taken below.
            if (isGridCell(node, node.encoding ?? {})) return;
            // A separator is drawn on the bar's edge, so half its width is taken
            // out of the fill on each side. Once the bars are thinner than the
            // stroke — a ramp dodged into fifty lanes, say — the stroke paints
            // over the whole bar and the series vanishes. Leave those alone; the
            // density itself already reads as separation.
            const barW = estimateBarExtent(node, node.encoding ?? {}, table, plotW, plotH);
            if (barW < 2 * m.separator!.width) {
                if (!saidThin) {
                    say('marks.separator',
                        `bars are ${barW.toFixed(1)}px — too thin to hold a ${m.separator!.width}px separator, which would paint over them; left flush`);
                    saidThin = true;
                }
                return;
            }
            node.mark = { ...normalizeMark(node.mark), stroke: m.separator!.color, strokeWidth: m.separator!.width };
            sawStroke = true;
            // Which axis carries the measure is read off the bar, not off where
            // the encoding sits: a waterfall carries its category on the parent
            // layer and only the measure on the bar. The measure is the
            // quantitative channel (or the one that spans, x2/y2).
            const enc = node.encoding ?? {};
            if (enc.y?.type === 'quantitative' || enc.y2) measureCh = 'y';
            else if (enc.x?.type === 'quantitative' || enc.x2) measureCh = 'x';
            else if (enc.x?.field && enc.x.type !== 'quantitative') measureCh = 'y';
            else if (enc.y?.field && enc.y.type !== 'quantitative') measureCh = 'x';
        });
        if (sawStroke && measureCh) restoreBaseline(spec, measureCh, say);
    }

    if (m.tile) applyTileGap(spec, m.tile, say);

    if (m.slice) applySliceGap(spec, m.slice, table, say);
}

/**
 * A house that strokes its bars in the surface colour (datawrapper's white
 * hairline between stacked segments, swiss's paper gap) draws that stroke on
 * every edge of the bar — including the bottom edge, which sits *on* the
 * category baseline. Painted in the surface, it chops the axis domain line
 * into a dash under each bar. Raising the axis over the marks would fix it,
 * but Vega-Lite drops `zindex` off a config axis, so the domain stays behind.
 *
 * The baseline is furniture the bars rest on, so it is redrawn as its own rule
 * on top of them — the same way the zero rule is drawn last. It runs at the
 * measure's zero (where an all-positive bar meets the axis) in the band axis's
 * own domain ink, so it reads as the one continuous line it always was. A
 * house that draws no band domain has nothing to protect, so nothing is added;
 * a diverging chart already draws its zero rule on top, and this rule lands on
 * the same line.
 */
function restoreBaseline(spec: any, measureCh: 'x' | 'y', say: (p: string, m: string) => void): void {
    const bandCh = measureCh === 'y' ? 'x' : 'y';
    const axisCfg = spec.config?.[bandCh === 'x' ? 'axisX' : 'axisY'] ?? {};
    const color = axisCfg.domainColor;
    const width = axisCfg.domainWidth ?? 1;
    if (axisCfg.domain === false || !color || color === 'transparent' || width <= 0) return;
    let said = false;
    for (const body of plotBodies(spec)) {
        // Only a body that actually plots the measure gets a baseline — a
        // furniture rect or a header band carries no measured axis to chop.
        const layers: any[] = body.layer ?? [body];
        const carries = layers.some((l) => {
            const e = l.encoding?.[measureCh];
            return e?.field && e.type !== 'nominal' && e.type !== 'ordinal';
        });
        if (!carries) continue;
        appendLayer(body, {
            data: { values: [{}] },
            mark: { type: 'rule', color, strokeWidth: width },
            // Null the band channel so the rule spans the full plot and does
            // not inherit a shared category encoding (a waterfall binds `x` on
            // the parent layer; without this the rule's empty datum would add
            // an "undefined" band to the axis).
            encoding: { [measureCh]: { datum: 0 }, [bandCh]: null },
        });
        if (!said) {
            say('marks.separator',
                'the category baseline is redrawn over the bars so its edge strokes do not chop it into a dash');
            said = true;
        }
    }
}

/**
 * A cell of a grid — a heatmap, a calendar, a matrix. Both of its axes are
 * spent on position, so unlike a bar it has no free axis to be thinned along:
 * the gap has to be cut out of the shape. Binned axes count as discrete here,
 * because a binned rect is a cell whose category happens to be a range.
 */
function isGridCell(node: any, enc: any): boolean {
    if (markTypeOf(node.mark) !== 'rect') return false;
    const gridded = (['x', 'y'] as const).filter((channel) => {
        const e = enc[channel];
        if (!e?.field) return false;
        return e.type === 'nominal' || e.type === 'ordinal' || e.bin != null;
    });
    return gridded.length === 2;
}

/**
 * Cells are cut apart rather than spaced apart, for the same reason wedges
 * are: spacing them would mean shrinking the mark, and on a grid the mark's
 * extent is what says which month and which city the reading belongs to.
 *
 * A stroke straddles the edge it is drawn on, so a shared edge painted at
 * `gap` px opens a `gap`-wide channel between the two cells — half taken from
 * each, which keeps the grid's centres where the scale put them.
 */
function applyTileGap(
    spec: any,
    tile: NonNullable<DesignDecisions['marks']['tile']>,
    say: (p: string, m: string) => void,
): void {
    let said = false;
    const gridWalk = (node: any, inherited: any): void => {
        if (!node || typeof node !== 'object') return;
        const enc = mergedEncoding(node, inherited);
        if (!isLiteralMark(node) && isGridCell(node, enc)) {
            node.mark = { ...normalizeMark(node.mark), stroke: tile.color, strokeWidth: tile.gap };
            if (!said) {
                say('marks.tile',
                    `the cells are cut apart by ${tile.gap}px — the grid reads as a table of separate readings rather than one continuous field`);
                said = true;
            }
        }
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
            if (Array.isArray(node[key])) node[key].forEach((child: any) => gridWalk(child, enc));
        }
        if (node.spec) gridWalk(node.spec, enc);
        if (node.facet?.spec) gridWalk(node.facet.spec, enc);
    };
    gridWalk(spec, undefined);
}

/**
 * A connector draws the *distance* between two positions of one datum, and
 * both positions are already on the page. It is structure, not a series — so
 * it takes the house's structural ink, and it runs after the series ink has
 * been laid down so that the ink it takes is the one that stands.
 *
 * What it is worth, though, depends on what it joins, and that is a question
 * the spec answers without anyone naming a chart type:
 *
 *   - a **stem** ends at a constant — the baseline. The dot at its other end
 *     already carries the value, so the stem is only a path for the eye and
 *     is drawn at a hairline.
 *   - a **bridge** ends at another mark across the *measured* axis. Nothing
 *     else on the plot states the gap between men and women, before and
 *     after: the bridge *is* that reading, and a hairline asks the eye to
 *     measure something it can hardly see. It is drawn at a mark's weight.
 *   - a **lead** ends at another mark across the *categorical* axis, holding
 *     one value the whole way — a waterfall's step from one bar's top to
 *     where the next one starts. It carries no distance of its own; the two
 *     bar tops it touches already say where the level is. At a mark's weight
 *     it would be the heaviest line on a chart that is asking about the bars,
 *     so it is drawn at a hairline like the stem.
 */
function applyConnectors(spec: any, d: DesignDecisions, say: (p: string, m: string) => void): void {
    const c = d.marks.connector;
    if (!c?.show) return;

    const said = new Set<string>();
    let sawStem = false;
    const paint = (node: any, role: 'stem' | 'bridge' | 'lead'): void => {
        if (role === 'stem') sawStem = true;
        const mark = normalizeMark(node.mark);
        if (c.color) mark.color = c.color;
        mark.strokeWidth = role === 'bridge' ? c.spanWidth : c.width;
        if (c.dash) mark.strokeDash = c.dash;
        node.mark = mark;
        if (said.has(role)) return;
        said.add(role);
        const why = {
            bridge: `the bridge is drawn at ${c.spanWidth}px in structural ink — the distance it spans is the reading, so it carries a mark's weight and none of a series' colour`,
            stem: `the stem is drawn at ${c.width}px in structural ink — it leads the eye to the axis and states nothing the dot's position has not`,
            lead: `the lead line is drawn at ${c.width}px in structural ink — it runs across the categories at one level, and the two mark ends it touches already state that level`,
        }[role];
        say('marks.connector', why);
    };

    const bandWalk = (node: any, inherited: any): void => {
        if (!node || typeof node !== 'object') return;
        const enc = mergedEncoding(node, inherited);
        const type = markTypeOf(node.mark);
        const own = node.encoding ?? {};
        if (!isLiteralMark(node)) {
            if (type === 'rule') {
                // One end is written on the mark; the other is where it stops.
                // If it stops at a number, it stops at the baseline. If it
                // stops at another mark, which axis it crossed to get there
                // decides whether the crossing was the reading.
                const along = (own.x2 ?? enc.x2) ? 'x' : (own.y2 ?? enc.y2) ? 'y' : undefined;
                const end = along === 'x' ? (own.x2 ?? enc.x2) : along === 'y' ? (own.y2 ?? enc.y2) : undefined;
                if (end) {
                    const start = along === 'x' ? (own.x ?? enc.x) : (own.y ?? enc.y);
                    const acrossCategories = start?.type === 'nominal' || start?.type === 'ordinal';
                    paint(node, !end.field ? 'stem' : acrossCategories ? 'lead' : 'bridge');
                }
            } else if (type === 'line') {
                // A line grouped by the field the categorical axis already
                // names draws one segment inside each band, not one series
                // across them: it joins that band's own marks.
                const key = own.detail?.field ?? enc.detail?.field;
                const band = (['x', 'y'] as const)
                    .map((ch) => enc[ch])
                    .find((e: any) => e?.field && (e.type === 'nominal' || e.type === 'ordinal'));
                if (key && band?.field === key) paint(node, 'bridge');
            }
        }
        for (const k of ['layer', 'vconcat', 'hconcat', 'concat']) {
            if (Array.isArray(node[k])) node[k].forEach((child: any) => bandWalk(child, enc));
        }
        if (node.spec) bandWalk(node.spec, enc);
        if (node.facet?.spec) bandWalk(node.facet.spec, enc);
    };
    bandWalk(spec, undefined);

    // A lollipop's category axis is a point scale — its dots have no width, so
    // Vega-Lite's default `pointPadding` of 0.5 leaves the first and last dot
    // only half a step from the axis while every neighbour sits a full step
    // apart. On a bar that half-step is right (a bar fills toward the edge);
    // on a zero-width dot it reads as cramped against the spine. Widen the
    // outer padding so the end dots stand off the axis by the same gap they
    // keep from each other. Scoped to a chart that actually hangs stems, and
    // to the point scale only (the measured axis is linear), so nothing else
    // moves; a house or template that pinned its own padding keeps it.
    if (sawStem) {
        const config = (spec.config ??= {});
        const scale = (config.scale ??= {});
        if (scale.pointPadding == null) {
            scale.pointPadding = LOLLIPOP_CATEGORY_PADDING;
            say('config.scale.pointPadding',
                `the lollipop's end dots are stood off the category axis by a full step (pointPadding ${LOLLIPOP_CATEGORY_PADDING}) so they are not cramped against the spine`);
        }
    }
}

/** Outer padding for a lollipop's category point scale: end dots stand a full
 *  inter-item gap off the axis instead of Vega-Lite's default half-step. */
const LOLLIPOP_CATEGORY_PADDING = 1;

/**
 * How far a mark reaches from the point it is anchored at. Only the round
 * marks have one; a bar, an area or a line is drawn *to* its anchor, so the
 * anchor is already the edge.
 *
 * Vega-Lite states a point's `size` as an area in px², which is how the size
 * channel is read as well — so the radius is the same conversion in both.
 */
const POINT_MARKS = new Set(['point', 'circle', 'square']);
function markRadius(node: any, spec: any, d: DesignDecisions): number {
    const type = markTypeOf(node.mark) ?? '';
    if (!POINT_MARKS.has(type)) return 0;
    const area = normalizeMark(node.mark)?.size
        ?? node.encoding?.size?.scale?.range?.[1]
        ?? spec.config?.[type]?.size
        ?? spec.config?.point?.size
        ?? d.marks.point?.size
        ?? 30;
    return typeof area === 'number' ? Math.round(Math.sqrt(area / Math.PI)) : 0;
}

/**
 * Wedges are cut apart rather than spaced apart: a pie has no band to give
 * back, so the gap has to come out of the shape itself — either painted over
 * the shared edge or opened by swinging the two arcs away from each other.
 */
function applySliceGap(
    spec: any,
    slice: NonNullable<DesignDecisions['marks']['slice']>,
    table: any[],
    say: (p: string, m: string) => void,
): void {
    let said = false;
    walk(spec, (node) => {
        if (markTypeOf(node.mark) !== 'arc') return;
        if (isLiteralMark(node)) return;
        const mark = normalizeMark(node.mark);

        if (slice.style === 'pad') {
            const radius = arcRadius(node, spec, mark);
            if (!radius) return;
            // A gap is a gap only while there is a wedge left on either side of
            // it. Five slices at 2px cost the circle almost nothing; forty cost
            // it the pie. The house's width is honoured until the gaps would
            // take a sixth of the circumference between them, and held there.
            const enc = node.encoding ?? {};
            const slices = distinctCount(table, enc.color?.field ?? enc.theta?.field);
            const wanted = slice.gap / radius;
            const room = slices ? (2 * Math.PI * 0.15) / slices : wanted;
            mark.padAngle = Math.min(wanted, room);
            if (!said) {
                say('marks.slice.gap', wanted > room
                    ? `${slices} wedges cannot each give up ${slice.gap}px and still be wedges — the gap is held at ${(room * radius).toFixed(1)}px`
                    : `the wedges stand ${slice.gap}px apart at the rim`);
                said = true;
            }
        } else {
            mark.stroke = slice.color;
            mark.strokeWidth = slice.gap;
            // Wedges taper to a point at the hub; a mitred stroke on those acute
            // tips shoots a spike past the centre (worse the thinner the slice).
            // Round the join so the rule stays a rule all the way to the middle.
            mark.strokeJoin = 'round';
            if (!said) {
                say('marks.slice.gap',
                    `a ${slice.gap}px rule cuts the wedges apart — two arcs of the same size read as two shapes, not one`);
                said = true;
            }
        }
        node.mark = mark;
    });
}

/**
 * How far the wedge reaches. Stated on the mark where a template pinned it;
 * otherwise Vega-Lite fills the smaller side of the plot.
 */
function arcRadius(node: any, spec: any, mark: any): number | undefined {
    if (typeof mark.outerRadius === 'number') return mark.outerRadius;
    const w = typeof node.width === 'number' ? node.width : spec.width;
    const h = typeof node.height === 'number' ? node.height : spec.height;
    if (typeof w !== 'number' || typeof h !== 'number') return undefined;
    return Math.min(w, h) / 2;
}

/**
 * A mark placed entirely in pixels — every channel a literal value, no field
 * and no datum — is not a series. It is furniture the template drew itself: a
 * card, a track, a badge. It carries no value, so a separator between "its
 * segments" is a line across nothing, and the house's series ink says nothing
 * about it either.
 */
function isLiteralMark(node: any): boolean {
    const enc = node?.encoding;
    if (!enc || typeof enc !== 'object') return false;
    const channels = Object.values(enc) as any[];
    if (channels.length === 0) return false;
    return channels.every((e) => e && typeof e === 'object' && e.field == null && e.datum === undefined);
}

function normalizeMark(mark: any): any {
    return typeof mark === 'string' ? { type: mark } : { ...mark };
}

/** Distinct values a field takes in the data behind the chart. */
function distinctCount(table: any[], field: string | undefined): number {
    if (!field || !Array.isArray(table)) return 0;
    const seen = new Set<string>();
    for (const row of table) {
        const v = row?.[field];
        if (v != null) seen.add(String(v));
    }
    return seen.size;
}

/** How many dots one line can carry before they stop being countable. */
const MAX_DOTTED_READINGS = 12;

/**
 * The longest single line in the plot, counted in readings.
 *
 * A reading is one position along the line, so it is the distinct values of
 * the field on the continuous axis, taken within one series — the series
 * being whatever splits the line into more than one: colour, detail, a dash.
 * Rows would be the wrong count, since an aggregated line draws one vertex
 * from many rows.
 */
function maxReadingsPerSeries(enc: any, table: any[]): number {
    if (!Array.isArray(table) || table.length === 0) return 0;

    const along = (['x', 'y'] as const)
        .map((ch) => enc?.[ch])
        .find((e: any) => e?.field && e.type !== 'nominal' && e.type !== 'ordinal')
        ?? enc?.x;
    if (!along?.field) return 0;

    const keys = ['color', 'detail', 'strokeDash', 'shape']
        .map((ch) => enc?.[ch]?.field)
        .filter((f: any): f is string => typeof f === 'string' && f !== along.field);

    const perSeries = new Map<string, Set<string>>();
    for (const row of table) {
        const v = row?.[along.field];
        if (v == null) continue;
        const key = keys.map((f) => String(row?.[f])).join('\u0000');
        let seen = perSeries.get(key);
        if (!seen) perSeries.set(key, seen = new Set());
        seen.add(String(v));
    }

    let max = 0;
    for (const seen of perSeries.values()) max = Math.max(max, seen.size);
    return max;
}

/**
 * How many pixels one category gets. The renderer works this out for itself,
 * but a pass that wants to re-cut a mark pinned in pixels has to arrive at the
 * same number independently.
 *
 * A band scale usually states it outright — `width: {step: 46}` *is* the step,
 * and dividing a plot width by the categories would answer a question nobody
 * asked. Where neither the step nor a pixel size is stated the answer is that
 * it is not known: a guess here re-cuts every mark on the chart against a
 * number that came from nowhere.
 */
function bandStep(spec: any, node: any, enc: any, channel: 'x' | 'y', table: any[]): number | undefined {
    const size = channel === 'x' ? (node.width ?? spec.width) : (node.height ?? spec.height);
    if (size && typeof size === 'object' && typeof size.step === 'number') return size.step;
    if (typeof size !== 'number') return undefined;
    const count = distinctCount(table, enc?.[channel]?.field);
    if (!count) return undefined;
    return size / count;
}

/**
 * A bar sitting on a continuous positional axis the layout has banded (a year,
 * a date): one axis carries a temporal or quantitative field that is not
 * binned. There is no band scale to take `paddingInner`, so the only handle on
 * the gap is the pixel width the layout already cut.
 */
function continuousBandedBar(enc: any): boolean {
    return (['x', 'y'] as const).some((c) => {
        const e = enc?.[c];
        return e?.field && (e.type === 'temporal' || e.type === 'quantitative') && !e.bin;
    });
}

/** Side-by-side lanes inside one band, from the offset channel if there is one. */
function laneCount(node: any, enc: any, table: any[]): number {
    const offset = enc?.xOffset ?? enc?.yOffset;
    if (!offset?.field) return 1;
    if (offset.type === 'quantitative') {
        return Math.max(1, distinctCount(table, enc?.color?.field) || 1);
    }
    return Math.max(1, distinctCount(table, offset.field) || 1);
}

/**
 * Roughly how many pixels wide a single bar ends up. A pinned pixel size is the
 * answer outright; otherwise the band the layout gives each category is split
 * between the dodge lanes inside it. Only an estimate — it decides whether a
 * mark is too thin to carry an edge stroke, where the exact figure does not
 * matter, only the order of magnitude.
 */
function estimateBarExtent(node: any, enc: any, table: any[], plotW: number, plotH: number): number {
    const size = (node.mark as any)?.size;
    if (typeof size === 'number') return size;
    const discreteX = enc.x?.field && (enc.x.type === 'nominal' || enc.x.type === 'ordinal');
    const discreteY = enc.y?.field && (enc.y.type === 'nominal' || enc.y.type === 'ordinal');
    const channel = discreteX ? 'x' : discreteY ? 'y' : undefined;
    if (!channel) return Infinity;
    const span = channel === 'x' ? plotW : plotH;
    const cats = distinctCount(table, enc[channel].field) || 1;
    const lanes = laneCount(node, enc, table);
    return span / (cats * lanes);
}

// ---------------------------------------------------------------------------
// Series ink
// ---------------------------------------------------------------------------

/**
 * Properties that describe *another* colour decision. Once the theme supplies
 * an explicit range they are not merely redundant, they conflict — a `scheme`
 * silently wins over `range`, and a `domainMid` on a quantize scale is a
 * runtime error.
 */
function clearColorScale(scale: any): any {
    const out = { ...scale };
    delete out.scheme;
    delete out.interpolate;
    delete out.domainMid;
    delete out.reverse;
    return out;
}

/** A colour channel whose scale is continuous, and so cannot take a one-stop range. */
function isContinuousColor(enc: any): boolean {
    return enc?.type === 'quantitative' || enc?.type === 'temporal';
}

/**
 * Write an explicit colour range, clearing whatever colour decision was there
 * before. A continuous scale interpolates between range entries, so a single
 * ink has to be stated twice — one stop is a runtime error in Vega, not a
 * constant colour.
 */
function setColorRange(enc: any, range: string[], extra?: any): void {
    const r = isContinuousColor(enc) && range.length < 2 ? [range[0], range[0]] : range;
    enc.scale = { ...clearColorScale(enc.scale ?? {}), ...(extra ?? {}), range: r };
}

/**
 * A near-neutral ink baked into a template was chosen against flint's own
 * surface, which is white. What it means is its *distance* from that surface —
 * `#f5f5f5` is a faint tint, `#1a1a1a` is a hard marker — and carried onto a
 * dark surface both readings invert. Re-place each at the same distance from
 * the surface it now sits on. Anything with real hue is left alone: that was a
 * choice about meaning, not about contrast.
 */
function reToneNeutral(ink: string, surface: string): string {
    const c = parseColor(ink);
    const bg = parseColor(surface);
    if (!c || !bg) return ink;
    if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 24) return ink;
    const vb = (bg.r + bg.g + bg.b) / 3;
    if (vb > 128) return ink;
    const v = (c.r + c.g + c.b) / 3;
    const t = Math.round(Math.min(255, vb + (255 - v)));
    return toHex({ r: t, g: t, b: t, a: 1 });
}

const NEGATIVE_WORDS = /\b(below|decrease|decline|loss|losses|negative|down|fall|deficit|shrink|worse)\b/i;
const POSITIVE_WORDS = /\b(above|increase|growth|gain|gains|positive|up|rise|surplus|grow|better)\b/i;

/**
 * The status inks name roles — positive, negative, neutral — and a role is a
 * property of the *category*, not of its place in the domain. Handing the
 * three colours to the scale in a fixed order paints whichever series happens
 * to sort first as the negative one, which is how "above average" ends up red.
 * So pair each domain value with a role: by what it calls itself where the
 * label says so, and otherwise by the sign of the quantity it carries.
 */
/**
 * The synthetic field name a colour-overflow chart keys off: the top-share
 * categories keep their own name, the tail collapses onto one "Others (N)"
 * value so the legend can name it.
 */
const OVERFLOW_KEY_FIELD = '__flintColorKey';

/**
 * Fold a colour field's tail categories onto one key via a Vega-Lite
 * `calculate` transform: `topK` values pass through, everything else becomes
 * `othersLabel`. The transform is prepended so the derived field exists before
 * any the template added. Marks keep their own rows — only the colour key each
 * row carries is remapped.
 */
function addColorKeyTransform(
    node: any,
    field: string,
    topK: any[],
    othersLabel: string,
    keyField: string,
): void {
    const f = JSON.stringify(field);
    const calc = `indexof(${JSON.stringify(topK)}, datum[${f}]) >= 0 ? datum[${f}] : ${JSON.stringify(othersLabel)}`;
    const transform = Array.isArray(node.transform) ? node.transform.slice() : [];
    if (transform.some((t: any) => t?.as === keyField)) return;
    transform.push({ calculate: calc, as: keyField });
    node.transform = transform;
}

/**
 * Order a colour domain by each category's share of the measure, largest
 * first. Used when there are more series than the house's indexed set: the top
 * inks go to the biggest categories and the small ones fold into the overflow
 * tail, so the grey is the long tail rather than an arbitrary slice. Returns
 * `undefined` for a continuous colour field or when no measure can be found.
 */
function orderDomainByShare(enc: any, node: any, table: any[]): any[] | undefined {
    if (isContinuousColor(enc)) return undefined;
    const field = enc.field;
    if (!field) return undefined;
    const domain: any[] = Array.isArray(enc.scale?.domain) && enc.scale.domain.length
        ? enc.scale.domain.slice()
        : [...new Set((table ?? []).map((r) => r?.[field]).filter((v) => v != null))];
    if (domain.length < 2) return undefined;

    // The measure whose share ranks the categories: theta for a pie, else the
    // quantitative position (size before the axes for a bubble legend).
    let measure: string | undefined;
    for (const ch of ['theta', 'size', 'y', 'x'] as const) {
        const e = node?.encoding?.[ch];
        if (e?.field && (e.type === 'quantitative' || e.type == null)) { measure = e.field; break; }
    }
    if (!measure) return undefined;

    const total = new Map<any, number>();
    for (const row of table ?? []) {
        const key = row?.[field];
        if (key == null) continue;
        const v = Number(row?.[measure]);
        total.set(key, (total.get(key) ?? 0) + (Number.isFinite(v) ? Math.abs(v) : 0));
    }
    if (total.size === 0) return undefined;
    // Stable descending sort, preserving the original domain order among ties.
    return domain
        .map((value, i) => ({ value, i, w: total.get(value) ?? 0 }))
        .sort((a, b) => (b.w - a.w) || (a.i - b.i))
        .map((d) => d.value);
}

function statusRange(
    enc: any,
    node: any,
    status: { positive?: string; negative?: string; neutral?: string },
    table: any[],
): { domain: any[]; range: string[]; roles: string[] } | undefined {
    if (isContinuousColor(enc)) return undefined;
    const field = enc.field;
    const domain: any[] = Array.isArray(enc.scale?.domain) && enc.scale.domain.length
        ? enc.scale.domain
        : [...new Set((table ?? []).map((r) => r?.[field]).filter((v) => v != null))];
    if (domain.length < 2) return undefined;

    // The measure the categories are signing: the quantitative position on the
    // same node, y before x, since a signed bar is usually vertical.
    let measure: string | undefined;
    for (const ch of ['y', 'x', 'theta', 'size'] as const) {
        const e = node?.encoding?.[ch];
        if (e?.field && (e.type === 'quantitative' || e.type == null)) { measure = e.field; break; }
    }

    const roles = domain.map((value) => {
        const label = String(value);
        if (NEGATIVE_WORDS.test(label)) return 'negative';
        if (POSITIVE_WORDS.test(label)) return 'positive';
        if (!measure) return 'neutral';
        let sum = 0; let n = 0;
        for (const row of table ?? []) {
            if (row?.[field] !== value) continue;
            const v = Number(row?.[measure]);
            if (Number.isFinite(v)) { sum += v; n++; }
        }
        if (n === 0) return 'neutral';
        return sum < 0 ? 'negative' : sum > 0 ? 'positive' : 'neutral';
    });

    // No sign to speak of — every category reads the same way, so the status
    // set says nothing the categorical set would not say better.
    if (new Set(roles).size < 2) return undefined;
    const range = roles.map((role) => (status as any)[role] ?? status.neutral ?? status.positive);
    if (range.some((c) => !c)) return undefined;
    return { domain, range: range as string[], roles };
}

function applySeriesInk(spec: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): void {
    const s = d.series;
    let sawColorField = false;
    let saidCollapse = false;
    let saidStatus = false;
    let saidExhausted = false;
    // Merging the overflow tail into one summed slice rewrites the data feeding
    // this node. Safe for a lone arc view; inside a layer/facet/concat the
    // sibling layers (a value-label text mark, say) still read the full rows,
    // so summing one layer's data would desync them. Only merge when the spec
    // is a single view.
    const composed = !!(spec?.layer || spec?.concat || spec?.hconcat || spec?.vconcat || spec?.facet || spec?.spec);
    /** The house's indexed set, extended to `n` positions with the overflow ink. */
    const palette = (n: number): string[] => {
        const out = s.categorical.slice(0, n);
        while (out.length < n) {
            out.push(s.overflow ?? s.categorical[out.length % Math.max(1, s.categorical.length)] ?? s.single);
        }
        return out.length ? out : [s.single];
    };

    walk(spec, (node) => {
        for (const channel of ['color', 'fill', 'stroke'] as const) {
            const enc = node.encoding?.[channel];
            if (!enc || !enc.field) continue;
            sawColorField = true;

            // A scale that already names its domain has told us how many inks
            // it needs. Writing fewer would not restyle the chart, it would
            // erase a distinction the chart was built to make.
            const declared = Array.isArray(enc.scale?.domain) ? enc.scale.domain.length : 0;

            if (s.mode === 'single') {
                if (declared > 1 && !isContinuousColor(enc)) {
                    if (!saidCollapse) {
                        say('ink.series',
                            `grounding saw one series but \`${enc.field}\` declares ${declared} colour values — the house's categorical set is used rather than flattening them`);
                        saidCollapse = true;
                    }
                    setColorRange(enc, palette(declared));
                } else {
                    setColorRange(enc, [s.single]);
                }
                continue;
            }
            if (s.mode === 'status' && s.status) {
                const signed = statusRange(enc, node, s.status, table);
                if (signed) {
                    setColorRange(enc, signed.range, { domain: signed.domain });
                    if (!saidStatus) {
                        say('ink.series.status',
                            `the categories carry a sign — ${signed.domain.map((v, i) => `${v} is ${signed.roles[i]}`).join(', ')}`);
                        saidStatus = true;
                    }
                } else {
                    setColorRange(enc, [s.status.negative, s.status.neutral, s.status.positive].filter(Boolean) as string[]);
                }
                continue;
            }
            if ((s.mode === 'sequential' || s.mode === 'diverging') && s.range?.length) {
                const quantize = s.quantize && enc.type === 'quantitative';
                setColorRange(enc, s.range, quantize ? { type: 'quantize' } : undefined);
                continue;
            }
            // Categorical: an ordered set consumed by index, with the overflow
            // ink taking every position past the end. A count of zero means
            // grounding could not count the series, so the whole set is
            // offered and the scale takes what it needs.
            const need = Math.max(d.bound.seriesCount || s.categorical.length || 1, declared);
            if (s.exhausted && need > s.categorical.length) {
                // Grounding found the house short of inks and short of an
                // answer for the remainder. Whatever scheme is on the chart
                // was picked for this many categories; a shorter set repainted
                // over it would only make two things look like one.
                if (!saidExhausted) {
                    say('ink.series.categorical',
                        `${need} series against ${s.categorical.length} house inks — the scale is left as it is so no two series share a colour`);
                    saidExhausted = true;
                }
                continue;
            }
            if (s.overflowTail && s.overflow && need > s.categorical.length && !subtreeHasConnectedMark(node)) {
                // Order the colour domain by share so the largest series keep
                // a named ink and the small ones fold into the single overflow
                // tail — a chart with a handful of headline categories and a
                // grey remainder, not a wheel of near-identical hues.
                //
                // Only for marks that stand on their own — a pie's wedges, a
                // scatter's points, a bar's bars. A line or an area is a
                // *connected* series: fold two of them onto one colour key and
                // Vega-Lite threads a single path through both, a grey scribble
                // where two readings should be. Those keep the palette (top
                // inks, the rest sharing the overflow ink but each still its
                // own line) via the fall-through below.
                const ordered = orderDomainByShare(enc, node, table);
                if (ordered && ordered.length > s.categorical.length) {
                    const k = s.categorical.length;
                    const topK = ordered.slice(0, k);
                    const restCount = ordered.length - k;
                    // One legend row stands in for the grey tail — an explicit
                    // "Others (N)" swatch in the overflow ink, so the reader is
                    // told how many categories share it rather than being left
                    // to infer that the grey wedges are "everything else".
                    const othersLabel = `Others (${restCount})`;
                    const field = enc.field;
                    const keyField = OVERFLOW_KEY_FIELD;
                    // A derived key folds the tail categories onto one value.
                    // The marks keep their own rows (a pie still draws N wedges,
                    // a bar N bars) — only which colour-key each row shows is
                    // remapped, so the legend dedupes to top-K plus one Others.
                    addColorKeyTransform(node, field, topK, othersLabel, keyField);
                    enc.field = keyField;
                    enc.type = 'nominal';
                    const domain = [...topK, othersLabel];
                    const range = [...s.categorical.slice(0, k), s.overflow!];
                    setColorRange(enc, range, { domain });
                    if (enc.legend !== null) {
                        // The K+1 domain is short enough to list in full; drop
                        // any values pin the template left so Others shows too.
                        const legend = { ...(enc.legend ?? {}) };
                        delete legend.values;
                        // assemble shrank these labels (and their swatches) to
                        // fit the field's *full* cardinality; the fold now shows
                        // only the K largest plus one Others row, so that shrink
                        // is measured against the wrong count. Recompute it here
                        // against what actually renders — a short list stands at
                        // the house's own size, not squeezed to 8px for names it
                        // no longer draws.
                        if (topK.length + 1 < HIGH_CARDINALITY_LEGEND_MIN) {
                            delete legend.labelFontSize;
                            delete legend.symbolSize;
                        }
                        enc.legend = legend;
                    }
                    // On a part-to-whole chart the tail is a *share*, so summing
                    // it is meaningful: merge the "Others" categories into one
                    // slice at the data level rather than fanning out N same-grey
                    // wedges. Only when the angle is a plain summed field (a
                    // count already groups by the colour key) and nothing else is
                    // encoded off a field the aggregate would drop.
                    const thetaEnc = node.encoding?.theta;
                    const thetaField = thetaEnc?.field;
                    let merged = false;
                    if (
                        isPartToWholeMark(node) &&
                        !composed &&
                        typeof thetaField === 'string' &&
                        !thetaEnc.aggregate &&
                        otherEncodedFields(node.encoding, new Set([thetaField, keyField])).length === 0
                    ) {
                        addTailAggregate(node, thetaField, keyField);
                        merged = true;
                    }
                    if (!saidExhausted) {
                        say('ink.series.categorical',
                            merged
                                ? `${need} series past ${k} inks — the ${k} largest keep a colour, the rest sum into one "${othersLabel}" slice`
                                : `${need} series past ${k} inks — the ${k} largest keep a colour, the rest fold into one "${othersLabel}" ink named in the legend`);
                        saidExhausted = true;
                    }
                    continue;
                }
            }
            setColorRange(enc, palette(need));
        }
    });

    // No colour channel at all: every data mark takes the single-series ink.
    // Unless it already states one. A layer that hard-codes its own colour
    // beside a colour-encoded layer is *context* — a bullet chart's qualitative
    // bands, a target tick, a reference band. Those are roles, not series, and
    // painting them the series ink erases the distinction they exist to make.
    // They do still have to be re-toned: a neutral chosen against white is
    // invisible on black.
    let saidRole = false;
    let saidChrome = false;
    let saidHollow = false;
    const surface = d.surface.plot ?? d.surface.canvas;

    // Furniture the template drew in pixels — a card, a track, a caption — is
    // painted with literal `fill`s chosen against flint's white. Those are
    // roles, not series: they keep their hues and only move to the same
    // distance from the surface they now sit on. Left alone, a white card
    // stays a white island on a dark canvas.
    walk(spec, (node) => {
        if (!markTypeOf(node.mark) || node.__themeSynthetic || !isLiteralMark(node)) return;
        const mark = normalizeMark(node.mark);
        let changed = false;
        for (const key of ['fill', 'stroke', 'color'] as const) {
            const own = mark[key];
            if (typeof own !== 'string') continue;
            const toned = reToneNeutral(own, surface);
            if (toned !== own) { mark[key] = toned; changed = true; }
        }
        if (!changed) return;
        node.mark = mark;
        if (!saidChrome) {
            say('ink.series',
                'the template drew its own furniture in literal colours — those keep their role and are re-toned against the surface');
            saidChrome = true;
        }
    });

    walk(spec, (node) => {
        const mark = markTypeOf(node.mark);
        if (!mark || !DATA_MARKS.has(mark)) return;
        if (node.encoding?.color?.field || node.encoding?.fill?.field || node.encoding?.stroke?.field) return;
        if (node.encoding?.color?.value != null || node.__themeSynthetic) return;
        if (isLiteralMark(node)) return;
        // A box drawn hollow is a box drawn over its own observations: the
        // sample is the figure and the summary has demoted to scaffolding
        // around it. Series ink on scaffolding puts the house colour on the
        // part of the mark that carries no value, and leaves the box and the
        // median it holds in two different colours. Both take the structural
        // ink instead, and the series ink stays where the data is.
        const box = normalizeMark(node.mark).box;
        if (mark === 'boxplot' && box && typeof box === 'object' && box.filled === false) {
            const structural = d.text.primary;
            const current = normalizeMark(node.mark);
            node.mark = {
                ...current,
                color: structural,
                ...(current.median ? { median: { ...current.median, color: structural } } : {}),
            };
            if (!saidHollow) {
                say('ink.series',
                    'the box is hollow because the observations are drawn through it — the outline is scaffolding and takes the text ink, not the series ink');
                saidHollow = true;
            }
            return;
        }
        const own = normalizeMark(node.mark).color;
        if (typeof own === 'string' && sawColorField) {
            const toned = reToneNeutral(own, surface);
            if (toned !== own && !saidRole) {
                say('ink.series',
                    'the layer states its own colour beside a colour-encoded layer — it is context, not series, so it keeps its role and is only re-toned against the surface');
                saidRole = true;
            }
            node.mark = { ...normalizeMark(node.mark), color: toned };
            return;
        }
        node.mark = { ...normalizeMark(node.mark), color: s.single };
    });

    if (!sawColorField && s.mode === 'categorical' && paintPanelSeries(spec, palette)) {
        say('ink.series',
            'the series is carried by the panels of a concatenation rather than a colour channel — the house set is assigned across the panels');
        return;
    }

    if (!sawColorField && s.mode !== 'single') {
        say('ink.series', `grounded as \`${s.mode}\` but the chart has no colour channel — single ink used`);
    }
}

/**
 * A population pyramid encodes sex by *panel*, not by a colour channel: each
 * side of the concatenation hard-codes its own ink. That is still a series,
 * and the house's set should land on it. Only concatenations qualify — a
 * literal colour inside a layered chart is usually annotation, not series.
 *
 * @returns whether anything was repainted.
 */
function paintPanelSeries(spec: any, palette: (n: number) => string[]): boolean {
    if (!spec.hconcat && !spec.vconcat && !spec.concat) return false;
    const bodies = plotBodies(spec);
    const literal = (node: any): string | undefined => {
        const v = node.encoding?.color?.value ?? node.encoding?.fill?.value;
        if (typeof v === 'string') return v;
        const m = normalizeMark(node.mark);
        return typeof m?.color === 'string' ? m.color : undefined;
    };
    const targets: { node: any; ink: string }[] = [];
    for (const body of bodies) {
        const units = body.layer ? body.layer : [body];
        for (const unit of units) {
            if (unit.__themeSynthetic) continue;
            if (!DATA_MARKS.has(markTypeOf(unit.mark) ?? '')) continue;
            const ink = literal(unit);
            if (ink) targets.push({ node: unit, ink });
        }
    }
    const distinct = [...new Set(targets.map((t) => t.ink))];
    if (distinct.length < 2) return false;
    const inks = palette(distinct.length);
    for (const { node, ink } of targets) {
        const next = inks[distinct.indexOf(ink)];
        if (node.encoding?.color?.value != null) node.encoding.color = { value: next };
        else if (node.encoding?.fill?.value != null) node.encoding.fill = { value: next };
        else node.mark = { ...normalizeMark(node.mark), color: next };
    }
    return true;
}

// ---------------------------------------------------------------------------
// Redundant channels
// ---------------------------------------------------------------------------

/**
 * Repeat the series identity on a second, non-colour channel. Vega-Lite merges
 * the legends automatically as long as the field and type match, so the key
 * stays one block rather than two.
 */
function applyRedundantChannels(spec: any, d: DesignDecisions, say: (p: string, m: string) => void): void {
    const r = d.marks.redundant;
    if (!r.shape && !r.dash) return;

    let placed = false;
    walk(spec, (node) => {
        const mark = markTypeOf(node.mark);
        if (!mark || node.__themeSynthetic) return;
        const series = node.encoding?.color ?? node.encoding?.stroke;
        if (!series?.field) return;
        const key = { field: series.field, type: series.type ?? 'nominal' };

        if (r.shape && (mark === 'point' || mark === 'circle' || mark === 'square')) {
            if (!node.encoding.shape) node.encoding.shape = { ...key };
            // `circle` and `square` hard-code their own shape; only `point`
            // can take one from a scale.
            if (mark !== 'point') node.mark = { ...normalizeMark(node.mark), type: 'point' };
            placed = true;
        }
        if (r.dash && LINE_MARKS.has(mark)) {
            if (!node.encoding.strokeDash) node.encoding.strokeDash = { ...key };
            placed = true;
        }
        if (r.shape && LINE_MARKS.has(mark) && d.marks.point?.show) {
            placed = true;
        }
    });

    if (!placed) {
        say('marks.redundantEncoding',
            'no mark in this chart can carry a redundant channel — colour is on its own');
    }
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function applyLegend(spec: any, config: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): void {
    const l = d.legend;

    if (!l.show || l.placement === 'seriesEnd' || l.placement === 'inline') {
        // The legend "show" decision (and seriesEnd/inline placement) is about
        // *naming series* — the colour/shape key. A quantitative size or
        // opacity encoding is a different kind of legend: a value key, like a
        // bubble map's size scale. It has to survive even when there is no
        // series legend, or the reader cannot decode how big is how much.
        let keptValueKey = false;
        walk(spec, (node) => {
            for (const channel of ['color', 'fill', 'stroke', 'shape', 'size', 'opacity'] as const) {
                const enc = node.encoding?.[channel];
                if (!enc?.field) continue;
                if ((channel === 'size' || channel === 'opacity') && enc.type === 'quantitative') {
                    keptValueKey = true;
                    continue;
                }
                enc.legend = null;
            }
        });
        if (!keptValueKey) return;
        // A value key survives; the series-naming placement ('none' for
        // seriesEnd, or no legend at all) does not govern it. Style it in the
        // house's legend type and seat it to the side.
        config.legend = {
            ...(config.legend ?? {}),
            orient: !l.orient || l.orient === 'none' ? 'right' : l.orient,
            labelFont: l.label.font,
            labelFontSize: l.label.fontSize,
            labelColor: l.label.color,
            titleFont: l.label.font,
            titleFontSize: l.label.fontSize,
            titleColor: d.text.muted,
        };
        say('legend.valueKey',
            'no series legend, but the size key is a value scale — it stays so the bubble sizes can be read');
        return;
    }

    config.legend = {
        ...(config.legend ?? {}),
        orient: l.orient,
        direction: l.direction,
        labelFont: l.label.font,
        labelFontSize: l.label.fontSize,
        labelColor: l.label.color,
        titleFont: l.label.font,
        titleFontSize: l.label.fontSize,
        titleColor: d.text.muted,
        ...(l.gradientLength ? { gradientLength: l.gradientLength } : {}),
    };
    // A colour ramp is a caption, not an exhibit. Left alone the renderer draws
    // it at a fixed 200px, which on a small chart is most of the plot's width
    // and reads as a second graphic above the first. Where the house has not
    // said how long, it is cut to a share of the block it labels.
    if (!l.gradientLength && (l.direction ?? 'horizontal') === 'horizontal') {
        const block = blockWidth(spec, table);
        if (block) {
            const length = Math.round(clamp(block * 0.45, 80, 200));
            config.legend.gradientLength = length;
            say('legend.gradientLength',
                `the ramp runs ${length}px — under half the ${block}px block, so the key stays a caption to the chart`);
        }
    }
    if (!l.title) config.legend.title = null;
    // A vertical-axis title laid flat sits at the plot's top-left corner; a key
    // riding along the top of that same plot lands its last row in the very
    // strip the title occupies, and on a multi-row key the two collide. Push
    // the key up off the plot far enough to clear the flat title.
    const yTitleForOffset = d.axes?.y?.title;
    if (l.orient === 'top' && yTitleForOffset?.show
        && (yTitleForOffset.placement === 'flatAboveAxis' || yTitleForOffset.placement === 'inline')) {
        const clearance = (yTitleForOffset.fontSize ?? 11) + 12;
        config.legend.offset = (config.legend.offset ?? 18) + clearance;
        say('legend.offset',
            `the top key clears the flat axis title by ${clearance}px so its last row does not land on the title`);
    }
    // A top or bottom key is a caption to the whole graphic, so it begins where
    // the graphic does — flush with the title down the left edge — not indented
    // to the plot rectangle the way Vega-Lite lays it by default. `bounds:
    // 'full'` measures the key against the same box the start-anchored title
    // uses (axes included), so the two share one left margin; the whitespace an
    // indented key leaves between itself and the title, worst when the key
    // wraps to several rows, closes up.
    if ((l.orient === 'top' || l.orient === 'bottom')
        && (l.direction ?? 'horizontal') === 'horizontal') {
        config.legend.layout = {
            ...(config.legend.layout ?? {}),
            [l.orient]: {
                anchor: 'start',
                bounds: 'full',
                ...(config.legend.layout?.[l.orient] ?? {}),
            },
        };
    }
    if (l.orient === 'top-right' || l.orient === 'top-left') {
        config.legend.fillColor = d.surface.plot;
        config.legend.padding = 4;
        config.legend.strokeColor = null;
    }

    // Two keys, and only one of them is about colour. A size key inherits the
    // mark's ink, which on a chart that also keys colour means its swatches
    // come out the same slate as the first category's — a fifth continent, in
    // effect, sitting beside the four real ones. Neutral ink says the row is
    // measuring, not naming.
    const namesColour = (() => {
        let found = false;
        walk(spec, (node) => {
            const enc = node.encoding?.color ?? node.encoding?.fill;
            if (enc?.field && enc.legend !== null && enc.type !== 'quantitative') found = true;
        });
        return found;
    })();
    if (namesColour) {
        let neutralised = false;
        walk(spec, (node) => {
            const enc = node.encoding?.size;
            if (!enc?.field || enc.legend === null) return;
            enc.legend = { ...(enc.legend ?? {}), symbolFillColor: d.text.muted };
            neutralised = true;
        });
        if (neutralised) {
            say('legend.placement',
                'the size key is drawn in neutral ink — beside a colour key, swatches in series ink read as another category');
        }
    }

    // A key to *values* is sampled, not enumerated: the renderer will happily
    // print every tick it can fit, and a row of nine bubbles reads as data. The
    // house says how many it is worth spending; the values are chosen round so
    // the reader can interpolate between them.
    if (l.maxSwatches) {
        let capped = false;
        walk(spec, (node) => {
            for (const channel of ['size', 'color', 'opacity'] as const) {
                const enc = node.encoding?.[channel];
                if (!enc?.field || enc.type !== 'quantitative' || enc.legend === null) continue;
                if (channel === 'color' && !enc.scale?.type) continue;
                // Discretizing colour scales (quantize/quantile/threshold) already
                // render one swatch per bin — sampling round tick values collapses
                // that stepped key into a couple of end-labels over a gradient bar.
                if (channel === 'color'
                    && ['quantize', 'quantile', 'threshold', 'bin-ordinal'].includes(enc.scale?.type)) continue;
                if (enc.legend?.values) continue;
                const values = roundSample(table, enc.field, l.maxSwatches!);
                if (!values) continue;
                enc.legend = { ...(enc.legend ?? {}), values };
                capped = true;
            }
        });
        if (capped) {
            say('legend.maxSwatches',
                `the key to values is sampled at ${l.maxSwatches} round sizes — a swatch for every tick reads as data, not as a key`);
        }
    }

    // Two keys, one row. Laid side by side above the plot a colour key and a
    // size key eat the block between them, and past a point the second is
    // pushed hard against the first with nothing to separate them. Vega will
    // stack them given the word, so the word is given by measurement: they
    // share a row while they fit across the block, and take one each when they
    // do not.
    if (l.orient === 'top' || l.orient === 'bottom') {
        const widths = keyWidths(spec, table, l.label.fontSize ?? 10);
        const block = blockWidth(spec, table);
        const total = widths.reduce((a, b) => a + b, 0);
        if (widths.length > 1 && block && total > block) {
            config.legend.layout = {
                ...(config.legend.layout ?? {}),
                [l.orient]: {
                    ...(config.legend.layout?.[l.orient] ?? {}),
                    direction: 'vertical',
                    anchor: 'start',
                },
            };
            say('legend.placement',
                `${widths.length} keys want ${Math.round(total)}px across a ${block}px block — they take a row each`);
        }
    }

    // A single key with many entries laid horizontally is the same overrun seen
    // one key at a time: the house asked for one row, and one row of fifty names
    // runs off the side of the canvas. A row has a width — the block the chart
    // occupies — so the entries are wrapped into as many columns as fit and no
    // more, and where even a wrapped grid would tower over the plot the count
    // is capped. Vega-Lite draws a top or bottom legend in a single row unless
    // told how many columns to fill, so it is told.
    if (l.orient === 'top' || l.orient === 'bottom') {
        wrapWideKeys(spec, l, blockWidth(spec, table), table, say);
    }
    void say;
}

/**
 * Wrap a high-cardinality horizontal key into a bounded grid.
 *
 * A top or bottom legend flows its entries along a single row until told
 * otherwise. One key with more names than fit across the block overruns the
 * canvas, so the row is broken into as many columns as the block holds; and
 * because a very long list would then grow downward without end, the number
 * of entries drawn is capped to a few rows' worth.
 */
function wrapWideKeys(
    spec: any, l: DesignDecisions['legend'], block: number | undefined, table: any[],
    say: (p: string, m: string) => void,
): void {
    if (!block) return;
    const MAX_ROWS = 4;
    // A top/bottom legend has the whole chart width to flow across; the base
    // display is 300px wide, so a narrow plot's key still has at least this
    // much room before it has to stack into one column.
    const MIN_HORIZONTAL_LEGEND_BLOCK = 280;
    // A full categorical palette's worth of names always fits — the point past
    // which high cardinality has already been folded into "Others (N)".
    const MIN_LEGEND_ENTRIES = 12;
    walk(spec, (node) => {
        for (const channel of ['color', 'fill', 'stroke'] as const) {
            const enc = node.encoding?.[channel];
            if (!enc?.field || enc.legend === null || enc.type === 'quantitative') continue;
            const entries: string[] = Array.isArray(enc.legend?.values)
                ? enc.legend.values.map(String)
                : Array.isArray(enc.scale?.domain)
                    ? enc.scale.domain.map(String)
                    : orderedValues(table, enc.field).map(String);
            if (entries.length < 2) continue;
            const labelFS = enc.legend?.labelFontSize ?? l.label.fontSize ?? 10;
            const symbolArea = enc.legend?.symbolSize;
            const symbol = symbolArea ? 2 * Math.sqrt(symbolArea / Math.PI) : 10;
            const entryWidth = entries.reduce(
                (m, e) => Math.max(m, symbol + 4 + e.length * labelFS * 0.55 + 10), 0);
            // A top or bottom legend flows across the whole chart, not just the
            // plot the marks occupy. A five-bar stacked column is ~90px wide
            // yet its key has the full canvas to spread over, so a narrow plot
            // must not force the key into one column (and, below, into a cap
            // that would then hide entries).
            const usableBlock = Math.max(block, MIN_HORIZONTAL_LEGEND_BLOCK);
            const columns = Math.max(1, Math.floor(usableBlock / entryWidth));
            if (entries.length <= columns) continue;
            enc.legend = { ...(enc.legend ?? {}), columns };
            // A folded key is already the bounded top-K + "Others (N)" list the
            // overflow pass built to be listable in full; capping it would hide
            // the very Others row that stands in for the tail. Wrap it into
            // columns, but never truncate it.
            const folded = enc.field === OVERFLOW_KEY_FIELD;
            // The cap bounds a genuine *tower* of names — dozens of entries no
            // grid can hold. It must never hide the handful of series a normal
            // key names: on a stacked bar or an area the colour key is the only
            // thing telling those series apart, so truncating it to "…2 entries"
            // leaves two bands unidentifiable. Never cap below a full
            // categorical palette's worth (past which the "Others (N)" fold
            // would already have engaged upstream).
            const cap = Math.max(columns * MAX_ROWS, MIN_LEGEND_ENTRIES);
            if (!folded && entries.length > cap) enc.legend.symbolLimit = cap;
            say('legend.columns',
                `${entries.length} keys in one row overrun the ${Math.round(block)}px block — wrapped to ${columns} columns`);
        }
    });
}

/**
 * Roughly how wide each key drawn on this chart wants to be.
 *
 * Rough is the point: the question is whether two keys fit on one row, and that
 * is answered by tens of pixels, not by ones. A swatch, a gap, the label, the
 * space to the next entry — summed over the entries the key will show.
 */
function keyWidths(spec: any, table: any[], fontSize: number): number[] {
    const seen = new Map<string, number>();
    walk(spec, (node) => {
        for (const channel of ['color', 'fill', 'stroke', 'size', 'shape', 'opacity'] as const) {
            const enc = node.encoding?.[channel];
            if (!enc?.field || enc.legend === null) continue;
            // One field is one key. Vega-Lite merges the guides for a field
            // however many channels and layers carry it — a scatter that fills
            // and strokes by the same column draws one legend, not two — so
            // counting them separately would stack a legend against itself.
            const entries: string[] = enc.legend?.values
                ? enc.legend.values.map((v: any) => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v)))
                : Array.isArray(enc.scale?.domain)
                    ? enc.scale.domain.map(String)
                    : orderedValues(table, enc.field).map(String);
            if (!entries.length) continue;
            // A size key's swatch is as wide as the biggest bubble it shows, and
            // that is the whole reason it is there.
            const area = channel === 'size' ? (enc.scale?.range?.[1] ?? 100) : 0;
            const symbol = area ? 2 * Math.sqrt(area / Math.PI) : 10;
            const width = entries.reduce((w, e) => w + symbol + 4 + e.length * fontSize * 0.55 + 10, 0);
            seen.set(enc.field, Math.max(seen.get(enc.field) ?? 0, width));
        }
    });
    return [...seen.values()];
}

/** A few round numbers spanning what a field holds, largest last. */
function roundSample(table: any[], field: string, count: number): number[] | undefined {
    let max = -Infinity;
    let min = Infinity;
    for (const row of table ?? []) {
        const v = Number(row?.[field]);
        if (!Number.isFinite(v)) continue;
        if (v > max) max = v;
        if (v < min) min = v;
    }
    if (!Number.isFinite(max) || max <= 0) return undefined;
    const round1 = (v: number) => {
        const mag = 10 ** Math.floor(Math.log10(Math.abs(v)));
        return Math.round(v / mag) * mag;
    };
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        const t = count === 1 ? 1 : (i + 1) / count;
        const v = round1(min + (max - min) * t * t);
        if (v > 0 && !out.includes(v)) out.push(v);
    }
    return out.length > 1 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Facet chrome
// ---------------------------------------------------------------------------

function applyFacetChrome(config: any, d: DesignDecisions): void {
    const f = d.facets;
    config.header = {
        ...(config.header ?? {}),
        labelFont: f.header.font,
        labelFontSize: f.header.fontSize,
        labelColor: f.header.color,
        labelFontWeight: f.header.fontWeight ?? 'normal',
        ...(f.header.show ? {} : { labels: false }),
        ...(f.header.fieldTitle ? {} : { title: null }),
    };
    // A header is drawn *in* the gap above its panel. A house may set its
    // panels tight — or inherit a tight layout — but the gap still has to hold
    // the name, or the name lands on the panel above it.
    const current = config.facet?.spacing;
    const base = f.spacing ?? (typeof current === 'number' ? current : undefined);
    const needed = f.header.show === false ? 0 : Math.round((f.header.fontSize ?? 11) * 1.7);
    if (base != null && needed > base) {
        config.facet = { ...(config.facet ?? {}), spacing: { row: needed, column: base } };
    } else if (f.spacing != null) {
        config.facet = { ...(config.facet ?? {}), spacing: f.spacing };
    }
}

/**
 * A concat child may carry a title of its own. It is not the chart's headline
 * — it names one panel of several — but Vega-Lite gives every title in the
 * spec the same config, so it arrives in the headline's weight and the
 * headline's anchor, competing with the sentence above it.
 *
 * A panel of a concat and a panel of a facet are the same thing to the reader,
 * so the name is set in the voice the house already chose for facet headers,
 * over the middle of the panel it names.
 *
 * And where that name is a value of the field the panels are coloured by, it
 * is written in that value's ink. The name and the swatch become one object,
 * which is the reason there is no key beside it.
 */
function applyPanelTitles(spec: any, d: DesignDecisions, say: (p: string, m: string) => void): void {
    const f = d.facets;
    let said = false;
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        for (const key of ['hconcat', 'vconcat', 'concat']) {
            const children = (node[key] ?? []).filter((c: any) => typeof c?.title === 'string');
            // The ink says which panel is which only when the panels differ in
            // it. Where every panel is drawn in the same colour, that colour
            // distinguishes nothing, and a name written in it is decoration.
            const inks = children.map((c: any) => panelInk(c, c.title));
            const distinct = new Set(inks.filter(Boolean));
            const naming = distinct.size > 1 && distinct.size === children.length;
            for (const [i, child] of children.entries()) {
                const ink = naming ? inks[i] : undefined;
                child.title = {
                    text: child.title,
                    anchor: 'middle',
                    font: f.header.font,
                    fontSize: f.header.fontSize,
                    fontWeight: f.header.fontWeight ?? 'normal',
                    color: ink ?? f.header.color,
                };
                if (!said) {
                    say('facets.header', ink
                        ? 'the panel names are set in their own panel\'s ink — the name is the swatch, so no key is drawn beside it'
                        : 'the panel names are set in the header voice, not the headline\'s — they name a panel, not the chart');
                    said = true;
                }
            }
            for (const child of node[key] ?? []) visit(child);
        }
        if (node.spec) visit(node.spec);
    };
    visit(spec);
}

/**
 * The ink a panel is drawn in: the colour its own scale gives the value it is
 * named for, or — where the panel holds one series and the colour was painted
 * straight onto the marks — that colour. Read off the chart rather than
 * recomputed, since whatever ink ended up on the marks is the ink the reader
 * will match the name to.
 */
function panelInk(node: any, value: string): string | undefined {
    let scaled: string | undefined;
    const painted = new Set<string>();
    walk(node, (n) => {
        for (const channel of ['color', 'fill', 'stroke'] as const) {
            const enc = n.encoding?.[channel];
            if (!enc) continue;
            const domain = enc.scale?.domain;
            const range = enc.scale?.range;
            if (Array.isArray(domain) && Array.isArray(range)) {
                const i = domain.indexOf(value);
                if (i >= 0 && typeof range[i] === 'string') scaled ??= range[i];
            }
            if (typeof enc.value === 'string' && DATA_MARKS.has(markTypeOf(n.mark) ?? '')) painted.add(enc.value);
        }
        if (!DATA_MARKS.has(markTypeOf(n.mark) ?? '')) return;
        const mark = normalizeMark(n.mark);
        for (const key of ['color', 'fill'] as const) {
            if (typeof mark[key] === 'string') painted.add(mark[key]);
        }
    });
    return scaled ?? (painted.size === 1 ? [...painted][0] : undefined);
}

// ---------------------------------------------------------------------------
// Data labels — the first thing Vega-Lite has no primitive for
// ---------------------------------------------------------------------------

function isStacked(node: any, measureChannel: 'x' | 'y'): boolean {
    const mark = markTypeOf(node.mark);
    if (mark !== 'bar' && mark !== 'area') return false;
    const hasSeries = Boolean(node.encoding?.color?.field);
    const dodged = Boolean(node.encoding?.xOffset || node.encoding?.yOffset);
    const explicit = node.encoding?.[measureChannel]?.stack;
    if (explicit === null || explicit === false) return false;
    return hasSeries && !dodged;
}

function applyDataLabels(spec: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): any {
    if (!d.dataLabels.show) return undefined;

    // A concatenation is several charts side by side. Labelling only the first
    // panel is worse than labelling none.
    const said = new Set<string>();
    const once = (path: string, message: string) => {
        const k = `${path}\u0000${message}`;
        if (said.has(k)) return;
        said.add(k);
        say(path, message);
    };
    let first: any;
    for (const body of plotBodies(spec)) {
        const layer = labelOneBody(spec, body, d, table, once);
        if (layer && !first) first = layer;
    }
    return first;
}

/**
 * The ink for a number printed on a ramp.
 *
 * Vega-Lite cannot ask a mark what colour it ended up, so the places where the
 * ramp goes dark are worked out here and restated as a test on the value. A
 * sequential ramp darkens at one end and a diverging one at both, and the same
 * scan covers either.
 */
function inkOnRamp(field: string, stops: string[], values: number[], light: string, dark: string): any {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (!(hi > lo) || stops.length < 2) return { value: dark };
    const STEPS = 32;
    const runs: Array<[number, number]> = [];
    for (let i = 0; i <= STEPS; i++) {
        const t = (i / STEPS) * (stops.length - 1);
        const a = parseColor(stops[Math.floor(t)]);
        const b = parseColor(stops[Math.min(stops.length - 1, Math.floor(t) + 1)]);
        if (!a || !b) continue;
        const k = t - Math.floor(t);
        const c = { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k, a: 1 };
        if (luminance(c) >= 0.5) continue;
        const v = lo + (i / STEPS) * (hi - lo);
        const last = runs[runs.length - 1];
        if (last && i > 0 && last[1] >= lo + ((i - 1) / STEPS) * (hi - lo)) last[1] = v;
        else runs.push([v, v]);
    }
    if (runs.length === 0) return { value: dark };
    const f = `datum[${JSON.stringify(field)}]`;
    const test = runs
        .map(([a, b]) => (a === b ? `${f} === ${a}` : `(${f} >= ${a} && ${f} <= ${b})`))
        .join(' || ');
    return { condition: { test, value: light }, value: dark };
}

function labelOneBody(spec: any, body: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): any {
    const units = body.layer
        ? body.layer.filter((n: any) => DATA_MARKS.has(markTypeOf(n.mark) ?? ''))
        : (markTypeOf(body.mark) ? [body] : []);
    if (units.length === 0) {
        say('dataLabels', 'no data mark found to label');
        return;
    }
    // A pie has no axis, but it does have a measure: the angle. That is where
    // a value label matters most, since an angle is the hardest quantity to
    // read off a chart.
    const radial = units.some((n: any) => markTypeOf(n.mark) === 'arc');
    // A heat map keeps its quantity in colour and its position in the grid.
    // The cell is the position, and the number belongs in the middle of it.
    const cells = !radial
        && d.bound.measureChannels.length === 0
        && units.every((n: any) => markTypeOf(n.mark) === 'rect');
    const measureChannel: 'x' | 'y' | 'theta' | 'color' = radial ? 'theta'
        : cells ? 'color'
            : d.bound.measureChannels[0];
    if (!measureChannel) {
        say('dataLabels', 'no measure axis to label');
        return undefined;
    }
    if (body.layer && body.layer.some((n: any) => markTypeOf(n.mark) === 'text')) {
        say('dataLabels', 'template already prints its own labels — left alone');
        return;
    }
    // A composite mark spends several layers saying one thing about each datum
    // — open, high, low, close. There is no single number to print beside it,
    // and printing one of the four would be a lie by selection.
    const measureFields = new Set(
        units.map((n: any) => mergedEncoding(n, body.encoding)[measureChannel]?.field).filter(Boolean),
    );
    if (measureFields.size > 1) {
        say('dataLabels',
            `the mark carries ${measureFields.size} measures (${[...measureFields].join(', ')}) — no single value to print`);
        return;
    }

    const primary = units[0];
    const enc = mergedEncoding(primary, body.encoding);
    const measure = enc[measureChannel];
    if (!measure?.field) {
        say('dataLabels', `measure channel \`${measureChannel}\` has no field`);
        return;
    }
    if (measureChannel !== 'theta' && measureChannel !== 'color' && isStacked(primary, measureChannel)) {
        say('dataLabels', 'stacked segments are not labelled — Vega-Lite would place text at the segment edge');
        return;
    }

    const horizontal = measureChannel === 'x';
    const outside = d.dataLabels.placement !== 'atMark';
    const t = d.dataLabels.text;
    // `atMark` means "inside the mark" only when the mark has an inside. A bar
    // or a slice has a body a label can sit on; a point or a line vertex does
    // not, and a label there is over bare surface.
    const BODY_MARKS = new Set(['bar', 'arc', 'rect', 'area']);
    const onMarkBody = BODY_MARKS.has(markTypeOf(primary.mark) ?? '');

    const markDef: any = {
        type: 'text',
        font: t.font,
        fontSize: t.fontSize,
        ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
        ...(t.fontStyle ? { fontStyle: t.fontStyle } : {}),
    };
    const inside = !outside && onMarkBody;
    // A reversed scale turns the mark round: the end of the bar is on the side
    // the axis started from, so "outside" is the other way.
    const reversed = measure.scale?.reverse === true;
    // The offset is measured from the anchor, and the anchor is not always the
    // edge of the mark. A bar's anchor is the end of it, so 4px of offset is
    // 4px of air; a dot's anchor is its centre, and 4px from the centre of a
    // 10px dot lands the text on the dot. Where a mark has a radius, the gap
    // is measured from the rim by adding it.
    const radius = Math.max(0, ...units.map((unit: any) => markRadius(unit, spec, d)));
    // A slice too thin to stand a line of text across gets no label: its share
    // of the circle, swung out to the label radius, is a shorter arc than the
    // label is tall, so the number would land on its neighbours. Hiding it by
    // opacity (not by dropping the row) keeps every slice in the stack, so the
    // surviving labels stay on the angles their arcs actually occupy.
    let radialLabelKeepTest: string | undefined;
    const geometry = (within: boolean): any => {
        const w = reversed ? !within : within;
        return horizontal
            ? { align: w ? 'right' : 'left', baseline: 'middle', dx: w ? -(5 + radius) : 4 + radius }
            : { align: 'center', baseline: w ? 'top' : 'bottom', dy: w ? 4 + radius : -(4 + radius) };
    };
    if (cells) {
        // A cell has no outside: the grid is continuous, and a number beside a
        // cell belongs to no cell in particular.
        Object.assign(markDef, { align: 'center', baseline: 'middle' });
        if (d.dataLabels.placement !== 'atMark') {
            say('dataLabels.placement',
                `\`${d.dataLabels.placement}\` printed in the cell instead — a grid is continuous and has no outside`);
        }
    } else if (radial) {
        // On an arc the label rides the same angle as its slice; the only
        // choice left is how far out along the radius it sits. Vega-Lite does
        // not give a text mark the arc's radius, so it has to be stated —
        // from the arc if it declares one, otherwise from the plot box, which
        // is where Vega-Lite's own default comes from.
        const arc = units.find((n: any) => markTypeOf(n.mark) === 'arc');
        const declared = normalizeMark(arc?.mark)?.outerRadius;
        const w = body.width ?? spec.width;
        const h = body.height ?? spec.height;
        let r = typeof declared === 'number'
            ? declared
            : (typeof w === 'number' && typeof h === 'number' ? Math.min(w, h) / 2 : undefined);
        // Vega-Lite grows the wedge to fill the plot box, then hangs an
        // outside label just past the rim. With nothing declared the wedge
        // already touches the box edge, so a label — centred on the radius
        // and reaching out half its own width — runs off the canvas (the
        // widest numbers on the 3/9-o'clock slices lose a digit). When the
        // house prints its numbers outside, pull the wedge in far enough to
        // seat the labels with air around them: reserve half the widest
        // label plus the gap, and write that radius back onto the arc so the
        // drawn wedge and the label ring agree. A snug 14px gap reads as the
        // number stuck to the rim; McKinsey and its peers sit the annotation
        // clear of the arc, so the gap is generous. An arc that states its
        // own radius is left alone.
        const radialOutsideGap = 22;
        if (r !== undefined && !inside && typeof declared !== 'number'
            && typeof w === 'number' && typeof h === 'number' && arc) {
            const labelChars = table.reduce((m, row) => {
                const v = row?.[measure.field];
                if (typeof v !== 'number' || !Number.isFinite(v)) return m;
                return Math.max(m, Math.round(Math.abs(v)).toLocaleString('en-US').length);
            }, 1);
            const estHalfWidth = (labelChars * (t.fontSize ?? 10) * 0.62) / 2;
            const halfMin = Math.min(w, h) / 2;
            const arcOuter = Math.max(halfMin * 0.5, halfMin - (estHalfWidth + radialOutsideGap + 4));
            if (arcOuter < r) {
                const norm = normalizeMark(arc.mark) ?? { type: 'arc' };
                arc.mark = { ...norm, outerRadius: Math.round(arcOuter) };
                r = arcOuter;
            }
        }
        if (r) {
            const labelRadius = inside ? r * 0.72 : r + radialOutsideGap;
            Object.assign(markDef, { radius: labelRadius });
            // The slice's share of the circle is its value over the total; swung
            // out to the label radius that share becomes an arc of
            // `labelRadius · share · 2π`. A label needs at least its own height
            // of arc to sit in without touching its neighbours, so the smallest
            // labelled value is the one whose arc clears a line of text.
            const total = table.reduce((s, row) => {
                const v = row?.[measure.field];
                return typeof v === 'number' && Number.isFinite(v) ? s + Math.abs(v) : s;
            }, 0);
            const minArc = (t.fontSize ?? 10) + 2;
            if (total > 0 && labelRadius > 0) {
                const minValue = (minArc * total) / (labelRadius * 2 * Math.PI);
                if (minValue > 0) {
                    radialLabelKeepTest = `abs(datum[${JSON.stringify(measure.field)}]) >= ${minValue}`;
                    const dropped = table.filter((row) => {
                        const v = row?.[measure.field];
                        return typeof v === 'number' && Math.abs(v) < minValue;
                    }).length;
                    if (dropped > 0) {
                        say('dataLabels.show',
                            `${dropped} slice${dropped === 1 ? '' : 's'} narrower than a line of text go unlabelled — their arc would not hold the number`);
                    }
                }
            }
        } else say('dataLabels', 'the arc has no radius to hang a label from');
    } else {
        Object.assign(markDef, geometry(inside));
    }
    if (d.dataLabels.placement === 'column' && !cells) {
        say('dataLabels.placement', '`column` approximated as `outsideMark` — Vega-Lite has no label gutter');
    }

    const labelEncoding: any = {
        text: { field: measure.field, type: 'quantitative', ...(d.dataLabels.format ? { format: d.dataLabels.format } : {}) },
    };
    if (d.dataLabels.unit) {
        printWithUnit(body, { encoding: labelEncoding }, measure.field, d.dataLabels.format, d.dataLabels.unit);
        say('annotation.unit',
            `each printed value carries its unit \`${d.dataLabels.unit}\` — there is no axis left to state it on`);
    }
    // `facet`, `row` and `column` split the data; Vega-Lite refuses them inside
    // a layer and `appendLayer` promotes them to a real facet operator that
    // covers every layer, the label included. Copied onto the label they are a
    // second, conflicting split — so they are left to the operator.
    for (const ch of ['x', 'y', 'xOffset', 'yOffset', 'detail', 'theta', 'radius'] as const) {
        if (enc[ch]) labelEncoding[ch] = stripAxis(enc[ch]);
    }
    // Vega-Lite stacks `theta` for arcs but not for text, so a copied angle
    // would measure from zero instead of from the start of the slice.
    if (radial && labelEncoding.theta) labelEncoding.theta = { ...labelEncoding.theta, stack: true };

    if (cells) {
        // The cell under the number is the ramp, so the ink follows the ramp.
        const values = table.map((r) => r?.[measure.field]).filter((v) => typeof v === 'number');
        const stops = d.series.ramp?.stops ?? d.series.range ?? [];
        labelEncoding.color = inkOnRamp(measure.field, stops, values, d.text.inverse, d.text.primary);
    } else if (d.dataLabels.inkMode === 'matchSeries' && enc.color?.field) {
        labelEncoding.color = { ...enc.color, legend: null };
    } else if (d.dataLabels.inkMode === 'contrastWithMark' && !outside && onMarkBody) {
        const seriesInk = d.series.mode === 'single' ? d.series.single : d.series.categorical[0] ?? d.series.single;
        markDef.color = readableOn(seriesInk, d.text.inverse, d.text.primary);
    } else if (d.dataLabels.inkMode === 'contrastWithMark') {
        // The label is floating over the surface, not sitting on the mark, so
        // the thing it has to be readable against is the surface.
        markDef.color = readableOn(d.surface.plot ?? d.surface.canvas, d.text.inverse, d.text.primary);
    } else {
        markDef.color = t.color ?? d.text.primary;
    }

    const layer: any = { __themeSynthetic: true, mark: markDef, encoding: labelEncoding };
    if (radialLabelKeepTest) {
        labelEncoding.opacity = { condition: { test: radialLabelKeepTest, value: 1 }, value: 0 };
    }
    appendLayer(body, layer);

    if (radial) {
        // Vega-Lite gives a text mark the middle of a slice only when the
        // angle is *shared* by the layers and declared stacked. The colour has
        // to move up with it, because the stacking order is read off the
        // colour field — left behind, the labels stack in a different order
        // from the slices they belong to. The label then overrides the
        // inherited colour with its own ink.
        // `appendLayer` may have promoted an encoding-level facet to a real
        // operator, in which case the arc and the label are layers of
        // `body.spec`, not `body`. Operate on whichever node now owns them.
        const host = body.layer ? body : body.spec;
        const arc = host.layer.find((n: any) => markTypeOf(n.mark) === 'arc');
        const shared: any = { ...(host.encoding ?? {}) };
        const theta = arc?.encoding?.theta ?? shared.theta;
        if (theta) {
            shared.theta = { ...theta, stack: true };
            if (arc?.encoding) delete arc.encoding.theta;
        }
        const colour = arc?.encoding?.color ?? shared.color;
        if (colour?.field) {
            shared.color = colour;
            if (arc?.encoding) delete arc.encoding.color;
            if (!labelEncoding.color) labelEncoding.color = { value: markDef.color ?? d.text.primary };
            // Vega-Lite derives the stacking order from the colour field. The
            // label overrides that colour with its own ink, which would leave
            // it stacking by value instead, so the order is stated outright
            // and both layers read the same one.
            shared.order = { field: colour.field, type: colour.type ?? 'nominal', sort: 'ascending' };
        }
        host.encoding = shared;
        delete labelEncoding.theta;
    }

    // A label goes where there is room. A mark shorter than its own label
    // cannot hold it, and a mark that reaches the end of the scale has no room
    // past its end — so each case sends those few labels the other way.
    // Vega-Lite has no conditional `align`, so this is two layers with
    // complementary filters.
    const flipInk = (within: boolean): string | undefined => {
        if (d.dataLabels.inkMode === 'matchSeries' && enc.color?.field) return undefined;
        if (!within) return t.color ?? d.text.primary;
        const seriesInk = d.series.mode === 'single' ? d.series.single : d.series.categorical[0] ?? d.series.single;
        return readableOn(seriesInk, d.text.inverse, d.text.primary);
    };
    const split = (threshold: number, comparison: '<' | '>', message: string) => {
        const v = `abs(datum[${JSON.stringify(measure.field)}])`;
        const flipped = !inside;
        layer.transform = [{ filter: `${v} ${comparison === '<' ? '>=' : '<='} ${threshold}` }];
        const other: any = {
            __themeSynthetic: true,
            transform: [{ filter: `${v} ${comparison} ${threshold}` }],
            mark: { ...markDef, ...geometry(flipped), color: flipInk(flipped) },
            encoding: labelEncoding,
        };
        if (other.mark.color === undefined) delete other.mark.color;
        appendLayer(body, other);
        say('dataLabels.placement', message);
    };

    // A vertical bar's outside label is cleared by giving the measure scale
    // headroom (below); a horizontal one by reserving right margin. The
    // scale-end flip — printing the tallest bars' labels inside instead —
    // solves the same "no room past the end" problem, so it is only needed
    // where headroom is not the remedy: on horizontal bars.
    const headroomClears = !inside && onMarkBody && !horizontal && !radial && !cells;

    if (!radial && !cells && onMarkBody) {
        if (inside && d.dataLabels.insideMinValue != null) {
            split(d.dataLabels.insideMinValue, '<', 'marks shorter than their own label print it outside instead');
            growPadding(spec, horizontal ? 'right' : 'top', (t.fontSize ?? 10) * 2);
        } else if (!inside && d.dataLabels.outsideMaxValue != null && !headroomClears) {
            split(d.dataLabels.outsideMaxValue, '>', 'marks that reach the end of the scale print their label inside instead');
        }
    }

    // Outside labels sit past the end of the mark, so the plot needs room —
    // to the side the bar grows toward. A horizontal bar's label sits past its
    // right end, in clean margin the padding reserves. A vertical bar's sits
    // above its top, where the title already is, so reserving outer padding
    // does not clear it; instead the measure scale is given headroom so the
    // tallest bar stops short of the plot ceiling and its label lands in
    // whitespace inside the plot.
    if (!inside && !radial && !cells) {
        if (horizontal) {
            growPadding(spec, reversed ? 'left' : 'right', (t.fontSize ?? 10) * 3);
        } else if (onMarkBody) {
            addMeasureHeadroom(body, measureChannel, measure.field, table);
        }
    }
    return layer;
}

function stripAxis(enc: any): any {
    const out = { ...enc };
    delete out.axis;
    delete out.scale;
    delete out.legend;
    return out;
}

function appendLayer(body: any, layer: any): void {
    if (body.layer) { body.layer.push(layer); return; }
    const base: any = { mark: body.mark };
    if (body.encoding) base.encoding = body.encoding;
    delete body.mark;
    delete body.encoding;

    // A unit spec with a `facet`, `row` or `column` channel is an operator in
    // a unit's clothes: those channels split the data, and Vega-Lite refuses
    // them inside a layer — it drops the split and draws every panel's marks
    // on top of each other. So the split is promoted to a real facet operator
    // and the layers go inside it.
    const split = ['facet', 'row', 'column'].filter((c) => base.encoding?.[c]);
    if (split.length === 0) { body.layer = [base, layer]; return; }

    const facet: any = {};
    for (const channel of split) {
        const def = { ...base.encoding[channel] };
        delete base.encoding[channel];
        if (channel === 'facet') Object.assign(facet, def);
        else facet[channel] = def;
    }
    const columns = body.columns ?? facet.columns;
    delete facet.columns;
    delete body.columns;

    const inner: any = { layer: [base, layer] };
    for (const key of ['width', 'height', 'view'] as const) {
        if (body[key] !== undefined) { inner[key] = body[key]; delete body[key]; }
    }
    body.facet = facet;
    if (columns != null) body.columns = columns;
    body.spec = inner;
}

function readableOn(background: string, light: string, dark: string): string {
    // `light` and `dark` are the theme's two ink candidates. Which one reads on
    // a surface is a fact about their contrast with it, not about which the
    // theme calls primary — a dark house's "primary" ink is itself light, so a
    // fixed light/dark mapping inverts on it. Pick whichever candidate sits
    // furthest from the background in luminance; fall back to the first when a
    // colour will not parse.
    const bg = parseColor(background);
    if (!bg) return light;
    const bgLum = luminance(bg);
    const lightC = parseColor(light);
    const darkC = parseColor(dark);
    if (!lightC || !darkC) return luminance(bg) < 0.5 ? light : dark;
    const lightGap = Math.abs(luminance(lightC) - bgLum);
    const darkGap = Math.abs(luminance(darkC) - bgLum);
    return lightGap >= darkGap ? light : dark;
}

function growPadding(spec: any, side: 'left' | 'right' | 'top' | 'bottom', amount: number): void {
    const base = typeof spec.padding === 'number'
        ? { left: spec.padding, right: spec.padding, top: spec.padding, bottom: spec.padding }
        : { left: 8, right: 8, top: 8, bottom: 8, ...(spec.padding ?? {}) };
    base[side] = (base[side] ?? 8) + Math.round(amount);
    spec.padding = base;
}

/**
 * A value label printed above a bar needs a strip of plot above the bar to sit
 * in. The bar that defines the scale's maximum reaches the top of the plot and
 * leaves none, so the scale is given a margin: the domain is pushed past the
 * data by a fraction of its span, on whichever end carries labelled bar ends.
 * A stack of bars rising from zero keeps its zero; only the outward end moves.
 */
function addMeasureHeadroom(
    body: any, channel: 'x' | 'y' | 'theta' | 'color', field: string, table: any[],
): void {
    const HEADROOM = 0.15;
    const nums = table.map((r) => r?.[field]).filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[];
    if (nums.length === 0) return;
    const dataMax = Math.max(...nums);
    const dataMin = Math.min(...nums);
    // Bars stand on zero, so the span the labels have to clear is measured from
    // zero, not from the smallest bar.
    const span = Math.max(dataMax, 0) - Math.min(dataMin, 0);
    if (!(span > 0)) return;
    const pad = span * HEADROOM;
    // `appendLayer` has already run: the mark that carried the measure is no
    // longer `body` but a layer inside it (and may have been pushed under a
    // hoisted facet operator). Follow the same path to the node that now owns
    // the encodings, and set the scale on every place the measure appears —
    // the shared encoding and each layer that repeats the field — so the
    // shared scale Vega-Lite resolves across the layers picks the wider domain.
    const host = body.spec?.layer ? body.spec : body;
    const encodings: any[] = [];
    if (host.encoding?.[channel]?.field === field) encodings.push(host.encoding[channel]);
    for (const u of (host.layer ?? [])) {
        if (u?.encoding?.[channel]?.field === field) encodings.push(u.encoding[channel]);
    }
    for (const encChannel of encodings) {
        const scale = { ...(encChannel.scale ?? {}) };
        // An explicit domain is a deliberate choice; headroom does not override it.
        if (scale.domain != null) continue;
        // The label sits past the end of the bar — above a positive bar, below
        // a negative one — so each populated end is given room.
        if (dataMax > 0 && scale.domainMax == null) scale.domainMax = dataMax + pad;
        if (dataMin < 0 && scale.domainMin == null) scale.domainMin = dataMin - pad;
        encChannel.scale = scale;
    }
}

// ---------------------------------------------------------------------------
// seriesEnd — the second thing Vega-Lite has no primitive for
// ---------------------------------------------------------------------------

/**
 * `seriesEnd` is a placement, and a placement can be unavailable. Decide that
 * *before* the legend is drawn — once the colour legends have been suppressed
 * in favour of end labels there is nothing to fall back to.
 */
function demoteSeriesEnd(spec: any, d: DesignDecisions, say: (p: string, m: string) => void): void {
    if (d.legend.placement !== 'seriesEnd' && d.legend.placement !== 'inline') return;
    if (!d.legend.show) return;
    const body = plotBody(spec);
    // A band carries its own end label inside itself, so it counts as a run
    // with an end just as much as a line does.
    const endable = (mark: string) => LINE_MARKS.has(mark) || mark === 'area';
    const units = body.layer
        ? body.layer.filter((n: any) => endable(markTypeOf(n.mark) ?? ''))
        : (endable(markTypeOf(body.mark) ?? '') ? [body] : []);
    const enc = units.length ? mergedEncoding(units[0], body.encoding) : {};
    const field = enc.color?.field ?? d.bound.seriesField ?? enc.detail?.field;
    // A name that will not fit inside its band goes in the margin past the last
    // reading — and where the house has stood the value axis in that margin, as
    // it does on a part-to-whole chart, the name would be printed over the
    // ruler. A band is thin more often than not, so this is not a risk worth
    // running: the naming goes back to the house's next choice.
    const bands = units.some((n: any) => markTypeOf(n.mark) === 'area');
    const runsAlongX = runChannel(d) === 'x';
    const marginTaken = bands
        && (runsAlongX ? d.axes.y?.orient === 'right' : d.axes.x?.orient === 'top');
    // A closed run (a radar/spider polygon, `interpolate: *-closed`) has no last
    // point: every vertex is an axis, not an end, so an end label would land on
    // an arbitrary spoke. The series can only be named by a key.
    const closedRun = units.some((n: any) => {
        const interp = normalizeMark(n.mark)?.interpolate;
        return typeof interp === 'string' && interp.endsWith('-closed');
    });
    const reason = units.length === 0
        ? '`seriesEnd` needs a line mark'
        : (!field ? '`seriesEnd` needs a series field to name'
            : (field === d.bound.categoryField
                ? '`seriesEnd` would restate the categorical axis'
                : closedRun
                    ? '`seriesEnd` needs an open run — a closed polygon has no last point'
                    : marginTaken
                        ? `the ${runsAlongX ? 'right' : 'top'} margin holds the value axis, so a name too big for its band has nowhere to stand`
                        : null));
    if (!reason) return;
    // The house ranked its placements; a demotion should land on the next one
    // it named, not on whatever this function happens to prefer.
    const next = d.legend.fallbacks?.find((p) => p !== 'seriesEnd' && p !== 'inline') ?? 'right';
    say('legend.placement', `${reason} — the key is drawn \`${next}\` instead`);
    d.legend.placement = next;
    d.legend.orient = next === 'inside' ? 'top-right' : next as any;
    d.legend.direction = next === 'top' || next === 'bottom' ? 'horizontal' : 'vertical';
}

/**
 * The channel a series runs *along*. A measure on `y` means the run is `x`,
 * a measure on `x` means the run is `y` — and when neither channel carries a
 * measure the run is still the horizontal one, because a chart whose value is
 * an *order* rather than a quantity (a bump chart ranks its rows) still reads
 * left to right. Calling `y` the run in that case puts every series' label on
 * the same row: at the top, on top of each other.
 */
function runChannel(d: DesignDecisions): 'x' | 'y' {
    if (d.bound.measureChannels.includes('y')) return 'x';
    if (d.bound.measureChannels.includes('x')) return 'y';
    return 'x';
}

function applySeriesEndLabels(
    spec: any,
    d: DesignDecisions,
    valueLayer: any,
    table: any[],
    say: (p: string, m: string) => void,
): void {
    if (d.legend.placement !== 'seriesEnd' && d.legend.placement !== 'inline') return;
    if (!d.legend.show) return;

    const body = plotBody(spec);
    // A template that already prints a name at the end of each run has said it.
    // A second label in the same place is not a legend, it is a stutter.
    if ((body.layer ?? []).some((n: any) => markTypeOf(n.mark) === 'text' && n.encoding?.text?.field)) {
        say('legend.placement', 'the chart already prints its own end labels — no second set drawn');
        return;
    }
    const units = body.layer
        ? body.layer.filter((n: any) => LINE_MARKS.has(markTypeOf(n.mark) ?? ''))
        : (LINE_MARKS.has(markTypeOf(body.mark) ?? '') ? [body] : []);
    if (units.length === 0) {
        // A band is not a line, but it has the same last reading — and more
        // room to say it in, because the name can go *inside* the band where
        // the reader is already looking.
        if (bandEndLabels(spec, body, d, table, say)) return;
        say('legend.placement', '`seriesEnd` needs a line mark — no legend drawn');
        return;
    }

    const primary = units[0];
    const enc = mergedEncoding(primary, body.encoding);
    // `detail` is a grouping key, not a series: on a dumbbell it is the very
    // field the categorical axis already names, and printing it at the end of
    // each connector says the same word twice.
    const seriesField = enc.color?.field ?? d.bound.seriesField ?? enc.detail?.field;
    const domainChannel = runChannel(d);
    const valueChannel = domainChannel === 'x' ? 'y' : 'x';
    const domain = enc[domainChannel];
    const value = enc[valueChannel];
    if (!seriesField || !domain?.field || !value?.field) {
        say('legend.placement', '`seriesEnd` needs a series field on a positional line — no legend drawn');
        return;
    }

    const t = d.legend.label;
    // The line that carries the shape need not be the layer that carries the
    // colour — a dumbbell draws its connector plain and colours the dots.
    let colourEnc = enc.color?.field ? enc.color : undefined;
    if (!colourEnc) {
        for (const unit of (body.layer ?? [body])) {
            const c = unit.encoding?.color ?? unit.encoding?.fill ?? unit.encoding?.stroke;
            if (c?.field === seriesField) { colourEnc = c; break; }
        }
    }
    // "The end of the series" only means something when the domain is ordered —
    // a time axis, a scale, or ordered categories. An unordered domain still
    // carries one order, the one its rows arrived in, and where the run is
    // horizontal that is enough: the reader finishes at the right-hand column
    // and there is margin there to write the name in. A run down the page is a
    // list, and a list is labelled at its head, inside the plot.
    const runs = domain.type === 'quantitative' || domain.type === 'temporal' || domain.type === 'ordinal';
    const atEnd = runs || domainChannel === 'x';
    // "The end" is the last band in the order the domain is *drawn*, which for
    // an ordinal axis is the order the house declared (Jan…Dec), not the order
    // the values happen to sort in as strings. Ranking by the raw field would
    // end each series at its alphabetically-last reading — "Sep", stranded
    // mid-plot under the crossing lines — instead of at the right-hand edge. So
    // where the domain carries an explicit order, rank by each row's position
    // in it; otherwise a descending sort of an ordered field finds the last.
    let runsRank: any[] = [];
    if (runs) {
        if (Array.isArray(domain.sort)) {
            const arr = JSON.stringify(domain.sort);
            const fld = JSON.stringify(domain.field);
            runsRank = [
                { calculate: `indexof(${arr}, datum[${fld}])`, as: '__domainOrder' },
                {
                    window: [{ op: 'row_number', as: '__seriesEndRank' }],
                    sort: [{ field: '__domainOrder', order: 'descending' }],
                    groupby: [seriesField],
                },
            ];
        } else {
            const order = domain.sort === 'descending' ? 'ascending' : 'descending';
            runsRank = [{
                window: [{ op: 'row_number', as: '__seriesEndRank' }],
                sort: [{ field: domain.field, order }],
                groupby: [seriesField],
            }];
        }
    }
    const rank = runs
        ? runsRank
        : atEnd
            ? [
                { window: [{ op: 'row_number', as: '__dataOrder' }] },
                {
                    window: [{ op: 'row_number', as: '__seriesEndRank' }],
                    sort: [{ field: '__dataOrder', order: 'descending' }],
                    groupby: [seriesField],
                },
            ]
            : [{ window: [{ op: 'row_number', as: '__seriesEndRank' }], groupby: [seriesField] }];

    // Both the series name and its final value want the same few pixels. The
    // house answer is not to stack them but to say them once: "Japan 84.5".
    const merged = Boolean(valueLayer) && valueLayer.encoding?.text?.field === value.field;
    const transform: any[] = [...rank, { filter: 'datum.__seriesEndRank === 1' }];
    let textField = seriesField;
    if (merged) {
        const fmt = d.dataLabels.format;
        const v = `datum[${JSON.stringify(value.field)}]`;
        const shown = fmt ? `format(${v}, ${JSON.stringify(fmt)})` : `${v} + ''`;
        transform.push({
            calculate: `datum[${JSON.stringify(seriesField)}] + ' ' + ${shown}`,
            as: '__seriesEndLabel',
        });
        textField = '__seriesEndLabel';
        // …and the value layer must stop printing the point that is now named.
        valueLayer.transform = [...rank, { filter: 'datum.__seriesEndRank !== 1' }];
        say('legend.placement',
            'series name and final value merged into one label — they compete for the same space');
    }

    const labelLayer: any = {
        __themeSynthetic: true,
        transform,
        mark: {
            type: 'text',
            align: domainChannel === 'x' ? 'left' : 'center',
            baseline: domainChannel === 'x' ? 'middle' : 'bottom',
            dx: domainChannel === 'x' ? 5 : 0,
            dy: domainChannel === 'x' ? 0 : -5,
            font: t.font,
            fontSize: t.fontSize,
            ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
            ...(t.fontStyle ? { fontStyle: t.fontStyle } : {}),
        },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: stripAxis(value),
            text: { field: textField, type: 'nominal' },
            ...(colourEnc?.field ? { color: { ...colourEnc, legend: null } } : {}),
        },
    };
    appendLayer(body, labelLayer);

    // The labels live outside the plot rectangle; the canvas has to make room
    // or Vega-Lite will draw them over whatever is next to the chart. At the
    // head of a list they sit inside it and no room is needed.
    if (atEnd) {
        const longest = estimateLongestLabel(table, seriesField) + (merged ? 6 : 0);
        growPadding(spec, domainChannel === 'x' ? 'right' : 'top', longest * (t.fontSize ?? 10) * 0.55 + 8);
    }
    // Naming the series at the line end frees the corner the colour key used to
    // hold — but a *second* encoding (a forecast dash, a shape) still keeps its
    // own key, and Vega-Lite parks it top-right by default, right where the end
    // labels now are. The two collide into an unreadable pile. The end labels
    // own that edge now, so the surviving key steps down to the foot of the
    // plot, where it has the width to itself.
    relocateSecondaryLegends(spec, 'bottom', say);
    say('legend.placement', '`seriesEnd` realized as a synthesized text layer at each series\' last point');
}

/**
 * When the series are named at the line end, a second, non-colour encoding
 * (`strokeDash` for actual/forecast, `shape`, `size`, `opacity`) still draws a
 * key, and its default corner is the top-right the end labels have just taken.
 * Move each such surviving key to the foot of the plot, clear of the labels.
 * Colour/fill/stroke are the series itself and are already spoken for.
 */
function relocateSecondaryLegends(spec: any, orient: 'bottom' | 'top', say: (p: string, m: string) => void): void {
    const channels = ['strokeDash', 'shape', 'size', 'opacity'] as const;
    let moved = 0;
    walk(spec, (node) => {
        if (!node.encoding) return;
        for (const ch of channels) {
            const enc = node.encoding[ch];
            if (enc?.field && enc.legend !== null) {
                enc.legend = { ...(typeof enc.legend === 'object' && enc.legend ? enc.legend : {}), orient };
                moved++;
            }
        }
    });
    if (moved) {
        say('legend.orient',
            `a second key sat where the end labels now are — moved to the ${orient}, clear of them`);
    }
}

/**
 * The same idea as a series-end label, for a chart made of bands.
 *
 * A stacked area has no end point to hang a name off, but it has something
 * better: at its last reading the band is a shape with a middle, and a name
 * knocked out of that middle is unambiguous in a way a legend swatch never is.
 * Returns true when it drew them.
 */
function bandEndLabels(
    spec: any,
    body: any,
    d: DesignDecisions,
    table: any[],
    say: (p: string, m: string) => void,
): boolean {
    const units = body.layer
        ? body.layer.filter((n: any) => markTypeOf(n.mark) === 'area')
        : (markTypeOf(body.mark) === 'area' ? [body] : []);
    if (units.length === 0) return false;

    const enc = mergedEncoding(units[0], body.encoding);
    const seriesField = enc.color?.field ?? d.bound.seriesField;
    const domainChannel = runChannel(d);
    const valueChannel = domainChannel === 'x' ? 'y' : 'x';
    const domain = enc[domainChannel];
    const value = enc[valueChannel];
    if (!seriesField || !domain?.field || !value?.field) return false;

    // Where the middle of a band sits depends on everything stacked under it,
    // and Vega-Lite already works that sum out for the band itself. Asking it
    // for the same sum on the label layer — same series field, same stack —
    // keeps label and band in step; a second, cleverer calculation here would
    // only find new ways to disagree. The label's colour scale is the plot
    // surface throughout, so the name is knocked out of the band it names
    // rather than tinted by it.
    const seriesCount = Math.max(
        Array.isArray(enc.color?.scale?.domain)
            ? enc.color.scale.domain.length
            : orderedValues(table, seriesField).length,
        1,
    );
    const knockedOut = enc.color?.field
        ? {
            color: {
                ...enc.color,
                scale: { ...(enc.color.scale ?? {}), range: Array(seriesCount).fill(d.surface.plot) },
                legend: null,
            },
        }
        : { detail: { field: seriesField, type: 'nominal' } };
    const inSeriesInk = enc.color?.field
        ? { color: { ...enc.color, legend: null } }
        : { detail: { field: seriesField, type: 'nominal' } };

    // A name can only be knocked out of a band wide and thick enough to hold
    // it. Where the band ends as a sliver — Oceania under four other
    // continents — or climbs away from under its own label, the name goes
    // outside the plot in its own ink instead. And a chart with half its names
    // in and half out reads as a mistake: past one exception they all go out,
    // where they line up as a single list.
    const t = d.legend.label;
    const along = domainChannel === 'x' ? (body.width ?? spec.width) : (body.height ?? spec.height);
    const across = valueChannel === 'y' ? (body.height ?? spec.height) : (body.width ?? spec.width);
    const order: string[] = Array.isArray(enc.color?.scale?.domain)
        ? enc.color.scale.domain.map((s: any) => String(s))
        : orderedValues(table, seriesField);
    const homeless = namesTheBandCannotHold({
        table,
        domainField: domain.field,
        domainType: domain.type,
        seriesField,
        valueField: value.field,
        order,
        stacked: value.stack !== null && value.stack !== false && value.stack !== 'none',
        centred: value.stack === 'center',
        alongPx: typeof along === 'number' ? along : 600,
        acrossPx: typeof across === 'number' ? across : 254,
        fontSize: t.fontSize ?? 10,
    });
    const outside = homeless.length > 1 ? order : homeless;
    const outsideList = JSON.stringify(outside);
    const belongs = (inside: boolean) =>
        `indexof(${outsideList}, datum[${JSON.stringify(seriesField)}] + '') ${inside ? '<' : '>='} 0`;

    const fmt = d.dataLabels.format;
    const v = `datum[${JSON.stringify(value.field)}]`;
    const shown = fmt ? `format(${v}, ${JSON.stringify(fmt)})` : `${v} + ''`;
    // A normalized stack redraws every band as a share of its column, and the
    // axis is read in per cent. The field still holds what it always held —
    // 9,420 TWh of coal — so printing it beside the name puts a number on the
    // chart that the chart does not draw anywhere. The name goes alone.
    const normalized = value.stack === 'normalize';
    const name = normalized
        ? `datum[${JSON.stringify(seriesField)}] + ''`
        : `datum[${JSON.stringify(seriesField)}] + ' ' + ${shown}`;
    // The band is an `area` mark, which Vega-Lite stacks on its own; a `text`
    // mark is not stacked unless told to. Left implicit, every label lands at
    // its series' *raw* reading and the whole set piles up at the foot of the
    // plot as if nothing were stacked. Naming the band's own offset on the
    // label layer lifts each name to the middle of the band it belongs to.
    const stackOffset =
        value.stack === null || value.stack === false || value.stack === 'none'
            ? undefined
            : (value.stack ?? 'zero');
    // Both layers keep every series, because a stacked layer stacks only the
    // rows it is given: drop one and the rest slide off their own bands. What
    // changes between them is whether the text says anything.
    //
    // "The end" is the last reading in the order the domain is *drawn*. A time
    // or number line sorts itself; an explicit category order is read off the
    // house's list; but a bare nominal domain ("Stage 1"…"Stage 12") has no
    // order but the one its rows arrived in — and sorting those as *strings*
    // ends every series at "Stage 9", stranded mid-plot, not at "Stage 12". So
    // rank by declared order where there is one, by the field where it is a
    // scale, and by arrival order otherwise.
    const rankTf: any[] = Array.isArray(domain.sort)
        ? [
            { calculate: `indexof(${JSON.stringify(domain.sort)}, datum[${JSON.stringify(domain.field)}])`, as: '__bandDomainOrder' },
            { window: [{ op: 'row_number', as: '__bandEndRank' }], sort: [{ field: '__bandDomainOrder', order: 'descending' }], groupby: [seriesField] },
        ]
        : (domain.type === 'quantitative' || domain.type === 'temporal')
            ? [{ window: [{ op: 'row_number', as: '__bandEndRank' }], sort: [{ field: domain.field, order: domain.sort === 'descending' ? 'ascending' : 'descending' }], groupby: [seriesField] }]
            : [
                { window: [{ op: 'row_number', as: '__bandDataOrder' }] },
                { window: [{ op: 'row_number', as: '__bandEndRank' }], sort: [{ field: '__bandDataOrder', order: 'descending' }], groupby: [seriesField] },
            ];
    const endLayer = (inside: boolean): any => ({
        __themeSynthetic: true,
        transform: [
            ...rankTf,
            { filter: 'datum.__bandEndRank === 1' },
            {
                calculate: outside.length ? `${belongs(inside)} ? ${name} : ''` : name,
                as: '__bandEndLabel',
            },
        ],
        mark: {
            type: 'text',
            align: domainChannel !== 'x' ? 'center' : inside ? 'right' : 'left',
            baseline: 'middle',
            dx: domainChannel !== 'x' ? 0 : inside ? -6 : 6,
            font: t.font,
            fontSize: t.fontSize,
            fontWeight: 'bold',
            ...(inside ? { color: d.surface.plot } : {}),
        },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: { ...stripAxis(value), bandPosition: 0.5, ...(stackOffset ? { stack: stackOffset } : {}) },
            text: { field: '__bandEndLabel', type: 'nominal' },
            ...(inside ? knockedOut : inSeriesInk),
        },
    });
    if (outside.length < order.length) appendLayer(body, endLayer(true));
    if (outside.length) {
        appendLayer(body, endLayer(false));
        const longest = Math.max(...outside.map((s) => s.length)) + 8;
        growPadding(spec, domainChannel === 'x' ? 'right' : 'top', longest * (t.fontSize ?? 10) * 0.55 + 8);
        say('legend.placement',
            outside.length === order.length
                ? 'the bands climb away from their own labels — the names sit outside the plot in series ink, as a list'
                : `${outside.length === 1 ? 'one band is' : `${outside.length} bands are`} too thin at the end to hold a name — those sit outside the plot in their own ink`);
    }
    // Layers share their scales, so without this the label's colour scale is
    // the band's and the name comes out tinted the colour of the shape it is
    // sitting on. The label keeps the same *domain*, which is what puts it in
    // the right band; only the ink is its own.
    body.resolve = {
        ...(body.resolve ?? {}),
        scale: { ...(body.resolve?.scale ?? {}), color: 'independent' },
    };
    say('legend.placement',
        '`seriesEnd` realized inside each band at its last reading — a name in the band beats a swatch beside the chart');
    return true;
}

/**
 * Which names cannot be knocked out of the band they belong to.
 *
 * A label is set in the middle of the band's last reading and written
 * backwards from there, so the band has to be thick enough to hold the letters
 * *and* still be under them a label's width back. On a stack that narrows
 * towards its end — or one drawn about a centre line, where the whole pile
 * rises as it grows — a name set in the last band can run clean off the shape
 * it names and onto the page.
 */
function namesTheBandCannotHold(args: {
    table: any[];
    domainField: string;
    domainType?: string;
    seriesField: string;
    valueField: string;
    order: string[];
    stacked: boolean;
    centred: boolean;
    alongPx: number;
    acrossPx: number;
    fontSize: number;
}): string[] {
    const { table, domainField, domainType, seriesField, valueField, order } = args;

    const byKey = new Map<string, { at: number; vals: Map<string, number> }>();
    const keys: string[] = [];
    let index = 0;
    for (const row of table ?? []) {
        const raw = row?.[domainField];
        index++;
        if (raw == null) continue;
        const key = String(raw);
        let rec = byKey.get(key);
        if (!rec) {
            const n = raw instanceof Date ? raw.getTime()
                : typeof raw === 'number' ? raw
                    : domainType === 'temporal' ? Date.parse(key) : index;
            rec = { at: Number.isFinite(n) ? n : index, vals: new Map() };
            byKey.set(key, rec);
            keys.push(key);
        }
        const v = Number(row?.[valueField]);
        if (!Number.isFinite(v)) continue;
        const s = String(row?.[seriesField]);
        rec.vals.set(s, (rec.vals.get(s) ?? 0) + v);
    }
    const points = keys.map((k) => byKey.get(k)!).sort((a, b) => a.at - b.at);
    if (points.length === 0) return [];

    // Segment bounds in value space, top-first, the way the stack is drawn.
    const bounds = (vals: Map<string, number>): Map<string, [number, number]> => {
        const out = new Map<string, [number, number]>();
        if (!args.stacked) {
            for (const s of order) out.set(s, [0, vals.get(s) ?? 0]);
            return out;
        }
        const total = order.reduce((sum, s) => sum + (vals.get(s) ?? 0), 0);
        let running = args.centred ? total / 2 : total;
        for (const s of order) {
            const v = vals.get(s) ?? 0;
            out.set(s, [running - v, running]);
            running -= v;
        }
        return out;
    };

    const biggest = Math.max(...points.map((p) => order.reduce((sum, s) => sum + (p.vals.get(s) ?? 0), 0)));
    if (!(biggest > 0)) return [];
    const perPx = biggest / args.acrossPx;
    const stepPx = args.alongPx / Math.max(1, points.length - 1);
    const margin = (args.fontSize / 2 + 1) * perPx;

    const last = bounds(points[points.length - 1].vals);
    const homeless: string[] = [];
    for (const s of order) {
        const here = last.get(s);
        if (!here) continue;
        const centre = (here[0] + here[1]) / 2;
        // Roughly what the label measures: the name, a space, and a number.
        const width = (s.length + 6) * args.fontSize * 0.55;
        const back = Math.min(points.length - 1, Math.ceil(width / Math.max(stepPx, 1)));
        for (let i = points.length - 1; i >= points.length - 1 - back; i--) {
            const seg = bounds(points[i].vals).get(s);
            if (!seg || centre < seg[0] + margin || centre > seg[1] - margin) {
                homeless.push(s);
                break;
            }
        }
    }
    return homeless;
}

/** Distinct values of a field, in the order the table first shows them. */
function orderedValues(table: any[], field: string): string[] {
    const seen: string[] = [];
    const set = new Set<string>();
    for (const row of table ?? []) {
        const v = row?.[field];
        if (v == null) continue;
        const s = String(v);
        if (!set.has(s)) { set.add(s); seen.push(s); }
    }
    return seen;
}

function estimateLongestLabel(table: any[], field: string): number {
    if (!Array.isArray(table)) return 10;
    let max = 0;
    for (const row of table) {
        const v = row?.[field];
        if (v != null) max = Math.max(max, String(v).length);
    }
    return max || 10;
}

// ---------------------------------------------------------------------------
// Point emphasis
// ---------------------------------------------------------------------------

/**
 * A dot on a line is a full stop: it says *this* is the value the sentence was
 * building to. Houses differ on where it goes — both ends of the run, the
 * latest reading, the high and the low — but they agree that it goes on a
 * line, and only where the line does not already show every observation.
 */
function applyPointEmphasis(spec: any, d: DesignDecisions, say: (p: string, m: string) => void): void {
    const policy = d.pointEmphasis;
    if (!policy) return;

    const body = plotBody(spec);
    const units = (body.layer ?? [body]).filter((n: any) => LINE_MARKS.has(markTypeOf(n.mark) ?? ''));
    if (units.length === 0) return;

    // A line drawn with a point at every observation has already said it —
    // whether the house asked for that or the chart spec did.
    const drawsEveryPoint = d.marks.point?.show === true
        || units.some((n: any) => n.mark && typeof n.mark === 'object' && n.mark.point);
    if (drawsEveryPoint) {
        say('annotation.pointEmphasis',
            'the line already shows every observation — a second dot at the end would say nothing new');
        return;
    }

    const enc = mergedEncoding(units[0], body.encoding);
    const domainChannel = runChannel(d);
    const valueChannel = domainChannel === 'x' ? 'y' : 'x';
    const domain = enc[domainChannel];
    const value = enc[valueChannel];
    if (!domain?.field || !value?.field) return;

    const seriesField = enc.color?.field ?? d.bound.seriesField ?? enc.detail?.field;
    const groupby = seriesField ? [seriesField] : [];
    const v = `datum[${JSON.stringify(value.field)}]`;

    let transform: any[];
    let what: string;
    if (policy.where === 'extremes') {
        transform = [
            {
                joinaggregate: [
                    { op: 'min', field: value.field, as: '__peLow' },
                    { op: 'max', field: value.field, as: '__peHigh' },
                ],
                groupby,
            },
            { filter: `${v} === datum.__peLow || ${v} === datum.__peHigh` },
        ];
        what = 'the high and the low of each run';
    } else {
        // Row numbers, not values: the domain may be a date, and two dates are
        // never `===` each other in a Vega expression even when they name the
        // same instant.
        const rank = (order: 'ascending' | 'descending', as: string) => ({
            window: [{ op: 'row_number', as }],
            sort: [{ field: domain.field, order }],
            groupby,
        });
        transform = policy.where === 'latest'
            ? [rank('descending', '__peLast'), { filter: 'datum.__peLast === 1' }]
            : [
                rank('ascending', '__peFirst'),
                rank('descending', '__peLast'),
                { filter: 'datum.__peFirst === 1 || datum.__peLast === 1' },
            ];
        what = policy.where === 'latest' ? 'the latest reading' : 'the first and last reading of each run';
    }

    // The colour encoding is repeated, not re-declared: in a layered spec the
    // scales are shared, and a `legend: null` on any one layer takes the key
    // away from all of them.
    const colourEnc = enc.color?.field ? { ...enc.color } : undefined;
    appendLayer(body, {
        __themeSynthetic: true,
        transform,
        mark: {
            type: 'point',
            filled: true,
            size: policy.size,
            ...(d.marks.point?.haloColor
                ? { stroke: d.marks.point.haloColor, strokeWidth: d.marks.point.haloWidth ?? 1 }
                : {}),
            ...(colourEnc ? {} : { color: d.series.single }),
        },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: stripAxis(value),
            ...(colourEnc ? { color: colourEnc } : {}),
        },
    });
    say('annotation.pointEmphasis', `${what} carries a dot — the house marks where the line lands`);

    // Vega-Lite sizes a legend swatch from the largest mark on the scale, so
    // the dot just added would swell every swatch in the key. The key samples
    // the line, not the full stop at the end of it.
    if (colourEnc && d.legend.show) {
        const legendConfig = ((spec.config ??= {}).legend ??= {});
        if (legendConfig.symbolSize == null) {
            legendConfig.symbolSize = ((d.legend.label.fontSize ?? 10) * 0.8) ** 2;
        }
    }

    if (policy.labels === 'never') return;
    const t = d.dataLabels.text;
    appendLayer(body, {
        __themeSynthetic: true,
        ...(policy.labels === 'endpoints' ? { transform } : {}),
        mark: {
            type: 'text',
            align: domainChannel === 'x' ? 'center' : 'left',
            baseline: domainChannel === 'x' ? 'bottom' : 'middle',
            dy: domainChannel === 'x' ? -8 : 0,
            dx: domainChannel === 'x' ? 0 : 8,
            font: t.font,
            fontSize: t.fontSize,
            ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
            fill: t.color,
        },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: stripAxis(value),
            text: {
                field: value.field,
                type: 'quantitative',
                ...(d.dataLabels.format ? { format: d.dataLabels.format } : {}),
            },
        },
    });
    say('annotation.pointLabels',
        `${policy.labels === 'all' ? 'every point' : 'the dotted points'} print their value`);
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** The fit a template asked the renderer for, if it asked for one. */
function findFit(spec: any): { y: string; x: string } | undefined {
    let found: { y: string; x: string } | undefined;
    walk(spec, (node) => {
        if (found || !Array.isArray(node.transform)) return;
        for (const t of node.transform) {
            const on = t?.on;
            const y = t?.regression ?? t?.loess;
            // A fit per group states several slopes; one caption cannot.
            if (typeof y === 'string' && typeof on === 'string' && !t.groupby?.length) {
                found = { y, x: on };
                return;
            }
        }
    });
    return found;
}

function formatStat(v: number): string {
    const abs = Math.abs(v);
    const text = abs >= 100 ? v.toFixed(0) : abs >= 1 ? v.toFixed(2) : v.toFixed(3);
    return text.replace('-', '\u2212');
}

/**
 * Print what the fit is worth.
 *
 * A house that draws a regression line and says nothing about it is asking the
 * reader to take the line on trust. Where the house asks for the numbers, they
 * are computed from the same rows the line was fitted to.
 */
function applyStatistics(spec: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): void {
    const policy = d.statistics;
    if (!policy || !Array.isArray(spec.layer) || !Array.isArray(table) || table.length === 0) return;
    const fit = findFit(spec);
    if (!fit) return;

    const pairs = table
        .map((row) => [Number(row?.[fit.x]), Number(row?.[fit.y])])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (pairs.length < 3) return;

    const n = pairs.length;
    const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
    const my = pairs.reduce((s, p) => s + p[1], 0) / n;
    let sxy = 0; let sxx = 0; let syy = 0;
    for (const [x, y] of pairs) {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
    }
    if (sxx === 0 || syy === 0) return;
    const slope = sxy / sxx;
    const stats: Record<string, string> = {
        slope: `slope = ${formatStat(slope)}`,
        intercept: `intercept = ${formatStat(my - slope * mx)}`,
        r2: `R² = ${((sxy ** 2) / (sxx * syy)).toFixed(2)}`,
        n: `n = ${n}`,
    };
    const parts = policy.show.map((k) => stats[k]).filter(Boolean);
    if (!parts.length) return;

    const caption = policy.placement === 'caption';
    spec.layer.push({
        __themeSynthetic: true,
        data: { values: [{}] },
        mark: {
            type: 'text',
            text: parts.join(' · '),
            align: caption ? 'left' : 'right',
            baseline: 'bottom',
            x: { expr: caption ? '0' : 'width' },
            y: { expr: caption ? 'height + 34' : '-4' },
            font: policy.font,
            fontSize: policy.fontSize,
            fontStyle: policy.fontStyle,
            fill: policy.color,
        },
    });
    say('annotation.statistics',
        `the fit is stated as well as drawn — ${parts.join(', ')} — computed from the ${n} rows the line was fitted to`);
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

/**
 * A chart whose radial mark cannot survive being wrapped in a concatenation to
 * hang furniture beneath it. A pie is a disc of angles and rides inside a
 * `vconcat` unharmed; but a *rose* sizes its petals by radius, and a *faceted*
 * disc splits into panels, and in either case Vega-Lite reads the panel's width
 * signal to lay the mark out — a signal the concat wrapper either rescopes out
 * of the mark's reach (the facet: an unresolved `child_width`) or leaves the
 * radius scale to collapse against (the rose: petals shrunk to a compass). The
 * chart is already its own block; a rule across it has no single width to take.
 */
function radialResistsFurniture(spec: any): boolean {
    let faceted = false;
    let arc = false;
    let radiusArc = false;
    walk(spec, (node) => {
        if (node.facet) faceted = true;
        for (const ch of ['facet', 'row', 'column'] as const) {
            if (node.encoding?.[ch]) faceted = true;
        }
        if (markTypeOf(node.mark) === 'arc') {
            arc = true;
            if (node.encoding?.radius) radiusArc = true;
        }
    });
    return radiusArc || (arc && faceted);
}

/**
 * A faceted *table* — a `facet` operator whose panel is itself a concatenation
 * (a bar-table's label / bar / value columns laid side by side) — meets the
 * same wall as the faceted disc in `radialResistsFurniture`, one level deeper.
 * Wrapping `facet > concat` in an outer furniture `vconcat` yields
 * `concat > facet > concat`, and Vega-Lite rescopes the inner panels' width
 * signals out of the concat's reach: every column collapses and the whole
 * block renders empty. A plain faceted unit (line-facet, area-facet) has no
 * such nested signal and rides the wrapper unharmed, so this stays narrow —
 * only the facet-of-concat is refused. Like the disc, the table is already its
 * own stack of blocks, with no single width for a rule to run across.
 */
function facetedTableResistsFurniture(spec: any): boolean {
    if (!spec.facet) return false;
    const panel = spec.spec;
    return !!(panel && (panel.hconcat || panel.vconcat || panel.concat));
}

function applyFurniture(spec: any, d: DesignDecisions, table: any[], say: (p: string, m: string) => void): boolean {
    if (!d.furniture.length) return false;
    if (spec.vconcat || spec.hconcat || spec.concat) {
        say('furniture', 'not drawn — the chart is already a concatenation');
        return false;
    }
    // A rose or a faceted disc cannot be wrapped in a block to hang a rule
    // beneath it — see `radialResistsFurniture`. It is already its own block.
    if (radialResistsFurniture(spec)) {
        say('furniture', 'not drawn — a radial chart is already its own block, with no edge to close');
        return false;
    }
    // A faceted table (facet of concat) collapses when wrapped — see
    // `facetedTableResistsFurniture`. It is already its own stack of blocks.
    if (facetedTableResistsFurniture(spec)) {
        say('furniture', 'not drawn — a faceted table is already its own stack of blocks, with no single edge to close');
        return false;
    }

    // A masthead tab opens the block *above* the headline — the Economist's
    // red rule sits at the very top of the graphic, over the title, not
    // between the title and the plot. A rule (header/footer) closes a block
    // and stays where it is drawn: under the headline, or under the plot.
    const aboveTitle: any[] = [];
    const before: any[] = [];
    const after: any[] = [];
    // A tab is a mark of its own — the Economist's red rectangle is 26px
    // because 26px is what it is. A rule is not: it closes the block, so its
    // length is the block's, and a house that draws one does not state a
    // number for it. Falling back to a stub leaves a dash in the corner that
    // looks like a mistake rather than an edge.
    const block = blockWidth(spec, table);
    for (const item of d.furniture) {
        const isRule = item.kind !== 'mastheadTab';
        const width = item.width ?? (isRule ? block : 40);
        if (width == null) {
            say('furniture', `the house draws a ${item.kind} across the block, but the chart states no width to draw it across — left out`);
            continue;
        }
        if (isRule && item.width == null) {
            say('furniture', `the ${item.kind} runs the width of the block — ${width}px — not a fixed stub`);
        }
        const isTop = (item.anchor ?? 'topLeft').startsWith('top');
        const rect = {
            __themeSynthetic: true,
            mark: { type: 'rect', color: item.color ?? d.text.primary },
            width,
            height: item.height ?? 2,
            data: { values: [{}] },
        };
        if (!isTop) after.push(rect);
        else if (item.kind === 'mastheadTab') aboveTitle.push(rect);
        else before.push(rect);
    }
    if (!aboveTitle.length && !before.length && !after.length) return false;

    const inner: any = { ...spec };
    for (const key of ['$schema', 'background', 'padding', 'title', 'config', 'autosize']) delete inner[key];

    // The masthead tab must draw *over* the title, but the outer view's title
    // always renders above every concatenated child. So when a tab opens the
    // block, the title rides down onto the plot body and the tab is the first
    // thing in the stack — tab, then headline, then chart.
    const tabOverTitle = aboveTitle.length > 0 && !!spec.title;
    if (tabOverTitle) inner.title = spec.title;

    // A concatenated child's legends are hoisted to the outer view and drawn
    // above every child in it — including the tab, which is the one thing that
    // is supposed to open the block. Resolved independently they stay with the
    // plot they key, and the house's rule sits back under the headline where it
    // was drawn.
    const keyed = new Set<string>();
    walk(inner, (node) => {
        for (const channel of ['color', 'fill', 'stroke', 'size', 'shape', 'opacity'] as const) {
            const enc = node.encoding?.[channel];
            if (enc?.field && enc.legend !== null) keyed.add(channel);
        }
    });

    const outer: any = {
        ...(spec.$schema ? { $schema: spec.$schema } : {}),
        background: spec.background,
        padding: spec.padding,
        ...(spec.title && !tabOverTitle ? { title: spec.title } : {}),
        spacing: 6,
        vconcat: [...aboveTitle, ...before, inner, ...after],
        ...(keyed.size
            ? { resolve: { legend: Object.fromEntries([...keyed].map((c) => [c, 'independent'])) } }
            : {}),
        config: spec.config,
    };
    for (const key of Object.keys(spec)) delete spec[key];
    Object.assign(spec, outer);
    return true;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * How wide the drawn block is, in the units furniture is measured in. The
 * plotting rectangle is the only width the spec states; the labels down its
 * left sit outside it, so a rule that closes the block is drawn a little past
 * the plot rather than flush with it.
 *
 * A banded chart states no total at all — it states a step and lets the
 * categories decide — so the total is read back the same way the layout wrote
 * it, one band per name.
 */
function widestWidth(spec: any, table: any[]): number | undefined {
    let widest: number | undefined;
    const consider = (w: number | undefined) => {
        if (w != null && Number.isFinite(w) && (widest == null || w > widest)) widest = w;
    };
    // The step may be stated on a node whose children carry the encoding, so
    // the band field is looked for down the branch, not only on the node.
    const bandField = (node: any): string | undefined => {
        let found: string | undefined;
        walk(node, (n) => {
            const enc = n.encoding?.x;
            if (!found && enc?.field && (enc.type === 'nominal' || enc.type === 'ordinal')) found = enc.field;
        });
        return found;
    };
    walk(spec, (node) => {
        const w = node.width;
        if (typeof w === 'number') consider(w);
        else if (w && typeof w === 'object' && typeof w.step === 'number') {
            const count = distinctCount(table, bandField(node));
            if (count) consider(w.step * count);
        }
    });
    if (typeof spec.width === 'number') consider(spec.width);
    // A chart that states no width of its own is drawn at the one the layout
    // put in the view config — that is the width, not a default to guess at.
    if (widest == null) consider(spec.config?.view?.continuousWidth);
    return widest;
}

function blockWidth(spec: any, table: any[]): number | undefined {
    const widest = widestWidth(spec, table);
    if (widest == null) return undefined;
    // A row of columns laid side by side — a bar-table's bars and its printed
    // value column — is as wide as the columns *summed*, not as wide as the
    // widest one. Anything that flows across the whole graphic (a top or bottom
    // legend) has that whole width to spread over, so the key is not crowded
    // into the few columns the bar plot alone would allow while the space above
    // the value column sits empty.
    if (Array.isArray(spec.hconcat) && spec.hconcat.length > 1) {
        const spacing = typeof spec.spacing === 'number' ? spec.spacing : 8;
        let sum = 0;
        let ok = true;
        for (const child of spec.hconcat) {
            const cw = widestWidth(child, table);
            if (cw == null) { ok = false; break; }
            sum += cw;
        }
        if (ok && sum > widest) return Math.round(sum * 1.07 + spacing * (spec.hconcat.length - 1));
    }
    return Math.round(widest * 1.07);
}

void contrastingInk;
