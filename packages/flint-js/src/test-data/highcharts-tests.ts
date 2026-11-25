// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts backend gallery tests.
 *
 * Follows the same pattern as chartjs-tests.ts: each generator returns a
 * TestCase[] covering normal, semantic, density, and edge cases for one
 * chart family. Registered in TEST_GENERATORS (test-data/index.ts) so the
 * gallery and the full-test-case matrix pick them up.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom, genCategories, genMonths } from './generators';

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

function genBarData(seed: number) {
    const rand = seededRandom(seed);
    const products = ['Apples', 'Bananas', 'Cherries', 'Dates', 'Elderberries'];
    return products.map(p => ({
        Product: p,
        Sales: Math.round(100 + rand() * 900),
    }));
}

function genLineData(seed: number) {
    const rand = seededRandom(seed);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return months.map(m => ({
        Month: m,
        Revenue: Math.round(1000 + rand() * 5000),
    }));
}

function genMultiSeriesLineData(seed: number) {
    const rand = seededRandom(seed);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const series = ['ProductA', 'ProductB', 'ProductC'];
    const data: any[] = [];
    for (const m of months) {
        for (const s of series) {
            data.push({
                Month: m,
                Sales: Math.round(500 + rand() * 2000),
                Product: s,
            });
        }
    }
    return data;
}

function genStackedBarData(seed: number) {
    const rand = seededRandom(seed);
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const regions = ['North', 'South', 'East', 'West'];
    const data: any[] = [];
    for (const q of quarters) {
        for (const r of regions) {
            data.push({
                Quarter: q,
                Revenue: Math.round(50 + rand() * 400),
                Region: r,
            });
        }
    }
    return data;
}

function genScatterData(n: number, seed: number) {
    const rand = seededRandom(seed);
    return Array.from({ length: n }, () => ({
        Weight: Math.round((40 + rand() * 60) * 10) / 10,
        Height: Math.round((150 + rand() * 50) * 10) / 10,
    }));
}

function genScatterColorData(n: number, seed: number) {
    const rand = seededRandom(seed);
    const categories = ['Alpha', 'Beta', 'Gamma'];
    return Array.from({ length: n }, (_, i) => ({
        X: Math.round(rand() * 100 * 10) / 10,
        Y: Math.round(rand() * 100 * 10) / 10,
        Group: categories[i % categories.length],
    }));
}

function genPieData(seed: number) {
    const rand = seededRandom(seed);
    const categories = ['Desktop', 'Mobile', 'Tablet', 'Other'];
    return categories.map(c => ({
        Channel: c,
        Sessions: Math.round(500 + rand() * 4500),
    }));
}

function genHistogramData(n: number, seed: number) {
    const rand = seededRandom(seed);
    return Array.from({ length: n }, () => ({
        Value: Math.round((rand() + rand() + rand() - 1.5) * 1000) / 10,
    }));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export function genHighchartsBarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genBarData(100);
        tests.push({
            title: 'HC: Bar — Basic',
            description: '5 products, single series.',
            tags: ['highcharts', 'bar', 'simple'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Product'), makeField('Sales')],
            metadata: {
                Product: { type: Type.String, semanticType: 'Category', levels: ['Apples', 'Bananas', 'Cherries', 'Dates', 'Elderberries'] },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Product'), y: makeEncodingItem('Sales') },
        });
    }

    {
        const rand = seededRandom(150);
        const cities = genCategories('City', 20);
        const data = cities.map(c => ({
            City: c,
            Population: Math.round(10000 + rand() * 900000),
        }));
        tests.push({
            title: 'HC: Bar — 20 categories',
            description: 'Many categories — tests layout and label rotation.',
            tags: ['highcharts', 'bar', 'many-categories'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('City'), makeField('Population')],
            metadata: {
                City: { type: Type.String, semanticType: 'Category', levels: cities },
                Population: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('City'), y: makeEncodingItem('Population') },
        });
    }

    {
        const cats = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
        const vals = [120, -45, 80, -30, 60, -20, 95];
        const data = cats.map((c, i) => ({ Month: c, NetChange: vals[i] }));
        tests.push({
            title: 'HC: Bar — Net Change (diverging)',
            description: 'Positive and negative values render bars on both sides of the zero baseline.',
            tags: ['highcharts', 'bar', 'diverging'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Month'), makeField('NetChange')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: cats },
                NetChange: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('NetChange') },
        });
    }

    {
        const data = genBarData(101);
        tests.push({
            title: 'HC: Bar — Horizontal',
            description: 'Category on the y axis renders horizontal bars.',
            tags: ['highcharts', 'bar', 'horizontal'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Product'), makeField('Sales')],
            metadata: {
                Product: { type: Type.String, semanticType: 'Category', levels: ['Apples', 'Bananas', 'Cherries', 'Dates', 'Elderberries'] },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Sales'), y: makeEncodingItem('Product') },
        });
    }

    return tests;
}

export function genHighchartsStackedBarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genStackedBarData(500);
        tests.push({
            title: 'HC: Stacked Bar — Regions × Quarters',
            description: 'Stacked bar chart with 4 quarters and 4 regions.',
            tags: ['highcharts', 'stacked-bar', 'color'],
            chartType: 'Stacked Bar Chart',
            data,
            fields: [makeField('Quarter'), makeField('Revenue'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Category', levels: ['Q1', 'Q2', 'Q3', 'Q4'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: ['North', 'South', 'East', 'West'] },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Revenue'), color: makeEncodingItem('Region') },
        });
    }

    return tests;
}

export function genHighchartsGroupedBarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genStackedBarData(501);
        tests.push({
            title: 'HC: Grouped Bar — Regions × Quarters',
            description: 'Grouped bar chart with side-by-side series per region.',
            tags: ['highcharts', 'grouped-bar', 'group'],
            chartType: 'Grouped Bar Chart',
            data,
            fields: [makeField('Quarter'), makeField('Revenue'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Category', levels: ['Q1', 'Q2', 'Q3', 'Q4'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: ['North', 'South', 'East', 'West'] },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Revenue'), group: makeEncodingItem('Region') },
        });
    }

    return tests;
}

export function genHighchartsLineTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genLineData(200);
        tests.push({
            title: 'HC: Line — Basic',
            description: '6 months, single series.',
            tags: ['highcharts', 'line', 'simple'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Month'), makeField('Revenue')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Revenue') },
        });
    }

    {
        const data = genMultiSeriesLineData(201);
        tests.push({
            title: 'HC: Line — Multi-series',
            description: '3 products across 8 months.',
            tags: ['highcharts', 'line', 'color'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Month'), makeField('Sales'), makeField('Product')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Product: { type: Type.String, semanticType: 'Category', levels: ['ProductA', 'ProductB', 'ProductC'] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Sales'), color: makeEncodingItem('Product') },
        });
    }

    {
        const months = genMonths(12);
        const data = months.map((m, i) => ({
            Date: m,
            Value: Math.round(100 + i * 5 + (i % 3) * 20),
        }));
        tests.push({
            title: 'HC: Line — Temporal (datetime axis)',
            description: 'Date x-axis renders a native Highcharts datetime axis.',
            tags: ['highcharts', 'line', 'temporal'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Date'), makeField('Value')],
            metadata: {
                Date: { type: Type.String, semanticType: 'Date', levels: months },
                Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Date'), y: makeEncodingItem('Value') },
        });
    }

    return tests;
}

export function genHighchartsAreaTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genLineData(300);
        tests.push({
            title: 'HC: Area — Basic',
            description: '6 months, filled area.',
            tags: ['highcharts', 'area', 'simple'],
            chartType: 'Area Chart',
            data,
            fields: [makeField('Month'), makeField('Revenue')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Revenue') },
        });
    }

    {
        const data = genMultiSeriesLineData(301);
        tests.push({
            title: 'HC: Area — Multi-series',
            description: '3 products across 8 months, filled areas.',
            tags: ['highcharts', 'area', 'color'],
            chartType: 'Area Chart',
            data,
            fields: [makeField('Month'), makeField('Sales'), makeField('Product')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Product: { type: Type.String, semanticType: 'Category', levels: ['ProductA', 'ProductB', 'ProductC'] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Sales'), color: makeEncodingItem('Product') },
        });
    }

    return tests;
}

export function genHighchartsScatterTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genScatterData(40, 400);
        tests.push({
            title: 'HC: Scatter — Basic',
            description: '40 points, weight vs height.',
            tags: ['highcharts', 'scatter', 'simple'],
            chartType: 'Scatter Plot',
            data,
            fields: [makeField('Weight'), makeField('Height')],
            metadata: {
                Weight: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Height: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Weight'), y: makeEncodingItem('Height') },
        });
    }

    {
        const data = genScatterColorData(60, 401);
        tests.push({
            title: 'HC: Scatter — Colored groups',
            description: '60 points in 3 groups.',
            tags: ['highcharts', 'scatter', 'color'],
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

export function genHighchartsPieTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genPieData(500);
        tests.push({
            title: 'HC: Pie — Channels',
            description: '4 channels, one slice each.',
            tags: ['highcharts', 'pie', 'simple'],
            chartType: 'Pie Chart',
            data,
            fields: [makeField('Channel'), makeField('Sessions')],
            metadata: {
                Channel: { type: Type.String, semanticType: 'Category', levels: ['Desktop', 'Mobile', 'Tablet', 'Other'] },
                Sessions: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { color: makeEncodingItem('Channel'), size: makeEncodingItem('Sessions') },
        });
    }

    {
        const data = genPieData(501);
        tests.push({
            title: 'HC: Doughnut — Channels',
            description: '4 channels with a doughnut hole.',
            tags: ['highcharts', 'doughnut', 'simple'],
            chartType: 'Doughnut Chart',
            data,
            fields: [makeField('Channel'), makeField('Sessions')],
            metadata: {
                Channel: { type: Type.String, semanticType: 'Category', levels: ['Desktop', 'Mobile', 'Tablet', 'Other'] },
                Sessions: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { color: makeEncodingItem('Channel'), size: makeEncodingItem('Sessions') },
        });
    }

    return tests;
}

export function genHighchartsHistogramTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genHistogramData(200, 600);
        tests.push({
            title: 'HC: Histogram — 200 values',
            description: 'Bell-shaped distribution in 10 bins.',
            tags: ['highcharts', 'histogram', 'simple'],
            chartType: 'Histogram',
            data,
            fields: [makeField('Value')],
            metadata: {
                Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Value') },
            chartProperties: { binCount: 10 },
        });
    }

    return tests;
}

export function genHighchartsRadarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const metrics = ['Speed', 'Cost', 'Quality', 'Service'];
        const entities = ['A', 'B'];
        const data: any[] = [];
        const rand = seededRandom(700);
        for (const e of entities) {
            for (const m of metrics) {
                data.push({
                    Metric: m,
                    Entity: e,
                    Value: Math.round(20 + rand() * 80),
                });
            }
        }
        tests.push({
            title: 'HC: Radar — Two entities',
            description: '4 metrics, 2 entity polygons.',
            tags: ['highcharts', 'radar', 'color'],
            chartType: 'Radar Chart',
            data,
            fields: [makeField('Metric'), makeField('Value'), makeField('Entity')],
            metadata: {
                Metric: { type: Type.String, semanticType: 'Category', levels: metrics },
                Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Entity: { type: Type.String, semanticType: 'Category', levels: entities },
            },
            encodingMap: { x: makeEncodingItem('Metric'), y: makeEncodingItem('Value'), color: makeEncodingItem('Entity') },
        });
    }

    return tests;
}

export function genHighchartsHeatmapTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = [
            { Category: 'A', Group: 'X' },
            { Category: 'A', Group: 'Y' },
            { Category: 'B', Group: 'X' },
            { Category: 'B', Group: 'Y' },
            { Category: 'C', Group: 'X' },
        ];
        tests.push({
            title: 'HC: Heatmap — Category × Group',
            description: 'Count heatmap over two nominal axes.',
            tags: ['highcharts', 'heatmap'],
            chartType: 'Heatmap',
            data,
            fields: [makeField('Category'), makeField('Group')],
            metadata: {
                Category: { type: Type.String, semanticType: 'Category', levels: ['A', 'B', 'C'] },
                Group: { type: Type.String, semanticType: 'Category', levels: ['X', 'Y'] },
            },
            encodingMap: { x: makeEncodingItem('Category'), y: makeEncodingItem('Group') },
        });
    }

    {
        const months = genMonths(6);
        const products = ['P1', 'P2', 'P3'];
        const rand = seededRandom(601);
        const data: any[] = [];
        for (const m of months) {
            for (const p of products) {
                data.push({ Month: m, Product: p, Sales: Math.round(rand() * 100) });
            }
        }
        tests.push({
            title: 'HC: Heatmap — Temporal × Category (value)',
            description: 'Value heatmap with a continuous color axis.',
            tags: ['highcharts', 'heatmap', 'temporal'],
            chartType: 'Heatmap',
            data,
            fields: [makeField('Month'), makeField('Product'), makeField('Sales')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: months },
                Product: { type: Type.String, semanticType: 'Category', levels: products },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Month'),
                y: makeEncodingItem('Product'),
                color: makeEncodingItem('Sales'),
            },
        });
    }

    return tests;
}

export function genHighchartsWaterfallTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = [
            { Step: 'Opening', Variance: 500 },
            { Step: 'Sales', Variance: 200 },
            { Step: 'Refunds', Variance: -45 },
            { Step: 'Closing', Variance: 655 },
        ];
        tests.push({
            title: 'HC: Waterfall — Budget bridge',
            description: 'Opening to closing with positive and negative steps.',
            tags: ['highcharts', 'waterfall'],
            chartType: 'Waterfall Chart',
            data,
            fields: [makeField('Step'), makeField('Variance')],
            metadata: {
                Step: { type: Type.String, semanticType: 'Category', levels: ['Opening', 'Sales', 'Refunds', 'Closing'] },
                Variance: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Step'), y: makeEncodingItem('Variance') },
        });
    }

    return tests;
}

export function genHighchartsSunburstTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = [
            { Region: 'Americas', Country: 'USA', Revenue: 20 },
            { Region: 'Americas', Country: 'Canada', Revenue: 15 },
            { Region: 'Europe', Country: 'France', Revenue: 30 },
            { Region: 'Europe', Country: 'Germany', Revenue: 25 },
            { Region: 'Asia', Country: 'Japan', Revenue: 40 },
        ];
        tests.push({
            title: 'HC: Sunburst — Region → Country',
            description: 'Two-level hierarchy with leaf values.',
            tags: ['highcharts', 'sunburst'],
            chartType: 'Sunburst Chart',
            data,
            fields: [makeField('Region'), makeField('Country'), makeField('Revenue')],
            metadata: {
                Region: { type: Type.String, semanticType: 'Category', levels: ['Americas', 'Europe', 'Asia'] },
                Country: { type: Type.String, semanticType: 'Country', levels: ['USA', 'Canada', 'France', 'Germany', 'Japan'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: {
                color: makeEncodingItem('Region'),
                group: makeEncodingItem('Country'),
                size: makeEncodingItem('Revenue'),
            },
        });
    }

    return tests;
}

export function genHighchartsFacetTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genStackedBarData(800);
        tests.push({
            title: 'HC: Bar — Faceted by Region',
            description: 'Column facet wraps into a grid of per-region bar charts.',
            tags: ['highcharts', 'bar', 'facet'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Quarter'), makeField('Revenue'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Category', levels: ['Q1', 'Q2', 'Q3', 'Q4'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: ['North', 'South', 'East', 'West'] },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Revenue'), column: makeEncodingItem('Region') },
        });
    }

    return tests;
}
