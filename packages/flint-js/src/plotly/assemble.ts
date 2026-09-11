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
import { applyPivot, applyTransform, type PivotSurface, type TransformSurface } from '../core/pivot';
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
import { groundTheme, resolveChartDefaults, resolveCompileDefaults } from '../core/theme/ground';
import { resolveThemeSpec } from '../core/theme/presets';
import {
    realizeThemePlotly, realizeValueLabelsPlotly, plCollectMarkTypes, plCollectPositional, fitPlotlyTitle,
} from './theme';

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
function applyFieldDisplayNames(figure: any, names: Record<string, string> | undefined): void {
    if (!names) return;
    const displayName = (value: unknown) => typeof value === 'string' ? names[value] ?? value : value;
    for (const [key, axis] of Object.entries(figure.layout ?? {}) as Array<[string, any]>) {
        if (/^[xy]axis\d*$/.test(key) && axis?.title?.text) {
            axis.title.text = displayName(axis.title.text);
        }
    }
    if (figure.layout?.legend?.title?.text) {
        figure.layout.legend.title.text = displayName(figure.layout.legend.title.text);
    }
    for (const trace of figure.data ?? []) {
        if (trace?.name) trace.name = displayName(trace.name);
        if (trace?.marker?.colorbar?.title?.text) {
            trace.marker.colorbar.title.text = displayName(trace.marker.colorbar.title.text);
        }
        if (trace?.colorbar?.title?.text) {
            trace.colorbar.title.text = displayName(trace.colorbar.title.text);
        }
    }
}

export function assemblePlotly(input: ChartAssemblyInput): any {
    const chartType = input.chart_spec.chartType;
    const semanticTypes = input.semantic_types ?? {};
    // `theme_spec` may name a house Flint ships rather than spell one out.
    const themeSpec = resolveThemeSpec(input.theme_spec);
    // A house may prefer a size, a stretch budget, a facet gap. Those settle
    // before anything is measured, and in a fixed order: the chart spec first,
    // the theme's presets under it, flint's own defaults under that.
    const themePresets = resolveCompileDefaults(themeSpec, input.options);
    const housePresets = themeSpec?.compileDefaults;
    const sizeCeiling = input.chart_spec.canvasSize ?? housePresets?.canvasSize;
    const baseSize = resolveBaseSize(input.chart_spec.baseSize ?? housePresets?.baseSize, sizeCeiling);
    const canvasSize = baseSize;
    const options = themePresets.options ?? {};
    let chartTemplate = plGetTemplateDef(chartType) as ChartTemplateDef;
    if (!chartTemplate) {
        throw new Error(`Unknown Plotly chart type: ${chartType}. Use plAllTemplateDefs to see available types.`);
    }

    const warnings: ChartWarning[] = [];

    const normalizedProps = normalizeChartProperties(
        chartTemplate.properties, input.chart_spec.chartProperties,
    );
    let chartProperties = normalizedProps.chartProperties;
    warnings.push(...normalizedProps.warnings);

    // A house's rules about the chart itself — points on a line, a bump chart
    // left unsmoothed — change what is drawn, not how it is dressed, so they
    // are folded in before the pipeline reads the properties. Anything the
    // caller stated already is left alone. Mirrors the VL assembler.
    if (themeSpec && !chartProperties) chartProperties = {};
    const chartDefaultsReport = chartProperties
        ? resolveChartDefaults(
            themeSpec, chartType, chartTemplate.properties,
            input.chart_spec.chartProperties, chartProperties,
        )
        : [];

    // ═══════════════════════════════════════════════════════════════════════
    // PRE-PHASE: Static Series Normalization
    // ═══════════════════════════════════════════════════════════════════════
    const rawData = input.data.values ?? [];
    const normalized = normalizeStaticSeries(
        input.chart_spec.encodings, rawData, semanticTypes, chartType,
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

    // Transform (derived Category-B operator): same two-control model as VL —
    // chartProperties.chartType (θ) + chartProperties.arrange (τ/σ/γ). Legacy
    // composed `pivot` ids are migrated inside applyTransform. See
    // design-docs/chart-transform-two-axes.md.
    const authoredTemplate = chartTemplate;
    const transformed = applyTransform(chartTemplate, typedRawEncodings, data, chartProperties, plGetTemplateDef);
    if (transformed.chartType && transformed.chartType !== chartType) {
        const swapped = plGetTemplateDef(transformed.chartType) as ChartTemplateDef | undefined;
        if (swapped) chartTemplate = swapped;
    }
    const encodings = applyEncodingOverrides(chartTemplate, transformed.encodings, chartProperties);

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
        // Plotly categories natively fill the available plot area.
        bandStepFit: 1,
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
    const houseBandStep = themeSpec?.layout?.bandStep;
    const houseBandStepFit = themeSpec?.layout?.bandStepFit;
    if (houseBandStep != null && options.defaultBandSize == null) {
        effectiveOptions.defaultBandSize = houseBandStep;
    }
    if (houseBandStepFit != null && options.bandStepFit == null) {
        effectiveOptions.bandStepFit = Math.max(0, Math.min(1, houseBandStepFit));
    }

    Object.assign(effectiveOptions, deriveStretchCaps(baseSize, sizeCeiling, effectiveOptions));
    effectiveOptions.bandStepFitCapacityX = sizeCeiling?.width ?? baseSize.width;
    effectiveOptions.bandStepFitCapacityY = sizeCeiling?.height ?? baseSize.height;
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
            showLegend: !!(
                channelSemantics.color?.field
                || channelSemantics.group?.field
                || channelSemantics.shape?.field
                || channelSemantics.strokeDash?.field
            ),
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
    // HEADLINE
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Written before theming, because whether the chart has a headline is a
    // fact the theme reasons about: a house that omits axis titles is leaning
    // on this line to name the measure. The deck rides along on `_deck` —
    // Plotly 2.x has no `title.subtitle`, so realization writes it as a second
    // styled line rather than as a block of its own.
    const headline = input.chart_spec.title?.trim();
    const deck = input.chart_spec.subtitle?.trim();
    if (headline || deck) {
        figure.layout.title = {
            ...(typeof figure.layout.title === 'object' ? figure.layout.title : {}),
            text: headline ?? '',
            ...(deck ? { _deck: deck } : {}),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // THEME (level 2 grounding → level 3 realization)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Runs last: the theme is a style layer over a chart that already fits, so
    // it must see the finished figure. Grounding runs whether or not a house
    // was named — some design questions (can this chart carry its values, and
    // at this density should it?) are Flint's own. Only realization is gated.
    const markTypes = plCollectMarkTypes(figure);
    const stackedMode = figure.layout?.barmode === 'relative' || figure.layout?.barmode === 'stack'
        || (figure.data ?? []).some((t: any) => t?.stackgroup != null);
    const design = groundTheme(themeSpec ?? {}, {
        chartType,
        markChannel: chartTemplate.markCognitiveChannel,
        markTypes,
        namesOnMarks: (chartProperties as any)?.showSeriesInLabel === true,
        channelSemantics,
        resolvedTypes: declaration.resolvedTypes as Record<string, string> | undefined,
        axisFlags: declaration.axisFlags,
        positional: plCollectPositional(figure, channelSemantics),
        layout: layoutResult,
        table: values,
        canvasSize,
        stacked: stackedMode,
        partToWhole: markTypes.includes('arc'),
        titled: Boolean(figure.layout?.title?.text),
        headline: [figure.layout?.title?.text, (input.chart_spec as any)?.subtitle]
            .filter((t: unknown) => typeof t === 'string')
            .join(' '),
        hostSurface: (input.options as any)?.background,
        valueLabels: resolvePlValueLabelChoice(chartProperties),
    });

    if (themeSpec) {
        // These are semantic inputs to realization, not persistent Plotly
        // properties. Sparklines never carry dots; theme-default line points
        // may be suppressed when their spacing becomes unreadably dense.
        figure._suppressLinePoints = chartTemplate.chart === 'Sparkline'
            || input.chart_spec.chartProperties?.showPoints === false;
        figure._themeDefaultLinePoints = chartTemplate.chart === 'Line Chart'
            && input.chart_spec.chartProperties?.showPoints == null
            && chartProperties?.showPoints === true;
        const realizeReport = realizeThemePlotly(figure, design, values);
        delete figure._suppressLinePoints;
        delete figure._themeDefaultLinePoints;
        figure._theme = {
            id: design.themeId,
            report: [...themePresets.report, ...chartDefaultsReport, ...design.report, ...realizeReport],
            decisions: design,
        };
    } else {
        realizeValueLabelsPlotly(figure, design, values);
        fitPlotlyTitle(figure);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════

    // `_width`/`_height` are the size hint a host sizes its container with,
    // and `layout.width`/`height` is what Plotly actually draws at. Title
    // wrapping, a tall legend and the theme's chrome all grow the layout after
    // the hint was written, so re-read the hint off the layout — otherwise a
    // host clips the bottom or right off its own chart.
    if (Number.isFinite(figure.layout?.width)) {
        figure.layout.width = Math.ceil(figure.layout.width);
        figure._width = figure.layout.width;
    }
    if (Number.isFinite(figure.layout?.height)) {
        figure.layout.height = Math.ceil(figure.layout.height);
        figure._height = figure.layout.height;
    }

    if (warnings.length > 0) {
        figure._warnings = warnings;
    }
    if (overflowResult.viewports.length > 0) {
        figure._viewports = overflowResult.viewports;
    }

    figure._dataLength = values.length;

    if (transformed.surface) {
        figure._transform = transformed.surface;
    }
    // Legacy single-control surface for getPlotlyPivot — enumerated from the
    // authored template so ids/labels match the pre-split contract.
    const legacyPivot = applyPivot(authoredTemplate, typedRawEncodings, data, chartProperties, plGetTemplateDef);
    if (legacyPivot.surface) {
        figure._pivot = legacyPivot.surface;
    }

    applyFieldDisplayNames(figure, input.field_display_names);

    return figure;
}

/** Inspect the Plotly legacy (composed) view transformation surface for an input. */export function getPlotlyPivot(input: ChartAssemblyInput): PivotSurface | undefined {
    const spec = assemblePlotly(input);
    return spec && spec._pivot ? (spec._pivot as PivotSurface) : undefined;
}

/** Inspect the Plotly two-control transform surface for an input. */
export function getPlotlyTransform(input: ChartAssemblyInput): TransformSurface | undefined {
    const spec = assemblePlotly(input);
    return spec && spec._transform ? (spec._transform as TransformSurface) : undefined;
}

/**
 * The reader's own answer to "print the numbers?".
 *
 * `showValueLabels` is the control; `showTextLabels` is the older boolean some
 * templates still pass, where only `true` is meaningful (`false` means the
 * caller never touched it). Mirrors the Vega-Lite assembler.
 */
function resolvePlValueLabelChoice(
    chartProperties: Record<string, any> | undefined,
): 'on' | 'off' | undefined {
    const choice = chartProperties?.showValueLabels;
    if (typeof choice === 'boolean') return choice ? 'on' : 'off';
    return chartProperties?.showTextLabels === true ? 'on' : undefined;
}
