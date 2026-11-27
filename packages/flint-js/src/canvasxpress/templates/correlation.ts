// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Correlation template (graphType 'Correlation'). CanvasXpress-
 * exclusive: a correlation matrix over numeric variables, clustered.
 *
 * CanvasXpress correlates the SAMPLES (columns), so the variables to correlate
 * become the columns and the observations become the rows:
 *   data.y.vars = [observation…]
 *   data.y.smps = [variable…]       (what gets correlated → an N×N matrix)
 *   data.y.data[obs][var] = value
 *
 * The variables come from the `var0…varN` domain channels (falling back to every
 * numeric column), since a correlation matrix has no single x/y.
 */

import { ChartTemplateDef } from '../../core/types';

/** Resolve a channel's field name from the raw encoding (string or { field }). */
function encodingField(encoding: unknown): string | undefined {
    if (typeof encoding === 'string') return encoding;
    if (encoding && typeof encoding === 'object' && 'field' in (encoding as any)) {
        return (encoding as any).field;
    }
    return undefined;
}

export const cxCorrelationDef: ChartTemplateDef = {
    chart: 'Correlation Matrix',
    template: { graphType: 'Correlation', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['var0', 'var1', 'var2', 'var3', 'var4', 'var5', 'var6', 'var7'],
    markCognitiveChannel: 'color',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { table, encodings } = ctx;
        if (!table.length) return;

        // Variables = the var0…varN channels in order, else every numeric column.
        let variables = Object.keys(encodings || {})
            .filter((k) => /^var\d+$/.test(k))
            .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
            .map((k) => encodingField((encodings as any)[k]))
            .filter((f): f is string => !!f);
        if (variables.length === 0) {
            variables = Object.keys(table[0]).filter((k) => typeof table[0][k] === 'number');
        }
        if (variables.length < 2) return;

        const observations = table.map((_: any, i: number) => 'obs' + (i + 1));
        // Rows = observations, columns = the variables to correlate (CanvasXpress
        // correlates the samples/columns, giving a variable × variable matrix).
        const data = table.map((r: any) => variables.map((v) => {
            const n = r[v] == null || r[v] === '' ? null : Number(r[v]);
            return Number.isNaN(n as number) ? null : n;
        }));

        spec.graphType = 'Correlation';
        spec.data = { y: { vars: observations, smps: variables, data } };
        spec.config = {
            ...spec.config,
            graphType: 'Correlation',
            showLegend: true,
        };
    },
};
