// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js backend comparison tests.
 *
 * Runs the same test inputs through ALL THREE backends:
 *   assembleVegaLite (Vega-Lite), assembleECharts (ECharts), assembleChartjs (Chart.js)
 *
 * Covers: Scatter Plot, Line Chart, Bar Chart, Stacked Bar Chart,
 *         Grouped Bar Chart, Area Chart, Pie Chart, Histogram, Radar Chart
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom, genCategories, genMonths } from './generators';

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

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
                Revenue: Math.round(200 + rand() * 800),
                Region: r,
            });
        }
    }
    return data;
}

function genGroupedBarData(seed: number) {
    const rand = seededRandom(seed);
    const years = ['2022', '2023', '2024'];
    const departments = ['Sales', 'Engineering', 'Marketing'];
    const data: any[] = [];
    for (const y of years) {
        for (const d of departments) {
            data.push({
                Year: y,
                Budget: Math.round(10000 + rand() * 50000),
                Department: d,
            });
        }
    }
    return data;
}

function genAreaData(seed: number) {
    const rand = seededRandom(seed);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const series = ['Web', 'Mobile', 'Desktop'];
    const data: any[] = [];
    for (const m of months) {
        for (const s of series) {
            data.push({
                Month: m,
                Users: Math.round(500 + rand() * 3000),
                Platform: s,
            });
        }
    }
    return data;
}

function genPieData(seed: number) {
    const rand = seededRandom(seed);
    const segments = ['Mobile', 'Desktop', 'Tablet', 'Other'];
    return segments.map(s => ({
        Device: s,
        Visits: Math.round(100 + rand() * 1000),
    }));
}

function genHistogramData(n: number, seed: number) {
    const rand = seededRandom(seed);
    return Array.from({ length: n }, () => ({
        Score: Math.round(rand() * 100),
    }));
}

function genRadarData(seed: number) {
    const rand = seededRandom(seed);
    const metrics = ['Speed', 'Power', 'Defense', 'Stamina', 'Accuracy', 'Agility'];
    const entities = ['Player A', 'Player B', 'Player C'];
    const data: any[] = [];
    for (const e of entities) {
        for (const m of metrics) {
            data.push({
                Metric: m,
                Score: Math.round(30 + rand() * 70),
                Player: e,
            });
        }
    }
    return data;
}

// ---------------------------------------------------------------------------
// Test case builders
// ---------------------------------------------------------------------------

export function genChartJsScatterTests(): TestCase[] {
    const tests: TestCase[] = [];

    // 1. Basic scatter
    {
        const data = genScatterData(50, 42);
        tests.push({
            title: 'CJS: Scatter — Basic Q×Q',
            description: '50 points, two quantitative axes.',
            tags: ['chartjs', 'scatter', 'quantitative'],
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

    // 2. Scatter with color grouping
    {
        const data = genScatterColorData(90, 77);
        tests.push({
            title: 'CJS: Scatter — Color Groups',
            description: '90 points, 3 groups. CJS: 3 datasets with different colors.',
            tags: ['chartjs', 'scatter', 'color', 'multi-series'],
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

    // 3. Dense scatter
    {
        const data = genScatterData(500, 99);
        tests.push({
            title: 'CJS: Scatter — Dense (500 pts)',
            description: 'Dense scatter plot. CJS adjusts pointRadius automatically.',
            tags: ['chartjs', 'scatter', 'dense'],
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

    return tests;
}

export function genChartJsLineTests(): TestCase[] {
    const tests: TestCase[] = [];

    // 1. Single series line
    {
        const data = genLineData(200);
        tests.push({
            title: 'CJS: Line — Single Series',
            description: 'Ordinal x-axis, single line.',
            tags: ['chartjs', 'line', 'single-series'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Month'), makeField('Revenue')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan','Feb','Mar','Apr','May','Jun'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Revenue') },
        });
    }

    // 2. Multi-series line
    {
        const data = genMultiSeriesLineData(300);
        tests.push({
            title: 'CJS: Line — Multi-Series (3 products)',
            description: 'Color channel → multiple datasets.',
            tags: ['chartjs', 'line', 'multi-series', 'color'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Month'), makeField('Sales'), makeField('Product')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'] },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Product: { type: Type.String, semanticType: 'Category', levels: ['ProductA','ProductB','ProductC'] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Sales'), color: makeEncodingItem('Product') },
        });
    }

    // 3. Medium multi-series line (5 regions)
    {
        const rand = seededRandom(301);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const regions = genCategories('Region', 5);
        const data: any[] = [];
        for (const m of months) {
            for (const r of regions) {
                data.push({ Month: m, Value: Math.round(200 + rand() * 800), Region: r });
            }
        }
        tests.push({
            title: 'CJS: Line — 5 Regions × 12 Months',
            description: 'Higher series count exercises legend layout and the colour palette.',
            tags: ['chartjs', 'line', 'multi-series', 'medium'],
            chartType: 'Line Chart',
            data,
            fields: [makeField('Month'), makeField('Value'), makeField('Region')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: months },
                Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: regions },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Value'), color: makeEncodingItem('Region') },
        });
    }

    return tests;
}

export function genChartJsBarTests(): TestCase[] {
    const tests: TestCase[] = [];

    // 1. Simple bar
    {
        const data = genBarData(100);
        tests.push({
            title: 'CJS: Bar — Basic',
            description: '5 products, single dataset.',
            tags: ['chartjs', 'bar', 'simple'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Product'), makeField('Sales')],
            metadata: {
                Product: { type: Type.String, semanticType: 'Category', levels: ['Apples','Bananas','Cherries','Dates','Elderberries'] },
                Sales: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Product'), y: makeEncodingItem('Sales') },
        });
    }

    // 2. Many categories
    {
        const rand = seededRandom(150);
        const cities = genCategories('City', 20);
        const data = cities.map(c => ({
            City: c,
            Population: Math.round(10000 + rand() * 900000),
        }));
        tests.push({
            title: 'CJS: Bar — 20 categories',
            description: 'Many categories — tests layout and label rotation.',
            tags: ['chartjs', 'bar', 'many-categories'],
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

    // 3. Diverging bar (positive + negative values)
    {
        const cats = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
        const vals = [120, -45, 80, -30, 60, -20, 95];
        const data = cats.map((c, i) => ({ Month: c, NetChange: vals[i] }));
        tests.push({
            title: 'CJS: Bar — Net Change (diverging)',
            description: 'Positive and negative values render bars on both sides of the zero baseline.',
            tags: ['chartjs', 'bar', 'diverging'],
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

    // 4. Clean medium-cardinality categorical bar
    {
        const rand = seededRandom(151);
        const cats = genCategories('Team', 8);
        const data = cats.map(c => ({ Team: c, Points: Math.round(20 + rand() * 180) }));
        tests.push({
            title: 'CJS: Bar — 8 Teams',
            description: 'A clean categorical bar with eight evenly-labelled categories.',
            tags: ['chartjs', 'bar', 'medium'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Team'), makeField('Points')],
            metadata: {
                Team: { type: Type.String, semanticType: 'Category', levels: cats },
                Points: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Team'), y: makeEncodingItem('Points') },
        });
    }

    return tests;
}

export function genChartJsStackedBarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genStackedBarData(500);
        tests.push({
            title: 'CJS: Stacked Bar — Regions × Quarters',
            description: 'Stacked bar chart with 4 quarters and 4 regions.',
            tags: ['chartjs', 'stacked-bar', 'color'],
            chartType: 'Stacked Bar Chart',
            data,
            fields: [makeField('Quarter'), makeField('Revenue'), makeField('Region')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Category', levels: ['Q1','Q2','Q3','Q4'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: ['North','South','East','West'] },
            },
            encodingMap: { x: makeEncodingItem('Quarter'), y: makeEncodingItem('Revenue'), color: makeEncodingItem('Region') },
        });
    }

    return tests;
}

export function genChartJsGroupedBarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genGroupedBarData(600);
        tests.push({
            title: 'CJS: Grouped Bar — 3 Years × 3 Departments',
            description: 'Grouped (side-by-side) bar chart.',
            tags: ['chartjs', 'grouped-bar', 'color'],
            chartType: 'Grouped Bar Chart',
            data,
            fields: [makeField('Year'), makeField('Budget'), makeField('Department')],
            metadata: {
                Year: { type: Type.String, semanticType: 'Category', levels: ['2022','2023','2024'] },
                Budget: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Department: { type: Type.String, semanticType: 'Category', levels: ['Sales','Engineering','Marketing'] },
            },
            encodingMap: { x: makeEncodingItem('Year'), y: makeEncodingItem('Budget'), group: makeEncodingItem('Department') },
        });
    }

    return tests;
}

export function genChartJsAreaTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genAreaData(700);
        tests.push({
            title: 'CJS: Area — Stacked (3 Platforms)',
            description: 'Stacked area chart with fill.',
            tags: ['chartjs', 'area', 'stacked', 'color'],
            chartType: 'Area Chart',
            data,
            fields: [makeField('Month'), makeField('Users'), makeField('Platform')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'] },
                Users: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Platform: { type: Type.String, semanticType: 'Category', levels: ['Web','Mobile','Desktop'] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Users'), color: makeEncodingItem('Platform') },
        });
    }

    // Single series area
    {
        const data = genLineData(701);
        tests.push({
            title: 'CJS: Area — Single Series',
            description: 'Single series area chart.',
            tags: ['chartjs', 'area', 'single-series'],
            chartType: 'Area Chart',
            data,
            fields: [makeField('Month'), makeField('Revenue')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: ['Jan','Feb','Mar','Apr','May','Jun'] },
                Revenue: { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Revenue') },
        });
    }

    return tests;
}

export function genChartJsPieTests(): TestCase[] {
    const tests: TestCase[] = [];

    // 1. Basic pie
    {
        const data = genPieData(800);
        tests.push({
            title: 'CJS: Pie — Device Breakdown',
            description: 'Pie chart: color=Device, size=Visits.',
            tags: ['chartjs', 'pie'],
            chartType: 'Pie Chart',
            data,
            fields: [makeField('Device'), makeField('Visits')],
            metadata: {
                Device: { type: Type.String, semanticType: 'Category', levels: ['Mobile','Desktop','Tablet','Other'] },
                Visits: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { color: makeEncodingItem('Device'), size: makeEncodingItem('Visits') },
        });
    }

    // 2. Doughnut
    {
        const data = genPieData(801);
        tests.push({
            title: 'CJS: Doughnut — Device Breakdown',
            description: 'Doughnut chart with innerRadius.',
            tags: ['chartjs', 'doughnut', 'pie'],
            chartType: 'Pie Chart',
            data,
            fields: [makeField('Device'), makeField('Visits')],
            metadata: {
                Device: { type: Type.String, semanticType: 'Category', levels: ['Mobile','Desktop','Tablet','Other'] },
                Visits: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { color: makeEncodingItem('Device'), size: makeEncodingItem('Visits') },
            chartProperties: { innerRadius: 40 },
        });
    }

    return tests;
}

export function genChartJsHistogramTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genHistogramData(200, 900);
        tests.push({
            title: 'CJS: Histogram — Scores (200 pts)',
            description: 'Histogram with 10 bins.',
            tags: ['chartjs', 'histogram'],
            chartType: 'Histogram',
            data,
            fields: [makeField('Score')],
            metadata: {
                Score: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Score') },
        });
    }

    return tests;
}

export function genChartJsRadarTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = genRadarData(1000);
        tests.push({
            title: 'CJS: Radar — 3 Players × 6 Metrics',
            description: 'Radar chart with multiple groups.',
            tags: ['chartjs', 'radar', 'multi-group'],
            chartType: 'Radar Chart',
            data,
            fields: [makeField('Metric'), makeField('Score'), makeField('Player')],
            metadata: {
                Metric: { type: Type.String, semanticType: 'Category', levels: ['Speed','Power','Defense','Stamina','Accuracy','Agility'] },
                Score: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Player: { type: Type.String, semanticType: 'Category', levels: ['Player A','Player B','Player C'] },
            },
            encodingMap: { x: makeEncodingItem('Metric'), y: makeEncodingItem('Score'), color: makeEncodingItem('Player') },
        });
    }

    return tests;
}

export function genChartJsStressTests(): TestCase[] {
    const tests: TestCase[] = [];

    // Large scatter
    {
        const data = genScatterData(1000, 1100);
        tests.push({
            title: 'CJS: Stress — 1000pt Scatter',
            description: '1000-point scatter plot performance test.',
            tags: ['chartjs', 'stress', 'scatter'],
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

    // Many categories bar
    {
        const rand = seededRandom(1200);
        const items = genCategories('Item', 50);
        const data = items.map(i => ({
            Item: i,
            Value: Math.round(rand() * 1000),
        }));
        tests.push({
            title: 'CJS: Stress — 50 Cat Bar',
            description: '50-category bar chart — tests overflow and label rotation.',
            tags: ['chartjs', 'stress', 'bar', 'overflow'],
            chartType: 'Bar Chart',
            data,
            fields: [makeField('Item'), makeField('Value')],
            metadata: {
                Item: { type: Type.String, semanticType: 'Category', levels: items },
                Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Item'), y: makeEncodingItem('Value') },
        });
    }

    return tests;
}

// ===========================================================================
// Rose Chart tests
// ===========================================================================

export function genChartJsRoseTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(1500);

    // 1. Basic rose — wind directions × speed
    {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const data = directions.map(d => ({ Direction: d, Speed: Math.round(5 + rand() * 25) }));
        tests.push({
            title: 'CJS: Rose — 8 Directions',
            description: 'Wind speed by compass direction. CJS: polarArea chart type.',
            tags: ['chartjs', 'rose', 'basic'],
            chartType: 'Rose Chart',
            data,
            fields: [makeField('Direction'), makeField('Speed')],
            metadata: {
                Direction: { type: Type.String, semanticType: 'Category', levels: directions },
                Speed: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Direction'), y: makeEncodingItem('Speed') },
            chartProperties: { alignment: 'center' },
        });
    }

    // 2. Stacked rose — directions × season
    {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
        const data: any[] = [];
        for (const d of directions) {
            for (const s of seasons) {
                data.push({ Direction: d, Speed: Math.round(3 + rand() * 20), Season: s });
            }
        }
        tests.push({
            title: 'CJS: Stacked Rose — 8 dirs × 4 seasons',
            description: 'Stacked wind rose by season.',
            tags: ['chartjs', 'rose', 'stacked'],
            chartType: 'Rose Chart',
            data,
            fields: [makeField('Direction'), makeField('Speed'), makeField('Season')],
            metadata: {
                Direction: { type: Type.String, semanticType: 'Category', levels: directions },
                Speed: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Season: { type: Type.String, semanticType: 'Category', levels: seasons },
            },
            encodingMap: { x: makeEncodingItem('Direction'), y: makeEncodingItem('Speed'), color: makeEncodingItem('Season') },
            chartProperties: { alignment: 'center' },
        });
    }

    // 3. Rose — 12 months
    {
        const months = genMonths(12);
        const data = months.map(m => ({ Month: m, Rainfall: Math.round(20 + rand() * 150) }));
        tests.push({
            title: 'CJS: Rose — 12 Months Rainfall',
            description: 'Monthly rainfall as a rose chart.',
            tags: ['chartjs', 'rose', 'medium'],
            chartType: 'Rose Chart',
            data,
            fields: [makeField('Month'), makeField('Rainfall')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Month', levels: months },
                Rainfall: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Rainfall') },
        });
    }

    return tests;
}

// ---------------------------------------------------------------------------
// Doughnut Chart (NEW — flagged with * for inspection)
// ---------------------------------------------------------------------------

export function genChartJsDoughnutTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(41);

    // 1. Market share (few slices)
    {
        const browsers = ['Chrome', 'Safari', 'Edge', 'Firefox', 'Other'];
        const data = browsers.map((b) => ({ Browser: b, Share: Math.round((5 + rand() * 45) * 10) / 10 }));
        tests.push({
            title: 'CJS: Doughnut — Browser Share *',
            description: '5-slice doughnut with a 55% hollow centre; color = category, size = value.',
            tags: ['chartjs', 'doughnut', 'part-to-whole'],
            chartType: 'Doughnut Chart',
            data,
            fields: [makeField('Browser'), makeField('Share')],
            metadata: {
                Browser: { type: Type.String, semanticType: 'Category', levels: browsers },
                Share: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { color: makeEncodingItem('Browser'), size: makeEncodingItem('Share') },
        });
    }

    // 2. Many slices
    {
        const cats = genCategories('Dept', 9);
        const data = cats.map((c) => ({ Dept: c, Budget: Math.round(10 + rand() * 90) }));
        tests.push({
            title: 'CJS: Doughnut — Budget by Department (9 slices) *',
            description: 'Doughnut with 9 categories; legend on the right.',
            tags: ['chartjs', 'doughnut', 'part-to-whole', 'many-categories'],
            chartType: 'Doughnut Chart',
            data,
            fields: [makeField('Dept'), makeField('Budget')],
            metadata: {
                Dept: { type: Type.String, semanticType: 'Category', levels: cats },
                Budget: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { color: makeEncodingItem('Dept'), size: makeEncodingItem('Budget') },
        });
    }

    // 3. Count-only (no size field)
    {
        const types = ['Bug', 'Feature', 'Chore', 'Docs'];
        const data = Array.from({ length: 60 }, () => ({ Type: types[Math.floor(rand() * types.length)] }));
        tests.push({
            title: 'CJS: Doughnut — Issue Types (counts) *',
            description: 'No size channel; slice value is the count of rows per category.',
            tags: ['chartjs', 'doughnut', 'part-to-whole', 'count'],
            chartType: 'Doughnut Chart',
            data,
            fields: [makeField('Type')],
            metadata: {
                Type: { type: Type.String, semanticType: 'Category', levels: types },
            },
            encodingMap: { color: makeEncodingItem('Type') },
        });
    }

    return tests;
}

// ---------------------------------------------------------------------------
// Combo Chart — Bar + Line (NEW — flagged with * for inspection)
// ---------------------------------------------------------------------------

export function genChartJsComboTests(): TestCase[] {
    const tests: TestCase[] = [];

    // 1. Monthly revenue (bars) + growth-rate % (line, right axis)
    {
        const rand = seededRandom(53);
        const months = genMonths(12);
        let prev = 100 + rand() * 40;
        const data = months.map((m) => {
            const rev = Math.round(prev);
            const growth = Math.round((rand() * 20 - 5) * 10) / 10;
            prev = prev * (1 + growth / 100);
            return { Month: m, Revenue: rev, Growth: growth };
        });
        tests.push({
            title: 'CJS: Combo — Revenue (bars) + Growth % (line) *',
            description: 'Dual-axis combo: bars on the left axis, a % line on the right axis.',
            tags: ['chartjs', 'combo', 'dual-axis', 'bar', 'line'],
            chartType: 'Combo Chart',
            data,
            fields: [makeField('Month'), makeField('Revenue'), makeField('Growth')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Category', levels: months },
                Revenue: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Growth: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Revenue') },
            chartProperties: { lineField: 'Growth' },
        });
    }

    // 2. Rainfall (bars) + temperature (line) — classic climograph
    {
        const rand = seededRandom(59);
        const months = genMonths(12);
        const data = months.map((m, i) => {
            const seasonal = Math.sin((i / 12) * Math.PI * 2);
            return {
                Month: m,
                Rainfall: Math.round(40 + (1 - seasonal) * 60 + rand() * 20),
                Temperature: Math.round((15 + seasonal * 10 + rand() * 3) * 10) / 10,
            };
        });
        tests.push({
            title: 'CJS: Combo — Rainfall (bars) + Temperature (line) *',
            description: 'Climograph-style combo with very different unit scales on each axis.',
            tags: ['chartjs', 'combo', 'dual-axis', 'climograph'],
            chartType: 'Combo Chart',
            data,
            fields: [makeField('Month'), makeField('Rainfall'), makeField('Temperature')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Category', levels: months },
                Rainfall: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Temperature: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Rainfall') },
            chartProperties: { lineField: 'Temperature' },
        });
    }

    // 3. Single measure → degrades to a plain bar chart (no line)
    {
        const rand = seededRandom(61);
        const cats = genCategories('Region', 7);
        const data = cats.map((c) => ({ Region: c, Sales: Math.round(20 + rand() * 80) }));
        tests.push({
            title: 'CJS: Combo — Single Measure (bars only) *',
            description: 'No second numeric field; the combo gracefully degrades to bars.',
            tags: ['chartjs', 'combo', 'fallback'],
            chartType: 'Combo Chart',
            data,
            fields: [makeField('Region'), makeField('Sales')],
            metadata: {
                Region: { type: Type.String, semanticType: 'Category', levels: cats },
                Sales: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Region'), y: makeEncodingItem('Sales') },
        });
    }

    return tests;
}

function genBubbleData(n: number, seed: number, withRegion: boolean) {
    const rand = seededRandom(seed);
    const regions = ['Asia', 'Europe', 'Africa', 'Americas'];
    return Array.from({ length: n }, (_, i) => {
        const row: Record<string, any> = {
            GDP: Math.round((1 + rand() * 59) * 10) / 10,
            LifeExp: Math.round((50 + rand() * 35) * 10) / 10,
            Population: Math.round((1 + rand() * 1400) * 10) / 10,
        };
        if (withRegion) row.Region = regions[i % regions.length];
        return row;
    });
}

export function genChartJsBubbleTests(): TestCase[] {
    const tests: TestCase[] = [];

    // 1. Grouped bubble: size + color
    {
        const data = genBubbleData(40, 17, true);
        tests.push({
            title: 'CJS: Bubble — GDP × LifeExp × Population *',
            description: 'Bubble chart: x=GDP, y=LifeExp, size=Population, color=Region (4 groups).',
            tags: ['chartjs', 'bubble', 'size', 'color'],
            chartType: 'Bubble Chart',
            data,
            fields: [makeField('GDP'), makeField('LifeExp'), makeField('Population'), makeField('Region')],
            metadata: {
                GDP: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                LifeExp: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Population: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: ['Asia', 'Europe', 'Africa', 'Americas'] },
            },
            encodingMap: {
                x: makeEncodingItem('GDP'),
                y: makeEncodingItem('LifeExp'),
                size: makeEncodingItem('Population'),
                color: makeEncodingItem('Region'),
            },
        });
    }

    // 2. Single-series bubble: size only
    {
        const data = genBubbleData(36, 23, false);
        tests.push({
            title: 'CJS: Bubble — Single Series (size only) *',
            description: 'Bubble chart with one series; bubble area encodes Population.',
            tags: ['chartjs', 'bubble', 'size'],
            chartType: 'Bubble Chart',
            data,
            fields: [makeField('GDP'), makeField('LifeExp'), makeField('Population')],
            metadata: {
                GDP: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                LifeExp: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Population: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('GDP'),
                y: makeEncodingItem('LifeExp'),
                size: makeEncodingItem('Population'),
            },
        });
    }

    // 3. Dense bubble: tests density-aware radius scaling
    {
        const data = genBubbleData(120, 29, true);
        tests.push({
            title: 'CJS: Bubble — Dense (120 points) *',
            description: 'Dense bubble chart; radius shrinks with point density to stay legible.',
            tags: ['chartjs', 'bubble', 'dense', 'size', 'color'],
            chartType: 'Bubble Chart',
            data,
            fields: [makeField('GDP'), makeField('LifeExp'), makeField('Population'), makeField('Region')],
            metadata: {
                GDP: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                LifeExp: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Population: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: ['Asia', 'Europe', 'Africa', 'Americas'] },
            },
            encodingMap: {
                x: makeEncodingItem('GDP'),
                y: makeEncodingItem('LifeExp'),
                size: makeEncodingItem('Population'),
                color: makeEncodingItem('Region'),
            },
        });
    }

    return tests;
}
