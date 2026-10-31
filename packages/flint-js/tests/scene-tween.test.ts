import { describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import { captureGhosts, captureScene, injectSceneTween, SCENE_FROM_SIGNAL, SCENE_T_SIGNAL, setSceneExits } from '../src/vegalite/interactions/scene-tween';
import { INTERACTION_KEY } from '../src/vegalite/interactions/stores';

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

const bars = (view: View): Record<string, any> => Object.fromEntries(
    (view.scenegraph() as any).root.items[0].items[0].items.map((item: any) => [item.datum.k, item]),
);

describe('scene tween', () => {
    it('moves each keyed item from the captured frame to the new one', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneTween(spec);
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
        injectSceneTween(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        delete before.bars.c;
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5);
        await view.runAsync();
        expect(bars(view).c.opacity).toBeCloseTo(0.2);
        expect(bars(view).b.opacity).toBe(1);
    });

    it('names a row by its tween fields, so new values of the same row move rather than swap', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.data[0].transform = [{ type: 'formula', as: INTERACTION_KEY, expr: "datum.k + '|' + datum.v" }];
        injectSceneTween(spec, ['k']);
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
        injectSceneTween(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureGhosts(view);
        view.data('rows', [{ k: 'a', v: 10 }, { k: 'b', v: 30 }]);
        await view.runAsync();
        setSceneExits(view, before, captureGhosts(view));
        view.signal(SCENE_T_SIGNAL, 0.25);
        await view.runAsync();
        const exits = (view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.role === 'scene-exit').items;
        expect(exits).toHaveLength(1);
        expect(exits[0]).toMatchObject({ x: 200, width: 100 });
        expect(exits[0].opacity).toBeCloseTo(0.3);
        setSceneExits(view, null);
        await view.runAsync();
        expect((view.scenegraph() as any).root.items[0].items.find((mark: any) => mark.role === 'scene-exit').items).toHaveLength(0);
    });

    it('matches by the whole row key when tween keys repeat within a mark', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        spec.data[0].values = [{ k: 'a', v: 10, g: 'x' }, { k: 'b', v: 30, g: 'x' }, { k: 'c', v: 20, g: 'y' }];
        injectSceneTween(spec, ['g']);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view, ['g']);
        expect(Object.keys(before.bars).sort()).toEqual(['__flint_whole_key', 'a', 'b', 'c']);
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5).signal('order', ['c', 'b', 'a']);
        await view.runAsync();
        expect(bars(view).a.x).toBe(100);
        expect(bars(view).b.x).toBe(100);
    });

    it('mixes colours channel by channel', async () => {
        const spec = barSpec(['a', 'b', 'c']);
        injectSceneTween(spec);
        const view = new View(parse(spec), { renderer: 'none' });
        await view.runAsync();
        const before = captureScene(view);
        before.bars.a.fill = '#000000';
        view.signal(SCENE_FROM_SIGNAL, before).signal(SCENE_T_SIGNAL, 0.5);
        await view.runAsync();
        expect(bars(view).a.fill).toBe('rgb(18,43,92)');
    });
});
