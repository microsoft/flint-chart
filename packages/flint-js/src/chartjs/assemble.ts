// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js chart assembly — Two-Stage Pipeline Coordinator.
 *
 * Reuses the **same core analysis pipeline** as Vega-Lite and ECharts:
 *   Phase 0:  resolveChannelSemantics  → ChannelSemantics
 *   Step 0a:  declareLayoutMode    → LayoutDeclaration
 *   Step 0b:  convertTemporalData  → converted data
 *   Step 0c:  filterOverflow       → filtered data, nominalCounts
 *   Phase 1:  computeLayout        → LayoutResult
 *
 * Then diverges for Phase 2 (Chart.js-specific):
 *   template.instantiate → builds Chart.js config structure
 *   cjsApplyLayoutToSpec → applies layout decisions to config
 *
 * Key structural differences from ECharts / VL output:
 *   VL: { mark, encoding, data: {values}, width, height }
 *   EC: { xAxis, yAxis, series: [{type, data}], tooltip, legend, grid }
 *   CJS: { type, data: { labels, datasets[] }, options: { scales, plugins } }
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
import { applyPivot, PivotSurface } from '../core/pivot';
import { cjsGetTemplateDef } from './templates';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { computeZeroDecision } from '../core/semantic-types';
import { filterOverflow } from '../core/filter-overflow';
import { computeLayout, computeChannelBudgets, deriveStretchCaps, resolveBaseSize, resolveFacetColumnsOption } from '../core/compute-layout';
import { decideColorMaps } from '../core/color-decisions';
import { cjsApplyLayoutToSpec, cjsApplyTooltips } from './instantiate-spec';
import { normalizeStaticSeries } from '../core/static-series';
import { normalizeChartProperties } from '../core/normalize-properties';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Assemble a Chart.js config object.
 *
 * ```ts
 * const config = assembleChartjs({
 *   data: { values: myRows },
 *   semantic_types: { weight: 'Quantity' },
 *   chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
 *   options: { addTooltips: true },
 * });
 * ```
 *
 * @returns A Chart.js config object with optional `_warnings` and `_width`/`_height` hints
 */
export function assembleChartjs(input: ChartAssemblyInput): any {
    const chartType = input.chart_spec.chartType;
    const semanticTypes = input.semantic_types ?? {};
    // Internal layout targets the base (target) size; the optional canvasSize
    // ceiling is applied as per-dimension stretch caps once options resolve.
    // The base is clamped to the ceiling so a smaller canvasSize shrinks the
    // chart to fit rather than overflowing it.
    const sizeCeiling = input.chart_spec.canvasSize;
    const baseSize = resolveBaseSize(input.chart_spec.baseSize, sizeCeiling);
    const canvasSize = baseSize;
    const options = input.options ?? {};
    let chartTemplate = cjsGetTemplateDef(chartType) as ChartTemplateDef;
    if (!chartTemplate) {
        throw new Error(`Unknown Chart.js chart type: ${chartType}. Use cjsAllTemplateDefs to see available types.`);
    }

    const warnings: ChartWarning[] = [];

    // Validate discrete property values against the template's options before
    // they reach `instantiate` (map known labels → values, drop unknowns).
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

    const pivoted = applyPivot(chartTemplate, typedRawEncodings, data, chartProperties, cjsGetTemplateDef);
    if (pivoted.chartType && pivoted.chartType !== chartType) {
        const swapped = cjsGetTemplateDef(pivoted.chartType) as ChartTemplateDef | undefined;
        if (swapped) chartTemplate = swapped;
    }

    // Compose Category-B encoding-action overrides (stored by the host in
    // chartProperties, keyed by action key) onto the post-pivot encodings before
    // any pipeline phase runs. Flint owns the transform; the host only stores
    // the override value. See applyEncodingOverrides / EncodingActionDef.
    const encodings = applyEncodingOverrides(chartTemplate, pivoted.encodings, chartProperties);

    // Optional aggregation transform — see vegalite/assemble for rationale.
    data = applyAggregation(encodings, data);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: Resolve Semantics (shared with VL + EC — completely target-agnostic)
    // ═══════════════════════════════════════════════════════════════════════

    const tplMark = chartTemplate.template?.mark;
    const templateMarkType = typeof tplMark === 'string' ? tplMark : tplMark?.type;

    // Convert temporal data once — feeds semantic resolution and all downstream stages
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
        // Chart.js fills its canvas natively — a wider default band size
        // matches its generous category spacing behavior.
        defaultBandSize: 30,
        // Chart.js has no default maxBarThickness, so sparse bars fill the
        // canvas. Allow bands to expand past the base to match, capped so a
        // couple of bars don't span the whole canvas.
        maxBandSize: 100,
        // Chart.js native font default (12 for ticks, legend, and title).
        baseLabelFontSize: 12,
        baseTitleFontSize: 12,
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    // Resolve the optional canvasSize ceiling into per-dimension stretch caps
    // (βx, βy). Falls back to maxStretch when no ceiling is set.
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

    // ── Channel budgets (shared, in layout module) ─────────────────────
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
    // PHASE 2: Instantiate Chart.js Config (CJS-specific)
    // ═══════════════════════════════════════════════════════════════════════

    // Build resolved encodings for interface compatibility
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

    // Template instantiate
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

    let cjsConfig: any;
    if (hasFacet && hasAxes) {
        const colValues = colField ? [...new Set(values.map((r: any) => String(r[colField])))] : [''];
        const rowValues = rowField ? [...new Set(values.map((r: any) => String(r[rowField])))] : [''];
        const facetLegend: Array<{ label: string; color: string }> = [];

        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
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
                // Round to "nice" bounds so the shared top/bottom land on round
                // tick values. Otherwise Chart.js draws an extra tick at the
                // exact data extreme (e.g. 517 or 169,877) that overlaps the
                // adjacent round tick — Vega-Lite always uses nice bounds here.
                sharedYDomain = niceBounds(min, max);
            }
        }

        // Only the leftmost column reserves room for the shared y-axis; inner
        // columns drop it and reclaim that width (see estimateYAxisGutter).
        const axisGutter = sharedYDomain ? estimateYAxisGutter(sharedYDomain) : 0;

        // Column wrapping: a column-only facet with more categories than fit in
        // one row wraps into a 2D grid (matching Vega-Lite / ECharts). The wrap
        // width comes from the shared facet-grid budget. computeLayout already
        // sized the panels for this column count, so we only need to restructure
        // the flat column list into rows. (2D col+row facets never wrap.)
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

        const panelRows: any[][] = [];
        for (let ri = 0; ri < gridRows.length; ri++) {
            const rowPanels: any[] = [];
            const cells = gridRows[ri];
            for (let ci = 0; ci < cells.length; ci++) {
                const { colVal, rowVal } = cells[ci];
                const panelData = values.filter((r: any) => {
                    if (colField && String(r[colField]) !== colVal) return false;
                    if (rowField && String(r[rowField]) !== rowVal) return false;
                    return true;
                });

                const panelConfig: any = structuredClone(chartTemplate.template);
                const panelContext: InstantiateContext = {
                    ...instantiateContext,
                    table: panelData,
                    layout: layoutResult,
                };
                chartTemplate.instantiate(panelConfig, panelContext);
                // Keep all facet panels the same plot size: disable per-panel built-in legend.
                // A shared legend is rendered by the gallery host.
                if (!panelConfig.options) panelConfig.options = {};
                if (!panelConfig.options.plugins) panelConfig.options.plugins = {};
                panelConfig.options.plugins.legend = {
                    ...(panelConfig.options.plugins.legend || {}),
                    display: false,
                    position: 'right',
                };
                cjsApplyLayoutToSpec(panelConfig, panelContext, []);
                if (addTooltipsOpt) cjsApplyTooltips(panelConfig);
                if (chartTemplate.postProcess) chartTemplate.postProcess(panelConfig, panelContext);

                // Shared y-axis across a facet row: only the leftmost column
                // draws the y tick labels and axis title. Inner columns hide
                // them entirely (display:false) and shrink their panel width by
                // the reclaimed gutter, so panels pack tightly and the layout
                // scales with the canvas. The renderer pins the leftmost axis
                // width to `axisGutter` so every panel's plot area stays equal
                // and the lines line up across the row.
                if (ci > 0 && panelConfig.options?.scales?.y) {
                    const yScale = panelConfig.options.scales.y;
                    yScale.ticks = { ...(yScale.ticks || {}), display: false };
                    yScale.title = { ...(yScale.title || {}), display: false };
                    yScale.border = { ...(yScale.border || {}), display: false };
                    if (typeof panelConfig._width === 'number') {
                        panelConfig._width = Math.max(40, panelConfig._width - axisGutter);
                    }
                }

                // Consistent x-axis labels across facet columns. Faceted small
                // multiples are narrow, and a continuous/temporal x-axis places
                // its first tick at the panel's left edge. On the leftmost panel
                // the y-axis gutter gives the leading label room, but inner
                // panels (no left gutter) clip it, so Chart.js drops it — leaving
                // each facet with a different set of date labels. `align: 'inner'`
                // pulls the first/last tick labels inside the chart area so they
                // render on every panel, keeping the labels consistent across the
                // row. Detect a continuous x-axis via the template's tick callback.
                const xScale = panelConfig.options?.scales?.x;
                if (xScale && typeof xScale.ticks?.callback === 'function') {
                    xScale.ticks = { ...(xScale.ticks || {}), align: 'inner' };
                }

                if (facetLegend.length === 0 && colorField && Array.isArray(panelConfig.data?.datasets)) {
                    for (const ds of panelConfig.data.datasets) {
                        const label = String(ds?.label ?? '').trim();
                        if (!label) continue;
                        const color = String(ds?.borderColor ?? ds?.backgroundColor ?? '#666');
                        facetLegend.push({ label, color });
                    }
                }

                rowPanels.push({
                    key: `${ri}:${ci}`,
                    rowIndex: ri,
                    colIndex: ci,
                    rowHeader: rowField ? rowVal : undefined,
                    colHeader: colField ? colVal : undefined,
                    config: panelConfig,
                });
            }
            panelRows.push(rowPanels);
        }

        cjsConfig = cjsCombineFacetPanels(
            panelRows,
            !!colField,
            !!rowField,
            sharedYDomain,
            axisGutter,
            wrapColumnOnly,
        );
        cjsConfig._facetLegend = facetLegend;
    } else {
        cjsConfig = structuredClone(chartTemplate.template);
        chartTemplate.instantiate(cjsConfig, instantiateContext);
        cjsApplyLayoutToSpec(cjsConfig, instantiateContext, warnings);
        if (addTooltipsOpt) cjsApplyTooltips(cjsConfig);
        if (chartTemplate.postProcess) chartTemplate.postProcess(cjsConfig, instantiateContext);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════

    if (warnings.length > 0) {
        cjsConfig._warnings = warnings;
    }

    cjsConfig._dataLength = values.length;

    if (pivoted.surface) {
        cjsConfig._pivot = pivoted.surface;
    }

    return cjsConfig;
}

/** Inspect the Chart.js view transformation surface for an input. */
export function getChartjsPivot(input: ChartAssemblyInput): PivotSurface | undefined {
    const spec = assembleChartjs(input);
    return spec && spec._pivot ? (spec._pivot as PivotSurface) : undefined;
}

/**
 * Round a [min, max] interval outward to "nice" round numbers so a shared facet
 * axis lands its endpoints on clean tick values (mirrors Vega-Lite's default
 * `nice: true`). Without this, Chart.js adds a tick at the exact data extreme,
 * which overlaps the neighbouring round tick.
 */
function niceBounds(min: number, max: number, targetTicks = 5): { min: number; max: number } {
    if (!(Number.isFinite(min) && Number.isFinite(max)) || max <= min) {
        return { min, max };
    }
    const niceNum = (range: number, round: boolean): number => {
        const exp = Math.floor(Math.log10(range));
        const frac = range / 10 ** exp;
        let niceFrac: number;
        if (round) {
            niceFrac = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
        } else {
            niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
        }
        return niceFrac * 10 ** exp;
    };
    const step = niceNum(niceNum(max - min, false) / Math.max(1, targetTicks - 1), true);
    return {
        min: Math.floor(min / step) * step,
        max: Math.ceil(max / step) * step,
    };
}

/**
 * Estimate the horizontal space (px) a faceted line/bar y-axis needs for its
 * tick labels plus the rotated axis title. Only the leftmost facet column draws
 * this axis; inner columns reclaim the space, so the figure packs tightly and
 * stays responsive to the canvas size (instead of every panel paying a fixed
 * ~70px gutter).
 */
function estimateYAxisGutter(domain: { min: number; max: number }): number {
    const fmt = (v: number) => {
        const r = Math.round(v);
        return Math.abs(r) >= 1000 ? r.toLocaleString() : String(r);
    };
    const chars = Math.max(fmt(domain.min).length, fmt(domain.max).length);
    // ~6.5px per label char + tick padding (~12) + rotated axis title (~18).
    return Math.ceil(chars * 6.5) + 30;
}

function cjsCombineFacetPanels(
    panelRows: any[][],
    hasColHeader: boolean,
    hasRowHeader: boolean,
    sharedYDomain?: { min: number; max: number },
    axisGutter = 0,
    colHeaderPerRow = false,
): any {
    const rows = panelRows.length;
    const cols = Math.max(1, ...panelRows.map(r => r.length));
    const ref = panelRows[0]?.[0]?.config;
    const panelH = ref?._height || 300;
    const gap = 16;
    const colHeaderH = hasColHeader ? 22 : 0;
    const rowHeaderW = hasRowHeader ? 28 : 0;

    // Column widths vary: the leftmost column keeps the y-axis gutter; the rest
    // are narrower. Sum the first row's actual panel widths for the figure size.
    const colWidths = Array.from({ length: cols }, (_, ci) =>
        (panelRows[0]?.[ci]?.config?._width as number) || ref?._width || 400,
    );
    const totalPanelsW = colWidths.reduce((a, b) => a + b, 0);

    // Wrapped column-only facets repeat the column-header band above every row;
    // otherwise there is a single header band across the top.
    const headerBands = colHeaderPerRow ? rows : (hasColHeader ? 1 : 0);

    return {
        _facet: true,
        _facetPanels: panelRows,
        _facetRows: rows,
        _facetCols: cols,
        _facetSharedYDomain: sharedYDomain,
        _facetAxisGutter: axisGutter,
        _facetColHeaderPerRow: colHeaderPerRow,
        _width: rowHeaderW + totalPanelsW + (cols - 1) * gap,
        _height: headerBands * colHeaderH + rows * panelH + (rows - 1) * gap,
    };
}
