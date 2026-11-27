// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress single-variable distribution templates: Histogram and Density.
 *
 * CanvasXpress bins/estimates a SAMPLE (a column), so a one-variable distribution
 * is modelled with the raw values down a single column — the TRANSPOSE of the
 * y-matrix:
 *   data.y.vars = one id per observation   (rows)
 *   data.y.smps = [valueField]             (the single sample to summarise)
 *   data.y.data = [[v], [v], …]            (N × 1)
 *   config.xAxis = [valueField]
 * Histogram is a Scatter2D with `showHistogram`; Density is graphType 'Density'.
 */

import { ChartTemplateDef } from '../../core/types';
import { encodingField, facetLayoutTopology } from './channel-kind';

/**
 * Build the transposed single-column data CanvasXpress histograms/density-plots.
 * Any bound colour/group or facet fields ride as per-variable `z` annotations (one
 * value per observation), which `showHistogram`/`colorBy`/`segregateVariablesBy`
 * split the distribution by.
 * @private
 */
function buildTransposedSingle(table: any[], valueField: string, annotationFields: string[] = []) {
    const vars: string[] = [];
    const data: (number | null)[][] = [];
    const z: Record<string, string[]> = {};
    for (const f of annotationFields) z[f] = [];
    for (let i = 0; i < table.length; i++) {
        const raw = table[i][valueField];
        const n = raw == null || raw === '' ? null : Number(raw);
        vars.push('obs' + (i + 1));
        data.push([Number.isNaN(n as number) ? null : n]);
        for (const f of annotationFields) z[f].push(String(table[i][f]));
    }
    const y = { vars, smps: [valueField], data };
    return annotationFields.length ? { y, z } : { y };
}

export const cxHistogramDef: ChartTemplateDef = {
    chart: 'Histogram',
    template: { graphType: 'Scatter2D', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table } = ctx;
        const valueField = channelSemantics.x?.field;
        if (!valueField) return;

        const colorField = channelSemantics.color?.field;

        spec.graphType = 'Scatter2D';
        spec.data = buildTransposedSingle(table, valueField, colorField ? [colorField] : []);
        spec.config = {
            ...spec.config,
            graphType: 'Scatter2D',
            // A histogram is a Scatter2D that bins the chosen sample into frequency bars.
            // With a colour group, `showHistogram` names the per-variable annotation to
            // split by; the bars STACK per bin (Vega-Lite's binned-+-colour default).
            showHistogram: colorField || true,
            ...(colorField ? { histogramType: 'stacked', colorBy: colorField } : {}),
            histogramBins: 12,
            xAxis: [valueField],
            xAxisTitle: valueField,
            yAxisTitle: 'Count',
            showLegend: !!colorField,
        };
    },
};

export const cxDensityDef: ChartTemplateDef = {
    chart: 'Density Plot',
    template: { graphType: 'Density', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, chartProperties, encodings } = ctx;
        const valueField = channelSemantics.x?.field;
        if (!valueField) return;

        // CanvasXpress's Density (Scatter2D + filled KDE) splits by `colorBy` — one
        // filled, layered curve per colour value (Vega-Lite's density-+-colour default).
        const colorField = channelSemantics.color?.field;
        const encs = (encodings as any) || {};
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;

        const annotations: string[] = [];
        if (colorField) annotations.push(colorField);
        if (facetField && facetField !== colorField) annotations.push(facetField);

        spec.graphType = 'Density';
        spec.data = buildTransposedSingle(table, valueField, annotations);
        spec.config = {
            ...spec.config,
            graphType: 'Density',
            xAxis: [valueField],
            xAxisTitle: valueField,
            showLegend: !!colorField,
            ...(colorField ? { colorBy: colorField } : {}),
        };

        // Grouped density has two distinct looks the engine supports via
        // `densityPosition`. `stackMode: 'layered'` draws every group's filled
        // curve on one shared baseline, translucent so they read through each
        // other; the default stacks the group areas so they sit apart. Only
        // meaningful once there is a colour grouping.
        if (colorField) {
            const layered = (chartProperties as any)?.stackMode === 'layered';
            spec.config.densityPosition = layered ? 'normal' : 'stacked';
            if (layered) spec.config.transparency = 0.4;
        }

        // A column/row facet splits the curves into one panel per value.
        if (facetField) {
            const nGroups = new Set(table.map((row: any) => String(row[facetField]))).size;
            spec.config.segregateVariablesBy = [facetField];
            spec.config.layoutTopology = facetLayoutTopology(nGroups, !!colFacet, (chartProperties as any)?.facetColumns);
            spec.config.layoutAdjust = false;
            spec.config.stripTextColor = 'rgb(0,0,0)';
            spec.config.stripBackgroundColor = 'rgb(255,255,255)';
        }
    },
};
