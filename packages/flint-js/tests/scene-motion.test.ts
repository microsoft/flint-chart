import { describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import {
    captureGhosts,
    captureMorphScene,
    captureScene,
    domainPath,
    identityRepeats,
    injectScaleMotion,
    injectSceneMotion,
    injectSizeMotion,
    placeOutlineStarts,
    SCENE_ENTER_SIGNAL,
    SCENE_EXIT_SIGNAL,
    SCENE_FROM_SIGNAL,
    SCENE_OUTLINE_SIGNAL,
    SCENE_T_SIGNAL,
    setSceneExits,
} from '../src/vegalite/interactions/scene-motion';
import { INTERACTION_KEY } from '../src/vegalite/interactions/stores';
import { easingCurve, transitionEasing, validateTransition } from '../src/interactive/transition';

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
        expect(Object.keys(before.bars)).toEqual(['a', 'b', 'c']);
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
        expect(placeOutlineStarts(view, before, [], 7)).toBe(true);
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
        expect(spec.marks[0].clip).toEqual({ signal: `${SCENE_T_SIGNAL} < 1` });
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

    it('holds a size worked out from the data, sets a plain size directly, and leaves a chart without the motion alone', async () => {
        const spec: Record<string, any> = {
            signals: [{ name: 'x_step', value: 40 }, { name: 'width', update: "length(data('rows')) * x_step" }, { name: 'height', value: 100 }],
            data: [{ name: 'rows', values: [{ k: 'a' }, { k: 'b' }] }],
            marks: [{ type: 'rect', name: 'bars', from: { data: 'rows' }, encode: { update: { x: { value: 0 } } } }],
        };
        expect(injectSizeMotion(structuredClone(spec))).toEqual([]);
        injectSceneMotion(spec);
        expect(injectSizeMotion(spec)).toEqual([
            { dimension: 'width', signal: '__flint_size_width' },
            { dimension: 'height', signal: 'height' },
        ]);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        expect(view.signal('width')).toBe(80);
        view.data('rows', [{ k: 'a' }, { k: 'b' }, { k: 'c' }]).signal('__flint_size_width', 90);
        await view.runAsync();
        expect(view.signal('width')).toBe(90);
        view.signal('__flint_size_width', null);
        await view.runAsync();
        expect(view.signal('width')).toBe(120);
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
