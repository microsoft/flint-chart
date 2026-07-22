// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, getChartOptions } from '../src';

// Series 'A' is missing 2020-02, series 'B' is missing 2020-03.
const SPARSE = [
    { d: '2020-01-01', v: 10, s: 'A' },
    { d: '2020-03-01', v: 30, s: 'A' },
    { d: '2020-01-01', v: 5, s: 'B' },
    { d: '2020-02-01', v: 9, s: 'B' },
];

describe('sparse area gap handling — no fabricated data', () => {
    it('a single-series area disables the implicit stack so gaps connect', () => {
        const spec = assembleVegaLite({
            data: { values: [{ d: '2020-01-01', v: 10 }, { d: '2020-03-01', v: 30 }] },
            semantic_types: { d: 'Date', v: 'Quantity' },
            chart_spec: { chartType: 'Area Chart', encodings: { x: 'd', y: 'v' }, baseSize: { width: 400, height: 300 } },
        });
        // Measure axis stack disabled → VL won't auto-impute → area connects gaps.
        expect(spec.encoding.y.stack).toBe(null);
        // Data is NOT fabricated: the 2 measured rows are untouched.
        expect((spec.data.values as any[]).length).toBe(2);
    });

    it('a FACETED single-series sparse area disables the stack, does NOT densify', () => {
        const spec = assembleVegaLite({
            data: { values: SPARSE },
            semantic_types: { d: 'Date', v: 'Quantity', s: 'Category' },
            chart_spec: { chartType: 'Area Chart', encodings: { x: 'd', y: 'v', column: 's' }, baseSize: { width: 600, height: 300 } },
        });
        expect(spec.encoding.y.stack).toBe(null);
        // No fabricated cells — the 4 sparse rows are untouched.
        expect((spec.data.values as any[]).length).toBe(SPARSE.length);
    });

    it('a colour-stacked area interpolates missing cells (stacking needs alignment)', () => {
        const spec = assembleVegaLite({
            data: { values: SPARSE },
            semantic_types: { d: 'Date', v: 'Quantity', s: 'Category' },
            chart_spec: { chartType: 'Area Chart', encodings: { x: 'd', y: 'v', color: 's' }, baseSize: { width: 400, height: 300 } },
        });
        // Stacking can't have holes → cells aligned to 3 dates × 2 series = 6.
        expect((spec.data.values as any[]).length).toBe(6);
        // A's missing 2020-02 is interpolated between 10 (Jan) and 30 (Mar) → 20.
        const aFeb = (spec.data.values as any[]).find((r) => r.s === 'A' && String(r.d).startsWith('2020-02'));
        expect(Math.round(aFeb.v)).toBe(20);
        expect(spec.encoding.y.stack).not.toBe(null); // still stacked
    });
});

describe('area opacity option applicability', () => {
    const input = (chartProperties?: Record<string, unknown>, withColor = true) => ({
        data: { values: SPARSE },
        semantic_types: { d: 'Date', v: 'Quantity', s: 'Category' },
        chart_spec: {
            chartType: 'Area Chart',
            encodings: { x: 'd', y: 'v', ...(withColor ? { color: 's' } : {}) },
            chartProperties,
            baseSize: { width: 400, height: 300 },
        },
    });
    const opacityApplicable = (chartInput: ReturnType<typeof input>) =>
        getChartOptions(chartInput).find((option) => option.key === 'opacity')?.applicable;

    it('hides opacity for stacked or single-series areas', () => {
        expect(opacityApplicable(input())).toBe(false);
        expect(opacityApplicable(input(undefined, false))).toBe(false);
    });

    it('shows opacity for layered multi-series areas', () => {
        expect(opacityApplicable(input({ stackMode: 'layered' }))).toBe(true);
    });
});
