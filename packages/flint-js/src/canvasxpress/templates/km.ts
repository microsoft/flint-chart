// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Kaplan–Meier template (graphType 'KaplanMeier').
 *
 * A scientific chart the generic grammar does not cover — the first of the
 * CanvasXpress-exclusive family (survival / genomics / set relationships). The
 * engine estimates the stepped survival curves, censoring ticks and confidence
 * bands itself, given one subject per row:
 *   data.y.vars = [subject…]              (one row per subject)
 *   data.y.smps = [timeField, eventField] (survival time + 1=event/0=censored)
 *   data.y.data[subj] = [time, event]     (both numeric)
 *   data.z[groupField] = [arm per subject] (the per-subject grouping annotation)
 *   config: xAxis = [timeField, eventField], colorBy = groupField
 *
 * Encodings: `x` = time, `event` = censoring indicator (a domain channel resolved
 * from the raw encodings), `color` = group/arm.
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

export const cxKaplanMeierDef: ChartTemplateDef = {
    chart: 'Kaplan-Meier',
    template: { graphType: 'KaplanMeier', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'event', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;
        const timeField = channelSemantics.x?.field ?? encodingField((encodings as any)?.x);
        const groupField = channelSemantics.color?.field ?? encodingField((encodings as any)?.color);
        // `event` is a domain channel, not a standard spatial one — resolve from encodings.
        const eventField = channelSemantics.event?.field ?? encodingField((encodings as any)?.event);
        if (!timeField || !eventField) return;

        const toNum = (raw: any) => {
            const n = raw == null || raw === '' ? null : Number(raw);
            return Number.isNaN(n as number) ? null : n;
        };

        const vars: string[] = [];
        const data: (number | null)[][] = [];
        const groups: (string | number)[] = [];
        for (let i = 0; i < table.length; i++) {
            const row = table[i];
            vars.push('S' + (i + 1));
            data.push([toNum(row[timeField]), toNum(row[eventField])]);
            if (groupField) groups.push(row[groupField]);
        }

        spec.graphType = 'KaplanMeier';
        spec.data = { y: { vars, smps: [timeField, eventField], data } };
        if (groupField) spec.data.z = { [groupField]: groups };

        spec.config = {
            ...spec.config,
            graphType: 'KaplanMeier',
            xAxis: [timeField, eventField],
            ...(groupField ? { colorBy: groupField } : {}),
            xAxisTitle: timeField,
            yAxisTitle: 'Survival probability',
            showKMConfidenceIntervals: true,
            // Clinical KM furniture: median-survival drop lines, the "number at
            // risk" table under the x-axis, the log-rank p-value, and censor ticks.
            showKMMedianSurvivalTime: true,
            kmRiskTable: 'absolute',
            kmCensoredRug: true,
            ...(groupField ? { kmPvalue: true } : {}),
            showLegend: !!groupField,
        };
    },
};
