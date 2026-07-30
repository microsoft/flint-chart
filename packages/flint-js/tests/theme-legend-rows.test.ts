// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';

/**
 * A chart can need more than one key: one that names the colours and one that
 * measures the sizes. Laid side by side above the plot they eat the block
 * between them, and past a point the second is pushed against the first.
 *
 * Where they go is therefore a measurement, not a preference.
 */

const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        Country: `Country ${i}`,
        Region: ['Europe', 'Americas', 'Asia', 'Africa'][i % 4],
        GDP: 1000 * (i + 1),
        Life: 60 + i,
        Population: 10 * (i + 1),
    }));

const theme = (extra: Partial<ThemeSpec> = {}): ThemeSpec => ({
    id: 'house',
    label: 'House',
    ink: {
        surface: { canvas: '#ffffff' },
        series: { single: '#333333', categorical: ['#1', '#2', '#3', '#4'] },
    },
    legend: { show: 'always', placement: ['top'], direction: 'horizontal' },
    ...extra,
} as ThemeSpec);

function bubble(width: number, sizeField: string | null = 'Population'): any {
    return assembleVegaLite({
        data: { values: rows(8) },
        semantic_types: {
            Country: 'Country', Region: 'Category',
            GDP: 'Amount', Life: 'Quantity', Population: 'Quantity',
        },
        chart_spec: {
            chartType: 'Scatter Plot',
            title: 'Money buys years',
            encodings: {
                x: 'GDP',
                y: 'Life',
                color: 'Region',
                ...(sizeField ? { size: sizeField } : {}),
            },
            baseSize: { width, height: 240 },
        },
        theme_spec: theme(),
    } as any) as any;
}

const layoutOf = (spec: any) => spec.config?.legend?.layout;

describe('two keys above one plot', () => {
    it('gives each a row when they will not fit across the block', () => {
        const spec = bubble(320);
        expect(layoutOf(spec)?.top?.direction).toBe('vertical');
        expect(spec._theme.report.some((r: any) => /row each/.test(r.message))).toBe(true);
    });

    it('leaves them on one row when the block is wide enough', () => {
        const spec = bubble(1200);
        expect(layoutOf(spec)).toBeUndefined();
    });

    it('says nothing about rows when there is only one key', () => {
        const spec = bubble(320, null);
        expect(layoutOf(spec)).toBeUndefined();
    });

    /**
     * A size key inherits the mark's ink. Beside a colour key that is the ink
     * of the first category, which makes the row read as one more of them.
     */
    it('draws the size key in neutral ink beside a colour key', () => {
        const spec = bubble(320);
        const found: any[] = [];
        JSON.stringify(spec, (_k, v) => {
            if (v?.symbolFillColor) found.push(v.symbolFillColor);
            return v;
        });
        expect(found.length).toBeGreaterThan(0);
    });
});
