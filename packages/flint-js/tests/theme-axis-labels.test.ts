// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

/**
 * Vega drops a tick label only once its box *overlaps* its neighbour's. Two
 * numbers whose boxes merely abut therefore both survive, and on a log axis
 * `20,000` beside `30,000` prints as `20,00030,000` — one number that is not
 * in the data. Numbers need a character's worth of air between them before
 * they read as two.
 */

const nations = [
    { country: 'Ethiopia', income: 2000, life: 66.2 },
    { country: 'Bangladesh', income: 4200, life: 72.3 },
    { country: 'India', income: 6900, life: 69.4 },
    { country: 'Indonesia', income: 12400, life: 71.5 },
    { country: 'China', income: 16800, life: 76.7 },
    { country: 'Mexico', income: 19800, life: 75.0 },
    { country: 'Russia', income: 25800, life: 72.4 },
    { country: 'Germany', income: 50900, life: 81.0 },
    { country: 'Qatar', income: 116900, life: 80.1 },
];

function scatter(theme?: string): any {
    const out: any = assembleVegaLite({
        data: { values: nations },
        semantic_types: { country: 'Country', income: 'Quantity', life: 'Quantity' },
        chart_spec: {
            chartType: 'Scatter Plot',
            encodings: { x: { field: 'income' }, y: { field: 'life' } },
            chartProperties: { logScale_x: true },
            baseSize: { width: 400, height: 300 },
        },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
    return out.spec ?? out;
}

function bars(theme?: string): any {
    const out: any = assembleVegaLite({
        data: {
            values: [
                { region: 'North', sales: 120 },
                { region: 'South', sales: 90 },
                { region: 'East', sales: 140 },
                { region: 'West', sales: 70 },
            ],
        },
        semantic_types: { region: 'Category', sales: 'Quantity' },
        chart_spec: {
            chartType: 'Bar Chart',
            encodings: { x: { field: 'region' }, y: { field: 'sales' } },
            baseSize: { width: 400, height: 300 },
        },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
    return out.spec ?? out;
}

describe('two tick numbers may not read as one', () => {
    it('holds numeric axis labels apart by about a character', () => {
        const spec = scatter('swiss');
        const sep = spec.config.axisX.labelSeparation;
        const size = spec.config.axisX.labelFontSize;
        expect(sep).toBeGreaterThan(0);
        expect(sep).toBeGreaterThanOrEqual(Math.round(size * 0.5));
    });

    it('holds them apart with no house named at all', () => {
        const spec = scatter();
        expect(spec.config.axisX.labelSeparation).toBeGreaterThan(0);
        expect(spec.config.axisY.labelSeparation).toBeGreaterThan(0);
    });

    it('leaves a band axis alone, where thinning would drop a category', () => {
        const spec = bars('swiss');
        expect(spec.config.axisX.labelSeparation).toBeUndefined();
        expect(spec.config.axisY.labelSeparation).toBeGreaterThan(0);
    });
});

/**
 * Some houses ask for the axis to be ticked at the values the data holds,
 * rather than at round numbers between them — an axis of Olympic years has no
 * 2014 on it. That is a claim the data is *spaced* by something. Fifteen
 * countries' incomes are not: 5,300 is Nigeria, not a mark on a ruler.
 */
describe('an axis is ticked at observations only where they are a step', () => {
    it('leaves a measure axis to its round numbers', () => {
        const spec = scatter('nyt');
        const enc = spec.encoding?.x ?? spec.layer?.[0]?.encoding?.x;
        expect(enc.axis?.values).toBeUndefined();
    });

    it('still ticks a regularly spaced index at its own observations', () => {
        const games = [2012, 2016, 2020, 2024].flatMap((year) =>
            ['United States', 'China'].map((country, i) => ({ year, country, rank: i + 1 })),
        );
        const out: any = assembleVegaLite({
            data: { values: games },
            semantic_types: { year: 'Quantity', country: 'Category', rank: 'Quantity' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: { field: 'year' }, y: { field: 'rank' }, color: { field: 'country' } },
                baseSize: { width: 500, height: 300 },
            },
            theme_spec: 'nyt',
        } as any);
        const spec = out.spec ?? out;
        const enc = spec.encoding?.x ?? spec.layer?.[0]?.encoding?.x;
        expect(enc.axis?.values).toEqual([2012, 2016, 2020, 2024]);
    });
});
