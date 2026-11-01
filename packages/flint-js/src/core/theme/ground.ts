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
    RuleSpec,
    AxisRole,
    SeriesMarkFamily,
    ThemeInk,
    ResolvedMarks,
    ResolvedText,
    SizeToken,
    ThemeGeometry,
    ThemeGuard,
    ThemeMarks,
    ReportDeparture,
    ThemeReport,
    ThemeSpec,
    TexturePattern,
    TypeRole,
} from './types.js';

const TEXTURE_PATTERNS: TexturePattern[] = ['solid', 'diagonal', 'antidiagonal', 'horizontal', 'vertical', 'cross', 'dots'];
import {
    contrastingInk,
    contrastRatio,
    readableTextInk,
    isDarkSurface,
    isPaintedSurface,
    lightness,
    mixHex,
    parseColor,
    presenceWidth,
    resolvePresenceInk,
    sampleRamp,
    sampleRampBins,
} from './presence.js';
import { resolveDisplayUnit } from '../field-semantics.js';
import { getRegistryEntry, isRegistered } from '../type-registry.js';
import { alreadyNamed } from '../title-plan.js';
import { namedAsItsKind, selfNamingKind } from '../self-naming-values.js';
import { inferValueLabelFormat } from './value-label-format.js';
import { categoriesSplitBySign, categorySignRoles } from './series-sign.js';
import { COMPACT_SUFFIXES, DEFAULT_COMPACT_TYPES, compactApplies, compactPrint, type CompactPrint, type CompactRule } from '../number-compact.js';
import { deepMerge } from './merge.js';
import { overflowStaysFlat, resolveLabelOverflow } from '../axis-labels.js';
import { sequenceKindOf } from '../label-sequence.js';
import type { TextMeasurer } from '../legend-layout.js';
import { axisRoles, type AxisFieldFacts } from '../axis-roles.js';
import { boundValueInks, chartValueColors } from '../value-colors.js';
import { LABEL_GAP, LABEL_INSET, LABEL_SIDE, LINE_SLACK, measureValueLabels } from '../value-label-measure.js';
import { isGapSize, type GroupSpacing } from '../group-gaps.js';

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
    /** How the renderer measures text; unset reads the width table. */
    measureText?: TextMeasurer;
    /** Template's `markCognitiveChannel`, widened for `angle`/`text` families. */
    markChannel: string;
    /** Mark families present in the instantiated chart, e.g. `['bar','text']`. */
    markTypes: string[];
    /** The resolved `showSeriesInLabel`: the chart names its series on the marks. */
    namesOnMarks?: boolean;
    /** The chart names each series where it is drawn and draws them all in the single ink. */
    seriesOneInk?: boolean;
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
        /**
         * Whatever colour-like channel a data mark carries, wherever it sits. A series the chart
         * derives itself is named by `field` and marked `derived`: it is never looked up in the rows.
         */
        color?: { type?: string; field?: string; derived?: boolean };
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
        /** The x band labels the layout fitted, where it wrapped them. */
        xLabel?: { labelLines?: string[][]; labelAngle?: number };
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
    /** The chart's own overflow sequence for its x names (`chartProperties.labelOverflow`), over the theme's. */
    labelOverflow?: unknown;

    /** The signal through which a live layout re-plans value labels for the rows in view. */
    liveLayoutSignal?: string;

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
/** How far a zero rule a house states plainly steps from its grid's ink toward its axis ink: 'full', and 'quiet'. */
const ZERO_STEP = 0.5;
const ZERO_STEP_QUIET = 0.3;

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
                code: 'compile-default-overridden',
                message: `the house prefers \`${key}: ${JSON.stringify(value)}\`, but the chart states its own — the chart's stands`,
            });
            continue;
        }
        merged[key] = value;
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
    readsData: (key: string) => boolean,
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
                code: 'chart-default-not-offered',
                message: `the house asks for \`${key}\`, which \`${chartType}\` does not offer — dropped`,
            });
            continue;
        }
        if (readsData(key)) {
            report.push({
                stage: 'ground',
                path: `chartDefaults.${chartType}.${key}`,
                code: 'chart-default-dropped',
                message: `the house asks for \`${key}\`, which changes how the data is read, not how the chart looks — dropped`,
            });
            continue;
        }
        if (authored?.[key] !== undefined) {
            report.push({
                stage: 'ground',
                path: `chartDefaults.${chartType}.${key}`,
                code: 'chart-default-overridden',
                message: `the house prefers \`${key}: ${JSON.stringify(value)}\`, but the chart already states one — the chart's own setting stands`,
            });
            continue;
        }
        target[key] = value;
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
            edge: marks.areaEdge?.presence,
            edgeWidth: marks.areaEdge?.width,
        },
        band: {
            fraction: marks.bandFraction,
            ...(marks.group ? { group: marks.group } : {}),
            cornerRadius: marks.cornerRadius,
            opacity: marks.barOpacity,
            outline: marks.outline?.presence,
            outlineWidth: marks.outline?.weight,
        },
        arc: {
            cornerRadius: marks.cornerRadius,
            gap: marks.slice?.gap,
            gapStyle: marks.slice?.gapStyle,
            order: marks.arc?.order,
            startAngle: marks.arc?.startAngle,
            hole: marks.arc?.hole,
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
/**
 * What the caller asked for on value labels, in one word. `showValueLabels` is the control;
 * `showTextLabels` is the older spelling some templates and hosts still pass, where only `true`
 * means anything.
 */
export function resolveValueLabelChoice(chartProperties: Record<string, any> | undefined): 'on' | 'off' | undefined {
    const choice = chartProperties?.showValueLabels;
    if (typeof choice === 'boolean') return choice ? 'on' : 'off';
    return chartProperties?.showTextLabels === true ? 'on' : undefined;
}

/** A title's headline and deck as one line of text. */
export function headlineText(title: { text?: unknown; subtitle?: unknown } | string | undefined): string | undefined {
    if (!title) return undefined;
    const parts: string[] = [];
    const push = (v: any) => {
        if (typeof v === 'string') parts.push(v);
        else if (Array.isArray(v)) v.forEach(push);
    };
    if (typeof title === 'string') push(title);
    else { push(title.text); push(title.subtitle); }
    return parts.length ? parts.join(' ') : undefined;
}

/**
 * How many ticks a measure axis carries along `span` pixels. How finely a ruler is graduated is a
 * house matter: roughly one label every 45px reads as ordinary, one every 60px as quiet. Three is
 * the floor; two gradations is not a ruler.
 */
export function measureTickCount(span: number, density: 'sparse' | 'normal' | 'dense' | undefined): number {
    return Math.max(3, Math.round(span / measureTickSpacing(density)));
}

/** The px between labels a measure axis is graduated at for a house's density. */
export function measureTickSpacing(density: 'sparse' | 'normal' | 'dense' | undefined): number {
    return density === 'sparse' ? 60 : density === 'dense' ? 30 : 45;
}

/** The face a theme sets text in where a role names none of its own. */
export function themeBodyFamily(theme: Pick<ThemeSpec, 'type'>): string | undefined {
    return theme.type?.axisLabel?.family ?? theme.type?.valueLabel?.family ?? theme.type?.headline?.family;
}

/** The share of its band a bar fills: the theme's band geometry, else what the layout's step padding leaves. */
export function resolveBandFraction(
    theme: ThemeSpec,
    chartType: string,
    geometryKinds: GeometryKind[] | undefined,
    stepPadding: number | undefined,
): number {
    const marks = geometryToMarks(resolveGeometry(theme, chartType, geometryKinds).geometry, theme.marks);
    return marks?.bandFraction ?? (1 - (stepPadding ?? 0.1));
}

/** The group spacing a theme resolves to for a chart, as grounding resolves it (without reports). */
export function resolvedGroupSpacing(theme: ThemeSpec, chartType: string, geometryKinds: GeometryKind[] | undefined): GroupSpacing {
    const marks = geometryToMarks(resolveGeometry(theme, chartType, geometryKinds).geometry, theme.marks);
    return groundGroupSpacing(marks?.group, () => undefined);
}

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

    // An area's wash and a bar's fill are two opacities (M2): a band's reaches bars, an area's areas.
    if (area?.opacity !== undefined) marks.fillOpacity = area.opacity;
    if (band?.opacity !== undefined) marks.barOpacity = band.opacity;
    if (band?.minLength !== undefined) marks.barMinLength = band.minLength;
    if (area?.fill !== undefined || line?.wash !== undefined || line?.washOpacity !== undefined) {
        marks.gradient = {
            ...(marks.gradient ?? {}),
            ...(area?.fill !== undefined ? { area: area.fill } : {}),
            ...(line?.wash !== undefined ? { lineWash: line.wash } : {}),
            ...(line?.washOpacity !== undefined ? { washOpacity: line.washOpacity } : {}),
        };
    }
    if (cell?.opacity !== undefined) marks.fillOpacity = cell.opacity;

    if (band?.fraction !== undefined) marks.bandFraction = band.fraction;
    if (band?.group !== undefined) marks.group = { ...(marks.group ?? {}), ...band.group };
    if (band?.cornerRadius !== undefined) marks.cornerRadius = band.cornerRadius;
    if (arc?.cornerRadius !== undefined) marks.cornerRadius = arc.cornerRadius;

    if (point) {
        const resolved = { ...(marks.point ?? {}) };
        if (point.presence !== undefined) resolved.presence = point.presence;
        if (point.size !== undefined) resolved.size = point.size;
        if (point.vertexSize !== undefined) resolved.secondarySize = point.vertexSize;
        if (point.fill !== undefined) resolved.fill = point.fill;
        if (point.shape !== undefined) resolved.shape = point.shape;
        if (point.opacity !== undefined) resolved.opacity = point.opacity;
        if (point.ink !== undefined) resolved.ink = point.ink;
        if (point.density !== undefined) resolved.density = point.density;
        if (point.halo !== undefined) resolved.halo = { ...(resolved.halo ?? {}), ...point.halo };
        if (Object.keys(resolved).length) marks.point = resolved;
    }

    // An area's edge is its own line, in its own ink (M1): it never becomes an outline round bars,
    // wedges and dots.
    if (area?.edge !== undefined || area?.edgeWidth !== undefined) {
        marks.areaEdge = {
            ...(marks.areaEdge ?? {}),
            ...(area.edge !== undefined ? { presence: area.edge } : {}),
            ...(area.edgeWidth !== undefined ? { width: area.edgeWidth } : {}),
        };
    }
    const outlinePresence = band?.outline;
    const outlineWidth = band?.outlineWidth ?? point?.outlineWidth;
    if (outlinePresence !== undefined || outlineWidth !== undefined || band?.outlineInk !== undefined) {
        marks.outline = {
            ...(marks.outline ?? {}),
            ...(band?.outlineInk !== undefined ? { source: band.outlineInk } : {}),
            ...(outlinePresence !== undefined ? { presence: outlinePresence } : {}),
            ...(outlineWidth !== undefined ? { weight: outlineWidth } : {}),
        };
    }

    if (arc?.order !== undefined || arc?.startAngle !== undefined || arc?.hole !== undefined) {
        marks.arc = {
            ...(marks.arc ?? {}),
            ...(arc.order !== undefined ? { order: arc.order } : {}),
            ...(arc.startAngle !== undefined ? { startAngle: arc.startAngle } : {}),
            ...(arc.hole !== undefined ? { hole: arc.hole } : {}),
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

const WEIGHTS: Record<string, number> = {
    thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
};

/** A TypeRole weight as the CSS number: a name from the scale, or a number rounded to it. */
export function fontWeightOf(weight: TypeRole['weight'] | undefined): number | undefined {
    if (weight == null) return undefined;
    if (typeof weight === 'number') return Number.isFinite(weight) ? Math.min(900, Math.max(100, Math.round(weight / 100) * 100)) : undefined;
    return WEIGHTS[weight];
}

/** The px size a theme size token (`text.200`) or number stands for; undefined for an unknown token. */
export function tokenToPx(size: SizeToken | undefined): number | undefined {
    if (size == null) return undefined;
    if (typeof size === 'number') return size;
    const m = /^text\.(.+)$/.exec(size);
    if (m && TEXT_TOKENS[m[1]] != null) return TEXT_TOKENS[m[1]];
    const n = Number(size);
    return Number.isFinite(n) ? n : undefined;
}

/** A type role as drawn: its family (else the theme's body family), size for the room, weight, style, ink and case. */
function resolveTextRole(
    theme: ThemeSpec, role: TypeRole | undefined, fallbackSize: number, fallbackColor: string, availableWidth: number,
): ResolvedText {
    return {
        font: role?.family ?? themeBodyFamily(theme),
        fontSize: resolveThemeFontSize(theme, role?.size, fallbackSize, availableWidth),
        fontWeight: fontWeightOf(role?.weight),
        fontStyle: role?.style === 'italic' ? 'italic' : undefined,
        color: role?.color ?? fallbackColor,
        ...(role?.case && role.case !== 'asIs' ? { textCase: role.case } : {}),
    };
}

export function resolveThemeFontSize(theme: ThemeSpec, size: SizeToken | undefined, fallback: number, availableWidth: number): number {
    const targetWidth = theme.layout?.targetWidth ?? 300;
    const scale = clamp(Math.pow((availableWidth || targetWidth) / targetWidth, 0.3), 0.85, 1.2);
    return Math.max(theme.type?.minSize ?? 8, Math.round((tokenToPx(size) ?? fallback) * scale * 2) / 2);
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
const DISTRIBUTION_SHAPE_CHARTS = new Set(['Violin Plot', 'Density Plot', 'Ridgeline Plot', 'Marginal Plot']);
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
// gives an action title room to breathe (a slide exhibit). The gap sets the
// title block apart from the chart: under a deck it is the space of more than
// one deck line, so the deck and the labels below it do not read as one column
// of text, even at `tight`.
const TITLE_GAP: Record<'tight' | 'normal' | 'loose', number> = { tight: 0.7, normal: 1.25, loose: 2 };
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

/** Whether a number format already writes the unit: a d3 `%` pattern prints its own percent sign. */
function formatPrintsUnit(pattern: string | undefined, unit: string): boolean {
    return unit === '%' && /%$/.test(pattern ?? '');
}

function displayUnit(ctx: GroundingContext, channel: string) {
    const sem = ctx.channelSemantics?.[channel];
    return resolveDisplayUnit(sem?.semanticAnnotation);
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
    if (typeof semanticType !== 'string' || semanticType === 'Unknown' || !isRegistered(semanticType)) {
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
 * Whether a key's names need no title over them, on proof only — a title the reader did not need
 * costs a line, one they needed and did not get leaves the colours unread. Proof is the headline or
 * deck already naming the field, or every value proving one closed kind (months, years, countries,
 * US states, continents; never codes) under a field name that says no more than that kind (`Country`
 * over country names; not `Origin`). What the field is typed as proves nothing: a type is a label,
 * not what the reader sees.
 */
function keyNamesItselfOf(ctx: GroundingContext, channel: string | undefined): boolean {
    if (!channel) return false;
    const field = ctx.channelSemantics?.[channel]?.field;
    if (!field) return false;
    if (ctx.headline && alreadyNamed(field, ctx.headline)) return true;
    const kind = selfNamingKind(ctx.table.map((row) => row?.[field]));
    return Boolean(kind && namedAsItsKind(field, kind));
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
    const fieldFacts = (channel: 'x' | 'y'): AxisFieldFacts => ({
        present: channelPresent(ctx, channel),
        type: channelType(ctx, channel),
        banded: ctx.axisFlags?.[channel]?.banded === true,
    });
    const { measureChannels, categoricalChannel } = axisRoles({ x: fieldFacts('x'), y: fieldFacts('y') });

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
        const fact = channelFact(ctx, ch) as { field?: string; derived?: boolean } | undefined;
        const f = fact?.derived ? undefined : fact?.field;
        if (!f) continue;
        for (const row of ctx.table) {
            const v = row?.[f];
            if (typeof v === 'number' && v < 0) { isSigned = true; break; }
        }
        if (isSigned) break;
    }

    const isTemporal = (['x', 'y'] as const).some((ch) => channelType(ctx, ch) === 'temporal');

    const seriesDerived = (channelFact(ctx, b.seriesChannel) as { derived?: boolean } | undefined)?.derived === true;
    const seriesKnown = !seriesDerived && fieldPresent(ctx.table, seriesField);

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
    const say: ReportDeparture = (path, code, message) => report.push({ stage: 'ground', path, code, message });

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
    const bodyFamily = themeBodyFamily(theme);

    const resolveType = (role: TypeRole | undefined, fallbackSize: number, fallbackColor: string): ResolvedText =>
        resolveTextRole(theme, role, fallbackSize, fallbackColor, available);

    const axisLabelText = resolveType(theme.type?.axisLabel, 10, text.secondary);
    const axisTitleText = resolveType(theme.type?.axisTitle, 10, text.secondary);
    const headline = resolveType(theme.type?.headline, 14, text.primary);
    const deck = resolveType(theme.type?.deck, 11, text.secondary);
    const valueLabel = resolveType(theme.type?.valueLabel, 10, text.primary);
    const keyLabel = resolveType(theme.type?.keyLabel, 10, text.secondary);
    // A key's title names a field, as an axis title does: it is set as the house sets those, at its
    // labels' size, unless the house sets key titles apart.
    const axisTitleRole = theme.type?.axisTitle;
    const keyTitleRole = theme.type?.keyTitle;
    const keyTitle: ResolvedText = {
        ...resolveType({
            family: axisTitleRole?.family ?? theme.type?.keyLabel?.family,
            size: theme.type?.keyLabel?.size,
            ...(axisTitleRole?.style ? { style: axisTitleRole.style } : {}),
            ...(axisTitleRole?.color ? { color: axisTitleRole.color } : {}),
            ...keyTitleRole,
        }, 10, text.secondary),
        // Never lighter than bold unless the house says so of key titles: the weight is what tells a
        // title from the entries under it, set in the same face, size and often ink.
        fontWeight: fontWeightOf(keyTitleRole?.weight) ?? Math.max(fontWeightOf(axisTitleRole?.weight) ?? 700, 700),
    };
    // Roles read only where Flint draws their text: a statistic's note, a KPI's big number.
    const annotationText = theme.type?.annotation ? resolveType(theme.type.annotation, 10, text.secondary) : undefined;
    const displayText = theme.type?.display ? resolveType(theme.type.display, 28, text.primary) : undefined;
    // The source line (S1) is set in the footnote role: small, in the secondary ink.
    const footnote = resolveType(theme.type?.footnote, Math.max(9, (axisLabelText.fontSize ?? 10) - 1), text.muted);
    const sourceSpec = theme.source ?? {};
    const sourceRule = sourceSpec.rule && (sourceSpec.rule.presence ?? 'full') !== 'omit'
        ? { width: Math.max(0.5, sourceSpec.rule.width ?? 1), color: sourceSpec.rule.color ?? theme.ink?.structure?.rule ?? theme.ink?.structure?.axis ?? text.muted, ...(sourceSpec.rule.dash ? { dash: sourceSpec.rule.dash } : {}) }
        : undefined;
    // A logo for the credit, at the line's other end only; elsewhere the words stand.
    const statedImage = sourceSpec.credit?.image;
    const imageSrc = statedImage?.src ?? (statedImage?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(statedImage.svg)}` : undefined);
    const creditImage = imageSrc && statedImage && statedImage.width > 0 && statedImage.height > 0
        && (sourceSpec.credit?.placement ?? 'inline') === 'end'
        ? { src: imageSrc, width: statedImage.width, height: statedImage.height } : undefined;
    if (statedImage && !creditImage) {
        say('source.credit.image', 'credit-image-not-drawn', 'a credit logo is drawn only at the line’s other end (`placement: "end"`) with a size and an `svg` or `src` — the credit’s words stand instead');
    }
    const sourceDesign: DesignDecisions['source'] = {
        show: (sourceSpec.show ?? 'whenGiven') !== 'never',
        text: footnote,
        leadIn: sourceSpec.leadIn ?? 'Source:',
        ...(sourceSpec.leadInWeight !== undefined ? { leadInWeight: fontWeightOf(sourceSpec.leadInWeight) } : {}),
        ...(sourceSpec.leadInStyle ? { leadInStyle: sourceSpec.leadInStyle } : {}),
        ...(sourceSpec.leadInCase ? { leadInCase: sourceSpec.leadInCase } : {}),
        align: sourceSpec.align ?? 'start',
        frame: sourceSpec.frame ?? 'content',
        ...(sourceRule ? { rule: sourceRule } : {}),
        ...(sourceSpec.credit?.text ? { credit: {
            text: sourceSpec.credit.text,
            placement: sourceSpec.credit.placement ?? 'inline',
            separator: sourceSpec.credit.separator ?? ' | ',
            ...(sourceSpec.credit.weight !== undefined ? { weight: fontWeightOf(sourceSpec.credit.weight) } : {}),
            ...(creditImage ? { image: creditImage } : {}),
        } } : {}),
        gap: Math.max(0, sourceSpec.gap ?? 8),
    };

    // --- structure ----------------------------------------------------------
    const structure = theme.structure ?? {};
    const structureInk = theme.ink?.structure ?? {};

    const ink = (presence: Presence | undefined, roleInk: string | undefined, fallback: Presence) =>
        resolvePresenceInk({ presence, surface: plot, roleInk, foreground, fallback });

    const rule = (presence: Presence | undefined, roleInk: string | undefined, fallback: Presence, base = 1): ResolvedRule => {
        const color = ink(presence, roleInk, fallback);
        return { show: color !== null, color: color ?? 'transparent', width: presenceWidth(presence ?? fallback, base) };
    };

    const dashOf = (style: 'solid' | 'dashed' | 'dotted' | undefined) =>
        style === 'dashed' ? [3, 3] : style === 'dotted' ? [1, 3] : undefined;
    const gridDash = structure.grid?.dash ?? dashOf(structure.grid?.style ?? 'solid');
    const gridWeight = structure.grid?.weight ?? 1;

    /**
     * A rule the house states (GR2): a presence, or the presence with its own style, dash, weight
     * and ink. An object states a drawn rule, so without a presence it is quiet; what it leaves
     * out it takes from the defaults it is given (the grid's shared style and weight).
     */
    const ruleFrom = (
        stated: RuleSpec | undefined, roleInk: string | undefined, fallback: Presence,
        defaults: { weight?: number; dash?: number[] } = {},
    ): ResolvedRule => {
        const own = typeof stated === 'object' && stated !== null ? stated : undefined;
        const presence = own ? own.presence ?? 'quiet' : stated as Presence | undefined;
        const dash = own?.dash ?? (own?.style ? dashOf(own.style) : defaults.dash);
        return {
            ...rule(presence, own?.color ?? roleInk, fallback, own?.weight ?? defaults.weight ?? 1),
            ...(dash ? { dash } : {}),
        };
    };

    const measureGrid = ruleFrom(structure.grid?.measure, structureInk.grid, 'quiet', { weight: gridWeight, dash: gridDash });
    const categoryGrid = ruleFrom(structure.grid?.category, structureInk.grid, 'omit', { weight: gridWeight, dash: gridDash });
    // Zero is not one gridline among the others: it is where the measure
    // changes sign, and on a chart of lengths it is the line every mark is
    // measured from. A house that wants it stated says so; the default is to
    // let it be an ordinary line.
    //
    // Houses state it, but most state it as a step past the grid, not as an axis: a line a shade
    // darker than the gridlines, at their weight, solid where they are dashed. Only a house that
    // gives zero its own ink, or asks for it emphasised, gets a stronger line.
    const zeroStated = structure.grid?.zero;
    const zeroOwn = typeof zeroStated === 'object' && zeroStated !== null ? zeroStated : undefined;
    const zeroPresence = zeroOwn ? zeroOwn.presence ?? 'quiet' : zeroStated as Presence | undefined;
    const zeroStrong = Boolean(structureInk.zero || zeroOwn?.color) || zeroPresence === 'emphasised';
    const zeroRule: ResolvedRule | undefined = zeroStated && zeroStated !== 'omit' && zeroPresence !== 'omit'
        ? zeroStrong || !measureGrid.show
            ? ruleFrom(zeroStated, structureInk.zero ?? structureInk.rule ?? structureInk.axis, 'full')
            : {
                show: true,
                color: mixHex(measureGrid.color, ink('full', structureInk.rule ?? structureInk.axis, 'full') ?? measureGrid.color, zeroPresence === 'quiet' || zeroPresence === 'hairline' ? ZERO_STEP_QUIET : ZERO_STEP, measureGrid.color),
                width: zeroOwn?.weight ?? measureGrid.width,
                ...(zeroOwn?.dash ? { dash: zeroOwn.dash } : zeroOwn?.style ? { dash: dashOf(zeroOwn.style) } : {}),
            }
        : undefined;
    // Finer lines between the labelled ones, a step fainter than the grid they divide (GR2).
    const minorStated = structure.grid?.minor;
    const minorOwn = typeof minorStated === 'object' && minorStated !== null ? minorStated : undefined;
    const minorRule = minorStated !== undefined && minorStated !== 'omit' && minorOwn?.presence !== 'omit'
        ? ruleFrom(minorOwn ? { ...minorOwn, presence: minorOwn.presence ?? 'hairline' } : minorStated, structureInk.grid, 'hairline', { weight: gridWeight, dash: gridDash })
        : undefined;
    const minorDivisions = Math.max(2, Math.min(10, Math.round(minorOwn?.divisions ?? 2)));
    const minorOn = new Set(minorOwn?.on?.length ? minorOwn.on : ['measure', 'category']);
    // Over the marks or under them: each grid's own word, else the grid's (GR2).
    const layerOf = (stated: RuleSpec | undefined) =>
        ((typeof stated === 'object' && stated !== null ? stated.layer : undefined) ?? structure.grid?.layer) === 'front';
    const measureFront = layerOf(structure.grid?.measure);
    const categoryFront = layerOf(structure.grid?.category);

    const frame = ruleFrom(structure.frame, structureInk.frame ?? structureInk.axis, 'omit');
    // The rule the marks stand on is drawn only where the house states it (A7).
    // A base is at zero: along a floor that is not zero, it would claim a base the chart does not
    // have. Only a house that states it strongly — emphasised, or with its own ink or weight — draws
    // it there too.
    const baselineOwn = typeof structure.baseline === 'object' && structure.baseline !== null ? structure.baseline : undefined;
    const baselineStrong = structure.baseline === 'emphasised' || baselineOwn?.presence === 'emphasised'
        || baselineOwn?.color !== undefined || baselineOwn?.weight !== undefined;
    const baseline = structure.baseline !== undefined
        ? { ...ruleFrom(structure.baseline, structureInk.axis, 'full'), ...(baselineStrong ? { anyFloor: true } : {}) }
        : { show: false, color: 'transparent', width: 0 };

    const truncation = theme.labels?.truncation ?? 'ellipsis';
    // A sequence along x (times, dates, years, ranks) may thin its names to round values; names may not.
    const xSequence = sequenceKindOf(ctx.channelSemantics?.x?.semanticAnnotation?.semanticType) !== undefined;
    // Dates read as snapshots are each a separate observation: every one keeps its name.
    const labelOverflow = resolveLabelOverflow(theme.labels, ctx.labelOverflow, xSequence ? 'sequence' : 'names')
        .filter((step) => !(ctx.channelSemantics?.x?.snapshots && step === 'skip'));
    const labelFlush = theme.labels?.flush === true;
    const axisTitlesPolicy = theme.annotation?.axisTitles ?? 'whenAmbiguous';

    // Which axis the chart is read *along*. Where a category sits on an axis
    // that is the answer; where both axes carry quantities — a connected
    // scatter, a phase plot — the horizontal one still runs the reading order.
    const indexChannel: 'x' | 'y' | undefined = bindings.categoricalChannel
        ?? (bindings.measureChannels.includes('x') && bindings.measureChannels.includes('y') ? 'x' : undefined);

    function buildAxis(channel: 'x' | 'y', role: 'categorical' | 'measure'): ResolvedAxis {
        // What the axis does, then where it is drawn: the screen side's settings override the
        // role's (AX1).
        const sideSpec = structure.axis?.[channel];
        const roleSpec = role === 'measure' ? structure.axis?.measure : structure.axis?.categorical;
        const spec: AxisRole | undefined = roleSpec || sideSpec ? { ...roleSpec, ...sideSpec } : undefined;
        const orient = axisOrient(channel, spec?.placement, channel === indexChannel);

        // The axis a reader indexes the chart *by* is not always the discrete
        // one: a connected scatter has two quantities and still reads left to
        // right. Houses that draw a rule under the categories draw it under
        // that axis too — it is the base the chart stands on, not a ruler for
        // reading values off. So the index axis takes the categorical line
        // even when what it carries is a number.
        const indexing = role === 'categorical' || channel === indexChannel;
        const lineSpec = indexing ? { ...(structure.axis?.categorical ?? roleSpec), ...sideSpec } : spec;
        // The axis's own ink, else the structure's (AX1).
        const axisInk = lineSpec?.color ?? spec?.color ?? structureInk.axis;

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
            ? rule('omit', axisInk, 'omit', lineSpec?.lineWeight ?? 1)
            : rule(lineSpec?.line, axisInk, indexing ? 'full' : 'omit', lineSpec?.lineWeight ?? 1);
        if (((indexing && !standsOnIt) || tableGutter) && lineSpec?.line !== undefined && lineSpec.line !== 'omit') {
            say(`structure.axis.categorical.line`, 'axis-line-not-applied', tableGutter
                ? 'a bar table prints its values in a column — the category axis is a row-header gutter, not a base, so a rule under the names is a line under a list'
                : 'no axis carries a measure — the cells are the structure, and a rule under their names is a line under nothing');
        }
        const tickLen = spec?.tickLength === 'long' ? 5 : spec?.tickLength === 'short' ? 2 : 3;
        // A row-header gutter, or names with no measure standing on them, has
        // neither spine nor ticks — dropping the line but keeping ticks leaves
        // them floating against nothing.
        const ticksRule = tableGutter || (indexing && !standsOnIt)
            ? rule('omit', axisInk, 'omit')
            : rule(spec?.ticks, spec?.color ?? structureInk.axis, 'omit');
        const inward = spec?.tickDirection === 'inward';

        // A title that only repeats what the labels already say is noise.
        // `whenAmbiguous` is a question about the field: `Jan Feb Mar` needs
        // nobody to write `Month` over it, and a column of `26 20 14` names
        // nothing until someone writes `Temp (°C)` beside it. A rank or a
        // binned range is in the second group even though it sits on a
        // categorical axis — its labels are numbers wearing an order.
        //
        const selfNaming = labelsNameThemselves(ctx, channel);
        const showTitle = axisTitlesPolicy === 'always'
            ? true
            : !selfNaming;

        const span = channel === 'x' ? ctx.layout.subplotWidth : ctx.layout.subplotHeight;
        const tickCount = role === 'measure' ? measureTickCount(span, spec?.tickDensity) : undefined;

        // A house that drops axis titles drops the only place the unit was
        // written. Where it asks for the unit on the ticks instead, the tag is
        // recovered from what the chart already knows the field to be — but
        // only where the axis still counts in that unit. A normalized stack
        // reads in shares, whatever the field was measured in.
        const unitPolicy = theme.annotation?.unit ?? 'never';
        const inFieldUnits = ctx.stacked !== 'normalize' && !ctx.partToWhole;
        const unit = role === 'measure' && inFieldUnits ? displayUnit(ctx, channel) : undefined;
        const unitTag = unitPolicy !== 'never' && unit?.placement === 'value'
            && !formatPrintsUnit(ctx.channelSemantics?.[channel]?.format?.pattern, unit.text) ? unit.text : undefined;

        // Where the house keeps its axis titles, the title is the natural place
        // for the unit — `Weight (lb)` — and the ticks stay bare numbers.
        const titleUnit = showTitle && unit && (
            axisTitlesPolicy === 'omit' || unit.placement === 'field' || theme.annotation?.unitsInAxisTitle === true
        ) ? unit.text : undefined;

        // The gap between a label and the plot is the same gap whether or not a
        // tick is drawn in it. Where there is one, the tick spans the first part
        // of that distance and the padding covers the rest; where the house
        // draws none — or turns them inward — the padding is the whole distance,
        // and 4px leaves the label sitting against the edge of the plot.
        // A flush house sets its labels close: 4px past the plot, or past the tick where one is drawn.
        // Closer, a label reads as touching a drawn axis rule.
        const tickOut = ticksRule.show && !inward ? tickLen : 0;
        const defaultLabelGap = labelFlush ? 4 + tickOut : 4 + tickLen;
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
            ...(!gridCells && minorRule?.show && minorOn.has(indexing ? 'category' : 'measure') && (indexing ? categoryGrid : measureGrid).show
                ? { minorGrid: { ...minorRule, divisions: minorDivisions } } : {}),
            ...(!gridCells && (indexing ? categoryFront : measureFront) ? { gridFront: true } : {}),
            label: {
                ...axisLabelText,
                limit: truncation === 'never' ? 0 : undefined,
                padding: labelPadding,
                flush: labelFlush,
                // A flat overflow sets every axis's labels flat; a turn is only ever decided below, for names that do not fit.
                angle: overflowStaysFlat(labelOverflow) ? 0 : undefined,
                overflow: labelOverflow,
            },
            title: {
                show: showTitle,
                ...axisTitleText,
                ...(showTitle ? { placement: axisTitlesPolicy === 'omit' ? 'subtitle' as const : theme.annotation?.axisTitlePlacement } : {}),
                // A title the house moves into the deck is dropped where the author's deck already says it.
                ...(showTitle && axisTitlesPolicy === 'omit' ? { unlessNamed: 'deck' as const } : {}),
                ...(showTitle && theme.annotation?.axisTitleGap != null
                    ? { gap: Math.max(0, theme.annotation.axisTitleGap) }
                    : {}),
                ...(titleUnit ? { unit: titleUnit } : {}),
            },
            tickCount,
            ...(role === 'measure' ? { tickSpacing: measureTickSpacing(spec?.tickDensity) } : {}),
            tickLabels: sideSpec?.tickLabels ?? (indexing ? structure.axis?.categorical : roleSpec)?.tickLabels,
            indexing,
            ...(indexing || !zeroRule ? {} : { zeroRule }),
            unit: unitTag ? { text: unitTag, where: unitPolicy } : undefined,
        };
    }

    const axes: DesignDecisions['axes'] = {};
    for (const ch of bindings.measureChannels) axes[ch] = buildAxis(ch, 'measure');
    // A measure ruler the theme compacts, where the field may be: the unit is chosen from its ticks.
    const axisCompact = groundCompactRule(theme);
    if (axisCompact?.on.includes('axis')) {
        for (const ch of bindings.measureChannels) {
            if (axes[ch] && ctx.stacked !== 'normalize' && compactApplies(compactFacts(ctx, ch), axisCompact.types)) axes[ch]!.compact = axisCompact;
        }
    }
    if (bindings.categoricalChannel) {
        axes[bindings.categoricalChannel] = buildAxis(bindings.categoricalChannel, 'categorical');
    }
    // A heat map has *two* category axes and the bindings can only name one.
    // The other is just as much a ruler for the reader, and left unbound it
    // keeps whatever the template drew — its own titles, its own ink.
    for (const ch of ['x', 'y'] as const) {
        if (!axes[ch] && ctx.positional?.[ch]) axes[ch] = buildAxis(ch, 'categorical');
    }
    if (axes.x) {
        // A heat map binds y as its category axis, but its x is just as much a band of names.
        const category = bindings.categoricalChannel === 'x'
            || ctx.positional?.x?.type === 'nominal' || ctx.positional?.x?.type === 'ordinal';
        const type = ctx.positional?.x?.type ?? channelFact(ctx, 'x')?.type;
        // How the names are set was weighed with the layout (by cost): the angle is the one it chose.
        const decided = ctx.layout.xLabel?.labelAngle;
        if (category && (type === 'nominal' || type === 'ordinal') && decided !== undefined) axes.x.label.angle = decided;
        // Only a sequence may leave some names out (`skip`).
        if (xSequence) axes.x.label.ordered = true;
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
    }

    // Which placements grounding can offer at all. `inline` needs a label
    // anchored to each mark's own geometry, which only line-family charts have
    // room for; the ranked list exists precisely so this can fall through.
    //
    // A stacked band has that room too, and more of it: the name goes *inside*
    // the band at its last reading, which is where a reader's eye already is
    // when they ask which band this is.
    const lineFamily = ctx.markTypes.some((m) => m === 'line' || m === 'trail') && !signals.isSummarised;
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
        say('legend.placement', 'legend-placement-fallback', `\`${p}\` not available for this chart — falling through`);
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
                say('axes.measure.placement', 'axis-placement-moved',
                    'the series names sit at the line ends on the right — the measure axis moves to the left so its ticks do not land under the names');
            }
        }
    }

    // A key to a set of names needs no title where the names say what they are:
    // `Chrome`, `Safari`, `Firefox`, or countries, or years. `Some`, `Not much`
    // or `Increase` do not, nor do a ramp's numbers — `26` is an instance of
    // nothing until the key names what it counts. `whenAmbiguous` is that
    // question, asked of the field, not answered with a constant.
    // Whether the reader gets the field's name is not a house's choice: `omit` is read as `whenAmbiguous`.
    const titlePolicy = legendSpec.title === 'always' ? 'always' : 'whenAmbiguous';
    if (legendSpec.title === 'omit') {
        say('legend.title', 'legend-title-omit-read-as-when-ambiguous', 'the theme asks to omit key titles; a key whose labels do not say what they are keeps its title, so `omit` is read as `whenAmbiguous`');
    }
    const keyNamesItself = keyNamesItselfOf(ctx, bindings.seriesChannel);
    const legendTitle = titlePolicy === 'always'
        || (titlePolicy === 'whenAmbiguous' && legendShow && !keyNamesItself);

    // --- data labels --------------------------------------------------------
    const dl = theme.dataLabels ?? {};
    let dlPlacement = dl.placement ?? 'outsideMark';
    // A label placed *on* a mark sits on the mark's fill, whatever the house
    // said about ink. Contrast is a legibility floor, not a style choice.
    const dlInkMode = dl.inkMode
        ?? (dlPlacement === 'atMark' ? 'contrastWithMark' : 'fixed');
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
        if (dl.show !== undefined && dlShowPolicy !== dl.show) {
            say('dataLabels.show', 'value-labels-overridden',
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
        say('dataLabels.show', 'value-labels-not-drawn', signals.isSummarised
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
    let numberFormat = groundNumberFormat(theme, ctx, bindings.measureChannels[0], labelValues);
    // A normalized stack prints each segment's share, not its value, so that
    // is the string whose width has to fit — never wider than `100%`, however
    // large the underlying numbers are.
    const normalizedStack = (ctx.stacked ?? undefined) === 'normalize';
    // The theme's compaction, where its labels are in scope and the measure may be compacted.
    const compactRule = groundCompactRule(theme);
    const labelsCompactable = Boolean(compactRule?.on.includes('labels')) && !normalizedStack
        && compactApplies(compactFacts(ctx, bindings.measureChannels[0]), compactRule!.types);
    let compactLabels: CompactPrint | undefined = labelsCompactable
        ? compactPrint(labelValues, compactRule!, 'significant') : undefined;
    // A field the house's compaction does not reach (a share, a value already in millions) prints
    // whole, its thousands grouped, rather than in d3's suffix format.
    if (compactRule && !labelsCompactable && /~s$/.test(numberFormat ?? '')) numberFormat = inferValueLabelFormat(labelValues, ',');
    // A compact unit belongs to the number (`37%`, `$12`, `21°C`), so every printed value carries
    // it, whatever the ruler states, unless the number's own format already writes it. A
    // normalized stack prints shares, not the field's units.
    const valueUnitChannel = bindings.measureChannels[0]
        ?? (['theta', 'size', 'radius'] as const).find((ch) => ctx.channelSemantics?.[ch]?.field);
    const valueDisplayUnit = normalizedStack ? undefined : displayUnit(ctx, valueUnitChannel ?? '');
    const labelUnit = valueDisplayUnit?.placement === 'value' && !formatPrintsUnit(numberFormat, valueDisplayUnit.text)
        ? valueDisplayUnit.text
        : undefined;
    if (compactLabels?.per === 'value' && theme.annotation?.numberFormat?.signed) compactLabels = { ...compactLabels, signed: true };
    // Measured in the label's own font, weight and case (L1), as `value-label-measure` prints it.
    let printedLabels = normalizedStack
        ? measureValueLabels([1], { format: '.0%', text: valueLabel })
        : measureValueLabels(labelValues, { format: numberFormat, unit: labelUnit, compact: compactLabels, text: valueLabel });
    // The room a label wants inside a mark: along a horizontal bar, the inset at both ends; across
    // a bar or a slot, a little air at each side.
    let valueLabelWidthPx = printedLabels.widest + 2 * LABEL_INSET;
    let acrossPx = printedLabels.widest + 2 * LABEL_SIDE;
    // The ink alone, without that breathing room. Two labels floating above
    // their own bars only need to clear each other.
    let labelTextPx = printedLabels.widest;

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
    // A label inside a bar sits across the *bar*, which is its slot less the gap between bars.
    const barWidth = labelSlot * resolveBandFraction(theme, ctx.chartType, ctx.geometryKinds, ctx.layout.stepPadding);
    const labelMarks = Math.max(1, signals.categoryCount || ctx.table.length)
        * Math.max(1, signals.seriesCount);
    // Which way the number has to fit depends on which way the bars run. Across
    // a vertical bar it is the number's *width* that must clear the slot; along
    // a horizontal one the number sits at the bar's end, so what the slot must
    // hold is the height of a line of text.
    let slotHoldsLine = labelSlot >= printedLabels.height + LINE_SLACK;
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
    // A label inside a bar — a stacked segment's, or a dodged bar's printed at the mark — sits
    // across the bar, with a little air at each side. One floating above its own bar only has to
    // clear its neighbour: labels are centred on their slots, so two of them touch exactly when the
    // printed string is wider than the slot (with a gap, where the bars are dodged).
    const across = (dodged && dlPlacement === 'atMark') || Boolean(stacked);
    // Across a horizontal bar a label inside it (a segment's, or a dodged bar's) has the bar's
    // thickness to stand a line of text in, not the band's.
    if (across && bindings.categoricalChannel === 'y') slotHoldsLine = barWidth >= printedLabels.height + LINE_SLACK;
    const needFor = () => (across ? acrossPx : dodged ? labelTextPx + LABEL_GAP : labelTextPx);
    let widthNeeded = needFor();
    let slotHoldsNumber = !widthIsBinding || (across ? barWidth : labelSlot) >= widthNeeded;
    // L3, the first remedy: a number too wide for its band is shortened (1,234,567 → 1.23M), where
    // the house has not said how thousands are written and the value is not a share.
    const measureSemantics = bindings.measureChannels[0] ? ctx.channelSemantics[bindings.measureChannels[0]] : undefined;
    const shareField = typeof measureSemantics?.format?.suffix === 'string' && measureSemantics.format.suffix.includes('%');
    // A house that compacts shortens a number too wide for its band in its own style, from a thousand.
    if (!slotHoldsNumber && widthIsBinding && labelsCompactable && !compactLabels && valueMaxAbs >= 1000) {
        const shorter = compactPrint(labelValues, { ...compactRule!, threshold: 1000 }, 'significant');
        const measured = shorter ? measureValueLabels(labelValues, { unit: labelUnit, compact: shorter, text: valueLabel }) : undefined;
        if (shorter && measured && measured.widest < printedLabels.widest) {
            const was = printedLabels.text(valueMaxAbs);
            compactLabels = shorter;
            printedLabels = measured;
            valueLabelWidthPx = measured.widest + 2 * LABEL_INSET;
            acrossPx = measured.widest + 2 * LABEL_SIDE;
            labelTextPx = measured.widest;
            widthNeeded = needFor();
            slotHoldsNumber = (across ? barWidth : labelSlot) >= widthNeeded;
            if (dlShow) say('dataLabels', 'value-labels-shortened', `\`${was}\` is wider than its band — printed as \`${measured.text(valueMaxAbs)}\`, in the house's compact style`);
        }
    }
    if (!slotHoldsNumber && widthIsBinding && !normalizedStack && !shareField && valueMaxAbs >= 1000 && !compactRule
        && theme.annotation?.numberFormat?.compact?.show !== 'never'
        && theme.annotation?.numberFormat?.thousands === undefined && !/[s%]$/.test(numberFormat ?? '')) {
        const shorter = inferValueLabelFormat(labelValues, '~s');
        const measured = shorter ? measureValueLabels(labelValues, { format: shorter, unit: labelUnit, text: valueLabel }) : undefined;
        if (shorter && measured && measured.widest < printedLabels.widest) {
            const was = printedLabels.text(valueMaxAbs);
            numberFormat = shorter;
            printedLabels = measured;
            valueLabelWidthPx = measured.widest + 2 * LABEL_INSET;
            acrossPx = measured.widest + 2 * LABEL_SIDE;
            labelTextPx = measured.widest;
            widthNeeded = needFor();
            slotHoldsNumber = (across ? barWidth : labelSlot) >= widthNeeded;
            if (dlShow) {
                say('dataLabels', 'value-labels-shortened',
                    `\`${was}\` is wider than its band — printed as \`${measured.text(valueMaxAbs)}\`, since the house does not say how thousands are written`);
            }
        }
    }
    // A stacked bar shares its band between the segments the *other* way: the
    // band is whole, but each segment's own thickness is what has to hold a
    // line of text. Segments thinner than that are dropped one by one further
    // down; what is settled here is the chart-level question — if not one
    // segment can carry its number, there is nothing to offer the reader.
    let segmentsFit = true;
    let totalSegments = 0;
    let thinSegments = 0;
    let segmentMinShare: number | undefined;
    let segmentMinValue: number | undefined;
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
        // What a segment has to hold along the bar (L5): up a column, a line of text; along a
        // horizontal bar, the label's own width — measured per value, since `8` needs less than `1,429`.
        const alongWidth = bindings.categoricalChannel === 'y';
        const shareLabels = stacked === 'normalize' ? measureValueLabels([0.99], { format: '.0%', text: valueLabel }) : undefined;
        const needPx = (v: number) => (alongWidth
            ? (shareLabels ? shareLabels.widest : printedLabels.width(v)) + 2 * LABEL_SIDE
            : printedLabels.height + LINE_SLACK);
        if (extent > 0) {
            if (alongWidth && stacked !== 'normalize' && tallest > 0) {
                // The smallest value whose segment holds its own label, where every larger one does too.
                const sorted = labelValues.filter((v) => v !== 0).map(Math.abs).sort((a, b) => b - a);
                let min: number | undefined;
                for (const v of sorted) {
                    if ((v / tallest) * extent < needPx(v)) break;
                    min = v;
                }
                segmentMinShare = (min ?? tallest * 2) / tallest;
            } else segmentMinShare = needPx(valueMaxAbs) / extent;
        }
        if (segmentMinShare !== undefined && stacked !== 'normalize') segmentMinValue = segmentMinShare * tallest;
        for (const row of ctx.table) {
            const v = row?.[measureField];
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            const key = catField ? row?.[catField] : '';
            const against = stacked === 'normalize' ? (totals.get(key) ?? 0) : tallest;
            if (against <= 0) continue;
            totalSegments += 1;
            if ((Math.abs(v) / against) * extent < needPx(v)) thinSegments += 1;
        }
        segmentsFit = totalSegments === 0 || thinSegments < totalSegments;
    }
    const bandHoldsNumber = slotHoldsLine && slotHoldsNumber && segmentsFit;
    // L3, the second remedy: the band the labels need, for the plan to widen into the canvas's
    // spare room. Only the band's width is at fault here — not the density, not a thin segment.
    let bandNeed: { channel: 'x' | 'y'; step: number } | undefined;
    const densityHolds = labelMarks <= (dlShowPolicy === 'whenTheyFit' ? 40 : 120);
    if (labelable && !bandHoldsNumber && segmentsFit && densityHolds && !ctx.liveLayoutSignal
        && (dlShowPolicy === 'always' || dlShowPolicy === 'whenTheyFit')
        && (bindings.categoricalChannel === 'x' || bindings.categoricalChannel === 'y')) {
        const fraction = labelSlot > 0 ? barWidth / labelSlot : 1;
        const slotNeed = Math.max(
            slotHoldsLine ? 0 : printedLabels.height + LINE_SLACK,
            slotHoldsNumber ? 0 : across ? widthNeeded / fraction : widthNeeded,
        );
        bandNeed = { channel: bindings.categoricalChannel, step: Math.ceil(slotNeed * (dodged ? signals.seriesCount : 1)) + 1 };
    }
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
            say('dataLabels.show', 'value-labels-not-drawn', !segmentsFit
                ? `${asked} every segment is thinner than a line of text — none can hold its number`
                : !slotHoldsNumber
                    ? (dodged
                        ? `${asked} the bars group ${signals.seriesCount} to a band — each is ${Math.round(across ? barWidth : labelSlot)}px wide, too narrow to carry a ${Math.round(widthNeeded)}px number without it landing on the next bar`
                        : `${asked} the bars are ${Math.round(across ? barWidth : labelSlot)}px wide and the number is ${Math.round(widthNeeded)}px — it would overrun the bar it belongs to`)
                    : !slotHoldsLine
                        ? `${asked} a ${Math.round(labelSlot)}px slot cannot hold a number`
                        : `${asked} ${labelMarks} marks would pile the numbers past reading`);
        }
    }

    if (dlShowPolicy === 'whenTheyFit') {
        dlShow = labelable && bandHoldsNumber && labelMarks <= 40;
    }
    // A live layout builds the labels wherever some window of rows could print
    // them, so the layer is placed as if they print.
    const liveSignal = ctx.liveLayoutSignal && labelable && dlShowPolicy !== 'never' && dlShowPolicy !== undefined
        ? ctx.liveLayoutSignal
        : undefined;
    // A stacked segment's number belongs in the middle of the segment and
    // nowhere else. Outside the mark is the top of the *stack*, which is a
    // different quantity, and the segment edge is the running total — the very
    // reading a stacked label has to avoid.
    if ((dlShow || liveSignal) && stacked && dlPlacement !== 'atMark') {
        if (dl.placement !== undefined) {
            say('dataLabels.placement', 'value-labels-placement-changed',
                `\`${dlPlacement}\` printed in the segment instead — outside a stacked bar is the top of the stack, not the end of the segment`);
        }
        dlPlacement = 'atMark';
    }
    // A number is printed across a bar's *width*, not up its height. A single
    // bar too narrow for its own number does not lose the number — it moves it
    // above the bar, where the gaps between bars give it room. (A dodged chart
    // cannot do this: there are no gaps to move into, which is why that case is
    // settled above, as a question of whether to label at all. Nor can a
    // stacked one: above the bar means above the whole stack.)
    if (dlShow && bindings.categoricalChannel === 'x' && signals.hasBandedAxis
        && valueMaxAbs > 0 && !dodged && !stacked && acrossPx > barWidth
        && dlPlacement === 'atMark') {
        dlPlacement = 'outsideMark';
        say('dataLabels.placement', 'value-labels-placement-changed',
            `the bar is ${Math.round(barWidth)}px wide but the number is ${Math.round(acrossPx)}px — it moves above the bar, where the gaps between bars give it room`);
    }

    if (dlShow && legendShow && legendSpec.suppressWhenValuesPrinted) {
        // A printed value is not a name. It replaces a legend that was itself
        // a value key — a ramp — but never one that carried series names, and
        // a banded axis does not help: it names the category, not the series.
        if (seriesIsValueKey) {
            legendShow = false;
        } else {
            say('legend.suppressWhenValuesPrinted', 'legend-suppression-not-applied',
                'legend kept — the values are printed but nothing else names the series');
        }
    }

    // The same argument, one axis over: once every mark states its own value,
    // the *ruler* is a second copy of the same information. Its title is not.
    // A printed `42` says how much and never says of what — the title is the
    // only thing naming the quantity, and taking it away with the gradations
    // leaves a grid of anonymous numbers. What the title says is still the
    // title policy's call; this only stops the ruler dragging it out — and,
    // with the ruler gone, moves the title into the deck (L6).
    if (dlShow && structure.axis?.measure?.suppressWhenValuesPrinted) {
        for (const ch of bindings.measureChannels) {
            const ax = axes[ch];
            if (!ax) continue;
            ax.label.show = false;
            ax.grid = { show: false, color: 'transparent', width: 0 };
            ax.ticks = { ...ax.ticks, show: false, size: 0 };
            ax.domain = { ...ax.domain, show: false };
            // Without its ruler the title would float alone under the bars (L6). It still names the
            // quantity, so it moves into the deck — unless the headline or the deck already says it.
            if (ax.title.show && ax.title.placement !== 'subtitle') {
                ax.title = { ...ax.title, placement: 'subtitle', unlessNamed: true };
                say(`axes.${ch}.title`, 'axis-title-to-deck',
                    'the values are printed and the ruler is gone, so its title moves into the deck rather than float under the bars');
            }
        }
    }

    // The mirror of the rule above, and the floor under it. A house strips its
    // grid, its rule and its ticks because the number is printed on the mark —
    // that is the consulting-deck bar, and there the scaffolding really is
    // redundant. A scatter prints nothing, so the same house hands back
    // readings floating on blank paper with no way to judge one against
    // another. The house may choose how a value is read; it may not leave no
    // way to read one, so the quiet grid returns.
    // Only where *no* ruler is left (GR1): one axis drawing a grid, a rule or ticks is a way to read
    // a value, and a grid the house omitted on the other — a scatter's verticals — stays omitted.
    // What returns is the grid across the value axis, never the index axis's.
    if (!dlShow) {
        const measured = bindings.measureChannels.filter((ch) => axes[ch]);
        const ruled = measured.some((ch) => axes[ch]!.grid.show || axes[ch]!.domain.show || axes[ch]!.ticks.show);
        const ch = measured.find((c) => !axes[c]!.indexing) ?? measured[0];
        if (!ruled && ch) {
            axes[ch]!.grid = { ...rule('quiet', structureInk.grid, 'quiet', gridWeight), ...(gridDash ? { dash: gridDash } : {}) };
            say(`axes.${ch}.grid`, 'grid-restored',
                'no mark prints its value and no axis draws a ruler — the quiet grid across the value axis returns, so a reading can be judged against something');
        }
    }

    const measureChannel = bindings.measureChannels[0];
    const axisStatesUnit = (['x', 'y'] as const)
        .some((ch) => axes[ch]?.unit && axes[ch]!.label.show !== false);
    // A part-to-whole value whose slices sum to 100 *is* a percentage — the `%`
    // is the number's meaning, not a house-style flourish, and a pie has no
    // ruler to carry it. So it rides on the printed value whatever the house's
    // axis-unit policy: a bare `65` on a slice reads as a count, not a share.
    // (`percentOfWhole` only fires on values that actually total 100, so a pie
    // of raw amounts keeps its bare numbers.)
    const shareUnit = signals.isPartToWhole && !axisStatesUnit
        ? percentOfWhole(ctx, valueUnitChannel ?? '')
        : undefined;
    // The printed value takes the unit, whoever printed it, the theme or the template.
    const valueUnit = labelUnit ?? shareUnit;

    // A label placed at the mark sits *inside* it, which only works while the
    // mark is longer than the label. Below that length the label has to move
    // out. Outside placement is chart-wide: the backend reserves room instead
    // of flipping only the longest mark inward.
    let insideMinValue: number | undefined;
    if (dlShow && measureChannel) {
        const span = measureChannel === 'x' ? ctx.layout.subplotWidth : ctx.layout.subplotHeight;
        // Along a horizontal bar the label's width has to fit; along a vertical one, a line of text.
        // The layout plan refines this against the drawn axis, label by label.
        const along = measureChannel === 'x' ? valueLabelWidthPx : printedLabels.height + 2 * LABEL_INSET;
        if (valueMaxAbs > 0 && span > 0) {
            insideMinValue = (along / span) * valueMaxAbs;
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

    const marks: DesignDecisions['marks'] = {
        bandFraction: resolveBandFraction(theme, ctx.chartType, ctx.geometryKinds, ctx.layout.stepPadding),
        group: groundGroupSpacing(marksSpec.group, say),
        strokeWidth: marksSpec.strokeWeight ?? 2,
        strokeCap: marksSpec.strokeCap,
        strokeJoin: marksSpec.strokeJoin,
        interpolate: marksSpec.interpolation === 'monotone'
            ? 'monotone'
            : marksSpec.interpolation === 'step' ? 'step' : undefined,
        fillOpacity: marksSpec.fillOpacity,
        cornerRadius: marksSpec.cornerRadius,
        ...resolveGradient(marksSpec.gradient),
        ...(marksSpec.areaEdge && (marksSpec.areaEdge.presence ?? 'full') !== 'omit'
            ? { areaEdge: { width: marksSpec.areaEdge.width ?? (marksSpec.areaEdge.presence === 'quiet' || marksSpec.areaEdge.presence === 'hairline' ? 1 : 2) } }
            : {}),
        outline: marksSpec.outline && (marksSpec.outline.presence ?? 'omit') !== 'omit'
            ? {
                color: marksSpec.outline.source === 'surface'
                    ? plot
                    : (ink('full', structureInk.axis ?? structureInk.rule, 'full') ?? foreground),
                width: marksSpec.outline.weight ?? 1.5,
                ...(marksSpec.outline.source === 'series' ? { series: true } : {}),
            }
            : undefined,
        ...(marksSpec.barOpacity !== undefined ? { barOpacity: Math.max(0, Math.min(1, marksSpec.barOpacity)) } : {}),
        ...(marksSpec.arc ? { arc: {
            ...(marksSpec.arc.order ? { order: marksSpec.arc.order } : {}),
            ...(typeof marksSpec.arc.startAngle === 'number' ? { startAngle: ((marksSpec.arc.startAngle % 360) + 360) % 360 } : {}),
            ...(typeof marksSpec.arc.hole === 'number' ? { hole: Math.max(0, Math.min(0.9, marksSpec.arc.hole)) } : {}),
        } } : {}),
        ...(marksSpec.barMinLength && marksSpec.barMinLength > 0 ? { barMinLength: Math.min(20, marksSpec.barMinLength) } : {}),
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
                ...(marksSpec.point?.shape && marksSpec.point.shape !== 'circle'
                    ? { shape: marksSpec.point.shape }
                    : {}),
                ...(typeof marksSpec.point?.opacity === 'number'
                    ? { opacity: Math.max(0, Math.min(1, marksSpec.point.opacity)) }
                    : {}),
                ...(marksSpec.point?.ink && marksSpec.point.ink !== 'series'
                    ? { ink: marksSpec.point.ink === 'text' ? foreground : marksSpec.point.ink }
                    : {}),
                density: marksSpec.point?.density ?? 'countable',
                haloColor: halo ? plot : undefined,
                haloWidth: marksSpec.point?.halo?.width ?? (halo ? 1.5 : undefined),
                // A line's dots take the halo wherever lines can cross; a scatter's only where the
                // house asked for one, since most houses print their dots without a ring.
                ...(haloDeclared && halo ? { haloDots: true } : {}),
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
    const selectionBoundary = theme.interaction?.selectionBoundary;
    const selectionBoundaryWidth = Math.max(0, selectionBoundary?.width ?? 1.25);

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
            kicker: resolveType(theme.type?.kicker, deck.fontSize ?? 11, text.secondary),
            frame: theme.layout?.titleBlock?.frame ?? 'content',
            offset: Math.round((headline.fontSize ?? 14) * TITLE_GAP[theme.layout?.titleBlock?.gap ?? 'normal']),
            deckPadding: Math.round((deck.fontSize ?? 11) * DECK_GAP[theme.layout?.titleBlock?.deckGap ?? 'normal']),
        },
        axes,
        frame,
        baseline,
        ...(structure.axis?.floating ? { floating: structure.axis.floating } : {}),
        series,
        legend: {
            show: legendShow,
            placement,
            ...(fallbacks.length ? { fallbacks } : {}),
            orient: legendOrient,
            direction: theme.legend?.direction
                ?? (legendOrient === 'top' || legendOrient === 'bottom' ? 'horizontal' : 'vertical'),
            title: legendTitle,
            titlePolicy,
            label: keyLabel,
            titleText: keyTitle,
            gradientLength: legendSpec.gradientLength,
            maxSwatches: legendSpec.maxSwatches,
            ...(legendSpec.swatch && legendSpec.swatch !== 'auto' ? { swatch: legendSpec.swatch } : {}),
            ...(legendSpec.arrangement ? { arrangement: legendSpec.arrangement } : {}),
            ...(legendSpec.titlePosition ? { titlePosition: legendSpec.titlePosition } : {}),
            ...(legendSpec.align ? { align: legendSpec.align } : {}),
            ...(legendSpec.endValue ? { endValue: true } : {}),
            ...(legendSpec.gaps ? { gaps: legendSpec.gaps } : {}),
        },
        dataLabels: {
            show: dlShow,
            possible: labelable && readableAtAll,
            placement: dlPlacement,
            inkMode: dlInkMode,
            anchor: dl.anchor ?? 'end',
            fallback: dl.fallback ?? 'perMark',
            minContrast: Math.max(1, dl.minContrast ?? 3),
            text: valueLabel,
            format: numberFormat,
            ...(compactLabels ?? suffixBillions(numberFormat, valueMaxAbs) ? { compact: compactLabels ?? suffixBillions(numberFormat, valueMaxAbs) } : {}),
            ...(valueUnit ? { unit: valueUnit } : {}),
            insideMinValue,
            ...(segmentMinShare !== undefined ? { segmentMinShare } : {}),
            ...(bandNeed ? { bandNeed } : {}),
            ...(segmentMinValue !== undefined ? { segmentMinValue } : {}),
            ...(liveSignal ? { liveSignal } : {}),
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
        interaction: {
            continuousColorFocus: {
                mutedFill: mixHex(plot ?? canvas, text.primary, 0.08, '#eeeeee'),
                boundaryWidth: Math.min(selectionBoundaryWidth, 0.8),
                boundaryOpacity: 0.42,
                haloWidth: Math.min(Math.max(0, selectionBoundary?.haloWidth ?? 2.5), 1.25),
                haloOpacity: 0.18,
            },
            selectionBoundary: {
                color: selectionBoundary?.color ?? theme.ink?.accent ?? text.primary,
                width: selectionBoundaryWidth,
                opacity: clamp(selectionBoundary?.opacity ?? 0.68, 0, 1),
                haloColor: selectionBoundary?.haloColor ?? plot ?? canvas,
                haloWidth: Math.max(0, selectionBoundary?.haloWidth ?? 2.5),
                haloOpacity: clamp(selectionBoundary?.haloOpacity ?? 0.35, 0, 1),
            },
        },
        facets,
        layout: {
            padding,
            density,
            plotWidth: ctx.layout.subplotWidth,
            plotHeight: ctx.layout.subplotHeight,
            xStep: ctx.layout.xStep,
            canvasWidth: ctx.canvasSize?.width,
        },
        statistics: theme.annotation?.statistics?.show?.length
            ? {
                show: theme.annotation.statistics.show,
                placement: theme.annotation.statistics.placement ?? 'panel',
                ...(annotationText ?? axisLabelText),
            }
            : undefined,
        furniture: theme.furniture ?? [],
        ...(displayText ? { display: displayText } : {}),
        table: {
            header: resolveTextRole(theme, theme.type?.axisTitle, 11, text.secondary, 0),
            cell: resolveTextRole(theme, theme.type?.axisLabel, 11, text.primary, 0),
            headerRule: theme.ink?.structure?.axis ?? mixHex(plot, foreground, 0.5),
            rule: theme.ink?.structure?.grid ?? mixHex(plot, foreground, 0.12),
        },
        source: sourceDesign,
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
    return { ...ramp, stops };
}

function resolveGradient(g: ThemeMarks['gradient']): Pick<ResolvedMarks, 'gradient'> {
    const area = g?.area === 'fade' ? 'fade' as const : undefined;
    const style = g?.lineWash === 'tint' || g?.lineWash === 'fade' ? g.lineWash : undefined;
    const opacity = Math.min(1, Math.max(0, g?.washOpacity ?? (style === 'fade' ? 0.3 : 0.12)));
    if (!area && !style) return {};
    return { gradient: { ...(area ? { area } : {}), ...(style ? { lineWash: { style, opacity } } : {}) } };
}

/** The least contrast a fill keeps against the plot before it gains an edge. */
const FILL_MIN_CONTRAST = 1.25;
/** The least contrast a line keeps against the plot before it is darkened. */
const STROKE_MIN_CONTRAST = 1.6;

function groundSeriesInk(
    theme: ThemeSpec,
    ctx: GroundingContext,
    bindings: Bindings,
    signals: Signals,
    say: ReportDeparture,
): ResolvedSeriesInk {
    const resolved = groundSeriesInkChoice(theme, ctx, bindings, signals, say);
    const visibility = seriesVisibility(theme, resolved);
    return visibility ? { ...resolved, visibility } : resolved;
}

/**
 * Series inks too faint to see against the plot surface. Only these change: a fill keeps its house
 * colour and gains an edge in a darker shade of it; a line, which has no edge, is darkened in its
 * hue just enough to pass.
 */
function seriesVisibility(theme: ThemeSpec, s: ResolvedSeriesInk): ResolvedSeriesInk['visibility'] {
    if (s.mode === 'sequential' || s.mode === 'diverging') return undefined;
    const surface = theme.ink?.surface?.plot ?? theme.ink?.surface?.canvas ?? '#ffffff';
    const floors = theme.ink?.series?.minContrast ?? {};
    const fillMin = floors.fill ?? FILL_MIN_CONTRAST;
    const strokeMin = floors.stroke ?? STROKE_MIN_CONTRAST;
    const inks = [...new Set([s.single, ...s.categorical, ...(s.overflow ? [s.overflow] : []), ...Object.values(s.byValue ?? {})].filter(Boolean))];
    const stroke: Record<string, string> = {};
    const outline: Record<string, string> = {};
    for (const ink of inks) {
        if (!parseColor(ink)) continue;
        const ratio = contrastRatio(ink, surface);
        if (ratio < strokeMin) stroke[ink.toLowerCase()] = readableTextInk(ink, surface, strokeMin);
        if (ratio < fillMin) outline[ink.toLowerCase()] = readableTextInk(ink, surface, Math.max(2, fillMin + 0.75));
    }
    if (!Object.keys(stroke).length && !Object.keys(outline).length) return undefined;
    return { stroke, outline };
}

function groundSeriesInkChoice(
    theme: ThemeSpec,
    ctx: GroundingContext,
    bindings: Bindings,
    signals: Signals,
    say: ReportDeparture,
): ResolvedSeriesInk {
    const family = seriesMarkFamily(ctx.markTypes);
    const s = forMarkFamily(theme.ink?.series ?? {}, family);
    const selection = s.selection ?? {};
    // A colour taken from a ramp's bins stands this far off the surface: thin lines and points
    // further than filled marks.
    const binContrast = family === 'line' || family === 'point' ? LINE_BIN_CONTRAST : FILL_BIN_CONTRAST;
    // An ink bound to a value present in this chart is that value's alone: the positional sets skip
    // it. Inks bound to values the chart does not hold stay in the palette, so a house that binds its
    // whole palette to one vocabulary still has it for every other chart.
    const boundField = channelFact(ctx, bindings.seriesChannel)?.field;
    const byValue = boundValueInks(ctx.table, boundField,
        chartValueColors(bindings.seriesChannel ? ctx.channelSemantics?.[bindings.seriesChannel] : undefined), s.roles);
    const present = new Set(Object.keys(byValue ?? {}));
    const reserved = new Set([...present].map((v) => byValue![v].toLowerCase()));
    const unreserved = (list: string[]) => (reserved.size ? list.filter((c) => !reserved.has(c.toLowerCase())) : list);
    const categorical = unreserved(s.categorical ?? []);
    const extended = unreserved(s.categoricalExtended ?? []);
    const single = s.single ?? categorical[0] ?? theme.ink?.accent ?? '#4c78a8';
    const surfaceColour = theme.ink?.surface?.plot ?? theme.ink?.surface?.canvas ?? '#ffffff';

    // The house may name a larger indexed set for higher cardinality (Tableau
    // 10→20). Rank the tiers by capacity so we can reach for the smallest one
    // that still gives every series its own ink.
    // Sets written for an exact series count. One that has fewer inks than its count is a typo, not
    // a set, and is skipped.
    const byCount = new Map<number, string[]>();
    for (const [key, inks] of Object.entries(s.categoricalByCount ?? {})) {
        const n = Number(key);
        if (Number.isInteger(n) && n >= 2 && Array.isArray(inks) && inks.length >= n) byCount.set(n, inks);
    }
    const tiers = [categorical, extended, ...byCount.values()]
        .filter((t) => t.length > 0)
        .sort((a, b) => a.length - b.length);
    const largestTier = tiers.length ? tiers[tiers.length - 1] : categorical;

    const seriesChannel = bindings.seriesChannel;
    const seriesField = channelFact(ctx, seriesChannel)?.field;
    const seriesType = channelFact(ctx, seriesChannel)?.type;
    const count = signals.seriesCount;
    // The colour is signed only when what it encodes carries the sign: a measure on an axis that
    // dips below zero says nothing about the series the colour names.
    const seriesSigned = signals.isSigned && seriesCarriesSign(ctx, seriesField, seriesType);

    const base: ResolvedSeriesInk = {
        mode: 'single',
        single,
        categorical,
        overflow: s.overflow ?? s.roles?.other,
        ...(byValue ? { byValue } : {}),
        status: s.status,
        ...(s.categoricalText?.length ? { categoricalText: s.categoricalText } : {}),
    };

    if (!seriesField || (signals.seriesCountKnown && count <= 1)) {
        // One series whose measure crosses zero, on a mark read by its length: a house that colours
        // signed values by status colours each bar by its own sign. Lines and points keep one ink —
        // a line cannot change colour at zero without a cut the data does not have.
        if (!seriesField && signals.isSigned && signals.markChannel === 'length' && s.status?.negative
            && selection.signed === 'status' && selection.statusUse !== 'never' && selection.statusUse !== 'thresholdOnly') {
            return { ...base, signedStatus: true };
        }
        // A single-series chart still needs an ink, and there is exactly one
        // right answer: the house's single-series colour.
        return base;
    }

    const facetField = bindings.facetChannel ? ctx.channelSemantics[bindings.facetChannel]?.field : undefined;
    if (selection.redundantWithFacet === 'single' && facetField && facetField === seriesField) {
        return base;
    }

    // The chart names every series where it draws it (each ridge's label beside the ridge): a
    // colour per series would only say the name again, so they all take the single ink.
    if (ctx.seriesOneInk === true && seriesType !== 'quantitative') {
        return base;
    }

    // Continuous series: a ramp, not an indexed set.
    if (seriesType === 'quantitative') {
        // Signed values normally use a diverging ramp, but a house may
        // deliberately read the field as ordered magnitude instead. McKinsey
        // does this on heatmaps: one navy sequence plus printed values, rather
        // than introducing a warm ink the house does not otherwise own.
        const signedSequential = seriesSigned && selection.signed === 'sequential';
        const diverging = seriesSigned && !signedSequential && Boolean(s.diverging);
        const ramp: Ramp | undefined = offSurface(diverging ? s.diverging : s.sequential, surfaceColour);
        if (diverging && ramp?.stops?.length) reportUnbalancedRamp(ramp.stops, say);
        if (ramp?.stops?.length) {
            const consumption = ramp.consumption ?? 'interpolate';
            const quantize = consumption === 'quantize' ? (ramp.quantizeCount ?? 5) : undefined;
            // A diverging ramp keeps its ends: its pale colour is the midpoint, not an end to trim.
            const bins = quantize && !diverging ? sampleRampBins(ramp.stops, quantize, surfaceColour, binContrast) : undefined;
            return {
                ...base,
                mode: diverging ? 'diverging' : 'sequential',
                ramp,
                quantize,
                range: bins ?? (quantize ? sampleRamp(ramp.stops, quantize) : ramp.stops.slice()),
            };
        }
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
            const ramp = offSurface(s.sequential, surfaceColour)!;
            const range = sampleRamp(ramp.stops, Math.max(2, count)).reverse();
            return { ...base, mode: 'sequential', ramp, range };
        }
        say('ink.series.selection.partToWhole', 'part-to-whole-ramp-not-applied',
            `${count} slices exceed the ${rampResolution}-stop ramp's resolution — distinct hues name them better than shades, so the indexed set stands`);
    }

    if (seriesSigned && s.status && selection.signed === 'status' && selection.statusUse !== 'never') {
        if (selection.statusUse !== 'thresholdOnly') {
            return { ...base, mode: 'status' };
        }
    }

    if (seriesSigned && selection.signed === 'diverging' && s.diverging?.stops?.length) {
        const ramp = offSurface(s.diverging, surfaceColour)!;
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
    // A house may ask for an order the chart *declares* to be read the same way (R10). An order Flint
    // infers (months, compass points) is not enough: those are sequences, not magnitudes.
    const declaredOrder = (channelFact(ctx, seriesChannel) as any)?.semanticAnnotation?.sortOrder;
    const ordered = seriesType === 'ordinal'
        || (selection.ordered === 'ramp' && Array.isArray(declaredOrder) && declaredOrder.length > 1);
    if (ordered) {
        const ramp: Ramp | undefined = offSurface(
            s.ordinal?.stops?.length ? s.ordinal : s.sequential?.stops?.length ? s.sequential : s.diverging, surfaceColour);
        if (ramp?.stops?.length && signals.seriesCountKnown) {
            // A house's own ordinal ramp names its steps as written. A measure's ramp lent to the
            // steps gives each the middle of its bin, the faint end trimmed: the first of two years
            // is a readable tint, not the ramp's near-white.
            return {
                ...base,
                mode: 'sequential',
                ramp,
                range: s.ordinal?.stops?.length
                    ? sampleRamp(ramp.stops, Math.max(2, count))
                    : sampleRampBins(ramp.stops, Math.max(2, count), surfaceColour, binContrast),
            };
        }
    }

    // The house wrote a set for exactly this many series: it is the answer, whatever the general
    // order says (IBM Carbon's three-series set is not the first three of its sequence).
    const counted = signals.seriesCountKnown ? byCount.get(count) : undefined;
    if (counted) return { ...base, categorical: counted.slice(0, count), mode: 'categorical' };

    // Series with a bound ink need no place in the palette.
    const positional = count - present.size;
    if (signals.seriesCountKnown && positional > categorical.length && categorical.length > 0) {
        // Auto-upsize: an extended tier that still names every series is the
        // right answer — reach for the smallest one that covers the count.
        const fittingTier = tiers.find((t) => positional <= t.length);
        if (fittingTier && fittingTier.length > categorical.length) {
            return { ...base, categorical: fittingTier, mode: 'categorical' };
        }

        if (s.repeat && !signals.isPartToWhole) {
            // The house's guide says colours repeat past its last ink: offer the largest set and let
            // the scale start it again, rather than greying the tail. Not on a part-to-whole: the
            // first and last parts of a pie touch, and a repeated ink would make two parts one.
            say('ink.series.repeat', 'palette-repeated',
                `${count} series past the house's ${largestTier.length} inks — the palette starts again, as the house asks`);
            return { ...base, categorical: largestTier, overflow: undefined, mode: 'categorical' };
        }
        if (base.overflow) {
            // Past even the extended set. The top inks by prominence name the
            // largest series; every remaining ("other") series folds into the
            // one overflow ink. Realization orders the domain by share so it is
            // the smallest series that go grey, read as a single tail.
            say('ink.series.categorical', 'palette-exhausted',
                `${count} series past the house's ${largestTier.length} inks — the largest ${largestTier.length} keep a colour, the rest fold into one "other" ink`);
            return { ...base, categorical: largestTier, mode: 'categorical', overflowTail: true };
        } else if (ctx.namesOnMarks === true) {
            // The chart prints the series name on the mark (a slopegraph's end
            // labels, a house that asked for it), so the names are already on
            // the page in words. Colour was never the key here; keeping a
            // foreign palette only spreads seven hues across seven lines and
            // seven labels that say the same thing the words do. One ink, and
            // the reader reads the names.
            say('ink.series.categorical', 'palette-exhausted',
                `${count} series against ${largestTier.length} house inks, but the house names them on the mark — colour stops naming and takes the single ink`);
            return { ...base, mode: 'single' };
        } else {
            // The house declares fewer inks than there are series and no overflow ink. Its palette
            // still names the largest series; the rest take a grey derived from the house's own
            // muted ink, so the chart never leaves the house for the renderer's default scheme.
            const overflow = houseOverflowInk(theme, surfaceColour);
            say('ink.series.categorical', 'palette-exhausted',
                `${count} series and the house declares ${largestTier.length} inks with no overflow ink — the largest ${largestTier.length} keep a house colour, the rest take a grey derived from its muted ink (${overflow})`);
            return { ...base, categorical: largestTier, overflow, mode: 'categorical', overflowTail: true };
        }
    }
    return { ...base, mode: 'categorical' };
}

const MARK_FAMILY: Record<string, SeriesMarkFamily> = {
    line: 'line', trail: 'line', area: 'area', bar: 'bar', rect: 'bar', arc: 'arc', point: 'point', circle: 'point', square: 'point',
};

/**
 * The one family of marks that draws this chart's series, if there is one. Text and rules annotate;
 * dots on a line belong to the line. Two families (bars with a line) have none.
 */
/** The contrast off the surface a ramp's bin colours keep, for filled marks and for lines and points. */
const FILL_BIN_CONTRAST = 1.5;
const LINE_BIN_CONTRAST = 2.5;

function seriesMarkFamily(markTypes: string[]): SeriesMarkFamily | undefined {
    const families = new Set(markTypes.map((m) => MARK_FAMILY[m]).filter(Boolean));
    if (families.has('line')) families.delete('point');
    return families.size === 1 ? [...families][0] : undefined;
}

/** The house's series inks with a mark family's own in place of the general ones. */
function forMarkFamily(s: NonNullable<ThemeInk['series']>, family: SeriesMarkFamily | undefined): NonNullable<ThemeInk['series']> {
    const own = family ? s.byMark?.[family] : undefined;
    if (!own || (!own.single && !own.categorical?.length)) return s;
    return {
        ...s,
        ...(own.single ? { single: own.single } : {}),
        // A family's list replaces the general order, its count sets and the text variants written for it.
        ...(own.categorical?.length ? { categorical: own.categorical, categoricalByCount: undefined, categoricalText: undefined } : {}),
    };
}

/**
 * Does the series the colour names carry a sign of its own? A continuous colour does when its own
 * values cross zero; categories do when they split by sign (a waterfall's increase / decrease,
 * regions that each net a gain or a loss). Months on a ridgeline of temperatures do not, however
 * cold the winter.
 */
/** How far apart in L* the two arms of a diverging ramp may stand at mirrored points before they read as unequal. */
const RAMP_ARM_TOLERANCE = 3;

/**
 * A diverging ramp reads equal distances from its midpoint as equal only where its two arms are
 * equally light at mirrored points (ColorBrewer's diverging schemes; Moreland, "Diverging Color
 * Maps for Scientific Visualization", 2009). Reports the widest gap, from the ends to near the
 * middle, where it passes {@link RAMP_ARM_TOLERANCE}.
 */
function reportUnbalancedRamp(stops: string[], say: ReportDeparture): void {
    if (stops.length < 3) return;
    const at = (t: number): number | undefined => {
        const x = t * (stops.length - 1);
        const k = Math.min(stops.length - 2, Math.floor(x));
        const c = parseColor(mixHex(stops[k], stops[k + 1], x - k, stops[k]));
        return c ? lightness(c) : undefined;
    };
    let widest = { gap: 0, t: 0, low: 0, high: 0 };
    for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
        const low = at(t);
        const high = at(1 - t);
        if (low === undefined || high === undefined) return;
        if (Math.abs(low - high) > widest.gap) widest = { gap: Math.abs(low - high), t, low, high };
    }
    if (widest.gap <= RAMP_ARM_TOLERANCE) return;
    say('ink.series.diverging', 'diverging-ramp-unbalanced',
        `the diverging ramp's arms differ by ${widest.gap.toFixed(1)} L* ${widest.t === 0 ? 'at its ends' : `${Math.round(widest.t * 100)}% in from its ends`} `
        + `(${widest.low.toFixed(1)} against ${widest.high.toFixed(1)}), so equal distances from the midpoint do not read as equal`);
}

function seriesCarriesSign(ctx: GroundingContext, field: string | undefined, type: string | undefined): boolean {
    if (!field) return false;
    // A field this stage cannot see (a template derives it) keeps the chart's sign.
    if (!fieldPresent(ctx.table, field)) return true;
    if (type === 'quantitative') return ctx.table.some((row) => typeof row?.[field] === 'number' && row[field] < 0);
    const domain = [...new Set(ctx.table.map((row) => row?.[field]).filter((v) => v != null))];
    if (domain.length < 2) return false;
    // The measure the categories would be signing, y before x, as realization reads it.
    const measure = (['y', 'x', 'theta', 'size'] as const)
        .filter((ch) => channelType(ctx, ch) === 'quantitative')
        .map((ch) => channelFact(ctx, ch)?.field)
        .find((f) => f && f !== field);
    return categoriesSplitBySign(categorySignRoles(ctx.table, field, domain, measure));
}

/**
 * The ink for series past a house's palette when it names none: its muted text ink, a third of the
 * way toward the surface, so the tail reads as context rather than as one more named series. Kept
 * clear of the surface where the blend would sink into it.
 */
function houseOverflowInk(theme: ThemeSpec, surface: string): string {
    const muted = theme.ink?.text?.muted ?? theme.ink?.text?.secondary ?? '#737373';
    const blended = mixHex(muted, surface, 0.35, muted);
    return contrastRatio(blended, surface) >= 1.8 ? blended : muted;
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
    say: ReportDeparture,
): DesignDecisions['marks']['redundant'] {
    const policy = marksSpec.redundantEncoding ?? 'never';
    const channels = marksSpec.redundantChannels ?? [];
    // Texture fills a mark; a house that asks for it `always` hatches even one series (Visa).
    const textureAsked = channels.includes('texture') && policy !== 'never'
        && (series.mode === 'categorical' || series.mode === 'single');
    const named = (marksSpec.texture?.patterns ?? []).filter((p) => TEXTURE_PATTERNS.includes(p));
    const patterns: TexturePattern[] = named.length ? named
        : marksSpec.texture?.pattern === 'hatch' ? ['diagonal'] : TEXTURE_PATTERNS.filter((p) => p !== 'solid');
    const textureOf = (on: boolean) => (on ? {
        texture: {
            patterns,
            ink: marksSpec.texture?.ink ?? 'darker',
            spacing: Math.max(3, marksSpec.texture?.spacing ?? 6),
        } as const,
    } : {});
    const off = { shape: false, dash: false, ...textureOf(textureAsked && policy === 'always') };
    if (policy === 'never' || channels.length === 0) return off;
    if (series.mode !== 'categorical') return off;
    const effectiveCount = signals.seriesCountKnown ? signals.seriesCount : series.categorical.length;
    if (effectiveCount <= 1) return off;

    if (policy === 'whenNeeded') {
        const strained = effectiveCount > series.categorical.length;
        if (!strained) return off;
        // Even with more series than inks, a redundant channel earns its noise
        // only if the reader needs it to tell the series apart. When each series
        // is named at its own mark — a line labelled at its end, a band at its
        // last reading — that identity is already carried, and a dash spread
        // over a dense path degrades into texture rather than a distinguishing
        // mark. The name does the work `whenNeeded` was reaching for.
        if (directlyLabeled) {
            say('marks.redundantEncoding', 'redundant-encoding-withheld',
                '`whenNeeded` withheld — each series is named at its own mark, so nothing else need tell them apart');
            return off;
        }
    }
    const unsupported = channels.filter((c) => c === 'lightness');
    if (unsupported.length) {
        say('marks.redundantChannels', 'redundant-channel-not-applied', `${unsupported.join(', ')} not realizable — ignored`);
    }
    return { shape: channels.includes('shape'), dash: channels.includes('dash'), ...textureOf(textureAsked) };
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
): string | undefined {
    const nf = theme.annotation?.numberFormat;
    const sem = measureChannel ? ctx.channelSemantics[measureChannel] : undefined;
    const isPercent = typeof sem?.format?.suffix === 'string' && sem.format.suffix.includes('%');

    let house: string | undefined;
    // A house that never compacts prints every number whole, its thousands grouped.
    const never = nf?.compact?.show === 'never';
    if (nf) {
        const sign = nf.signed ? '+' : '';
        // Grouped, so a value the suffix leaves whole (the set would collapse at three figures) still reads 1,429.
        if (nf.thousands === 'suffix' && !never) house = `${sign},~s`;
        else {
            const group = nf.thousands === 'separator' || never ? ',' : '';
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
    if (isPercent) return house;
    if (formatPrintsUnit(sem?.format?.pattern, '%')) return sem!.format!.pattern;
    return inferValueLabelFormat(values, house);
}

/**
 * The theme's number compaction. A stated `compact` compacts where its largest value reaches the
 * threshold, one unit per ruler or label set; `thousands: "suffix"` alone keeps its old reading —
 * value labels, each value its own suffix, from a thousand — with billions written B, not SI's G.
 */
function groundCompactRule(theme: ThemeSpec): CompactRule | undefined {
    const nf = theme.annotation?.numberFormat;
    const stated = nf?.compact;
    if (stated?.show === 'never') return undefined;
    const decimals = nf?.precision === 'integer' ? 0 : nf?.precision === 'one' ? 1 : nf?.precision === 'two' ? 2 : undefined;
    if (stated) {
        return {
            ...(decimals !== undefined ? { decimals } : {}),
            suffixes: COMPACT_SUFFIXES[stated.style ?? 'short'] ?? COMPACT_SUFFIXES.short,
            per: stated.per ?? 'scale',
            threshold: Math.max(1000, stated.threshold ?? 10000),
            on: stated.on?.length ? stated.on : ['axis', 'labels'],
            types: stated.types?.length ? stated.types : DEFAULT_COMPACT_TYPES,
        };
    }
    if (nf?.thousands === 'suffix') {
        return { suffixes: COMPACT_SUFFIXES.short, per: 'value', threshold: 1000, on: ['labels'], types: DEFAULT_COMPACT_TYPES, distinct: true };
    }
    return undefined;
}

/**
 * d3's suffix format writes a billion as SI's `G` (gigas); no chart means that. Where a label set
 * the format shortens reaches a billion, it is printed the same way with `B`.
 */
function suffixBillions(format: string | undefined, maxAbs: number): CompactPrint | undefined {
    if (!format || !/~s$/.test(format) || !(maxAbs >= 1e9)) return undefined;
    return { per: 'value', suffixes: COMPACT_SUFFIXES.short, threshold: 1000, ...(format.startsWith('+') ? { signed: true } : {}) };
}

/** What decides whether a channel's field may be compacted: its name, semantic type and unit. */
function compactFacts(ctx: GroundingContext, channel: string | undefined) {
    const sem = channel ? ctx.channelSemantics[channel] : undefined;
    const annotation = sem?.semanticAnnotation;
    return {
        name: sem?.field,
        semanticType: typeof annotation?.semanticType === 'string' ? annotation.semanticType : undefined,
        unit: typeof annotation?.unit === 'string' ? annotation.unit : undefined,
        isPercent: typeof sem?.format?.suffix === 'string' && sem.format.suffix.includes('%'),
        said: ctx.headline,
    };
}

/**
 * The side an axis is drawn on (AX1). `opposite` is the far side, but a horizontal *index* axis
 * keeps the bottom (the marks stand on it). `leading`/`trailing` place a vertical axis at the start
 * or end of the reading direction (left to right) and leave a horizontal one at the bottom. A screen
 * side applies only to an axis that runs that way; otherwise the axis keeps its default side.
 */
function axisOrient(channel: 'x' | 'y', placement: AxisRole['placement'], indexing: boolean): ResolvedAxis['orient'] {
    if (channel === 'x') {
        if (placement === 'top' || placement === 'bottom') return placement;
        return placement === 'opposite' && !indexing ? 'top' : 'bottom';
    }
    if (placement === 'left' || placement === 'right') return placement;
    return placement === 'opposite' || placement === 'trailing' ? 'right' : 'left';
}

/** A house's group spacing, each gap checked; an unreadable one falls back with a report. */
function groundGroupSpacing(stated: ThemeMarks['group'], say: ReportDeparture): GroupSpacing {
    const gap = stated?.gap;
    const spacing = stated?.spacing;
    if (gap !== undefined && !isGapSize(gap)) say('geometry.band.group.gap', 'group-gap-not-applied', `\`${String(gap)}\` is neither a share of a bar nor px — the default hairline is used`);
    if (spacing !== undefined && !isGapSize(spacing)) say('geometry.band.group.spacing', 'group-gap-not-applied', `\`${String(spacing)}\` is neither a share of a bar nor px — the band fraction is used`);
    return {
        ...(isGapSize(gap) ? { gap } : {}),
        ...(isGapSize(spacing) ? { spacing } : {}),
    };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}
