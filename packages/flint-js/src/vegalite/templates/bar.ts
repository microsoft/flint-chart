// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { schemeName as namedScheme } from '../../core/color-controls';
import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef, type ViewPlanContext } from '../../core/types';
import type { ViewNode } from '../../core/views';
import { skeletonStructure, statedStacking } from '../../core/structure';
import { makeSortAction } from '../../core/encoding-actions';
import { makeCartesianPivot } from '../../core/pivot';
import { planBandDodge, resolveDodge } from '../../core/band-dodge';
import { snapToBoundHeuristic } from '../../core/field-semantics';
import {
    associateSemanticElementRenderKeys,
    elementsFromHits,
    legendMatchedHits,
    MUTED_HOVER_STROKE,
    semanticElementRenderKeys,
    type SemanticResolveContext,
    type SemanticResolveEvent,
    type SemanticTarget,
} from '../../core/interaction-semantics';
import {
    annotationCandidates,
    barAnnotationCandidates,
    countAnnotationText,
    presentAnnotationUpdate,
    valueAnnotationText,
} from '../../interactive/presentation/annotation';
import { withInteractionTextLabel } from '../interaction-provenance';
import {
    detectBandedAxisFromSemantics, detectBandedAxisForceDiscrete,
} from '../../core/axis-detection';
import {
    defaultBuildEncodings, setMarkProp, adjustBarMarks, adjustRectTiling,
    resolveAsDiscrete, alignStackOrderToColorOrder,
} from './utils';

const rectHoverStyle = (resolvedEncodings: Readonly<Record<string, any>>) => ({
    rect: resolvedEncodings.opacity?.field
        ? { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 }
        : { opacity: 'contrast' as const },
});

/**
 * Fraction of a lane's pitch a locally-dodged bar fills, leaving a small gap
 * between the bars inside one band. A house that states its own
 * `marks.bandFraction` re-cuts against this baseline (see theme.ts `bandWalk`),
 * so the two must agree on the number.
 */
export const LOCAL_DODGE_LANE_FILL = 0.85;

const HEATMAP_SCHEME_COLORS: Record<string, [string, string]> = {
    viridis: ['#440154', '#fde725'],
    inferno: ['#000004', '#fcffa4'],
    magma: ['#000004', '#fcfdbf'],
    plasma: ['#0d0887', '#f0f921'],
    turbo: ['#30123b', '#7a0403'],
    blues: ['#f7fbff', '#08519c'],
    reds: ['#fff5f0', '#a50f15'],
    greens: ['#f7fcf5', '#00441b'],
    oranges: ['#fff5eb', '#7f2704'],
    purples: ['#fcfbfd', '#3f007d'],
    greys: ['#ffffff', '#252525'],
};

const DEFAULT_HEATMAP_SCHEME = 'blues';

function discreteField(
    resolvedEncodings: Readonly<Record<string, any>>,
    channels: readonly string[],
): string | undefined {
    return channels
        .map((channel) => resolvedEncodings[channel])
        .find((encoding) => encoding?.field && (encoding.type === 'nominal' || encoding.type === 'ordinal'))
        ?.field;
}

function primaryMetric(
    resolvedEncodings: Readonly<Record<string, any>>,
): { axis: 'x' | 'y'; field: string | undefined } {
    const axis = resolvedEncodings.x?.type === 'quantitative' ? 'x' : 'y';
    return { axis, field: resolvedEncodings[axis]?.field };
}

function tooltipForChannels(encoding: Record<string, any>, channels: readonly string[]): any[] {
    const tooltipKeys = ['field', 'type', 'title', 'aggregate', 'bin', 'timeUnit', 'format', 'formatType'];
    return channels.flatMap((channel) => {
        const source = encoding[channel];
        if (!source?.field) return [];
        const tooltip: Record<string, any> = {};
        for (const key of tooltipKeys) {
            if (source[key] !== undefined) tooltip[key] = source[key];
        }
        return [tooltip];
    });
}

function resolveBarTarget(
    event: SemanticResolveEvent,
    context: SemanticResolveContext,
    seriesField: string | undefined,
): SemanticTarget | null {
    const legendField = event.legend?.field ?? seriesField;
    const hits = event.role === 'legend-item' && legendField && event.legend
        ? legendMatchedHits(event, context, legendField)
        : event.hits;
    const elements = elementsFromHits(hits, context.keyField);
    return elements.length > 0
        ? { visual: { kind: 'mark', role: event.role }, elements }
        : null;
}

function resolveHistogramTarget(
    event: SemanticResolveEvent,
    context: SemanticResolveContext,
    sourceField: string | undefined,
    seriesField: string | undefined,
): SemanticTarget | null {
    const target = resolveBarTarget(event, context, seriesField);
    if (!target || !sourceField) return target;
    return {
        ...target,
        elements: target.elements.map((element) => associateSemanticElementRenderKeys({
            ...element,
            value: {
                field: sourceField,
                range: {
                    start: element.value.__bin_start,
                    end: element.value.__bin_end,
                },
                ...(seriesField && element.value[seriesField] !== undefined
                    ? { [seriesField]: element.value[seriesField] }
                    : {}),
            },
        }, semanticElementRenderKeys(element))),
    };
}

function isDivergingHeatmapScheme(scheme: string | undefined): boolean {
    return scheme === 'blueorange' || scheme === 'redblue';
}

function hexLuma(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function getSafeHeatmapIntrinsicDomain(ctx: any, colorField: string | undefined): [number, number] | undefined {
    if (!colorField) return undefined;

    const colorChannel = ctx.channelSemantics?.color;
    const annotation = colorChannel?.semanticAnnotation;

    if (annotation?.intrinsicDomain) {
        return annotation.intrinsicDomain;
    }

    const semanticType = annotation?.semanticType;
    if (semanticType === 'Correlation') return [-1, 1];
    if (semanticType === 'Latitude') return [-90, 90];
    if (semanticType === 'Longitude') return [-180, 180];

    return undefined;
}

// ─── Bar Chart ──────────────────────────────────────────────────────────────

export const barChartDef: ChartTemplateDef = {
    chart: "Bar Chart",
    template: { mark: "bar", encoding: {} },
    channels: ["x", "y", "color", "opacity", "column", "row"],
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: {},
        reorder: {},
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'length',
    semanticInteractions: ({ resolvedEncodings }) => {
        const fields = ['x', 'y', 'color']
            .map((channel) => resolvedEncodings[channel]?.field)
            .filter((field): field is string => !!field);
        const categoryField = discreteField(resolvedEncodings, ['x', 'y']);
        const seriesField = discreteField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        const metric = primaryMetric(resolvedEncodings);
        const categoryAxis = metric.axis === 'x' ? 'y' : 'x';
        const reorderAxis: { axis: 'x' | 'y'; field: string } | undefined = categoryField
            && !resolvedEncodings.column?.field && !resolvedEncodings.row?.field
            ? { axis: categoryAxis, field: categoryField }
            : undefined;
        return {
            fields: [...new Set(fields)],
            categoryField,
            reorderAxis,
            reorderAxes: reorderAxis ? [reorderAxis] : undefined,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['bar'],
            renderHoverStyles: rectHoverStyle(resolvedEncodings),
            resolve: (event, context) => resolveBarTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => barAnnotationCandidates(metric.axis),
                valueAnnotationText(metric.field),
            ),
        };
    },
    geometryKinds: ['band'],
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        const config = ctx.chartProperties;
        if (config && config.cornerRadius > 0) {
            spec.mark = setMarkProp(spec.mark, 'cornerRadius', config.cornerRadius);
        }
        adjustBarMarks(spec, ctx);
    },
    properties: [
        { key: "cornerRadius", label: "Corners", type: "continuous", min: 0, max: 15, step: 1, defaultValue: 0 },
    ] as ChartPropertyDef[],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};

// ─── Pyramid Chart ──────────────────────────────────────────────────────────

/**
 * A pyramid's two halves, side by side with no gap: each half takes the base width stretched as
 * two facet columns would, and the base height, stretched up to twice where the categories need
 * more than a 20 px step (scaled with the base size) each.
 */
function pyramidViews(ctx: ViewPlanContext): ViewNode | undefined {
    const { table, channelSemantics } = ctx;
    if (!table) return undefined;
    const discrete = (channel: 'x' | 'y') => channelSemantics[channel]?.type === 'nominal' || channelSemantics[channel]?.type === 'ordinal';
    const quantitative = (channel: 'x' | 'y') => channelSemantics[channel]?.type === 'quantitative' || channelSemantics[channel]?.type === 'temporal';
    const yField = discrete('x') && quantitative('y') ? channelSemantics.x?.field : channelSemantics.y?.field;
    const baseWidth = ctx.canvasSize?.width ?? 400;
    const baseHeight = ctx.canvasSize?.height ?? 320;
    const facetCols = 2;
    const facetStretch = Math.min(1.5, Math.pow(facetCols, 0.3));
    const width = Math.round(Math.max(40, baseWidth * facetStretch / facetCols));
    let height = baseHeight;
    if (yField) {
        const yCardinality = new Set(table.map((row: any) => row[yField])).size;
        const sizeRatio = Math.max(baseWidth, baseHeight) / 300;
        const defaultStep = Math.round(20 * Math.max(1, sizeRatio));
        const pressure = (yCardinality * defaultStep) / baseHeight;
        if (yCardinality > 0 && pressure > 1) height = Math.round(baseHeight * Math.min(2, Math.pow(pressure, 0.5)));
    }
    const half: ViewNode = { kind: 'view', role: 'plot', width, height };
    return { kind: 'concat', direction: 'row', gap: 0, children: [half, half] };
}

export const pyramidChartDef: ChartTemplateDef = {
    chart: "Pyramid Chart",
    composite: true,
    planViews: pyramidViews,
    template: {
        spacing: 0,
        resolve: { scale: { y: "shared" } },
        hconcat: [
            {
                mark: "bar",
                encoding: {
                    y: {},
                    x: { scale: { reverse: true }, stack: null },
                    opacity: { value: 0.9 },
                    color: { value: "#4e79a7" },
                },
            },
            {
                mark: "bar",
                encoding: {
                    y: { axis: null },
                    x: { stack: null },
                    opacity: { value: 0.9 },
                    color: { value: "#e15759" },
                },
            },
        ],
        config: { view: { stroke: null }, axis: { grid: false } },
    },
    channels: ["x", "y", "color"],
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        reorder: {},
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'length',
    semanticInteractions: ({ resolvedEncodings }) => {
        const fields = ['x', 'y', 'color']
            .map((channel) => resolvedEncodings[channel]?.field)
            .filter((field): field is string => !!field);
        const categoryField = discreteField(resolvedEncodings, ['y']);
        const seriesField = discreteField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        const metric = primaryMetric(resolvedEncodings);
        return {
            fields: [...new Set(fields)],
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['bar'],
            renderHoverStyles: rectHoverStyle(resolvedEncodings),
            resolve: (event, context) => resolveBarTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => barAnnotationCandidates(metric.axis),
                valueAnnotationText(metric.field),
            ),
        };
    },
    declareLayoutMode: () => ({
        axisFlags: { y: { banded: true } },
    }),
    structure: (ctx) => {
        // The colour field splits the two panels; neither panel encodes it.
        // Both panels share one domain from zero to the largest value, so the two halves compare.
        const { series: _series, ...structure } = skeletonStructure(pyramidChartDef.template, ctx);
        const xField = ctx.channelSemantics.x?.field;
        const shared = Boolean(ctx.channelSemantics.color?.field && xField && ctx.table?.some((row: any) => typeof row?.[xField] === 'number'));
        // The left panel mirrors the right, so its measure runs backwards.
        const x = structure.x ? { ...structure.x, reversed: true, ...(shared ? { ownScale: true } : {}) } : undefined;
        return { ...structure, ...(x ? { x } : {}), stacking: 'none' };
    },
    instantiate: (spec, ctx) => {
        let { y, x } = ctx.resolvedEncodings;
        const { color } = ctx.resolvedEncodings;

        // Auto-detect flipped axes
        const isDiscreteType = (enc: any) => enc && (enc.type === 'nominal' || enc.type === 'ordinal');
        const isQuant = (enc: any) => enc && (enc.type === 'quantitative' || enc.type === 'temporal');
        if (isDiscreteType(x) && isQuant(y)) {
            [x, y] = [y, x];
        }

        // y → both panels (shared category axis, always discrete)
        if (y) {
            const yEnc = { ...y };
            resolveAsDiscrete(yEnc, ctx.table);
            spec.hconcat[0].encoding.y = { ...spec.hconcat[0].encoding.y, ...yEnc };
            spec.hconcat[1].encoding.y = { ...spec.hconcat[1].encoding.y, ...yEnc };
        }
        // x → both panels
        if (x) {
            spec.hconcat[0].encoding.x = { ...spec.hconcat[0].encoding.x, ...x };
            spec.hconcat[1].encoding.x = { ...spec.hconcat[1].encoding.x, ...x };
        }

        // --- Pyramid-specific configuration ---
        const colorField = color?.field;
        const table = ctx.table;

        try {
            if (table && colorField) {
                const groups = [...new Set(table.map(r => r[colorField]))] as string[];
                const leftGroup = groups[0];
                const rightGroup = groups.length > 1 ? groups[1] : groups[0];

                spec.hconcat[0].transform = [{ filter: { field: colorField, equal: leftGroup } }];
                spec.hconcat[1].transform = [{ filter: { field: colorField, equal: rightGroup } }];
                spec.hconcat[0].title = String(leftGroup);
                spec.hconcat[1].title = String(rightGroup);

                if (groups.length > 2) {
                    if (!spec._warnings) spec._warnings = [];
                    spec._warnings.push({
                        severity: 'warning',
                        code: 'too-many-groups-pyramid',
                        message: `Pyramid chart works best with exactly 2 groups, but found ${groups.length} (${groups.map((g: string) => `'${g}'`).join(', ')}). Only the first two are shown.`,
                        channel: 'color',
                        field: colorField,
                    });
                }
            }

            if (table) {
                const xField = spec.hconcat[0].encoding.x?.field;
                if (xField) {
                    const allVals = table.map(r => r[xField]).filter((v: any) => typeof v === 'number');
                    if (allVals.length > 0) {
                        const domain = [Math.min(0, ...allVals), Math.max(...allVals)];
                        spec.hconcat[0].encoding.x.scale = { ...spec.hconcat[0].encoding.x.scale, domain };
                        spec.hconcat[1].encoding.x.scale = { ...spec.hconcat[1].encoding.x.scale, domain };
                    }
                    if (allVals.some((v: number) => v < 0)) {
                        if (!spec._warnings) spec._warnings = [];
                        spec._warnings.push({
                            severity: 'warning',
                            code: 'negative-values-pyramid',
                            message: `Negative values detected in '${xField}'. Pyramid charts work best with non-negative values.`,
                            channel: 'x',
                            field: xField,
                        });
                    }
                }

                const planned = ctx.views?.kind === 'concat' ? ctx.views.children : [];
                if (ctx.views?.kind === 'concat') spec.spacing = ctx.views.gap;
                spec.hconcat.forEach((panel: any, index: number) => {
                    const view = planned[index];
                    if (view?.kind !== 'view') return;
                    panel.width = view.width;
                    panel.height = view.height;
                });
            }
        } catch {
            // ignore errors
        }
    },
};

// ─── Grouped Bar Chart ──────────────────────────────────────────────────────

export const groupedBarChartDef: ChartTemplateDef = {
    chart: "Grouped Bar Chart",
    template: { mark: "bar", encoding: {} },
    channels: ["x", "y", "group", "color", "column", "row"],
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: {},
        reorder: {},
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'length',
    semanticInteractions: ({ resolvedEncodings }) => {
        const fields = ['x', 'y', 'color']
            .map((channel) => resolvedEncodings[channel]?.field)
            .filter((field): field is string => !!field);
        const categoryField = discreteField(resolvedEncodings, ['x', 'y']);
        const seriesField = discreteField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        const metric = primaryMetric(resolvedEncodings);
        return {
            fields: [...new Set(fields)],
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['bar'],
            renderHoverStyles: rectHoverStyle(resolvedEncodings),
            resolve: (event, context) => resolveBarTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => barAnnotationCandidates(metric.axis),
                valueAnnotationText(metric.field),
            ),
        };
    },
    declareLayoutMode: (cs, table, chartProperties) => {
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        const axis = result?.axis || 'x';

        const decl: import('../../core/types').LayoutDeclaration = {
            axisFlags: { [axis]: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
        // `local` dodge budgets only maxPerBand lanes per band (compact), so the
        // band isn't sized for the full global group domain.
        const groupField = cs.group?.field;
        const axisField = cs[axis]?.field;
        if (groupField && axisField) {
            const plan = planBandDodge(table, axisField, groupField);
            const { mode } = resolveDodge(plan, chartProperties?.dodge);
            if (mode === 'local') decl.groupLaneCount = Math.max(1, plan.maxPerBand);
        }
        return decl;
    },
    instantiate: (spec, ctx) => {
        // resolvedEncodings already includes color + xOffset/yOffset from group channel
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        adjustBarMarks(spec, ctx);

        // `local` dodge: replace the global group offset with a per-band lane
        // index so each band is subdivided into only maxPerBand lanes (compact),
        // rather than the full global grid. Native x labels stay centered.
        const offsetCh = spec.encoding?.xOffset ? 'xOffset' : spec.encoding?.yOffset ? 'yOffset' : undefined;
        const groupField = ctx.channelSemantics?.group?.field;
        // The offset sits on the banded axis, which may be a temporal axis the
        // layout forced discrete, so its semantic type can't pick the axis.
        const axisField = offsetCh === 'xOffset' ? ctx.channelSemantics?.x?.field : ctx.channelSemantics?.y?.field;
        if (offsetCh && groupField && axisField) {
            const plan = planBandDodge(ctx.fullTable ?? ctx.table, axisField, groupField);
            const { mode } = resolveDodge(plan, ctx.chartProperties?.dodge);
            if (mode === 'local') {
                const maxPB = Math.max(1, plan.maxPerBand);
                // Center each band's items with a QUANTITATIVE offset in the
                // band's [-0.5, 0.5] range: a single-item band sits at the band
                // centre, a partial cluster is centred (not left-anchored). The
                // native band x-axis is kept, so group labels stay centred.
                spec.encoding[offsetCh] = {
                    field: '__off', type: 'quantitative',
                    scale: { domain: [-0.5, 0.5] }, axis: null, title: null,
                };
                spec.transform = [
                    ...(spec.transform ?? []),
                    { window: [{ op: 'dense_rank', as: '__laneIdx' }], groupby: [axisField], sort: [{ field: groupField, order: 'ascending' }] },
                    { joinaggregate: [{ op: 'distinct', field: groupField, as: '__localCount' }], groupby: [axisField] },
                    { calculate: `((datum.__laneIdx - 1) - (datum.__localCount - 1) / 2) / ${maxPB}`, as: '__off' },
                ];
                // Constant bar width ≈ LOCAL_DODGE_LANE_FILL of a lane. VL's
                // band reserves ~20% padding, so the usable per-lane pitch is
                // (band·0.8 / maxPerBand).
                const band = offsetCh === 'xOffset' ? ctx.layout?.xStep : ctx.layout?.yStep;
                if (band) {
                    spec.mark = setMarkProp(spec.mark, 'size', Math.max(2, Math.round((band * 0.8 / maxPB) * LOCAL_DODGE_LANE_FILL)));
                }
            }
        }
    },
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    properties: [
        {
            key: 'dodge', label: 'Dodge', type: 'discrete',
            options: [
                { value: 'auto',   label: 'Auto' },
                { value: 'local',  label: 'Local (compact)' },
                { value: 'global', label: 'Global (aligned)' },
            ],
            defaultValue: 'auto',
            // The `group` field is what subdivides each category band.
            check: (ctx) => {
                const cs = ctx.channelSemantics;
                const groupField = cs?.group?.field ?? ctx.encodings?.group?.field;
                const rows = ctx.data;
                if (!cs || !rows) return { applicable: false };
                // The same band axis `declareLayoutMode` picks.
                const axis = detectBandedAxisForceDiscrete(cs, rows, { preferAxis: 'x' })?.axis || 'x';
                const axisField = cs[axis]?.field;
                if (!groupField || !axisField) return { applicable: false };
                const plan = planBandDodge(rows, axisField, groupField);
                return { applicable: plan.ambiguous, recommendedValue: plan.mode === 'none' ? 'auto' : plan.mode };
            },
        },
    ] as ChartPropertyDef[],
    // Chart-type transition: the dodge series (`group`) becomes a stacked series
    // (`color`), re-rendering as a Stacked Bar Chart. Plus the orientation flip,
    // role swap (banded axis ↔ series), and series routing to column/row facets.
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
        // θ (→ Stacked Bar) is declared centrally in core/chart-transitions.ts.
    }),
};

// ─── Stacked Bar Chart ──────────────────────────────────────────────────────

export const stackedBarChartDef: ChartTemplateDef = {
    chart: "Stacked Bar Chart",
    template: { mark: "bar", encoding: {} },
    channels: ["x", "y", "color", "column", "row"],
    structure: (ctx) => {
        // The stack mode the author picks stacks the series, side by side when layered.
        const structure = skeletonStructure(stackedBarChartDef.template, ctx);
        const mode = ctx.chartProperties?.stackMode;
        const stated = mode && ctx.channelSemantics.color?.field ? statedStacking(mode === 'layered' ? null : mode) : undefined;
        return stated ? { ...structure, stacking: stated } : structure;
    },
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: {},
        reorder: {},
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'length',
    semanticInteractions: ({ resolvedEncodings }) => {
        const fields = ['x', 'y', 'color']
            .map((channel) => resolvedEncodings[channel]?.field)
            .filter((field): field is string => !!field);
        const categoryField = discreteField(resolvedEncodings, ['x', 'y']);
        const seriesField = discreteField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        const metric = primaryMetric(resolvedEncodings);
        return {
            fields: [...new Set(fields)],
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['bar'],
            renderHoverStyles: rectHoverStyle(resolvedEncodings),
            resolve: (event, context) => resolveBarTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => barAnnotationCandidates(metric.axis),
                valueAnnotationText(metric.field),
            ),
        };
    },
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
            paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } },
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        spec.encoding.tooltip = tooltipForChannels(spec.encoding, ['x', 'y', 'color']);
        // Apply stack mode
        const config = ctx.chartProperties;
        const hasStackSeries = !!ctx.channelSemantics.color?.field;
        if (config?.stackMode && hasStackSeries) {
            for (const axis of ['x', 'y'] as const) {
                if (spec.encoding?.[axis]?.type === 'quantitative' ||
                    spec.encoding?.[axis]?.aggregate) {
                    spec.encoding[axis].stack = config.stackMode === 'layered' ? null : config.stackMode;
                    break;
                }
            }
        }
        alignStackOrderToColorOrder(spec, ctx);
        adjustBarMarks(spec, ctx);
    },
    properties: [
        { key: "stackMode", label: "Stack", type: "discrete",
          // A stack mode only does something when a series dimension (color) is
          // present to stack; without it there is a single bar per category.
          check: (ctx) => ({ applicable: !!ctx.encodings.color?.field }),
          options: [
            { value: undefined, label: "Stacked (default)" },
            { value: "normalize", label: "Normalize (100%)" },
            { value: "center", label: "Center" },
        ] },
    ] as ChartPropertyDef[],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    // Chart-type transition: the stacked series (`color`) becomes a dodge series
    // (`group`), re-rendering as a Grouped Bar Chart. Offered only when the series
    // cardinality is small enough to dodge readably. Plus the orientation flip,
    // role swap (banded axis ↔ series), and series routing to column/row facets.
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
        // θ (→ Grouped Bar) is declared centrally in core/chart-transitions.ts.
    }),
};

// ─── Histogram ──────────────────────────────────────────────────────────────

/** The field a histogram's bars start at, computed by its bin transform. */
const BIN_START = '__bin_start';
/** The rows in each bin, computed by its aggregate. */
const HISTOGRAM_COUNT = '__count';
/** The count's axis title, as Vega-Lite names a count of rows. */
const HISTOGRAM_COUNT_TITLE = 'Count of Records';

export const histogramDef: ChartTemplateDef = {
    chart: "Histogram",
    template: {
        mark: "bar",
        encoding: {
            x: { bin: true },
            y: { aggregate: "count" },
        },
    },
    channels: ["x", "color", "column", "row"],
    // The count has no source field to take its title from; it is named as the bars draw it.
    structure: (ctx) => ({ ...skeletonStructure(histogramDef.template, ctx), axisTitles: { y: HISTOGRAM_COUNT_TITLE } }),
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: {},
        reorder: {},
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'length',
    semanticInteractions: ({ resolvedEncodings }) => {
        const sourceField = resolvedEncodings.x?.field;
        const colorField = resolvedEncodings.color?.field;
        const seriesField = discreteField(resolvedEncodings, ['color']);
        return {
            fields: [...new Set([colorField, '__bin_start', '__bin_end'].filter((field): field is string => !!field))],
            provenanceFields: colorField ? [colorField] : [],
            rangeProvenance: sourceField
                ? [{ field: sourceField, startField: '__bin_start', endField: '__bin_end' }]
                : [],
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['bar'],
            renderHoverStyles: rectHoverStyle(resolvedEncodings),
            resolve: (event, context) => resolveHistogramTarget(event, context, sourceField, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => barAnnotationCandidates('y'),
                countAnnotationText,
            ),
        };
    },
    // A binned x is an index axis, not a measure: the reader keys counts off
    // its intervals, and its identity comes from banding even though the field
    // is quantitative. Declaring it banded keeps the count off it and stops a
    // house that seats its *measure* axis opposite (economist's right/top) from
    // flipping the bins to the top of the plot.
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        // `binCount` is the maxbins cap; 0 (auto) leaves the template's `bin: true`
        // so Vega chooses. maxbins is only an upper bound — Vega snaps to "nice"
        // boundaries, so the rendered count is usually a bit below the cap.
        const binCount = ctx.chartProperties?.binCount;
        if (binCount && spec.encoding?.x) {
            spec.encoding.x.bin = { maxbins: binCount };
        }
        const x = spec.encoding?.x;
        if (x?.field) {
            const sourceField = x.field;
            spec.transform = [
                ...(spec.transform ?? []),
                { bin: x.bin ?? true, field: sourceField, as: [BIN_START, '__bin_end'] },
            ];
            spec.encoding.x = {
                ...x,
                field: BIN_START,
                bin: 'binned',
                title: x.title ?? sourceField,
            };
            spec.encoding.x2 = { field: '__bin_end' };
            // The count is stated as a field, as every other bar's measure is: an encoding that
            // only aggregates names no field, and the passes that read a chart's measure off its
            // field — the theme's baseline and grid, value labels, tick rounding — would pass
            // the histogram by. `__count` is the name Vega-Lite gives the count itself.
            const groups = ['color', 'column', 'row']
                .map((channel) => spec.encoding?.[channel]?.field)
                .filter((field): field is string => typeof field === 'string');
            spec.transform.push({
                aggregate: [{ op: 'count', as: HISTOGRAM_COUNT }],
                groupby: [...new Set([BIN_START, '__bin_end', ...groups])],
            });
            const { aggregate: _aggregate, ...y } = spec.encoding.y ?? {};
            spec.encoding.y = { ...y, field: HISTOGRAM_COUNT, type: 'quantitative', title: y.title ?? HISTOGRAM_COUNT_TITLE };
        }
        adjustBarMarks(spec, ctx);
    },
    properties: [
        // 0 == auto (let the engine choose); 5–50 caps the bins (maxbins).
        { key: "binCount", label: "Max Bins", type: "continuous", min: 5, max: 50, step: 1, defaultValue: 0 },
    ] as ChartPropertyDef[],
    // A histogram has a single bound field (x); its y is a computed count, so
    // there is no τ transpose or σ permute. `shift` routes a discrete series to
    // the legend/facets, and the θ transition re-renders the same field as a
    // smooth kernel Density Plot.
    pivot: makeCartesianPivot({
        shift: ['color', 'column', 'row'],
        // θ (→ Density Plot / ECDF) is declared centrally in core/chart-transitions.ts.
    }),
};

// ─── Heatmap ────────────────────────────────────────────────────────────────

export const heatmapDef: ChartTemplateDef = {
    chart: "Heatmap",
    template: { mark: "rect", encoding: {} },
    channels: ["x", "y", "color", "column", "row"],
    structure: (ctx) => {
        // Cells print their own values when asked.
        const structure = skeletonStructure(heatmapDef.template, ctx);
        return ctx.chartProperties?.showTextLabels && ctx.channelSemantics.color?.field
            ? { ...structure, marks: [...structure.marks, 'text'] } : structure;
    },
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: {},
        reorder: {},
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'color',
    semanticInteractions: ({ resolvedEncodings }) => {
        const fields = ['x', 'y', 'color']
            .map((channel) => resolvedEncodings[channel]?.field)
            .filter((field): field is string => !!field);
        const colorField = resolvedEncodings.color?.field;
        const categoryField = discreteField(resolvedEncodings, ['x', 'y']);
        const reorderAxes = (['x', 'y'] as const).flatMap((axis) => {
            const encoding = resolvedEncodings[axis];
            return encoding?.field && (encoding.type === 'nominal' || encoding.type === 'ordinal')
                ? [{ axis, field: encoding.field }]
                : [];
        });
        return {
            fields: [...new Set(fields)],
            categoryField,
            legendFields: colorField ? { color: colorField } : undefined,
            reorderAxis: reorderAxes[0],
            reorderAxes,
            selectableMarks: ['rect'],
            renderHoverStyles: rectHoverStyle(resolvedEncodings),
            renderSelectionStyles: resolvedEncodings.color?.type === 'quantitative'
                || resolvedEncodings.color?.type === 'temporal'
                ? { rect: { boundary: 'contiguous-region' } }
                : undefined,
            resolve: (event, context) => resolveBarTarget(event, context, undefined),
            presentUpdate: presentAnnotationUpdate(() => annotationCandidates(
                'center', 'top', 'bottom', 'right', 'left',
            )),
        };
    },
    ownsValueLabels: true,
    declareLayoutMode: (_channelSemantics, _table, chartProperties) => {
        const showTextLabels = !!chartProperties?.showTextLabels;
        return {
            // Heatmap positions are cells, regardless of whether their labels
            // are categories, numbers, or dates. Temporal axes keep a temporal
            // scale for tick semantics while the dynamic layout budgets one
            // discrete slot per observed value (continuous-as-discrete).
            axisFlags: { x: { banded: true }, y: { banded: true } },
            // Labels need slightly larger cells so the value text isn't crushed,
            // but we keep this close to the unlabeled defaults (minStep 6 /
            // defaultBandSize 20) so a labeled heatmap doesn't balloon. The small
            // label font (see instantiate) is what lets these stay compact.
            paramOverrides: showTextLabels
                ? { minStep: 9, defaultBandSize: 22 }
                : undefined,
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        // Cells tile the plot, so a continuous axis's grid would run through the middle
        // of each banded cell; discrete axes draw no grid already.
        for (const channel of ['x', 'y'] as const) {
            const encoding = spec.encoding?.[channel];
            if (encoding && encoding.axis !== null && (encoding.type === 'temporal' || encoding.type === 'quantitative')) {
                encoding.axis = { ...encoding.axis, grid: false };
            }
        }
        // Apply color scheme from chart properties
        const config = ctx.chartProperties;
        const showTextLabels = !!config?.showTextLabels;
        const colorField = spec.encoding?.color?.field;
        const colorVals = colorField
            ? ctx.table
                .map((r: any) => r[colorField])
                .filter((v: any) => v != null && v !== '')
                .map((v: any) => Number(v))
                .filter((v: number) => Number.isFinite(v))
            : [];
        const hasMissingValues = colorField
            ? ctx.table.some((r: any) => {
                const value = r[colorField];
                return value == null || value === '' || !Number.isFinite(Number(value));
            })
            : false;
        const observedMin = colorVals.length > 0 ? Math.min(...colorVals) : 0;
        const observedMax = colorVals.length > 0 ? Math.max(...colorVals) : 1;
        const existingScheme = spec.encoding?.color?.scale?.scheme;
        // Color scheme is a Category-B encoding override: the compiler already
        // composed chartProperties.colorScheme onto encoding.color.scheme before
        // assembly (see applyEncodingOverrides), so we just read it here. This
        // also transparently covers charts saved before the migration, whose
        // value lived in chartProperties.colorScheme.
        const encScheme = namedScheme(ctx.encodings?.color?.scheme);
        const userScheme = (encScheme && encScheme !== 'default') ? encScheme : undefined;
        const semanticScheme = ctx.channelSemantics?.color?.colorScheme;
        const semanticIsDiverging = semanticScheme?.type === 'diverging';
        const colorEncodingType = spec.encoding?.color?.type;
        const shouldUseHeatmapDefault = !userScheme
            && !semanticIsDiverging
            && !isDivergingHeatmapScheme(existingScheme)
            && colorEncodingType !== 'nominal';
        // A diverging heatmap has a polarity, and the polarity is a reading of
        // the field: warm at the top for an intensity, red at the bottom for a
        // loss (see the diverging note in semantic-types). That call has
        // already been made upstream, so take the scheme it named rather than
        // pinning one here — a hard-coded default lands cold-red on every
        // temperature grid we draw.
        const schemeName = userScheme
            || (semanticIsDiverging ? (existingScheme || semanticScheme?.scheme || 'redblue') : undefined)
            || (shouldUseHeatmapDefault ? DEFAULT_HEATMAP_SCHEME : existingScheme);
        const isDiverging = isDivergingHeatmapScheme(schemeName);
        const intrinsicDomain = getSafeHeatmapIntrinsicDomain(ctx, colorField);

        let effectiveMin = intrinsicDomain?.[0] ?? observedMin;
        let effectiveMax = intrinsicDomain?.[1] ?? observedMax;

        if (spec.encoding?.color) {
            if (!spec.encoding.color.scale) spec.encoding.color.scale = {};
            if (schemeName) {
                spec.encoding.color.scale.scheme = schemeName;
            }
            // A diverging grid has to be symmetric about its pivot, or one arm
            // of the ramp reaches further than the other and equal distances
            // from the pivot read as unequal. The pivot is not always zero —
            // an author can say what the reader is comparing against — so
            // centre on whatever was resolved rather than on the origin.
            const pivot = spec.encoding.color.scale.domainMid
                ?? semanticScheme?.domainMid
                ?? 0;
            if (isDiverging && effectiveMin < pivot && effectiveMax > pivot) {
                const sym = Math.max(pivot - effectiveMin, effectiveMax - pivot);
                effectiveMin = pivot - sym;
                effectiveMax = pivot + sym;
                spec.encoding.color.scale.domain = [effectiveMin, effectiveMax];
                spec.encoding.color.scale.domainMid = pivot;
            } else if (intrinsicDomain) {
                // Sequential color with a known intrinsic domain (e.g. a
                // Percentage field with [0, 100]). Don't force the full
                // theoretical range — that washes out the scale when every
                // value is concentrated low (all cells look pale because the
                // legend stretches to 100%). Snap to an intrinsic bound only
                // when the data actually approaches it; otherwise fit the
                // color domain to the observed data range. Mirrors the
                // snap-to-bound behaviour already used on the x/y axes.
                const snapped = snapToBoundHeuristic(intrinsicDomain, colorVals);
                effectiveMin = snapped?.min ?? observedMin;
                effectiveMax = snapped?.max ?? observedMax;
                spec.encoding.color.scale.domain = [effectiveMin, effectiveMax];
            }
        }
        adjustBarMarks(spec, ctx);
        adjustRectTiling(spec, ctx);

        if ((showTextLabels || hasMissingValues) && spec.encoding?.color?.field) {
            const baseEncoding = spec.encoding || {};
            const xEncoding = baseEncoding.x;
            const yEncoding = baseEncoding.y;
            const colorValue = `datum[${JSON.stringify(colorField)}]`;
            const validValue = `isValid(${colorValue}) && ${colorValue} !== ''`;
            const missingValue = `!(${validValue})`;
            const span = effectiveMax - effectiveMin;

            const cellMinDim = Math.min(ctx.layout.xStep || 50, ctx.layout.yStep || 50);
            // Keep the in-cell value text small so cells can stay compact (close
            // to the unlabeled heatmap). Cap at 9px and step down for tighter
            // cells rather than growing the font/cells to fit it.
            const labelFontSize = cellMinDim >= 40 ? 9 : cellMinDim >= 28 ? 8 : 7;
            const labelFormat = cellMinDim >= 44 ? '.2f' : '.1f';

            const sequentialPalette = HEATMAP_SCHEME_COLORS[schemeName || DEFAULT_HEATMAP_SCHEME] || HEATMAP_SCHEME_COLORS[DEFAULT_HEATMAP_SCHEME];
            const highIsLight = hexLuma(sequentialPalette[1]) >= hexLuma(sequentialPalette[0]);
            const strongThreshold = span > 0
                ? (isDiverging
                    ? Math.max(Math.abs(effectiveMin), Math.abs(effectiveMax)) * 0.5
                    : effectiveMin + span * 0.6)
                : undefined;

            if (hasMissingValues) {
                // Keep no-data styling on the original rect encoding. A
                // separate missing-value layer owns its own X/Y definitions;
                // even with shared scales, that layer then participates in
                // axis inference and can disturb a transposed temporal axis.
                spec.encoding.color = {
                    ...spec.encoding.color,
                    condition: { test: missingValue, value: '#8c8c8c' },
                };
                spec.encoding.opacity = {
                    condition: { test: missingValue, value: 0.32 },
                    value: 1,
                };
            }

            if (showTextLabels) {
                const defaultTextColor = isDiverging
                    ? 'black'
                    : (highIsLight ? 'white' : 'black');
                const textColorConditions: any[] = [
                    ...(hasMissingValues
                        ? [{ test: missingValue, value: '#8c8c8c' }]
                        : []),
                    ...(strongThreshold == null
                        ? []
                        : [{
                            test: isDiverging
                                ? `${colorValue} > ${strongThreshold} || ${colorValue} < ${-strongThreshold}`
                                : `${colorValue} >= ${strongThreshold}`,
                            value: isDiverging
                                ? 'white'
                                : (highIsLight ? 'black' : 'white'),
                        }]),
                ];
                const layers: any[] = [{
                    mark: spec.mark,
                    encoding: {
                        ...(xEncoding ? { x: xEncoding } : {}),
                        ...(yEncoding ? { y: yEncoding } : {}),
                        ...(baseEncoding.color ? { color: spec.encoding.color } : {}),
                        ...(spec.encoding.opacity ? { opacity: spec.encoding.opacity } : {}),
                    },
                }, withInteractionTextLabel({
                    mark: {
                        type: 'text',
                        align: 'center',
                        baseline: 'middle',
                        fontSize: labelFontSize,
                        clip: true,
                    },
                    encoding: {
                        ...(xEncoding ? { x: xEncoding } : {}),
                        ...(yEncoding ? { y: yEncoding } : {}),
                        text: {
                            ...(hasMissingValues
                                ? { condition: { test: missingValue, value: '—' } }
                                : {}),
                            field: colorField,
                            type: 'quantitative',
                            format: labelFormat,
                        },
                        color: textColorConditions.length > 0
                            ? { condition: textColorConditions, value: defaultTextColor }
                            : { value: defaultTextColor },
                    },
                }, { presentation: 'on-mark' })];

                spec.layer = layers;
                delete spec.mark;

                // Facets remain shared by the layered unit, but X/Y/color now
                // live on the individual layers.
                const sharedEncoding = {
                    ...(baseEncoding.column ? { column: baseEncoding.column } : {}),
                    ...(baseEncoding.row ? { row: baseEncoding.row } : {}),
                };
                if (Object.keys(sharedEncoding).length > 0) spec.encoding = sharedEncoding;
                else delete spec.encoding;
            }
        }
    },
    properties: [
        { key: 'showValueLabels', label: 'Values', type: 'binary', defaultValue: false },
    ] as ChartPropertyDef[],
    // Color scheme is an encoding-level edit (writes encoding.scheme on the
    // color channel), so it is exposed as a Category-B encoding action rather
    // than a chart-native property. The host stores the chosen value as an
    // override in chartProperties.colorScheme; the compiler composes it onto the
    // encoding (see applyEncodingOverrides). `dependencies` tells the host to
    // reset the override when the color channel's binding changes in the shelf.
    encodingActions: [
        {
            key: 'colorScheme',
            label: 'Scheme',
            isApplicable: (ctx) => !!ctx.encodings.color?.field,
            dependencies: ['color'],
            control: {
                type: 'discrete', options: [
                    { value: undefined, label: "Default (Blues)" },
                    { value: "viridis", label: "Viridis" },
                    { value: "inferno", label: "Inferno" },
                    { value: "magma", label: "Magma" },
                    { value: "plasma", label: "Plasma" },
                    { value: "turbo", label: "Turbo" },
                    { value: "blues", label: "Blues" },
                    { value: "reds", label: "Reds" },
                    { value: "greens", label: "Greens" },
                    { value: "oranges", label: "Oranges" },
                    { value: "purples", label: "Purples" },
                    { value: "greys", label: "Greys" },
                    { value: "blueorange", label: "Blue-Orange (diverging)" },
                    { value: "redblue", label: "Red-Blue (diverging)" },
                ],
            },
            get: (encodings) => namedScheme(encodings.color?.scheme),
            set: (encodings, value) => ({ ...encodings, color: { ...encodings.color, scheme: value } }),
        },
    ] as EncodingActionDef[],
    pivot: makeCartesianPivot({ transpose: [['x', 'y']] }),
};
