// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts chart assembly — Two-Stage Pipeline Coordinator.
 *
 * Reuses the **same core analysis pipeline** as Vega-Lite, ECharts, and
 * Chart.js:
 *   Phase 0:  resolveChannelSemantics  → ChannelSemantics
 *   Step 0a:  declareLayoutMode    → LayoutDeclaration
 *   Step 0b:  convertTemporalData  → converted data
 *   Step 0c:  filterOverflow       → filtered data, nominalCounts
 *   Phase 1:  computeLayout        → LayoutResult
 *
 * Then diverges for Phase 2 (Highcharts-specific):
 *   template.instantiate → builds Highcharts option structure
 *   hcApplyLayoutToSpec → applies layout decisions to option
 *
 * Key structural differences from other backends:
 *   VL: { mark, encoding, data: {values}, width, height }
 *   EC: { xAxis, yAxis, series: [{type, data}], tooltip, legend, grid }
 *   CJS: { type, data: { labels, datasets[] }, options: { scales, plugins } }
 *   HC: { chart: {type}, xAxis: {categories}, yAxis: {title}, series: [{name, data}],
 *         tooltip, legend, colors, title }
 *
 * Highcharts has no native small-multiples support, so faceted inputs are
 * assembled into a `_facet` config holding an array of per-panel options
 * (same contract as the Chart.js backend).
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
import { applyPivot, applyTransform, type PivotSurface, type TransformSurface } from '../core/pivot';
import { hcGetTemplateDef } from './templates';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { computeZeroDecision } from '../core/semantic-types';
import { filterOverflow } from '../core/filter-overflow';
import { computeLayout, computeChannelBudgets, deriveStretchCaps, resolveBaseSize, resolveFacetColumnsOption } from '../core/compute-layout';
import { decideColorMaps } from '../core/color-decisions';
import { hcApplyLayoutToSpec, hcApplyTooltips } from './instantiate-spec';
import { normalizeStaticSeries } from '../core/static-series';
import { normalizeChartProperties } from '../core/normalize-properties';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function applyFieldDisplayNames(option: any, names: Record<string, string> | undefined): void {
    if (!names) return;
    const displayName = (value: unknown) => typeof value === 'string' ? names[value] ?? value : value;
    for (const axisKey of ['xAxis', 'yAxis']) {
        const axes = Array.isArray(option[axisKey]) ? option[axisKey] : [option[axisKey]];
        for (const axis of axes) {
            if (axis?.title?.text) axis.title.text = displayName(axis.title.text);
        }
    }
    for (const series of option.series ?? []) {
        if (series?.name) series.name = displayName(series.name);
    }
    if (option.title?.text) option.title.text = displayName(option.title.text);
}

/**
 * Assemble a Highcharts options object.
 *
 * ```ts
 * const option = assembleHighcharts({
 *   data: { values: myRows },
 *   semantic_types: { weight: 'Quantity' },
 *   chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
 *   options: { addTooltips: true },
 * });
 * ```
 *
 * @returns A Highcharts options object with optional `_warnings` and `_width`/`_height` hints
 */
export function assembleHighcharts(input: ChartAssemblyInput): any {
    const chartType = input.chart_spec.chartType;
    const semanticTypes = input.semantic_types ?? {};
    const sizeCeiling = input.chart_spec.canvasSize;
    const baseSize = resolveBaseSize(input.chart_spec.baseSize, sizeCeiling);
    const canvasSize = baseSize;
    const options = input.options ?? {};
    let chartTemplate = hcGetTemplateDef(chartType) as ChartTemplateDef;
    if (!chartTemplate) {
        throw new Error(`Unknown Highcharts chart type: ${chartType}. Use hcAllTemplateDefs to see available types.`);
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
        input.chart_spec.encodings, rawData, semanticTypes, chartType,
    );
    let data = normalized.data;
    const staticSeries = normalized.staticSeries;

    const prelimConvertedData = convertTemporalData(data, semanticTypes);
    const prelimSemantics = resolveChannelSemantics(
        normalized.encodings, data, semanticTypes, prelimConvertedData,
    );
    const typedRawEncodings: Record<string, ChartEncoding> = {};
    for (const [ch, enc] of Object.entries(normalized.encodings)) {
        typedRawEncodings[ch] = enc.type
            ? enc
            : { ...enc, type: prelimSemantics[ch]?.type };
    }

    const authoredTemplate = chartTemplate;
    const transformed = applyTransform(chartTemplate, typedRawEncodings, data, chartProperties, hcGetTemplateDef);
    if (transformed.chartType && transformed.chartType !== chartType) {
        const swapped = hcGetTemplateDef(transformed.chartType) as ChartTemplateDef | undefined;
        if (swapped) chartTemplate = swapped;
    }

    const encodings = applyEncodingOverrides(chartTemplate, transformed.encodings, chartProperties);

    data = applyAggregation(encodings, data);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: Resolve Semantics (shared with VL + EC + CJS)
    // ═══════════════════════════════════════════════════════════════════════

    const tplMark = chartTemplate.template?.mark;
    const templateMarkType = typeof tplMark === 'string' ? tplMark : tplMark?.type;

    const convertedData = convertTemporalData(data, semanticTypes);

    const channelSemantics = resolveChannelSemantics(
        encodings, data, semanticTypes, convertedData,
    );

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
        defaultBandSize: 24,
        bandStepFit: 1,
        maxBandSize: 100,
        baseLabelFontSize: 12,
        baseTitleFontSize: 12,
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    Object.assign(effectiveOptions, deriveStretchCaps(baseSize, sizeCeiling, effectiveOptions));
    effectiveOptions.bandStepFitCapacityX = sizeCeiling?.width ?? baseSize.width;
    effectiveOptions.bandStepFitCapacityY = sizeCeiling?.height ?? baseSize.height;
    effectiveOptions.facetColumns = resolveFacetColumnsOption(input.chart_spec.chartProperties);

    const {
        addTooltips: addTooltipsOpt = true,
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
    // PHASE 1: Compute Layout (shared)
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
    // PHASE 2: Instantiate Highcharts Option (HC-specific)
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
    const hasFacet = !!(colField || rowField);
    const hasAxes = chartTemplate.channels.includes('x') || chartTemplate.channels.includes('y');

    let hcOption: any;

    if (hasFacet && hasAxes) {
        // ── Faceted rendering — Highcharts has no native small multiples ──
        // Emit a `_facet` config with a grid of per-panel options (same
        // contract as the Chart.js backend).
        const maxColsPerRow = facetGridResult?.columns ?? 1;

        let colValues: string[];
        if (colField && channelSemantics.column?.type === 'quantitative') {
            const raw = values.map((r: any) => r[colField]).filter((v: any) => v != null && typeof v === 'number' && !isNaN(v));
            colValues = [...new Set(raw)].map(String);
        } else {
            colValues = colField ? [...new Set(values.map((r: any) => String(r[colField])))] : [];
        }

        const wrapColumnOnly = !!colField && !rowField && maxColsPerRow < colValues.length;
        const gridRows: Array<Array<{ colVal: string; rowVal: string }>> = [];

        if (wrapColumnOnly) {
            for (let i = 0; i < colValues.length; i += maxColsPerRow) {
                gridRows.push(
                    colValues.slice(i, i + maxColsPerRow).map((cv) => ({ colVal: cv, rowVal: '' })),
                );
            }
        } else {
            const rowValues = rowField ? [...new Set(values.map((r: any) => String(r[rowField])))] : [''];
            for (const rv of rowValues) {
                gridRows.push(colValues.map((cv) => ({ colVal: cv, rowVal: rv })));
            }
        }

        const panelRows: any[][] = [];
        for (const cells of gridRows) {
            const rowPanels: any[] = [];
            for (const { colVal, rowVal } of cells) {
                const panelData = values.filter((r: any) => {
                    if (colField && String(r[colField]) !== colVal) return false;
                    if (rowField && String(r[rowField]) !== rowVal) return false;
                    return true;
                });

                const panelOption: any = structuredClone(chartTemplate.template);
                const panelContext: InstantiateContext = {
                    ...instantiateContext,
                    table: panelData,
                    layout: layoutResult,
                };
                chartTemplate.instantiate(panelOption, panelContext);
                hcApplyLayoutToSpec(panelOption, panelContext, []);
                if (addTooltipsOpt) hcApplyTooltips(panelOption);
                if (chartTemplate.postProcess) chartTemplate.postProcess(panelOption, panelContext);
                rowPanels.push({
                    colVal,
                    rowVal,
                    option: panelOption,
                });
            }
            panelRows.push(rowPanels);
        }

        hcOption = hcCombineFacetPanels(
            panelRows,
            !!colField,
            !!rowField,
            wrapColumnOnly,
        );
    } else {
        hcOption = structuredClone(chartTemplate.template);
        chartTemplate.instantiate(hcOption, instantiateContext);
        hcApplyLayoutToSpec(hcOption, instantiateContext, warnings);
        if (addTooltipsOpt) hcApplyTooltips(hcOption);
        if (chartTemplate.postProcess) chartTemplate.postProcess(hcOption, instantiateContext);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════

    if (warnings.length > 0) {
        hcOption._warnings = warnings;
    }
    if (overflowResult.viewports.length > 0) {
        hcOption._viewports = overflowResult.viewports;
    }

    hcOption._dataLength = values.length;

    if (transformed.surface) {
        hcOption._transform = transformed.surface;
    }
    const legacyPivot = applyPivot(authoredTemplate, typedRawEncodings, data, chartProperties, hcGetTemplateDef);
    if (legacyPivot.surface) {
        hcOption._pivot = legacyPivot.surface;
    }

    applyFieldDisplayNames(hcOption, input.field_display_names);

    return hcOption;
}

/** Inspect the Highcharts legacy (composed) view transformation surface for an input. */
export function getHighchartsPivot(input: ChartAssemblyInput): PivotSurface | undefined {
    const spec = assembleHighcharts(input);
    return spec && spec._pivot ? (spec._pivot as PivotSurface) : undefined;
}

/** Inspect the Highcharts two-control transform surface for an input. */
export function getHighchartsTransform(input: ChartAssemblyInput): TransformSurface | undefined {
    const spec = assembleHighcharts(input);
    return spec && spec._transform ? (spec._transform as TransformSurface) : undefined;
}

/**
 * Combine per-panel Highcharts options into a `_facet` config (same shape as
 * the Chart.js backend's facet combiner). The site renders the grid of panel
 * options with one Highcharts chart per panel.
 */
function hcCombineFacetPanels(
    panelRows: any[][],
    hasColHeader: boolean,
    hasRowHeader: boolean,
    colHeaderPerRow = false,
): any {
    const rows = panelRows.length;
    const cols = Math.max(1, ...panelRows.map(r => r.length));
    const ref = panelRows[0]?.[0]?.option;
    const panelH = ref?._height || 300;
    const panelW = ref?._width || 400;
    const gap = 16;
    const colHeaderH = hasColHeader ? 22 : 0;
    const rowHeaderW = hasRowHeader ? 28 : 0;

    const headerBands = colHeaderPerRow ? rows : (hasColHeader ? 1 : 0);

    return {
        _facet: true,
        _facetPanels: panelRows,
        _facetRows: rows,
        _facetCols: cols,
        _facetColHeaderPerRow: colHeaderPerRow,
        _width: rowHeaderW + cols * panelW + (cols - 1) * gap,
        _height: headerBands * colHeaderH + rows * panelH + (rows - 1) * gap,
    };
}
