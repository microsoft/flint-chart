// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js recommendation & adaptation wrappers.
 */

import { adaptChannels, recommendChannels } from '../core/recommendation';
import {
    recommendChartTypes,
    type RecommendChartTypesOptions,
    type RecommendedChart,
} from '../core/chart-type-recommendation';
import { cjsGetTemplateChannels, cjsAllTemplateDefs } from './templates';

export function cjsAdaptChart(
    sourceType: string,
    targetType: string,
    encodings: Record<string, string>,
    data?: any[],
    semanticTypes?: Record<string, string>,
): Record<string, string> {
    const targetChannels = cjsGetTemplateChannels(targetType);
    return adaptChannels(sourceType, targetType, targetChannels, encodings, data, semanticTypes);
}

export function cjsRecommendEncodings(
    chartType: string,
    data: any[],
    semanticTypes: Record<string, string>,
): Record<string, string> {
    const rec = recommendChannels(chartType, data, semanticTypes);
    const validChannels = cjsGetTemplateChannels(chartType);
    const result: Record<string, string> = {};
    for (const [ch, field] of Object.entries(rec)) {
        if (validChannels.includes(ch)) result[ch] = field;
    }
    return result;
}

/** Chart-type names Chart.js can render (its template catalog). */
const CJS_SUPPORTED_TYPES = cjsAllTemplateDefs.map(d => d.chart);

/**
 * Recommend a ranked list of Chart.js chart types for a dataset, restricted to
 * chart types Chart.js can render. See {@link cjsRecommendCharts} for the
 * one-step variant that also fills channels.
 */
export function cjsRecommendChartTypes(
    data: any[],
    semanticTypes: Record<string, string>,
    options: Omit<RecommendChartTypesOptions, 'supportedTypes'> = {},
): string[] {
    return recommendChartTypes(data, semanticTypes, { ...options, supportedTypes: CJS_SUPPORTED_TYPES });
}

/**
 * One-step recommendation: rank Chart.js chart types for the data, then populate
 * each with {@link cjsRecommendEncodings}. Suggestions whose required channels
 * cannot be filled are dropped, so every returned chart is renderable.
 */
export function cjsRecommendCharts(
    data: any[],
    semanticTypes: Record<string, string>,
    options: Omit<RecommendChartTypesOptions, 'supportedTypes'> = {},
): RecommendedChart[] {
    const { max, ...rest } = options;
    const charts = cjsRecommendChartTypes(data, semanticTypes, rest)
        .map(chartType => ({ chartType, encodings: cjsRecommendEncodings(chartType, data, semanticTypes) }))
        .filter(s => Object.keys(s.encodings).length > 0);
    return max != null ? charts.slice(0, max) : charts;
}
