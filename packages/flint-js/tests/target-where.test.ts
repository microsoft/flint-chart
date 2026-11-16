// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { selectorPredicate, selectorText } from '../src/core/target-selector';
import { validateChart } from '../src/validate';
import type { ChartAssemblyInput, ChartUpdateOp } from '../src';
import type { SemanticTargetSelector } from '../src/core/interaction-contracts';

const key = (k: Record<string, unknown>): SemanticTargetSelector => ({ select: { key: k } });
const where = (w: Record<string, { in: unknown[] } | { range: [unknown, unknown] }>): SemanticTargetSelector => ({ select: { where: w } });

describe('update target conditions', () => {
    it('matches a one-value set exactly where a key matches', () => {
        const marks = [
            { region: 'Asia', year: 2024, open: true, t: Date.UTC(2025, 2, 1) },
            { region: 'asia', year: '2024', open: false, t: Date.UTC(2025, 3, 1) },
        ];
        const fields = ['region', 'year', 'open', 't'];
        const toTime = (field: string, value: unknown) => (field === 't' && typeof value === 'string' ? Date.parse(value) : value);
        for (const [field, value] of [['region', 'Asia'], ['year', 2024], ['year', '2024'], ['open', false], ['t', '2025-03-01']] as const) {
            const byKey = selectorPredicate(key({ [field]: value }), fields, toTime)!;
            const bySet = selectorPredicate(where({ [field]: { in: [value] } }), fields, toTime)!;
            expect(marks.map(bySet), `${field} = ${String(value)}`).toEqual(marks.map(byKey));
        }
    });

    it('holds a range at its ends, reads dates, and leaves an open end open', () => {
        const fields = ['month'];
        const months = ['2025-01-01', '2025-03-01', '2025-06-01', '2025-09-01'].map((month) => ({ month: Date.parse(month) }));
        const toTime = (_field: string, value: unknown) => (typeof value === 'string' ? Date.parse(value) : value);
        const inSpring = selectorPredicate(where({ month: { range: ['2025-03-01', '2025-06-01'] } }), fields, toTime)!;
        expect(months.map(inSpring)).toEqual([false, true, true, false]);
        const fromJune = selectorPredicate(where({ month: { range: ['2025-06-01', null] } }), fields, toTime)!;
        expect(months.map(fromJune)).toEqual([false, false, true, true]);
    });

    it('needs every field, and selects nothing by a field the marks do not carry', () => {
        const both = selectorPredicate(where({ region: { in: ['Asia'] }, year: { range: [2020, 2022] } }), ['region', 'year'])!;
        expect([{ region: 'Asia', year: 2021 }, { region: 'Asia', year: 2024 }, { region: 'Europe', year: 2021 }].map(both)).toEqual([true, false, false]);
        expect(selectorPredicate(where({ country: { in: ['Japan'] } }), ['region'])).toBeNull();
        expect(selectorPredicate(where({}), ['region'])).toBeNull();
    });

    it('says a set in the words filters use', () => {
        expect(selectorText(key({ origin: 'Japan', cylinders: 4 }))).toBe('origin = Japan, cylinders = 4');
        expect(selectorText(where({ region: { in: ['Asia', 'Europe'] }, month: { range: ['2025-03', '2025-06'] } })))
            .toBe('region in [Asia, Europe] and month from 2025-03 to 2025-06');
    });
});

describe('validateChart: where targets', () => {
    const rows = [
        { month: '2025-01-01', region: 'Asia', revenue: 1 },
        { month: '2025-02-01', region: 'Asia', revenue: 2 },
        { month: '2025-01-01', region: 'Europe', revenue: 3 },
        { month: '2025-02-01', region: 'Europe', revenue: 4 },
    ];
    const lines: ChartAssemblyInput = {
        data: { values: rows },
        semantic_types: { month: 'YearMonth', revenue: 'Amount', region: 'Category' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'month', y: 'revenue', color: 'region' } },
    };
    const check = (op: ChartUpdateOp) => validateChart(lines, 'vegalite', { updates: [{ id: 'u', ops: [op] }] });
    const style = (target: unknown) => ({ op: 'set-style', targets: [target], value: { state: 'emphasized' } }) as ChartUpdateOp;

    it('emphasizes a set, and says it', () => {
        const op = check(style(where({ region: { in: ['Asia'] }, month: { range: ['2025-01', '2025-01'] } }))).updates![0].ops[0];
        expect(op).toMatchObject({ ok: true, text: 'emphasizes marks where region in [Asia] and month from 2025-01 to 2025-01' });
    });

    it('reports a set that matches no row, an empty list, and a field the marks do not carry', () => {
        expect(check(style(where({ region: { in: ['Africa'] } }))).updates![0].ops[0].reason).toBe('no row has region in [Africa].');
        expect(check(style(where({ region: { in: [] } }))).updates![0].ops[0].reason).toBe('the target lists no value for region.');
        expect(check(style(where({ country: { in: ['Japan'] } }))).updates![0].ops[0].reason).toContain('country is not a field the marks carry; select on');
    });

    it('takes a set only where an op acts on many marks', () => {
        const note = check({ op: 'annotate-text', target: where({ region: { in: ['Asia'] } }), value: { text: 'x' } } as ChartUpdateOp);
        expect(note.valid).toBe(false);
        expect(note.errors[0].message).toContain('this op acts on one mark, so it takes a key, not a where');
        const both = check(style({ select: { key: { region: 'Asia' }, where: { region: { in: ['Asia'] } } } }));
        expect(both.errors[0].message).toContain('set-style has a missing or malformed "targets"');
        const badRange = check(style({ select: { where: { month: { range: ['2025-01'] } } } }));
        expect(badRange.errors[0].message).toContain('for a set');
    });
});
