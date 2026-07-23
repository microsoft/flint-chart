// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * PHASE 2: INSTANTIATE SPEC — Plotly backend
 * =============================================================================
 *
 * Translates semantic decisions (Phase 0) and layout dimensions (Phase 1)
 * into Plotly-specific figure properties.
 *
 * Key differences from the other backends:
 *   - PL figures are `{ data: traces[], layout }` and stay pure JSON — axis
 *     tick formatting uses declarative `tickformat`/axis types, never
 *     callback functions
 *   - PL sizing via `layout.width` / `layout.height`
 *   - PL label rotation via `layout.xaxis.tickangle`
 *
 * PL dependency: **Yes — this is where Plotly-specific syntax lives**
 * =============================================================================
 */

import type {
    InstantiateContext,
    ChartWarning,
} from '../core/types';

const AXIS_TITLE_STANDOFF = 16;
// Plotly places tick labels ~1px from the axis by default — much tighter than
// the other renderers (ECharts axisLabel.margin 8, Vega-Lite labelPadding+tick
// ~7). Nudge them out to a comparable, comfortable gap. `ticklabelstandoff` is
// the purpose-built property (Plotly ≥ 2.34 / 3.x); harmlessly ignored on older
// builds, which keeps the current behavior rather than regressing.
const TICK_LABEL_STANDOFF = 7;

function reserveCartesianMargins(figure: any, context: InstantiateContext): void {
    const { layout } = context;
    const hasXAxis = !!figure.layout.xaxis;
    const hasYAxis = !!figure.layout.yaxis;
    if (!hasXAxis && !hasYAxis) return;

    const xCategories = figure.layout.xaxis?.categoryarray;
    const xFontSize = layout.xLabel?.fontSize ?? 10;
    const maxXLabelWidth = Array.isArray(xCategories)
        ? Math.min(layout.xLabel?.labelLimit ?? 100, Math.max(0, ...xCategories.map((value: unknown) => String(value).length * xFontSize * 0.6)))
        : 0;
    const xBandWidth = Array.isArray(xCategories) && xCategories.length > 0
        ? layout.subplotWidth / xCategories.length
        : Number.POSITIVE_INFINITY;
    if (figure.layout.xaxis && Array.isArray(xCategories) && xCategories.length <= 6) {
        figure.layout.xaxis.tickangle = 0;
        const desiredPlotWidth = xCategories.length * Math.max(48, maxXLabelWidth + 16);
        figure._width += Math.max(0, desiredPlotWidth - layout.subplotWidth);
    } else if (figure.layout.xaxis && figure.layout.xaxis.tickangle == null && maxXLabelWidth > xBandWidth) {
        figure.layout.xaxis.tickangle = 45;
    }
    const xAngle = Math.abs(figure.layout.xaxis?.tickangle ?? layout.xLabel?.labelAngle ?? 0) * Math.PI / 180;
    const rotatedXDepth = Math.ceil(maxXLabelWidth * Math.sin(xAngle));
    const bottom = hasXAxis ? Math.max(xAngle > 0 ? 96 : 56, 40 + rotatedXDepth) : 24;

    const yCategories = figure.layout.yaxis?.categoryarray;
    const yFontSize = layout.yLabel?.fontSize ?? 10;
    const maxYLabelWidth = Array.isArray(yCategories)
        ? Math.min(layout.yLabel?.labelLimit ?? 100, Math.max(0, ...yCategories.map((value: unknown) => String(value).length * yFontSize * 0.6)))
        : 28;
    const left = hasYAxis ? Math.max(64, 36 + maxYLabelWidth) : 24;
    const hasColorbar = (figure.data ?? []).some((trace: any) => trace.colorbar || trace.marker?.colorbar);
    const right = hasColorbar ? 96 : 32;

    figure.layout.margin = { t: 24, r: right, b: bottom, l: left };
}

export function plApplyCartesianAxisSpacing(figure: any): void {
    for (const [key, axis] of Object.entries(figure.layout ?? {})) {
        if (!/^[xy]axis\d*$/.test(key) || !axis || typeof axis !== 'object') continue;
        const cartesianAxis = axis as any;
        cartesianAxis.automargin = true;
        if (cartesianAxis.ticklabelstandoff == null) {
            cartesianAxis.ticklabelstandoff = TICK_LABEL_STANDOFF;
        }
        if (cartesianAxis.title?.text) {
            cartesianAxis.title = { ...cartesianAxis.title, standoff: AXIS_TITLE_STANDOFF };
        }
    }
}

/**
 * Phase 2: Apply layout and semantic decisions to the Plotly figure.
 *
 * Handles common Plotly plumbing across all templates:
 *   - Figure sizing (_width, _height + layout.width/height)
 *   - Axis label rotation and font sizing
 *   - Overflow truncation warnings
 */
export function plApplyLayoutToSpec(
    figure: any,
    context: InstantiateContext,
    warnings: ChartWarning[],
): void {
    const { layout, canvasSize } = context;

    if (!figure.layout) figure.layout = {};

    // ── Figure dimensions ────────────────────────────────────────────────
    let usedDefaultDimensions = false;
    if (!figure._width) {
        usedDefaultDimensions = true;
        const PADDING = 80; // approximate space for axes, labels

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

        const legendGutter = figure.layout.showlegend ? 96 : 0;
        figure._width = plotWidth + PADDING + legendGutter;
        figure._height = plotHeight + PADDING;
    }

    // ── X-axis label rotation and font sizing ────────────────────────────
    if (layout.xLabel) {
        if (!figure.layout.xaxis) figure.layout.xaxis = {};
        if (layout.xLabel.labelAngle && layout.xLabel.labelAngle !== 0) {
            figure.layout.xaxis.tickangle = Math.abs(layout.xLabel.labelAngle);
        }
        if (layout.xLabel.fontSize) {
            figure.layout.xaxis.tickfont = {
                ...(figure.layout.xaxis.tickfont || {}),
                size: layout.xLabel.fontSize,
            };
        }
    }

    // ── Y-axis label font sizing ─────────────────────────────────────────
    if (layout.yLabel?.fontSize) {
        if (!figure.layout.yaxis) figure.layout.yaxis = {};
        figure.layout.yaxis.tickfont = {
            ...(figure.layout.yaxis.tickfont || {}),
            size: layout.yLabel.fontSize,
        };
    }

    // ── Axis title + legend fonts — canvas-adaptive header sizes ─────────
    for (const key of Object.keys(figure.layout)) {
        if (!/^[xy]axis\d*$/.test(key)) continue;
        const axis = figure.layout[key];
        if (axis?.title) {
            axis.title = typeof axis.title === 'string' ? { text: axis.title } : axis.title;
            axis.title.font = { ...(axis.title.font || {}), size: layout.titleFontSize };
        }
    }
    if (figure.layout.legend) {
        figure.layout.legend.font = {
            ...(figure.layout.legend.font || {}),
            size: layout.legendFontSize,
        };
    }

    if (figure.layout.margin == null) {
        reserveCartesianMargins(figure, context);
        if (usedDefaultDimensions) {
            const margin = figure.layout.margin;
            figure._width += Math.max(0, margin.l + margin.r - 80);
            figure._height += Math.max(0, margin.t + margin.b - 80);
        }
    }
    plApplyCartesianAxisSpacing(figure);
    figure.layout.width = figure._width;
    figure.layout.height = figure._height;

    // ── Overflow truncation warnings ─────────────────────────────────────
    if (layout.truncations && layout.truncations.length > 0) {
        for (const trunc of layout.truncations) {
            warnings.push({
                severity: 'warning',
                code: 'overflow',
                message: trunc.message,
                channel: trunc.channel,
                field: trunc.field,
            });
        }
    }
}

/**
 * Apply tooltips to a Plotly figure. Plotly hover is on by default; this
 * pins an explicit unified hover mode so tooltips read across series.
 */
export function plApplyTooltips(figure: any): void {
    if (!figure.layout) figure.layout = {};
    if (figure.layout.hovermode == null) {
        figure.layout.hovermode = 'closest';
    }
}
