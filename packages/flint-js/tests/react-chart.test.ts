import { describe, expect, it } from 'vitest';
import { fitScale, flintInteractionsKey, flintSpecKey, flintUpdateKey, planUpdates, settleRoom, type UpdateOwner } from '../src/react';
import type { ChartAssemblyInput } from '../src/core/types';
import { clickAnnotate, clickHighlight, filterControls, type ChartUpdate } from '../src/interactive';

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

describe('FlintChart interactions key', () => {
    it('is equal for presets rebuilt with the same options', () => {
        expect(flintInteractionsKey([clickHighlight({ dimOpacity: 0.2 })]))
            .toBe(flintInteractionsKey([clickHighlight({ dimOpacity: 0.2 })]));
    });

    it('changes when a preset option changes under the same id', () => {
        expect(flintInteractionsKey([clickHighlight({ dimOpacity: 0.4 })]))
            .not.toBe(flintInteractionsKey([clickHighlight({ dimOpacity: 0.2 })]));
        expect(flintInteractionsKey([filterControls({ mode: 'highlight' })]))
            .not.toBe(flintInteractionsKey([filterControls({ mode: 'filter' })]));
    });

    it('ignores function options, which are read at mount', () => {
        expect(flintInteractionsKey([clickAnnotate({ format: () => 'a' })]))
            .toBe(flintInteractionsKey([clickAnnotate({ format: () => 'b' })]));
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

describe('FlintChart fit', () => {
    const natural = { width: 400, height: 300 };

    it('scales down to the tighter side the host sized, and never up', () => {
        expect(fitScale(natural, { width: 200 }, 'scale-down')).toBe(0.5);
        expect(fitScale(natural, { width: 200, height: 60 }, 'scale-down')).toBe(0.2);
        expect(fitScale(natural, { width: 800, height: 600 }, 'scale-down')).toBe(1);
        expect(fitScale(natural, {}, 'scale-down')).toBe(1);
    });

    it('keeps the natural size under crop', () => {
        expect(fitScale(natural, { width: 200 }, 'crop')).toBe(1);
    });

    it('scales down only what still overflows after relayout', () => {
        expect(fitScale(natural, { width: 360 }, 'relayout')).toBe(0.9);
        expect(fitScale(natural, { width: 420 }, 'relayout')).toBe(1);
    });
});

describe('FlintChart relayout room', () => {
    it('takes the first real reading', () => {
        expect(settleRoom(null, { width: 320 })).toEqual({ width: 320 });
    });

    it('ignores readings too small to be a laid-out box', () => {
        expect(settleRoom(null, { width: 12 })).toBeNull();
        expect(settleRoom({ width: 320 }, { width: 0 })).toEqual({ width: 320 });
        expect(settleRoom({ width: 320, height: 240 }, { width: 320, height: 8 })).toEqual({ width: 320, height: 240 });
    });

    it('keeps the room under scrollbar jitter, so the chart is not laid out again', () => {
        const room = { width: 320 };
        expect(settleRoom(room, { width: 323 })).toBe(room);
        expect(settleRoom(room, { width: 317 })).toBe(room);
        expect(settleRoom(room, { width: 340 })).toEqual({ width: 340 });
    });
});
