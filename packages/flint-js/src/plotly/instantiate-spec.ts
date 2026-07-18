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
    if (!figure._width) {
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

    figure.layout.width = figure._width;
    figure.layout.height = figure._height;
    figure.layout.margin = figure.layout.margin ?? { t: 24 };

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
