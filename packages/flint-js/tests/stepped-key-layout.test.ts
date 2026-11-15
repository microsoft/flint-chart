// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { OMNI_VIZ_GAME_ORDER, OMNI_VIZ_ROWS } from '../src/test-data';

/**
 * A stepped colour key beside a short plot runs about the plot's height. Vega-Lite draws a binned
 * ramp as one bar, reading its length from the config, which a theme sizes for a row of bins above
 * the plot; a key the canvas fit moves beside a short plot would otherwise hang far below it. Drawn
 * upright, the bar is held to the plot's height, down to a line of label a bin.
 */

const years = [2023, 2024, 2025];
const ROWS = years.flatMap((year) => OMNI_VIZ_ROWS.map(({ period, game, newUsers }: any) => ({ period: `${year}${period.slice(4)}`, game, newUsers })));
const PERIODS = [...new Set(ROWS.map((row) => row.period))].sort();

const input = (games: number, months: number) => {
    const keep = new Set((OMNI_VIZ_GAME_ORDER as readonly string[]).slice(0, games));
    const from = PERIODS[PERIODS.length - months];
    return {
        data: { values: ROWS.filter((row) => keep.has(row.game) && row.period >= from) },
        semantic_types: { period: 'YearMonth', game: 'Category', newUsers: 'Profit' },
        field_display_names: { newUsers: 'Net new users' },
        chart_spec: {
            chartType: 'Heatmap', title: 'Net new users by game', subtitle: 'Monthly net change in active users',
            encodings: { x: 'period', y: 'game', color: { field: 'newUsers', aggregate: 'sum' } },
            baseSize: { width: 480, height: 330 }, canvasSize: { width: 700, height: 500 },
        },
        theme_spec: 'economist',
    } as any;
};

const silent = { warn() {}, info() {}, debug() {}, error() {}, level() { return this; } } as any;

/** The key and the plot as Vega draws them. */
async function drawn(spec: any) {
    const view = new View(parse(compile(spec, { logger: silent }).spec), { renderer: 'none' });
    view.logger(silent);
    await view.runAsync();
    let legend: any;
    const rects: any[] = [];
    const walk = (node: any) => {
        if (!node) return;
        if (node.role === 'legend' && node.bounds && !legend) legend = node.bounds;
        if (node.marktype === 'rect' && node.role === 'mark') rects.push(node);
        for (const item of node.items ?? []) walk(item);
    };
    walk(view.scenegraph().root);
    const cells = rects.sort((a, b) => b.items.length - a.items.length)[0].items;
    const top = Math.min(...cells.map((cell: any) => cell.y));
    return { legend: { height: legend.y2 - legend.y1 }, plotHeight: Math.max(...cells.map((cell: any) => cell.y + cell.height)) - top };
}

const SIZES: Array<[number, number]> = [[2, 18], [3, 18], [4, 22], [8, 24]];

describe('a stepped colour key', () => {
    it('beside a short plot, reaches no further below it than a line of label a bin needs', async () => {
        let beside = 0;
        for (const [games, months] of SIZES) {
            const spec: any = assembleVegaLite(input(games, months));
            const legend = spec.encoding.color.legend;
            if (legend.orient !== 'right') continue;
            beside++;
            const { legend: drawnKey, plotHeight } = await drawn(spec);
            const bins = spec.encoding.color.scale.range.length;
            const fontSize = legend.labelFontSize ?? spec.config.legend.labelFontSize ?? 10;
            const floor = bins * (fontSize + 2);
            expect(spec.config.legend.gradientLength, `${games} × ${months}`).toBeLessThanOrEqual(Math.max(plotHeight, Math.round(floor)));
            // The bar, its title above and its end labels: no more than a title's line past the floor's bar.
            expect(drawnKey.height, `${games} × ${months}`).toBeLessThanOrEqual(Math.max(plotHeight, floor) + 32);
        }
        // Short plots move the key beside them: the case is covered.
        expect(beside).toBeGreaterThan(0);
    });

    it('above a taller plot, keeps the row the theme sized for its labels', () => {
        const spec: any = assembleVegaLite(input(8, 24));
        expect(spec.encoding.color.legend.orient).toBe('top');
        expect(spec.config.legend.gradientLength).toBeGreaterThan(200);
    });
});
