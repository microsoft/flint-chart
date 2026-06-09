// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
    normalizeStaticSeries,
    STATIC_SERIES_KEY_COLUMN,
    STATIC_SERIES_VALUE_COLUMN,
} from '../src/core/static-series';
import {
    assembleVegaLite,
    assembleECharts,
    assembleChartjs,
    assembleGoFish,
} from '../src';

// ---------------------------------------------------------------------------
// Test data (wide-format: one column per measure)
// ---------------------------------------------------------------------------

const WIDE_DATA = [
    { Month: '2018-07-01', 'Sales Amount': 2939690.99, 'Sales Due Date': 2304212.57 },
    { Month: '2018-08-01', 'Sales Amount': 3964801.20, 'Sales Due Date': 3636830.87 },
    { Month: '2018-09-01', 'Sales Amount': 3287605.93, 'Sales Due Date': 3707611.99 },
];

// ---------------------------------------------------------------------------
// normalizeStaticSeries — validation tests
// ---------------------------------------------------------------------------

describe('normalizeStaticSeries validation', () => {
    it('passes through when no array encodings are present', () => {
        const result = normalizeStaticSeries(
            { x: { field: 'Month' }, y: { field: 'Sales Amount' } },
            WIDE_DATA,
            {},
        );
        expect(result.staticSeries).toBeUndefined();
        expect(result.data).toBe(WIDE_DATA); // same reference
        expect(result.encodings.y).toEqual({ field: 'Sales Amount' });
    });

    it('rejects array encoding on non-measure channel', () => {
        expect(() => normalizeStaticSeries(
            { x: { field: 'Month' }, color: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }] },
            WIDE_DATA,
            {},
        )).toThrow(/only allowed on measure channels/);
    });

    it('rejects array encoding with fewer than 2 entries', () => {
        expect(() => normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }] },
            WIDE_DATA,
            {},
        )).toThrow(/at least 2 fields/);
    });

    it('rejects entry without a field', () => {
        expect(() => normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { aggregate: 'count' }] },
            WIDE_DATA,
            {},
        )).toThrow(/must have a "field" property/);
    });

    it('rejects duplicate fields', () => {
        expect(() => normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { field: 'Sales Amount' }] },
            WIDE_DATA,
            {},
        )).toThrow(/duplicate fields/);
    });

    it('rejects field not present in data', () => {
        expect(() => normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { field: 'NonExistent' }] },
            WIDE_DATA,
            {},
        )).toThrow(/not found in data columns/);
    });

    it('rejects explicitly nominal field', () => {
        expect(() => normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount', type: 'nominal' }, { field: 'Sales Due Date' }] },
            WIDE_DATA,
            {},
        )).toThrow(/only quantitative or temporal/);
    });

    it('rejects when color channel is already bound', () => {
        expect(() => normalizeStaticSeries(
            {
                x: { field: 'Month' },
                y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }],
                color: { field: 'SomeCategory' },
            },
            WIDE_DATA,
            {},
        )).toThrow(/color channel is already bound/);
    });

    it('allows color with scheme-only (no field)', () => {
        const result = normalizeStaticSeries(
            {
                x: { field: 'Month' },
                y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }],
                color: { scheme: 'tableau10' },
            },
            WIDE_DATA,
            {},
        );
        expect(result.staticSeries).toBeDefined();
        expect(result.encodings.color.scheme).toBe('tableau10');
    });

    it('rejects multiple array channels', () => {
        expect(() => normalizeStaticSeries(
            {
                x: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }],
                y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }],
            },
            WIDE_DATA,
            {},
        )).toThrow(/multiple channels/);
    });
});

// ---------------------------------------------------------------------------
// normalizeStaticSeries — fold/normalization tests
// ---------------------------------------------------------------------------

describe('normalizeStaticSeries fold', () => {
    it('folds data correctly', () => {
        const result = normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }] },
            WIDE_DATA,
            {},
        );

        // 3 rows × 2 fields = 6 folded rows
        expect(result.data.length).toBe(6);

        // Check first folded row
        const first = result.data[0];
        expect(first.Month).toBe('2018-07-01');
        expect(first[STATIC_SERIES_KEY_COLUMN]).toBe('Sales Amount');
        expect(first[STATIC_SERIES_VALUE_COLUMN]).toBe(2939690.99);

        // Original wide columns should not be in folded rows
        expect(first['Sales Amount']).toBeUndefined();
        expect(first['Sales Due Date']).toBeUndefined();
    });

    it('produces correct metadata', () => {
        const result = normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }] },
            WIDE_DATA,
            {},
        );

        expect(result.staticSeries).toEqual({
            channel: 'y',
            fields: ['Sales Amount', 'Sales Due Date'],
            keyColumn: STATIC_SERIES_KEY_COLUMN,
            valueColumn: STATIC_SERIES_VALUE_COLUMN,
        });
    });

    it('rewrites encodings with synthetic columns', () => {
        const result = normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }] },
            WIDE_DATA,
            {},
        );

        expect(result.encodings.x).toEqual({ field: 'Month' });
        expect(result.encodings.y).toEqual({ field: STATIC_SERIES_VALUE_COLUMN, type: 'quantitative' });
        expect(result.encodings.color).toEqual({ field: STATIC_SERIES_KEY_COLUMN, type: 'nominal' });
    });

    it('skips null values in fold', () => {
        const dataWithNull = [
            { Month: '2018-07-01', 'Sales Amount': 100, 'Sales Due Date': null },
            { Month: '2018-08-01', 'Sales Amount': 200, 'Sales Due Date': 300 },
        ];
        const result = normalizeStaticSeries(
            { x: { field: 'Month' }, y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }] },
            dataWithNull,
            {},
        );

        // First row has null for Sales Due Date → only 3 folded rows (not 4)
        expect(result.data.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// End-to-end: assembler integration tests
// ---------------------------------------------------------------------------

const STATIC_SERIES_INPUT = {
    data: { values: WIDE_DATA },
    semantic_types: { Month: 'Year', 'Sales Amount': 'Quantity', 'Sales Due Date': 'Quantity' },
    chart_spec: {
        chartType: 'Line Chart',
        encodings: {
            x: { field: 'Month' },
            y: [{ field: 'Sales Amount' }, { field: 'Sales Due Date' }],
        },
        canvasSize: { width: 600, height: 400 },
    },
} as const;

describe('static series end-to-end: Vega-Lite', () => {
    it('produces a valid spec with fold encoding', () => {
        const spec = assembleVegaLite(STATIC_SERIES_INPUT) as any;
        expect(spec).toBeDefined();
        // Should have color encoding derived from the synthetic key column
        const colorEnc = spec.encoding?.color;
        expect(colorEnc).toBeDefined();
        expect(colorEnc.field).toBe(STATIC_SERIES_KEY_COLUMN);
        expect(colorEnc.type).toBe('nominal');
    });

    it('Y encoding uses synthetic value column', () => {
        const spec = assembleVegaLite(STATIC_SERIES_INPUT) as any;
        const yEnc = spec.encoding?.y;
        expect(yEnc).toBeDefined();
        expect(yEnc.field).toBe(STATIC_SERIES_VALUE_COLUMN);
        expect(yEnc.type).toBe('quantitative');
    });

    it('data contains folded rows', () => {
        const spec = assembleVegaLite(STATIC_SERIES_INPUT) as any;
        const data = spec.data?.values;
        expect(data).toBeDefined();
        expect(data.length).toBe(6); // 3 rows × 2 series
        expect(data[0][STATIC_SERIES_KEY_COLUMN]).toBeDefined();
    });
});

describe('static series end-to-end: ECharts', () => {
    it('produces multi-series ECharts option', () => {
        const option = assembleECharts(STATIC_SERIES_INPUT) as any;
        expect(option).toBeDefined();
        // ECharts should produce 2 series (one per static series field)
        expect(option.series).toBeDefined();
        expect(option.series.length).toBe(2);
    });

    it('series names match field names', () => {
        const option = assembleECharts(STATIC_SERIES_INPUT) as any;
        const seriesNames = option.series.map((s: any) => s.name);
        expect(seriesNames).toContain('Sales Amount');
        expect(seriesNames).toContain('Sales Due Date');
    });
});

describe('static series end-to-end: Chart.js', () => {
    it('produces multi-dataset config', () => {
        const config = assembleChartjs(STATIC_SERIES_INPUT) as any;
        expect(config).toBeDefined();
        // Chart.js should have 2 datasets
        expect(config.data?.datasets?.length).toBe(2);
    });
});

describe('static series end-to-end: GoFish', () => {
    it('produces a GoFish spec without errors', () => {
        const spec = assembleGoFish(STATIC_SERIES_INPUT) as any;
        expect(spec).toBeDefined();
        expect(spec._gofish).toBeDefined();
    });
});
