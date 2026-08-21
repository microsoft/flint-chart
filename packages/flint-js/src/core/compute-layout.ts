// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * PHASE 1: COMPUTE LAYOUT
 * =============================================================================
 *
 * Determine how big things should be — axis lengths, step sizes,
 * subplot dimensions, label sizing, and overflow truncation — from data
 * density, axis classification, and template-provided tuning knobs.
 *
 * VL dependency: **None**
 *
 * This module reads abstract axis descriptors (AxisLayoutInput) and
 * produces abstract layout numbers (LayoutResult). The same layout
 * engine works regardless of output format.
 *
 * ── Backend Responsibility ──────────────────────────────────────────
 * The LayoutResult is a target-agnostic description of "how big things
 * should be".  Each rendering backend (Vega-Lite, ECharts, etc.) MUST:
 *
 *   1. Call computeLayout() once per chart (facet-aware — it already
 *      divides subplot sizes for the facet grid).
 *
 *   2. Translate the LayoutResult into its own rendering format:
 *      - subplotWidth / subplotHeight → plot area size (before margins)
 *      - xStep / yStep → bar widths, band sizes, category spacing
 *      - stepPadding → inter-category gap (barCategoryGap, paddingInner)
 *      - label sizing → font size, rotation, truncation
 *
 *   3. Add its own margins, padding, and chrome (axis labels, titles,
 *      legends, CANVAS_BUFFER) around the subplot area.
 *
 *   4. Handle facet-specific concerns itself:
 *      - Column wrapping (when user specifies column-only, the backend
 *        decides how many columns per visual row and restructures the
 *        panel grid accordingly).
 *      - Per-panel vs shared axis titles.
 *      - Panel positioning and header labels.
 *
 * The layout engine does NOT know about VL encodings, ECharts grid
 * objects, or any rendering-specific structure.
 * =============================================================================
 */

import type {
    ChannelSemantics,
    LayoutDeclaration,
    LayoutResult,
    AssembleOptions,
    ChannelBudgets,
} from './types';
import {
    computeAxisStep,
    computeGasPressure,
    computeLabelSizing,
    computeFontSizing,
    DEFAULT_GAS_PRESSURE_PARAMS,
    type ElasticStretchParams,
    type GasPressureParams,
} from './decisions';
import { planBandDodge } from './band-dodge';

// ---------------------------------------------------------------------------
// Short discrete axis labels (align with echarts/templates/bar.ts)
// ---------------------------------------------------------------------------

const VL_SHORT_DISCRETE_CATEGORY_COUNT = 4;
const VL_SHORT_DISCRETE_LABEL_MAX_LEN = 8;

/** Approximate width (px) of one label character at the given font size. */
const APPROX_CHAR_WIDTH_RATIO = 0.62;

/**
 * How wide one category may grow when a sparse axis fits itself to the room it
 * has. Past this a "band" stops reading as a mark and starts reading as a
 * panel, however much canvas is going spare.
 */
const SPARSE_FIT_BAND_CEILING = 100;

/** Smallest readable default step for a discrete item before overflow activates. */
export const DEFAULT_MIN_STEP = 8;

/** Distinct label strings for a discrete axis field, plus derived stats. */
interface DiscreteLabelStats {
    count: number;
    maxLen: number;
    /** True when every label parses as a finite number (e.g. years, bins, IDs). */
    allNumeric: boolean;
}

function computeDiscreteLabelStats(
    field: string | undefined,
    table: any[],
): DiscreteLabelStats | null {
    if (!field) return null;
    const uniques = new Set<string>();
    for (const row of table) {
        const v = row[field];
        if (v == null || v === '') continue;
        uniques.add(String(v));
    }
    if (uniques.size === 0) return null;
    const labels = [...uniques];
    return {
        count: labels.length,
        maxLen: Math.max(...labels.map(s => s.length)),
        allNumeric: labels.every(s => s.trim() !== '' && isFinite(Number(s))),
    };
}

/**
 * Few, short category strings → keep axis labels horizontal in Vega-Lite. Used
 * for the Y axis, where banded labels read horizontally in the left margin
 * regardless of band height (so quantitative/numeric labels stay horizontal).
 */
function discreteYAxisShouldUseHorizontalLabels(
    field: string | undefined,
    channelType: string | undefined,
    table: any[],
): boolean {
    if (!field) return false;
    if (channelType === 'quantitative') return true;
    const stats = computeDiscreteLabelStats(field, table);
    if (!stats) return false;
    if (stats.count > VL_SHORT_DISCRETE_CATEGORY_COUNT) return false;
    return stats.maxLen <= VL_SHORT_DISCRETE_LABEL_MAX_LEN;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AxisLayoutInput {
    /** Spring model (banded) or gas pressure (non-banded) */
    mode: 'banded' | 'non-banded';
    /** Number of discrete positions (for banded) */
    itemCount: number;
    /** Number of sub-items per group (for grouped bars) */
    subItemsPerGroup?: number;
    /** Numeric values along this axis (for gas pressure) */
    values?: number[];
    /** Data extent [min, max] */
    domain?: [number, number];
    /** Number of distinct series (for series-based pressure) */
    seriesCount?: number;
}

// ---------------------------------------------------------------------------
// Stretch caps
// ---------------------------------------------------------------------------

/**
 * Resolve the per-dimension maximum stretch caps (βx, βy) from options.
 *
 * The assembler derives `maxStretchX`/`maxStretchY` from the spec's
 * `canvasSize / baseSize` ratio (the hard ceiling). When neither is set,
 * both fall back to the scalar `maxStretch` (default {@link DEFAULT_MAX_STRETCH})
 * — the symmetric budget used when the spec pins no `canvasSize`. Each cap is
 * clamped to ≥ 1 (a chart never shrinks below its base under "stretch").
 */
export function resolveStretchCaps(options: AssembleOptions): { x: number; y: number } {
    const def = options.maxStretch ?? DEFAULT_MAX_STRETCH;
    return {
        x: Math.max(1, options.maxStretchX ?? def),
        y: Math.max(1, options.maxStretchY ?? def),
    };
}

/** Default base (target) chart size in pixels when the spec omits `baseSize`. */
export const DEFAULT_BASE_SIZE = { width: 400, height: 320 } as const;

/**
 * Default axis stretch cap used when the spec pins no `canvasSize` ceiling.
 *
 * Bounds how far a chart may grow past its base size (per dimension) under
 * layout pressure. 1.5 keeps growth modest; 2× was found to over-stretch
 * charts in the general (no-ceiling) case.
 */
export const DEFAULT_MAX_STRETCH = 1.5;

/**
 * Resolve the effective base (target) size the layout pipeline aims for.
 *
 * Defaults to {@link DEFAULT_BASE_SIZE} when the spec omits `baseSize`, then
 * clamps each dimension to the optional `canvasSize` ceiling. This guarantees
 * the target never exceeds the hard maximum: when a user sets only a (small)
 * `canvasSize` and leaves `baseSize` defaulted — or sets a `baseSize` larger
 * than the ceiling — the chart shrinks to fit the box instead of overflowing
 * it. After clamping, `deriveStretchCaps` yields βx/βy = 1 in any clamped
 * dimension (pure fit-to-box, no growth past the ceiling).
 */
export function resolveBaseSize(
    specBaseSize: { width: number; height: number } | undefined,
    ceiling: { width: number; height: number } | undefined,
): { width: number; height: number } {
    const base = specBaseSize ?? { ...DEFAULT_BASE_SIZE };
    if (!ceiling) return { width: base.width, height: base.height };
    return {
        width: Math.min(base.width, ceiling.width),
        height: Math.min(base.height, ceiling.height),
    };
}

/**
 * Read the user's `facetColumns` chart property (the interactive facet-wrap
 * control) off the RAW chart_spec.chartProperties, returning a clamped integer
 * column count or undefined for auto. Read raw (pre-normalization) because
 * `facetColumns` is a layout-level option, not a per-template mark property, so
 * `normalizeChartProperties` would otherwise drop it as an unknown key.
 */
export function resolveFacetColumnsOption(
    chartProperties: Record<string, any> | undefined,
): number | undefined {
    const raw = chartProperties?.facetColumns;
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
}

/**
 * Derive per-dimension stretch ceilings (βx, βy) for an assembler.
 *
 * When the spec supplies a hard `canvasSize` ceiling, the caps are the ratio
 * of ceiling to base in each dimension (clamped to ≥ 1). The base passed here
 * is expected to already be clamped to the ceiling (see {@link resolveBaseSize}),
 * so a ceiling smaller than the spec's base resolves to β = 1 (fit-to-box)
 * rather than an overflow. When no ceiling is given, both caps fall back to
 * `options.maxStretch` (or {@link DEFAULT_MAX_STRETCH} when that is unset too),
 * which already reflects any template `paramOverrides`.
 *
 * Assemblers inject the result into `effectiveOptions.maxStretchX/Y` so the
 * whole layout pipeline shares one budget — including faceted grids, whose
 * total size is bounded by the same ceiling.
 */
export function deriveStretchCaps(
    baseSize: { width: number; height: number },
    ceiling: { width: number; height: number } | undefined,
    options: AssembleOptions,
): { maxStretchX: number; maxStretchY: number } {
    const def = options.maxStretch ?? DEFAULT_MAX_STRETCH;
    return {
        maxStretchX: ceiling ? Math.max(1, ceiling.width / baseSize.width) : def,
        maxStretchY: ceiling ? Math.max(1, ceiling.height / baseSize.height) : def,
    };
}

// ---------------------------------------------------------------------------
// Public API: computeLayout
// ---------------------------------------------------------------------------

/**
 * The size a cell in a grid wants to be, before the room has its say. Larger
 * than a bar's band because a tone needs area to be compared: below about
 * twenty pixels a patch reads as grout between its neighbours.
 */
const CELL_BAND_SIZE = 28;

/**
 * How much of the wider step squaring a grid may cost. At 1.5 a 30px step will
 * give way to a 20px square, but not to a 15px one.
 */
const SQUARE_CELL_TOLERANCE = 1.5;

/**
 * Phase 1: Compute layout decisions.
 *
 * Takes channel semantics, template layout declaration, data, canvas size,
 * and assembly options to produce a LayoutResult with step sizes, subplot
 * dimensions, label sizing, and truncation warnings.
 *
 * VL dependency: **None**
 *
 * @param channelSemantics   Phase 0 output
 * @param declaration        Template's layout declaration (axisFlags, resolvedTypes,
 *                           grouping, binnedAxes)
 * @param table              Data rows (post-overflow filtered)
 * @param canvasSize         Target canvas dimensions
 * @param options            Assembly options (merged with template overrides)
 * @param facetGrid          Optional pre-decided facet grid from computeFacetGrid.
 *                           When provided, computeLayout uses these column/row
 *                           counts instead of counting from data — this
 *                           eliminates the circularity between wrapping and
 *                           banded axis sizing.
 */
export function computeLayout(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    table: any[],
    canvasSize: { width: number; height: number },
    options: AssembleOptions = {},
    facetGrid?: { columns: number; rows: number },
): LayoutResult {
    const {
        elasticity: elasticityVal = 0.5,
        facetElasticity: facetElasticityVal = 0.3,
        minStep: minStepVal = DEFAULT_MIN_STEP,
        minSubplotSize: minSubplotVal = 60,
        stepPadding: stepPaddingVal = 0.1,
        bandStepFit: bandStepFitVal = 0,
        maintainContinuousAxisRatio = false,
        continuousMarkCrossSection,
        facetAspectRatioResistance = 0,
    } = options;

    // Per-dimension stretch ceilings: βx bounds width-related growth,
    // βy bounds height-related growth. Both reduce to `maxStretch`
    // (default 1.5) when the spec sets no explicit `canvasSize` ceiling.
    const { x: maxStretchX, y: maxStretchY } = resolveStretchCaps(options);

    const defaultChartWidth = canvasSize.width;
    const defaultChartHeight = canvasSize.height;

    // Facet overhead: fixed (axis labels, titles) + per-panel gap (spacing).
    const fixW = options.facetFixedPadding?.width ?? 0;
    const fixH = options.facetFixedPadding?.height ?? 0;
    const gap = options.facetGap ?? 0;

    const baseRefSize = 300;
    const sizeRatio = Math.max(defaultChartWidth, defaultChartHeight) / baseRefSize;
    const baseBandSize = options.defaultBandSize ?? 20;
    const defaultStepSize = Math.round(baseBandSize * Math.max(1, sizeRatio));

    const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

    // Apply resolved types from template declaration
    const effectiveTypes: Record<string, string> = {};
    for (const [ch, cs] of Object.entries(channelSemantics)) {
        effectiveTypes[ch] = declaration.resolvedTypes?.[ch] || cs.type;
    }

    // --- Classify axes and count items ---
    const axisFlags = declaration.axisFlags || {};
    const xBanded = axisFlags.x?.banded ?? false;
    const yBanded = axisFlags.y?.banded ?? false;
    // Two banded axes describe cells, not freely thickened bars. Their shared
    // cell-size resolver owns both steps, so sparse-axis fit must stay out.
    const effectiveBandStepFit = xBanded && yBanded ? 0 : bandStepFitVal;
    // Sparse-expansion ceiling: a band may grow past its base size to fill a
    // wide plot, but never past maxStepSize. Defaults to the base band, so a
    // backend that doesn't opt in keeps the old "cap at base" behavior.
    const maxBandSize = options.maxBandSize == null
        ? (effectiveBandStepFit > 0 ? Math.max(baseBandSize, SPARSE_FIT_BAND_CEILING) : baseBandSize)
        : Math.max(baseBandSize, options.maxBandSize);
    // A sparse-fit ceiling is an absolute readability limit, not a share of the
    // canvas: scaling it with the plot is what turns three categories into
    // three slabs. A template that already asks for a wide band (a slopegraph's
    // two columns) keeps its own step; a caller-stated ceiling still scales.
    const maxStepSize = options.maxBandSize == null && effectiveBandStepFit > 0
        ? Math.max(defaultStepSize, SPARSE_FIT_BAND_CEILING)
        : Math.round(maxBandSize * Math.max(1, sizeRatio));

    const nominalCount: Record<string, number> = {
        x: 0, y: 0, column: 0, row: 0, group: 0,
    };

    // Count discrete values per channel
    for (const channel of ['x', 'y', 'column', 'row', 'color'] as const) {
        const cs = channelSemantics[channel];
        if (!cs?.field) continue;
        const effectiveType = effectiveTypes[channel] || cs.type;
        if (!isDiscreteType(effectiveType)) continue;
        const uniqueValues = [...new Set(table.map((r: any) => r[cs.field]))];
        nominalCount[channel] = uniqueValues.length;
    }

    // Detect grouping from 'group' channel + discrete axis
    let groupField: string | undefined = channelSemantics.group?.field;
    // Some templates (e.g. boxplot) subdivide a band by the COLOR field via an
    // explicit offset rather than a dedicated 'group' channel. When they opt in,
    // size the band as a group so total width is budgeted across categories and
    // each sub-lane shrinks as the subgroup count grows.
    if (!groupField && declaration.colorActsAsGroup) {
        const colorCS = channelSemantics.color;
        const colorType = effectiveTypes.color ?? colorCS?.type;
        const axisField = isDiscreteType(effectiveTypes.x ?? channelSemantics.x?.type)
            ? channelSemantics.x?.field
            : channelSemantics.y?.field;
        if (colorCS?.field && isDiscreteType(colorType) && colorCS.field !== axisField) {
            groupField = colorCS.field;
        }
    }
    // Guard: a grouping field that is redundant/nested with the categorical axis
    // (group == x, or a 1:1 field pair) doesn't actually subdivide any band, so
    // grouping it would collapse each bar/box to ~1/N of its band. When no band
    // holds more than one distinct group value (confident-nested; threshold-
    // independent), suppress grouping so glyphs fill their whole band. Genuine
    // grouped charts (any band with >1 group value) are untouched.
    if (groupField) {
        const groupAxisField = isDiscreteType(effectiveTypes.x ?? channelSemantics.x?.type)
            ? channelSemantics.x?.field
            : channelSemantics.y?.field;
        if (groupAxisField === groupField) {
            groupField = undefined;  // group == axis: nothing to dodge
        } else if (groupAxisField && planBandDodge(table, groupAxisField, groupField).maxPerBand <= 1) {
            groupField = undefined;  // 1:1 / nested with the axis
        }
    }
    let groupAxis: 'x' | 'y' | undefined;
    if (groupField) {
        // `local` dodge budgets only `maxPerBand` lanes (declaration.groupLaneCount);
        // otherwise reserve one lane per global distinct group value.
        nominalCount.group = declaration.groupLaneCount
            ?? new Set(table.map((r: any) => r[groupField])).size;
        if (isDiscreteType(effectiveTypes.x ?? channelSemantics.x?.type)) groupAxis = 'x';
        else if (isDiscreteType(effectiveTypes.y ?? channelSemantics.y?.type)) groupAxis = 'y';
    }

    // Total discrete items per axis (grouping multiplies the grouped axis)
    const xGroupMultiplier = (groupAxis === 'x' && nominalCount.group > 1) ? nominalCount.group : 1;
    const yGroupMultiplier = (groupAxis === 'y' && nominalCount.group > 1) ? nominalCount.group : 1;
    const xTotalNominalCount = nominalCount.x * xGroupMultiplier;
    const yTotalNominalCount = nominalCount.y * yGroupMultiplier;

    // --- Step size hints ---
    // Minimum group step: the inter-group gap (stepPadding × step) must be
    // at least MIN_GROUP_GAP_PX pixels so groups are visually separated.
    const MIN_GROUP_GAP_PX = 3;
    const xMinGroupStep = xGroupMultiplier > 1 ? Math.max(Math.ceil(MIN_GROUP_GAP_PX / stepPaddingVal), 2 * xGroupMultiplier) : minStepVal;
    const yMinGroupStep = yGroupMultiplier > 1 ? Math.max(Math.ceil(MIN_GROUP_GAP_PX / stepPaddingVal), 2 * yGroupMultiplier) : minStepVal;

    // (Overflow filtering is now handled by filterOverflow() before
    //  computeLayout is called. The data passed here is already filtered.)

    // --- Count banded continuous axes ---
    let xContinuousAsDiscrete = 0;
    let yContinuousAsDiscrete = 0;
    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field) continue;
        const effectiveType = effectiveTypes[axis] || cs.type;
        if (isDiscreteType(effectiveType)) continue;

        const isBanded = (axis === 'x' ? xBanded : yBanded);
        // Check for binned from declaration
        const isBinned = declaration.binnedAxes?.[axis];
        if (!isBanded && !isBinned) continue;

        let count: number;
        if (isBinned) {
            const binDef = declaration.binnedAxes![axis];
            // Default to 10 bins (Vega-Lite's default maxbins)
            count = typeof binDef === 'object' && binDef.maxbins
                ? binDef.maxbins : 10;
        } else {
            count = new Set(table.map((r: any) => r[cs.field])).size;
        }
        if (count <= 1) continue;

        if (axis === 'x') {
            xContinuousAsDiscrete = count;
        } else {
            yContinuousAsDiscrete = count;
        }
    }

    // --- Facet layout ---
    // Use pre-decided grid from filterOverflow when available.
    // This avoids the circularity where wrapping depends on subplot
    // width which depends on facet count which depends on wrapping.
    let facetCols = 1;
    let facetRows = 1;
    if (facetGrid) {
        facetCols = facetGrid.columns;
        facetRows = facetGrid.rows;
    } else {
        if (nominalCount.column > 0) facetCols = nominalCount.column;
        if (nominalCount.row > 0) facetRows = nominalCount.row;
    }

    // --- Facet subplot sizing ---
    // Log-scale axes need more room so the minor grid lines (1,2,3…9 per
    // decade) remain legible and act as the visual cue that it's log scale.
    // Compute the number of orders of magnitude each axis spans; each
    // decade needs ~40px minimum to avoid a dense wall of grid lines.
    const LOG_PX_PER_DECADE = 40;
    let logBoostX = 0;
    let logBoostY = 0;
    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field || !cs.scaleType) continue;
        if (cs.scaleType !== 'log' && cs.scaleType !== 'symlog') continue;
        const vals = table
            .map((r: any) => r[cs.field])
            .filter((v: any) => typeof v === 'number' && v > 0 && isFinite(v));
        if (vals.length < 2) continue;
        const decades = Math.log10(Math.max(...vals)) - Math.log10(Math.min(...vals));
        const needed = Math.ceil(Math.max(1, decades)) * LOG_PX_PER_DECADE;
        if (axis === 'x') logBoostX = needed;
        else logBoostY = needed;
    }
    const minContinuousSize = Math.max(10, minStepVal);
    const minContinuousSizeX = Math.max(minContinuousSize, logBoostX);
    const minContinuousSizeY = Math.max(minContinuousSize, logBoostY);

    let subplotWidth: number;
    if (facetCols > 1) {
        const stretch = Math.min(maxStretchX, Math.pow(facetCols, facetElasticityVal));
        subplotWidth = Math.round(Math.max(minContinuousSizeX,
            (defaultChartWidth * stretch - fixW) / facetCols - gap));
    } else {
        subplotWidth = defaultChartWidth;
    }

    let subplotHeight: number;
    if (facetRows > 1) {
        const stretch = Math.min(maxStretchY, Math.pow(facetRows, facetElasticityVal));
        subplotHeight = Math.round(Math.max(minContinuousSizeY,
            (defaultChartHeight * stretch - fixH) / facetRows - gap));
    } else {
        subplotHeight = defaultChartHeight;
    }

    // --- Facet aspect-ratio resistance (non-gas-pressure charts) ---
    // When faceting compresses one dimension (e.g. width ÷ columns), the
    // aspect ratio drifts.  Line/area charts are very sensitive to this.
    // For charts entering the 2D gas pressure path, AR resistance is
    // handled inside the ideal-then-squeeze logic below. This block
    // only applies when both axes are NOT continuous-non-banded.
    const xIsContinuousNonBanded = xTotalNominalCount === 0 && xContinuousAsDiscrete === 0;
    const yIsContinuousNonBanded = yTotalNominalCount === 0 && yContinuousAsDiscrete === 0;
    const bothContinuousNonBanded = xIsContinuousNonBanded && yIsContinuousNonBanded;

    if (facetAspectRatioResistance > 0 && !bothContinuousNonBanded
        && (facetCols > 1 || facetRows > 1)) {
        const baseAR = defaultChartWidth / defaultChartHeight;
        const facetAR = subplotWidth / subplotHeight;
        const arDrift = facetAR / baseAR; // <1 when panel got relatively narrower

        if (arDrift < 1) {
            // Panel is narrower than base → shrink height to compensate
            subplotHeight = Math.round(
                Math.max(minContinuousSizeY, subplotHeight * Math.pow(arDrift, facetAspectRatioResistance)),
            );
        } else if (arDrift > 1) {
            // Panel is wider than base → shrink width to compensate
            subplotWidth = Math.round(
                Math.max(minContinuousSizeX, subplotWidth * Math.pow(1 / arDrift, facetAspectRatioResistance)),
            );
        }
    }

    // --- Gas pressure stretch for continuous non-banded axes ---
    //
    // Design: per-subplot baseline → pressure → AR blend → fit.
    //
    //   Baseline: each subplot gets a fair share of the canvas with
    //             facet elasticity applied (cols^e / cols).
    //   Step 1 — Gas pressure measures crowding against the per-subplot
    //            baseline and produces per-axis raw stretches.
    //   Step 2 — Decide AR: blend gas-pressure AR (density asymmetry)
    //            with banking AR (perceptual slope optimization) in
    //            log space.  Distribute gas-pressure area into the
    //            blended AR.
    //   Step 3 — Fit into budget: uniform scale-down so neither axis
    //            exceeds maxStretch, preserving the AR.

    if (bothContinuousNonBanded) {
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;

        if (xCS?.field && yCS?.field) {
            const isTempX = (effectiveTypes.x || xCS.type) === 'temporal';
            const isTempY = (effectiveTypes.y || yCS.type) === 'temporal';

            const xNumeric: number[] = [];
            const yNumeric: number[] = [];
            for (const row of table) {
                let xv = row[xCS.field];
                let yv = row[yCS.field];
                if (xv == null || yv == null) continue;
                if (isTempX) xv = +new Date(xv);
                else xv = +xv;
                if (isTempY) yv = +new Date(yv);
                else yv = +yv;
                if (isNaN(xv) || isNaN(yv)) continue;
                xNumeric.push(xv);
                yNumeric.push(yv);
            }

            if (xNumeric.length > 1) {
                const xMin = Math.min(...xNumeric);
                const xMax = Math.max(...xNumeric);
                const yMin = Math.min(...yNumeric);
                const yMax = Math.max(...yNumeric);

                // Expand to visual domain (include zero when axis starts at zero).
                const xDomain: [number, number] = [xMin, xMax];
                const yDomain: [number, number] = [yMin, yMax];
                if (xCS.zero?.zero) {
                    if (xDomain[0] > 0) xDomain[0] = 0;
                    if (xDomain[1] < 0) xDomain[1] = 0;
                }
                if (yCS.zero?.zero) {
                    if (yDomain[0] > 0) yDomain[0] = 0;
                    if (yDomain[1] < 0) yDomain[1] = 0;
                }

                // Data-coverage guard: skip banking when zero dominates.
                const xDataCoverage = (xDomain[1] - xDomain[0]) > 0
                    ? (xMax - xMin) / (xDomain[1] - xDomain[0]) : 1;
                const yDataCoverage = (yDomain[1] - yDomain[0]) > 0
                    ? (yMax - yMin) / (yDomain[1] - yDomain[0]) : 1;
                const BANKING_COVERAGE_THRESHOLD = 0.2;

                // --- Gas pressure params ---
                let gasPressureParams: GasPressureParams = DEFAULT_GAS_PRESSURE_PARAMS;
                if (continuousMarkCrossSection != null) {
                    if (typeof continuousMarkCrossSection === 'number') {
                        gasPressureParams = { ...DEFAULT_GAS_PRESSURE_PARAMS, markCrossSection: continuousMarkCrossSection };
                    } else {
                        const maxCS = Math.max(continuousMarkCrossSection.x, continuousMarkCrossSection.y);
                        gasPressureParams = {
                            ...DEFAULT_GAS_PRESSURE_PARAMS,
                            markCrossSection: maxCS,
                            markCrossSectionX: continuousMarkCrossSection.x,
                            markCrossSectionY: continuousMarkCrossSection.y,
                            ...(continuousMarkCrossSection.elasticity != null && { elasticity: continuousMarkCrossSection.elasticity }),
                            ...(continuousMarkCrossSection.maxStretch != null && { maxStretch: continuousMarkCrossSection.maxStretch }),
                        };

                        if (continuousMarkCrossSection.seriesCountAxis) {
                            const resolvedAxis = continuousMarkCrossSection.seriesCountAxis === 'auto'
                                ? 'y' : continuousMarkCrossSection.seriesCountAxis;
                            const nSeries = countDistinctSeries(channelSemantics, table);
                            if (resolvedAxis === 'y') {
                                gasPressureParams.yItemCountOverride = nSeries;
                            } else {
                                gasPressureParams.xItemCountOverride = nSeries;
                            }
                        }
                    }
                }

                // --- Per-subplot baseline canvas ---
                // Gas pressure must measure crowding against the actual
                // per-subplot space, not the full canvas.  When faceted,
                // each subplot gets a share of the canvas that includes
                // facet elasticity (the same formula used for discrete
                // axes): `canvas × cols^elasticity / cols`.  This way
                // 2 columns don't naively halve the space — some stretch
                // is assumed before gas pressure even kicks in.
                const perSubplotCanvasW = facetCols > 1
                    ? Math.max(minContinuousSizeX,
                        (defaultChartWidth * Math.min(maxStretchX, Math.pow(facetCols, facetElasticityVal)) - fixW)
                        / facetCols - gap)
                    : defaultChartWidth;
                const perSubplotCanvasH = facetRows > 1
                    ? Math.max(minContinuousSizeY,
                        (defaultChartHeight * Math.min(maxStretchY, Math.pow(facetRows, facetElasticityVal)) - fixH)
                        / facetRows - gap)
                    : defaultChartHeight;

                // --- Gas pressure: per-axis raw stretches ---
                const idealResult = computeGasPressure(
                    xNumeric, yNumeric, xDomain, yDomain,
                    perSubplotCanvasW, perSubplotCanvasH, gasPressureParams,
                );

                const isConnected = typeof continuousMarkCrossSection === 'object'
                    && !!continuousMarkCrossSection.seriesCountAxis;
                const useBanking = xDataCoverage >= BANKING_COVERAGE_THRESHOLD
                    && yDataCoverage >= BANKING_COVERAGE_THRESHOLD;

                let idealW: number;
                let idealH: number;

                // Gas pressure's native per-axis dimensions (uncapped).
                const rawW = perSubplotCanvasW * idealResult.rawStretchX;
                const rawH = perSubplotCanvasH * idealResult.rawStretchY;

                if (useBanking) {
                    // ── Step 1: Decide AR ──────────────────────────────
                    // Blend gas-pressure AR (which axis is more crowded)
                    // with banking AR (perceptual slope optimization).
                    const seriesFields: string[] = [];
                    const colorField = channelSemantics.color?.field;
                    const detailField = channelSemantics.detail?.field;
                    if (colorField) seriesFields.push(colorField);
                    if (detailField && detailField !== colorField) seriesFields.push(detailField);

                    const perPointSeriesKeys: string[] = new Array(xNumeric.length);
                    if (seriesFields.length === 0) {
                        perPointSeriesKeys.fill('');
                    } else {
                        let idx = 0;
                        for (const row of table) {
                            const xv = xCS?.field ? row[xCS.field] : undefined;
                            const yv = yCS?.field ? row[yCS.field] : undefined;
                            if (xv == null || yv == null) continue;
                            const xn = isTempX ? +new Date(xv) : +xv;
                            const yn = isTempY ? +new Date(yv) : +yv;
                            if (isNaN(xn) || isNaN(yn)) continue;
                            perPointSeriesKeys[idx++] = seriesFields
                                .map(f => String(row[f] ?? '')).join('\x00');
                        }
                    }

                    const bankingAR = computeBankingAR(
                        xNumeric, yNumeric, xDomain, yDomain,
                        perPointSeriesKeys, isConnected,
                    );

                    // ── Step 2: Blend AR + distribute area ────────────
                    // Gas pressure knows which axis is crowded (per-axis
                    // stretch).  Banking knows the perceptual ideal AR.
                    // Blend in log space so both signals contribute:
                    //   gasAR reflects density asymmetry (X crowded → landscape)
                    //   bankingAR reflects slope perception
                    const BANKING_BLEND = 0.5;
                    const gasAR = rawW / rawH;
                    const blendedAR = gasAR > 0 && bankingAR > 0
                        ? Math.exp((1 - BANKING_BLEND) * Math.log(gasAR)
                            + BANKING_BLEND * Math.log(bankingAR))
                        : bankingAR;

                    // Total area from gas pressure (capped so subplot
                    // doesn't blow past per-subplot budget before fit).
                    const rawArea = rawW * rawH;
                    const maxArea = perSubplotCanvasW * perSubplotCanvasH * Math.max(maxStretchX, maxStretchY);
                    const area = Math.min(rawArea, maxArea);

                    idealW = Math.sqrt(area * blendedAR);
                    idealH = Math.sqrt(area / blendedAR);
                } else {
                    // Banking skipped (zero dominates): gas pressure shape.
                    idealW = rawW;
                    idealH = rawH;
                }

                // ── Step 3: Fit into budget, preserving AR ───────────
                // Hard ceiling per subplot: canvas × maxStretch shared
                // across facet panels.
                const availW = facetCols > 1
                    ? Math.max(minContinuousSizeX, (defaultChartWidth * maxStretchX - fixW) / facetCols - gap)
                    : defaultChartWidth * maxStretchX;
                const availH = facetRows > 1
                    ? Math.max(minContinuousSizeY, (defaultChartHeight * maxStretchY - fixH) / facetRows - gap)
                    : defaultChartHeight * maxStretchY;

                // Scale down to fit: if either axis exceeds its budget,
                // shrink both axes by the tighter ratio so neither
                // exceeds AND the AR is preserved.
                const scaleX = idealW > availW ? availW / idealW : 1;
                const scaleY = idealH > availH ? availH / idealH : 1;
                const fitScale = Math.min(scaleX, scaleY);

                let finalW = idealW * fitScale;
                let finalH = idealH * fitScale;

                // Enforce minimums (may slightly distort AR at extremes).
                finalW = Math.max(finalW, minContinuousSizeX);
                finalH = Math.max(finalH, minContinuousSizeY);

                subplotWidth = Math.round(finalW);
                subplotHeight = Math.round(finalH);
            }
        }
    } else if (xIsContinuousNonBanded || yIsContinuousNonBanded) {
        const contAxis = xIsContinuousNonBanded ? 'x' : 'y';
        const otherAxisHasDiscreteItems = contAxis === 'x'
            ? (yTotalNominalCount > 0 || yContinuousAsDiscrete > 0)
            : (xTotalNominalCount > 0 || xContinuousAsDiscrete > 0);

        let seriesStretchApplied = false;
        if (typeof continuousMarkCrossSection === 'object' && continuousMarkCrossSection.seriesCountAxis) {
            const resolvedAxis = continuousMarkCrossSection.seriesCountAxis === 'auto'
                ? contAxis : continuousMarkCrossSection.seriesCountAxis;

            if (resolvedAxis === contAxis) {
                const sigmaPerSeries = contAxis === 'x'
                    ? continuousMarkCrossSection.x
                    : continuousMarkCrossSection.y;
                const baseDim = contAxis === 'x' ? subplotWidth : subplotHeight;
                const nSeries = countDistinctSeries(channelSemantics, table);
                const pressure = (nSeries * sigmaPerSeries) / baseDim;

                const elast = continuousMarkCrossSection.elasticity ?? DEFAULT_GAS_PRESSURE_PARAMS.elasticity;
                const maxS = continuousMarkCrossSection.maxStretch ?? DEFAULT_GAS_PRESSURE_PARAMS.maxStretch;

                if (pressure > 1) {
                    const stretch = Math.min(maxS, Math.pow(pressure, elast));
                    if (contAxis === 'x') {
                        subplotWidth = Math.round(subplotWidth * stretch);
                    } else {
                        subplotHeight = Math.round(subplotHeight * stretch);
                    }
                }
                seriesStretchApplied = true;
            }
        }

        if (!seriesStretchApplied && !otherAxisHasDiscreteItems) {
            const contCS = channelSemantics[contAxis];
            if (contCS?.field) {
                const isTemporal = (effectiveTypes[contAxis] || contCS.type) === 'temporal';
                const contValues: number[] = [];
                for (const row of table) {
                    let v = row[contCS.field];
                    if (v == null) continue;
                    if (isTemporal) v = +new Date(v);
                    else v = +v;
                    if (!isNaN(v)) contValues.push(v);
                }
                const sigma1d = Math.sqrt(DEFAULT_GAS_PRESSURE_PARAMS.markCrossSection);
                const baseDim = contAxis === 'x' ? subplotWidth : subplotHeight;
                const pressure1d = (contValues.length * sigma1d) / baseDim;
                if (pressure1d > 1) {
                    const stretch1d = Math.min(
                        DEFAULT_GAS_PRESSURE_PARAMS.maxStretch,
                        Math.pow(pressure1d, DEFAULT_GAS_PRESSURE_PARAMS.elasticity),
                    );
                    if (contAxis === 'x') {
                        subplotWidth = Math.round(subplotWidth * stretch1d);
                    } else {
                        subplotHeight = Math.round(subplotHeight * stretch1d);
                    }
                }
            }
        }
    }

    // --- Elastic stretch for discrete axes ---
    // X axis grows under its width budget (βx); Y under its height budget (βy).
    const elasticParamsX: ElasticStretchParams = {
        elasticity: elasticityVal,
        maxStretch: maxStretchX,
        defaultStepSize,
        bandStepFit: effectiveBandStepFit,
        bandStepFitCapacity: Math.max(1,
            (options.bandStepFitCapacityX ?? defaultChartWidth) / defaultChartWidth),
        minStep: minStepVal,
    };
    const elasticParamsY: ElasticStretchParams = {
        elasticity: elasticityVal,
        maxStretch: maxStretchY,
        defaultStepSize,
        bandStepFit: effectiveBandStepFit,
        bandStepFitCapacity: Math.max(1,
            (options.bandStepFitCapacityY ?? defaultChartHeight) / defaultChartHeight),
        minStep: minStepVal,
    };

    const xAxis = computeAxisStep(xTotalNominalCount, xContinuousAsDiscrete, subplotWidth, elasticParamsX);
    const yAxis = computeAxisStep(yTotalNominalCount, yContinuousAsDiscrete, subplotHeight, elasticParamsY);

    const xIsDiscrete = xTotalNominalCount > 0;
    const yIsDiscrete = yTotalNominalCount > 0;

    const xHasGrouping = groupAxis === 'x' && nominalCount.group > 0;
    const yHasGrouping = groupAxis === 'y' && nominalCount.group > 0;

    let xStepSize: number;
    let yStepSize: number;
    let xStepUnit: 'item' | 'group' | undefined;
    let yStepUnit: 'item' | 'group' | undefined;

    if (xIsDiscrete && xHasGrouping) {
        const itemsPerGroup = nominalCount.group;
        const defaultGroupStep = itemsPerGroup * maxStepSize;
        const minGroupStep = Math.max(Math.ceil(MIN_GROUP_GAP_PX / stepPaddingVal), 2 * itemsPerGroup);
        const groupElasticX = {
            ...elasticParamsX,
            defaultStepSize: elasticParamsX.defaultStepSize * itemsPerGroup,
        };
        const groupAxis = computeAxisStep(nominalCount.x, 0, subplotWidth, groupElasticX);
        const groupStep = Math.max(minGroupStep, Math.min(defaultGroupStep, groupAxis.step));
        xStepSize = groupStep;
        xStepUnit = 'group';
    } else if (xIsDiscrete) {
        xStepSize = Math.max(minStepVal, Math.min(maxStepSize, xAxis.step));
    } else if (xContinuousAsDiscrete > 0) {
        xStepSize = Math.max(minStepVal, Math.min(maxStepSize, xAxis.step));
    } else {
        xStepSize = defaultStepSize;
    }

    if (yIsDiscrete && yHasGrouping) {
        const itemsPerGroup = nominalCount.group;
        const defaultGroupStep = itemsPerGroup * maxStepSize;
        const minGroupStep = Math.max(Math.ceil(MIN_GROUP_GAP_PX / stepPaddingVal), 2 * itemsPerGroup);
        const groupElasticY = {
            ...elasticParamsY,
            defaultStepSize: elasticParamsY.defaultStepSize * itemsPerGroup,
        };
        const groupAxis = computeAxisStep(nominalCount.y, 0, subplotHeight, groupElasticY);
        const groupStep = Math.max(minGroupStep, Math.min(defaultGroupStep, groupAxis.step));
        yStepSize = groupStep;
        yStepUnit = 'group';
    } else if (yIsDiscrete) {
        yStepSize = Math.max(minStepVal, Math.min(maxStepSize, yAxis.step));
    } else if (yContinuousAsDiscrete > 0) {
        yStepSize = Math.max(minStepVal, Math.min(maxStepSize, yAxis.step));
    } else {
        yStepSize = defaultStepSize;
    }

    // --- Banded continuous canvas size ---
    for (const axis of ['x', 'y'] as const) {
        const count = axis === 'x' ? xContinuousAsDiscrete : yContinuousAsDiscrete;
        if (count <= 0) continue;
        const stepSize = axis === 'x' ? xStepSize : yStepSize;
        const continuousSize = Math.round(stepSize * (count + 1));
        if (axis === 'x') {
            subplotWidth = continuousSize;
        } else {
            subplotHeight = continuousSize;
        }
    }

    // --- Unified stretch budget ------------------------------------------------
    // Cap the per-subplot dimensions so total canvas never exceeds
    // canvasWidth × maxStretch (and canvasHeight × maxStretch).
    // Formula: effectiveW = W × maxStretch − fixedPad; each panel costs subplot + gap.
    const maxSubplotW = (defaultChartWidth * maxStretchX - fixW) / facetCols - gap;
    const maxSubplotH = (defaultChartHeight * maxStretchY - fixH) / facetRows - gap;

    // Clamp step sizes for discrete/banded axes so VL step-based
    // sizing respects the same budget.
    // When step unit is 'group', divide by the number of groups (nominalCount)
    // rather than the total item count (groups × items-per-group).
    if (xTotalNominalCount > 0) {
        const divisor = xStepUnit === 'group' ? nominalCount.x : xTotalNominalCount;
        const cap = Math.max(minStepVal, Math.floor(maxSubplotW / divisor));
        if (xStepSize > cap) xStepSize = cap;
    }
    if (xContinuousAsDiscrete > 0) {
        const cap = Math.max(minStepVal, Math.floor(maxSubplotW / (xContinuousAsDiscrete + 1)));
        if (xStepSize > cap) xStepSize = cap;
    }
    if (yTotalNominalCount > 0) {
        const divisor = yStepUnit === 'group' ? nominalCount.y : yTotalNominalCount;
        const cap = Math.max(minStepVal, Math.floor(maxSubplotH / divisor));
        if (yStepSize > cap) yStepSize = cap;
    }
    if (yContinuousAsDiscrete > 0) {
        const cap = Math.max(minStepVal, Math.floor(maxSubplotH / (yContinuousAsDiscrete + 1)));
        if (yStepSize > cap) yStepSize = cap;
    }

    // Recompute banded subplot size after step clamping.
    for (const axis of ['x', 'y'] as const) {
        const count = axis === 'x' ? xContinuousAsDiscrete : yContinuousAsDiscrete;
        if (count <= 0) continue;
        const stepSize = axis === 'x' ? xStepSize : yStepSize;
        if (axis === 'x') subplotWidth = Math.round(stepSize * (count + 1));
        else subplotHeight = Math.round(stepSize * (count + 1));
    }

    // --- Square cells ---
    // Two banded axes means the marks are cells, not bars. A bar states its
    // value as a length along one axis, so its thickness is free; a cell states
    // its value as a tone, and the eye compares tones by area. A grid of
    // squares reads as a surface; a grid of thin rectangles reads as stripes,
    // and invites a comparison along the long side that the data does not
    // support.
    //
    // So the two steps are pulled to one size. The caps used here are the ones
    // the stretch budget already produced, which is what lets a grid spend a
    // little extra canvas to come out square. Where the categories are too many
    // for that — where squaring would cut the wider step by more than a third —
    // the grid stays rectangular: a shape nobody asked for is not worth losing
    // that much room over.
    //
    // A connected mark whose two axes are both discrete — a bump chart, ranks
    // over time — is the exception: it is a line, not a grid of cells, so it is
    // neither squared nor stretched to fill the height. The mark declares a
    // cross-section per axis; the larger one is the run the line travels along
    // (time), the smaller the stack it crosses (rank). Squaring the two, or
    // letting the rank axis grow one band per competitor, only makes the panel
    // taller and every crossing a near-vertical plunge — the shape the eye
    // reads worst. Instead the rank axis is held to its thin cross-section and
    // the run axis is stretched to a bounded multiple of it, so the panel comes
    // out landscape and the slopes sit nearer 45°. Horizontal room is what
    // untangles a crossing mass of lines, so the run is where the budget is
    // spent.
    const isConnectedMark = typeof continuousMarkCrossSection === 'object'
        && !!continuousMarkCrossSection.seriesCountAxis;
    const bothDiscreteConnected = isConnectedMark
        && xTotalNominalCount > 0 && yTotalNominalCount > 0
        && !xHasGrouping && !yHasGrouping;
    if (bothDiscreteConnected && typeof continuousMarkCrossSection === 'object') {
        const csX = continuousMarkCrossSection.x ?? 0;
        const csY = continuousMarkCrossSection.y ?? 0;
        if (csX > 0 && csY > 0) {
            // Cap the run band's advantage over the cross band: past about 2:1
            // the extra width buys little and the panel just runs off the edge.
            const RUN_AR_CAP = 2;
            const runIsX = csX >= csY;
            const crossCS = runIsX ? csY : csX;
            const runBudget = runIsX
                ? Math.floor(maxSubplotW / xTotalNominalCount)
                : Math.floor(maxSubplotH / yTotalNominalCount);
            const cross = Math.max(minStepVal,
                Math.min(runIsX ? yStepSize : xStepSize, crossCS));
            const ratio = Math.min(RUN_AR_CAP, Math.max(1, Math.max(csX, csY) / Math.min(csX, csY)));
            const run = Math.max(
                runIsX ? xStepSize : yStepSize,
                Math.min(runBudget, Math.round(cross * ratio)));
            if (runIsX) { xStepSize = run; yStepSize = cross; }
            else { yStepSize = run; xStepSize = cross; }
        }
    }
    if (xTotalNominalCount > 0 && yTotalNominalCount > 0 && !xHasGrouping && !yHasGrouping
        && !bothDiscreteConnected) {
        const capX = Math.floor(maxSubplotW / xTotalNominalCount);
        const capY = Math.floor(maxSubplotH / yTotalNominalCount);
        // A grid cell is a two-dimensional reading target, not a bar whose
        // thickness should grow with the chart footprint. Scaling this 28px
        // target by a house's base canvas turned McKinsey's 440px chart into
        // 41px tiles, even though the measured design uses roughly 26px cells.
        // Cardinality may still shrink cells through capX/capY below.
        const generous = CELL_BAND_SIZE;
        // The square is the narrower of the two steps — that one already fits —
        // grown to the generous size if there is room for it on both axes.
        const wanted = Math.max(generous, Math.min(xStepSize, yStepSize));
        const square = Math.min(capX, capY, wanted);
        const widest = Math.max(xStepSize, yStepSize);
        if (square >= minStepVal && square * SQUARE_CELL_TOLERANCE >= widest) {
            xStepSize = square;
            yStepSize = square;
        }
    }

    // --- Nominal discrete subplot sizing ---
    // For nominal discrete axes, one backend (VL) overrides subplotWidth
    // with step-based sizing (width:{step:N}), so the subplot dimension
    // doesn't matter.  Other backends (Chart.js, ECharts) fill the canvas
    // and divide evenly among categories — for them, the subplot dimension
    // IS the canvas width.
    //
    // Ensure the subplot is at least as wide as canvasSize (the user's
    // requested chart size) so backends that fill the canvas get generous
    // bars when there are few categories.  The subplot only exceeds
    // canvasSize when faceting shrinks it, which is already handled above.

    // Clamp continuous subplot dimensions.
    subplotWidth = Math.min(subplotWidth, Math.round(maxSubplotW));
    subplotHeight = Math.min(subplotHeight, Math.round(maxSubplotH));

    // --- Band AR blending ---
    // When one axis is banded (discrete) and the other is continuous,
    // each band has a natural AR = continuousSize / stepSize.  If the
    // actual band AR exceeds the target, blend the subplot AR toward
    // the target (in log space) to avoid excessively tall/wide bands.
    const targetBandAR = options.targetBandAR;
    if (targetBandAR && targetBandAR > 0) {
        const xIsBanded = xTotalNominalCount > 0 || xContinuousAsDiscrete > 0;
        const yIsBanded = yTotalNominalCount > 0 || yContinuousAsDiscrete > 0;

        if (xIsBanded && !yIsBanded) {
            // X is banded, Y is continuous → band AR = subplotHeight / xStepSize
            const actualBandAR = subplotHeight / xStepSize;
            if (actualBandAR > targetBandAR) {
                const idealH = xStepSize * targetBandAR;
                // Blend: 50/50 between actual and target in log space.
                const blendedH = Math.exp(
                    0.5 * Math.log(subplotHeight) + 0.5 * Math.log(idealH));
                subplotHeight = Math.round(
                    Math.max(minContinuousSizeY, Math.min(blendedH, subplotHeight)));
            }
        } else if (yIsBanded && !xIsBanded) {
            // Y is banded, X is continuous → band AR = subplotWidth / yStepSize
            const actualBandAR = subplotWidth / yStepSize;
            if (actualBandAR > targetBandAR) {
                const idealW = yStepSize * targetBandAR;
                const blendedW = Math.exp(
                    0.5 * Math.log(subplotWidth) + 0.5 * Math.log(idealW));
                subplotWidth = Math.round(
                    Math.max(minContinuousSizeX, Math.min(blendedW, subplotWidth)));
            }
        }
    }

    // --- Label sizing ---
    // A temporal/numeric field used as a BANDED axis (one bar per value) is
    // "continuous-as-discrete": its tick labels sit one-per-band exactly like a
    // nominal axis, so they must follow the same discrete sizing ladder (shrink
    // — and rotate when bands are narrow) rather than staying at the full
    // continuous base font. Otherwise dense date/number bands render oversized
    // labels that feel too large for their band and crowd together.
    const xHasDiscreteItems = xTotalNominalCount > 0 || xContinuousAsDiscrete > 0;
    const yHasDiscreteItems = yTotalNominalCount > 0 || yContinuousAsDiscrete > 0;
    // Canvas-adaptive fonts: descend the tick ladder from the backend's native
    // base, and derive header/legend sizes. Scaled by the (sub)plot's smaller
    // dimension so small multiples shrink and large single views grow subtly.
    const fontSizing = computeFontSizing(Math.min(subplotWidth, subplotHeight), {
        baseLabelFontSize: options.baseLabelFontSize,
        baseTitleFontSize: options.baseTitleFontSize,
    });
    const labelOpts = { baseFont: fontSizing.tickBase, minFont: 6 };
    let xLabel = computeLabelSizing(xStepSize, xHasDiscreteItems, labelOpts);
    let yLabel = computeLabelSizing(yStepSize, yHasDiscreteItems, labelOpts);

    if (xHasDiscreteItems) {
        const xf = channelSemantics.x?.field;
        const xt = effectiveTypes.x || channelSemantics.x?.type;
        const stats = computeDiscreteLabelStats(xf, table);
        if (stats) {
            // Numeric-like labels (declared quantitative, or all values parse as
            // numbers — years, bins, IDs) compete for the band's width when laid
            // out horizontally. A continuous field split into many narrow bands
            // yields many/wide numbers that crowd. Decide horizontal vs. angled
            // by whether the widest label fits within one band.
            const numericLike = xt === 'quantitative' || stats.allNumeric;
            let labelPx = stats.maxLen * xLabel.fontSize * APPROX_CHAR_WIDTH_RATIO;
            const fewShortStrings = !numericLike
                && stats.count <= VL_SHORT_DISCRETE_CATEGORY_COUNT
                && stats.maxLen <= VL_SHORT_DISCRETE_LABEL_MAX_LEN;

            if (fewShortStrings || (numericLike && labelPx <= xStepSize)) {
                // We want horizontal labels here. But a small number of short
                // string categories can still collide when the band step is
                // narrower than the widest label (e.g. box marks declare a tiny
                // defaultBandSize). Before committing to horizontal, make sure
                // the label actually fits — widen the band within the stretch
                // budget if it can, otherwise angle the labels instead of
                // letting them overlap. (xStepSize is the per-label band width:
                // the item step when ungrouped, the group step when grouped.)
                if (labelPx > xStepSize) {
                    const desiredStep = Math.ceil(labelPx) + 6; // label width + inter-label gap
                    const cap = Math.max(minStepVal, Math.floor(maxSubplotW / stats.count));
                    if (desiredStep <= cap) {
                        xStepSize = Math.max(xStepSize, desiredStep);
                        xLabel = computeLabelSizing(xStepSize, xHasDiscreteItems, labelOpts);
                        labelPx = stats.maxLen * xLabel.fontSize * APPROX_CHAR_WIDTH_RATIO;
                    }
                }

                if (labelPx <= xStepSize) {
                    // Fits horizontally (already, or after widening the band).
                    // Must be explicit: omitting labelAngle leaves VL defaults (e.g. -45° on ordinal).
                    xLabel = {
                        ...xLabel,
                        labelAngle: 0,
                        labelAlign: 'center',
                        labelBaseline: 'top',
                    };
                } else {
                    // Even the stretch budget can't fit a wide-enough band →
                    // angle the labels rather than let them run together.
                    xLabel = {
                        ...xLabel,
                        labelAngle: -45,
                        labelAlign: 'right',
                        labelBaseline: 'top',
                    };
                }
            } else if (numericLike && labelPx > xStepSize && xLabel.labelAngle === undefined) {
                // Numeric labels that don't fit horizontally and weren't already
                // rotated by step-based sizing (which only rotates at narrow
                // steps). Without this, VL keeps them horizontal and the numbers
                // overlap. Rotate to -45°.
                xLabel = {
                    ...xLabel,
                    labelAngle: -45,
                    labelAlign: 'right',
                    labelBaseline: 'top',
                };
            }
        }
    }
    if (yHasDiscreteItems) {
        const yf = channelSemantics.y?.field;
        const yt = effectiveTypes.y || channelSemantics.y?.type;
        if (discreteYAxisShouldUseHorizontalLabels(yf, yt, table)) {
            yLabel = {
                ...yLabel,
                labelAngle: 0,
                labelAlign: 'right',
                labelBaseline: 'middle',
            };
        }
    }

    // Keep tick labels consistent across axes. A continuous value axis stays at
    // the base font, but a banded axis shrinks its labels as bands tighten — so
    // the value "numbers" can end up visibly larger than the category "text".
    // Unify both tick fonts to the smaller of the two so they read as one size.
    const unifiedTickFont = Math.min(xLabel.fontSize, yLabel.fontSize);
    if (xLabel.fontSize !== unifiedTickFont) xLabel = { ...xLabel, fontSize: unifiedTickFont };
    if (yLabel.fontSize !== unifiedTickFont) yLabel = { ...yLabel, fontSize: unifiedTickFont };

    return {
        subplotWidth,
        subplotHeight,
        xStep: xStepSize,
        yStep: yStepSize,
        xStepUnit,
        yStepUnit,
        xContinuousAsDiscrete,
        yContinuousAsDiscrete,
        xNominalCount: xTotalNominalCount,
        yNominalCount: yTotalNominalCount,
        xLabel,
        yLabel,
        titleFontSize: fontSizing.titleFontSize,
        legendFontSize: fontSizing.legendFontSize,
        stepPadding: stepPaddingVal,
        facet: (facetCols > 1 || facetRows > 1) ? {
            columns: facetCols,
            rows: facetRows,
            subplotWidth,
            subplotHeight,
        } : undefined,
        effectiveFacetGap: gap,
        truncations: [],  // Overflow truncations are handled by filterOverflow
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count distinct series (color/detail categories) from channel semantics.
 */
function countDistinctSeries(
    channelSemantics: Record<string, ChannelSemantics>,
    data: any[],
): number {
    const seriesFields: string[] = [];
    const colorField = channelSemantics.color?.field;
    const detailField = channelSemantics.detail?.field;
    if (colorField) seriesFields.push(colorField);
    if (detailField && detailField !== colorField) seriesFields.push(detailField);

    if (seriesFields.length === 0) return 1;

    const seriesKeys = new Set<string>();
    for (const row of data) {
        const key = seriesFields.map(f => String(row[f] ?? '')).join('\x00');
        seriesKeys.add(key);
    }
    return seriesKeys.size;
}

/**
 * Compute the ideal aspect ratio for a both-continuous chart.
 *
 * Dispatches to two strategies depending on mark type:
 *
 * - **Scatter / point** (`isConnected = false`): Uses the normalized
 *   standard-deviation ratio of the point cloud — a unit-independent
 *   shape measure.  Dampened 0.3× toward 1.0 so scatter stays near
 *   square.
 *
 * - **Connected marks** (line/area/bump, `isConnected = true`): Uses
 *   multi-scale banking to 45° (Heer & Agrawala 2006).  Slopes are
 *   computed at multiple octave-band smoothing levels and combined via
 *   geometric mean so that trend, periodicity, and noise each
 *   contribute proportionally — avoiding the dense-data failure mode
 *   of Cleveland's single-scale median.
 *
 * @param xValues     Numeric X values
 * @param yValues     Numeric Y values (parallel array)
 * @param xDomain     [min, max] of the visual X axis
 * @param yDomain     [min, max] of the visual Y axis
 * @param seriesKeys  Per-point series key ('' if no series)
 * @param isConnected Whether the mark connects points (line/area vs scatter)
 * @returns Ideal AR (width/height). Clamped to [0.5, 3.0].
 */
function computeBankingAR(
    xValues: number[],
    yValues: number[],
    xDomain: [number, number],
    yDomain: [number, number],
    seriesKeys: string[],
    isConnected: boolean,
): number {
    const MIN_AR = 0.5;
    const MAX_AR = 3.0;

    const xRange = xDomain[1] - xDomain[0];
    const yRange = yDomain[1] - yDomain[0];
    if (xRange <= 0 || yRange <= 0) return 1;

    // ── Scatter: σ-ratio ──────────────────────────────────────────────
    if (!isConnected) {
        const n = xValues.length;
        let sumX = 0, sumY = 0;
        for (let i = 0; i < n; i++) {
            sumX += (xValues[i] - xDomain[0]) / xRange;
            sumY += (yValues[i] - yDomain[0]) / yRange;
        }
        const meanX = sumX / n;
        const meanY = sumY / n;
        let varX = 0, varY = 0;
        for (let i = 0; i < n; i++) {
            const dx = (xValues[i] - xDomain[0]) / xRange - meanX;
            const dy = (yValues[i] - yDomain[0]) / yRange - meanY;
            varX += dx * dx;
            varY += dy * dy;
        }
        const sdX = Math.sqrt(varX / n);
        const sdY = Math.sqrt(varY / n);
        if (sdY <= 0) return MAX_AR;
        if (sdX <= 0) return MIN_AR;

        const sdRatio = sdX / sdY;
        const ar = sdRatio > 1
            ? 1 + (sdRatio - 1) * 0.3
            : 1 - (1 - sdRatio) * 0.3;
        return Math.min(MAX_AR, Math.max(MIN_AR, ar));
    }

    // ── Connected marks: multi-scale banking (Heer & Agrawala 2006) ──

    // Group by series and sort by X.
    const seriesMap = new Map<string, { x: number; y: number }[]>();
    for (let i = 0; i < xValues.length; i++) {
        const key = seriesKeys[i];
        let arr = seriesMap.get(key);
        if (!arr) { arr = []; seriesMap.set(key, arr); }
        arr.push({ x: xValues[i], y: yValues[i] });
    }
    for (const pts of seriesMap.values()) {
        pts.sort((a, b) => a.x - b.x);
    }

    // Collect per-scale median absolute slopes, then combine with
    // geometric mean across scales.  Each scale is a box-filter
    // smoothing at window width 2^k (k = 0, 1, 2, …).
    // Scale 0 = raw data (Cleveland's original).
    const scaleMedians: number[] = [];

    // Determine max scale: largest power of 2 that still leaves ≥ 3
    // points in the longest series after smoothing.
    let maxSeriesLen = 0;
    for (const pts of seriesMap.values()) {
        if (pts.length > maxSeriesLen) maxSeriesLen = pts.length;
    }
    const maxScale = Math.max(0, Math.floor(Math.log2(maxSeriesLen)) - 1);

    for (let scale = 0; scale <= maxScale; scale++) {
        const windowSize = 1 << scale;  // 1, 2, 4, 8, …
        const absSlopes: number[] = [];

        for (const pts of seriesMap.values()) {
            // Smooth: non-overlapping bucket averages of `windowSize` points.
            // The last bucket may be smaller — included as-is.
            const n = pts.length;
            if (n < 2) continue;

            const smoothed: { x: number; y: number }[] = [];
            for (let i = 0; i < n; i += windowSize) {
                const end = Math.min(i + windowSize, n);
                let sx = 0, sy = 0;
                for (let j = i; j < end; j++) {
                    sx += pts[j].x;
                    sy += pts[j].y;
                }
                const cnt = end - i;
                smoothed.push({ x: sx / cnt, y: sy / cnt });
            }

            // Compute slopes between consecutive smoothed points.
            for (let i = 1; i < smoothed.length; i++) {
                const dx = (smoothed[i].x - smoothed[i - 1].x) / xRange;
                const dy = (smoothed[i].y - smoothed[i - 1].y) / yRange;
                if (dx === 0) continue;
                absSlopes.push(Math.abs(dy / dx));
            }
        }

        if (absSlopes.length === 0) continue;

        // Median absolute slope at this scale.
        absSlopes.sort((a, b) => a - b);
        const mid = absSlopes.length >> 1;
        const median = absSlopes.length % 2 === 1
            ? absSlopes[mid]
            : (absSlopes[mid - 1] + absSlopes[mid]) / 2;
        if (median > 0) {
            scaleMedians.push(median);
        }
    }

    if (scaleMedians.length === 0) return 1;

    // Geometric mean of per-scale median slopes.
    // This gives equal weight to each octave band: trend (coarse),
    // periodicity (middle), and noise (fine) all contribute.
    let logSum = 0;
    for (const m of scaleMedians) {
        logSum += Math.log(m);
    }
    const combinedSlope = Math.exp(logSum / scaleMedians.length);

    if (combinedSlope <= 0) return MAX_AR;

    // Banking to 45°: display_slope = s_norm × (H/W).
    // For median |display_slope| = 1:  H/W = 1/median(|s_norm|),
    // so W/H = median(|s_norm|) = combinedSlope.
    //
    // No dampening here — the caller (computeLayout) blends banking AR
    // with gas-pressure AR at 50/50, which already moderates it.
    // Applying dampening on top of the blend would double-moderate.

    // Landscape floor for connected marks: time series, line charts,
    // and area charts are conventionally landscape.  Banking can push
    // wider (when slopes are steep) but never portrait — the gentle-
    // slope majority in typical time series would otherwise dominate
    // the median and produce portrait, compressing the time axis.
    const ar = Math.max(1.0, combinedSlope);
    return Math.min(MAX_AR, Math.max(MIN_AR, ar));
}

// ---------------------------------------------------------------------------
// Public: computeChannelBudgets
// ---------------------------------------------------------------------------

/**
 * Compute per-channel maximum values that can fit on the canvas.
 *
 * Uses the **most conservative** assumptions:
 *   - minStep  (smallest px per discrete item)
 *   - minSubplotSize (smallest subplot for continuous axes)
 *   - maxStretch (maximum canvas stretching)
 *
 * This is Step 0c-a in the pipeline — it runs before filterOverflow
 * and produces the budgets that filterOverflow consumes.
 *
 * Pipeline:  computeChannelBudgets → filterOverflow → computeLayout
 *
 * @param channelSemantics  Phase 0 output (field, type per channel)
 * @param declaration       Template layout declaration
 * @param data              Full data table (pre-overflow)
 * @param canvasSize        Target canvas dimensions
 * @param options           Assembly options
 * @returns                 ChannelBudgets with per-channel max-to-keep
 */
export function computeChannelBudgets(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    data: any[],
    canvasSize: { width: number; height: number },
    options: AssembleOptions,
): ChannelBudgets {
    const {
        minStep: minStepVal = DEFAULT_MIN_STEP,
        stepPadding: stepPaddingVal = 0.1,
        maxColorValues: maxColorVal = 24,
    } = options;

    const { x: maxStretchX, y: maxStretchY } = resolveStretchCaps(options);

    const fixW = options.facetFixedPadding?.width ?? 0;
    const fixH = options.facetFixedPadding?.height ?? 0;
    const gap = options.facetGap ?? 0;

    const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';
    const effectiveType = (ch: string): string | undefined =>
        declaration.resolvedTypes?.[ch] ?? channelSemantics[ch]?.type;

    // --- 1. Facet grid (delegates to computeFacetGrid) ---
    const facetGrid = computeFacetGrid(
        channelSemantics, declaration, data, canvasSize, options,
    );
    const facetCols = facetGrid?.columns ?? 1;
    const facetRows = facetGrid?.rows ?? 1;

    // --- 2. Per-subplot budget at maximum stretch ---
    const maxSubplotW = Math.max(
        options.minSubplotSize ?? 60,
        (canvasSize.width * maxStretchX - fixW) / facetCols - gap,
    );
    const maxSubplotH = Math.max(
        options.minSubplotSize ?? 60,
        (canvasSize.height * maxStretchY - fixH) / facetRows - gap,
    );

    // --- 3. Grouping detection ---
    const groupField = channelSemantics.group?.field;
    let groupCount = 0;
    let groupAxis: 'x' | 'y' | undefined;
    if (groupField) {
        groupCount = new Set(data.map(r => r[groupField])).size;
        if (isDiscreteType(effectiveType('x'))) groupAxis = 'x';
        else if (isDiscreteType(effectiveType('y'))) groupAxis = 'y';
    }

    const xGroupMultiplier = (groupAxis === 'x' && groupCount > 1) ? groupCount : 1;
    const yGroupMultiplier = (groupAxis === 'y' && groupCount > 1) ? groupCount : 1;

    const MIN_GROUP_GAP_PX = 3;
    const xMinGroupStep = xGroupMultiplier > 1
        ? Math.max(Math.ceil(MIN_GROUP_GAP_PX / stepPaddingVal), 2 * xGroupMultiplier)
        : minStepVal;
    const yMinGroupStep = yGroupMultiplier > 1
        ? Math.max(Math.ceil(MIN_GROUP_GAP_PX / stepPaddingVal), 2 * yGroupMultiplier)
        : minStepVal;

    // --- 4. Per-channel budgets ---
    let maxXToKeep = Math.floor(maxSubplotW / xMinGroupStep);
    let maxYToKeep = Math.floor(maxSubplotH / yMinGroupStep);

    // --- 5. Faceted-chart canvas cap ---
    // When a busy discrete axis makes each subplot wider than the
    // un-stretched canvas, cap axis items to fit within one canvas
    // width/height.  This lets subplots be narrower, potentially fitting
    // more facet columns — reducing overall chart height.
    //
    // Example: 70 counties on X × 20 states on column.  Without the cap,
    // minSubplotWidth = 70 × 6 = 420 → only 1 facet column fits → each
    // state stacks vertically → excessively tall chart.  With the cap,
    // X is truncated to floor(400/6) = 66 items, and the facet grid is
    // re-derived with narrower subplots so more columns fit.
    if (facetGrid) {
        const canvasXCap = Math.max(1, Math.floor(canvasSize.width / xMinGroupStep));
        const canvasYCap = Math.max(1, Math.floor(canvasSize.height / yMinGroupStep));

        if (maxXToKeep > canvasXCap || maxYToKeep > canvasYCap) {
            maxXToKeep = Math.min(maxXToKeep, canvasXCap);
            maxYToKeep = Math.min(maxYToKeep, canvasYCap);

            // With tighter axis items, subplots can be narrower, so more
            // facet columns may fit.  Re-derive the grid for column-only
            // wrapping (the most affected case).
            const colField = channelSemantics.column?.field;
            const rowField = channelSemantics.row?.field;
            const colCount = colField
                ? new Set(data.map(r => r[colField])).size : 0;

            if (colCount > 1 && !rowField) {
                const tighterW = Math.max(
                    options.minSubplotSize ?? 60,
                    maxXToKeep * xMinGroupStep,
                );
                const totalW = canvasSize.width * maxStretchX - fixW;
                const totalH = canvasSize.height * maxStretchY - fixH;
                const revisedMaxCols = Math.max(1, Math.floor(
                    totalW / (tighterW + gap),
                ));
                const revisedMaxRows = Math.max(1, Math.floor(
                    totalH / ((options.minSubplotSize ?? 60) + gap),
                ));
                const maxTotal = revisedMaxCols * revisedMaxRows;
                const effectiveCount = Math.min(colCount, maxTotal);
                const visRows = Math.ceil(effectiveCount / revisedMaxCols);
                const visCols = Math.ceil(effectiveCount / visRows);

                facetGrid.columns = visCols;
                facetGrid.rows = visRows;
                facetGrid.maxColumnValues = maxTotal;
            }
        }
    }

    // maxColumnValues already carries the correct semantics for both
    // column+row (per-dimension cap) and column-only wrapping (total
    // panel count = grid cols × grid rows).  No multiplication needed.
    const maxValues: Record<string, number> = {
        x: maxXToKeep,
        y: maxYToKeep,
        column: facetGrid?.maxColumnValues ?? Infinity,
        row: facetGrid?.maxRowValues ?? Infinity,
        color: maxColorVal,
    };

    return { maxValues, facetGrid };
}

// ---------------------------------------------------------------------------
// Public: computeFacetGrid
// ---------------------------------------------------------------------------

/**
 * Decide the facet grid layout (including column-only wrapping).
 *
 * This runs BEFORE filterOverflow and computeLayout.  It:
 *   1. Counts unique column/row values from data.
 *   2. Computes banded-aware minimum subplot dimensions.
 *   3. Computes max columns/rows that fit in the canvas budget.
 *   4. For column-only: wraps into a 2D grid (total panels = cols × rows).
 *   5. For column+row: caps each dimension independently.
 *
 * Returns `undefined` when there are no facet channels.
 *
 * @param channelSemantics  Phase 0 output
 * @param declaration       Template layout declaration
 * @param data              Data rows (pre-overflow — possibly after temporal conversion)
 * @param canvasSize        Target canvas dimensions
 * @param options           Assembly options
 */
export function computeFacetGrid(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    data: any[],
    canvasSize: { width: number; height: number },
    options: AssembleOptions,
): import('./types').FacetGridResult | undefined {
    const { x: msX, y: msY } = resolveStretchCaps(options);
    const fixW = options.facetFixedPadding?.width ?? 0;
    const fixH = options.facetFixedPadding?.height ?? 0;
    const gap = options.facetGap ?? 0;
    const minStep = options.minStep ?? DEFAULT_MIN_STEP;
    const stepPadding = options.stepPadding ?? 0.1;
    const baseMinSubplot = options.minSubplotSize ?? 60;

    const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

    // --- Compute min subplot size per axis ---
    //
    // Continuous:  baseMinSubplot (e.g. 60px).
    //
    // Discrete (not grouped):
    //   min(minStep × valueCount, maxDim)
    //
    // Discrete (grouped):
    //   perCategoryStep = max(minStep × groupCount, minGroupStep)
    //   min(perCategoryStep × valueCount, maxDim)
    //
    //   where minGroupStep accounts for the inter-group gap:
    //     the gap = stepPadding × step, which must be ≥ MIN_GROUP_GAP_PX.
    //
    // Always capped at maxDim (full stretched canvas minus fixed overhead)
    // to guarantee at least 1 facet column/row.

    const maxW = canvasSize.width * msX - fixW;
    const maxH = canvasSize.height * msY - fixH;
    const MIN_GROUP_GAP_PX = 3;

    // Grouping detection
    const groupField = channelSemantics.group?.field;
    let groupCount = 0;
    let groupAxis: 'x' | 'y' | undefined;
    if (groupField) {
        groupCount = new Set(data.map((r: any) => r[groupField])).size;
        const xType = declaration.resolvedTypes?.x ?? channelSemantics.x?.type;
        const yType = declaration.resolvedTypes?.y ?? channelSemantics.y?.type;
        if (isDiscreteType(xType)) groupAxis = 'x';
        else if (isDiscreteType(yType)) groupAxis = 'y';
    }

    let minSubplotWidth = baseMinSubplot;
    let minSubplotHeight = baseMinSubplot;

    // Log-scale axes need more space for minor grid lines to be legible.
    const LOG_PX_PER_DECADE_FACET = 40;
    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field || !cs.scaleType) continue;
        if (cs.scaleType !== 'log' && cs.scaleType !== 'symlog') continue;
        const vals = data
            .map((r: any) => r[cs.field])
            .filter((v: any) => typeof v === 'number' && v > 0 && isFinite(v));
        if (vals.length < 2) continue;
        const decades = Math.log10(Math.max(...vals)) - Math.log10(Math.min(...vals));
        const needed = Math.ceil(Math.max(1, decades)) * LOG_PX_PER_DECADE_FACET;
        if (axis === 'x') minSubplotWidth = Math.max(minSubplotWidth, needed);
        else minSubplotHeight = Math.max(minSubplotHeight, needed);
    }

    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field) continue;

        const effectiveType = declaration.resolvedTypes?.[axis] ?? cs.type;
        const isBanded = declaration.axisFlags?.[axis]?.banded === true;
        if (!isDiscreteType(effectiveType) && !isBanded) continue;

        const valueCount = new Set(data.map((r: any) => r[cs.field])).size;
        const axisGroupCount = (groupAxis === axis && groupCount > 1) ? groupCount : 1;
        const maxDim = axis === 'x' ? maxW : maxH;

        let perCategoryStep: number;
        if (axisGroupCount > 1) {
            // Grouped: each category needs room for groupCount sub-items
            // PLUS enough inter-group gap (stepPadding × step ≥ MIN_GROUP_GAP_PX).
            const minGroupStep = Math.max(
                Math.ceil(MIN_GROUP_GAP_PX / stepPadding),
                2 * axisGroupCount,
            );
            perCategoryStep = Math.max(minStep * axisGroupCount, minGroupStep);
        } else {
            // Ungrouped: one item per category
            perCategoryStep = minStep;
        }

        const dataDrivenMin = Math.min(perCategoryStep * valueCount, maxDim);
        const minDim = Math.max(baseMinSubplot, dataDrivenMin);

        if (axis === 'x') {
            minSubplotWidth = minDim;
        } else {
            minSubplotHeight = minDim;
        }
    }

    // --- Continuous axes: AR-based min subplot size ---
    // When both axes are continuous (non-banded), the expected aspect
    // ratio tells us which axis needs more room.  The shorter dimension
    // stays at baseMinSubplot; the longer gets up to ms× (maxStretch)
    // of the base.  This ensures line charts (landscape AR) get wider
    // min subplots, so maxFacetColumns is lower → fewer, wider panels.
    const xIsCont = (() => {
        const cs = channelSemantics.x;
        if (!cs?.field) return false;
        const t = declaration.resolvedTypes?.x ?? cs.type;
        return !isDiscreteType(t) && !(declaration.axisFlags?.x?.banded === true);
    })();
    const yIsCont = (() => {
        const cs = channelSemantics.y;
        if (!cs?.field) return false;
        const t = declaration.resolvedTypes?.y ?? cs.type;
        return !isDiscreteType(t) && !(declaration.axisFlags?.y?.banded === true);
    })();

    if (xIsCont && yIsCont) {
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        if (xCS?.field && yCS?.field) {
            const isTempX = (declaration.resolvedTypes?.x ?? xCS.type) === 'temporal';
            const isTempY = (declaration.resolvedTypes?.y ?? yCS.type) === 'temporal';
            const cmcs = options.continuousMarkCrossSection;
            const isConn = typeof cmcs === 'object' && !!cmcs.seriesCountAxis;

            const xNum: number[] = [];
            const yNum: number[] = [];
            const sKeys: string[] = [];
            const sFields: string[] = [];
            // Include facet fields in series keys so banking computes
            // slopes within each panel, not across panel boundaries.
            const colF = channelSemantics.column?.field;
            const rowF = channelSemantics.row?.field;
            if (colF) sFields.push(colF);
            if (rowF) sFields.push(rowF);
            const cf = channelSemantics.color?.field;
            const df = channelSemantics.detail?.field;
            if (cf) sFields.push(cf);
            if (df && df !== cf) sFields.push(df);

            for (const row of data) {
                const xv = row[xCS.field];
                const yv = row[yCS.field];
                if (xv == null || yv == null) continue;
                const xn = isTempX ? +new Date(xv) : +xv;
                const yn = isTempY ? +new Date(yv) : +yv;
                if (isNaN(xn) || isNaN(yn)) continue;
                xNum.push(xn);
                yNum.push(yn);
                sKeys.push(sFields.length > 0
                    ? sFields.map(f => String(row[f] ?? '')).join('\x00')
                    : '');
            }

            if (xNum.length > 1) {
                const xMin = Math.min(...xNum);
                const xMax = Math.max(...xNum);
                const yMin = Math.min(...yNum);
                const yMax = Math.max(...yNum);
                const xDom: [number, number] = [xMin, xMax];
                const yDom: [number, number] = [yMin, yMax];
                if (xCS.zero?.zero) {
                    if (xDom[0] > 0) xDom[0] = 0;
                    if (xDom[1] < 0) xDom[1] = 0;
                }
                if (yCS.zero?.zero) {
                    if (yDom[0] > 0) yDom[0] = 0;
                    if (yDom[1] < 0) yDom[1] = 0;
                }

                const ar = computeBankingAR(xNum, yNum, xDom, yDom, sKeys, isConn);

                // Distribute: shorter side = base, longer side = base × min(ar, ms).
                if (ar >= 1) {
                    minSubplotWidth = Math.max(minSubplotWidth,
                        Math.round(baseMinSubplot * Math.min(ar, msX)));
                    minSubplotHeight = Math.max(minSubplotHeight, baseMinSubplot);
                } else {
                    minSubplotWidth = Math.max(minSubplotWidth, baseMinSubplot);
                    minSubplotHeight = Math.max(minSubplotHeight,
                        Math.round(baseMinSubplot * Math.min(1 / ar, msY)));
                }
            }
        }
    }

    // effectiveW = totalBudget - fixedOverhead; each panel costs (subplot + gap).
    const effectiveW = maxW;
    const effectiveH = maxH;
    const maxFacetColumns = Math.max(1, Math.floor(
        effectiveW / (minSubplotWidth + gap),
    ));
    const maxFacetRows = Math.max(1, Math.floor(
        effectiveH / (minSubplotHeight + gap),
    ));

    // Identify column/row fields
    const colField = channelSemantics.column?.field;
    const rowField = channelSemantics.row?.field;
    if (!colField && !rowField) return undefined;

    const colCount = colField
        ? new Set(data.map((r: any) => r[colField])).size : 0;
    const rowCount = rowField
        ? new Set(data.map((r: any) => r[rowField])).size : 0;

    if (colCount === 0 && rowCount === 0) return undefined;

    // Explicit user override: force a specific column count for a column-wrapped
    // facet (the `facetColumns` chart property). Clamped to [1, colCount]; the
    // remaining panels wrap into as many rows as needed (all kept, canvas grows).
    const forcedCols = options.facetColumns != null && options.facetColumns >= 1
        ? Math.min(Math.max(1, Math.floor(options.facetColumns)), Math.max(1, colCount))
        : undefined;

    if (colCount > 0 && rowCount === 0) {
        if (forcedCols != null) {
            const nRows = Math.ceil(colCount / forcedCols);
            return {
                columns: forcedCols,
                rows: nRows,
                maxColumnValues: forcedCols * nRows,
                maxRowValues: Math.max(maxFacetRows, nRows),
            };
        }
        // Column-only.  If all panels fit in one row, use a single row.
        // Otherwise wrap into a balanced grid: pick the number of rows
        // that makes the grid as square as possible (cols ≈ rows) while
        // staying within the max budget per dimension.
        if (colCount <= maxFacetColumns) {
            return {
                columns: colCount,
                rows: 1,
                maxColumnValues: colCount,
                maxRowValues: maxFacetRows,
            };
        }

        // Need to wrap.  Use maxFacetColumns as the column count
        // (fill the width), but reduce columns slightly if it would
        // produce a widow row (a single orphan panel on the last row).
        let nCols = maxFacetColumns;
        let nRows = Math.ceil(colCount / nCols);

        // Check for widow: if last row has only 1 panel, try nCols-1
        // to redistribute more evenly.  Keep reducing while widow
        // exists and nCols > 2.
        while (nCols > 2 && (colCount % nCols) === 1) {
            nCols--;
            nRows = Math.ceil(colCount / nCols);
        }

        const visRows = Math.min(nRows, maxFacetRows);
        const maxTotal = nCols * visRows;

        return {
            columns: nCols,
            rows: visRows,
            maxColumnValues: maxTotal,
            maxRowValues: maxFacetRows,
        };
    }

    // Column+row or row-only: cap each dimension independently.
    return {
        columns: Math.max(1, Math.min(colCount, maxFacetColumns)),
        rows: Math.max(1, Math.min(rowCount, maxFacetRows)),
        maxColumnValues: maxFacetColumns,
        maxRowValues: maxFacetRows,
    };
}

// ---------------------------------------------------------------------------
// Public: computeMinSubplotDimensions
// ---------------------------------------------------------------------------

/**
 * Compute minimum subplot dimensions considering banded and discrete axes.
 *
 * For banded axes (e.g. temporal x on candlestick), each data point needs
 * `minStep` px, so the subplot minimum can be much larger than the generic
 * `minSubplotSize` (60px).  For discrete axes, the count of unique values
 * drives the minimum similarly.
 *
 * This is used by both filterOverflow (pre-layout) and the assemblers
 * (post-layout) to consistently compute facet column/row caps.
 *
 * @param channelSemantics  Phase 0 output (field, type per channel)
 * @param declaration       Template layout declaration (axisFlags, resolvedTypes)
 * @param data              Data rows
 * @param options           Assembly options ({ minStep, minSubplotSize })
 * @returns                 { minSubplotWidth, minSubplotHeight }
 */
export function computeMinSubplotDimensions(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    data: any[],
    options: { minStep?: number; minSubplotSize?: number },
): { minSubplotWidth: number; minSubplotHeight: number } {
    const minStep = options.minStep ?? DEFAULT_MIN_STEP;
    const minSubplot = options.minSubplotSize ?? 60;

    let minSubplotWidth = minSubplot;
    let minSubplotHeight = minSubplot;

    // Log-scale axes need more space so minor grid lines stay legible.
    const LOG_PX_PER_DECADE_MIN = 40;
    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field || !cs.scaleType) continue;
        if (cs.scaleType !== 'log' && cs.scaleType !== 'symlog') continue;
        const vals = data
            .map((r: any) => r[cs.field])
            .filter((v: any) => typeof v === 'number' && v > 0 && isFinite(v));
        if (vals.length < 2) continue;
        const decades = Math.log10(Math.max(...vals)) - Math.log10(Math.min(...vals));
        const needed = Math.ceil(Math.max(1, decades)) * LOG_PX_PER_DECADE_MIN;
        if (axis === 'x') minSubplotWidth = Math.max(minSubplotWidth, needed);
        else minSubplotHeight = Math.max(minSubplotHeight, needed);
    }

    const isDiscreteType = (t: string | undefined) =>
        t === 'nominal' || t === 'ordinal';

    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field) continue;

        const effectiveType = declaration.resolvedTypes?.[axis] ?? cs.type;
        const isBanded = declaration.axisFlags?.[axis]?.banded === true;
        const isDiscrete = isDiscreteType(effectiveType);

        let itemCount = 0;
        if (isBanded || isDiscrete) {
            itemCount = new Set(data.map((r: any) => r[cs.field])).size;
        }

        if (itemCount > 0) {
            const minDim = Math.max(minSubplot, itemCount * minStep);
            if (axis === 'x') {
                minSubplotWidth = Math.max(minSubplotWidth, minDim);
            } else {
                minSubplotHeight = Math.max(minSubplotHeight, minDim);
            }
        }
    }

    return { minSubplotWidth, minSubplotHeight };
}
