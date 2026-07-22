// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly backend tests.
 *
 * Exercises the Plotly backend's first-merge surface: the four acceptance
 * templates (Bar, Line, Area, Scatter) with color on/off, and the facet
 * grid path (column, row, column×row) that renders as Plotly subplot pairs.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom } from './generators';

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

function genRegionSales(seed: number) {
    const rand = seededRandom(seed);
    const regions = ['East', 'South', 'North', 'West', 'Central'];
    return regions.map(r => ({
        Region: r,
        Revenue: Math.round(100 + rand() * 900),
    }));
}

function genMonthlySeries(seed: number, series: string[]) {
    const rand = seededRandom(seed);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const data: any[] = [];
    for (const m of months) {
        for (const s of series) {
            data.push({
                Month: m,
                Value: Math.round(200 + rand() * 800),
                Series: s,
            });
        }
    }
    return data;
}

function genScatterGroups(n: number, seed: number) {
    const rand = seededRandom(seed);
    const groups = ['Alpha', 'Beta', 'Gamma'];
    return Array.from({ length: n }, (_, i) => ({
        X: Math.round(rand() * 100 * 10) / 10,
        Y: Math.round(rand() * 100 * 10) / 10,
        Group: groups[i % groups.length],
    }));
}

function genQuarterRegion(seed: number) {
    const rand = seededRandom(seed);
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const regions = ['North', 'South'];
    const data: any[] = [];
    for (const q of quarters) {
        for (const r of regions) {
            data.push({
                Quarter: q,
                Revenue: Math.round(200 + rand() * 800),
                Region: r,
            });
        }
    }
    return data;
}

// ---------------------------------------------------------------------------
// Test case builders
// ---------------------------------------------------------------------------

/** The four acceptance templates, single-series and color-grouped. */
export function genPlotlyCoreTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genRegionSales(42);
        tests.push({
            title: 'PL: Bar — Basic N×Q',
            description: 'Single bar trace; category order preserved, zero baseline.',
            tags: ['plotly', 'bar'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Region'), makeField('Revenue')],
            metadata: {
                Region: { type: Type.String, semanticType: 'Region', levels: [] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Region'), y: makeEncodingItem('Revenue') },
        });
    }

    {
        const data = genRegionSales(43);
        tests.push({
            title: 'PL: Bar — Horizontal',
            description: 'Category on y → orientation "h" bar trace.',
            tags: ['plotly', 'bar', 'horizontal'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Region'), makeField('Revenue')],
            metadata: {
                Region: { type: Type.String, semanticType: 'Region', levels: [] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Revenue'), y: makeEncodingItem('Region') },
        });
    }

    {
        const data = genMonthlySeries(77, ['ProductA', 'ProductB', 'ProductC']);
        tests.push({
            title: 'PL: Line — Color Groups',
            description: 'One trace per series; legend from trace names.',
            tags: ['plotly', 'line', 'color', 'multi-series'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Month'), makeField('Value'), makeField('Series')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: [] },
                Value: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Series: { type: Type.String, semanticType: 'Category', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Value'), color: makeEncodingItem('Series') },
        });
    }

    {
        const data = genMonthlySeries(88, ['Web', 'Mobile']);
        tests.push({
            title: 'PL: Area — Stacked',
            description: 'Color groups stack via stackgroup (Plotly-native stacking).',
            tags: ['plotly', 'area', 'color', 'stacked'],
            chartType: 'Area Chart',
            data,
            fields: [makeField('Month'), makeField('Value'), makeField('Series')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: [] },
                Value: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Series: { type: Type.String, semanticType: 'Category', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Value'), color: makeEncodingItem('Series') },
        });
    }

    {
        const data = genScatterGroups(90, 99);
        tests.push({
            title: 'PL: Scatter — Color Groups',
            description: 'Markers mode, one trace per group, qualitative palette.',
            tags: ['plotly', 'scatter', 'color', 'multi-series'],
            chartType: 'Scatter Plot',
            data,
            fields: [makeField('X'), makeField('Y'), makeField('Group')],
            metadata: {
                X: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Y: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Group: { type: Type.String, semanticType: 'Category', levels: ['Alpha', 'Beta', 'Gamma'] },
            },
            encodingMap: { x: makeEncodingItem('X'), y: makeEncodingItem('Y'), color: makeEncodingItem('Group') },
        });
    }

    return tests;
}

/** Facet grid path: column, row, and column×row subplot grids. */
export function genPlotlyFacetTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genQuarterRegion(11);
        tests.push({
            title: 'PL: Facet — Column',
            description: 'Bar per Region column; shared nice y-domain, leftmost-only y labels.',
            tags: ['plotly', 'facet', 'column', 'bar'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Quarter'), makeField('Revenue'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Quarter', levels: [] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Region: { type: Type.String, semanticType: 'Region', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Revenue'), column: makeEncodingItem('Region') },
        });
    }

    {
        const data = genQuarterRegion(22);
        tests.push({
            title: 'PL: Facet — Row',
            description: 'Line per Region row; rotated row headers, x title on bottom row only.',
            tags: ['plotly', 'facet', 'row', 'line'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Quarter'), makeField('Revenue'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Quarter', levels: [] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Region: { type: Type.String, semanticType: 'Region', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Revenue'), row: makeEncodingItem('Region') },
        });
    }

    {
        const rand = seededRandom(33);
        const data: any[] = [];
        for (const a of ['A', 'B']) {
            for (const b of ['X', 'Y']) {
                for (let i = 0; i < 12; i++) {
                    data.push({
                        V: Math.round(rand() * 100),
                        W: Math.round(rand() * 100),
                        Col: a,
                        Row: b,
                    });
                }
            }
        }
        tests.push({
            title: 'PL: Facet — Column × Row Grid',
            description: 'Scatter 2×2 grid; one subplot axis pair per cell.',
            tags: ['plotly', 'facet', 'grid', 'scatter'],
            chartType: 'Scatter Plot',
            data,
            fields: [makeField('V'), makeField('W'), makeField('Col'), makeField('Row')],
            metadata: {
                V: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                W: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Col: { type: Type.String, semanticType: 'Category', levels: [] },
                Row: { type: Type.String, semanticType: 'Category', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('V'), y: makeEncodingItem('W'), column: makeEncodingItem('Col'), row: makeEncodingItem('Row') },
        });
    }

    return tests;
}
