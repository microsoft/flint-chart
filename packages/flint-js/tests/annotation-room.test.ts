// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import * as vl from 'vega-lite';
import * as vega from 'vega';
import { noteRoomNeed, roomPast } from '../src/core/annotation';
import { notesOfUpdates, referencesOfUpdates, regionsOfUpdates } from '../src/interactive/presentation/annotation';
import { annotationItem } from '../src/vegalite/interactions/presentation/annotation-overlay';
import { assembleVegaLite } from '../src/vegalite/assemble';

/**
 * The chart makes room for the notes it is drawn with: a noted mark at the end of a measure axis gets
 * the axis run on to a round tick, far enough for its caption, and never more than a third of the axis.
 */

const SALES = [
    { region: 'North', revenue: 42 }, { region: 'East', revenue: 55 }, { region: 'South', revenue: 31 },
    { region: 'West', revenue: 28 }, { region: 'Central', revenue: 37 }, { region: 'Online', revenue: 61 },
];

const bars = (options: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => assembleVegaLite({
    data: { values: SALES },
    semantic_types: { region: 'Category', revenue: 'Quantity' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'region' }, y: { field: 'revenue' } }, canvasSize: { width: 640, height: 400 } },
    options,
    ...extra,
} as any);

const yEncoding = (spec: any) => spec.encoding?.y ?? spec.layer?.find((layer: any) => layer.encoding?.y?.field === 'revenue')?.encoding.y;

async function drawnDomain(spec: any): Promise<number[]> {
    const view = new vega.View(vega.parse(vl.compile(spec).spec), { renderer: 'none' });
    await view.runAsync();
    return view.scale('y').domain();
}

describe('room for a note', () => {
    it('runs an axis on past a value at its end, by the share the caption needs', () => {
        // 61 on [0, 65] over 300 px leaves 18 px; 30 px needs the end at 61 / 0.9.
        expect(roomPast(61, [0, 65], 300, 30, 'max')).toBeCloseTo(61 / 0.9, 6);
        expect(roomPast(-40, [-45, 60], 300, 30, 'min')).toBeCloseTo((-40 - 0.1 * 60) / 0.9, 6);
        expect(roomPast(40, [0, 65], 300, 30, 'max')).toBeUndefined();
        expect(roomPast(61, [0, 65], 300, 120, 'max')).toBeUndefined();
    });

    it('needs the caption\'s height and the nearest direct seat\'s reach, no more', () => {
        const measureAt = (fontSize: number) => (text: string) => text.length * fontSize * 0.5;
        const need = noteRoomNeed('Still growing', { fontSize: 10 }, measureAt);
        // An 11 px caption on one line is 18 px tall with its halo; the nearest seat stands 0.9 of a font
        // size past the face, and the leader leaves the caption 2.5 px out.
        expect(need).toBeCloseTo(18 + 9.9 + 2.5, 6);
    });

    it('takes the notes a chart mounts with by their key or element row, not those the chart words', () => {
        expect(notesOfUpdates([
            { id: 'a', ops: [{ op: 'annotate-text', target: { select: { key: { region: 'Online' } } }, value: { text: 'Online leads' } }] },
            { id: 'b', ops: [{ op: 'annotate-text', target: { select: { key: { region: 'West' } } }, value: {} }] },
            { id: 'c', ops: [{ op: 'annotate-text', target: { select: { key: { region: 'East' } } }, value: null }] },
        ] as any)).toEqual([{ key: { region: 'Online' }, text: 'Online leads' }]);
    });
    it('names the bar a note is on, not the value label that shares its key', () => {
        const datum = { __flint_interaction_key: 'online', region: 'Online' };
        const bar = { datum, mark: { marktype: 'rect' }, bounds: { x1: 300, x2: 340, y1: 20, y2: 300 } };
        const label = { datum, mark: { marktype: 'text' }, bounds: { x1: 312, x2: 328, y1: 24, y2: 36 } };
        expect(annotationItem([label, bar], 'online')).toBe(bar);
        expect(annotationItem([label], 'online')).toBe(label);
    });
});

describe('a chart drawn with notes', () => {
    it('runs its value axis on past the tallest bar a note names, just far enough, at a fine round step', async () => {
        const plain = bars();
        const noted = bars({ notes: [{ key: { region: 'Online' }, text: 'Online leads: 61' }] });
        expect(await drawnDomain(plain)).toEqual([0, 65]);
        expect(yEncoding(noted).scale.domainMax).toBe(70);
        expect(await drawnDomain(noted)).toEqual([0, 70]);
    });

    it('leaves the axis where the noted bar already has room', () => {
        const noted = bars({ notes: [{ key: { region: 'West' }, text: 'West lags' }] });
        expect(yEncoding(noted).scale.domainMax).toBeUndefined();
    });

    it('runs Flint\'s own ticks on at their step', () => {
        const plain = bars({}, { theme_spec: 'nyt' });
        const noted = bars({ notes: [{ key: { region: 'Online' }, text: 'Online leads: 61' }] }, { theme_spec: 'nyt' });
        expect(yEncoding(plain).axis.values).toEqual([0, 10, 20, 30, 40, 50, 60]);
        expect(yEncoding(noted).scale.domainMax).toBe(70);
        expect(yEncoding(noted).axis.values).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    });

    it('keeps a domain the spec states', () => {
        const noted = assembleVegaLite({
            data: { values: SALES },
            semantic_types: { region: 'Category', revenue: { semanticType: 'Percentage', intrinsicDomain: [0, 61] } },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'region' }, y: { field: 'revenue' } }, canvasSize: { width: 640, height: 400 } },
            options: { notes: [{ key: { region: 'Online' }, text: 'Online leads: 61' }] },
        } as any);
        const scale = yEncoding(noted).scale ?? {};
        expect(scale.domainMax === undefined || scale.domainMax === 61 || Array.isArray(scale.domain)).toBe(true);
    });
});

describe('a chart drawn with regions', () => {
    // Bins of 10 from 10 to 90: counts 4, 6, 13, 22, 25, 23, 6, 1 (Vega bins them so too).
    const COUNTS = [4, 6, 13, 22, 25, 23, 6, 1];
    const SCORES = COUNTS.flatMap((count, bin) => Array.from({ length: count }, (_, at) => ({ value: 10 + bin * 10 + (at % 10) })));
    const histogram = (regions: unknown[]) => assembleVegaLite({
        data: { values: SCORES },
        semantic_types: { value: 'Quantity' },
        chart_spec: { chartType: 'Histogram', encodings: { x: { field: 'value' } }, canvasSize: { width: 400, height: 300 } },
        options: { regions },
    } as any);
    const histogramY = (spec: any) => spec.encoding?.y ?? spec.layer?.find((layer: any) => layer.encoding?.y)?.encoding.y;

    it('runs a histogram\'s counts on past the tallest bin of a stretch, enough for its caption over it', async () => {
        const plain = histogram([]);
        expect(histogramY(plain).scale?.domainMax).toBeUndefined();
        const spec = histogram([{ x: [42, 58], text: 'A stretch' }]);
        const end = histogramY(spec).scale.domainMax;
        expect(end).toBeGreaterThan(25);
        const view = new vega.View(vega.parse(vl.compile(spec).spec), { renderer: 'none' });
        await view.runAsync();
        const y = view.scale('y');
        // The stretch's tallest bin (25) stands at least the caption's room below the plot's top.
        const need = 4 + 18 + 8;
        expect(y(25) - y(end)).toBeGreaterThanOrEqual(need - 0.5);
        expect(y(25) - y(end)).toBeLessThan(need + 20);
    });

    it('leaves the axis where the stretch\'s bins leave its caption room', () => {
        expect(histogramY(histogram([{ x: [10, 30], text: 'A stretch' }])).scale?.domainMax).toBeUndefined();
        // Uncaptioned, or captioned elsewhere, it needs none.
        expect(histogramY(histogram([{ x: [42, 58] }])).scale?.domainMax).toBeUndefined();
        expect(histogramY(histogram([{ x: [42, 58], text: 'A stretch', placement: 'bottom' }])).scale?.domainMax).toBeUndefined();
    });

    it('leaves a line its free row beneath', () => {
        const values = Array.from({ length: 12 }, (_, month) => ({ month: month + 1, level: 80 + (month % 3) }));
        const line = (regions: unknown[]) => assembleVegaLite({
            data: { values },
            semantic_types: { month: 'Quantity', level: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: { field: 'month' }, y: { field: 'level' } }, canvasSize: { width: 400, height: 300 } },
            options: { regions },
        } as any);
        const y = (spec: any) => spec.encoding?.y ?? spec.layer?.find((layer: any) => layer.encoding?.y?.field === 'level')?.encoding.y;
        expect(y(line([{ x: [3, 6], text: 'A stretch' }])).scale?.domainMax).toBe(y(line([])).scale?.domainMax);
    });

    it('takes the regions a chart mounts with', () => {
        expect(regionsOfUpdates([
            { id: 'a', ops: [{ op: 'annotate-region', name: 'r', value: { x: [1, 2], text: 'Stretch' } }] },
            { id: 'b', ops: [{ op: 'annotate-region', name: 's', value: null }] },
        ] as any)).toEqual([{ x: [1, 2], text: 'Stretch' }]);
    });
});

describe('a reference past the axis end', () => {
    it('is read from a y rule or a y band, and the axis runs on to reach it', async () => {
        const references = referencesOfUpdates([{ id: 'r', ops: [
            { op: 'set-overlay', name: 'goal', value: { mark: 'rule', role: 'reference', data: { values: [{ v: 100 }] }, encodings: { y: { field: 'v' } } } },
            { op: 'annotate-region', name: 'band', value: { y: [20, 30] } },
            { op: 'set-overlay', name: 'cut', value: { mark: 'rule', role: 'reference', data: { values: [{ d: 'East' }] }, encodings: { x: { field: 'd' } } } },
        ] }]);
        expect(references).toEqual([100, 20, 30]);
        const [, top] = await drawnDomain(bars({ references }));
        expect(top).toBeGreaterThanOrEqual(100);
        const [, plain] = await drawnDomain(bars());
        expect(plain).toBeLessThan(100);
    });
});
