// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * DATA-DRIVEN CHART *TYPE* RECOMMENDATION
 * =============================================================================
 *
 * `recommendChannels` / `getRecommendation` answer "which fields go on which
 * channels **for a chart type I already picked**". They do not answer the step
 * that sits *in front* of them: **which chart type should I use at all?**
 *
 * This module fills that gap. Given raw rows + semantic-type annotations it
 * builds a deterministic {@link DataProfile} (how many measures / temporals /
 * categoricals / geographic fields the table has, and their cardinalities) and
 * scores a ranked list of candidate chart types.
 *
 * It reuses the same semantic-type classification the encoders use
 * (`isMeasureType`, `isTimeSeriesType`, `isGeoType`, …) so the two stages agree
 * on what a field *is*; it only adds the type-selection heuristic on top.
 *
 * Typical use (e.g. Data Formulator surfacing suggestions without a model call):
 *
 * ```ts
 * const types = recommendChartTypes(rows, semanticTypes); // ["Choropleth", "Line Chart", …]
 * const encodings = vlRecommendEncodings(types[0], rows, semanticTypes);
 * ```
 *
 * Backend wrappers (`vlRecommendChartTypes`, …) pass `supportedTypes` so only
 * chart types that backend can actually render are returned, and pair it with
 * their `…RecommendEncodings` to emit type + channels in one step
 * (`…RecommendCharts`).
 *
 * =============================================================================
 */

import {
    isMeasureType,
    isTimeSeriesType,
    isCategoricalType,
    isOrdinalType,
    isGeoCoordinateType,
    isGeoLocationString,
    isNonMeasureNumeric,
} from './semantic-types';
import { buildTableView, nameMatches, type InternalTableView } from './recommendation';

// ── Field roles ─────────────────────────────────────────────────────────

/**
 * The role a field plays when choosing a chart type. Mutually exclusive:
 * every field is classified into exactly one role (the most specific one).
 */
export type ChartFieldRole =
    | 'measure'      // true quantitative measure (aggregatable)
    | 'temporal'     // date / time-granule — a time axis
    | 'categorical'  // nominal category / entity
    | 'ordinal'      // ordered discrete (Rank, Range, Score, …)
    | 'geoPlace'     // named place: Country, State, City, Region …
    | 'latitude'     // geographic latitude coordinate
    | 'longitude'    // geographic longitude coordinate
    | 'identifier'   // row id / index — not useful as a category or measure
    | 'other';       // unclassified

/** A single field annotated with its data/semantic type, cardinality, and role. */
export interface ProfiledField {
    name: string;
    /** Vega-Lite-style vis category: 'quantitative' | 'temporal' | 'nominal' | 'ordinal'. */
    type: string;
    /** Semantic type annotation (e.g. "Country", "Amount"), or '' if none. */
    semanticType: string;
    /** Number of distinct non-null values. */
    cardinality: number;
    role: ChartFieldRole;
}

/**
 * A deterministic summary of a table's shape, used to rank chart types.
 * The bucketed arrays are views over {@link fields} grouped by role, plus
 * `dimensions` (all category-axis-capable fields: categorical ∪ ordinal ∪
 * geoPlace ∪ temporal).
 */
export interface DataProfile {
    fields: ProfiledField[];
    measures: ProfiledField[];
    temporals: ProfiledField[];
    categoricals: ProfiledField[];
    ordinals: ProfiledField[];
    geoPlaces: ProfiledField[];
    latitudes: ProfiledField[];
    longitudes: ProfiledField[];
    identifiers: ProfiledField[];
    /** Fields usable on a category/discrete axis (categorical ∪ ordinal ∪ geoPlace ∪ temporal). */
    dimensions: ProfiledField[];
    rowCount: number;
}

// Identifier name patterns — strict (exact or `_suffix`) to avoid false hits
// like "grid" / "valid" / "android". `rank` is intentionally excluded so a
// Rank field classifies as ordinal (a usable axis) rather than an identifier.
const ID_NAME_PATTERNS = ['id', 'index', 'idx', 'row', 'order', 'position', 'pos'];

function looksLikeIdentifier(name: string): boolean {
    const lower = name.toLowerCase();
    return ID_NAME_PATTERNS.some(p => lower === p || lower.endsWith('_' + p));
}

/**
 * Classify one field into a single {@link ChartFieldRole}. The order of checks
 * is significant: the most *specific* interpretation wins (geo coordinate →
 * geo place → temporal → identifier → measure → ordinal → categorical).
 */
function classifyRole(name: string, type: string, semanticType: string): ChartFieldRole {
    const st = semanticType;
    // Geographic coordinates (Latitude / Longitude): numeric but not measures.
    if (isGeoCoordinateType(st)) {
        if (st === 'Latitude' || nameMatches(name, ['latitude', 'lat'])) return 'latitude';
        if (st === 'Longitude' || nameMatches(name, ['longitude', 'lon', 'lng', 'long'])) return 'longitude';
        return 'other';
    }
    // Named geographic places (Country / State / City / Region / …).
    if (isGeoLocationString(st)) return 'geoPlace';
    // Time axis.
    if (type === 'temporal' || isTimeSeriesType(st)) return 'temporal';
    // Row identifiers — demoted so they never become a category or measure.
    if (st === 'ID' || looksLikeIdentifier(name)) return 'identifier';
    // True quantitative measure (mirrors isQuantitativeField in the encoders).
    if (type === 'quantitative' && !isNonMeasureNumeric(st) && (isMeasureType(st) || st === '')) {
        return 'measure';
    }
    // Ordered discrete (Rank, Range, Score-as-ordinal, Direction, …).
    if (isOrdinalType(st)) return 'ordinal';
    // Plain category.
    if (type === 'nominal' || isCategoricalType(st)) return 'categorical';
    return 'other';
}

/**
 * Build a {@link DataProfile} from raw rows + semantic-type annotations.
 * Deterministic — no random sampling; classification is per-field and
 * order-independent.
 *
 * @param data           Array of row objects.
 * @param semanticTypes  Field → semantic-type map (e.g. `{ Entity: "Country" }`).
 */
export function profileData(data: any[], semanticTypes: Record<string, string>): DataProfile {
    const tv: InternalTableView = buildTableView(data, semanticTypes);
    const fields: ProfiledField[] = tv.names.map(name => ({
        name,
        type: tv.fieldType[name] ?? 'nominal',
        semanticType: tv.fieldSemanticType[name] ?? '',
        cardinality: tv.fieldLevels[name]?.length ?? 0,
        role: classifyRole(name, tv.fieldType[name] ?? 'nominal', tv.fieldSemanticType[name] ?? ''),
    }));

    const by = (r: ChartFieldRole) => fields.filter(f => f.role === r);
    const categoricals = by('categorical');
    const ordinals = by('ordinal');
    const geoPlaces = by('geoPlace');
    const temporals = by('temporal');

    return {
        fields,
        measures: by('measure'),
        temporals,
        categoricals,
        ordinals,
        geoPlaces,
        latitudes: by('latitude'),
        longitudes: by('longitude'),
        identifiers: by('identifier'),
        dimensions: [...categoricals, ...ordinals, ...geoPlaces, ...temporals],
        rowCount: tv.rows.length,
    };
}

// ── Scoring ─────────────────────────────────────────────────────────────

/** A ranked chart-type candidate with its score and human-readable reasons. */
export interface ChartTypeSuggestion {
    chartType: string;
    /** Higher is a better fit. Scores are relative; only the ordering is meaningful. */
    score: number;
    reasons: string[];
}

/** Options for {@link recommendChartTypes} / {@link recommendChartTypesDetailed}. */
export interface RecommendChartTypesOptions {
    /**
     * Restrict results to these chart-type names (e.g. a backend's template
     * catalog). Types not in the list are dropped. Omit for all shared types.
     */
    supportedTypes?: string[];
    /** Cap the number of suggestions returned (after ranking). */
    max?: number;
}

/**
 * A recommended chart type paired with its recommended channel → field
 * encodings. Returned by the backend one-step recommenders
 * (`vlRecommendCharts`, …) that chain type selection with encoding selection.
 */
export interface RecommendedChart {
    chartType: string;
    encodings: Record<string, string>;
}

// Cardinality thresholds for readability gates.
const LOW_CARD_SERIES = 12;   // a legend/series stays readable up to ~12 colors
const LOW_CARD_AXIS = 25;     // a discrete heatmap axis stays readable up to ~25 bands
const PIE_MAX_SLICES = 8;     // a pie is legible only with a handful of slices

/** Semantic types the choropleth base maps can actually render (see map.ts). */
const CHOROPLETH_SEMANTIC = new Set(['Country', 'State']);
const CHOROPLETH_NAME_HINTS = ['country', 'state', 'province', 'nation'];

/**
 * Score candidate chart types for a data profile. Returns suggestions sorted by
 * descending score; ties keep a stable, priority-ordered arrangement.
 *
 * The rules are curated design heuristics: more *specific* chart types
 * (maps, time series) outrank generic ones (bar) when the data supports them,
 * so a table with a geographic place + a measure surfaces "Choropleth" ahead of
 * "Bar Chart" without a model call.
 */
export function rankChartTypes(profile: DataProfile): ChartTypeSuggestion[] {
    const {
        measures, temporals, categoricals, ordinals, geoPlaces,
        latitudes, longitudes, rowCount,
    } = profile;

    const catLike = [...categoricals, ...ordinals, ...geoPlaces]; // discrete, non-temporal
    const dims = profile.dimensions;
    const lowCardCatLike = catLike.filter(f => f.cardinality >= 2 && f.cardinality <= LOW_CARD_SERIES);
    const lowCardDims = dims.filter(f => f.cardinality >= 2 && f.cardinality <= LOW_CARD_AXIS);
    const hasMeasure = measures.length >= 1;

    // Preserve insertion order for stable tie-breaking; keep the max score per type.
    const order: string[] = [];
    const acc = new Map<string, { score: number; reasons: string[] }>();
    const add = (chartType: string, score: number, reason: string) => {
        const cur = acc.get(chartType);
        if (!cur) {
            order.push(chartType);
            acc.set(chartType, { score, reasons: [reason] });
        } else {
            if (score > cur.score) cur.score = score;
            if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
        }
    };

    // ── Geographic (most specific) ──────────────────────────────────────
    if (latitudes.length >= 1 && longitudes.length >= 1) {
        add('Map', 96, 'has latitude + longitude coordinates');
    }
    const choroGeo = geoPlaces.filter(
        f => CHOROPLETH_SEMANTIC.has(f.semanticType) || nameMatches(f.name, CHOROPLETH_NAME_HINTS),
    );
    if (choroGeo.length >= 1 && hasMeasure) {
        add('Choropleth', 92, 'has a geographic region field + a measure');
    }

    // ── Time series ─────────────────────────────────────────────────────
    if (temporals.length >= 1 && hasMeasure) {
        add('Line Chart', 88, 'has a time field + a measure (trend over time)');
        add('Area Chart', 66, 'has a time field + a measure');
    }

    // ── Correlation (two measures) ──────────────────────────────────────
    if (measures.length >= 2) {
        add('Scatter Plot', 84, 'has two or more measures (relationship)');
    }

    // ── Category + measure (bar) ────────────────────────────────────────
    if (dims.length >= 1 && hasMeasure) {
        add('Bar Chart', 80, 'has a category axis + a measure');
    }

    // ── Single-measure distribution (histogram) ─────────────────────────
    if (hasMeasure && dims.length === 0) {
        add('Histogram', 82, 'has a measure with no category (distribution)');
    }

    // ── Two-category comparison (grouped / stacked / heatmap) ───────────
    if (catLike.length >= 2 && lowCardCatLike.length >= 1 && hasMeasure) {
        add('Grouped Bar Chart', 72, 'has two categories + a measure');
        add('Stacked Bar Chart', 70, 'has two categories + a measure');
    }
    if (lowCardDims.length >= 2 && hasMeasure) {
        add('Heatmap', 74, 'has two discrete fields + a measure (matrix)');
    }

    // ── Part-to-whole (pie) ─────────────────────────────────────────────
    if (catLike.length === 1 && temporals.length === 0 && hasMeasure) {
        const c = catLike[0];
        const oneRowPerCategory = rowCount <= c.cardinality * 1.5;
        if (c.cardinality >= 2 && c.cardinality <= PIE_MAX_SLICES && oneRowPerCategory) {
            add('Pie Chart', 64, 'a few categories that sum to a whole');
        }
    }

    // ── Distribution across groups (box / strip) ────────────────────────
    if (catLike.length >= 1 && hasMeasure && temporals.length === 0) {
        const smallest = catLike.reduce((a, b) => (b.cardinality < a.cardinality ? b : a));
        if (smallest.cardinality >= 1 && rowCount >= smallest.cardinality * 2) {
            add('Boxplot', 58, 'multiple measure values per group (spread)');
            add('Strip Plot', 52, 'multiple measure values per group');
        }
    }

    // ── Count-only fallbacks (dimensions but no measure) ────────────────
    if (!hasMeasure && dims.length >= 1) {
        add('Bar Chart', 60, 'categories without a measure (counts)');
        if (lowCardDims.length >= 2) add('Heatmap', 55, 'two discrete fields (cross-tab counts)');
    }

    // ── Last-resort fallback ────────────────────────────────────────────
    if (order.length === 0) {
        if (measures.length >= 2) add('Scatter Plot', 20, 'fallback for numeric data');
        else add('Bar Chart', 15, 'fallback');
    }

    return order
        .map(chartType => ({ chartType, score: acc.get(chartType)!.score, reasons: acc.get(chartType)!.reasons }))
        // Stable sort (ES2019+) — equal scores keep priority insertion order.
        .sort((a, b) => b.score - a.score);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Recommend candidate chart types for a dataset, with scores and reasons.
 *
 * @param data           Array of row objects.
 * @param semanticTypes  Field → semantic-type map (e.g. `{ Entity: "Country" }`).
 * @param options        Optional `supportedTypes` filter and `max` cap.
 * @returns              Ranked {@link ChartTypeSuggestion}s (best first).
 */
export function recommendChartTypesDetailed(
    data: any[],
    semanticTypes: Record<string, string>,
    options: RecommendChartTypesOptions = {},
): ChartTypeSuggestion[] {
    const profile = profileData(data, semanticTypes);
    let ranked = rankChartTypes(profile);
    if (options.supportedTypes) {
        const allowed = new Set(options.supportedTypes);
        ranked = ranked.filter(s => allowed.has(s.chartType));
    }
    if (options.max != null) ranked = ranked.slice(0, options.max);
    return ranked;
}

/**
 * Recommend a ranked list of chart-type names for a dataset (best first).
 *
 * A convenience wrapper over {@link recommendChartTypesDetailed} that drops the
 * scores/reasons. This is the "type-selection step that sits in front of"
 * `recommendChannels` — call it first, then feed the chosen type to
 * `…RecommendEncodings` to populate channels.
 *
 * @param data           Array of row objects.
 * @param semanticTypes  Field → semantic-type map.
 * @param options        Optional `supportedTypes` filter and `max` cap.
 * @returns              Ranked chart-type names (best first).
 */
export function recommendChartTypes(
    data: any[],
    semanticTypes: Record<string, string>,
    options: RecommendChartTypesOptions = {},
): string[] {
    return recommendChartTypesDetailed(data, semanticTypes, options).map(s => s.chartType);
}
