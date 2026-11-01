// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { alignBandOrders } from '../src/vegalite/theme';

/**
 * Bars sorted by their value stand in that order under every house. A house's value labels and
 * row names draw on the bars' band; Vega-Lite unions the layers' domains and drops a sort the
 * union cannot keep, so the bars came out in name order — or, for row names above the bars, the
 * chart did not compile at all.
 */

const THEMES = ['datawrapper', 'nyt', 'economist', 'swiss', 'nature', 'mckinsey', 'powerbi', 'powerbi-light',
    'pop', 'cartoon', 'apple', 'de-stijl', 'bbc', 'material'];

const LONG = [
    ['Only a complaint, summons and service', 49.4],
    ['Government attorney appeared', 26.6],
    ['Served', 33.1],
    ['Default judgment entered against the defendant', 13.6],
    ['Case dismissed for want of prosecution', 1.9],
] as const;

/** The band's drawn order and the sort warnings Vega-Lite gave compiling it. */
async function drawnOrder(spec: any, band: 'x' | 'y'): Promise<{ order: unknown[]; warnings: string[] }> {
    const warnings: string[] = [];
    const logger: any = {
        level: () => logger, info: () => logger, debug: () => logger, error: () => logger,
        warn: (...args: unknown[]) => { warnings.push(args.join(' ')); return logger; },
    };
    const view = new View(parse(compile(spec, { logger }).spec), { renderer: 'none' });
    await view.runAsync();
    return { order: view.scale(band).domain(), warnings: warnings.filter((warning) => /sort/i.test(warning)) };
}

const chart = (names: 'long' | 'short', horizontal: boolean, sortOrder: 'ascending' | 'descending', theme_spec?: string): any => {
    const values = LONG.map(([k, v], index) => ({ k: names === 'long' ? k : 'ABCDE'[index], v }));
    const encodings = horizontal
        ? { x: { field: 'v' }, y: { field: 'k', sortBy: 'x', sortOrder } }
        : { y: { field: 'v' }, x: { field: 'k', sortBy: 'y', sortOrder } };
    const spec: any = assembleVegaLite({
        data: { values }, semantic_types: { k: 'Category', v: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings, canvasSize: { width: 400, height: 300 } },
        ...(theme_spec ? { theme_spec } : {}),
    } as any);
    const expected = [...values].sort((a, b) => (sortOrder === 'descending' ? b.v - a.v : a.v - b.v)).map((row) => row.k);
    return { spec, expected };
};

describe('bars sorted by value under a house', () => {
    it('stand in value order in every house, with no sort dropped', async () => {
        for (const theme of THEMES) {
            for (const names of ['long', 'short'] as const) {
                for (const horizontal of [true, false]) {
                    const { spec, expected } = chart(names, horizontal, 'descending', theme);
                    const { order, warnings } = await drawnOrder(spec, horizontal ? 'y' : 'x');
                    expect(order, `${theme} ${names} ${horizontal ? 'horizontal' : 'vertical'}`).toEqual(expected);
                    expect(warnings, theme).toEqual([]);
                }
            }
        }
    });

    it('compile with names above the bars, sorted either way', async () => {
        for (const sortOrder of ['ascending', 'descending'] as const) {
            const { spec, expected } = chart('long', true, sortOrder, 'datawrapper');
            const names = spec.layer.find((layer: any) => layer.name === 'row-names');
            expect(names).toBeDefined();
            expect(names.encoding.y.sort).toEqual(expected);
            expect((await drawnOrder(spec, 'y')).order).toEqual(expected);
        }
    });

    it('sum a category’s rows, as Vega-Lite sorts a stacked bar', async () => {
        const values = [
            { k: 'Alpha', v: 10 }, { k: 'Alpha', v: 10 }, { k: 'Alpha', v: 10 }, { k: 'Beta', v: 25 }, { k: 'Gamma', v: 5 },
        ];
        const spec = {
            data: { values }, config: { mark: { tooltip: true } },
            layer: [
                { mark: 'bar', encoding: { y: { field: 'k', type: 'nominal', sort: '-x' }, x: { field: 'v', type: 'quantitative' } } },
                { mark: 'text', transform: [{ filter: 'datum.v > 5' }], encoding: { y: { field: 'k', type: 'nominal', sort: '-x' }, x: { field: 'v', type: 'quantitative' }, text: { field: 'v' } } },
            ],
        };
        alignBandOrders(spec, values);
        expect(spec.layer.map((layer) => layer.encoding.y.sort)).toEqual([['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta', 'Gamma']]);
    });

    it('resolve a sort by a field or by an encoding the same way', () => {
        const values = [{ k: 'P', v: 1 }, { k: 'Q', v: 3 }, { k: 'R', v: 2 }];
        for (const sort of [{ field: 'v', op: 'max', order: 'descending' }, { encoding: 'x', order: 'descending' }]) {
            const spec = { layer: [
                { mark: 'bar', encoding: { y: { field: 'k', type: 'nominal', sort }, x: { field: 'v', type: 'quantitative' } } },
                { mark: 'text', encoding: { y: { field: 'k', type: 'nominal', sort }, x: { field: 'v', type: 'quantitative' } } },
            ] };
            alignBandOrders(spec, values);
            for (const layer of spec.layer) expect(layer.encoding.y.sort).toEqual(['Q', 'R', 'P']);
        }
    });

    it('leave alone a band one layer draws, a stated order, rows a transform reshapes, and panels sorted each for itself', () => {
        const values = [{ k: 'P', v: 1 }, { k: 'Q', v: 3 }];
        const layer = (sort: any) => [
            { mark: 'bar', encoding: { y: { field: 'k', type: 'nominal', sort }, x: { field: 'v', type: 'quantitative' } } },
            { mark: 'text', encoding: { y: { field: 'k', type: 'nominal', sort }, x: { field: 'v', type: 'quantitative' } } },
        ];
        const cases: any[] = [
            { mark: 'bar', encoding: { y: { field: 'k', type: 'nominal', sort: '-x' }, x: { field: 'v', type: 'quantitative' } } },
            { layer: layer(['Q', 'P']) },
            { layer: layer('descending') },
            { transform: [{ filter: 'datum.v > 1' }], layer: layer('-x') },
            { resolve: { scale: { y: 'independent' } }, layer: layer('-x') },
        ];
        for (const spec of cases) {
            const before = structuredClone(spec);
            alignBandOrders(spec, values);
            expect(spec).toEqual(before);
        }
    });
});
