// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartTemplateDef } from './types';
import { TRANSFORM_ARRANGE_KEY, TRANSFORM_CHART_TYPE_KEY } from './pivot';

/** Chart properties the analysis stage reads on every chart type. */
export const ANALYSIS_PROPERTIES: ReadonlySet<string> = new Set([
    'xAxisType', 'yAxisType',
    'includeZero_x', 'includeZero_y',
    'logScale_x', 'logScale_y',
    TRANSFORM_CHART_TYPE_KEY, TRANSFORM_ARRANGE_KEY, 'pivot',
]);

/** Whether analysis reads this chart property: it decides how the data is read, not how the chart looks. */
export function analysisReadsProperty(template: ChartTemplateDef, key: string): boolean {
    return ANALYSIS_PROPERTIES.has(key)
        || key === template.pivot?.key
        || (template.encodingActions ?? []).some((action) => action.key === key);
}
