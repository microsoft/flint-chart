// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// A percentage field's storage — fractions or percent points — is taken from what the annotation
// states before what the values suggest (#154).

import { describe, expect, it } from 'vitest';
import { assembleVegaLite, resolveFormat } from '../src';
import { percentRepresentation } from '../src/core/field-semantics';
import { kpiNumberFormat } from '../src/core/kpi-format';

const MOSTLY_PAST_ONE = [0.5, 1.8, 2.4, 3.0, 1.2];
const MOSTLY_UNDER_ONE = [0.5, 0.8, 0.4, 3.0, 0.2];

describe('percentage representation', () => {
    it('takes a stated scale over the values', () => {
        expect(percentRepresentation({ percentScale: 'fraction' }, MOSTLY_PAST_ONE)).toBe('0-1');
        expect(percentRepresentation({ percentScale: 'percent' }, [0.2, 0.4])).toBe('0-100');
    });

    it('reads a decisive intrinsic domain, and the values where the domain does not settle it', () => {
        expect(percentRepresentation({ intrinsicDomain: [0, 1] }, [5, 40, 80])).toBe('0-1');
        expect(percentRepresentation({ intrinsicDomain: [-1, 1] }, [5, 40, 80])).toBe('0-1');
        expect(percentRepresentation({ intrinsicDomain: [0, 100] }, [0.2, 0.4])).toBe('0-100');
        expect(percentRepresentation({ intrinsicDomain: [0, 3] }, MOSTLY_PAST_ONE)).toBe('0-100');
        expect(percentRepresentation({ intrinsicDomain: [0, 3] }, MOSTLY_UNDER_ONE)).toBe('0-1');
        expect(percentRepresentation(undefined, MOSTLY_UNDER_ONE)).toBe('0-1');
    });

    it('formats one column one way whichever rows a query returns, once its scale is stated', () => {
        const growth = { semanticType: 'PercentageChange', intrinsicDomain: [0, 3] as [number, number], percentScale: 'fraction' as const };
        const a = resolveFormat('PercentageChange', growth, MOSTLY_PAST_ONE);
        const b = resolveFormat('PercentageChange', growth, MOSTLY_UNDER_ONE);
        expect(a.format?.pattern).toMatch(/%$/);
        expect(a.tooltipFormat?.suffix).toBeUndefined();
        expect(a).toEqual(b);
        // A stated scale alone, with no domain, is enough.
        const bare = resolveFormat('PercentageChange', { semanticType: 'PercentageChange', percentScale: 'fraction' }, MOSTLY_PAST_ONE);
        expect(bare.format?.pattern).toMatch(/%$/);
        const points = resolveFormat('Percentage', { semanticType: 'Percentage', percentScale: 'percent' }, [0.2, 0.5]);
        expect(points.format).toBeUndefined();
        expect(points.tooltipFormat?.suffix).toBe('%');
    });

    it('scales the axis and the KPI number by the stated scale', () => {
        const rows = ['A', 'B', 'C', 'D'].map((k, i) => ({ k, growth: [1.8, 2.4, 3.0, 1.2][i] }));
        const vl = assembleVegaLite({
            data: { values: rows },
            semantic_types: { k: 'Category', growth: { semanticType: 'PercentageChange', percentScale: 'fraction' } },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'k', y: 'growth' } },
        } as any) as any;
        expect(JSON.stringify(vl.encoding.y.axis ?? {})).toMatch(/%/);
        const kpi = kpiNumberFormat({ field: 'growth', semanticAnnotation: { semanticType: 'PercentageChange', percentScale: 'fraction' } } as any, [1.8, 2.4]);
        expect(kpi.print(2.4)).toBe('240%');
    });

    it('reads fractions from the values where nothing is stated, as the domain does', async () => {
        const { compile } = await import('vega-lite');
        const { parse, View } = await import('vega');
        const shares = [0.164, 0.42, 0.087, 0.3];
        expect(resolveFormat('Percentage', { semanticType: 'Percentage' }, shares).format?.pattern).toMatch(/%$/);
        const rows = ['A', 'B', 'C', 'D'].map((k, i) => ({ k, m: shares[i] }));
        const vl = assembleVegaLite({
            data: { values: rows }, semantic_types: { k: 'Category', m: 'Percentage' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'k', y: 'm' } },
        } as any) as any;
        const svg = await new View(parse(compile(vl).spec), { renderer: 'none' }).toSVG();
        const ticks = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).filter((t) => /\d/.test(t));
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every((t) => t.endsWith('%')), ticks.join(', ')).toBe(true);
        // Percent points with nothing stated are left as they print.
        const points = resolveFormat('Percentage', { semanticType: 'Percentage' }, [16.4, 42, 8.7]);
        expect(points.format).toBeUndefined();
    });
});
