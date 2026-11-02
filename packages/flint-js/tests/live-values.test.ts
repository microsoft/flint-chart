import { describe, expect, it } from 'vitest';
import { changeset, parse, View } from 'vega';
import { compile } from 'vega-lite';
import { TEST_GENERATORS } from '../src/test-data';
import { openVegaLiteSession } from '../src/vegalite/assemble';
import { withCanvasSize } from '../src/core/compute-layout';
import { advanceLiveValues, bindLiveValues, LIVE_VALUES_SIGNAL, liveValuesChange } from '../src/vegalite/live-values';
import type { ChartAssemblyInput } from '../src/core/types';

function caseInput(testCase: any, theme?: string): ChartAssemblyInput {
    const names = new Map(testCase.fields.map((field: any) => [field.id, field.name]));
    const encodings: Record<string, any> = {};
    for (const [channel, encoding] of Object.entries<any>(testCase.encodingMap)) {
        const field = names.get(encoding?.fieldID);
        if (field) encodings[channel] = { field, ...(encoding.aggregate ? { aggregate: encoding.aggregate } : {}) };
    }
    return {
        data: { values: testCase.data },
        semantic_types: Object.fromEntries(Object.entries<any>(testCase.metadata).map(([field, meta]) => [field, meta.semanticType])),
        ...(theme ? { theme_spec: theme } : {}),
        chart_spec: { chartType: testCase.chartType, encodings, chartProperties: testCase.chartProperties },
        options: testCase.assembleOptions,
    } as ChartAssemblyInput;
}

/**
 * The view's SVG, numbers to a thousandth (a value read through a signal may round differently in
 * the last bit), gradient and clip ids, which count across views, numbered from the first, and each run of
 * sibling lines, paths or texts sorted: a pushed tick list keeps old items where a fresh view
 * orders them anew.
 */
async function svgOf(view: View): Promise<string> {
    await view.runAsync();
    const ids = new Map<string, string>();
    return (await view.toSVG())
        .replace(/-?\d+\.\d+/g, (number) => String(Number(Number(number).toFixed(3))))
        .replace(/(gradient_|clip)\d+/g, (id, kind) => ids.get(id) ?? (ids.set(id, `${kind}${ids.size}`), ids.get(id)!))
        .replace(/(?:<(?:line|path|text) [^>]*\/>|<text [^>]*>[^<]*<\/text>)+/g, (run) =>
            (run.match(/<(?:line|path|text) [^>]*\/>|<text [^>]*>[^<]*<\/text>/g) ?? []).sort().join(''));
}

const BASE = { width: 400, height: 320 };

describe('live values', () => {
    it('a pushed resize draws what a fresh compile at that size draws', async () => {
        let pushed = 0;
        for (const type of ['Bar Chart', 'Line Chart', 'Scatter Plot', 'Stacked Bar Chart', 'Grouped Bar Chart', 'Heatmap', 'Area Chart']) {
            for (const testCase of TEST_GENERATORS[type]().slice(0, 4)) {
                for (const theme of [undefined, 'nyt']) {
                    const session = openVegaLiteSession(withCanvasSize(caseInput(testCase, theme), BASE));
                    const mounted = compile(session.spec as any).spec as any;
                    const live = bindLiveValues(mounted);
                    const view = new View(parse(mounted), { renderer: 'none' });
                    await view.runAsync();
                    const next = compile(session.replan({ size: { width: 300, height: 250 } }).spec as any).spec as any;
                    const change = liveValuesChange(live, next);
                    if (!change) continue;
                    const advanced = advanceLiveValues(live, next, change);
                    view.signal(LIVE_VALUES_SIGNAL, advanced.values);
                    for (const [name, value] of Object.entries(change.signals)) view.signal(name, value);
                    for (const [name, rows] of Object.entries(change.datasets)) view.change(name, changeset().remove(() => true).insert([...rows]));
                    if (change.width !== undefined) view.width(change.width);
                    if (change.height !== undefined) view.height(change.height);
                    view.resize();
                    // Vega's typings omit runAsync's optional encode-set argument.
                    await (view as View & { runAsync(encode?: string): Promise<View> }).runAsync('enter');
                    const fresh = new View(parse(structuredClone(next)), { renderer: 'none' });
                    const drawn = await svgOf(view);
                    const expected = await svgOf(fresh);
                    let at = 0;
                    while (at < drawn.length && drawn[at] === expected[at]) at += 1;
                    expect(drawn.slice(at - 120, at + 120), `${type} ${testCase.title ?? ''} ${theme ?? ''}`)
                        .toBe(expected.slice(at - 120, at + 120));
                    view.finalize();
                    fresh.finalize();
                    pushed += 1;
                }
            }
        }
        expect(pushed).toBeGreaterThan(20);
    }, 120000);

    it('a layout that draws different parts is not pushed', () => {
        const spec = (legend: boolean) => ({
            width: 200, height: 100,
            scales: [{ name: 'x', type: 'linear', domain: [0, 10], range: 'width' }],
            axes: [{ scale: 'x', orient: 'bottom', labelFontSize: 10 }],
            ...(legend ? { legends: [{ fill: 'x' }] } : {}),
        });
        const live = bindLiveValues(spec(false));
        expect(liveValuesChange(live, spec(false))).toEqual({ values: {}, signals: {}, datasets: {}, furniture: false });
        expect(liveValuesChange(live, spec(true))).toBeNull();
        expect(liveValuesChange(live, { ...spec(false), axes: [{ scale: 'x', orient: 'bottom', labelFontSize: 12 }] })?.values)
            .toEqual({ [live.keys.get('.axes[0].labelFontSize')!.name]: 12 });
    });

    it('reads temporal tick values as times', () => {
        const axis = (dates: string[]) => ({
            axes: [{ scale: 'x', orient: 'bottom', values: dates.map((date) => ({ signal: `datetime("${date}")` })) }],
        });
        const live = bindLiveValues(axis(['2020-01-01T00:00:00.000Z', '2021-01-01T00:00:00.000Z']));
        const change = liveValuesChange(live, axis(['2020-01-01T00:00:00.000Z']));
        expect(Object.values(change!.values)).toEqual([[Date.UTC(2020, 0, 1)]]);
    });
});

describe('session replans', () => {
    const testCase = TEST_GENERATORS['Bar Chart']()[0];

    it('a size change plans as a fresh compile at that size does', () => {
        const session = openVegaLiteSession(withCanvasSize(caseInput(testCase), BASE));
        const small = { width: 280, height: 220 };
        const fresh = openVegaLiteSession(withCanvasSize(caseInput(testCase), small));
        expect(JSON.stringify(session.replan({ size: small }).spec)).toBe(JSON.stringify(fresh.spec));
        expect(JSON.stringify(session.replan({ size: BASE }).spec)).toBe(JSON.stringify(session.spec));
    });

    it('a window plans the rows it keeps, as the same rows kept by a test do', () => {
        const input = caseInput(TEST_GENERATORS['Line Chart']()[0]);
        const session = openVegaLiteSession(input);
        const xField = (input.chart_spec.encodings as any).x.field;
        const positions = (input.data.values ?? []).map((row: any) => Date.parse(String(row[xField]))).sort((a, b) => a - b);
        const window: [number, number] = [positions[2], positions[positions.length - 3]];
        const byWindow = session.replan({ window: { x: window } });
        const byKeep = session.replan({ keep: (row: any) => {
            const at = row[xField] instanceof Date ? row[xField].getTime() : Date.parse(String(row[xField]));
            return at >= window[0] && at <= window[1];
        } });
        expect(JSON.stringify(byWindow.spec)).toBe(JSON.stringify(byKeep.spec));
    });

    it('binds the constant of a rule on an encoded channel, keeping its test', () => {
        const spec = (width: number): any => ({
            marks: [{ type: 'line', encode: { update: { strokeWidth: [{ test: 'datum.on', value: width + 1 }, { value: width }] } } }],
        });
        const mounted = spec(2.5);
        const live = bindLiveValues(mounted);
        expect(mounted.marks[0].encode.update.strokeWidth).toEqual([
            { test: 'datum.on', signal: `${LIVE_VALUES_SIGNAL}.v0` },
            { signal: `${LIVE_VALUES_SIGNAL}.v1` },
        ]);
        expect(liveValuesChange(live, spec(2.2))?.values).toEqual({ v0: 3.2, v1: 2.2 });
    });

    it('takes the new rows of an inline dataset that is otherwise unchanged, and nothing else about it', () => {
        const spec = (limit: number, transform: unknown[] = []): any => ({
            data: [{ name: 'rows', values: [{ k: 'a', __limit: limit }], transform }],
            marks: [{ type: 'text', from: { data: 'rows' } }],
        });
        const live = bindLiveValues(spec(93));
        expect(liveValuesChange(live, spec(83))?.datasets).toEqual({ rows: [{ k: 'a', __limit: 83 }] });
        expect(liveValuesChange(live, spec(83, [{ type: 'filter', expr: 'datum.k' }]))).toBeNull();
    });
});
