// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { detectBandedAxisForceDiscrete } from '../../core/axis-detection';
import { planBandDodge, resolveDodge } from '../../core/band-dodge';
import {
    defaultBuildEncodings, applyPointSizeScaling, setMarkProp,
} from './utils';
import { makeCartesianPivot } from '../../core/pivot';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    legendMatchedHits,
    MUTED_HOVER_FILL,
    MUTED_HOVER_STROKE,
    targetFromHits,
} from '../../core/interaction-semantics';
import { presentInteractionUpdate } from '../../interactive/chart-update';

const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

// Fraction of the band/lane step a boxplot box should occupy. An ungrouped box
// fills most of its category band; a grouped (dodged) box fills most of its
// per-subgroup lane. The remainder becomes the gap between adjacent boxes.
const BOXPLOT_BAND_FILL = 0.7;
// A dodged box should leave a legible gap between adjacent lanes, otherwise a
// quartet of boxes reads as one solid multi-colour block. 0.7 keeps the box
// substantial while opening a clear ~30%-of-lane channel between neighbours.
const GROUPED_BOXPLOT_LANE_FILL = 0.7;
// Half-width of the raw-observation jitter cloud, as a fraction of one lane.
// 0.3 spreads the points across the middle ~60% of the lane, so the cloud sits
// inside its box rather than spilling over the neighbouring one.
const POINT_JITTER_FRACTION = 0.3;
// Ink for the box skeleton once the box is hollow — dark and neutral, so the
// median reads as a summary statistic rather than as another category.
const SILHOUETTE_INK = '#2b2f36';
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
    semanticInteractions: ({ resolvedEncodings }) => {
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const shapeOnlyHover = resolvedEncodings.shape?.field && !resolvedEncodings.color?.field
            ? { fill: MUTED_HOVER_FILL }
            : {};
        const legendFields = Object.fromEntries(
            ['color', 'size', 'shape']
                .map((channel) => [channel, resolvedEncodings[channel]?.field])
                .filter((entry): entry is [string, string] => !!entry[1]),
        );
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'color', 'size', 'shape']),
            seriesField,
            legendFields,
            selectableMarks: ['circle', 'point'],
            renderHoverStyles: {
                symbol: { ...shapeOnlyHover, stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            resolve: (event, context) => {
                const legendField = event.legendField ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                return targetFromHits(hits, context.keyField, { kind: 'mark', role: 'point' });
            },
            presentUpdate: presentInteractionUpdate(() => ({ anchor: 'center', placement: 'above' })),
        };
    },
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
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = firstDiscreteEncodingField(resolvedEncodings, ['x', 'y']);
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'color']),
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['line', 'point'],
            renderHoverStyles: {
                line: { strokeWidth: 3 },
                symbol: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            resolve: (event, context) => {
                const legendField = event.legendField ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                const markType = event.hits[0]?.markType;
                const kind = markType === 'line' ? 'path' : 'mark';
                const role = event.role === 'legend-item'
                    ? 'legend-item'
                    : markType === 'symbol'
                    ? 'point'
                    : markType ?? event.role;
                return targetFromHits(hits, context.keyField, { kind, role });
            },
            presentUpdate: presentInteractionUpdate(() => ({ anchor: 'center', placement: 'auto' })),
        };
    },
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
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = firstDiscreteEncodingField(resolvedEncodings, ['x', 'y']);
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: [...new Set([
                ...fieldsFromEncodingChannels(resolvedEncodings, ['color']),
                ...(categoryField ? [categoryField] : []),
            ])],
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['boxplot'],
            renderHoverStyles: {
                rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
                rule: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
                symbol: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            resolve: (event, context) => {
                const legendField = event.legendField ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                return targetFromHits(hits, context.keyField, { kind: 'mark', role: 'distribution' });
            },
            presentUpdate: presentInteractionUpdate(() => ({ anchor: 'center', placement: 'auto' })),
        };
    },
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
            paramOverrides: { defaultBandSize: 28, groupBandFillsLanes: true },  // box+whisker needs wider bands; grouped lanes each get full width
            colorActsAsGroup,  // dodge-by-color → budget band per category, shrink lanes
            ...(groupLaneCount ? { groupLaneCount } : {}),
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);

        const props = ctx.chartProperties;
        const layout = ctx.layout;
        const hasDiscreteX = layout.xNominalCount > 0;
        const hasDiscreteAxis = hasDiscreteX || layout.yNominalCount > 0;

        // `showPoints` overlays every raw observation on top of the box. A box
        // summarises a sample; at small n it can summarise almost nothing, so
        // being able to show the sample is what makes the summary honest.
        // Jitter needs a band to scatter within, hence the discrete-axis gate.
        const showPoints = props?.showPoints === true && hasDiscreteAxis;

        // Whisker convention + outlier visibility (design choices, not styling).
        //   whiskerMethod 'minmax' → whiskers span the full data range; VL draws
        //     no outlier points (they are inside the whiskers by definition).
        //   whiskerMethod 'iqr' (default) → Tukey 1.5×IQR whiskers; points beyond
        //     the fences render as outliers unless suppressed.
        const useMinMax = props?.whiskerMethod === 'minmax';
        if (useMinMax) {
            spec.mark = setMarkProp(spec.mark, 'extent', 'min-max');
        }
        // `showOutliers` defaults to true. With min-max whiskers there are no
        // outliers anyway, so hiding them is implicit — and when every point is
        // already drawn, the outlier marks would be duplicates.
        if (useMinMax || props?.showOutliers === false || showPoints) {
            spec.mark = setMarkProp(spec.mark, 'outliers', false);
        }

        // Drawing the sample inverts the visual hierarchy. Normally the box is
        // the figure and there is nothing behind it; once every observation is
        // on the page the sample becomes the figure and the box demotes to
        // scaffolding over it. So the box gives up its fill and keeps only an
        // outline, and the colour encoding moves to the points — encoding the
        // group twice, in fill and in point colour, would just be redundant ink.
        // `filled: false` is the switch that redirects the colour encoding from
        // the box's fill to its stroke.
        if (showPoints) {
            spec.mark = setMarkProp(spec.mark, 'box', { filled: false, strokeWidth: 1.5 });
            // The median rule is white by default so it reads against a filled
            // box; over a hollow one it would disappear. It is the single
            // most-read feature of a boxplot, so it gets the darkest ink at
            // full strength (the boxplot theme dims marks to 0.7, which would
            // let the point cloud show through it).
            spec.mark = setMarkProp(spec.mark, 'median', {
                color: SILHOUETTE_INK, strokeWidth: 2, opacity: 1,
            });
        }

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
        // How far a box is pushed off its band centre, as an expression in
        // offset-scale domain units (the [-0.5, 0.5] domain spans one band, so
        // one lane is `1 / subgroups` wide). '0' = undodged, sits dead centre.
        // The point overlay reuses this so a point always lands on its own box.
        let laneOffsetExpr = '0';
        // Transforms the lane expression depends on, replayed on the point layer.
        let laneTransforms: Record<string, unknown>[] = [];
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
                    laneTransforms = [
                        { window: [{ op: 'dense_rank', as: '__laneIdx' }], groupby: [axisField], sort: [{ field: colorField, order: 'ascending' }] },
                        { joinaggregate: [{ op: 'distinct', field: colorField, as: '__localCount' }], groupby: [axisField] },
                    ];
                    laneOffsetExpr = `((datum.__laneIdx - 1) - (datum.__localCount - 1) / 2) / ${maxPB}`;
                    spec.encoding[offsetChannel] = {
                        field: '__off', type: 'quantitative',
                        scale: { domain: [-0.5, 0.5] }, axis: null,
                    };
                    spec.transform = [
                        ...(spec.transform ?? []),
                        ...laneTransforms,
                        { calculate: laneOffsetExpr, as: '__off' },
                    ];
                    localSeparatorAxis = hasDiscreteX ? 'x' : 'y';
                    const categories = [...new Set((ctx.fullTable ?? ctx.table).map((row) => row[axisField]))];
                    localSeparatorValues = categories.slice(0, -1).map((category) => ({ [axisField]: category }));
                } else if (showPoints) {
                    // Global lanes, with a point overlay. A *nominal* offset can
                    // carry a lane but not the extra jitter the points need, and
                    // one channel admits one scale — so resolve the lane index in
                    // the spec instead and let both layers share one quantitative
                    // offset. Lane order follows the declared colour sort, so the
                    // lanes still match the legend.
                    const laneOrder = (Array.isArray(colorEnc.sort) && colorEnc.sort.length > 0
                        ? colorEnc.sort
                        : [...new Set((ctx.fullTable ?? ctx.table).map((row) => row[colorField]))].sort()
                    ).map((value: unknown) => String(value));
                    subgroups = Math.max(1, laneOrder.length);
                    laneOffsetExpr = `(indexof(${JSON.stringify(laneOrder)}, toString(datum[${JSON.stringify(colorField)}])) - ${(subgroups - 1) / 2}) / ${subgroups}`;
                    spec.encoding[offsetChannel] = {
                        field: '__off', type: 'quantitative',
                        scale: { domain: [-0.5, 0.5] }, axis: null,
                    };
                    spec.transform = [
                        ...(spec.transform ?? []),
                        { calculate: laneOffsetExpr, as: '__off' },
                    ];
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

        let separatorLayer: Record<string, unknown> | undefined;
        if (localSeparatorAxis && localSeparatorValues.length > 0) {
            const axisEncoding = spec.encoding[localSeparatorAxis];
            separatorLayer = {
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
            };
        }

        // The raw-observation overlay. Points ride on the same offset channel as
        // the boxes: lane position (so a point sits on its own box) plus jitter
        // (so coincident values do not stack into one dot). The offset scale's
        // [-0.5, 0.5] domain maps onto the band, which keeps the cloud centred
        // whatever the band width works out to — measuring jitter in pixels
        // silently drifts off-centre when the layout changes the step.
        let pointLayer: Record<string, unknown> | undefined;
        if (showPoints) {
            const offsetChannel = hasDiscreteX ? 'xOffset' : 'yOffset';
            const lanePitch = ((hasDiscreteX ? layout.xStep : layout.yStep) * USABLE_BAND_FRACTION) / subgroups;
            // `size` is point AREA in px²; keep the glyph well inside its lane.
            const pointSize = Math.max(8, Math.min(30, Math.round(lanePitch * 0.6)));
            const jitter = `(random() * 2 - 1) * ${(POINT_JITTER_FRACTION / subgroups).toFixed(5)}`;
            pointLayer = {
                transform: [
                    ...laneTransforms,
                    { calculate: laneOffsetExpr === '0' ? jitter : `${laneOffsetExpr} + ${jitter}`, as: '__off' },
                ],
                mark: {
                    // Points now carry the colour encoding (see the silhouette
                    // note above), so they are the one mark spending saturated
                    // ink. Slight transparency lets dense regions read as
                    // density; the hairline white halo keeps individual points
                    // countable where they overlap.
                    type: 'point', filled: true, size: pointSize,
                    opacity: 0.7, stroke: '#ffffff', strokeWidth: 0.5,
                },
                encoding: {
                    ...(spec.encoding.x ? { x: JSON.parse(JSON.stringify(spec.encoding.x)) } : {}),
                    ...(spec.encoding.y ? { y: JSON.parse(JSON.stringify(spec.encoding.y)) } : {}),
                    ...(spec.encoding.color
                        ? { color: JSON.parse(JSON.stringify(spec.encoding.color)) }
                        : {}),
                    [offsetChannel]: {
                        field: '__off', type: 'quantitative',
                        scale: { domain: [-0.5, 0.5] }, axis: null,
                    },
                },
            };
        }

        if (separatorLayer || pointLayer) {
            const boxLayer: Record<string, unknown> = { mark: spec.mark, encoding: spec.encoding };
            if (spec.transform) boxLayer.transform = spec.transform;
            // The hollow box goes on top of the cloud: it costs almost no ink to
            // occlude, and the quartile edges and median have to stay crisp
            // exactly where the points are densest.
            spec.layer = [
                ...(separatorLayer ? [separatorLayer] : []),
                ...(pointLayer ? [pointLayer] : []),
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
            key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false,
            // Jitter needs a band to scatter within, so this is only meaningful
            // once one position axis is discrete.
            check: (ctx) => ({
                applicable: isDiscreteType(ctx.channelSemantics?.x?.type)
                    || isDiscreteType(ctx.channelSemantics?.y?.type),
            }),
        },
        {
            key: 'showOutliers', label: 'Outliers', type: 'binary', defaultValue: true,
            // Outliers exist only with Tukey whiskers; min–max whiskers absorb
            // every point, so the toggle is irrelevant there. And once every
            // observation is drawn, the outlier marks are just duplicates.
            check: (ctx) => ({
                applicable: ctx.chartProperties?.whiskerMethod !== 'minmax'
                    && ctx.chartProperties?.showPoints !== true,
            }),
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
