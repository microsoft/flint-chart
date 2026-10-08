import { describe, expect, it } from 'vitest';
import { flintSpecKey, flintUpdateKey, planUpdates, type UpdateOwner } from '../src/react';
import type { ChartAssemblyInput } from '../src/core/types';
import type { ChartUpdate } from '../src/interactive';

const rows = [{ Country: 'Chad', Reading: 4 }];
const spec = (values: Record<string, unknown>[], title = 'Reading'): ChartAssemblyInput => ({
    data: { values },
    semantic_types: { Country: 'Country', Reading: 'Percentage' },
    chart_spec: { chartType: 'Bar Chart', title, encodings: { x: { field: 'Country' }, y: { field: 'Reading' } } },
} as ChartAssemblyInput);
const emphasis = (id: string, country: string): ChartUpdate => ({
    id,
    ops: [{ op: 'set-style', targets: [{ select: { key: { Country: country } } }], value: { state: 'emphasized' } }],
});

describe('FlintChart spec key', () => {
    it('is equal for an equal spec rebuilt around the same rows', () => {
        expect(flintSpecKey(spec(rows))).toBe(flintSpecKey(spec(rows)));
    });

    it('changes with the content or with the rows array', () => {
        expect(flintSpecKey(spec(rows, 'Other'))).not.toBe(flintSpecKey(spec(rows)));
        expect(flintSpecKey(spec([...rows]))).not.toBe(flintSpecKey(spec(rows)));
    });
});

describe('FlintChart update diff', () => {
    it('compares set-data rows by reference, not by content', () => {
        const data = (values: readonly Record<string, unknown>[]): ChartUpdate =>
            ({ id: 'rows', ops: [{ op: 'set-data', source: 'main', value: { rows: values } }] });
        expect(flintUpdateKey(data(rows))).toBe(flintUpdateKey(data(rows)));
        expect(flintUpdateKey(data([...rows]))).not.toBe(flintUpdateKey(data(rows)));
    });

    it('applies new and changed ids and skips unchanged ones', () => {
        const applied = new Map([['a', flintUpdateKey(emphasis('a', 'Chad'))], ['b', flintUpdateKey(emphasis('b', 'Nepal'))]]);
        const plan = planUpdates(applied, new Map(), [emphasis('a', 'Chad'), emphasis('b', 'Ghana'), emphasis('c', 'Chad')]);
        expect(plan.apply.map((update) => update.id)).toEqual(['b', 'c']);
        expect(plan.clear).toEqual([]);
    });

    it('clears a dropped id only when the host wrote it last', () => {
        const applied = new Map([['host-only', 'x'], ['click-group-focus', 'y']]);
        const owners = new Map<string, UpdateOwner>([['host-only', 'host'], ['click-group-focus', 'reader']]);
        expect(planUpdates(applied, owners, []).clear).toEqual(['host-only']);
    });
});
