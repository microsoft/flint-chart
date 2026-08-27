// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef, type InstantiateContext } from '../../core/types';
import { defaultBuildEncodings, setMarkProp } from './utils';
import { makeCartesianPivot } from '../../core/pivot';
import {
    MUTED_HOVER_STROKE,
    resolveSeriesTarget,
} from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate, transitionAnnotationText } from '../../interactive/updates/annotation';

export const interpolateConfigProperty: ChartPropertyDef = {
    key: "interpolate", label: "Curve", type: "discrete", options: [
        { value: undefined, label: "Default (linear)" },
        { value: "linear", label: "Linear" },
        { value: "monotone", label: "Monotone (smooth)" },
        { value: "step", label: "Step" },
        { value: "step-before", label: "Step Before" },
        { value: "step-after", label: "Step After" },
        { value: "basis", label: "Basis (smooth)" },
        { value: "cardinal", label: "Cardinal" },
        { value: "catmull-rom", label: "Catmull-Rom" },
    ],
};

const showPointsProperty: ChartPropertyDef = {
    key: "showPoints", label: "Points", type: "binary", defaultValue: false,
};

export function applyInterpolate(mark: any, config?: Record<string, any>): any {
    if (!config?.interpolate) return mark;
    return setMarkProp(mark, 'interpolate', config.interpolate);
}

function applyShowPoints(mark: any, ctx: InstantiateContext): any {
    if (!ctx.chartProperties?.showPoints) return mark;
    // Points on a line name where a value was measured. Past the density at
    // which they touch, they stop being points and become a texture that buries
    // the line under them — a house habit meeting a fact about fit. Yield the
    // overlay when the readings pack tighter than a small dot can sit apart.
    if (pointsTooDense(ctx)) return mark;
    return setMarkProp(mark, 'point', true);
}

/**
 * True when a line carries more readings per series than can be drawn as
 * separate dots: the per-series point spacing falls below the width a small
 * dot needs to read as one. Measured at the base width (the honest floor before
 * any stretch), against the densest reasonable series estimate (rows ÷ series).
 */
function pointsTooDense(ctx: InstantiateContext): boolean {
    const rows = ctx.table?.length ?? 0;
    if (rows === 0) return false;
    const seriesField = ctx.resolvedEncodings?.color?.field ?? ctx.resolvedEncodings?.detail?.field;
    let series = 1;
    if (seriesField) {
        const seen = new Set<unknown>();
        for (const r of ctx.table) seen.add(r[seriesField]);
        series = Math.max(1, seen.size);
    }
    const pointsPerSeries = rows / series;
    const width = ctx.canvasSize?.width ?? 300;
    const spacing = width / Math.max(1, pointsPerSeries);
    return spacing < 8;
}

function isContinuousColor(ctx: InstantiateContext): boolean {
    const color = ctx.resolvedEncodings.color;
    if (!color?.field) return false;
    const type = color.type ?? ctx.channelSemantics.color?.type;
    return type === 'quantitative' || type === 'temporal';
}

function discreteField(
    resolvedEncodings: Readonly<Record<string, any>>,
    channels: readonly string[],
): string | undefined {
    return channels
        .map((channel) => resolvedEncodings[channel])
        .find((encoding) => encoding?.field && (encoding.type === 'nominal' || encoding.type === 'ordinal'))
        ?.field;
}

/**
 * Vega-Lite splits a line into one segment per datum when color is quantitative,
 * so nothing visible connects. Mirror ECharts: a neutral line + colored points.
 */
function buildContinuousColorLayers(
    spec: any,
    resolvedEncodings: Record<string, any>,
    chartProperties?: Record<string, any>,
): void {
    const { color, column, row, x, y, strokeDash, detail, opacity, order, ...rest } = resolvedEncodings;

    const lineEncoding: Record<string, any> = {};
    for (const [ch, enc] of Object.entries({ x, y, strokeDash, detail, opacity, order, ...rest })) {
        if (enc && typeof enc === 'object' && Object.keys(enc).length > 0) {
            lineEncoding[ch] = enc;
        }
    }

    const pointEncoding: Record<string, any> = {};
    if (x) pointEncoding.x = x;
    if (y) pointEncoding.y = y;
    if (color) pointEncoding.color = color;
    if (detail) pointEncoding.detail = detail;
    if (opacity) pointEncoding.opacity = opacity;

    spec.layer = [
        {
            mark: applyInterpolate({ type: 'line', color: '#cccccc' }, chartProperties),
            encoding: lineEncoding,
        },
        {
            mark: { type: 'point', filled: true, size: 80 },
            encoding: pointEncoding,
        },
    ];
    delete spec.mark;

    if (column || row) {
        if (!spec.encoding) spec.encoding = {};
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;
    } else {
        delete spec.encoding;
    }
}

export const lineChartDef: ChartTemplateDef = {
    chart: "Line Chart",
    template: { mark: "line", encoding: {} },
    channels: ["x", "y", "color", "strokeDash", "detail", "opacity", "column", "row"],
    navigation: {},
    markCognitiveChannel: 'position',
    geometryKinds: ['line', 'point'],
    semanticInteractions: ({ resolvedEncodings }) => {
        const fields = ['x', 'y', 'color', 'detail']
            .map((channel) => resolvedEncodings[channel]?.field)
            .filter((field): field is string => !!field);
        const categoryField = discreteField(resolvedEncodings, ['x']);
        const seriesField = discreteField(resolvedEncodings, ['color', 'detail']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: [...new Set(fields)],
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['line', 'point'],
            renderHoverStyles: {
                line: { strokeWidth: 3 },
                symbol: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            renderSelectionStyles: { line: { strokeWidthMultiplier: 1.2 } },
            resolve: (event, context) => resolveSeriesTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                (_element, _context, visual) => visual?.kind === 'path'
                    ? annotationCandidates('segment-midpoint', 'center', 'top', 'bottom', 'right', 'left')
                    : annotationCandidates('center', 'top', 'right', 'bottom', 'left'),
                transitionAnnotationText(resolvedEncodings.y?.field),
            ),
        };
    },
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
    }),
    instantiate: (spec, ctx) => {
        if (isContinuousColor(ctx)) {
            buildContinuousColorLayers(spec, ctx.resolvedEncodings, ctx.chartProperties);
            return;
        }
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        spec.mark = applyInterpolate(spec.mark, ctx.chartProperties);
        spec.mark = applyShowPoints(spec.mark, ctx);
    },
    properties: [interpolateConfigProperty, showPointsProperty],
    // No `transpose`: a line pins its domain to `x` (never a vertical line, for any
    // x type). `permute` excludes `x`, so only a genuine dual-measure line offers a
    // y↔color swap; the series dimension is explored via `shift` (facets/legend).
    pivot: makeCartesianPivot({ permute: [['y', 'color']], shift: ['color', 'group', 'column', 'row'] }),
};
