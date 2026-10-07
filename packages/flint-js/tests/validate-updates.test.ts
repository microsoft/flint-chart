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

    it('accepts every op name the contract lists', () => {
        expect(validateChartUpdates([{ id: 'all', ops: CHART_UPDATE_OPS.map((op) => ({ op })) }])).toEqual([]);
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
