// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleECharts, assembleVegaLite } from '../src';
import { classColors, MAX_CLASSES_PER_SIDE, roundColorClasses } from '../src/core/color-controls';

/**
 * A stepped colour scale is cut at round values: the step is round, a diverging field's pivot is a
 * break, and each side of the pivot takes only the classes its data reaches. Equal cuts of a domain
 * made symmetric about the pivot printed "−20, −7, 7, 20" for breaks at ±20.1 and ±6.7 and left the
 * darkest cold classes empty.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WARM: Record<string, number[]> = {
    Singapore: [26.5, 27.1, 27.6, 28, 28.3, 28.3, 27.9, 27.9, 27.6, 27.6, 27, 26.4],
    Delhi: [14.2, 17.4, 22.9, 29, 32.8, 33.5, 31.1, 30, 29.5, 26.3, 20.7, 15.9],
    Cairo: [14, 15.1, 17.6, 21.3, 24.8, 27.2, 27.7, 27.7, 26, 23.4, 19.3, 15.6],
    Sydney: [23.5, 23.4, 22.1, 19.5, 16.6, 14.2, 13.4, 14.5, 17.2, 19.2, 20.8, 22.4],
    Seattle: [5.3, 6.2, 7.9, 10.2, 13.5, 16.2, 19.2, 19.4, 16.6, 11.7, 7.7, 5.1],
    Moscow: [-6.5, -6.7, -1, 6.7, 13.2, 17, 19.2, 17, 11.3, 5.6, -1.2, -5.2],
};
const ROWS = Object.entries(WARM).flatMap(([city, temps]) => temps.map((temp, i) => ({ city, month: MONTHS[i], temp })));
const TEMPS = ROWS.map((row) => row.temp);

const heatmap = (color: unknown, theme?: string): any => ({
    data: { values: ROWS },
    semantic_types: { city: 'Category', month: 'Month', temp: { semanticType: 'Temperature', unit: '°C' } },
    chart_spec: { chartType: 'Heatmap', encodings: { x: 'month', y: 'city', color }, canvasSize: { width: 600, height: 360 } },
    ...(theme ? { theme_spec: theme } : {}),
});

/** The labels the compiled key draws, and the warnings Vega-Lite gave compiling it. */
async function drawnKey(spec: any): Promise<{ labels: string[]; warnings: string[] }> {
    const warnings: string[] = [];
    const logger: any = {
        level: () => logger, info: () => logger, debug: () => logger, error: () => logger,
        warn: (...args: unknown[]) => { warnings.push(args.join(' ')); return logger; },
    };
    const svg = await new View(parse(compile(spec, { logger }).spec), { renderer: 'none' }).toSVG();
    const key = svg.slice(svg.indexOf('role-legend'), svg.indexOf('role-legend-title'));
    return { labels: [...key.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].trim()).filter(Boolean), warnings };
}

describe('round colour classes', () => {
    it('break at the pivot on a round step, each side taking only the classes its data reaches', () => {
        expect(roundColorClasses(TEMPS, 5, 0)).toEqual({ breaks: [0, 10, 20, 30], lo: -10, hi: 40, below: 1, above: 4 });
    });

    it('count from zero where there is no pivot', () => {
        const sales = [40, 220, 515, 760, 980, 1201];
        expect(roundColorClasses(sales, 5)).toEqual({ breaks: [250, 500, 750, 1000], lo: 0, hi: 1250 });
    });

    it('hold an author’s count: closed where a round step gives it, else the outer two open', () => {
        const net = [-1400, -1100, -800, -400, -100, 200, 600, 900, 1200];
        expect(roundColorClasses(net, 4, 0, { exact: true })).toEqual({ breaks: [-1000, 0, 1000], lo: -2000, hi: 2000, below: 2, above: 2 });
        const wide = [-53901, -20000, 5000, 43635];
        expect(roundColorClasses(wide, 4, 0, { exact: true })).toEqual({ breaks: [-25000, 0, 25000], below: 2, above: 2 });
    });

    it('do not step values that do not spread', () => {
        expect(roundColorClasses([3, 3, 3], 5)).toBeUndefined();
    });

    it('colour the short arm from its pale end, at the long arm’s steps', () => {
        const ramp = ['#2166ac', '#f7f7f7', '#b2182b'];
        const colors = classColors(ramp, { breaks: [0, 10, 20, 30], lo: -10, hi: 40, below: 1, above: 4 });
        expect(colors).toHaveLength(5);
        expect(colors[4]).toBe('#b2182b');
        // The one cold class is the palest blue of an eight-step ramp, not its darkest.
        expect(colors[0]).not.toBe('#2166ac');
        const blue = parseInt(colors[0].slice(5, 7), 16) - parseInt(colors[0].slice(1, 3), 16);
        expect(blue).toBeGreaterThan(0);
    });
});

describe('a stepped key on a heatmap', () => {
    it('prints round breaks under a binning house, with no warning', async () => {
        for (const theme of ['pop', 'swiss', 'cartoon', 'de-stijl']) {
            const spec: any = assembleVegaLite(heatmap('temp', theme));
            expect(spec.encoding.color.scale).toMatchObject({ type: 'threshold', domain: [0, 10, 20, 30] });
            const { labels, warnings } = await drawnKey(spec);
            expect(labels.slice(0, 4), theme).toEqual(['0', '10', '20', '30']);
            expect(warnings, theme).toEqual([]);
        }
    });

    it('prints round breaks for an author’s bins, on a named scheme or on stops', async () => {
        for (const color of [{ field: 'temp', bins: 5 }, { field: 'temp', bins: 5, scheme: ['#2166ac', '#f7f7f7', '#b2182b'] }]) {
            const spec: any = assembleVegaLite(heatmap(color));
            expect(spec.encoding.color.scale.domain).toEqual([0, 10, 20, 30]);
            expect((await drawnKey(spec)).labels.slice(0, 4)).toEqual(['0', '10', '20', '30']);
        }
    });

    it('keeps the round classes in ECharts', () => {
        const option: any = assembleECharts(heatmap({ field: 'temp', bins: 5 }));
        const vm = Array.isArray(option.visualMap) ? option.visualMap[0] : option.visualMap;
        expect(vm.pieces.map((piece: any) => piece.label)).toEqual(['\u221210 \u2013 0', '0 \u2013 10', '10 \u2013 20', '20 \u2013 30', '30 \u2013 40']);
        expect([vm.min, vm.max]).toEqual([-10, 40]);
    });
});

describe('classes about a pivot', () => {
    const ramp = ['#2166ac', '#f7f7f7', '#b2182b'];

    it('take no more than four a side where a coarser step holds the field', () => {
        const lopsided = [-0.4, 1, 5, 12, 22, 35, 48, 61, 75];
        const classes = roundColorClasses(lopsided, 5, 0)!;
        expect(Math.max(classes.below!, classes.above!)).toBeLessThanOrEqual(MAX_CLASSES_PER_SIDE);
        expect(classes.breaks).toEqual([0, 20, 40, 60]);
    });

    it('show the sign beside a pivot that is a break: neither neighbour is the ramp\'s neutral', () => {
        const colors = classColors(ramp, roundColorClasses([-14, -3, 4, 18, 27], 5, 0)!);
        expect(colors).not.toContain('#f7f7f7');
    });

    it('centre a neutral class on the pivot, a step wide or as wide as stated', () => {
        const r = [-0.82, -0.4, -0.1, 0.05, 0.3, 0.6, 0.9];
        const auto = roundColorClasses(r, 5, 0, { neutral: 'auto' })!;
        expect(auto.neutral).toBe(true);
        const width = auto.breaks[1] - auto.breaks[0];
        const centre = auto.breaks.findIndex((edge) => edge > 0);
        expect(auto.breaks[centre] + auto.breaks[centre - 1]).toBeCloseTo(0);
        expect(auto.breaks[centre] - auto.breaks[centre - 1]).toBeCloseTo(width);
        expect(classColors(ramp, auto)[auto.below!]).toBe('#f7f7f7');
        const stated = roundColorClasses(r, 5, 0, { neutral: 0.1 })!;
        expect(stated.breaks).toContain(-0.1);
        expect(stated.breaks).toContain(0.1);
    });
});

describe('the neutral class from semantics', () => {
    const grid = (semantic: unknown) => ({
        data: { values: ['a', 'b', 'c', 'd'].flatMap((x, i) => ['p', 'q', 'r'].map((y, j) => ({ x, y, v: Number((-0.8 + 0.15 * i * 3 + 0.12 * j).toFixed(2)) }))) },
        semantic_types: { x: 'Category', y: 'Category', v: semantic },
        chart_spec: { chartType: 'Heatmap', encodings: { x: 'x', y: 'y', color: 'v' } },
        theme_spec: 'swiss',
    }) as any;
    const breaks = (input: any): number[] => {
        let found: number[] | undefined;
        const visit = (node: any) => {
            const enc = node?.encoding?.color;
            if (!found && enc?.legend !== null && enc?.scale?.type === 'threshold') found = enc.scale.domain;
            for (const child of node?.layer ?? []) visit(child);
        };
        visit(assembleVegaLite(input));
        if (!found) throw new Error("no stepped colour scale");
        return found;
    };

    it('centres one on a pivot the type always has, and breaks at one its values merely cross', () => {
        expect(breaks(grid('Correlation'))).not.toContain(0);
        expect(breaks(grid({ semanticType: 'PercentageChange', percentScale: 'fraction' }))).toContain(0);
    });

    it('follows the annotation: a width, or false for a break', () => {
        expect(breaks(grid({ semanticType: 'PercentageChange', percentScale: 'fraction', divergingNeutral: 0.05 }))).toEqual(expect.arrayContaining([-0.05, 0.05]));
        expect(breaks(grid({ semanticType: 'Correlation', divergingNeutral: false }))).toContain(0);
    });
});

describe('a diverging ramp\'s balance', () => {
    it('is reported where its arms differ in lightness at mirrored points', () => {
        const report = (theme: string) => ((assembleVegaLite({ ...heatmap('temp', theme) }) as any)._theme?.report ?? [])
            .filter((entry: any) => entry.code === 'diverging-ramp-unbalanced');
        const pop = report('pop');
        expect(pop).toHaveLength(1);
        expect(pop[0].message).toMatch(/L\*/);
    });
});

describe('an upright stepped key', () => {
    it('runs no longer than the plot beside it, as a continuous ramp does', async () => {
        const height = async (color: unknown) => {
            const spec: any = assembleVegaLite({ ...heatmap(color), chart_spec: { ...heatmap(color).chart_spec, canvasSize: undefined } });
            const svg = await new View(parse(compile(spec).spec), { renderer: 'none' }).toSVG();
            return { spec, height: Number(/<svg[^>]*height="([\d.]+)"/.exec(svg)![1]) };
        };
        const stepped = await height({ field: 'temp', bins: 5 });
        const ramp = await height('temp');
        // Vega-Lite drops a binned key's own length; the config carries the one the plan gave it.
        expect(stepped.spec.config.legend.gradientLength).toBe(stepped.spec.encoding.color.legend.gradientLength);
        expect(stepped.height).toBeLessThanOrEqual(ramp.height + 2);
    });
});
