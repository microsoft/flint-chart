// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Oncoprint template — CanvasXpress-exclusive cancer-genomics view.
 *
 * An oncoprint stacks per-gene × per-sample alteration glyphs (copy-number
 * amplifications/deletions as background tiles, mutations as a narrower inner
 * bar) so mutual-exclusivity and co-occurrence patterns across a cohort read at
 * a glance. CanvasXpress drives it from a Heatmap with PARALLEL categorical
 * matrices named by config:
 *   data.y.vars  = [gene…]                 rows
 *   data.y.smps  = [sample…]               columns
 *   data.y.data  = [[expr …] …]            optional continuous background
 *   data.y.data2 = [['Amplification'|'Deep deletion'|null …] …]   CNA
 *   data.y.data3 = [['Mutation'|'Fusion / SV'|'' …] …]            mutation
 *   config.oncoprintCNA = 'data2', oncoprintMUT = 'data3'
 *   config.oncoprintPresorted = true, showHeatmapOncoprint = true
 *
 * Encodings (tidy/long form, one row per gene×sample cell): `y` = gene,
 * `x` = sample, `cna` = copy-number class, `mut` = mutation class,
 * `value`/`color` = optional expression value for the background heatmap.
 */

import { ChartTemplateDef } from '../../core/types';

/** @private */
function encodingField(encoding: unknown): string | undefined {
    if (typeof encoding === 'string') return encoding;
    if (encoding && typeof encoding === 'object' && 'field' in (encoding as any)) {
        return (encoding as any).field;
    }
    return undefined;
}

/** @private */
function distinct(table: any[], field: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of table) {
        const key = String(row[field]);
        if (!seen.has(key)) { seen.add(key); out.push(key); }
    }
    return out;
}

export const cxOncoprintDef: ChartTemplateDef = {
    chart: 'Oncoprint',
    template: { graphType: 'Heatmap', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'cna', 'mut', 'value', 'color'],
    markCognitiveChannel: 'color',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const geneField = channelSemantics.y?.field;
        const sampleField = channelSemantics.x?.field;
        const cnaField = channelSemantics.cna?.field ?? encodingField((encodings as any)?.cna);
        const mutField = channelSemantics.mut?.field ?? encodingField((encodings as any)?.mut);
        const exprField = channelSemantics.value?.field ?? channelSemantics.color?.field;
        if (!geneField || !sampleField || (!cnaField && !mutField)) return;

        const genes = distinct(table, geneField);
        const samples = distinct(table, sampleField);
        const cnaCell = new Map<string, string | null>();
        const mutCell = new Map<string, string>();
        const exprCell = new Map<string, number | null>();
        for (const r of table) {
            const key = String(r[geneField]) + '\u0000' + String(r[sampleField]);
            if (cnaField) {
                const v = r[cnaField];
                cnaCell.set(key, v == null || v === '' ? null : String(v));
            }
            if (mutField) {
                const v = r[mutField];
                mutCell.set(key, v == null ? '' : String(v));
            }
            if (exprField) {
                const raw = r[exprField];
                const n = raw == null || raw === '' ? null : Number(raw);
                exprCell.set(key, Number.isNaN(n as number) ? null : n);
            }
        }

        const y: any = { vars: genes, smps: samples };
        const config: any = { ...spec.config, graphType: 'Heatmap', oncoprintPresorted: true };

        // The oncoprint is the alteration glyphs only — never the continuous
        // expression background heatmap (it reads as a second, confusing panel).
        // Keep the base matrix empty and the heatmap overlay off regardless of
        // whether an expression channel was supplied.
        y.data = genes.map(() => samples.map(() => null));
        config.showHeatmapOncoprint = false;
        void exprCell;

        let next = 2;
        if (cnaField) {
            const slot = 'data' + next++;
            y[slot] = genes.map((g) => samples.map((s) => cnaCell.get(g + '\u0000' + s) ?? null));
            config.oncoprintCNA = slot;
        }
        if (mutField) {
            const slot = 'data' + next++;
            y[slot] = genes.map((g) => samples.map((s) => mutCell.get(g + '\u0000' + s) ?? ''));
            config.oncoprintMUT = slot;
        }

        spec.graphType = 'Heatmap';
        spec.data = { y };
        spec.config = config;
    },
};
