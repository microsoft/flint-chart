// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Connected Scatter Plot test data.
 *
 * A connected scatter plots points in 2-D (x, y both quantitative) and joins
 * them with a straight line **in a defined order** (time / sequence), tracing a
 * trajectory through the space. The read is the x↔y correlation AND the ordered
 * path at once. These generators cover the shapes a connected scatter is built
 * for: a single ordered trajectory, multiple color-grouped trajectories,
 * temporal vs numeric/index order fields, a self-crossing (looping) path where
 * x is non-monotonic with the order, and low → high point counts.
 *
 * Every case sets the `order` channel — the connecting line must follow it, not
 * the x value.
 *
 * `genConnectedScatterTests`        — canonical (Vega-Lite) gallery + coverage.
 * `genEChartsConnectedScatterTests` — curated subset for the ECharts wall.
 * `genChartJsConnectedScatterTests` — curated subset for the Chart.js wall.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { realConnectedScatterCases } from './real-world-tests';
import { seededRandom, genCategories, genYears } from './generators';

export function genConnectedScatterTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(2026);

    // 1. BASIC — single trajectory of 10 ordered points: the Phillips-curve
    //    style unemployment-vs-inflation path over 10 years, ordered by year.
    {
        const years = genYears(10, 2014); // 2014..2023
        // A hand-shaped path that wanders (not monotonic in x) so the line is a
        // genuine trajectory, not a left-to-right sweep.
        const unemployment = [6.2, 5.3, 4.9, 4.4, 3.9, 3.7, 8.1, 5.4, 3.6, 3.7];
        const inflation = [1.6, 0.1, 1.3, 2.1, 2.4, 1.8, 1.2, 4.7, 8.0, 4.1];
        const data = years.map((yr, i) => ({
            Year: yr,
            'Unemployment Rate': unemployment[i],
            'Inflation Rate': inflation[i],
        }));
        tests.push({
            title: 'Unemployment vs Inflation over 10 years (basic)',
            description: 'A single trajectory of 10 yearly points, connected in year order — minimum useful connected scatter',
            tags: ['quantitative', 'temporal-order', 'single', 'small'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('Unemployment Rate'), makeField('Inflation Rate'), makeField('Year')],
            metadata: {
                'Unemployment Rate': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Inflation Rate': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Year: { type: Type.Number, semanticType: 'Year', levels: years },
            },
            encodingMap: {
                x: makeEncodingItem('Unemployment Rate'),
                y: makeEncodingItem('Inflation Rate'),
                order: makeEncodingItem('Year'),
            },
        });
    }

    // 2. ADVANCED — 3 countries, each its own trajectory (color), ordered by
    //    year. GDP growth vs inflation paths that wander and overlap.
    {
        const years = genYears(8, 2016); // 2016..2023
        const countries = genCategories('Country', 3); // USA, China, Japan
        // Distinct wandering profiles per country (gdp%, infl%) per year.
        const profiles: Record<string, { gdp: number[]; infl: number[] }> = {
            [countries[0]]: { gdp: [1.7, 2.3, 2.9, 2.3, -3.4, 5.9, 2.1, 2.5], infl: [1.3, 2.1, 2.4, 1.8, 1.2, 4.7, 8.0, 4.1] },
            [countries[1]]: { gdp: [6.8, 6.9, 6.7, 6.0, 2.2, 8.4, 3.0, 5.2], infl: [2.0, 1.6, 2.1, 2.9, 2.4, 0.9, 2.0, 0.2] },
            [countries[2]]: { gdp: [0.8, 1.7, 0.6, -0.4, -4.3, 2.1, 1.0, 1.9], infl: [-0.1, 0.5, 1.0, 0.5, 0.0, -0.2, 2.5, 3.3] },
        };
        const data: any[] = [];
        for (const c of countries) {
            years.forEach((yr, i) => {
                data.push({
                    Country: c,
                    Year: yr,
                    'GDP Growth': profiles[c].gdp[i],
                    Inflation: profiles[c].infl[i],
                });
            });
        }
        tests.push({
            title: 'GDP growth vs Inflation × 3 countries + Color (trajectories)',
            description: '3 countries, each an 8-year trajectory distinguished by color — multi-series connected scatter',
            tags: ['quantitative', 'temporal-order', 'color', 'multi-series', 'medium'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('GDP Growth'), makeField('Inflation'), makeField('Year'), makeField('Country')],
            metadata: {
                'GDP Growth': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Inflation: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Year: { type: Type.Number, semanticType: 'Year', levels: years },
                Country: { type: Type.String, semanticType: 'Country', levels: countries },
            },
            encodingMap: {
                x: makeEncodingItem('GDP Growth'),
                y: makeEncodingItem('Inflation'),
                order: makeEncodingItem('Year'),
                color: makeEncodingItem('Country'),
            },
        });
    }

    // 3. TEMPORAL order field — ISO dates. A stock's price vs volume path
    //    connected in date order (a single trajectory).
    {
        const dates = [
            '2023-01-03', '2023-02-01', '2023-03-01', '2023-04-03', '2023-05-01',
            '2023-06-01', '2023-07-03', '2023-08-01', '2023-09-01', '2023-10-02',
            '2023-11-01', '2023-12-01',
        ];
        const price = [142, 151, 148, 165, 172, 180, 193, 188, 171, 170, 189, 192];
        const volume = [58, 47, 63, 41, 38, 52, 35, 44, 71, 66, 49, 40];
        const data = dates.map((d, i) => ({ Date: d, 'Trade Volume': volume[i], 'Share Price': price[i] }));
        tests.push({
            title: 'Share price vs Volume over 12 dates (temporal order)',
            description: 'A 12-point monthly trajectory ordered by an ISO-date field — temporal order channel',
            tags: ['quantitative', 'temporal-order', 'dates', 'single', 'medium'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('Trade Volume'), makeField('Share Price'), makeField('Date')],
            metadata: {
                'Trade Volume': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Share Price': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Date: { type: Type.Date, semanticType: 'Date', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Trade Volume'),
                y: makeEncodingItem('Share Price'),
                order: makeEncodingItem('Date'),
            },
        });
    }

    // 4. LOOPING / SELF-CROSSING — a figure-eight (Gerono lemniscate) traversed
    //    by a numeric step index. x is NON-monotonic with the order and the
    //    path crosses itself — the defining case for a connected scatter.
    {
        const N = 24;
        const data: any[] = [];
        for (let i = 0; i < N; i++) {
            const t = (2 * Math.PI * i) / (N - 1);
            const x = 50 + 40 * Math.cos(t);
            const y = 50 + 40 * Math.sin(t) * Math.cos(t); // sin(2t)/2 → crosses at center
            data.push({
                Step: i,
                'Signal A': Math.round(x * 10) / 10,
                'Signal B': Math.round(y * 10) / 10,
            });
        }
        tests.push({
            title: 'Self-crossing sensor loop × 24 steps (figure-eight)',
            description: 'A figure-eight trajectory ordered by step index — x is non-monotonic and the line crosses itself',
            tags: ['quantitative', 'index-order', 'looping', 'self-crossing', 'single', 'medium'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('Signal A'), makeField('Signal B'), makeField('Step')],
            metadata: {
                'Signal A': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Signal B': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Step: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Signal A'),
                y: makeEncodingItem('Signal B'),
                order: makeEncodingItem('Step'),
            },
        });
    }

    // 5. NUMERIC / INDEX order field, multi-series — two lab experiments,
    //    each a temperature-vs-pressure trajectory ordered by a step index.
    {
        const experiments = ['Trial A', 'Trial B'];
        const steps = [1, 2, 3, 4, 5, 6, 7, 8];
        // Two wandering pressure/temperature paths.
        const profiles: Record<string, { temp: number[]; pres: number[] }> = {
            'Trial A': { temp: [20, 35, 55, 70, 60, 45, 30, 22], pres: [1.0, 1.4, 2.1, 3.0, 2.6, 1.9, 1.3, 1.05] },
            'Trial B': { temp: [25, 30, 48, 68, 80, 62, 40, 28], pres: [1.1, 1.2, 1.8, 2.7, 3.4, 2.4, 1.5, 1.15] },
        };
        const data: any[] = [];
        for (const ex of experiments) {
            steps.forEach((s, i) => {
                data.push({
                    Experiment: ex,
                    Step: s,
                    Temperature: profiles[ex].temp[i],
                    Pressure: profiles[ex].pres[i],
                });
            });
        }
        tests.push({
            title: 'Temperature vs Pressure × 2 trials + Color (index order)',
            description: 'Two experiment trajectories ordered by a numeric step index, grouped by color',
            tags: ['quantitative', 'index-order', 'color', 'multi-series', 'small', 'edge-case'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('Temperature'), makeField('Pressure'), makeField('Step'), makeField('Experiment')],
            metadata: {
                Temperature: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Pressure: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Step: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Experiment: { type: Type.String, semanticType: 'Category', levels: experiments },
            },
            encodingMap: {
                x: makeEncodingItem('Temperature'),
                y: makeEncodingItem('Pressure'),
                order: makeEncodingItem('Step'),
                color: makeEncodingItem('Experiment'),
            },
        });
    }

    // 6. LOW point count — a minimal 4-point trajectory (smallest useful case).
    {
        const data = [
            { Quarter: 1, Cost: 12, Revenue: 18 },
            { Quarter: 2, Cost: 20, Revenue: 26 },
            { Quarter: 3, Cost: 17, Revenue: 35 },
            { Quarter: 4, Cost: 24, Revenue: 30 },
        ];
        tests.push({
            title: 'Cost vs Revenue over 4 quarters (low count)',
            description: 'A minimal 4-point trajectory ordered by quarter index — lowest useful connected scatter',
            tags: ['quantitative', 'index-order', 'single', 'small', 'edge-case'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('Cost'), makeField('Revenue'), makeField('Quarter')],
            metadata: {
                Cost: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Revenue: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Quarter: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Cost'),
                y: makeEncodingItem('Revenue'),
                order: makeEncodingItem('Quarter'),
            },
        });
    }

    // 7. HIGHER point count — a 36-step single trajectory (a noisy spiral) that
    //    winds through the plane, ordered by step (stress / density case).
    {
        const N = 36;
        const data: any[] = [];
        for (let i = 0; i < N; i++) {
            const t = (3 * Math.PI * i) / (N - 1);
            const r = 10 + i * 1.6;
            const x = 60 + r * Math.cos(t) + (rand() - 0.5) * 4;
            const y = 60 + r * Math.sin(t) + (rand() - 0.5) * 4;
            data.push({
                Step: i,
                'X Position': Math.round(x * 10) / 10,
                'Y Position': Math.round(y * 10) / 10,
            });
        }
        tests.push({
            title: 'Winding spiral × 36 steps (higher count)',
            description: 'A 36-point spiral trajectory ordered by step index — higher point count / density',
            tags: ['quantitative', 'index-order', 'looping', 'single', 'large', 'edge-case'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('X Position'), makeField('Y Position'), makeField('Step')],
            metadata: {
                'X Position': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Y Position': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Step: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('X Position'),
                y: makeEncodingItem('Y Position'),
                order: makeEncodingItem('Step'),
            },
        });
    }

    // 8. DETAIL channel — several small trajectories grouped WITHOUT a color
    //    legend (the collective shape is the read). Exercises the `detail`
    //    channel; tagged edge-case so it stays out of the gallery wall.
    {
        const sensors = genCategories('Product', 4); // Laptop, Phone, Tablet, Desktop
        const steps = [1, 2, 3, 4, 5, 6];
        const data: any[] = [];
        sensors.forEach((s, si) => {
            const base = 20 + si * 12;
            steps.forEach((st, i) => {
                const x = base + 18 * Math.sin((i / 5) * Math.PI) + (rand() - 0.5) * 4;
                const y = base + 18 * Math.cos((i / 5) * Math.PI) + (rand() - 0.5) * 4;
                data.push({ Sensor: s, Step: st, Drift: Math.round(x * 10) / 10, Noise: Math.round(y * 10) / 10 });
            });
        });
        tests.push({
            title: 'Drift vs Noise × 4 sensors + Detail (no legend)',
            description: '4 sensor trajectories grouped by detail rather than color — legend-less small multiples of paths',
            tags: ['quantitative', 'index-order', 'detail', 'multi-series', 'edge-case'],
            chartType: 'Connected Scatter Plot',
            data,
            fields: [makeField('Drift'), makeField('Noise'), makeField('Step'), makeField('Sensor')],
            metadata: {
                Drift: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Noise: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Step: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Sensor: { type: Type.String, semanticType: 'Category', levels: sensors },
            },
            encodingMap: {
                x: makeEncodingItem('Drift'),
                y: makeEncodingItem('Noise'),
                order: makeEncodingItem('Step'),
                detail: makeEncodingItem('Sensor'),
            },
        });
    }

    return [...tests, ...realConnectedScatterCases()];
}

/**
 * ECharts wall variants — basic single trajectory, multi-series color, temporal
 * order, and the self-crossing loop. These translate cleanly to the
 * series-based ECharts backend.
 */
export function genEChartsConnectedScatterTests(): TestCase[] {
    const all = genConnectedScatterTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('Unemployment vs Inflation over 10 years (basic)'),
        pick('GDP growth vs Inflation × 3 countries + Color (trajectories)'),
        pick('Share price vs Volume over 12 dates (temporal order)'),
        pick('Self-crossing sensor loop × 24 steps (figure-eight)'),
    ];
}

/**
 * Chart.js wall variants — basic single trajectory, multi-series color, the
 * self-crossing loop, and the index-order multi-series case. Chart.js builds one
 * dataset per trajectory, so the single and color-grouped cases are the
 * representative set.
 */
export function genChartJsConnectedScatterTests(): TestCase[] {
    const all = genConnectedScatterTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('Unemployment vs Inflation over 10 years (basic)'),
        pick('GDP growth vs Inflation × 3 countries + Color (trajectories)'),
        pick('Self-crossing sensor loop × 24 steps (figure-eight)'),
        pick('Driving Shifts Into Reverse — miles vs gas price (US, 1956–2010)'),
    ];
}
