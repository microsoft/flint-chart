// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite recommendation & adaptation wrappers.
 *
 * Extends core/recommendation.ts with VL-only chart types (Regression,
 * Ranged Dot Plot, Pyramid, Lollipop, Bump, Density, Waterfall,
 * Strip, Map, Choropleth) and filters results to VL-valid channels.
 */

import {
    adaptChannels,
    recommendChannels,
    getRecommendation,
    type InternalTableView,
    // Pick utilities for VL-specific chart types
    pick,
    pickQuantitative,
    pickDiscrete,
    pickTemporal,
    pickLowCardNominal,
    pickLowCardDiscrete,
    pickGeo,
    pickSeriesAxis,
    hasMultipleValuesPerField,
    pickBestGroupingField,
    pickLineChartColorField,
    isValidLineSeriesData,
    nameMatches,
} from '../core/recommendation';
import {
    recommendChartTypes,
    type RecommendChartTypesOptions,
    type RecommendedChart,
} from '../core/chart-type-recommendation';
import { vlGetTemplateChannels, vlAllTemplateDefs } from './templates';

// ── VL-extended recommendation ──────────────────────────────────────────

/**
 * VL-specific recommendation function.  Handles VL-only chart types first,
 * then falls back to the core recommendation engine for shared types.
 */
function vlGetRecommendation(chartType: string, tv: InternalTableView): Record<string, string> {
    const used = new Set<string>();
    const rec: Record<string, string> = {};
    const assign = (channel: string, fieldName: string | undefined) => {
        if (fieldName) rec[channel] = fieldName;
    };

    switch (chartType) {
        case 'Regression':
            // Regression uses the same logic as Scatter Plot in the core engine
            return getRecommendation('Scatter Plot', tv);

        case 'Ranged Dot Plot': {
            const yField = pickGeo(tv, used) ?? pickDiscrete(tv, used);
            const xField = pickQuantitative(tv, used);
            if (!xField || !yField) return {};
            assign('y', yField);
            assign('x', xField);
            return rec;
        }

        case 'Pyramid Chart': {
            const yField = pickDiscrete(tv, used);
            const xField = pickQuantitative(tv, used);
            const colorField = pickDiscrete(tv, used);
            if (!xField || !yField || !colorField) return {};
            assign('y', yField);
            assign('x', xField);
            assign('color', colorField);
            return rec;
        }

        case 'Bump Chart': {
            // Same logic as Line Chart
            const xField = pickSeriesAxis(tv, used);
            const yField = pickQuantitative(tv, used);
            if (!xField || !yField) return {};
            assign('x', xField);
            assign('y', yField);
            if (!isValidLineSeriesData(tv, xField, undefined)) {
                const colorField = pickLineChartColorField(tv, used, xField, 20)
                    ?? pickLineChartColorField(tv, used, xField, 200);
                if (!colorField) return {};
                assign('color', colorField);
            }
            return rec;
        }

        case 'Lollipop Chart': {
            const xField = pickDiscrete(tv, used);
            const yField = pickQuantitative(tv, used);
            if (!xField || !yField) return {};
            assign('x', xField);
            assign('y', yField);
            if (hasMultipleValuesPerField(tv, xField)) {
                assign('color', pickBestGroupingField(tv, used, xField));
            }
            return rec;
        }

        case 'Density Plot': {
            const xField = pickQuantitative(tv, used);
            if (!xField) return {};
            assign('x', xField);
            assign('color', pickLowCardNominal(tv, used, 15));
            return rec;
        }

        case 'Waterfall Chart': {
            const xField = pickDiscrete(tv, used);
            const yField = pickQuantitative(tv, used);
            if (!xField || !yField) return {};
            assign('x', xField);
            assign('y', yField);
            return rec;
        }

        case 'Bar Table': {
            // y = category to rank, x = quantitative value driving bar length
            const yField = pickDiscrete(tv, used);
            const xField = pickQuantitative(tv, used);
            if (!xField || !yField) return {};
            assign('y', yField);
            assign('x', xField);
            assign('color', pickLowCardNominal(tv, used, 20));
            return rec;
        }

        case 'Strip Plot': {
            const xField = pickDiscrete(tv, used);
            const yField = pickQuantitative(tv, used);
            if (!xField || !yField) return {};
            assign('x', xField);
            assign('y', yField);
            assign('color', pickLowCardDiscrete(tv, used, 20));
            return rec;
        }

        case 'Gantt Chart': {
            // y = task label, x = start, x2 = end. Prefer two temporal fields
            // for the interval; fall back to quantitative when no dates exist.
            const yField = pickDiscrete(tv, used);
            const startField = pickTemporal(tv, used) ?? pickQuantitative(tv, used);
            const endField = pickTemporal(tv, used) ?? pickQuantitative(tv, used);
            if (!yField || !startField || !endField) return {};
            assign('y', yField);
            assign('x', startField);
            assign('x2', endField);
            assign('color', pickLowCardNominal(tv, used, 12));
            return rec;
        }

        case 'Bullet Chart': {
            // y = label, x = measured value, goal = target marker.
            const yField = pickDiscrete(tv, used);
            const valueField = pickQuantitative(tv, used);
            const goalField = pickQuantitative(tv, used);
            if (!yField || !valueField) return {};
            assign('y', yField);
            assign('x', valueField);
            if (goalField) assign('goal', goalField);
            return rec;
        }

        case 'Map': {
            const latField = pick(tv, used, (_n, _ty, st) => st === 'Latitude')
                ?? pick(tv, used, (n) => nameMatches(n, ['latitude', 'lat']));
            const lonField = pick(tv, used, (_n, _ty, st) => st === 'Longitude')
                ?? pick(tv, used, (n) => nameMatches(n, ['longitude', 'lon', 'lng', 'long']));
            if (!latField || !lonField) return {};
            assign('latitude', latField);
            assign('longitude', lonField);
            assign('color', pickQuantitative(tv, used) ?? pickLowCardNominal(tv, used));
            return rec;
        }

        case 'Choropleth': {
            const GEO_PLACE = ['State', 'Country', 'Region', 'Province', 'County', 'Continent'];
            const idField = pick(tv, used, (_n, _ty, st) => GEO_PLACE.includes(st as string))
                ?? pick(tv, used, (n) => nameMatches(n, ['state', 'country', 'region', 'province', 'nation', 'county']))
                ?? pickDiscrete(tv, used);
            const measure = pickQuantitative(tv, used);
            if (!idField || !measure) return {};
            assign('id', idField);
            assign('color', measure);
            return rec;
        }

        default:
            // Fall through to core recommendation engine
            return getRecommendation(chartType, tv);
    }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Adapt encodings when switching between Vega-Lite chart types.
 *
 * @param sourceType     Current chart type name
 * @param targetType     Target chart type name
 * @param encodings      Current channel->fieldName map (filled channels only)
 * @param data           (optional) Data rows for recommendation-based adaptation
 * @param semanticTypes  (optional) Field->semantic-type map
 * @returns              Remapped channel->fieldName for the target
 */
export function vlAdaptChart(
    sourceType: string,
    targetType: string,
    encodings: Record<string, string>,
    data?: any[],
    semanticTypes?: Record<string, string>,
): Record<string, string> {
    const targetChannels = vlGetTemplateChannels(targetType);
    return adaptChannels(sourceType, targetType, targetChannels, encodings, data, semanticTypes, vlGetRecommendation);
}

/**
 * Recommend field->channel assignments for a Vega-Lite chart type.
 *
 * @param chartType      Chart template name (e.g. "Bar Chart")
 * @param data           Array of row objects
 * @param semanticTypes  Field->semantic-type map (e.g. { weight: "Quantity" })
 * @returns              channel->fieldName map (only VL-valid channels)
 */
export function vlRecommendEncodings(
    chartType: string,
    data: any[],
    semanticTypes: Record<string, string>,
): Record<string, string> {
    const rec = recommendChannels(chartType, data, semanticTypes, vlGetRecommendation);
    const validChannels = vlGetTemplateChannels(chartType);
    const result: Record<string, string> = {};
    for (const [ch, field] of Object.entries(rec)) {
        if (validChannels.includes(ch)) {
            result[ch] = field;
        }
    }
    return result;
}

/** Chart-type names Vega-Lite can render (its template catalog). */
const VL_SUPPORTED_TYPES = vlAllTemplateDefs.map(d => d.chart);

/**
 * Recommend a ranked list of Vega-Lite chart types for a dataset.
 *
 * Wraps the backend-agnostic `recommendChartTypes`, restricting results to
 * chart types Vega-Lite can render. Call it first, then feed the chosen type to
 * {@link vlRecommendEncodings} to populate channels — or use
 * {@link vlRecommendCharts} to do both in one step.
 *
 * @param data           Array of row objects.
 * @param semanticTypes  Field→semantic-type map (e.g. `{ Entity: "Country" }`).
 * @param options        Optional `max` cap on the number of suggestions.
 * @returns              Ranked VL chart-type names (best first).
 */
export function vlRecommendChartTypes(
    data: any[],
    semanticTypes: Record<string, string>,
    options: Omit<RecommendChartTypesOptions, 'supportedTypes'> = {},
): string[] {
    return recommendChartTypes(data, semanticTypes, { ...options, supportedTypes: VL_SUPPORTED_TYPES });
}

/**
 * One-step recommendation: rank Vega-Lite chart types for the data, then
 * populate each with {@link vlRecommendEncodings}. Suggestions whose required
 * channels cannot be filled are dropped, so every returned chart is renderable.
 *
 * @param data           Array of row objects.
 * @param semanticTypes  Field→semantic-type map.
 * @param options        Optional `max` cap on the number of charts returned.
 * @returns              Ranked `{ chartType, encodings }` pairs (best first).
 */
export function vlRecommendCharts(
    data: any[],
    semanticTypes: Record<string, string>,
    options: Omit<RecommendChartTypesOptions, 'supportedTypes'> = {},
): RecommendedChart[] {
    const { max, ...rest } = options;
    const charts = vlRecommendChartTypes(data, semanticTypes, rest)
        .map(chartType => ({ chartType, encodings: vlRecommendEncodings(chartType, data, semanticTypes) }))
        .filter(s => Object.keys(s.encodings).length > 0);
    return max != null ? charts.slice(0, max) : charts;
}
