// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { roundSample, sizeKeySwatches } from '../src/core/legend-plan';
import { exactPattern } from '../src/core/sample-format';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { assembleECharts } from '../src/echarts/assemble';
import { assemblePlotly } from '../src/plotly/assemble';

/**
 * A size key lists round values, as many as the edge it stands on has room for — three on a small
 * tile, five on a large chart — each symbol clearly larger than the last.
 */

const rows = (max: number) => Array.from({ length: 12 }, (_, i) => ({ v: 3 + (max - 3) * (i / 11) }));

describe('how many entries a size key lists', () => {
    it('one for every 80px of its edge, from three to five', () => {
        expect(sizeKeySwatches('right', { width: 400, height: 180 })).toBe(3);
        expect(sizeKeySwatches('right', { width: 400, height: 320 })).toBe(4);
        expect(sizeKeySwatches('right', { width: 400, height: 600 })).toBe(5);
        // Above or below, the plot's width is its run.
        expect(sizeKeySwatches('top', { width: 400, height: 180 })).toBe(5);
    });
});

describe('the values a size key lists', () => {
    it('are round — one, two, two and a half or five of a power of ten', () => {
        for (const count of [3, 4, 5]) {
            for (const value of roundSample(rows(1350), 'v', count)!) {
                const mantissa = value / 10 ** Math.floor(Math.log10(value));
                expect([1, 2, 2.5, 5]).toContain(Number(mantissa.toFixed(6)));
            }
        }
    });

    it('take as many as asked where the values hold them apart, the largest near the data’s largest', () => {
        expect(roundSample(rows(1350), 'v', 3)).toEqual([200, 500, 1000]);
        expect(roundSample(rows(1350), 'v', 4)).toEqual([100, 250, 500, 1000]);
        expect(roundSample(rows(1350), 'v', 5)).toHaveLength(5);
    });

    it('keep each symbol clearly larger than the last', () => {
        const values = roundSample(rows(1350), 'v', 5)!;
        for (let i = 1; i < values.length; i++) expect(Math.sqrt(values[i]) - Math.sqrt(values[i - 1])).toBeGreaterThan(Math.sqrt(1350) * 0.1);
    });

    it('never list zero', () => {
        expect(roundSample([{ v: 0 }, { v: 40 }, { v: 90 }], 'v', 5)!.every((v) => v > 0)).toBe(true);
    });
});

describe('a size key without a theme', () => {
    it('lists the planned round values rather than every tick of the scale', () => {
        const spec: any = assembleVegaLite({
            data: { values: rows(1350).map((row, i) => ({ ...row, x: i, y: i * 2 })) },
            semantic_types: { x: 'Quantity', y: 'Quantity', v: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y', size: 'v' }, baseSize: { width: 300, height: 300 } },
        } as any);
        const values = spec.encoding?.size?.legend?.values ?? spec.layer?.find((layer: any) => layer.encoding?.size)?.encoding.size.legend?.values;
        expect(values).toBeDefined();
        expect(values.length).toBeGreaterThanOrEqual(3);
        expect(values.length).toBeLessThanOrEqual(5);
        expect(values).not.toContain(0);
    });
});

/** The labels a Vega-Lite spec's legend draws, title last. */
async function legendLabels(spec: any): Promise<string[]> {
    const svg = await new View(parse(compile(spec).spec), { renderer: 'none' }).toSVG();
    return [...svg.slice(svg.indexOf('role-legend')).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

const sizedBy = (scale: number, v: any = 'Quantity') => ({
    data: { values: [3.74, 3.29, 2.26, 1.59, 1.12, 0.11].map((n, i) => ({ x: i, y: i * 2, lon: -100 + i * 5, lat: 35 + i, v: +(n * scale).toPrecision(4) })) },
    semantic_types: { x: 'Quantity', y: 'Quantity', lon: 'Longitude', lat: 'Latitude', v },
});
const scatter = { chartType: 'Scatter Plot', encodings: { x: { field: 'x' }, y: { field: 'y' }, size: { field: 'v' } }, canvasSize: { width: 400, height: 300 } };

describe('the labels a size key prints', () => {
    it('print each sampled value as it is, not rounded to the scale’s ticks', async () => {
        for (const [scale, expected] of [
            [1, ['0.5', '1', '2.5']],
            [0.3, ['0.2', '0.5', '1']],
            [0.01, ['0.005', '0.01', '0.025']],
            [10, ['5', '10', '25']],
            [1000, ['500', '1,000', '2,500']],
        ] as const) {
            const spec: any = assembleVegaLite({ ...sizedBy(scale), chart_spec: scatter } as any);
            expect(spec.encoding.size.legend.values.length).toBe(expected.length);
            expect((await legendLabels(spec)).slice(0, -1)).toEqual(expected);
        }
    });

    it('do so on a map’s bubbles too', async () => {
        const spec: any = assembleVegaLite({ ...sizedBy(1), chart_spec: {
            chartType: 'Map', encodings: { longitude: { field: 'lon' }, latitude: { field: 'lat' }, size: { field: 'v' } }, canvasSize: { width: 500, height: 400 },
        } } as any);
        expect((await legendLabels(spec)).slice(0, -1)).toEqual(['0.2', '0.5', '1', '2.5']);
    });

    it('keep the field’s own format — a share, a currency — at the precision the samples need', async () => {
        const share: any = assembleVegaLite({ ...sizedBy(0.01, { semanticType: 'Percentage', intrinsicDomain: [0, 1] }), chart_spec: scatter } as any);
        expect((await legendLabels(share)).slice(0, -1)).toEqual(['0.5%', '1%', '2.5%']);
        const money: any = assembleVegaLite({ ...sizedBy(1, { semanticType: 'Amount', unit: 'USD' }), chart_spec: scatter } as any);
        expect((await legendLabels(money)).slice(0, -1)).toEqual(['$0.5', '$1', '$2.5']);
    });

    it('raise a format’s precision only where it would round a value away', () => {
        expect(exactPattern([0.5, 1, 2.5])).toBe(',.1~f');
        expect(exactPattern([500, 1000, 2500])).toBe(',.0~f');
        expect(exactPattern([0.0005, 0.001, 0.0025])).toBe(',.4~f');
        expect(exactPattern([0.5, 1, 2.5], ',d')).toBe(',.1~f');
        expect(exactPattern([5, 10, 25], ',d')).toBe(',d');
        expect(exactPattern([0.005, 0.01, 0.025], '.0~%')).toBe('.1~%');
        expect(exactPattern([0.05, 0.1, 0.25], '.0~%')).toBe('.0~%');
        expect(exactPattern([0.5, 1, 2.5], ',.2f')).toBe(',.2f');
        expect(exactPattern([0.005, 0.01, 0.025], ',.2f')).toBe(',.3~f');
        expect(exactPattern([2500, 5000], '.1~s')).toBe('.2~s');
        expect(exactPattern([2500, 5000], '~s')).toBe('~s');
    });

    it('print exactly in Plotly’s key and ECharts’ size map, however small the values', () => {
        const input = (scale: number): any => ({
            data: { values: Array.from({ length: 20 }, (_, i) => ({ x: i, y: i * 2, v: +((0.11 + 3.63 * i / 19) * scale).toPrecision(4) })) },
            semantic_types: { x: 'Quantity', y: 'Quantity', v: 'Quantity' },
            chart_spec: scatter,
        });
        const plotly: any = assemblePlotly(input(0.0001));
        const notes = ((plotly.figure ?? plotly).layout.annotations ?? []).map((a: any) => a.text).filter((t: string) => !t.startsWith('<b>'));
        expect(notes).toEqual(['0.00002', '0.00005', '0.0001', '0.00025']);
        const echarts: any = assembleECharts(input(0.01));
        expect((echarts.option ?? echarts).visualMap[0].text).toEqual(['0.037', '0.0011']);
        const big: any = assembleECharts(input(1));
        expect((big.option ?? big).visualMap[0].text).toEqual(['3.7', '0.11']);
    });
});
