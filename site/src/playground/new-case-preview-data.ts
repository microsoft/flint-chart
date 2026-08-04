// New-case preview data — a staging set of REAL-WORLD datasets we're evaluating
// before swapping any into the gallery/test-data generators. Nothing here is
// wired into flint-js test-data yet; this file only feeds the
// /playground/new-case-preview page so we can read the candidates one by one.
//
// Each case carries its provenance (source + license) so the licensing review
// in design-docs/gallery-data-audit.md can be applied case by case. Numbers are
// real values transcribed from the cited source (facts are not copyrightable;
// small samples are re-keyed here — see the audit doc §6).

export interface PreviewCase {
    id: string;
    /** Flint chart type name (drives auto backend pick: VL if supported, else Plotly). */
    chartType: string;
    title: string;
    /** One-line "why this dataset is cool / what shape it shows". */
    blurb: string;
    /** Human-readable data source. */
    source: string;
    /** License basis for bundling into this MIT repo (see audit §6). */
    license: string;
    semantic_types: Record<string, string>;
    encodings: Record<string, unknown>;
    chartProperties?: Record<string, unknown>;
    data: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// 1. Connected Scatter — "Driving Shifts Into Reverse" (miles vs gas price)
// The most famous connected scatterplot: US miles driven per capita vs the
// (inflation-adjusted) price of gas, 1956–2010. The path self-crosses.
// ---------------------------------------------------------------------------
const DRIVING: [number, number, number][] = [
    [1956, 3675, 2.38], [1957, 3706, 2.40], [1958, 3766, 2.26], [1959, 3905, 2.31],
    [1960, 3935, 2.27], [1961, 3977, 2.25], [1962, 4085, 2.22], [1963, 4218, 2.12],
    [1964, 4369, 2.11], [1965, 4538, 2.14], [1966, 4676, 2.14], [1967, 4827, 2.14],
    [1968, 5038, 2.13], [1969, 5207, 2.07], [1970, 5376, 2.01], [1971, 5617, 1.93],
    [1972, 5973, 1.87], [1973, 6154, 1.90], [1974, 5943, 2.34], [1975, 6111, 2.31],
    [1976, 6389, 2.32], [1977, 6630, 2.36], [1978, 6883, 2.23], [1979, 6744, 2.68],
    [1980, 6672, 3.30], [1981, 6732, 3.30], [1982, 6835, 2.92], [1983, 6943, 2.66],
    [1984, 7130, 2.48], [1985, 7323, 2.36], [1986, 7558, 1.76], [1987, 7770, 1.76],
    [1988, 8089, 1.68], [1989, 8397, 1.75], [1990, 8529, 1.88], [1991, 8535, 1.78],
    [1992, 8662, 1.69], [1993, 8855, 1.60], [1994, 8909, 1.59], [1995, 9150, 1.60],
    [1996, 9192, 1.67], [1997, 9416, 1.65], [1998, 9590, 1.39], [1999, 9687, 1.50],
    [2000, 9717, 1.89], [2001, 9699, 1.77], [2002, 9814, 1.64], [2003, 9868, 1.86],
    [2004, 9994, 2.14], [2005, 10067, 2.53], [2006, 10037, 2.79], [2007, 10025, 2.95],
    [2008, 9880, 3.31], [2009, 9657, 2.38], [2010, 9596, 2.61],
];

// ---------------------------------------------------------------------------
// 2. Scatter — Palmer Penguins (flipper length vs body mass, by species)
// The modern "iris": three clean clusters. A re-keyed 33-row sample.
// ---------------------------------------------------------------------------
const PENGUINS: [string, number, number][] = [
    ['Adelie', 181, 3750], ['Adelie', 186, 3800], ['Adelie', 195, 3250], ['Adelie', 193, 3450],
    ['Adelie', 190, 3650], ['Adelie', 181, 3625], ['Adelie', 195, 4675], ['Adelie', 182, 3200],
    ['Adelie', 191, 3800], ['Adelie', 198, 4400], ['Adelie', 185, 3700],
    ['Chinstrap', 192, 3500], ['Chinstrap', 196, 3900], ['Chinstrap', 193, 3650],
    ['Chinstrap', 188, 3525], ['Chinstrap', 197, 3950], ['Chinstrap', 198, 3800],
    ['Chinstrap', 178, 3300], ['Chinstrap', 207, 4800], ['Chinstrap', 201, 4050],
    ['Chinstrap', 191, 3550],
    ['Gentoo', 211, 4500], ['Gentoo', 230, 5700], ['Gentoo', 210, 4450], ['Gentoo', 218, 5700],
    ['Gentoo', 215, 5400], ['Gentoo', 219, 5550], ['Gentoo', 209, 4800], ['Gentoo', 215, 5000],
    ['Gentoo', 214, 4650], ['Gentoo', 216, 5550], ['Gentoo', 221, 5950], ['Gentoo', 217, 5250],
];

// ---------------------------------------------------------------------------
// 3. Line — Keeling Curve (annual mean atmospheric CO₂, Mauna Loa)
// The iconic climate-record rise. Real annual means (ppm).
// ---------------------------------------------------------------------------
const CO2: [number, number][] = [
    [1959, 315.98], [1965, 320.04], [1970, 325.68], [1975, 331.11], [1980, 338.80],
    [1985, 346.12], [1990, 354.45], [1995, 360.82], [2000, 369.71], [2005, 379.98],
    [2010, 389.90], [2015, 400.83], [2020, 414.24], [2023, 421.08],
];

// ---------------------------------------------------------------------------
// 5. Stacked Area — World population by region, 1950–2020 (UN WPP), millions
// ---------------------------------------------------------------------------
const POP_REGION: Record<number, Record<string, number>> = {
    1950: { Asia: 1404, Africa: 227, Europe: 549, Americas: 339, Oceania: 13 },
    1970: { Asia: 2142, Africa: 365, Europe: 657, Americas: 512, Oceania: 20 },
    1990: { Asia: 3226, Africa: 630, Europe: 721, Americas: 724, Oceania: 27 },
    2010: { Asia: 4194, Africa: 1039, Europe: 736, Americas: 934, Oceania: 37 },
    2020: { Asia: 4641, Africa: 1361, Europe: 748, Americas: 1023, Oceania: 45 },
};

// ---------------------------------------------------------------------------
// 6. Scatter — Old Faithful eruptions (waiting vs duration): bimodal clusters
// Re-keyed 36-row sample of the classic geyser dataset.
// ---------------------------------------------------------------------------
const FAITHFUL: [number, number][] = [
    [3.6, 79], [1.8, 54], [3.333, 74], [2.283, 62], [4.533, 85], [2.883, 55], [4.7, 88],
    [3.6, 85], [1.95, 51], [4.35, 85], [1.833, 54], [3.917, 84], [4.2, 78], [1.75, 47],
    [4.7, 83], [2.167, 52], [1.75, 62], [4.8, 84], [1.6, 52], [4.25, 79], [1.8, 51],
    [1.75, 47], [3.45, 78], [3.067, 69], [4.533, 74], [3.6, 83], [1.967, 55], [4.083, 76],
    [3.85, 78], [4.433, 79], [4.3, 73], [4.467, 77], [3.367, 66], [4.033, 80], [3.833, 74],
    [2.017, 52],
];

// ---------------------------------------------------------------------------
// 7. Slope — Life expectancy 2000 → 2021 (World Bank / OWID), years
// ---------------------------------------------------------------------------
const LIFE_EXP: Record<string, [number, number]> = {
    China: [72.0, 78.2], India: [62.5, 67.2], 'United States': [76.6, 76.3],
    Nigeria: [46.6, 52.7], Japan: [81.1, 84.5], Russia: [65.5, 70.1], Brazil: [70.1, 72.8],
};

// ---------------------------------------------------------------------------
// 8. Fifty states, one rate — drives both the choropleth and the fifty-colour bar
// ---------------------------------------------------------------------------
const STATE_UNEMPLOYMENT: [string, number][] = [
    ['Alabama', 2.3], ['Alaska', 4.3], ['Arizona', 3.9], ['Arkansas', 3.3], ['California', 4.8],
    ['Colorado', 3.2], ['Connecticut', 3.9], ['Delaware', 4.2], ['Florida', 2.9], ['Georgia', 3.2],
    ['Hawaii', 3.0], ['Idaho', 3.2], ['Illinois', 4.5], ['Indiana', 3.3], ['Iowa', 2.9],
    ['Kansas', 2.8], ['Kentucky', 4.2], ['Louisiana', 3.5], ['Maine', 2.9], ['Maryland', 2.1],
    ['Massachusetts', 3.3], ['Michigan', 3.9], ['Minnesota', 2.8], ['Mississippi', 3.2], ['Missouri', 3.0],
    ['Montana', 2.9], ['Nebraska', 2.4], ['Nevada', 5.3], ['New Hampshire', 2.4], ['New Jersey', 4.1],
    ['New Mexico', 3.8], ['New York', 4.1], ['North Carolina', 3.4], ['North Dakota', 1.9], ['Ohio', 3.6],
    ['Oklahoma', 3.0], ['Oregon', 3.7], ['Pennsylvania', 3.4], ['Rhode Island', 2.9], ['South Carolina', 3.0],
    ['South Dakota', 1.9], ['Tennessee', 3.2], ['Texas', 4.0], ['Utah', 2.5], ['Vermont', 2.1],
    ['Virginia', 2.8], ['Washington', 4.1], ['West Virginia', 4.0], ['Wisconsin', 2.9], ['Wyoming', 3.1],
];

function buildCases(): PreviewCase[] {
    const cases: PreviewCase[] = [];

    cases.push({
        id: 'driving',
        chartType: 'Connected Scatter Plot',
        title: 'Driving Shifts Into Reverse — miles vs gas price (US, 1956–2010)',
        blurb: 'The most famous connected scatterplot: a self-crossing trajectory of miles driven per capita against the price of gas.',
        source: 'NYT / Hannah Fairfield (2010), from US FHWA vehicle-miles + EIA/BLS gas prices; via vega-datasets driving.json',
        license: 'US-gov facts (public domain) — courtesy citation',
        semantic_types: { Year: 'Year', 'Miles/person': 'Quantity', 'Gas price': 'Quantity' },
        encodings: { x: 'Miles/person', y: 'Gas price', order: 'Year' },
        // A trajectory, not a magnitude: the shape of the path is the message, so
        // both axes frame the data rather than reaching down to zero.
        chartProperties: { includeZero_x: false, includeZero_y: false },
        data: DRIVING.map(([Year, miles, gas]) => ({ Year, 'Miles/person': miles, 'Gas price': gas })),
    });

    cases.push({
        id: 'penguins',
        chartType: 'Scatter Plot',
        title: 'Palmer Penguins — flipper length vs body mass',
        blurb: 'Three crisp species clusters; the modern replacement for the iris dataset.',
        source: 'Horst, Hill & Gorman (2020), Palmer Station LTER — 33-row sample',
        license: 'CC0 (public domain)',
        semantic_types: { Species: 'Category', 'Flipper length (mm)': 'Quantity', 'Body mass (g)': 'Quantity' },
        encodings: { x: 'Flipper length (mm)', y: 'Body mass (g)', color: 'Species' },
        data: PENGUINS.map(([Species, flip, mass]) => ({ Species, 'Flipper length (mm)': flip, 'Body mass (g)': mass })),
    });

    cases.push({
        id: 'keeling',
        chartType: 'Line Chart',
        title: 'Keeling Curve — atmospheric CO₂ at Mauna Loa (annual mean)',
        blurb: 'The defining climate record: a steady, accelerating rise from 316 ppm (1959) to 421 ppm (2023).',
        source: 'Scripps CO₂ Program / NOAA GML, Mauna Loa Observatory',
        license: 'NOAA gov data (PD); Scripps requests citation',
        semantic_types: { Year: 'Year', 'CO₂ (ppm)': 'Quantity' },
        encodings: { x: 'Year', y: 'CO₂ (ppm)' },
        data: CO2.map(([Year, ppm]) => ({ Year, 'CO₂ (ppm)': ppm })),
    });

    cases.push({
        id: 'population',
        chartType: 'Bar Chart',
        title: 'Most populous countries, 2023 (millions)',
        blurb: 'Instantly legible ranked bar; the year India overtook China.',
        source: 'UN World Population Prospects 2022 / World Bank (2023)',
        license: 'CC-BY 4.0 (attribute UN/World Bank)',
        semantic_types: { Country: 'Country', Population: 'Quantity' },
        encodings: { y: 'Country', x: 'Population' },
        data: [
            ['India', 1428.6], ['China', 1425.7], ['United States', 339.9], ['Indonesia', 277.5],
            ['Pakistan', 240.5], ['Nigeria', 223.8], ['Brazil', 216.4], ['Bangladesh', 173.0],
            ['Russia', 144.4], ['Mexico', 128.5],
        ].map(([Country, Population]) => ({ Country, Population })),
    });

    {
        const rows: Record<string, unknown>[] = [];
        for (const [yr, byRegion] of Object.entries(POP_REGION)) {
            for (const [region, pop] of Object.entries(byRegion)) {
                rows.push({ Year: Number(yr), Region: region, Population: pop });
            }
        }
        cases.push({
            id: 'population-region',
            chartType: 'Area Chart',
            title: 'World population by region, 1950–2020 (stacked area, millions)',
            blurb: "Asia's dominance and Africa's acceleration stacked over 70 years.",
            source: 'UN World Population Prospects 2022',
            license: 'CC-BY 4.0 (attribute UN)',
            semantic_types: { Year: 'Year', Region: 'Category', Population: 'Quantity' },
            encodings: { x: 'Year', y: 'Population', color: 'Region' },
            chartProperties: { stackMode: 'stack' },
            data: rows,
        });
    }

    cases.push({
        id: 'faithful',
        chartType: 'Scatter Plot',
        title: 'Old Faithful eruptions — waiting time vs duration',
        blurb: 'A textbook bimodal relationship: short/long eruptions form two separated clouds.',
        source: 'Härdle (1991) / R "faithful" dataset — 36-row sample',
        license: 'Public domain (classic teaching set)',
        semantic_types: { 'Duration (min)': 'Quantity', 'Waiting (min)': 'Quantity' },
        encodings: { x: 'Duration (min)', y: 'Waiting (min)' },
        data: FAITHFUL.map(([dur, wait]) => ({ 'Duration (min)': dur, 'Waiting (min)': wait })),
    });

    {
        const rows: Record<string, unknown>[] = [];
        for (const [country, [y2000, y2021]] of Object.entries(LIFE_EXP)) {
            rows.push({ Country: country, Year: 2000, 'Life expectancy': y2000 });
            rows.push({ Country: country, Year: 2021, 'Life expectancy': y2021 });
        }
        cases.push({
            id: 'life-expectancy',
            chartType: 'Slope Chart',
            title: 'Life expectancy, 2000 → 2021',
            blurb: 'Most countries rose; the US line dips (the COVID-era decline stands out).',
            source: 'World Bank / Our World in Data',
            license: 'CC-BY 4.0 (attribute OWID + World Bank)',
            semantic_types: { Country: 'Country', Year: 'Year', 'Life expectancy': 'Quantity' },
            encodings: { x: 'Year', y: 'Life expectancy', color: 'Country' },
            data: rows,
        });
    }

    // ----- More chart types (these still have Vega-Lite templates) -----

    cases.push({
        id: 'population-waterfall',
        chartType: 'Waterfall Chart',
        title: 'World population growth 1950 → 2020, by region contribution',
        blurb: 'A bridge from 2.5B to ~7.8B people, one step per UN sub-region.',
        source: 'UN World Population Prospects 2022 (sub-regional deltas, 1950–2020)',
        license: 'CC-BY 4.0 (attribute UN)',
        semantic_types: { Step: 'Category', 'Population (M)': 'Quantity' },
        encodings: { x: 'Step', y: 'Population (M)' },
        // Broken out to UN sub-region rather than continent: the same bridge, but
        // it separates the two very different Asian contributions instead of
        // hiding them in one bar.
        data: [
            { Step: '1950', 'Population (M)': 2536 },
            { Step: 'South-Central Asia', 'Population (M)': 1515 },
            { Step: 'Eastern Asia', 'Population (M)': 1007 },
            { Step: 'Sub-Saharan Africa', 'Population (M)': 956 },
            { Step: 'South-Eastern Asia', 'Population (M)': 503 },
            { Step: 'Latin America', 'Population (M)': 484 },
            { Step: 'Western Asia', 'Population (M)': 229 },
            { Step: 'Northern Africa', 'Population (M)': 199 },
            { Step: 'Northern America', 'Population (M)': 199 },
            { Step: 'Europe', 'Population (M)': 199 },
            { Step: 'Oceania', 'Population (M)': 32 },
            { Step: '2020', 'Population (M)': 7859 },
        ],
        // Both ends are anchors: 1950 is the starting stock and 2020 the closing
        // one, so each is drawn as a full bar to zero with the regional deltas
        // floating between them.
        chartProperties: { totals: 'both' },
    });

    cases.push({
        id: 'nutrition-radar',
        chartType: 'Radar Chart',
        title: 'Nutrition profile per 100 g — Almonds vs Oats vs Greek yogurt',
        blurb: 'Compare three foods across five nutrients; each food traces a distinct polygon.',
        source: 'USDA FoodData Central (representative per-100g values)',
        license: 'US-gov data (public domain)',
        semantic_types: { Nutrient: 'Category', Food: 'Category', 'Grams/100g': 'Quantity' },
        encodings: { x: 'Nutrient', y: 'Grams/100g', color: 'Food' },
        data: (() => {
            const table: Record<string, Record<string, number>> = {
                Almonds: { Protein: 21, Fat: 50, Carbs: 22, Fiber: 12, Sugar: 4 },
                Oats: { Protein: 17, Fat: 7, Carbs: 66, Fiber: 11, Sugar: 1 },
                'Greek yogurt': { Protein: 10, Fat: 5, Carbs: 4, Fiber: 0, Sugar: 4 },
            };
            const rows: Record<string, unknown>[] = [];
            for (const [food, byNutrient] of Object.entries(table)) {
                for (const [nutrient, grams] of Object.entries(byNutrient)) {
                    rows.push({ Food: food, Nutrient: nutrient, 'Grams/100g': grams });
                }
            }
            return rows;
        })(),
    });

    // Genuinely Plotly-only chart types (no Vega-Lite template) — these exercise
    // the auto Plotly fallback.
    cases.push({
        id: 'education-funnel',
        chartType: 'Funnel Chart',
        title: 'US educational attainment, age 25+ (2022)',
        blurb: 'A real attainment funnel: of adults 25+, the share reaching each successive level. (Funnel → Plotly.)',
        source: 'US Census Bureau, CPS 2022 educational attainment',
        license: 'US-gov data (public domain)',
        semantic_types: { Level: 'Category', 'Share (%)': 'Quantity' },
        encodings: { y: 'Level', size: 'Share (%)' },
        data: [
            { Level: 'High school or more', 'Share (%)': 91.1 },
            { Level: 'Some college or more', 'Share (%)': 61.3 },
            { Level: "Bachelor's or more", 'Share (%)': 37.7 },
            { Level: "Master's or more", 'Share (%)': 14.4 },
            { Level: 'Doctorate', 'Share (%)': 2.1 },
        ],
    });

    cases.push({
        id: 'renewables-gauge',
        chartType: 'Gauge Chart',
        title: 'Share of electricity from renewables, 2023',
        blurb: 'Small-multiple gauges comparing a few countries against the global figure. (Gauge → Plotly.)',
        source: 'Our World in Data / Ember (2023)',
        license: 'CC-BY 4.0 (attribute OWID + Ember)',
        semantic_types: { Country: 'Category', 'Renewable share (%)': 'Quantity' },
        encodings: { column: 'Country', size: 'Renewable share (%)' },
        data: [
            { Country: 'Norway', 'Renewable share (%)': 98.6 },
            { Country: 'Brazil', 'Renewable share (%)': 89.2 },
            { Country: 'Germany', 'Renewable share (%)': 51.6 },
            { Country: 'World', 'Renewable share (%)': 30.3 },
            { Country: 'United States', 'Renewable share (%)': 22.7 },
        ],
    });
    // ─────────────────────────────────────────────────────────────────────
    // Broader coverage — more chart types, real data (added for review).
    // ─────────────────────────────────────────────────────────────────────
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Regression — Auto MPG (horsepower vs mpg): classic downward relationship.
    cases.push({
        id: 'auto-mpg',
        chartType: 'Regression',
        title: 'Auto MPG — horsepower vs fuel economy',
        blurb: 'The classic inverse relationship: more horsepower, fewer miles per gallon.',
        source: 'UCI / StatLib Auto MPG dataset (sample)',
        license: 'UCI CC-BY / facts',
        semantic_types: { Horsepower: 'Quantity', MPG: 'Quantity' },
        encodings: { x: 'Horsepower', y: 'MPG' },
        data: [[130, 18], [165, 15], [150, 18], [150, 16], [140, 17], [198, 15], [220, 14], [215, 14], [97, 22], [85, 26], [88, 25], [46, 26], [90, 25], [95, 24], [68, 29], [70, 27], [52, 30], [65, 31], [67, 30], [48, 43], [66, 32], [100, 22]].map(([Horsepower, MPG]) => ({ Horsepower, MPG })),
    });

    // Histogram — Old Faithful eruption durations (bimodal).
    cases.push({
        id: 'faithful-hist',
        chartType: 'Histogram',
        title: 'Old Faithful — distribution of eruption durations',
        blurb: 'Two humps: short (~2 min) and long (~4.5 min) eruptions. A mean would hide this.',
        source: 'R "faithful" dataset (sample)',
        license: 'Public domain',
        semantic_types: { 'Duration (min)': 'Quantity' },
        encodings: { x: 'Duration (min)' },
        data: FAITHFUL.map(([dur]) => ({ 'Duration (min)': dur })),
    });

    // Density — Old Faithful durations.
    cases.push({
        id: 'faithful-density',
        chartType: 'Density Plot',
        title: 'Old Faithful — eruption duration density',
        blurb: 'The same bimodal shape as a smooth density curve.',
        source: 'R "faithful" dataset (sample)',
        license: 'Public domain',
        semantic_types: { 'Duration (min)': 'Quantity' },
        encodings: { x: 'Duration (min)' },
        data: FAITHFUL.map(([dur]) => ({ 'Duration (min)': dur })),
    });

    // Boxplot — Penguin body mass by species.
    cases.push({
        id: 'penguins-box',
        chartType: 'Boxplot',
        title: 'Penguin body mass by species',
        blurb: 'Gentoo penguins are markedly heavier than Adélie and Chinstrap.',
        source: 'Palmer Station LTER (sample)',
        license: 'CC0',
        semantic_types: { Species: 'Category', 'Body mass (g)': 'Quantity' },
        encodings: { x: 'Species', y: 'Body mass (g)' },
        data: PENGUINS.map(([Species, , mass]) => ({ Species, 'Body mass (g)': mass })),
    });

    // Violin — Penguin body mass by species (VL only).
    cases.push({
        id: 'penguins-violin',
        chartType: 'Violin Plot',
        title: 'Penguin body mass by species (violin)',
        blurb: 'Density shape per species — the Gentoo distribution sits clearly higher.',
        source: 'Palmer Station LTER (sample)',
        license: 'CC0',
        semantic_types: { Species: 'Category', 'Body mass (g)': 'Quantity' },
        encodings: { x: 'Species', y: 'Body mass (g)' },
        data: PENGUINS.map(([Species, , mass]) => ({ Species, 'Body mass (g)': mass })),
    });

    // Strip — Iris petal length by species.
    cases.push({
        id: 'iris-strip',
        chartType: 'Strip Plot',
        title: 'Iris petal length by species',
        blurb: 'Setosa petals are tiny and tightly clustered; the other two overlap more.',
        source: "Fisher's Iris (1936), sample",
        license: 'Public domain',
        semantic_types: { Species: 'Category', 'Petal length (cm)': 'Quantity' },
        encodings: { x: 'Species', y: 'Petal length (cm)' },
        data: (() => {
            const t: Record<string, number[]> = { Setosa: [1.4, 1.4, 1.3, 1.5, 1.4, 1.7, 1.4, 1.5, 1.5, 1.6], Versicolor: [4.7, 4.5, 4.9, 4.0, 4.6, 4.5, 4.7, 3.3, 4.6, 3.9], Virginica: [6.0, 5.1, 5.9, 5.6, 5.8, 6.6, 4.5, 6.3, 5.8, 6.1] };
            const rows: Record<string, unknown>[] = [];
            for (const [Species, arr] of Object.entries(t)) for (const v of arr) rows.push({ Species, 'Petal length (cm)': v });
            return rows;
        })(),
    });

    // ECDF — exam scores.
    cases.push({
        id: 'exam-ecdf',
        chartType: 'ECDF Plot',
        title: 'Exam scores — cumulative distribution',
        blurb: 'Read percentiles directly: e.g. the median where the curve crosses 0.5.',
        source: 'Illustrative class scores',
        license: 'Illustrative',
        semantic_types: { Score: 'Quantity' },
        encodings: { x: 'Score' },
        data: [55, 62, 68, 71, 73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 85, 86, 87, 88, 88, 89, 90, 91, 92, 93, 94, 95, 97, 99].map(Score => ({ Score })),
    });

    // Grouped Bar — Paris 2024 medals by country × type.
    cases.push({
        id: 'medals-grouped',
        chartType: 'Grouped Bar Chart',
        title: 'Paris 2024 Olympic medals — top nations',
        blurb: 'Gold / silver / bronze clustered per country.',
        source: 'IOC, Paris 2024 medal table',
        license: 'Facts (IOC)',
        semantic_types: { Country: 'Country', Medal: 'Category', Count: 'Quantity' },
        encodings: { x: 'Country', y: 'Count', group: 'Medal' },
        data: (() => {
            const t: Record<string, number[]> = { 'United States': [40, 44, 42], China: [40, 27, 24], Japan: [20, 12, 13], Australia: [18, 19, 16], France: [16, 26, 22] };
            const kinds = ['Gold', 'Silver', 'Bronze'];
            const rows: Record<string, unknown>[] = [];
            for (const [Country, arr] of Object.entries(t)) arr.forEach((Count, i) => rows.push({ Country, Medal: kinds[i], Count }));
            return rows;
        })(),
    });

    // Stacked Bar — electricity mix by country.
    cases.push({
        id: 'electricity-stacked',
        chartType: 'Stacked Bar Chart',
        title: 'Electricity generation mix by country, 2023 (%)',
        blurb: 'How each country splits generation across sources.',
        source: 'Our World in Data / Ember (approx.)',
        license: 'CC-BY (OWID/Ember)',
        semantic_types: { Country: 'Country', Source: 'Category', Share: 'Quantity' },
        encodings: { x: 'Country', y: 'Share', color: 'Source' },
        data: (() => {
            const t: Record<string, Record<string, number>> = { France: { Nuclear: 65, Renewables: 27, Fossil: 8 }, Germany: { Renewables: 52, Fossil: 45, Nuclear: 3 }, 'United States': { Fossil: 60, Nuclear: 18, Renewables: 22 }, China: { Fossil: 62, Renewables: 33, Nuclear: 5 }, Brazil: { Renewables: 89, Fossil: 9, Nuclear: 2 } };
            const rows: Record<string, unknown>[] = [];
            for (const [Country, by] of Object.entries(t)) for (const [Source, Share] of Object.entries(by)) rows.push({ Country, Source, Share });
            return rows;
        })(),
    });

    // Lollipop — CO₂ per capita by country.
    cases.push({
        id: 'co2-lollipop',
        chartType: 'Lollipop Chart',
        title: 'CO₂ emissions per capita, 2022 (tonnes)',
        blurb: 'Per-person emissions vary ~40× across sixteen countries.',
        source: 'Our World in Data (Global Carbon Project)',
        license: 'CC-BY (OWID)',
        semantic_types: { Country: 'Country', 'Tonnes/person': 'Quantity' },
        encodings: { x: 'Country', y: 'Tonnes/person' },
        data: [['Qatar', 37], ['UAE', 22], ['Australia', 15], ['United States', 15], ['Canada', 14], ['South Korea', 12], ['Russia', 11], ['Japan', 8.5], ['China', 8.0], ['Germany', 8.0], ['South Africa', 6.7], ['UK', 5.0], ['France', 4.6], ['Mexico', 3.3], ['Brazil', 2.3], ['India', 2.0]].map(([Country, v]) => ({ Country, 'Tonnes/person': v })),
    });

    // Pyramid — US population by age & sex.
    cases.push({
        id: 'us-pyramid',
        chartType: 'Pyramid Chart',
        title: 'US population by age and sex, 2020 (millions)',
        blurb: 'A classic population pyramid — male vs female by age band.',
        source: 'US Census 2020 (approx.)',
        license: 'US-gov (PD)',
        semantic_types: { Age: 'Category', Sex: 'Category', Population: 'Quantity' },
        encodings: { x: 'Population', y: 'Age', color: 'Sex' },
        data: (() => {
            // Oldest first: an ordinal axis renders its domain top-down, and a population
            // pyramid is read with age increasing upward.
            const ages = ['75+', '60–74', '45–59', '30–44', '15–29', '0–14'];
            const m = [10, 26, 30, 33, 34, 31], f = [15, 28, 31, 33, 32, 30];
            const rows: Record<string, unknown>[] = [];
            ages.forEach((Age, i) => { rows.push({ Age, Sex: 'Male', Population: m[i] }); rows.push({ Age, Sex: 'Female', Population: f[i] }); });
            return rows;
        })(),
    });

    // Bar Table — GDP by country.
    cases.push({
        id: 'gdp-bartable',
        chartType: 'Bar Table',
        title: 'GDP by country, 2023 (trillion USD)',
        blurb: 'Compact ranked bars with value labels.',
        source: 'IMF / World Bank 2023',
        license: 'CC-BY (IMF/WB)',
        semantic_types: { Country: 'Country', 'GDP ($T)': 'Quantity' },
        encodings: { y: 'Country', x: 'GDP ($T)' },
        data: [['United States', 27.4], ['China', 17.8], ['Germany', 4.5], ['Japan', 4.2], ['India', 3.9], ['UK', 3.3], ['France', 3.0], ['Brazil', 2.2]].map(([Country, v]) => ({ Country, 'GDP ($T)': v })),
    });

    // Ranged Dot — male vs female life expectancy (dumbbell).
    cases.push({
        id: 'lifeexp-dumbbell',
        chartType: 'Ranged Dot Plot',
        title: 'Life expectancy gap, male vs female (2021)',
        blurb: 'The dumbbell length is the female–male gap in years.',
        source: 'World Bank 2021',
        license: 'CC-BY (WB)',
        semantic_types: { Country: 'Country', Sex: 'Category', 'Life expectancy': 'Quantity' },
        encodings: { x: 'Life expectancy', y: 'Country', color: 'Sex' },
        data: (() => {
            const t: Record<string, number[]> = { Japan: [81.5, 87.6], 'United States': [73.5, 79.3], India: [66.0, 69.0], Brazil: [69.0, 76.0], Nigeria: [51.0, 54.0], Germany: [78.5, 83.4] };
            const rows: Record<string, unknown>[] = [];
            for (const [Country, [mm, ff]] of Object.entries(t)) { rows.push({ Country, Sex: 'Male', 'Life expectancy': mm }); rows.push({ Country, Sex: 'Female', 'Life expectancy': ff }); }
            return rows;
        })(),
    });

    // Range Area — Seattle monthly temp low/high.
    cases.push({
        id: 'seattle-range',
        chartType: 'Range Area Chart',
        title: 'Seattle average monthly temperature range (°F)',
        blurb: 'The band spans the average daily low to high each month.',
        source: 'NOAA climate normals',
        license: 'US-gov (PD)',
        semantic_types: { Month: 'Category', Low: 'Quantity', High: 'Quantity' },
        encodings: { x: 'Month', y: 'Low', y2: 'High' },
        data: (() => { const lo = [37, 37, 40, 43, 48, 53, 56, 57, 53, 46, 40, 36], hi = [47, 50, 54, 59, 65, 70, 76, 77, 71, 60, 51, 46]; return MO.map((Month, i) => ({ Month, Low: lo[i], High: hi[i] })); })(),
    });

    // Bump — Olympic medal-table rank over four Games.
    cases.push({
        id: 'olympic-bump',
        chartType: 'Bump Chart',
        title: 'Olympic medal-table rank, 2012–2024',
        blurb: 'Rank over four Summer Games (1 = top of the table).',
        source: 'IOC medal tables',
        license: 'Facts (IOC)',
        semantic_types: { Games: 'Year', Country: 'Country', Rank: 'Quantity' },
        encodings: { x: 'Games', y: 'Rank', color: 'Country' },
        data: (() => {
            const games = [2012, 2016, 2020, 2024];
            const t: Record<string, number[]> = { 'United States': [1, 1, 1, 1], China: [2, 3, 2, 2], 'Great Britain': [3, 2, 4, 7], Japan: [6, 6, 5, 3] };
            const rows: Record<string, unknown>[] = [];
            for (const [Country, ranks] of Object.entries(t)) games.forEach((Games, i) => rows.push({ Games, Country, Rank: ranks[i] }));
            return rows;
        })(),
    });

    // Streamgraph — world population by region (reuse POP_REGION).
    (() => {
        const rows: Record<string, unknown>[] = [];
        for (const [yr, by] of Object.entries(POP_REGION)) for (const [Region, Population] of Object.entries(by)) rows.push({ Year: Number(yr), Region, Population });
        cases.push({
            id: 'population-stream',
            chartType: 'Streamgraph',
            title: 'World population by region (streamgraph)',
            blurb: 'The same regional totals as a centre-stacked stream.',
            source: 'UN World Population Prospects 2022',
            license: 'CC-BY (UN)',
            semantic_types: { Year: 'Year', Region: 'Category', Population: 'Quantity' },
            encodings: { x: 'Year', y: 'Population', color: 'Region' },
            data: rows,
        });
    })();

    // Pie — desktop browser share.
    cases.push({
        id: 'browser-pie',
        chartType: 'Pie Chart',
        title: 'Desktop browser market share, 2024',
        blurb: 'Chrome dominates; Safari and Edge trail.',
        source: 'StatCounter (approx. 2024)',
        license: 'Illustrative (StatCounter)',
        semantic_types: { Browser: 'Category', Share: 'Quantity' },
        encodings: { size: 'Share', color: 'Browser' },
        data: [['Chrome', 65], ['Safari', 12], ['Edge', 12], ['Firefox', 6], ['Other', 5]].map(([Browser, Share]) => ({ Browser, Share })),
    });

    // Donut — mobile OS share.
    cases.push({
        id: 'mobile-donut',
        chartType: 'Donut Chart',
        title: 'Mobile OS market share, 2024',
        blurb: 'Android vs iOS worldwide.',
        source: 'StatCounter (approx. 2024)',
        license: 'Illustrative (StatCounter)',
        semantic_types: { OS: 'Category', Share: 'Quantity' },
        encodings: { size: 'Share', color: 'OS' },
        data: [['Android', 71], ['iOS', 28], ['Other', 1]].map(([OS, Share]) => ({ OS, Share })),
    });

    // Rose — Seattle monthly rainfall (polar bars).
    cases.push({
        id: 'seattle-rose',
        chartType: 'Rose Chart',
        title: 'Seattle monthly rainfall (mm)',
        blurb: 'Wet winters, dry midsummer — as polar bars around the year.',
        source: 'NOAA climate normals',
        license: 'US-gov (PD)',
        semantic_types: { Month: 'Category', 'Rainfall (mm)': 'Quantity' },
        encodings: { x: 'Month', y: 'Rainfall (mm)' },
        data: (() => { const r = [140, 90, 95, 70, 50, 40, 18, 25, 40, 100, 165, 155]; return MO.map((Month, i) => ({ Month, 'Rainfall (mm)': r[i] })); })(),
    });

    // Candlestick — a couple of weeks of a stock's daily OHLC.
    cases.push({
        id: 'stock-candle',
        chartType: 'Candlestick Chart',
        title: 'A stock, daily OHLC (two weeks)',
        blurb: 'Open-high-low-close candles over ~10 trading days.',
        source: 'Illustrative daily prices',
        license: 'Illustrative',
        semantic_types: { Date: 'Date', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity' },
        encodings: { x: 'Date', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
        data: [['2024-01-02', 187, 188, 183, 185], ['2024-01-03', 184, 185, 182, 184], ['2024-01-04', 182, 183, 180, 182], ['2024-01-05', 182, 182, 179, 181], ['2024-01-08', 182, 186, 182, 185], ['2024-01-09', 184, 185, 183, 185], ['2024-01-10', 184, 186, 183, 186], ['2024-01-11', 186, 187, 183, 186], ['2024-01-12', 186, 188, 185, 185]].map(([Date, Open, High, Low, Close]) => ({ Date, Open, High, Low, Close })),
    });

    // Heatmap — city × month temperature.
    cases.push({
        id: 'temp-heatmap',
        chartType: 'Heatmap',
        title: 'Average monthly temperature by city (°C)',
        blurb: 'Warm bands for the tropics, a cold Moscow winter, and Sydney running the year backwards.',
        source: 'Climate normals (approx.)',
        license: 'Illustrative',
        semantic_types: { Month: 'Category', City: 'Category', 'Temp (°C)': 'Quantity' },
        encodings: { x: 'Month', y: 'City', color: 'Temp (°C)' },
        data: (() => {
            // Six cities, not four: enough rows that the matrix reads as a block
            // rather than a strip, and Sydney puts a southern-hemisphere summer
            // against Moscow's winter in the same column.
            const t: Record<string, number[]> = {
                Singapore: [26, 27, 28, 28, 28, 28, 27, 27, 27, 27, 26, 26],
                Delhi: [14, 17, 23, 29, 33, 34, 31, 30, 29, 26, 20, 15],
                Cairo: [14, 15, 18, 22, 26, 28, 29, 29, 27, 24, 20, 16],
                Sydney: [23, 23, 22, 19, 16, 13, 13, 14, 17, 19, 21, 22],
                Seattle: [5, 6, 8, 10, 13, 16, 19, 19, 16, 11, 7, 4],
                Moscow: [-9, -7, -1, 7, 13, 17, 19, 17, 11, 5, -1, -6],
            };
            const rows: Record<string, unknown>[] = [];
            for (const [City, arr] of Object.entries(t)) arr.forEach((v, i) => rows.push({ City, Month: MO[i], 'Temp (°C)': v }));
            return rows;
        })(),
    });

    // KPI Card — renewable share vs target.
    cases.push({
        id: 'renewable-kpi',
        chartType: 'KPI Card',
        title: 'Global renewable electricity share (2023)',
        blurb: 'A single headline number against its 2030 target.',
        source: 'Our World in Data / Ember',
        license: 'CC-BY (OWID/Ember)',
        semantic_types: { Metric: 'Category', 'Share (%)': 'Quantity', Target: 'Quantity' },
        encodings: { metric: 'Metric', value: 'Share (%)', goal: 'Target' },
        data: [{ Metric: 'Renewable share', 'Share (%)': 30.3, Target: 45 }],
    });

    // Bullet — renewable share vs 2030 target by country.
    cases.push({
        id: 'renewable-bullet',
        chartType: 'Bullet Chart',
        title: 'Renewable electricity share vs 2030 target',
        blurb: 'Each bar is the current share; the tick marks the 2030 target.',
        source: 'Our World in Data / Ember (targets illustrative)',
        license: 'CC-BY (OWID/Ember)',
        semantic_types: { Country: 'Country', Share: 'Quantity', Target: 'Quantity' },
        encodings: { y: 'Country', x: 'Share', goal: 'Target' },
        data: [['Norway', 98.6, 100], ['Brazil', 89.2, 95], ['Germany', 51.6, 80], ['World', 30.3, 60], ['United States', 22.7, 50]].map(([Country, Share, Target]) => ({ Country, Share, Target })),
    });

    // Map — world cities bubble.
    cases.push({
        id: 'cities-map',
        chartType: 'Map',
        title: "World's largest cities (metro population)",
        blurb: 'Bubble size = metro-area population.',
        source: 'UN / city statistics (approx.)',
        license: 'CC-BY / facts',
        semantic_types: { City: 'City', Lon: 'Longitude', Lat: 'Latitude', 'Population (M)': 'Quantity' },
        encodings: { longitude: 'Lon', latitude: 'Lat', size: 'Population (M)' },
        data: [['Tokyo', 139.7, 35.7, 37.4], ['Delhi', 77.2, 28.6, 32.9], ['Shanghai', 121.5, 31.2, 29.2], ['São Paulo', -46.6, -23.5, 22.6], ['Mexico City', -99.1, 19.4, 22.1], ['Cairo', 31.2, 30.0, 21.3], ['New York', -74.0, 40.7, 18.9], ['Lagos', 3.4, 6.5, 15.4], ['London', -0.1, 51.5, 9.5], ['Los Angeles', -118.2, 34.1, 12.4]].map(([City, Lon, Lat, p]) => ({ City, Lon, Lat, 'Population (M)': p })),
    });

    // Gantt — a software release schedule.
    cases.push({
        id: 'release-gantt',
        chartType: 'Gantt Chart',
        title: 'Software release schedule',
        blurb: 'Overlapping phases from planning to launch.',
        source: 'Illustrative project plan',
        license: 'Illustrative',
        semantic_types: { Task: 'Category', Start: 'Date', End: 'Date' },
        encodings: { y: 'Task', x: 'Start', x2: 'End' },
        data: [['Planning', '2024-01-01', '2024-01-14'], ['Design', '2024-01-15', '2024-02-04'], ['Implementation', '2024-02-05', '2024-03-17'], ['Testing', '2024-03-11', '2024-04-07'], ['Launch', '2024-04-08', '2024-04-15']].map(([Task, Start, End]) => ({ Task, Start, End })),
    });

    // Sparkline — monthly KPI small multiples.
    cases.push({
        id: 'kpi-sparkline',
        chartType: 'Sparkline',
        title: 'Monthly KPIs (sparklines)',
        blurb: 'Three metrics as mini trend lines, one per row.',
        source: 'Illustrative company metrics',
        license: 'Illustrative',
        semantic_types: { Month: 'Category', Metric: 'Category', Value: 'Quantity' },
        encodings: { x: 'Month', y: 'Value', color: 'Metric' },
        data: (() => {
            const t: Record<string, number[]> = { 'Revenue ($k)': [120, 125, 130, 128, 140, 145, 150, 148, 160, 165, 170, 180], 'Active users (k)': [40, 42, 45, 47, 50, 52, 55, 58, 60, 63, 66, 70], 'Churn (%)': [5.2, 5.0, 4.8, 4.9, 4.6, 4.5, 4.3, 4.4, 4.1, 4.0, 3.9, 3.8] };
            const rows: Record<string, unknown>[] = [];
            for (const [Metric, arr] of Object.entries(t)) arr.forEach((Value, i) => rows.push({ Month: MO[i], Metric, Value }));
            return rows;
        })(),
    });
    // ─────────────────────────────────────────────────────────────────────
    // Iconic / high-interest datasets (variety + "wow" for the gallery).
    // ─────────────────────────────────────────────────────────────────────

    // Gapminder bubble — life expectancy vs income, sized by population.
    cases.push({
        id: 'gapminder-bubble',
        chartType: 'Scatter Plot',
        title: 'Gapminder — life expectancy vs income per capita (2018)',
        blurb: 'The Rosling bubble chart: wealth vs health, bubble = population, colour = continent (log income axis).',
        source: 'Gapminder / World Bank (2018)',
        license: 'CC-BY (Gapminder)',
        semantic_types: { 'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity', 'Population (M)': 'Quantity', Continent: 'Category' },
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
    });

    // Anscombe's Quartet — four datasets, identical stats, different shapes.
    cases.push({
        id: 'anscombe',
        chartType: 'Regression',
        title: "Anscombe's Quartet — same stats, different shapes",
        blurb: 'Four datasets with identical means, variances and regression lines — but wildly different when plotted.',
        source: 'F. J. Anscombe (1973)',
        license: 'Public domain',
        semantic_types: { Dataset: 'Category', X: 'Quantity', Y: 'Quantity' },
        encodings: { x: 'X', y: 'Y', column: 'Dataset' },
        data: (() => {
            const x1 = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
            const sets: Record<string, { x: number[]; y: number[] }> = {
                I: { x: x1, y: [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68] },
                II: { x: x1, y: [9.14, 8.14, 8.74, 8.77, 9.26, 8.10, 6.13, 3.10, 9.13, 7.26, 4.74] },
                III: { x: x1, y: [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73] },
                IV: { x: [8, 8, 8, 8, 8, 8, 8, 19, 8, 8, 8], y: [6.58, 5.76, 7.71, 8.84, 8.47, 7.04, 5.25, 12.50, 5.56, 7.91, 6.89] },
            };
            const rows: Record<string, unknown>[] = [];
            for (const [Dataset, { x, y }] of Object.entries(sets)) x.forEach((X, i) => rows.push({ Dataset, X, Y: y[i] }));
            return rows;
        })(),
    });

    // Temperature anomaly — diverging bars crossing zero (warming).
    cases.push({
        id: 'temp-anomaly',
        chartType: 'Bar Chart',
        title: 'Global temperature anomaly by decade (°C vs 1951–1980)',
        blurb: 'Bars cross zero — cool early decades below, rapid warming above.',
        source: 'NASA GISTEMP (approx. decadal means)',
        license: 'US-gov (PD)',
        semantic_types: { Decade: 'Category', 'Anomaly (°C)': 'Quantity', Direction: 'Category' },
        encodings: { x: 'Decade', y: 'Anomaly (°C)', color: 'Direction' },
        data: [['1880s', -0.17], ['1900s', -0.16], ['1920s', -0.27], ['1940s', 0.12], ['1960s', -0.03], ['1980s', 0.26], ['2000s', 0.40], ['2010s', 0.72], ['2020s', 1.02]].map(([Decade, v]) => ({ Decade, 'Anomaly (°C)': v, Direction: (v as number) < 0 ? 'Below average' : 'Above average' })),
    });

    // US unemployment 2000–2023 — the recession spikes.
    cases.push({
        id: 'us-unemployment',
        chartType: 'Line Chart',
        title: 'US unemployment rate, 2000–2023 (%)',
        blurb: 'The 2009 financial-crisis plateau and the sharp 2020 pandemic spike.',
        source: 'US Bureau of Labor Statistics',
        license: 'US-gov (PD)',
        semantic_types: { Year: 'Year', 'Unemployment (%)': 'Quantity' },
        encodings: { x: 'Year', y: 'Unemployment (%)' },
        data: [[2000, 4.0], [2001, 4.7], [2002, 5.8], [2003, 6.0], [2004, 5.5], [2005, 5.1], [2006, 4.6], [2007, 4.6], [2008, 5.8], [2009, 9.3], [2010, 9.6], [2011, 8.9], [2012, 8.1], [2013, 7.4], [2014, 6.2], [2015, 5.3], [2016, 4.9], [2017, 4.4], [2018, 3.9], [2019, 3.7], [2020, 8.1], [2021, 5.3], [2022, 3.6], [2023, 3.6]].map(([Year, v]) => ({ Year, 'Unemployment (%)': v })),
    });

    // Titanic survival by class & sex.
    cases.push({
        id: 'titanic',
        chartType: 'Grouped Bar Chart',
        title: 'Titanic survival rate by class and sex',
        blurb: '"Women and children first" — and first class — are stark in the numbers.',
        source: 'Encyclopedia Titanica passenger records',
        license: 'Facts (public)',
        semantic_types: { Class: 'Category', Sex: 'Category', 'Survival (%)': 'Quantity' },
        encodings: { x: 'Class', y: 'Survival (%)', group: 'Sex' },
        data: (() => {
            const t: Record<string, [number, number]> = { '1st': [97, 34], '2nd': [89, 15], '3rd': [49, 15] };
            const rows: Record<string, unknown>[] = [];
            for (const [Class, [fem, male]] of Object.entries(t)) { rows.push({ Class, Sex: 'Female', 'Survival (%)': fem }); rows.push({ Class, Sex: 'Male', 'Survival (%)': male }); }
            return rows;
        })(),
    });

    // Diamonds — carat vs price.
    cases.push({
        id: 'diamonds',
        chartType: 'Scatter Plot',
        title: 'Diamonds — carat vs price',
        blurb: 'Price rises steeply and non-linearly with carat weight.',
        source: 'ggplot2 "diamonds" (sample)',
        license: 'Public domain (sample)',
        semantic_types: { Carat: 'Quantity', 'Price (USD)': 'Quantity' },
        encodings: { x: 'Carat', y: 'Price (USD)' },
        data: [[0.23, 326], [0.21, 326], [0.29, 334], [0.31, 335], [0.24, 336], [0.4, 900], [0.5, 1500], [0.6, 1800], [0.7, 2500], [0.8, 3000], [0.9, 3900], [1.0, 5000], [1.01, 5200], [1.1, 6000], [1.2, 7200], [1.3, 8200], [1.5, 10000], [1.7, 13000], [2.0, 18000], [2.5, 25000]].map(([Carat, p]) => ({ Carat, 'Price (USD)': p })),
    });

    // World Happiness vs income.
    cases.push({
        id: 'happiness',
        chartType: 'Scatter Plot',
        title: 'World Happiness vs income per capita (2023)',
        blurb: 'Happiness rises with income — but with diminishing returns (log income axis).',
        source: 'World Happiness Report 2023 / World Bank',
        license: 'CC-BY',
        semantic_types: { Country: 'Country', 'GDP per capita': 'Quantity', 'Happiness score': 'Quantity' },
        encodings: { x: 'GDP per capita', y: 'Happiness score' },
        chartProperties: { logScale_x: true },
        data: [['Finland', 54000, 7.8], ['Denmark', 68000, 7.6], ['United States', 76000, 6.9], ['Germany', 51000, 7.0], ['Japan', 34000, 6.1], ['Brazil', 9000, 6.1], ['China', 12800, 5.8], ['Mexico', 11000, 6.3], ['India', 2400, 4.0], ['Nigeria', 2200, 4.9], ['Kenya', 2100, 4.5], ['Costa Rica', 12500, 7.1]].map(([Country, gdp, h]) => ({ Country, 'GDP per capita': gdp, 'Happiness score': h })),
    });

    // Sunspot cycle — the ~11-year solar cycle.
    cases.push({
        id: 'sunspots',
        chartType: 'Line Chart',
        title: 'Sunspot number, 2000–2023',
        blurb: 'The ~11-year solar cycle: a deep minimum around 2008–2019, rising again by 2023.',
        source: 'SILSO / Royal Observatory of Belgium (approx.)',
        license: 'CC-BY (SILSO)',
        semantic_types: { Year: 'Year', 'Sunspot number': 'Quantity' },
        encodings: { x: 'Year', y: 'Sunspot number' },
        data: [[2000, 120], [2001, 111], [2002, 104], [2003, 64], [2004, 40], [2005, 30], [2006, 15], [2007, 8], [2008, 3], [2009, 3], [2010, 16], [2011, 56], [2012, 58], [2013, 65], [2014, 79], [2015, 67], [2016, 40], [2017, 22], [2018, 7], [2019, 4], [2020, 9], [2021, 29], [2022, 83], [2023, 123]].map(([Year, v]) => ({ Year, 'Sunspot number': v })),
    });

    // Marathon world record progression.
    cases.push({
        id: 'marathon-wr',
        chartType: 'Line Chart',
        title: "Men's marathon world record, 1908–2023 (minutes)",
        blurb: 'A century of steady improvement — closing in on the two-hour barrier.',
        source: 'World Athletics record progression',
        license: 'Facts (public)',
        semantic_types: { Year: 'Year', 'Record (min)': 'Quantity' },
        encodings: { x: 'Year', y: 'Record (min)' },
        data: [[1908, 175], [1925, 173], [1935, 166], [1947, 165], [1958, 155], [1967, 150], [1969, 148], [1988, 127], [1998, 126], [2003, 125], [2008, 124], [2011, 123.6], [2014, 122.9], [2018, 121.6], [2022, 121.1], [2023, 120.6]].map(([Year, v]) => ({ Year, 'Record (min)': v })),
    });

    // EV share of new car sales, multi-country.
    cases.push({
        id: 'ev-share',
        chartType: 'Line Chart',
        title: 'Electric-vehicle share of new car sales (%)',
        blurb: 'Norway is far ahead; China and Europe accelerating, the US catching up.',
        source: 'Our World in Data / IEA (approx.)',
        license: 'CC-BY (OWID/IEA)',
        semantic_types: { Year: 'Year', Country: 'Country', 'EV share (%)': 'Quantity' },
        encodings: { x: 'Year', y: 'EV share (%)', color: 'Country' },
        data: (() => {
            const years = [2018, 2020, 2022, 2023];
            const t: Record<string, number[]> = { Norway: [49, 75, 88, 93], China: [4, 6, 29, 38], Germany: [2, 13, 31, 25], 'United States': [2, 2, 8, 10] };
            const rows: Record<string, unknown>[] = [];
            for (const [Country, arr] of Object.entries(t)) years.forEach((Year, i) => rows.push({ Year, Country, 'EV share (%)': arr[i] }));
            return rows;
        })(),
    });

    // Global internet users over time (adoption curve).
    cases.push({
        id: 'internet-users',
        chartType: 'Area Chart',
        title: 'Share of the world online, 1995–2023 (%)',
        blurb: 'From ~1% to two-thirds of humanity in under three decades.',
        source: 'Our World in Data / ITU',
        license: 'CC-BY (OWID/ITU)',
        semantic_types: { Year: 'Year', 'Internet users (%)': 'Quantity' },
        encodings: { x: 'Year', y: 'Internet users (%)' },
        data: [[1995, 1], [2000, 7], [2005, 16], [2010, 29], [2015, 43], [2018, 51], [2020, 60], [2023, 67]].map(([Year, v]) => ({ Year, 'Internet users (%)': v })),
    });

    // Big Mac index — currency-value proxy.
    cases.push({
        id: 'big-mac',
        chartType: 'Bar Chart',
        title: 'The Big Mac index, 2023 (price in USD)',
        blurb: 'The Economist\'s tongue-in-cheek measure of purchasing power.',
        source: 'The Economist Big Mac index (approx. 2023)',
        license: 'Illustrative (The Economist)',
        semantic_types: { Country: 'Country', 'Price (USD)': 'Quantity' },
        encodings: { x: 'Price (USD)', y: 'Country' },
        data: [['Switzerland', 8.1], ['Norway', 6.9], ['United States', 5.7], ['Euro area', 5.5], ['UK', 4.9], ['Brazil', 4.5], ['Mexico', 3.9], ['China', 3.5], ['Japan', 3.2], ['Egypt', 2.7], ['South Africa', 2.6], ['India', 2.5]].map(([Country, p]) => ({ Country, 'Price (USD)': p })),
    });

    // ── Coverage cases ──────────────────────────────────────────────────────
    // The set above is broad on chart *type* but narrow on chart *shape*: almost
    // every case is a single un-faceted panel with one series. These add the
    // configurations that dominate real reporting — small multiples, 100%
    // stacks, diverging Likert bars, step lines, dashed projections and a
    // choropleth — so the theme lab has something to say about layout, not just
    // colour.

    // Small multiples: the same line repeated per country.
    cases.push({
        id: 'oecd-unemployment-facet',
        chartType: 'Line Chart',
        title: 'Unemployment rate by country, 2000–2022 (%)',
        blurb: 'Small multiples — four labour markets that behaved nothing alike.',
        source: 'OECD Labour Force Statistics (harmonised unemployment rate)',
        license: 'OECD terms (facts re-keyed)',
        semantic_types: { Year: 'Year', Country: 'Country', 'Unemployment (%)': 'Quantity' },
        encodings: { x: 'Year', y: 'Unemployment (%)', column: 'Country' },
        data: ([
            ['United States', [4.0, 5.1, 9.6, 5.3, 8.1, 3.6]],
            ['Germany', [7.9, 11.2, 7.0, 4.6, 3.7, 3.1]],
            ['Japan', [4.7, 4.4, 5.1, 3.4, 2.8, 2.6]],
            ['Spain', [13.9, 9.2, 19.9, 22.1, 15.5, 12.9]],
        ] as [string, number[]][]).flatMap(([Country, series]) =>
            [2000, 2005, 2010, 2015, 2020, 2022].map((Year, i) => ({ Year, Country, 'Unemployment (%)': series[i] })),
        ),
    });

    // 100% stacked bar — composition, not magnitude.
    cases.push({
        id: 'spending-quintile',
        chartType: 'Stacked Bar Chart',
        title: 'Where each income group\'s money goes (share of spending)',
        blurb: 'A 100% stack: housing eats twice the share at the bottom that it does at the top.',
        source: 'US Bureau of Labor Statistics, Consumer Expenditure Survey (approx. 2022)',
        license: 'US-gov (PD)',
        semantic_types: { Quintile: 'Category', Category: 'Category', 'Spending ($)': 'Quantity' },
        encodings: { x: 'Quintile', y: 'Spending ($)', color: 'Category' },
        chartProperties: { stackMode: 'normalize' },
        data: ([
            ['Lowest fifth', [12800, 4900, 5100, 2900, 6400]],
            ['Second fifth', [16100, 7600, 6300, 4000, 10700]],
            ['Middle fifth', [19400, 10600, 7600, 4700, 16400]],
            ['Fourth fifth', [24300, 13700, 9100, 6100, 22800]],
            ['Highest fifth', [36600, 19500, 13400, 8500, 43800]],
        ] as [string, number[]][]).flatMap(([Quintile, vals]) =>
            ['Housing', 'Transportation', 'Food', 'Healthcare', 'Everything else'].map((Category, i) => ({
                Quintile, Category, 'Spending ($)': vals[i],
            })),
        ),
    });

    // Diverging stacked bar — the standard survey/Likert layout.
    cases.push({
        id: 'trust-likert',
        chartType: 'Stacked Bar Chart',
        title: 'Confidence in US institutions (% of adults)',
        blurb: 'A Likert bar centred on the neutral split — agreement left, doubt right.',
        source: 'Pew Research Center / Gallup confidence-in-institutions series (approx. 2023)',
        license: 'Illustrative (figures re-keyed)',
        semantic_types: { Institution: 'Category', Response: 'Category', 'Share (%)': 'Quantity' },
        encodings: { x: 'Share (%)', y: 'Institution', color: 'Response' },
        chartProperties: { stackMode: 'center' },
        data: ([
            ['Small business', [42, 45, 10, 3]],
            ['Scientists', [39, 45, 12, 4]],
            ['The military', [32, 43, 18, 7]],
            ['The police', [26, 44, 21, 9]],
            ['The Supreme Court', [18, 40, 27, 15]],
            ['The press', [11, 32, 34, 23]],
            ['Congress', [8, 30, 38, 24]],
        ] as [string, number[]][]).flatMap(([Institution, vals]) =>
            ['A great deal', 'Some', 'Not much', 'None at all'].map((Response, i) => ({
                Institution, Response, 'Share (%)': vals[i],
            })),
        ),
    });

    // Step line — a policy rate only ever moves in jumps.
    cases.push({
        id: 'fed-funds-step',
        chartType: 'Line Chart',
        title: 'Federal funds target rate, 2015–2024 (%, upper bound)',
        blurb: 'A rate that only moves at meetings — interpolation would lie about it.',
        source: 'US Federal Reserve, FOMC target range (year-end upper bound)',
        license: 'US-gov (PD)',
        semantic_types: { Year: 'Year', 'Target rate (%)': 'Quantity' },
        encodings: { x: 'Year', y: 'Target rate (%)' },
        chartProperties: { interpolate: 'step' },
        data: [[2015, 0.5], [2016, 0.75], [2017, 1.5], [2018, 2.5], [2019, 1.75], [2020, 0.25], [2021, 0.25], [2022, 4.5], [2023, 5.5], [2024, 4.75]]
            .map(([Year, v]) => ({ Year, 'Target rate (%)': v })),
    });

    // Dashed projection — observed and forecast in one line.
    cases.push({
        id: 'renewables-projection',
        chartType: 'Line Chart',
        title: 'Global renewable capacity, observed and projected (GW)',
        blurb: 'One measure, two epistemic states — the dash carries the difference.',
        source: 'IEA Renewables market report (approx. figures)',
        license: 'Illustrative (figures re-keyed)',
        semantic_types: { Year: 'Year', Series: 'Category', 'Capacity (GW)': 'Quantity' },
        encodings: { x: 'Year', y: 'Capacity (GW)', strokeDash: 'Series' },
        data: [
            ...[[2015, 785], [2017, 1080], [2019, 1440], [2021, 1900], [2023, 2560]].map(([Year, v]) => ({ Year, Series: 'Observed', 'Capacity (GW)': v })),
            ...[[2023, 2560], [2025, 3400], [2027, 4300], [2030, 5800]].map(([Year, v]) => ({ Year, Series: 'Projected', 'Capacity (GW)': v })),
        ],
    });

    // Horizontal grouped bar — the survey-topline shape.
    cases.push({
        id: 'earnings-education',
        chartType: 'Grouped Bar Chart',
        title: 'Median weekly earnings by education and sex, 2023 ($)',
        blurb: 'Two gaps at once: the education ladder and the gap inside every rung.',
        source: 'US Bureau of Labor Statistics, usual weekly earnings (2023 annual)',
        license: 'US-gov (PD)',
        semantic_types: { Education: 'Category', Sex: 'Category', 'Weekly earnings ($)': 'Quantity' },
        encodings: { x: 'Weekly earnings ($)', y: 'Education', group: 'Sex' },
        data: ([
            // Highest attainment first: an ordinal axis renders its domain top-down, so this
            // puts the top of the education ladder at the top of the chart.
            ['Advanced degree', [2160, 1600]],
            ['Bachelor\'s degree', [1700, 1290]],
            ['Some college', [1120, 890]],
            ['High school', [1000, 790]],
            ['Less than high school', [780, 620]],
        ] as [string, number[]][]).flatMap(([Education, vals]) =>
            ['Men', 'Women'].map((Sex, i) => ({ Education, Sex, 'Weekly earnings ($)': vals[i] })),
        ),
    });

    // 100% stacked area — share of a whole, over time.
    cases.push({
        id: 'electricity-mix-area',
        chartType: 'Area Chart',
        title: 'World electricity generation by source, 1990–2020 (share)',
        blurb: 'Coal holds its share for thirty years while wind and solar appear from nothing.',
        source: 'IEA / Ember global electricity review (approx. shares)',
        license: 'Illustrative (figures re-keyed)',
        semantic_types: { Year: 'Year', Source: 'Category', 'Generation (TWh)': 'Quantity' },
        encodings: { x: 'Year', y: 'Generation (TWh)', color: 'Source' },
        chartProperties: { stackMode: 'normalize' },
        data: ([
            [1990, [4430, 1780, 2160, 2000, 10, 1580]],
            [2000, [5990, 2760, 2620, 2590, 80, 1310]],
            [2010, [8670, 4760, 3440, 2760, 380, 1520]],
            [2020, [9420, 6270, 4360, 2700, 2720, 1610]],
        ] as [number, number[]][]).flatMap(([Year, vals]) =>
            ['Coal', 'Gas', 'Hydro', 'Nuclear', 'Wind & solar', 'Other'].map((Source, i) => ({
                Year, Source, 'Generation (TWh)': vals[i],
            })),
        ),
    });

    // Choropleth — the one VL template the corpus never exercised.
    cases.push({
        id: 'state-unemployment',
        chartType: 'Choropleth',
        title: 'Unemployment rate by state, 2023 (%)',
        blurb: 'The only registered Vega-Lite template the gallery never used.',
        source: 'US Bureau of Labor Statistics, Local Area Unemployment Statistics (2023 annual)',
        license: 'US-gov (PD)',
        semantic_types: { State: 'State', 'Unemployment (%)': 'Quantity' },
        encodings: { id: 'State', color: 'Unemployment (%)' },
        data: STATE_UNEMPLOYMENT.map(([State, v]) => ({ State, 'Unemployment (%)': v })),
    });

    // Long-label horizontal bars — the label is longer than the bar it names.
    cases.push({
        id: 'causes-death',
        chartType: 'Bar Chart',
        title: 'Leading causes of death, United States, 2022',
        blurb: 'Every category name is a clinical phrase, and several are longer than the bar they label.',
        source: 'CDC / National Center for Health Statistics, leading causes of death (approx. 2022)',
        license: 'US-gov (PD); figures re-keyed',
        semantic_types: { Cause: 'Category', 'Deaths (thousands)': 'Quantity' },
        encodings: { y: 'Cause', x: 'Deaths (thousands)' },
        data: [
            ['Diseases of heart', 703],
            ['Malignant neoplasms', 608],
            ['Unintentional injuries', 227],
            ['Cerebrovascular diseases', 165],
            ['Chronic lower respiratory diseases', 148],
            ['Alzheimer disease', 120],
            ['Diabetes mellitus', 102],
            ['Nephritis, nephrotic syndrome and nephrosis', 58],
            ['Chronic liver disease and cirrhosis', 55],
            ['Intentional self-harm (suicide)', 49],
        ].map(([Cause, v]) => ({ Cause, 'Deaths (thousands)': v })),
    });

    // Fifty categories on one axis — past the point where a category axis can label itself.
    cases.push({
        id: 'state-jobless',
        chartType: 'Bar Chart',
        title: 'Unemployment rate by state, 2023 (%)',
        blurb: 'Fifty categories on a single axis, in source order, each needing a readable name.',
        source: 'US Bureau of Labor Statistics, Local Area Unemployment Statistics (2023 annual)',
        license: 'US-gov (PD)',
        semantic_types: { State: 'State', 'Unemployment (%)': 'Quantity' },
        encodings: { x: 'State', y: 'Unemployment (%)' },
        data: STATE_UNEMPLOYMENT.map(([State, v]) => ({ State, 'Unemployment (%)': v })),
    });

    // Dense small multiples — sixteen panels, past the point where each keeps an axis.
    cases.push({
        id: 'oecd-facet-16',
        chartType: 'Line Chart',
        title: 'Unemployment rate, sixteen OECD economies, 2000–2023 (%)',
        blurb: 'Sixteen panels: too many for every panel to carry its own axis, too few to give up on labels.',
        source: 'OECD Labour Force Statistics (harmonised unemployment rate, approx.)',
        license: 'Illustrative (figures re-keyed)',
        semantic_types: { Year: 'Year', Country: 'Country', 'Unemployment (%)': 'Quantity' },
        encodings: { x: 'Year', y: 'Unemployment (%)', column: 'Country' },
        data: ([
            ['Australia', [6.3, 4.4, 5.2, 6.1, 3.7]],
            ['Austria', [4.7, 4.9, 4.8, 5.7, 5.1]],
            ['Belgium', [6.9, 7.5, 8.3, 8.5, 5.5]],
            ['Canada', [6.8, 6.0, 8.0, 6.9, 5.4]],
            ['Denmark', [4.3, 3.8, 7.5, 6.2, 5.1]],
            ['Finland', [9.8, 6.9, 8.4, 9.4, 7.2]],
            ['France', [9.0, 8.0, 9.3, 10.4, 7.3]],
            ['Germany', [7.9, 8.7, 7.0, 4.6, 3.1]],
            ['Ireland', [4.2, 4.7, 13.9, 9.9, 4.3]],
            ['Italy', [10.1, 6.1, 8.4, 11.9, 7.7]],
            ['Japan', [4.7, 3.8, 5.1, 3.4, 2.6]],
            ['Netherlands', [3.1, 3.6, 5.0, 6.9, 3.6]],
            ['Norway', [3.2, 2.5, 3.6, 4.4, 3.6]],
            ['Spain', [13.9, 8.2, 19.9, 22.1, 12.2]],
            ['Sweden', [5.6, 6.1, 8.6, 7.4, 7.7]],
            ['United States', [4.0, 4.6, 9.6, 5.3, 3.6]],
        ] as [string, number[]][]).flatMap(([Country, vals]) =>
            [2000, 2007, 2010, 2015, 2023].map((Year, i) => ({
                Year, Country, 'Unemployment (%)': vals[i],
            })),
        ),
    });

    // Uncertainty drawn as geometry — a 95% interval that narrows as the record improves.
    cases.push({
        id: 'temp-uncertainty',
        chartType: 'Range Area Chart',
        title: 'Global mean temperature anomaly with its 95% interval, 1850–2023',
        blurb: 'The band is nine times wider in 1850 than in 2023 — the measurement record improving, drawn as geometry.',
        source: 'Met Office Hadley Centre / UEA CRU, HadCRUT5 global annual anomaly vs 1961–1990 (approx.)',
        license: 'Illustrative (figures re-keyed)',
        semantic_types: {
            Year: 'Year',
            'Lower (°C)': 'Quantity',
            'Upper (°C)': 'Quantity',
            'Anomaly (°C)': 'Quantity',
        },
        encodings: { x: 'Year', y: 'Lower (°C)', y2: 'Upper (°C)' },
        data: ([
            [1850, -0.42, -0.62, -0.22],
            [1870, -0.36, -0.53, -0.19],
            [1890, -0.42, -0.56, -0.28],
            [1910, -0.44, -0.55, -0.33],
            [1930, -0.16, -0.25, -0.07],
            [1950, -0.17, -0.24, -0.10],
            [1970, -0.08, -0.14, -0.02],
            [1990, 0.25, 0.20, 0.30],
            [2010, 0.56, 0.52, 0.60],
            [2023, 1.11, 1.07, 1.15],
        ] as [number, number, number, number][]).map(([Year, est, lo, hi]) => ({
            Year,
            'Anomaly (°C)': est,
            'Lower (°C)': lo,
            'Upper (°C)': hi,
        })),
    });

    return cases;
}

export const PREVIEW_CASES: PreviewCase[] = buildCases();
