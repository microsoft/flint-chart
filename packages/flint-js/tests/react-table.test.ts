import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlintTable, emphasizedRows, nextSort, sortedRows, tableNotes } from '../src/react';
import { vegaLiteTable } from '../src/vegalite/assemble';
import type { ChartAssemblyInput } from '../src/core/types';
import type { ChartUpdate } from '../src/interactive';

const table = vegaLiteTable({
    data: { values: [{ region: 'Europe', revenue: 27 }, { region: 'Americas', revenue: 34 }, { region: 'Asia', revenue: 17 }] },
    theme_spec: 'powerbi',
    chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'region' }, y: { field: 'revenue' } } },
} as ChartAssemblyInput);
const emphasize = (region: string): ChartUpdate => ({
    id: 'pick',
    ops: [{ op: 'set-style', targets: [{ select: { key: { region } } }], value: { state: 'emphasized' } }],
});

describe('FlintTable', () => {
    it('draws one row per drawn row in the table\'s theme', () => {
        const html = renderToStaticMarkup(createElement(FlintTable, { table }));
        expect(html.match(/<tr/g)).toHaveLength(4);
        expect(html).toContain('--flint-table-bg:#1b1a19');
        expect(html).toContain('Americas');
    });

    it('scrolls only the rows: the heading and the notes sit outside the scrolling box', () => {
        const titled = { ...table, heading: { title: 'Countries', style: { title: table.style.header, subtitle: table.style.body } } };
        const html = renderToStaticMarkup(createElement(FlintTable, { table: titled }));
        expect(html).toMatch(/<div class="flint-table-heading">.*<\/div><div class="flint-table-scroll"><table>.*<\/table><\/div>/);
    });

    it('carries the chart\'s theme furniture and source, and draws the source at the foot', () => {
        const economist = vegaLiteTable({
            data: { values: [{ region: 'Europe', revenue: 27 }, { region: 'Asia', revenue: 17 }] },
            theme_spec: 'economist',
            chart_spec: { chartType: 'Table', title: 'Revenue', source: 'Source: Company ledger', encodings: {} },
        } as ChartAssemblyInput);
        expect(economist.furniture?.header?.pieces.length).toBeGreaterThan(0);
        expect(economist.furniture?.source?.lines.length).toBeGreaterThan(0);
        const html = renderToStaticMarkup(createElement(FlintTable, { table: economist }));
        expect(html).toMatch(/<\/div><div class="flint-table-source"[^>]*>.*Company ledger/);
        expect(html).not.toMatch(/Source:.*Source:/);
        expect(table.furniture?.header).toBeUndefined();
    });

    it('mutes the rows an emphasis leaves out', () => {
        const html = renderToStaticMarkup(createElement(FlintTable, { table, updates: [emphasize('Asia')] }));
        expect(html.match(/opacity:0\.35/g)).toHaveLength(2);
        expect(html).toContain('data-emphasized="true"');
    });

    it('reads emphasis only from set-style layers that emphasize', () => {
        const test = emphasizedRows(table, [emphasize('Europe')])!;
        expect(table.rows.map((_row, i) => test(i))).toEqual([true, false, false]);
        const muted: ChartUpdate = { id: 'm', ops: [{ op: 'set-style', targets: [{ select: { key: { region: 'Asia' } } }], value: { state: 'muted' } }] };
        expect(emphasizedRows(table, [muted])).toBeNull();
    });

    it('sorts a measure descending first, then ascending, then as drawn', () => {
        const first = nextSort(table, null, 1);
        expect(first).toEqual({ column: 1, descending: true });
        expect(sortedRows(table, first).map((i) => table.rows[i][0].text)).toEqual(['Americas', 'Europe', 'Asia']);
        const second = nextSort(table, first, 1);
        expect(second).toEqual({ column: 1, descending: false });
        expect(nextSort(table, second, 1)).toBeNull();
        expect(nextSort(table, null, 0)).toEqual({ column: 0, descending: false });
    });

    it('notes rows it leaves out', () => {
        expect(tableNotes(table, 3)).toEqual([]);
        expect(tableNotes(table, 2)).toEqual(['2 of 3 rows shown']);
    });
});
