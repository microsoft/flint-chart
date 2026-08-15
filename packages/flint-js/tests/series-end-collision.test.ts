// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';

const theme: ThemeSpec = {
    id: 'series-end-test',
    label: 'Series end test',
    ink: {
        surface: { canvas: '#fff', plot: '#fff' },
        text: { primary: '#111' },
        series: { single: '#333', categorical: ['#1261a0', '#d1495b', '#2a9d8f', '#725ac1'] },
    },
    legend: { show: 'always', placement: ['seriesEnd', 'right'] },
} as ThemeSpec;

function rows(endValues: number[], endYears?: number[]): any[] {
    return endValues.flatMap((endValue, seriesIndex) => {
        const endYear = endYears?.[seriesIndex] ?? 2020;
        return [1950, 1980, endYear].map((year, index) => ({
            year,
            series: `S${seriesIndex + 1}`,
            value: index === 2 ? endValue : 70 - seriesIndex * 4 - index * 5,
        }));
    });
}

function build(endValues: number[], endYears?: number[]): any {
    return assembleVegaLite({
        data: { values: rows(endValues, endYears) },
        semantic_types: { year: 'Year', series: 'Category', value: 'Quantity' },
        chart_spec: {
            chartType: 'Line Chart',
            encodings: { x: 'year', y: 'value', color: 'series' },
            baseSize: { width: 480, height: 300 },
        },
        theme_spec: theme,
    } as any) as any;
}

function layers(spec: any): any[] {
    const body = spec.layer ?? [];
    return Array.isArray(body) ? body : [];
}

function endLabel(spec: any): any | undefined {
    return layers(spec).find((layer) => {
        const mark = typeof layer.mark === 'string' ? layer.mark : layer.mark?.type;
        return mark === 'text' && ['series', '__seriesEndLabel'].includes(layer.encoding?.text?.field);
    });
}

function messages(spec: any): string {
    return (spec._theme?.report ?? [])
        .filter((entry: any) => entry.path === 'legend.placement')
        .map((entry: any) => entry.message)
        .join(' ');
}

describe('series-end collision policy', () => {
    it('keeps aligned, separated endpoints directly labelled', () => {
        const spec = build([20, 40, 60]);
        expect(endLabel(spec)?.encoding.y.field).toBe('value');
        expect(endLabel(spec)?.mark.fontSize).toBe(10);
        expect(messages(spec)).toContain('synthesized text layer');
    });

    it('slightly dodges close labels without adding connector ticks', () => {
        const spec = build([50, 52]);
        expect(endLabel(spec)?.encoding.y.field).toBe('__seriesEndLabelValue');
        expect(layers(spec).some((layer) => {
            const mark = typeof layer.mark === 'string' ? layer.mark : layer.mark?.type;
            return mark === 'rule' && layer.encoding?.y2?.field === '__seriesEndLabelValue';
        })).toBe(false);
        expect(messages(spec)).toMatch(/dodged by at most \d+px/);
    });

    it.each([
        { edge: 'top', values: [25, 48, 72] },
        { edge: 'bottom', values: [0, 25, 48] },
    ])('keeps a label on the $edge boundary anchored to its endpoint', ({ values }) => {
        const spec = build(values);
        expect(endLabel(spec)?.encoding.y.field).toBe('value');
        expect(messages(spec)).not.toContain('dodged by at most');
    });

    it('falls back as a set when dense labels need too much displacement', () => {
        const spec = build([50, 51, 52, 53]);
        expect(endLabel(spec)).toBeUndefined();
        expect(messages(spec)).toMatch(/more than one line of text/);
    });

    it('keeps staggered endpoints direct when their labels do not collide', () => {
        const spec = build([20, 45, 70], [2020, 2010, 2000]);
        expect(endLabel(spec)?.encoding.y.field).toBe('value');
        expect(messages(spec)).not.toContain('key is drawn');
    });

    it('falls back when staggered endpoint labels actually collide', () => {
        const spec = build([50, 52], [2020, 2000]);
        expect(endLabel(spec)).toBeUndefined();
        expect(messages(spec)).toMatch(/labels overlap.*cannot be dodged as one column/);
    });
});
