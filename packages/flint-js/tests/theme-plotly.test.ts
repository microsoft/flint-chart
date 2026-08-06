// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assemblePlotly } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';

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

const traceNamed = (fig: any, name: string) =>
    (fig.data ?? []).find((t: any) => t.name === name);

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
