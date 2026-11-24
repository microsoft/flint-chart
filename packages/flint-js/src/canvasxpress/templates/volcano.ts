// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Volcano template (a Scatter2D with differential-expression
 * semantics). CanvasXpress-exclusive: the generic grammar has no volcano.
 *
 * x = log2 fold-change, y = p-value. The template applies the domain transform
 * (−log10 p) and classifies every gene into the four Bioconductor
 * EnhancedVolcano categories — NS / Log2FC / p-value / p-value and Log2FC —
 * against a fold-change cutoff and a p-value cutoff (that classification is what
 * makes it a volcano, not a plain scatter), colours by it with the familiar
 * EnhancedVolcano palette (grey / green / blue / red), draws the cutoff guide
 * lines, and labels the doubly-significant hits.
 */

import { ChartTemplateDef } from '../../core/types';

const FC_CUTOFF = 1;      // |log2FC| ≥ 1
const P_CUTOFF = 1e-5;    // p ≤ 1e-5  → −log10 p ≥ 5   (EnhancedVolcano default)

// EnhancedVolcano's four significance categories and their canonical colours
// (grey30 / forestgreen / royalblue / red2).
const CAT_NS = 'NS';
const CAT_FC = 'Log2FC';
const CAT_P = 'p-value';
const CAT_BOTH = 'p-value and Log2FC';
const COLOR_KEY: Record<string, string> = {
    [CAT_NS]: '#4d4d4d',
    [CAT_FC]: '#228b22',
    [CAT_P]: '#4169e1',
    [CAT_BOTH]: '#ee0000',
};

export const cxVolcanoDef: ChartTemplateDef = {
    chart: 'Volcano Plot',
    template: { graphType: 'Scatter2D', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'label'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table } = ctx;
        const fcField = channelSemantics.x?.field;
        const pField = channelSemantics.y?.field;
        if (!fcField || !pField) return;

        const labelField = channelSemantics.label?.field;

        const negLogP = '-log10(p)';
        const vars: string[] = [];
        const data: (number | null)[][] = [];
        const category: string[] = [];
        const labels: string[] = [];
        for (let i = 0; i < table.length; i++) {
            const row = table[i];
            const fc = Number(row[fcField]);
            const p = Number(row[pField]);
            const y = p > 0 ? -Math.log10(p) : null;
            vars.push('g' + (i + 1));
            data.push([Number.isNaN(fc) ? null : fc, y]);
            // EnhancedVolcano's four-way classification.
            const sigFc = !Number.isNaN(fc) && Math.abs(fc) >= FC_CUTOFF;
            const sigP = !Number.isNaN(p) && p <= P_CUTOFF;
            category.push(
                sigP && sigFc ? CAT_BOTH : sigP ? CAT_P : sigFc ? CAT_FC : CAT_NS,
            );
            if (labelField) labels.push(String(row[labelField]));
        }

        const z: Record<string, (string | number)[]> = { Significance: category };
        if (labelField) z[labelField] = labels;

        spec.graphType = 'Scatter2D';
        spec.data = { y: { vars, smps: [fcField, negLogP], data }, z };
        spec.config = {
            ...spec.config,
            graphType: 'Scatter2D',
            xAxis: [fcField],
            yAxis: [negLogP],
            xAxisTitle: 'Log2 fold change',
            yAxisTitle: '-Log10 P',
            colorBy: 'Significance',
            colorKey: { Significance: COLOR_KEY },
            // Constant small points, like EnhancedVolcano (size 2, alpha 0.5).
            sizes: [6],
            dataPointSize: 6,
            objectBorderColor: false,
            showLegend: true,
            legendPosition: 'top',
            // Fold-change and significance cutoff guides. On a Scatter2D a threshold
            // line is a `line` decoration keyed by `x` (vertical) or `y` (horizontal);
            // `value` is the 1-D form and draws nothing here.
            decorations: {
                line: [
                    { x: -FC_CUTOFF, color: 'rgb(0,0,0)', width: 1, type: 'dashed' },
                    { x: FC_CUTOFF, color: 'rgb(0,0,0)', width: 1, type: 'dashed' },
                    { y: -Math.log10(P_CUTOFF), color: 'rgb(0,0,0)', width: 1, type: 'dashed' },
                ],
            },
            // Label the doubly-significant genes (the classic EnhancedVolcano gene
            // callouts). The text optimiser keeps only the non-overlapping labels, so
            // the dense wings stay readable instead of a wall of overlapping names.
            ...(labelField ? {
                labelBy: labelField,
                labelSelect: ['AND', ['Significance', '==', CAT_BOTH]],
                optimizeTextPosition: true,
                dataTextFontSize: 10,
            } : {}),
        };
    },
};
