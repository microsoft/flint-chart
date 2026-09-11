// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
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

describe('stacked measure endpoints', () => {
    function stackedArea(total: number): any {
        const values = [
            { year: 2000, cluster: 'A', share: 40 },
            { year: 2000, cluster: 'B', share: total - 40 },
            { year: 2001, cluster: 'A', share: 35 },
            { year: 2001, cluster: 'B', share: total - 35 },
        ];
        const out: any = assembleVegaLite({
            data: { values },
            semantic_types: { year: 'Year', cluster: 'Category', share: 'Quantity' },
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: 'year', y: 'share', color: 'cluster' },
                baseSize: { width: 400, height: 300 },
            },
            theme_spec: 'swiss',
        } as any);
        return out.spec ?? out;
    }

    it('keeps a clean stacked maximum flush with the axis', () => {
        const spec = stackedArea(100);
        expect(spec.encoding.y.scale).toMatchObject({ domainMin: 0, domainMax: 100, nice: false });
    });

    it('treats floating-point residue from calculated shares as flush', () => {
        const yearlyShares = [
            ['1955', 22.7131238639, 16.6700124857, 2.9797012748, 16.2510873496, 38.8083620953, 2.5777129306],
            ['1960', 23.1673306654, 15.8887417506, 3.0347038067, 16.6089891163, 38.6352683699, 2.6649662911],
            ['1965', 23.5800548972, 15.0968881093, 3.1139372122, 16.7420827415, 38.6837925492, 2.7832444907],
            ['1970', 23.8122264795, 14.1851153816, 3.1965034231, 16.5995289954, 39.3139453013, 2.8926804191],
            ['1975', 24.1962723441, 13.3226671714, 3.3192782807, 16.5053852188, 39.6345427027, 3.0218542823],
            ['1980', 24.9156312003, 12.5591286953, 3.5311844524, 16.5577898534, 39.2200529277, 3.2162128709],
            ['1985', 25.6874049251, 11.8031165523, 3.7351451602, 16.4680484502, 38.8244431604, 3.4818417517],
            ['1990', 26.3861262603, 11.0895550616, 3.9583434243, 16.3135719813, 38.5452173843, 3.7071858881],
            ['1995', 27.3018090463, 10.5337539377, 4.0952183708, 16.374040122, 37.8327450169, 3.8624335062],
            ['2000', 28.247815136, 10.0455245409, 4.3245615068, 16.4175767489, 36.9529066531, 4.0116154143],
            ['2005', 29.121162734, 9.7053050731, 4.5674750342, 16.3698617817, 36.0714490806, 4.1647462963],
        ] as const;
        const values = yearlyShares.flatMap(([year, ...shares]) =>
            shares.map((population_share, cluster) => ({ year, cluster: String(cluster), population_share }))
        );
        const out: any = assembleVegaLite({
            data: { values },
            semantic_types: { year: 'Year', cluster: 'Category', population_share: 'Quantity' },
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: 'year', y: 'population_share', color: 'cluster' },
                baseSize: { width: 300, height: 300 },
                title: 'Population share by cluster over time',
                subtitle: 'Shares are calculated within each year',
            },
        } as any);
        const spec = out.spec ?? out;
        const totals = yearlyShares.map(([, ...shares]) => shares.reduce((sum, share) => sum + share, 0));
        expect(Math.max(...totals)).toBeGreaterThan(100);
        expect(Math.max(...totals)).toBeCloseTo(100, 8);
        expect(spec.encoding.y.scale).toMatchObject({ domainMin: 0, domainMax: 100, nice: false });

        const compiled = compile(spec).spec as any;
        const yScale = compiled.scales.find((scale: any) => scale.name === 'y');
        expect(yScale).toMatchObject({ domainMin: 0, domainMax: 100, nice: false });
    });

    it('leaves a meaningful stacked excess eligible for outward nice rounding', () => {
        const out: any = assembleVegaLite({
            data: { values: [
                { year: 2000, cluster: 'A', share: 40 },
                { year: 2000, cluster: 'B', share: 60.3 },
            ] },
            semantic_types: { year: 'Year', cluster: 'Category', share: 'Quantity' },
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: 'year', y: 'share', color: 'cluster' },
                baseSize: { width: 400, height: 300 },
            },
        } as any);
        const spec = out.spec ?? out;
        expect(spec.encoding.y.scale.domainMax).toBeUndefined();
        expect(spec.encoding.y.scale.nice).not.toBe(false);
    });

});
