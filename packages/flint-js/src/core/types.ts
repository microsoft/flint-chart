// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ZeroDecision, ColorSchemeRecommendation } from './semantic-types';
import type { LabelSizingDecision } from './decisions';
import type { SemanticAnnotation, FormatSpec, DomainConstraint, TickConstraint } from './field-semantics';
import type { ColorDecisionResult } from './color-decisions';
import type { GeometryKind, ThemeGeometry, ThemeSpec } from './theme/types';

/**
 * Core types for the chart engine library.
 * No React or UI framework dependencies — pure TypeScript.
 */

// ---------------------------------------------------------------------------
// Data Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Channel & Encoding
// ---------------------------------------------------------------------------

export const channels = [
    "x", "y", "x2", "y2", "id", "color", "opacity", "size", "shape", "strokeDash", "column",
    "row", "latitude", "longitude", "radius", "detail", "group",
    "open", "high", "low", "close", "angle",
    // Connected Scatter Plot: the sequence field that defines the line's
    // connection order (the trajectory), independent of the x value.
    "order",
    // KPI Card: one row per tile, no chart axes.
    "metric", "value", "goal",
] as const;

export const channelGroups: Record<string, string[]> = {
    "": ["x", "x2", "y", "y2", "latitude", "longitude", "id", "radius", "detail", "order"],
    "legends": ["color", "group", "size", "shape", "text", "opacity", "strokeDash"],
    "price": ["open", "high", "low", "close"],
    "facets": ["column", "row"],
    "kpi": ["metric", "value", "goal"],
};

/**
 * Encoding definition for a single channel, using field names directly.
 * This is the library-level encoding — no fieldID indirection.
 */
export interface ChartEncoding {
    field?: string;
    type?: "quantitative" | "nominal" | "ordinal" | "temporal";
    aggregate?: 'count' | 'sum' | 'average' | 'mean';
    sortOrder?: "ascending" | "descending";
    sortBy?: string;
    scheme?: string;
}

/**
 * An encoding value that allows either a single encoding or an array of
 * encodings (static series). Array form is only valid on measure channels
 * (y, x-as-measure) where all fields resolve to quantitative.
 *
 * When an array is provided, the assembler folds (unpivots) the specified
 * fields into a long-form representation with a synthesized key column
 * (for color/legend) and value column (for the measure axis).
 */
export type EncodingValue = ChartEncoding | ChartEncoding[];

/**
 * Shorthand for a channel encoding: a bare field-name string is treated as
 * `{ field: <string> }`. This lets callers write `{ x: "weight" }` instead of
 * `{ x: { field: "weight" } }` to keep simple specs terse (e.g. for demos).
 *
 * Shorthands are also accepted inside static-series arrays, so
 * `{ y: ["sales", "profit"] }` expands to `[{ field: "sales" }, { field: "profit" }]`.
 */
export type EncodingShorthand = string;

/**
 * Channel value as accepted in raw user input, before shorthand normalization.
 * Normalized to {@link EncodingValue} by `normalizeEncodingShorthand`.
 */
export type RawEncodingValue =
    | ChartEncoding
    | EncodingShorthand
    | (ChartEncoding | EncodingShorthand)[];

/**
 * Metadata produced by static series normalization.
 * Captures the original multi-field intent so backends can emit
 * appropriate legend labels and the pipeline can short-circuit
 * series counting.
 */
export interface StaticSeriesMetadata {
    /** Which channel had the array encoding ('y' or 'x') */
    channel: string;
    /** Original field names from the array entries */
    fields: string[];
    /** Synthetic column name for the series discriminator */
    keyColumn: string;
    /** Synthetic column name for the measure values */
    valueColumn: string;
}

// ============================================================================
// Phase 0: Semantic Resolution Types
// ============================================================================

/**
 * Everything Phase 0 decides for a single channel.
 *
 * Combines the original ChartEncoding (user intent) with resolved
 * decisions derived from semantic type, data values, and channel context.
 * All downstream phases (layout, assembly, instantiation) read this —
 * no nested FieldSemantics reference needed.
 */
export interface ChannelSemantics {
    // --- Identity ---
    /** Field name bound to this channel */
    field: string;
    /** The semantic annotation for this field */
    semanticAnnotation: SemanticAnnotation;

    // --- Encoding type ---
    /**
     * Final encoding type for this channel.
     * Resolved from semantic type + data characteristics + channel rules.
     */
    type: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';

    // --- Formatting ---
    /** Axis/legend number format */
    format?: FormatSpec;
    /** Tooltip format (typically higher precision) */
    tooltipFormat?: FormatSpec;
    /**
     * Temporal format string (temporal fields on any channel).
     * E.g., "%Y", "%b %d", "%H:%M".
     */
    temporalFormat?: string;

    // --- Aggregation ---
    /** Default aggregate function when used as a measure */
    aggregationDefault?: 'sum' | 'average';

    // --- Scale ---
    /**
     * Zero-baseline decision (positional quantitative channels only).
     * Present only on 'x' and 'y' channels with type 'quantitative'.
     */
    zero?: ZeroDecision;
    /** Recommended scale type */
    scaleType?: 'linear' | 'log' | 'sqrt' | 'symlog';
    /** Whether to apply "nice" rounding to domain endpoints */
    nice?: boolean;
    /** Domain bounds constraint */
    domainConstraint?: DomainConstraint;
    /** Tick mark constraints */
    tickConstraint?: TickConstraint;

    // --- Ordering ---
    /**
     * Canonical ordinal sort order for this field's values.
     * E.g., month names, day-of-week, quarters.
     */
    ordinalSortOrder?: string[];
    /** Whether the canonical order is cyclic (wraps around) */
    cyclic?: boolean;
    /** Whether the axis should be reversed (e.g., Rank: 1 at top) */
    reversed?: boolean;
    /** Default sort direction */
    sortDirection?: 'ascending' | 'descending';

    // --- Color ---
    /** Color scheme recommendation (color channel only) */
    colorScheme?: ColorSchemeRecommendation;

    // --- Histogram ---
    /** Whether this field benefits from binning */
    binningSuggested?: boolean;

    // --- Stacking ---
    /** Whether values can be stacked, and how */
    stackable?: 'sum' | 'normalize' | false;
}

/** Phase 0 output: one entry per channel. */
export type SemanticResult = Record<string, ChannelSemantics>;

// ============================================================================
// Phase 1: Layout Types
// ============================================================================

/**
 * How the template's primary mark encodes its quantitative value
 * on the positional (value) axis.
 *
 * Grounded in perceptual accuracy ranking:
 *   1. Position along a common scale — most accurate
 *   2. Length from a shared baseline
 *   3. Area
 *   4. Color saturation / luminance
 *
 * Drives zero-baseline, scale tightness, and compression behavior.
 */
export type MarkCognitiveChannel = 'position' | 'length' | 'area' | 'color';

/**
 * Template's layout intent — returned by declareLayoutMode().
 */
export interface LayoutDeclaration {
    /**
     * Which axes allocate fixed bands per data position.
     * Banded axes use the spring model; non-banded use gas pressure.
     */
    axisFlags?: {
        x?: { banded: boolean };
        y?: { banded: boolean };
    };

    /**
     * Resolved encoding types after any template-driven type conversion.
     * E.g., detectBandedAxis may convert Q→O for a bar chart axis.
     * These override the Phase 0 decisions for layout purposes.
     */
    resolvedTypes?: Record<string, 'nominal' | 'ordinal' | 'quantitative' | 'temporal'>;

    /**
     * Template-specific overrides to layout parameters.
     */
    paramOverrides?: Partial<AssembleOptions>;

    /**
     * Which axes use binned encoding (e.g. histogram).
     * The assembler auto-detects this from template.encoding if not set.
     */
    binnedAxes?: Record<string, boolean | { maxbins?: number }>;

    /**
     * Treat a discrete `color` field as an axis-grouping field for sizing,
     * even though the template uses the `color` channel rather than `group`.
     * When set, computeLayout sizes the discrete axis per-band (xStepUnit
     * 'group') and budgets the band step across categories, so the chart does
     * not balloon and each sub-lane shrinks as the subgroup count grows.
     * Used by charts (e.g. boxplot) that dodge by color via an explicit offset.
     */
    colorActsAsGroup?: boolean;

    /**
     * Override the number of sub-lanes the grouping field reserves per band.
     * When unset, computeLayout uses the global distinct count of the group
     * field. Templates that render `local` (compact) dodge set this to the
     * per-band max cardinality (`maxPerBand`) so the band is budgeted for only
     * as many lanes as the busiest band actually uses.
     */
    groupLaneCount?: number;

    /**
     * Custom overflow strategy for deciding which discrete values to keep
     * when a channel overflows. If not provided, the default strategy is used.
     *
     * @param channel       The overflowing channel ('x', 'y', 'color', etc.)
     * @param fieldName     The field on that channel
     * @param uniqueValues  All unique values in the data for that field
     * @param maxToKeep     Maximum number of values that fit
     * @param context       Abstract context with data and channel info
     * @returns             The values to keep (in display order)
     */
    overflowStrategy?: OverflowStrategy;
}

/**
 * Custom overflow strategy function type.
 * Returns the values to keep when a channel has too many discrete values.
 */
export type OverflowStrategy = (
    channel: string,
    fieldName: string,
    uniqueValues: any[],
    maxToKeep: number,
    context: OverflowStrategyContext,
) => any[];

/** Context passed to overflow strategy functions. */
export interface OverflowStrategyContext {
    /** Full data table */
    data: any[];
    /** Per-channel semantic info */
    channelSemantics: Record<string, ChannelSemantics>;
    /** Original user encodings (for sort info) */
    encodings: Record<string, ChartEncoding>;
    /** Mark types present in the template */
    allMarkTypes: Set<string>;
}

/**
 * Per-channel maximum values that can fit on the canvas.
 *
 * Computed once by `computeChannelBudgets` using the most conservative
 * assumptions (minStep, minSubplotSize, maxStretch).  Passed to
 * `filterOverflow` so it only needs to decide *which* values to keep
 * and filter rows — no layout math.
 *
 * Pipeline:  computeChannelBudgets → filterOverflow → computeLayout
 */
export interface ChannelBudgets {
    /** Maximum discrete values to keep per channel.
     *  Channels not present here are uncapped (`Infinity`). */
    maxValues: Record<string, number>;
    /** Facet grid decision (if facet channels exist) */
    facetGrid?: FacetGridResult;
}

/** A scrollable window over an ordered positional category domain. */
export interface CategoryViewport {
    /** Positional channel controlled by this viewport. */
    channel: 'x' | 'y';
    /** Source field whose values define the category domain. */
    field: string;
    /** Complete display order, before the static fallback window is applied. */
    orderedValues: any[];
    /** Number of categories shown in an interactive window at the minimum valid step. */
    visibleCount: number;
    /** Total number of categories in the ordered domain. */
    totalCount: number;
}

/** Result of overflow filtering. */
export interface OverflowResult {
    /** Data after removing overflow rows */
    filteredData: any[];
    /** Nominal value counts per channel (post-overflow) */
    nominalCounts: Record<string, number>;
    /** Detailed truncation info for overflow styling */
    truncations: TruncationWarning[];
    /** Warning messages for the UI */
    warnings: ChartWarning[];
    /** Positional category windows that an interactive host can navigate. */
    viewports: CategoryViewport[];
}

/**
 * Result of facet grid computation (from computeFacetGrid).
 *
 * Decides the visual grid layout (including column-only wrapping)
 * and the maximum number of unique values to keep per facet channel.
 *
 * Pipeline:  computeFacetGrid → filterOverflow (uses caps) → computeLayout (uses grid)
 */
export interface FacetGridResult {
    /** Visual columns per row (after wrapping for column-only) */
    columns: number;
    /** Visual rows (after wrapping for column-only) */
    rows: number;
    /** Max unique values to keep for the column channel */
    maxColumnValues: number;
    /** Max unique values to keep for the row channel */
    maxRowValues: number;
}

/**
 * Describes one axis that was truncated due to overflow.
 */
export interface TruncationWarning {
    /** Severity level for UI display */
    severity: 'warning';
    /** Machine-readable code */
    code: 'overflow';
    /** Human-readable message */
    message: string;
    /** Which channel overflowed ('x', 'y', 'color', etc.) */
    channel: string;
    /** Field name on the overflowing axis */
    field: string;
    /** Values retained (in display order) */
    keptValues: any[];
    /** Number of items omitted */
    omittedCount: number;
    /** Placeholder string to append to the axis domain */
    placeholder: string;
}

/**
 * Phase 1 output: all layout decisions.
 *
 * LayoutResult is **target-agnostic** — it describes abstract dimensions
 * and step sizes that any rendering backend can consume.  It is the
 * backend's responsibility to translate these values into its own
 * coordinate system:
 *
 *   subplotWidth / subplotHeight
 *     The intended data-area (plot area) size in pixels.  This does NOT
 *     include axis labels, titles, legends, or margins.  Each backend
 *     must add its own margins/padding around this area.
 *
 *   xStep / yStep
 *     Pixel distance per discrete position on each axis.  A backend
 *     rendering bars should derive bar width from step and stepPadding.
 *     VL uses `width: {step: N}` natively; ECharts must compute
 *     explicit barWidth / barCategoryGap.
 *
 *   stepPadding
 *     Fraction of each step reserved for inter-category spacing (0–1).
 *     Usable bar width = step × (1 − stepPadding).
 *
 *   facet (columns / rows / subplot sizes)
 *     When faceting is active, the subplot dimensions are already
 *     divided for the facet grid.  Each backend is responsible for
 *     facet wrapping (e.g. column-only → wrapped rows), panel
 *     positioning, header labels, and shared/per-panel axis titles.
 *
 * Backends should NOT modify LayoutResult.  They read it and translate
 * to their native format (VL encoding props, ECharts grid/axis config, etc.).
 */
export interface LayoutResult {
    /** Final subplot width in px (after stretch) */
    subplotWidth: number;
    /** Final subplot height in px (after stretch) */
    subplotHeight: number;

    /** Computed step size for X axis (px per discrete position) */
    xStep: number;
    /** Computed step size for Y axis (px per discrete position) */
    yStep: number;

    /** Whether the step size is per-item or per-group. */
    xStepUnit?: 'item' | 'group';
    yStepUnit?: 'item' | 'group';

    /** Number of banded continuous items on each axis (0 if not banded-continuous) */
    xContinuousAsDiscrete: number;
    yContinuousAsDiscrete: number;

    /** Number of nominal/ordinal items on each axis */
    xNominalCount: number;
    yNominalCount: number;

    /** Label sizing decisions per axis */
    xLabel: LabelSizingDecision;
    yLabel: LabelSizingDecision;

    /**
     * Canvas-adaptive header font size (px) for axis titles and chart title.
     * Derived from the backend's `baseTitleFontSize`, scaled subtly with the
     * (sub)plot size. Backends should use this instead of hardcoded constants.
     */
    titleFontSize: number;
    /**
     * Canvas-adaptive font size (px) for legend entries. Slightly smaller than
     * {@link titleFontSize}. Backends should use this for legend text.
     */
    legendFontSize: number;

    /** Facet layout (if applicable) */
    facet?: {
        columns: number;
        rows: number;
        subplotWidth: number;
        subplotHeight: number;
    };

    /**
     * Gap between facet panels in px, as set by the backend.
     * Backends use this to configure their own spacing
     * (VL config.facet.spacing, ECharts GAP, etc.).
     */
    effectiveFacetGap: number;

    /**
     * Inter-category padding fraction (0–1) used by the layout engine.
     * Renderers (especially ECharts) should use this to size bars:
     *   barWidth = step × (1 − stepPadding)
     */
    stepPadding: number;

    /** Items truncated due to overflow */
    truncations: TruncationWarning[];
}

// ============================================================================
// Phase 2: Instantiation Types
// ============================================================================

/**
 * Context passed to template instantiate() and to the shared assembler's
 * Phase 2 logic. Combines semantic decisions, layout results, and original
 * inputs.
 */
export interface InstantiateContext {
    /** Per-channel semantic decisions (Phase 0) */
    channelSemantics: Record<string, ChannelSemantics>;

    /** Layout decisions (Phase 1) */
    layout: LayoutResult;

    /** The data table (array of row objects, post-overflow filtering) */
    table: any[];

    /**
     * The full data table (array of row objects, BEFORE overflow filtering).
     *
     * `table` may have categories silently dropped by `filterOverflow` to
     * fit the canvas. Templates that need an honest view of the raw data
     * — e.g. a "top-N + Others" rollup, an annotation that summarizes
     * what wasn't shown, or a sparkline reference — should read from
     * `fullTable` instead.
     *
     * Optional for backwards-compatibility; backends that don't set it
     * fall back to `table`.
     */
    fullTable?: any[];

    /** Resolved VL encoding objects (built by assembler from Phase 0 decisions) */
    resolvedEncodings: Record<string, any>;

    /** Original user-level encodings */
    encodings: Record<string, ChartEncoding>;

    /** User-configured chart properties */
    chartProperties?: Record<string, any>;

    /**
     * The house's geometry for this chart type, already merged from its common
     * profile and any per-chart specialisation, and filtered to the shapes this
     * template declares.
     *
     * Templates read it when the geometry changes what is *built* rather than
     * how it is painted — whether a line carries dots, how wide a bar's band is
     * — because those cannot be restyled onto a finished spec.
     */
    geometry?: ThemeGeometry;

    /** Static series metadata (present when input used array-valued encoding) */
    staticSeries?: StaticSeriesMetadata;

    /**
     * Base (target) chart dimensions — the size layout aims for before
     * pressure-driven stretch. This is the resolved `chart_spec.baseSize`
     * (NOT the hard ceiling). The ceiling is `baseSize × maxStretchX/Y`,
     * available via `assembleOptions.maxStretchX` / `maxStretchY`.
     */
    canvasSize: { width: number; height: number };

    /** Field name → semantic type (string or enriched annotation) */
    semanticTypes: Record<string, string | SemanticAnnotation>;

    /** Chart type name */
    chartType: string;

    /** Assembly options (layout tuning parameters from the caller) */
    assembleOptions?: AssembleOptions;

    /**
     * Backend-agnostic color decisions.
     * Computed once per chart from semantic + layout context and reused
     * by all backends to map into their native color configuration.
     */
    colorDecisions?: ColorDecisionResult;
}



// ---------------------------------------------------------------------------
// Chart Template
// ---------------------------------------------------------------------------

/**
 * The minimal, render-time context an option's applicability check reads.
 *
 * Shared by both option families so they use one predicate convention:
 *   - `ChartPropertyDef.check` (Category A, data-aware properties)
 *   - `EncodingActionDef.isApplicable` (Category B, encoding actions)
 *
 * `encodings` is always present (it's all a host needs to gate an encoding
 * action). The remaining fields are populated by the compiler during assembly
 * and let data-aware *properties* inspect the actual values + resolved
 * semantics; a predicate that only reads `encodings` (e.g. "is color bound?")
 * works with the bare `{ encodings }` a host can build on its own.
 */
export interface OptionEvalContext {
    /** User-level encodings (channel → field binding). Always present. */
    encodings: Record<string, ChartEncoding>;
    /** Per-channel semantic decisions (Phase 0). Present during assembly. */
    channelSemantics?: Record<string, ChannelSemantics>;
    /** Full (pre-overflow) data rows, for data-aware preconditions. */
    data?: any[];
    /** Current user-set chart property overrides. */
    chartProperties?: Record<string, any>;
}

/**
 * Defines a configurable property for a chart template.
 * Describes the value domain; the app decides how to render it.
 */

/** The value-domain variants a property can take (the discriminated arm). */
export type ChartPropertyVariant =
    | { type: 'continuous'; min: number; max: number; step?: number; defaultValue?: number }
    | { type: 'discrete';  options: { value: any; label: string }[]; defaultValue?: any }
    | { type: 'binary';    defaultValue?: boolean };

/**
 * The renderable descriptor of a property: its identity, label, and value
 * domain. This is the part a host needs to draw a control, and it is shared
 * verbatim by both sides of the Flint↔host boundary:
 *
 *   - `ChartPropertyDef`  = `ChartProperty` + the applicability *rule* (`check`)
 *   - `ChartOption`       = `ChartProperty` + the resolved *answer* (`applicable`/`value`)
 *
 * Keeping the descriptor common means the template definition and the resolved
 * option never drift in shape; they differ only by rule-vs-answer.
 */
export type ChartProperty = {
    key: string;
    label: string;
} & ChartPropertyVariant;

export type ChartPropertyDef = ChartProperty & {
    /**
     * The single applicability check for this property, co-located with it so a
     * reader sees *why* an option is offered without digging into the compiler.
     * Pure — reads only `OptionEvalContext` — and returns:
     *   - `applicable`: is this property worth offering for the current spec +
     *     data? It subsumes both structural gates (a channel is bound, e.g.
     *     `!!ctx.encodings.color?.field`) and data-aware ones (a wide-range axis,
     *     an additive single-sign measure, …). A property with no `check`
     *     is always offered.
     *   - `recommendedValue` (optional): the engine's suggested default, used to
     *     seed the control when the host hasn't set an explicit value.
     *
     * Because it requires no live data to answer a structural check, a static
     * host (the encoding-shelf popover) can call it with just `{ encodings }`;
     * a data-aware property then reports `applicable: false` there — surfacing
     * only in the data-aware quick-config bar — without needing a separate flag.
     */
    check?: (ctx: OptionEvalContext) => { applicable: boolean; recommendedValue?: any };
};

/**
 * A chart property descriptor annotated with its applicability and resolved
 * value for a *specific* spec + dataset. Produced by `getChartOptions` (and
 * carried on the assembled spec under `_options`).
 *
 * This is the contract between Flint and any host (Data Formulator, an AI agent,
 * another renderer):
 *
 *   - `applicable` — did this property pass its precondition for this render?
 *     Each property answers via its own `check`: structural ones (e.g. stack
 *     mode) are applicable when their channel is bound; data-aware ones (e.g.
 *     per-axis log scale, faceted independent y) only when the data warrants it
 *     (wide-range continuous axis, faceted quantitative y, …). A host should
 *     surface a control only when it is applicable; passing a non-applicable
 *     property to the compiler is accepted but silently ignored.
 *   - `value` — the value Flint will actually use: the host's explicit choice
 *     (from `chart_spec.chartProperties[key]`) when set, otherwise the engine's
 *     recommended default. Hosts seed their control from this so an "auto"
 *     recommendation (e.g. log on a 10⁶× axis) is reflected without the host
 *     having to recompute it.
 *
 * A `ChartOption` shares the renderable `ChartProperty` descriptor with the
 * template def but carries the *answer* (`applicable`/`value`) instead of the
 * *rule* (`check`). That keeps it a resolved, serializable view a host consumes
 * across the spec/JSON boundary (Python path included), where the rule function
 * wouldn't survive anyway.
 */
export type ChartOption = ChartProperty & {
    /** Did this property pass its precondition for the current spec + data? */
    applicable: boolean;
    /** Explicit host choice if set, otherwise the engine's recommended default. */
    value: any;
};


/**
 * Defines a "quick action" whose effect is an **encoding transform** (Category B):
 * sort, color scheme, aggregate, type, orientation (x↔y swap), etc.
 *
 * These operate at a different pipeline stage than ChartPropertyDef:
 *
 *   Category B (this type):  (encoding + override) ──► transformed encoding ──► assemble ──► spec
 *                                         └──── set() ────┘
 *   Category A (properties): encoding ──► assemble ──► spec ──► (props tweak spec in instantiate)
 *
 * An encoding action transforms the *input* to assembly, so the full pipeline
 * (semantic resolution → overflow → layout → assembly) re-runs on the result.
 * That is exactly why structural options must live here: sort changes which
 * categories survive overflow, aggregate changes the data values, orientation
 * changes which axis is banded — none of which can be faked by patching the
 * assembled spec afterwards. ChartPropertyDef, by contrast, only overrides the
 * already-assembled spec and is limited to visual decoration (cornerRadius,
 * opacity, curve, donut hole).
 *
 * Storage = override, not encoding state. The action's value is stored by the
 * host as a *configuration override* (exactly like a chart property), keyed by
 * `key` inside `chart_spec.chartProperties`. The encoding map (the encoding
 * shelf's state) is left untouched. The compiler — not the host — applies the
 * override at assemble time:
 *
 *   transformedEncodings = set(currentEncodings, chartProperties[key])
 *
 * So Flint always sees just "override value + current encoding" and composes
 * them; it never mutates persistent encoding state. (See applyEncodingOverrides.)
 *
 *   get(encodings)        → derive the control's displayed value from the base
 *                           encodings when no override is set
 *   set(encodings, value) → compose: return the encodings with the override applied
 *
 * `set` is declarative: it returns what the encodings should be after the
 * override, not a list of imperative operations. Any transform — changing one
 * property, swapping two channels, clearing a channel — is just "produce a new
 * map", so there is no operation taxonomy to grow.
 *
 * `dependencies` declares which encoding channels the override is computed
 * against. It is a pure declaration consumed by the *host*: when the user edits
 * one of these channels in the encoding shelf, the host clears (resets) the
 * override so a stale value can't linger. Flint never resets — reset is host
 * logic; Flint only ever composes override + current encoding.
 *
 * The control shape mirrors ChartPropertyDef so the host can reuse the same
 * renderers; only the pipeline stage differs (encoding transform vs spec tweak).
 */
export type EncodingActionDef = {
    key: string;
    label: string;
    /**
     * Channels this override is computed against. When the host detects an edit
     * to any of these channels in the encoding shelf, it resets this override to
     * default. Pure declaration — Flint itself never reads this for composition.
     */
    dependencies?: string[];
    /** How to render the control (same value domains as ChartPropertyDef). */
    control:
        | { type: 'continuous'; min: number; max: number; step?: number }
        | { type: 'discrete';  options: { value: any; label: string }[] }
        | { type: 'binary' };
    /**
     * Optional applicability predicate — the single gate for whether this action
     * is offered. It reads the shared `OptionEvalContext`; in practice an action
     * only needs `ctx.encodings`, so it subsumes both channel-assignment checks
     * (is a channel bound? e.g. `!!ctx.encodings.color?.field`) and type checks
     * (e.g. Sort needs a discrete category axis, so it must not appear on a
     * purely temporal/quantitative chart). Pure. Defaults to always-applicable.
     */
    isApplicable?: (ctx: OptionEvalContext) => boolean;
    /** Derive the displayed control value from the base encodings map (pure). */
    get: (encodings: Record<string, ChartEncoding>) => any;
    /** Compose: return the encodings with this override value applied (pure). */
    set: (encodings: Record<string, ChartEncoding>, value: any) => Record<string, ChartEncoding>;
};

/**
 * A chart-type transition: a pivot state that re-views the same data as a
 * *sibling* chart type. Unlike orientation/role/series moves (which stay within
 * one template), a transition changes `chartType` and, optionally, re-routes one
 * field across channels. It is the "chart type as another group coordinate"
 * generator (see design doc §4.6). Examples: Grouped Bar ↔ Stacked Bar (the
 * dodge series moves between `group` and `color`), Scatter ↔ Strip/Jitter (a
 * discrete `color` swaps onto the `x` category axis).
 */
export interface PivotTransition {
    /** Target chart type to render as. Must be a registered sibling template. */
    to: string;
    /** State label shown in the pivot control (e.g. 'Stacked', 'Grouped', 'Jitter'). */
    label: string;
    /**
     * Optional channel re-route applied before switching templates.
     * - `move`: source field → target channel; source channel cleared (target must be empty).
     * - `swap`: exchange the fields on the two channels (or spill the displaced
     *   field to a third channel — see `spill`).
     *
     * `from` may be a literal channel name or the sentinel `'series'`, which
     * resolves at runtime to whichever grouping channel (`color`/`column`/`row`/
     * `group`) currently holds the discrete series field.
     */
    route?: { from: string; to: string; mode?: 'move' | 'swap'; spill?: string };
    /** Only offer when the routed source field is discrete (nominal/ordinal). */
    requireDiscreteSource?: boolean;
    /** Only offer when the routed source field's distinct count is within this budget. */
    maxSourceCardinality?: number;
    /**
     * Only offer when the *domain* position axis (the non-measure x/y) carries an
     * ordered type — `temporal` or `ordinal`, never plain `nominal`. This is the
     * hard gate for bar → line/area: you may not connect unordered categories.
     * Per the design decision, order is taken from the resolved encoding type
     * (derived from the semantic type), NOT inferred from sort state.
     */
    requireOrderedAxis?: boolean;
    /**
     * Only offer when every value on the *measure* position axis is ≥ 0. The gate
     * for part-to-whole / filled siblings (pie, area) where a negative magnitude
     * would misread.
     */
    requireNonNegative?: boolean;
    /**
     * Only offer when the *domain* axis distinct count is within this budget — the
     * low-cardinality guard for pie/rose (few slices) and line → bar (few ticks).
     */
    maxCategoryCardinality?: number;
    /**
     * Only offer when NO discrete series channel (color/group/column/row) is bound
     * — the single-series guard for a part-to-whole pie/donut.
     */
    requireNoSeries?: boolean;
    /**
     * Only offer when a discrete series channel (color/group/detail/column/row) IS
     * bound — the multi-series guard for small-multiple siblings (e.g. Line →
     * Sparkline needs a series to make one strip per category).
     */
    requireSeries?: boolean;
    /**
     * Only offer when BOTH position axes (x and y) are measures (quantitative or
     * aggregated) — the guard for a fitted trend (Scatter → Regression): a
     * regression line is meaningless over a nominal/category axis.
     */
    requireBiaxialMeasure?: boolean;
    /**
     * Only offer when the `size` channel is NOT bound — keeps a fitted-trend
     * sibling (Regression) to a clean 2-variable scatter rather than layering it
     * over a bubble chart.
     */
    requireNoSize?: boolean;
    /**
     * After routing, force the *domain* (non-measure) position axis onto this
     * channel, swapping `x`/`y` wholesale if it currently sits on the other. Used
     * for bar → line/area: a *horizontal* bar carries the ordered/temporal domain
     * on `y`, but a line pins time to the horizontal, so the transition must
     * re-orient to `x` (otherwise you get a nonsensical vertical line chart).
     */
    orientDomainAxis?: 'x' | 'y';
}

/**
 * Declarative pivot configuration carried by a chart template. Each generator
 * declares its *permissible transformation domain* compactly — the candidate
 * swap pairs, the shiftable channels, the sibling chart types — and the compiler
 * filters those candidates lazily against the actual encodings + data (type
 * compatibility, channel availability, cardinality budgets) when assembling. See
 * core/pivot.ts for the enumeration/composition semantics.
 */
export interface PivotDef {
    /** Override key the host stores the chosen state id under. Default `'pivot'`. */
    key?: string;
    /** Human label for the control. Default `'View'`. */
    label?: string;
    /**
     * τ (transpose): axis-slot pairs that may be exchanged *wholesale* — the
     * orientation/flip generator. Each pair (typically `['x','y']`) swaps the two
     * channels' full encodings, so it is profile-agnostic (a bar's category↔measure
     * flip, a scatter's measure↔measure flip, a heatmap's dimension↔dimension flip
     * all read the same). It is suppressed only when a continuous-temporal position
     * axis must stay horizontal (line/area). Because both slots stay occupied, a
     * transpose can never violate a must-present constraint. A template that should
     * never flip (e.g. a line, to avoid a vertical line chart) simply omits this.
     * Ids/labels: `flip:x-y` / `τ_x↔y`. Default none.
     */
    transpose?: string[][];
    /**
     * σ (permute): permutable *blocks* of channels whose *fields* may be reordered
     * among themselves — distinct from {@link transpose}, this reassigns a field to
     * a compatible channel rather than flipping two slots. The compiler enumerates
     * the within-block pairings and admits an *axis ↔ auxiliary* swap only when the
     * two ends share a profile (the Young-block rule of the design doc §3.6.1):
     *   - measure ↔ measure, on position marks only — a quantitative field trades a
     *     precise position axis for a demoted `color`/`size` channel (scatter);
     *   - category ↔ discrete `color` — a banded axis dimension trades places with
     *     the legend series (bars).
     * `x↔y` is NOT a permute (it is a {@link transpose}); pure auxiliary↔auxiliary
     * pairs (e.g. `color↔size`) are not offered. Order within a block is irrelevant;
     * ids/labels canonicalize each pair (`swap:x-color` / `σ_x↔color`). Default none.
     */
    permute?: string[][];
    /**
     * γ (shift): grouping channels the single discrete *series* field may be
     * routed across — typically `['color','group','column','row']`. The compiler
     * filters to channels the template actually declares, that are empty, and
     * within the per-channel cardinality budget. This is what unifies stacked /
     * grouped / faceted presentations as states of one template. Default none.
     */
    shift?: string[];
    /** Max distinct categories for a facet split to be offered. Default 12. */
    facetBudget?: number;
    /**
     * θ (chart-type transition): sibling chart types to consider re-rendering the
     * same data as (e.g. Grouped Bar ↔ Stacked Bar, Scatter ↔ Jitter). Each
     * admitted transition becomes one extra state in the orbit. Default none.
     */
    transitions?: PivotTransition[];
}

/**
 * Chart template definition — pure data, no UI/icon dependencies.
 * This is the reusable core that defines chart structure, encoding channels,
 * and processing logic.
 *
 * Three-phase pipeline hooks:
 *   1. declareLayoutMode — declare axis flags, type overrides, param overrides
 *   2. instantiate — build final spec from resolved encodings + layout
 */
export interface ChartTemplateDef {
    /** Display name of the chart type, e.g. "Scatter Plot" */
    chart: string;
    /** Vega-Lite spec skeleton (mark + encoding structure) */
    template: any;
    /** Which encoding channels are available for this chart */
    channels: string[];

    /**
     * How the primary mark encodes its quantitative value.
     * Determines zero-baseline, scale tightness, and compression behavior.
     *
     * Examples:
     *   - Bar, Histogram, Lollipop, Waterfall, Pyramid: 'length'
     *   - Area, Streamgraph, Density: 'area'
     *   - Line, Scatter, Boxplot, Candlestick, Strip: 'position'
     *   - Heatmap: 'color'
     */
    markCognitiveChannel: MarkCognitiveChannel;

    /** Template-owned semantic resolution and chart-specific presentation. */
    semanticInteractions?: (context: {
        resolvedEncodings: Readonly<Record<string, any>>;
    }) => {
        fields: string[];
        categoryField?: string;
        seriesField?: string;
        legendFields?: Record<string, string>;
        selectableMarks: string[];
        renderHoverStyles?: Record<string, {
            fill?: string;
            fillOpacity?: number;
            opacity?: 'contrast';
            stroke?: string;
            strokeWidth?: number;
        }>;
        resolve: import('./interaction-semantics').ChartInteractionResolver;
        presentUpdate: import('../interactive/interactions').ChartUpdateProcessor;
    };

    /**
     * Phase 1a: Declare layout intent.
     * Runs BEFORE layout computation.
     *
     * Inspects channel semantics and data to decide:
     * - Which axes are banded (need spring model)
     * - Any type conversions (Q→O for banded axis)
     * - Layout parameter overrides (σ, step multiplier, etc.)
     * Grouping (from group channel + discrete axis detection)
     */
    declareLayoutMode?: (
        channelSemantics: Record<string, ChannelSemantics>,
        table: any[],
        chartProperties?: Record<string, any>,
    ) => LayoutDeclaration;

    /**
     * Optional encoding-normalization hook.
     * Runs BEFORE semantics resolution and layout, after pivot / encoding-action
     * overrides have been composed. Lets a template re-route the *authored*
     * channel map so the WHOLE pipeline (semantics, faceting, overflow, layout)
     * resolves against the normalized encodings — not just the final spec.
     *
     * Example: a sparkline "table" remaps its series field (`color`/`detail`)
     * onto the `row` facet channel when no `row` is bound, so the layout engine
     * allocates one stacked strip per series instead of overlaying them.
     *
     * Return the (possibly new) encoding map. Returning the input unchanged is a
     * no-op. Pure — must not mutate the input.
     *
     * NOTE: currently honored by the Vega-Lite assembler only; ECharts / Chart.js
     * wiring is a follow-up.
     */
    normalizeEncodings?: (
        encodings: Record<string, ChartEncoding>,
        table: any[],
    ) => Record<string, ChartEncoding>;

    /**
     * Build the final spec from resolved encodings + layout.
     * Runs AFTER layout computation.
     *
     * Receives the spec skeleton (deep clone of template),
     * and a context with resolved encodings, semantic decisions,
     * and layout result. Handles both encoding mapping and mark sizing.
     *
     * @param spec       The Vega-Lite spec skeleton (deep clone of template)
     * @param context    Complete context with all phase outputs
     */
    instantiate: (
        spec: any,
        context: InstantiateContext,
    ) => void;

    /** Optional configurable properties for the chart type */
    properties?: ChartPropertyDef[];

    /**
     * The geometries this template actually builds.
     *
     * A theme states geometry once and every chart made of that shape reads it,
     * so the template has to say which shapes it makes: a line chart hears
     * `line` and `point` and is deaf to `arc`. Geometry a template does not
     * declare is dropped and reported rather than carried into a renderer that
     * would ignore it. A template that declares nothing keeps the whole profile.
     */
    geometryKinds?: GeometryKind[];

    /**
     * This template draws its own value text instead of using the generic
     * theme label layer. The public control is still `showValueLabels`;
     * templates may retain older internal/input spellings for compatibility.
     */
    ownsValueLabels?: boolean;

    /**
     * The template already presents values in a dedicated table column, so a
     * generic label layer would repeat the same number on the data mark.
     */
    suppressValueLabels?: boolean;

    /**
     * Opt out of a backend's *generic* column/row facet-splitting pass, even
     * though the template declares `x`/`y` (so the axis-less `hasAxes` gate
     * alone would not exempt it).
     *
     * Set by templates that build their own composite, self-contained figure
     * — one that already spans multiple internal axis pairs / sub-panels
     * (e.g. a Sparkline table's one-row-per-series strips, a Bar Table's
     * bar+%+value columns) — and so handle `column`/`row` themselves inside
     * `instantiate` rather than being pre-split into N single-facet calls
     * whose per-panel output a generic single-axis-pair combiner (e.g. the
     * Plotly backend's `facet.ts`) cannot correctly recombine.
     *
     * Currently honored by the Plotly assembler only.
     */
    selfManagesFacets?: boolean;

    /**
     * Optional encoding-level quick actions (Category B). Clicking one of these
     * mutates the encodings map (the same state the encoding shelf edits),
     * rather than chart-native config. See EncodingActionDef.
     */
    encodingActions?: EncodingActionDef[];

    /**
     * Optional pivot declaration — a derived Category-B operator that re-routes
     * encoding fields across position/legend/facet channels to surface
     * alternative views (orientation swap, series↔axis role swap, facet split).
     * The host stores the chosen state id under `PivotDef.key` in
     * chartProperties; the compiler enumerates + composes the permutation. See
     * core/pivot.ts (computePivot / applyPivot).
     */
    pivot?: PivotDef;

    /**
     * Optional post-processing hook.
     * Called after instantiation and layout application, before the final
     * result is returned.  Receives the assembled spec/option and the
     * effective canvas size so the template can adjust visual parameters
     * (e.g. symbol size, line width) proportionally.
     */
    postProcess?: (
        spec: any,
        context: InstantiateContext,
    ) => void;
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

/** A warning produced during chart assembly */
export interface ChartWarning {
    /** Warning severity */
    severity: 'info' | 'warning' | 'error';
    /** Short machine-readable warning code */
    code: string;
    /** Human-readable description */
    message: string;
    /** Optional: which channel(s) or field(s) triggered the warning */
    channel?: string;
    field?: string;
}

// ---------------------------------------------------------------------------
// Unified Assembly Input
// ---------------------------------------------------------------------------

/**
 * Unified input for all chart assembly functions (Vega-Lite, ECharts, Chart.js).
 *
 * Instead of passing multiple positional arguments, callers provide a single
 * JSON-serializable object with four top-level keys:
 *
 * ```ts
 * const result = assembleVegaLite({
 *   data: { values: myRows },
 *   semantic_types: { weight: 'Quantity', origin: 'Country' },
 *   chart_spec: {
 *     chartType: 'Scatter Plot',
 *     encodings: { x: { field: 'weight' }, y: { field: 'mpg' } },
 *     canvasSize: { width: 400, height: 300 },
 *   },
 *   options: { addTooltips: true },
 * });
 * ```
 */
export interface ChartAssemblyInput {
    /**
    * Data source — either inline rows or a reference the host can resolve.
     *
     * - `{ values: any[] }` — an array of row objects (like Vega-Lite `data.values`).
    * - `{ url: string }`   — a URL or path reference to JSON/CSV data.
    *   Hosts that need local semantic/layout decisions should resolve this to
    *   rows before assembly. The MCP renderer reads local JSON/CSV/TSV
    *   files referenced by path; it does not fetch remote URLs.
     *
     * At least one of `values` or `url` must be provided.
     */
    data: { values: any[]; url?: never } | { url: string; values?: never };

    /**
     * Per-column semantic type annotations.
     *
     * Maps field names to semantic type strings (e.g., `"Quantity"`, `"Country"`,
     * `"Year"`, `"Percentage"`). These drive encoding type resolution, zero-baseline
     * decisions, color schemes, formatting, and more.
     *
     * Fields not listed here fall back to `inferVisCategory()` which inspects
     * raw data values.
     */
    semantic_types?: Record<string, string | SemanticAnnotation>;

    /**
     * Chart specification — describes *what* to draw.
     */
    chart_spec: {
        /** Template name, e.g. `"Scatter Plot"`, `"Bar Chart"` */
        chartType: string;
        /**
         * The headline — what this chart says, in words.
         *
         * Not decoration. A chart of bare numbers names nothing on its own, and
         * the headline is where the measure gets named: `Male` and `75+` say
         * what they are, `35 30 25` does not. Design languages that drop axis
         * titles are leaning on this line to carry the subject, so a chart
         * authored without one loses the naming altogether — the compiler
         * notices, and puts the axis titles back.
         */
        title?: string;
        /** The deck: the reading of the headline — what is measured, of whom, when, in what units. */
        subtitle?: string;
        /** Channel → encoding map (e.g., `{ x: { field: 'weight' }, y: { field: 'mpg' } }`).
         * A bare string is shorthand for `{ field: <string> }` (e.g. `{ x: 'weight' }`). */
        encodings: Record<string, RawEncodingValue>;
        /**
         * Base (target) chart size in pixels — the size layout aims for when the
         * data fits comfortably (default: `{ width: 400, height: 320 }`).
         *
         * For faceted charts this is the whole-chart target; panels divide it.
         * The chart may grow beyond `baseSize` under pressure (dense axes, many
         * facet panels), bounded by `canvasSize`.
         */
        baseSize?: { width: number; height: number };
        /**
         * Hard ceiling on the rendered size in pixels (optional).
         *
         * The final image — a single plot OR an entire facet grid — never exceeds
         * this box. The per-dimension growth allowance is derived from the ratio
         * to `baseSize`: `βx = canvasSize.width / baseSize.width`,
         * `βy = canvasSize.height / baseSize.height` (each clamped to ≥ 1).
         *
         * When omitted, the ceiling defaults to `baseSize × options.maxStretch`
         * (default 1.5×) in each dimension.
         */
        canvasSize?: { width: number; height: number };
        /** Template-specific configurable properties (e.g., bar corner radius, show labels) */
        chartProperties?: Record<string, any>;
    };

    /**
     * Theme — describes *how it should look*.
     *
     * Either the name of a house Flint ships (`'economist'`, `'nature'`, …see
     * `listThemePresets()`), a `ThemeSpec` of your own, or a `ThemeSpec` that
     * `extends` a shipped house and overrides selected fields. A ThemeSpec is a
     * portable design language (ink, type, structure, marks, chrome policy),
     * stated without ever naming a channel, field, or backend property. The
     * compiler grounds it against this chart and then realizes it in the
     * target backend.
     *
     * Sits beside `chart_spec` rather than inside it because the same theme
     * applies to every chart and the same chart accepts any theme — nesting it
     * would make that independence unstatable.
     *
     * Currently realized by the Vega-Lite assembler only. Other assemblers
     * accept the shared input field but do not apply it.
     */
    theme_spec?: ThemeSpec | string;

    /**
     * Options for the assembler — layout tuning, tooltips, etc.
     * All fields are optional and have sensible defaults.
     */
    options?: AssembleOptions;

    /**
     * Localized display names for fields (column name → display label).
     * When present, used as axis titles and legend headers instead of raw field names.
     */
    field_display_names?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Assembly Options
// ---------------------------------------------------------------------------

/**
 * Options for the chart assembly function.
 * Includes layout tuning parameters — all have sensible defaults.
 */
export interface AssembleOptions {
    /** Whether to add tooltips to the chart (default: false) */
    addTooltips?: boolean;
    /**
     * Fraction of each step reserved for inter-category padding (0–1).
     * VL pads *inside* the step (band = step × (1 − padding)), so this
     * value should match VL's paddingInner.  ECharts pads *outside* the
     * band, so the layout engine passes this through so ECharts can
     * compute barWidth = step × (1 − stepPadding) explicitly.
     *
     * Default: 0.1 (matching VL's default band paddingInner).
     */
    stepPadding?: number;
    /** Power-law exponent for discrete axis stretch (default: 0.5) */
    elasticity?: number;
    /**
     * Default maximum stretch multiplier used when the spec provides no
     * explicit `canvasSize` ceiling (default: 2).
     *
     * This is a **unified** budget: the combined stretch from facet
     * layout AND discrete/banded axis sizing must stay within this
     * factor.  For example, with maxStretch=2 and a 400px base,
     * the total chart width never exceeds 800px regardless of how
     * many facet columns or discrete axis items there are.
     *
     * When `chart_spec.canvasSize` IS set, the per-dimension caps
     * `maxStretchX`/`maxStretchY` are derived from `canvasSize / baseSize`
     * instead and this scalar is ignored.
     */
    maxStretch?: number;
    /**
     * Resolved per-dimension stretch cap for the X (width) axis.
     *
     * Normally derived by the assembler from `canvasSize / baseSize`
     * (or `maxStretch` when no ceiling is set). Callers rarely set this
     * directly. Falls back to `maxStretch` when absent.
     */
    maxStretchX?: number;
    /**
     * Resolved per-dimension stretch cap for the Y (height) axis.
     *
     * Normally derived by the assembler from `canvasSize / baseSize`
     * (or `maxStretch` when no ceiling is set). Callers rarely set this
     * directly. Falls back to `maxStretch` when absent.
     */
    maxStretchY?: number;
    /** Power-law exponent for facet subplot stretch — lower = more conservative (default: 0.3) */
    facetElasticity?: number;
    /** Minimum pixels per discrete axis item (default: 6) */
    minStep?: number;
    /** Maximum number of distinct color values before overflow truncation (default: 24) */
    maxColorValues?: number;
    /** Minimum facet subplot size in px (default: 60) */
    minSubplotSize?: number;
    /**
     * Fixed overhead in px for axis labels, titles, legend, etc.
     * Subtracted once from the total canvas budget (not per-panel).
     * Each backend sets its own default; core uses { width: 0, height: 0 }.
     */
    facetFixedPadding?: { width: number; height: number };
    /**
     * Gap in px between adjacent facet panels (spacing, headers).
     * Used directly by the core layout engine to compute subplot sizes
     * and max canvas dimensions.
     * Each backend sets its own value (VL ≈ 10, ECharts ≈ 14); core uses 0.
     */
    facetGap?: number;
    /**
     * Explicit number of facet COLUMNS for a column-wrapped facet, overriding
     * the auto-computed wrap. When set (≥ 1) the layout uses this many columns
     * (clamped to the distinct column count) and wraps the remaining panels
     * into as many rows as needed. Surfaced to hosts as the `facetColumns`
     * chart property so users can dial the wrap in interactively; undefined =
     * auto (fill the width).
     */
    facetColumns?: number;
    /**
     * Base pixels per discrete category at a 300px baseline canvas.
     * Scaled proportionally with canvas size by the core layout engine.
     * The final default step size is:
     *
     *   defaultStepSize = defaultBandSize × max(1, canvasSize/300)
     *
     * Backends set this to match their native bar/band rendering:
     *   - VL:  ~20 (VL uses width:{step:N} which auto-sizes the plot area)
     *   - EC:  ~20 (ECharts adds generous grid margins)
     *   - CJS: ~30 (Chart.js fills the canvas; wider bands look more native)
     *
     * Templates can override via paramOverrides for chart types that need
     * more space per band (e.g. jitter: 40, funnel: 50, sankey: 60).
     *
     * Default: 20.
     */
    defaultBandSize?: number;
    /**
     * Blend between the scaled base band and the available span per item.
     *
    *   baseSpanStep = baseSpan / N
    *   capacityStep = availableCapacity / N
    *   preferredStep = baseSpanStep > baseStep
    *       ? baseStep × (1 − fit) + capacityStep × fit
    *       : baseStep
     *
    * `0` gives fixed-step behavior (Vega-Lite); `1` aims toward the available
    * canvas capacity on sparse axes (ECharts, Chart.js, Plotly). The selected
    * pitch then passes through normal elastic stretch/compression. Two-banded
    * cell grids bypass this policy. Default: 0.
     */
    bandStepFit?: number;
    /** Explicit X-axis capacity for sparse band fitting. Internal assembler bridge. */
    bandStepFitCapacityX?: number;
    /** Explicit Y-axis capacity for sparse band fitting. Internal assembler bridge. */
    bandStepFitCapacityY?: number;
    /**
     * Chart-specific **floor** on the per-category band step (at a 300px
     * baseline canvas), which a house's `layout.bandStep` may grow but not
     * undercut. Ordinary charts have no such floor: a compact house is right
     * to print thin bars. But a few chart types are only legible above a
     * minimum band width regardless of house — a slopegraph draws its whole
     * meaning from the angle of two columns, and a house that packs them 46px
     * apart turns every slope near-vertical and leaves no room for the end
     * labels. Such a template states the width its read needs here, and the
     * house is held to it as a minimum while still free to spread wider.
     *
     * Unset for most templates (no floor). Set via paramOverrides.
     */
    minBandStep?: number;
    /**
     * Maximum pixels per discrete category at a 300px baseline canvas,
     * scaled proportionally with canvas size (like {@link defaultBandSize}).
     *
     * This is the **sparse-expansion ceiling**. When few categories share a
     * wide plot, each band grows to fill the available width but never past
     * `maxBandSize`, so one or two bars can't balloon to the whole canvas.
     * The band is thus clamped to `[minStep, maxBandSize]`:
     *
     *   step = clamp(availableWidth / N, minStep, maxBandSize)
     *
     * Backends set this to match their native sparse-bar rendering:
     *   - VL:  = defaultBandSize (VL's step-based sizing doesn't fill a container)
     *   - EC / CJS / Plotly: much larger (these fill their plot area natively)
     *
     * Defaults to {@link defaultBandSize} (no expansion beyond the base band).
     */
    maxBandSize?: number;
    /**
     * When a discrete axis is **grouped** (dodged lanes within each category
     * band), by default the band's elastic stretch target is the *per-item*
     * step — so a category holding N lanes is only sized as if it held one.
     * For thin marks (grouped bars) that's fine: 4 lanes share a ~66px band
     * comfortably. But wide marks — a box-and-whisker glyph — need real room
     * per lane, and the per-item target leaves grouped boxplots compressed on
     * an otherwise roomy canvas.
     *
     * When set, the grouped band instead targets `itemsPerGroup × step`, so
     * the category band stretches to give each lane its full width (still
     * bounded by `maxBandSize × itemsPerGroup` and the canvas budget). Scoped
     * to templates whose grouped glyph is wide (boxplot); left off for bars so
     * their tuned grouped spacing does not change.
     */
    groupBandFillsLanes?: boolean;
    /**
     * Backend-native base font size (px) for axis **tick labels**, at a 300px
     * reference canvas. The core scales it subtly with canvas size and uses it
     * as the ceiling of the shrink→rotate→cap ladder, so a chart never renders
     * ticks below its backend's native scale on a comfortable canvas.
     *
     * Learned from each renderer's defaults:
     *   - Vega-Lite: 10   - ECharts: 12   - Chart.js: 12   - Plotly: 12
     *
     * Default: 10.
     */
    baseLabelFontSize?: number;
    /**
     * Backend-native base font size (px) for **headers** (axis titles, legend,
     * chart title), at a 300px reference canvas. Scaled subtly with canvas size
     * (grows up to +4 on large canvases, shrinks toward the base in small
     * multiples) so headers stay proportionate to the chart.
     *
     * Learned from each renderer's defaults:
     *   - Vega-Lite: 11   - ECharts: 12   - Chart.js: 12   - Plotly: 14
     *
     * Default: 11.
     */
    baseTitleFontSize?: number;
    /**
     * When true, continuous X and Y axes stretch together using the
     * larger of the two per-axis stretch factors. This preserves the
     * aspect ratio of the data space. (default: false — axes stretch
     * independently based on their own density.)
     */
    maintainContinuousAxisRatio?: boolean;
    /**
     * Gas-pressure tuning for continuous axes (default: scatter-plot settings).
     * - A single number overrides markCrossSection (σ) for both axes.
     * - An object allows per-axis σ plus optional elasticity / maxStretch:
     *   `{ x: 100, y: 0, elasticity: 0.7, maxStretch: 2 }`
     *   x/y = 0 means "don't stretch this axis".
     *   Useful for line/area charts where horizontal crowding matters
     *   far more than vertical.
     */
    continuousMarkCrossSection?: number | {
        x: number;
        y: number;
        /** Per-axis stretch elasticity (default: 0.3). Higher → more responsive. */
        elasticity?: number;
        /** Per-axis stretch cap (default: 1.5). */
        maxStretch?: number;
        /**
         * Which axis uses series-count-based pressure instead of pixel counting.
         * - 'x' or 'y': that axis uses nSeries × σ / dim for pressure.
         * - 'auto': auto-detect — in 2D (both continuous), defaults to 'y';
         *   in 1D (one continuous + one discrete), uses the continuous axis.
         * The σ for the series axis is used directly (not sqrt'd) since series
         * count is inherently 1D.
         */
        seriesCountAxis?: 'x' | 'y' | 'auto';
    };
    /**
     * Resistance to aspect-ratio distortion when faceting.
     *
     * When faceting divides one dimension (e.g. width by column count),
     * the subplot aspect ratio drifts away from the single-plot ratio.
     * Line and area charts are very sensitive to this because their
     * visual signal is encoded in slopes and curve shapes.
     *
     * This parameter partially compensates by shrinking the undivided
     * dimension so the panel aspect ratio stays closer to the original:
     *
     *   arDrift = facetedAR / baseAR          (< 1 when panel is narrower)
     *   correctedDim = dim × arDrift ^ resistance
     *
     * - 0 (default): no correction — current behavior.
     * - 0.3–0.5: moderate resistance (recommended for line / area).
     * - 1: fully preserve the single-plot aspect ratio.
     */
    facetAspectRatioResistance?: number;
    /**
     * Whether to auto-wrap column-only facets into a 2D grid.
     *
     * When `true` (default), `computeFacetGrid` considers wrapping N
     * column facets into multiple rows, choosing the layout whose
     * overall aspect ratio best matches the canvas AR.
     *
     * When `false`, column-only facets stay in a single row (capped
     * at the maximum that fits the canvas budget). Useful for small
     * multiples that should always be side-by-side.
     */
    autoFacetWrap?: boolean;
    /**
     * Target aspect ratio for a single band (step height ÷ step width).
     *
     * When a banded (discrete) axis is opposite a continuous axis, each
     * band has a natural AR = continuousAxisSize / stepSize.  If that
     * exceeds the target, the continuous axis is shrunk via a log-space
     * blend so bands don't become excessively tall/wide.
     *
     * - `undefined` / 0: no band-AR correction.
     * - Typical values: 8–15 (VL default ≈ 10, ECharts ≈ 12).
     *
     * Only affects charts with exactly one banded axis and one
     * continuous axis (e.g. bar, lollipop).  Has no effect on
     * scatter, line, or fully-banded charts.
     */
    targetBandAR?: number;
}
