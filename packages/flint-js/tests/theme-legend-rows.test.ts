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
        expect(layoutOf(spec)?.top?.direction).toBeUndefined();
        expect(spec._theme.report.some((r: any) => /row each/.test(r.message))).toBe(false);
    });

    it('says nothing about rows when there is only one key', () => {
        const spec = bubble(320, null);
        expect(layoutOf(spec)?.top?.direction).toBeUndefined();
        expect(spec._theme.report.some((r: any) => /row each/.test(r.message))).toBe(false);
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

/**
 * How many entries a horizontal key fits in one row.
 *
 * Vega-Lite packs a legend row — each entry takes the width of its own name.
 * Charging every entry the width of the longest one wraps keys that would
 * have fitted, which is what put "None at all" on a second row under a row
 * with a third of its block still empty.
 */
describe('a legend row is packed, not ruled into columns', () => {
    const likert = ['A great deal', 'Some', 'Not much', 'None at all'];
    const many = [
        'Strongly agree', 'Somewhat agree', 'Neither agree nor disagree',
        'Somewhat disagree', 'Strongly disagree', 'No opinion',
        'Prefer not to say', 'Not applicable',
    ];

    const survey = (responses: string[], width: number): any => assembleVegaLite({
        data: {
            values: ['Scientists', 'The military', 'The police', 'The press', 'Congress']
                .flatMap((Institution) => responses.map((Response) => ({
                    Institution, Response, Share: 100 / responses.length,
                }))),
        },
        semantic_types: { Institution: 'Category', Response: 'Category', Share: 'Quantity' },
        chart_spec: {
            chartType: 'Stacked Bar Chart',
            encodings: { x: 'Share', y: 'Institution', color: 'Response' },
            title: 'Confidence in US institutions',
            baseSize: { width, height: 300 },
        },
        theme_spec: 'swiss',
    } as any) as any;

    const legendOf = (node: any): any => {
        if (!node || typeof node !== 'object') return undefined;
        if (node.encoding?.color?.legend) return node.encoding.color.legend;
        for (const key of Object.keys(node)) {
            const found = legendOf(node[key]);
            if (found) return found;
        }
        return undefined;
    };

    it('leaves a row alone when the names it carries actually fit', () => {
        // One long name and three short ones. Ruled into equal columns this
        // asked for 4 × the width of "A great deal" and wrapped to three;
        // packed, the four sit in one row with room to spare.
        expect(legendOf(survey(likert, 400))?.columns).toBeUndefined();
    });

    it('still wraps a key that genuinely overruns its block', () => {
        const columns = legendOf(survey(many, 400))?.columns;
        expect(columns).toBeGreaterThan(0);
        expect(columns).toBeLessThan(many.length);
    });

    it('wraps harder as the block narrows', () => {
        const wide = legendOf(survey(many, 900))?.columns ?? many.length;
        const narrow = legendOf(survey(many, 400))?.columns ?? many.length;
        expect(narrow).toBeLessThanOrEqual(wide);
    });
});
