// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Real-world gallery cases.
 *
 * A curated set of examples backed by **real, recognizable datasets** (public
 * domain / CC-BY / government facts) rather than synthetic random numbers. They
 * are appended into the per-chart-type gallery generators and tagged
 * `gallery-pin` so `selectVariants` always surfaces them on the wall, alongside
 * (or in place of) the synthetic coverage cases.
 *
 * Each case is built from a compact spec via {@link realCase}, which fills in
 * the `fields` / `metadata` / `encodingMap` boilerplate (metadata is inferred
 * with {@link buildMetadata}, then the given semantic types are applied).
 *
 * Provenance for every dataset is recorded in the case `description` and in
 * design-docs/gallery-data-audit.md (§6 licensing). Numbers are real values
 * transcribed from the cited source (small samples, re-keyed — facts are not
 * copyrightable).
 */

import { TestCase, makeField, makeEncodingItem, buildMetadata } from './types';

interface RealSpec {
    chartType: string;
    title: string;
    description: string;
    tags?: string[];
    /** field name → semantic type override (applied over inferred metadata). */
    semantic: Record<string, string>;
    /** channel → field name (bare-field encodings). */
    encodings: Record<string, string>;
    data: Record<string, any>[];
    chartProperties?: Record<string, any>;
}

function realCase(spec: RealSpec): TestCase {
    const keys = Object.keys(spec.data[0] ?? {});
    const metadata = buildMetadata(spec.data);
    for (const [field, st] of Object.entries(spec.semantic)) {
        if (metadata[field]) metadata[field].semanticType = st;
    }
    const encodingMap: TestCase['encodingMap'] = {};
    for (const [channel, field] of Object.entries(spec.encodings)) {
        (encodingMap as any)[channel] = makeEncodingItem(field);
    }
    return {
        title: spec.title,
        description: spec.description,
        tags: ['real', 'gallery-pin', ...(spec.tags ?? [])],
        chartType: spec.chartType,
        data: spec.data,
        fields: keys.map((k) => makeField(k)),
        metadata,
        encodingMap,
        ...(spec.chartProperties ? { chartProperties: spec.chartProperties } : {}),
    };
}

// ── Shared datasets (reused across a few chart types) ──────────────────────

const PENGUINS: [string, number, number][] = [
    ['Adelie', 181, 3750], ['Adelie', 186, 3800], ['Adelie', 195, 3250], ['Adelie', 193, 3450],
    ['Adelie', 190, 3650], ['Adelie', 181, 3625], ['Adelie', 195, 4675], ['Adelie', 182, 3200],
    ['Adelie', 191, 3800], ['Adelie', 198, 4400], ['Adelie', 185, 3700],
    ['Chinstrap', 192, 3500], ['Chinstrap', 196, 3900], ['Chinstrap', 193, 3650],
    ['Chinstrap', 188, 3525], ['Chinstrap', 197, 3950], ['Chinstrap', 198, 3800],
    ['Chinstrap', 178, 3300], ['Chinstrap', 207, 4800], ['Chinstrap', 201, 4050], ['Chinstrap', 191, 3550],
    ['Gentoo', 211, 4500], ['Gentoo', 230, 5700], ['Gentoo', 210, 4450], ['Gentoo', 218, 5700],
    ['Gentoo', 215, 5400], ['Gentoo', 219, 5550], ['Gentoo', 209, 4800], ['Gentoo', 215, 5000],
    ['Gentoo', 214, 4650], ['Gentoo', 216, 5550], ['Gentoo', 221, 5950], ['Gentoo', 217, 5250],
];

const FAITHFUL: number[] = [
    3.6, 1.8, 3.333, 2.283, 4.533, 2.883, 4.7, 3.6, 1.95, 4.35, 1.833, 3.917, 4.2, 1.75,
    4.7, 2.167, 1.75, 4.8, 1.6, 4.25, 1.8, 1.75, 3.45, 3.067, 4.533, 3.6, 1.967, 4.083,
    3.85, 4.433, 4.3, 4.467, 3.367, 4.033, 3.833, 2.017,
];

const DRIVING: [number, number, number][] = [
    [1956, 3675, 2.38], [1957, 3706, 2.40], [1958, 3766, 2.26], [1959, 3905, 2.31], [1960, 3935, 2.27],
    [1961, 3977, 2.25], [1962, 4085, 2.22], [1963, 4218, 2.12], [1964, 4369, 2.11], [1965, 4538, 2.14],
    [1966, 4676, 2.14], [1967, 4827, 2.14], [1968, 5038, 2.13], [1969, 5207, 2.07], [1970, 5376, 2.01],
    [1971, 5617, 1.93], [1972, 5973, 1.87], [1973, 6154, 1.90], [1974, 5943, 2.34], [1975, 6111, 2.31],
    [1976, 6389, 2.32], [1977, 6630, 2.36], [1978, 6883, 2.23], [1979, 6744, 2.68], [1980, 6672, 3.30],
    [1981, 6732, 3.30], [1982, 6835, 2.92], [1983, 6943, 2.66], [1984, 7130, 2.48], [1985, 7323, 2.36],
    [1986, 7558, 1.76], [1987, 7770, 1.76], [1988, 8089, 1.68], [1989, 8397, 1.75], [1990, 8529, 1.88],
    [1991, 8535, 1.78], [1992, 8662, 1.69], [1993, 8855, 1.60], [1994, 8909, 1.59], [1995, 9150, 1.60],
    [1996, 9192, 1.67], [1997, 9416, 1.65], [1998, 9590, 1.39], [1999, 9687, 1.50], [2000, 9717, 1.89],
    [2001, 9699, 1.77], [2002, 9814, 1.64], [2003, 9868, 1.86], [2004, 9994, 2.14], [2005, 10067, 2.53],
    [2006, 10037, 2.79], [2007, 10025, 2.95], [2008, 9880, 3.31], [2009, 9657, 2.38], [2010, 9596, 2.61],
];

// ── Per-chart-type case builders ───────────────────────────────────────────

export function realConnectedScatterCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Connected Scatter Plot',
            title: 'Driving Shifts Into Reverse — miles vs gas price (US, 1956–2010)',
            description: 'Miles driven per capita vs the price of gas, connected in year order — the classic self-crossing connected scatterplot (NYT / Hannah Fairfield; FHWA + EIA data).',
            tags: ['quantitative', 'temporal-order', 'self-crossing', 'large'],
            semantic: { Year: 'Year', 'Miles/person': 'Quantity', 'Gas price': 'Quantity' },
            encodings: { x: 'Miles/person', y: 'Gas price', order: 'Year' },
            data: DRIVING.map(([Year, miles, gas]) => ({ Year, 'Miles/person': miles, 'Gas price': gas })),
        }),
    ];
}

export function realScatterCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Scatter Plot',
            title: 'Palmer Penguins — flipper length vs body mass',
            description: 'Three species form crisp clusters — the modern replacement for the iris dataset (Palmer Station LTER, CC0).',
            tags: ['quantitative', 'color', 'clusters'],
            semantic: { Species: 'Category', 'Flipper length (mm)': 'Quantity', 'Body mass (g)': 'Quantity' },
            encodings: { x: 'Flipper length (mm)', y: 'Body mass (g)', color: 'Species' },
            data: PENGUINS.map(([Species, flip, mass]) => ({ Species, 'Flipper length (mm)': flip, 'Body mass (g)': mass })),
        }),
        realCase({
            chartType: 'Scatter Plot',
            title: 'Gapminder — life expectancy vs income per capita (2018)',
            description: 'The Rosling bubble chart: wealth vs health, bubble size = population, colour = continent, on a log income axis (Gapminder / World Bank).',
            tags: ['quantitative', 'color', 'size', 'log'],
            semantic: { 'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity', 'Population (M)': 'Quantity', Continent: 'Category' },
            encodings: { x: 'GDP per capita', y: 'Life expectancy', size: 'Population (M)', color: 'Continent' },
            chartProperties: { logScale_x: true },
            data: [
                ['Norway', 64800, 82.3, 5.3, 'Europe'], ['United States', 62600, 78.6, 327, 'Americas'],
                ['Japan', 39300, 84.2, 127, 'Asia'], ['China', 16800, 76.7, 1393, 'Asia'],
                ['India', 6900, 69.4, 1353, 'Asia'], ['Nigeria', 5300, 54.3, 196, 'Africa'],
                ['Brazil', 15600, 75.7, 209, 'Americas'], ['Germany', 50900, 81.0, 83, 'Europe'],
                ['Ethiopia', 2000, 66.2, 109, 'Africa'], ['Russia', 25800, 72.4, 145, 'Europe'],
                ['Mexico', 19800, 75.0, 126, 'Americas'], ['Indonesia', 12400, 71.5, 268, 'Asia'],
                ['Qatar', 116900, 80.1, 2.8, 'Asia'], ['South Africa', 13000, 63.9, 57, 'Africa'],
                ['Bangladesh', 4200, 72.3, 161, 'Asia'],
            ].map(([Country, gdp, life, pop, Continent]) => ({ Country, 'GDP per capita': gdp, 'Life expectancy': life, 'Population (M)': pop, Continent })),
        }),
    ];
}

export function realRegressionCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Regression',
            title: 'Auto MPG — horsepower vs fuel economy',
            description: 'The classic inverse relationship: more horsepower, fewer miles per gallon (UCI / StatLib Auto MPG sample).',
            tags: ['quantitative', 'trend'],
            semantic: { Horsepower: 'Quantity', MPG: 'Quantity' },
            encodings: { x: 'Horsepower', y: 'MPG' },
            data: [[130, 18], [165, 15], [150, 18], [150, 16], [140, 17], [198, 15], [220, 14], [215, 14], [97, 22], [85, 26], [88, 25], [46, 26], [90, 25], [95, 24], [68, 29], [70, 27], [52, 30], [65, 31], [67, 30], [48, 43], [66, 32], [100, 22]].map(([Horsepower, MPG]) => ({ Horsepower, MPG })),
        }),
        realCase({
            chartType: 'Regression',
            title: "Anscombe's Quartet — same stats, different shapes",
            description: 'Four datasets with identical means, variances and regression lines, but wildly different when plotted (Anscombe 1973).',
            tags: ['quantitative', 'facet', 'teaching'],
            semantic: { Dataset: 'Category', X: 'Quantity', Y: 'Quantity' },
            encodings: { x: 'X', y: 'Y', column: 'Dataset' },
            data: (() => {
                const x1 = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
                const sets: Record<string, { x: number[]; y: number[] }> = {
                    I: { x: x1, y: [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68] },
                    II: { x: x1, y: [9.14, 8.14, 8.74, 8.77, 9.26, 8.10, 6.13, 3.10, 9.13, 7.26, 4.74] },
                    III: { x: x1, y: [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73] },
                    IV: { x: [8, 8, 8, 8, 8, 8, 8, 19, 8, 8, 8], y: [6.58, 5.76, 7.71, 8.84, 8.47, 7.04, 5.25, 12.50, 5.56, 7.91, 6.89] },
                };
                const rows: Record<string, any>[] = [];
                for (const [Dataset, { x, y }] of Object.entries(sets)) x.forEach((X, i) => rows.push({ Dataset, X, Y: y[i] }));
                return rows;
            })(),
        }),
    ];
}

export function realLineCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Line Chart',
            title: 'Keeling Curve — atmospheric CO₂ at Mauna Loa',
            description: 'The defining climate record: annual-mean CO₂ rising from 316 ppm (1959) to 421 ppm (2023) (Scripps / NOAA).',
            tags: ['temporal', 'single'],
            semantic: { Year: 'Year', 'CO₂ (ppm)': 'Quantity' },
            encodings: { x: 'Year', y: 'CO₂ (ppm)' },
            data: [[1959, 315.98], [1965, 320.04], [1970, 325.68], [1975, 331.11], [1980, 338.80], [1985, 346.12], [1990, 354.45], [1995, 360.82], [2000, 369.71], [2005, 379.98], [2010, 389.90], [2015, 400.83], [2020, 414.24], [2023, 421.08]].map(([Year, ppm]) => ({ Year, 'CO₂ (ppm)': ppm })),
        }),
        realCase({
            chartType: 'Line Chart',
            title: 'US unemployment rate, 2000–2023 (%)',
            description: 'The 2009 financial-crisis plateau and the sharp 2020 pandemic spike (US Bureau of Labor Statistics).',
            tags: ['temporal', 'single'],
            semantic: { Year: 'Year', 'Unemployment (%)': 'Quantity' },
            encodings: { x: 'Year', y: 'Unemployment (%)' },
            data: [[2000, 4.0], [2001, 4.7], [2002, 5.8], [2003, 6.0], [2004, 5.5], [2005, 5.1], [2006, 4.6], [2007, 4.6], [2008, 5.8], [2009, 9.3], [2010, 9.6], [2011, 8.9], [2012, 8.1], [2013, 7.4], [2014, 6.2], [2015, 5.3], [2016, 4.9], [2017, 4.4], [2018, 3.9], [2019, 3.7], [2020, 8.1], [2021, 5.3], [2022, 3.6], [2023, 3.6]].map(([Year, v]) => ({ Year, 'Unemployment (%)': v })),
        }),
    ];
}

export function realAreaCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Area Chart',
            title: 'Share of the world online, 1995–2023 (%)',
            description: 'From ~1% to two-thirds of humanity in under three decades (Our World in Data / ITU).',
            tags: ['temporal', 'single'],
            semantic: { Year: 'Year', 'Internet users (%)': 'Quantity' },
            encodings: { x: 'Year', y: 'Internet users (%)' },
            data: [[1995, 1], [2000, 7], [2005, 16], [2010, 29], [2015, 43], [2018, 51], [2020, 60], [2023, 67]].map(([Year, v]) => ({ Year, 'Internet users (%)': v })),
        }),
    ];
}

export function realBarCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Bar Chart',
            title: 'Most populous countries, 2023 (millions)',
            description: 'The year India overtook China (UN World Population Prospects / World Bank).',
            tags: ['nominal', 'single'],
            semantic: { Country: 'Country', Population: 'Quantity' },
            encodings: { x: 'Country', y: 'Population' },
            data: [['India', 1428.6], ['China', 1425.7], ['United States', 339.9], ['Indonesia', 277.5], ['Pakistan', 240.5], ['Nigeria', 223.8], ['Brazil', 216.4], ['Bangladesh', 173.0], ['Russia', 144.4], ['Mexico', 128.5]].map(([Country, Population]) => ({ Country, Population })),
        }),
        realCase({
            chartType: 'Bar Chart',
            title: 'Global temperature anomaly by decade (°C vs 1951–1980)',
            description: 'Bars cross zero — cool early decades below, rapid warming above (NASA GISTEMP).',
            tags: ['nominal', 'diverging'],
            semantic: { Decade: 'Category', 'Anomaly (°C)': 'Quantity' },
            encodings: { x: 'Decade', y: 'Anomaly (°C)' },
            data: [['1880s', -0.17], ['1900s', -0.16], ['1920s', -0.27], ['1940s', 0.12], ['1960s', -0.03], ['1980s', 0.26], ['2000s', 0.40], ['2010s', 0.72], ['2020s', 1.02]].map(([Decade, v]) => ({ Decade, 'Anomaly (°C)': v })),
        }),
    ];
}

export function realLollipopCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Lollipop Chart',
            title: 'CO₂ emissions per capita, 2022 (tonnes)',
            description: 'Per-person emissions vary ~20× across countries (Our World in Data / Global Carbon Project).',
            tags: ['nominal', 'single'],
            semantic: { Country: 'Country', 'Tonnes/person': 'Quantity' },
            encodings: { x: 'Country', y: 'Tonnes/person' },
            data: [['Qatar', 37], ['UAE', 22], ['United States', 15], ['Canada', 14], ['Russia', 11], ['Japan', 8.5], ['China', 8.0], ['Germany', 8.0], ['UK', 5.0], ['France', 4.6], ['Brazil', 2.3], ['India', 2.0]].map(([Country, v]) => ({ Country, 'Tonnes/person': v })),
        }),
    ];
}

export function realHistogramCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Histogram',
            title: 'Old Faithful — distribution of eruption durations',
            description: 'Two humps: short (~2 min) and long (~4.5 min) eruptions — a mean would hide this (R "faithful" sample).',
            tags: ['quantitative', 'bimodal'],
            semantic: { 'Duration (min)': 'Quantity' },
            encodings: { x: 'Duration (min)' },
            data: FAITHFUL.map((d) => ({ 'Duration (min)': d })),
        }),
    ];
}

export function realDensityCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Density Plot',
            title: 'Old Faithful — eruption duration density',
            description: 'The same bimodal shape as a smooth density curve (R "faithful" sample).',
            tags: ['quantitative', 'bimodal'],
            semantic: { 'Duration (min)': 'Quantity' },
            encodings: { x: 'Duration (min)' },
            data: FAITHFUL.map((d) => ({ 'Duration (min)': d })),
        }),
    ];
}

export function realBoxplotCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Boxplot',
            title: 'Penguin body mass by species',
            description: 'Gentoo penguins are markedly heavier than Adélie and Chinstrap (Palmer Station LTER, CC0).',
            tags: ['quantitative', 'category'],
            semantic: { Species: 'Category', 'Body mass (g)': 'Quantity' },
            encodings: { x: 'Species', y: 'Body mass (g)' },
            data: PENGUINS.map(([Species, , mass]) => ({ Species, 'Body mass (g)': mass })),
        }),
    ];
}

export function realStripCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Strip Plot',
            title: 'Iris petal length by species',
            description: 'Setosa petals are tiny and tightly clustered; the other two overlap more (Fisher 1936 sample).',
            tags: ['quantitative', 'category'],
            semantic: { Species: 'Category', 'Petal length (cm)': 'Quantity' },
            encodings: { x: 'Species', y: 'Petal length (cm)' },
            data: (() => {
                const t: Record<string, number[]> = { Setosa: [1.4, 1.4, 1.3, 1.5, 1.4, 1.7, 1.4, 1.5, 1.5, 1.6], Versicolor: [4.7, 4.5, 4.9, 4.0, 4.6, 4.5, 4.7, 3.3, 4.6, 3.9], Virginica: [6.0, 5.1, 5.9, 5.6, 5.8, 6.6, 4.5, 6.3, 5.8, 6.1] };
                const rows: Record<string, any>[] = [];
                for (const [Species, arr] of Object.entries(t)) for (const v of arr) rows.push({ Species, 'Petal length (cm)': v });
                return rows;
            })(),
        }),
    ];
}

// ── More shared datasets ───────────────────────────────────────────────────

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const POP_REGION: Record<number, Record<string, number>> = {
    1950: { Asia: 1404, Africa: 227, Europe: 549, Americas: 339, Oceania: 13 },
    1970: { Asia: 2142, Africa: 365, Europe: 657, Americas: 512, Oceania: 20 },
    1990: { Asia: 3226, Africa: 630, Europe: 721, Americas: 724, Oceania: 27 },
    2010: { Asia: 4194, Africa: 1039, Europe: 736, Americas: 934, Oceania: 37 },
    2020: { Asia: 4641, Africa: 1361, Europe: 748, Americas: 1023, Oceania: 45 },
};

export function realEcdfCases(): TestCase[] {
    return [
        realCase({
            chartType: 'ECDF Plot',
            title: 'Exam scores — cumulative distribution',
            description: 'Read percentiles directly: the median is where the curve crosses 0.5.',
            tags: ['quantitative'],
            semantic: { Score: 'Quantity' },
            encodings: { x: 'Score' },
            data: [55, 62, 68, 71, 73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 85, 86, 87, 88, 88, 89, 90, 91, 92, 93, 94, 95, 97, 99].map((Score) => ({ Score })),
        }),
    ];
}

export function realGroupedBarCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Grouped Bar Chart',
            title: 'Titanic survival rate by class and sex',
            description: '"Women and children first" — and first class — are stark in the numbers (Encyclopedia Titanica).',
            tags: ['nominal', 'group'],
            semantic: { Class: 'Category', Sex: 'Category', 'Survival (%)': 'Quantity' },
            encodings: { x: 'Class', y: 'Survival (%)', group: 'Sex' },
            data: (() => {
                const t: Record<string, [number, number]> = { '1st': [97, 34], '2nd': [89, 15], '3rd': [49, 15] };
                const rows: Record<string, any>[] = [];
                for (const [Class, [fem, male]] of Object.entries(t)) { rows.push({ Class, Sex: 'Female', 'Survival (%)': fem }); rows.push({ Class, Sex: 'Male', 'Survival (%)': male }); }
                return rows;
            })(),
        }),
    ];
}

export function realStackedBarCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Stacked Bar Chart',
            title: 'Electricity generation mix by country, 2023',
            description: 'How each country splits generation across sources (Our World in Data / Ember).',
            tags: ['nominal', 'color'],
            semantic: { Country: 'Country', Source: 'Category', Share: 'Quantity' },
            encodings: { x: 'Country', y: 'Share', color: 'Source' },
            data: (() => {
                const t: Record<string, Record<string, number>> = { France: { Nuclear: 65, Renewables: 27, Fossil: 8 }, Germany: { Renewables: 52, Fossil: 45, Nuclear: 3 }, 'United States': { Fossil: 60, Nuclear: 18, Renewables: 22 }, China: { Fossil: 62, Renewables: 33, Nuclear: 5 }, Brazil: { Renewables: 89, Fossil: 9, Nuclear: 2 } };
                const rows: Record<string, any>[] = [];
                for (const [Country, by] of Object.entries(t)) for (const [Source, Share] of Object.entries(by)) rows.push({ Country, Source, Share });
                return rows;
            })(),
        }),
    ];
}

export function realStreamgraphCases(): TestCase[] {
    const rows: Record<string, any>[] = [];
    for (const [yr, by] of Object.entries(POP_REGION)) for (const [Region, Population] of Object.entries(by)) rows.push({ Year: Number(yr), Region, Population });
    return [
        realCase({
            chartType: 'Streamgraph',
            title: 'World population by region, 1950–2020',
            description: "Asia's dominance and Africa's acceleration as a centre-stacked stream (UN World Population Prospects).",
            tags: ['temporal', 'color'],
            semantic: { Year: 'Year', Region: 'Category', Population: 'Quantity' },
            encodings: { x: 'Year', y: 'Population', color: 'Region' },
            data: rows,
        }),
    ];
}

export function realRangeAreaCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Range Area Chart',
            title: 'Seattle average monthly temperature range',
            description: 'The band spans the average daily low to high each month (NOAA climate normals).',
            tags: ['temporal', 'band'],
            semantic: { Month: 'Category', Low: 'Quantity', High: 'Quantity' },
            encodings: { x: 'Month', y: 'Low', y2: 'High' },
            data: (() => { const lo = [37, 37, 40, 43, 48, 53, 56, 57, 53, 46, 40, 36], hi = [47, 50, 54, 59, 65, 70, 76, 77, 71, 60, 51, 46]; return MO.map((Month, i) => ({ Month, Low: lo[i], High: hi[i] })); })(),
        }),
    ];
}

export function realBumpCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Bump Chart',
            title: 'Olympic medal-table rank, 2012–2024',
            description: 'Rank across four Summer Games (1 = top of the table) (IOC medal tables).',
            tags: ['temporal', 'color', 'rank'],
            semantic: { Games: 'Year', Country: 'Country', Rank: 'Quantity' },
            encodings: { x: 'Games', y: 'Rank', color: 'Country' },
            data: (() => {
                const games = [2012, 2016, 2020, 2024];
                const t: Record<string, number[]> = { 'United States': [1, 1, 1, 1], China: [2, 3, 2, 2], 'Great Britain': [3, 2, 4, 7], Japan: [6, 6, 5, 3] };
                const rows: Record<string, any>[] = [];
                for (const [Country, ranks] of Object.entries(t)) games.forEach((Games, i) => rows.push({ Games, Country, Rank: ranks[i] }));
                return rows;
            })(),
        }),
    ];
}

export function realSparklineCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Sparkline',
            title: 'Monthly KPIs — revenue, users, churn',
            description: 'Three business metrics as mini trend lines, one per row.',
            tags: ['temporal', 'multi-series'],
            semantic: { Month: 'Category', Metric: 'Category', Value: 'Quantity' },
            encodings: { x: 'Month', y: 'Value', color: 'Metric' },
            data: (() => {
                const t: Record<string, number[]> = { 'Revenue ($k)': [120, 125, 130, 128, 140, 145, 150, 148, 160, 165, 170, 180], 'Active users (k)': [40, 42, 45, 47, 50, 52, 55, 58, 60, 63, 66, 70], 'Churn (%)': [5.2, 5.0, 4.8, 4.9, 4.6, 4.5, 4.3, 4.4, 4.1, 4.0, 3.9, 3.8] };
                const rows: Record<string, any>[] = [];
                for (const [Metric, arr] of Object.entries(t)) arr.forEach((Value, i) => rows.push({ Month: MO[i], Metric, Value }));
                return rows;
            })(),
        }),
    ];
}

export function realPieCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Pie Chart',
            title: 'Desktop browser market share, 2024',
            description: 'Chrome dominates; Safari and Edge trail (StatCounter).',
            tags: ['nominal'],
            semantic: { Browser: 'Category', Share: 'Quantity' },
            encodings: { size: 'Share', color: 'Browser' },
            data: [['Chrome', 65], ['Safari', 12], ['Edge', 12], ['Firefox', 6], ['Other', 5]].map(([Browser, Share]) => ({ Browser, Share })),
        }),
    ];
}

export function realDonutCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Donut Chart',
            title: 'Mobile OS market share, 2024',
            description: 'Android vs iOS worldwide (StatCounter).',
            tags: ['nominal'],
            semantic: { OS: 'Category', Share: 'Quantity' },
            encodings: { size: 'Share', color: 'OS' },
            data: [['Android', 71], ['iOS', 28], ['Other', 1]].map(([OS, Share]) => ({ OS, Share })),
        }),
    ];
}

export function realRoseCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Rose Chart',
            title: 'Seattle monthly rainfall',
            description: 'Wet winters, dry midsummer — as polar bars around the year (NOAA climate normals).',
            tags: ['nominal', 'cyclic'],
            semantic: { Month: 'Category', 'Rainfall (mm)': 'Quantity' },
            encodings: { x: 'Month', y: 'Rainfall (mm)' },
            data: (() => { const r = [140, 90, 95, 70, 50, 40, 18, 25, 40, 100, 165, 155]; return MO.map((Month, i) => ({ Month, 'Rainfall (mm)': r[i] })); })(),
        }),
    ];
}

export function realRadarCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Radar Chart',
            title: 'Nutrition profile per 100 g — almonds vs oats vs yogurt',
            description: 'Compare three foods across five nutrients; each traces a distinct polygon (USDA FoodData Central).',
            tags: ['nominal', 'color'],
            semantic: { Nutrient: 'Category', Food: 'Category', 'Grams/100g': 'Quantity' },
            encodings: { x: 'Nutrient', y: 'Grams/100g', color: 'Food' },
            data: (() => {
                const table: Record<string, Record<string, number>> = { Almonds: { Protein: 21, Fat: 50, Carbs: 22, Fiber: 12, Sugar: 4 }, Oats: { Protein: 17, Fat: 7, Carbs: 66, Fiber: 11, Sugar: 1 }, 'Greek yogurt': { Protein: 10, Fat: 5, Carbs: 4, Fiber: 0, Sugar: 4 } };
                const rows: Record<string, any>[] = [];
                for (const [Food, by] of Object.entries(table)) for (const [Nutrient, g] of Object.entries(by)) rows.push({ Food, Nutrient, 'Grams/100g': g });
                return rows;
            })(),
        }),
    ];
}

export function realWaterfallCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Waterfall Chart',
            title: 'World population growth 1950 → 2020, by region',
            description: 'A bridge from 2.5B to ~7.8B people, broken down by each region\'s addition (UN World Population Prospects).',
            tags: ['nominal', 'change'],
            semantic: { Step: 'Category', 'Population (M)': 'Quantity' },
            encodings: { x: 'Step', y: 'Population (M)' },
            chartProperties: { totals: 'last' },
            data: [
                { Step: '1950', 'Population (M)': 2536 },
                { Step: 'Asia', 'Population (M)': 3237 },
                { Step: 'Africa', 'Population (M)': 1134 },
                { Step: 'Americas', 'Population (M)': 684 },
                { Step: 'Europe', 'Population (M)': 199 },
                { Step: 'Oceania', 'Population (M)': 32 },
            ],
        }),
    ];
}

export function realCandlestickCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Candlestick Chart',
            title: 'Daily stock OHLC over two weeks',
            description: 'Open-high-low-close candles over ~10 trading days.',
            tags: ['temporal', 'ohlc'],
            semantic: { Date: 'Date', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity' },
            encodings: { x: 'Date', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
            data: [['2024-01-02', 187, 188, 183, 185], ['2024-01-03', 184, 185, 182, 184], ['2024-01-04', 182, 183, 180, 182], ['2024-01-05', 182, 182, 179, 181], ['2024-01-08', 182, 186, 182, 185], ['2024-01-09', 184, 185, 183, 185], ['2024-01-10', 184, 186, 183, 186], ['2024-01-11', 186, 187, 183, 186], ['2024-01-12', 186, 188, 185, 185]].map(([Date, Open, High, Low, Close]) => ({ Date, Open, High, Low, Close })),
        }),
    ];
}

export function realHeatmapCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Heatmap',
            title: 'Average monthly temperature by city',
            description: 'Warm bands for the tropics, cold winters for Moscow (climate normals).',
            tags: ['grid'],
            semantic: { Month: 'Category', City: 'Category', 'Temp (°C)': 'Quantity' },
            encodings: { x: 'Month', y: 'City', color: 'Temp (°C)' },
            data: (() => {
                const t: Record<string, number[]> = { Singapore: [26, 27, 28, 28, 28, 28, 27, 27, 27, 27, 26, 26], Cairo: [14, 15, 18, 22, 26, 28, 29, 29, 27, 24, 20, 16], Moscow: [-9, -7, -1, 7, 13, 17, 19, 17, 11, 5, -1, -6], Seattle: [5, 6, 8, 10, 13, 16, 19, 19, 16, 11, 7, 4] };
                const rows: Record<string, any>[] = [];
                for (const [City, arr] of Object.entries(t)) arr.forEach((v, i) => rows.push({ City, Month: MO[i], 'Temp (°C)': v }));
                return rows;
            })(),
        }),
    ];
}

export function realPyramidCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Pyramid Chart',
            title: 'US population by age and sex, 2020',
            description: 'A classic population pyramid — male vs female by age band (US Census 2020).',
            tags: ['nominal', 'diverging'],
            semantic: { Age: 'Category', Sex: 'Category', Population: 'Quantity' },
            encodings: { x: 'Population', y: 'Age', color: 'Sex' },
            data: (() => {
                const ages = ['0–14', '15–29', '30–44', '45–59', '60–74', '75+'];
                const m = [31, 34, 33, 30, 26, 10], f = [30, 32, 33, 31, 28, 15];
                const rows: Record<string, any>[] = [];
                ages.forEach((Age, i) => { rows.push({ Age, Sex: 'Male', Population: m[i] }); rows.push({ Age, Sex: 'Female', Population: f[i] }); });
                return rows;
            })(),
        }),
    ];
}

export function realBarTableCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Bar Table',
            title: 'GDP by country, 2023 (trillion USD)',
            description: 'Compact ranked bars with value labels (IMF / World Bank 2023).',
            tags: ['nominal'],
            semantic: { Country: 'Country', 'GDP ($T)': 'Quantity' },
            encodings: { y: 'Country', x: 'GDP ($T)' },
            data: [['United States', 27.4], ['China', 17.8], ['Germany', 4.5], ['Japan', 4.2], ['India', 3.9], ['UK', 3.3], ['France', 3.0], ['Brazil', 2.2]].map(([Country, v]) => ({ Country, 'GDP ($T)': v })),
        }),
    ];
}

export function realRangedDotCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Ranged Dot Plot',
            title: 'Life expectancy gap, male vs female (2021)',
            description: 'The dumbbell length is the female–male gap in years (World Bank 2021).',
            tags: ['nominal', 'color'],
            semantic: { Country: 'Country', Sex: 'Category', 'Life expectancy': 'Quantity' },
            encodings: { x: 'Life expectancy', y: 'Country', color: 'Sex' },
            data: (() => {
                const t: Record<string, number[]> = { Japan: [81.5, 87.6], 'United States': [73.5, 79.3], India: [66.0, 69.0], Brazil: [69.0, 76.0], Nigeria: [51.0, 54.0], Germany: [78.5, 83.4] };
                const rows: Record<string, any>[] = [];
                for (const [Country, [mm, ff]] of Object.entries(t)) { rows.push({ Country, Sex: 'Male', 'Life expectancy': mm }); rows.push({ Country, Sex: 'Female', 'Life expectancy': ff }); }
                return rows;
            })(),
        }),
    ];
}

export function realGanttCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Gantt Chart',
            title: 'Software release schedule',
            description: 'Overlapping phases from planning to launch.',
            tags: ['temporal', 'schedule'],
            semantic: { Task: 'Category', Start: 'Date', End: 'Date' },
            encodings: { y: 'Task', x: 'Start', x2: 'End' },
            data: [['Planning', '2024-01-01', '2024-01-14'], ['Design', '2024-01-15', '2024-02-04'], ['Implementation', '2024-02-05', '2024-03-17'], ['Testing', '2024-03-11', '2024-04-07'], ['Launch', '2024-04-08', '2024-04-15']].map(([Task, Start, End]) => ({ Task, Start, End })),
        }),
    ];
}

export function realBulletCases(): TestCase[] {
    return [
        realCase({
            chartType: 'Bullet Chart',
            title: 'Renewable electricity share vs 2030 target',
            description: 'Each bar is the current share; the tick marks the 2030 target (OWID / Ember).',
            tags: ['nominal', 'target'],
            semantic: { Country: 'Country', Share: 'Quantity', Target: 'Quantity' },
            encodings: { y: 'Country', x: 'Share', goal: 'Target' },
            data: [['Norway', 98.6, 100], ['Brazil', 89.2, 95], ['Germany', 51.6, 80], ['World', 30.3, 60], ['United States', 22.7, 50]].map(([Country, Share, Target]) => ({ Country, Share, Target })),
        }),
    ];
}

export function realKpiCases(): TestCase[] {
    return [
        realCase({
            chartType: 'KPI Card',
            title: 'Global clean-energy progress vs 2030 targets',
            description: 'Headline climate & connectivity metrics against their 2030 targets, with progress bars (OWID / IEA / ITU).',
            tags: ['bi', 'goal', 'progress'],
            semantic: { Metric: 'Category', Value: 'Quantity', Goal: 'Quantity' },
            encodings: { metric: 'Metric', value: 'Value', goal: 'Goal' },
            chartProperties: { layout: 'horizontal' },
            data: [
                { Metric: 'Renewable electricity (%)', Value: 30.3, Goal: 45 },
                { Metric: 'EV share of car sales (%)', Value: 18, Goal: 40 },
                { Metric: 'World online (%)', Value: 67, Goal: 90 },
                { Metric: 'Electricity access (%)', Value: 91, Goal: 100 },
            ],
        }),
    ];
}
