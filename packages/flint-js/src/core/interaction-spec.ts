// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The declarative interaction contract: what an agent or a person writes in
 * `ChartAssemblyInput.interaction_spec`. Pure data, no DOM, no runtime import.
 *
 * `flint-chart/interactive` turns it into interaction definitions
 * (`resolveInteractionSpec`) and exposes the precise per-type option shapes
 * (`InteractionPresetSpec`). This module only names the presets and the
 * envelope around them, so the core stays free of the interactive runtime.
 */

/** The shipped interaction presets. Each name is also that preset's default id. */
export const INTERACTION_PRESET_TYPES = [
    'click-highlight',
    'axis-highlight',
    'click-group-focus',
    'hover-group-focus',
    'click-annotate',
    'select',
    'lasso-select',
    'brush-x',
    'brush-y',
    'brush-angle',
    'brush-zoom',
    'linked-brush',
    'legend-toggle',
    'context-activate',
    'long-press',
    'double-activate',
    'inspect',
    'inspect-index',
    'navigate',
    'drag-reorder',
] as const;

export type InteractionPresetType = (typeof INTERACTION_PRESET_TYPES)[number];

/**
 * A fact about a chart that at least one interaction preset reads at runtime.
 * `cartesian-region` is a rectangle, interval, or lasso drag the plot resolves marks in;
 * `angular-region` is a sector drag, which only the angular brush needs. A polar chart
 * offers both: its interval brush is honoured as a sector.
 */
export const INTERACTION_CAPABILITIES = [
    'elements',
    'cartesian-region',
    'angular-region',
    'navigation',
    'reorder',
    'legend',
    'discrete-axis',
    'index',
] as const;

export type InteractionCapability = (typeof INTERACTION_CAPABILITIES)[number];

/** What each capability is, in the words a warning or a tooltip uses. */
export const INTERACTION_CAPABILITY_DESCRIPTIONS: Readonly<Record<InteractionCapability, string>> = {
    'elements': 'marks that resolve to data',
    'cartesian-region': 'a plot to drag a region on',
    'angular-region': 'a polar chart with an angular region',
    'navigation': 'a navigable continuous axis',
    'reorder': 'a discrete axis whose order can change',
    'legend': 'a discrete legend',
    'discrete-axis': 'a discrete axis with category labels',
    'index': 'an index axis shared by the series',
};

/**
 * What a chart type offers to interaction presets, declared on
 * `ChartTemplateDef.interactionSupport`. An absent key means the chart type never
 * offers that capability. The assembler confirms the data-dependent ones
 * against the encodings: a legend needs a bound discrete legend channel,
 * navigation needs a continuous unfaceted axis, reorder needs a discrete axis.
 */
export interface ChartInteractionSupport {
    /** Marks resolve to data elements, so click, hover, annotate, and inspect presets work. */
    elements?: boolean;
    /** Drag regions the plot can resolve marks in. */
    region?: readonly ('cartesian' | 'angular')[];
    /**
     * Continuous positional axes whose domains pan and zoom. `geo` marks a
     * chart that places marks through a projection: pan and zoom then move the
     * projection's extent, and both axes navigate together.
     */
    navigation?: { axes?: readonly ('x' | 'y')[]; geo?: boolean };
    /** Discrete positional axes whose domain order a drag can change. */
    reorder?: { axes?: readonly ('x' | 'y')[]; includeConnectiveMarks?: boolean; markTypes?: readonly string[] };
    /** A discrete legend whose items stand for series or categories. */
    legend?: boolean;
    /** Axis labels stand for categories a pointer can target. */
    discreteAxis?: boolean;
    /** One position on the index axis reads a value from every series. */
    index?: boolean;
}

/** The capabilities each preset needs: the smallest set without which it does nothing. */
export const INTERACTION_PRESET_REQUIREMENTS: Readonly<Record<InteractionPresetType, readonly InteractionCapability[]>> = {
    'click-highlight': ['elements'],
    'axis-highlight': ['discrete-axis'],
    'click-group-focus': ['elements'],
    'hover-group-focus': ['elements'],
    'click-annotate': ['elements'],
    'select': ['elements', 'cartesian-region'],
    'lasso-select': ['elements', 'cartesian-region'],
    'brush-x': ['elements', 'cartesian-region'],
    'brush-y': ['elements', 'cartesian-region'],
    'brush-angle': ['elements', 'angular-region'],
    'brush-zoom': ['navigation'],
    'linked-brush': ['elements', 'cartesian-region'],
    'legend-toggle': ['legend'],
    'context-activate': ['elements'],
    'long-press': ['elements'],
    'double-activate': ['elements'],
    'inspect': ['elements'],
    'inspect-index': ['index'],
    'navigate': ['navigation'],
    'drag-reorder': ['reorder'],
};

/** The capabilities a chart type declares, before the assembler confirms the data-dependent ones. */
export function declaredInteractionCapabilities(
    support: ChartInteractionSupport | undefined,
): InteractionCapability[] {
    if (!support) return [];
    const list: InteractionCapability[] = [];
    if (support.elements) list.push('elements');
    if (support.region?.includes('cartesian')) list.push('cartesian-region');
    if (support.region?.includes('angular')) list.push('angular-region');
    if (support.navigation) list.push('navigation');
    if (support.reorder) list.push('reorder');
    if (support.legend) list.push('legend');
    if (support.discreteAxis) list.push('discrete-axis');
    if (support.index) list.push('index');
    return list;
}

/**
 * The presets a chart type can honour by declaration. The data may still remove
 * one at assemble time: a legend needs a bound discrete legend channel, and
 * navigation needs a continuous unfaceted axis.
 */
export function supportedInteractionPresets(
    support: ChartInteractionSupport | undefined,
): InteractionPresetType[] {
    const declared = new Set(declaredInteractionCapabilities(support));
    return INTERACTION_PRESET_TYPES.filter((type) =>
        INTERACTION_PRESET_REQUIREMENTS[type].every((capability) => declared.has(capability)));
}

/**
 * One preset as JSON: the type name, an optional id, and that preset's options
 * under `options`, for example
 * `{ "type": "navigate", "options": { "axes": "x", "pan": false } }`.
 * The options are the ones the matching factory in `flint-chart/interactive`
 * accepts; the precise per-type shape is `InteractionPresetSpec` there.
 * `id` defaults to `type` and lives on the entry, never inside `options`.
 */
export interface InteractionEntry {
    type: InteractionPresetType;
    id?: string;
    options?: Record<string, any>;
}

/** Pointer acquisition that snaps to a nearby mark instead of requiring a direct hit. */
export interface TargetDetailsOptions {
    fields?: readonly string[];
    maxRows?: number;
}

export interface TargetFeedbackOptions {
    indicator?: boolean;
    details?: boolean | TargetDetailsOptions;
}

export interface AssistedTargetingOptions extends TargetFeedbackOptions {
    /** Hard override for eligible preset distances, in renderer pixels. */
    maxDistance?: number;
}

/**
 * How a chart behaves. Sits beside `chart_spec` and `theme_spec` in
 * `ChartAssemblyInput`. Only the Vega-Lite interactive surface reads it; the
 * assemblers and the static backends leave it untouched. Retained state is not
 * part of it; a host applies that through the surface.
 */
export interface InteractionSpec {
    /** One entry per interaction. Its type names the preset that makes it, and its options carry its own `reset` list. */
    interactions: readonly InteractionEntry[];
    /** Presets assist by default; false requires direct hits, maxDistance overrides eligible presets. */
    assistedTargeting?: boolean | AssistedTargetingOptions;
    keyboardTargeting?: boolean;
}
