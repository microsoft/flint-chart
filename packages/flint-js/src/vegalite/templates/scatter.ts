// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { detectBandedAxisForceDiscrete } from '../../core/axis-detection';
import { planBandDodge, resolveDodge } from '../../core/band-dodge';
import {
    defaultBuildEncodings, applyPointSizeScaling, setMarkProp,
} from './utils';
import { makeCartesianPivot } from '../../core/pivot';

const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

// Fraction of the band/lane step a boxplot box should occupy. An ungrouped box
// fills most of its category band; a grouped (dodged) box fills most of its
// per-subgroup lane. The remainder becomes the gap between adjacent boxes.
const BOXPLOT_BAND_FILL = 0.7;
const GROUPED_BOXPLOT_LANE_FILL = 0.85;
// Vega-Lite's default discrete position band scale reserves ~20% of each step as
// inter-band padding, so only ~80% of the step is usable drawing width. Grouped
// box sizing must use this usable width when splitting a band into sub-lanes,
// otherwise the boxes overshoot their lane pitch and overlap within a group.
const USABLE_BAND_FRACTION = 0.8;

export const scatterPlotDef: ChartTemplateDef = {
    chart: "Scatter Plot",
    template: { mark: "circle", encoding: {} },
    channels: ["x", "y", "color", "size", "shape", "opacity", "column", "row"],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        // A `shape` encoding only renders distinct glyphs on the `point` mark;
        // `circle` ignores it. Promote the mark when shape is in play.
        if (spec.encoding?.shape?.field) {
            spec.mark = setMarkProp(spec.mark, 'type', 'point');
        }
        applyPointSizeScaling(spec, ctx.table, ctx.canvasSize?.width, ctx.canvasSize?.height);
        const config = ctx.chartProperties;
        if (config?.opacity !== undefined && config.opacity < 1) {
            spec.mark = setMarkProp(spec.mark, 'opacity', config.opacity);
        }
    },
    properties: [
        { key: "opacity", label: "Opacity", type: "continuous", min: 0.1, max: 1, step: 0.1, defaultValue: 1 },
    ] as ChartPropertyDef[],
    pivot: makeCartesianPivot({
        // Flip the axes (orientation) as its own generator.
        transpose: [['x', 'y']],
        // x/y/color/size are peer measure channels: reassign a measure field
        // between a precise axis and a demoted color/size channel. Profile typing
        // prunes anything touching a discrete series; aux↔aux (color↔size) and
        // x↔y (a transpose) are not offered here.
        permute: [['x', 'y', 'color', 'size']],
        // Route the discrete grouping field across color / facet channels so a
        // grouped scatter and a faceted scatter are states of one another.
        shift: ['color', 'group', 'column', 'row'],
        // θ chart-type transitions (Scatter → Strip / Regression) are declared
        // centrally in core/chart-transitions.ts, not on the template.
    }),
};

export const regressionDef: ChartTemplateDef = {
    chart: "Regression",
    template: {
        layer: [
            {
                mark: "circle",
                encoding: { x: {}, y: {}, color: {}, size: {} },
            },
            {
                mark: { type: "line", color: "red" },
                transform: [{ regression: "field1", on: "field2" }],
                encoding: { x: {}, y: {} },
            },
        ],
    },
    channels: ["x", "y", "size", "color", "column", "row"],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { x, y, color, size, column, row } = ctx.resolvedEncodings;
        const config = ctx.chartProperties;
        // x & y → both layers + transform field names
        if (x) {
            spec.layer[0].encoding.x = { ...spec.layer[0].encoding.x, ...x };
            spec.layer[1].encoding.x = { ...spec.layer[1].encoding.x, ...x };
            if (x.field) spec.layer[1].transform[0].on = x.field;
        }
        if (y) {
            spec.layer[0].encoding.y = { ...spec.layer[0].encoding.y, ...y };
            spec.layer[1].encoding.y = { ...spec.layer[1].encoding.y, ...y };
            if (y.field) spec.layer[1].transform[0].regression = y.field;
        }
        // Regression method (default: linear)
        const method = config?.regressionMethod;
        if (method && method !== 'linear') {
            spec.layer[1].transform[0].method = method;
            // For polynomial, allow configurable order
            if (method === 'poly') {
                const order = config?.polyOrder ?? 3;
                spec.layer[1].transform[0].order = order;
            }
        }
        // color → scatter layer always; if present, also group regression by color field
        if (color) {
            spec.layer[0].encoding.color = { ...spec.layer[0].encoding.color, ...color };
            if (color.field) {
                // Group regression by color field so each class gets its own trend line
                spec.layer[1].transform[0].groupby = [color.field];
                // Pass color encoding to regression layer so lines match scatter colors
                spec.layer[1].encoding.color = { ...color };
                // Remove the hardcoded red so Vega-Lite uses the shared color scale
                spec.layer[1].mark = { type: "line" };
            }
        }
        if (size) spec.layer[0].encoding.size = { ...spec.layer[0].encoding.size, ...size };
        // facets → top-level encoding
        if (!spec.encoding) spec.encoding = {};
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;
    },
    properties: [
        {
            key: "regressionMethod", label: "Method", type: "discrete",
            options: [
                { value: "linear", label: "Linear" },
                { value: "log",    label: "Logarithmic" },
                { value: "exp",    label: "Exponential" },
                { value: "pow",    label: "Power" },
                { value: "quad",   label: "Quadratic" },
                { value: "poly",   label: "Polynomial" },
            ],
            defaultValue: "linear",
        },
        {
            key: "polyOrder", label: "Poly Order", type: "continuous",
            min: 2, max: 10, step: 1, defaultValue: 3,
        },
    ] as ChartPropertyDef[],
    // A regression is a scatter with a fitted trend, so it shares the scatter's
    // local rearrangement group: flip the axes, demote a measure to color/size,
    // and route a discrete series across color / facet channels. (θ chart-type
    // transitions are declared centrally in core/chart-transitions.ts.)
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color', 'size']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};

export const rangedDotPlotDef: ChartTemplateDef = {
    chart: "Ranged Dot Plot",
    template: {
        encoding: {},
        layer: [
            { mark: "line", encoding: { detail: {} } },
            { mark: { type: "point", filled: true }, encoding: { color: {} } },
        ],
    },
    channels: ["x", "y", "color"],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { color, ...rest } = ctx.resolvedEncodings;
        if (!spec.encoding) spec.encoding = {};
        for (const [ch, enc] of Object.entries(rest)) {
            spec.encoding[ch] = { ...(spec.encoding[ch] || {}), ...enc };
        }
        if (color) {
            spec.layer[1].encoding.color = { ...(spec.layer[1].encoding.color || {}), ...color };
        }

        // Copy nominal axis into detail encoding for line layer
        if (spec.encoding.y?.type === "nominal") {
            spec.layer[0].encoding.detail = JSON.parse(JSON.stringify(spec.encoding.y));
        } else if (spec.encoding.x?.type === "nominal") {
            spec.layer[0].encoding.detail = JSON.parse(JSON.stringify(spec.encoding.x));
        }
    },
};

export const boxplotDef: ChartTemplateDef = {
    chart: "Boxplot",
    template: { mark: "boxplot", encoding: {} },
    channels: ["x", "y", "color", "opacity", "column", "row"],
    markCognitiveChannel: 'position',
    declareLayoutMode: (cs, table, chartProperties) => {
        if (!cs.x?.field || !cs.y?.field) return {};
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        if (!result) return {};
        // Decide whether `color` dodges the banded axis into side-by-side
        // sub-lanes, or is redundant/nested with it (one full-width box per
        // band). Shared with `instantiate` via `planBandDodge` so the band
        // budget and the box size agree. Honors the `dodge` override.
        let colorActsAsGroup = false;
        let groupLaneCount: number | undefined;
        const colorField = cs.color?.field;
        const axisField = cs[result.axis]?.field;
        if (colorField && axisField && isDiscreteType(cs.color?.type)) {
            const plan = planBandDodge(table, axisField, colorField, {
                nestedSnapThreshold: chartProperties?.nestedSnapThreshold,
            });
            const { mode } = resolveDodge(plan, chartProperties?.dodge);
            colorActsAsGroup = mode !== 'none';
            // `local` budgets only maxPerBand lanes per band (compact).
            if (mode === 'local') groupLaneCount = Math.max(1, plan.maxPerBand);
        }
        return {
            axisFlags: { [result.axis]: { banded: true } },
            resolvedTypes: result.resolvedTypes,
            paramOverrides: { defaultBandSize: 28 },  // box+whisker needs wider bands
            colorActsAsGroup,  // dodge-by-color → budget band per category, shrink lanes
            ...(groupLaneCount ? { groupLaneCount } : {}),
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);

        // Whisker convention + outlier visibility (design choices, not styling).
        //   whiskerMethod 'minmax' → whiskers span the full data range; VL draws
        //     no outlier points (they are inside the whiskers by definition).
        //   whiskerMethod 'iqr' (default) → Tukey 1.5×IQR whiskers; points beyond
        //     the fences render as outliers unless suppressed.
        const props = ctx.chartProperties;
        const useMinMax = props?.whiskerMethod === 'minmax';
        if (useMinMax) {
            spec.mark = setMarkProp(spec.mark, 'extent', 'min-max');
        }
        // `showOutliers` defaults to true. With min-max whiskers there are no
        // outliers anyway, so hiding them is implicit.
        if (useMinMax || props?.showOutliers === false) {
            spec.mark = setMarkProp(spec.mark, 'outliers', false);
        }

        const layout = ctx.layout;
        const hasDiscreteX = layout.xNominalCount > 0;
        const hasDiscreteAxis = hasDiscreteX || layout.yNominalCount > 0;

        // Grouped boxplots: a color field subdividing a categorical axis must
        // dodge the boxes side-by-side (xOffset/yOffset), not overlay them at the
        // same position — overlaid boxes hide whichever is drawn underneath.
        // Vega-Lite needs an explicit offset encoding to lay grouped boxes out.
        // But only dodge when color actually subdivides a band: when it's
        // redundant/nested with the axis (`color == x`, or a 1:1 field pair),
        // `planBandDodge` returns `dodge:false` and we fall through to the
        // single-band branch below (one full-width box per category).
        const colorEnc = spec.encoding?.color;
        let subgroups = 1;
        let localSeparatorAxis: 'x' | 'y' | undefined;
        let localSeparatorValues: Record<string, unknown>[] = [];
        const colorField = ctx.channelSemantics?.color?.field;
        const axisField = hasDiscreteX
            ? ctx.channelSemantics?.x?.field
            : ctx.channelSemantics?.y?.field;
        if (
            colorEnc?.field && colorField && axisField
            && isDiscreteType(ctx.channelSemantics?.color?.type)
            && hasDiscreteAxis && !spec.encoding.xOffset && !spec.encoding.yOffset
        ) {
            const plan = planBandDodge(ctx.fullTable ?? ctx.table, axisField, colorField, {
                nestedSnapThreshold: ctx.chartProperties?.nestedSnapThreshold,
            });
            const resolved = resolveDodge(plan, ctx.chartProperties?.dodge);
            if (resolved.mode !== 'none') {
                const offsetChannel = hasDiscreteX ? 'xOffset' : 'yOffset';
                subgroups = Math.max(1, resolved.laneCount);
                if (resolved.mode === 'local') {
                    // Compact + centered: a quantitative offset over the band's
                    // [-0.5, 0.5] range places each band's boxes centered, using
                    // only maxPerBand lanes. Native axis labels stay centered.
                    const maxPB = Math.max(1, plan.maxPerBand);
                    spec.encoding[offsetChannel] = {
                        field: '__off', type: 'quantitative',
                        scale: { domain: [-0.5, 0.5] }, axis: null,
                    };
                    spec.transform = [
                        ...(spec.transform ?? []),
                        { window: [{ op: 'dense_rank', as: '__laneIdx' }], groupby: [axisField], sort: [{ field: colorField, order: 'ascending' }] },
                        { joinaggregate: [{ op: 'distinct', field: colorField, as: '__localCount' }], groupby: [axisField] },
                        { calculate: `((datum.__laneIdx - 1) - (datum.__localCount - 1) / 2) / ${maxPB}`, as: '__off' },
                    ];
                    localSeparatorAxis = hasDiscreteX ? 'x' : 'y';
                    const categories = [...new Set((ctx.fullTable ?? ctx.table).map((row) => row[axisField]))];
                    localSeparatorValues = categories.slice(0, -1).map((category) => ({ [axisField]: category }));
                } else {
                    // Global: a fixed lane per distinct color across all bands.
                    const offsetEnc: Record<string, unknown> = { field: colorEnc.field, type: 'nominal' };
                    if (colorEnc.sort !== undefined) offsetEnc.sort = colorEnc.sort;
                    spec.encoding[offsetChannel] = offsetEnc;
                }
            }
        }

        // Scale box width to the step size of the discrete axis. Each band is
        // subdivided into `subgroups` sub-lanes. VL's position band reserves ~20%
        // of the step as inter-band padding (both the nominal `global` offset and
        // the quantitative `local` offset map into that ~80% usable width), so the
        // per-lane pitch is `step * USABLE_BAND_FRACTION / subgroups`.
        if (hasDiscreteAxis) {
            const boxStep = hasDiscreteX ? layout.xStep : layout.yStep;
            if (subgroups > 1) {
                const lanePitch = (boxStep * USABLE_BAND_FRACTION) / subgroups;
                const boxSize = Math.max(2, Math.round(lanePitch * GROUPED_BOXPLOT_LANE_FILL));
                spec.mark = setMarkProp(spec.mark, 'size', boxSize);
            } else {
                const boxSize = Math.max(4, Math.round(boxStep * BOXPLOT_BAND_FILL));
                spec.mark = setMarkProp(spec.mark, 'size', boxSize);
            }
        }

        if (localSeparatorAxis && localSeparatorValues.length > 0) {
            const boxLayer = { mark: spec.mark, encoding: spec.encoding, transform: spec.transform };
            const axisEncoding = spec.encoding[localSeparatorAxis];
            spec.layer = [
                {
                    data: { values: localSeparatorValues },
                    mark: { type: 'rule', stroke: '#c9ced6', strokeDash: [4, 4], strokeWidth: 1, opacity: 0.75 },
                    encoding: {
                        [localSeparatorAxis]: {
                            field: axisField,
                            type: 'nominal',
                            sort: axisEncoding.sort,
                            bandPosition: 1,
                        },
                    },
                },
                boxLayer,
            ];
            delete spec.mark;
            delete spec.encoding;
            delete spec.transform;
        }
    },
    properties: [
        {
            key: 'whiskerMethod', label: 'Whiskers', type: 'discrete',
            options: [
                { value: 'iqr', label: 'Tukey (1.5 × IQR)' },
                { value: 'minmax', label: 'Min–Max' },
            ],
            defaultValue: 'iqr',
        },
        {
            key: 'showOutliers', label: 'Outliers', type: 'binary', defaultValue: true,
            // Outliers exist only with Tukey whiskers; min–max whiskers absorb
            // every point, so the toggle is irrelevant there.
            check: (ctx) => ({ applicable: ctx.chartProperties?.whiskerMethod !== 'minmax' }),
        },
        {
            key: 'dodge', label: 'Dodge', type: 'discrete',
            options: [
                { value: 'auto',   label: 'Auto' },
                { value: 'local',  label: 'Local (compact)' },
                { value: 'global', label: 'Global (aligned)' },
            ],
            defaultValue: 'auto',
            // Surface whenever color genuinely subdivides a band (maxPerBand > 1),
            // so the user can pick none / local / global; the compiler default is
            // reported as `recommendedValue`.
            check: (ctx) => {
                const colorField = ctx.channelSemantics?.color?.field;
                const xType = ctx.channelSemantics?.x?.type;
                const axisField = isDiscreteType(xType)
                    ? ctx.channelSemantics?.x?.field
                    : ctx.channelSemantics?.y?.field;
                const rows = ctx.data;
                if (!colorField || !axisField || !isDiscreteType(ctx.channelSemantics?.color?.type) || !rows) {
                    return { applicable: false };
                }
                const plan = planBandDodge(rows, axisField, colorField, {
                    nestedSnapThreshold: ctx.chartProperties?.nestedSnapThreshold,
                });
                return {
                    applicable: plan.ambiguous,
                    recommendedValue: plan.mode === 'none' ? 'auto' : plan.mode,
                };
            },
        },
    ] as ChartPropertyDef[],
};
