// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Range Area Chart (band / high–low / area-range) test data.
 *
 * A range area fills a band between a LOWER bound (`y`) and an UPPER bound
 * (`y2`) at each x, showing the extent of a range and how it moves over the
 * continuum (daily min/max temperature, a forecast cone, a 52-week price range).
 * These generators cover the shapes a range area is built for: temporal x with
 * daily low/high, multiple overlapping bands by color, numeric and ordinal x,
 * a band that crosses zero (negatives), a narrowing-then-widening forecast cone,
 * and low → high x cardinality. Every case maps x, y (low) and y2 (high).
 *
 * `genRangeAreaTests`        — the canonical (Vega-Lite) gallery + coverage set.
 * `genEChartsRangeAreaTests` — curated subset for the ECharts wall.
 * `genChartJsRangeAreaTests` — curated subset for the Chart.js wall.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { realRangeAreaCases } from './real-world-tests';
import { seededRandom, genYears } from './generators';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Consecutive calendar days as ISO `YYYY-MM-DD` strings. Unlike the shared
 * `genDates` helper (which spreads n points across ~3 years), a range area that
 * shows a *daily* low/high needs genuinely consecutive days so the band reads as
 * a continuous day-by-day envelope.
 */
function dailyDates(n: number, startYear = 2024, startMonth = 0, startDay = 1): string[] {
    const out: string[] = [];
    const start = new Date(Date.UTC(startYear, startMonth, startDay));
    for (let i = 0; i < n; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

export function genRangeAreaTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(7141);

    // 1. BASIC — daily min/max temperature over 14 days (temporal x, one band).
    {
        const dates = dailyDates(14, 2024);
        const data = dates.map((d, i) => {
            const mid = 14 + 6 * Math.sin(i / 2) + (rand() - 0.5) * 3;
            const spread = 4 + rand() * 4;
            return {
                Date: d,
                'Min °C': Math.round((mid - spread) * 10) / 10,
                'Max °C': Math.round((mid + spread) * 10) / 10,
            };
        });
        tests.push({
            title: 'Daily temperature range over 14 days (basic)',
            description: 'A band between the daily low and high temperature — minimum useful range area',
            tags: ['temporal', 'quantitative', 'range', 'single', 'small', 'gallery'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Date'), makeField('Min °C'), makeField('Max °C')],
            metadata: {
                Date: { type: Type.Date, semanticType: 'Date', levels: [] },
                'Min °C': { type: Type.Number, semanticType: 'Temperature', levels: [] },
                'Max °C': { type: Type.Number, semanticType: 'Temperature', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Date'),
                y: makeEncodingItem('Min °C'),
                y2: makeEncodingItem('Max °C'),
            },
        });
    }

    // 2. ADVANCED — two cities' monthly temperature range, overlapping bands by color.
    {
        const cities: Array<{ name: string; base: number; amp: number; spread: number }> = [
            { name: 'Seattle', base: 12, amp: 8, spread: 5 },
            { name: 'Phoenix', base: 24, amp: 11, spread: 7 },
        ];
        const data: any[] = [];
        for (const c of cities) {
            MONTHS.forEach((m, i) => {
                const mid = c.base + c.amp * Math.sin((i - 3) / 12 * 2 * Math.PI) + (rand() - 0.5) * 2;
                const spread = c.spread + rand() * 2;
                data.push({
                    Month: m,
                    City: c.name,
                    'Low °C': Math.round((mid - spread) * 10) / 10,
                    'High °C': Math.round((mid + spread) * 10) / 10,
                });
            });
        }
        tests.push({
            title: 'Two cities monthly temperature range + Color',
            description: 'Overlapping monthly low–high temperature bands for two cities, one band per color',
            tags: ['ordinal', 'quantitative', 'range', 'color', 'multi', 'gallery'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Month'), makeField('Low °C'), makeField('High °C'), makeField('City')],
            metadata: {
                Month: { type: Type.String, semanticType: 'Category', levels: MONTHS },
                'Low °C': { type: Type.Number, semanticType: 'Temperature', levels: [] },
                'High °C': { type: Type.Number, semanticType: 'Temperature', levels: [] },
                City: { type: Type.String, semanticType: 'City', levels: cities.map(c => c.name) },
            },
            encodingMap: {
                x: makeEncodingItem('Month'),
                y: makeEncodingItem('Low °C'),
                y2: makeEncodingItem('High °C'),
                color: makeEncodingItem('City'),
            },
        });
    }

    // 3. Numeric x — a regression / prediction confidence band over a numeric dose.
    {
        const doses = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180];
        const data = doses.map((dose) => {
            const yield_ = 30 + 0.45 * dose - 0.0011 * dose * dose;
            const ci = 4 + dose * 0.03; // widening uncertainty
            return {
                'Fertilizer (kg/ha)': dose,
                'Yield Low': Math.round((yield_ - ci) * 10) / 10,
                'Yield High': Math.round((yield_ + ci) * 10) / 10,
            };
        });
        tests.push({
            title: 'Predicted yield confidence band (numeric x)',
            description: 'A confidence band around predicted crop yield over a numeric fertilizer dose',
            tags: ['quantitative', 'numeric-x', 'range', 'single', 'small'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Fertilizer (kg/ha)'), makeField('Yield Low'), makeField('Yield High')],
            metadata: {
                'Fertilizer (kg/ha)': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Yield Low': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Yield High': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Fertilizer (kg/ha)'),
                y: makeEncodingItem('Yield Low'),
                y2: makeEncodingItem('Yield High'),
            },
        });
    }

    // 4. Ordinal x, low cardinality — quarterly revenue low/high estimate, 4 quarters.
    {
        const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        const lows = [82, 95, 88, 110];
        const highs = [104, 121, 119, 145];
        const data = quarters.map((q, i) => ({
            Quarter: q,
            'Low Estimate': lows[i],
            'High Estimate': highs[i],
        }));
        tests.push({
            title: 'Quarterly revenue range (ordinal x, low cardinality)',
            description: 'Low vs high revenue estimate across four quarters — lowest-cardinality range area',
            tags: ['ordinal', 'quantitative', 'range', 'single', 'small'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Quarter'), makeField('Low Estimate'), makeField('High Estimate')],
            metadata: {
                Quarter: { type: Type.String, semanticType: 'Category', levels: quarters },
                'Low Estimate': { type: Type.Number, semanticType: 'Price', levels: [] },
                'High Estimate': { type: Type.Number, semanticType: 'Price', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Quarter'),
                y: makeEncodingItem('Low Estimate'),
                y2: makeEncodingItem('High Estimate'),
            },
        });
    }

    // 5. Zero-crossing — temperature-anomaly band that spans negatives, by year.
    {
        const years = genYears(12, 2012);
        const data = years.map((yr, i) => {
            const center = -0.6 + i * 0.12 + (rand() - 0.5) * 0.15;
            const spread = 0.5 + rand() * 0.3;
            return {
                Year: yr,
                'Anomaly Low': Math.round((center - spread) * 100) / 100,
                'Anomaly High': Math.round((center + spread) * 100) / 100,
            };
        });
        tests.push({
            title: 'Temperature anomaly band crossing zero (negatives)',
            description: 'A low–high anomaly band that starts below zero and rises through it — diverging values',
            tags: ['temporal', 'quantitative', 'range', 'negative', 'single', 'medium'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Year'), makeField('Anomaly Low'), makeField('Anomaly High')],
            metadata: {
                Year: { type: Type.Number, semanticType: 'Year', levels: years },
                'Anomaly Low': { type: Type.Number, semanticType: 'Temperature', levels: [] },
                'Anomaly High': { type: Type.Number, semanticType: 'Temperature', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Year'),
                y: makeEncodingItem('Anomaly Low'),
                y2: makeEncodingItem('Anomaly High'),
            },
        });
    }

    // 6. Narrowing-then-widening — a forecast cone over a numeric horizon.
    {
        const steps = Array.from({ length: 13 }, (_, i) => i); // 0..12 weeks ahead
        const data = steps.map((s) => {
            const center = 100 + s * 2.4;
            // Band is tight in the near term, narrows around the calibration
            // point, then fans out — narrow → narrower → wide.
            const width = Math.abs(s - 4) * 1.6 + 2;
            return {
                'Weeks Ahead': s,
                'Forecast Low': Math.round((center - width) * 10) / 10,
                'Forecast High': Math.round((center + width) * 10) / 10,
            };
        });
        tests.push({
            title: 'Forecast cone: narrowing then widening band',
            description: 'A forecast band that narrows to a calibration point then fans out — varying band width',
            tags: ['quantitative', 'numeric-x', 'range', 'single', 'forecast', 'medium'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Weeks Ahead'), makeField('Forecast Low'), makeField('Forecast High')],
            metadata: {
                'Weeks Ahead': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Forecast Low': { type: Type.Number, semanticType: 'Quantity', levels: [] },
                'Forecast High': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Weeks Ahead'),
                y: makeEncodingItem('Forecast Low'),
                y2: makeEncodingItem('Forecast High'),
            },
        });
    }

    // 7. High cardinality temporal — a 40-day price trading range (52-week style).
    {
        const dates = dailyDates(40, 2023);
        let price = 180;
        const data = dates.map((d) => {
            price += (rand() - 0.48) * 6;
            const intraday = 3 + rand() * 6;
            return {
                Date: d,
                'Day Low': Math.round((price - intraday) * 100) / 100,
                'Day High': Math.round((price + intraday) * 100) / 100,
            };
        });
        tests.push({
            title: 'Daily trading range over 40 days (high cardinality)',
            description: 'A dense daily low–high price band over 40 trading days — high x cardinality',
            tags: ['temporal', 'quantitative', 'range', 'single', 'large', 'dense'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Date'), makeField('Day Low'), makeField('Day High')],
            metadata: {
                Date: { type: Type.Date, semanticType: 'Date', levels: [] },
                'Day Low': { type: Type.Number, semanticType: 'Price', levels: [] },
                'Day High': { type: Type.Number, semanticType: 'Price', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Date'),
                y: makeEncodingItem('Day Low'),
                y2: makeEncodingItem('Day High'),
            },
        });
    }

    // 8. Faceted — daily temperature range split into small multiples by city.
    {
        const cities = ['Oslo', 'Cairo', 'Tokyo'];
        const bases: Record<string, number> = { Oslo: 4, Cairo: 26, Tokyo: 16 };
        const dates = dailyDates(10, 2024);
        const data: any[] = [];
        for (const city of cities) {
            dates.forEach((d, i) => {
                const mid = bases[city] + 4 * Math.sin(i / 2) + (rand() - 0.5) * 2;
                const spread = 3 + rand() * 3;
                data.push({
                    Date: d,
                    City: city,
                    'Min °C': Math.round((mid - spread) * 10) / 10,
                    'Max °C': Math.round((mid + spread) * 10) / 10,
                });
            });
        }
        tests.push({
            title: 'Daily temperature range, faceted by city',
            description: 'Daily low–high temperature bands as small multiples, one panel per city (column facet)',
            tags: ['temporal', 'quantitative', 'range', 'facet', 'medium'],
            chartType: 'Range Area Chart',
            data,
            fields: [makeField('Date'), makeField('Min °C'), makeField('Max °C'), makeField('City')],
            metadata: {
                Date: { type: Type.Date, semanticType: 'Date', levels: [] },
                'Min °C': { type: Type.Number, semanticType: 'Temperature', levels: [] },
                'Max °C': { type: Type.Number, semanticType: 'Temperature', levels: [] },
                City: { type: Type.String, semanticType: 'City', levels: cities },
            },
            encodingMap: {
                x: makeEncodingItem('Date'),
                y: makeEncodingItem('Min °C'),
                y2: makeEncodingItem('Max °C'),
                column: makeEncodingItem('City'),
            },
        });
    }

    return [...tests, ...realRangeAreaCases()];
}

/**
 * ECharts wall variants — the cases that translate cleanly to the stacked
 * transparent-base + translucent-delta band on a category x-axis (basic single
 * band, two overlapping color bands, a zero-crossing band).
 */
export function genEChartsRangeAreaTests(): TestCase[] {
    const all = genRangeAreaTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('Daily temperature range over 14 days (basic)'),
        pick('Two cities monthly temperature range + Color'),
        pick('Temperature anomaly band crossing zero (negatives)'),
        pick('Quarterly revenue range (ordinal x, low cardinality)'),
    ];
}

/**
 * Chart.js wall variants — bands built from a lower + upper line dataset pair
 * (single band, two overlapping color bands, a numeric-x confidence band, an
 * ordinal-x quarterly band).
 */
export function genChartJsRangeAreaTests(): TestCase[] {
    const all = genRangeAreaTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('Daily temperature range over 14 days (basic)'),
        pick('Two cities monthly temperature range + Color'),
        pick('Predicted yield confidence band (numeric x)'),
        pick('Quarterly revenue range (ordinal x, low cardinality)'),
    ];
}
