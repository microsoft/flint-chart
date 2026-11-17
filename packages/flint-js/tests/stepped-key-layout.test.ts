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
            // Months as bands: the layout a short plot moves its key beside.
            chartProperties: { xAxisType: 'nominal' },
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
    walk((view.scenegraph() as any).root);
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

/**
 * A colour ramp keeps Vega's 16 px on a canvas with the default room, and slims only on a smaller,
 * squeezed one, so its key does not outweigh the marks.
 */
describe('colour ramp thickness follows the plot', () => {
    const CITIES = ['Singapore', 'Delhi', 'Cairo', 'Sydney', 'Seattle', 'Moscow'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const heatmap = (width: number, height: number) => assembleVegaLite({
        data: { values: CITIES.flatMap((City, c) => MONTHS.map((Month, m) => ({ City, Month, Temp: 5 + ((c * 7 + m * 3) % 25) }))) },
        semantic_types: { City: 'Category', Month: 'Category', Temp: 'Temperature' },
        chart_spec: {
            chartType: 'Heatmap', title: 'Monthly temperature by city', encodings: { x: 'Month', y: 'City', color: 'Temp' },
            baseSize: { width, height }, canvasSize: { width, height },
        },
        theme_spec: 'swiss',
    } as any) as any;

    it('keeps the default ramp at the house\'s own size and slims it on a smaller canvas', () => {
        // Swiss lays its charts out at 420 × 320.
        expect(heatmap(420, 320).config?.legend?.gradientThickness).toBeUndefined();
        expect(heatmap(1200, 900).config?.legend?.gradientThickness).toBeUndefined();
        const small = heatmap(260, 180).config?.legend?.gradientThickness;
        expect(small).toBeGreaterThanOrEqual(8);
        expect(small).toBeLessThan(16);
    });
});

/**
 * A stepped key above a small chart: its bins stand as one bar, so its title stays beside it rather
 * than over it, and its text is set no larger than the axis labels the crowded rows came down to.
 */
describe('a stepped key on a squeezed chart', () => {
    const PRICES: Array<[string, number]> = [
        ['Switzerland', 8.1], ['Norway', 6.9], ['United States', 5.7], ['Euro area', 5.5], ['UK', 4.9], ['Brazil', 4.5],
        ['Mexico', 3.9], ['China', 3.5], ['Japan', 3.2], ['Egypt', 2.7], ['South Africa', 2.6], ['India', 2.5],
    ];
    const bigMac = (width = 360, height = 240) => assembleVegaLite({
        data: { values: PRICES.map(([Country, Price]) => ({ Country, Price, 'vs US price': Math.round((Price / 5.7 - 1) * 100) / 100 })) },
        semantic_types: { Country: 'Country', Price: 'Quantity', 'vs US price': 'PercentageChange' },
        chart_spec: {
            chartType: 'Bar Chart', title: 'The Big Mac index, 2023', encodings: { x: 'Price', y: 'Country', color: 'vs US price' },
            baseSize: { width, height }, canvasSize: { width, height },
        },
        theme_spec: 'datawrapper',
    } as any) as any;

    it('keeps the title beside the bar and the key text at the axis labels\' size', () => {
        const spec = bigMac();
        const legend = JSON.stringify(spec).match(/"legend":\{"format"[^}]*\}/)?.[0] ?? '';
        expect(legend).toContain('"titleOrient":"left"');
        const axis = spec.config.axisY.labelFontSize;
        expect(spec.config.legend.labelFontSize).toBeLessThanOrEqual(axis);
        expect(spec.config.legend.titleFontSize).toBeLessThanOrEqual(spec.config.title.fontSize);
    });
});
