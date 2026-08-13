// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Level 2 — grounding.
 *
 * Takes a portable ThemeSpec and the signals the compiler already resolved for
 * *this* chart, and returns `DesignDecisions`: every role bound to a concrete
 * part of the chart, every policy resolved against the space actually
 * available, and still not a single backend property name.
 *
 * Grounding is allowed to downgrade. It is not allowed to do so silently.
 */

import type {
    DesignDecisions,
    GeometryKind,
    LegendPlacement,
    NumericGuard,
    Presence,
    Ramp,
    ResolvedAxis,
    ResolvedRule,
    ResolvedSeriesInk,
    ResolvedText,
    SizeToken,
    ThemeGeometry,
    ThemeGuard,
    ThemeMarks,
    ThemeReport,
    ThemeSpec,
    TypeRole,
} from './types.js';
import {
    contrastingInk,
    isDarkSurface,
    isPaintedSurface,
    luminance,
    mixHex,
    parseColor,
    presenceWidth,
    resolvePresenceInk,
    sampleRamp,
} from './presence.js';
import { CURRENCY_MAP } from '../field-semantics.js';
import { getRegistryEntry } from '../type-registry.js';
import { inferValueLabelFormat, longestLabelChars } from './value-label-format.js';
import { deepMerge } from './merge.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Everything grounding is allowed to look at. Deliberately a flat record of
 * compiler *facts* — if grounding needs something that is not here, that is a
 * signal the compiler does not actually know it, and the ThemeSpec should not
 * have been allowed to depend on it.
 */
export interface GroundingContext {
    chartType: string;
    /** Template's `markCognitiveChannel`, widened for `angle`/`text` families. */
    markChannel: string;
    /** Mark families present in the instantiated chart, e.g. `['bar','text']`. */
    markTypes: string[];
    /** The resolved `showSeriesInLabel`: the chart names its series on the marks. */
    namesOnMarks?: boolean;
    /** Per-channel resolved semantics (phase 0). */
    channelSemantics: Record<string, any>;
    /** Encoding types after template-driven conversion (e.g. Q→O for bars). */
    resolvedTypes?: Record<string, string>;
    axisFlags?: { x?: { banded?: boolean }; y?: { banded?: boolean } };
    /**
     * What the backend spec actually put on x and y. Templates are free to
     * name their semantic channels `high`/`low`/`open`/`close`, in which case
     * `channelSemantics` says nothing about the axes the reader will see. This
     * is a fact about the chart, not a style choice, so grounding may use it.
     */
    positional?: {
        x?: { type?: string; field?: string };
        y?: { type?: string; field?: string };
        /** Whatever colour-like channel a data mark carries, wherever it sits. */
        color?: { type?: string; field?: string };
        /** Whether the data marks are stacked into segments. */
        stacked?: boolean;
    };
    layout: {
        subplotWidth: number;
        subplotHeight: number;
        xStep: number;
        yStep: number;
        xStepUnit?: 'item' | 'group';
        yStepUnit?: 'item' | 'group';
        stepPadding: number;
        titleFontSize: number;
        legendFontSize: number;
        facet?: { columns: number; rows: number };
    };
    table: any[];
    canvasSize: { width: number; height: number };
    /** True when the template stacks its series (sum or normalize). */
    stacked?: boolean | 'normalize';
    /** Set when the chart is a share-of-total by construction (pie, donut). */
    partToWhole?: boolean;
    /**
     * Whether the chart carries a headline.
     *
     * A house that omits axis titles is not saying the measure needs no name;
     * it is saying the name is written above the chart. Where nothing is
     * written there, the delegation has nowhere to go.
     */
    titled?: boolean;
    /**
     * The headline and deck as written. A house that omits axis titles is
     * delegating the naming to these words, so grounding has to be able to read
     * them and check the delegation was actually honoured.
     */
    headline?: string;
    /** The surface the host page provides, if the theme defers to it. */
    hostSurface?: string;
    /**
     * The reader's own answer to "print the numbers?", from
     * `chartProperties.showValueLabels`.
     *
     * Absent leaves the house's `dataLabels.show` policy in charge — that
     * policy is what seeds the control in the first place. A present value is
     * a decision someone made about *this* chart, so it outranks the standing
     * preference — but `on` is a preference to print, not a licence to
     * overprint: it still yields where the marks are too dense to read,
     * exactly as a house's own `always` does.
     */
    valueLabels?: 'on' | 'off';

    /**
     * The geometries the chart template builds. Geometry the template cannot
     * build is dropped rather than carried to a renderer that would ignore it.
     */
    geometryKinds?: GeometryKind[];
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

/**
 * Fold the house's compiler settings under whatever the caller stated.
 *
 * Three levels, and the order is not negotiable: a value in the chart spec is
 * a decision someone made about *this* chart, the theme is a standing
 * preference, and flint's default is what is left when nobody said anything.
 *
 * Returns the merged options; keys the caller left undefined take the house's.
 */
export function resolveCompileDefaults<T extends Record<string, any>>(
    theme: ThemeSpec | undefined,
    authored: T | undefined,
): { options: T; report: ThemeReport[] } {
    const house = theme?.compileDefaults as Record<string, any> | undefined;
    const stated = (authored ?? {}) as Record<string, any>;
    if (!house) return { options: stated as T, report: [] };
    const merged: Record<string, any> = { ...stated };
    const report: ThemeReport[] = [];
    for (const [key, value] of Object.entries(house)) {
        if (value === undefined) continue;
        if (stated[key] !== undefined) {
            report.push({
                stage: 'ground',
                path: `compileDefaults.${key}`,
                message: `the house prefers \`${key}: ${JSON.stringify(value)}\`, but the chart states its own — the chart's stands`,
            });
            continue;
        }
        merged[key] = value;
        report.push({
            stage: 'ground',
            path: `compileDefaults.${key}`,
            message: `house preset: \`${key}\` set to ${JSON.stringify(value)}`,
        });
    }
    return { options: merged as T, report };
}

/**
 * House rules for a chart type, folded into the chart properties before the
 * template runs.
 *
 * This is the one part of theming that happens *before* the chart is built:
 * whether a line carries points or a bump chart is smoothed changes the marks
 * themselves, not their dress, so it cannot be done by restyling afterwards.
 *
 * Only keys the caller left unset are filled, and only keys the template
 * actually declares — a house cannot invent a control, and it does not get to
 * overrule a reader who has already chosen.
 */
export function resolveChartDefaults(
    theme: ThemeSpec | undefined,
    chartType: string,
    declared: { key: string }[] | undefined,
    authored: Record<string, any> | undefined,
    target: Record<string, any>,
): ThemeReport[] {
    const defaults = theme?.chartDefaults;
    // A slopegraph reads in one of two ways, and which one is a house matter.
    // An editorial house takes the value axis away — no spine, no ruler — so
    // the only place a value can be read is off the mark itself: it prints the
    // number at each end, with the series name beside it, and needs no colour
    // key. A house that keeps its value axis (a journal panel with a measured
    // spine) reads the numbers off that axis and tells the lines apart the
    // ordinary way, with a legend — printing a name on every end point there
    // would fight the axis for the same margin and clutter a small panel.
    //
    // So the end-label treatment is the default only where the house omits the
    // measure axis line. Houses may still override in their own defaults, a
    // caller who set the control keeps it, and baseline (no theme) is left
    // alone — it keeps its legend.
    const omitsMeasureAxis = theme?.structure?.axis?.measure?.line === 'omit';
    const globalDefaults: Record<string, Record<string, any>> = omitsMeasureAxis
        ? { 'Slope Chart': { showText: true, showSeriesInLabel: true } }
        : {};
    const wanted = {
        ...(globalDefaults['*'] ?? {}),
        ...(globalDefaults[chartType] ?? {}),
        ...(defaults?.['*'] ?? {}),
        ...(defaults?.[chartType] ?? {}),
    };
    if (Object.keys(wanted).length === 0) return [];
    const keys = new Set((declared ?? []).map((p) => p.key));
    const report: ThemeReport[] = [];
    for (const [key, value] of Object.entries(wanted)) {
        if (!keys.has(key)) {
            report.push({
                stage: 'ground',
                path: `chartDefaults.${chartType}.${key}`,
                message: `the house asks for \`${key}\`, which \`${chartType}\` does not offer — dropped`,
            });
            continue;
        }
        if (authored?.[key] !== undefined) {
            report.push({
                stage: 'ground',
                path: `chartDefaults.${chartType}.${key}`,
                message: `the house prefers \`${key}: ${JSON.stringify(value)}\`, but the chart already states one — the chart's own setting stands`,
            });
            continue;
        }
        target[key] = value;
        report.push({
            stage: 'ground',
            path: `chartDefaults.${chartType}.${key}`,
            message: `house rule: \`${key}\` set to ${JSON.stringify(value)}`,
        });
    }
    return report;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * The geometry a house states through `marks`, read as the base profile.
 *
 * `marks` is the older, flatter way of saying most of this, and it is still the
 * only thing nine shipped presets say. Deriving the profile from it is what
 * makes the two vocabularies one: a theme that never writes `geometry` gets
 * exactly the marks it always had, and a theme that does is overriding a
 * profile rather than opening a second channel to the same renderer.
 */
function geometryFromMarks(marks: ThemeMarks | undefined): ThemeGeometry {
    if (!marks) return {};
    const interpolation = marks.interpolation;
    return {
        line: {
            width: marks.strokeWeight,
            cap: marks.strokeCap,
            join: marks.strokeJoin,
            interpolation,
        },
        point: {
            presence: marks.point?.presence,
            size: marks.point?.size,
            fill: marks.point?.fill,
            outlineWidth: marks.outline?.weight,
        },
        area: {
            opacity: marks.fillOpacity,
            interpolation,
        },
        band: {
            fraction: marks.bandFraction,
            cornerRadius: marks.cornerRadius,
            opacity: marks.fillOpacity,
            outline: marks.outline?.presence,
            outlineWidth: marks.outline?.weight,
        },
        arc: {
            cornerRadius: marks.cornerRadius,
            gap: marks.slice?.gap,
            gapStyle: marks.slice?.gapStyle,
        },
        cell: {
            gap: marks.tile?.gap,
        },
    };
}

/** Overlay `patch` onto `base`, one geometry kind at a time; `undefined` never overwrites. */
function mergeGeometry(base: ThemeGeometry, patch: ThemeGeometry | undefined): ThemeGeometry {
    if (!patch) return base;
    const out: Record<string, any> = { ...base };
    for (const [kind, values] of Object.entries(patch)) {
        if (!values) continue;
        const merged: Record<string, any> = { ...(out[kind] ?? {}) };
        for (const [key, value] of Object.entries(values)) {
            if (value !== undefined) merged[key] = value;
        }
        out[kind] = merged;
    }
    return out as ThemeGeometry;
}

function stripUndefined(geometry: ThemeGeometry): ThemeGeometry {
    const out: Record<string, any> = {};
    for (const [kind, values] of Object.entries(geometry)) {
        if (!values) continue;
        const kept: Record<string, any> = {};
        for (const [key, value] of Object.entries(values)) {
            if (value !== undefined) kept[key] = value;
        }
        if (Object.keys(kept).length) out[kind] = kept;
    }
    return out as ThemeGeometry;
}

/**
 * Settle the geometry this chart is built from: the house's `marks`, then its
 * `geometry` profile.
 *
 * `declared` is the template's own list of shapes it builds. A house that hands
 * arc geometry to a line chart is saying something the chart cannot hear, so it
 * is dropped and reported rather than silently carried into a renderer that
 * would ignore it anyway.
 *
 * Conditional geometry — a thinner line for a four-series chart, no dots in a
 * sixteen-panel facet — arrives here already folded in, because variants are
 * merged into `theme` before this runs.
 */
export function resolveGeometry(
    theme: ThemeSpec | undefined,
    chartType: string,
    declared: GeometryKind[] | undefined,
): { geometry: ThemeGeometry; report: ThemeReport[] } {
    const report: ThemeReport[] = [];
    if (!theme) return { geometry: {}, report };

    let geometry = geometryFromMarks(theme.marks);
    geometry = mergeGeometry(geometry, theme.geometry);
    geometry = stripUndefined(geometry);

    // Only filter when the template says what it builds; a template that has
    // not declared its shapes yet keeps the whole profile rather than losing it.
    if (declared) {
        const kinds = new Set<string>(declared);
        for (const kind of Object.keys(geometry)) {
            if (kinds.has(kind)) continue;
            delete (geometry as Record<string, unknown>)[kind];
            if (theme.geometry?.[kind as GeometryKind]) {
                report.push({
                    stage: 'ground',
                    path: `geometry.${kind}`,
                    message: `\`${chartType}\` builds no ${kind} — the house's ${kind} geometry does not apply here`,
                });
            }
        }
    }

    return { geometry, report };
}

/**
 * Fold resolved geometry back into the marks vocabulary grounding already
 * speaks, so the per-chart profile reaches the renderer through the one path
 * that was already there instead of a parallel one.
 */
export function geometryToMarks(
    geometry: ThemeGeometry | undefined,
    base: ThemeMarks | undefined,
): ThemeMarks | undefined {
    if (!geometry || Object.keys(geometry).length === 0) return base;
    const marks: ThemeMarks = { ...(base ?? {}) };
    const { line, point, area, band, arc, cell } = geometry;

    if (line?.width !== undefined) marks.strokeWeight = line.width;
    if (line?.cap !== undefined) marks.strokeCap = line.cap;
    if (line?.join !== undefined) marks.strokeJoin = line.join;
    if (line?.interpolation !== undefined) marks.interpolation = line.interpolation;
    else if (area?.interpolation !== undefined) marks.interpolation = area.interpolation;

    // One opacity reaches every filled mark, so a band that states its own wins
    // over an area's: a chart that draws both is a bar chart with a wash, and
    // the bars are what the reader measures.
    if (area?.opacity !== undefined) marks.fillOpacity = area.opacity;
    if (band?.opacity !== undefined) marks.fillOpacity = band.opacity;
    if (cell?.opacity !== undefined) marks.fillOpacity = cell.opacity;

    if (band?.fraction !== undefined) marks.bandFraction = band.fraction;
    if (band?.cornerRadius !== undefined) marks.cornerRadius = band.cornerRadius;
    if (arc?.cornerRadius !== undefined) marks.cornerRadius = arc.cornerRadius;

    if (point) {
        const resolved = { ...(marks.point ?? {}) };
        if (point.presence !== undefined) resolved.presence = point.presence;
        if (point.size !== undefined) resolved.size = point.size;
        if (point.vertexSize !== undefined) resolved.secondarySize = point.vertexSize;
        if (point.fill !== undefined) resolved.fill = point.fill;
        if (Object.keys(resolved).length) marks.point = resolved;
    }

    const outlinePresence = band?.outline ?? area?.edge;
    const outlineWidth = band?.outlineWidth ?? area?.edgeWidth ?? point?.outlineWidth;
    if (outlinePresence !== undefined || outlineWidth !== undefined) {
        marks.outline = {
            ...(marks.outline ?? {}),
            ...(outlinePresence !== undefined ? { presence: outlinePresence } : {}),
            ...(outlineWidth !== undefined ? { weight: outlineWidth } : {}),
        };
    }

    if (arc?.gap !== undefined || arc?.gapStyle !== undefined) {
        marks.slice = {
            ...(marks.slice ?? {}),
            ...(arc.gap !== undefined ? { gap: arc.gap } : {}),
            ...(arc.gapStyle !== undefined ? { gapStyle: arc.gapStyle } : {}),
        };
    }

    if (cell?.gap !== undefined) {
        marks.tile = { ...(marks.tile ?? {}), gap: cell.gap };
    }

    return marks;
}

const TEXT_TOKENS: Record<string, number> = {
    '100': 10, '200': 12, '300': 14, '400': 16, '500': 20, '600': 24,
    hero700: 28, hero800: 32, hero900: 40, hero1000: 68,
};

const WEIGHTS: Record<string, number> = { regular: 400, medium: 500, semibold: 600, bold: 700 };

function tokenToPx(size: SizeToken | undefined): number | undefined {
    if (size == null) return undefined;
    if (typeof size === 'number') return size;
    const m = /^text\.(.+)$/.exec(size);
    if (m && TEXT_TOKENS[m[1]] != null) return TEXT_TOKENS[m[1]];
    const n = Number(size);
    return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Variant resolution
// ---------------------------------------------------------------------------

function numericGuardHolds(g: NumericGuard, value: number): boolean {
    if (g.eq != null && value !== g.eq) return false;
    if (g.lt != null && !(value < g.lt)) return false;
    if (g.lte != null && !(value <= g.lte)) return false;
    if (g.gt != null && !(value > g.gt)) return false;
    if (g.gte != null && !(value >= g.gte)) return false;
    return true;
}

interface Signals {
    markChannel: string;
    hasBandedAxis: boolean;
    seriesCount: number;
    /** False when a series field exists but this stage cannot count it. */
    seriesCountKnown: boolean;
    categoryCount: number;
    isPartToWhole: boolean;
    isSigned: boolean;
    isTemporal: boolean;
    isFaceted: boolean;
    isSummarised: boolean;
    canvasWidth: number;
}

function guardHolds(guard: ThemeGuard, s: Signals): boolean {
    for (const [key, want] of Object.entries(guard)) {
        if (want == null) continue;
        const got = (s as any)[key];
        if (typeof want === 'object') {
            if (!numericGuardHolds(want as NumericGuard, Number(got))) return false;
        } else if (got !== want) {
            return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// Signal derivation
// ---------------------------------------------------------------------------

const SERIES_CHANNELS = ['color', 'group', 'detail', 'series', 'shape', 'stroke'];
const FACET_CHANNELS = ['column', 'row', 'facet'];
// Charts whose subject is the shape of a distribution, drawn from an area mark
// rather than a summary mark. They summarise like a box plot does, so they take
// the same label escape — a printed value names a quantity they were chosen not
// to reduce to. (A box plot itself is caught earlier by its `boxplot` mark.)
const DISTRIBUTION_SHAPE_CHARTS = new Set(['Violin Plot', 'Density Plot']);
// A table with in-row bars: every value is also printed in its own column, so
// the bar is a secondary in-cell glyph and the category axis is a row-header
// gutter, not a base the bars stand on.
const TABLE_CHARTS = new Set(['Bar Table']);
// A multi-value glyph carries several measures in one mark — a candlestick is
// open/high/low/close — so there is no single scalar per datum to print. The
// mark itself is the value; a lone number stamped on it would name one of four
// prices and mislead on the other three. These charts look labelable (a measure
// on a position, a banded axis, not a distribution summary) but must never
// print a value, and — the reason this matters — must never let a house drop
// the measure axis on the false premise that the value is printed elsewhere.
const MULTI_VALUE_GLYPH_CHARTS = new Set(['Candlestick Chart']);

// The title block's vertical rhythm, as a multiple of the headline / deck font
// size. A house's whitespace personality reaches the title here: `tight` packs
// the chart up under the headline (a dense figure, a dashboard tile); `loose`
// gives an action title room to breathe (a slide exhibit). `normal` preserves
// the ratios the realizer used before the block was expressible.
const TITLE_GAP: Record<'tight' | 'normal' | 'loose', number> = { tight: 0.45, normal: 0.9, loose: 1.7 };
const DECK_GAP: Record<'tight' | 'normal' | 'loose', number> = { tight: 0.25, normal: 0.55, loose: 1.05 };

function distinctCount(table: any[], field: string | undefined): number {
    if (!field) return 0;
    const seen = new Set<any>();
    for (const row of table) {
        const v = row?.[field];
        if (v !== undefined && v !== null) seen.add(v);
    }
    return seen.size;
}

function channelType(ctx: GroundingContext, channel: string): string | undefined {
    return ctx.resolvedTypes?.[channel]
        ?? ctx.channelSemantics?.[channel]?.type
        ?? (channel === 'x' || channel === 'y' ? ctx.positional?.[channel]?.type : undefined);
}

/** Does this channel exist on screen at all, whoever named it? */
function channelPresent(ctx: GroundingContext, channel: 'x' | 'y'): boolean {
    return Boolean(ctx.channelSemantics?.[channel] ?? ctx.positional?.[channel]);
}

/**
 * What a channel actually carries, from whichever stage knows. A layered
 * template states its colour field on one layer and nothing at the top, so the
 * semantic layer can be silent about a distinction the reader plainly sees.
 */
function channelFact(ctx: GroundingContext, channel: string | undefined): { field?: string; type?: string } | undefined {
    if (!channel) return undefined;
    const sem = ctx.channelSemantics?.[channel];
    if (sem?.field) return sem;
    const pos = (ctx.positional as any)?.[channel];
    return pos?.field ? pos : sem;
}

/**
 * Parts that sum to a hundred are already stated in per cent, whatever the
 * field was called. That is a fact about the numbers rather than a guess about
 * the name, so grounding may use it.
 */
function percentOfWhole(ctx: GroundingContext, channel: string): string | undefined {
    const field = channelFact(ctx, channel)?.field;
    if (!field) return undefined;
    let sum = 0;
    let n = 0;
    for (const row of ctx.table) {
        const v = row?.[field];
        if (typeof v === 'number') { sum += v; n += 1; }
    }
    return n >= 3 && Math.abs(sum - 100) < 0.5 ? '%' : undefined;
}

/**
 * The unit a measure is counted in, when the chart already knows it.
 *
 * Either the annotation says so outright, or the field names it the way a
 * person does — `CO₂ (ppm)`, `Unemployment (%)`. Anything longer than a short
 * tag is a phrase, not a unit, and belongs in the subtitle.
 */
const UNIT_IN_FIELD_NAME = /\(([^()]{1,6})\)\s*$/;

function unitText(ctx: GroundingContext, channel: string): string | undefined {
    const sem = ctx.channelSemantics?.[channel];
    const declared = sem?.semanticAnnotation?.unit;
    const field = sem?.field ?? (ctx.positional as any)?.[channel]?.field;
    const named = typeof field === 'string' ? field.match(UNIT_IN_FIELD_NAME) : null;
    const raw = (typeof declared === 'string' && declared.length > 0 && declared.length <= 6)
        ? declared
        : named?.[1];
    if (!raw) return undefined;
    // A currency is written with its sign, not its ISO code: `$8`, not `8 USD`.
    return CURRENCY_MAP[raw.toUpperCase()] ?? raw;
}

/**
 * Whether the labels on a channel say what they are without being told.
 *
 * `Jan`, `Cairo`, `Chrome`, `2019` name themselves: a reader who sees them
 * knows at once what kind of thing they are, and a title over them —
 * `Month`, `City` — only repeats what is already on the page. `26`, `5300`,
 * `0.42` do not: a number is an instance of nothing until someone says what it
 * counts, and the title is where that is said.
 *
 * The registry already sorts this out. A type the reader meets as a *name* or
 * a *date* carries its own kind; one they meet as a *quantity* does not, and
 * neither does a rank or a bin, whose labels are numbers wearing an order.
 * This is a fact about the field, so grounding may use it — it is exactly what
 * a house means when it says it wants a title only `whenAmbiguous`.
 */
function labelsNameThemselves(ctx: GroundingContext, channel: string | undefined): boolean {
    if (!channel) return false;
    const semanticType = ctx.channelSemantics?.[channel]?.semanticAnnotation?.semanticType;
    if (typeof semanticType !== 'string') {
        // Nothing said about the field. Fall back to what the chart put on the
        // channel: names and dates read as themselves, numbers do not.
        const type = channelType(ctx, channel);
        return type === 'nominal' || type === 'temporal';
    }
    const entry = getRegistryEntry(semanticType);
    return entry.t1 === 'DateGranule'
        || entry.visEncodings.includes('nominal')
        || entry.visEncodings.includes('temporal');
}

/**
 * A field that no row carries is not a field with one value — it is a field
 * this stage cannot count, usually because a backend transform will create it.
 * Saying "one" would silently collapse a colour scale.
 */
function fieldPresent(table: any[], field: string | undefined): boolean {
    if (!field) return false;
    return table.some((row) => row != null && Object.prototype.hasOwnProperty.call(row, field));
}

interface Bindings {
    measureChannels: Array<'x' | 'y'>;
    categoricalChannel?: 'x' | 'y';
    seriesChannel?: string;
    facetChannel?: string;
}

function bindRoles(ctx: GroundingContext): Bindings {
    const measureChannels: Array<'x' | 'y'> = [];
    let categoricalChannel: 'x' | 'y' | undefined;

    for (const ch of ['x', 'y'] as const) {
        if (!channelPresent(ctx, ch)) continue;
        const t = channelType(ctx, ch);
        const banded = ctx.axisFlags?.[ch]?.banded === true;
        // A banded axis carries identity even when its field is quantitative
        // (a binned histogram axis), so banding wins over the encoding type.
        if (t === 'quantitative' && !banded) measureChannels.push(ch);
        else categoricalChannel = ch;
    }
    // Both quantitative (scatter): there is no categorical axis, and both axes
    // take the measure role. Both discrete (heatmap): neither does.
    if (measureChannels.length === 2) categoricalChannel = undefined;

    const seriesChannel = SERIES_CHANNELS.find((c) => ctx.channelSemantics?.[c]?.field)
        ?? (ctx.positional?.color?.field ? 'color' : undefined);
    const facetChannel = FACET_CHANNELS.find((c) => ctx.channelSemantics?.[c]?.field);
    return { measureChannels, categoricalChannel, seriesChannel, facetChannel };
}

function deriveSignals(ctx: GroundingContext, b: Bindings): Signals {
    const seriesField = channelFact(ctx, b.seriesChannel)?.field;
    const catField = channelFact(ctx, b.categoricalChannel)?.field;

    let isSigned = false;
    // Not only the measures on the axes: a heat map counts in colour, and a
    // temperature that goes below zero is signed wherever it is drawn.
    const signedChannels = [...b.measureChannels, ...(b.seriesChannel ? [b.seriesChannel] : [])];
    for (const ch of signedChannels) {
        const f = channelFact(ctx, ch)?.field;
        if (!f) continue;
        for (const row of ctx.table) {
            const v = row?.[f];
            if (typeof v === 'number' && v < 0) { isSigned = true; break; }
        }
        if (isSigned) break;
    }

    const isTemporal = (['x', 'y'] as const).some((ch) => channelType(ctx, ch) === 'temporal');

    const seriesKnown = fieldPresent(ctx.table, seriesField);

    return {
        markChannel: ctx.markChannel,
        hasBandedAxis: ctx.axisFlags?.x?.banded === true || ctx.axisFlags?.y?.banded === true,
        seriesCount: seriesField ? (seriesKnown ? distinctCount(ctx.table, seriesField) : 0) : 1,
        seriesCountKnown: !seriesField || seriesKnown,
        categoryCount: catField ? distinctCount(ctx.table, catField) : 0,
        isPartToWhole: ctx.partToWhole === true
            || ctx.stacked === 'normalize'
            || Boolean(ctx.channelSemantics?.theta?.field),
        isSigned,
        isTemporal,
        isFaceted: Boolean(b.facetChannel),
        isSummarised: ctx.markTypes.some((m) => m === 'boxplot' || m === 'errorbar' || m === 'errorband')
            // A violin or density plot draws a distribution as a *shape* built
            // from an area mark — the same escape a box plot gets from its
            // `boxplot` mark, these earn from what they are, not how they draw.
            // Their subject is the silhouette; a single number stamped on it
            // names a quantity the chart was chosen not to reduce to.
            || DISTRIBUTION_SHAPE_CHARTS.has(ctx.chartType),
        canvasWidth: Math.round(ctx.layout.subplotWidth || ctx.canvasSize.width),
    };
}

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

export function groundTheme(themeIn: ThemeSpec, ctx: GroundingContext): DesignDecisions {
    const report: ThemeReport[] = [];
    const say = (path: string, message: string) => report.push({ stage: 'ground', path, message });

    const bindings = bindRoles(ctx);
    const signals = deriveSignals(ctx, bindings);
    // A cell matrix already supplies both positional structures through its
    // tiles. Axis grids add no location cue and can show through painted cell
    // gaps, so they stand down while the theme's tile policy separates cells.
    const gridCells = signals.markChannel === 'color'
        && ctx.axisFlags?.x?.banded === true
        && ctx.axisFlags?.y?.banded === true
        && Boolean(ctx.positional?.x && ctx.positional?.y);

    // --- variants -----------------------------------------------------------
    let theme: ThemeSpec = themeIn;
    for (const variant of themeIn.variants ?? []) {
        if (!variant.when || !guardHolds(variant.when, signals)) continue;
        theme = deepMerge(theme, variant.then);
        say('variants', `applied variant ${JSON.stringify(variant.when)}${variant.because ? ` — ${variant.because}` : ''}`);
    }

    // --- surface ------------------------------------------------------------
    const houseCanvas = theme.ink?.surface?.canvas;
    const deferToHost = (theme.ink?.surface?.source ?? 'house') === 'host';
    const canvas = (deferToHost ? (ctx.hostSurface ?? houseCanvas) : houseCanvas) ?? '#ffffff';
    const plot = theme.ink?.surface?.plot ?? canvas;
    const panel = theme.ink?.surface?.panel ?? plot;
    const dark = isDarkSurface(plot);

    const text = {
        primary: theme.ink?.text?.primary ?? contrastingInk(plot, '#f3f2f1', '#121212'),
        secondary: theme.ink?.text?.secondary ?? mixHex(plot, contrastingInk(plot, '#ffffff', '#000000'), 0.72),
        muted: theme.ink?.text?.muted ?? mixHex(plot, contrastingInk(plot, '#ffffff', '#000000'), 0.45),
        inverse: theme.ink?.text?.inverse ?? (dark ? '#121212' : '#ffffff'),
    };
    const foreground = text.primary;

    // --- typography ---------------------------------------------------------
    // Grounding resolves size against the space actually available: the same
    // token is a different number of pixels on a 700px chart and a 250px one.
    const targetWidth = theme.layout?.targetWidth ?? 300;
    const available = ctx.layout.subplotWidth || ctx.canvasSize.width || targetWidth;
    const scale = clamp(Math.pow(available / targetWidth, 0.3), 0.85, 1.2);
    const minSize = theme.type?.minSize ?? 8;
    const bodyFamily = theme.type?.axisLabel?.family
        ?? theme.type?.valueLabel?.family
        ?? theme.type?.headline?.family;

    function resolveType(role: TypeRole | undefined, fallbackSize: number, fallbackColor: string): ResolvedText {
        const px = tokenToPx(role?.size) ?? fallbackSize;
        const sized = Math.max(minSize, Math.round(px * scale * 2) / 2);
        return {
            font: role?.family ?? bodyFamily,
            fontSize: sized,
            fontWeight: role?.weight ? WEIGHTS[role.weight] : undefined,
            fontStyle: role?.style === 'italic' ? 'italic' : undefined,
            color: role?.color ?? fallbackColor,
        };
    }

    const axisLabelText = resolveType(theme.type?.axisLabel, 10, text.secondary);
    const axisTitleText = resolveType(theme.type?.axisTitle, 10, text.secondary);
    const headline = resolveType(theme.type?.headline, 14, text.primary);
    const deck = resolveType(theme.type?.deck, 11, text.secondary);
    const valueLabel = resolveType(theme.type?.valueLabel, 10, text.primary);
    const keyLabel = resolveType(theme.type?.keyLabel, 10, text.secondary);

    // --- structure ----------------------------------------------------------
    const structure = theme.structure ?? {};
    const structureInk = theme.ink?.structure ?? {};

    const ink = (presence: Presence | undefined, roleInk: string | undefined, fallback: Presence) =>
        resolvePresenceInk({ presence, surface: plot, roleInk, foreground, fallback });

    const rule = (presence: Presence | undefined, roleInk: string | undefined, fallback: Presence, base = 1): ResolvedRule => {
        const color = ink(presence, roleInk, fallback);
        return { show: color !== null, color: color ?? 'transparent', width: presenceWidth(presence ?? fallback, base) };
    };

    const gridStyle = structure.grid?.style ?? 'solid';
    const gridDash = structure.grid?.dash
        ?? (gridStyle === 'dashed' ? [3, 3] : gridStyle === 'dotted' ? [1, 3] : undefined);
    const gridWeight = structure.grid?.weight ?? 1;

    const measureGrid: ResolvedRule = {
        ...rule(structure.grid?.measure, structureInk.grid, 'quiet', gridWeight),
        dash: gridDash,
    };
    const categoryGrid: ResolvedRule = {
        ...rule(structure.grid?.category, structureInk.grid, 'omit', gridWeight),
        dash: gridDash,
    };
    // Zero is not one gridline among the others: it is where the measure
    // changes sign, and on a chart of lengths it is the line every mark is
    // measured from. A house that wants it stated says so; the default is to
    // let it be an ordinary line.
    const zeroRule: ResolvedRule | undefined = structure.grid?.zero
        && structure.grid.zero !== 'omit'
        ? rule(structure.grid.zero, structureInk.zero ?? structureInk.rule ?? structureInk.axis, 'full')
        : undefined;

    const frame = rule(structure.frame, structureInk.frame ?? structureInk.axis, 'omit');
    const baseline = rule(structure.baseline, structureInk.axis, 'full');

    const truncation = theme.labels?.truncation ?? 'ellipsis';
    const labelFlush = theme.labels?.flush === true;
    const axisTitlesPolicy = theme.annotation?.axisTitles ?? 'whenAmbiguous';

    // Which axis the chart is read *along*. Where a category sits on an axis
    // that is the answer; where both axes carry quantities — a connected
    // scatter, a phase plot — the horizontal one still runs the reading order.
    const indexChannel: 'x' | 'y' | undefined = bindings.categoricalChannel
        ?? (bindings.measureChannels.includes('x') && bindings.measureChannels.includes('y') ? 'x' : undefined);

    function buildAxis(channel: 'x' | 'y', role: 'categorical' | 'measure'): ResolvedAxis {
        const spec = role === 'measure' ? structure.axis?.measure : structure.axis?.categorical;
        const opposite = spec?.placement === 'opposite';
        const orient: ResolvedAxis['orient'] = channel === 'x'
            ? (opposite && channel !== indexChannel ? 'top' : 'bottom')
            : (opposite ? 'right' : 'left');

        // The axis a reader indexes the chart *by* is not always the discrete
        // one: a connected scatter has two quantities and still reads left to
        // right. Houses that draw a rule under the categories draw it under
        // that axis too — it is the base the chart stands on, not a ruler for
        // reading values off. So the index axis takes the categorical line
        // even when what it carries is a number.
        const indexing = role === 'categorical' || channel === indexChannel;
        const lineSpec = indexing ? (structure.axis?.categorical ?? spec) : spec;

        // A base rule is the line the marks stand on. Where no axis carries a
        // measure at all — a grid of cells, whose quantity is in the colour —
        // there is nothing standing on it, and the rule is just a line under a
        // list of names.
        const standsOnIt = bindings.measureChannels.length > 0;
        // A bar table prints each value in its own column, so its category axis
        // is a row-header gutter, not a base the bars stand on — like the
        // no-measure grid above, a rule under the names is a line under a list.
        const tableGutter = indexing && TABLE_CHARTS.has(ctx.chartType);
        const domain = (indexing && !standsOnIt) || tableGutter
            ? rule('omit', structureInk.axis, 'omit', lineSpec?.lineWeight ?? 1)
            : rule(lineSpec?.line, structureInk.axis, indexing ? 'full' : 'omit', lineSpec?.lineWeight ?? 1);
        if (((indexing && !standsOnIt) || tableGutter) && (lineSpec?.line ?? 'full') !== 'omit') {
            say(`structure.axis.categorical.line`, tableGutter
                ? 'a bar table prints its values in a column — the category axis is a row-header gutter, not a base, so a rule under the names is a line under a list'
                : 'no axis carries a measure — the cells are the structure, and a rule under their names is a line under nothing');
        }
        const tickLen = spec?.tickLength === 'long' ? 5 : spec?.tickLength === 'short' ? 2 : 3;
        // A row-header gutter has neither spine nor ticks — dropping the line
        // but keeping ticks leaves them floating against nothing.
        const ticksRule = tableGutter
            ? rule('omit', structureInk.axis, 'omit')
            : rule(spec?.ticks, structureInk.axis, 'omit');
        const inward = spec?.tickDirection === 'inward';

        // A title that only repeats what the labels already say is noise.
        // `whenAmbiguous` is a question about the field: `Jan Feb Mar` needs
        // nobody to write `Month` over it, and a column of `26 20 14` names
        // nothing until someone writes `Temp (°C)` beside it. A rank or a
        // binned range is in the second group even though it sits on a
        // categorical axis — its labels are numbers wearing an order.
        //
        // A headline is narrative, not an axis binding. Even when it repeats a
        // field word, it does not reliably state the quantity, unit, direction
        // or which ruler carries it. `The female–male life gap` does not tell a
        // reader that 55–85 means life expectancy in years; `Olympic rank` does
        // not state the rank direction. Numeric, rank and bin axes therefore
        // keep their title under every policy. `omit` may still remove titles
        // over labels that name their own kind, such as months or countries.
        const selfNaming = labelsNameThemselves(ctx, channel);
        const showTitle = axisTitlesPolicy === 'always'
            ? true
            : !selfNaming;
        if (axisTitlesPolicy === 'whenAmbiguous' && selfNaming !== (role !== 'measure')) {
            say(`structure.axis.${role}.title`,
                selfNaming
                    ? `the labels on ${channel} name their own kind — a title over them would repeat what is already read`
                    : `the labels on ${channel} are values, not names — without a title nothing on the axis says what they count`);
        }
        if (axisTitlesPolicy === 'omit' && !selfNaming) {
            say('annotation.axisTitles',
                `the labels on ${channel} are values, not names — a headline cannot bind them to a quantity, so the axis title stays`);
        }

        // A measure axis is a ruler, and how finely it is graduated is a house
        // matter: roughly one label every 45px reads as ordinary, one every
        // 60px as quiet. Three is the floor — two gradations is not a ruler.
        const density = spec?.tickDensity;
        const span = channel === 'x' ? ctx.layout.subplotWidth : ctx.layout.subplotHeight;
        const tickCount = role === 'measure'
            ? Math.max(3, Math.round((span / (density === 'sparse' ? 60 : density === 'dense' ? 30 : 45))))
            : undefined;

        // A house that drops axis titles drops the only place the unit was
        // written. Where it asks for the unit on the ticks instead, the tag is
        // recovered from what the chart already knows the field to be — but
        // only where the axis still counts in that unit. A normalized stack
        // reads in shares, whatever the field was measured in.
        const unitPolicy = theme.annotation?.unit ?? 'never';
        const inFieldUnits = ctx.stacked !== 'normalize' && !ctx.partToWhole;
        const unit = role === 'measure' && inFieldUnits ? unitText(ctx, channel) : undefined;
        const unitTag = unitPolicy !== 'never' ? unit : undefined;

        // Where the house keeps its axis titles, the title is the natural place
        // for the unit — `Weight (lb)` — and the ticks stay bare numbers.
        const titleUnit = showTitle && theme.annotation?.unitsInAxisTitle === true ? unit : undefined;

        // The gap between a label and the plot is the same gap whether or not a
        // tick is drawn in it. Where there is one, the tick spans the first part
        // of that distance and the padding covers the rest; where the house
        // draws none — or turns them inward — the padding is the whole distance,
        // and 4px leaves the label sitting against the edge of the plot.
        const defaultLabelGap = labelFlush ? 2 : 4 + tickLen;
        const ruleToLabelGap = spec?.labelGap ?? defaultLabelGap;
        const labelPadding = ticksRule.show && !inward
            ? Math.max(0, ruleToLabelGap - tickLen)
            : ruleToLabelGap;

        return {
            role,
            orient,
            domain,
            ticks: {
                ...ticksRule,
                size: ticksRule.show ? tickLen : 0,
                offset: inward ? -tickLen : 0,
            },
            grid: gridCells
                ? rule('omit', structureInk.grid, 'omit', gridWeight)
                : indexing ? categoryGrid : measureGrid,
            label: {
                ...axisLabelText,
                limit: truncation === 'never' ? 0 : undefined,
                padding: labelPadding,
                flush: labelFlush,
                angle: theme.labels?.angle === 'horizontal' ? 0 : undefined,
            },
            title: {
                show: showTitle,
                ...axisTitleText,
                ...(showTitle ? { placement: theme.annotation?.axisTitlePlacement } : {}),
                ...(showTitle && theme.annotation?.axisTitleGap != null
                    ? { gap: Math.max(0, theme.annotation.axisTitleGap) }
                    : {}),
                ...(titleUnit ? { unit: titleUnit } : {}),
            },
            tickCount,
            tickLabels: (indexing ? structure.axis?.categorical : spec)?.tickLabels,
            indexing,
            ...(indexing || !zeroRule ? {} : { zeroRule }),
            unit: unitTag ? { text: unitTag, where: unitPolicy } : undefined,
        };
    }

    const axes: DesignDecisions['axes'] = {};
    for (const ch of bindings.measureChannels) axes[ch] = buildAxis(ch, 'measure');
    if (bindings.categoricalChannel) {
        axes[bindings.categoricalChannel] = buildAxis(bindings.categoricalChannel, 'categorical');
    }
    // A heat map has *two* category axes and the bindings can only name one.
    // The other is just as much a ruler for the reader, and left unbound it
    // keeps whatever the template drew — its own titles, its own ink.
    for (const ch of ['x', 'y'] as const) {
        if (!axes[ch] && ctx.positional?.[ch]) axes[ch] = buildAxis(ch, 'categorical');
    }
    if (theme.labels?.angle === 'rotated' && axes.x) {
        axes.x.label.angle = -45;
    }
    // A house may set its category labels flat, but "flat" is a preference and
    // "legible" is not. Where the band is narrower than the word standing under
    // it, the angle goes back to the layout pass, which owns fit.
    //
    // The reverse is just as true and matters more often: the layout pass sized
    // the labels in flint's own type, and a house that sets smaller labels buys
    // room the layout did not know it would have. A name that now fits under
    // its band should be read straight, not at forty-five degrees because of a
    // measurement taken in a font the chart no longer uses.
    if (axes.x && (bindings.categoricalChannel === 'x'
        || ctx.positional?.x?.type === 'nominal' || ctx.positional?.x?.type === 'ordinal')) {
        const field = channelFact(ctx, 'x')?.field ?? ctx.positional?.x?.field;
        const type = ctx.positional?.x?.type ?? channelFact(ctx, 'x')?.type;
        const banded = type === 'nominal' || type === 'ordinal';
        const longest = field
            ? Math.max(0, ...ctx.table.map((r) => String(r?.[field] ?? '').length))
            : 0;
        // Mixed-case words average out narrower than the widest glyph — half
        // the point size a character is close enough — plus a couple of pixels
        // so two names never touch.
        const needed = longest * (axes.x.label.fontSize ?? 10) * 0.5 + 2;
        const step = ctx.layout.xStep;
        const fits = longest > 0 && step > 0 && needed <= step;
        if (axes.x.label.angle === 0 && !fits && longest > 0 && step > 0) {
            axes.x.label.angle = undefined;
            say('axes.x.label.angle',
                `the house sets category labels flat, but the widest needs ~${Math.round(needed)}px in a ${Math.round(step)}px band — the angle is left to the layout`);
        } else if (axes.x.label.angle == null && fits && banded && theme.labels?.angle !== 'rotated') {
            axes.x.label.angle = 0;
            say('axes.x.label.angle',
                `the widest name needs ~${Math.round(needed)}px and the band is ${Math.round(step)}px — at the house's label size they read straight`);
        }
    }

    // --- series ink ---------------------------------------------------------
    const series = groundSeriesInk(theme, ctx, bindings, signals, say);

    // --- legend -------------------------------------------------------------
    const legendSpec = theme.legend ?? {};
    const ranked: LegendPlacement[] = legendSpec.placement?.length
        ? legendSpec.placement
        : ['right'];

    const seriesField = channelFact(ctx, bindings.seriesChannel)?.field;
    const catField = channelFact(ctx, bindings.categoricalChannel)?.field;
    // A legend over a quantitative series is a key to values, not to names.
    const seriesIsValueKey = channelFact(ctx, bindings.seriesChannel)?.type === 'quantitative';

    let legendShow = Boolean(seriesField)
        && (!signals.seriesCountKnown || signals.seriesCount > 1)
        && legendSpec.show !== 'never';
    if (legendShow && legendSpec.suppressWhenAxisNames && seriesField && seriesField === catField) {
        legendShow = false;
        say('legend.suppressWhenAxisNames', 'legend removed — it restated the categorical axis');
    }

    // Which placements grounding can offer at all. `inline` needs a label
    // anchored to each mark's own geometry, which only line-family charts have
    // room for; the ranked list exists precisely so this can fall through.
    //
    // A stacked band has that room too, and more of it: the name goes *inside*
    // the band at its last reading, which is where a reader's eye already is
    // when they ask which band this is.
    const lineFamily = ctx.markTypes.some((m) => m === 'line' || m === 'trail');
    // A violin or density plot is an area too, but its band has no meaningful
    // last reading to hang a name on: the shape is a distribution, and its
    // right edge is an arbitrary tail near zero, not an endpoint the eye rests
    // at. Grounding withholds the in-band placement from it, and the name falls
    // through to the ranked list — a legend — where the shapes stay legible.
    const bandFamily = ctx.markTypes.some((m) => m === 'area') && !signals.isSummarised;
    const placementRealizable = (p: LegendPlacement): boolean => {
        if (p === 'seriesEnd' || p === 'inline') return (lineFamily || bandFamily) && !signals.isFaceted;
        return true;
    };
    let placement: LegendPlacement = 'right';
    let fallbacks: LegendPlacement[] = [];
    for (const [i, p] of ranked.entries()) {
        if (placementRealizable(p)) {
            placement = p;
            fallbacks = ranked.slice(i + 1).filter(placementRealizable);
            break;
        }
        say('legend.placement', `\`${p}\` not available for this chart — falling through`);
    }

    const legendOrient = placement === 'inside'
        ? 'top-right'
        : placement === 'seriesEnd' || placement === 'inline'
            ? 'none'
            : (placement as 'top' | 'right' | 'bottom' | 'left');

    // A chart that prints each series' name at its right-hand end (seriesEnd /
    // inline placement on a left-to-right axis) has claimed the right margin.
    // A house that also seats its measure axis on the right (opposite
    // placement) would stack that axis's tick labels under the names —
    // "Uni1ted", "Ch2na", "Ja3an" on a bump chart's rank axis. The end labels
    // own the right side; the measure axis falls back to the left.
    //
    // Only when those names are actually drawn. A placement is chosen off the
    // ranked list whether or not there is a key to place, so a single-series
    // line chart — no series to name, nothing in the right margin — was
    // evicting its own ruler to the left and losing the house's right-hand
    // axis on the plainest chart it draws.
    if (legendShow && (placement === 'seriesEnd' || placement === 'inline')) {
        for (const ch of bindings.measureChannels) {
            const ax = axes[ch];
            if (ax && ax.orient === 'right') {
                ax.orient = 'left';
                say('axes.measure.placement',
                    'the series names sit at the line ends on the right — the measure axis moves to the left so its ticks do not land under the names');
            }
        }
    }

    // A key to a set of names needs no title: `Chrome`, `Safari`, `Firefox`
    // say what kind of thing they are, and `Browser` written over them repeats
    // it. A ramp of numbers says nothing of the sort — `26` is an instance of
    // nothing until the key names what it counts. `whenAmbiguous` is that
    // question, and it is asked of the field, not answered with a constant.
    const titlePolicy = legendSpec.title ?? 'whenAmbiguous';
    const keyNamesItself = labelsNameThemselves(ctx, bindings.seriesChannel);
    const legendTitle = titlePolicy === 'always'
        || (titlePolicy === 'whenAmbiguous' && legendShow && !keyNamesItself);
    if (legendTitle && titlePolicy !== 'always') {
        say('legend.title',
            'the key is a ruler, not a list of names — without a title nothing says what its numbers count');
    }

    // --- data labels --------------------------------------------------------
    const dl = theme.dataLabels ?? {};
    let dlPlacement = dl.placement ?? 'outsideMark';
    // A label placed *on* a mark sits on the mark's fill, whatever the house
    // said about ink. Contrast is a legibility floor, not a style choice.
    const dlInkMode = dl.inkMode
        ?? (dlPlacement === 'atMark' ? 'contrastWithMark' : 'fixed');
    if (!dl.inkMode && dlInkMode === 'contrastWithMark') {
        say('dataLabels.inkMode',
            'no ink mode declared but the label sits on the mark — it contrasts with what it is printed on');
    }
    // The reader's own answer outranks the house's standing preference: `off`
    // is a decision that this chart carries no numbers, `on` that it does.
    // Absence leaves the house in charge — and with no house named, the neutral
    // default is silence, so an untheme'd chart prints numbers only when asked.
    // `on` becomes `always` rather than an unconditional print, so it inherits
    // the density guard below — a control that can bury a chart in unreadable
    // numbers is not a control, it is a trap.
    const dlShowPolicy: 'always' | 'whenTheyFit' | 'never' | undefined =
        ctx.valueLabels === 'off' ? 'never'
            : ctx.valueLabels === 'on' ? 'always'
                : dl.show;
    if (ctx.valueLabels === 'on' || ctx.valueLabels === 'off') {
        if (dlShowPolicy !== dl.show) {
            say('dataLabels.show',
                `the chart asked for value labels \`${ctx.valueLabels}\`, overriding the house's \`${dl.show ?? 'unset'}\``);
        }
    }
    let dlShow = dlShowPolicy === 'always';

    // A cell in a grid *is* a position. The reader finds it by its row and its
    // column, and the number goes in the middle of it — the measure being on
    // colour is the reason the number is worth printing, not a reason to
    // withhold it.
    // A printed value has to be *keyed* to something the eye can separate — a
    // band, a slice, a discrete step. On a continuous-by-continuous plot there
    // is no such anchor: every datum would get its own floating number and the
    // result is not a labelled chart, it is a chart with numbers spilled on it.
    // This gate binds `always` too; `always` is a house habit, not a licence.
    // There also has to be a value to print: a heatmap has two banded axes and
    // its measure on colour, and a number can only be printed where a measure
    // is on a position. And where the chart summarises a distribution, the
    // marks in a band *are* the sample: its subject is the shape, and thirty
    // numbers per band bury it.
    //
    // Stacked segments are labelled, but only in the middle of the segment.
    // The objection to labelling a stack is against the *edge*, where a number
    // reads as the running total; a number centred in the segment reads as the
    // segment, which is the one thing a stacked bar otherwise makes hard to
    // get at. Whether each segment is thick enough to hold that number is a
    // separate question, settled below.
    //
    // A line or an area is the exception the part-to-whole test would
    // otherwise let through: a normalized stacked area *is* a part of a whole,
    // but it is drawn as a continuous ribbon with no slot to print into, so
    // the numbers land on the vertices — which are sampling points, not marks
    // a reader is meant to read off one at a time. And on a normalized chart
    // they name a quantity the axis does not carry: the axis is a percentage
    // and the number is a raw total.
    const continuousMark = ctx.markTypes.some((m) => m === 'area' || m === 'line' || m === 'trail');
    const labelable = ((signals.hasBandedAxis && (bindings.measureChannels.length > 0 || gridCells))
        || signals.isPartToWhole)
        && !signals.isSummarised
        && !continuousMark
        && !MULTI_VALUE_GLYPH_CHARTS.has(ctx.chartType);
    if (dlShow && !labelable) {
        dlShow = false;
        say('dataLabels.show', signals.isSummarised
            ? 'the chart summarises a distribution — each band holds a sample, not one quantity to print'
            : continuousMark
                ? 'the mark is a continuous line or ribbon — its vertices are sampling points, not marks to read off one at a time'
                : MULTI_VALUE_GLYPH_CHARTS.has(ctx.chartType)
                    ? 'the mark carries several measures at once — there is no single value to print, and the measure axis stays as the only reading of them'
                    : signals.hasBandedAxis
                        ? 'the measure is not on an axis — there is no position to print a value at'
                        : 'no banded axis to key values to — one number per datum would be noise, not a label');
    }

    // How wide the printed number itself is. Needed before the fit checks
    // below, not after them: on a dodged chart the number's own width is what
    // decides whether a bar's slot can carry it, so a check that runs later
    // can only veto a decision already reported — which is how the control
    // came to be offered on charts that then printed nothing.
    //
    // What is measured is the label as it will be *printed*. Measuring
    // `String(Math.round(value))` instead — as this did — is the width of a
    // number nobody prints: it ignores the decimals, the separators, the sign
    // and the format, so a chart of decimals measured four times narrower than
    // it drew and its labels were offered straight into a pile.
    let valueMaxAbs = 0;
    let measureField: string | undefined;
    const labelValues: number[] = [];
    {
        const mch = bindings.measureChannels[0];
        measureField = mch
            ? (ctx.channelSemantics[mch]?.field ?? ctx.positional?.[mch]?.field)
            : undefined;
        if (measureField) {
            for (const row of ctx.table) {
                const v = row?.[measureField];
                if (typeof v !== 'number' || !Number.isFinite(v)) continue;
                valueMaxAbs = Math.max(valueMaxAbs, Math.abs(v));
                labelValues.push(v);
            }
        }
    }
    const numberFormatChoice = groundNumberFormat(theme, ctx, bindings.measureChannels[0], labelValues);
    const numberFormat = numberFormatChoice.pattern;
    if (numberFormatChoice.inferred && labelValues.length > 0) {
        // Say it out loud: the digits a label carries are a decision, and a
        // silent one would look like the number had simply been mangled.
        const rawWidth = longestLabelChars(labelValues, undefined);
        const shown = longestLabelChars(labelValues, numberFormat);
        say('annotation.numberFormat',
            `printed values use \`${numberFormat}\` — three significant figures is what a reader takes off a mark, and it holds the longest label to ${shown} characters where the raw value runs to ${rawWidth}`);
    }
    // A normalized stack prints each segment's share, not its value, so that
    // is the string whose width has to fit — never wider than `100%`, however
    // large the underlying numbers are.
    const normalizedStack = (ctx.stacked ?? undefined) === 'normalize';
    const labelChars = normalizedStack
        ? 4
        : longestLabelChars(labelValues, numberFormat);
    const valueLabelWidthPx = (valueLabel.fontSize ?? 10) * 0.62 * labelChars + 12;
    // The ink alone, without the breathing room a label wants when it has to
    // sit *inside* something. Two labels floating above their own bars only
    // need to clear each other.
    const labelTextPx = (valueLabel.fontSize ?? 10) * 0.62 * labelChars;

    // Both policies read fit from the same two facts — room enough to stand a
    // number in, and few enough marks that the numbers do not pile up — and
    // differ only in where they draw the line. Computing them once also gives
    // the honest answer to "could this chart carry labels at all?", which is
    // what a host needs to decide whether offering the control is meaningful.
    const labelBand = signals.hasBandedAxis
        ? (bindings.categoricalChannel === 'y' ? ctx.layout.yStep : ctx.layout.xStep)
        : Infinity;
    // A dodged chart splits its band between the series with nothing between
    // them, so the room a single number gets is the band over the series count
    // — not the band. A single series keeps the whole band and can lean a
    // number into the padding on either side.
    const dodged = signals.seriesCount > 1
        && (bindings.categoricalChannel === 'y'
            ? ctx.layout.yStepUnit === 'group'
            : ctx.layout.xStepUnit === 'group');
    const labelSlot = dodged ? labelBand / Math.max(1, signals.seriesCount) : labelBand;
    const labelMarks = Math.max(1, signals.categoryCount || ctx.table.length)
        * Math.max(1, signals.seriesCount);
    // Which way the number has to fit depends on which way the bars run. Across
    // a vertical bar it is the number's *width* that must clear the slot; along
    // a horizontal one the number sits at the bar's end, so what the slot must
    // hold is the height of a line of text.
    const slotHoldsLine = labelSlot >= (valueLabel.fontSize ?? 10) + 4;
    // `ctx.stacked` reports only an *explicit* stack; a bar with a colour
    // channel is stacked by Vega-Lite without being asked, and that shows up
    // in the positional facts. It is `||`, not `??`: the explicit reading is
    // `false` rather than absent when nothing was stated.
    const stacked = ctx.stacked || ctx.positional?.stacked;
    // On a vertical bar the number lies across the band, so the band has to be
    // at least as wide as the number is — and that holds whether or not the
    // bar shares its band. Moving the label above the bar buys height, not
    // width: the label above bar B still runs into the label above bar C.
    // `,.0f` on nine-digit revenues drew `987,654,321` across three bands and
    // off both plot edges, which is the case this closes.
    const widthIsBinding = bindings.categoricalChannel === 'x';
    // A label sharing its band — dodged or stacked — has to stand in the room
    // it is given, gutter and all. One floating above its own bar only has to
    // clear its neighbour: labels are centred on the band, so two of them
    // touch exactly when the printed string is wider than the step.
    const widthNeeded = (dodged || Boolean(stacked)) ? valueLabelWidthPx : labelTextPx;
    const slotHoldsNumber = !widthIsBinding || labelSlot >= widthNeeded;
    // A stacked bar shares its band between the segments the *other* way: the
    // band is whole, but each segment's own thickness is what has to hold a
    // line of text. Segments thinner than that are dropped one by one further
    // down; what is settled here is the chart-level question — if not one
    // segment can carry its number, there is nothing to offer the reader.
    let segmentsFit = true;
    let totalSegments = 0;
    let thinSegments = 0;
    let segmentMinShare: number | undefined;
    if (stacked && measureField && signals.hasBandedAxis) {
        // Along the measure axis, a segment gets the share of the plot its
        // value has of the tallest stack — or, on a normalized chart, of its
        // own stack, since every bar is drawn full height.
        const extent = bindings.categoricalChannel === 'y'
            ? ctx.layout.subplotWidth
            : ctx.layout.subplotHeight;
        const catField = bindings.categoricalChannel === 'y'
            ? (ctx.positional?.y?.field ?? ctx.channelSemantics.y?.field)
            : (ctx.positional?.x?.field ?? ctx.channelSemantics.x?.field);
        const totals = new Map<any, number>();
        for (const row of ctx.table) {
            const v = row?.[measureField];
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            const key = catField ? row?.[catField] : '';
            totals.set(key, (totals.get(key) ?? 0) + Math.abs(v));
        }
        const tallest = Math.max(0, ...totals.values());
        const minPx = (valueLabel.fontSize ?? 10) + 4;
        if (extent > 0) segmentMinShare = minPx / extent;
        for (const row of ctx.table) {
            const v = row?.[measureField];
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            const key = catField ? row?.[catField] : '';
            const against = stacked === 'normalize' ? (totals.get(key) ?? 0) : tallest;
            if (against <= 0) continue;
            totalSegments += 1;
            if ((Math.abs(v) / against) * extent < minPx) thinSegments += 1;
        }
        segmentsFit = totalSegments === 0 || thinSegments < totalSegments;
    }
    const bandHoldsNumber = slotHoldsLine && slotHoldsNumber && segmentsFit;
    // The hard ceiling: past this the numbers cannot be read whoever asked for
    // them, so it binds `always` and an explicit `on` alike.
    const readableAtAll = bandHoldsNumber && labelMarks <= 120;

    if (dlShowPolicy === 'always' && dlShow) {
        // `always` is a preference to print, not a licence to overprint. It
        // holds to that preference past `whenTheyFit`'s comfort margin, onto
        // the tight-but-legible charts the cautious houses leave to a legend,
        // and yields only when the marks are genuinely too dense (a hundred-odd
        // bars, a dozen-plus pie slices) for the numbers to be read.
        if (!readableAtAll) {
            const asked = ctx.valueLabels === 'on' ? 'the chart asked to print values, but' : '`always` overridden —';
            dlShow = false;
            say('dataLabels.show', !segmentsFit
                ? `${asked} every segment is thinner than a line of text — none can hold its number`
                : !slotHoldsNumber
                    ? (dodged
                        ? `${asked} the bars group ${signals.seriesCount} to a band — each is ${Math.round(labelSlot)}px wide, too narrow to carry a ${Math.round(valueLabelWidthPx)}px number without it landing on the next bar`
                        : `${asked} the bars are ${Math.round(labelSlot)}px wide and the number is ${Math.round(valueLabelWidthPx)}px — it would overrun the bar it belongs to`)
                    : !slotHoldsLine
                        ? `${asked} a ${Math.round(labelSlot)}px slot cannot hold a number`
                        : `${asked} ${labelMarks} marks would pile the numbers past reading`);
        }
    }

    if (dlShowPolicy === 'whenTheyFit') {
        dlShow = labelable && bandHoldsNumber && labelMarks <= 40;
        if (!dlShow) {
            say('dataLabels.show', labelable
                ? `\`whenTheyFit\` resolved to false (slot ${Math.round(labelSlot)}px, ${labelMarks} marks)`
                : '`whenTheyFit` resolved to false — no banded axis to key values to');
        }
    }
    // A stacked segment's number belongs in the middle of the segment and
    // nowhere else. Outside the mark is the top of the *stack*, which is a
    // different quantity, and the segment edge is the running total — the very
    // reading a stacked label has to avoid.
    if (dlShow && stacked && dlPlacement !== 'atMark') {
        say('dataLabels.placement',
            `\`${dlPlacement}\` printed in the segment instead — outside a stacked bar is the top of the stack, not the end of the segment`);
        dlPlacement = 'atMark';
    }
    // A number is printed across a bar's *width*, not up its height. A single
    // bar too narrow for its own number does not lose the number — it moves it
    // above the bar, where the gaps between bars give it room. (A dodged chart
    // cannot do this: there are no gaps to move into, which is why that case is
    // settled above, as a question of whether to label at all. Nor can a
    // stacked one: above the bar means above the whole stack.)
    if (dlShow && bindings.categoricalChannel === 'x' && signals.hasBandedAxis
        && valueMaxAbs > 0 && !dodged && !stacked && valueLabelWidthPx > labelSlot
        && dlPlacement === 'atMark') {
        dlPlacement = 'outsideMark';
        say('dataLabels.placement',
            `the bar is ${Math.round(labelSlot)}px wide but the number is ${Math.round(valueLabelWidthPx)}px — it moves above the bar, where the gaps between bars give it room`);
    }

    if (dlShow && legendShow && legendSpec.suppressWhenValuesPrinted) {
        // A printed value is not a name. It replaces a legend that was itself
        // a value key — a ramp — but never one that carried series names, and
        // a banded axis does not help: it names the category, not the series.
        if (seriesIsValueKey) {
            legendShow = false;
            say('legend.suppressWhenValuesPrinted', 'legend removed — the ramp was a value key and every mark now prints its value');
        } else {
            say('legend.suppressWhenValuesPrinted',
                'legend kept — the values are printed but nothing else names the series');
        }
    }

    // The same argument, one axis over: once every mark states its own value,
    // the *ruler* is a second copy of the same information. Its title is not.
    // A printed `42` says how much and never says of what — the title is the
    // only thing naming the quantity, and taking it away with the gradations
    // leaves a grid of anonymous numbers. What the title says is still the
    // title policy's call; this only stops the ruler dragging it out.
    if (dlShow && structure.axis?.measure?.suppressWhenValuesPrinted) {
        let keptTitle = false;
        for (const ch of bindings.measureChannels) {
            const ax = axes[ch];
            if (!ax) continue;
            ax.label.show = false;
            ax.grid = { show: false, color: 'transparent', width: 0 };
            ax.ticks = { ...ax.ticks, show: false, size: 0 };
            ax.domain = { ...ax.domain, show: false };
            if (ax.title.show) keptTitle = true;
        }
        say('structure.axis.measure.suppressWhenValuesPrinted',
            keptTitle
                ? 'measure ruler removed — every mark prints its own value; the axis title stays, because a printed number says how much and not of what'
                : 'measure axis removed — every mark prints its own value');
    }

    // The mirror of the rule above, and the floor under it. A house strips its
    // grid, its rule and its ticks because the number is printed on the mark —
    // that is the consulting-deck bar, and there the scaffolding really is
    // redundant. A scatter prints nothing, so the same house hands back
    // readings floating on blank paper with no way to judge one against
    // another. The house may choose how a value is read; it may not leave no
    // way to read one, so the quiet grid returns.
    if (!dlShow) {
        for (const ch of bindings.measureChannels) {
            const ax = axes[ch];
            if (!ax || ax.grid.show || ax.domain.show || ax.ticks.show) continue;
            ax.grid = { ...rule('quiet', structureInk.grid, 'quiet', gridWeight), dash: gridDash };
            say(`axes.${ch}.grid`,
                'no mark prints its value and the ruler draws nothing — the quiet grid returns, so a reading can be judged against something');
        }
    }

    const measureChannel = bindings.measureChannels[0];

    // A unit has to be stated somewhere. Normally that is the ruler; a pie has
    // no ruler, and a measure axis whose labels were removed is no longer one
    // either. Where the house asks for a unit and nothing else can hold it, the
    // printed value takes it — whoever printed it, the theme or the template.
    const valueUnitChannel = measureChannel
        ?? (['theta', 'size', 'radius'] as const).find((ch) => ctx.channelSemantics?.[ch]?.field);
    const axisStatesUnit = (['x', 'y'] as const)
        .some((ch) => axes[ch]?.unit && axes[ch]!.label.show !== false);
    const houseStatesUnit = (theme.annotation?.unit ?? 'never') !== 'never' && !axisStatesUnit;
    // A part-to-whole value whose slices sum to 100 *is* a percentage — the `%`
    // is the number's meaning, not a house-style flourish, and a pie has no
    // ruler to carry it. So it rides on the printed value whatever the house's
    // axis-unit policy: a bare `65` on a slice reads as a count, not a share.
    // (`percentOfWhole` only fires on values that actually total 100, so a pie
    // of raw amounts keeps its bare numbers.)
    const shareUnit = signals.isPartToWhole && !axisStatesUnit
        ? percentOfWhole(ctx, valueUnitChannel ?? '')
        : undefined;
    const valueUnit = houseStatesUnit
        ? (unitText(ctx, valueUnitChannel ?? '') ?? shareUnit)
        : shareUnit;

    // A label placed at the mark sits *inside* it, which only works while the
    // mark is longer than the label. Below that length the label has to move
    // out, and above the point where the mark reaches the end of the scale an
    // outside label has nowhere left to go. Grounding is the stage that can
    // say where those two lines are.
    let insideMinValue: number | undefined;
    let outsideMaxValue: number | undefined;
    if (dlShow && measureChannel) {
        const span = measureChannel === 'x' ? ctx.layout.subplotWidth : ctx.layout.subplotHeight;
        if (valueMaxAbs > 0 && span > 0) {
            insideMinValue = (valueLabelWidthPx / span) * valueMaxAbs;
            outsideMaxValue = valueMaxAbs - insideMinValue;
        }
    }

    // --- marks --------------------------------------------------------------
    // Geometry is resolved here, after variants, so a house's conditional
    // geometry — a thinner line where four series share the plot — is already
    // part of `theme` by the time the profile is read.
    const marksSpec = geometryToMarks(
        resolveGeometry(theme, ctx.chartType, ctx.geometryKinds).geometry,
        theme.marks,
    ) ?? {};
    const separatorInk = marksSpec.separator?.source === 'surface'
        ? plot
        : structureInk.rule ?? structureInk.grid;

    const separator = marksSpec.separator
        ? {
            show: (marksSpec.separator.presence ?? 'omit') !== 'omit',
            color: (marksSpec.separator.source === 'surface'
                ? plot
                : ink(marksSpec.separator.presence, separatorInk, 'hairline')) ?? plot,
            width: marksSpec.separator.width ?? 1,
        }
        : undefined;

    // A house that says nothing about its wedges is not silent — it has
    // already said how it holds adjoining marks apart, and a pie is adjoining
    // marks. Only a house that wants a different answer for the circle than it
    // gave for the bars has to say so twice.
    const sliceGap = marksSpec.slice?.gap ?? (separator?.show ? separator.width : undefined);

    // And a grid of cells is adjoining marks too. The one thing it does not
    // inherit is the ink: a bar's edge may be drawn in structure without
    // anyone reading a value into it, but on a grid the fill *is* the value,
    // so an edge in any ink but the surface's adds a colour the scale never
    // named. A house that wants framed cells asks for them.
    const tileGap = marksSpec.tile?.gap ?? (separator?.show ? separator.width : undefined);

    // A dot on a line is drawn over whatever the line passed through on its
    // way there, and where several series share a plot that is another
    // series' colour. A ring of the page around the dot is what holds the two
    // apart: without it a crossing reads as one blob, and the reader cannot
    // say which line the dot belongs to. That is a fact about lines meeting,
    // not a matter of taste, so a chart that can have crossings gets the ring
    // whether or not the house thought to name one — a house that wants none
    // says `halo: { presence: 'omit' }`.
    const crossingField = ctx.channelSemantics.color?.field
        ?? ctx.channelSemantics.detail?.field
        ?? ctx.positional?.color?.field;
    const linesCanCross = ctx.markTypes.includes('line')
        && !!crossingField
        && new Set(ctx.table.map((r) => r?.[crossingField!]).filter((v) => v != null)).size > 1;
    const haloDeclared = marksSpec.point?.halo?.presence !== undefined;
    const halo = haloDeclared
        ? marksSpec.point!.halo!.presence !== 'omit'
        : linesCanCross;
    if (halo && !haloDeclared) {
        say('marks.point.halo',
            'the dots carry a ring of the page around them — the lines cross, and at a crossing the ring is the only thing that says which line a dot sits on');
    }

    const marks: DesignDecisions['marks'] = {
        bandFraction: marksSpec.bandFraction ?? (1 - (ctx.layout.stepPadding ?? 0.1)),
        strokeWidth: marksSpec.strokeWeight ?? 2,
        strokeCap: marksSpec.strokeCap,
        strokeJoin: marksSpec.strokeJoin,
        interpolate: marksSpec.interpolation === 'monotone'
            ? 'monotone'
            : marksSpec.interpolation === 'step' ? 'step' : undefined,
        fillOpacity: marksSpec.fillOpacity,
        cornerRadius: marksSpec.cornerRadius,
        outline: marksSpec.outline && (marksSpec.outline.presence ?? 'omit') !== 'omit'
            ? {
                color: marksSpec.outline.source === 'surface'
                    ? plot
                    : (ink('full', structureInk.axis ?? structureInk.rule, 'full') ?? foreground),
                width: marksSpec.outline.weight ?? 1.5,
            }
            : undefined,
        point: marksSpec.point || halo
            ? {
                show: (marksSpec.point?.presence ?? 'omit') !== 'omit',
                size: marksSpec.point?.size,
                secondarySize: marksSpec.point?.secondarySize
                    ?? Math.min(marksSpec.point?.size ?? 25, 25),
                // Only where the house sized vertices itself; otherwise a line's
                // dots keep taking the primary size, as they always have.
                vertexSize: marksSpec.point?.secondarySize,
                // Only a house that spoke about its dots' fill decides how
                // they are filled; inventing an answer here would re-fill
                // every scatter it has for the sake of a line chart's
                // vertices — or, for a house that named only a size, turn
                // the hollow glyphs of a shape-encoded scatter solid.
                filled: marksSpec.point?.fill != null
                    ? marksSpec.point.fill !== 'hollow'
                    : undefined,
                haloColor: halo ? plot : undefined,
                haloWidth: marksSpec.point?.halo?.width ?? (halo ? 1.5 : undefined),
            }
            : undefined,
        separator,
        slice: sliceGap
            ? {
                gap: sliceGap,
                style: marksSpec.slice?.gapStyle ?? 'rule',
                color: separator?.color ?? plot,
            }
            : undefined,
        tile: tileGap
            ? {
                gap: tileGap,
                color: marksSpec.tile?.source === 'structure'
                    ? (ink('hairline', structureInk.rule, 'hairline') ?? plot)
                    : plot,
            }
            : undefined,
        connector: {
            // A house that names no connector has still not asked for its
            // dumbbell's bridge to be drawn in a series colour. `show` says
            // whether the house styles connectors at all; stage 3 uses it to
            // separate the roles it may restyle freely from the one it must
            // correct either way. The ink is resolved for both cases, so an
            // undeclared house gets the same quiet structural grey a declared
            // one would have got by saying nothing about its ink.
            show: marksSpec.connector ? (marksSpec.connector.presence ?? 'omit') !== 'omit' : false,
            // A connector is not a gridline. It borrows the rule's ink
            // where the house declares none of its own, but it is read as
            // part of the mark, not through it — so it is scaled at the
            // step the house named against whichever of the two inks it
            // gave, and a house whose rules are already pale states a
            // `connector` ink rather than fading a faint grey further.
            //
            // Where the house declares no connector at all there is no step
            // to scale and no ink to borrow that is not the grid's, and grid
            // ink is too faint: a bridge carries the reading, so it has to
            // sit clearly above the lines drawn *through* the plot even while
            // it stays below the marks. The three houses that do state a
            // connector ink put it at very nearly the same place — about
            // 45% of the way from the axis-label ink toward the plot surface
            // (mckinsey 0.48, powerbi 0.47, powerbi-light 0.26) — so a silent
            // house is given the same relationship against its own two inks.
            color: marksSpec.connector
                ? ink(
                    marksSpec.connector.presence,
                    structureInk.connector ?? structureInk.rule,
                    'quiet',
                ) ?? undefined
                : mixHex(axisLabelText.color ?? foreground, plot, 0.45, foreground),
            width: marksSpec.connector?.weight ?? 1,
            // A stem and a bridge are one setting only in the sense that
            // both are drawn in structure's ink. What they are worth
            // differs: a stem repeats a position already plotted, a bridge
            // draws a distance that is plotted nowhere else. So a house
            // that says nothing about the bridge is not silent about it
            // either — it has already said what a mark of its own weighs.
            spanWidth: marksSpec.connector?.spanWeight ?? (marksSpec.strokeWeight ?? 2),
            ...(marksSpec.connector?.style && marksSpec.connector.style !== 'solid'
                ? { dash: marksSpec.connector.style === 'dotted' ? [1, 2] : [4, 3] }
                : {}),
        },
        interval: marksSpec.interval
            ? {
                fillOpacity: marksSpec.interval.fillOpacity,
                edge: (marksSpec.interval.edge ?? 'omit') !== 'omit',
            }
            : undefined,
        summary: marksSpec.summary
            ? {
                fill: (marksSpec.summary.fill ?? 'full') !== 'omit',
                outline: (marksSpec.summary.outline ?? 'full') !== 'omit',
                centralRule: (marksSpec.summary.centralRule ?? 'full') !== 'omit',
                widthFraction: marksSpec.summary.widthFraction,
            }
            : undefined,
        reference: marksSpec.reference
            ? {
                show: (marksSpec.reference.presence ?? 'omit') !== 'omit',
                width: marksSpec.reference.weight ?? 1,
                style: marksSpec.reference.style,
                label: marksSpec.reference.label === true,
            }
            : undefined,
        zOrder: marksSpec.zOrder ?? 'summaryOverData',
        sizeRange: marksSpec.sizeRange,
        minSize: marksSpec.minSize,
        observations: marksSpec.observations
            ? {
                expose: marksSpec.observations.expose ?? 'never',
                maxRows: marksSpec.observations.maxRows ?? 500,
            }
            : undefined,
        redundantChannels: marksSpec.redundantChannels ?? [],
        redundantEncoding: marksSpec.redundantEncoding ?? 'never',
        redundant: groundRedundancy(marksSpec, series, signals,
            legendShow && (placement === 'seriesEnd' || placement === 'inline'), say),
    };

    // --- facets -------------------------------------------------------------
    const facetSpec = theme.facets ?? {};
    const headerPresence = facetSpec.header?.presence ?? 'full';
    const facets: DesignDecisions['facets'] = {
        header: {
            show: headerPresence !== 'omit',
            fieldTitle: (facetSpec.header?.fieldTitle ?? 'omit') === 'always',
            ...keyLabel,
            color: headerPresence === 'emphasised' ? text.primary : keyLabel.color,
        },
        panelFrame: (facetSpec.panelFrame ?? 'omit') !== 'omit',
        axisRepetition: facetSpec.axisRepetition ?? 'everyPanel',
        spacing: facetSpec.spacing === 'compact' ? 8 : facetSpec.spacing === 'airy' ? 24 : undefined,
        preferredColumns: facetSpec.preferredColumns,
    };

    // --- layout -------------------------------------------------------------
    const density = theme.layout?.density ?? 'normal';
    const densityPadding = density === 'compact' ? 8 : density === 'airy' ? 20 : 12;

    // A house that paints its canvas has drawn a rectangle, and the padding
    // stops being empty space: it becomes that rectangle's margin, a visible
    // edge with the ink measured against it. On plain white the same number is
    // invisible — the page's whitespace runs straight through it, so ink
    // sitting 8px from the boundary still looks like it has all the room in
    // the world, because there is no boundary to see.
    //
    // Against a painted edge it does not. The nearest ink to the boundary is
    // almost always an axis tick label, and a margin narrower than the type it
    // surrounds reads as a crop rather than a frame. That is exactly what the
    // dark house was doing: `compact` density gave it 8px, its tick labels are
    // 10px, and the numbers looked shaved off the bottom of the panel.
    //
    // So a painted canvas is held to a floor of one and a half label heights
    // on all four sides — the usual margin for framed type, and derived from
    // the type rather than picked, because it is that type the margin has to
    // clear. A house already breathing wider than the floor keeps its own
    // number: density is still the house's voice, and this only stops that
    // voice from cropping itself.
    const padding = isPaintedSurface(canvas)
        ? Math.max(densityPadding, Math.round((axisLabelText.fontSize ?? 10) * 1.5))
        : densityPadding;

    return {
        themeId: theme.id ?? 'flint',
        surface: { canvas, plot, panel },
        text,
        font: bodyFamily,
        title: {
            anchor: theme.layout?.titleBlock?.anchor ?? 'start',
            position: theme.layout?.titleBlock?.position ?? 'top',
            headline,
            deck,
            offset: Math.round((headline.fontSize ?? 14) * TITLE_GAP[theme.layout?.titleBlock?.gap ?? 'normal']),
            deckPadding: Math.round((deck.fontSize ?? 11) * DECK_GAP[theme.layout?.titleBlock?.deckGap ?? 'normal']),
        },
        axes,
        frame,
        baseline,
        series,
        legend: {
            show: legendShow,
            placement,
            ...(fallbacks.length ? { fallbacks } : {}),
            orient: legendOrient,
            direction: theme.legend?.direction
                ?? (legendOrient === 'top' || legendOrient === 'bottom' ? 'horizontal' : 'vertical'),
            title: legendTitle,
            label: keyLabel,
            gradientLength: legendSpec.gradientLength,
            maxSwatches: legendSpec.maxSwatches,
        },
        dataLabels: {
            show: dlShow,
            possible: labelable && readableAtAll,
            placement: dlPlacement,
            inkMode: dlInkMode,
            text: valueLabel,
            format: numberFormat,
            ...(valueUnit ? { unit: valueUnit } : {}),
            insideMinValue,
            outsideMaxValue,
            ...(segmentMinShare !== undefined ? { segmentMinShare } : {}),
        },
        // A house that dots the end of a line is saying where the story stops.
        // Only the policy is decided here: whether the chart *has* a line to
        // dot is a question about the backend spec, and stage 3 answers it.
        pointEmphasis: (theme.annotation?.pointEmphasis ?? 'never') !== 'never'
            ? {
                where: theme.annotation!.pointEmphasis as 'endpoints' | 'latest' | 'extremes',
                labels: theme.annotation?.pointLabels ?? 'never',
                size: (marks.strokeWidth || 2) * 14,
            }
            : undefined,
        marks,
        facets,
        layout: { padding, density, plotWidth: ctx.layout.subplotWidth, xStep: ctx.layout.xStep },
        statistics: theme.annotation?.statistics?.show?.length
            ? {
                show: theme.annotation.statistics.show,
                placement: theme.annotation.statistics.placement ?? 'panel',
                ...axisLabelText,
            }
            : undefined,
        furniture: theme.furniture ?? [],
        bound: {
            measureChannels: bindings.measureChannels,
            categoricalChannel: bindings.categoricalChannel,
            seriesChannel: bindings.seriesChannel,
            seriesField,
            categoryField: catField,
            seriesCount: signals.seriesCount,
            categoryCount: signals.categoryCount,
            isFaceted: signals.isFaceted,
            isPartToWhole: signals.isPartToWhole,
            isSigned: signals.isSigned,
            markChannel: signals.markChannel,
        },
        report,
    };
}

// ---------------------------------------------------------------------------
// Series ink
// ---------------------------------------------------------------------------

/** WCAG contrast between two colours, `1` for identical. */
function contrastRatio(a: string, b: string): number {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (!ca || !cb) return 21;
    const la = luminance(ca);
    const lb = luminance(cb);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The least contrast at which a filled cell still reads as a cell. */
const ENDPOINT_CONTRAST = 1.2;

/**
 * Keep a ramp's ends off the page.
 *
 * A ramp that starts a shade away from the surface makes its smallest values
 * disappear, and “least” then looks like “no data”. Where the house asks for
 * endpoints that stand against the surface, an end too close to it is pulled
 * away until it can be seen — the hue is the house's, only its distance from
 * the page is not.
 */
function offSurface(
    ramp: Ramp | undefined,
    surface: string,
    say: (path: string, message: string) => void,
): Ramp | undefined {
    if (!ramp?.stops?.length || ramp.endpointsAgainstSurface !== true) return ramp;
    const away = isDarkSurface(surface) ? '#ffffff' : '#000000';
    const stops = ramp.stops.slice();
    let moved = false;
    for (const i of [0, stops.length - 1]) {
        if (contrastRatio(stops[i], surface) >= ENDPOINT_CONTRAST) continue;
        for (let t = 0.05; t <= 0.6; t += 0.05) {
            const candidate = mixHex(stops[i], away, t, stops[i]);
            if (contrastRatio(candidate, surface) >= ENDPOINT_CONTRAST) {
                stops[i] = candidate;
                moved = true;
                break;
            }
        }
    }
    if (!moved) return ramp;
    say('ink.series.endpointsAgainstSurface',
        'a ramp end sat too close to the surface to be seen as a value — it was pulled away from the page');
    return { ...ramp, stops };
}

function groundSeriesInk(
    theme: ThemeSpec,
    ctx: GroundingContext,
    bindings: Bindings,
    signals: Signals,
    say: (path: string, message: string) => void,
): ResolvedSeriesInk {
    const s = theme.ink?.series ?? {};
    const selection = s.selection ?? {};
    const categorical = s.categorical ?? [];
    const extended = s.categoricalExtended ?? [];
    const single = s.single ?? categorical[0] ?? theme.ink?.accent ?? '#4c78a8';
    const surfaceColour = theme.ink?.surface?.plot ?? theme.ink?.surface?.canvas ?? '#ffffff';

    // The house may name a larger indexed set for higher cardinality (Tableau
    // 10→20). Rank the tiers by capacity so we can reach for the smallest one
    // that still gives every series its own ink.
    const tiers = [categorical, extended]
        .filter((t) => t.length > 0)
        .sort((a, b) => a.length - b.length);
    const largestTier = tiers.length ? tiers[tiers.length - 1] : categorical;

    const seriesChannel = bindings.seriesChannel;
    const seriesField = channelFact(ctx, seriesChannel)?.field;
    const seriesType = channelFact(ctx, seriesChannel)?.type;
    const count = signals.seriesCount;

    const base: ResolvedSeriesInk = {
        mode: 'single',
        single,
        categorical,
        overflow: s.overflow,
        status: s.status,
    };

    if (!seriesField || (signals.seriesCountKnown && count <= 1)) {
        // A single-series chart still needs an ink, and there is exactly one
        // right answer: the house's single-series colour.
        return base;
    }
    if (!signals.seriesCountKnown) {
        say('ink.series',
            `\`${seriesField}\` is created by a backend transform — the whole categorical set is offered rather than guessing a count`);
    }

    const facetField = bindings.facetChannel ? ctx.channelSemantics[bindings.facetChannel]?.field : undefined;
    if (selection.redundantWithFacet === 'single' && facetField && facetField === seriesField) {
        say('ink.series.selection.redundantWithFacet',
            'series colour collapsed to single — the facet already names the series');
        return base;
    }

    // Continuous series: a ramp, not an indexed set.
    if (seriesType === 'quantitative') {
        // Signed values normally use a diverging ramp, but a house may
        // deliberately read the field as ordered magnitude instead. McKinsey
        // does this on heatmaps: one navy sequence plus printed values, rather
        // than introducing a warm ink the house does not otherwise own.
        const signedSequential = signals.isSigned && selection.signed === 'sequential';
        const diverging = signals.isSigned && !signedSequential && Boolean(s.diverging);
        const ramp: Ramp | undefined = offSurface(diverging ? s.diverging : s.sequential, surfaceColour, say);
        if (ramp?.stops?.length) {
            const consumption = ramp.consumption ?? 'interpolate';
            const quantize = consumption === 'quantize' ? (ramp.quantizeCount ?? 5) : undefined;
            return {
                ...base,
                mode: diverging ? 'diverging' : 'sequential',
                ramp,
                quantize,
                range: quantize ? sampleRamp(ramp.stops, quantize) : ramp.stops.slice(),
            };
        }
        say('ink.series', 'no ramp declared for a continuous series — one is built from the house ink');
        // An indexed set is never the right answer for a continuous field: it
        // says "different" where the data says "more". If the house has not
        // declared a ramp, the honest fallback is a ramp of its own colour,
        // from a tint of it to the colour itself.
        const surface = theme.ink?.surface?.canvas ?? '#ffffff';
        const stops = [mixHex(single, surface, 0.85), single];
        return {
            ...base,
            mode: 'sequential',
            ramp: { stops },
            range: stops,
        };
    }

    if (signals.isPartToWhole && selection.partToWhole === 'sequentialRamp' && s.sequential?.stops?.length) {
        // A single-hue ramp names a part-to-whole cleanly only while the slices
        // stay as few as the ramp has control points. Sampled past that, the
        // adjacent shades blur into one another and the wheel reads as a smear
        // of near-identical tints — worse than distinct hues, and it also skips
        // the "Others" tail a large pie needs. Up to the ramp's resolution the
        // house keeps its monochrome part-to-whole look; beyond it, fall through
        // to the indexed set (distinct hues + an Others fold) so every slice
        // stays nameable.
        const rampResolution = s.sequential.stops.length;
        if (!signals.seriesCountKnown || count <= rampResolution) {
            // One ramp, consumed as an indexed set: the largest share takes the
            // darkest end, so the ramp is sampled in reverse.
            const ramp = offSurface(s.sequential, surfaceColour, say)!;
            const range = sampleRamp(ramp.stops, Math.max(2, count)).reverse();
            return { ...base, mode: 'sequential', ramp, range };
        }
        say('ink.series.selection.partToWhole',
            `${count} slices exceed the ${rampResolution}-stop ramp's resolution — distinct hues name them better than shades, so the indexed set stands`);
    }

    if (signals.isSigned && s.status && selection.signed === 'status' && selection.statusUse !== 'never') {
        if (selection.statusUse === 'thresholdOnly') {
            say('ink.series.selection.statusUse',
                'status ink withheld — `thresholdOnly` and no threshold was declared');
        } else {
            return { ...base, mode: 'status' };
        }
    }

    if (signals.isSigned && selection.signed === 'diverging' && s.diverging?.stops?.length) {
        const ramp = offSurface(s.diverging, surfaceColour, say)!;
        return {
            ...base,
            mode: 'diverging',
            ramp,
            range: sampleRamp(ramp.stops, Math.max(2, count)),
        };
    }

    // An *ordered* series is not an indexed set. Categories that run from
    // "a great deal" to "none at all" have a direction, and an unordered
    // palette throws it away. One ramp, sampled to the number of steps.
    if (seriesType === 'ordinal') {
        const ramp: Ramp | undefined = offSurface(
            s.sequential?.stops?.length ? s.sequential : s.diverging, surfaceColour, say);
        if (ramp?.stops?.length && signals.seriesCountKnown) {
            say('ink.series', 'the series is ordered — the house ramp is sampled across it rather than an unordered set');
            return {
                ...base,
                mode: 'sequential',
                ramp,
                range: sampleRamp(ramp.stops, Math.max(2, count)),
            };
        }
    }

    if (signals.seriesCountKnown && count > categorical.length && categorical.length > 0) {
        // Auto-upsize: an extended tier that still names every series is the
        // right answer — reach for the smallest one that covers the count.
        const fittingTier = tiers.find((t) => count <= t.length);
        if (fittingTier && fittingTier.length > categorical.length) {
            say('ink.series.categorical',
                `${count} series past the core ${categorical.length} inks — the house's extended ${fittingTier.length}-colour set is used so each stays distinct`);
            return { ...base, categorical: fittingTier, mode: 'categorical' };
        }

        if (s.overflow) {
            // Past even the extended set. The top inks by prominence name the
            // largest series; every remaining ("other") series folds into the
            // one overflow ink. Realization orders the domain by share so it is
            // the smallest series that go grey, read as a single tail.
            say('ink.series.categorical',
                `${count} series past the house's ${largestTier.length} inks — the largest ${largestTier.length} keep a colour, the rest fold into one "other" ink`);
            return { ...base, categorical: largestTier, mode: 'categorical', overflowTail: true };
        } else if (ctx.namesOnMarks === true) {
            // The chart prints the series name on the mark (a slopegraph's end
            // labels, a house that asked for it), so the names are already on
            // the page in words. Colour was never the key here; keeping a
            // foreign palette only spreads seven hues across seven lines and
            // seven labels that say the same thing the words do. One ink, and
            // the reader reads the names.
            say('ink.series.categorical',
                `${count} series against ${largestTier.length} house inks, but the house names them on the mark — colour stops naming and takes the single ink`);
            return { ...base, mode: 'single' };
        } else {
            // An indexed set has a capacity, and past it the colours stop
            // being names: two different series come out the same ink and the
            // key lies. A house that declares six and no overflow ink has not
            // said what the twenty-fifth thing looks like, and cycling is not
            // an answer — it is the same answer twice.
            say('ink.series.categorical',
                `${count} series and the house declares ${largestTier.length} with no overflow ink — colour cannot name them all, so the scale already on the chart stands`);
            return { ...base, categorical: largestTier, mode: 'categorical', exhausted: true };
        }
    }
    return { ...base, mode: 'categorical' };
}

// ---------------------------------------------------------------------------
// Redundant encoding
// ---------------------------------------------------------------------------

/**
 * Shape and dash exist to carry the series identity when colour cannot: in
 * mono print, for a colour-blind reader, or simply when there are more series
 * than the house has inks. They are only meaningful for an indexed set — a
 * ramp is read as a quantity, and doubling it with shapes says nothing.
 */
function groundRedundancy(
    marksSpec: NonNullable<ThemeSpec['marks']>,
    series: ResolvedSeriesInk,
    signals: Signals,
    directlyLabeled: boolean,
    say: (path: string, message: string) => void,
): { shape: boolean; dash: boolean } {
    const off = { shape: false, dash: false };
    const policy = marksSpec.redundantEncoding ?? 'never';
    const channels = marksSpec.redundantChannels ?? [];
    if (policy === 'never' || channels.length === 0) return off;
    if (series.mode !== 'categorical') return off;
    const effectiveCount = signals.seriesCountKnown ? signals.seriesCount : series.categorical.length;
    if (effectiveCount <= 1) return off;

    if (policy === 'whenNeeded') {
        const strained = effectiveCount > series.categorical.length;
        if (!strained) {
            say('marks.redundantEncoding',
                '`whenNeeded` withheld — the house has a distinct ink for every series');
            return off;
        }
        // Even with more series than inks, a redundant channel earns its noise
        // only if the reader needs it to tell the series apart. When each series
        // is named at its own mark — a line labelled at its end, a band at its
        // last reading — that identity is already carried, and a dash spread
        // over a dense path degrades into texture rather than a distinguishing
        // mark. The name does the work `whenNeeded` was reaching for.
        if (directlyLabeled) {
            say('marks.redundantEncoding',
                '`whenNeeded` withheld — each series is named at its own mark, so nothing else need tell them apart');
            return off;
        }
    }
    const unsupported = channels.filter((c) => c === 'texture' || c === 'lightness');
    if (unsupported.length) {
        say('marks.redundantChannels', `${unsupported.join(', ')} not realizable — ignored`);
    }
    return { shape: channels.includes('shape'), dash: channels.includes('dash') };
}

// ---------------------------------------------------------------------------
// Number format
// ---------------------------------------------------------------------------

/**
 * The format a printed value is rendered with.
 *
 * The house states a *style* — group the thousands, use a k/M suffix, always
 * show the sign — and a style says nothing about how many digits follow. Left
 * open, `~s` prints `1.23457M` and a bare `,` prints `3.14159265`: the mark
 * gets a number longer than itself and the reader gets precision they cannot
 * use. So a house's stated precision is honoured, and a precision the house
 * left open is inferred from the data.
 *
 * With no house at all there is still a format, which is the change of
 * substance here: the alternative is Vega-Lite's raw rendering, and that is
 * how a tidy chart ends up captioned `0.00123456`.
 */
function groundNumberFormat(
    theme: ThemeSpec,
    ctx: GroundingContext,
    measureChannel: 'x' | 'y' | undefined,
    values: number[],
): { pattern: string | undefined; inferred: boolean } {
    const nf = theme.annotation?.numberFormat;
    const sem = measureChannel ? ctx.channelSemantics[measureChannel] : undefined;
    const isPercent = typeof sem?.format?.suffix === 'string' && sem.format.suffix.includes('%');

    let house: string | undefined;
    if (nf) {
        const sign = nf.signed ? '+' : '';
        if (nf.thousands === 'suffix') house = `${sign}~s`;
        else {
            const group = nf.thousands === 'separator' ? ',' : '';
            const precision = nf.precision === 'integer' ? '.0'
                : nf.precision === 'one' ? '.1'
                    : nf.precision === 'two' ? '.2'
                        : undefined;
            house = precision === undefined
                ? (group ? `${sign}${group}` : (sign || undefined))
                : `${sign}${group}${precision}${isPercent ? 'f' : 'f'}`;
        }
    }
    // A field already carrying its own percent formatting is left alone: the
    // semantics decided how that number reads, and re-deriving it here would
    // print a share of a share.
    if (isPercent) return { pattern: house, inferred: false };
    const pattern = inferValueLabelFormat(values, house);
    return { pattern, inferred: pattern !== house };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}
