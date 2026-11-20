// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type {
    AssembleOptions,
    ChartTemplateDef,
    ChartWarning,
} from './types';
import { ANALYSIS_PROPERTIES } from './analysis-properties';

const GLOBAL_CHART_PROPERTY_KEYS = [
    ...ANALYSIS_PROPERTIES,
    'labelOverflow',
    'independentYAxis',
    'showTextLabels',
    'showValueLabels',
    'facetColumns',
] as const;

const ASSEMBLE_OPTION_KEY_MAP = {
    addTooltips: true,
    liveLayoutSignal: true,
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
    facetGapColumn: true,
    facetGapRow: true,
    facetColumns: true,
    defaultBandSize: true,
    bandStepFit: true,
    bandStepFitCapacityX: true,
    bandStepFitCapacityY: true,
    labelStep: true,
    rowNamesAbove: true,
    canvasFit: true,
    canvasRefit: true,
    canvasTreatment: true,
    themeDecisions: true,
    minBandStep: true,
    maxBandSize: true,
    groupBandFillsLanes: true,
    baseLabelFontSize: true,
    minLabelFontSize: true,
    baseTitleFontSize: true,
    maintainContinuousAxisRatio: true,
    continuousMarkCrossSection: true,
    facetAspectRatioResistance: true,
    autoFacetWrap: true,
    targetBandAR: true,
    cellGrowth: true,
    bandBalance: true,
    targetAspect: true,
    aspectTolerance: true,
} satisfies Record<keyof AssembleOptions, true>;

const ASSEMBLE_OPTION_KEYS = Object.keys(ASSEMBLE_OPTION_KEY_MAP).sort();
const KNOWN_ASSEMBLE_OPTION_KEYS = new Set(ASSEMBLE_OPTION_KEYS);

type InputKeyTemplate = Pick<ChartTemplateDef,
    'chart' | 'properties' | 'additionalPropertyKeys' | 'encodingActions' | 'pivot'>;

function collectChartPropertyKeys(
    templates: readonly InputKeyTemplate[],
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
    templates: readonly InputKeyTemplate[],
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
