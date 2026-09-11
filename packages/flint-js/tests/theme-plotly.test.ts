// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assemblePlotly } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';
import { THEME_PRESETS } from '../src/core/theme/presets';

/**
 * The Plotly realizer writes the same backend-neutral `DesignDecisions` onto a
 * `{data, layout}` figure that the Vega-Lite one writes onto a spec. The cases
 * below are the ones the audit sweeps found by eye and that a rendered contact
 * sheet is a slow way to check twice.
 */

const theme = (extra: Partial<ThemeSpec> = {}): ThemeSpec => ({
    id: 'house',
    label: 'House',
    ink: {
        surface: { canvas: '#ffffff', plot: '#ffffff' },
        text: { primary: '#111111' },
        series: { single: '#cc0000', categorical: ['#cc0000', '#0044cc', '#118844'] },
    },
    ...extra,
} as ThemeSpec);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bullet(spec: ThemeSpec = theme()): any {
    return assemblePlotly({
        data: {
            values: [
                { Store: 'Newark', Revenue: 489, Goal: 540 },
                { Store: 'Dallas', Revenue: 707, Goal: 650 },
                { Store: 'Austin', Revenue: 845, Goal: 720 },
            ],
        },
        semantic_types: { Store: 'Category', Revenue: 'Amount', Goal: 'Amount' },
        chart_spec: {
            chartType: 'Bullet Chart',
            title: 'Revenue against target',
            encodings: { y: 'Store', x: 'Revenue', goal: 'Goal' },
            baseSize: { width: 480, height: 300 },
        },
        theme_spec: spec,
    } as any) as any;
}

function monthlyLine(spec: ThemeSpec, width = 480): any {
    return assemblePlotly({
        data: {
            values: months.map((m, i) => ({ Month: m, Revenue: 100 + i * 7 })),
        },
        semantic_types: { Month: 'Category', Revenue: 'Amount' },
        chart_spec: {
            chartType: 'Line Chart',
            title: 'Monthly revenue',
            encodings: { x: 'Month', y: 'Revenue' },
            baseSize: { width, height: 300 },
        },
        theme_spec: spec,
    } as any) as any;
}

function denseLine(spec: ThemeSpec, showPoints?: boolean): any {
    return assemblePlotly({
        data: {
            values: Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i / 8) })),
        },
        semantic_types: { x: 'Quantity', y: 'Quantity' },
        chart_spec: {
            chartType: 'Line Chart',
            encodings: { x: 'x', y: 'y' },
            baseSize: { width: 400, height: 300 },
            ...(showPoints == null ? {} : { chartProperties: { showPoints } }),
        },
        theme_spec: spec,
    } as any) as any;
}

const traceNamed = (fig: any, name: string) =>
    (fig.data ?? []).find((t: any) => t.name === name);

describe('semantic geometry survives house styling', () => {
    it('keeps sparklines free of theme-preferred dots', () => {
        const fig = assemblePlotly({
            data: {
                values: months.map((month, i) => ({ month, value: 100 + i })),
            },
            semantic_types: { month: 'Category', value: 'Quantity' },
            chart_spec: {
                chartType: 'Sparkline',
                encodings: { x: 'month', y: 'value' },
                baseSize: { width: 400, height: 120 },
            },
            theme_spec: THEME_PRESETS.pop.spec,
        } as any) as any;
        expect(fig.data
            .filter((trace: any) => trace.type === 'scatter')
            .every((trace: any) => !String(trace.mode).includes('markers')))
            .toBe(true);
    });

    it('suppresses dense theme-default line dots but preserves an explicit request', () => {
        const themedDefault = denseLine(THEME_PRESETS.nyt.spec);
        expect(String(themedDefault.data[0].mode)).not.toContain('markers');
        expect(themedDefault._theme.report.some((entry: any) => /too dense/.test(entry.message))).toBe(true);

        const explicit = denseLine(THEME_PRESETS.nyt.spec, true);
        expect(String(explicit.data[0].mode)).toContain('markers');
    });

    it('preserves an explicit request to hide points from a dot-preferring house', () => {
        const fig = denseLine(THEME_PRESETS.pop.spec, false);
        expect(String(fig.data[0].mode)).not.toContain('markers');
    });

    it('retains theme-default dots when line observations have enough room', () => {
        const fig = monthlyLine(THEME_PRESETS.nyt.spec);
        expect(String(fig.data[0].mode)).toContain('markers');
    });

    it('measures sparse categorical dots from observed positions rather than null placeholders', () => {
        const values = Array.from({ length: 100 }, (_, i) => ({
            category: `C${i}`,
            value: i,
            series: i % 10 === 0 ? 'Sparse' : 'Dense',
        }));
        const fig = assemblePlotly({
            data: { values },
            semantic_types: { category: 'Category', value: 'Quantity', series: 'Category' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'category', y: 'value', color: 'series' },
                baseSize: { width: 600, height: 300 },
            },
            theme_spec: THEME_PRESETS.nyt.spec,
        } as any) as any;
        expect(String(traceNamed(fig, 'Sparse').mode)).toContain('markers');
        expect(String(traceNamed(fig, 'Dense').mode)).not.toContain('markers');
    });

    it('does not count non-renderable x values toward line-dot density', () => {
        const values = [
            { x: 0, y: 1 },
            { x: 1, y: 2 },
            { x: 2, y: 3 },
            ...Array.from({ length: 13 }, (_, i) => ({ x: null, y: i + 4 })),
        ];
        const fig = assemblePlotly({
            data: { values },
            semantic_types: { x: 'Quantity', y: 'Quantity' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'x', y: 'y' },
                baseSize: { width: 400, height: 300 },
            },
            theme_spec: THEME_PRESETS.pop.spec,
        } as any) as any;
        expect(String(fig.data[0].mode)).toContain('markers');
    });

    it('keeps an ECDF stepped when the house prefers curved lines', () => {
        const fig = assemblePlotly({
            data: { values: [{ score: 1 }, { score: 2 }, { score: 3 }] },
            semantic_types: { score: 'Quantity' },
            chart_spec: {
                chartType: 'ECDF Plot',
                encodings: { x: 'score' },
                baseSize: { width: 400, height: 300 },
            },
            theme_spec: THEME_PRESETS.pop,
        } as any) as any;
        expect(['hv', 'vh', 'hvh']).toContain(fig.data[0].line.shape);
    });

    it('prints normalized stacked values as shares for every number format', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { category: 'A', series: 'One', value: 20 },
                    { category: 'A', series: 'Two', value: 80 },
                ],
            },
            semantic_types: { category: 'Category', series: 'Category', value: 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: 'category', y: 'value', color: 'series' },
                chartProperties: { stackMode: 'normalize' },
                baseSize: { width: 400, height: 300 },
            },
            theme_spec: theme({ dataLabels: { show: 'always', format: ',.0f' } } as any),
        } as any) as any;
        expect(fig.data[0].customdata).toEqual([20]);
        expect(fig.data[1].customdata).toEqual([80]);
        expect(JSON.stringify(fig.data[0].texttemplate)).toContain('customdata');
        expect(JSON.stringify(fig.data[0].texttemplate)).toContain('%');
    });

    it('matches Plotly algebraic normalization for mixed-sign stacks', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { category: 'A', series: 'Positive', value: 20 },
                    { category: 'A', series: 'Negative', value: -10 },
                    { category: 'B', series: 'Positive', value: 10 },
                    { category: 'B', series: 'Negative', value: -20 },
                ],
            },
            semantic_types: { category: 'Category', series: 'Category', value: 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: 'category', y: 'value', color: 'series' },
                chartProperties: { stackMode: 'normalize' },
                baseSize: { width: 400, height: 300 },
            },
            theme_spec: theme({ dataLabels: { show: 'always', format: '.0f' } } as any),
        } as any) as any;
        expect(fig.data[0].customdata).toEqual([200, 100]);
        expect(fig.data[1].customdata).toEqual([-100, -200]);
    });

    it('normalizes printed stack values within each facet', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { category: 'A', series: 'One', value: 20, panel: 'Left' },
                    { category: 'A', series: 'Two', value: 80, panel: 'Left' },
                    { category: 'A', series: 'One', value: 30, panel: 'Right' },
                    { category: 'A', series: 'Two', value: 70, panel: 'Right' },
                ],
            },
            semantic_types: {
                category: 'Category', series: 'Category', value: 'Quantity', panel: 'Category',
            },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: 'category', y: 'value', color: 'series', column: 'panel' },
                chartProperties: { stackMode: 'normalize' },
                baseSize: { width: 500, height: 300 },
            },
            theme_spec: theme({ dataLabels: { show: 'always', format: '.0f' } } as any),
        } as any) as any;
        expect(fig.data.map((trace: any) => trace.customdata)).toEqual([
            [20], [80], [30], [70],
        ]);
    });

    it('thins labels in the visible dense window and retains the full viewport domain', () => {
        const values = Array.from({ length: 100 }, (_v, i) => ({
            category: `Page ${i + 1}`,
            value: i + 1,
        }));
        const fig = assemblePlotly({
            data: { values },
            semantic_types: { category: 'Category', value: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'category', y: 'value' },
                baseSize: { width: 480, height: 300 },
            },
            theme_spec: theme(),
        } as any) as any;
        expect(fig.data[0].x).toHaveLength(90);
        expect(fig.layout.xaxis.tickvals.length).toBeLessThan(90);
        expect(fig._viewports).toMatchObject([{
            channel: 'x',
            visibleCount: 90,
            totalCount: 100,
        }]);
        expect(fig._viewports[0].orderedValues).toHaveLength(100);
    });

    it('factors color and dash into separate forecast legend dimensions', () => {
        const values = ['A', 'B', 'C'].flatMap((product, productIndex) => [
            { x: 1, y: 10 + productIndex, product, state: 'Actual' },
            { x: 2, y: 12 + productIndex, product, state: 'Actual' },
            { x: 2, y: 12 + productIndex, product, state: 'Forecast' },
            { x: 3, y: 15 + productIndex, product, state: 'Forecast' },
        ]);
        const fig = assemblePlotly({
            data: { values },
            semantic_types: { x: 'Quantity', y: 'Quantity', product: 'Category', state: 'Category' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'x', y: 'y', color: 'product', strokeDash: 'state' },
                baseSize: { width: 500, height: 300 },
            },
            theme_spec: theme({
                legend: { show: 'always', placement: ['seriesEnd', 'right'] },
            } as any),
        } as any) as any;
        const actual = fig.data.filter((trace: any) =>
            trace._colorLegendValue && trace._dashLegendValue);
        const proxies = fig.data.filter((trace: any) =>
            trace._themeRole === 'factored-line-legend-proxy');
        expect(actual).toHaveLength(6);
        expect(actual.every((trace: any) => trace.showlegend === false)).toBe(true);
        expect(proxies.map((trace: any) => trace.name)).toEqual([
            'A', 'B', 'C', 'Actual', 'Forecast',
        ]);
        expect(actual[0].line.color).toBe(actual[1].line.color);
        const annotations = JSON.stringify(fig.layout.annotations ?? []);
        expect(annotations).not.toContain('Actual');
        expect(annotations).not.toContain('Forecast');
    });

    it('places a factored series-end label at the furthest segment', () => {
        const values = [
            { x: 2, y: 12, product: 'A', state: 'Forecast' },
            { x: 3, y: 15, product: 'A', state: 'Forecast' },
            { x: 1, y: 10, product: 'A', state: 'Actual' },
            { x: 2, y: 12, product: 'A', state: 'Actual' },
            { x: 2, y: 20, product: 'B', state: 'Forecast' },
            { x: 3, y: 22, product: 'B', state: 'Forecast' },
            { x: 1, y: 18, product: 'B', state: 'Actual' },
            { x: 2, y: 20, product: 'B', state: 'Actual' },
            { x: 2, y: 30, product: 'C', state: 'Forecast' },
            { x: 3, y: 32, product: 'C', state: 'Forecast' },
            { x: 1, y: 28, product: 'C', state: 'Actual' },
            { x: 2, y: 30, product: 'C', state: 'Actual' },
        ];
        const fig = assemblePlotly({
            data: { values },
            semantic_types: { x: 'Quantity', y: 'Quantity', product: 'Category', state: 'Category' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'x', y: 'y', color: 'product', strokeDash: 'state' },
                baseSize: { width: 500, height: 300 },
            },
            theme_spec: theme({
                legend: { show: 'always', placement: ['seriesEnd', 'right'] },
            } as any),
        } as any) as any;
        expect(fig.layout.annotations.map((annotation: any) => annotation.x)).toEqual([3, 3, 3]);
    });
});

describe('furniture is not a series', () => {
    it('restates a bullet chart\'s context bands against the house surface', () => {
        const dark = bullet(theme({
            ink: {
                surface: { canvas: '#111111', plot: '#111111' },
                text: { primary: '#f4f4f4' },
                series: { single: '#4499ff', categorical: ['#4499ff'] },
            },
        } as any));
        const zone = traceNamed(dark, '__zone0');
        expect(zone).toBeTruthy();
        // The template's #e2e2e2 would be a light bar on a dark card.
        expect(String(zone.marker.color).toLowerCase()).not.toBe('#e2e2e2');
        expect(zone._role).toBe('context');
    });

    it('never paints a band or a target tick with the series ink', () => {
        const fig = bullet();
        const ink = String(traceNamed(fig, 'value').marker.color?.[0] ?? '').toLowerCase();
        for (const name of ['__zone0', '__zone1', '__zone2']) {
            expect(String(traceNamed(fig, name).marker.color).toLowerCase()).not.toBe(ink);
        }
        const target = traceNamed(fig, 'Target');
        expect(target._role).toBe('reference');
        expect(String(target.marker.line.color).toLowerCase()).toBe('#111111');
    });

    it('never prints NaN where a series is measured across the page', () => {
        const fig = bullet(theme({ dataLabels: { show: 'always' } } as any));
        for (const t of fig.data ?? []) {
            if (t.texttemplate == null) continue;
            expect(String(t.texttemplate)).not.toContain('%{y');
        }
    });
});

describe('a banded axis measured against the room it has', () => {
    it('keeps the template\'s turned labels where straight ones will not fit', () => {
        const narrow = monthlyLine(theme({ axes: { label: { angle: 0 } } } as any), 260);
        // Twelve month names across 260px cannot read straight.
        expect(narrow.layout.xaxis.tickangle).not.toBe(0);
        expect(
            narrow._theme.report.some((r: any) => /keeps its turned labels/.test(r.message)),
        ).toBe(true);
    });

    it('lets the house straighten them where there is room', () => {
        const wide = monthlyLine(theme({ axes: { label: { angle: 0 } } } as any), 1400);
        expect(wide.layout.xaxis.tickangle).toBe(0);
    });
});

describe('a polar plot is themed too', () => {
    it('holds its radial labels straight and gives them the house type', () => {
        const fig = assemblePlotly({
            data: {
                values: months.slice(0, 5).flatMap((m, i) => [
                    { Nutrient: m, Food: 'Oats', Grams: 10 + i },
                    { Nutrient: m, Food: 'Almonds', Grams: 20 - i },
                ]),
            },
            semantic_types: { Nutrient: 'Category', Food: 'Category', Grams: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart',
                title: 'Nutrition profile',
                encodings: { x: 'Nutrient', y: 'Grams', color: 'Food' },
                baseSize: { width: 380, height: 380 },
            },
            theme_spec: theme(),
        } as any) as any;
        const radial = fig.layout.polar?.radialaxis;
        expect(radial).toBeTruthy();
        expect(radial.tickangle).toBe(0);
        expect(fig.layout.polar.bgcolor).toBe('#ffffff');
    });
});

describe('the report says what was approximated', () => {
    it('records every realize decision under a path', () => {
        const fig = bullet();
        expect(Array.isArray(fig._theme?.report)).toBe(true);
        for (const entry of fig._theme.report) {
            expect(typeof entry.path).toBe('string');
            expect(entry.path.length).toBeGreaterThan(0);
        }
    });
});

describe('the figure is sized at what Plotly actually draws', () => {
    it('keeps the host sizing hint in step with the layout', () => {
        const fig = bullet();
        expect(fig._width).toBe(Math.ceil(fig.layout.width));
        expect(fig._height).toBe(Math.ceil(fig.layout.height));
        expect(Number.isInteger(fig._width)).toBe(true);
    });
});

describe('a sparse axis names the values it holds', () => {
    const olympics = (): any => assemblePlotly({
        data: {
            values: [2012, 2016, 2020, 2024].flatMap((Year, i) => [
                { Year, Nation: 'US', Rank: 1 },
                { Year, Nation: 'China', Rank: 2 + (i % 2) },
                { Year, Nation: 'Japan', Rank: 3 },
            ]),
        },
        semantic_types: { Year: 'Year', Nation: 'Category', Rank: 'Quantity' },
        chart_spec: {
            chartType: 'Bump Chart',
            title: 'Medal-table rank',
            encodings: { x: 'Year', y: 'Rank', color: 'Nation' },
            baseSize: { width: 520, height: 320 },
        },
        theme_spec: theme(),
    } as any) as any;

    it('pins the four games rather than letting Plotly invent 2025', () => {
        const fig = olympics();
        expect(fig.layout.xaxis.tickmode).toBe('array');
        expect(fig.layout.xaxis.tickvals).toHaveLength(4);
        expect(fig.layout.xaxis.tickvals.map((v: any) => new Date(v).getUTCFullYear()))
            .toEqual([2012, 2016, 2020, 2024]);
    });

    it('leaves a measure axis to its own round numbers', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { Year: 1995, Share: 1 }, { Year: 2000, Share: 7 },
                    { Year: 2005, Share: 16 }, { Year: 2010, Share: 29 },
                    { Year: 2015, Share: 43 }, { Year: 2018, Share: 51 },
                    { Year: 2023, Share: 67 },
                ],
            },
            semantic_types: { Year: 'Year', Share: 'Percentage' },
            chart_spec: {
                chartType: 'Area Chart',
                title: 'Share of the world online',
                encodings: { x: 'Year', y: 'Share' },
                baseSize: { width: 520, height: 320 },
            },
            theme_spec: theme(),
        } as any) as any;
        expect(fig.layout.yaxis.tickvals).toBeUndefined();
        // Uneven year steps must not print two labels on top of each other.
        const xs: number[] = fig.layout.xaxis.tickvals ?? [];
        expect(xs).not.toContain(2018);
    });
});

describe('a printed value carries its unit on the right side', () => {
    it('leads with a currency sign instead of trailing it', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { Group: 'Lowest', Item: 'Housing', Spend: 12800 },
                    { Group: 'Lowest', Item: 'Food', Spend: 4600 },
                    { Group: 'Highest', Item: 'Housing', Spend: 36600 },
                    { Group: 'Highest', Item: 'Food', Spend: 13400 },
                ],
            },
            semantic_types: { Group: 'Category', Item: 'Category', Spend: 'Currency' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                title: 'Where the money goes',
                encodings: { x: 'Group', y: 'Spend', color: 'Item' },
                baseSize: { width: 560, height: 360 },
            },
            theme_spec: theme({ annotation: { dataLabels: { show: 'all' } } } as any),
        } as any) as any;
        const templated = (fig.data as any[]).filter((t) => typeof t.texttemplate === 'string');
        for (const t of templated) {
            expect(t.texttemplate.endsWith('$')).toBe(false);
        }
    });
});

describe('a pie does not name every slice twice', () => {
    const pie = (labelType: string, themed: boolean): any => assemblePlotly({
        data: {
            values: [
                { Vendor: 'Mouse', Share: 25 },
                { Vendor: 'Keyboard', Share: 22 },
                { Vendor: 'Camera', Share: 20 },
                { Vendor: 'Tablet', Share: 18 },
                { Vendor: 'Phone', Share: 15 },
            ],
        },
        semantic_types: { Vendor: 'Category', Share: 'Quantity' },
        chart_spec: {
            chartType: 'Pie Chart',
            title: 'Share by vendor',
            encodings: { color: 'Vendor', size: 'Share' },
            chartProperties: { labelType },
            baseSize: { width: 420, height: 360 },
        },
        ...(themed ? { theme_spec: theme() } : {}),
    } as any) as any;

    it('omits the default legend when labels identify every slice', () => {
        expect(pie('categoryPercent', false).layout.showlegend).toBe(false);
        const themed = pie('categoryPercent', true);
        expect(themed.layout.showlegend).toBe(false);
        expect(themed._theme.report.some((entry: any) =>
            entry.path === 'legend.show' && entry.message.includes('already named'))).toBe(true);
    });

    it('keeps the legend when annotations contain only percentages', () => {
        expect(pie('percent', false).layout.showlegend).toBe(true);
        expect(pie('percent', true).layout.showlegend).toBe(true);
    });

    it('wraps only category-percentage pairs that exceed the inline budget', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { Vendor: 'Mouse', Share: 60 },
                    { Vendor: 'A substantially longer vendor', Share: 40 },
                ],
            },
            semantic_types: { Vendor: 'Category', Share: 'Quantity' },
            chart_spec: {
                chartType: 'Pie Chart',
                encodings: { color: 'Vendor', size: 'Share' },
                baseSize: { width: 420, height: 360 },
            },
            theme_spec: theme(),
        } as any) as any;

        expect(fig.data[0].texttemplate).toEqual([
            '%{label} %{percent}',
            '%{label}<br>%{percent}',
        ]);
    });
});

describe('high-cardinality point color stays truthful', () => {
    it('keeps every observation while collapsing only the overflow legend tail', () => {
        const values = Array.from({ length: 10 }, (_, i) => ({
            X: i,
            Y: i * 2,
            Group: `Group ${i + 1}`,
        }));
        const fig = assemblePlotly({
            data: { values },
            semantic_types: { X: 'Quantity', Y: 'Quantity', Group: 'Category' },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: 'X', y: 'Y', color: 'Group' },
                baseSize: { width: 420, height: 360 },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;

        const dataTraces = fig.data.filter((trace: any) =>
            trace._themeRole !== 'overflow-legend-proxy');
        expect(dataTraces).toHaveLength(10);
        expect(dataTraces.reduce((sum: number, trace: any) => sum + trace.x.length, 0)).toBe(10);
        const proxy = fig.data.find((trace: any) =>
            trace._themeRole === 'overflow-legend-proxy');
        expect(proxy.name).toBe('Others (4)');
        expect(dataTraces.filter((trace: any) => trace.showlegend !== false).length)
            .toBe(6);
    });
});

describe('role-based chart furniture stays legible', () => {
    it('uses three semantic waterfall keys instead of Plotly trace 0', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { Step: 'Start', Amount: 100, Type: 'start' },
                    { Step: 'Gain', Amount: 30, Type: 'increase' },
                    { Step: 'Loss', Amount: -20, Type: 'decrease' },
                    { Step: 'End', Amount: 110, Type: 'end' },
                ],
            },
            semantic_types: { Step: 'Category', Amount: 'Quantity', Type: 'Category' },
            chart_spec: {
                chartType: 'Waterfall Chart',
                encodings: { x: 'Step', y: 'Amount', color: 'Type' },
            },
            theme_spec: THEME_PRESETS.nyt.spec,
        } as any) as any;
        const names = fig.data.filter((trace: any) => trace.showlegend).map((trace: any) => trace.name);
        expect(names).toEqual(['Total', 'Increase', 'Decrease']);
        expect(fig.data[0].showlegend).toBe(false);
    });

    it('caps Pop area edges and radar fills without changing their data', () => {
        const area = assemblePlotly({
            data: {
                values: [
                    { Stage: 'A', Value: 10, Group: 'One' },
                    { Stage: 'B', Value: 12, Group: 'One' },
                    { Stage: 'A', Value: 8, Group: 'Two' },
                    { Stage: 'B', Value: 9, Group: 'Two' },
                ],
            },
            semantic_types: { Stage: 'Category', Value: 'Quantity', Group: 'Category' },
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: 'Stage', y: 'Value', color: 'Group' },
            },
            theme_spec: THEME_PRESETS.pop.spec,
        } as any) as any;
        expect(area.data.every((trace: any) => trace.line.width <= 1)).toBe(true);
        expect(area.data.every((trace: any) => trace.mode === 'lines')).toBe(true);

        const radar = assemblePlotly({
            data: {
                values: ['A', 'B', 'C'].flatMap((Metric, i) => [
                    { Metric, Team: 'One', Value: 5 + i },
                    { Metric, Team: 'Two', Value: 7 - i },
                ]),
            },
            semantic_types: { Metric: 'Category', Team: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart',
                encodings: { x: 'Metric', y: 'Value', color: 'Team' },
            },
            theme_spec: THEME_PRESETS.pop.spec,
        } as any) as any;
        expect(radar.data.every((trace: any) => trace.line.width <= 2.5)).toBe(true);
        expect(radar.data.every((trace: any) => /, 0\.16\)$/.test(trace.fillcolor))).toBe(true);
    });

    it('draws one positive scatter baseline instead of a domain plus zero rule', () => {
        const fig = assemblePlotly({
            data: {
                values: [
                    { X: 10, Y: 20 },
                    { X: 20, Y: 30 },
                ],
            },
            semantic_types: { X: 'Quantity', Y: 'Quantity' },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: 'X', y: 'Y' },
            },
            theme_spec: THEME_PRESETS.nyt.spec,
        } as any) as any;
        expect(fig.layout.xaxis.showline).toBe(true);
        expect(fig.layout.yaxis.zeroline).toBe(false);
    });
});

describe('a radar reads each spoke on its own scale', () => {
    it('normalises every metric and writes its ceiling into the label', () => {
        const rows = [
            { Nutrient: 'Carbs', Food: 'Oats', Grams: 66 },
            { Nutrient: 'Carbs', Food: 'Almonds', Grams: 22 },
            { Nutrient: 'Sugar', Food: 'Oats', Grams: 1 },
            { Nutrient: 'Sugar', Food: 'Almonds', Grams: 4 },
            { Nutrient: 'Fat', Food: 'Oats', Grams: 7 },
            { Nutrient: 'Fat', Food: 'Almonds', Grams: 50 },
        ];
        const fig = assemblePlotly({
            data: { values: rows },
            semantic_types: { Nutrient: 'Category', Food: 'Category', Grams: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart',
                title: 'Nutrition profile',
                encodings: { x: 'Nutrient', y: 'Grams', color: 'Food' },
                baseSize: { width: 420, height: 420 },
            },
            theme_spec: theme(),
        } as any) as any;
        expect(fig.layout.polar.radialaxis.range).toEqual([0, 1]);
        expect(fig.layout.polar.radialaxis.showticklabels).toBe(false);
        expect(fig.layout.polar.radialaxis.tickvals).toEqual([0.25, 0.5, 0.75, 1]);
        expect(fig.layout.polar.domain.y[1]).toBeGreaterThan(0.9);
        const trace = (fig.data as any[])[0];
        expect(trace.theta.some((t: string) => /\(\d/.test(t))).toBe(true);
        for (const r of trace.r) expect(r).toBeLessThanOrEqual(1);
    });

    describe('a rose uses polar guides rather than an axis through its wedges', () => {
        it('keeps quiet labelled rings and removes the radial ray and ticks', () => {
            const fig = assemblePlotly({
                data: {
                    values: months.map((Month, i) => ({ Month, Rainfall: 20 + i * 11 })),
                },
                semantic_types: { Month: 'Category', Rainfall: 'Quantity' },
                chart_spec: {
                    chartType: 'Rose Chart',
                    title: 'Rainfall by month',
                    encodings: { x: 'Month', y: 'Rainfall' },
                    baseSize: { width: 420, height: 360 },
                },
                theme_spec: theme(),
            } as any) as any;

            const radial = fig.layout.polar.radialaxis;
            const angular = fig.layout.polar.angularaxis;
            expect(radial.showgrid).toBe(true);
            expect(radial.gridwidth).toBeLessThanOrEqual(1);
            expect(radial.layer).toBe('below traces');
            expect(radial.showticklabels).toBe(false);
            expect(radial.showline).toBe(false);
            expect(radial.ticks).toBe('');
            expect(angular.showgrid).toBe(false);
            expect(angular.showline).toBe(false);
            expect(angular.ticks).toBe('');
            expect(fig._theme.report.some((entry: any) =>
                entry.path === 'structure.axis.polar')).toBe(true);
            const labels = fig.data.find((trace: any) =>
                trace._themeRole === 'rose-value-labels');
            expect(labels).toBeTruthy();
            expect(labels.text.length).toBeGreaterThan(0);
            expect(labels.text.length).toBeLessThan(months.length);
            expect(labels.text.at(-1)).toBe('141');
            expect(labels.r.at(-1)).toBeGreaterThan(141);
            expect(radial.range[1]).toBeGreaterThan(labels.r.at(-1));
        });

        it('materializes and themes an implicit default polar subplot', () => {
            const fig = assemblePlotly({
                data: {
                    values: [
                        { Direction: 'N', Speed: 20, Site: '2023' },
                        { Direction: 'E', Speed: 35, Site: '2023' },
                        { Direction: 'N', Speed: 25, Site: '2024' },
                        { Direction: 'E', Speed: 45, Site: '2024' },
                    ],
                },
                semantic_types: { Direction: 'Category', Speed: 'Quantity', Site: 'Category' },
                chart_spec: {
                    chartType: 'Rose Chart',
                    title: 'Wind by direction and site',
                    encodings: { x: 'Direction', y: 'Speed', column: 'Site' },
                    baseSize: { width: 420, height: 360 },
                },
                theme_spec: theme(),
            } as any) as any;

            expect(fig.layout.polar.radialaxis.showticklabels).toBe(false);
            expect(fig.layout.polar.radialaxis.layer).toBe('below traces');
            expect(fig.layout.polar.angularaxis.showgrid).toBe(false);
        });

        it('prints one summed total beyond each stacked rose tip', () => {
            const fig = assemblePlotly({
                data: {
                    values: [
                        { Direction: 'N', Season: 'Spring', Speed: 10 },
                        { Direction: 'N', Season: 'Winter', Speed: 15 },
                        { Direction: 'E', Season: 'Spring', Speed: 12 },
                        { Direction: 'E', Season: 'Winter', Speed: 18 },
                    ],
                },
                semantic_types: {
                    Direction: 'Category',
                    Season: 'Category',
                    Speed: 'Quantity',
                },
                chart_spec: {
                    chartType: 'Rose Chart',
                    encodings: { x: 'Direction', y: 'Speed', color: 'Season' },
                    baseSize: { width: 420, height: 360 },
                },
                theme_spec: theme(),
            } as any) as any;

            const labels = fig.data.find((trace: any) =>
                trace._themeRole === 'rose-value-labels');
            expect(labels.text).toEqual(['25', '30']);
            expect(labels.r[0]).toBeGreaterThan(25);
            expect(labels.r[1]).toBeGreaterThan(30);
        });
    });
});
