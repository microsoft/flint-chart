// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assemblePlotly, assembleVegaLite } from '../src';
import { THEME_PRESETS } from '../src/core/theme/presets';

const values = Array.from({ length: 25 }, (_, i) => ({
    Region: `Region ${i + 1}`,
    Sales: i + 1,
}));

const input = () => ({
    data: { values },
    semantic_types: { Region: 'Category', Sales: 'Quantity' },
    chart_spec: {
        chartType: 'Pie Chart',
        encodings: { color: 'Region', size: 'Sales' },
        baseSize: { width: 420, height: 360 },
    },
    theme_spec: THEME_PRESETS.nyt.spec,
} as never);

describe('high-cardinality pie overflow', () => {
    it('Plotly keeps the largest palette tier and sums the tail into Others', () => {
        const figure = assemblePlotly(input()) as any;
        const trace = figure.data[0];

        // NYT has 12 extended categorical inks: 12 named slices plus one
        // overflow slice replaces the original 25-way colour cycle.
        expect(trace.labels).toHaveLength(13);
        expect(trace.labels.slice(0, 3)).toEqual(['Region 25', 'Region 24', 'Region 23']);
        expect(trace.labels.at(-1)).toBe('Others (13)');
        expect(trace.values.at(-1)).toBe(91); // 1 + ... + 13
        expect(trace.marker.colors).toHaveLength(13);
        expect(trace.marker.colors.at(-1)).toBe('#9e9e9e');
        expect(figure._theme.report.some((entry: any) =>
            entry.path === 'ink.series.categorical'
            && entry.message.includes('Others (13)'))).toBe(true);
    });

    it('Vega-Lite exposes the same top-12 plus Others domain', () => {
        const spec = assembleVegaLite(input()) as any;
        expect(spec.encoding.color.field).toBe('__flintColorKey');
        expect(spec.encoding.color.scale.domain).toEqual([
            'Region 25', 'Region 24', 'Region 23', 'Region 22',
            'Region 21', 'Region 20', 'Region 19', 'Region 18',
            'Region 17', 'Region 16', 'Region 15', 'Region 14',
            'Others (13)',
        ]);
        expect(spec.transform.some((t: any) =>
            Array.isArray(t.aggregate)
            && t.groupby?.includes('__flintColorKey'))).toBe(true);
    });
});
