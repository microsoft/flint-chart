// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { validateChartUpdates } from '../src/validate';
import { CHART_UPDATE_OPS } from '../src';

const message = (value: unknown, label?: string): string | undefined => validateChartUpdates(value, label)[0]?.message;

describe('validateChartUpdates', () => {
    it('accepts an empty list and a list of well-formed layers', () => {
        expect(validateChartUpdates([])).toEqual([]);
        expect(validateChartUpdates([
            { id: 'agent', ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] },
            { id: 'note', ops: [{ op: 'set-annotation', target: { select: { key: { a: 1 } } }, value: { text: 'x' } }] },
        ])).toEqual([]);
    });

    it('accepts a well-formed op of every name the contract lists', () => {
        const target = { select: { key: { a: 1 } } };
        const ops = [
            { op: 'set-style', targets: [target], value: { state: 'emphasized' } },
            { op: 'set-annotation', target, value: null },
            { op: 'set-viewport', axes: 'x', value: { x: [0, 1] } },
            { op: 'set-order', scope: 'category', field: 'a', values: [2, 1] },
            { op: 'set-overlay', name: 'line', value: null },
            { op: 'set-freeform-overlay', name: 'shape', value: { coordinateSpace: 'plot', body: [] } },
            { op: 'set-data', source: 'main', value: { rows: [] } },
        ];
        expect(ops.map((op) => op.op)).toEqual([...CHART_UPDATE_OPS]);
        expect(validateChartUpdates([{ id: 'all', ops }])).toEqual([]);
    });

    it('names the first missing or malformed field of an op, with its shape', () => {
        expect(message([{ id: 'a', ops: [{ op: 'set-annotation', foo: 1 }] }])).toBe(
            'updates[0] (a).ops[0]: set-annotation has a missing or malformed "target". Shape: { op, target: UpdateTarget, value: { text, anchor?: \'segment\' | \'point\' } | null }. UpdateTarget is { select: { key: { field: value } } }.',
        );
        expect(message([{ id: 'a', ops: [{ op: 'set-annotation', annotations: [{ kind: 'rule', x: '2022-12-01' }] }] }]))
            .toContain('missing or malformed "target"');
        expect(message([{ id: 'a', ops: [{ op: 'set-style', targets: [{ region: 'East' }], value: {} }] }]))
            .toContain('set-style has a missing or malformed "targets"');
        expect(message([{ id: 'a', ops: [{ op: 'set-viewport', axes: 'time', value: {} }] }]))
            .toContain('set-viewport has a missing or malformed "axes"');
    });

    it('returns one invalid_updates error that names the first bad entry', () => {
        expect(validateChartUpdates({})[0]).toMatchObject({ severity: 'error', code: 'invalid_updates' });
        expect(message({})).toBe('updates must be an array of { id, ops }.');
        expect(message([null])).toBe('updates[0]: expected an object with "id" and "ops".');
        expect(message([{ ops: [] }])).toBe('updates[0]: "id" must be a non-empty string.');
        expect(message([{ id: 'a' }])).toBe('updates[0] (a): "ops" must be an array.');
        expect(message([{ id: 'a', ops: [{ op: 'highlight' }] }]))
            .toMatch(/^updates\[0\] \(a\)\.ops\[0\]: unknown op "highlight"\. Known ops: set-style, .*set-data\.$/);
        expect(message([{ id: 'a', ops: [] }, { id: 'a', ops: [] }]))
            .toBe('updates[1]: duplicate id "a" (also used by updates[0]). One id holds one layer.');
    });

    it('names the entries under the label the caller gives', () => {
        expect(message([{ id: 'a' }], 'state')).toBe('state[0] (a): "ops" must be an array.');
    });
});
