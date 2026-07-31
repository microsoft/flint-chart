// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type {
    AssembleOptions,
    ChartTemplateDef,
    ChartWarning,
} from './types';
import {
    TRANSFORM_ARRANGE_KEY,
    TRANSFORM_CHART_TYPE_KEY,
} from './pivot';

const GLOBAL_CHART_PROPERTY_KEYS = [
    TRANSFORM_ARRANGE_KEY,
    TRANSFORM_CHART_TYPE_KEY,
    'facetColumns',
    'pivot',
] as const;

const ASSEMBLE_OPTION_KEY_MAP = {
    addTooltips: true,
    stepPadding: true,
    elasticity: true,
    maxStretch: true,
    maxStretchX: true,
    maxStretchY: true,
    facetElasticity: true,
    minStep: true,
    maxColorValues: true,
    minSubplotSize: true,
    facetFixedPadding: true,
    facetGap: true,
    facetColumns: true,
    defaultBandSize: true,
    maxBandSize: true,
    baseLabelFontSize: true,
    baseTitleFontSize: true,
    maintainContinuousAxisRatio: true,
    continuousMarkCrossSection: true,
    facetAspectRatioResistance: true,
    autoFacetWrap: true,
    targetBandAR: true,
} satisfies Record<keyof AssembleOptions, true>;

const ASSEMBLE_OPTION_KEYS = Object.keys(ASSEMBLE_OPTION_KEY_MAP).sort();
const KNOWN_ASSEMBLE_OPTION_KEYS = new Set(ASSEMBLE_OPTION_KEYS);

function collectChartPropertyKeys(
    templates: readonly ChartTemplateDef[],
): string[] {
    const keys = new Set<string>(GLOBAL_CHART_PROPERTY_KEYS);
    for (const template of templates) {
        for (const property of template.properties ?? []) {
            keys.add(property.key);
        }
        for (const key of template.additionalPropertyKeys ?? []) {
            keys.add(key);
        }
        for (const action of template.encodingActions ?? []) {
            keys.add(action.key);
        }
        if (template.pivot?.key) {
            keys.add(template.pivot.key);
        }
    }
    return [...keys].sort();
}

/**
 * Warn about input keys that the assembler will not consume.
 *
 * Both the authored and effective templates should be supplied so properties
 * remain valid across a chart-type transform. Unknown keys are left untouched
 * to preserve forward compatibility; callers only receive diagnostics.
 */
export function validateUnknownInputKeys(
    templates: readonly ChartTemplateDef[],
    chartProperties: Record<string, any> | undefined,
    options: AssembleOptions | undefined,
): ChartWarning[] {
    const warnings: ChartWarning[] = [];
    const chartPropertyKeys = collectChartPropertyKeys(templates);
    const knownChartProperties = new Set(chartPropertyKeys);
    const chartName = templates[templates.length - 1]?.chart ?? 'this chart';

    for (const key of Object.keys(chartProperties ?? {})) {
        if (knownChartProperties.has(key)) continue;
        warnings.push({
            severity: 'warning',
            code: 'unknown-chart-property',
            message: `chartProperties.${key}: unknown property for ${chartName}. Available properties: ${chartPropertyKeys.join(', ')}.`,
        });
    }

    for (const key of Object.keys(options ?? {})) {
        if (KNOWN_ASSEMBLE_OPTION_KEYS.has(key)) continue;
        warnings.push({
            severity: 'warning',
            code: 'unknown-assemble-option',
            message: `options.${key}: unknown assemble option. Available options: ${ASSEMBLE_OPTION_KEYS.join(', ')}.`,
        });
    }

    return warnings;
}
