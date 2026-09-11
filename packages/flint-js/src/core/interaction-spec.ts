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

import type { ChartUpdate } from './interaction-contracts';

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

/** How committed presentation and annotation state is cleared. */
export interface InteractionDismissPolicy {
    click?: 'any' | 'non-element' | 'plot-background' | false;
    escape?: boolean;
}

/**
 * How a chart behaves. Sits beside `chart_spec` and `theme_spec` in
 * `ChartAssemblyInput`. Only the Vega-Lite interactive surface reads it; the
 * assemblers and the static backends leave it untouched.
 */
export interface InteractionSpec {
    /** One entry per interaction. Its type names the preset that makes it; no string shorthand. */
    interactions: readonly InteractionEntry[];
    /** Retained state applied at mount: emphasis, annotations, a viewport, an order. */
    updates?: readonly ChartUpdate[];
    /** Presets assist by default; false requires direct hits, maxDistance overrides eligible presets. */
    assistedTargeting?: boolean | AssistedTargetingOptions;
    keyboardTargeting?: boolean;
    dismiss?: InteractionDismissPolicy | false;
}
