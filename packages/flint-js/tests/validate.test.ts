// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
    VALIDATION_BACKENDS,
    assembleForBackend,
    stripPrivateKeys,
    validateChart,
    validateChartInput,
    validateSemanticTypes,
} from '../src/validate';
import type { ChartAssemblyInput } from '../src';

const barChart: ChartAssemblyInput = {
    data: {
        values: [
            { region: 'East', revenue: 120 },
            { region: 'West', revenue: 90 },
            { region: 'North', revenue: 150 },
        ],
    },
    semantic_types: { region: 'Region', revenue: 'Amount' },
    chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
    },
};

function withSpec(chart_spec: Partial<ChartAssemblyInput['chart_spec']>): ChartAssemblyInput {
    return { ...barChart, chart_spec: { ...barChart.chart_spec, ...chart_spec } };
}

describe('validateChart', () => {
    it.each(VALIDATION_BACKENDS)('accepts a valid bar chart for %s', (backend) => {
        const result = validateChart(barChart, backend);
        expect(result.backend).toBe(backend);
        expect(result.chartType).toBe('Bar Chart');
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('reports the computed layout size', () => {
        const result = validateChart(barChart, 'vegalite');
        expect(result.computedSize?.width).toBeGreaterThan(0);
        expect(result.computedSize?.height).toBeGreaterThan(0);
    });

    it('flags an unknown chart type as invalid without throwing', () => {
        const result = validateChart(withSpec({ chartType: 'Not A Real Chart' }), 'vegalite');
        expect(result.valid).toBe(false);
        expect(result.chartType).toBe('Not A Real Chart');
        expect(result.errors[0].code).toBe('assembly_failed');
        expect(result.errors[0].message).toMatch(/Unknown chart type/);
    });

    it('flags a nonexistent field', () => {
        const result = validateChart(
            withSpec({ encodings: { x: { field: 'missing' }, y: { field: 'revenue' } } }),
            'vegalite',
        );
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('"missing" does not exist in data.values');
    });

    it('flags an unsupported channel', () => {
        const result = validateChart(
            withSpec({
                encodings: { x: { field: 'region' }, y: { field: 'revenue' }, banana: { field: 'region' } },
            }),
            'echarts',
        );
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('encodings.banana is not supported by Bar Chart for echarts');
    });

    it('flags a canvas that exceeds the cap', () => {
        const result = validateChart(withSpec({ canvasSize: { width: 5000, height: 300 } }), 'vegalite');
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toContain('maximum dimension of 4000px');

        const relaxed = validateChart(withSpec({ canvasSize: { width: 5000, height: 300 } }), 'vegalite', {
            maxCanvasDim: 8000,
        });
        expect(relaxed.valid).toBe(true);
    });

    it('rejects malformed input without throwing', () => {
        for (const input of [null, undefined, 42, {}, { data: {} }, { data: { url: 'x.csv' } }]) {
            const result = validateChart(input as any, 'vegalite');
            expect(result.valid).toBe(false);
            expect(result.chartType).toBe('(unknown)');
            expect(result.errors).toHaveLength(1);
        }
    });

    it('surfaces unregistered semantic_types as warnings, not errors', () => {
        const result = validateChart(
            { ...barChart, semantic_types: { region: 'Region', revenue: 'Dollarz' } },
            'vegalite',
        );
        expect(result.valid).toBe(true);
        const warning = result.warnings.find((w) => w.code === 'unknown_semantic_type');
        expect(warning?.severity).toBe('warning');
        expect(warning?.field).toBe('revenue');
        expect(warning?.message).toContain('"Dollarz"');
    });
});

describe('validateChartInput', () => {
    it('throws on the first problem', () => {
        expect(() => validateChartInput(withSpec({ encodings: {} }), 'vegalite')).toThrow(
            /must bind at least one channel/,
        );
        expect(() =>
            validateChartInput({ ...barChart, data: { values: [] } }, 'vegalite'),
        ).toThrow(/at least one row/);
        expect(() =>
            validateChartInput(barChart, 'vegalite', { maxDataRows: 2 }),
        ).toThrow(/exceeding the limit of 2/);
    });

    it('requires x and y for cartesian templates', () => {
        expect(() =>
            validateChartInput(withSpec({ encodings: { x: { field: 'region' } } }), 'vegalite'),
        ).toThrow(/encodings\.y is required for Bar Chart/);
    });

    it('checks fields without a backend', () => {
        expect(() =>
            validateChartInput(withSpec({ encodings: { x: 'nope', y: 'revenue' } })),
        ).toThrow(/"nope" does not exist/);
        expect(() => validateChartInput(barChart)).not.toThrow();
    });
});

describe('validateSemanticTypes', () => {
    it('returns only unregistered labels', () => {
        expect(
            validateSemanticTypes({
                a: 'Amount',
                b: { semanticType: 'Percentage' },
                c: 'NotAType',
                d: { semanticType: '' },
            }),
        ).toMatchObject([
            { severity: 'warning', code: 'unknown_semantic_type', field: 'c' },
            { severity: 'warning', code: 'unknown_semantic_type', field: 'd' },
        ]);
        expect(validateSemanticTypes(undefined)).toEqual([]);
    });
});

describe('assembleForBackend', () => {
    it('splits Flint metadata out of the spec', () => {
        const { spec, warnings, width, height } = assembleForBackend('echarts', barChart);
        expect(Array.isArray(warnings)).toBe(true);
        expect(typeof width).toBe('number');
        expect(typeof height).toBe('number');
        expect(Object.keys(spec).some((k) => k.startsWith('_'))).toBe(true);
        stripPrivateKeys(spec);
        expect(Object.keys(spec).some((k) => k.startsWith('_'))).toBe(false);
    });

    it('rejects an unknown backend', () => {
        expect(() => assembleForBackend('excel' as any, barChart)).toThrow(/unknown backend/);
    });
});
