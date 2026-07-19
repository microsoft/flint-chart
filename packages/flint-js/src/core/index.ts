// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/core
 *
 * Target-language-agnostic core of the chart engine.
 *
 * Contains semantic type system, layout computation, overflow filtering,
 * decision functions, and shared type definitions. No Vega-Lite or other
 * rendering-library dependencies.
 */

// Types & constants
export {
    channels,
    channelGroups,
    type ChartAssemblyInput,
    type ChartEncoding,
    type EncodingValue,
    type EncodingShorthand,
    type RawEncodingValue,
    type StaticSeriesMetadata,
    type AssembleOptions,
    type ChartTemplateDef,
    type ChartWarning,
    type ChannelSemantics,
    type SemanticResult,
    type MarkCognitiveChannel,
    type LayoutDeclaration,
    type TruncationWarning,
    type LayoutResult,
    type InstantiateContext,
    type ChartPropertyDef,
    type ChartOption,
    type OptionEvalContext,
    type EncodingActionDef,
    type PivotDef,
    type OverflowStrategy,
    type OverflowStrategyContext,
    type OverflowResult,
    type ChannelBudgets,
} from './types';

// Encoding-action override composition
export { applyEncodingOverrides } from './encoding-overrides';

// Pivot (derived Category-B operator) enumeration + composition
export {
    computePivot,
    applyPivot,
    makeCartesianPivot,
    computeArrangeStates,
    computeChartTypeStates,
    applyTransform,
    TRANSFORM_CHART_TYPE_KEY,
    TRANSFORM_ARRANGE_KEY,
    type PivotSurface,
    type PivotComputation,
    type TransformSurface,
} from './pivot';

// Central chart-type transition registry (the θ graph)
export { CHART_TRANSITIONS, getChartTransitions } from './chart-transitions';

// Reusable encoding-action factories
export { makeSortAction, type SortChoice } from './encoding-actions';

// Backend-neutral position-axis detection for bar-like templates
export {
    detectBandedAxisFromSemantics,
    detectBandedAxisForceDiscrete,
} from './axis-detection';

// Band-dodge decision (dodge-by-color/group vs. nested full-width)
export {
    planBandDodge,
    resolveBandDodge,
    resolveDodge,
    laneCountForMode,
    DEFAULT_NESTED_SNAP_THRESHOLD,
    type BandDodgePlan,
    type PlanBandDodgeOptions,
    type DodgeMode,
    type DodgeOption,
    type ColorLayoutMode,
} from './band-dodge';

// Semantic type system
export {
    SemanticTypes,
    type SemanticType,
    type VisCategory,
    type ZeroClass,
    type ZeroDecision,
    getVisCategory,
    inferVisCategory,
    getZeroClass,
    computeZeroDecision,
    computePaddedDomain,
    isMeasureType,
    isTimeSeriesType,
    isCategoricalType,
    isOrdinalType,
    isGeoType,
    getRecommendedColorScheme,
    inferOrdinalSortOrder,
} from './semantic-types';

// Reusable decision functions
export {
    resolveEncodingType,
    computeElasticBudget,
    computeAxisStep,
    computeFacetLayout,
    computeLabelSizing,
    computeOverflow,
    computeGasPressure,
    DEFAULT_GAS_PRESSURE_PARAMS,
    type EncodingTypeDecision,
    type ElasticStretchParams,
    type ElasticBudget,
    type AxisStepDecision,
    type FacetLayoutDecision,
    type LabelSizingDecision,
    type OverflowDecision,
    type GasPressureParams,
    type GasPressureDecision,
} from './decisions';

// Phase modules (analysis pipeline — VL-free)
export { resolveChannelSemantics, convertTemporalData } from './resolve-semantics';
export { filterOverflow } from './filter-overflow';
export { computeLayout, computeChannelBudgets } from './compute-layout';
export {
    normalizeStaticSeries,
    normalizeEncodingShorthand,
    coerceEncodingValue,
    STATIC_SERIES_KEY_COLUMN,
    STATIC_SERIES_VALUE_COLUMN,
    type NormalizeStaticSeriesResult,
} from './static-series';

// Recommendation & adaptation engine
export {
    adaptChannels,
    recommendChannels,
    type SemanticRole,
} from './recommendation';

// Data-driven chart *type* recommendation
export {
    profileData,
    rankChartTypes,
    recommendChartTypes,
    recommendChartTypesDetailed,
    type ChartFieldRole,
    type ProfiledField,
    type DataProfile,
    type ChartTypeSuggestion,
    type RecommendChartTypesOptions,
    type RecommendedChart,
} from './chart-type-recommendation';

// Field semantics
export {
    type SemanticAnnotation,
    type FormatSpec,
    type DomainConstraint,
    type TickConstraint,
    type ColorSchemeHint,
    type DivergingInfo,
    type FieldSemantics,
    resolveFieldSemantics,
    normalizeAnnotation,
    getRegistryEntry,
    toTypeString,
    resolveFormat,
    resolveDefaultVisType,
    resolveAggregationDefault,
    resolveZeroClassFromAnnotation,
    resolveScaleType,
    resolveDomainConstraint,
    resolveTickConstraint,
    resolveCanonicalOrder,
    resolveCyclic,
    resolveReversed,
    resolveNice,
    resolveDivergingInfo,
    resolveColorSchemeHint,
    resolveBinningSuggested,
    resolveStackable,
    resolveSortDirection,
} from './field-semantics';
