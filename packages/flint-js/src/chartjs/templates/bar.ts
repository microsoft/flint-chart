// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Bar Chart templates: Bar, Stacked Bar, Grouped Bar.
 *
 * Key contrast with Vega-Lite:
 *   VL: encoding channels determine stacking/grouping implicitly
 *   CJS: explicit datasets[] with stacked option on scales
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';
import {
  resolveCategoryOrder,
  groupBy,
  detectAxes,
  buildCategoryAlignedData,
  getChartJsPalette,
  getSeriesBorderColor,
  getSeriesBackgroundColor,
} from './utils';
import {
    detectBandedAxisFromSemantics, detectBandedAxisForceDiscrete,
} from '../../core/axis-detection';
import { planBandDodge, resolveDodge } from '../../core/band-dodge';
import { makeCartesianPivot } from '../../core/pivot';
import { makeSortAction } from '../../core/encoding-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

// ─── Bar Chart ──────────────────────────────────────────────────────────────

export const cjsBarChartDef: ChartTemplateDef = {
    chart: 'Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const catEnc = ctx.encodings?.[categoryAxis];
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: catCS?.ordinalSortOrder,
            sortBy: sortByField,
            sortOrder: catEnc?.sortOrder,
        });
        const values = buildCategoryAlignedData(table, catField, valField, categories);

        const isHorizontal = categoryAxis === 'y';

        const palette = getChartJsPalette(ctx);

        const config: any = {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [{
                    label: valField,
                    data: values,
                    backgroundColor: getSeriesBackgroundColor(palette, 0),
                    borderColor: getSeriesBorderColor(palette, 0),
                    borderWidth: 1,
                    borderRadius: chartProperties?.cornerRadius ?? 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isHorizontal ? 'y' as const : 'x' as const,
                scales: {
                    x: {
                        title: { display: true, text: isHorizontal ? valField : catField },
                        ...(isHorizontal ? {} : {}),
                    },
                    y: {
                        title: { display: true, text: isHorizontal ? catField : valField },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true },
                },
            },
        };

        // Apply zero-baseline from semantic decision
        const valScale = isHorizontal ? 'x' : 'y';
        const valCS = channelSemantics[valueAxis];
        if (valCS?.zero) {
            config.options.scales[valScale].beginAtZero = valCS.zero.zero !== false;
        } else {
            // Default: bars should include zero for length integrity
            config.options.scales[valScale].beginAtZero = true;
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 15, step: 1, defaultValue: 0 },
    ] as ChartPropertyDef[],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};

// ─── Stacked Bar Chart ──────────────────────────────────────────────────────

export const cjsStackedBarChartDef: ChartTemplateDef = {
    chart: 'Stacked Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
            paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } },
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const colorField = channelSemantics.color?.field;
        const hasStackSeries = !!colorField;

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const catEnc = ctx.encodings?.[categoryAxis];
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: catCS?.ordinalSortOrder,
            sortBy: sortByField,
            sortOrder: catEnc?.sortOrder,
        });
        const isHorizontal = categoryAxis === 'y';

        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isHorizontal ? 'y' as const : 'x' as const,
                scales: {
                    x: {
                        stacked: hasStackSeries,
                        title: { display: true, text: isHorizontal ? valField : catField },
                    },
                    y: {
                        stacked: hasStackSeries,
                        title: { display: true, text: isHorizontal ? catField : valField },
                    },
                },
                plugins: {
                    legend: { display: !!colorField },
                    tooltip: { enabled: true },
                },
            },
        };

        if (colorField) {
            const groups = groupBy(table, colorField);
            let colorIdx = 0;
            for (const [name, rows] of groups) {
                const values = buildCategoryAlignedData(rows, catField, valField, categories);
                config.data.datasets.push({
                    label: name,
                    data: values,
                    backgroundColor: getSeriesBackgroundColor(palette, colorIdx),
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    borderWidth: 1,
                });
                colorIdx++;
            }
        } else {
            const values = buildCategoryAlignedData(table, catField, valField, categories);
            config.data.datasets.push({
                label: valField,
                data: values,
                backgroundColor: getSeriesBackgroundColor(palette, 0),
                borderColor: getSeriesBorderColor(palette, 0),
                borderWidth: 1,
            });
        }

        // Apply zero-baseline from semantic decision
        const valScaleS = isHorizontal ? 'x' : 'y';
        const valCSs = channelSemantics[valueAxis];
        if (valCSs?.zero) {
            config.options.scales[valScaleS].beginAtZero = valCSs.zero.zero !== false;
        } else {
            config.options.scales[valScaleS].beginAtZero = true;
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
        // θ (→ Grouped Bar) declared centrally in core/chart-transitions.ts.
    }),
};

// ─── Grouped Bar Chart ──────────────────────────────────────────────────────

export const cjsGroupedBarChartDef: ChartTemplateDef = {
    chart: 'Grouped Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'group', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table, chartProperties) => {
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        const decl: any = {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
            paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } },
        };
        const groupField = cs.group?.field || cs.color?.field;
        const axisField = result?.axis ? cs[result.axis]?.field : (isDiscrete(cs.x?.type) ? cs.x?.field : cs.y?.field);
        if (groupField && axisField) {
            const plan = planBandDodge(table, axisField, groupField);
            const { mode } = resolveDodge(plan, chartProperties?.dodge);
            if (mode === 'local') decl.groupLaneCount = Math.max(1, plan.maxPerBand);
        }
        return decl;
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const groupField = channelSemantics.group?.field || channelSemantics.color?.field;

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const catEnc = ctx.encodings?.[categoryAxis];
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: catCS?.ordinalSortOrder,
            sortBy: sortByField,
            sortOrder: catEnc?.sortOrder,
        });
        const isHorizontal = categoryAxis === 'y';

        const palette = getChartJsPalette(ctx, 'group');

        // Decide compact (local) vs fixed-lane (global) dodge.
        const dodgePlan = groupField ? planBandDodge(table, catField, groupField) : null;
        const dodgeMode = dodgePlan ? resolveDodge(dodgePlan, chartProperties?.dodge).mode : 'none';

        const config: any = {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isHorizontal ? 'y' as const : 'x' as const,
                scales: {
                    x: {
                        title: { display: true, text: isHorizontal ? valField : catField },
                    },
                    y: {
                        title: { display: true, text: isHorizontal ? catField : valField },
                    },
                },
                plugins: {
                    legend: { display: !!groupField },
                    tooltip: { enabled: true },
                },
            },
        };

        if (groupField && dodgeMode === 'local') {
            // Local (compact) dodge: pack only `maxPerBand` lanes per band,
            // left-aligned. Each lane is a dataset; a band with fewer present
            // groups leaves trailing lanes null. Bars are colored per-datum by
            // their group value, and a custom legend maps group → swatch (lane
            // dataset labels are synthetic).
            const globalGroups: string[] = [...new Set(table.map((r) => String(r[groupField] ?? '')))].filter(Boolean).sort();
            const colorFor = (g: string) => getSeriesBackgroundColor(palette, Math.max(0, globalGroups.indexOf(g)));
            const borderFor = (g: string) => getSeriesBorderColor(palette, Math.max(0, globalGroups.indexOf(g)));

            // Per-band ordered present groups → lane index.
            const perBand = new Map<string, string[]>();
            for (const cat of categories) perBand.set(cat, []);
            for (const r of table) {
                const cat = String(r[catField] ?? '');
                const g = String(r[groupField] ?? '');
                if (!perBand.has(cat) || !g) continue;
                const arr = perBand.get(cat)!;
                if (!arr.includes(g)) arr.push(g);
            }
            for (const arr of perBand.values()) arr.sort();
            const maxPerBand = Math.max(1, ...[...perBand.values()].map((a) => a.length));

            const valAt = new Map<string, number>();
            for (const r of table) {
                const v = Number(r[valField]);
                if (isFinite(v)) valAt.set(`${r[catField]}\u0000${r[groupField]}`, v);
            }

            for (let lane = 0; lane < maxPerBand; lane++) {
                const data: (number | null)[] = [];
                const bg: string[] = [];
                const bd: string[] = [];
                for (const cat of categories) {
                    const g = perBand.get(cat)?.[lane];
                    if (g === undefined) { data.push(null); bg.push('transparent'); bd.push('transparent'); continue; }
                    const v = valAt.get(`${cat}\u0000${g}`);
                    data.push(v === undefined ? null : v);
                    bg.push(colorFor(g));
                    bd.push(borderFor(g));
                }
                config.data.datasets.push({
                    label: `__lane${lane}`,
                    data,
                    backgroundColor: bg,
                    borderColor: bd,
                    borderWidth: 1,
                });
            }

            // Custom legend: one swatch per group value (not per lane).
            config.options.plugins.legend = {
                display: true,
                labels: {
                    generateLabels: () => globalGroups.map((g) => ({
                        text: g,
                        fillStyle: colorFor(g),
                        strokeStyle: borderFor(g),
                        lineWidth: 1,
                    })),
                },
            };
        } else if (groupField) {
            const groups = groupBy(table, groupField);
            let colorIdx = 0;
            for (const [name, rows] of groups) {
                const values = buildCategoryAlignedData(rows, catField, valField, categories);
                config.data.datasets.push({
                    label: name,
                    data: values,
                    backgroundColor: getSeriesBackgroundColor(palette, colorIdx),
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    borderWidth: 1,
                });
                colorIdx++;
            }
        } else {
            const values = buildCategoryAlignedData(table, catField, valField, categories);
            config.data.datasets.push({
                label: valField,
                data: values,
                backgroundColor: getSeriesBackgroundColor(palette, 0),
                borderColor: getSeriesBorderColor(palette, 0),
                borderWidth: 1,
            });
        }

        // Apply zero-baseline from semantic decision
        const valScaleG = isHorizontal ? 'x' : 'y';
        const valCSg = channelSemantics[valueAxis];
        if (valCSg?.zero) {
            config.options.scales[valScaleG].beginAtZero = valCSg.zero.zero !== false;
        } else {
            config.options.scales[valScaleG].beginAtZero = true;
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'dodge', label: 'Dodge', type: 'discrete',
            options: [
                { value: 'auto',   label: 'Auto' },
                { value: 'local',  label: 'Local (compact)' },
                { value: 'global', label: 'Global (aligned)' },
            ],
            defaultValue: 'auto',
            check: (ctx) => {
                const isDisc = (t: string | undefined) => t === 'nominal' || t === 'ordinal';
                const groupField = ctx.channelSemantics?.group?.field
                    ?? ctx.channelSemantics?.color?.field
                    ?? ctx.encodings?.group?.field
                    ?? ctx.encodings?.color?.field;
                const axisField = isDisc(ctx.channelSemantics?.x?.type)
                    ? ctx.channelSemantics?.x?.field
                    : ctx.channelSemantics?.y?.field;
                const rows = ctx.data;
                if (!groupField || !axisField || !rows) return { applicable: false };
                const plan = planBandDodge(rows, axisField, groupField);
                return { applicable: plan.ambiguous, recommendedValue: plan.mode === 'none' ? 'auto' : plan.mode };
            },
        },
    ] as ChartPropertyDef[],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
        // θ (→ Stacked Bar) declared centrally in core/chart-transitions.ts.
    }),
};
