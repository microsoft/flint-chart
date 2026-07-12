// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, assembleChartjs } from '../src';
import { EC_ROSE_LEGEND_BRIDGE_SERIES_NAME } from '../src/echarts/templates/rose';

/**
 * Rose Chart (Nightingale / Coxcomb) area-truth invariant across backends.
 *
 * A rose encodes each category's value as a wedge whose ANGLE is fixed and
 * whose RADIUS varies. The perceptually honest encoding maps value to wedge
 * AREA, which means radius must scale with sqrt(value). Vega-Lite achieves this
 * with `radius.scale.type = 'sqrt'`. ECharts and Chart.js have no sqrt radial
 * scale, so the compiler must emit sqrt(value) into the series data (keeping the
 * true value for the tooltip). These tests pin that all three backends render a
 * 4:1 value as a 2:1 radius (→ 4:1 area), not a 4:1 radius (→ 16:1 area).
 */

const simpleInput = () => ({
    data: { values: [{ key: 'A', n: 4 }, { key: 'B', n: 1 }] },
    semantic_types: { key: 'Category', n: 'Count' },
    chart_spec: {
        chartType: 'Rose Chart',
        encodings: { x: { field: 'key' }, y: { field: 'n' } },
    },
});

/** Read a data item's numeric radius value (items may be numbers or objects). */
const radiusOf = (item: any): number =>
    typeof item === 'object' && item != null ? Number(item.value) : Number(item);

describe('Vega-Lite Rose chart area-truth', () => {
    it('uses a sqrt radius scale', () => {
        const spec: any = assembleVegaLite(simpleInput());
        const enc = (spec.layer?.[0] ?? spec).encoding;
        expect(enc.radius.scale.type).toBe('sqrt');
    });
});

describe('ECharts Rose chart area-truth', () => {
    it('emits sqrt(value) radii so area is proportional to value', () => {
        const spec: any = assembleECharts(simpleInput());
        const polar = spec.series.find(
            (s: any) => s.type === 'bar' && s.coordinateSystem === 'polar',
        );
        const rA = radiusOf(polar.data[0]);
        const rB = radiusOf(polar.data[1]);
        // Radius ratio is sqrt(4/1) = 2, NOT the raw 4.
        expect(rA / rB).toBeCloseTo(2, 6);
        // Area ratio (radius²) matches the value ratio 4:1.
        expect((rA * rA) / (rB * rB)).toBeCloseTo(4, 6);
    });

    it('keeps the true value on each data item for the tooltip', () => {
        const spec: any = assembleECharts(simpleInput());
        const polar = spec.series.find(
            (s: any) => s.type === 'bar' && s.coordinateSystem === 'polar',
        );
        expect(polar.data[0]._rawValue).toBe(4);
        expect(polar.data[1]._rawValue).toBe(1);
        expect(typeof spec.tooltip.formatter).toBe('function');
        const shown = spec.tooltip.formatter({ data: polar.data[0], name: 'A', value: radiusOf(polar.data[0]) });
        expect(String(shown)).toContain('4');
    });

    it('does not show misleading sqrt-space radial tick labels', () => {
        const spec: any = assembleECharts(simpleInput());
        expect(spec.radiusAxis.axisLabel.show).toBe(false);
    });

    it('stacks segments so each segment area is proportional to its value', () => {
        // D1: S1=9, S2=16 → total 25. Outer edge must sit at sqrt(25)=5:
        //   S1 segment radius sqrt(9)=3, S2 increment sqrt(25)-sqrt(9)=2.
        const input = {
            data: {
                values: [
                    { dir: 'D1', season: 'S1', n: 9 },
                    { dir: 'D1', season: 'S2', n: 16 },
                    { dir: 'D2', season: 'S1', n: 1 },
                    { dir: 'D2', season: 'S2', n: 3 },
                ],
            },
            semantic_types: { dir: 'Category', season: 'Category', n: 'Count' },
            chart_spec: {
                chartType: 'Rose Chart',
                encodings: { x: { field: 'dir' }, y: { field: 'n' }, color: { field: 'season' } },
            },
        };
        const spec: any = assembleECharts(input);
        const stacks = spec.series.filter(
            (s: any) => s.type === 'bar' && s.stack === 'rose',
        );
        expect(stacks.length).toBe(2);
        // Sum of stacked increments for D1 (index 0) = sqrt(total) = 5.
        const outerD1 = stacks.reduce((acc: number, s: any) => acc + radiusOf(s.data[0]), 0);
        expect(outerD1).toBeCloseTo(Math.sqrt(25), 6);
        // Raw values preserved for the tooltip.
        expect(stacks[0].data[0]._rawValue).toBe(9);
        expect(stacks[1].data[0]._rawValue).toBe(16);
    });

    it('exports the legend bridge series name constant', () => {
        expect(EC_ROSE_LEGEND_BRIDGE_SERIES_NAME).toBe('__dfRoseLegendBridge__');
    });
});

describe('Chart.js Rose chart area-truth', () => {
    it('emits sqrt(value) radii so area is proportional to value', () => {
        const spec: any = assembleChartjs(simpleInput());
        const data = spec.data.datasets[0].data as number[];
        expect(data[0] / data[1]).toBeCloseTo(2, 6);
        expect((data[0] * data[0]) / (data[1] * data[1])).toBeCloseTo(4, 6);
    });

    it('reports the true value in the tooltip and hides sqrt-space ticks', () => {
        const spec: any = assembleChartjs(simpleInput());
        expect(spec.options.scales.r.ticks.display).toBe(false);
        const label = spec.options.plugins.tooltip.callbacks.label;
        expect(typeof label).toBe('function');
        expect(String(label({ dataIndex: 0, label: 'A', raw: spec.data.datasets[0].data[0] }))).toContain('4');
    });
});
