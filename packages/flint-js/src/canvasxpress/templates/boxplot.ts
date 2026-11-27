// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress distribution-by-group templates: Boxplot, Violin, Strip (Dotplot).
 *
 * These summarise the raw values of a measure within each category. CanvasXpress
 * keeps the raw observations and groups them itself, so — unlike the aggregating
 * y-matrix (buildYMatrix) — the data is one measure variable across one sample
 * per observation, with the category carried as a per-sample annotation in
 * `data.x` and named to the engine via `groupingFactors`:
 *   data.y.vars = [measureField]            (one row: the measure)
 *   data.y.smps = one id per observation    (columns)
 *   data.y.data = [[ every raw value ]]     (1 × N)
 *   data.x[groupField] = [ group per obs ]  (the category annotation)
 *   config.groupingFactors = [groupField]   (draw one box/violin/dot column per group)
 */

import { ChartTemplateDef } from '../../core/types';
import { planBandDodge } from '../../core/band-dodge';
import { encodingField, facetLayoutTopology } from './channel-kind';

/** @private */
function isDiscrete(type?: string): boolean {
    return type === 'nominal' || type === 'ordinal';
}

/**
 * Build CanvasXpress grouped-raw data: the measure as the single variable, one
 * sample per observation, and the category (plus any colour/facet) as `data.x`
 * annotations.
 * @private
 */
function buildGroupedRaw(
    table: any[],
    valueField: string,
    groupField: string,
    extraFields: string[],
) {
    const smps: string[] = [];
    const values: (number | null)[] = [];
    const x: Record<string, (string | number)[]> = { [groupField]: [] };
    for (const f of extraFields) if (f !== groupField) x[f] = [];
    for (let i = 0; i < table.length; i++) {
        const raw = table[i][valueField];
        const n = raw == null || raw === '' ? null : Number(raw);
        smps.push('obs' + (i + 1));
        values.push(Number.isNaN(n as number) ? null : n);
        for (const f of Object.keys(x)) x[f].push(table[i][f]);
    }
    return { y: { vars: [valueField], smps, data: [values] }, x };
}

/**
 * Shared distribution-by-group instantiate.
 * @private
 */
function buildDistInstantiate(graphType: 'Boxplot' | 'Violin' | 'Dotplot') {
    return (spec: any, ctx: any) => {
        const { channelSemantics, table, chartProperties, encodings } = ctx;
        // Category is the discrete channel; the measure is the quantitative one.
        const yDiscrete = isDiscrete(channelSemantics.y?.type);
        const groupField = yDiscrete ? channelSemantics.y?.field : channelSemantics.x?.field;
        const valueField = yDiscrete ? channelSemantics.x?.field : channelSemantics.y?.field;
        if (!groupField || !valueField) return;

        const colorField = channelSemantics.color?.field;
        const encs = (encodings as any) || {};
        const colFacet = channelSemantics.column?.field ?? encodingField(encs.column);
        const rowFacet = channelSemantics.row?.field ?? encodingField(encs.row);
        const facetField = colFacet || rowFacet;

        const extra: string[] = [];
        if (colorField) extra.push(colorField);
        if (facetField) extra.push(facetField);

        // Does the colour channel sub-divide each category band into side-by-side lanes
        // (dodge), or is it redundant/nested with the axis? An explicit
        // chartProperties.dodge wins; otherwise the shared band-dodge heuristic decides.
        // CanvasXpress draws only PRESENT (group, colour) combos, so its dodge is always
        // COMPACT — it cannot reserve empty lanes for a 'global' aligned grid, so 'global'
        // renders the same as 'local'. A dodging colour becomes a second grouping factor
        // (one box/violin per (group, colour)); colorBy still tints it.
        const dodgeProp = (chartProperties as any)?.dodge as string | undefined;
        let dodgeColor = false;
        if (colorField) {
            if (dodgeProp === 'none') dodgeColor = false;
            else if (dodgeProp === 'local' || dodgeProp === 'global') dodgeColor = true;
            else dodgeColor = planBandDodge(table, groupField, colorField).mode !== 'none';
        }

        // Grouping factors: the category, then a dodging colour (inner lanes), then the
        // facet field. The facet MUST be a grouping factor too — the engine only computes
        // the per-panel density (the violin/sina shape) when the segregated factor is one
        // of the grouping factors; otherwise a faceted Violin/Dotplot degrades to plain
        // boxplots in each panel.
        const groupingFactors = [groupField];
        if (dodgeColor && colorField) groupingFactors.push(colorField);
        if (facetField) groupingFactors.push(facetField);

        spec.graphType = graphType;
        spec.data = buildGroupedRaw(table, valueField, groupField, extra);

        spec.config = {
            ...spec.config,
            graphType,
            groupingFactors,
            xAxis: [valueField],
            // The value axis carries the measure name; the group axis is implied by
            // the grouping factor.
            axisTitle: valueField,
            showLegend: !!colorField,
            // The measure is the only variable (one row); the group axis comes from
            // groupingFactors and any colour from colorBy — no variable legend.
            showVariableLegend: false,
            // Colour/split the distributions by a second category.
            ...(colorField ? { colorBy: colorField } : {}),
            // Violins should show the full KDE tails, not a trimmed-to-data shape.
            ...(graphType === 'Violin' ? { violinTrim: false } : {}),
            // A strip plot is the raw jittered points only — CanvasXpress's Dotplot draws a
            // mean ± CI error bar per group by default, which is not part of a strip plot.
            ...(graphType === 'Dotplot' ? { jitter: true, showErrorBars: false } : {}),
        };

        // Faceting: segregate the observations into one panel per facet value.
        if (facetField) {
            const nGroups = new Set(table.map((row: any) => String(row[facetField]))).size;
            spec.config.segregateSamplesBy = [facetField];
            spec.config.layoutTopology = facetLayoutTopology(nGroups, !!colFacet, chartProperties?.facetColumns);
            // Shared axis scales across panels (ggplot facet default).
            spec.config.layoutAdjust = false;
            // Keep the facet strip, with a legible dark label on a white band
            // (the engine's themed default is near-white text on mid-grey).
            spec.config.stripTextColor = 'rgb(0,0,0)';
            spec.config.stripBackgroundColor = 'rgb(255,255,255)';
        }
    };
}

const distChannels = ['x', 'y', 'color', 'column', 'row'];

export const cxBoxplotDef: ChartTemplateDef = {
    chart: 'Boxplot',
    template: { graphType: 'Boxplot', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: distChannels,
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),
    instantiate: buildDistInstantiate('Boxplot'),
};

export const cxViolinDef: ChartTemplateDef = {
    chart: 'Violin Plot',
    template: { graphType: 'Violin', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: distChannels,
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),
    instantiate: buildDistInstantiate('Violin'),
};

export const cxStripPlotDef: ChartTemplateDef = {
    chart: 'Strip Plot',
    template: { graphType: 'Dotplot', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: distChannels,
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),
    instantiate: buildDistInstantiate('Dotplot'),
};
