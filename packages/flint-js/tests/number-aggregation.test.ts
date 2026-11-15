// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleExcel, assembleImageCharts, assembleVegaLite, getChartOptions } from '../src';
import { isMeasureType, resolveFieldSemantics, resolveStackable } from '../src/core';
import type { ChartEncoding } from '../src/core/types';

// Two rows for A (10, 20), one for B (5).
const ROWS = [
    { name: 'A', value: 10 },
    { name: 'A', value: 20 },
    { name: 'B', value: 5 },
];

describe('Number carries no default aggregation', () => {
    it('has no aggregationDefault, while Count, Amount and Quantity still sum', () => {
        expect(resolveFieldSemantics('Number', 'value', [1, 2]).aggregationDefault).toBeUndefined();
        for (const type of ['Count', 'Amount', 'Quantity']) {
            expect(resolveFieldSemantics(type, 'value', [1, 2]).aggregationDefault).toBe('sum');
        }
        expect(resolveStackable('Number')).toBe(false);
    });

    it('stays a quantitative measure', () => {
        const fs = resolveFieldSemantics('Number', 'value', [1.5, 20, 300]);
        expect(isMeasureType('Number')).toBe(true);
        expect(fs.defaultVisType).toBe('quantitative');
        expect(fs.zeroClass).toBe('meaningful');
        expect(fs.binningSuggested).toBe(true);
    });
});

async function barTableLabels(type: string, x: ChartEncoding = { field: 'value' }): Promise<Record<string, string>> {
    const spec: any = assembleVegaLite({
        data: { values: ROWS },
        semantic_types: { name: 'Category', value: type },
        chart_spec: { chartType: 'Bar Table', encodings: { y: { field: 'name' }, x } },
    });
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    try {
        await view.runAsync();
        const labels: Record<string, string> = {};
        const visit = (item: any): void => {
            if (item.mark?.marktype === 'text' && item.mark?.role === 'mark' && item.datum?.__bt_val !== undefined) {
                labels[item.datum.name] = String(item.text);
            }
            for (const child of item.items ?? []) visit(child);
        };
        visit((view.scenegraph() as any).root);
        return labels;
    } finally {
        view.finalize();
    }
}

describe('Bar Table value labels', () => {
    it('show the mean of a Number category with several rows, and a single row as is', async () => {
        expect(await barTableLabels('Number')).toEqual({ A: '15', B: '5' });
    });

    it("use a Number's explicit aggregate", async () => {
        expect(await barTableLabels('Number', { field: 'value', aggregate: 'sum' })).toEqual({ A: '30', B: '5' });
    });

    it('still sum an additive type', async () => {
        expect(await barTableLabels('Quantity')).toEqual({ A: '30', B: '5' });
    });
});

describe('"% of total" option', () => {
    const applicable = (type: string, x: ChartEncoding = { field: 'value' }) => getChartOptions({
        data: { values: ROWS },
        semantic_types: { name: 'Category', value: type },
        chart_spec: { chartType: 'Bar Table', encodings: { y: { field: 'name' }, x } },
    }).find((option) => option.key === 'showPercent')?.applicable;

    it('is offered only for a summed measure', () => {
        expect(applicable('Number')).toBe(false);
        expect(applicable('Amount')).toBe(true);
        expect(applicable('Number', { field: 'value', aggregate: 'sum' })).toBe(true);
    });
});

describe('export pivots', () => {
    const input = (type: string, y: ChartEncoding = { field: 'value' }) => ({
        data: { values: ROWS },
        semantic_types: { name: 'Category', value: type },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'name' }, y } },
    });
    const excelValues = (type: string, y?: ChartEncoding) => assembleExcel(input(type, y)).data.slice(1).map((row) => row[1]);
    const imageValues = (type: string, y?: ChartEncoding) => /chd=a:([^&]*)/.exec(assembleImageCharts(input(type, y)).url)?.[1];

    it('average a Number with no explicit aggregate', () => {
        expect(excelValues('Number')).toEqual([15, 5]);
        expect(imageValues('Number')).toBe('15,5');
    });

    it('use the explicit aggregate when set', () => {
        expect(excelValues('Number', { field: 'value', aggregate: 'sum' })).toEqual([30, 5]);
        expect(imageValues('Number', { field: 'value', aggregate: 'sum' })).toBe('30,5');
    });

    it('sum an additive default', () => {
        expect(excelValues('Quantity')).toEqual([30, 5]);
        expect(imageValues('Quantity')).toBe('30,5');
    });
});
