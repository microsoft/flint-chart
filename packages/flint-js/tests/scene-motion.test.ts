import { describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import { compile as compileVegaLite } from 'vega-lite';
import {
    captureGhosts,
    captureMorphScene,
    captureScene,
    domainPath,
    drawnItemCount,
    identityRepeats,
    injectScaleMotion,
    injectAxisExtentMotion,
    injectAxisMotion,
    injectAxisTickMotion,
    axisTicksSignal,
    axisExtentsAtRest,
    viewRoom,
    injectSceneMotion,
    injectSizeMotion,
    placeOutlineStarts,
    SCENE_CLIP_SIGNAL,
    SCENE_ENTER_SIGNAL,
    SCENE_EXIT_SIGNAL,
    SCENE_FROM_SIGNAL,
    SCENE_OUTLINE_SIGNAL,
    SCENE_T_SIGNAL,
    setSceneExits,
    injectTitleMotion,
    SUBTITLE_DY_SIGNAL,
    TITLE_ORIENT_SIGNAL,
    TITLE_X_SIGNAL,
    TITLE_Y_SIGNAL,
    titlePosition,
} from '../src/vegalite/interactions/scene-motion';
import { INTERACTION_KEY } from '../src/vegalite/interactions/stores';
import { mixItem, type MarkMotion } from '../src/vegalite/interactions/motion-transform';
import { easingCurve, runMotion, transitionEasing, validateTransition } from '../src/interactive/transition';

function barSpec(order: string[]): Record<string, any> {
    return {
        width: 300,
        height: 100,
        signals: [{ name: 'order', value: order }],
        data: [{
            name: 'rows',
            values: [{ k: 'a', v: 10 }, { k: 'b', v: 30 }, { k: 'c', v: 20 }],
            transform: [{ type: 'formula', as: INTERACTION_KEY, expr: 'datum.k' }],
        }],
        scales: [
            { name: 'x', type: 'band', domain: { signal: 'order' }, range: 'width' },
            { name: 'y', type: 'linear', domain: [0, 40], range: 'height' },
        ],
        marks: [{
            type: 'rect',
            name: 'bars',
            from: { data: 'rows' },
            encode: {
                update: {
                    x: { scale: 'x', field: 'k' },
                    width: { scale: 'x', band: 1 },
                    y: { scale: 'y', field: 'v' },
                    y2: { value: 100 },
                    opacity: { signal: "datum.k === 'b' ? 1 : 0.4" },
                    fill: { value: '#2456b8' },
                },
            },
        }],
    };
}

function areaSpec(values: Record<string, number>[], key: string): Record<string, any> {
    return {
        width: 200,
        height: 100,
        data: [{ name: 'rows', values, transform: [{ type: 'formula', as: INTERACTION_KEY, expr: key }] }],
        scales: [
            { name: 'x', type: 'linear', domain: [0, 4], range: 'width' },
            { name: 'y', type: 'linear', domain: [0, 100], range: 'height' },
        ],
        marks: [{
            type: 'area',
            name: 'band',
            from: { data: 'rows' },
            encode: { update: { x: { scale: 'x', field: 'i' }, y: { scale: 'y', field: 'v' }, y2: { scale: 'y', field: 'w' } } },
        }],
    };
}

const vertices = (view: View): any[] => (view.scenegraph() as any).root.items[0].items[0].items;

const bars = (view: View): Record<string, any> => Object.fromEntries(
    (view.scenegraph() as any).root.items[0].items[0].items.map((item: any) => [item.datum.k, item]),
);

describe('scene motion', () => {
    it('moves each keyed item from the captured frame to the new one', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        expect(before.bars.a).toMatchObject({ x: 0, opacity: 0.4 });

        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0).signal('order', ['c', 'b', 'a']);
        await view.runAsync();
        expect(bars(view).a.x).toBe(0);

        view.signal(SCENE_T_SIGNAL, 0.5);
        await view.runAsync();
        expect(bars(view).a.x).toBe(100);
        view.signal(SCENE_T_SIGNAL, 0.75);
        await view.runAsync();
        expect(bars(view).a.x).toBe(150);

        view.signal(SCENE_T_SIGNAL, 1).signal(SCENE_FROM_SIGNAL, null);
        await view.runAsync();
        expect(bars(view).a.x).toBe(200);
    });

    it('keeps Vega\'s own placement of a band axis at rest, and glides it from the captured frame', async () => {
        const axisSpec = (order: string[]): Record<string, any> => ({
            width: 300,
            height: 100,
            signals: [{ name: 'order', value: order }, { name: SCENE_T_SIGNAL, value: 1 }, { name: SCENE_FROM_SIGNAL, value: null }],
            scales: [{ name: 'x', type: 'band', domain: { signal: 'order' }, range: 'width' }],
            axes: [{ scale: 'x', orient: 'bottom', tickBand: 'extent', labelOffset: 3 }],
        });
        const placed = async (spec: Record<string, any>, set?: (view: View) => void): Promise<Record<string, number[]>> => {
            const view = new View(parse(spec), { renderer: 'none' });
            set?.(view);
            await view.runAsync();
            const axis = (view.scenegraph() as any).root.items[0].items[0].items[0];
            const of = (role: string) => axis.items.find((mark: any) => mark.role === role).items.map((item: any) => item.x);
            return { ticks: of('axis-tick'), labels: of('axis-label') };
        };
        const moving = axisSpec(['a', 'b', 'c']);
        injectAxisMotion(moving);
        expect(await placed(moving)).toEqual(await placed(axisSpec(['a', 'b', 'c'])));

        const from = { '__axis:x:axis-label': { a: { x: 250 } } };
        const midway = await placed(moving, (view) => view.signal(SCENE_FROM_SIGNAL, from).signal(SCENE_T_SIGNAL, 0.5));
        expect(midway.labels[0]).toBeCloseTo((250 + 50 + 3) / 2, 6);
    });

    it('matches a mark keyed by one field whole when a new series repeats that field, so the new series arrives', async () => {
        const spec: Record<string, any> = {
            width: 200,
            height: 100,
            data: [{ name: 'rows', values: [{ s: 'A', k: 'a', v: 10 }, { s: 'A', k: 'b', v: 30 }], transform: [{ type: 'formula', as: INTERACTION_KEY, expr: "datum.s + '|' + datum.k" }] }],
            scales: [
                { name: 'x', type: 'band', domain: ['a', 'b'], range: 'width' },
                { name: 'y', type: 'linear', domain: [0, 40], range: 'height' },
            ],
            marks: [{ type: 'symbol', name: 'dots', from: { data: 'rows' }, encode: { update: { x: { scale: 'x', field: 'k' }, y: { scale: 'y', field: 'v' } } } }],
        };
        injectSceneMotion(spec, ['s', 'k']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view, ['s', 'k']);
        expect((before.dots as any)['__flint_identity']).toEqual(['k']);

        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0).signal(SCENE_ENTER_SIGNAL, 0);
        view.data('rows', [{ s: 'A', k: 'a', v: 10 }, { s: 'A', k: 'b', v: 30 }, { s: 'B', k: 'a', v: 20 }, { s: 'B', k: 'b', v: 40 }]);
        await view.runAsync();
        const dots = (view.scenegraph() as any).root.items[0].items[0].items;
        const arriving = dots.filter((item: any) => item.datum.s === 'B');
        expect(arriving.map((item: any) => item.opacity)).toEqual([0, 0]);
        expect(dots.filter((item: any) => item.datum.s === 'A').map((item: any) => item.opacity ?? 1)).toEqual([1, 1]);
    });

    it('fades in an item the captured frame did not draw', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        delete before.bars.c;
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5).signal(SCENE_ENTER_SIGNAL, 0.5);
        await view.runAsync();
        expect(bars(view).c.opacity).toBeCloseTo(0.2);
        expect(bars(view).b.opacity).toBe(1);
    });

    it('names a row by its identity fields, so new values of the same row move rather than swap', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.data[0].transform = [{ type: 'formula', as: INTERACTION_KEY, expr: "datum.k + '|' + datum.v" }];
        injectSceneMotion(spec, ['k']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view, ['k']);
        expect(before.bars.__flint_identity).toEqual(['k']);
        expect(Object.keys(before.bars).filter((key) => !key.startsWith('__flint'))).toEqual(['a', 'b', 'c']);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5);
        view.data('rows', [{ k: 'a', v: 30 }, { k: 'b', v: 30 }, { k: 'c', v: 20 }]);
        await view.runAsync();
        expect(bars(view).a.y).toBe(50);
        expect(bars(view).a.opacity).toBe(0.4);
    });

    it('draws a leaving item where it stood and fades it out', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureGhosts(view);
        view.data('rows', [{ k: 'a', v: 10 }, { k: 'b', v: 30 }]);
        await view.runAsync();
        expect(setSceneExits(view, before, captureGhosts(view))).toBe(1);
        view.signal(SCENE_EXIT_SIGNAL, 0.25);
        await view.runAsync();
        const exits = (view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.role === 'scene-exit').items;
        expect(exits).toHaveLength(1);
        expect(exits[0]).toMatchObject({ x: 200, width: 100 });
        expect(exits[0].opacity).toBeCloseTo(0.3);
        setSceneExits(view, null);
        await view.runAsync();
        expect((view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.role === 'scene-exit').items).toHaveLength(0);
    });

    it('matches by the whole row key when identity keys repeat within a mark', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.data[0].values = [{ k: 'a', v: 10, g: 'x' }, { k: 'b', v: 30, g: 'x' }, { k: 'c', v: 20, g: 'y' }];
        injectSceneMotion(spec, ['g']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view, ['g']);
        expect(Object.keys(before.bars).sort()).toEqual(['__flint_whole_key', 'a', 'b', 'c']);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5).signal('order', ['c', 'b', 'a']);
        await view.runAsync();
        expect(bars(view).a.x).toBe(100);
        expect(bars(view).b.x).toBe(100);
    });

    it('places a moving value through the scale as the frame draws it, so the mark stays true to its axis', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.signals.push({ name: 'held', value: null });
        spec.scales[1].domainRaw = { signal: 'held' };
        spec.marks[0].encode.update.y = { scale: 'y', field: 'v' };
        spec.marks[0].encode.update.y2 = { scale: 'y', value: 0 };
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        expect(before.bars.b).toMatchObject({ __d_y: 30, __d_y2: 0 });
        view.data('rows', [{ k: 'a', v: 10 }, { k: 'b', v: 50 }, { k: 'c', v: 20 }]);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5).signal('held', [0, 60]);
        await view.runAsync();
        // Halfway, b is worth 40 and the frame's scale runs to 60: 40 of 60 of 100 px, from the bottom.
        expect(bars(view).b.y).toBeCloseTo(100 - (40 / 60) * 100);
        expect(bars(view).b.height).toBeCloseTo((40 / 60) * 100);
        expect(bars(view).a.y).toBeCloseTo(100 - (10 / 60) * 100);
    });

    it('moves a domain linearly, a log domain geometrically, and keeps dates as dates', () => {
        expect(domainPath('linear', [0, 40], [0, 80])(0.5)).toEqual([0, 60]);
        expect(domainPath('log', [1, 100], [1, 10000])(0.5)).toEqual([1, 1000]);
        const [start] = domainPath('time', [new Date(0), new Date(10)], [new Date(100), new Date(10)])(0.5);
        expect(start).toEqual(new Date(50));
    });

    it('draws a leaving series as a path where it stood, and keeps a series that still has rows', async () => {
        const spec: Record<string, any> = {
            width: 200,
            height: 100,
            data: [{
                name: 'rows',
                values: [{ s: 'a', t: 0, v: 1 }, { s: 'a', t: 1, v: 2 }, { s: 'b', t: 0, v: 3 }, { s: 'b', t: 1, v: 1 }],
                transform: [{ type: 'formula', as: INTERACTION_KEY, expr: "datum.s + '|' + datum.t" }],
            }],
            scales: [
                { name: 'x', type: 'linear', domain: [0, 1], range: 'width' },
                { name: 'y', type: 'linear', domain: [0, 4], range: 'height' },
            ],
            marks: [{
                type: 'group',
                from: { facet: { data: 'rows', name: 'series', groupby: 's' } },
                marks: [{
                    type: 'line',
                    name: 'lines',
                    from: { data: 'series' },
                    encode: { update: { x: { scale: 'x', field: 't' }, y: { scale: 'y', field: 'v' }, stroke: { value: '#123456' } } },
                }],
            }],
        };
        injectSceneMotion(spec, ['s', 't']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureGhosts(view, ['s', 't']);
        expect(before.paths).toHaveLength(2);
        view.data('rows', [{ s: 'a', t: 0, v: 1 }, { s: 'a', t: 1, v: 2 }]);
        await view.runAsync();
        expect(setSceneExits(view, before, captureGhosts(view, ['s', 't']))).toBe(1);
        view.signal(SCENE_EXIT_SIGNAL, 0.5);
        await view.runAsync();
        const exit = (view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.name === '__flint_scene_exit_line_series');
        const vertices = exit.items[0].items[0].items;
        expect(vertices.map((item: any) => item.y)).toEqual([25, 75]);
        expect(vertices[0].opacity).toBeCloseTo(0.5);
        expect(vertices[0].stroke).toBe('#123456');
    });

    it('mixes colours channel by channel', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        before.bars.a.fill = '#000000';
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5);
        await view.runAsync();
        expect(bars(view).a.fill).toBe('rgb(18,43,92)');
    });

    it('holds a title where it is told while Vega would lay it out against moving labels', async () => {
        const spec: any = {
            width: 200, height: 100,
            title: { text: 'Units by product', subtitle: 'Units', anchor: 'start', frame: 'group', offset: 10 },
            signals: [],
            marks: [{ type: 'rect', encode: { update: { x: { value: 0 }, y: { value: 0 }, width: { value: 10 }, height: { value: 10 } } } }],
        };
        expect(injectTitleMotion(spec)).toBe(true);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const rest = titlePosition(view)!;
        expect(rest.y).toBeLessThan(0);
        expect(rest.subtitle).toBeGreaterThan(0);
        view.signal(TITLE_ORIENT_SIGNAL, 'none').signal(TITLE_X_SIGNAL, 5).signal(TITLE_Y_SIGNAL, -40).signal(SUBTITLE_DY_SIGNAL, rest.subtitle);
        await view.runAsync();
        const group: any = (view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.role === 'title').items[0];
        expect([group.x, group.y]).toEqual([5, -40]);
        const subtitle = group.items.find((mark: any) => mark.role === 'title-subtitle').items[0];
        expect(subtitle.y + subtitle.dy).toBe(rest.subtitle);
    });

    it('matches the new items by the identity the old frame was captured with', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        // A row key that changes with the value, as one built from every field does.
        spec.data[0].transform = [{ type: 'formula', as: INTERACTION_KEY, expr: "datum.k + '|' + datum.v" }];
        injectSceneMotion(spec, []);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view, ['k']);
        const heights = Object.fromEntries(Object.entries(bars(view)).map(([key, item]) => [key, item.height]));
        view.data('rows', [{ k: 'a', v: 30 }, { k: 'b', v: 30 }, { k: 'c', v: 30 }]);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0);
        await view.runAsync();
        expect(Object.fromEntries(Object.entries(bars(view)).map(([key, item]) => [key, item.height]))).toEqual(heights);
    });

    it('keeps an area\'s size with the ends it mixes, so its edge does not jump', async () => {
        const spec = areaSpec([{ i: 0, v: 40, w: 10 }, { i: 1, v: 60, w: 20 }], 'toString(datum.i)');
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        const bottoms = vertices(view).map((item) => item.y + item.height);
        view.data('rows', [{ i: 0, v: 80, w: 30 }, { i: 1, v: 90, w: 50 }]);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0);
        await view.runAsync();
        expect(vertices(view).map((item) => item.y + item.height)).toEqual(bottoms);
        expect(vertices(view).every((item) => item.height === item.y2 - item.y)).toBe(true);
    });

    it('holds an arriving item inside the plot until it starts to fade in', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.signals.push({ name: 'held', value: null });
        spec.scales[1].domainRaw = { signal: 'held' };
        spec.marks[0].encode.update.y = { scale: 'y', field: 'v' };
        spec.marks[0].encode.update.y2 = { scale: 'y', value: 0 };
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        delete before.bars.c;
        view.data('rows', [{ k: 'a', v: 10 }, { k: 'b', v: 30 }, { k: 'c', v: 80 }]);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0).signal(SCENE_ENTER_SIGNAL, 0).signal('held', [0, 40]);
        await view.runAsync();
        // Worth 80 on an axis that still ends at 40, c would stand 100 px above the plot.
        expect(bars(view).c.y).toBe(0);
        expect(bars(view).c.height).toBe(100);
        view.signal(SCENE_ENTER_SIGNAL, 0.5);
        await view.runAsync();
        expect(bars(view).c.y).toBe(-100);
    });

    it('bends an outline whose vertices share one key from the shape drawn before', async () => {
        const spec = areaSpec([{ i: 0, v: 10, w: 0 }, { i: 2, v: 30, w: 0 }, { i: 4, v: 10, w: 0 }], "'A'");
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        const old = vertices(view).map((item) => [item.x, item.y]);
        view.data('rows', [0, 1, 2, 3, 4].map((i) => ({ i, v: 50 + i, w: 0 })));
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0);
        await view.runAsync();
        expect(placeOutlineStarts(view, before, [])).toBe(true);
        view.signal(SCENE_OUTLINE_SIGNAL, 7);
        await view.runAsync();
        const start = vertices(view).map((item) => [item.x, item.y]);
        expect(start[0]).toEqual(old[0]);
        expect(start[2]).toEqual(old[1]);
        expect(start[4]).toEqual(old[2]);
        expect(start[1]).toEqual([(old[0]![0]! + old[1]![0]!) / 2, (old[0]![1]! + old[1]![1]!) / 2]);
        view.signal(SCENE_T_SIGNAL, 1).signal(SCENE_FROM_SIGNAL, null).signal(SCENE_OUTLINE_SIGNAL, null);
        await view.runAsync();
        expect(vertices(view).map((item) => item.x)).toEqual([0, 50, 100, 150, 200]);
    });

    it('holds the domain of every continuous scale a mark is placed by, with or without an axis', () => {
        const spec = areaSpec([{ i: 0, v: 40, w: 10 }, { i: 1, v: 60, w: 20 }], 'toString(datum.i)');
        spec.scales.push({ name: 'shade', type: 'linear', domain: [0, 1], range: [0, 1] });
        injectSceneMotion(spec);
        expect(injectScaleMotion(spec).map((scale) => scale.name)).toEqual(['x', 'y']);
        expect(spec.scales[1].domainRaw).toEqual({ signal: '__flint_domain_y' });
    });

    it('names a mark drawn from aggregated rows by the identity fields they kept, so its numbers count', async () => {
        const spec: Record<string, any> = {
            width: 100,
            height: 100,
            data: [{ name: 'rows', values: [{ k: 'a', v: 40 }, { k: 'a', v: 44 }, { k: 'b', v: 10 }], transform: [{ type: 'aggregate', groupby: ['k'], fields: ['v'], ops: ['sum'], as: ['total'] }] }],
            marks: [{ type: 'text', name: 'totals', from: { data: 'rows' }, encode: { update: { text: { signal: 'format(datum.total, "d")' }, y: { value: 0 } } } }],
        };
        injectSceneMotion(spec, ['k']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view, ['k']);
        expect(before.totals).toMatchObject({ a: { text: '84' }, b: { text: '10' } });

        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5);
        view.data('rows', [{ k: 'a', v: 100 }, { k: 'b', v: 30 }]);
        await view.runAsync();
        const texts = Object.fromEntries((view.scenegraph() as any).root.items[0].items[0].items.map((item: any) => [item.datum.k, item.text]));
        expect(texts).toEqual({ a: '92', b: '20' });
    });

    it('carries an axis\'s ticks across a change: shared ones stay, the rest fade out or in, overlap removal and the tick count stand down', async () => {
        const spec: Record<string, any> = {
            width: 100,
            height: 100,
            signals: [{ name: SCENE_T_SIGNAL, value: 1 }],
            scales: [{ name: 'y', type: 'linear', domain: [0, 150], range: 'height' }],
            axes: [{ scale: 'y', orient: 'left', values: [0, 50, 100, 150], labelOverlap: true, tickCount: 3 }],
        };
        expect(injectAxisTickMotion(spec)).toEqual(['y']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const labels = (): string[] => (view.scenegraph() as any).root.items[0].items[0].items[0].items
            .find((mark: any) => mark.role === 'axis-label').items.map((item: any) => `${item.text}:${item.opacity}`);
        const faded = (): string[] => (view.scenegraph() as any).root.items[0].items[0].items[0].items
            .find((mark: any) => mark.role === 'axis-label').items.map((item: any) => `${item.text}:${item.fillOpacity}`);
        const rest = labels();
        const plain = new View(parse({ ...spec, axes: [{ scale: 'y', orient: 'left', values: [0, 50, 100, 150], labelOverlap: true, tickCount: 3 }] }), { renderer: 'none' });
        await plain.runAsync();
        expect(rest).toEqual((plain.scenegraph() as any).root.items[0].items[0].items[0].items
            .find((mark: any) => mark.role === 'axis-label').items.map((item: any) => `${item.text}:${item.opacity}`));

        const hold = { values: [0, 40, 50, 80, 100, 120], text: { 40: 'forty' }, from: { 0: true, 50: true, 100: true }, to: { 0: true, 40: true, 80: true, 120: true } };
        view.signal(axisTicksSignal('y'), hold).signal(SCENE_T_SIGNAL, 0.25);
        await view.runAsync();
        expect(faded()).toEqual(['0:1', 'forty:0.25', '50:0.75', '80:0.25', '100:0.75', '120:0.25']);
        expect(labels().every((label) => label.endsWith(':1'))).toBe(true);

        view.signal(axisTicksSignal('y'), null).signal(SCENE_T_SIGNAL, 1);
        await view.runAsync();
        expect(labels()).toEqual(rest);
    });

    it('holds the room an axis takes, and reads it back as Vega lays it out at rest', async () => {
        const spec: Record<string, any> = {
            width: 200,
            height: 100,
            data: [{ name: 'rows', values: [{ k: 'a', v: 10 }, { k: 'b', v: 1200 }] }],
            scales: [
                { name: 'x', type: 'band', domain: { data: 'rows', field: 'k' }, range: 'width' },
                { name: 'y', type: 'linear', domain: { data: 'rows', field: 'v' }, range: 'height' },
            ],
            axes: [
                { scale: 'y', orient: 'left', title: 'Value' },
                { scale: 'y', orient: 'left', grid: true, labels: false, ticks: false, domain: false, minExtent: 0, maxExtent: 0 },
                { scale: 'x', orient: 'bottom', maxExtent: 50 },
            ],
            signals: [{ name: SCENE_T_SIGNAL, value: 1 }],
        };
        const extents = injectAxisExtentMotion(spec);
        expect(extents.map((entry) => [entry.key, entry.restMin, entry.restMax])).toEqual([['y|left', 0, 200], ['x|bottom', 0, 50]]);
        expect(spec.axes[1]).toMatchObject({ minExtent: 0, maxExtent: 0 });
        const configured: Record<string, any> = {
            config: { axisY: { maxExtent: 30 }, axisBottom: { minExtent: 12, maxExtent: 12 } },
            axes: [{ scale: 'y', orient: 'left' }, { scale: 'x', orient: 'bottom' }],
        };
        expect(injectAxisExtentMotion(configured).map((entry) => [entry.key, entry.restMin, entry.restMax])).toEqual([['y|left', 0, 30]]);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const title = (): number => (view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.role === 'axis').items[0].items.find((mark: any) => mark.role === 'axis-title').items[0].x;
        const rest = axisExtentsAtRest(view, extents);
        const restTitle = title();
        expect(rest.get('y|left')).toBeGreaterThan(20);

        view.signal(extents[0]!.min, rest.get('y|left')! + 10).signal(extents[0]!.max, rest.get('y|left')! + 10);
        await view.runAsync();
        expect(title()).toBeCloseTo(restTitle - 10, 6);
        expect(axisExtentsAtRest(view, extents).get('y|left')).toBeCloseTo(rest.get('y|left')!, 6);
    });

    it('reads the room pad autosize gives the scene, which a held padding reproduces exactly', async () => {
        const spec: Record<string, any> = {
            width: 200,
            height: 100,
            data: [{ name: 'rows', values: [{ k: 'a', v: 10 }, { k: 'b', v: 1200 }] }],
            scales: [
                { name: 'x', type: 'band', domain: { data: 'rows', field: 'k' }, range: 'width' },
                { name: 'y', type: 'linear', domain: { data: 'rows', field: 'v' }, range: 'height' },
            ],
            axes: [{ scale: 'y', orient: 'left', title: 'Value' }, { scale: 'x', orient: 'bottom' }],
        };
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const room = viewRoom(view)!;
        expect(room.left).toBeGreaterThan(20);
        expect(room.bottom).toBeGreaterThan(10);
        const [x, y] = view.origin();

        view.autosize({ type: 'none' }).padding({ left: room.left, top: room.top, right: room.right, bottom: room.bottom });
        await view.runAsync();
        const padding = view.padding() as { left: number; top: number };
        expect([view.origin()[0] + padding.left, view.origin()[1] + padding.top]).toEqual([x, y]);
        expect([view.width(), view.height()]).toEqual([200, 100]);
    });

    it('moves the bins of a binned colour key, so its labels count with the change', () => {
        const spec = areaSpec([{ i: 0, v: 40, w: 10 }, { i: 1, v: 60, w: 20 }], 'toString(datum.i)');
        spec.scales.push(
            { name: 'binned', type: 'quantize', domain: [0, 100], range: ['#eee', '#999', '#333'] },
            { name: 'cut', type: 'threshold', domain: [10, 50], range: ['#eee', '#999', '#333'] },
            { name: 'unkeyed', type: 'quantize', domain: [0, 100], range: ['#eee', '#333'] },
        );
        spec.legends = [{ fill: 'binned' }, { fill: 'cut' }];
        injectSceneMotion(spec);
        expect(injectScaleMotion(spec).map((scale) => scale.name)).toEqual(['x', 'y', 'binned', 'cut']);
        expect(domainPath('quantize', [30, 80], [40, 100])(0.5)).toEqual([35, 90]);
    });

    it('slides the stretch a staying line lost out with its scale, joined to the line and clipped to the plot', async () => {
        const spec: Record<string, any> = {
            signals: [{ name: 'width', value: 200 }, { name: 'height', value: 100 }, { name: 'held', value: null }],
            data: [{
                name: 'rows',
                values: [0, 1, 2, 3].map((t) => ({ t, v: t })),
                transform: [{ type: 'formula', as: INTERACTION_KEY, expr: 'toString(datum.t)' }],
            }],
            scales: [
                { name: 'x', type: 'linear', domainRaw: { signal: 'held' }, domain: { data: 'rows', field: 't' }, range: 'width' },
                { name: 'y', type: 'linear', domain: [0, 4], range: 'height' },
            ],
            marks: [{
                type: 'line',
                name: 'line',
                from: { data: 'rows' },
                encode: { update: { x: { scale: 'x', field: 't' }, y: { scale: 'y', field: 'v' } } },
            }],
        };
        injectSceneMotion(spec, ['t']);
        expect(spec.marks[0].clip).toEqual({ signal: SCENE_CLIP_SIGNAL });
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureGhosts(view, ['t']);
        view.data('rows', [1, 2, 3, 4].map((t) => ({ t, v: t })));
        await view.runAsync();
        expect(setSceneExits(view, before, captureGhosts(view, ['t']))).toBe(0);
        const segment = (): any[] => (view.scenegraph() as any).root.items[0].items
            .find((mark: any) => mark.name === '__flint_scene_exit_line_series').items[0].items[0].items;
        view.signal(SCENE_T_SIGNAL, 0.5).signal('held', [0.5, 3.5]);
        await view.runAsync();
        // The lost point 0 and the staying point 1, placed on the frame's domain [0.5, 3.5].
        expect(segment().map((item: any) => Math.round(item.x))).toEqual([-33, 33]);
        expect(segment()[0].opacity).toBe(1);
        expect(segment()[0].mark.clip).toBe(true);
    });

    it('leaves a size the data does not make alone', () => {
        const spec: Record<string, any> = {
            signals: [{ name: 'width', value: 200 }, { name: 'height', update: 'containerSize()[1]', on: [{ events: 'window:resize', update: 'containerSize()[1]' }] }],
            marks: [{ type: 'rect', name: 'bars', encode: { update: { x: { value: 0 } } } }],
        };
        expect(injectSizeMotion(structuredClone(spec))).toEqual([]);
        injectSceneMotion(spec);
        expect(injectSizeMotion(spec)).toEqual([]);
    });

    it('moves a size made of band steps through the steps, so the bands grow with the size', async () => {
        const spec: Record<string, any> = {
            signals: [{ name: 'x_step', value: 40 }, { name: 'width', update: "bandspace(domain('x').length, 0, 0) * x_step" }],
            data: [{ name: 'rows', values: [{ k: 'a' }, { k: 'b' }] }],
            scales: [{ name: 'x', type: 'band', domain: { data: 'rows', field: 'k' }, range: { step: { signal: 'x_step' } } }],
            marks: [{ type: 'rect', name: 'bars', from: { data: 'rows' }, encode: { update: { x: { scale: 'x', field: 'k' } } } }],
        };
        injectSceneMotion(spec);
        expect(injectSizeMotion(spec)).toEqual([{ dimension: 'width', signal: '__flint_size_width_share' }]);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        view.data('rows', [{ k: 'a' }, { k: 'b' }, { k: 'c' }, { k: 'd' }]).signal('__flint_size_width_share', 0.5);
        await view.runAsync();
        expect(view.signal('width')).toBe(80);
        expect(view.scale('x').bandwidth()).toBe(20);
        view.signal('__flint_size_width_share', null);
        await view.runAsync();
        expect(view.signal('width')).toBe(160);
        expect(view.scale('x').bandwidth()).toBe(40);
    });

    it('eases a change in or out by default, at one speed when asked, and names the easing of the first transition given', () => {
        expect(easingCurve(undefined)(0.25)).toBeCloseTo(0.125);
        expect(easingCurve('linear')(0.25)).toBe(0.25);
        expect(transitionEasing(undefined, { duration: 800, easing: 'linear' }, { duration: 300 })).toBe('linear');
        expect(transitionEasing({ duration: 300 }, { duration: 800, easing: 'linear' })).toBe('ease-in-out');
        expect(validateTransition('test', { duration: 800, easing: 'linear' })).toEqual({ duration: 800, easing: 'linear' });
        expect(() => validateTransition('test', { duration: 800, easing: 'bounce' as never })).toThrow(/easing/);
    });

    it('names the marks of a chart without interactions for a morph by the identity fields their rows carry', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.data[0].transform = [];
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        expect(captureMorphScene(view, [], { x: 0, y: 0 }).items).toHaveLength(0);
        const scene = captureMorphScene(view, ['k'], { x: 0, y: 0 });
        expect(scene.items.map((item) => item.datum.k)).toEqual(['a', 'b', 'c']);
    });

    it('moves a rounded stack\'s clip and outline with its bars, in every panel', async () => {
        const rows = (scale: number) => ['p', 'q'].flatMap((panel, at) => ['a', 'b'].map((k, index) => ({ panel, k, v: (10 + index * 10 + at * 5) * scale })));
        const spec = compileVegaLite({
            data: { name: 'rows' },
            transform: [{ calculate: "datum.panel + '|' + datum.k", as: INTERACTION_KEY }],
            mark: { type: 'bar', cornerRadiusEnd: 4 },
            encoding: {
                column: { field: 'panel', type: 'nominal' },
                x: { field: 'k', type: 'nominal' },
                y: { field: 'v', type: 'quantitative', scale: { domain: [0, 80] } },
            },
            width: 100,
            height: 100,
        } as any).spec as Record<string, any>;
        injectSceneMotion(spec);
        const stackMarks: any[] = [];
        const findStacks = (marks: any[] | undefined): void => {
            for (const mark of marks ?? []) {
                if (mark.name?.startsWith('__flint_stack_')) stackMarks.push(mark);
                findStacks(mark.marks);
            }
        };
        findStacks(spec.marks);
        expect(stackMarks[0].transform.at(-1).motion.extents).toEqual([
            { start: 'y', size: 'height', scale: 'y', fields: ['min_v_start', 'max_v_start', 'min_v_end', 'max_v_end'] },
        ]);
        const view = new View(parse(spec), { renderer: 'none' });
        view.data('rows', rows(1));
        await view.runAsync();
        // Each stack group, with the extent of the bars its inner group draws, in the group's own frame.
        const stacks = (): { y: number; height: number; top: number; bottom: number }[] => {
            const found: { y: number; height: number; top: number; bottom: number }[] = [];
            const visit = (node: any): void => {
                for (const item of node.items ?? []) {
                    if (item.mark?.name?.startsWith('__flint_stack_')) {
                        const inner = item.items[0].items[0];
                        const rects = inner.items[0].items;
                        const top = Math.min(...rects.map((rect: any) => item.y + inner.y + rect.y));
                        const bottom = Math.max(...rects.map((rect: any) => item.y + inner.y + rect.y + rect.height));
                        found.push({ y: item.y, height: item.height, top, bottom });
                    }
                    visit(item);
                }
            };
            visit((view.scenegraph() as any).root);
            return found;
        };
        expect(stacks()).toHaveLength(4);
        const before = captureScene(view);
        const startHeights = stacks().map((stack) => stack.height);

        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0);
        view.data('rows', rows(2));
        await view.runAsync();
        expect(stacks().map((stack) => stack.height)).toEqual(startHeights.map((height) => expect.closeTo(height, 6)));

        view.signal(SCENE_T_SIGNAL, 0.5);
        await view.runAsync();
        for (const stack of stacks()) {
            expect(stack.top).toBeCloseTo(stack.y, 6);
            expect(stack.bottom).toBeCloseTo(stack.y + stack.height, 6);
        }
        expect(stacks().map((stack) => stack.height)).toEqual(startHeights.map((height) => expect.closeTo(height * 1.5, 6)));
    });
});

describe('identityRepeats', () => {
    const row = (key: string, group: string) => ({ [INTERACTION_KEY]: key, group });
    it('holds when one mark draws two rows with the same identity', () => {
        expect(identityRepeats([{ mark: 'points', datum: row('1', 'a') }, { mark: 'points', datum: row('2', 'a') }], ['group'])).toBe(true);
    });
    it('does not hold across marks, for distinct identities, or without identity fields', () => {
        expect(identityRepeats([{ mark: 'bars', datum: row('1', 'a') }, { mark: 'labels', datum: row('1', 'a') }], ['group'])).toBe(false);
        expect(identityRepeats([{ mark: 'points', datum: row('1', 'a') }, { mark: 'points', datum: row('2', 'b') }], ['group'])).toBe(false);
        expect(identityRepeats([{ mark: 'points', datum: row('1', 'a') }, { mark: 'points', datum: row('2', 'a') }], [])).toBe(false);
    });
});

describe('drawnItemCount', () => {
    it('counts the keyed items a capture would hold, not a mark without rows', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.data.push({ name: 'backdrop', values: [{}] });
        spec.marks.push({ type: 'rect', name: 'clear', from: { data: 'backdrop' }, encode: { update: { width: { value: 10 }, height: { value: 10 } } } });
        injectSceneMotion(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        expect(drawnItemCount(view)).toBe(3);
    });
});

describe('runMotion', () => {
    it('ends with the last frame', async () => {
        const seen: number[] = [];
        await runMotion(20, (t) => { seen.push(t); }).done;
        expect(seen.at(-1)).toBe(1);
    });

    it('rejects when a frame throws, and draws no more frames', async () => {
        let frames = 0;
        const motion = runMotion(200, () => { frames += 1; throw new Error('frame failed'); });
        await expect(motion.done).rejects.toThrow('frame failed');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(frames).toBe(1);
    });

    it('rejects when the work a frame starts fails', async () => {
        const motion = runMotion(200, async () => { throw new Error('render failed'); });
        await expect(motion.done).rejects.toThrow('render failed');
    });

    it('resolves when cancelled', async () => {
        const motion = runMotion(10_000, () => undefined);
        motion.cancel();
        await expect(motion.done).resolves.toBeUndefined();
    });
});

describe('motion transform', () => {
    const motion = (overrides: Partial<MarkMotion> = {}): MarkMotion => ({
        mark: 'bars', channels: ['x', 'y', 'width', 'height', 'opacity'], colours: ['fill', 'stroke'], data: [], box: true,
        area: false, arrival: [], identity: [], outline: false, written: [], ...overrides,
    });
    const scales = { place: (_: string, value: number) => value * 10, range: (): readonly [number, number] => [0, 100] };

    it('mixes numbers and colours from where the item was', () => {
        const item: Record<string, any> = { x: 100, opacity: 1, fill: '#ffffff', datum: { [INTERACTION_KEY]: 'a' } };
        mixItem(item, { x: 0, opacity: 0, fill: '#000000' }, motion(), { t: 0.5, enter: 1 }, scales);
        expect(item).toMatchObject({ x: 50, opacity: 0.5, fill: 'rgb(128,128,128)' });
    });

    it('places a data position through the scale as the frame draws it, and reports its data value', () => {
        const item: Record<string, any> = { x: 0, x2: 0, width: 0, datum: { lo: 2, hi: 6, [INTERACTION_KEY]: 'a' } };
        const units = mixItem(item, { __d_x: 0, __d_x2: 4 }, motion({
            data: [{ channel: 'x', scale: 'x', field: 'lo', offset: 0 }, { channel: 'x2', scale: 'x', field: 'hi', offset: 0 }],
        }), { t: 0.5, enter: 1 }, scales);
        expect(units).toEqual({ x: 1, x2: 5 });
        expect(item).toMatchObject({ x: 10, width: 40 });
    });

    it('holds an arriving item inside the plot and fades it in', () => {
        const item: Record<string, any> = { y: -40, height: 60, datum: { [INTERACTION_KEY]: 'c' } };
        mixItem(item, null, motion({ arrival: [{ start: 'y', end: 'y2', size: 'height', scale: 'y' }] }), { t: 0, enter: 0 }, scales);
        expect(item).toMatchObject({ y: 0, height: 20, opacity: 0 });
    });

    it('leaves a channel the item does not draw unwritten', () => {
        const item: Record<string, any> = { x: 5, datum: { [INTERACTION_KEY]: 'a' } };
        mixItem(item, { x: 0, width: 3 }, motion(), { t: 0.5, enter: 1 }, scales);
        expect(Object.keys(item).sort()).toEqual(['datum', 'x']);
    });

    it('adds nothing to the items of a chart at rest but the one field that re-encodes it', async () => {
        const plain = new View(parse(barSpec(['a', 'b', 'c'])), { renderer: 'none' });
        await plain.runAsync();
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneMotion(spec);
        const moving = new View(parse(spec), { renderer: 'none' });
        await moving.runAsync();
        const keys = (view: View) => Object.keys((view.scenegraph() as any).root.items[0].items[0].items[0]).sort();
        expect(keys(moving)).toEqual([...keys(plain), '__flint_scene_t'].sort());
    });
});
