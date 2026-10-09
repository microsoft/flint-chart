import { describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { compile } from 'vega-lite';
import '../src/vegalite/interactive';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { navigate } from '../src/interactive/interactions';
import { addVegaLiteInteractions, findVegaAxisScale, injectVegaNavigationSignals } from '../src/vegalite/interactions/compile';
import {
    bindLiveLayout,
    LIVE_LAYOUT_SIGNAL,
    liveLayoutOf,
    liveLayoutPlanner,
    vegaLiteTemporalAxisPlans,
} from '../src/vegalite/interactions/live-layout';
import type { ChartAssemblyInput } from '../src/core/types';

const MONTHS = Array.from({ length: 121 }, (_, index) => {
    const date = new Date(Date.UTC(2015, 7 + index, 1));
    return date.toISOString().slice(0, 7);
});
const ROWS = MONTHS.flatMap((Month, index) => ['Bananas', 'Eggs', 'Whole milk'].map((Food, series) => ({
    Month,
    Food,
    Price: 1 + series + Math.sin(index / 9 + series) * 0.5 + index / 60,
})));

const input = (rows: Record<string, unknown>[], cornerRadius = 0): ChartAssemblyInput => ({
    data: { values: rows },
    semantic_types: { Month: 'YearMonth', Price: { semanticType: 'Price', unit: 'USD' }, Food: 'Category' },
    theme_spec: { extends: 'datawrapper', geometry: { band: { cornerRadius } } },
    options: { addTooltips: false, targetBandAR: 0 },
    chart_spec: {
        chartType: 'Stacked Bar Chart',
        encodings: { x: 'Month', y: 'Price', color: 'Food' },
        baseSize: { width: 816, height: 416 },
        canvasSize: { width: 816, height: 416 },
    },
});

type Item = Record<string, any>;

function items(view: View, test: (item: Item) => boolean): Item[] {
    const found: Item[] = [];
    const walk = (item: Item | undefined): void => {
        if (!item) return;
        if (test(item)) found.push(item);
        for (const child of item.items ?? []) walk(child);
    };
    walk((view.scenegraph() as any).root);
    return found;
}

const axisLabels = (view: View, scale: string): Item[] => items(view, (item) =>
    item.mark?.role === 'axis-label' && item.mark.group?.datum?.scale === scale && !!item.text);
const shownLabels = (view: View): string[] => items(view, (item) => item.mark?.marktype === 'text'
    && item.mark.role === 'mark' && item.opacity !== 0 && !!item.text).map((item) => String(item.text)).sort();
const bars = (view: View): Item[] => items(view, (item) => item.mark?.marktype === 'rect'
    && item.mark.role === 'mark' && typeof item.datum?.Month !== 'undefined' && item.width > 0);

function liveChart(cornerRadius = 0) {
    const full = input(ROWS, cornerRadius);
    const spec = assembleVegaLite({ ...full, options: { ...full.options, liveLayoutSignal: LIVE_LAYOUT_SIGNAL } }) as any;
    const plan = addVegaLiteInteractions(spec, [navigate({ axes: 'x' })])!;
    const vega = compile(spec).spec as any;
    const xScale = findVegaAxisScale(vega, 'x')!.name;
    const yScale = findVegaAxisScale(vega, 'y')!.name;
    const planner = liveLayoutPlanner(full, 'Month', liveLayoutOf(spec, 'Month'));
    expect(bindLiveLayout(vega, xScale, yScale, planner)).toBe(true);
    const axes = injectVegaNavigationSignals(vega, plan.navigationChannels, vegaLiteTemporalAxisPlans(spec));
    return { vega, planner, xScale, yScale, navigation: axes.x!.signal };
}

describe('live layout of a navigated bar chart', () => {
    // Rounded stacked bars compile to one group per stack instead of plain rects.
    it.each([[0, 121, 0], [40, 24, 0], [60, 6, 0], [40, 24, 2], [60, 6, 2]])('matches a fresh compile of months %i..+%i (corner radius %i)', async (first, count, cornerRadius) => {
        const shown = ROWS.filter((row) => MONTHS.indexOf(row.Month) >= first && MONTHS.indexOf(row.Month) < first + count);
        const freshSpec = compile(assembleVegaLite(input(shown, cornerRadius)) as any).spec;
        const fresh = new View(parse(freshSpec), { renderer: 'none' });
        await fresh.runAsync();
        const freshX = findVegaAxisScale(freshSpec as any, 'x')!.name;
        const freshY = findVegaAxisScale(freshSpec as any, 'y')!.name;

        const { vega, planner, xScale, yScale, navigation } = liveChart(cornerRadius);
        for (const expr of [undefined, expressionInterpreter]) {
            const view = new View(parse(vega, null, { ast: true } as any), { renderer: 'none', expr } as any);
            await view.runAsync();
            // The fresh chart's x domain covers exactly the months it shows, so the same domain is the window.
            const domain = (fresh.scale(freshX).domain() as Date[]).map((value) => +value);
            view.signal(navigation, domain);
            view.signal(LIVE_LAYOUT_SIGNAL, planner.layoutFor(domain));
            await view.runAsync();

            for (const [liveScale, freshScale] of [[xScale, freshX], [yScale, freshY]]) {
                const live = axisLabels(view, liveScale);
                const expected = axisLabels(fresh, freshScale);
                expect(live.length).toBeGreaterThan(0);
                expect(live[0].fontSize).toBe(expected[0].fontSize);
                expect(live[0].angle ?? 0).toBe(expected[0].angle ?? 0);
            }
            const tickTexts = (target: View, scale: string): string[] => axisLabels(target, scale).map((item) => String(item.text)).sort();
            expect(tickTexts(view, xScale)).toEqual(tickTexts(fresh, freshX));
            expect(view.scale(yScale).domain()).toEqual(fresh.scale(freshY).domain());

            const stepPixels = (target: View, scale: string): number => {
                const [start, end] = target.scale(scale).domain() as Date[];
                return Math.abs(target.scale(scale).range()[1] - target.scale(scale).range()[0]) * planner.step / (+end - +start);
            };
            expect(shownLabels(view)).toEqual(shownLabels(fresh));
            const liveShare = bars(view)[0].width / stepPixels(view, xScale);
            const freshShare = bars(fresh)[0].width / stepPixels(fresh, freshX);
            expect(liveShare).toBeCloseTo(freshShare, 1);
        }
    });

    it('keeps one layout object while the same months are in view', () => {
        const { planner } = liveChart();
        const at = (index: number): number => Date.parse(`${MONTHS[index]}-01`);
        const window = planner.layoutFor([at(40), at(63)]);
        expect(planner.layoutFor([at(40) + 864e5, at(63) - 864e5])).toBe(window);
        expect(planner.layoutFor(null)).toBe(planner.initial);
    });
});
