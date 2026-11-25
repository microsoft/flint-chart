// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, vi } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { validateChart } from '../src/validate';
import { CHART_UPDATE_OPS, type ChartAssemblyInput, type ChartUpdateOp } from '../src';

vi.mock('../src/vegalite/assemble', async (original) => {
    const actual = await original<typeof import('../src/vegalite/assemble')>();
    return { ...actual, assembleVegaLite: vi.fn(actual.assembleVegaLite) };
});

const anyChart = {
    data: { values: [{ a: 1, b: 2 }] },
    chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'a', y: 'b' } },
} as ChartAssemblyInput;
const errorsOf = (value: unknown) => validateChart(anyChart, 'vegalite', { updates: value }).errors;
const message = (value: unknown): string | undefined => errorsOf(value)[0]?.message;

describe('validateChart updates: shape', () => {
    it('accepts an empty list and a list of well-formed layers', () => {
        expect(errorsOf([])).toEqual([]);
        expect(errorsOf([
            { id: 'agent', ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] },
            { id: 'note', ops: [{ op: 'annotate-text', target: { select: { key: { a: 1 } } }, value: { text: 'x' } }] },
        ])).toEqual([]);
    });

    it('still reads the deprecated set-annotation, with a warning to write annotate-text', () => {
        const op = { op: 'set-annotation', target: { select: { key: { a: 1 } } }, value: { text: 'x' } };
        const result = validateChart(anyChart, 'vegalite', { updates: [{ id: 'note', ops: [op] }] });
        expect(result.errors).toEqual([]);
        expect(result.updates![0].ops[0]).toMatchObject({ op: 'set-annotation', deprecated: 'annotate-text' });
        expect(result.warnings).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'deprecated_op' }));
        expect(CHART_UPDATE_OPS).not.toContain('set-annotation');
    });

    it('accepts a well-formed op of every name the contract lists', () => {
        const target = { select: { key: { a: 1 } } };
        const ops = [
            { op: 'set-style', targets: [target], value: { state: 'emphasized' } },
            { op: 'annotate-text', target, value: null },
            { op: 'annotate-region', name: 'r', value: { x: [0, 1], text: 'Recovery' } },
            { op: 'annotate-enclosure', name: 'e', value: { targets: [target], shape: 'hull' } },
            { op: 'set-viewport', axes: 'x', value: { x: [0, 1] } },
            { op: 'set-order', scope: 'category', field: 'a', values: [2, 1] },
            { op: 'set-overlay', name: 'line', value: null },
            { op: 'set-freeform-overlay', name: 'shape', value: { coordinateSpace: 'plot', body: [] } },
            { op: 'set-data', source: 'main', value: { rows: [] } },
        ];
        expect(ops.map((op) => op.op)).toEqual([...CHART_UPDATE_OPS]);
        expect(errorsOf([{ id: 'all', ops }])).toEqual([]);
    });

    it('names the first missing or malformed field of an op, with its shape', () => {
        expect(message([{ id: 'a', ops: [{ op: 'annotate-text', foo: 1 }] }])).toBe(
            'updates[0] (a).ops[0]: annotate-text has a missing or malformed "target". Shape: { op, target: UpdateTarget, value: { text, anchor?: \'segment\' | \'point\', highlight?: \'none\' | \'light\' | \'strong\' | \'exclusive\', style?: { fontSize?, fontWeight?, color? }, highlightStyle?: { color?, width? } } | null }. A target is { select: { key: { field: value } } }: this op acts on one mark, so it takes a key, not a where.',
        );
        expect(message([{ id: 'a', ops: [{ op: 'annotate-text', annotations: [{ kind: 'rule', x: '2022-12-01' }] }] }]))
            .toContain('missing or malformed "target"');
        expect(message([{ id: 'a', ops: [{ op: 'set-style', targets: [{ region: 'East' }], value: {} }] }]))
            .toContain('set-style has a missing or malformed "targets"');
        expect(message([{ id: 'a', ops: [{ op: 'set-viewport', axes: 'time', value: {} }] }]))
            .toContain('set-viewport has a missing or malformed "axes"');
    });

    it('returns one invalid_updates error that names the first bad entry', () => {
        expect(errorsOf({})[0]).toMatchObject({ severity: 'error', code: 'invalid_updates' });
        expect(message({})).toBe('updates must be an array of { id, ops }.');
        expect(message([null])).toBe('updates[0]: expected an object with "id" and "ops".');
        expect(message([{ ops: [] }])).toBe('updates[0]: "id" must be a non-empty string.');
        expect(message([{ id: 'a' }])).toBe('updates[0] (a): "ops" must be an array.');
        expect(message([{ id: 'a', ops: [{ op: 'highlight' }] }]))
            .toMatch(/^updates\[0\] \(a\)\.ops\[0\]: unknown op "highlight"\. Known ops: set-style, .*set-data\.$/);
        expect(message([{ id: 'a', ops: [] }, { id: 'a', ops: [] }]))
            .toBe('updates[1]: duplicate id "a" (also used by updates[0]). One id holds one layer.');
    });

    it('makes the result invalid and checks no op of a malformed list', () => {
        const result = validateChart(anyChart, 'vegalite', { updates: [{ id: 'a', ops: [] }, { id: 'a', ops: [] }] });
        expect(result.valid).toBe(false);
        expect(result.updates).toBeUndefined();
    });

    it('assembles the chart once for the spec and its updates', () => {
        vi.mocked(assembleVegaLite).mockClear();
        validateChart(anyChart, 'vegalite', { updates: [{ id: 'a', ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] }] });
        expect(assembleVegaLite).toHaveBeenCalledTimes(1);
    });

    it('ignores updates on a backend that does not run them', () => {
        const result = validateChart(anyChart, 'echarts', { updates: [{ id: 'a', ops: [] }] });
        expect(result.valid).toBe(true);
        expect(result.updates).toBeUndefined();
        expect(result.warnings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'updates_ignored' }));
    });
});

describe('validateChart updates: each op on the chart', () => {
    const rows = [
        { month: '2022-10-01', spend: 0.81 },
        { month: '2022-11-01', spend: 0.85 },
        { month: '2022-12-01', spend: 0.87 },
        { month: '2023-01-01', spend: 0.95 },
    ];
    const line = (interactions: { type: string }[] = []): ChartAssemblyInput => ({
        data: { values: rows },
        semantic_types: { month: 'YearMonth', spend: 'Amount' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: { field: 'month' }, y: { field: 'spend' } } },
        ...(interactions.length > 0 ? { interaction_spec: { interactions } } : {}),
    } as ChartAssemblyInput);
    const band = (encodings: unknown) => ({
        op: 'set-overlay', name: 'band',
        value: { mark: 'rect', role: 'band', data: { values: [{ start: '2022-11-30', end: '2023-01-01' }] }, encodings },
    }) as ChartUpdateOp;
    const only = (input: ChartAssemblyInput, op: ChartUpdateOp) => validateChart(input, 'vegalite', { updates: [{ id: 'u', ops: [op] }] }).updates![0].ops[0];

    it('reports an op that will not apply as a warning, and the spec stays valid', () => {
        const result = validateChart(line(), 'vegalite', { updates: [{ id: 'u', ops: [band({ x: 'start', x2: 'end' })] }] });
        expect(result.valid).toBe(true);
        expect(result.warnings).toContainEqual({
            severity: 'warning',
            code: 'update_not_applied',
            message: 'Update "u" will not apply overlay "band" (rect, 1 row): encodings.x must be { "field": "start" }, not "start".',
        });
    });

    it('rejects a shorthand overlay encoding and accepts the field form', () => {
        const shorthand = only(line(), band({ x: 'start', x2: 'end' }));
        expect(shorthand.ok).toBe(false);
        expect(shorthand.reason).toContain('{ "field": "start" }');
        expect(only(line(), band({ x: { field: 'start' }, x2: { field: 'end' } })).ok).toBe(true);
    });

    it('rejects an overlay value off the axis and a rule with x2', () => {
        const off = only(line(), {
            op: 'set-overlay', name: 'r',
            value: { mark: 'rule', role: 'reference', data: { values: [{ d: 'soon' }] }, encodings: { x: { field: 'd' } } },
        } as ChartUpdateOp);
        expect(off.reason).toContain('d = soon is not a value of the x axis');
        const rule = only(line(), {
            op: 'set-overlay', name: 'r',
            value: { mark: 'rule', role: 'reference', data: { values: [{ a: '2022-11-30', b: '2023-01-01' }] }, encodings: { x: { field: 'a' }, x2: { field: 'b' } } },
        } as ChartUpdateOp);
        expect(rule.reason).toContain('a rule overlay needs');
    });

    it('matches a note key against the rows, temporal values as dates', () => {
        const note = (key: Record<string, unknown>) => only(line(), {
            op: 'annotate-text', target: { select: { key } }, value: { text: 'Launch' },
        } as ChartUpdateOp);
        expect(note({ month: '2022-12-01' })).toMatchObject({ ok: true, text: 'note "Launch" at month = 2022-12-01' });
        expect(note({ month: '2022-12' }).ok).toBe(true);
        expect(note({ month: '2022-12-15' }).reason).toBe('no row has month = 2022-12-15.');
        expect(note({ region: 'East' }).reason).toContain('region is not a field the marks carry');
    });

    it('needs a navigation interaction for a viewport', () => {
        const viewport = { op: 'set-viewport', axes: 'x', value: { x: ['2022-11-01', '2022-12-01'] } } as ChartUpdateOp;
        expect(only(line(), viewport).reason).toContain('add a navigate or brush-zoom interaction');
        expect(only(line([{ type: 'navigate' }]), viewport).ok).toBe(true);
    });

    it('checks a region\'s bounds against the chart\'s axes, and an enclosure\'s targets against its rows', () => {
        const region = (value: unknown) => only(line(), { op: 'annotate-region', name: 'r', value } as ChartUpdateOp);
        expect(region({ x: ['2022-11-01', '2022-12-01'], text: 'Holidays' })).toMatchObject({ ok: true, text: 'region "r" over x 2022-11-01 to 2022-12-01, captioned "Holidays"' });
        expect(region({ x: ['2022-11-01', null] }).ok).toBe(true);
        expect(region({ x: ['2022-11-01'] }).reason).toContain('exactly two bounds');
        expect(region({ y: [0.8, 'high'] }).reason).toContain('is not a value of the y axis');
        const enclosure = (targets: unknown[]) => only(line(), { op: 'annotate-enclosure', name: 'e', value: { targets, text: 'Late year' } } as ChartUpdateOp);
        expect(enclosure([{ select: { where: { month: { in: ['2022-11-01', '2022-12-01'] } } } }]).ok).toBe(true);
        expect(enclosure([{ select: { key: { month: '2021-01-01' } } }]).reason).toContain('no row has');
        expect(enclosure([]).reason).toContain('names no targets');
        // set-annotation, the deprecated name of annotate-text, is checked alike.
        const note = (op: string) => only(line(), { op, target: { select: { key: { month: '2022-12-01' } } }, value: { text: 'Launch' } } as ChartUpdateOp);
        expect(note('annotate-text')).toMatchObject({ ok: true, text: note('set-annotation').text });
        expect(note('annotate-text').deprecated).toBeUndefined();
    });

    it('advises against a note that repeats a value the chart prints on its mark', () => {
        const bars = (theme?: string): ChartAssemblyInput => ({
            data: { values: [{ region: 'East', revenue: 55 }, { region: 'Online', revenue: 61 }] },
            semantic_types: { region: 'Category', revenue: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'region' }, y: { field: 'revenue' } } },
            ...(theme ? { theme_spec: theme } : {}),
        } as ChartAssemblyInput);
        const note = (text: string, theme?: string) => validateChart(bars(theme), 'vegalite', {
            updates: [{ id: 'n', ops: [{ op: 'annotate-text', target: { select: { key: { region: 'Online' } } }, value: { text } }] }],
        });
        const repeated = note('Online leads: 61', 'nyt');
        expect(repeated.updates![0].ops[0]).toMatchObject({ ok: true });
        expect(repeated.updates![0].ops[0].advice).toContain('repeats revenue 61');
        expect(repeated.warnings).toContainEqual(expect.objectContaining({ severity: 'info', code: 'note_repeats_chart' }));
        expect(note('Overtook East in March', 'nyt').updates![0].ops[0].advice).toBeUndefined();
        // Without value labels the value is read off the axis, not printed.
        expect(note('Online leads: 61').updates![0].ops[0].advice).toBeUndefined();
    });
});
