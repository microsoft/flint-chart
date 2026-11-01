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

import type { DesignDecisions, PointShape, ReportDeparture, ResolvedText, ThemeReport } from '../core/theme/types.js';
import type { HeaderPlan } from '../core/header-plan.js';
import type { SourcePlan } from '../core/source-plan.js';
import { RULE_GAP } from '../core/rule-plan.js';
import { niceDomain, niceTicks } from '../core/ruler.js';
import { compactExpr, compactPrint, type CompactPrint, type CompactRule } from '../core/number-compact.js';
import { discreteDomain } from './value-colors';
import { applyTextCase, caseLabelExpr, textCaseExpr } from '../core/text-case.js';
import { format as formatNumber } from 'd3-format';
import { contrastingInk, contrastRatio, parseColor, luminance, mixHex, readableTextInk, toHex } from '../core/theme/presence.js';
import { categoriesSplitBySign, categorySignRoles } from '../core/theme/series-sign.js';
import type { AxisLabelPlan } from '../core/axis-labels.js';
import { bandsHoldSeveral, KEY_CHANNELS, statedStacking, type BuiltFacts, type Stacking } from '../core/structure.js';
import { canvasContentWidth, fitDeckText, fitHeadlineText, plotHeightAfter, textPx, titleMeasures } from '../core/title-fit.js';
import { tableTextMeasurer, textWidth } from '../core/text-width.js';
import { alreadyNamed, keysBesideWidth, tickUnitOf, type TitlePlan } from '../core/title-plan.js';
import { OWNED_AXIS_KEYS } from './owned-axis-keys.js';
import { CONTINUOUS_BAR_STEP_FILL, coverageSizedMarks } from './templates/utils.js';
import { LOCAL_DODGE_LANE_FILL } from './templates/bar.js';
import { CANVAS_FURNITURE_KEY, CANVAS_PATTERNS_KEY, readCanvasFurniture, headerFurnitureItems, type CanvasFurnitureItem, type CanvasPattern } from './canvas-furniture.js';
import { withInteractionDecorative, withInteractionLegendLabel, withInteractionTextLabel } from './interaction-provenance.js';
import { facetDropsTicks, gridOvershoot } from '../core/furniture-reserve';
import type { ValueLabelPlan } from '../core/value-label-plan';
import { LABEL_SIDE, measureValueLabels } from '../core/value-label-measure';
import { RADIAL_OUTSIDE_GAP } from '../core/arc-label-fit';
import { groupPadding } from '../core/group-gaps';
import { coupledPointOpacity, MIN_HALO_DOT, pointHaloWidth, pointOutlineWidth, type LayoutPlan } from '../core/plan';
import type { FurniturePlan } from '../core/furniture-plan';
import type { SeriesEndLayout } from '../core/series-end';
import { MARK_IDENTITY } from './interactions/stores';
import type { LegendPlan, PlannedKey } from '../core/legend-plan';

/** Mark families that carry data values (as opposed to chrome). */
const DATA_MARKS = new Set([
    'bar', 'line', 'area', 'point', 'circle', 'square', 'arc', 'rect',
    'trail', 'tick', 'boxplot', 'errorbar', 'errorband', 'geoshape',
]);

const LINE_MARKS = new Set(['line', 'trail']);

/** Axis properties this realizer owns; anything a template left is overwritten. */

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

/** Part-to-whole marks whose slices are a share of a summed measure — the
 * overflow tail can be summed into a single "Others" slice at the data level. */
const PART_TO_WHOLE_MARKS = new Set(['arc']);


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
export function collectPositional(spec: any): {
    x?: { type?: string; field?: string }; y?: { type?: string; field?: string }; color?: { type?: string; field?: string }; stacked?: boolean;
} {
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

/**
 * What a built Vega-Lite spec draws, read for meaning: its kinds of mark, the data fields each axis
 * encodes (range ends included), and how it stacks. A stated `stack` says so; else Vega-Lite stacks
 * bars and areas along a quantitative measure, unless they are dodged or drawn as ranges. Stacking
 * shows only where some band holds more than one mark.
 */
export function vegaLiteBuiltFacts(spec: any, table: any[]): BuiltFacts {
    const unescape = (field: string) => field.replace(/\\(.)/g, '$1');
    const fields: BuiltFacts['fields'] = { x: new Set(), y: new Set(), angle: new Set(), radius: new Set() };
    const transformed = new Set<string>();
    const collect = (value: unknown): void => {
        if (typeof value === 'string') {
            transformed.add(unescape(value));
            for (const match of value.matchAll(/datum\[['"]([^'"]+)['"]\]|datum\.([A-Za-z_$][\w$]*)/g)) transformed.add(match[1] ?? match[2]);
        } else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    const baselines: BuiltFacts['baselines'] = {};
    const ownScales: BuiltFacts['ownScales'] = new Set();
    const fitted: BuiltFacts['fitted'] = new Set();
    const rounded: BuiltFacts['rounded'] = {};
    const reversed: BuiltFacts['reversed'] = new Set();
    const keys = new Map<string, BuiltFacts['keys'][number]>();
    walk(spec, (node) => {
        for (const channel of KEY_CHANNELS) {
            const encoding = node.encoding?.[channel];
            if (typeof encoding?.field !== 'string' || encoding.legend === null || encoding.scale === null) continue;
            const field = unescape(encoding.field);
            if (!keys.has(`${channel}:${field}`)) {
                keys.set(`${channel}:${field}`, { channel, field, ...(encoding.legend && 'title' in encoding.legend ? { title: encoding.legend.title } : {}) });
            }
        }
        for (const channel of ['x', 'y'] as const) {
            if (node.encoding?.[channel]?.scale?.reverse === true) reversed.add(channel);
        }
        for (const channel of ['x', 'y'] as const) {
            const nice = node.encoding?.[channel]?.scale?.nice;
            if (typeof nice === 'boolean' && node.encoding[channel].type === 'quantitative' && node.encoding[channel].scale?.domain == null) {
                rounded[channel] = nice;
            }
        }
        for (const step of Array.isArray(node.transform) ? node.transform : []) {
            const field = step?.regression ?? step?.loess;
            if (typeof field !== 'string') continue;
            for (const channel of ['x', 'y'] as const) {
                if (node.encoding?.[channel]?.field === field) fitted.add(channel);
            }
        }
        for (const channel of ['x', 'y'] as const) {
            const encoding = node.encoding?.[channel];
            if (encoding?.type === 'quantitative' && (encoding.scale?.domain != null || encoding.axis?.values != null)) ownScales.add(channel);
        }
        if (Array.isArray(node.transform)) collect(node.transform);
        for (const channel of ['x', 'y'] as const) {
            const zero = node.encoding?.[channel]?.scale?.zero;
            if (typeof zero === 'boolean') baselines[channel] = zero ? 'zero' : 'data';
            else if (node.encoding?.[`${channel}2`]?.datum === 0) baselines[channel] = 'zero';
        }
        for (const [channel, keys] of [['x', ['x', 'x2']], ['y', ['y', 'y2']], ['angle', ['theta', 'theta2']], ['radius', ['radius', 'radius2']]] as const) {
            for (const key of keys) {
                const field = node.encoding?.[key]?.field;
                if (typeof field === 'string') fields[channel].add(unescape(field));
            }
        }
    });
    let stacking: Stacking | undefined;
    let implicit = false;
    let segmented = false;
    for (const body of plotBodies(spec)) {
        const units = body.layer ? body.layer : [body];
        for (const unit of units) {
            const mark = markTypeOf(unit.mark);
            if (!mark || !DATA_MARKS.has(mark)) continue;
            const encoding = { ...(body.encoding ?? {}), ...(unit.encoding ?? {}) };
            const quantitative = (channel: 'x' | 'y') => encoding[channel]?.type === 'quantitative' || Boolean(encoding[channel]?.aggregate);
            const measure = quantitative('y') && !quantitative('x') ? 'y'
                : quantitative('x') && !quantitative('y') ? 'x'
                : encoding.x?.stack !== undefined && encoding.y?.stack === undefined ? 'x' : 'y';
            const stated = statedStacking(encoding[measure]?.stack);
            if (stated && (mark === 'bar' || mark === 'area')) {
                stacking ??= stated;
                if (stated !== 'none') segmented = true;
                continue;
            }
            if (stated === undefined && (mark === 'bar' || mark === 'area') && quantitative(measure)
                && !encoding.xOffset && !encoding.yOffset && !encoding[`${measure}2`]) {
                implicit = true;
                const band = encoding[measure === 'y' ? 'x' : 'y']?.field;
                const facet = { ...(spec.facet ?? {}), ...(spec.encoding ?? {}) };
                const computed = band && !table.some((row) => row && unescape(band) in row);
                if (computed || bandsHoldSeveral(table, [band, facet.row?.field, facet.column?.field, facet.facet?.field]
                    .map((field) => (field ? unescape(field) : undefined)))) segmented = true;
            }
        }
    }
    return { marks: collectMarkTypes(spec), fields, transformed, stacking: stacking ?? (implicit ? 'stacked' : 'none'), segmented, baselines, ownScales, fitted, rounded, reversed, keys: [...keys.values()] };
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
 * As {@link walk}, but carrying the size of the view each node is drawn in.
 *
 * A composed spec has no single plot: a concat gives each panel its own width,
 * and a sparkline's line panel is a third of the chart it sits in. Anything
 * that budgets a mark against the space available to it — how much room a dot
 * has before it touches its neighbour — has to ask the view the mark is
 * actually drawn in, not the outermost one, or a panel is measured against a
 * plot several times its size. The nearest declared numeric `width`/`height`
 * wins; children inherit until one of them overrides it.
 */
function walkScoped(
    node: any,
    outer: { width?: number; height?: number },
    visit: (n: any, view: { width?: number; height?: number }) => void,
): void {
    if (!node || typeof node !== 'object') return;
    const view = {
        width: typeof node.width === 'number' ? node.width : outer.width,
        height: typeof node.height === 'number' ? node.height : outer.height,
    };
    visit(node, view);
    for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
        if (Array.isArray(node[key])) node[key].forEach((c: any) => walkScoped(c, view, visit));
    }
    if (node.spec) walkScoped(node.spec, view, visit);
    if (node.facet && node.facet.spec) walkScoped(node.facet.spec, view, visit);
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

export function realizeThemeVegaLite(
    spec: any, d: DesignDecisions, table: any[] = [],
    planned: Partial<Pick<LayoutPlan, 'axisLabels' | 'title' | 'valueLabels' | 'furniture' | 'legend' | 'points' | 'pointSize' | 'lineWidth' | 'rules' | 'rowNames'>> = {},
): ThemeReport[] {
    const { axisLabels, title, valueLabels, furniture, legend, points, pointSize, lineWidth, rules, rowNames } = planned;
    const report: ThemeReport[] = [];
    const say: ReportDeparture = (path, code, message) => report.push({ stage: 'realize', path, code, message });

    const config = (spec.config ??= {});

    applySurface(spec, config, d);
    applyTypography(config, d);
    applyAxes(spec, config, d, table, say, axisLabels, furniture?.yTitle);
    clearAxisCorner(spec, config, table);
    moveAxisTitlesToSubtitle(spec, d, title?.deck);
    applyZeroRule(spec, d, table);
    applyMarks(spec, d, table, say, points, pointSize, lineWidth);
    applySeriesInk(spec, d, table, say, legend);
    harmonizeLinePoints(spec, d, table, say, lineWidth);
    applyConnectors(spec, d);
    applyRedundantChannels(spec, d, say);
    if (legend?.demoted) say('legend.placement', legend.demotedFrom === 'inside' ? 'legend-inside-covered' : 'series-end-not-drawn', legend.demoted);
    const seriesEndLayout = legend?.seriesEnd;
    if (legend) applyLegend(spec, config, d, table, say, legend);
    applyFacetChrome(spec, config, d);
    applyPanelTitles(spec, d);
    const valueLayer = applyDataLabels(spec, d, table, say, valueLabels);
    applyArcRules(spec, d, table);
    applySeriesEndLabels(spec, d, valueLayer, table, say, seriesEndLayout, legend?.secondaryEdge, legend?.ownNames);
    applyPointEmphasis(spec, d, say);
    applyPrintedUnits(spec, d);
    applyStatistics(spec, d, table);
    applyVisibleInks(spec, d, say);
    applySeriesOutlines(spec, d);
    applyReadableSeriesText(spec, d, say);
    applyTextures(spec, d);
    applyGradientFills(spec, d, table, say);
    applyTypeCase(spec, config, d, table, say);
    applyDisplayType(spec, d);
    applyTableStyle(spec, d);
    applyPointOpacity(config, d, say, pointSize);
    applyPointShape(spec, config, d);
    applyLegendSwatch(spec, d);
    applyMinorGrid(spec, config, d, table, say);
    // Last among the layers, so it shares the scale every other layer finished with.
    applyBaseline(spec, d, table);
    // After the baseline, which it takes away: the names start where the bars do.
    if (rowNames) placeRowNamesAbove(spec, d, table, rowNames);
    fitTitle(spec, d, table, say, title, keysBesideWidth(legend?.layout?.footprint, legend?.layout?.offsets?.right ?? VEGA_LITE_KEY_OFFSET));
    const wrapped = applyFurniture(spec, d, rules);

    return wrapped ? report : report;
}

/**
 * How opaque the house's dots are. Vega-Lite draws unaggregated dots at 0.7 unless told; the
 * config tells it, and a chart that set its own opacity on the mark keeps it. A fading house's dots
 * that the plan shrank rise toward solid ({@link coupledPointOpacity}).
 */
function applyPointOpacity(config: any, d: DesignDecisions, say: ReportDeparture, pointSize?: number): void {
    const house = d.marks.point?.opacity;
    if (house == null) return;
    const opacity = coupledPointOpacity(house, d.marks.point?.size, pointSize);
    if (opacity !== house) {
        say('marks.point.opacity', 'fade-follows-shrink',
            `the plot is full, so the dots shrink to ${pointSize}px² and their opacity rises from ${house} to ${opacity}: a lone dot stays readable while piles still darken`);
    }
    for (const family of ['point', 'circle', 'square'] as const) {
        config[family] = { ...(config[family] ?? {}), opacity };
    }
}

/**
 * Whether standalone dots carry the house's halo: it declared one, the dots are solid, and no
 * outline takes the stroke. A halo and an opacity are two answers to overlap, and they cancel: a
 * ring cuts a clean edge through the solid dot beneath it, while an opacity lets stacked dots add up
 * to a darker pile, which the rings would break into a lattice. A house that fades its dots keeps the
 * opacity.
 */
function dotHaloOn(d: DesignDecisions): boolean {
    const dot = d.marks.point;
    // A hollow dot is its ring: one in the page's colour would leave nothing to see.
    return Boolean(dot?.haloDots && dot.haloColor && !d.marks.outline && dot.filled !== false && (dot.opacity ?? 1) >= 1);
}

/** Whether a dot mark sets its own opacity, on the mark or as an encoding: the chart's choice, which the halo yields to. */
function dotFadedByChart(node: any): boolean {
    const opacity = typeof node.mark === 'object' ? node.mark?.opacity : undefined;
    return (typeof opacity === 'number' && opacity < 1) || node.encoding?.opacity !== undefined;
}

/**
 * The house's halo on standalone dots: a ring in the plot's colour, a quarter of the dot's radius
 * so it does not eat small dots, at most the house's width ({@link pointHaloWidth}). Dots under
 * {@link MIN_HALO_DOT} px² keep no ring: it would be most of the dot. Ringed dots, and a halo house's
 * dots too small for one, are solid; Vega-Lite would otherwise draw them at 0.7. A chart that fades
 * its own dots keeps its opacity and loses the ring.
 */
function applyDotHalo(spec: any, config: any, d: DesignDecisions, say: ReportDeparture, pointSize?: number): void {
    const dot = d.marks.point;
    if (dot?.haloDots && (dot.opacity ?? 1) < 1) {
        say('marks.point.halo', 'halo-yields-to-opacity',
            'the house fades its dots, and a ring would break the darker pile an opacity shows into a lattice, so the dots carry no ring');
    }
    if (!dotHaloOn(d)) return;
    const size = pointSize ?? dot!.size ?? 30;
    const ringed = size >= MIN_HALO_DOT;
    if (!ringed) {
        say('marks.point.halo', 'halo-dropped-small-dots',
            `the dots are ${size}px², too small for a ring that would be most of the dot, so they are drawn solid without one`);
    }
    const width = pointHaloWidth(d, size);
    // `circle` and `square` are filled dots; a bare `point` is hollow unless the house fills it, and
    // its config also styles a line's dots, which take their halo from `config.line.point`.
    const families = dot!.filled === true ? (['point', 'circle', 'square'] as const) : (['circle', 'square'] as const);
    for (const family of families) {
        config[family] = { ...(config[family] ?? {}), ...(ringed ? { stroke: dot!.haloColor, strokeWidth: width } : {}), opacity: 1 };
    }
    if (!ringed) return;
    let saidChart = false;
    walk(spec, (node) => {
        const type = markTypeOf(node.mark);
        if (type !== 'point' && type !== 'circle' && type !== 'square') return;
        if (!dotFadedByChart(node)) return;
        node.mark = { ...normalizeMark(node.mark), strokeWidth: 0 };
        if (!saidChart) {
            say('marks.point.halo', 'halo-yields-to-opacity', 'the chart fades its dots, so they carry no ring');
            saidChart = true;
        }
    });
}

/** A key title's Vega-Lite settings, from the house's resolved `keyTitle` role. */
function keyTitleConfig(title: ResolvedText): Record<string, unknown> {
    return {
        titleFont: title.font,
        titleFontSize: title.fontSize,
        titleFontWeight: title.fontWeight ?? 'bold',
        ...(title.fontStyle ? { titleFontStyle: title.fontStyle } : {}),
        titleColor: title.color,
    };
}

/** Vega's names for the house's glyphs. */
const VEGA_POINT_SHAPE: Record<PointShape, string> = {
    circle: 'circle', square: 'square', diamond: 'diamond', triangle: 'triangle-up', cross: 'cross',
};
/** Vega's own order for a shape scale, which the house's glyph is moved to the head of. */
const VEGA_SHAPE_RANGE = ['circle', 'square', 'triangle-up', 'cross', 'diamond', 'triangle-right', 'triangle-down', 'triangle-left'];

/**
 * The house's glyph for every dot. `config.point` reaches point marks and the dots a line
 * carries; `circle` and `square` marks hard-code their glyph, so they are redrawn as points
 * carrying everything their config gave them. A chart that encodes shape keeps its encoding,
 * and the house's glyph is the first its scale hands out.
 */
function applyPointShape(spec: any, config: any, d: DesignDecisions): void {
    const shape = d.marks.point?.shape;
    if (!shape || shape === 'circle') return;
    const glyph = VEGA_POINT_SHAPE[shape];
    config.point = { ...(config.point ?? {}), shape: glyph };
    if (config.line?.point && typeof config.line.point === 'object') config.line.point = { ...config.line.point, shape: glyph };
    config.range = { ...(config.range ?? {}), symbol: [glyph, ...VEGA_SHAPE_RANGE.filter((s) => s !== glyph)] };
    walk(spec, (node) => {
        const type = markTypeOf(node.mark);
        if (type === 'point') {
            const mark = normalizeMark(node.mark);
            if (mark.shape == null && !node.encoding?.shape) node.mark = { ...mark, shape: glyph };
            return;
        }
        if (type !== 'circle' && type !== 'square') return;
        const mark = normalizeMark(node.mark);
        const own = config[type] ?? {};
        node.mark = {
            ...own,
            ...mark,
            type: 'point',
            ...(node.encoding?.shape ? {} : { shape: glyph }),
            // A `point` is hollow unless told; a circle or square was filled.
            filled: mark.filled ?? own.filled ?? true,
        };
    });
}

/** Vega's legend symbols for the house's swatches. */
const VEGA_SWATCH: Record<NonNullable<DesignDecisions['legend']['swatch']>, string> = {
    square: 'square', circle: 'circle', line: 'stroke',
};

/**
 * The house's swatch for every key to categories. Written on the encoding, where Vega-Lite reads
 * it before the symbol it would infer from the mark. A key that is itself a shape or a size keeps
 * its symbols: those *are* the entries.
 */
function applyLegendSwatch(spec: any, d: DesignDecisions): void {
    const swatch = d.legend.swatch;
    if (!swatch) return;
    const symbolType = VEGA_SWATCH[swatch];
    walk(spec, (node) => {
        const enc = node.encoding;
        if (!enc) return;
        for (const channel of ['color', 'fill', 'stroke'] as const) {
            const def = enc[channel];
            if (!def?.field || def.legend === null) continue;
            if (def.type === 'quantitative' || def.type === 'temporal') continue;
            if (enc.shape?.field === def.field || enc.size?.field === def.field) continue;
            if (def.legend?.symbolType != null) continue;
            enc[channel] = { ...def, legend: { ...(def.legend ?? {}), symbolType } };
        }
    });
}

/** Vega-Lite's own sort ops, as far as a band's order needs them. */
const BAND_ORDER_OPS: Record<string, (values: number[]) => number> = {
    count: (values) => values.length,
    valid: (values) => values.length,
    sum: (values) => values.reduce((total, value) => total + value, 0),
    mean: (values) => values.reduce((total, value) => total + value, 0) / values.length,
    average: (values) => values.reduce((total, value) => total + value, 0) / values.length,
    min: (values) => Math.min(...values),
    max: (values) => Math.max(...values),
    median: (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = sorted.length >> 1;
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    },
};

/**
 * A band's order that the names' layer can share. The names draw from a table of their own, so the
 * band's domain is a union, and a union can neither sort by a channel the names do not encode nor by
 * a sum. A sort by another channel or field becomes the list of names in the order the bars stand,
 * computed as Vega-Lite would; any other sort is already one every layer can state.
 */
function bandOrder(sort: any, field: string, enc: any, table: any[]): any {
    let by: { field?: string; op: string; descending: boolean } | undefined;
    const stacked = (['color', 'opacity', 'detail'] as const)
        .some((channel) => enc[channel]?.field && enc[channel].field !== field);
    const encodingSort = typeof sort === 'string' && /^-?[a-zA-Z]+$/.test(sort) && sort !== 'ascending' && sort !== 'descending'
        ? { encoding: sort.replace(/^-/, ''), order: sort.startsWith('-') ? 'descending' : 'ascending' }
        : sort && typeof sort === 'object' && !Array.isArray(sort) && sort.encoding ? sort : undefined;
    if (encodingSort) {
        const def = enc[encodingSort.encoding];
        if (!def?.field && def?.aggregate !== 'count') return undefined;
        const measureStacked = stacked && def.stack !== null && def.stack !== false && def.type === 'quantitative';
        by = { field: def.field, op: def.aggregate ?? (measureStacked ? 'sum' : 'min'), descending: encodingSort.order === 'descending' };
    } else if (sort && typeof sort === 'object' && !Array.isArray(sort) && (sort.field || sort.op === 'count')) {
        by = { field: sort.field, op: sort.op ?? 'min', descending: sort.order === 'descending' };
    }
    if (!by) return sort;
    const aggregate = BAND_ORDER_OPS[by.op];
    if (!aggregate) return sort;
    const groups = new Map<unknown, number[]>();
    for (const row of table) {
        const name = row?.[field];
        if (name == null) continue;
        if (!groups.has(name)) groups.set(name, []);
        const value = by.op === 'count' ? 1 : Number(row?.[by.field!]);
        if (by.op === 'count' || (row?.[by.field!] != null && Number.isFinite(value))) groups.get(name)!.push(value);
    }
    const keyed = [...groups].map(([name, values]) => ({ name, key: values.length ? aggregate(values) : undefined }));
    const direction = by.descending ? -1 : 1;
    // Stable, so ties keep the order the rows first meet them; names with nothing to sort by go last.
    keyed.sort((a, b) => a.key === undefined ? (b.key === undefined ? 0 : 1) : b.key === undefined ? -1 : direction * (a.key - b.key));
    return keyed.map(({ name }) => name);
}

/**
 * Names on their own line above each bar, as the plan set them: the band holds the name, a small gap
 * and the bar, so the bands carry no padding of their own; the bar is drawn at the thickness the
 * plan gave it, and it and everything else drawn on its band — its value, a segment's number — move
 * down together to stand under the name. The names start at the plot's left edge and run its width.
 */
function placeRowNamesAbove(spec: any, d: DesignDecisions, table: any[], plan: NonNullable<LayoutPlan['rowNames']>): void {
    if (!Array.isArray(spec.layer) && spec.mark) {
        const { mark, encoding, ...rest } = spec;
        for (const key of Object.keys(spec)) delete spec[key];
        Object.assign(spec, rest, { layer: [{ mark, ...(encoding ? { encoding } : {}) }] });
    }
    if (!Array.isArray(spec.layer)) return;
    const banded = (enc: any) => enc?.y?.field && (enc.y.type === 'nominal' || enc.y.type === 'ordinal');
    const bar = spec.layer.find((unit: any) => markTypeOf(unit.mark) === 'bar' && banded(mergedEncoding(unit, spec.encoding)));
    if (!bar) return;
    const y = mergedEncoding(bar, spec.encoding).y;
    const field: string = y.field;
    const stated = y.sort;
    const sort = bandOrder(stated, field, mergedEncoding(bar, spec.encoding), table);
    const centre = plan.step / 2;
    // From the band's middle, where Vega-Lite stands what it draws on a band.
    const barShift = Math.round(plan.top + plan.line + plan.gap + plan.bar / 2 - centre);
    for (const unit of spec.layer) {
        const enc = mergedEncoding(unit, spec.encoding);
        if (!banded(enc) || enc.y.field !== field) continue;
        const target = unit.encoding?.y ?? spec.encoding?.y;
        if (target) {
            if (sort !== stated) target.sort = sort;
            target.scale = { ...(target.scale ?? {}), paddingInner: 0, paddingOuter: 0 };
            target.axis = target.axis === null ? null : { ...(target.axis ?? {}), labels: false, ticks: false, domain: false };
        }
        const mark = normalizeMark(unit.mark);
        unit.mark = {
            ...mark,
            ...(markTypeOf(mark) === 'bar' ? { height: plan.bar } : {}),
            yOffset: (typeof mark.yOffset === 'number' ? mark.yOffset : 0) + barShift,
        };
    }
    // The names start where the bars do: a rule up the zero line would run through every one.
    spec.layer = spec.layer.filter((unit: any) => !(unit.__themeSynthetic && markTypeOf(unit.mark) === 'rule'
        && unit.encoding?.x?.datum === 0 && !unit.encoding?.y));
    const label = d.axes.y?.label;
    const names = [...new Set(table.map((row) => row?.[field]).filter((value) => value != null))];
    const textCase = label?.textCase;
    spec.layer.push({
        __themeSynthetic: true,
        name: 'row-names',
        data: { values: names.map((name) => ({ [field]: name, __rowName: textCase ? applyTextCase(String(name), textCase) : String(name) })) },
        mark: {
            type: 'text', align: 'left', baseline: 'bottom',
            yOffset: Math.round(plan.top + plan.line - centre),
            fontSize: plan.fontSize,
            ...(label?.font ? { font: label.font } : {}),
            ...(label?.fontWeight ? { fontWeight: label.fontWeight } : {}),
            ...(label?.fontStyle ? { fontStyle: label.fontStyle } : {}),
            ...(label?.color ? { color: label.color } : {}),
            limit: plan.width,
        },
        encoding: {
            y: { field, type: y.type, ...(sort !== undefined ? { sort } : {}), axis: { title: null, labels: false, ticks: false, domain: false } },
            x: { value: 0 },
            text: { field: '__rowName', type: 'nominal' },
        },
    });
}

/**
 * Print the value labels, and nothing else.
 *
 * Value labels belong to Flint, not to a house: a bar chart can carry its own
 * numbers with no theme in sight. What a house adds is a *preference* — whether
 * it likes them on, and how crowded a chart it will still print them in. So
 * when the caller named no house, this runs alone over the neutral grounding,
 * rather than dragging the entire visual layer in behind one label.
 */
export function realizeValueLabelsVegaLite(
    spec: any, d: DesignDecisions, table: any[] = [], title?: TitlePlan, valueLabels?: ValueLabelPlan | { refused: string },
    keyFootprint?: Array<{ orient: string; width: number }>,
    keyOffset = VEGA_LITE_KEY_OFFSET,
): ThemeReport[] {
    const report: ThemeReport[] = [];
    const say: ReportDeparture = (path, code, message) => report.push({ stage: 'realize', path, code, message });
    applyDataLabels(spec, d, table, say, valueLabels);
    // Staying inside the size the caller asked for is the same kind of concern:
    // Vega-Lite grows the canvas to whatever one unbroken line of title needs,
    // and a long deck took a 420px chart out to 1,249px with no house in sight.
    fitTitle(spec, d, table, say, title, keysBesideWidth(keyFootprint, keyOffset));
    return report;
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
    if (d.frame.show && d.frame.dash) config.view.strokeDash = d.frame.dash;
    if (d.surface.plot && d.surface.plot !== d.surface.canvas) config.view.fill = d.surface.plot;

    if (spec.padding == null) spec.padding = d.layout.padding;
}

/**
 * A stated weight worth writing where the renderer's default is normal: anything but 400, which
 * Vega-Lite draws anyway (writing it only adds an attribute).
 */
function heavierThanNormal(weight: ResolvedText['fontWeight']): boolean {
    return weight != null && weight !== 400 && weight !== 'normal';
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
        orient: d.title.position,
        offset: d.title.offset,
        subtitleFont: deck.font,
        subtitleFontSize: deck.fontSize,
        ...(heavierThanNormal(deck.fontWeight) ? { subtitleFontWeight: deck.fontWeight } : {}),
        ...(deck.fontStyle ? { subtitleFontStyle: deck.fontStyle } : {}),
        subtitleColor: deck.color,
        subtitlePadding: d.title.deckPadding,
    };
    // A start-anchored headline belongs at the edge of the *graphic*, not at
    // the left edge of the plotting rectangle — otherwise the width of the
    // category labels decides where the title starts.
    // `plot` starts the title at the plot's own edge (Vega's `group` frame), so it lines up with the x axis.
    if (d.title.anchor !== 'middle') config.title.frame = d.title.frame === 'plot' ? 'group' : 'bounds';
}

// ---------------------------------------------------------------------------
// Title fitting
// ---------------------------------------------------------------------------

/**
 * Fit a headline that runs wider than the block it sits over.
 *
 * Vega-Lite measures the title as one unbroken run and grows the *canvas* to
 * fit it, so a long headline quietly widens the graphic past the size the
 * caller asked for and leaves the plot stranded at one end.
 *
 * Three answers, cheapest first: a headline that only just overhangs is left
 * alone, because a graphic a little wider than its plot is normal and a break
 * there would be gratuitous; one that overhangs more is set down a size; only
 * a headline that still does not fit at the smaller size is broken, and then
 * over full lines with no orphan at the end. Broken lines are
 * taken out of the plot rather than added to the canvas.
 */
/** Vega-Lite's offset between the plot and a key beside it, as the plan's profile measures it. */
const VEGA_LITE_KEY_OFFSET = 18;

function fitTitle(spec: any, d: DesignDecisions, table: any[], say: ReportDeparture, planned?: TitlePlan, keysBeside = 0): void {
    if (planned) {
        applyHeadlineFit(spec, d, planned.block, planned.headline, say);
        applyDeckFit(spec, planned.block, planned.deckFit, say);
        // Vega-Lite centres the title over the plot; the plan moves it the least that keeps it within the drawing.
        if (planned.shift && spec.title) {
            spec.title = { ...(typeof spec.title === 'string' ? { text: spec.title } : spec.title), dx: planned.shift };
            say('title', 'title-moved-within', `centred over the plot, the title would run past the drawing's edge, so it is moved ${Math.abs(planned.shift)}px ${planned.shift < 0 ? 'left' : 'right'}, the least that keeps it within the chart`);
        }
        return;
    }
    // A title spans the whole graphic, not just the plot rectangle: the axis
    // gutter under it is the title's to use. Measuring against the plot alone
    // broke a headline that had 150px of room to spare beside the row labels.
    const plot = blockWidth(spec, table);
    const gutters = { left: 0, right: 0 };
    walk(spec, node => {
        const encoding = node.encoding?.y;
        if (!encoding?.field || encoding.axis === null
            || !['nominal', 'ordinal'].includes(encoding.type)) return;
        const axis = { ...spec.config?.axis, ...spec.config?.axisY, ...encoding.axis };
        if (axis.labels === false || (axis.labelAngle ?? 0) !== 0) return;
        const size = axis.labelFontSize ?? d.axes.y?.label.fontSize ?? 10;
        const limit = axis.labelLimit ?? 180;
        let labelWidth = 0;
        const values = axis.values ?? encoding.scale?.domain ?? table.map(row => row[encoding.field]);
        if (!Array.isArray(values)) return;
        for (const value of values) {
            if (value == null) continue;
            for (const line of String(value).split('\n')) labelWidth = Math.max(labelWidth, textPx(line, size));
        }
        if (limit > 0) labelWidth = Math.min(labelWidth, limit);
        const side = (axis.orient ?? d.axes.y?.orient) === 'right' ? 'right' : 'left';
        const ticks = axis.ticks === false ? 0 : Math.max(0, axis.tickSize ?? 5);
        gutters[side] = Math.max(gutters[side], labelWidth + Math.max(0, axis.labelPadding ?? 2) + ticks);
    });
    // Keys beside the plot are within the graphic too: the title may run over them.
    const block = Math.max((plot ?? 0) + gutters.left + gutters.right + keysBeside, canvasContentWidth(d.layout));
    if (!block || !Number.isFinite(block)) return;
    const headline = typeof spec.title === 'string' ? spec.title : spec.title?.text;
    const measure = titleMeasures(d.title, d.font, tableTextMeasurer);
    applyHeadlineFit(spec, d, block, typeof headline === 'string' && headline.trim()
        ? fitHeadlineText(headline, block, d.title.headline.fontSize ?? 14, d.title.deck.fontSize ?? 11, measure.headline) : undefined, say);
    const subtitle = spec.title && typeof spec.title === 'object' ? spec.title.subtitle : undefined;
    const deck = Array.isArray(subtitle) ? subtitle.join(' ') : subtitle;
    applyDeckFit(spec, block, typeof deck === 'string' && deck.trim() ? fitDeckText(deck, block, d.title.deck.fontSize ?? 11, measure.deck) : undefined, say);
}

/**
 * Where the x ruler centres its end labels, the first one hangs left of the plot, under the y labels;
 * the lowest y label, centred on the plot's foot, hangs half a line below it. The x labels drop
 * just far enough that the two cannot touch, so neither leaves its tick.
 */
function clearAxisCorner(spec: any, config: any, table: any[]): void {
    const read = (axis: any, channel: 'X' | 'Y', key: string) =>
        axis?.[key] ?? config[`axis${channel}`]?.[key] ?? config.axis?.[key];
    walk(spec, (node) => {
        const x = node.encoding?.x;
        const y = node.encoding?.y;
        if (!x?.field || !y?.field || x.axis === null || y.axis === null) return;
        if (!['temporal', 'quantitative'].includes(x.type) || !['temporal', 'quantitative'].includes(y.type)) return;
        if (read(x.axis, 'X', 'labelFlush') !== false || read(x.axis, 'X', 'labels') === false || read(y.axis, 'Y', 'labels') === false) return;
        if ((read(x.axis, 'X', 'orient') ?? 'bottom') !== 'bottom' || (read(y.axis, 'Y', 'orient') ?? 'left') !== 'left') return;
        if ((read(x.axis, 'X', 'labelAngle') ?? 0) !== 0 || read(y.axis, 'Y', 'labelFlush')) return;
        // Only a first label on the plot's left edge hangs under the y labels.
        if (!firstTickAtStart(x, table)) return;
        const overhang = (read(y.axis, 'Y', 'labelFontSize') ?? 10) / 2;
        const ticks = read(x.axis, 'X', 'ticks') === false ? 0 : Math.max(0, read(x.axis, 'X', 'tickSize') ?? 5);
        const padding = read(x.axis, 'X', 'labelPadding') ?? 2;
        const needed = Math.ceil(overhang + 2 - ticks);
        if (padding < needed) x.axis = { ...(x.axis ?? {}), labelPadding: needed };
    });
}

/** Whether an x ruler's first stated tick is the first value the data holds, so its label sits on the plot's edge. */
function firstTickAtStart(x: any, table: any[]): boolean {
    const values = x.axis?.values;
    if (!Array.isArray(values) || !values.length || !Array.isArray(table)) return false;
    const time = (value: unknown): number => {
        if (typeof value === 'number') return x.type === 'temporal' && Math.abs(value) < 10000 ? Date.UTC(value, 0, 1) : value;
        if (typeof value === 'string') return x.type === 'temporal' ? Date.parse(value) : Number(value);
        if (value instanceof Date) return +value;
        return NaN;
    };
    let start = Infinity;
    for (const row of table) {
        const value = time(row?.[x.field]);
        if (Number.isFinite(value)) start = Math.min(start, value);
    }
    const first = Math.min(...values.map(time).filter(Number.isFinite));
    // Within half a day: a date written without a zone may be read in local time.
    return Number.isFinite(start) && Number.isFinite(first) && Math.abs(first - start) <= (x.type === 'temporal' ? 43200000 : 0);
}

function moveAxisTitlesToSubtitle(
    spec: any, decisions: DesignDecisions, plannedDeck?: string,
): void {
    if (spec.title === null) return;
    const titles = new Map<string, Set<string>>();
    const head = spec.title && typeof spec.title === 'object' && !Array.isArray(spec.title) ? spec.title : { text: spec.title };
    const said = (deckOnly: boolean) => [deckOnly ? [] : head.text, head.subtitle].flat(2).filter((t: unknown) => typeof t === 'string').join(' ');
    for (const channel of ['x', 'y'] as const) {
        if (decisions.axes[channel]?.title.placement !== 'subtitle') continue;
        walk(spec, node => {
            const encoding = node.encoding?.[channel];
            if (!encoding || encoding.axis === null || encoding.axis?.title === null || encoding.title === null) return;
            const title = encoding.axis?.title ?? titleOf(encoding);
            const text = Array.isArray(title) ? title.join(' ') : title;
            if (typeof text !== 'string' || !text.trim()) return;
            encoding.axis = { ...encoding.axis, title: null };
            const unlessNamed = decisions.axes[channel]?.title.unlessNamed;
            if (unlessNamed && alreadyNamed(text, said(unlessNamed === 'deck'), tickUnitOf(decisions.axes[channel]))) return;
            if (!titles.has(channel)) titles.set(channel, new Set());
            titles.get(channel)!.add(text);
        });
    }
    if (!titles.size) return;
    const labels = [...titles].map(([channel, names]) =>
        `${titles.size > 1 ? `${channel.toUpperCase()}: ` : ''}${[...names].join(', ')}`);
    const title = typeof spec.title === 'string' || Array.isArray(spec.title)
        ? { text: spec.title } : spec.title ?? { text: '' };
    const subtitle = [title.subtitle ?? []].flat().join(' ');
    spec.title = { ...title, subtitle: [plannedDeck ?? [subtitle, ...labels].filter(Boolean).join('; ')] };
}

/**
 * Break a deck that runs wider than the block it sits under.
 *
 * The headline above it is fitted; the deck was not, so a long one widened the
 * graphic on its own even after the headline had been brought to heel. It is
 * only ever broken, never set smaller: the deck is already the quietest line in
 * the block, and taking it down again would cost legibility to buy width.
 */
function applyDeckFit(
    spec: any, block: number, fit: ReturnType<typeof fitDeckText>, say: ReportDeparture,
): void {
    if (!fit || !spec.title || typeof spec.title !== 'object') return;
    spec.title = { ...spec.title, subtitle: fit.lines };
    takeFromPlotHeight(spec, fit.taken);
    say('title.subtitle', 'deck-broken',
        `the deck overhangs the ${Math.round(block)}px block, so it breaks over ${fit.lines.length} lines`
        + ' — the height comes out of the plot, not out of the canvas the caller asked for');
}

function applyHeadlineFit(
    spec: any, d: DesignDecisions, block: number, fit: ReturnType<typeof fitHeadlineText>, say: ReportDeparture,
): void {
    const title = spec.title;
    const text = typeof title === 'string' ? title : title?.text;
    if (!fit || typeof text !== 'string') return;
    spec.title = {
        ...(typeof title === 'string' ? { text } : title),
        ...(fit.lines ? { text: fit.lines } : {}),
        ...(fit.fontSize !== undefined ? { fontSize: fit.fontSize } : {}),
    };
    if (!fit.lines) {
        say('title', 'title-set-smaller', `the headline overhangs the ${Math.round(block)}px block, so it is set at ${fit.fontSize}px rather than broken`);
        return;
    }
    takeFromPlotHeight(spec, fit.taken);
    say(
        'title',
        'title-broken',
        `the headline does not fit the ${Math.round(block)}px block even at ${fit.smaller}px,`
        + ` so it breaks at its own size over ${fit.lines.length} lines, each filled to the block — the height`
        + ' comes out of the plot, not out of the canvas the caller asked for',
    );
}

/** Take pixels out of the plotting rectangle, wherever its height is stated. */
function takeFromPlotHeight(spec: any, px: number): void {
    const view = spec.config?.view;
    if (view && typeof view.continuousHeight === 'number') {
        view.continuousHeight = plotHeightAfter(view.continuousHeight, px);
    }
    // The plot gives the height, never the rules a theme set around it: those keep their own.
    walk(spec, (node) => {
        if (node.__themeSynthetic) return;
        if (typeof node.height === 'number') {
            node.height = plotHeightAfter(node.height, px);
            fitArcsToPlot(node);
        }
    });
}

/** The room left round a pie for its slice outlines, in px, as its template leaves it. */
const ARC_MARGIN = 4;

/**
 * A pie or donut whose plot came out shorter than it was sized for keeps inside it: its wedges, its
 * hole and the ring its labels ride on come in by one factor, so they still agree.
 */
function fitArcsToPlot(node: any): void {
    if (typeof node.width !== 'number' || typeof node.height !== 'number') return;
    const units: any[] = [node, ...(node.layer ?? [])].filter((unit) => unit.mark);
    const arcs = units.filter((unit) => markTypeOf(unit.mark) === 'arc');
    const outer = Math.max(0, ...arcs.map((unit) => normalizeMark(unit.mark)?.outerRadius).filter((r): r is number => typeof r === 'number'));
    const cap = Math.floor(Math.min(node.width, node.height) / 2) - ARC_MARGIN;
    if (!outer || outer <= cap || cap <= 0) return;
    const k = cap / outer;
    for (const unit of units) {
        const mark = normalizeMark(unit.mark);
        if (!mark) continue;
        const scaled = { ...mark };
        for (const prop of ['outerRadius', 'innerRadius', 'radius', 'radius2'] as const) {
            if (typeof scaled[prop] === 'number') scaled[prop] = Math.round(scaled[prop] * k);
        }
        unit.mark = scaled;
    }
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

const NONLINEAR_SCALES = new Set(['log', 'symlog', 'pow', 'sqrt']);

function applyAxes(
    spec: any, config: any, d: DesignDecisions, table: any[], say: ReportDeparture,
    axisLabels: Record<'x' | 'y', AxisLabelPlan> | undefined,
    flatYTitle?: FurniturePlan['yTitle'],
): void {
    // The axes a range frame draws, once their lines are known.
    const rangeFramed: ('x' | 'y')[] = [];
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
        //
        // It is also an argument about *lengths*. The rule lies only if
        // someone reads a distance from it, and only bars and areas are read
        // that way. A strip plot's dots, a dumbbell's dots and a bump chart's
        // lines are read against the tick labels; none of them reaches the
        // bottom of the plot, so the line there is doing what the left-hand
        // spine does — bounding the window and giving the category labels
        // something to hang from. A house that draws one wall and not the
        // other has not made a point about zero, it has lost a wall.
        let domainShow = axis.domain.show;
        if (domainShow && axis.indexing && bandedAxis(spec, channel)
            && floatingValueScale(spec, channel) && lengthsFromIndexAxis(spec, channel)) {
            domainShow = false;
            say(`axes.${channel}.domain`, 'domain-not-drawn',
                'the value scale floats — a rule under the categories would claim a base the chart does not have');
        }
        // Where the value scale floats, the house says what its axis lines are (`floating`). Unset, a
        // house that rules its value axis frames the window; one that grids its values instead reads
        // the line along the floor as a base. A base off zero would claim one the chart does not
        // have, and a line that is not a base is at most a gridline — the value grid already draws
        // one there where a tick stands, and where none does, a line would mark a value nobody
        // labelled. So that house leaves the floor to the grid; zero, where the chart crosses it,
        // carries the base.
        const valueAxis = d.axes[channel === 'x' ? 'y' : 'x'];
        const floating = floatingMode(d);
        const floats = floatingFloor(spec, d, table);
        const floorIsGrid = domainShow && axis.indexing && floats && floating === 'omit';
        // A range frame: the line spans the data alone and stands off the plot, on a continuous axis.
        const ranged = domainShow && floats && floating === 'rangeFrame' && continuousAxis(spec, channel);
        if (ranged) rangeFramed.push(channel);
        if (floorIsGrid) {
            domainShow = false;
            say(`axes.${channel}.domain`, 'domain-not-drawn',
                'the value scale does not start at zero — the floor is not a base, so the value grid draws it where a tick stands');
        }
        const themed: any = {
            grid: axis.grid.show,
            gridColor: axis.grid.color,
            gridWidth: axis.grid.width,
            domain: domainShow && !ranged,
            ...(ranged ? { offset: RANGE_FRAME_OFFSET } : {}),
            domainColor: axis.domain.color,
            domainWidth: axis.domain.width,
            // Ticks hang from the axis line: where the house draws one and the chart withholds it,
            // its ticks go with it rather than float.
            ticks: axis.ticks.show && (domainShow || !axis.domain.show) && !ranged,
            tickColor: axis.ticks.color,
            tickWidth: axis.ticks.width,
            tickSize: axis.ticks.size,
            labelFont: axis.label.font,
            ...(heavierThanNormal(axis.label.fontWeight) ? { labelFontWeight: axis.label.fontWeight } : {}),
            ...(axis.label.fontStyle ? { labelFontStyle: axis.label.fontStyle } : {}),
            labelColor: axis.label.color,
            labelPadding: axis.label.padding,
            // Flush end labels sit inside the axis; a diagonal end label anchored there runs over its neighbour.
            ...(axis.label.flush && (axisLabels?.[channel].angle ?? 0) % 90 === 0 ? { labelFlush: true } : {}),
            titleFont: axis.title.font,
            titleFontSize: axis.title.fontSize,
            titleColor: axis.title.color,
            titleFontWeight: axis.title.fontWeight ?? 'normal',
            ...(axis.title.fontStyle ? { titleFontStyle: axis.title.fontStyle } : {}),
            ...(axis.title.gap != null ? { titlePadding: axis.title.gap } : {}),
        };
        if (axis.grid.show && twoPositionLineAxis(spec, channel, table)) {
            themed.grid = false;
            themed.gridWidth = 0;
            say(`axes.${channel}.grid`, 'grid-not-drawn',
                'the line has exactly two banded positions — endpoint guides would either merge with a plot boundary or leave one column looking singled out, so both stand down');
        }
        if (axis.grid.dash) themed.gridDash = axis.grid.dash;
        // A grid stops at the plot edge, and where the marks reach that edge —
        // a histogram's last bar — the line is flush with the bar and its
        // number is stranded off to the side with nothing leading to it. The
        // house runs its rules on past the marks to end under the label they
        // belong to, so the grid is carried over the gutter as a tick in grid
        // ink. A house that draws its own ticks already has a mark there.
        if (themed.grid && axis.role === 'measure' && !axis.ticks.show
            && axis.label.show !== false) {
            const overshoot = gridOvershoot(axis);
            themed.ticks = true;
            themed.tickColor = axis.grid.color;
            themed.tickWidth = axis.grid.width;
            themed.tickSize = overshoot;
        }
        if (axis.ticks.offset) themed.tickOffset = axis.ticks.offset;
        if (axis.label.show === false) themed.labels = false;

        if (axis.tickCount != null) themed.tickCount = axis.tickCount;

        const existing = config[key] ?? {};

        const crowdedFrom = axisLabels?.[channel].crowdedFrom;
        if (crowdedFrom !== undefined) {
            say(`axes.${channel}.label.fontSize`, 'labels-shrunk',
                `the axis is crowded — the layout fitted its labels at ${axisLabels![channel].fontSize}px and the house's ${crowdedFrom}px would not stand in the band`);
        }

        const overflowFit = axisLabels?.[channel].overflowFit;
        if (overflowFit) {
            const how: Record<string, string> = {
                fit: 'set on one line in wider bands',
                wrap: 'broken over two lines',
                skip: `thinned to round values (${(overflowFit.shown ?? []).slice(0, 3).join(', ')}${(overflowFit.shown?.length ?? 0) > 3 ? ' …' : ''})`,
                rotate45: 'turned −45°',
                rotate90: 'stood upright',
            };
            say(`axes.${channel}.label.overflow`, 'labels-overflow',
                `the widest name needs ~${Math.round(overflowFit.needed)}px in a ${Math.round(overflowFit.band)}px band — the names are ${how[overflowFit.step] ?? overflowFit.step}${overflowFit.trimmed ? ', trimmed' : ''} (overflow step \`${overflowFit.step}${overflowFit.trimmed ? ' + trim' : ''}\`)`);
        }

        config[key] = { ...existing, ...themed };

        // Encoding-level axis objects outrank config, so anything a template
        // left behind in the keys this file owns has to go.
        let saidGutter = false;
        let saidUnit = false;
        let saidCompact = false;
        const defaultOrient = channel === 'x' ? 'bottom' : 'left';
        // One flat title per side: a left and a right ruler caption their own
        // values and never land on each other.
        const flatTitleSides = new Set<string>();
        // Layers may share one encoding object (a ridge per layer); each is styled once.
        const styled = new WeakSet<object>();
        walk(spec, (node) => {
            const enc = node.encoding?.[channel];
            if (!enc || enc.axis === null || styled.has(enc)) return;
            styled.add(enc);
            const ax = enc.axis;
            let unitNamedInTitle = false;
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
                        say(`axes.${channel}.label.padding`, 'label-padding-not-applied',
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
                    }
                }
                // The unit is written once. Where the title already carries it
                // — "CO2 (ppm)" — a unit on every tick states it a second time
                // down a ruler of "450 ppm", "400 ppm".
                const titleNow = enc.axis?.title ?? titleOf(enc);
                if (axis.unit && axis.title.placement !== 'subtitle' && typeof titleNow === 'string'
                    && titleNow.includes(axis.unit.text)) {
                    unitNamedInTitle = true;
                }
                // A title lying flat above its own axis reads as a label, not
                // as a caption turned on its side. Only the vertical axis has
                // anything to turn.
                const placement = axis.title.placement;
                // The title captions the column of values under it, so it
                // hangs off the side its own ticks are on — a title at the
                // plot's left edge over a right-seated ruler names the wrong
                // column. The house's orient wins where it has one; otherwise
                // the template's own seat (a second measure on the right)
                // stands.
                const side = axis.orient !== defaultOrient
                    ? axis.orient
                    : (enc.axis?.orient ?? defaultOrient);
                if (channel === 'y' && !flatTitleSides.has(side) && flatYTitle
                    && (placement === 'flatAboveAxis' || placement === 'inline')) {
                    const rightSeated = side === 'right';
                    const { lift } = flatYTitle;
                    enc.axis = {
                        ...(enc.axis ?? {}),
                        titleAngle: 0,
                        titleAlign: rightSeated ? 'right' : 'left',
                        titleAnchor: placement === 'inline' ? 'end' : 'start',
                        // On a right-hand ruler the renderer has already
                        // measured how wide the values ran, so leaving `titleX`
                        // unset seats the title on that outer edge. A guessed
                        // width cannot: it reads raw data rather than the ticks
                        // actually drawn, which stood the numbers off the grid
                        // on one chart and laid them back over the plot on
                        // another whose field is computed.
                        ...(rightSeated ? {} : { titleX: 0 }),
                        titleY: -lift,
                        titlePadding: 0,
                        titleBaseline: 'bottom',
                    };
                    // Both sides' titles sit on one line, so the room above
                    // the plot is bought once.
                    if (flatTitleSides.size === 0 && flatYTitle.top > 0) growPadding(spec, 'top', flatYTitle.top);
                    flatTitleSides.add(side);
                }
            }
            if (axis.orient !== defaultOrient) {
                enc.axis = { ...(enc.axis ?? {}), orient: axis.orient };
            }
            // A grid line the reader cannot name is not a grid, it is a fence.
            // A log scale offers a line at 2, 3, 4… of every decade, and Vega
            // prunes the *labels* that collide, not the lines or ticks under
            // them. Where the house draws a grid or ticks on such a scale, they
            // are cut back to the decades — the ones that will still carry a number.
            if ((themed.grid || themed.ticks) && NONLINEAR_SCALES.has(enc.scale?.type)
                && (enc.axis?.tickCount ?? enc.axis?.values) == null) {
                const span = plotSpan(spec, node, channel);
                const ticks = enc.scale?.type === 'log'
                    ? logTicks(table, enc.field, span, axis.label.fontSize ?? 10)
                    : decadeTicks(table, enc.field);
                if (ticks) {
                    enc.axis = { ...(enc.axis ?? {}), values: ticks };
                }
            }

            // A tick between two observations names a value the chart does not
            // hold: an axis of Olympic years does not have a 2014. Where the
            // house asks for the values the data carries, the axis is stepped
            // by what the data is actually spaced by.
            if (axis.indexing && axis.tickLabels && axis.tickLabels !== 'all'
                && enc.axis?.values == null && enc.axis?.tickCount == null) {
                const span = plotSpan(spec, node, channel);
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
                    } else {
                        const every = temporalStep(table, enc.field, span, fontSize);
                        if (every) {
                            enc.axis = { ...(enc.axis ?? {}), tickCount: every };
                        }
                    }
                } else if (enc.type === 'quantitative') {
                    const values = observedTicks(table, enc.field, axis.tickLabels, span, fontSize);
                    if (values) {
                        enc.axis = { ...(enc.axis ?? {}), values };
                    }
                }
            }

            // The plot's edge should fall on a grid line. Vega rounds the
            // domain to about ten ticks by default while the axis draws the
            // house's count, so the two disagree and the last line stops short
            // of the edge — leaving a reading above it with no line to be read
            // against.
            //
            // Only where a grid is actually drawn: rounding outward costs plot
            // width, and a house that rules nothing gets nothing back for it —
            // on a grid-less scatter it merely pushed the readings into a
            // corner, once dragging a `zero: false` axis back to zero. A
            // non-linear ruler is left alone too; its ticks are decades, not a
            // count.
            if (themed.grid && axis.tickCount != null && enc.type === 'quantitative' && !enc.bin
                && !NONLINEAR_SCALES.has(enc.scale?.type)
                && enc.scale?.domain == null && enc.scale?.nice !== false) {
                enc.scale = { ...(enc.scale ?? {}), nice: axis.tickCount };
            }

            // A house that cuts its grid across the marks (white rules over the bars) draws the axis in
            // front (GR2). Vega-Lite reads `zindex` from the axis itself, not from its config.
            if (axis.gridFront && axis.grid.show) enc.axis = { ...(enc.axis ?? {}), zindex: 1 };

            // A measure the house compacts prints its ticks in one unit, chosen from the ticks.
            if (axis.compact && enc.type === 'quantitative' && !enc.bin && axis.label.show !== false
                && !NONLINEAR_SCALES.has(enc.scale?.type) && !compactAxis(enc, axis.compact, table) && !saidCompact) {
                say(`axes.${channel}.compact`, 'compact-not-applied', 'the ruler’s labels are written by an expression the compaction cannot read, so they stay as they are');
                saidCompact = true;
            }

            // The unit has to be written somewhere. A house that drops axis
            // titles has taken away the usual place, so it says where else —
            // on every tick, or once at the end of the ruler.
            const unit = axis.unit;
            if (unit && unit.where !== 'never' && !unitNamedInTitle && axis.label.show !== false
                && (enc.type === 'quantitative' || enc.axis?.values != null)) {
                const tagged = tagWithUnit(enc.axis?.labelExpr, unit.text, unit.where);
                enc.axis = { ...(enc.axis ?? {}), labelExpr: tagged };
            } else if (unit && unit.where !== 'never' && unitNamedInTitle && !saidUnit) {
                say(`axes.${channel}.unit`, 'unit-not-drawn',
                    `the title already names \`${unit.text}\` — the ruler stays bare rather than repeating the unit down every tick`);
                saidUnit = true;
            }
        });
    }

    dropGridUnderSpine(spec, config);
    applyRangeFrame(spec, d, table, rangeFramed);
}

/** The plot's length along a channel: the view's own size, else the size the layout gave the view. */
function plotSpan(spec: any, node: any, channel: 'x' | 'y'): number {
    const size = channel === 'x' ? (node.width ?? spec.width) : (node.height ?? spec.height);
    if (typeof size === 'number') return size;
    const view = spec.config?.view;
    const continuous = channel === 'x' ? view?.continuousWidth : view?.continuousHeight;
    return typeof continuous === 'number' ? continuous : (channel === 'x' ? 600 : 300);
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

/** A line joining exactly two discrete columns; partial grid thinning would make the pair asymmetric. */
function twoPositionLineAxis(spec: any, channel: 'x' | 'y', table: any[]): boolean {
    if (!bandedAxis(spec, channel)) return false;
    let field: string | undefined;
    let line = false;
    walk(spec, (node) => {
        if (isLiteralMark(node) || markTypeOf(node.mark) !== 'line') return;
        const enc = node.encoding?.[channel];
        if (!enc?.field || (enc.type !== 'nominal' && enc.type !== 'ordinal')) return;
        field ??= enc.field;
        line = true;
    });
    if (!line || !field) return false;
    return new Set(table.map((row) => row?.[field!]).filter((value) => value != null)).size === 2;
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
/**
 * True when something on the chart is read as a *length* measured from the
 * index axis, so a rule drawn there would be the line that length starts at.
 *
 * Bars and areas are the marks that work this way: their reading is extent,
 * and the base they extend from is wherever the plot ends. Everything else on
 * a banded axis — dots, ticks, series lines — is read by position against the
 * labels, and stops well short of the edge; the edge is then just the edge.
 *
 * A bar or area given a second value channel is a *span*, not a length from a
 * base: a gantt task runs between two dates and a range band between two
 * values, and neither is measured from the bottom of the plot either.
 */
function lengthsFromIndexAxis(spec: any, indexChannel: 'x' | 'y'): boolean {
    const other = indexChannel === 'x' ? 'y' : 'x';
    let found = false;
    walk(spec, (node) => {
        if (found || isLiteralMark(node)) return;
        const type = markTypeOf(node.mark);
        if (type !== 'bar' && type !== 'area') return;
        if (node.encoding?.[`${other}2`]) return;
        found = true;
    });
    return found;
}

/**
 * Whether the value axis across from an index axis starts at zero at the plot's floor: true where
 * it does, false where the data dips below zero or the scale floats above it, undefined where the
 * chart has no single value axis there.
 */
/** What the axis lines are where the value scale floats: the house's word, else inferred from its axes. */
function floatingMode(d: DesignDecisions): 'omit' | 'keep' | 'rangeFrame' {
    if (d.floating) return d.floating;
    const value = (['x', 'y'] as const).map((channel) => d.axes[channel]).find((axis) => axis && !axis.indexing);
    return value && !value.domain.show && value.grid.show ? 'omit' : 'keep';
}

/** Whether the chart's value scale floats: its floor, where the index axis stands, is not zero. */
function floatingFloor(spec: any, d: DesignDecisions, table: any[]): boolean {
    const index = (['x', 'y'] as const).find((channel) => d.axes[channel]?.indexing);
    return index !== undefined && valueFloorIsZero(spec, index, table) === false;
}

/** How far a range frame's lines stand off the plot, in px. */
const RANGE_FRAME_OFFSET = 6;

/** An axis of numbers or dates the chart reads straight off a field: one a range frame can span. */
function continuousAxis(spec: any, channel: 'x' | 'y'): boolean {
    let continuous = false;
    walk(spec, (node) => {
        if (node.__themeSynthetic) return;
        const enc = node.encoding?.[channel];
        if (enc?.field && ['quantitative', 'temporal'].includes(enc.type) && !enc.bin && !enc.aggregate && !enc.stack) continuous = true;
    });
    return continuous;
}

/**
 * A range frame (Tufte): each continuous axis draws its line from the least value to the greatest
 * the data holds, set off from the plot by the axis's offset, so the frame stays and says where the
 * data runs rather than where the window happens to start. The lines are rules in data space in the
 * axis's own ink, in every panel; the axis itself draws its labels without a line.
 */
function applyRangeFrame(spec: any, d: DesignDecisions, table: any[], channels: readonly ('x' | 'y')[]): void {
    for (const channel of channels) {
        const line = d.axes[channel]?.domain;
        if (!line) continue;
        const across = channel === 'x' ? 'y' : 'x';
        for (const body of plotBodies(spec)) {
            const layers: any[] = body.layer ?? [body];
            const holder = layers.find((layer) => !layer.__themeSynthetic && layer.encoding?.[channel]?.field);
            const enc = holder?.encoding?.[channel];
            if (!enc?.field || enc.axis === null) continue;
            // The data's own extent, stated as data: a field the rule encoded would name itself in
            // the axis title ("Min of Gas price").
            const temporal = enc.type === 'temporal';
            const read = (value: unknown) => temporal ? new Date(value as any).valueOf() : Number(value);
            let lo: unknown;
            let hi: unknown;
            for (const row of table ?? []) {
                const value = row?.[enc.field];
                if (value === null || value === undefined || !Number.isFinite(read(value))) continue;
                if (lo === undefined || read(value) < read(lo)) lo = value;
                if (hi === undefined || read(value) > read(hi)) hi = value;
            }
            if (lo === undefined || hi === undefined) continue;
            const orient = d.axes[channel]?.orient;
            const far = channel === 'x' ? orient === 'top' : orient === 'right';
            appendLayer(body, {
                __themeSynthetic: true,
                data: { values: [{}] },
                mark: {
                    type: 'rule', color: line.color, strokeWidth: line.width,
                    [channel === 'x' ? 'yOffset' : 'xOffset']: (channel === 'x') === !far ? RANGE_FRAME_OFFSET : -RANGE_FRAME_OFFSET,
                },
                encoding: {
                    [channel]: { datum: lo, type: enc.type, ...(enc.scale ? { scale: { ...enc.scale } } : {}) },
                    [`${channel}2`]: { datum: hi },
                    [across]: { value: channel === 'x' ? (far ? 0 : 'height') : (far ? 'width' : 0) },
                },
            });
        }
    }
}

function valueFloorIsZero(spec: any, indexChannel: 'x' | 'y', table: any[]): boolean | undefined {
    const other = indexChannel === 'x' ? 'y' : 'x';
    let verdict: boolean | undefined;
    walk(spec, (node) => {
        if (node.__themeSynthetic) return;
        const enc = node.encoding?.[other];
        if (!enc?.field || enc.type !== 'quantitative' || enc.bin || verdict === false) return;
        const scale = enc.scale ?? {};
        if (scale.reverse === true || NONLINEAR_SCALES.has(scale.type)) return;
        const domain = Array.isArray(scale.domain) && typeof scale.domain[0] === 'number' ? scale.domain[0] as number : undefined;
        let min = Infinity;
        for (const row of table ?? []) {
            const v = Number(row?.[enc.field]);
            if (Number.isFinite(v) && v < min) min = v;
        }
        if (!Number.isFinite(min) && domain === undefined) return;
        const floor = domain ?? scale.domainMin ?? (scale.zero === false ? min : Math.min(0, min));
        verdict = floor === 0;
    });
    return verdict;
}

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
function applyZeroRule(spec: any, d: DesignDecisions, table: any[]): void {
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
        }
    }
}

/**
 * The rule the marks stand on (`structure.baseline`), along the one measure axis: at zero where
 * zero is inside the domain, else along the axis's floor — wherever the chart put it, since
 * whether the axis starts at zero is the chart's decision, not the theme's. It is not drawn
 * where another rule is already there: the house's own zero rule where the data crosses zero,
 * or the index axis's line along the floor, at least as heavy and as dark. At zero it
 * takes a styled zero rule's ink, weight and dash. Only
 * marks that stand on a base take one — bars, areas, lines — not points, a strip, a scatter, a
 * range or a ranking.
 */
/** Whether one ink reads at least as dark as another; inks that cannot be read count only when equal. */
function atLeastAsDark(ink: string | undefined, than: string | undefined): boolean {
    if (ink === than) return true;
    const a = parseColor(ink);
    const b = parseColor(than);
    return !!a && !!b && luminance(a) <= luminance(b) + 1e-6;
}

function applyBaseline(spec: any, d: DesignDecisions, table: any[]): void {
    const base = d.baseline;
    if (!base?.show) return;
    const measures = (['x', 'y'] as const).filter((ch) => d.axes[ch] && !d.axes[ch]!.indexing);
    if (measures.length !== 1) return;
    const channel = measures[0];
    const index = channel === 'x' ? 'y' : 'x';
    for (const body of plotBodies(spec)) {
        const layers: any[] = body.layer ?? [body];
        const holder = layers.find((l) => l.encoding?.[channel]?.field) ?? body;
        const enc = holder.encoding?.[channel] ?? body.encoding?.[channel];
        if (!enc?.field || enc.type !== 'quantitative' || enc.bin || enc.axis === null) continue;
        // The chart's own first mark decides, not a fitted line laid over a scatter.
        const first = markTypeOf(layers.find((l) => !l.__themeSynthetic && l.mark)?.mark) ?? '';
        // A mark spanning two values (a range, a dumbbell's bar) or a ranking read top-down stands on nothing.
        const indexField = (holder.encoding?.[index] ?? body.encoding?.[index])?.field;
        // A line grouped by its own category runs along the measure: a dumbbell's connector.
        const connector = layers.some((l) => markTypeOf(l.mark) === 'line' && indexField && l.encoding?.detail?.field === indexField);
        // A reversed scale is a ranking read top-down (a bump chart's lines) — but bars on one still
        // stand on zero: the left half of a pyramid, whose spine is its baseline.
        const ranked = enc.scale?.reverse === true && first !== 'bar';
        const ranged = connector || layers.some((l) => l.encoding?.[`${channel}2`] && !l.__themeSynthetic) || ranked;
        const stands = ['bar', 'area', 'line', 'trail'].includes(first) && !ranged;
        if (!stands) continue;
        let min = Infinity;
        let max = -Infinity;
        for (const row of table ?? []) {
            const v = Number(row?.[enc.field]);
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!Number.isFinite(min)) continue;
        const scale = enc.scale ?? {};
        const log = NONLINEAR_SCALES.has(scale.type);
        const zero = scale.zero !== false && !log;
        const domain = Array.isArray(scale.domain) && scale.domain.length === 2 && scale.domain.every((v: unknown) => typeof v === 'number')
            ? scale.domain as [number, number] : undefined;
        const lo = domain?.[0] ?? scale.domainMin ?? (zero ? Math.min(0, min) : min);
        const hi = domain?.[1] ?? scale.domainMax ?? (zero ? Math.max(0, max) : max);
        const atZero = !log && lo <= 0 && hi >= 0;
        // A base is at zero: along a floor the value axis does not start at zero, the line would
        // claim a base the chart does not have — unless the house says its floor is kept
        // (`floating: 'keep'`), or, saying nothing there, states its base strongly.
        const alongFloor = d.floating ? d.floating === 'keep' : base.anyFloor;
        if (!atZero && !alongFloor) continue;
        const atFloor = !atZero || lo === 0;
        // The house's own zero rule is that line where the data crosses zero.
        if (atZero && min < 0 && max > 0 && d.axes[channel]?.zeroRule?.show) continue;
        // The index axis's line already runs along the floor.
        // A line at least as strong — as heavy and as dark — already states the base; a paler base
        // laid over it would only weaken the line it sits on.
        const line = d.axes[index]?.domain;
        const floorSide = channel === 'y' ? 'bottom' : 'left';
        if (atFloor && line?.show && d.axes[index]?.orient === floorSide && line.width >= base.width
            && atLeastAsDark(line.color, base.color)) continue;
        // At zero, a zero rule the house styled is the stronger statement: the line takes its ink,
        // weight and dash (GR2), whether or not the data reaches below it.
        const zeroStyle = d.axes[channel]?.zeroRule;
        const ink = atZero && zeroStyle?.show ? zeroStyle : base;
        appendLayer(body, {
            __themeSynthetic: true,
            data: { values: [{}] },
            mark: { type: 'rule', color: ink.color, strokeWidth: ink.width, ...(ink.dash ? { strokeDash: ink.dash } : {}) },
            // The rule shares the panel's scale as stated: a layer without it would merge an explicit
            // domain with its own and let Vega-Lite widen the ruler (a pyramid's 30 became 35).
            encoding: atZero
                ? { [channel]: { datum: 0, type: 'quantitative', ...(enc.scale ? { scale: { ...enc.scale } } : {}) } }
                : { [channel]: channel === 'y' ? { value: 'height' } : { value: 0 } },
        });
    }
}

/**
 * Fainter lines between the labelled gridlines (`structure.grid.minor`, G2), on a continuous axis
 * whose grid the house draws. The labelled lines are the axis's stated values; where it states
 * none they are computed as Vega would (the scale's domain made nice, one tick about every 40px)
 * and written down, so the minor lines fall between the lines actually drawn. A log, padded or
 * banded scale is left alone and reported. The lines are a rule layer under the marks, or over
 * them where the grid is in front.
 */
function applyMinorGrid(spec: any, config: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    for (const channel of ['x', 'y'] as const) {
        const minor = d.axes[channel]?.minorGrid;
        if (!minor?.show) continue;
        const front = Boolean(d.axes[channel]?.gridFront);
        let refused: string | undefined;
        for (const body of plotBodies(spec)) {
            const layers: any[] = body.layer ?? [body];
            const holder = layers.find((l) => l.encoding?.[channel]?.field && !l.__themeSynthetic) ?? body;
            const enc = holder.encoding?.[channel];
            if (!enc?.field || enc.axis === null || enc.bin || !['quantitative', 'temporal'].includes(enc.type)) continue;
            const axisConfig = { ...config.axis, ...config[channel === 'x' ? 'axisX' : 'axisY'], ...enc.axis };
            if (axisConfig.grid === false) continue;
            const majors = majorGridValues(spec, body, enc, channel, table, axisConfig);
            if (!majors) { refused = enc.type === 'temporal' ? 'a time axis states no tick values to divide' : 'its scale is log, padded or pinned in a way Flint cannot follow'; continue; }
            const lines: number[] = [];
            for (let i = 1; i < majors.length; i++) {
                const step = (majors[i] - majors[i - 1]) / minor.divisions;
                for (let k = 1; k < minor.divisions; k++) lines.push(majors[i - 1] + step * k);
            }
            if (!lines.length) continue;
            // It shares the scale and the axis, and carries the axis's own title so Vega-Lite's merge of
            // the layers' axes keeps it (a null here would win and drop it).
            const title = enc.axis && 'title' in enc.axis ? enc.axis.title : enc.title !== undefined ? enc.title : titleOf(enc) ?? null;
            const layer = {
                __themeSynthetic: true,
                data: { values: lines.map((v) => ({ __minor: v })) },
                mark: { type: 'rule', color: minor.color, strokeWidth: minor.width, aria: false, ...(minor.dash ? { strokeDash: minor.dash } : {}) },
                encoding: { [channel]: { field: '__minor', type: enc.type, title, ...(enc.scale ? { scale: enc.scale } : {}) } },
            };
            appendLayer(body, layer);
            // Vega-Lite draws layers in order and drops a mark's z-index: under the marks, the layer goes first.
            if (!front) {
                let target = body;
                while (target.facet && target.spec) target = target.spec;
                if (Array.isArray(target.layer) && target.layer[target.layer.length - 1] === layer) target.layer.unshift(target.layer.pop());
            }
        }
        if (refused) say(`structure.grid.minor`, 'minor-grid-not-drawn', `the minor grid on ${channel} is not drawn — ${refused}`);
    }
}

/** The values an axis draws its labelled gridlines at, written onto the axis where it stated none. */
function majorGridValues(spec: any, body: any, enc: any, channel: 'x' | 'y', table: any[], axisConfig: any): number[] | undefined {
    const stated = enc.axis?.values;
    if (Array.isArray(stated) && stated.length) {
        const values = stated.map((v: unknown) => typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v)
            : v && typeof v === 'object' && 'year' in (v as any) ? Date.UTC((v as any).year, ((v as any).month ?? 1) - 1, (v as any).date ?? 1) : NaN);
        return values.every(Number.isFinite) ? [...values].sort((a, b) => a - b) : undefined;
    }
    const scale = enc.scale ?? {};
    if (enc.type !== 'quantitative' || NONLINEAR_SCALES.has(scale.type) || scale.padding || scale.domainMid !== undefined || scale.domainRaw) return undefined;
    let lo: number;
    let hi: number;
    if (Array.isArray(scale.domain) && scale.domain.length === 2 && scale.domain.every((v: unknown) => typeof v === 'number')) {
        [lo, hi] = scale.domain;
    } else {
        let min = Infinity;
        let max = -Infinity;
        for (const row of table ?? []) {
            const v = Number(row?.[enc.field]);
            if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
        }
        if (!Number.isFinite(min) || enc.stack || enc.aggregate) return undefined;
        const zero = scale.zero !== false && scale.domainMin === undefined;
        lo = scale.domainMin ?? (zero ? Math.min(0, min) : min);
        hi = scale.domainMax ?? (zero ? Math.max(0, max) : max);
        if (scale.nice !== false) [lo, hi] = niceDomain(lo, hi, typeof scale.nice === 'number' ? scale.nice : 10);
    }
    const size = channel === 'x' ? (body.width ?? spec.width) : (body.height ?? spec.height);
    const span = typeof size === 'number' ? size
        : (channel === 'x' ? spec.config?.view?.continuousWidth : spec.config?.view?.continuousHeight) ?? (channel === 'x' ? 400 : 300);
    const count = axisConfig.tickCount ?? Math.ceil(span / 40);
    const values = niceTicks(lo, hi, count);
    if (values.length < 2) return undefined;
    enc.axis = { ...(enc.axis ?? {}), values };
    return values;
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
 * Readable ticks for a base-10 log scale.
 *
 * Powers of ten always stand. The 2× and 5× positions join them only when the
 * narrowest transformed interval is at least 32px, so a wide log plot gains
 * useful interpolation without a compact one turning into a picket fence.
 */
function logTicks(table: any[], field: string | undefined, span: number, fontSize = 10): number[] | undefined {
    if (!field || !Array.isArray(table) || table.length === 0 || span <= 0) return undefined;
    let min = Infinity;
    let max = -Infinity;
    for (const row of table) {
        const value = Number(row?.[field]);
        if (!Number.isFinite(value) || value <= 0) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return undefined;

    const logSpan = Math.log10(max) - Math.log10(min);
    const decadePixels = span / logSpan;
    const lo = Math.floor(Math.log10(min));
    const hi = Math.ceil(Math.log10(max));
    // 2 and 5 stand only where their labels fit: the closest pair, 1–2 and 5–10, lies a factor of
    // two apart, and the widest label written in full has to sit between them with room to spare.
    const widest = Math.max(...[lo, hi].map((exponent) => (5 * 10 ** exponent).toLocaleString('en-US').length)) * fontSize * 0.6;
    const multipliers = decadePixels * Math.log10(2) >= Math.max(32, widest + 8) ? [1, 2, 5] : [1];
    const ticks: number[] = [];
    for (let exponent = lo; exponent <= hi; exponent++) {
        for (const multiplier of multipliers) ticks.push(multiplier * 10 ** exponent);
    }
    return ticks;
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

/**
 * Whether a sorted run of values is a *step* rather than a scatter of readings.
 *
 * A little slack is allowed, because real steps are not exact: months are 28 to
 * 31 days long and a survey run "every year" lands a fortnight late. Values
 * that are not numbers at all are ordinal — they are already a step, one
 * category at a time. A run that steps geometrically counts too: a log axis of
 * 1, 10, 100 is as much a ruler as 2012, 2016, 2020.
 */
function evenlySpaced(values: any[]): boolean {
    const nums = values.map(Number);
    if (!nums.every((n) => Number.isFinite(n))) return true;
    if (nums.length < 3) return true;
    const regular = (xs: number[]) => {
        const gaps: number[] = [];
        for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
        const lo = Math.min(...gaps);
        const hi = Math.max(...gaps);
        return lo > 0 && hi / lo <= 1.5;
    };
    if (regular(nums)) return true;
    return nums.every((n) => n > 0) && regular(nums.map(Math.log));
}

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

    // Ticking at observations is a claim that the data is *spaced* by
    // something — Olympic years every four, quarters every three months — so
    // that a tick between two of them would name a year there was no Games in.
    // Fifteen countries' incomes are not spaced by anything: 5,300 is Nigeria,
    // not a mark on a ruler, and a fence built from them is jagged, unroundable
    // and says nothing a reader can carry to the next chart. So the axis is
    // only stepped by its observations where they are actually a step.
    if (!evenlySpaced(values)) return undefined;

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
        ? `(indexof(${label}, ${quoted}) === 0 ? ${label} : ${quoted} + ${label})`
        : `${label} + ${quoted}`;
    if (where === 'everyTick') return tagged;
    const at = where === 'firstTick' ? 'datum.index === 0'
        : where === 'lastTick' ? 'datum.index === 1'
            : 'datum.index === 0 || datum.index === 1';
    return `${at} ? ${tagged} : ${label}`;
}

/** A value as a label prints it: compacted where the house compacts, else in its format. */
function printedNumber(value: string, format: string | undefined, compact?: CompactPrint): string {
    if (compact) return compactExpr(value, compact);
    return format ? `format(${value}, ${JSON.stringify(format)})` : `${value} + ''`;
}

/**
 * A ruler's ticks in one compact unit, chosen from the ticks the axis states (else the scale's
 * domain and the data). The number in the label expression is replaced, so a currency sign or
 * a unit written around it stays. False where the expression is not one it can read.
 */
function compactAxis(enc: any, rule: CompactRule, table: any[]): boolean {
    const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const ticks = Array.isArray(enc.axis?.values) && enc.axis.values.every(numeric) ? enc.axis.values as number[] : undefined;
    const span = ticks ?? [
        ...(Array.isArray(enc.scale?.domain) ? enc.scale.domain.filter(numeric) : []),
        ...(Array.isArray(table) ? table.map((row) => row?.[enc.field]).filter(numeric) : []),
    ];
    // The house's stated precision is for labels; ticks keep the digits that tell them apart.
    const print = compactPrint(span, { ...rule, decimals: undefined }, ticks ? 'exact' : 'significant');
    if (!print) return true;
    const expr = compactExpr('datum.value', print);
    const existing: string | undefined = enc.axis?.labelExpr;
    let next: string;
    if (!existing) next = expr;
    else if (/format\(datum\.value,\s*(?:"[^"]*"|'[^']*')\)/.test(existing)) next = existing.replace(/format\(datum\.value,\s*(?:"[^"]*"|'[^']*')\)/g, expr);
    else if (existing.includes('datum.label')) next = existing.replace(/datum\.label/g, expr);
    else return false;
    const { format: _format, ...axis } = enc.axis ?? {};
    void _format;
    enc.axis = { ...axis, labelExpr: next };
    return true;
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
/** A printed number with its unit before or after it: `"$" + …`, `… + "%"`, `… + " ppm"`. */
function withUnitExpr(shown: string, unit: string | undefined): string {
    if (!unit) return shown;
    const quoted = JSON.stringify(/^[A-Za-z]/.test(unit) ? ` ${unit}` : unit);
    return PREFIX_UNITS.has(unit) ? `${quoted} + ${shown}` : `${shown} + ${quoted}`;
}

function printWithUnit(body: any, node: any, field: string, format: string | undefined, unit: string | undefined, compact?: CompactPrint): void {
    const value = `datum[${JSON.stringify(field)}]`;
    const calculate = withUnitExpr(printedNumber(value, format, compact), unit);
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
function applyPrintedUnits(spec: any, d: DesignDecisions): void {
    const unit = d.dataLabels.unit;
    if (!unit) return;
    for (const body of plotBodies(spec)) {
        for (const node of (body.layer ?? [body])) {
            if (markTypeOf(node.mark) !== 'text') continue;
            const text = node.encoding?.text;
            // Only numbers take a unit: a name printed at the end of a line is
            // already a word, and a label already reading the computed field
            // says what it means.
            if (!text?.field || text.type !== 'quantitative') continue;
            printWithUnit(body, node, text.field, text.format ?? d.dataLabels.format, unit);
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
    const spansYears = parts[0][1] !== parts[parts.length - 1][1];
    const format = grain === 'year' ? '%Y' : grain === 'month' ? '%b %Y'
        : spansYears ? '%b %-d, %Y' : '%b %-d';
    const width = (grain === 'year' ? 4 : grain === 'month' ? 8 : spansYears ? 12 : 6) * fontSize * 0.6 + 10;

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

/** Restate the radar's required coordinate furniture and secondary vertices. */
function applyRadarMarks(spec: any, d: DesignDecisions): void {
    const plot = d.surface.plot ?? d.surface.canvas;
    walk(spec, (node) => {
        const name = typeof node.name === 'string' ? node.name.replace(/--panel-\d+$/, '') : undefined;
        if (name === 'radar-grid-spokes' || name === 'radar-grid-rings') {
            const mark = normalizeMark(node.mark);
            const ring = name === 'radar-grid-rings';
            mark.stroke = mixHex(plot, d.text.secondary, ring ? 0.18 : 0.24);
            mark.strokeWidth = Math.min(1, Number(mark.strokeWidth) || 1);
            node.mark = mark;
        }
        if (name === 'radar-secondary-vertices') {
            const mark = normalizeMark(node.mark);
            mark.size = d.marks.point?.secondarySize ?? 25;
            node.mark = mark;
        }
    });
}

function applyMarks(
    spec: any, d: DesignDecisions, table: any[], say: ReportDeparture, points?: LayoutPlan['points'], pointSize?: number,
    lineWidth?: number,
): void {
    const config = spec.config;
    const m = d.marks;
    const plotWidth = spec.config?.view?.continuousWidth ?? spec._width ?? 300;
    const plotHeight = spec.config?.view?.continuousHeight ?? spec._height ?? 300;

    applyRadarMarks(spec, d);
    // The plan thins the house's weight where many series share the plot (`plan.lineWidth`).
    config.line = { ...(config.line ?? {}), strokeWidth: lineWidth ?? m.strokeWidth };
    config.trail = { ...(config.trail ?? {}), size: m.strokeWidth };
    if (m.strokeCap) { config.line.strokeCap = m.strokeCap; config.rule = { ...(config.rule ?? {}), strokeCap: m.strokeCap }; }
    if (m.strokeJoin) config.line.strokeJoin = m.strokeJoin;
    // The house's curve reaches areas as well as lines: an area's edge is a line overlay and takes
    // `config.line`, so a fill left on the default curve would part from its own edge.
    if (m.interpolate) {
        config.line.interpolate = m.interpolate;
        config.area = { ...(config.area ?? {}), interpolate: m.interpolate };
    }
    if (m.fillOpacity != null) config.area = { ...(config.area ?? {}), fillOpacity: m.fillOpacity };
    // A bar's own opacity (M2): the fill only, so an outline in the series ink stays crisp.
    if (m.barOpacity != null) config.bar = { ...(config.bar ?? {}), fillOpacity: m.barOpacity };
    // An area's edge (M1): a line along its top in its own ink — Vega-Lite's own line overlay, which
    // follows a stack's bands and its colour encoding. Not on a wash (a synthetic layer), a violin's
    // sideways density (a distribution's outline is not a series' top), or an area whose template
    // draws its own line.
    if (m.areaEdge) {
        const width = m.areaEdge.width;
        walk(spec, (node) => {
            if (markTypeOf(node.mark) !== 'area' || node.__themeSynthetic) return;
            const mark = normalizeMark(node.mark);
            if (mark.line !== undefined || mark.orient === 'horizontal') return;
            node.mark = { ...mark, line: { strokeWidth: width, ...(m.strokeCap ? { strokeCap: m.strokeCap } : {}), ...(m.strokeJoin ? { strokeJoin: m.strokeJoin } : {}) } };
        });
    }
    if (m.cornerRadius != null) {
        // Round only the value end of a bar so the baseline stays a clean edge
        // and a stack still reads as one column; `cornerRadiusEnd` rounds the
        // top of a vertical bar and the right of a horizontal one. A wedge has
        // no baseline, so it rounds all its corners.
        config.bar = { ...(config.bar ?? {}), cornerRadiusEnd: m.cornerRadius };
        config.arc = { ...(config.arc ?? {}), cornerRadius: m.cornerRadius };
    }
    if (m.outline) {
        // A wedge's outline follows its radial edges and never swallows it, so
        // it rides the arc config. A bar's outline is width-sensitive — a fat
        // border eats a thin bar whole — so it is drawn per bar below, only on
        // bars wide enough to hold it. Grid cells (heatmaps) are a field, not
        // shapes to cut out, and are held apart by a tile gap, not an outline.
        // An outline in each mark's own ink is a bar rule; wedges keep their slice gap.
        if (!m.outline.series) config.arc = { ...(config.arc ?? {}), stroke: m.outline.color, strokeWidth: m.outline.width };
        // An outlined shape has corners of its own, and the join is a property
        // of the stroke, not of lines. Left to the renderer's mitre, the two
        // radial edges of a thin wedge run past each other into a spike at the
        // centre — worst exactly where the house draws the fattest outline.
        if (m.strokeJoin) {
            for (const family of ['arc', 'bar', 'area', 'point'] as const) {
                config[family] = { ...(config[family] ?? {}), strokeJoin: m.strokeJoin };
            }
        }
    }
    protectDashEncoding(spec, config, lineWidth ?? m.strokeWidth);

    // Dots whose size this house deliberately cut to fit the room its panel
    // gives them. The ring-writing passes below hand a bare `point: true` the
    // house's full-size ring, which would put back exactly the ink the fit
    // just took out, so they leave these alone.
    const fittedDots = new Set<any>();
    if (m.point?.show) {
        config.line.point = {
            filled: m.point.filled !== false,
            // A vertex confirms a path's position; the primary size is the size
            // of a dot that *is* the reading. Houses that separate them say so.
            size: m.point.vertexSize ?? m.point.size ?? 24,
            ...(m.point.ink ? { color: m.point.ink } : {}),
            // A hollow dot *is* its ring: the ring takes the dot's ink. A halo or an outline in the
            // page's colour would be the only stroke left, and the dot would vanish.
            ...(m.point.filled === false
                ? { strokeWidth: m.point.haloWidth ?? m.outline?.width ?? 1.5 }
                : m.outline
                    ? { stroke: m.outline.color, strokeWidth: pointOutlineWidth(d, m.point.vertexSize ?? m.point.size ?? 24) }
                    : m.point.haloColor
                        ? { stroke: m.point.haloColor, strokeWidth: pointHaloWidth(d, m.point.vertexSize ?? m.point.size ?? 24) }
                        : {}),
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
                say('marks.point', 'dots-stand-down', 'the fitted line keeps no vertex points — its vertices are where the fit was sampled, not where anything was measured');
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
        let saidShrink = false;
        walkScoped(spec, { width: plotWidth, height: plotHeight }, (node, view) => {
            if (!LINE_MARKS.has(markTypeOf(node.mark) ?? '')) return;
            const mark = normalizeMark(node.mark);
            if (mark.point !== undefined) return;
            const enc = mergedEncoding(node, spec.encoding);
            const readings = maxReadingsPerSeries(enc, table);
            const density = m.point!.density;
            // A sparse house draws dots only where readings stand well apart (M5).
            if (density === 'sparse') {
                const spacing = readingSpacing(view.width, readings);
                if (spacing != null && spacing < SPARSE_DOT_SPACING) {
                    node.mark = { ...mark, point: false };
                    if (!saidCrowd) {
                        say('marks.point', 'dots-stand-down',
                            `readings ${Math.round(spacing)}px apart are closer than the ${SPARSE_DOT_SPACING}px the house's sparse dots ask for, so the line is drawn bare`);
                        saidCrowd = true;
                    }
                    return;
                }
            }
            // A house that dots every reading keeps them past the countable dozen (M5); they still
            // shrink, or stand down, where they cannot sit apart.
            if (density !== 'all' && readings > MAX_DOTTED_READINGS) {
                node.mark = { ...mark, point: false };
                if (!saidCrowd) {
                    say('marks.point', 'dots-stand-down',
                        `${readings} readings on one line is past the ${MAX_DOTTED_READINGS} a reader can take one at a time, so the house's dots stand down and the line keeps its shape`);
                    saidCrowd = true;
                }
                return;
            }
            // Countable is not the same as roomy. A dozen readings are easy to
            // take one at a time across a full plot and impossible across a
            // sparkline a third as wide, where the house's dot is wider than
            // the gap between two of them. Measure the dot against the space
            // this view actually gives it and shrink it until it fits.
            const dot = config.line.point;
            const spacing = readingSpacing(view.width, readings);
            if (spacing == null) return;
            const outer = dotOuterDiameter(dot.size, dot.strokeWidth ?? 0);
            const needed = (spacing * DOT_SPACING_FIT) / outer;
            if (needed >= 1) return;
            const shrink = Math.max(MIN_DOT_SHRINK, needed);
            if (outer * shrink > spacing) {
                // Even at the smallest a bead may be drawn it still runs into
                // its neighbour, so the line is better read without them.
                node.mark = { ...mark, point: false };
                if (!saidCrowd) {
                    say('marks.point', 'dots-stand-down',
                        `${readings} readings across ${Math.round(spacing)}px apart leave no room for the house's ${Math.round(outer)}px dots, so they stand down and the line keeps its shape`);
                    saidCrowd = true;
                }
                return;
            }
            const size = Math.max(4, Math.round(dot.size * shrink * shrink));
            const point: any = { ...dot, size };
            if (dot.strokeWidth) {
                point.strokeWidth = Math.max(0.5, Number((dot.strokeWidth * shrink).toFixed(1)));
            }
            node.mark = { ...mark, point };
            fittedDots.add(node);
            if (!saidShrink) {
                say('marks.point.size', 'dots-shrunk',
                    `this panel gives each of its ${readings} readings ${Math.round(spacing)}px, so the house's dots shrink to ${size}px² to sit apart on their line`);
                saidShrink = true;
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
            if (fittedDots.has(node)) return;
            const mark = normalizeMark(node.mark);
            if (!mark.point) return;
            const point = typeof mark.point === 'object' ? mark.point : {};
            const hollow = (point.filled ?? dot.filled) === false;
            const size = dot.size ?? point.size ?? 30;
            mark.point = {
                ...point,
                ...(point.filled == null ? { filled: dot.filled !== false } : {}),
                ...(dot.size != null ? { size: dot.size } : {}),
                // A hollow dot is its ring: a stroke in the page's colour would leave nothing to see.
                ...(hollow ? {} : { stroke: m.outline?.color ?? dot.haloColor }),
                // A filled dot's ring follows its size; a hollow dot's ring is the dot, drawn at the house's width.
                strokeWidth: hollow
                    ? m.outline?.width ?? dot.haloWidth ?? 1
                    : m.outline ? pointOutlineWidth(d, size) : pointHaloWidth(d, size),
            };
            node.mark = mark;
        });
    }
    if (m.outline && !m.point?.haloColor) {
        walk(spec, (node) => {
            if (!LINE_MARKS.has(markTypeOf(node.mark) ?? '')) return;
            if (fittedDots.has(node)) return;
            const mark = normalizeMark(node.mark);
            if (!mark.point) return;
            const point = typeof mark.point === 'object' ? mark.point : {};
            const hollow = (point.filled ?? m.point?.filled) === false;
            mark.point = {
                ...point,
                ...(hollow ? {} : { stroke: m.outline!.color }),
                strokeWidth: m.outline!.width,
            };
            node.mark = mark;
        });
    }
    // The same size wherever a dot is drawn — and `config.point` alone does
    // not reach them all: `circle` and `square` are their own mark types with
    // their own config blocks, and most scatters are drawn as one of those, so
    // a house that sized only `point` silently missed every scatter it had.
    if (m.point?.size != null || m.point?.filled != null) {
        // This config reaches only standalone point-family marks; line vertices use
        // `config.line.point` above. The plan sizes the dots (`plan.pointSize`).
        const outlineWidth = pointOutlineWidth(d, pointSize);
        for (const family of ['point', 'circle', 'square'] as const) {
            config[family] = {
                ...(config[family] ?? {}),
                // `config.point` is not only the point *mark*: Vega-Lite
                // normalizes a line's `point: true` overlay into a symbol
                // styled `point`, so a size written here would also resize
                // every line vertex in the chart — dots whose spacing along
                // the line, not the plot's area, is what decides their size.
                // Only `circle` and `square`, which no overlay borrows, can
                // take the size from the config; the point marks that really
                // are a data cloud are sized on the mark below.
                ...(pointSize != null && family !== 'point' ? { size: pointSize } : {}),
                // Only a house that spoke about its dots decides how they are
                // filled. Vega-Lite draws a bare `point` hollow, which is how
                // a shape-encoded scatter tells its glyphs apart, and a house
                // that merely named a size has not asked for that to change.
                ...(m.point.filled != null ? { filled: m.point.filled } : {}),
                ...(m.outline ? { stroke: m.outline.color, strokeWidth: outlineWidth } : {}),
            };
        }
        if (pointSize != null) {
            walk(spec, (node) => {
                const type = markTypeOf(node.mark);
                if (type !== 'point' && type !== 'circle' && type !== 'square') return;
                const mark = normalizeMark(node.mark);
                // A template that fitted its dot to a lane measured something
                // this pass cannot see, so its size stands. A size left by
                // the build-time coverage estimate does not: it assumed a
                // plot rather than being given one, and knew nothing of
                // facets, so the budget above supersedes it.
                if (mark.size != null && !coverageSizedMarks.has(node.mark)) return;
                node.mark = { ...mark, size: pointSize };
            });
        }
    }
    applyDotHalo(spec, config, d, say, pointSize);

    padScaleForDots(spec, points, table);

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
    const paddedBandFields = new Map<string, number>();
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
                    say('marks.bandFraction', 'band-fraction-not-applied',
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
                }
            } else {
                // Dodged bars carry a second band inside each group — the
                // offset. The group and its lanes are spaced by the house's
                // group rule (G1): the space between groups on the category
                // band, the gap between bars on the offset band.
                const offset = enc.xOffset ?? enc.yOffset;
                const offsetCh = enc.xOffset?.field ? 'xOffset' : enc.yOffset?.field ? 'yOffset' : undefined;
                const offsetDiscrete = !!offsetCh && (offset?.type === 'nominal' || offset?.type === 'ordinal');
                const offsetLocal = !!offsetCh && offset?.type === 'quantitative';
                const sizedMark = typeof (node.mark as any)?.size === 'number' && mark !== 'boxplot';
                const groupAxis = offsetCh === 'xOffset' ? 'x' : offsetCh === 'yOffset' ? 'y' : undefined;
                const grouped = (offsetDiscrete || offsetLocal) && mark !== 'boxplot' && groupAxis && discrete.includes(groupAxis)
                    ? groupPadding(m.group, m.bandFraction, laneCount(node, enc, table), bandStep(spec, node, enc, groupAxis, table))
                    : undefined;
                for (const channel of discrete) {
                    const target = node.encoding?.[channel] ?? inherited?.[channel];
                    if (!target) continue;
                    const padding = grouped && channel === groupAxis ? grouped.inner : paddingInner;
                    target.scale = { ...(target.scale ?? {}), paddingInner: padding };
                    if (typeof target.field === 'string') paddedBandFields.set(target.field, padding);
                }
                if (offsetDiscrete && mark !== 'boxplot') {
                    // Native dodge: the lanes are a band scale of their own, so
                    // the gap lives on the offset scale, not on any pixel size.
                    const lane = grouped?.lane ?? groupPadding(m.group, m.bandFraction, laneCount(node, enc, table)).lane;
                    const offTarget = node.encoding?.[offsetCh!] ?? inherited?.[offsetCh!];
                    if (offTarget) {
                        offTarget.scale = { ...(offTarget.scale ?? {}), paddingInner: lane, paddingOuter: 0 };
                    }
                } else if (sizedMark && offsetLocal && grouped) {
                    // Local dodge: lanes are a pitch apart within the group's
                    // band; each bar is that pitch less the gap.
                    const step = groupAxis ? bandStep(spec, node, enc, groupAxis, table) : undefined;
                    const lanes = laneCount(node, enc, table);
                    const pitch = step ? (step * (1 - grouped.inner)) / lanes : undefined;
                    const resized = pitch
                        ? Math.max(1, Math.round(pitch * (1 - grouped.lane)))
                        : Math.max(1, Math.round(((node.mark as any).size as number) * m.bandFraction / LOCAL_DODGE_LANE_FILL));
                    if (resized !== (node.mark as any).size) {
                        node.mark = { ...normalizeMark(node.mark), size: resized };
                    }
                } else if (sizedMark && discrete[0]) {
                    // A simple bar pinned to a pixel width fixed the gap along
                    // with it. The house sets the gap, so the width moves too.
                    const step = bandStep(spec, node, enc, discrete[0], table);
                    if (step) {
                        node.mark = { ...normalizeMark(node.mark), size: Math.max(1, Math.round(step * m.bandFraction)) };
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
            }
        }
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
            if (Array.isArray(node[key])) node[key].forEach((c: any) => bandWalk(c, enc));
        }
        if (node.spec) bandWalk(node.spec, enc);
        if (node.facet?.spec) bandWalk(node.facet.spec, enc);
    };
    bandWalk(spec, undefined);
    centerBandDividers(spec, paddedBandFields);

    if (m.separator?.show) {
        const plotW = spec.config?.view?.continuousWidth ?? spec._width ?? 300;
        const plotH = spec.config?.view?.continuousHeight ?? spec._height ?? 300;
        let saidThin = false;
        let sawStroke = false;
        let bandCh: 'x' | 'y' | undefined;
        walk(spec, (node) => {
            const mark = markTypeOf(node.mark);
            // A stacked band adjoins its neighbour along its whole length, so it
            // is held apart the same way bars are — without the cut, three
            // quantities read as one silhouette.
            if (mark === 'area') {
                const enc = node.encoding ?? {};
                const banded = Boolean(enc.color?.field ?? enc.fill?.field ?? spec.encoding?.color?.field);
                if (!banded || isLiteralMark(node)) return;
                node.mark = {
                    ...normalizeMark(node.mark),
                    stroke: m.separator!.color,
                    strokeWidth: m.separator!.width,
                };
                sawStroke = true;
                return;
            }
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
                    say('marks.separator', 'separator-not-applied',
                        `bars are ${barW.toFixed(1)}px — too thin to hold a ${m.separator!.width}px separator, which would paint over them; left flush`);
                    saidThin = true;
                }
                return;
            }
            node.mark = { ...normalizeMark(node.mark), stroke: m.separator!.color, strokeWidth: m.separator!.width };
            sawStroke = true;
            // Which axis carries the bands is read off the bar itself: a
            // waterfall keeps its category on the parent layer and only the
            // measure on the bar. The band is whatever is not the measure —
            // the measure being the quantitative channel, or the one that
            // spans (x2/y2).
            const enc = node.encoding ?? {};
            if (enc.y?.type === 'quantitative' || enc.y2) bandCh = 'x';
            else if (enc.x?.type === 'quantitative' || enc.x2) bandCh = 'y';
            else if (enc.x?.field && enc.x.type !== 'quantitative') bandCh = 'x';
            else if (enc.y?.field && enc.y.type !== 'quantitative') bandCh = 'y';
        });
        if (sawStroke && bandCh) liftBandAxis(spec, bandCh);
    }

    if (m.barMinLength) applyBarMinLength(spec, m.barMinLength, table, plotWidth, plotHeight);

    if (m.tile) applyTileGap(spec, m.tile);

    if (m.slice) applySliceGap(spec, m.slice, table, say);

    // The sticker edge on bars: a dark border around each column, drawn per
    // bar so a fat outline can stand down where a bar is too thin to hold it
    // (the same guard the separator uses). A bar the separator already stroked
    // keeps that stroke; grid cells are a field, held apart by a tile gap.
    if (m.outline) {
        let saidThinOutline = false;
        walk(spec, (node) => {
            if (markTypeOf(node.mark) !== 'bar') return;
            if (isLiteralMark(node)) return;
            const enc = node.encoding ?? {};
            if (isGridCell(node, enc)) return;
            const mark = normalizeMark(node.mark);
            // An outline in the series ink is the house's own edge, so it takes the place of a
            // separator's stroke; any other outline leaves a stroked bar as it is.
            if (mark.stroke && !m.outline!.series) return;
            if (enc.stroke) return;
            const barW = estimateBarExtent(node, enc, table, plotWidth, plotHeight);
            if (barW < 2 * m.outline!.width) {
                if (!saidThinOutline) {
                    say('marks.outline', 'outline-not-applied',
                        `bars are ${barW.toFixed(1)}px — too thin to hold a ${m.outline!.width}px outline, which would paint over them; left unbordered`);
                    saidThinOutline = true;
                }
                return;
            }
            if (m.outline!.series) {
                // Drawn once the series inks are final (applySeriesOutlines); here only marked.
                const { stroke: _stroke, ...rest } = mark;
                void _stroke;
                node.mark = { ...rest, strokeWidth: m.outline!.width };
                node.__seriesOutline = true;
                return;
            }
            node.mark = { ...mark, stroke: m.outline!.color, strokeWidth: m.outline!.width };
        });
    }

    // A corner radius is authored in pixels, but what it has to stay
    // proportional to is the bar it rounds. The radius that reads as a
    // friendly sticker corner on a wide bar swallows a narrow one: once it
    // passes half the bar's thickness the shape stops being a bar at all and
    // becomes a lozenge, and a ranking of lozenges is no longer a ranking of
    // lengths. The house keeps its full roundness wherever the bar has room
    // for it, and is held to the same *fraction* of the bar where it does not.
    if (m.cornerRadius != null) {
        let saidRound = false;
        walk(spec, (node) => {
            if (markTypeOf(node.mark) !== 'bar') return;
            if (isLiteralMark(node)) return;
            const enc = node.encoding ?? {};
            if (isGridCell(node, enc)) return;
            if (enc.x2 != null || enc.y2 != null) {
                // Ranged bars such as histogram bins are authored with a start
                // and end position. Rounding only the value end can collapse
                // them into zero-width paths once interactive instrumentation
                // wraps the marks, so keep these bars square.
                node.mark = { ...normalizeMark(node.mark), cornerRadiusEnd: 0 };
                return;
            }
            const barW = estimateBarExtent(node, enc, table, plotWidth, plotHeight);
            const capped = Math.round(barW * MAX_CORNER_FRACTION * 10) / 10;
            if (capped >= m.cornerRadius!) return;
            node.mark = { ...normalizeMark(node.mark), cornerRadiusEnd: capped };
            if (!saidRound) {
                say('marks.cornerRadius', 'corner-radius-reduced',
                    `bars are ${barW.toFixed(1)}px — a ${m.cornerRadius}px corner would round the bar away, so it is held to ${capped}px, the same share of the bar the house rounds off a wide one`);
                saidRound = true;
            }
        });
    }

}

/**
 * A house that strokes its bars in the surface colour (datawrapper's white
 * hairline between stacked segments, swiss's paper gap) draws that stroke on
 * every edge of the bar — including the edge that sits *on* the band axis.
 * Painted in the surface, it chops that axis domain into a dash under each bar.
 *
 * Vega-Lite drops `zindex` from a *config* axis, but honours it on an axis
 * declared in the encoding, so the band axis is simply lifted over the marks.
 * Nothing is drawn twice and no geometry is invented — the one line Vega
 * already draws is just drawn last. Only the band axis is lifted, and only
 * while it carries no grid, so no gridline is ever raised over the data.
 */
function liftBandAxis(spec: any, bandCh: 'x' | 'y'): void {
    const axisCfg = spec.config?.[bandCh === 'x' ? 'axisX' : 'axisY'] ?? {};
    const color = axisCfg.domainColor;
    const width = axisCfg.domainWidth ?? 1;
    if (axisCfg.domain === false || !color || color === 'transparent' || width <= 0) return;
    // Lifting an axis lifts its grid with it. A band axis that rules its own
    // grid would paint those lines over the bars, which is a worse fault than
    // the one being fixed, so it keeps its place.
    if (axisCfg.grid && (axisCfg.gridWidth ?? 1) > 0 &&
        axisCfg.gridColor && axisCfg.gridColor !== 'transparent') return;

    walk(spec, (node) => {
        const enc = node.encoding?.[bandCh];
        // `axis: null` is the chart saying this band carries no ruler at all.
        if (!enc?.field || enc.axis === null) return;
        enc.axis = { ...(enc.axis ?? {}), zindex: 1 };
    });
}

/**
 * A grid puts a line at every tick of its axis, and where a tick falls on the
 * edge the *other* axis rules, the two are one line drawn twice in two inks —
 * the grid, part of the panel, drawn second: a 2.5px black spine comes out as
 * a pale dashed rule in grid ink.
 *
 * Z-order is not the answer here. Vega-Lite hoists a shared axis out of a
 * faceted plot's panels, so the panel's own grid is always laid down after it
 * however the axis is ranked. The honest fix is that the redundant line should
 * not be there: the spine already states that edge, so the grid gives up the
 * line that lies on it — and only that one. A scale is often padded past its
 * first tick (a dot plot keeps its dots off the edge; an unrounded domain
 * starts between round values), and then the first tick stands clear of the
 * spine: hiding its line would leave its label with nothing to read against.
 * So the test is where the line is drawn, read off the live scale, not which
 * tick it is. Where the scale cannot be named (concatenated or independent
 * scales), the end tick stands in, as it does whenever the domain is rounded.
 */
function dropGridUnderSpine(spec: any, config: any): void {
    const drawsGrid = (cfg: any): boolean =>
        !!cfg?.grid && (cfg.gridWidth ?? 1) > 0 && !!cfg.gridColor && cfg.gridColor !== 'transparent';
    const drawsDomain = (cfg: any): boolean =>
        cfg?.domain !== false && !!cfg?.domainColor && cfg.domainColor !== 'transparent'
        && (cfg.domainWidth ?? 1) > 0;
    const sharedScales = !(spec.hconcat || spec.vconcat || spec.concat);

    for (const gridCh of ['x', 'y'] as const) {
        const spineCh = gridCh === 'x' ? 'y' : 'x';
        const gridCfg = config[gridCh === 'x' ? 'axisX' : 'axisY'];
        const spineCfg = config[spineCh === 'x' ? 'axisX' : 'axisY'];
        if (!drawsGrid(gridCfg) || !drawsDomain(spineCfg)) continue;
        // The side the spine stands on. An x range runs left to right and a y
        // range top to bottom, so a left or bottom spine is at the range's
        // outer end along the grid's own channel: its least x, its greatest y.
        const far = spineCh === 'x'
            ? (spineCfg.orient === 'top' ? 1 : 0)
            : (spineCfg.orient === 'right' ? 1 : 0);
        const atLow = gridCh === 'x' ? far === 0 : far === 1;
        const named = sharedScales && spec.resolve?.scale?.[gridCh] !== 'independent';
        const bandPosition = gridCfg.bandPosition ?? (gridCfg.tickBand === 'extent' ? 0 : 0.5);
        const s = JSON.stringify(gridCh);
        const onSpine = named
            ? `abs(scale(${s}, datum.value) + bandwidth(${s}) * ${bandPosition} - ${atLow ? 'min' : 'max'}(range(${s})[0], range(${s})[1])) < 0.5`
            : `datum.index === ${far}`;
        walk(spec, (node) => {
            const enc = node.encoding?.[gridCh];
            if (!enc?.field || enc.axis === null) return;
            if (enc.axis?.gridColor && typeof enc.axis.gridColor === 'object') return;
            enc.axis = {
                ...(enc.axis ?? {}),
                gridColor: {
                    condition: { test: onSpine, value: 'transparent' },
                    value: gridCfg.gridColor,
                },
            };
        });
    }
}

/**
 * Vega-Lite's nested `line.point` mark does not inherit a literal colour from
 * its parent line, so a single-series themed line can become one colour with
 * renderer-default blue dots. Keep the two pieces of the same trajectory in
 * the same ink. Where a house deliberately draws outlined sticker dots, also
 * scale both dot and line down together once a trajectory has too many
 * observations for every vertex to remain full-size.
 */
function harmonizeLinePoints(
    spec: any,
    d: DesignDecisions,
    table: any[],
    say: ReportDeparture,
    lineWidth?: number,
): void {
    let saidDensity = false;
    walk(spec, (node) => {
        if (!LINE_MARKS.has(markTypeOf(node.mark) ?? '')) return;
        const mark = normalizeMark(node.mark);
        if (!mark.point) return;

        const point = typeof mark.point === 'object' ? { ...mark.point } : {};
        if (d.marks.point?.ink && point.fill == null) {
            point.color = d.marks.point.ink;
        } else if (mark.color && point.color == null && point.fill == null) {
            point.color = mark.color;
        }

        if (d.marks.point?.size != null && d.marks.outline && point.size == null) {
            const enc = mergedEncoding(node, spec.encoding);
            const readings = maxReadingsPerSeries(enc, table);
            // A dot and the line under it are one object — a bead on a string
            // — and the house sized them against each other. Crowding shrinks
            // the *diameter*, and the stroke follows it by the same factor, so
            // the proportion the house authored survives at every density.
            // Area goes as the square of the diameter, so the size follows the
            // factor squared: scaling the area directly would fatten the dots
            // against their own line every time the plot got busier.
            const shrink = readings > MAX_DOTTED_READINGS
                ? Math.max(MIN_DOT_SHRINK, Math.sqrt(MAX_DOTTED_READINGS / readings))
                : 1;
            const size = Math.round(d.marks.point.size * shrink * shrink);
            point.size = size;
            if (point.stroke === d.marks.outline.color) {
                point.strokeWidth = pointOutlineWidth(d, size);
            }
            if (shrink < 1) {
                mark.strokeWidth = Math.max(1, Number(((lineWidth ?? d.marks.strokeWidth) * shrink).toFixed(1)));
                if (!saidDensity) {
                    say('marks.point.size', 'dots-shrunk',
                        `${readings} connected readings shrink the house's dots to ${size}px² and its line to ${mark.strokeWidth}px together, so the dot stays the same bead on the same string`);
                    saidDensity = true;
                }
            }
        }

        mark.point = point;
        node.mark = mark;
    });
}

/**
 * A cell of a grid — a heatmap, a calendar, a matrix. Both of its axes are
 * spent on position and its colour carries the reading, so unlike a bar it has
 * no free axis to be thinned along: the gap has to be cut out of the shape.
 * A heatmap template may keep a temporal or quantitative scale for tick
 * semantics while budgeting one band per observed value, so semantic axis
 * types alone cannot identify cells.
 */
function isGridCell(node: any, enc: any): boolean {
    if (markTypeOf(node.mark) !== 'rect') return false;
    return Boolean(enc.x?.field && enc.y?.field && enc.color?.field);
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
): void {
    const gridWalk = (node: any, inherited: any): void => {
        if (!node || typeof node !== 'object') return;
        const enc = mergedEncoding(node, inherited);
        if (!isLiteralMark(node) && isGridCell(node, enc)) {
            node.mark = { ...normalizeMark(node.mark), stroke: tile.color, strokeWidth: tile.gap };
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
function applyConnectors(spec: any, d: DesignDecisions): void {
    const c = d.marks.connector;
    if (!c) return;
    // A house that never styles connectors still gets its bridges corrected.
    // A bridge joins two marks belonging to *different* series, so whichever
    // series ink it inherits by default belongs to one of its two ends — it
    // misattributes the span to one endpoint and, worse, makes that endpoint's
    // dot indistinguishable from the line leaving it. A stem and a lead have
    // no such ambiguity (a stem falls to the baseline within one series; a
    // lead runs between two bars at one level), so where the house is silent
    // they keep whatever the series pass gave them.
    const bridgeOnly = !c.show;

    let sawStem = false;
    const paint = (node: any, role: 'stem' | 'bridge' | 'lead', enc: any): void => {
        if (bridgeOnly && role !== 'bridge') return;
        // A mark whose colour is encoded takes its ink from the data — a
        // candlestick's wick is a rule that spans low to high but is coloured
        // by whether the session closed up, whether that is said with a field
        // or with a test and two values. Vega-Lite would discard a mark-level
        // colour set beneath it. Structure has nothing to add to a line that
        // is already saying something.
        if ((node.encoding?.color ?? enc?.color) !== undefined) return;
        const mark = normalizeMark(node.mark);
        // A mark that names its own stroke has already been given its ink by
        // whoever drew it — a radar's spokes and rings are `rule`s that reach
        // from centre to rim and so read as spans, but they are the chart's
        // furniture, not a connector between two readings. Vega-Lite drops a
        // `color` set alongside an explicit `stroke` anyway; skipping keeps
        // that from being said twice and warned about once.
        if (mark.stroke !== undefined) return;
        if (role === 'stem') sawStem = true;
        if (c.color) mark.color = c.color;
        // Correcting an undeclared bridge is a correction of colour, not of
        // weight: the house said nothing about how heavy its spans should be,
        // and the series pass already sized this line like every other line.
        if (!bridgeOnly) mark.strokeWidth = role === 'bridge' ? c.spanWidth : c.width;
        if (c.dash && !bridgeOnly) mark.strokeDash = c.dash;
        node.mark = mark;
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
                    paint(node, !end.field ? 'stem' : acrossCategories ? 'lead' : 'bridge', enc);
                }
            } else if (type === 'line') {
                // A line grouped by the field the categorical axis already
                // names draws one segment inside each band, not one series
                // across them: it joins that band's own marks.
                const key = own.detail?.field ?? enc.detail?.field;
                const band = (['x', 'y'] as const)
                    .map((ch) => enc[ch])
                    .find((e: any) => e?.field && (e.type === 'nominal' || e.type === 'ordinal'));
                if (key && band?.field === key) paint(node, 'bridge', enc);
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
    say: ReportDeparture,
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
            if (!said && wanted > room) {
                say('marks.slice.gap', 'slice-gap-reduced',
                    `${slices} wedges cannot each give up ${slice.gap}px and still be wedges — the gap is held at ${(room * radius).toFixed(1)}px`);
                said = true;
            }
        } else {
            mark.stroke = slice.color;
            mark.strokeWidth = slice.gap;
            // Wedges taper to a point at the hub; a mitred stroke on those acute
            // tips shoots a spike past the centre (worse the thinner the slice).
            // Round the join so the rule stays a rule all the way to the middle.
            mark.strokeJoin = 'round';
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

/**
 * Paint the marks a template drew in pixels but flagged as carrying meaning.
 *
 * Most template furniture is scenery — a card, a track, a caption — and the
 * pass above only re-tones it against the surface. A few of those pixel marks
 * are not scenery at all: a KPI card's progress bar is the one part of the
 * tile that states a measurement, and left literal it stays flint's blue in
 * every house on the wall. A template cannot read the theme, so it names the
 * *role* its colour plays with `__themeRole` and the house supplies the ink.
 *
 *   accent    the reading itself, with no verdict attached — the house's ink
 *   positive  a reading that met or beat its target
 *   negative  a reading that fell short
 *
 * A house that never named status inks keeps the template's own red and green:
 * those hues are conventional rather than decorative, and inventing a verdict
 * colour from the palette would say something the house did not.
 *
 * A verdict also has to stay *legible as a verdict*. Several houses draw their
 * status ink from the same short palette as their series ink — the Economist's
 * positive is its blue, Swiss's negative is its red — so taking it here would
 * paint "beat the target" and "still going" in one colour and quietly delete
 * the distinction the bar exists to make. Where the house's verdict ink is the
 * ink already on the bar, the template's conventional hue stays.
 */
function paintRoleMarks(spec: any, d: DesignDecisions): void {
    const status = d.series.status;
    const accent = d.series.single;
    const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    const verdict = (ink?: string) => (ink && !same(ink, accent) ? ink : undefined);
    walk(spec, (node) => {
        const role = node.__themeRole;
        if (!role || !markTypeOf(node.mark)) return;
        const ink = role === 'accent'
            ? accent
            : role === 'positive'
                ? verdict(status?.positive)
                : role === 'negative'
                    ? verdict(status?.negative)
                    : undefined;
        if (!ink) return;
        const mark = normalizeMark(node.mark);
        for (const key of ['fill', 'stroke', 'color'] as const) {
            if (typeof mark[key] === 'string') mark[key] = ink;
        }
        node.mark = mark;
    });
}



/** How many dots one line can carry before they stop being countable. */
const MAX_DOTTED_READINGS = 12;

/** The least room between readings, px, for a house's `sparse` dots. */
const SPARSE_DOT_SPACING = 20;

/**
 * The share of the gap between two readings a dot may occupy.
 *
 * At 1 the beads on a line touch exactly; a little under that leaves a thread
 * of page between them, which is what makes them read as separate readings
 * rather than as one rope.
 */
const DOT_SPACING_FIT = 0.9;

/**
 * The room one reading gets along a line, in px.
 *
 * Returns `undefined` when the view has no settled width (a step-sized or
 * responsive panel), where there is nothing to measure the dot against and the
 * house's size is left alone.
 */
function readingSpacing(width: number | undefined, readings: number): number | undefined {
    if (typeof width !== 'number' || !isFinite(width) || width <= 0) return undefined;
    if (readings <= 1) return undefined;
    return width / readings;
}

/**
 * How much page a dot covers, edge to edge.
 *
 * A mark's `size` is its area in px², and its stroke straddles the edge it is
 * drawn on, so half the stroke falls outside the disc on each side — the ink a
 * neighbouring dot has to clear is the diameter plus one whole stroke width.
 */
function dotOuterDiameter(size: number, strokeWidth: number): number {
    return 2 * Math.sqrt(size / Math.PI) + strokeWidth;
}

/**
 * Round a span outward to whole ticks, the way the renderer's own scale would.
 *
 * This is d3's `nice`, which Vega uses: the step is chosen from the 1/2/5/10
 * family, and both ends are pushed out to a multiple of it until the step
 * settles. It is reproduced rather than called because the rounding has to be
 * applied to the *data*, before the pixel padding a dot scale carries — and
 * `scale.nice` can only be applied after.
 */
const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.SQRT2;

function tickIncrement(start: number, stop: number, count: number): number {
    const step = (stop - start) / Math.max(1, count);
    const power = Math.floor(Math.log10(step));
    const error = step / 10 ** power;
    const factor = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;
    return power >= 0 ? factor * 10 ** power : -(10 ** -power) / factor;
}

function niceSpan(start: number, stop: number, count: number): [number, number] {
    let lo = start;
    let hi = stop;
    let prestep: number | undefined;
    // d3 loops until the step settles; a bound keeps a pathological span finite.
    for (let i = 0; i < 32; i += 1) {
        const step = tickIncrement(lo, hi, count);
        if (step === prestep || step === 0 || !Number.isFinite(step)) break;
        if (step > 0) {
            lo = Math.floor(lo / step) * step;
            hi = Math.ceil(hi / step) * step;
        } else {
            lo = Math.ceil(lo * step) / step;
            hi = Math.floor(hi * step) / step;
        }
        prestep = step;
    }
    return [lo, hi];
}

/**
 * The rounded span of a plain numeric field, or nothing when it cannot be read.
 *
 * A pinned domain narrower than the data would put marks off the chart, so
 * anything the table cannot answer for — an aggregate, a bin, a time unit, a
 * stack, a field the rows do not carry — returns nothing and the caller leaves
 * the scale to the renderer.
 */
function roundedFieldDomain(enc: any, table: any[], count: number): [number, number] | undefined {
    const extent = plainFieldExtent(enc, table);
    if (!extent) return undefined;
    const [lo, hi] = extent;
    const [a, b] = niceSpan(lo, hi, count);
    // Rounding only ever pushes outward; anything else means the arithmetic
    // disagreed with the data, and a domain inside it would clip.
    if (!(a <= lo && b >= hi)) return undefined;
    return [a, b];
}

/** The smallest and largest value of a plain numeric field, read off the table, or nothing. */
function plainFieldExtent(enc: any, table: any[]): [number, number] | undefined {
    if (!Array.isArray(table) || !table.length) return undefined;
    if (typeof enc?.field !== 'string') return undefined;
    if (enc.aggregate || enc.bin || enc.timeUnit || enc.stack) return undefined;
    if (enc.type && enc.type !== 'quantitative') return undefined;
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of table) {
        const v = row?.[enc.field];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : undefined;
}

/**
 * Whether a domain pinned at both ends already keeps every dot clear of the plot's edges: the
 * data stops at least one dot radius short of each end, at the axis's planned length.
 */
function domainClearsDots(domain: [number, number] | undefined, data: [number, number] | undefined, length: number | undefined, radius: number): boolean {
    if (!domain || !data || !length || length <= 0 || !(domain[1] > domain[0])) return false;
    if (data[0] < domain[0] || data[1] > domain[1]) return false;
    const room = Math.min(data[0] - domain[0], domain[1] - data[1]) / (domain[1] - domain[0]);
    return room * length >= radius;
}

/**
 * A dot has a radius; a scale fitted to the data does not know that. Vega-Lite sizes a continuous
 * scale to the extremes of the field, which puts the centre of the outermost dot on the edge of
 * the plot and clips half of it. The plan opens the range by the dot's radius, in pixels, on the
 * axes of dots nothing anchors (`plan.points`); this writes it on the encodings that carry those
 * dots. A dumbbell keeps its position channels on the parent and gives the dot layer only its
 * colour, so the encoding to pad is found by walking down to each dot remembering where each
 * channel was last declared.
 */
export function padScaleForDots(spec: any, points: LayoutPlan['points'], table: any[]): void {
    if (!points) return;
    const { radius } = points;
    const dots: Record<string, any>[] = [];
    const visit = (node: any, declared: Record<string, any>): void => {
        if (!node || typeof node !== 'object') return;
        const next = { ...declared };
        for (const ch of ['x', 'y'] as const) {
            if (node.encoding?.[ch]?.field) next[ch] = node.encoding[ch];
        }
        if (node.mark && !isLiteralMark(node)) {
            const type = markTypeOf(node.mark);
            if (type && POINT_MARKS.has(type)) dots.push(next);
        }
        for (const k of ['layer', 'vconcat', 'hconcat', 'concat']) {
            if (Array.isArray(node[k])) node[k].forEach((child: any) => visit(child, next));
        }
        if (node.spec) visit(node.spec, next);
        if (node.facet?.spec) visit(node.facet.spec, next);
    };
    visit(spec, {});

    let padded = false;
    const pinned: Partial<Record<'x' | 'y', [number, number]>> = {};
    for (const declared of dots) {
        for (const ch of points.channels) {
            const enc = declared[ch];
            if (!enc?.field) continue;
            if (enc.type !== 'quantitative' && enc.type !== 'temporal') continue;
            // A scale pinned to zero, or to a domain the caller chose, is
            // saying where its ends are. Padding would move them.
            if (enc.scale?.zero === true || enc.scale?.domain || enc.scale?.padding != null) continue;
            // The padding is the breathing room that keeps the outermost dot
            // inside the axes; rounding on top of it is not wanted here. A dot
            // plot has no bar to anchor the eye, so an extra interval of empty
            // scale reads as the readings hiding in a corner — and rounding
            // outward can drag a `zero: false` ruler back to zero.
            //
            // Where a grid is drawn, the axis pass asked for the domain to be
            // rounded to the house's tick count so the last line lands on the
            // plot edge. Vega pads *before* it rounds, so honouring that here
            // would round the padded domain and turn a few pixels of clearance
            // into a whole extra interval: a 0-100 score came out as -10 to
            // 110. The data is rounded instead, and the padding stays the
            // sliver it is. Where the data cannot be read off the table —
            // an aggregate, a bin, a computed field — the rounding is dropped
            // rather than guessed, since a pinned domain that is too narrow
            // clips marks off the chart.
            const count = typeof enc.scale?.nice === 'number' ? enc.scale.nice : undefined;
            const rounded = count != null ? roundedFieldDomain(enc, table, count) : undefined;
            if (rounded) pinned[ch] = rounded;
            // Where the domain's ends, rounded here or by the axis ruler, already leave a dot's radius
            // of room, padding would only pull the end ticks off the plot's edge: the axis line drawn
            // there would sit below the zero it stands for.
            const ends: [number, number] | undefined = rounded
                ?? (typeof enc.scale?.domainMin === 'number' && typeof enc.scale?.domainMax === 'number'
                    ? [enc.scale.domainMin, enc.scale.domainMax] : undefined);
            const roomy = domainClearsDots(ends, plainFieldExtent(enc, table), points.lengths?.[ch], radius);
            // Planned ends are stated as domainMin and domainMax, as the ruler states them, so rows sent later re-plan the same form.
            const pinnedEnds = rounded ?? ends;
            enc.scale = {
                ...(enc.scale ?? {}),
                // Stated even when the ends leave room, so the rows a chart is sent later can need it.
                padding: roomy ? 0 : radius,
                ...(pinnedEnds ? { domainMin: pinnedEnds[0], domainMax: pinnedEnds[1] } : {}),
                nice: false,
            };
            if (pinnedEnds) pinned[ch] = pinnedEnds;
            padded = true;
        }
    }
    if (padded) {
        // Layers share a scale, and the axis pass wrote its rounding onto every
        // encoding of the channel — including the ones that carry no dot. Left
        // alone they disagree with the decision above, and the renderer warns
        // and picks one. Settle them all the same way.
        walk(spec, (node) => {
            for (const ch of ['x', 'y'] as const) {
                const enc = node.encoding?.[ch];
                if (!enc?.field || typeof enc.scale?.nice !== 'number') continue;
                enc.scale = {
                    ...enc.scale,
                    ...(pinned[ch] ? { domainMin: pinned[ch]![0], domainMax: pinned[ch]![1] } : {}),
                    nice: false,
                };
            }
        });
    }
}

/**
 * The most of a bar's own thickness a rounded end may eat.
 *
 * Read off the hand-drawn cartoon reference, whose 14px corner sits on a 46px
 * bar. Past roughly a third the corner starts reading as the shape rather than
 * as a finish on it, and at a half the bar is a capsule.
 */
const MAX_CORNER_FRACTION = 0.3;

/**
 * How far a crowded trajectory may shrink its dots and line.
 *
 * Below about half the authored size the bead stops being a reading a finger
 * could land on, and the trajectory is better served by the line alone.
 */
const MIN_DOT_SHRINK = 0.5;

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
 * A group divider — the dashed rule a grouped box or violin plot draws between
 * one department and the next — is written by the template as `bandPosition: 1`,
 * the end of the band. That is the middle of the gap only while the gap is
 * nothing: `bandPosition` is measured in band *widths*, so once a house asks for
 * `paddingInner` the band stops short of the step and the divider lands hard
 * against the right shoulder of the group on its left, reading as that group's
 * edge rather than as a boundary between two.
 *
 * The gap runs from the band's end to the next band's start and is
 * `step - width` wide; in band widths that is `paddingInner / (1 - paddingInner)`.
 * Half of it puts the rule in the middle, where it belongs — equidistant from
 * the two groups it separates, which is the whole claim a divider makes.
 */
function centerBandDividers(spec: any, paddedFields: Map<string, number>): void {
    if (paddedFields.size === 0) return;
    walk(spec, (node: any) => {
        if (markTypeOf(node.mark) !== 'rule') return;
        for (const channel of ['x', 'y'] as const) {
            const e = node.encoding?.[channel];
            // A rule with a second end on the same axis spans a range and is
            // anchored at both ends on purpose — a waterfall's connector reaches
            // from one bar's edge to the next and must keep touching them.
            if (!e || node.encoding?.[`${channel}2`]) continue;
            const padding = paddedFields.get(e.field);
            if (e.bandPosition !== 1 || !padding || padding <= 0) continue;
            e.bandPosition = 1 + padding / (2 * (1 - padding));
        }
    });
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
 * between the dodge lanes inside it, and the padding the house holds between
 * bands is taken back off — a house that spends a third of every band on air
 * draws a bar a third narrower than its step, which is the difference between
 * a stroke that fits and one that paints the bar out.
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
    const step = span / (cats * lanes);
    // Vega-Lite's own default gap for a banded bar, used when the house has
    // not said how much of the band it wants the bar to fill.
    const padInner = enc[channel].scale?.paddingInner;
    const fill = 1 - (typeof padInner === 'number' ? padInner : 0.1);
    return step * Math.max(0.05, fill);
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

/** How warm an ink reads: red minus blue, so a red-to-brown end scores high and a blue end low. */
function warmth(ink: string): number {
    const c = parseColor(ink);
    return c ? c.r - c.b : 0;
}

/**
 * The chart chose its diverging scheme for the field's meaning: `redblue` puts the warm end low,
 * where a loss or a fall sits, and `blueorange` puts it high, where heat sits. A house ramp is
 * written one way round; turn it so its warm end lands where the chart's scheme put it, or a
 * signed measure on a house ramp reads losses as gains.
 */
function orientDivergingRange(enc: any, range: string[]): string[] {
    const scheme = enc.scale?.scheme;
    const name = typeof scheme === 'string' ? scheme : scheme?.name;
    if (name !== 'redblue' && name !== 'blueorange' || range.length < 2) return range;
    const warmLow = warmth(range[0]) > warmth(range[range.length - 1]);
    const wantWarmLow = name === 'redblue';
    return warmLow === wantWarmLow ? range : [...range].reverse();
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

    const roles = categorySignRoles(table, field, domain, measure);

    // No sign to speak of — every category reads the same way, so the status
    // set says nothing the categorical set would not say better.
    if (!categoriesSplitBySign(roles)) return undefined;
    const range = roles.map((role) => (status as any)[role] ?? status.neutral ?? status.positive);
    if (range.some((c) => !c)) return undefined;
    return { domain, range: range as string[], roles };
}

/** One ink per value: its bound ink, else the next of the palette (which never holds a bound ink). */
function boundPalette(values: unknown[], s: DesignDecisions['series']): string[] {
    let next = 0;
    return values.map((v) => s.byValue?.[String(v).trim().toLowerCase()]
        ?? s.categorical[next++] ?? s.overflow ?? s.categorical[(next - 1) % Math.max(1, s.categorical.length)] ?? s.single);
}

function applySeriesInk(spec: any, d: DesignDecisions, table: any[], say: ReportDeparture, legend?: LegendPlan): void {
    const s = d.series;
    let sawColorField = false;
    let saidCollapse = false;
    let saidExhausted = false;
    let saidUnbound = false;
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

    let saidSequentialDomain = false;
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
                        say('ink.series', 'series-mode-not-applied',
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
                    continue;
                }
                // Categories with no sign between them (cities on a scatter whose x runs below zero)
                // are an ordinary set; handing them negative/neutral/positive by index would repeat inks.
                if (isContinuousColor(enc)) {
                    setColorRange(enc, [s.status.negative, s.status.neutral, s.status.positive].filter(Boolean) as string[]);
                    continue;
                }
            }
            if ((s.mode === 'sequential' || s.mode === 'diverging') && s.range?.length) {
                const quantize = s.quantize && enc.type === 'quantitative';
                // A diverging/sequential ramp sampled onto a *discrete* colour
                // domain (a waterfall's total/increase/decrease, say) can hand
                // a near-neutral midpoint to a bar fill. That neutral was
                // placed against a light surface; on a dark canvas it sinks
                // into the background. Re-tone the neutral entries to the same
                // distance from this surface, leaving the hued endpoints — and
                // every continuous heat ramp — untouched.
                const surface = d.surface.plot ?? d.surface.canvas;
                const oriented = s.mode === 'diverging' ? orientDivergingRange(enc, s.range) : s.range;
                const range = isContinuousColor(enc)
                    ? oriented
                    : oriented.map((c) => reToneNeutral(c, surface));
                // The chart read the field as diverging and made its domain symmetric about the pivot;
                // on a one-way ramp that half-empty domain paints the data in the dark half only, so the
                // ramp spans the data's own range instead.
                const symmetric = s.mode === 'sequential' && isContinuousColor(enc) && enc.scale?.domainMid !== undefined;
                setColorRange(enc, range, quantize ? { type: 'quantize' } : undefined);
                if (symmetric) {
                    delete enc.scale.domain;
                    if (!saidSequentialDomain) {
                        say('ink.series.sequential', 'diverging-read-sequential',
                            'the field is signed, but the house reads it on its sequential ramp, so the ramp spans the data rather than a domain balanced about the midpoint');
                        saidSequentialDomain = true;
                    }
                }
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
                    say('ink.series.categorical', 'palette-exhausted',
                        `${need} series against ${s.categorical.length} house inks — the scale is left as it is so no two series share a colour`);
                    saidExhausted = true;
                }
                continue;
            }
            const planned = legend ? plannedKeyFor(legend.keys, channel, enc) : undefined;
            const fold = planned?.fold;
            if (fold) {
                // The plan folded the tail: the largest series keep a named ink and the small
                // ones share the overflow ink under one "Others (N)" row of the key.
                {
                    const topK = fold.kept;
                    const k = topK.length;
                    const othersLabel = fold.others;
                    const field = enc.field;
                    const keyField = OVERFLOW_KEY_FIELD;
                    // A derived key folds the tail categories onto one value.
                    // The marks keep their own rows (a pie still draws N wedges,
                    // a bar N bars) — only which colour-key each row shows is
                    // remapped, so the legend dedupes to top-K plus one Others.
                    addColorKeyTransform(node, field, topK, othersLabel, keyField);
                    // The template's data order (M3) was by the original field; the wedges now run
                    // in the key's order, kept first and Others last.
                    const keyOrdered = node.encoding?.order?.field === '__flintArcOrder';
                    if (keyOrdered) {
                        node.transform = (node.transform ?? []).filter((t: any) => t?.as !== '__flintArcOrder');
                        delete node.encoding.order;
                    }
                    // The key keeps the name of the field it folds, not the working column's.
                    if (enc.title === undefined) enc.title = planned?.field ?? field;
                    enc.field = keyField;
                    enc.type = 'nominal';
                    const domain = [...topK, othersLabel];
                    const range = [...(s.byValue ? boundPalette(topK, s) : s.categorical.slice(0, k)), s.overflow!];
                    setColorRange(enc, range, { domain });
                    if (enc.legend !== null) {
                        // The K+1 domain is short enough to list in full; drop
                        // any values pin the template left so Others shows too.
                        const key = { ...(enc.legend ?? {}) };
                        delete key.values;
                        enc.legend = key;
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
                    if (keyOrdered && isPartToWholeMark(node)) {
                        node.transform = [...(node.transform ?? []), { calculate: `indexof(${JSON.stringify([...topK.map(String), othersLabel])}, toString(datum[${JSON.stringify(keyField)}]))`, as: '__flintArcOrder' }];
                        node.encoding.order = { field: '__flintArcOrder', type: 'quantitative', sort: 'ascending' };
                    }
                    if (!saidExhausted) {
                        say('ink.series.categorical', 'colours-folded',
                            merged
                                ? `${need} series past ${k} inks — the ${k} largest keep a colour, the rest sum into one "${othersLabel}" slice`
                                : `${need} series past ${k} inks — the ${k} largest keep a colour, the rest fold into one "${othersLabel}" ink named in the legend`);
                        saidExhausted = true;
                    }
                    continue;
                }
            }
            // Values with a bound ink keep it wherever they fall; the rest take the palette in order.
            // The domain is written out in the order Vega-Lite would give it, so the key reads the same.
            const rows = Array.isArray(node.data?.values) ? node.data.values : Array.isArray(spec.data?.values) ? spec.data.values : table;
            const domain = s.byValue && !isContinuousColor(enc) ? discreteDomain(enc, rows) : undefined;
            if (domain && domain.some((v) => s.byValue![String(v).trim().toLowerCase()])) {
                setColorRange(enc, boundPalette(domain, s), { domain });
                continue;
            }
            if (s.byValue && !domain && !saidUnbound) {
                say('ink.series.byValue', 'value-ink-not-applied',
                    `the order of \`${enc.field}\` is set by another channel, so its values cannot be matched to the house's bound inks — the palette is used by position`);
                saidUnbound = true;
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
    const surface = d.surface.plot ?? d.surface.canvas;

    // Furniture the template drew in pixels — a card, a track, a caption — is
    // painted with literal `fill`s chosen against flint's white. Those are
    // roles, not series: they keep their hues and only move to the same
    // distance from the surface they now sit on. Left alone, a white card
    // stays a white island on a dark canvas.
    // A label the template wrote itself — a radar's axis names, drawn as text
    // marks because the plot has no axis to hang them on — is chrome the house
    // owns. It is positioned by fields, so the furniture pass below does not
    // see it, and its literal grey was picked against flint's white: on a dark
    // canvas it sinks into the surface. The text is a constant, so nothing here
    // is a reading; it takes the house's secondary ink like any other label.
    walk(spec, (node) => {
        if (markTypeOf(node.mark) !== 'text' || node.__themeSynthetic || node.__themeRole) return;
        if (node.encoding?.text?.value === undefined) return;
        const mark = normalizeMark(node.mark);
        let changed = false;
        for (const key of ['fill', 'color'] as const) {
            if (typeof mark[key] === 'string' && mark[key] !== d.text.secondary) {
                mark[key] = d.text.secondary;
                changed = true;
            }
        }
        if (!changed) return;
        node.mark = mark;
    });

    // Vega-Lite paints a box plot's whiskers and caps from the mark's colour,
    // but only when the mark states one: with the colour *encoded*, the box
    // takes the series ink and the rule falls back to a literal black. On a
    // dark canvas the extremes then disappear entirely. The whisker is
    // structure holding a reading, so it takes the house's text ink — which on
    // a light house is the black it already was.
    walk(spec, (node) => {
        if (markTypeOf(node.mark) !== 'boxplot') return;
        const encoded = node.encoding?.color?.field ?? node.encoding?.fill?.field;
        if (!encoded) return;
        const mark = normalizeMark(node.mark);
        if (mark.color != null) return;
        let changed = false;
        for (const part of ['rule', 'ticks'] as const) {
            const own = mark[part];
            // `ticks` is off unless the mark asks for it, and an object *is*
            // asking — so only an existing tick gets recoloured. A rule is
            // always drawn, so it can be given one.
            if (part === 'ticks' && !(own && typeof own === 'object')) continue;
            if (own && typeof own === 'object' && own.color != null) continue;
            mark[part] = { ...(typeof own === 'object' ? own : {}), color: d.text.primary };
            changed = true;
        }
        if (!changed) return;
        node.mark = mark;
    });

    walk(spec, (node) => {
        if (!markTypeOf(node.mark) || node.__themeSynthetic || !isLiteralMark(node)) return;
        if (node.__themeRole) return;
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
    });

    paintRoleMarks(spec, d);

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
            return;
        }
        const own = normalizeMark(node.mark).color;
        // A gradient the chart drew (a ridge filled by its x) is its colour, not a gap for the ink.
        if (own && typeof own === 'object' && (own as any).gradient) return;
        if (typeof own === 'string' && sawColorField) {
            const toned = reToneNeutral(own, surface);
            node.mark = { ...normalizeMark(node.mark), color: toned };
            return;
        }
        if (s.signedStatus && (mark === 'bar' || mark === 'rect') && s.status?.negative) {
            const measure = d.bound.measureChannels.map((ch) => node.encoding?.[ch]).find((enc) => enc?.field && !enc.aggregate && enc.type === 'quantitative');
            if (measure) {
                node.encoding = {
                    ...node.encoding,
                    color: {
                        condition: { test: `datum[${JSON.stringify(measure.field)}] < 0`, value: s.status.negative },
                        value: s.status.positive ?? s.single,
                    },
                };
                return;
            }
        }
        node.mark = { ...normalizeMark(node.mark), color: s.single };
    });

    // A line's vertex dots that the house added are drawn from `config.line.point`, which carries
    // no colour: with the line's ink set on the mark alone, they fall back to the renderer's default
    // blue. With no colour field every line is the one series, so its dots take the same ink.
    if (!sawColorField && spec.config?.line?.point && spec.config.line.point.color == null) {
        spec.config.line.point = { ...spec.config.line.point, color: s.single };
    }

    if (!sawColorField && s.mode === 'categorical' && paintPanelSeries(spec, palette)) return;

    if (!sawColorField && s.mode !== 'single') {
        say('ink.series', 'series-mode-not-applied', `grounded as \`${s.mode}\` but the chart has no colour channel — single ink used`);
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
function applyRedundantChannels(spec: any, d: DesignDecisions, say: ReportDeparture): void {
    const r = d.marks.redundant;
    if (!r.shape && !r.dash) return;

    let placed = false;
    walk(spec, (node) => {
        const mark = markTypeOf(node.mark);
        if (!mark || node.__themeSynthetic) return;
        const series = node.encoding?.color ?? node.encoding?.stroke;
        if (!series?.field) return;
        // The dashes and shapes follow the colours' order (M3): the same sort, and the same domain
        // where the colour scale states one, so series 1 is solid and filled whatever its name.
        // And the colour key's name, so the key it merges with is not titled by a working column.
        const key = {
            field: series.field, type: series.type ?? 'nominal',
            ...(series.title !== undefined ? { title: series.title } : {}),
            ...(series.sort !== undefined ? { sort: series.sort } : {}),
            ...(Array.isArray(series.scale?.domain) ? { scale: { domain: series.scale.domain } } : {}),
        };

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
        if (r.shape && LINE_MARKS.has(mark) && d.marks.point?.show && normalizeMark(node.mark).point !== false) {
            // The vertex overlay takes its shape from the line's own encoding.
            if (!node.encoding.shape) node.encoding.shape = { ...key };
            placed = true;
        }
    });

    if (!placed) {
        say('marks.redundantEncoding', 'redundant-encoding-not-applied',
            'no mark in this chart can carry a redundant channel — colour is on its own');
    }
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

/** The planned key an encoding draws: by channel and the column it reads, a template's or the fold's included. */
export function plannedKeyFor(keys: PlannedKey[], channel: string, enc: any): PlannedKey | undefined {
    const column = typeof enc?.field === 'string' ? enc.field.replace(/\\(.)/g, '$1') : undefined;
    const reads = (key: PlannedKey) => column !== undefined
        && (column === (key.via ?? key.field) || (key.fold !== undefined && column === OVERFLOW_KEY_FIELD));
    return keys.find((key) => key.channel === channel && reads(key)) ?? keys.find(reads);
}

function applyLegend(
    spec: any, config: any, d: DesignDecisions, table: any[], say: ReportDeparture, planned: LegendPlan,
): void {
    const l = d.legend;
    const keyOf = (channel: string, enc: any) => plannedKeyFor(planned.keys, channel, enc);

    if (!l.show || l.placement === 'seriesEnd' || l.placement === 'inline') {
        // Keys that name series give way to the theme's naming; a key to values stays.
        let keptValueKey = false;
        walk(spec, (node) => {
            for (const channel of ['color', 'fill', 'stroke', 'shape', 'size', 'opacity'] as const) {
                const enc = node.encoding?.[channel];
                if (!enc?.field) continue;
                if (keyOf(channel, enc)?.show) {
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
            ...(heavierThanNormal(l.label.fontWeight) ? { labelFontWeight: l.label.fontWeight } : {}),
            ...(l.label.fontStyle ? { labelFontStyle: l.label.fontStyle } : {}),
            labelColor: l.label.color,
            ...keyTitleConfig(l.titleText),
        };
        say('legend.valueKey', 'value-key-kept',
            'no series legend, but the size key is a value scale — it stays so the bubble sizes can be read');
        return;
    }

    config.legend = {
        ...(config.legend ?? {}),
        orient: l.orient,
        direction: l.direction,
        labelFont: l.label.font,
        labelFontSize: l.label.fontSize,
        ...(heavierThanNormal(l.label.fontWeight) ? { labelFontWeight: l.label.fontWeight } : {}),
        ...(l.label.fontStyle ? { labelFontStyle: l.label.fontStyle } : {}),
        labelColor: l.label.color,
        ...keyTitleConfig(l.titleText),
        ...(l.gradientLength ? { gradientLength: l.gradientLength } : {}),
    };
    // A colour ramp is a caption, not an exhibit: the plan cuts it to a share of
    // the block it labels. A composite chart has no planned block yet, so its
    // ramp is still measured off the spec here.
    const gradient = planned.gradient
        ?? (!l.gradientLength && (l.direction ?? 'horizontal') === 'horizontal' ? (() => {
            const block = blockWidth(spec, table);
            return block ? { length: Math.round(clamp(block * 0.45, 80, 200)), block } : undefined;
        })() : undefined);
    if (gradient) {
        config.legend.gradientLength = gradient.length;
    }
    fitBinnedKeyLength(spec, config, table, gradient?.block);
    // A key the plan leaves untitled drops its title — a series key whose labels name themselves, a
    // key the chart makes itself — even where its template wrote one; a key to values keeps its own,
    // because a number names nothing until the key says what it counts.
    walk(spec, (node) => {
        const series = node.encoding?.color ?? node.encoding?.stroke;
        for (const channel of ['color', 'fill', 'stroke', 'shape', 'strokeDash', 'size', 'opacity'] as const) {
            const enc = node.encoding?.[channel];
            if (!enc?.field || enc.legend === null) continue;
            // A shape or dash that repeats the colours merges with their key, and is titled as it is.
            const redundant = (channel === 'shape' || channel === 'strokeDash') && series && series !== enc && series.field === enc.field;
            const key = redundant ? keyOf(node.encoding.color ? 'color' : 'stroke', series) : keyOf(channel, enc);
            if (key ? !key.untitled : l.title) continue;
            enc.legend = { ...(enc.legend ?? {}), title: null };
        }
    });
    if (!l.title && planned.untitled) config.legend.title = null;
    // A top key would land its last row on a flat y title; the plan stands it clear.
    if (planned.titleClearance !== undefined) {
        config.legend.offset = (config.legend.offset ?? 18) + planned.titleClearance;
    }
    // A top or bottom key reads as a caption to the whole graphic, so the house
    // would rather it began where the title does than indented to the plot.
    // Vega-Lite has no way to say so: `legend.layout` was dropped after v4 and
    // is silently discarded, and the only remaining route — `orient: 'none'`
    // with an explicit `legendX` — would have to guess the width of the axis
    // labels it must clear. That guess is wrong often enough to be worse than
    // the indent, so the key stays where the renderer measures it.
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
        walk(spec, (node) => {
            const enc = node.encoding?.size;
            if (!enc?.field || enc.legend === null) return;
            enc.legend = { ...(enc.legend ?? {}), symbolFillColor: d.text.muted };
        });
    }

    // A key to values is sampled at the round values the plan chose, not enumerated.
    walk(spec, (node) => {
        for (const channel of ['size', 'color', 'opacity'] as const) {
            const enc = node.encoding?.[channel];
            if (!enc?.field || enc.legend === null || enc.legend?.values) continue;
            const samples = keyOf(channel, enc)?.samples;
            if (!samples) continue;
            enc.legend = { ...(enc.legend ?? {}), values: samples };
        }
    });
}

// ---------------------------------------------------------------------------
// Facet chrome
// ---------------------------------------------------------------------------

function applyFacetChrome(spec: any, config: any, d: DesignDecisions): void {
    const f = d.facets;
    config.header = {
        ...(config.header ?? {}),
        labelFont: f.header.font,
        labelFontSize: f.header.fontSize,
        labelColor: f.header.color,
        labelFontWeight: f.header.fontWeight ?? 'normal',
        ...(f.header.fontStyle ? { labelFontStyle: f.header.fontStyle } : {}),
        ...(f.header.show ? {} : { labels: false }),
        ...(f.header.fieldTitle ? {} : { title: null }),
    };
    // A faceted chart draws its x axis line under the bottom row only, so every panel stands on a
    // floor drawn as that line at its own bottom edge, and the axis draws none.
    const spine = config.axisX ?? {};
    const drawsSpine = spine.domain !== false && spine.domainColor && spine.domainColor !== 'transparent'
        && (spine.domainWidth ?? 1) > 0;
    const floored: any[] = [];
    walk(spec, node => {
        const operator = Boolean(node.facet && node.spec);
        const wrapped = operator ? !!node.facet.field && typeof node.columns === 'number' : Boolean(node.encoding?.facet);
        const rowed = operator ? Boolean(node.facet.row) : Boolean(node.encoding?.row);
        if (!wrapped && !rowed) return;
        let hasSpine = false;
        walk(operator ? node.spec : node, child => {
            const axis = child.encoding?.x;
            if (axis?.field && axis.axis !== null && axis.axis?.domain !== false) hasSpine = true;
        });
        const shared = node.resolve?.axis?.x !== 'independent' && node.resolve?.scale?.x !== 'independent';
        if (drawsSpine && hasSpine && shared) floored.push(node);
    });
    for (const node of floored) {
        // The floor is every panel's x axis line, the bottom row's too.
        walk(node.facet && node.spec ? node.spec : node, child => {
            const x = child.encoding?.x;
            if (x?.field && x.axis !== null) x.axis = { ...(x.axis ?? {}), domain: false };
        });
        const top = spine.orient === 'top';
        const offset = spine.offset ?? 0;
        appendLayer(node, withInteractionDecorative({
            __themeSynthetic: true,
            transform: [{ window: [{ op: 'row_number', as: '__flintFloor' }], groupby: [] }, { filter: 'datum.__flintFloor === 1' }],
            mark: {
                type: 'rule',
                color: spine.domainColor,
                strokeWidth: spine.domainWidth ?? 1,
                ...(spine.domainDash ? { strokeDash: spine.domainDash } : {}),
                ...(offset ? { yOffset: top ? -offset : offset } : {}),
            },
            encoding: {
                y: { value: top ? 0 : 'height' },
                x: { value: 0 },
                x2: { value: 'width' },
            },
        }));
    }
    const yAxis = d.axes.y;
    if (yAxis && facetDropsTicks(yAxis)) {
        walk(spec, node => {
            const operator = Boolean(node.facet && node.spec);
            if (!operator && !node.encoding?.facet && !node.encoding?.row && !node.encoding?.column) return;
            walk(operator ? node.spec : node, child => {
                const encoding = child.encoding?.y;
                if (!encoding?.field || encoding.axis === null || !['quantitative', 'temporal'].includes(encoding.type)) return;
                encoding.axis = { ...(encoding.axis ?? {}), ticks: false };
            });
        });
    }
    walk(spec, node => {
        if (!node.facet || !node.spec) return;
        const wrapped = !!node.facet.field && typeof node.columns === 'number';
        if (!wrapped) return;
        walk(node.spec, child => {
            const encoding = child.encoding?.y;
            if (!encoding?.field || encoding.axis === null) return;
            const axis = encoding.axis ??= {};
            if (node.resolve?.axis?.y !== 'independent' && node.resolve?.scale?.y !== 'independent'
                && axis.titleAngle === 0 && axis.title !== null && typeof axis.titleY === 'number' && axis.titleY < 0) {
                const title = axis.title ?? titleOf(encoding);
                if (typeof title === 'string') {
                    axis.title = { expr: `parent.data === 0 ? ${JSON.stringify(title)} : ''` };
                }
            }
        });
    });
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
function applyPanelTitles(spec: any, d: DesignDecisions): void {
    const f = d.facets;
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
                    ...(f.header.fontStyle ? { fontStyle: f.header.fontStyle } : {}),
                    color: ink ?? f.header.color,
                };
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

function applyDataLabels(
    spec: any, d: DesignDecisions, table: any[], say: ReportDeparture, planned?: ValueLabelPlan | { refused: string },
): any {
    if (!planned) return undefined;
    if ('refused' in planned) {
        say('dataLabels', 'value-labels-not-drawn', planned.refused);
        return undefined;
    }

    // A concatenation is several charts side by side. Labelling only the first
    // panel is worse than labelling none.
    const said = new Set<string>();
    const once: ReportDeparture = (path, code, message) => {
        const k = `${path}\u0000${code}\u0000${message}`;
        if (said.has(k)) return;
        said.add(k);
        say(path, code, message);
    };
    let first: any;
    for (const body of plotBodies(spec)) {
        const layer = labelOneBody(spec, body, d, table, once, planned);
        if (layer && !first) first = layer;
    }
    return first;
}

/**
 * The ink for a number printed on a ramp.
 *
 * Vega-Lite cannot ask a mark what colour it ended up. A parallel quantized
 * scale over the same (possibly aggregated) measure maps each ramp interval to
 * readable light or dark text. Keeping the aggregate on the encoding lets
 * Vega-Lite derive the same per-cell domain for both fill and label ink.
 */
function inkScaleOnRamp(enc: any, stops: string[], light: string, dark: string): any {
    if (stops.length < 2) return { value: dark };
    const discreteScale = ['quantile', 'quantize', 'threshold', 'bin-ordinal'].includes(enc.scale?.type);
    if (discreteScale && Array.isArray(enc.scale?.range) && enc.scale.range.length > 0) {
        return {
            field: enc.field,
            type: 'quantitative',
            ...(enc.aggregate ? { aggregate: enc.aggregate } : {}),
            legend: null,
            scale: {
                ...enc.scale,
                range: enc.scale.range.map((fill: string) => readableOn(fill, light, dark)),
            },
        };
    }
    const STEPS = 32;
    const range: string[] = [];
    const lightColor = parseColor(light);
    const darkColor = parseColor(dark);
    const contrast = (a: ReturnType<typeof parseColor>, b: ReturnType<typeof parseColor>): number => {
        if (!a || !b) return 0;
        const lo = Math.min(luminance(a), luminance(b));
        const hi = Math.max(luminance(a), luminance(b));
        return (hi + 0.05) / (lo + 0.05);
    };
    for (let i = 0; i < STEPS; i++) {
        const t = ((i + 0.5) / STEPS) * (stops.length - 1);
        const a = parseColor(stops[Math.floor(t)]);
        const b = parseColor(stops[Math.min(stops.length - 1, Math.floor(t) + 1)]);
        if (!a || !b) {
            range.push(dark);
            continue;
        }
        const k = t - Math.floor(t);
        const c = { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k, a: 1 };
        range.push(contrast(lightColor, c) >= contrast(darkColor, c) ? light : dark);
    }
    return {
        field: enc.field,
        type: 'quantitative',
        ...(enc.aggregate ? { aggregate: enc.aggregate } : {}),
        legend: null,
        scale: {
            ...(enc.scale?.domain ? { domain: enc.scale.domain } : {}),
            type: 'quantize',
            range,
        },
    };
}

/**
 * A whole pie set as the plan fitted it: its radius and centre, its hole kept in proportion. The
 * plot is the plan's, already come in to the drawing.
 */
function placeArc(units: any[], markDef: any, arc: NonNullable<ValueLabelPlan['arc']>): void {
    for (const unit of units) {
        if (markTypeOf(unit.mark) !== 'arc') continue;
        const own = normalizeMark(unit.mark) ?? { type: 'arc' };
        const hole = typeof own.innerRadius === 'number' && typeof own.outerRadius === 'number' && own.outerRadius > 0
            ? { innerRadius: Math.round(own.innerRadius * arc.radius / own.outerRadius) } : {};
        unit.mark = { ...own, outerRadius: arc.radius, ...hole, x: arc.center.x, y: arc.center.y };
    }
    Object.assign(markDef, { x: arc.center.x, y: arc.center.y });
}

function labelOneBody(
    spec: any, body: any, d: DesignDecisions, table: any[], say: ReportDeparture, planned: ValueLabelPlan,
): any {
    const live = d.dataLabels.liveSignal;
    const units = body.layer
        ? body.layer.filter((n: any) => DATA_MARKS.has(markTypeOf(n.mark) ?? ''))
        : (markTypeOf(body.mark) ? [body] : []);
    const radial = planned.form === 'radial';
    const cells = planned.form === 'cells';
    const measureChannel = planned.channel;
    const primary = units[0];
    const enc = primary ? mergedEncoding(primary, body.encoding) : {};
    const measure = enc[measureChannel];
    if (measure?.field !== planned.field) {
        say('dataLabels', 'value-labels-not-drawn', `the plan prints \`${planned.field}\` on \`${measureChannel}\`, which this view does not draw — left unlabelled`);
        return;
    }
    const stackedSegments = planned.form === 'segments';

    const horizontal = measureChannel === 'x';
    // The plan decides: a house's `atMark` can still print every label past the bar (`allOutside`).
    let outside = !planned.inside;
    const t = d.dataLabels.text;
    const onMarkBody = planned.body;

    const markDef: any = {
        type: 'text',
        font: t.font,
        fontSize: t.fontSize,
        ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
        ...(t.fontStyle ? { fontStyle: t.fontStyle } : {}),
    };
    let inside = planned.inside;
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
    // Which side of the mark's end a label sits on depends on which way the
    // mark grew. A bar that runs down from zero has its end at the bottom, so
    // "outside" is *below* it — placing the number above puts it on top of the
    // bar it labels. The direction is a property of the datum, not of the
    // layer, so where the series has negatives it is stated as an expression
    // and Vega-Lite resolves it per mark.
    const hasNegative = planned.negative;
    const geometry = (within: boolean): any => {
        const w = reversed ? !within : within;
        const gap = horizontal ? (within ? 5 + radius : 4 + radius) : 4 + radius;
        if (!hasNegative) {
            return horizontal
                ? { align: w ? 'right' : 'left', baseline: 'middle', dx: w ? -gap : gap }
                : { align: 'center', baseline: w ? 'top' : 'bottom', dy: w ? gap : -gap };
        }
        const down = `datum[${JSON.stringify(measure.field)}] < 0`;
        const pick = (positive: string | number, negative: string | number) => ({
            expr: typeof positive === 'string'
                ? `${down} ? '${negative}' : '${positive}'`
                : `${down} ? ${negative} : ${positive}`,
        });
        return horizontal
            ? {
                align: pick(w ? 'right' : 'left', w ? 'left' : 'right'),
                baseline: 'middle',
                dx: pick(w ? -gap : gap, w ? gap : -gap),
            }
            : {
                align: 'center',
                baseline: pick(w ? 'top' : 'bottom', w ? 'bottom' : 'top'),
                dy: pick(w ? gap : -gap, w ? -gap : gap),
            };
    };
    // Where an inside label sits along its bar (L4): at the end, the base, or the middle. Only a
    // bar's own value has a base and a middle; an aggregated measure keeps the end.
    const anchor: 'end' | 'start' | 'middle' = inside && planned.form === 'ends' && onMarkBody && !measure.aggregate
        ? d.dataLabels.anchor : 'end';
    const anchorGeometry = (at: 'start' | 'middle'): any => {
        if (at === 'middle') return horizontal ? { align: 'center', dx: 0 } : { baseline: 'middle', dy: 0 };
        const gap = 5 + radius;
        // From the base the label reads toward the value end: rightward (upward) for a value above
        // zero, the other way below it, and mirrored on a reversed scale.
        const forward = reversed ? -1 : 1;
        if (!hasNegative) {
            return horizontal
                ? { align: forward > 0 ? 'left' : 'right', dx: forward * gap }
                : { baseline: forward > 0 ? 'bottom' : 'top', dy: -forward * gap };
        }
        const down = `datum[${JSON.stringify(measure.field)}] < 0`;
        return horizontal
            ? { align: { expr: `${down} ? '${forward > 0 ? 'right' : 'left'}' : '${forward > 0 ? 'left' : 'right'}'` }, dx: { expr: `${down} ? ${-forward * gap} : ${forward * gap}` } }
            : { baseline: { expr: `${down} ? '${forward > 0 ? 'top' : 'bottom'}' : '${forward > 0 ? 'bottom' : 'top'}'` }, dy: { expr: `${down} ? ${forward * gap} : ${-forward * gap}` } };
    };
    if (cells) {
        // A cell has no outside: the grid is continuous, and a number beside a
        // cell belongs to no cell in particular.
        Object.assign(markDef, { align: 'center', baseline: 'middle' });
        if (d.dataLabels.placement !== 'atMark') {
            say('dataLabels.placement', 'value-labels-placement-changed',
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
        // own radius keeps it unless the labels outside would leave the plot:
        // a key above or below it stands on the plot's edge, and a label past
        // that edge lands on the key.
        const radialOutsideGap = RADIAL_OUTSIDE_GAP;
        const printed = measureValueLabels(
            table.map((row) => row?.[measure.field]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
            { format: d.dataLabels.format, compact: d.dataLabels.compact, unit: d.dataLabels.unit, text: t },
        );
        // A donut's labels sit in the middle of its ring, which has to be as thick as the widest
        // label is wide (a label at three o'clock lies across the ring). A thinner ring sends them
        // outside it, onto the plot, in the plot's ink (L5).
        const hole = normalizeMark(arc?.mark)?.innerRadius;
        let ringMiddle: number | undefined;
        if (r !== undefined && inside && typeof hole === 'number' && hole > 0 && hole < r) {
            const ring = r - hole;
            if (ring >= printed.widest + 2 * LABEL_SIDE) ringMiddle = (r + hole) / 2;
            else {
                inside = false;
                outside = true;
                say('dataLabels.placement', 'value-labels-placement-changed',
                    `the ring is ${Math.round(ring)}px thick and the widest label ${Math.round(printed.widest)}px wide — the labels move outside the ring`);
                // An arc that states its radius keeps it unless the labels outside would leave the plot.
                const halfMin = typeof w === 'number' && typeof h === 'number' ? Math.min(w, h) / 2 : undefined;
                const reach = r + radialOutsideGap + printed.widest / 2 + 4;
                if (arc && halfMin !== undefined && reach > halfMin && typeof declared === 'number') {
                    const scale = Math.max(0.5, (halfMin - (radialOutsideGap + printed.widest / 2 + 4)) / r);
                    const norm = normalizeMark(arc.mark) ?? { type: 'arc' };
                    arc.mark = { ...norm, outerRadius: Math.round(r * scale), innerRadius: Math.round(hole * scale) };
                    r *= scale;
                }
            }
        }
        // A whole pie with its numbers outside is set as the plan fitted it, by where they fall.
        if (planned.arc && !inside && arc) {
            placeArc(units, markDef, planned.arc);
            r = planned.arc.radius;
        }
        else if (r !== undefined && !inside && typeof w === 'number' && typeof h === 'number' && arc) {
            const halfMin = Math.min(w, h) / 2;
            const room = printed.widest / 2 + radialOutsideGap + 4;
            if (typeof declared !== 'number' || r + room > halfMin) {
                const arcOuter = Math.max(halfMin * 0.5, halfMin - room);
                if (arcOuter < r) {
                    const norm = normalizeMark(arc.mark) ?? { type: 'arc' };
                    const hole = typeof norm.innerRadius === 'number' ? Math.round(norm.innerRadius * arcOuter / r) : undefined;
                    arc.mark = { ...norm, outerRadius: Math.round(arcOuter), ...(hole !== undefined ? { innerRadius: hole } : {}) };
                    r = arcOuter;
                }
            }
        }
        if (r) {
            const labelRadius = inside ? ringMiddle ?? r * 0.72 : r + radialOutsideGap;
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
                        say('dataLabels.show', 'value-labels-hidden',
                            `${dropped} slice${dropped === 1 ? '' : 's'} narrower than a line of text go unlabelled — their arc would not hold the number`);
                    }
                }
            }
        } else say('dataLabels', 'value-labels-placement-changed', 'the arc has no radius to hang a label from');
    } else if (stackedSegments) {
        // The middle of the segment, whichever way the bars run.
        Object.assign(markDef, { align: 'center', baseline: 'middle' });
    } else {
        Object.assign(markDef, geometry(inside));
        if (anchor !== 'end') Object.assign(markDef, anchorGeometry(anchor));
    }
    if (d.dataLabels.placement === 'column' && !cells) {
        say('dataLabels.placement', 'value-labels-placement-changed', '`column` approximated as `outsideMark` — Vega-Lite has no label gutter');
    }

    const labelEncoding: any = {
        text: {
            field: measure.field,
            type: 'quantitative',
            ...(measure.aggregate ? { aggregate: measure.aggregate } : {}),
            ...(d.dataLabels.format ? { format: d.dataLabels.format } : {}),
        },
    };
    // A compacted label is a string computed per row: an aggregated one keeps its format.
    const compact = measure.aggregate ? undefined : d.dataLabels.compact;
    if (d.dataLabels.unit || compact) {
        printWithUnit(body, { encoding: labelEncoding }, measure.field, d.dataLabels.format, d.dataLabels.unit, compact);
    }
    // `facet`, `row` and `column` split the data; Vega-Lite refuses them inside
    // a layer and `appendLayer` promotes them to a real facet operator that
    // covers every layer, the label included. Copied onto the label they are a
    // second, conflicting split — so they are left to the operator.
    for (const ch of ['x', 'y', 'xOffset', 'yOffset', 'detail', 'theta', 'radius'] as const) {
        if (enc[ch]) labelEncoding[ch] = stripAxis(enc[ch]);
    }
    // A label anchored at the base or the middle of its bar is placed at 0 or half its value, on the
    // bar's own scale.
    const valueAt = { ...labelEncoding[measureChannel] };
    const anchorTransform = anchor === 'end' ? undefined : {
        calculate: anchor === 'start' ? '0' : `datum[${JSON.stringify(measure.field)}] / 2`,
        as: '__flintLabelAt',
    };
    // Vega-Lite merges the field titles of layers sharing an axis; the label names the bar's quantity.
    if (anchorTransform) {
        const own = enc[measureChannel];
        labelEncoding[measureChannel] = { field: '__flintLabelAt', type: 'quantitative', title: own && 'title' in own ? own.title : measure.field };
    }
    // Vega-Lite stacks `theta` for arcs but not for text, so a copied angle
    // would measure from zero instead of from the start of the slice.
    if (radial && labelEncoding.theta) labelEncoding.theta = { ...labelEncoding.theta, stack: true };

    // A stacked label rides the same stack as its segment, sat in the middle
    // of it rather than at its end.
    let stackedKeepTest: string | undefined;
    let stackedTransform: any[] | undefined;
    let stackOrderTransform: any | undefined;
    if (stackedSegments) {
        labelEncoding[measureChannel] = {
            ...labelEncoding[measureChannel],
            stack: measure.stack ?? 'zero',
            bandPosition: 0.5,
        };
        if (enc.color?.field) {
            const key = { field: enc.color.field, type: enc.color.type ?? 'nominal' };
            labelEncoding.detail = labelEncoding.detail
                ? [].concat(labelEncoding.detail as any, key as any)
                : key;
            // Vega-Lite reads the stacking order off the colour field. The
            // label layer carries no colour, so left to itself it stacks the
            // segments in a different order from the bars and every number
            // lands on a neighbour's segment. Stating the order the bars
            // already use puts them back — and stating it only here leaves
            // the drawn bars exactly as they were.
            //
            // Which order that is cannot be assumed. Sorting the field
            // alphabetically matches only when the colour scale takes its
            // domain from the field's natural order; a template that pins an
            // explicit domain — as the stacked-bar template does, to keep a
            // Likert scale in its own order — stacks in *that* order instead,
            // and an alphabetical label order then lands every number on the
            // wrong segment. So the domain is read off the scale where it is
            // stated, and the position of each row within it is what the
            // labels are ordered by: one rule that follows the bars in both
            // cases. The two axes run opposite ways — a stack grows up the y
            // axis but rightward along the x — so the direction still flips
            // with the orientation.
            const stated = enc.color.scale?.domain;
            const domain = Array.isArray(stated) && stated.length > 0
                ? stated
                : Array.from(new Set(table.map((r) => r?.[enc.color.field])
                    .filter((v) => v !== undefined && v !== null)))
                    .sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
            stackOrderTransform = {
                calculate: `indexof(${JSON.stringify(domain)}, datum[${JSON.stringify(enc.color.field)}])`,
                as: '__flintStackOrder',
            };
            labelEncoding.order = {
                field: '__flintStackOrder',
                type: 'quantitative',
                sort: horizontal ? 'ascending' : 'descending',
            };
        }
        // A segment shorter than a line of text cannot hold its number. How
        // much of the plot a segment occupies is its value over the tallest
        // stack — or, where the chart is normalized, over its own stack, since
        // every bar is drawn full height. Hiding by opacity rather than
        // dropping the row keeps the stack intact, so the surviving labels
        // stay on the segments they belong to.
        const minShare = planned.segmentMinShare;
        const catField = horizontal ? enc.y?.field : enc.x?.field;
        if (minShare !== undefined || planned.segmentMinValue !== undefined) {
            const v = `abs(datum[${JSON.stringify(measure.field)}])`;
            if (minShare !== undefined && catField) {
                // Each bar is measured against its own total, which only
                // exists once the rows are grouped — so Vega-Lite computes it.
                stackedTransform = [{
                    joinaggregate: [{ op: 'sum', field: measure.field, as: '__flintStackTotal' }],
                    groupby: [catField],
                }, {
                    calculate: `datum.__flintStackTotal ? datum[${JSON.stringify(measure.field)}] / datum.__flintStackTotal : 0`,
                    as: '__flintStackShare',
                }];
                // On a normalized bar the length of a segment *is* its share,
                // and the axis is a percentage. Printing the raw value there
                // would name a different quantity from the one drawn, so the
                // number that goes in the segment is the share itself.
                labelEncoding.text = { field: '__flintStackShare', type: 'quantitative', format: '.0%' };
                say('dataLabels', 'value-labels-print-share', 'each segment prints its share — on a normalized bar the segment\'s length is its share, not its value');
                stackedKeepTest = `datum.__flintStackTotal > 0 && ${v} / datum.__flintStackTotal >= ${minShare}`;
            } else {
                const minValue = planned.segmentMinValue;
                if (minValue !== undefined) {
                    stackedKeepTest = live ? `${v} >= ${live}.labels.minValue` : `${v} >= ${minValue}`;
                    const dropped = table.filter((row) => {
                        const val = row?.[measure.field];
                        return typeof val === 'number' && Math.abs(val) < minValue;
                    }).length;
                    if (dropped > 0) {
                        say('dataLabels.show', 'value-labels-hidden',
                            `${dropped} segment${dropped === 1 ? '' : 's'} thinner than a line of text go unlabelled — the number would not fit between the segment's edges`);
                    }
                }
            }
        }
    }

    // The label sits on the mark body and the mark's fill comes from a
    // categorical scale: each entry in that scale is a different background,
    // so each needs its own ink. Mirroring the fill encoding — same field,
    // same sort, no legend — makes Vega-Lite derive the same domain, so range
    // entry *i* is the ink for fill *i* without the domain ever being named.
    const fillRange: unknown = enc.color?.scale?.range;
    const perCategoryInk = (!outside && onMarkBody && enc.color?.field
        && Array.isArray(fillRange) && fillRange.length > 0
        && fillRange.every((c) => typeof c === 'string'))
        ? {
            field: enc.color.field,
            type: enc.color.type ?? 'nominal',
            ...(enc.color.sort !== undefined ? { sort: enc.color.sort } : {}),
            scale: { range: (fillRange as string[]).map((fill) => readableOn(fill, d.text.inverse, d.text.primary, d.dataLabels.minContrast)) },
            legend: null,
        }
        : undefined;

    if (cells) {
        // The cell under the number is the ramp, so the ink follows the ramp.
        const stops = d.series.ramp?.stops ?? d.series.range ?? [];
        labelEncoding.color = inkScaleOnRamp(measure, stops, d.text.inverse, d.text.primary);
    } else if (d.dataLabels.inkMode === 'matchSeries' && enc.color?.field) {
        labelEncoding.color = { ...enc.color, legend: null };
    } else if (perCategoryInk) {
        // A number sitting *inside* a mark that draws from a categorical
        // palette has as many backgrounds as the palette has entries, so one
        // ink cannot serve them all: Swiss prints a near-black label, and on
        // its near-black series the number simply vanishes. The ink is a fact
        // about the segment it lands on, so it is resolved per segment —
        // by giving the label its own colour scale over the same field, with
        // the same sort, so Vega-Lite derives the identical domain and the
        // two ranges line up entry for entry.
        labelEncoding.color = perCategoryInk;
    } else if (d.dataLabels.inkMode === 'contrastWithMark' && !outside && onMarkBody) {
        const seriesInk = d.series.mode === 'single' ? d.series.single : d.series.categorical[0] ?? d.series.single;
        markDef.color = readableOn(seriesInk, d.text.inverse, d.text.primary, d.dataLabels.minContrast);
    } else if (d.dataLabels.inkMode === 'contrastWithMark') {
        // The label is floating over the surface, not sitting on the mark, so
        // the thing it has to be readable against is the surface.
        markDef.color = readableOn(d.surface.plot ?? d.surface.canvas, d.text.inverse, d.text.primary);
    } else {
        markDef.color = t.color ?? d.text.primary;
    }

    const layer: any = withInteractionTextLabel({
        __themeSynthetic: true,
        mark: markDef,
        encoding: labelEncoding,
    }, { presentation: inside ? 'on-mark' : 'independent' });
    if (radialLabelKeepTest) {
        labelEncoding.opacity = { condition: { test: radialLabelKeepTest, value: 1 }, value: 0 };
    }
    if (stackedKeepTest) {
        labelEncoding.opacity = { condition: { test: stackedKeepTest, value: 1 }, value: 0 };
    }
    if (live && d.dataLabels.format && !compact && !measure.aggregate
        && (d.dataLabels.unit || (labelEncoding.text?.field === measure.field && labelEncoding.text.format === d.dataLabels.format))) {
        const shown = `format(datum[${JSON.stringify(measure.field)}], ${live}.labels.format)`;
        labelEncoding.text = { value: { expr: withUnitExpr(shown, d.dataLabels.unit) } };
    }
    if (live) {
        const kept = labelEncoding.opacity?.condition?.test;
        const shown = `${live}.labels.show`;
        labelEncoding.opacity = { condition: { test: kept ? `${shown} && (${kept})` : shown, value: 1 }, value: 0 };
    }
    // The order index has to exist before the stack is computed, so it goes
    // in front of whatever else the label layer derives.
    // Under a live layout, labels the plan does not print leave the data rather than
    // the view; all of them leave together, so no stack is cut.
    const labelTransforms = [
        ...(anchorTransform ? [anchorTransform] : []),
        ...(stackOrderTransform ? [stackOrderTransform] : []),
        ...(stackedTransform ?? []),
        ...(live ? [{ filter: `${live}.labels.show` }] : []),
    ];
    if (labelTransforms.length > 0) layer.transform = [...(live ? layer.transform ?? [] : []), ...labelTransforms];
    if (perCategoryInk || (cells && labelEncoding.color?.field)) {
        // Vega-Lite merges scales of the same channel across a layer, so the
        // label's ink range and the mark's fill range are two answers to one
        // question and the fill wins — leaving the number painted its own
        // background. Resolving colour independently lets the two coexist.
        // The label's scale carries `legend: null`, so the legend still comes
        // from the marks alone.
        body.resolve = {
            ...(body.resolve ?? {}),
            scale: { ...(body.resolve?.scale ?? {}), color: 'independent' },
        };
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
        }
        // Both layers stack in one order, stated outright: the label's text is a stack key, so a
        // label left to itself stacks by what it prints and lands on another slice. An arc that
        // already orders its wedges (data order, or a value sort) keeps that order, and the labels
        // follow it; with none, the colour field orders them, as Vega-Lite would for the wedges.
        const own = arc?.encoding?.order ?? shared.order;
        if (own) {
            shared.order = own;
            if (arc?.encoding) delete arc.encoding.order;
            const field = own.field;
            const derives = (t: any) => typeof field === 'string' && t?.as === field;
            if (arc && arc !== host && (arc.transform ?? []).some(derives)) {
                host.transform = [...(host.transform ?? []), ...arc.transform.filter(derives)];
                arc.transform = arc.transform.filter((t: any) => !derives(t));
                if (arc.transform.length === 0) delete arc.transform;
            }
        } else if (colour?.field) {
            shared.order = { field: colour.field, type: colour.type ?? 'nominal', sort: 'ascending' };
        }
        host.encoding = shared;
        delete labelEncoding.theta;
    }

    // Inside placement has one legibility exception: a mark shorter than its
    // own label cannot hold it, so that label moves outside. Outside placement
    // is chart-wide and never flips only the longest mark inward.
    // Vega-Lite has no conditional `align`, so this is two layers with
    // complementary filters.
    const flipInk = (within: boolean): string | undefined => {
        if (d.dataLabels.inkMode === 'matchSeries' && enc.color?.field) return undefined;
        if (!within) return t.color ?? d.text.primary;
        const seriesInk = d.series.mode === 'single' ? d.series.single : d.series.categorical[0] ?? d.series.single;
        return readableOn(seriesInk, d.text.inverse, d.text.primary);
    };
    // A label moved past its bar's end sits on the plot, not on the bar: it takes the label ink where
    // that reads on the plot (a house's white inside ink does not), and drops the per-series ink.
    const plotSurface = d.surface.plot ?? d.surface.canvas;
    const onPlot = (ink: string) => (contrastRatio(ink, plotSurface) >= 3 ? ink : readableOn(plotSurface, d.text.inverse, d.text.primary));
    const split = (threshold: number, comparison: '<' | '>', message: string) => {
        const v = `abs(datum[${JSON.stringify(measure.field)}])`;
        const flipped = !inside;
        layer.transform = [...(anchorTransform ? [anchorTransform] : []), { filter: `${v} ${comparison === '<' ? '>=' : '<='} ${threshold}` }];
        const { color: insideInk, ...rest } = labelEncoding;
        const keepsSeriesInk = d.dataLabels.inkMode === 'matchSeries' && insideInk?.field;
        const movedEncoding = { ...rest, ...(keepsSeriesInk ? { color: insideInk } : {}), [measureChannel]: valueAt };
        const movedInk = flipped ? flipInk(true) : onPlot(flipInk(false) ?? d.text.primary);
        const other: any = withInteractionTextLabel({
            __themeSynthetic: true,
            transform: [{ filter: `${v} ${comparison} ${threshold}` }],
            mark: { ...markDef, ...geometry(flipped), ...(keepsSeriesInk ? {} : { color: movedInk }) },
            encoding: movedEncoding,
        }, { presentation: flipped ? 'on-mark' : 'independent' });
        if (other.mark.color === undefined) delete other.mark.color;
        appendLayer(body, other);
        say('dataLabels.placement', 'value-labels-placement-changed', message);
    };

    // A stacked segment is exempt: "outside" a segment is the top of the
    // stack, a different quantity. Segments too short for their number drop it
    // instead, which the keep test above already arranges.
    if (!radial && !cells && !stackedSegments && onMarkBody) {
        // The plan measured each label against the drawn axis; without its fit, grounding's estimate.
        const minValue = planned.insideFit ? planned.insideFit.minValue : d.dataLabels.insideMinValue;
        if (inside && minValue != null) {
            split(minValue, '<', 'marks shorter than their own label print it outside instead');
            // What the moved labels run past the plot's edge, measured by the plan; without its fit,
            // two lines of text.
            const over = planned.insideFit ? planned.insideFit.overflow : { end: (t.fontSize ?? 10) * 2 };
            const flip = (side: 'left' | 'right' | 'top' | 'bottom') => (reversed ? ({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const)[side] : side);
            if (over?.end) growPadding(spec, flip(horizontal ? 'right' : 'top'), over.end);
            if (over?.start) growPadding(spec, flip(horizontal ? 'left' : 'bottom'), over.start);
        }
    }

    // Outside labels sit past the end of the mark, so the plot needs room —
    // to the side the bar grows toward. A horizontal bar's label sits past its
    // right end, in clean margin the padding reserves. A vertical bar's sits
    // above its top, where the title already is, so reserving outer padding
    // does not clear it; instead the measure scale is given headroom so the
    // tallest bar stops short of the plot ceiling and its label lands in
    // whitespace inside the plot.
    if (!inside && planned.form === 'ends') {
        if (horizontal) {
            let reserved = false;
            if (onMarkBody) {
                const inset = (planned.inset ?? 0) + radius;
                const host = body.spec?.layer ? body.spec : body;
                // The plot's planned width; with none stated, the continuous width the plan wrote.
                const stated = host.width ?? spec.width;
                const plotWidth = typeof stated === 'number' ? stated : stated == null ? spec.config?.view?.continuousWidth : undefined;
                const encodings = [host, ...(host.layer ?? [])]
                    .map(node => node.encoding?.x).filter(encoding => encoding?.field === measure.field);
                if (typeof plotWidth === 'number' && plotWidth > inset * (hasNegative ? 2 : 1)
                    && encodings.length && encodings.every(encoding => encoding.scale?.range == null
                        && encoding.scale?.rangeMin == null && encoding.scale?.rangeMax == null)) {
                    for (const encoding of encodings) {
                        encoding.scale = {
                            ...(encoding.scale ?? {}),
                            rangeMin: reversed || hasNegative ? inset : 0,
                            rangeMax: !reversed || hasNegative ? plotWidth - inset : plotWidth,
                        };
                    }
                    reserved = true;
                }
            }
            if (!reserved) growPadding(spec, reversed ? 'left' : 'right', planned.inset ?? (t.fontSize ?? 10) * 3);
        } else if (onMarkBody) {
            if (planned.headroom) addMeasureHeadroom(body, measureChannel, measure.field, planned.headroom);
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
    // A facet operator draws its spec in every panel; the layer joins that spec.
    if (body.facet && body.spec) { appendLayer(body.spec, layer); return; }
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

function readableOn(background: string, light: string, dark: string, min = 3): string {
    // `light` and `dark` are the theme's two ink candidates. Which one reads on
    // a surface is a fact about their contrast with it, not about which the
    // theme calls primary — a dark house's "primary" ink is itself light, so a
    // fixed light/dark mapping inverts on it. Pick whichever candidate sits
    // furthest from the background in luminance; fall back to the first when a
    // colour will not parse.
    // Contrast is a ratio of luminances, not a difference: on a mid-tone orange the white sits at
    // 3:1 and the black at 7:1, though their luminance gaps say the opposite. The ink the house
    // has always drawn (the larger luminance gap) stands wherever it still reads at 3:1; only a
    // label that fails takes whichever ink contrasts more.
    const bg = parseColor(background);
    if (!bg) return light;
    const lightC = parseColor(light);
    const darkC = parseColor(dark);
    if (!lightC || !darkC) return luminance(bg) < 0.5 ? light : dark;
    const bgLum = luminance(bg);
    const usual = Math.abs(luminance(lightC) - bgLum) >= Math.abs(luminance(darkC) - bgLum) ? light : dark;
    if (contrastRatio(usual, background) >= min) return usual;
    return contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
}

const FILLED_MARKS = new Set(['bar', 'rect', 'arc', 'area', 'point', 'circle', 'square']);

/**
 * A series ink too faint to see against the plot (grounding's `visibility`): a line drawn in it
 * takes a darker shade of its hue; a filled mark keeps the house colour and gains a 1px edge in a
 * darker shade. A mark the house already strokes (separators, outlines) is left as drawn.
 */
/** `rgba()` of a colour at an alpha. */
function rgba(colour: string, alpha: number): string {
    const c = parseColor(colour);
    if (!c) return colour;
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(alpha.toFixed(3))})`;
}

/** A linear gradient from `ink` at `top` alpha (the value end) to clear (the baseline). */
function fadeGradient(ink: string, top: number, measure: 'x' | 'y'): any {
    const [x1, y1, x2, y2] = measure === 'y' ? [0, 0, 0, 1] : [1, 0, 0, 0];
    return { gradient: 'linear', x1, y1, x2, y2, stops: [{ offset: 0, color: rgba(ink, top) }, { offset: 1, color: rgba(ink, 0) }] };
}

/** The axis a filled mark measures along: the quantitative one, `y` when both are. */
function measureAxis(enc: any): 'x' | 'y' | undefined {
    if (enc?.y?.type === 'quantitative' && !(enc?.x?.type === 'quantitative' && enc?.y?.type !== 'quantitative')) return 'y';
    if (enc?.x?.type === 'quantitative') return 'x';
    return undefined;
}

/**
 * A fill per series: one gradient when the mark has one ink, else a gradient per value of the
 * colour field, matched by a condition — a colour scale cannot carry gradients.
 */
function seriesFill(colour: any, ink: string, rows: any[], paint: (ink: string) => any): any | undefined {
    if (!colour?.field) return { value: paint(ink) };
    const domain = discreteDomain(colour, rows);
    const range: string[] | undefined = Array.isArray(colour.scale?.range) ? colour.scale.range : undefined;
    if (!domain?.length || !range?.length) return undefined;
    const field = JSON.stringify(colour.field);
    return {
        condition: domain.map((v, i) => ({ test: `datum[${field}] === ${JSON.stringify(v)}`, value: paint(range[i % range.length]) })),
        value: paint(range[0]),
    };
}

/**
 * Gradient fills a house asks for (R12): areas that fade to their baseline, and a wash under each
 * line in its own ink. A stack keeps solid bands — each sits on the next, and a fade would melt one
 * into the other. A wash goes only under a line that reads a quantity along its axis in order — not
 * a path drawn in an order of its own (connected scatter, radar), and not a line drawn over bars,
 * dots or an area, where it is a trend, an edge or a second measure.
 */
function applyGradientFills(spec: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    const g = d.marks.gradient;
    if (!g) return;
    const rowsOf = (node: any) => (Array.isArray(node.data?.values) ? node.data.values : Array.isArray(spec.data?.values) ? spec.data.values : table);
    const inkOf = (node: any) => {
        const mark = normalizeMark(node.mark);
        return (typeof mark.color === 'string' && mark.color) || (typeof mark.fill === 'string' && mark.fill)
            || (typeof node.encoding?.color?.value === 'string' && node.encoding.color.value) || d.series.single;
    };
    const colourOf = (enc: any) => (enc?.color?.field ? enc.color : enc?.fill?.field ? enc.fill : enc?.stroke?.field ? enc.stroke : undefined);

    if (g.area === 'fade') {
        let saidStacked = false;
        walk(spec, (node) => {
            if (node.__themeSynthetic || markTypeOf(node.mark) !== 'area') return;
            const enc = node.encoding ?? {};
            const measure = measureAxis(enc);
            if (!measure) return;
            const colour = colourOf(enc);
            const stack = enc[measure]?.stack;
            if (colour && stack !== null && stack !== false) {
                if (!saidStacked) say('geometry.area.fill', 'area-fade-not-applied', 'the areas are stacked — each band sits on the next, so they keep a solid fill');
                saidStacked = true;
                return;
            }
            const top = d.marks.fillOpacity ?? 0.7;
            const fill = seriesFill(colour, inkOf(node), rowsOf(node), (ink) => fadeGradient(ink, top, measure));
            if (!fill) return;
            node.encoding = { ...enc, fill };
            node.mark = { ...normalizeMark(node.mark), fillOpacity: 1 };
        });
    }

    const wash = g.lineWash;
    if (!wash) return;
    const FILLED = new Set(['area', 'bar', 'rect', 'point', 'circle', 'square', 'arc']);
    const washable = (node: any, siblings: any[]) => {
        if (node.__themeSynthetic || markTypeOf(node.mark) !== 'line') return false;
        const enc = node.encoding ?? {};
        const mark = normalizeMark(node.mark);
        if (enc.order || enc.theta || enc.radius || String(mark.interpolate ?? '').includes('closed')) return false;
        if (measureAxis(enc) !== 'y' || !enc.x?.field || enc.y?.scale?.reverse) return false;
        return !siblings.some((s) => s !== node && !s.__themeSynthetic && FILLED.has(markTypeOf(s.mark) ?? ''));
    };
    const washOf = (line: any) => {
        const enc = line.encoding;
        const lineMark = normalizeMark(line.mark);
        const colour = colourOf(enc);
        // No colour channel of its own: the wash would share the line's colour scale, and with it the
        // key. It groups by series through \`detail\` and paints each series by a condition.
        const encoding: any = { x: enc.x, y: { ...enc.y, stack: null }, tooltip: null };
        const details = [...(Array.isArray(enc.detail) ? enc.detail : enc.detail ? [enc.detail] : []),
            ...(colour ? [{ field: colour.field, type: colour.type ?? 'nominal' }] : [])];
        if (details.length) encoding.detail = details.length === 1 ? details[0] : details;
        const paint = wash.style === 'tint'
            ? (ink: string) => rgba(ink, wash.opacity)
            : (ink: string) => fadeGradient(ink, wash.opacity, 'y');
        const fill = seriesFill(colour, inkOf(line), rowsOf(line), paint);
        if (!fill) return undefined;
        encoding.fill = fill;
        const mark: any = { type: 'area', interactive: false, line: false, point: false, strokeWidth: 0, fillOpacity: 1 };
        if (lineMark.interpolate) mark.interpolate = lineMark.interpolate;
        const node: any = { __themeSynthetic: true, __themeRole: 'line-wash', mark, encoding };
        if (line.data) node.data = line.data;
        if (line.transform) node.transform = line.transform;
        return node;
    };
    let washed = 0;
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.layer)) {
            for (let i = 0; i < node.layer.length; i++) {
                const child = node.layer[i];
                if (washable(child, node.layer)) {
                    const w = washOf(child);
                    if (w) { node.layer.splice(i, 0, w); i++; washed++; }
                } else visit(child);
            }
            return;
        }
        for (const key of ['vconcat', 'hconcat', 'concat'] as const) for (const child of node[key] ?? []) visit(child);
        if (node.spec) { visit(node.spec); return; }
        if (washable(node, [node])) {
            const w = washOf(node);
            if (!w) return;
            appendLayer(node, w);
            const layers = node.layer ?? node.spec?.layer;
            if (Array.isArray(layers)) layers.unshift(layers.pop());
            washed++;
        }
    };
    visit(spec);
    if (washed) say('geometry.line.wash', 'line-washed', `each line carries a ${wash.style} of its own ink down to the baseline`);
}

/**
 * The case each role asks for (T3), on the text Flint writes and the labels the renderer draws.
 * Titles were cased where they were planned and fitted; the strings left on the spec (a headline
 * that fitted on one line, an author's deck) are cased here. Axis and header labels are cased by an
 * expression over the label, title case looking each value up.
 */
function applyTypeCase(spec: any, config: any, d: DesignDecisions, table: any[], say: ReportDeparture): void {
    const head = d.title.headline.textCase;
    const deck = d.title.deck.textCase;
    const caseText = (text: unknown, textCase: typeof head): unknown => (Array.isArray(text)
        ? text.map((line) => (typeof line === 'string' ? applyTextCase(line, textCase) : line))
        : typeof text === 'string' ? applyTextCase(text, textCase) : text);
    if (typeof spec.title === 'string' && head) spec.title = caseText(spec.title, head);
    else if (spec.title && typeof spec.title === 'object') {
        if (head) spec.title.text = caseText(spec.title.text, head);
        if (deck && spec.title.subtitle !== undefined) spec.title.subtitle = caseText(spec.title.subtitle, deck);
    }

    const valuesOf = (field: string) => [...new Set(table.map((row) => row?.[field]).filter((v) => v != null).map(String))];
    walk(spec, (node) => {
        for (const channel of ['x', 'y'] as const) {
            const enc = node.encoding?.[channel];
            const textCase = d.axes[channel]?.label.textCase;
            if (!textCase || !enc?.field || enc.axis === null || enc.type === 'quantitative') continue;
            // The layout's own expression (wrapped or thinned names) sits in the axis config, which this outranks.
            const labelExpr = caseLabelExpr(enc.axis?.labelExpr ?? config[`axis${channel.toUpperCase()}`]?.labelExpr, textCase, valuesOf(enc.field));
            if (labelExpr) enc.axis = { ...(enc.axis ?? {}), labelExpr };
        }
    });
    const header = d.facets.header.textCase;
    if (header && config.header) config.header.labelExpr = textCaseExpr('datum.label', header);
    if (d.dataLabels.text.textCase) {
        say('type.valueLabel.case', 'case-not-applied', 'value labels print numbers, which have no case — the role’s case is not used');
    }
}

/**
 * The display role (T4) on the text a template marks as a display figure — a KPI's big number: the
 * house's family, weight, slope and ink. Its size stays the one the template fitted to the tile.
 */
function applyDisplayType(spec: any, d: DesignDecisions): void {
    const t = d.display;
    if (!t) return;
    walk(spec, (node) => {
        if (node.__textRole !== 'display' || markTypeOf(node.mark) !== 'text') return;
        const mark = normalizeMark(node.mark);
        if (t.font) mark.font = t.font;
        if (t.fontWeight != null) mark.fontWeight = t.fontWeight;
        if (t.fontStyle) mark.fontStyle = t.fontStyle;
        if (t.color) { mark.fill = t.color; delete mark.color; }
        node.mark = mark;
    });
}

/** The layers a Table's static grid tags (`__tableRole`), in the table roles of the design: headings, cells and rules. */
function applyTableStyle(spec: any, d: DesignDecisions): void {
    walk(spec, (node) => {
        const role = node.__tableRole;
        if (!role) return;
        const mark = normalizeMark(node.mark);
        if (role === 'rule' || role === 'header-rule') {
            mark.stroke = role === 'rule' ? d.table.rule : d.table.headerRule;
        } else {
            const t = role === 'header' ? d.table.header : d.table.cell;
            if (t.font ?? d.font) mark.font = t.font ?? d.font;
            if (t.fontSize) mark.fontSize = Math.max(11, t.fontSize);
            if (t.fontWeight != null) mark.fontWeight = t.fontWeight;
            if (t.fontStyle) mark.fontStyle = t.fontStyle;
            mark.fill = t.color ?? (role === 'header' ? d.text.secondary : d.text.primary);
            delete mark.color;
        }
        delete node.__tableRole;
        node.mark = mark;
    });
}

const TEXTURED_MARKS = new Set(['bar', 'arc', 'area']);

/** A short stable hash, for pattern ids drawn from their content. */
function shortHash(text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/**
 * The texture channel (R13): a pattern fill on every filled mark of a series, so series differ in
 * mono print and for a reader who cannot tell the inks apart. Series take the house's patterns in
 * palette order (`solid` leaves a flat fill), in lines a darker shade of its ink (or white), outlined in
 * that shade. The colour scale's own order is kept: the fill scale lists a pattern for each ink, in
 * the same place. The patterns travel with the chart and are written into the SVG's defs.
 */
function applyTextures(spec: any, d: DesignDecisions): void {
    const t = d.marks.redundant.texture;
    if (!t || !t.patterns.length) return;
    const patterns = new Map<string, CanvasPattern>();
    const darker = (ink: string) => mixHex(ink, '#000000', 0.38, ink);
    const patternFor = (ink: string, index: number): string => {
        const kind = t.patterns[index % t.patterns.length];
        if (kind === 'solid') return ink;
        const line = t.ink === 'white' ? 'rgba(255,255,255,0.75)' : darker(ink);
        const id = `flint-tex-${shortHash(`${kind}|${ink}|${line}|${t.spacing}`)}`;
        patterns.set(id, { id, kind, background: ink, line, spacing: t.spacing });
        return `url(#${id})`;
    };
    // A stroke the house draws in another ink (a separator, a slice gap in the surface colour) is
    // kept; the ink outline becomes the darker shade of each series.
    const outline = d.marks.outline?.color?.toLowerCase();
    const keepsStroke = (stroke: unknown) => typeof stroke === 'string' && stroke.toLowerCase() !== outline;
    walk(spec, (node) => {
        // A colour shared by layers (a pie's wedges and their labels) moves into each layer that
        // has none, so a filled layer can take the patterns and the others keep the inks.
        const shared = node.encoding?.color;
        if (!Array.isArray(node.layer) || !shared?.field) return;
        const lacks = (c: any) => !c.encoding?.color && !c.encoding?.fill;
        if (!node.layer.some((c: any) => lacks(c) && TEXTURED_MARKS.has(markTypeOf(c.mark) ?? '') && !c.__themeSynthetic)) return;
        for (const child of node.layer) if (lacks(child)) child.encoding = { ...(child.encoding ?? {}), color: shared };
        const { color: _shared, ...rest } = node.encoding;
        void _shared;
        node.encoding = rest;
    });
    walk(spec, (node) => {
        const mark = markTypeOf(node.mark);
        if (!mark || node.__themeSynthetic || !TEXTURED_MARKS.has(mark)) return;
        const enc = node.encoding ?? {};
        const colour = enc.color?.field ? enc.color : enc.fill?.field ? enc.fill : undefined;
        if (colour) {
            const range = colour.scale?.range;
            if (colour.type === 'quantitative' || colour.type === 'temporal' || !Array.isArray(range) || !range.every((c: unknown) => typeof c === 'string')) return;
            const fill = { ...colour, scale: { ...colour.scale, range: range.map((ink: string, i: number) => patternFor(ink, i)) } };
            const { color: _color, ...rest } = enc;
            void _color;
            const m = normalizeMark(node.mark);
            if (keepsStroke(m.stroke) || enc.stroke) {
                node.encoding = { ...rest, fill };
                return;
            }
            const stroke = { ...colour, scale: { ...colour.scale, range: range.map((ink: string) => darker(ink)) } };
            node.encoding = { ...rest, fill, stroke };
            const { stroke: _outline, ...unstroked } = m;
            void _outline;
            node.mark = { ...unstroked, strokeWidth: m.strokeWidth ?? 1 };
            return;
        }
        // One ink: a mark whose colour is not a field. A colour the mark sets by condition (signed
        // bars by status) is a choice per bar, and is left as it is.
        if (enc.color || enc.fill) return;
        const m = normalizeMark(node.mark);
        const ink = typeof m.fill === 'string' ? m.fill : typeof m.color === 'string' ? m.color : d.series.single;
        if (!ink || ink.startsWith('url(') || t.patterns[0] === 'solid') return;
        node.mark = { ...m, fill: patternFor(ink, 0), stroke: keepsStroke(m.stroke) ? m.stroke : darker(ink), strokeWidth: m.strokeWidth ?? 1 };
    });
    if (patterns.size) spec.usermeta = { ...(spec.usermeta ?? {}), [CANVAS_PATTERNS_KEY]: [...patterns.values()] };
}

/**
 * The house's wedge rules (M4): the order wedges run in (the data's, or largest first), where the
 * first starts, and the hole as a share of the radius. The order is stated wherever the arc's
 * colour is (the arc, or the parent its labels share it with), so the wedges, their labels and
 * the key all read it; a chart that sorts its own slices keeps its sort.
 */
function applyArcRules(spec: any, d: DesignDecisions, table: any[]): void {
    const rules = d.marks.arc;
    if (!rules) return;
    const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        const layers: any[] = node.layer ?? [];
        const arc = markTypeOf(node.mark) === 'arc' ? node : layers.find((l) => markTypeOf(l.mark) === 'arc');
        if (arc) {
            const host = arc.encoding?.color?.field ? arc : node.encoding?.color?.field ? node : arc;
            const colour = host.encoding?.color;
            const theta = arc.encoding?.theta ?? node.encoding?.theta;
            const owned = host.encoding?.order ?? arc.encoding?.order;
            // A chart that sorts its own slices keeps its sort; the template's data order is not a sort.
            const sortsItself = owned?.type === 'quantitative' && owned.field !== '__flintArcOrder';
            if (rules.order && colour?.field && !sortsItself) {
                const field = colour.field as string;
                let names: string[];
                if (rules.order === 'largestFirst' && theta?.field) {
                    const totals = new Map<string, number>();
                    for (const row of table) {
                        const k = String(row?.[field]);
                        const v = row?.[theta.field];
                        if (typeof v === 'number') totals.set(k, (totals.get(k) ?? 0) + Math.abs(v));
                    }
                    names = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
                } else {
                    names = Array.isArray(colour.scale?.domain) ? colour.scale.domain.map(String)
                        : [...new Set(table.map((row) => String(row?.[field])))];
                }
                const index = `indexof(${JSON.stringify(names)}, toString(datum[${JSON.stringify(field)}]))`;
                const target = host === arc ? arc : node;
                // The template already runs the wedges in this order (M3): nothing to rewrite.
                const same = [arc, node].some((n) => (n.transform ?? []).some((t: any) => t?.as === '__flintArcOrder' && t.calculate === index));
                if (!same) {
                    for (const n of [arc, node]) if (n.transform) n.transform = n.transform.filter((t: any) => t?.as !== '__flintArcOrder');
                    target.transform = [...(target.transform ?? []), { calculate: index, as: '__flintArcOrder' }];
                    target.encoding = { ...target.encoding, order: { field: '__flintArcOrder', type: 'quantitative', sort: 'ascending' } };
                    if (host !== arc && arc.encoding?.order) delete arc.encoding.order;
                    // The key follows the wedges.
                    if (rules.order === 'largestFirst') host.encoding.color = { ...colour, scale: { ...(colour.scale ?? {}), domain: names } };
                }
            }
            if (typeof rules.startAngle === 'number' && rules.startAngle !== 0) {
                const start = (rules.startAngle * Math.PI) / 180;
                for (const n of [arc, ...layers.filter((l) => l !== arc && markTypeOf(l.mark) === 'text')]) {
                    if (markTypeOf(n.mark) !== 'arc' && !n.encoding?.theta && !node.encoding?.theta) continue;
                    const mark = normalizeMark(n.mark);
                    n.mark = { ...mark, theta: undefined };
                    delete n.mark.theta;
                    const scaleHost = n.encoding?.theta ? n : node;
                    if (scaleHost.encoding?.theta) {
                        scaleHost.encoding.theta = { ...scaleHost.encoding.theta, scale: { ...(scaleHost.encoding.theta.scale ?? {}), range: [start, start + 2 * Math.PI] } };
                    }
                }
            }
            if (typeof rules.hole === 'number') {
                const mark = normalizeMark(arc.mark);
                const outer = typeof mark.outerRadius === 'number' ? mark.outerRadius : undefined;
                if (outer) arc.mark = { ...mark, innerRadius: rules.hole > 0 ? Math.round(outer * rules.hole) : 0 };
            }
        }
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) if (Array.isArray(node[key]) && !arc) node[key].forEach(visit);
        if (node.spec) visit(node.spec);
    };
    visit(spec);
}

/**
 * A bar too short to see (M6): a non-zero value whose bar is under the house's least length gets a
 * stub that long at the baseline, drawn as a second bar layer from zero with a pixel offset — the
 * value's own bar stays where it is, so a stacked or labelled chart is unchanged. A simple bar
 * only: a stack's segments sit on one another, and a stub would lie across its neighbour.
 */
function applyBarMinLength(spec: any, min: number, table: any[], plotWidth: number, plotHeight: number): void {
    for (const body of plotBodies(spec)) {
        const units = body.layer ?? [body];
        const added: any[] = [];
        for (const node of units) {
            if (markTypeOf(node.mark) !== 'bar' || node.__themeSynthetic || isLiteralMark(node)) continue;
            const enc = mergedEncoding(node, body.layer ? body.encoding : undefined);
            const measure = enc.y?.type === 'quantitative' ? 'y' : enc.x?.type === 'quantitative' ? 'x' : undefined;
            if (!measure || enc[`${measure}2`] || !enc[measure]?.field || enc[measure].aggregate) continue;
            if (enc[measure].stack != null && enc[measure].stack !== false) continue;
            if (enc.color?.field && !enc.xOffset && !enc.yOffset) continue;
            const field = enc[measure].field as string;
            // The span the bars are drawn over: the stated domain, else the data's extent from zero.
            const scale = enc[measure].scale ?? {};
            const values = table.map((row) => row?.[field]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            const lo = scale.domainMin ?? Math.min(0, ...values);
            const hi = scale.domainMax ?? Math.max(0, ...values);
            const length = measure === 'y' ? plotHeight : plotWidth;
            if (!(hi > lo) || !(length > 0)) continue;
            const threshold = (min / length) * (hi - lo);
            if (!values.some((v) => v !== 0 && Math.abs(v) < threshold)) continue;
            const v = `datum[${JSON.stringify(field)}]`;
            const offset = measure === 'y' ? `${v} < 0 ? ${min} : ${-min}` : `${v} < 0 ? ${-min} : ${min}`;
            const { [measure]: _m, ...others } = node.encoding ?? {};
            void _m;
            added.push({
                __themeSynthetic: true,
                transform: [{ filter: `${v} != 0 && abs(${v}) < ${threshold}` }, { calculate: '0', as: '__flintStubZero' }],
                mark: { ...normalizeMark(node.mark), [`${measure}2Offset`]: { expr: offset }, cornerRadiusEnd: 0 },
                encoding: {
                    ...others,
                    [measure]: { field: '__flintStubZero', type: 'quantitative' },
                    [`${measure}2`]: { field: '__flintStubZero' },
                },
            });
        }
        for (const layer of added) appendLayer(body, layer);
    }
}

/**
 * An outline in each bar's own series ink (M2), drawn once the inks are final: a bar coloured by a
 * field takes a stroke scale mirroring its colour scale (no key of its own); a bar in one ink takes
 * that ink. A layered bar reads the colour its parent states.
 */
function applySeriesOutlines(spec: any, d: DesignDecisions): void {
    if (!d.marks.outline?.series) return;
    const visit = (node: any, from: any) => {
        if (!node || typeof node !== 'object') return;
        const seen = mergedEncoding(node, from);
        if (node.__seriesOutline) {
            delete node.__seriesOutline;
            const colour = seen.color?.field ? seen.color : undefined;
            const range = colour?.scale?.range;
            if (colour && Array.isArray(range) && range.every((c: unknown) => typeof c === 'string' && !c.startsWith('url('))) {
                node.encoding = {
                    ...(node.encoding ?? {}),
                    stroke: {
                        field: colour.field, type: colour.type ?? 'nominal',
                        ...(colour.sort !== undefined ? { sort: colour.sort } : {}),
                        scale: { ...(colour.scale.domain ? { domain: colour.scale.domain } : {}), range },
                        legend: null,
                    },
                };
            } else if (!colour && !seen.fill && !seen.stroke) {
                const mark = normalizeMark(node.mark);
                const ink = typeof mark.color === 'string' ? mark.color : typeof mark.fill === 'string' && !mark.fill.startsWith('url(') ? mark.fill : d.series.single;
                if (ink) node.mark = { ...mark, stroke: ink };
            }
        }
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) if (Array.isArray(node[key])) node[key].forEach((c: any) => visit(c, seen));
        if (node.spec) visit(node.spec, seen);
    };
    visit(spec, undefined);
}

function applyVisibleInks(spec: any, d: DesignDecisions, say: ReportDeparture): void {
    const v = d.series.visibility;
    if (!v) return;
    const strokeOf = (c: unknown) => (typeof c === 'string' ? v.stroke[c.toLowerCase()] : undefined);
    const outlineOf = (c: unknown) => (typeof c === 'string' ? v.outline[c.toLowerCase()] : undefined);
    const darkened = new Set<string>();
    const edged = new Set<string>();
    walk(spec, (node) => {
        const type = markTypeOf(node.mark);
        if (!type || node.__themeSynthetic || node.__themeRole) return;
        const mark = normalizeMark(node.mark);
        const enc = node.encoding?.color;
        const range: unknown = enc?.scale?.range;
        if (LINE_MARKS.has(type)) {
            if (enc?.field && Array.isArray(range)) {
                const next = range.map((c) => strokeOf(c) ?? c);
                if (next.some((c, i) => c !== range[i])) {
                    range.forEach((c, i) => { if (next[i] !== c) darkened.add(String(c)); });
                    node.encoding = { ...node.encoding, color: { ...enc, scale: { ...enc.scale, range: next } } };
                }
            } else if (!enc && strokeOf(mark.color)) {
                darkened.add(mark.color);
                node.mark = { ...mark, color: strokeOf(mark.color) };
            }
            return;
        }
        if (!FILLED_MARKS.has(type)) return;
        if (mark.stroke != null || node.encoding?.stroke || mark.filled === false) return;
        if (enc?.field && Array.isArray(range)) {
            if (!range.some((c) => outlineOf(c))) return;
            range.forEach((c) => { if (outlineOf(c)) edged.add(String(c)); });
            node.encoding = {
                ...node.encoding,
                stroke: {
                    field: enc.field,
                    type: enc.type ?? 'nominal',
                    ...(enc.sort !== undefined ? { sort: enc.sort } : {}),
                    scale: { ...(enc.scale.domain ? { domain: enc.scale.domain } : {}), range: range.map((c) => outlineOf(c) ?? c) },
                    legend: null,
                },
            };
            node.mark = { ...mark, strokeWidth: mark.strokeWidth ?? 1 };
        } else if (!enc && outlineOf(mark.color)) {
            edged.add(mark.color);
            node.mark = { ...mark, stroke: outlineOf(mark.color), strokeWidth: mark.strokeWidth ?? 1 };
        }
    });
    if (darkened.size) {
        say('ink.series.minContrast', 'faint-ink-darkened',
            `lines in ${[...darkened].join(', ')} were too faint against the plot and are drawn in a darker shade of the same hue`);
    }
    if (edged.size) {
        say('ink.series.minContrast', 'faint-ink-edged',
            `filled marks in ${[...edged].join(', ')} were too faint against the plot and gain a 1px edge in a darker shade`);
    }
}

/**
 * Text written in a series' own colour — a name at a line's end, a value matched to its series —
 * must still read against the plot. Each series ink that fails 3:1 there takes the house's text
 * variant for it, or the same hue darkened until it reads. The text layer gets its own colour
 * scale, so the marks keep the house's inks. Only ranges made of the house's series inks are
 * touched: per-mark label inks (white or black chosen against each fill) are already decided.
 */
function applyReadableSeriesText(spec: any, d: DesignDecisions, say: ReportDeparture): void {
    const surface = d.surface.plot ?? d.surface.canvas;
    const series = d.series;
    const own = new Set([...series.categorical, series.single, ...(series.overflow ? [series.overflow] : []),
        ...Object.values(series.visibility?.stroke ?? {}), ...Object.values(series.byValue ?? {})].map((c) => c.toLowerCase()));
    const variants = new Map<string, string>();
    series.categorical.forEach((ink, i) => {
        const text = series.categoricalText?.[i];
        if (text) variants.set(ink.toLowerCase(), text);
    });
    const changed = new Map<string, string>();
    const visit = (node: any, parent: any) => {
        if (!node || typeof node !== 'object') return;
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat'] as const) {
            if (Array.isArray(node[key])) for (const child of node[key]) visit(child, node);
        }
        if (node.spec) visit(node.spec, node);
        if (!node.__themeSynthetic || markTypeOf(node.mark) !== 'text') return;
        const enc = node.encoding?.color;
        const range: unknown = enc?.scale?.range;
        if (!enc?.field || !Array.isArray(range) || !range.length) return;
        if (!range.every((c) => typeof c === 'string' && own.has(c.toLowerCase()))) return;
        const next = (range as string[]).map((ink) => variants.get(ink.toLowerCase()) ?? readableTextInk(ink, surface, 3));
        if (next.every((ink, i) => ink === range[i])) return;
        next.forEach((ink, i) => { if (ink !== range[i]) changed.set(range[i] as string, ink); });
        node.encoding = { ...node.encoding, color: { ...enc, scale: { ...enc.scale, range: next } } };
        if (parent && Array.isArray(parent.layer) && parent.layer.includes(node)) {
            parent.resolve = { ...(parent.resolve ?? {}), scale: { ...(parent.resolve?.scale ?? {}), color: 'independent' } };
        }
    };
    visit(spec, undefined);
    if (changed.size) {
        say('ink.series.categoricalText', 'text-ink-darkened',
            `series inks too light to read as text on ${surface} were written in a darker shade of the same hue: ${[...changed].map(([a, b]) => `${a} → ${b}`).join(', ')}`);
    }
}

function growPadding(spec: any, side: 'left' | 'right' | 'top' | 'bottom', amount: number): void {
    const base = typeof spec.padding === 'number'
        ? { left: spec.padding, right: spec.padding, top: spec.padding, bottom: spec.padding }
        : { left: 8, right: 8, top: 8, bottom: 8, ...(spec.padding ?? {}) };
    base[side] = (base[side] ?? 8) + Math.round(amount);
    spec.padding = base;
}

/**
 * Write the headroom the plan gives labels above (or below) bar ends to each
 * encoding of the measure whose scale leaves that end free.
 */
function addMeasureHeadroom(
    body: any, channel: 'x' | 'y' | 'theta' | 'color', field: string, headroom: { min?: number; max?: number },
): void {
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
    // The layers share one scale: an end any of them states, or an explicit domain, is not free.
    const stated = (end: 'domainMin' | 'domainMax') => encodings.some((e) => e.scale?.domain != null || e.scale?.[end] != null);
    const max = headroom.max !== undefined && !stated('domainMax') ? headroom.max : undefined;
    const min = headroom.min !== undefined && !stated('domainMin') ? headroom.min : undefined;
    for (const encChannel of encodings) {
        if (max === undefined && min === undefined) break;
        encChannel.scale = { ...(encChannel.scale ?? {}), ...(max !== undefined ? { domainMax: max } : {}), ...(min !== undefined ? { domainMin: min } : {}) };
    }
}

// ---------------------------------------------------------------------------
// seriesEnd — the second thing Vega-Lite has no primitive for
// ---------------------------------------------------------------------------

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
    say: ReportDeparture,
    layout?: SeriesEndLayout,
    secondaryEdge?: 'bottom',
    ownNames?: boolean,
): void {
    if (d.legend.placement !== 'seriesEnd' && d.legend.placement !== 'inline') return;
    if (!d.legend.show) return;

    const body = plotBody(spec);
    if (ownNames) {
        say('legend.placement', 'series-end-not-drawn', 'the chart already prints its own end labels — no second set drawn');
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
        say('legend.placement', 'series-end-not-drawn', '`seriesEnd` needs a line mark — no legend drawn');
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
        say('legend.placement', 'series-end-not-drawn', '`seriesEnd` needs a series field on a positional line — no legend drawn');
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
    const printsEndValues = Boolean(valueLayer) && valueLayer.encoding?.text?.field === value.field;
    const merged = printsEndValues || d.legend.endValue === true;
    const transform: any[] = [...rank, { filter: 'datum.__seriesEndRank === 1' }];
    let textField = seriesField;
    if (merged) {
        const v = `datum[${JSON.stringify(value.field)}]`;
        // In the unit the value labels write it in: "AMZN 190%", "Japan $84.5".
        const shown = withUnitExpr(printedNumber(v, d.dataLabels.format, d.dataLabels.compact), d.dataLabels.unit);
        transform.push({
            calculate: `datum[${JSON.stringify(seriesField)}] + ' ' + ${shown}`,
            as: '__seriesEndLabel',
        });
        textField = '__seriesEndLabel';
        // …and the value layer must stop printing the point that is now named.
        if (printsEndValues) valueLayer.transform = [...rank, { filter: 'datum.__seriesEndRank !== 1' }];
    }

    let labelValue = value;
    if (layout?.maxDisplacement && layout.maxDisplacement > 0.5) {
        transform.push(...packEndLabels(value.field, layout));
        labelValue = { ...value, field: '__seriesEndLabelValue' };
    }
    if (t.textCase) {
        const names = [...new Set(table.map((row) => row?.[textField]).filter((v) => v != null).map(String))];
        transform.push({ calculate: textCaseExpr(`toString(datum[${JSON.stringify(textField)}])`, t.textCase, names), as: '__seriesEndName' });
    }

    const labelLayer: any = withInteractionLegendLabel({
        __themeSynthetic: true,
        transform,
        mark: {
            type: 'text',
            align: domainChannel === 'x' ? 'left' : 'center',
            baseline: domainChannel === 'x' ? 'middle' : 'bottom',
            dx: domainChannel === 'x' ? 5 : 0,
            dy: domainChannel === 'x' ? 0 : -5,
            font: t.font,
            fontSize: Math.max(9, (t.fontSize ?? 11) - 1),
            ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
            ...(t.fontStyle ? { fontStyle: t.fontStyle } : {}),
        },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: layout ? { ...stripAxis(labelValue), title: null } : stripAxis(labelValue),
            text: { field: t.textCase ? '__seriesEndName' : textField, type: 'nominal' },
            ...(colourEnc?.field ? { color: { ...colourEnc, legend: null } } : {}),
        },
    }, { channel: 'color', field: seriesField });
    appendLayer(body, labelLayer);

    // The names sit outside the plot rectangle, and no room is reserved for
    // them here: they are ordinary text marks, and Vega's default `pad`
    // autosize already grows the canvas to the scene's own bounds. Estimating
    // the same width a second time only double-counted it — measured at ~124px
    // of dead margin on a three-series line — and the estimate could never
    // agree with the text the renderer actually laid out.

    // Naming the series at the line end frees the corner the colour key used to
    // hold — but a *second* encoding (a forecast dash, a shape) still keeps its
    // own key, and Vega-Lite parks it top-right by default, right where the end
    // labels now are. The two collide into an unreadable pile. The end labels
    // own that edge now, so the surviving key steps down to the foot of the
    // plot, where it has the width to itself.
    if (secondaryEdge) relocateSecondaryLegends(spec, secondaryEdge);
}

/**
 * Keep the names at the line ends a line apart, computed by the chart from the rows it draws rather
 * than fixed at build: rows replaced after the chart is drawn (a re-indexed series) move their names
 * with them. From the top name down, each stands at its own value or a line below the name above,
 * whichever is lower — `min` over the names above of `value + rank × gap`, less its own `rank × gap`.
 * Where the plan has no gap to go by, the positions it packed stand.
 */
function packEndLabels(valueField: string, layout: SeriesEndLayout): any[] {
    const v = `datum[${JSON.stringify(valueField)}]`;
    if (!(layout.gap && layout.gap > 0)) {
        return [{ calculate: `${v}`, as: '__seriesEndLabelValue' }];
    }
    // Top to bottom: largest first, or smallest first on a reversed scale.
    const down = layout.reverse ? 'ascending' : 'descending';
    const step = layout.reverse ? -layout.gap : layout.gap;
    return [
        { window: [{ op: 'row_number', as: '__seriesEndRow' }], sort: [{ field: valueField, order: down }] },
        { calculate: `${v} + (datum.__seriesEndRow - 1) * ${step}`, as: '__seriesEndReach' },
        {
            window: [{ op: layout.reverse ? 'max' : 'min', field: '__seriesEndReach', as: '__seriesEndBound' }],
            sort: [{ field: valueField, order: down }],
            frame: [null, 0],
        },
        { calculate: `datum.__seriesEndBound - (datum.__seriesEndRow - 1) * ${step}`, as: '__seriesEndLabelValue' },
    ];
}

/**
 * When the series are named at the line end, a second, non-colour encoding
 * (`strokeDash` for actual/forecast, `shape`, `size`, `opacity`) still draws a
 * key, and its default corner is the top-right the end labels have just taken.
 * Move each such surviving key to the foot of the plot, clear of the labels.
 * Colour/fill/stroke are the series itself and are already spoken for.
 */
function relocateSecondaryLegends(spec: any, orient: 'bottom' | 'top'): void {
    const channels = ['strokeDash', 'shape', 'size', 'opacity'] as const;
    walk(spec, (node) => {
        if (!node.encoding) return;
        for (const ch of channels) {
            const enc = node.encoding[ch];
            if (enc?.field && enc.legend !== null) {
                enc.legend = { ...(typeof enc.legend === 'object' && enc.legend ? enc.legend : {}), orient };
            }
        }
    });
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
    say: ReportDeparture,
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
    // outside the plot in its own ink instead.
    //
    // `seriesEnd` is a preference for the *inset* position, not a per-series
    // choice, so it is honoured all or nothing. A chart that knocks four names
    // out of their bands and hangs the fifth in the margin reads as a mistake:
    // the two positions carry different ink and sit on different sides of the
    // plot edge, so the odd one out looks like a different kind of label rather
    // than the same label with less room. One band that cannot hold its name is
    // therefore enough to send every name outset, where they line up as a
    // single list and the set stays comparable.
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
    const outside = homeless.length ? order : [];
    const outsideList = JSON.stringify(outside);
    const belongs = (inside: boolean) =>
        `indexof(${outsideList}, datum[${JSON.stringify(seriesField)}] + '') ${inside ? '<' : '>='} 0`;

    const v = `datum[${JSON.stringify(value.field)}]`;
    const shown = printedNumber(v, d.dataLabels.format, d.dataLabels.compact);
    // A normalized stack redraws every band as a share of its column, and the
    // axis is read in per cent. The field still holds what it always held —
    // 9,420 TWh of coal — so printing it beside the name puts a number on the
    // chart that the chart does not draw anywhere.
    //
    // The reading is also dropped once the names are pushed outset. Inset, the
    // name lies on the band at the reading it quotes, so the number annotates
    // something: this band, here, is 4,641. Outset it is a list in the margin —
    // a legend, naming which colour is which — and a legend that quotes numbers
    // is quoting them about a place the reader cannot see. It would also widen
    // the margin by the length of the longest *number* for no reading gained.
    //
    // Either way, the name goes alone.
    const normalized = value.stack === 'normalize';
    const withValue = !normalized && !outside.length;
    const name = withValue
        ? `datum[${JSON.stringify(seriesField)}] + ' ' + ${shown}`
        : `datum[${JSON.stringify(seriesField)}] + ''`;
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
    const endLayer = (inside: boolean): any => withInteractionTextLabel({
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
    }, { fields: [seriesField], presentation: 'independent' });
    // Exactly one of the two layers is drawn: `outside` is now all of the
    // series or none of them, never a subset.
    if (!outside.length) appendLayer(body, endLayer(true));
    if (outside.length) {
        appendLayer(body, endLayer(false));
        // No margin is reserved for these names: `pad` autosize already sizes
        // the canvas to the scene, so reserving it here counted it twice.
        say('legend.placement', 'series-end-moved-outside',
            homeless.length === order.length
                ? 'the bands climb away from their own labels — the names sit outside the plot in series ink, as a list'
                : `${homeless.length === 1 ? 'one band is' : `${homeless.length} bands are`} too thin at the end to hold a name — the inset position is all or nothing, so every name sits outside the plot rather than splitting the set between two positions`);
    }
    // Layers share their scales, so without this the label's colour scale is
    // the band's and the name comes out tinted the colour of the shape it is
    // sitting on. The label keeps the same *domain*, which is what puts it in
    // the right band; only the ink is its own.
    body.resolve = {
        ...(body.resolve ?? {}),
        scale: { ...(body.resolve?.scale ?? {}), color: 'independent' },
    };
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

// ---------------------------------------------------------------------------
// Point emphasis
// ---------------------------------------------------------------------------

/**
 * A dot on a line is a full stop: it says *this* is the value the sentence was
 * building to. Houses differ on where it goes — both ends of the run, the
 * latest reading, the high and the low — but they agree that it goes on a
 * line, and only where the line does not already show every observation.
 */
function applyPointEmphasis(spec: any, d: DesignDecisions, say: ReportDeparture): void {
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
        say('annotation.pointEmphasis', 'point-emphasis-not-drawn',
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
    }
    // Each marker is its series' low or high, or first or last point: that, not the row, is what it
    // is across a change of data, so it moves with its series' new end.
    const series = seriesField ? `datum[${JSON.stringify(seriesField)}] + '|'` : `''`;
    const end = policy.where === 'extremes' ? `(${v} === datum.__peLow ? 'low' : 'high')`
        : policy.where === 'latest' ? `'last'` : `(datum.__peFirst === 1 ? 'first' : 'last')`;
    transform = [...transform, { calculate: `${series} + ${end}`, as: MARK_IDENTITY }];

    // The colour encoding is repeated, not re-declared: in a layered spec the
    // scales are shared, and a `legend: null` on any one layer takes the key
    // away from all of them.
    const colourEnc = enc.color?.field ? { ...enc.color } : undefined;
    appendLayer(body, {
        __themeSynthetic: true,
        transform,
        // A house that draws its dots hollow draws its end markers hollow too (M5): a ring in the
        // series ink round the surface, the house's outline width.
        mark: d.marks.point?.filled === false
            ? {
                type: 'point',
                filled: false,
                size: policy.size,
                fill: d.surface.plot ?? d.surface.canvas,
                strokeWidth: Math.max(1, d.marks.outline?.width ?? d.marks.point?.haloWidth ?? 2),
                ...(colourEnc ? {} : { color: d.series.single }),
            }
            : {
                type: 'point',
                filled: true,
                size: policy.size,
                ...(d.marks.point?.haloColor
                    ? { stroke: d.marks.point.haloColor, strokeWidth: pointHaloWidth(d, policy.size) }
                    : {}),
                ...(colourEnc ? {} : { color: d.series.single }),
            },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: stripAxis(value),
            ...(colourEnc ? { color: colourEnc } : {}),
        },
    });

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
        ...(policy.labels === 'endpoints' || d.dataLabels.compact
            ? { transform: [...(policy.labels === 'endpoints' ? transform : []), ...(d.dataLabels.compact ? [{ calculate: printedNumber(`datum[${JSON.stringify(value.field)}]`, undefined, d.dataLabels.compact), as: COMPACT_LABEL_FIELD }] : [])] }
            : {}),
        mark: {
            type: 'text',
            align: domainChannel === 'x' ? 'center' : 'left',
            baseline: domainChannel === 'x' ? 'bottom' : 'middle',
            dy: domainChannel === 'x' ? -8 : 0,
            dx: domainChannel === 'x' ? 0 : 8,
            font: t.font,
            fontSize: t.fontSize,
            ...(t.fontWeight ? { fontWeight: t.fontWeight } : {}),
            ...(t.fontStyle ? { fontStyle: t.fontStyle } : {}),
            fill: t.color,
        },
        encoding: {
            [domainChannel]: stripAxis(domain),
            [valueChannel]: stripAxis(value),
            text: d.dataLabels.compact
                ? { field: COMPACT_LABEL_FIELD, type: 'nominal' }
                : {
                    field: value.field,
                    type: 'quantitative',
                    ...(d.dataLabels.format ? { format: d.dataLabels.format } : {}),
                },
        },
    });
}

/** The field a compacted point label reads from. */
const COMPACT_LABEL_FIELD = '__flintCompactLabel';

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
function applyStatistics(spec: any, d: DesignDecisions, table: any[]): void {
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
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

function applyFurniture(spec: any, d: DesignDecisions, planned: LayoutPlan['rules']): boolean {
    // Header furniture — on the canvas edge, above and beside the headline — is planned with the
    // title and drawn on the canvas (applyHeaderFurniture). What is left here are the rules that
    // *close a block*: they wrap the plot in a concatenation and run the block's width.
    if (!d.furniture.length || !planned || 'refused' in planned) return false;
    const handled = false;

    // The plan sized each rule to the block it closes and took their room from the plot. A rule at
    // the foot is drawn on the canvas, `RULE_GAP` under everything the renderer laid out and across
    // the width the title spans: a concatenated rule lines up with the plot's origin, not the labels
    // beside it.
    const before: any[] = [];
    takeFromPlotHeight(spec, planned.room);
    for (const item of planned.rules) {
        if (item.edge === 'top') {
            before.push({
                __themeSynthetic: true,
                mark: { type: 'rect', color: item.color ?? d.text.primary },
                width: item.width,
                height: item.height,
                data: { values: [{}] },
            });
            continue;
        }
        const base = normalizePadding(spec.padding);
        growPadding(spec, 'bottom', item.height + RULE_GAP);
        const rule: CanvasFurnitureItem = {
            kind: 'rule', left: base.left, bottom: base.bottom, height: item.height, color: item.color ?? d.text.primary,
            ...(item.stated ? { width: item.width } : { right: base.right }),
        };
        spec.usermeta = { ...(spec.usermeta ?? {}), [CANVAS_FURNITURE_KEY]: [...readCanvasFurniture(spec), rule] };
    }
    if (!before.length) return handled;

    const inner: any = { ...spec };
    for (const key of ['$schema', 'background', 'padding', 'title', 'config', 'autosize', 'usermeta']) delete inner[key];

    // A concatenated child's legends are hoisted to the outer view and drawn
    // above every child in it. Resolved independently they stay with the plot
    // they key, and the house's rule sits back under the headline where it was
    // drawn.
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
        ...(spec.usermeta ? { usermeta: spec.usermeta } : {}),
        ...(spec.title ? { title: spec.title } : {}),
        spacing: 6,
        vconcat: [...before, inner],
        ...(keyed.size
            ? { resolve: { legend: Object.fromEntries([...keyed].map((c) => [c, 'independent'])) } }
            : {}),
        config: spec.config,
    };
    for (const key of Object.keys(spec)) delete spec[key];
    Object.assign(spec, outer);
    return true;
}

/** Normalise Vega-Lite's number|object padding into a full-sided object. */
function normalizePadding(p: any): { left: number; right: number; top: number; bottom: number } {
    if (typeof p === 'number') return { left: p, right: p, top: p, bottom: p };
    return { left: 8, right: 8, top: 8, bottom: 8, ...(p ?? {}) };
}

/**
 * Draw the header the plan laid out (see core/header-plan.ts). The edge band and the line above the
 * headline take their height from the plot — the canvas the caller asked for holds — and push the
 * title down by growing the top margin; a piece beside the headline's start moves the title over.
 * Pieces are placed against the canvas's own edges (or the content's, inside the margin), and drawn
 * on the canvas after render, where Vega-Lite cannot reach.
 */
export function applyHeaderFurniture(spec: any, header: HeaderPlan | undefined): void {
    if (!header?.pieces.length) return;
    const base = normalizePadding(spec.padding);
    const room = header.edge + header.line;
    if (room) {
        takeFromPlotHeight(spec, room);
        growPadding(spec, 'top', room);
    }
    if (header.beside.start && spec.title) {
        spec.title = typeof spec.title === 'string' ? { text: spec.title, dx: header.beside.start } : { ...spec.title, dx: header.beside.start };
    }
    const built = headerFurnitureItems(header, base);
    spec.usermeta = { ...(spec.usermeta ?? {}), [CANVAS_FURNITURE_KEY]: [...readCanvasFurniture(spec), ...built] };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Draw the source line the plan laid out (see core/source-plan.ts) at the canvas's foot: its room
 * comes out of the plot and grows the bottom margin, and its lines, lead-in, credit and rule are
 * placed against the canvas's bottom edge (or the content's, inside the margin), drawn after render.
 */
export function applySourceLine(spec: any, plan: SourcePlan | undefined): void {
    if (!plan?.lines.length) return;
    const base = normalizePadding(spec.padding);
    takeFromPlotHeight(spec, plan.room);
    growPadding(spec, 'bottom', plan.room);
    const start = plan.frame === 'canvas' ? 0 : base.left;
    const end = plan.frame === 'canvas' ? 0 : base.right;
    // The source line is the last thing at the foot: furniture already seated there (a closing
    // rule) moves up over it.
    const placed = readCanvasFurniture(spec).filter((item) => item.bottom !== undefined);
    const foot = placed.length ? Math.min(base.bottom, ...placed.map((item) => item.bottom!)) : base.bottom;
    for (const item of placed) item.bottom! += plan.room;
    const items: CanvasFurnitureItem[] = [];
    if (plan.rule) {
        items.push({
            kind: 'rule', left: start, right: end, bottom: foot + plan.rule.bottom, height: plan.rule.width, color: plan.rule.color,
            ...(plan.rule.dash ? { dash: plan.rule.dash } : {}),
        });
    }
    for (const line of plan.lines) {
        for (const run of line.runs) {
            items.push({
                kind: 'text', text: run.text, bottom: foot + line.bottom + (plan.lineHeight - plan.fontSize) / 2, height: plan.fontSize,
                ...(line.align === 'start' ? { left: start + run.offset } : { right: end + run.offset }),
                fontSize: plan.fontSize,
                ...(plan.font ? { font: plan.font } : {}),
                ...(run.fontWeight != null ? { fontWeight: run.fontWeight } : {}),
                ...(run.fontStyle ? { fontStyle: run.fontStyle } : {}),
                ...(plan.color ? { color: plan.color } : {}),
                ...(line.href ? { href: line.href } : {}),
            });
        }
    }
    if (plan.creditImage) {
        const img = plan.creditImage;
        items.push({
            kind: 'image', src: img.src, alt: img.alt, width: img.width, height: img.height, bottom: foot + img.bottom,
            ...(img.align === 'start' ? { left: start } : { right: end }),
        });
    }
    spec.usermeta = { ...(spec.usermeta ?? {}), [CANVAS_FURNITURE_KEY]: [...readCanvasFurniture(spec), ...items] };
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
    // Except when the axis is banded: Vega-Lite sizes those one step per
    // category and never reads `continuousWidth`, so taking it here would run
    // the rule well past the plot and stretch the canvas out to meet it.
    if (widest == null) consider(bandedWidth(spec, table) ?? spec.config?.view?.continuousWidth);
    return widest;
}

/**
 * The width Vega-Lite gives a banded plot that states no step of its own:
 * one step per category. Returns undefined when the x axis is not banded.
 */
function bandedWidth(spec: any, table: any[]): number | undefined {
    let enc: any;
    walk(spec, (node) => {
        const x = node.encoding?.x;
        if (!enc && x?.field && (x.type === 'nominal' || x.type === 'ordinal')) enc = x;
    });
    if (!enc) return undefined;
    // A template may compute its categories in a transform, in which case the
    // table has no column to count — the stated domain is the count.
    const count = Array.isArray(enc.scale?.domain) && enc.scale.domain.length
        ? enc.scale.domain.length
        : distinctCount(table, enc.field);
    if (!count) return undefined;
    const discrete = spec.config?.view?.discreteWidth;
    const step = typeof discrete === 'number'
        ? undefined
        : discrete?.step ?? spec.config?.view?.step ?? 20;
    return typeof discrete === 'number' ? discrete : step * count;
}


/**
 * A binned ramp labels every bin edge, so it runs long enough to give each label its room, up to
 * the block it keys; otherwise the renderer drops every other label. Vega-Lite drops a binned
 * key's own `gradientLength`, so the length goes on the config, which the ramp reads.
 */
export function fitBinnedKeyLength(spec: any, config: any, table: any[], block?: number): void {
    config.legend = config.legend ?? {};
    walk(spec, (node) => {
        const enc = node.encoding?.color;
        const scale = enc?.scale;
        if (!enc || enc.legend === null || scale?.type !== 'quantize') return;
        if ((enc.legend?.direction ?? config.legend.direction ?? 'horizontal') !== 'horizontal') return;
        const domain = scale.domain;
        const bins = Array.isArray(scale.range) ? scale.range.length : scale.scheme?.count ?? 0;
        if (!Array.isArray(domain) || domain.length !== 2 || typeof domain[0] !== 'number' || typeof domain[1] !== 'number' || bins < 2) return;
        const fontSize = enc.legend?.labelFontSize ?? config.legend.labelFontSize ?? 10;
        const font = enc.legend?.labelFont ?? config.legend.labelFont;
        const need = (pattern: string): number => {
            let print: (n: number) => string;
            try { print = formatNumber(pattern); } catch { print = formatNumber(','); }
            let widest = 0;
            for (let i = 1; i < bins; i++) {
                const edge = domain[0] + (domain[1] - domain[0]) * i / bins;
                widest = Math.max(widest, textWidth(print(edge).replace('-', '−'), fontSize, font));
            }
            return Math.ceil(bins * (widest + fontSize));
        };
        const current = config.legend.gradientLength ?? 200;
        // A key is a caption: it runs no further than a share of the block it keys.
        const room = block ?? blockWidth(spec, table);
        const cap = Math.max(current, room ? Math.round(room * 0.6) : current);
        const stated = typeof enc.legend?.format === 'string' || enc.legend?.labelExpr !== undefined;
        let wanted = need(stated ? enc.legend.format ?? ',' : ',');
        // Edges that do not fit at full precision print compactly: −38,501 becomes −39k.
        if (wanted > cap && !stated) {
            enc.legend = { ...(enc.legend ?? {}), format: '~s' };
            wanted = need('~s');
        }
        if (wanted <= current) return;
        config.legend.gradientLength = Math.min(wanted, cap);
    });
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
