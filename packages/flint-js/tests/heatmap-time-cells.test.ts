// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { calendarStep } from '../src/core/decisions';

/**
 * A heatmap's cells tile, however many months run along its side. Past the count a row of
 * equal bands can name, the months stand on a time scale; there each cell spans its month, so
 * neighbours meet whatever the month's length, and a house's bar thickness never thins the rows.
 */

const months = (count: number, from = Date.UTC(2021, 6, 1)) => Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() + i);
    return d.toISOString().slice(0, 7);
});

const heatmap = (periods: string[], extra: Record<string, unknown> = {}) => assembleVegaLite({
    data: { values: periods.flatMap((period, m) => ['Alpha', 'Beta', 'Gamma'].map((game, g) => ({ period, game, net: ((m * 7 + g * 5) % 19) - 9 }))) },
    semantic_types: { period: 'YearMonth', game: 'Category', net: 'Profit' },
    chart_spec: { chartType: 'Heatmap', encodings: { x: 'period', y: 'game', color: { field: 'net', aggregate: 'sum' } }, ...extra },
    theme_spec: 'economist',
} as any);

const silent = { warn() {}, info() {}, debug() {}, error() {}, level() { return this; } } as any;

/** The cells as drawn: the rect mark with the most items. */
async function drawn(spec: any) {
    const view = new View(parse(compile(spec, { logger: silent }).spec), { renderer: 'none' });
    view.logger(silent);
    await view.runAsync();
    const marks: any[] = [];
    const walk = (node: any) => {
        if (!node) return;
        if (node.role === 'mark' && (node.marktype === 'rect' || node.marktype === 'text')) marks.push(node);
        for (const item of node.items ?? []) walk(item);
    };
    walk(view.scenegraph().root);
    const largest = (type: string) => marks.filter((m) => m.marktype === type).sort((a, b) => b.items.length - a.items.length)[0]?.items ?? [];
    const cells = largest('rect');
    const top = Math.min(...cells.map((c: any) => c.y));
    const row = cells.filter((c: any) => Math.abs(c.y - top) < 0.01).sort((a: any, b: any) => a.x - b.x);
    const rows = [...new Set(cells.map((c: any) => Math.round(c.y * 100) / 100))].sort((a: number, b: number) => a - b);
    return { cells, row, rows, labels: largest('text'), width: view.signal('width') as number };
}

describe('a heatmap along a long run of months', () => {
    it('puts more than fifty months on a time scale, the case the cells must tile on', () => {
        const spec: any = heatmap(months(54));
        expect(spec.encoding.x.type).toBe('temporal');
    });

    it('spans each cell to the end of its month, so neighbours meet', async () => {
        const { row, width } = await drawn(heatmap(months(54)));
        expect(row).toHaveLength(54);
        for (let i = 1; i < row.length; i++) expect(row[i].x).toBeCloseTo(row[i - 1].x + row[i - 1].width, 6);
        // The cells run the plot's whole width: the scale is the first month to the last month's end.
        expect(row[row.length - 1].x + row[row.length - 1].width - row[0].x).toBeCloseTo(width, 6);
    });

    it('draws a month the length it is: February narrower than March', async () => {
        const { row } = await drawn(heatmap(months(54)));
        const feb = row[7], mar = row[8]; // July 2021 + 7 = February 2022
        expect(feb.width).toBeLessThan(mar.width);
    });

    it('leaves a missing month empty rather than stretching its neighbours over it', async () => {
        const periods = months(54).filter((_, i) => i !== 20);
        const { row } = await drawn(heatmap(periods));
        const gaps = row.slice(1).map((c: any, i: number) => c.x - (row[i].x + row[i].width));
        expect(gaps.filter((gap: number) => gap > 1)).toHaveLength(1);
    });

    it('keeps the house bar thickness off the rows: they fill their step', async () => {
        const { cells, rows } = await drawn(heatmap(months(54)));
        expect(cells[0].height).toBeCloseTo(rows[1] - rows[0], 6);
    });

    it('stands each value label at the middle of its cell', async () => {
        const { row, labels } = await drawn(heatmap(months(54), { chartProperties: { showValueLabels: true } }));
        for (const cell of row.slice(0, 12)) {
            const label = labels.find((t: any) => Math.abs(t.y - (cell.y + cell.height / 2)) < 1 && Math.abs(t.x - (cell.x + cell.width / 2)) < cell.width / 2);
            expect(label).toBeDefined();
            expect(label.x).toBeCloseTo(cell.x + cell.width / 2, 6);
        }
    });

    it('still plans its time ticks on a UTC scale', () => {
        const spec: any = heatmap(months(54));
        expect(spec.encoding.x.scale.type).toBe('utc');
        expect(spec.encoding.x.axis.values.length).toBeGreaterThan(0);
        expect(spec.encoding.x.scale.domain).toBeUndefined();
    });

    it('keeps a measured range a bar: a bullet chart\'s zones still take the house band', () => {
        // The theme's band rule still thins rects that run a value range from x to x2.
        const spec: any = assembleVegaLite({
            data: { values: [{ metric: 'Revenue', actual: 70, target: 80, poor: 40, ok: 70, good: 100 }] },
            semantic_types: { metric: 'Category', actual: 'Quantity', target: 'Quantity', poor: 'Quantity', ok: 'Quantity', good: 'Quantity' },
            chart_spec: { chartType: 'Bullet Chart', encodings: { y: 'metric', x: 'actual', goal: 'target' } },
            theme_spec: 'economist',
        } as any);
        const zones: any[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object') return;
            const mark = typeof node.mark === 'string' ? node.mark : node.mark?.type;
            if (mark === 'rect' && node.encoding?.x2) zones.push(node);
            for (const value of Object.values(node)) walk(value);
        };
        walk(spec);
        expect(zones.length).toBeGreaterThan(0);
        for (const zone of zones) expect(zone.encoding.y?.scale?.paddingInner ?? spec.encoding?.y?.scale?.paddingInner).toBeGreaterThan(0);
    });
});

describe('calendar steps', () => {
    it('reads months, quarters and days, and nothing off the calendar', () => {
        expect(calendarStep(months(6))).toEqual({ unit: 'month', step: 1 });
        expect(calendarStep(['2024-01', '2024-04', '2024-07', '2024-10'])).toEqual({ unit: 'month', step: 3 });
        expect(calendarStep(['2024-01-01', '2024-01-02', '2024-01-04'])).toEqual({ unit: 'day', step: 1 });
        expect(calendarStep(['2024-01-01T10:30:00Z', '2024-01-01T11:30:00Z'])).toBeUndefined();
    });
});
