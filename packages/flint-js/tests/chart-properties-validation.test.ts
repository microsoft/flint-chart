// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleChartjs, assembleECharts, assembleExcel, assemblePlotly, assembleVegaLite } from '../src';

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

describe('array-valued options', () => {
    it('keeps a map centre that arrives as a fresh array, as from JSON', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ City: 'Paris', Lon: 2.35, Lat: 48.86 }, { City: 'Tokyo', Lon: 139.7, Lat: 35.7 }] },
            semantic_types: { City: 'City', Lon: 'Longitude', Lat: 'Latitude' },
            chart_spec: {
                chartType: 'Map', encodings: { longitude: 'Lon', latitude: 'Lat' },
                chartProperties: JSON.parse('{"region":"world","projection":"orthographic","projectionCenter":[10,50]}'),
            },
        } as any);
        expect(spec.layer[0].projection.rotate).toEqual([-10, -50, 0]);
        expect((spec._warnings ?? []).some((w: any) => w.code === 'invalid-option-value')).toBe(false);
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
        ['Excel', assembleExcel],
    ] as const;

    function unknownInputPaths(spec: any): string[] {
        return (spec._warnings ?? spec.warnings ?? [])
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

    for (const [backend, assembler] of assemblers.filter(([name]) => name !== 'Excel')) {
        it(`accepts pipeline and analysis properties in ${backend}`, () => {
            const spec = assembler({
                ...lineInput,
                chart_spec: {
                    ...lineInput.chart_spec,
                    chartProperties: {
                        labelOverflow: 'ellipsis', independentYAxis: false,
                        showTextLabels: false, showValueLabels: false,
                        logScale_x: false, logScale_y: false,
                        includeZero_x: false, includeZero_y: true,
                        xAxisType: 'nominal', yAxisType: 'quantitative',
                    },
                },
                options: { maxStretchX: 2, facetGapRow: 10, canvasFit: 'off' },
            } as any);
            expect(unknownInputPaths(spec)).toEqual([]);
        });
    }

    it.each([
        ['Map', { longitude: 'lon', latitude: 'lat' }, {
            baseMapUrl: 'land.geojson', levelField: 'level', levels: [{ value: 'province' }],
        }],
        ['Choropleth', { id: 'id', color: 'value' }, {
            baseMapUrl: 'land.geojson', featureKey: 'properties.code',
            levels: [{ value: 'province', url: 'regions.geojson' }],
        }],
    ])('accepts non-UI map properties on %s', (chartType, encodings, chartProperties) => {
        const spec = assembleVegaLite({
            data: { values: [{ lon: 120, lat: 30, id: 'A', value: 1, level: 'province' }] },
            semantic_types: { lon: 'Longitude', lat: 'Latitude', id: 'Category', value: 'Quantity' },
            chart_spec: { chartType, encodings, chartProperties },
        } as any);
        expect(unknownInputPaths(spec)).toEqual([]);
    });

    for (const [backend, assembler] of assemblers) {
        it(`accepts waterfall totals in ${backend}`, () => {
            const spec = assembler({
                ...lineInput,
                chart_spec: {
                    ...lineInput.chart_spec, chartType: 'Waterfall Chart', chartProperties: { totals: 'none' },
                },
                options: undefined,
            });
            expect(unknownInputPaths(spec)).toEqual([]);
        });
    }

    it.each([
        ['Histogram', { x: 'y' }, { binCount: 2 }],
        ['Funnel Chart', { y: 'x', size: 'y' }, { sort: 'ascending' }],
        ['Boxplot', { x: 'x', y: 'y' }, { whiskerMethod: 'iqr', showOutliers: false }],
        ['Donut Chart', { color: 'x', size: 'y' }, { innerRadius: 40 }],
    ])('accepts Excel-specific properties on %s', (chartType, encodings, chartProperties) => {
        const spec = assembleExcel({
            ...lineInput,
            chart_spec: { chartType, encodings, chartProperties },
            options: undefined,
        } as any);
        expect(unknownInputPaths(spec)).toEqual([]);
    });

    it('preserves native Excel warnings alongside unknown-key warnings', () => {
        const spec = assembleExcel({
            data: { values: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }, { x: 'C', y: 3 }] },
            semantic_types: { x: 'Category', y: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart', encodings: { x: 'x', y: 'y' },
                chartProperties: { filled: true, unknownKnob: true },
            },
            options: { unknownOption: true },
        } as any);
        expect(unknownInputPaths(spec)).toEqual(['chartProperties.unknownKnob', 'options.unknownOption']);
        expect(spec.warnings?.some(w => w.code === 'excel-radar-fill-unsupported')).toBe(true);
    });

    it('keeps template-specific keys scoped to their chart', () => {
        const spec = assembleVegaLite({
            ...lineInput,
            chart_spec: { ...lineInput.chart_spec, chartProperties: { baseMapUrl: 'land.geojson' } },
            options: undefined,
        });
        expect(unknownInputPaths(spec)).toEqual(['chartProperties.baseMapUrl']);
    });

    it.each([
        ['Vega-Lite', 'Boxplot', assembleVegaLite, { x: 'category', y: 'low', color: 'group' }, { nestedSnapThreshold: 0.5 }],
        ['ECharts', 'Boxplot', assembleECharts, { x: 'category', y: 'low', color: 'group' }, { nestedSnapThreshold: 0.5 }],
        ['ECharts', 'Regression', assembleECharts, { x: 'low', y: 'high' }, { opacity: 0.4 }],
        ['ECharts', 'Range Area Chart', assembleECharts, { x: 'category', y: 'low', y2: 'high' }, { opacity: 0.4 }],
        ['Chart.js', 'Range Area Chart', assembleChartjs, { x: 'category', y: 'low', y2: 'high' }, { opacity: 0.4 }],
        ['ECharts', 'Tree', assembleECharts, { color: 'category', size: 'low' }, { rootLabel: 'Root' }],
    ] as const)('accepts non-UI properties in %s %s', (_backend, chartType, assembler, encodings, chartProperties) => {
        const spec = assembler({
            data: { values: [
                { category: 'A', low: 1, high: 2, group: 'One' },
                { category: 'A', low: 2, high: 3, group: 'Two' },
                { category: 'B', low: 3, high: 4, group: 'One' },
            ] },
            semantic_types: { category: 'Category', low: 'Quantity', high: 'Quantity', group: 'Category' },
            chart_spec: { chartType, encodings, chartProperties },
        });
        expect(unknownInputPaths(spec)).toEqual([]);
    });

    it('still warns about a value format ignored by Stacked Bar', () => {
        const spec = assembleVegaLite({
            ...lineInput,
            chart_spec: { ...lineInput.chart_spec, chartType: 'Stacked Bar Chart', chartProperties: { valueFormat: '.2f' } },
            options: undefined,
        });
        expect(unknownInputPaths(spec)).toEqual(['chartProperties.valueFormat']);
    });

    it('accepts properties when a transform changes the effective chart template', () => {
        const spec = assembleVegaLite({
            data: { values: [{ x: 'A', y: 1, group: 'First' }, { x: 'A', y: 2, group: 'Second' }] },
            semantic_types: { x: 'Category', y: 'Quantity', group: 'Category' },
            chart_spec: {
                chartType: 'Grouped Bar Chart', encodings: { x: 'x', y: 'y', group: 'group' },
                chartProperties: { chartType: 'type:Stacked Bar Chart', stackMode: 'normalize', dodge: 'auto' },
            },
        });
        expect(unknownInputPaths(spec)).toEqual([]);
        expect(spec.encoding.y.stack).toBe('normalize');
    });

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
