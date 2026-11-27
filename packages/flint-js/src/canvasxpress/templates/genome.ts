// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Genome Browser template (graphType 'Genome'). CanvasXpress-
 * exclusive: a track-based genomic layout.
 *
 * Features are drawn as boxes along a genomic coordinate axis. CanvasXpress uses
 * its own `data.tracks` form (NOT a y-matrix): a box track whose features each
 * carry an id, a colour, and one or more `[start, end]` segments:
 *   data.tracks = [{ type: 'box', name, data: [{ id, fill, outline, data: [[start,end]] }] }]
 *
 * Encodings: `label` = feature id, `x` = start, `x2` = end, `color` = fill.
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

const PALETTE = ['rgb(31,119,180)', 'rgb(214,39,40)', 'rgb(44,160,44)', 'rgb(255,127,14)', 'rgb(148,103,189)', 'rgb(23,190,207)'];

export const cxGenomeDef: ChartTemplateDef = {
    chart: 'Genome Browser',
    template: { graphType: 'Genome', data: { tracks: [] }, config: {} },
    channels: ['label', 'x', 'x2', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table, encodings } = ctx;

        // Native passthrough: a genomic layout (LocusZoom regional association,
        // multi-track browsers) is CanvasXpress-native and cannot be synthesised
        // from the generic label/x/x2/color box grammar. When the caller supplies
        // pre-built tracks (+ optional config) via chartProperties, emit them
        // verbatim — this is how the genome-5 gallery example is reproduced.
        const cp = (ctx.chartProperties as any) || {};
        if (Array.isArray(cp.genomeTracks) && cp.genomeTracks.length) {
            spec.graphType = 'Genome';
            spec.data = { tracks: cp.genomeTracks };
            spec.config = { ...spec.config, graphType: 'Genome', ...(cp.genomeConfig || {}) };
            return;
        }

        const labelField = channelSemantics.label?.field ?? encodingField((encodings as any)?.label);
        const startField = channelSemantics.x?.field ?? encodingField((encodings as any)?.x);
        const endField = channelSemantics.x2?.field ?? encodingField((encodings as any)?.x2);
        const colorField = channelSemantics.color?.field ?? encodingField((encodings as any)?.color);
        if (!labelField || !startField || !endField) return;

        let min = Infinity;
        let max = -Infinity;
        const features = table.map((row: any, i: number) => {
            const start = Number(row[startField]);
            const end = Number(row[endField]);
            if (start < min) min = start;
            if (end > max) max = end;
            return {
                id: String(row[labelField]),
                fill: colorField && row[colorField] ? String(row[colorField]) : PALETTE[i % PALETTE.length],
                outline: 'rgb(0,0,0)',
                data: [[start, end]],
            };
        });

        spec.graphType = 'Genome';
        spec.data = { tracks: [{ type: 'box', name: labelField, data: features }] };
        spec.config = {
            ...spec.config,
            graphType: 'Genome',
            ...(isFinite(min) ? { setMinX: Math.floor(min - (max - min) * 0.05) } : {}),
            ...(isFinite(max) ? { setMaxX: Math.ceil(max + (max - min) * 0.05) } : {}),
            showLegend: false,
        };
    },
};
