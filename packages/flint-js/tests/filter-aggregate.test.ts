// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { changeset, parse, View } from 'vega';
import { openVegaLiteSession } from '../src/vegalite/assemble';
import { filterControls } from '../src/interactive/filter-controls';
import type { ChartAssemblyInput } from '../src/core/types';

const weekly = ['Premium', 'Standard', 'Budget'].flatMap((grade, index) =>
    Array.from({ length: 8 }, (_, week) => ({ week: `2024-01-0${week + 1}`, grade, price: 10 + index * 5 + week })));

const averaged: ChartAssemblyInput = {
    data: { values: weekly },
    semantic_types: { grade: 'Category', price: 'Price', week: 'Date' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'grade' }, y: { field: 'price', aggregate: 'average' } } },
};

describe('rows a filter leaves on an aggregated chart', () => {
    it('are shaped the way the compiled data holds them', () => {
        const session = openVegaLiteSession(structuredClone(averaged));
        expect(session.shapeRows(weekly)).toEqual(session.spec.data!.values);
        expect(session.shapeRows(weekly.filter((row) => row.grade === 'Premium')))
            .toEqual([expect.objectContaining({ grade: 'Premium', price_average: 13.5 })]);
        // Rows the host already aggregated pass through.
        const compiled = session.spec.data!.values as Record<string, unknown>[];
        expect(session.shapeRows(compiled)).toEqual(compiled);
    });

    it('draw the average of the rows the filter keeps', { timeout: 30_000 }, async () => {
        const session = openVegaLiteSession(structuredClone(averaged));
        const vegaSpec = compile(session.spec as any).spec as any;
        const source = vegaSpec.data.find((entry: any) => Array.isArray(entry.values)).name;
        const control = filterControls();
        control.filterControls.bindRows(weekly);
        const [op] = control.handle!(
            { filters: { grade: { in: ['Premium'] } } } as any,
            { chartType: 'Bar Chart', selected: [], available: [] } as any,
        )!.ops;
        if (op?.op !== 'set-data') throw new Error('expected a set-data op');
        const view = new View(parse(vegaSpec), { renderer: 'none' });
        await view.runAsync();
        await view.change(source, changeset().remove(() => true).insert(session.shapeRows(op.value.rows))).runAsync();
        const bars = view.data(vegaSpec.marks.find((mark: any) => mark.type === 'rect').from.data);
        expect(bars.map((bar: any) => [bar.grade, bar.price_average])).toEqual([['Premium', 13.5]]);
        expect(view.scale('y').domain()[1]).toBeGreaterThan(0);
        view.finalize();
    });
});
