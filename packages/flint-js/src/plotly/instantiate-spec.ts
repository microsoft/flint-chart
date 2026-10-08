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
    LayoutResult,
    ChartWarning,
} from '../core/types';

const AXIS_TITLE_STANDOFF = 16;
// Plotly places tick labels ~1px from the axis by default — much tighter than
// the other renderers (ECharts axisLabel.margin 8, Vega-Lite labelPadding+tick
// ~7). Nudge them out to a comparable, comfortable gap. `ticklabelstandoff` is
// the purpose-built property (Plotly ≥ 2.34 / 3.x); harmlessly ignored on older
// builds, which keeps the current behavior rather than regressing.
const TICK_LABEL_STANDOFF = 7;

/** Average glyph width as a share of the font size, as the layout pass estimates it. */
const GLYPH = 0.62;

/** The plot length a banded axis takes: one step per band, as Vega-Lite's `{ step }` width gives it. */
export function bandedSpan(context: InstantiateContext, channel: 'x' | 'y'): number | undefined {
    const { layout } = context;
    const field = context.channelSemantics[channel]?.field;
    const count = (channel === 'x' ? layout.xStepUnit : layout.yStepUnit) === 'group'
        ? (field ? new Set(context.table.map((row) => String(row[field]))).size : 0)
        : (channel === 'x'
            ? layout.xNominalCount || layout.xContinuousAsDiscrete
            : layout.yNominalCount || layout.yContinuousAsDiscrete) || 0;
    return count > 0 ? (channel === 'x' ? layout.xStep : layout.yStep) * count : undefined;
}

function clipLabel(text: string, limit: number, fontSize: number): string {
    const glyph = fontSize * GLYPH;
    if (!(limit > 0) || text.length * glyph <= limit) return text;
    return `${text.slice(0, Math.max(1, Math.floor(limit / glyph) - 1)).trimEnd()}…`;
}

/**
 * Write the layout's label decision onto every cartesian axis: its font, its angle, and on
 * a banded axis the names wrapped onto their lines and cut at the label limit, as Vega-Lite
 * draws them. Plotly has no label limit, and turns crowded labels on its own unless told.
 */
export function plApplyBandLabels(
    figure: any,
    layout: LayoutResult,
    options: { fit?: boolean; temporal?: (channel: 'x' | 'y') => boolean } = {},
): void {
    for (const [key, ax] of Object.entries<any>(figure.layout ?? {})) {
        const match = /^([xy])axis\d*$/.exec(key);
        if (!match || !ax || typeof ax !== 'object') continue;
        const channel = match[1] as 'x' | 'y';
        const sizing = channel === 'x' ? layout.xLabel : layout.yLabel;
        if (!sizing) continue;
        if (sizing.fontSize) ax.tickfont = { ...(ax.tickfont || {}), size: sizing.fontSize };
        if (options.fit === false) continue;
        // A date cut short no longer names its day.
        const limit = options.temporal?.(channel) ? Infinity : sizing.labelLimit || Infinity;
        const banded = ax.type === 'category' && Array.isArray(ax.categoryarray) && ax.categoryarray.length > 0;
        const fontSize = sizing.fontSize ?? 10;
        let angle = sizing.labelAngle;
        // Names the layout set straight but that overrun their band turn, then stand on end.
        if (match[1] === 'x' && banded && !angle && !sizing.labelLines && layout.xStep > 0) {
            const widest = Math.max(...ax.categoryarray.map((name: unknown) =>
                Math.min(String(name).length * fontSize * GLYPH, limit)));
            if (widest + 4 > layout.xStep) angle = layout.xStep >= fontSize * 1.2 / Math.SQRT1_2 + 2 ? -45 : -90;
        }
        if (match[1] === 'x' && (banded || angle != null)) ax.tickangle = angle ?? 0;
        if (!banded || ax.tickvals != null) continue;
        const lines = new Map((sizing.labelValues ?? []).map((value, index) => [value, sizing.labelLines?.[index]]));
        const names = ax.categoryarray.map(String);
        const text = names.map((name: string) => (lines.get(name) ?? [name])
            .map((line) => clipLabel(line, limit, fontSize)).join('<br>'));
        if (text.every((label: string, index: number) => label === names[index])) continue;
        ax.tickmode = 'array';
        ax.tickvals = ax.categoryarray;
        ax.ticktext = text;
    }
}

/** The widest label line an axis prints, capped at its limit, and how many lines a label takes. */
function labelExtent(ax: any, sizing: LayoutResult['xLabel'] | undefined): { width: number; rows: number } | undefined {
    const texts = Array.isArray(ax?.ticktext) ? ax.ticktext : Array.isArray(ax?.categoryarray) ? ax.categoryarray : undefined;
    if (!texts) return undefined;
    const fontSize = sizing?.fontSize ?? 10;
    const lines = texts.map((text: unknown) => String(text).split('<br>'));
    return {
        width: Math.min(sizing?.labelLimit ?? 100,
            Math.max(0, ...lines.flat().map((line: string) => line.length * fontSize * 0.6))),
        rows: Math.max(1, ...lines.map((parts: string[]) => parts.length)),
    };
}

function reserveCartesianMargins(figure: any, context: InstantiateContext): void {
    const { layout } = context;
    const hasXAxis = !!figure.layout.xaxis;
    const hasYAxis = !!figure.layout.yaxis;
    if (!hasXAxis && !hasYAxis) return;

    const xFontSize = layout.xLabel?.fontSize ?? 10;
    const x = labelExtent(figure.layout.xaxis, layout.xLabel) ?? { width: 0, rows: 1 };
    const xAngle = Math.abs(figure.layout.xaxis?.tickangle ?? 0) * Math.PI / 180;
    const xDepth = xAngle > 0
        ? Math.ceil(x.width * Math.sin(xAngle) + xFontSize * Math.cos(xAngle))
        : (x.rows - 1) * Math.ceil(xFontSize * 1.2);
    const bottom = hasXAxis ? Math.max(xAngle > 0 ? 96 : 56, 40 + xDepth) : 24;

    const left = hasYAxis ? Math.max(64, 36 + (labelExtent(figure.layout.yaxis, layout.yLabel)?.width ?? 28)) : 24;
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
 * Apply the cross-cutting per-axis chart properties (`logScale_x/y`,
 * `includeZero_x/y`) to every cartesian axis of the figure. These are surfaced
 * on many charts by the shared VL option set; implementing them here lets ALL
 * Plotly cartesian charts honor them natively (`axis.type: 'log'`,
 * `axis.rangemode: 'tozero'`). A category axis is skipped (log/zero are
 * meaningless there); a log axis never also forces zero (log 0 is undefined).
 */
export function plApplyAxisProperties(figure: any, context: InstantiateContext): void {
    const cp = context.chartProperties;
    if (!cp || !figure.layout) return;
    const applyAxis = (re: RegExp, logKey: string, zeroKey: string) => {
        const log = cp[logKey];
        const zero = cp[zeroKey];
        if (log == null && zero == null) return;
        for (const [k, ax] of Object.entries(figure.layout)) {
            if (!re.test(k) || !ax || typeof ax !== 'object') continue;
            const a = ax as any;
            if (a.type === 'category') continue;
            if (log === true) {
                a.type = 'log';
                if (a.rangemode === 'tozero') delete a.rangemode;
            } else if (log === false && a.type === 'log') {
                delete a.type;
            }
            if (a.type !== 'log') {
                if (zero === true) a.rangemode = 'tozero';
                else if (zero === false && a.rangemode === 'tozero') a.rangemode = 'normal';
            }
        }
    };
    applyAxis(/^xaxis\d*$/, 'logScale_x', 'includeZero_x');
    applyAxis(/^yaxis\d*$/, 'logScale_y', 'includeZero_y');
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

        if (xIsDiscrete) {
            plotWidth = bandedSpan(context, 'x') ?? (layout.subplotWidth || canvasSize.width);
        } else {
            plotWidth = layout.subplotWidth || canvasSize.width;
        }

        if (yIsDiscrete) {
            plotHeight = bandedSpan(context, 'y') ?? (layout.subplotHeight || canvasSize.height);
        } else {
            plotHeight = layout.subplotHeight || canvasSize.height;
        }

        const legendGutter = figure.layout.showlegend ? 96 : 0;
        figure._width = plotWidth + PADDING + legendGutter;
        figure._height = plotHeight + PADDING;
    }

    // ── Tick labels: font, angle, wrapped and cut names ──────────────────
    if (layout.xLabel && !figure.layout.xaxis) figure.layout.xaxis = {};
    if (layout.yLabel?.fontSize && !figure.layout.yaxis) figure.layout.yaxis = {};
    // A bar table lays out its own name column.
    plApplyBandLabels(figure, layout, {
        fit: context.chartType !== 'Bar Table',
        temporal: (channel) => context.channelSemantics[channel]?.type === 'temporal',
    });

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
