// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { computeCircumferencePressure, computeEffectiveBarCount } from '../../core/decisions';
import { setMarkProp } from './utils';

export const pieChartDef: ChartTemplateDef = {
    chart: "Pie Chart",
    template: { mark: "arc", encoding: {} },
    channels: ["size", "color", "column", "row"],
    markCognitiveChannel: 'area',
    geometryKinds: ['arc'],
    instantiate: (spec, ctx) => {
        // Remap abstract channels to VL channels:
        //   "size" → VL "theta" (angular extent of each slice)
        if (!spec.encoding) spec.encoding = {};
        for (const [ch, enc] of Object.entries(ctx.resolvedEncodings)) {
            if (ch === 'size') {
                // Strip the sqrt/range scale that the assembler adds for generic
                // "size" channels — theta handles its own proportional scaling.
                const { scale: _scale, ...thetaEnc } = enc;
                spec.encoding.theta = thetaEnc;
            } else {
                spec.encoding[ch] = enc;
            }
        }

        // Fallback: when the user only maps color (no size/theta), use count
        // so every colour group gets a proportional slice.
        if (!spec.encoding.theta) {
            spec.encoding.theta = { aggregate: 'count', type: 'quantitative' };
        }

        const config = ctx.chartProperties;
        if (config && config.innerRadius > 0) {
            spec.mark = setMarkProp(spec.mark, 'innerRadius', config.innerRadius);
        }

        // ── Circumference-pressure sizing (spring model) ──────────────
        // Compute effective bar count from slice values to determine
        // whether the pie needs to grow beyond the base canvas.
        const thetaField = spec.encoding.theta?.field;
        const colorField = spec.encoding.color?.field;

        // Slice ordering (design choice): default keeps the data/category order;
        // sorting by value leads with the largest or smallest slice. Arc slice
        // order follows the `order` channel; `color.sort` keeps the legend in
        // step with the wedges.
        const sortSlices = config?.sortSlices;
        if (sortSlices === 'descending' || sortSlices === 'ascending') {
            spec.encoding.order = thetaField
                ? { field: thetaField, type: 'quantitative', sort: sortSlices }
                : { aggregate: 'count', type: 'quantitative', sort: sortSlices };
            if (spec.encoding.color) {
                spec.encoding.color = {
                    ...spec.encoding.color,
                    sort: thetaField
                        ? { field: thetaField, op: 'sum', order: sortSlices }
                        : { op: 'count', order: sortSlices },
                };
            }
        }

        let effectiveCount: number;

        if (thetaField && colorField) {
            // Aggregate values per color category
            const agg = new Map<string, number>();
            for (const row of ctx.table) {
                const cat = String(row[colorField] ?? '');
                const val = Number(row[thetaField]) || 0;
                agg.set(cat, (agg.get(cat) ?? 0) + val);
            }
            effectiveCount = computeEffectiveBarCount([...agg.values()]);
        } else if (colorField) {
            // Count-based: each category gets equal slice
            const cats = new Set(ctx.table.map((r: any) => String(r[colorField] ?? '')));
            effectiveCount = cats.size;
        } else {
            effectiveCount = ctx.table.length;
        }

        const { radius, canvasW, canvasH } = computeCircumferencePressure(
            effectiveCount, ctx.canvasSize, {
                minArcPx: 45,
                minRadius: 60,
                maxStretch: ctx.assembleOptions?.maxStretch,
                maxStretchX: ctx.assembleOptions?.maxStretchX,
                maxStretchY: ctx.assembleOptions?.maxStretchY,
                margin: 50,   // room for labels around pie
            });

        // Set explicit width/height — overrides config.view defaults
        spec.width = canvasW;
        spec.height = canvasH;
    },
    properties: [
        { key: "innerRadius", label: "Donut", type: "continuous", min: 0, max: 100, step: 5, defaultValue: 0 },
        {
            key: 'sortSlices', label: 'Sort slices', type: 'discrete',
            options: [
                { value: 'none', label: 'Data order' },
                { value: 'descending', label: 'Largest first' },
                { value: 'ascending', label: 'Smallest first' },
            ],
            defaultValue: 'none',
        },
    ] as ChartPropertyDef[],
};

/** The hole a Donut Chart gets when the caller sets no `innerRadius`. */
const DONUT_DEFAULT_INNER_RADIUS = 50;

export const donutChartDef: ChartTemplateDef = {
    ...pieChartDef,
    chart: "Donut Chart",
    // A donut is a pie with a hole. Property defaults are not merged into
    // `chartProperties` at assemble time (only discrete options are coerced),
    // so a Donut Chart authored without an explicit `innerRadius` would inherit
    // the pie's hole-less 0 and render as a full pie. Carry a non-zero default
    // and apply it here before delegating to the pie's instantiate.
    properties: (pieChartDef.properties ?? []).map((p) =>
        p.key === 'innerRadius' ? { ...p, defaultValue: DONUT_DEFAULT_INNER_RADIUS } : p,
    ) as ChartPropertyDef[],
    instantiate: (spec, ctx) => {
        const innerRadius = ctx.chartProperties?.innerRadius;
        const withHole =
            innerRadius == null
                ? { ...ctx, chartProperties: { ...(ctx.chartProperties ?? {}), innerRadius: DONUT_DEFAULT_INNER_RADIUS } }
                : ctx;
        pieChartDef.instantiate(spec, withHole);
    },
};
