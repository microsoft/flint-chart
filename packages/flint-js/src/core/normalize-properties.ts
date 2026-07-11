// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Normalize user-supplied `chart_spec.chartProperties` against a template's
 * declared `properties`, so an invalid *value* never reaches the backend spec.
 *
 * The reference docs (see `scripts/gen-chart-reference.ts`) list the accepted
 * `value` for each discrete property, but a caller may still pass a human label
 * (e.g. `"Logarithmic"` instead of `"log"`) or an outright unknown value. Left
 * unchecked, the template's `instantiate` copies that string verbatim into the
 * backend transform (e.g. Vega-Lite's `regression` `method`), which the renderer
 * silently rejects — producing a blank chart with no error.
 *
 * For every discrete property present in `chartProperties` this helper:
 *   - keeps the value untouched when it already matches an option `value`;
 *   - maps a known option `label` (case-insensitive) to its `value`, emitting an
 *     `info` warning so the caller learns the canonical value;
 *   - drops an unrecognized value (falling back to the property default) and
 *     emits a `warning`, keeping the "safe to pass" contract that a bad input
 *     degrades gracefully rather than rendering nothing.
 *
 * Non-discrete properties and keys not declared by the template (pivot state,
 * axis overrides, encoding overrides, …) are passed through unchanged.
 */

import type { ChartPropertyDef, ChartWarning } from './types';

export interface NormalizePropertiesResult {
    chartProperties: Record<string, any> | undefined;
    warnings: ChartWarning[];
}

export function normalizeChartProperties(
    properties: ChartPropertyDef[] | undefined,
    chartProperties: Record<string, any> | undefined,
): NormalizePropertiesResult {
    const warnings: ChartWarning[] = [];
    if (!properties || !chartProperties) {
        return { chartProperties, warnings };
    }

    let result: Record<string, any> | undefined;
    const ensureCopy = (): Record<string, any> => {
        if (!result) result = { ...chartProperties };
        return result;
    };

    for (const def of properties) {
        if (def.type !== 'discrete') continue;
        if (!(def.key in chartProperties)) continue;
        const value = chartProperties[def.key];
        if (value == null) continue;

        // Already a valid accepted value — nothing to do.
        if (def.options.some((o) => o.value === value)) continue;

        // Known label (case-insensitive) → coerce to the canonical value.
        const byLabel =
            typeof value === 'string'
                ? def.options.find(
                      (o) =>
                          o.label != null &&
                          o.label.toLowerCase() === value.trim().toLowerCase(),
                  )
                : undefined;
        if (byLabel) {
            ensureCopy()[def.key] = byLabel.value;
            warnings.push({
                severity: 'info',
                code: 'coerced-option-label',
                message: `chartProperties.${def.key}: '${value}' is a display label; using the accepted value '${byLabel.value}' instead.`,
            });
            continue;
        }

        // Unrecognized value → drop it so the property falls back to its default,
        // instead of emitting an invalid backend spec that renders blank.
        const accepted = def.options
            .map((o) => (o.value == null ? '(default)' : `'${o.value}'`))
            .join(', ');
        const copy = ensureCopy();
        delete copy[def.key];
        warnings.push({
            severity: 'warning',
            code: 'invalid-option-value',
            message: `chartProperties.${def.key}: '${value}' is not a valid option (accepted: ${accepted}). Falling back to the default.`,
        });
    }

    return { chartProperties: result ?? chartProperties, warnings };
}
