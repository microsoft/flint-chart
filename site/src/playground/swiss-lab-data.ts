// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Swiss / International Typographic Style — hand-authored Vega-Lite mockups.
 *
 * These are NOT produced by the theme pipeline. They are manual reference
 * specs, written to establish the look & feel of a future "swiss" ThemeSpec
 * preset so a human can eyeball the target before we ground it. The design
 * tokens they encode (and that the eventual preset must reproduce):
 *
 *   - Type:      Helvetica / Akzidenz-Grotesk, flush-left, bold title block.
 *   - Grid:      the modular grid is VISIBLE (unlike NYT, which hides it).
 *   - Palette:   ink black + warm paper + ONE saturated accent (signal red),
 *                with flat cobalt / mustard / green as extended categoricals.
 *   - Furniture: hard square corners, thick baseline/domain rules, no shadows,
 *                no rounding, generous structured margins.
 *   - Mood:      objective, high-contrast, systematic.
 *
 * Refs: swissted.com · Poster House "The Swiss Grid" · Müller-Brockmann
 * Tonhalle posters · Vignelli 1972 NYC Subway Map · Aicher 1972 Munich palette.
 */

// The case shape is shared with the other style references.
import type { StyleReferenceCase } from './style-references';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const INK = '#1a1a1a';
const PAPER = '#f4f1ea';
const GRID = '#d9d5cc';
const RED = '#e2231a';

/** Signal-red first, then flat cobalt / mustard / forest / slate. */
export const SWISS_PALETTE = [RED, INK, '#0067a5', '#f2b705', '#2a7f4f', '#6b6b6b'];

/** Shared config — the "system". Every spec spreads this so the grid, type
 *  and rules stay identical across chart types (that consistency IS the style). */
const swissConfig = {
    background: PAPER,
    font: FONT,
    padding: { left: 16, top: 14, right: 16, bottom: 14 },
    title: {
        anchor: 'start',
        font: FONT,
        fontSize: 16,
        fontWeight: 700,
        color: INK,
        subtitleFont: FONT,
        subtitleFontSize: 11.5,
        subtitleColor: '#666',
        subtitlePadding: 6,
        offset: 14,
    },
    view: { stroke: null },
    axis: {
        domain: true,
        domainColor: INK,
        domainWidth: 1.5,
        grid: true,
        gridColor: GRID,
        gridWidth: 1,
        tickColor: INK,
        tickWidth: 1.5,
        tickSize: 6,
        labelFont: FONT,
        labelFontSize: 11,
        labelColor: INK,
        labelPadding: 4,
        titleFont: FONT,
        titleFontSize: 11.5,
        titleFontWeight: 700,
        titleColor: INK,
    },
    legend: {
        orient: 'top',
        direction: 'horizontal',
        titleFont: FONT,
        titleColor: INK,
        titleFontSize: 11,
        titleFontWeight: 700,
        labelFont: FONT,
        labelFontSize: 11,
        labelColor: INK,
        symbolType: 'square',
        symbolSize: 90,
        offset: 6,
        padding: 0,
    },
};

const W = 360;
const H = 300;

export const SWISS_CASES: StyleReferenceCase[] = [
    // ── 1. Vertical bars — the archetypal Swiss chart. Flat red, value grid. ──
    {
        id: 'swiss-bar',
        title: 'Vertical bars',
        note: 'Single accent (signal red), visible value grid, flush-left bold title, hard corners.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Output by sector', subtitle: 'Index, 2024 (2015 = 100)' },
            data: {
                values: [
                    { sector: 'Manufacturing', value: 128 },
                    { sector: 'Services', value: 141 },
                    { sector: 'Construction', value: 96 },
                    { sector: 'Agriculture', value: 74 },
                    { sector: 'Energy', value: 112 },
                    { sector: 'Transport', value: 103 },
                ],
            },
            mark: { type: 'bar', color: RED, cornerRadius: 0 },
            encoding: {
                x: {
                    field: 'sector',
                    type: 'nominal',
                    sort: null,
                    axis: { labelAngle: 0, grid: false, title: null, labelFontSize: 10 },
                },
                y: {
                    field: 'value',
                    type: 'quantitative',
                    axis: { title: 'Index', tickCount: 5 },
                },
            },
            config: swissConfig,
        },
    },

    // ── 2. Multi-series line — straight linear segments, ink + red + cobalt. ──
    {
        id: 'swiss-line',
        title: 'Line series',
        note: 'Straight linear segments (no smoothing), thick strokes, square legend swatches on top.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Real wages by region', subtitle: 'Index, 2010–2024 (2010 = 100)' },
            data: {
                values: (() => {
                    const rows: any[] = [];
                    const series: Record<string, number[]> = {
                        North: [100, 103, 107, 111, 116, 121, 124, 129],
                        South: [100, 101, 99, 102, 105, 104, 108, 111],
                        West: [100, 98, 97, 100, 103, 109, 115, 122],
                    };
                    const years = [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024];
                    for (const [region, vals] of Object.entries(series))
                        vals.forEach((v, i) => rows.push({ region, year: years[i], value: v }));
                    return rows;
                })(),
            },
            mark: { type: 'line', strokeWidth: 3, interpolate: 'linear', point: false },
            encoding: {
                x: {
                    field: 'year',
                    type: 'quantitative',
                    axis: { format: 'd', title: null, tickCount: 4, grid: false },
                    scale: { nice: false },
                },
                y: { field: 'value', type: 'quantitative', axis: { title: 'Index' } },
                color: {
                    field: 'region',
                    type: 'nominal',
                    scale: { range: SWISS_PALETTE },
                    legend: { title: null },
                },
            },
            config: swissConfig,
        },
    },

    // ── 3. Grouped bars — categorical comparison, flat palette, hard modules. ──
    {
        id: 'swiss-grouped-bar',
        title: 'Grouped bars',
        note: 'Flat categorical palette, no gaps rounded, grouped columns read as a grid module.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Energy mix by country', subtitle: 'Share of generation, 2024 (%)' },
            data: {
                values: (() => {
                    const rows: any[] = [];
                    const data: Record<string, Record<string, number>> = {
                        Fossil: { CH: 2, DE: 42, FR: 8, IT: 55 },
                        Nuclear: { CH: 33, DE: 6, FR: 68, IT: 0 },
                        Renewable: { CH: 65, DE: 52, FR: 24, IT: 45 },
                    };
                    for (const [source, byC] of Object.entries(data))
                        for (const [country, v] of Object.entries(byC))
                            rows.push({ source, country, value: v });
                    return rows;
                })(),
            },
            mark: { type: 'bar', cornerRadius: 0 },
            encoding: {
                x: {
                    field: 'country',
                    type: 'nominal',
                    axis: { labelAngle: 0, grid: false, title: null },
                },
                xOffset: { field: 'source' },
                y: { field: 'value', type: 'quantitative', axis: { title: 'Share (%)' } },
                color: {
                    field: 'source',
                    type: 'nominal',
                    scale: { range: SWISS_PALETTE },
                    legend: { title: null },
                },
            },
            config: swissConfig,
        },
    },

    // ── 4. Scatter — geometric square marks on a full modular grid. ──
    {
        id: 'swiss-scatter',
        title: 'Scatter',
        note: 'Square marks (geometric), both axes gridded → the modular grid is the picture.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Density vs. rent', subtitle: '48 districts, 2024' },
            data: {
                values: (() => {
                    // Deterministic pseudo-random cloud with a mild positive trend.
                    const rows: any[] = [];
                    let s = 7;
                    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
                    for (let i = 0; i < 48; i++) {
                        const d = 20 + rnd() * 160;
                        rows.push({ density: d, rent: 8 + d * 0.09 + (rnd() - 0.5) * 9 });
                    }
                    return rows;
                })(),
            },
            mark: {
                type: 'point',
                shape: 'square',
                filled: true,
                size: 70,
                fill: RED,
                fillOpacity: 0.85,
                stroke: INK,
                strokeWidth: 0.6,
            },
            encoding: {
                x: {
                    field: 'density',
                    type: 'quantitative',
                    axis: { title: 'Density (per ha)' },
                    scale: { nice: true },
                },
                y: {
                    field: 'rent',
                    type: 'quantitative',
                    axis: { title: 'Rent (CHF/m²)' },
                    scale: { nice: true },
                },
            },
            config: swissConfig,
        },
    },

    // ── 5. Stacked area — two flat fills, ink + red, straight segments. ──
    {
        id: 'swiss-area',
        title: 'Stacked area',
        note: 'Flat solid fills (no gradients), straight segments, value grid over the stack.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Ridership by line', subtitle: 'Million trips per year' },
            data: {
                values: (() => {
                    const rows: any[] = [];
                    const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
                    const tram = [42, 44, 28, 33, 41, 46, 49];
                    const bus = [31, 32, 22, 25, 29, 33, 35];
                    years.forEach((y, i) => {
                        rows.push({ year: y, line: 'Tram', trips: tram[i] });
                        rows.push({ year: y, line: 'Bus', trips: bus[i] });
                    });
                    return rows;
                })(),
            },
            mark: { type: 'area', interpolate: 'linear', line: { strokeWidth: 1 } },
            encoding: {
                x: {
                    field: 'year',
                    type: 'quantitative',
                    axis: { format: 'd', title: null, tickCount: 4, grid: false },
                    scale: { nice: false },
                },
                y: {
                    field: 'trips',
                    type: 'quantitative',
                    stack: 'zero',
                    axis: { title: 'Trips (M)' },
                },
                color: {
                    field: 'line',
                    type: 'nominal',
                    scale: { range: SWISS_PALETTE },
                    legend: { title: null },
                },
            },
            config: swissConfig,
        },
    },

    // ── 6. Horizontal ranking — flush-left category labels, sorted, red bars. ──
    {
        id: 'swiss-hbar',
        title: 'Horizontal ranking',
        note: 'Flush-left category labels, sorted descending, single accent, value grid on x.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Cost of a coffee', subtitle: 'City average, CHF' },
            data: {
                values: [
                    { city: 'Zürich', value: 4.8 },
                    { city: 'Geneva', value: 4.6 },
                    { city: 'Copenhagen', value: 4.3 },
                    { city: 'Oslo', value: 4.1 },
                    { city: 'Stockholm', value: 3.7 },
                    { city: 'Vienna', value: 3.2 },
                    { city: 'Berlin', value: 3.0 },
                    { city: 'Lisbon', value: 1.9 },
                ],
            },
            mark: { type: 'bar', color: RED, cornerRadius: 0 },
            encoding: {
                y: {
                    field: 'city',
                    type: 'nominal',
                    sort: '-x',
                    axis: { title: null, grid: false, labelFontSize: 11, domain: false, ticks: false },
                },
                x: {
                    field: 'value',
                    type: 'quantitative',
                    axis: { title: 'CHF', tickCount: 5 },
                },
            },
            config: swissConfig,
        },
    },
];
