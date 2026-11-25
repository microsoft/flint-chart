// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * PHASE 2: INSTANTIATE SPEC — Highcharts backend
 * =============================================================================
 *
 * Translates semantic decisions (Phase 0) and layout dimensions (Phase 1)
 * into Highcharts-specific option properties.
 *
 * Key differences from Vega-Lite/ECharts instantiation:
 *   - VL uses declarative encoding width: {step: N} — HC uses the chart
 *     container size (width/height on _width/_height + chart.width/height).
 *   - VL color schemes are strings — HC uses a top-level `colors` array.
 *   - VL handles zero-baseline via scale.zero — HC uses axis min: 0.
 *   - VL temporal formatting uses timeUnit — HC datetime axes auto-format.
 *   - VL label rotation is axis.labelAngle — HC uses xAxis.labels.rotation.
 *   - HC faceting has no native small multiples — the assembler emits a
 *     `_facet` config of per-panel options (see assemble.ts).
 *
 * HC dependency: **Yes — this is where Highcharts-specific syntax lives**
 * =============================================================================
 */

import type {
    InstantiateContext,
    ChartWarning,
} from '../core/types';
import { computePaddedDomain } from '../core/semantic-types';
import { ColorDecisionResult } from '../core/color-decisions';
import { pickHighchartsPalette } from './colormap';
import { DEFAULT_COLORS } from './templates/utils';

/**
 * Phase 2: Apply layout and semantic decisions to the Highcharts options object.
 *
 * Handles common Highcharts plumbing across all templates:
 *   - Canvas sizing (_width/_height + chart.width/height)
 *   - Zero-baseline on value axes
 *   - Axis titles, labels, fonts
 *   - Legend placement
 *   - Palette application (top-level `colors`)
 *   - Title/subtitle
 */
export function hcApplyLayoutToSpec(
    option: any,
    context: InstantiateContext,
    _warnings: ChartWarning[],
): void {
    const { channelSemantics, layout, canvasSize } = context;

    // ── Canvas dimensions ────────────────────────────────────────────────
    // ── Canvas dimensions ────────────────────────────────────────────────
    // Highcharts sizes to the chart container; the site renderer uses a
    // wrapper div at the designed size.
    const hasAxes = !!(option.xAxis || option.yAxis) && option.chart?.type !== 'pie' && option.chart?.type !== 'sunburst';
    if (!option._width) {
        if (hasAxes) {
            const PADDING = 80;
            const xIsDiscrete = layout.xNominalCount > 0 || layout.xContinuousAsDiscrete > 0;
            const yIsDiscrete = layout.yNominalCount > 0 || layout.yContinuousAsDiscrete > 0;

            let plotWidth: number;
            let plotHeight: number;

            if (xIsDiscrete && layout.xStepUnit !== 'group') {
                const xItemCount = layout.xNominalCount || layout.xContinuousAsDiscrete || 0;
                plotWidth = xItemCount > 0 ? layout.xStep * xItemCount : (layout.subplotWidth || canvasSize.width);
            } else {
                plotWidth = layout.subplotWidth || canvasSize.width;
            }

            if (yIsDiscrete && layout.yStepUnit !== 'group') {
                const yItemCount = layout.yNominalCount || layout.yContinuousAsDiscrete || 0;
                plotHeight = yItemCount > 0 ? layout.yStep * yItemCount : (layout.subplotHeight || canvasSize.height);
            } else {
                plotHeight = layout.subplotHeight || canvasSize.height;
            }

            const legendGutter = option.legend && option.legend.enabled !== false ? 96 : 0;
            option._width = plotWidth + PADDING + legendGutter;
            option._height = plotHeight + PADDING;
        } else {
            option._width = layout.subplotWidth || canvasSize.width;
            option._height = layout.subplotHeight || canvasSize.height;
        }
        option.chart = option.chart || {};
        option.chart.width = option._width;
        option.chart.height = option._height;
    }

    // ── Zero-baseline and domain padding (value axes) ───────────────────────
    const isInverted = option.chart?.type === 'bar' || option.chart?.inverted === true;
    for (const hcAxis of ['x', 'y'] as const) {
        const axisObj = option[`${hcAxis}Axis`];
        if (!axisObj) continue;
        const flintChannel = isInverted ? (hcAxis === 'x' ? 'y' : 'x') : hcAxis;
        const cs = channelSemantics[flintChannel];
        if (!cs?.zero) continue;
        const decision = cs.zero;
        // Highcharts category axes handle zero via the numeric y/x axis; only
        // pin soft zero bounds when the zero decision says to include zero and the axis
        // is numeric (not category/datetime).
        const isCategoryAxis = axisObj.type === 'category' || Array.isArray(axisObj.categories) || cs.type === 'nominal' || cs.type === 'ordinal';
        if (isCategoryAxis) continue;
        const isNumericAxis = !axisObj.type || axisObj.type === 'linear' || axisObj.type === 'value' || axisObj.type === 'datetime' || axisObj.type === 'logarithmic';
        if (!isNumericAxis) continue;
        if (decision.zero) {
            if (axisObj.softMin === undefined && axisObj.min === undefined) axisObj.softMin = 0;
            if (axisObj.softMax === undefined && axisObj.max === undefined) axisObj.softMax = 0;
        }
        if (!decision.zero && decision.domainPadFraction > 0 && cs.field) {
            const numericValues = context.table
                .map((r: any) => r[cs.field])
                .filter((v: any) => v != null && typeof v === 'number' && !isNaN(v));
            const padded = computePaddedDomain(numericValues, decision.domainPadFraction);
            if (padded) {
                if (axisObj.min === undefined) axisObj.min = padded[0];
                if (axisObj.max === undefined) axisObj.max = padded[1];
            }
        }
    }

    // ── Axis titles ─────────────────────────────────────────────────────────
    if (option.xAxis && option.xAxis.title?.text) {
        option.xAxis.title.style = { fontSize: layout.titleFontSize, ...(option.xAxis.title.style || {}) };
    }
    if (option.yAxis && option.yAxis.title?.text) {
        option.yAxis.title.style = { fontSize: layout.titleFontSize, ...(option.yAxis.title.style || {}) };
    }

    // ── Legend ──────────────────────────────────────────────────────────────
    const hasLegend = option.legend && option.legend.enabled !== false;
    if (hasLegend) {
        option.legend = {
            ...option.legend,
            itemStyle: {
                fontSize: layout.legendFontSize,
                ...(option.legend.itemStyle || {}),
            },
        };
    }

    // ── Title / subtitle ────────────────────────────────────────────────────
    const titleText = context.chartProperties?.title;
    if (titleText != null && titleText !== '') {
        option.title = { text: String(titleText) };
    } else {
        option.title = { text: null };
    }
    const subtitleText = context.chartProperties?.subtitle;
    if (subtitleText != null && subtitleText !== '') {
        option.subtitle = { text: String(subtitleText) };
    }

    // ── Color scheme ────────────────────────────────────────────────────────
    // Highcharts consumes a top-level `colors` array; the first series/series
    // group without an explicit color takes colors[i].
    const decisions: ColorDecisionResult | undefined = context.colorDecisions;
    const colorDecision = decisions ? (decisions.color ?? decisions.group) : undefined;
    let effectivePalette: string[] | undefined;
    if (decisions && colorDecision) {
        effectivePalette = pickHighchartsPalette(colorDecision);
    } else {
        const colorPalette = context.resolvedEncodings?.color?.colorPalette
            ?? context.resolvedEncodings?.group?.colorPalette;
        if (colorPalette?.length) {
            effectivePalette = colorPalette;
        }
    }
    if (!effectivePalette || effectivePalette.length === 0) {
        const cat10 = pickHighchartsPalette({ schemeType: 'categorical' } as any);
        effectivePalette = cat10?.length ? cat10 : DEFAULT_COLORS;
    }
    if (effectivePalette && effectivePalette.length > 0) {
        option.colors = [...effectivePalette];
        if (option.colorAxis) {
            if (effectivePalette.length >= 2) {
                option.colorAxis.minColor = effectivePalette[0];
                option.colorAxis.maxColor = effectivePalette[effectivePalette.length - 1];
                option.colorAxis.stops = effectivePalette.map((c, i) => [i / (effectivePalette!.length - 1), c]);
            }
        }
    }

    // ── Credits (keep output clean; hosts can re-enable) ────────────────────
    if (!option.credits) {
        option.credits = { enabled: false };
    }

    // ── Accessibility ───────────────────────────────────────────────────────
    // The core Highcharts package warns when the optional accessibility module
    // is not loaded. Flint emits core-only specs, so disable it explicitly to
    // keep the console clean; hosts that bundle the module can re-enable.
    if (!option.accessibility) {
        option.accessibility = { enabled: false };
    }

    // ── Bar sizing ──────────────────────────────────────────────────────────
    // Highcharts auto-sizes columns within the plot area; padding between
    // categories comes from plotOptions.column.pointPadding.
    if (option.series && Array.isArray(option.series)) {
        const barSeries = option.series.filter((s: any) => {
            const t = s?.type ?? option.chart?.type;
            return t === 'column' || t === 'bar';
        });
        if (barSeries.length > 0) {
            const catAxis = option.xAxis?.categories ? 'x' : option.yAxis?.categories ? 'y' : null;
            const step = catAxis === 'x' ? layout.xStep : catAxis === 'y' ? layout.yStep : 0;
            if (step > 0 && layout.stepPadding > 0) {
                const pointPadding = +(layout.stepPadding / 2).toFixed(3);
                for (const s of barSeries) {
                    if (!s.pointPadding && s.pointPadding !== 0) {
                        s.pointPadding = pointPadding;
                    }
                }
                if (option.plotOptions) {
                    if (option.plotOptions.column && option.plotOptions.column.pointPadding == null) {
                        option.plotOptions.column.pointPadding = pointPadding;
                    }
                    if (option.plotOptions.bar && option.plotOptions.bar.pointPadding == null) {
                        option.plotOptions.bar.pointPadding = pointPadding;
                    }
                }
            }
        }
    }
}

/**
 * Apply the encoding-aware tooltip. Highcharts default tooltips already show
 * series name + point value; this adds a shared crosshair for multi-series
 * category charts when the encoding calls for it.
 */
export function hcApplyTooltips(option: any): void {
    if (option.tooltip) return;
    const seriesCount = Array.isArray(option.series) ? option.series.length : 0;
    option.tooltip = seriesCount > 1
        ? { shared: true, crosshairs: true }
        : { shared: false };
}
