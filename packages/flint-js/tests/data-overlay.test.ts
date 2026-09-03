// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import type { ChartOverlaySpec } from '../src/interactive/language/updates';
import { orderedOverlayRows, projectPointToPath } from '../src/vegalite/interactions/presentation/data-overlay';

describe('retained data overlays', () => {
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

    it('preserves an unordered timebox rectangle row verbatim', () => {
        const values = [{ Time: 4, Value: 48, TimeEnd: 10, ValueEnd: 56 }];
        const spec: ChartOverlaySpec = {
            mark: 'rect',
            data: { values },
            encodings: {
                x: { field: 'Time' },
                y: { field: 'Value' },
                x2: { field: 'TimeEnd' },
                y2: { field: 'ValueEnd' },
            },
            role: 'timebox',
        };

        expect(orderedOverlayRows(spec)).toEqual(values);
        expect(values).toEqual([{ Time: 4, Value: 48, TimeEnd: 10, ValueEnd: 56 }]);
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
