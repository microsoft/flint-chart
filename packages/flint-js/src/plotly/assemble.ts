// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly chart assembly — Two-Stage Pipeline Coordinator.
 *
 * Reuses the **same core analysis pipeline** as the other backends:
 *   Phase 0:  resolveChannelSemantics  → ChannelSemantics
 *   Step 0a:  declareLayoutMode    → LayoutDeclaration
 *   Step 0b:  convertTemporalData  → converted data
 *   Step 0c:  filterOverflow       → filtered data, nominalCounts
 *   Phase 1:  computeLayout        → LayoutResult
 *
 * Then diverges for Phase 2 (Plotly-specific):
 *   template.instantiate → builds the Plotly figure structure
 *   plApplyLayoutToSpec  → applies layout decisions to the figure
 *
 * Key structural difference from the other backends' output:
 *   PL: { data: [{ type, x, y, … }], layout: { xaxis, yaxis, … } }
 *   Figures are pure JSON — no callback functions anywhere — so compiled
 *   specs survive serialization across process boundaries.
 *
 * First-merge scope: no `column` / `row` facet support; encodings on
 * unsupported channels are dropped with a warning (follow-up: subplot grids).
 *
 * This module has NO React, Redux, or UI framework dependencies.
 */

import {
    ChartEncoding,
    ChartTemplateDef,
    ChartAssemblyInput,
    AssembleOptions,
    LayoutDeclaration,
    InstantiateContext,
} from '../core/types';
import type { ChartWarning } from '../core/types';
import { applyEncodingOverrides } from '../core/encoding-overrides';
import { applyAggregation } from '../core/aggregate';
import { plGetTemplateDef } from './templates';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { computeZeroDecision } from '../core/semantic-types';
import { filterOverflow } from '../core/filter-overflow';
import { computeLayout, computeChannelBudgets, deriveStretchCaps, resolveBaseSize } from '../core/compute-layout';
import { decideColorMaps } from '../core/color-decisions';
import { plApplyLayoutToSpec, plApplyTooltips } from './instantiate-spec';
import { normalizeStaticSeries } from '../core/static-series';
import { normalizeChartProperties } from '../core/normalize-properties';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Assemble a Plotly figure object (`{ data, layout }`).
 *
 * ```ts
 * const figure = assemblePlotly({
 *   data: { values: myRows },
 *   semantic_types: { weight: 'Quantity' },
 *   chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
 * });
 * ```
 *
 * @returns A Plotly figure with optional `_warnings` and `_width`/`_height` hints
 */
export function assemblePlotly(input: ChartAssemblyInput): any {
    const chartType = input.chart_spec.chartType;
    const semanticTypes = input.semantic_types ?? {};
    const sizeCeiling = input.chart_spec.canvasSize;
    const baseSize = resolveBaseSize(input.chart_spec.baseSize, sizeCeiling);
    const canvasSize = baseSize;
    const options = input.options ?? {};
    const chartTemplate = plGetTemplateDef(chartType) as ChartTemplateDef;
    if (!chartTemplate) {
        throw new Error(`Unknown Plotly chart type: ${chartType}. Use plAllTemplateDefs to see available types.`);
    }

    const warnings: ChartWarning[] = [];

    const normalizedProps = normalizeChartProperties(
        chartTemplate.properties, input.chart_spec.chartProperties,
    );
    const chartProperties = normalizedProps.chartProperties;
    warnings.push(...normalizedProps.warnings);

    // ═══════════════════════════════════════════════════════════════════════
    // PRE-PHASE: Static Series Normalization
    // ═══════════════════════════════════════════════════════════════════════
    const rawData = input.data.values ?? [];
    const normalized = normalizeStaticSeries(
        input.chart_spec.encodings, rawData, semanticTypes,
    );
    let data = normalized.data;
    const staticSeries = normalized.staticSeries;

    // First-merge scope: drop encodings on channels this template does not
    // declare (notably column/row facets) instead of silently mis-rendering.
    const supported: Record<string, ChartEncoding> = {};
    for (const [ch, enc] of Object.entries(normalized.encodings)) {
        if (chartTemplate.channels.includes(ch)) {
            supported[ch] = enc;
        } else {
            warnings.push({
                severity: 'warning',
                code: 'unsupported-channel',
                message: `Channel "${ch}" is not supported by the Plotly ${chartType} template yet and was ignored.`,
                channel: ch,
                field: enc.field,
            });
        }
    }

    const encodings = applyEncodingOverrides(chartTemplate, supported, chartProperties);

    // Optional aggregation transform — see vegalite/assemble for rationale.
    data = applyAggregation(encodings, data);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: Resolve Semantics (shared — completely target-agnostic)
    // ═══════════════════════════════════════════════════════════════════════

    const tplMark = chartTemplate.template?.mark;
    const templateMarkType = typeof tplMark === 'string' ? tplMark : tplMark?.type;

    const convertedData = convertTemporalData(data, semanticTypes);

    const channelSemantics = resolveChannelSemantics(
        encodings, data, semanticTypes, convertedData,
    );

    // Finalize zero-baseline (requires template mark knowledge)
    const effectiveMarkType = templateMarkType || 'point';
    for (const [channel, cs] of Object.entries(channelSemantics)) {
        if ((channel === 'x' || channel === 'y') && cs.type === 'quantitative') {
            const numericValues = data
                .map(r => r[cs.field])
                .filter((v: any) => v != null && typeof v === 'number' && !isNaN(v));
            cs.zero = computeZeroDecision(
                cs.semanticAnnotation.semanticType, channel, effectiveMarkType, numericValues,
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0a: declareLayoutMode (shared hook)
    // ═══════════════════════════════════════════════════════════════════════

    const declaration: LayoutDeclaration = chartTemplate.declareLayoutMode
        ? chartTemplate.declareLayoutMode(channelSemantics, data, chartProperties)
        : {};

    const effectiveOptions: AssembleOptions = {
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    Object.assign(effectiveOptions, deriveStretchCaps(baseSize, sizeCeiling, effectiveOptions));

    const {
        addTooltips: addTooltipsOpt = false,
    } = effectiveOptions;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0b: filterOverflow (shared)
    // ═══════════════════════════════════════════════════════════════════════

    const allMarkTypes = new Set<string>();
    if (templateMarkType) allMarkTypes.add(templateMarkType);

    const budgets = computeChannelBudgets(
        channelSemantics, declaration, convertedData, canvasSize, effectiveOptions,
    );
    const facetGridResult = budgets.facetGrid;

    const overflowResult = filterOverflow(
        channelSemantics, declaration, encodings, convertedData,
        budgets, allMarkTypes,
    );

    const values = overflowResult.filteredData;
    warnings.push(...overflowResult.warnings);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Compute Layout (shared — completely target-agnostic)
    // ═══════════════════════════════════════════════════════════════════════

    const layoutResult = computeLayout(
        channelSemantics,
        declaration,
        values,
        canvasSize,
        effectiveOptions,
        facetGridResult,
    );

    layoutResult.truncations = overflowResult.truncations;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Instantiate Plotly Figure (PL-specific)
    // ═══════════════════════════════════════════════════════════════════════

    const resolvedEncodings: Record<string, any> = {};
    for (const [channel, encoding] of Object.entries(encodings)) {
        const cs = channelSemantics[channel];
        if (cs) {
            resolvedEncodings[channel] = {
                field: cs.field,
                type: cs.type,
                aggregate: encoding.aggregate,
            };
        }
    }

    const instantiateContext: InstantiateContext = {
        channelSemantics,
        layout: layoutResult,
        table: values,
        fullTable: convertedData,
        resolvedEncodings,
        encodings,
        chartProperties,
        staticSeries,
        canvasSize,
        semanticTypes,
        chartType,
        assembleOptions: effectiveOptions,
        colorDecisions: decideColorMaps({
            chartType,
            encodings,
            channelSemantics,
            table: values,
            background: 'light',
        }),
    };

    const figure: any = structuredClone(chartTemplate.template);
    chartTemplate.instantiate(figure, instantiateContext);
    plApplyLayoutToSpec(figure, instantiateContext, warnings);
    if (addTooltipsOpt) plApplyTooltips(figure);
    if (chartTemplate.postProcess) chartTemplate.postProcess(figure, instantiateContext);

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════

    if (warnings.length > 0) {
        figure._warnings = warnings;
    }

    figure._dataLength = values.length;

    return figure;
}
