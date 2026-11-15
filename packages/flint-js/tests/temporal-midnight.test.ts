// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterAll, describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { convertTemporalData } from '../src/core/resolve-semantics';
import { readIsoTimestamp } from '../src/core/temporal-parse';

/**
 * Dates that arrive as ISO timestamps (a database DATE column serialised to JSON, an API, a CSV
 * export) read as the dates they are: the same axis labels and mark positions as a date-only value,
 * on a machine in any time zone.
 */

const zone = process.env.TZ;
afterAll(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
});

const MONTHS = ['2005-05', '2005-06', '2005-07', '2005-08', '2006-02'];
const FORMS: Record<string, (month: string) => unknown> = {
    'date only': (m) => `${m}-01`,
    'timestamp, no zone': (m) => `${m}-01T00:00:00.000`,
    'timestamp, UTC': (m) => `${m}-01T00:00:00.000Z`,
    'timestamp, space': (m) => `${m}-01 00:00:00`,
    'local Date': (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1),
};

async function drawn(chartType: string, semanticType: string, value: (month: string) => unknown, width: number) {
    const spec: any = assembleVegaLite({
        data: { values: MONTHS.map((m, i) => ({ month: value(m), revenue: 5000 + i * 5000 })) },
        semantic_types: { month: semanticType, revenue: 'Amount' },
        chart_spec: { chartType, encodings: { x: { field: 'month' }, y: { field: 'revenue' } }, canvasSize: { width, height: 300 } },
    } as any);
    const clean = JSON.parse(JSON.stringify(spec, (key, v) => (key.startsWith('_') ? undefined : v)));
    const view = new View(parse(compile(clean).spec), { renderer: 'none' });
    await view.runAsync();
    const labels: string[] = [];
    const xs: number[] = [];
    const visit = (node: any): void => {
        if (!node) return;
        if (node.marktype === 'text' && node.role === 'axis-label') labels.push(...node.items.map((item: any) => String(item.text)));
        if (['rect', 'symbol', 'line'].includes(node.marktype) && node.role === 'mark') xs.push(...node.items.map((item: any) => Math.round(item.x * 10) / 10));
        (node.items ?? []).forEach(visit);
    };
    visit((view.scenegraph() as any).root);
    view.finalize();
    return { labels: labels.filter((text) => !/^[\d,.$]+[kKM]?$/.test(text)), xs };
}

describe('a midnight timestamp under a date type', () => {
    it('reads as its date, and a zoneless timestamp with a time as UTC', () => {
        expect(readIsoTimestamp('2005-05-01T00:00:00.000', true)).toBe('2005-05-01');
        expect(readIsoTimestamp('2005-05-01T00:00:00Z', true)).toBe('2005-05-01');
        expect(readIsoTimestamp('2005-05-01 00:00', true)).toBe('2005-05-01');
        expect(readIsoTimestamp('2005-05-01T00:00:00.000', false)).toBe('2005-05-01T00:00:00.000Z');
        expect(readIsoTimestamp('2005-05-01T13:30:00', true)).toBe('2005-05-01T13:30:00Z');
        expect(readIsoTimestamp('2005-05-01T13:30:00+02:00', true)).toBeNull();
        expect(readIsoTimestamp('2005-05-01', true)).toBeNull();
        expect(convertTemporalData([{ m: '2005-05-01T00:00:00.000' }], { m: 'YearMonth' })[0].m).toBe('2005-05-01');
        expect(convertTemporalData([{ m: '2005-05-01T09:15:00' }], { m: 'DateTime' })[0].m).toBe('2005-05-01T09:15:00Z');
    });

    for (const tz of ['UTC', 'America/Los_Angeles']) {
        it(`draws every form alike, in ${tz}`, async () => {
            process.env.TZ = tz;
            for (const [chartType, semanticType, width] of [['Bar Chart', 'YearMonth', 300], ['Bar Chart', 'YearMonth', 600], ['Line Chart', 'YearMonth', 600], ['Scatter Plot', 'Date', 600]] as const) {
                const base = await drawn(chartType, semanticType, FORMS['date only'], width);
                for (const [name, value] of Object.entries(FORMS)) {
                    const other = await drawn(chartType, semanticType, value, width);
                    expect(other.labels, `${chartType} ${width} ${name}`).toEqual(base.labels);
                    expect(other.xs, `${chartType} ${width} ${name}`).toEqual(base.xs);
                }
            }
        });
    }
});
