// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
    assembleChartjs,
    assembleECharts,
    assemblePlotly,
    assembleVegaLite,
} from '../src';

const BASE = {
    data: {
        values: [
            { flops: 1.2e20, loss: 2.81 },
            { flops: 7.0e20, loss: 2.42 },
            { flops: 2.8e21, loss: 2.34 },
            { flops: 5.4e21, loss: 2.11 },
        ],
    },
    semantic_types: { flops: 'Quantity', loss: 'Quantity' },
};

function assemble(chartProperties: Record<string, any>): any {
    return assembleVegaLite({
        ...BASE,
        chart_spec: {
            chartType: 'Regression',
            encodings: { x: { field: 'flops' }, y: { field: 'loss' } },
            chartProperties,
        },
    });
}

/** Pull the regression transform out of the assembled layered spec. */
function regressionTransform(spec: any): any {
    const layer = spec.layer.find((l: any) =>
        (l.transform ?? []).some((t: any) => 'regression' in t),
    );
    return layer.transform.find((t: any) => 'regression' in t);
}

describe('Regression — discrete property value validation', () => {
    it('passes a valid accepted value through unchanged', () => {
        const spec = assemble({ regressionMethod: 'log' });
        expect(regressionTransform(spec).method).toBe('log');
        expect(spec._warnings).toBeUndefined();
    });

    it('coerces a known display label to its accepted value', () => {
        const spec = assemble({ regressionMethod: 'Logarithmic' });
        // The invalid label must not reach the backend transform verbatim.
        expect(regressionTransform(spec).method).toBe('log');
        const warn = (spec._warnings ?? []).find(
            (w: any) => w.code === 'coerced-option-label',
        );
        expect(warn).toBeDefined();
        expect(warn.severity).toBe('info');
    });

    it('is case-insensitive when matching a label', () => {
        const spec = assemble({ regressionMethod: 'EXPONENTIAL' });
        expect(regressionTransform(spec).method).toBe('exp');
    });

    it('drops an unrecognized value and warns instead of emitting it', () => {
        const spec = assemble({ regressionMethod: 'Nonsense' });
        // Falls back to the default (linear) → no `method` on the transform.
        expect(regressionTransform(spec).method).toBeUndefined();
        const warn = (spec._warnings ?? []).find(
            (w: any) => w.code === 'invalid-option-value',
        );
        expect(warn).toBeDefined();
        expect(warn.severity).toBe('warning');
    });

    it('leaves a valid default value without warnings', () => {
        const spec = assemble({ regressionMethod: 'linear' });
        expect(regressionTransform(spec).method).toBeUndefined();
        expect(spec._warnings).toBeUndefined();
    });
});

describe('Unknown input key validation', () => {
    const lineInput: any = {
        data: {
            values: [
                { x: 'A', y: 1 },
                { x: 'B', y: 2 },
            ],
        },
        semantic_types: { x: 'Category', y: 'Quantity' },
        chart_spec: {
            chartType: 'Line Chart',
            encodings: { x: { field: 'x' }, y: { field: 'y' } },
            chartProperties: {
                lineWidth: 5,
                pointSize: 12,
                totallyFakeKnob: true,
            },
        },
        options: {
            fontSize: 18,
            bogusOption: 'xyz',
        },
    };

    const assemblers = [
        ['Vega-Lite', assembleVegaLite],
        ['ECharts', assembleECharts],
        ['Chart.js', assembleChartjs],
        ['Plotly', assemblePlotly],
    ] as const;

    function unknownInputPaths(spec: any): string[] {
        return (spec._warnings ?? [])
            .filter(
                (warning: any) =>
                    warning.code === 'unknown-chart-property' ||
                    warning.code === 'unknown-assemble-option',
            )
            .map((warning: any) => warning.message.split(':', 1)[0]);
    }

    for (const [backend, assembler] of assemblers) {
        it(`warns about unknown chartProperties and options in ${backend}`, () => {
            const spec = assembler(lineInput);

            expect(unknownInputPaths(spec)).toEqual([
                'chartProperties.lineWidth',
                'chartProperties.pointSize',
                'chartProperties.totallyFakeKnob',
                'options.fontSize',
                'options.bogusOption',
            ]);
        });
    }

    it('accepts template, encoding-action, transform, layout, and assembler keys', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { category: 'A', value: 1 },
                    { category: 'B', value: 2 },
                ],
            },
            semantic_types: { category: 'Category', value: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: {
                    x: { field: 'category' },
                    y: { field: 'value' },
                },
                chartProperties: {
                    cornerRadius: 2,
                    sort: 'value-desc',
                    chartType: 'Bar Chart',
                    arrange: 'identity',
                    pivot: 'identity',
                    facetColumns: 2,
                },
            },
            options: {
                addTooltips: true,
                baseLabelFontSize: 12,
                targetBandAR: 10,
            },
        });

        expect(unknownInputPaths(spec)).toEqual([]);
    });

    it('accepts template-specific chartProperties that are not UI controls', () => {
        const parallel = assembleECharts({
            data: {
                values: [
                    { group: 'A', speed: 10, weight: 100 },
                    { group: 'B', speed: 20, weight: 200 },
                ],
            },
            semantic_types: {
                group: 'Category',
                speed: 'Quantity',
                weight: 'Quantity',
            },
            chart_spec: {
                chartType: 'Parallel Coordinates',
                encodings: { color: { field: 'group' } },
                chartProperties: {
                    dimensions: ['weight', 'speed'],
                },
            },
        });
        const combo = assembleChartjs({
            data: {
                values: [
                    { month: 'Jan', revenue: 100, growth: 10 },
                    { month: 'Feb', revenue: 120, growth: 20 },
                ],
            },
            semantic_types: {
                month: 'Category',
                revenue: 'Quantity',
                growth: 'Quantity',
            },
            chart_spec: {
                chartType: 'Combo Chart',
                encodings: {
                    x: { field: 'month' },
                    y: { field: 'revenue' },
                },
                chartProperties: {
                    lineField: 'growth',
                },
            },
        });

        for (const spec of [parallel, combo]) {
            expect(unknownInputPaths(spec)).toEqual([]);
        }
    });
});
