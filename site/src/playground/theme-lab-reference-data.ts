// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme lab — reference examples.
 *
 * Hand-authored Vega-Lite specs that recreate one or two *signature* charts
 * from each design house, as faithfully as a from-scratch spec can. These are
 * not produced by Flint's compiler; they are the target we tune the house
 * ThemeSpecs *towards*. Colours, fonts, gridline treatment, axis placement,
 * canvas aspect ratio and direct-labelling are all lifted from the house's own
 * published style (see `sourceNote` on each entry).
 *
 * Use: put a reference beside the same-family cell on the R2 grid and read off
 * the gap — aspect ratio, band step, label placement, ink — then push the
 * ThemeSpec to close it. The `principles` array records what each reference is
 * meant to teach.
 */

export type ReferenceHouse =
    | 'nyt'
    | 'economist'
    | 'nature'
    | 'mckinsey'
    | 'datawrapper'
    | 'powerbi';

export interface ReferenceCase {
    id: string;
    house: ReferenceHouse;
    houseLabel: string;
    title: string;
    /** Where the visual language comes from. */
    sourceNote: string;
    /** Design parameters this reference is meant to demonstrate/transfer. */
    principles: string[];
    /** A coloured marker strip drawn above the chart (e.g. Economist red tab). */
    tab?: string;
    /** Outer tile background, so a dark house reads correctly behind the chart. */
    tile?: string;
    width: number;
    height: number;
    spec: any;
}

export const REFERENCE_HOUSE_ORDER: ReferenceHouse[] = [
    'economist',
    'nyt',
    'nature',
    'mckinsey',
    'datawrapper',
    'powerbi',
];

export const REFERENCE_HOUSE_LABEL: Record<ReferenceHouse, string> = {
    economist: 'The Economist',
    nyt: 'New York Times',
    nature: 'Nature',
    mckinsey: 'McKinsey',
    datawrapper: 'Datawrapper',
    powerbi: 'Power BI',
};

// ---------------------------------------------------------------------------
// Shared tiny datasets
// ---------------------------------------------------------------------------

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

function series(name: string, vals: number[]) {
    return YEARS.map((year, i) => ({ year, series: name, value: vals[i] }));
}

// ---------------------------------------------------------------------------
// The Economist — time-series line, pale blue panel, red top tab, right y-axis
// ---------------------------------------------------------------------------

const economistLine: ReferenceCase = {
    id: 'economist-line',
    house: 'economist',
    houseLabel: REFERENCE_HOUSE_LABEL.economist,
    title: 'GDP per person',
    sourceNote:
        'economist.com Graphic detail + ggthemes theme_economist: panel #d5e4eb, white horizontal gridlines, y-axis on the right with no domain line, one red series for emphasis.',
    principles: [
        'Wide-short canvas ~1.6:1 (small multiples run ~290×207px).',
        'Panel fill #d5e4eb; gridlines are WHITE and horizontal-only; no y domain/ticks.',
        'y-axis sits on the RIGHT; x-axis keeps a black baseline.',
        'Red (#e3120b) reserved for the one series that matters; everything else muted blue.',
        'Bold sans headline flush-left over a red tab; deck in grey.',
    ],
    tab: '#e3120b',
    width: 380,
    height: 236,
    spec: {
        config: { view: { stroke: null } },
        background: '#d5e4eb',
        width: 320,
        height: 176,
        font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        title: {
            text: 'Pulling ahead',
            subtitle: 'GDP per person, $’000 at PPP',
            anchor: 'start',
            fontSize: 15,
            fontWeight: 700,
            color: '#121317',
            subtitleFontSize: 11,
            subtitleColor: '#54585a',
            offset: 12,
        },
        data: {
            values: [
                ...series('United States', [55, 57, 59, 62, 65, 63, 70, 76, 80]),
                ...series('Euro area', [39, 40, 41, 43, 45, 43, 47, 50, 52]),
            ],
        },
        encoding: {
            x: {
                field: 'year',
                type: 'ordinal',
                axis: {
                    labelAngle: 0,
                    domainColor: '#121317',
                    domainWidth: 1,
                    tickColor: '#121317',
                    grid: false,
                    labelColor: '#121317',
                    labelFontSize: 11,
                    title: null,
                    values: [2015, 2017, 2019, 2021, 2023],
                },
            },
            y: {
                field: 'value',
                type: 'quantitative',
                scale: { domain: [30, 85] },
                axis: {
                    orient: 'right',
                    grid: true,
                    gridColor: '#ffffff',
                    gridWidth: 1.4,
                    domain: false,
                    ticks: false,
                    labelColor: '#121317',
                    labelFontSize: 11,
                    title: null,
                    tickCount: 5,
                },
            },
            color: {
                field: 'series',
                type: 'nominal',
                scale: {
                    domain: ['United States', 'Euro area'],
                    range: ['#e3120b', '#006ba2'],
                },
                legend: null,
            },
        },
        layer: [
            { mark: { type: 'line', strokeWidth: 3, interpolate: 'monotone' } },
            {
                transform: [
                    { filter: 'datum.year === 2023' },
                ],
                mark: { type: 'text', align: 'right', dx: -4, dy: -8, fontSize: 11, fontWeight: 700 },
                encoding: { text: { field: 'series' } },
            },
        ],
    },
};

// ---------------------------------------------------------------------------
// New York Times — multi-line, direct end labels, muted ink, subtle grid
// ---------------------------------------------------------------------------

const nytLine: ReferenceCase = {
    id: 'nyt-line',
    house: 'nyt',
    houseLabel: REFERENCE_HOUSE_LABEL.nyt,
    title: 'Direct-labelled trend lines',
    sourceNote:
        'NYT graphics desk house style: near-square mobile-first canvas, no colour legend — series named at the line end, faint horizontal grid, serif deck over a sans body.',
    principles: [
        'Near-square canvas (~1.1:1) built mobile-first.',
        'No legend: label each line at its right end; reserve red for the lead series.',
        'Horizontal grid only, very light (#e4e4e4); drop the y domain + ticks.',
        'Extra right padding so the end labels have room to breathe.',
    ],
    width: 340,
    height: 320,
    spec: {
        config: { view: { stroke: null } },
        background: '#ffffff',
        width: 220,
        height: 232,
        padding: { right: 84, left: 4, top: 4, bottom: 4 },
        font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        title: {
            text: 'Streaming pulls even',
            subtitle: 'Share of viewing hours, %',
            anchor: 'start',
            fontSize: 16,
            fontWeight: 700,
            color: '#121212',
            font: 'Georgia, "Times New Roman", serif',
            subtitleFont: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            subtitleFontSize: 12,
            subtitleColor: '#6b6b6b',
            offset: 12,
        },
        data: {
            values: [
                ...series('Streaming', [12, 16, 20, 25, 29, 34, 38, 40, 41]),
                ...series('Cable', [42, 40, 38, 36, 34, 31, 28, 25, 23]),
                ...series('Broadcast', [30, 28, 26, 24, 22, 21, 20, 19, 18]),
            ],
        },
        encoding: {
            x: {
                field: 'year',
                type: 'quantitative',
                scale: { domain: [2015, 2023], nice: false },
                axis: {
                    format: 'd',
                    grid: false,
                    domainColor: '#c9c9c9',
                    tickColor: '#c9c9c9',
                    labelColor: '#6b6b6b',
                    labelFontSize: 11,
                    title: null,
                    values: [2015, 2019, 2023],
                },
            },
            y: {
                field: 'value',
                type: 'quantitative',
                scale: { domain: [0, 45] },
                axis: {
                    grid: true,
                    gridColor: '#e4e4e4',
                    domain: false,
                    ticks: false,
                    labelColor: '#6b6b6b',
                    labelFontSize: 11,
                    title: null,
                    tickCount: 4,
                },
            },
            color: {
                field: 'series',
                type: 'nominal',
                scale: {
                    domain: ['Streaming', 'Cable', 'Broadcast'],
                    range: ['#c2352b', '#2f6b9a', '#8a8a8a'],
                },
                legend: null,
            },
        },
        layer: [
            { mark: { type: 'line', strokeWidth: 2.5 } },
            {
                transform: [{ filter: 'datum.year === 2023' }],
                mark: { type: 'text', align: 'left', dx: 6, fontSize: 11, fontWeight: 700 },
                encoding: { text: { field: 'series' } },
            },
        ],
    },
};

// ---------------------------------------------------------------------------
// Nature — small grouped bars with error bars, black frame, panel label
// ---------------------------------------------------------------------------

const natureBars: ReferenceCase = {
    id: 'nature-grouped',
    house: 'nature',
    houseLabel: REFERENCE_HOUSE_LABEL.nature,
    title: 'Grouped bars with error bars',
    sourceNote:
        'Nature figure conventions: single-column (~89 mm) compact panel, 6–7pt Arial, thin black L+B frame, no grid, Okabe–Ito colourblind-safe palette, bold panel letter, s.e.m. whiskers.',
    principles: [
        'Small, dense single-column panel — do NOT inflate the canvas.',
        'Tiny type (labels 7pt); thin black axis frame on left + bottom, no gridlines.',
        'Colourblind-safe categorical palette (Okabe–Ito).',
        'Bold lowercase panel letter top-left; error bars on every bar.',
    ],
    tab: undefined,
    width: 260,
    height: 220,
    spec: {
        config: { view: { stroke: null } },
        background: '#ffffff',
        width: 190,
        height: 150,
        font: 'Arial, Helvetica, sans-serif',
        title: {
            text: 'a',
            anchor: 'start',
            fontSize: 15,
            fontWeight: 700,
            color: '#000000',
            offset: 6,
        },
        data: {
            values: [
                { group: 'WT', cond: 'Control', value: 3.1, se: 0.3 },
                { group: 'WT', cond: 'Treated', value: 5.4, se: 0.4 },
                { group: 'KO', cond: 'Control', value: 2.7, se: 0.25 },
                { group: 'KO', cond: 'Treated', value: 3.2, se: 0.35 },
            ],
        },
        encoding: {
            x: {
                field: 'group',
                type: 'nominal',
                axis: {
                    domainColor: '#000000',
                    domainWidth: 1,
                    tickColor: '#000000',
                    labelColor: '#000000',
                    labelFontSize: 8,
                    labelAngle: 0,
                    title: null,
                    grid: false,
                },
            },
            y: {
                field: 'value',
                type: 'quantitative',
                scale: { domain: [0, 6] },
                axis: {
                    domainColor: '#000000',
                    domainWidth: 1,
                    tickColor: '#000000',
                    grid: false,
                    labelColor: '#000000',
                    labelFontSize: 8,
                    title: 'mRNA (a.u.)',
                    titleColor: '#000000',
                    titleFontSize: 8,
                    titleFontWeight: 400,
                    tickCount: 4,
                },
            },
            xOffset: { field: 'cond' },
            color: {
                field: 'cond',
                type: 'nominal',
                scale: { domain: ['Control', 'Treated'], range: ['#0072b2', '#e69f00'] },
                legend: {
                    orient: 'top-right',
                    title: null,
                    labelFontSize: 8,
                    symbolSize: 40,
                    offset: 2,
                },
            },
        },
        layer: [
            { mark: { type: 'bar' } },
            {
                mark: { type: 'errorbar', ticks: true, color: '#000000' },
                encoding: {
                    y: { field: 'value', type: 'quantitative' },
                    yError: { field: 'se' },
                },
            },
        ],
    },
};

// ---------------------------------------------------------------------------
// McKinsey — column chart, navy bars, direct value labels, no y-axis
// ---------------------------------------------------------------------------

const mckinseyColumns: ReferenceCase = {
    id: 'mckinsey-columns',
    house: 'mckinsey',
    houseLabel: REFERENCE_HOUSE_LABEL.mckinsey,
    title: 'Value-labelled columns',
    sourceNote:
        'McKinsey exhibit style: landscape slide proportions, thick navy (#051c2c) bars, value printed on top of each bar, no y-axis and no gridlines, one bar picked out in the blue accent, action-title headline.',
    principles: [
        'Wide slide canvas (~1.5:1); thick bars with generous whitespace.',
        'No y-axis, no gridlines — the number lives on top of the bar.',
        'Deep navy default; single accent (#2251ff) to highlight one column.',
        'Left-aligned action title, small grey source line.',
    ],
    width: 420,
    height: 280,
    spec: {
        config: { view: { stroke: null } },
        background: '#ffffff',
        width: 360,
        height: 180,
        font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        title: {
            text: 'Digital revenue nearly doubled in three years',
            subtitle: 'Revenue, $bn',
            anchor: 'start',
            fontSize: 15,
            fontWeight: 700,
            color: '#051c2c',
            subtitleFontSize: 11,
            subtitleColor: '#5a6872',
            offset: 14,
        },
        data: {
            values: [
                { q: '2020', value: 4.2 },
                { q: '2021', value: 5.1 },
                { q: '2022', value: 6.4 },
                { q: '2023', value: 8.0 },
            ],
        },
        encoding: {
            x: {
                field: 'q',
                type: 'nominal',
                axis: {
                    domainColor: '#051c2c',
                    domainWidth: 1,
                    ticks: false,
                    labelColor: '#051c2c',
                    labelFontSize: 12,
                    labelPadding: 6,
                    labelAngle: 0,
                    title: null,
                    grid: false,
                },
            },
            y: {
                field: 'value',
                type: 'quantitative',
                axis: null,
            },
            color: {
                condition: { test: "datum.q === '2023'", value: '#2251ff' },
                value: '#051c2c',
            },
        },
        layer: [
            { mark: { type: 'bar', size: 46 } },
            {
                mark: { type: 'text', dy: -8, fontSize: 12, fontWeight: 700, color: '#051c2c' },
                encoding: { text: { field: 'value', format: '.1f' } },
            },
        ],
    },
};

// ---------------------------------------------------------------------------
// Datawrapper — horizontal bars, single blue, light grid, title/deck/source
// ---------------------------------------------------------------------------

const datawrapperBars: ReferenceCase = {
    id: 'datawrapper-bars',
    house: 'datawrapper',
    houseLabel: REFERENCE_HOUSE_LABEL.datawrapper,
    title: 'Ranked horizontal bars',
    sourceNote:
        'Datawrapper default theme: Roboto, single blue (#18a1cd), value axis with light #dcdcdc gridlines, bold #333 title over a grey deck, bars sorted, footer source line.',
    principles: [
        'Moderate landscape canvas (~1.25:1); bar height row-driven.',
        'Single brand blue #18a1cd; value gridlines light grey, category axis bare.',
        'Roboto/Arial; bold dark title, grey deck, small grey source footer.',
        'Bars sorted by value; direct value labels optional.',
    ],
    width: 380,
    height: 300,
    spec: {
        config: { view: { stroke: null } },
        background: '#ffffff',
        width: 210,
        height: 190,
        font: "Roboto, 'Helvetica Neue', Arial, sans-serif",
        title: {
            text: 'Where the visits came from',
            subtitle: 'Share of sessions, %',
            anchor: 'start',
            fontSize: 15,
            fontWeight: 700,
            color: '#333333',
            subtitleFontSize: 11,
            subtitleColor: '#666666',
            offset: 12,
        },
        data: {
            values: [
                { channel: 'Search', value: 41 },
                { channel: 'Direct', value: 27 },
                { channel: 'Social', value: 18 },
                { channel: 'Email', value: 9 },
                { channel: 'Referral', value: 5 },
            ],
        },
        encoding: {
            y: {
                field: 'channel',
                type: 'nominal',
                sort: '-x',
                axis: {
                    domain: false,
                    ticks: false,
                    labelColor: '#333333',
                    labelFontSize: 12,
                    title: null,
                    grid: false,
                },
            },
            x: {
                field: 'value',
                type: 'quantitative',
                axis: {
                    grid: true,
                    gridColor: '#dcdcdc',
                    domain: false,
                    ticks: false,
                    labelColor: '#666666',
                    labelFontSize: 10,
                    title: null,
                    tickCount: 4,
                },
            },
        },
        mark: { type: 'bar', color: '#18a1cd', height: 20 },
    },
};

// ---------------------------------------------------------------------------
// Power BI — dark dashboard tile, blue columns, light grid, Segoe UI
// ---------------------------------------------------------------------------

const powerbiColumns: ReferenceCase = {
    id: 'powerbi-columns',
    house: 'powerbi',
    houseLabel: REFERENCE_HOUSE_LABEL.powerbi,
    title: 'Dashboard tile columns',
    sourceNote:
        'Power BI default (dark) theme: 16:9 tile on a near-black canvas (#1b1a19), #118dff data colour, low-contrast #3b3a39 gridlines, Segoe UI, small tile title top-left.',
    principles: [
        'Wide 16:9 dashboard-tile canvas (~1.7:1).',
        'Dark panel #1b1a19; light text; single blue #118dff; faint grid #3b3a39.',
        'Segoe UI; compact tile title, no deck.',
    ],
    tile: '#1b1a19',
    width: 440,
    height: 260,
    spec: {
        config: { view: { stroke: null } },
        background: '#1b1a19',
        width: 380,
        height: 176,
        font: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        title: {
            text: 'Sales by region',
            anchor: 'start',
            fontSize: 14,
            fontWeight: 600,
            color: '#f3f2f1',
            offset: 10,
        },
        data: {
            values: [
                { region: 'North', value: 128 },
                { region: 'South', value: 94 },
                { region: 'East', value: 112 },
                { region: 'West', value: 76 },
                { region: 'Central', value: 88 },
            ],
        },
        encoding: {
            x: {
                field: 'region',
                type: 'nominal',
                axis: {
                    domainColor: '#3b3a39',
                    ticks: false,
                    labelColor: '#c8c6c4',
                    labelFontSize: 11,
                    title: null,
                    grid: false,
                    labelAngle: 0,
                },
            },
            y: {
                field: 'value',
                type: 'quantitative',
                axis: {
                    grid: true,
                    gridColor: '#3b3a39',
                    domain: false,
                    ticks: false,
                    labelColor: '#a19f9d',
                    labelFontSize: 10,
                    title: null,
                    tickCount: 4,
                },
            },
        },
        mark: { type: 'bar', color: '#118dff', size: 40 },
    },
};

export const REFERENCE_CASES: ReferenceCase[] = [
    economistLine,
    nytLine,
    natureBars,
    mckinseyColumns,
    datawrapperBars,
    powerbiColumns,
];
