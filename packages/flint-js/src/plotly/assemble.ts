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
 * column/row facets render as a subplot grid (see facet.ts), mirroring the
 * Chart.js backend's facet decisions (shared nice y-domain, leftmost-only
 * y labels, column wrapping).
 *
 * This module has NO React, Redux, or UI framework dependencies.
 */

import {
    ChartTemplateDef,
    ChartAssemblyInput,
    AssembleOptions,
    LayoutDeclaration,
    InstantiateContext,
} from '../core/types';
import type { ChartWarning, ChartEncoding } from '../core/types';
import { applyEncodingOverrides } from '../core/encoding-overrides';
import { applyAggregation } from '../core/aggregate';
import { plGetTemplateDef } from './templates';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { computeZeroDecision } from '../core/semantic-types';
import { filterOverflow } from '../core/filter-overflow';
import { computeLayout, computeChannelBudgets, deriveStretchCaps, resolveBaseSize, resolveFacetColumnsOption } from '../core/compute-layout';
import { decideColorMaps } from '../core/color-decisions';
import { plApplyCartesianAxisSpacing, plApplyLayoutToSpec, plApplyTooltips, plApplyAxisProperties } from './instantiate-spec';
import { plCombineFacetPanels, niceBounds, type PlotlyFacetPanel } from './facet';
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

    // Enrich raw encodings with their resolved semantic `type` BEFORE applying
    // encoding actions (Sort, …) — an action like Sort must know which position
    // channel is the measure (quantitative), which lives in the resolved
    // semantics, not the bare field binding. Mirrors the VL assembler's
    // `typedRawEncodings` step (a cheap preliminary semantics pass).
    const prelimConverted = convertTemporalData(data, semanticTypes);
    const prelimSemantics = resolveChannelSemantics(
        normalized.encodings, data, semanticTypes, prelimConverted,
    );
    const typedRawEncodings: Record<string, ChartEncoding> = {};
    for (const [ch, enc] of Object.entries(normalized.encodings)) {
        typedRawEncodings[ch] = enc.type ? enc : { ...enc, type: prelimSemantics[ch]?.type };
    }
    const encodings = applyEncodingOverrides(chartTemplate, typedRawEncodings, chartProperties);

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
        // Plotly fills its plot area natively (bars sized by `bargap`), so sparse
        // categories spread out. Allow bands to expand well past the base size,
        // matching Plotly's official low-cardinality bar style, but cap it so one
        // or two bars don't span the whole canvas.
        maxBandSize: 100,
        // Plotly native font defaults (ticks/legend 12, axis titles 14).
        baseLabelFontSize: 12,
        baseTitleFontSize: 14,
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    Object.assign(effectiveOptions, deriveStretchCaps(baseSize, sizeCeiling, effectiveOptions));
    effectiveOptions.facetColumns = resolveFacetColumnsOption(input.chart_spec.chartProperties);

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

    const colField = channelSemantics.column?.field;
    const rowField = channelSemantics.row?.field;
    // Multi-panel faceting only applies to axis-based (cartesian) templates.
    // Axis-less charts (Pie, Donut, Radar, Rose, Gauge, Funnel, KPI Card) use
    // `column` (when they declare it at all) for their own internal grouping
    // — e.g. one gauge dial per column value — and lay that out themselves,
    // exactly mirroring the ECharts backend's `hasAxes` gate.
    const hasAxes = chartTemplate.channels.includes('x') || chartTemplate.channels.includes('y');
    // A template can also opt out explicitly (`selfManagesFacets`) even though
    // it DOES declare x/y — composite multi-panel layouts (Sparkline, Bar
    // Table) already span several internal axis pairs of their own, so the
    // generic single-axis-pair-per-panel combiner (`facet.ts`) cannot safely
    // recombine N pre-split instantiations of them. These templates read
    // `column`/`row` straight off `channelSemantics` themselves instead.
    const hasFacet = !!(colField || rowField) && hasAxes && !chartTemplate.selfManagesFacets;

    let figure: any;
    if (hasFacet) {
        const colValues = colField ? [...new Set(values.map((r: any) => String(r[colField])))] : [''];
        const rowValues = rowField ? [...new Set(values.map((r: any) => String(r[rowField])))] : [''];

        // Shared y-domain across panels (mirror the Chart.js backend): nice
        // bounds so the shared top/bottom land on round tick values.
        const yField = channelSemantics.y?.field;
        let sharedYDomain: { min: number; max: number } | undefined;
        if (yField) {
            const nums = values
                .map((r: any) => r[yField])
                .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[];
            if (nums.length > 0) {
                const rawMin = Math.min(...nums);
                const rawMax = Math.max(...nums);
                const forceZero = !!channelSemantics.y?.zero?.zero;
                const min = forceZero ? Math.min(0, rawMin) : rawMin;
                const max = forceZero ? Math.max(0, rawMax) : rawMax;
                sharedYDomain = niceBounds(min, max);
            }
        }

        // Column wrapping: a column-only facet with more categories than fit
        // in one row wraps into a 2D grid (matching the other backends). The
        // wrap width comes from the shared facet-grid budget.
        const maxColsPerRow = (colField && !rowField)
            ? (facetGridResult?.columns ?? colValues.length)
            : colValues.length;
        const wrapColumnOnly = !!colField && !rowField && maxColsPerRow < colValues.length;

        const gridRows: Array<Array<{ colVal: string; rowVal: string }>> = [];
        if (wrapColumnOnly) {
            for (let i = 0; i < colValues.length; i += maxColsPerRow) {
                gridRows.push(
                    colValues.slice(i, i + maxColsPerRow).map((cv) => ({ colVal: cv, rowVal: '' })),
                );
            }
        } else {
            for (let ri = 0; ri < rowValues.length; ri++) {
                gridRows.push(colValues.map((cv) => ({ colVal: cv, rowVal: rowValues[ri] })));
            }
        }
        const gridCols = Math.max(1, ...gridRows.map(r => r.length));

        // Panel plot size — same discrete/continuous rules as plApplyLayoutToSpec.
        const xIsDiscrete = layoutResult.xNominalCount > 0 || layoutResult.xContinuousAsDiscrete > 0;
        const yIsDiscrete = layoutResult.yNominalCount > 0 || layoutResult.yContinuousAsDiscrete > 0;
        let panelWidth: number;
        let panelHeight: number;
        if (xIsDiscrete && layoutResult.xStepUnit !== 'group') {
            const n = layoutResult.xNominalCount || layoutResult.xContinuousAsDiscrete || 0;
            panelWidth = n > 0 ? layoutResult.xStep * n : (layoutResult.subplotWidth || canvasSize.width);
        } else {
            panelWidth = layoutResult.subplotWidth || canvasSize.width;
        }
        if (yIsDiscrete && layoutResult.yStepUnit !== 'group') {
            const n = layoutResult.yNominalCount || layoutResult.yContinuousAsDiscrete || 0;
            panelHeight = n > 0 ? layoutResult.yStep * n : (layoutResult.subplotHeight || canvasSize.height);
        } else {
            panelHeight = layoutResult.subplotHeight || canvasSize.height;
        }

        const panels: PlotlyFacetPanel[] = [];
        for (let ri = 0; ri < gridRows.length; ri++) {
            const cells = gridRows[ri];
            for (let ci = 0; ci < cells.length; ci++) {
                const { colVal, rowVal } = cells[ci];
                const panelData = values.filter((r: any) => {
                    if (colField && String(r[colField]) !== colVal) return false;
                    if (rowField && String(r[rowField]) !== rowVal) return false;
                    return true;
                });

                const panelFigure: any = structuredClone(chartTemplate.template);
                const panelContext: InstantiateContext = {
                    ...instantiateContext,
                    table: panelData,
                };
                chartTemplate.instantiate(panelFigure, panelContext);
                if (chartTemplate.postProcess) chartTemplate.postProcess(panelFigure, panelContext);

                panels.push({
                    rowIndex: ri,
                    colIndex: ci,
                    rowHeader: rowField ? rowVal : undefined,
                    colHeader: colField ? colVal : undefined,
                    figure: panelFigure,
                });
            }
        }

        figure = plCombineFacetPanels(panels, {
            rows: gridRows.length,
            cols: gridCols,
            panelWidth,
            panelHeight,
            sharedYDomain,
            hasColHeader: !!colField,
            hasRowHeader: !!rowField,
            colHeaderPerRow: wrapColumnOnly,
            showLegend: !!channelSemantics.color?.field,
        });

        // Apply the shared x-label rotation / font decisions to every panel axis.
        if (layoutResult.xLabel) {
            for (const key of Object.keys(figure.layout)) {
                if (!/^xaxis\d*$/.test(key)) continue;
                const ax = figure.layout[key];
                if (layoutResult.xLabel.labelAngle) {
                    ax.tickangle = Math.abs(layoutResult.xLabel.labelAngle);
                }
                if (layoutResult.xLabel.fontSize) {
                    ax.tickfont = { ...(ax.tickfont || {}), size: layoutResult.xLabel.fontSize };
                }
            }
        }
        plApplyCartesianAxisSpacing(figure);
        plApplyAxisProperties(figure, instantiateContext);
        if (addTooltipsOpt) plApplyTooltips(figure);
    } else {
        figure = structuredClone(chartTemplate.template);
        chartTemplate.instantiate(figure, instantiateContext);
        plApplyLayoutToSpec(figure, instantiateContext, warnings);
        plApplyAxisProperties(figure, instantiateContext);
        if (addTooltipsOpt) plApplyTooltips(figure);
        if (chartTemplate.postProcess) chartTemplate.postProcess(figure, instantiateContext);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════

    if (warnings.length > 0) {
        figure._warnings = warnings;
    }

    figure._dataLength = values.length;

    return figure;
}
