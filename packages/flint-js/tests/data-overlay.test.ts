// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import type { ChartOverlaySpec } from '../src/interactive/language/updates';
import { orderedOverlayRows, overlayChannels, projectPointToPath } from '../src/vegalite/interactions/presentation/data-overlay';
import { temporalFieldValue } from '../src/core/resolve-semantics';

describe('retained data overlays', () => {
    it('orders a path by time when the order field holds dates', () => {
        const values = [
            { Year: new Date(Date.UTC(2016, 0, 1)), x: 3, y: 4 },
            { Year: new Date(Date.UTC(2013, 6, 1)), x: 1, y: 2 },
            { Year: new Date(Date.UTC(2014, 0, 1)), x: 2, y: 3 },
        ];
        const spec: ChartOverlaySpec = {
            mark: 'line',
            data: { values },
            encodings: { x: { field: 'x' }, y: { field: 'y' }, order: { field: 'Year' } },
            role: 'drawn-line',
        };

        expect(orderedOverlayRows(spec).map((row) => row.x)).toEqual([1, 2, 3]);
    });

    it('orders a path without mutating application rows', () => {
        const values = [
            { Year: 2000, x: 3, y: 4 },
            { Year: 1980, x: 1, y: 2 },
            { Year: 1990, x: 2, y: 3 },
        ];
        const spec: ChartOverlaySpec = {
            mark: 'line',
            data: { values },
            encodings: { x: { field: 'x' }, y: { field: 'y' }, order: { field: 'Year' } },
            role: 'trajectory',
        };

        expect(orderedOverlayRows(spec).map((row) => row.Year)).toEqual([1980, 1990, 2000]);
        expect(values.map((row) => row.Year)).toEqual([2000, 1980, 1990]);
    });

    it('projects a free pointer onto the nearest semantic path segment', () => {
        const projection = projectPointToPath(
            { x: 7, y: 2 },
            [
                { point: { x: 0, y: 0 }, record: { Year: 1980 } },
                { point: { x: 10, y: 0 }, record: { Year: 1990 } },
                { point: { x: 10, y: 10 }, record: { Year: 2000 } },
            ],
        );

        expect(projection?.point).toEqual({ x: 7, y: 0 });
        expect(projection?.distance).toBe(2);
        expect(projection?.segment.start.value.Year).toBe(1980);
        expect(projection?.segment.end.value.Year).toBe(1990);
        expect(projection?.segment.t).toBeCloseTo(0.7);
    });
});
describe('overlay channels', () => {
    const overlay = (mark: ChartOverlaySpec['mark'], channels: string[]): ChartOverlaySpec => ({
        mark,
        data: { values: [] },
        encodings: Object.fromEntries(channels.map((channel) => [channel, { field: channel }])),
        role: 'test',
    });

    it('spans the plot along an axis a rule or rect leaves out', () => {
        expect(overlayChannels(overlay('rule', ['x']))).toEqual(['x']);
        expect(overlayChannels(overlay('rule', ['y']))).toEqual(['y']);
        expect(overlayChannels(overlay('rect', ['x', 'x2']))).toEqual(['x', 'x2']);
        expect(overlayChannels(overlay('rect', ['y', 'y2']))).toEqual(['y', 'y2']);
        expect(overlayChannels(overlay('rect', ['x', 'y', 'x2', 'y2']))).toEqual(['x', 'y', 'x2', 'y2']);
    });

    it('rejects a combination that draws nothing', () => {
        expect(overlayChannels(overlay('rect', ['x']))).toBeUndefined();
        expect(overlayChannels(overlay('rect', ['x', 'x2', 'y']))).toBeUndefined();
        expect(overlayChannels(overlay('rule', ['x', 'x2']))).toBeUndefined();
        expect(overlayChannels(overlay('line', ['x']))).toBeUndefined();
        expect(overlayChannels(overlay('point', ['x', 'y']))).toEqual(['x', 'y']);
    });
});

describe('temporal field values', () => {
    it('reads a date the way the input rows are read', () => {
        const types = { month: 'YearMonth', year: 'Year', region: 'Category' };
        expect(temporalFieldValue('month', '2022-11', types)).toBe(Date.UTC(2022, 10, 1));
        expect(temporalFieldValue('month', '2022-11-01', types)).toBe(Date.UTC(2022, 10, 1));
        expect(temporalFieldValue('month', Date.UTC(2022, 10, 1), types)).toBe(Date.UTC(2022, 10, 1));
        expect(temporalFieldValue('year', 2022, types)).toBe(Date.UTC(2022, 0, 1));
        expect(temporalFieldValue('year', '2022', types)).toBe(Date.UTC(2022, 0, 1));
        expect(temporalFieldValue('month', 'not a date', types)).toBe('not a date');
    });
});
